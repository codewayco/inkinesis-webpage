/* Inside the package: what one delivered character's .inp and Live2D export contain. File names,
 * counts, parameters and the packed texture page come from the real files
 * (lab/data/asset/, built by tools/rigs/assetCard.mjs); the rig is the live web preview.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {loadPreview, defaults, strokeMesh} from './scene.js';
import {heldValues} from '../../static/js/ainime-held.js';
import {showcaseLegs} from './rigmath.js';
import {$, $$, reduced, heldRig, whenNear, overlay2d} from './util.js';

const DATA = 'lab/data/asset/vermilion-shrine-bells.json';
const LABELS = {ParamAngleZ: 'Head tilt', ParamEyeLOpen: 'Left eye opening', ParamEyeROpen: 'Right eye opening', ParamEyeBallX: 'Horizontal gaze', ParamEyeBallY: 'Vertical gaze',
  ParamBrowLY: 'Left eyebrow', ParamBrowRY: 'Right eyebrow', ParamMouthForm: 'Mouth shape', ParamMouthOpenY: 'Mouth opening',
  'Head Angles': 'Head turn and nod', 'Arm L': 'Left arm', 'Arm R': 'Right arm', 'Leg L': 'Left leg', 'Leg R': 'Right leg',
  ParamAngleX: 'Head turn', ParamAngleY: 'Head nod', ParamShoulderL: 'Left shoulder', ParamElbowL: 'Left elbow', ParamShoulderR: 'Right shoulder', ParamElbowR: 'Right elbow',
  ParamHipL: 'Left hip', ParamKneeL: 'Left knee', ParamHipR: 'Right hip', ParamKneeR: 'Right knee'};
const ICONS = {file: '◇', texture: '▧', mesh: '△', controls: '⌘', manifest: '{ }'};
const mb = bytes => (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + ' MB';
const num = v => String(Math.round(v * 1000) / 1000).replace('-', '−');

export function asset(scene) {
  const card = $('#asset-study'), el = $('#asset-view');
  if (!card) return;
  if (!scene.ok) { $('.asset-loading', el).textContent = 'WebGL 2 is needed for this live rig.'; return; }
  whenNear(el, async () => {
    const [preview, data] = await Promise.all([loadPreview(heldRig('11-vermilion-shrine-bells')), fetch(DATA).then(r => { if (!r.ok) throw Error('Package data unavailable'); return r.json(); })]);
    const base = defaults(preview), {inp, live2d} = data, layer = overlay2d($('.asset-overlay', el));
    const triangles = preview.parts.reduce((n, p) => n + p.mesh.indices.length / 3, 0);
    let open = false, mode = 'inp', kind = null, rig = null, page = 0;

    const view = scene.view(el, {
      update(t) {
        if (!rig) return;
        // A slow raise of both held arms and a small head turn, so the mesh view shows deformation.
        const r = reduced ? .3 : .3 - .3 * Math.cos(t * .8);
        rig.values = {...base, ...heldValues(rig, data.rig, r), ...(reduced ? {} : showcaseLegs(preview, t)), 'Head Angles': [reduced ? 0 : 8 * Math.sin(t * .5), 0]};
        rig.dim = kind === 'mesh' ? .55 : 0;
        rig.opacity = kind === 'texture' || kind === 'controls' ? 0 : 1;
      },
      after() {
        const dpr = layer.fit();
        if (kind === 'mesh' && rig) { layer.ctx.strokeStyle = '#fd084d'; layer.ctx.lineWidth = .65 * dpr; strokeMesh(layer.ctx, view, rig, {dpr}); }
      },
    });
    rig = await view.add(preview, {fit: .94});
    $('.asset-loading', el)?.remove();
    const panel = $('.asset-inspector', el);

    // Each package lists four entries; the ones that open something are buttons.
    const files = () => mode === 'inp' ? [
      [null, 'file', inp.file, 'Canonical puppet'],
      ['texture', 'texture', `${inp.pages} embedded PNG pages`, 'Layer textures'],
      ['mesh', 'mesh', `${inp.meshes} drawable meshes`, 'Inspect geometry'],
      ['controls', 'controls', `${inp.parameters.length} parameters`, 'Names, ranges, defaults'],
    ] : [
      [null, 'file', live2d.moc, 'Compiled Cubism model'],
      ['texture', 'texture', `textures/ · ${live2d.textures.length} PNG ${live2d.textures.length === 1 ? 'page' : 'pages'}`, 'View the packed artwork'],
      ['controls', 'controls', `${live2d.parameters.length} parameters`, 'Mapped from the .inp'],
      [null, 'manifest', live2d.manifest, 'Runtime manifest'],
    ];
    const vectors = inp.parameters.filter(p => p.vector).length;
    const copies = inp.textures.map((t, i) => t.sameAs === undefined ? '' : `Page ${i + 1} is a byte-identical copy of page ${t.sameAs + 1}.`).filter(Boolean).join(' ');
    const notes = {
      inp: 'The canonical puppet: layered meshes, the artwork they sample and persistent parameters.',
      live2d: 'The same rig compiled for Cubism: one packed texture page and the same controls, split per axis.',
      mesh: `${inp.meshes} meshes · ${triangles.toLocaleString('en')} triangles, as delivered.`,
      controlsinp: `${inp.parameters.length} parameters. ${vectors} are two-axis: the head, arms and legs.`,
      controlslive2d: `Cubism parameters have one axis, so the ${vectors} two-axis controls become ${vectors * 2}: ${live2d.parameters.length} in all.`,
      textureinp: `${inp.pages} PNG pages embedded in the .inp (${mb(live2d.atlas.sourceBytes)}), sampled by ${inp.meshes} meshes. ${copies}`,
      texturelive2d: `The exporter drops the ${inp.pages - inp.distinctPages === 1 ? 'duplicate page' : 'duplicate pages'} and packs every mesh's artwork from ${inp.pages} .inp pages (${mb(live2d.atlas.sourceBytes)}) into ${live2d.textures.length === 1 ? 'one page' : live2d.textures.length + ' pages'} (${mb(live2d.atlas.packedBytes)}). Each mesh samples the same pixels as in the .inp.`,
    };

    // The .inp pages as one contact sheet, e.g. "7 × 4096² and 6 × 1280²".
    const sizes = Object.entries(inp.textures.reduce((n, t) => ({...n, [`${t.width}×${t.height}`]: (n[`${t.width}×${t.height}`] ?? 0) + 1}), {}))
      .map(([size, count]) => `${count} × ${size.split('×')[0] === size.split('×')[1] ? size.split('×')[0] + '²' : size}`).join(' and ');

    function inspect() {
      const show = open && (kind === 'texture' || kind === 'controls');
      panel.hidden = !show;
      if (!show) { panel.replaceChildren(); return; }
      const close = '<button type="button" class="inspector-close" aria-label="Close">×</button>';
      if (kind === 'controls' && mode === 'inp') {
        // Two-axis rows are labelled by the Live2D parameters each axis becomes.
        const axes = name => live2d.parameters.filter(p => p.source === name).sort((a, b) => a.axis - b.axis).map(p => LABELS[p.id] ?? p.id);
        panel.innerHTML = `<header><div><span class="eyebrow">Inside the .inp</span><h4>${inp.parameters.length} stored parameters</h4></div>${close}</header>
          <div class="parameter-scroll"><table><thead><tr><th scope="col">Parameter</th><th scope="col">Range</th><th scope="col">Default</th></tr></thead><tbody>${inp.parameters.map(p => {
            const dims = p.vector ? [0, 1] : [0], names = p.vector ? axes(p.name) : [];
            return `<tr><th scope="row">${LABELS[p.name] ?? p.name}<small>${p.name}</small></th><td>${dims.map(i => `${p.vector ? `<i>${names[i]}</i>` : ''}${num(p.min[i])} … ${num(p.max[i])}`).join('<br>')}</td><td>${dims.map(i => num(p.defaults[i])).join('<br>')}</td></tr>`;
          }).join('')}</tbody></table></div>`;
      } else if (kind === 'controls') {
        panel.innerHTML = `<header><div><span class="eyebrow">Inside the Live2D package</span><h4>${live2d.parameters.length} Cubism parameters</h4></div>${close}</header>
          <div class="parameter-scroll"><table><thead><tr><th scope="col">Parameter</th><th scope="col">From the .inp</th><th scope="col">Range</th></tr></thead><tbody>${live2d.parameters.map(p => {
            const split = inp.parameters.find(q => q.name === p.source)?.vector;
            return `<tr${split ? ' class="split"' : ''}><th scope="row">${LABELS[p.id] ?? p.id}<small>${p.id}</small></th><td>${p.source}${split ? `<small>axis ${p.axis + 1} of 2</small>` : ''}</td><td>${num(p.min)} … ${num(p.max)}</td></tr>`;
          }).join('')}</tbody></table></div>`;
      } else {
        if (mode === 'inp') {
          panel.innerHTML = `<header><div><span class="eyebrow">Embedded in the .inp</span><h4>${inp.pages} PNG pages</h4><p class="inspector-meta">${sizes} · ${mb(live2d.atlas.sourceBytes)} · ${inp.meshes} meshes</p></div>${close}</header>
            <div class="atlas-main"><img src="${inp.sheet}" alt="The ${inp.pages} texture pages embedded in the Vermilion Shrine Bells .inp, drawn at their relative sizes"></div>`;
        } else {
          const pages = live2d.textures, t = pages[page];
          panel.innerHTML = `<header><div><span class="eyebrow">Live2D texture</span><h4>${t.file}</h4><p class="inspector-meta">${t.width} × ${t.height} · ${mb(t.bytes)} · ${inp.meshes} meshes</p></div>${close}</header>
            <div class="atlas-main"><img src="${t.preview}" alt="Packed Live2D texture page ${page + 1} of Vermilion Shrine Bells"></div>
            ${pages.length > 1 ? `<div class="atlas-pages">${pages.map((_, i) => `<button type="button" data-page="${i}" aria-pressed="${i === page}">${i + 1}</button>`).join('')}</div>` : ''}`;
        }
        $$('[data-page]', panel).forEach(b => b.addEventListener('click', () => { page = Number(b.dataset.page); inspect(); }));
      }
      $('.inspector-close', panel).addEventListener('click', () => { kind = null; render(); });
    }

    function render() {
      const list = $('#asset-files');
      list.hidden = !open;
      list.innerHTML = files().map(([id, icon, name, desc], i) => {
        const inner = `<span aria-hidden="true">${ICONS[icon]}</span><div><b>${name}</b><small>${desc}</small></div>`;
        return id ? `<button type="button" class="asset-file" data-asset-kind="${id}" style="--i:${i}" aria-pressed="${id === kind}">${inner}<span aria-hidden="true">›</span></button>`
          : `<div class="asset-file is-static" style="--i:${i}">${inner}</div>`;
      }).join('');
      $$('[data-asset-kind]', list).forEach(b => b.addEventListener('click', () => { kind = kind === b.dataset.assetKind ? null : b.dataset.assetKind; page = 0; render(); }));
      $('#asset-note').textContent = kind === 'controls' || kind === 'texture' ? notes[kind + mode] : notes[kind ?? mode];
      inspect();
    }

    const toggle = $('#asset-open');
    toggle.addEventListener('click', () => {
      open = !open; if (!open) kind = null;
      toggle.setAttribute('aria-expanded', String(open)); card.classList.toggle('is-open', open);
      $('[data-open-label]', toggle).textContent = open ? 'Close the package' : 'Open the package';
      render();
    });
    $$('[data-package]', card).forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.package;
      $$('[data-package]', card).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      // Both packages hold artwork and parameters; the mesh view belongs to the .inp.
      if (kind === 'mesh') kind = null;
      page = 0;
      render();
    }));
    render();
  }, '180px');
}
