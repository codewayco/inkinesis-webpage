/* 9 · Same motion, two runtimes. A live rig zooms into its wrist until one source pixel spans
 * 10,000 screen pixels; the recorded worst Core-vs-evaluator coordinate difference for that rig is
 * then drawn to scale against the 0.005 px tolerance. The thermal lineup shows the recorded per-rig
 * maxima. Magnitudes are recorded values; the direction of the drawn offset is illustrative.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {loadPreview, defaults, strokeMesh} from './scene.js';
import {heldValues} from '../../static/js/ainime-held.js';
import {calibrate, showcaseLegs} from './rigmath.js';
import {$, reduced, clamp, ease, heldRig, overlay2d, watchVisible} from './util.js';

const ID = '18-midnight-brass-busker', TOLERANCE = .005, TARGET = 10000, GL_MAX = 20000;   // the rig itself stays drawn almost to the end of the dive
const NAMES = {'11-vermilion-shrine-bells': 'Vermilion Shrine Bells', '12-strawberry-cream-patissier': 'Strawberry Cream Patissier', '13-foxfire-festival-sweet': 'Foxfire Festival Sweet', '14-twinlens-shutter-girl': 'Twinlens Shutter Girl', '15-neon-penlight-cheer': 'Neon Penlight Cheer', '16-ember-forge-smith': 'Ember Forge Smith', '17-cedar-ridge-ranger': 'Cedar Ridge Ranger', '18-midnight-brass-busker': 'Midnight Brass Busker', '19-asphalt-comet-skater': 'Asphalt Comet Skater'};
const SVG = 'http://www.w3.org/2000/svg';

export async function verify(scene) {
  const section = $('#verify'), el = $('#verify-view'), plate = $('.zoom-plate', el), meter = $('[data-zoom]', el), note = $('[data-zoom-note]', el), button = $('#verify-zoom');
  const deltas = await fetch('lab/data/core-deltas.json').then(r => r.json());
  heat(deltas);
  const worst = deltas.rows.find(r => r.id === ID).coreMaxPx;
  // Per-vertex record (item: click a point, read the real recorded difference there). Loaded lazily;
  // without it the plate falls back to the rig maximum.
  let vertexMax = null, here = null;   // here: {part, name, vertex, delta}
  const loadVertexMax = async () => {
    if (vertexMax) return vertexMax;
    try {
      const res = await fetch(`lab/data/core-vertex-${ID}.json.gz`); if (!res.ok) throw Error('missing');
      const data = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).json();
      vertexMax = {unit: data.unitPx, frames: data.frames, rigMax: data.rigMaxPx, byUuid: new Map(data.parts.map(p => [p.uuid, p.max]))};
    } catch { vertexMax = false; }
    return vertexMax;
  };
  loadVertexMax();
  if (!scene.ok) { button.disabled = true; return; }
  const asset = await loadPreview(heldRig(ID)), base = defaults(asset), cal = calibrate(asset), arm = cal.arms['Arm R'] ?? Object.values(cal.arms)[0];
  // The overlays (wireframe, zoom plate, meter) live in a fixed body-level layer above the shared
  // rig canvas, tracked to the view each frame: the sticky scrub wrapper would otherwise trap them
  // below the rig.
  const hud = document.createElement('div'); hud.className = 'verify-hud'; hud.setAttribute('aria-hidden', 'true');
  hud.append($('.verify-mesh', el), plate, $('.zoom-meter', el)); document.body.append(hud);
  const mesh = overlay2d($('.verify-mesh', hud));
  // The HUD is fixed-position: hide it as soon as the view leaves the screen, even when the scene stops updating it.
  new IntersectionObserver(([e]) => { if (!e.isIntersecting) hud.hidden = true; }).observe(el);
  let rig = null;
  const view = scene.view(el, {update, after});
  rig = await view.add(asset, {fit: .9, y: .52});
  el.classList.add('is-live');
  let target = 0, z = 0, frozen = null, hold = false;   // z: 0 → 1 over a logarithmic zoom from the fitted view to ×10,000
  // Item 7: on wide screens the zoom is scrubbed by scrolling through a tall section; the button jumps.
  const scrub = false;   // zoom is driven by clicks (and the button), not by scrolling
  section.classList.toggle('scrub', scrub);
  const progress = () => { const r = section.getBoundingClientRect(), span = section.offsetHeight - innerHeight; return clamp(-r.top / Math.max(1, span)); };
  if (scrub) {
    button.textContent = 'Scroll to zoom · press to jump to ×10,000';
    button.addEventListener('click', () => { const r = section.getBoundingClientRect(), span = section.offsetHeight - innerHeight; const atEnd = progress() > .9; scrollTo({top: scrollY + r.top + (atEnd ? 0 : span * .96), behavior: 'smooth'}); });
  } else { button.textContent = 'Click a point to zoom ×10,000'; button.addEventListener('click', () => { target = target ? 0 : 1; if (!target) focusPt = null; button.textContent = target ? 'Zoom back out' : 'Click a point to zoom ×10,000'; }); }
  // Hold to pin: while the pointer is down, the recorded Core maximum is emphasised.
  // Where the zoom dives: the wrist by default, or any point of the rig the visitor clicks.
  let focusPt = null, down = null;
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    down = {x: e.clientX, y: e.clientY, at: performance.now()};
    hold = true; el.classList.add('holding'); hud.classList.add('holding'); try { el.setPointerCapture(e.pointerId); } catch {}
  });
  const unhold = e => {
    hold = false; el.classList.remove('holding'); hud.classList.remove('holding');
    // A short, still press is a click: it picks the zoom target under the pointer.
    if (down && e?.type === 'pointerup' && performance.now() - down.at < 280 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && rig) {
      if (target) { target = 0; focusPt = null; }                  // zoomed in: a click zooms back out
      else {   // zoomed out: dive to the nearest vertex of the clicked point and show its own recorded difference
        const r = el.getBoundingClientRect(), p = view.unproject(rig, e.clientX - r.left, e.clientY - r.top);
        focusPt = p; here = null;
        const posed = rig.lastPosed;
        if (posed) {
          let best = Infinity;
          posed.forEach((part, i) => {
            if (!part.enabled || part.opacity <= .05) return;
            const xy = part.xy;
            for (let k = 0; k < xy.length; k += 2) { const d = Math.hypot(xy[k] - p[0], xy[k + 1] - p[1]); if (d < best) { best = d; here = {part: i, vertex: k / 2, name: asset.parts[i].name, at: [xy[k], xy[k + 1]]}; } }
          });
          if (here) { focusPt = here.at; const rec = vertexMax && vertexMax.byUuid.get(asset.parts[here.part].uuid); here.delta = rec ? rec[here.vertex] * vertexMax.unit : null; }
        }
        target = 1;
      }
      button.textContent = target ? 'Zoom back out' : 'Click a point to zoom ×10,000';
    }
    down = null;
  };
  el.addEventListener('pointerup', unhold); el.addEventListener('pointercancel', unhold); el.addEventListener('pointerleave', unhold);

  function update(t, dt) {
    if (!rig) return;
    const vr = view.rect; hud.style.cssText = `left:${vr.left}px;top:${vr.top}px;width:${vr.width}px;height:${vr.height}px`; hud.hidden = !view.onscreen;
    if (scrub) { const want = clamp((progress() - .06) / .88); z += (want - z) * (1 - Math.exp(-dt * 4)); if (Math.abs(want - z) < 1e-4) z = want; }
    else { const step = reduced ? 1 : dt / 4.5; z = z < target ? Math.min(target, z + step) : Math.max(target, z - step); }   // a steady 4.5 s dive, eased by the log-zoom curve
    // While zooming, the pose holds still so the wrist stays put.
    const raise = .5 - .5 * Math.cos(t * 1.2);
    if (z < .002) { frozen = null; rig.values = {...base, ...heldValues(rig, ID, raise), ...(reduced ? {} : showcaseLegs(rig.asset, t))}; }
    else if (!frozen) frozen = {...rig.values};
    else rig.values = frozen;
    const fitScale = view.placement({...rig, zoom: 1, focus: [0, 0]}).scale;
    const m = fitScale * Math.pow(TARGET / fitScale, ease(z)); // CSS px per source px
    rig.zoom = Math.min(m / fitScale, GL_MAX);
    const hand = rig.lastPosed?.[arm.part]?.xy, hx = focusPt ? focusPt[0] : hand ? hand[arm.vertex] : 0, hy = focusPt ? focusPt[1] : hand ? hand[arm.vertex + 1] : 0;
    const f = ease(clamp(z * 3));
    rig.focus = [hx * f, hy * f];
    rig.x = .5; rig.y = .52 + (.5 - .52) * f;
    // The textured rig fades only in the last decade, once a source pixel is already a large square on screen.
    rig.opacity = 1 - ease(clamp((m - 1200) / 5000));
    meter.textContent = '×' + (m < 10 ? m.toFixed(2) : Math.round(m).toLocaleString('en'));
    note.textContent = hold ? `pinned · recorded Core max ${(vertexMax?.rigMax ?? worst).toFixed(6)} px, to scale` : m < 2 ? 'Midnight Brass Busker · live rig' : `1 source pixel = ${m < 10 ? m.toFixed(1) : Math.round(m).toLocaleString('en')} screen pixels`;
    drawPlate(m, fitScale, t);
  }
  function after() { mesh.fit(); }   // the wireframe overlay is retired; the canvas stays cleared

  function drawPlate(m, fitScale, t = 0) {
    const on = m > 60;
    plate.classList.toggle('on', on);
    if (!on) return;
    const w = view.rect.width, h = view.rect.height, cx = w / 2, cy = h / 2;
    plate.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const parts = [];
    // Decade grids: draw the two scales whose spacing is readable at this zoom.
    for (let k = 0; k >= -4; k--) {
      const step = Math.pow(10, k) * m;
      if (step < 14 || step > w * 2) continue;
      const a = clamp((step - 14) / 60) * (k === 0 ? .22 : .12);
      for (let x = cx % step; x < w; x += step) parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="rgba(255,255,255,${a})" stroke-width="${k === 0 ? 1.5 : 1}"/>`);
      for (let y = cy % step; y < h; y += step) parts.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="rgba(255,255,255,${a})" stroke-width="${k === 0 ? 1.5 : 1}"/>`);
      if (step > 60 && step < w) parts.push(`<text x="${(cx % step) + 6}" y="${(cy % step) + 16}" fill="rgba(255,255,255,.4)" font-size="10.5" font-family="ui-monospace,monospace">${Math.pow(10, k)} px</text>`);
    }
    // With the per-vertex record loaded, the rig maximum shown is that run's own, so the dot never leaves its ring.
    const rigMax = vertexMax?.rigMax ?? worst, tol = TOLERANCE * m, off = rigMax * m, local = here?.delta != null ? here.delta * m : null;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${tol}" fill="rgba(60,207,145,.07)" stroke="#3ccf91" stroke-dasharray="6 6" stroke-width="1.5"/>`);
    if (tol > 30) parts.push(`<text x="${cx}" y="${cy - tol - 10}" fill="#3ccf91" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">0.005 px tolerance</text>`);
    const pulse = hold ? 8 + 5 * (.5 + .5 * Math.sin(t * 6)) : 8;
    // Rig maximum: dashed rose ring. This vertex (when recorded): solid rose dot at its own recorded distance.
    parts.push(`<circle cx="${cx + off}" cy="${cy}" r="${pulse}" fill="${hold ? 'rgba(255,107,143,.25)' : 'none'}" stroke="#ff6b8f" stroke-width="${hold ? 3 : 2}" ${local != null ? 'stroke-dasharray="4 4"' : ''}/><circle cx="${cx}" cy="${cy}" r="3.5" fill="#f4f1ec"/>`);
    if (local != null) parts.push(`<circle cx="${cx + local}" cy="${cy + 0}" r="6" fill="#ff6b8f"/><line x1="${cx}" y1="${cy}" x2="${cx + local}" y2="${cy}" stroke="#ff6b8f" stroke-width="2"/><text x="${cx}" y="${cy + Math.max(local, off, tol) + 22}" fill="#ff6b8f" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">This vertex ${here.delta.toFixed(6)} px = ${local.toFixed(2)} screen px</text>`);
    if (hold) parts.push(`<line x1="${cx}" y1="${cy}" x2="${cx + off}" y2="${cy}" stroke="#ff6b8f" stroke-width="2"/><text x="${cx + off / 2}" y="${cy - 14}" fill="#ff6b8f" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">${rigMax.toFixed(6)} px = ${off.toFixed(2)} screen px</text>`);
    parts.push(`<g font-family="ui-sans-serif,system-ui" font-size="12.5"><circle cx="30" cy="${h - 38}" r="6" fill="none" stroke="#ff6b8f" stroke-width="2" ${local != null ? 'stroke-dasharray="4 4"' : ''}/><text x="42" y="${h - 34}" fill="#f4f1ec">Official Cubism Core · rig max ${rigMax.toFixed(6)} px over ${vertexMax?.frames ?? deltas.rows.find(r => r.id === ID).frames} poses = ${off.toFixed(1)} screen px</text>${local != null ? `<circle cx="30" cy="${h - 14}" r="6" fill="#ff6b8f"/><text x="42" y="${h - 10}" fill="#f4f1ec">This vertex · ${here.name}, vertex ${here.vertex} · recorded max over ${vertexMax.frames} poses ${here.delta.toFixed(6)} px</text>` : ''}</g>`);
    plate.innerHTML = parts.join('');
  }

  // Start the dive once when the card is well in view.
  // No automatic dive: the visitor chooses the point.
}

/* Thermal lineup: each rig of the delivery check as a thermal silhouette (its card artwork's own
 * shading), coloured by its recorded Core maximum on a scale that ends at the tolerance. A scan beam
 * sweeps the lineup and reads each rig out as it passes. */
const THERMAL = [[0, [8, 16, 58]], [.05, [24, 72, 205]], [.12, [36, 186, 230]], [.35, [236, 210, 76]], [.65, [255, 122, 46]], [1, [253, 8, 77]]];
const thermalColor = t => {
  t = clamp(t);
  let k = 1; while (k < THERMAL.length - 1 && THERMAL[k][0] < t) k++;
  const [a, ca] = THERMAL[k - 1], [b, cb] = THERMAL[k], f = (t - a) / (b - a || 1);
  return ca.map((c, i) => Math.round(c + (cb[i] - c) * f));
};

function heat(deltas) {
  const host = $('#heat'), canvas = $('.thermal-canvas', host), labels = $('.thermal-labels', host), card = host.closest('.heat-card');
  const rows = deltas.rows, tol = deltas.tolerancePx, ctx = canvas.getContext('2d');
  const pct = r => r.coreMaxPx / tol * 100;
  $('[data-heat-list]', host).innerHTML = rows.map(r => `<li>${NAMES[r.id] ?? r.id}: ${r.coreMaxPx.toFixed(6)} px, ${pct(r).toFixed(1)}% of the tolerance</li>`).join('');
  $('[data-heat-marks]', card).innerHTML = rows.map(r => `<i style="--x:${pct(r).toFixed(2)}%"></i>`).join('');
  const lo = Math.min(...rows.map(pct)), hi = Math.max(...rows.map(pct));
  $('[data-heat-range]', card).textContent = `all ${rows.length} rigs: ${lo.toFixed(1)}–${hi.toFixed(1)}% of tolerance`;
  labels.innerHTML = rows.map(r => `<span class="thermal-tag"><b>${r.coreMaxPx.toFixed(6)} px</b><em>${pct(r).toFixed(1)}%</em></span><span class="thermal-name">${NAMES[r.id] ?? r.id}</span>`).join('');
  const tags = [...labels.querySelectorAll('.thermal-tag')], names = [...labels.querySelectorAll('.thermal-name')];

  // Each silhouette is coloured once: its rig's value on the tolerance scale, shaded by the artwork.
  const H = 300;
  const figures = Promise.all(rows.map(r => new Promise(resolve => {
    const img = new Image(); img.src = `lab/cast/${r.id}.webp`;
    img.decode().then(() => {
      const w = Math.round(H * img.naturalWidth / img.naturalHeight), c = document.createElement('canvas'); c.width = w; c.height = H;
      const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(img, 0, 0, w, H);
      const data = g.getImageData(0, 0, w, H), px = data.data, t = r.coreMaxPx / tol;
      for (let i = 0; i < px.length; i += 4) {
        const lum = (.3 * px[i] + .59 * px[i + 1] + .11 * px[i + 2]) / 255, [cr, cg, cb] = thermalColor(t + (lum - .5) * .14);
        px[i] = cr; px[i + 1] = cg; px[i + 2] = cb;
      }
      g.putImageData(data, 0, 0); resolve(c);
    }).catch(() => resolve(null));
  })));

  let layout = null, start = 0, running = false;
  const SWEEP = 3.4, HOLD = 2.2;
  function fit() {
    const w = host.clientWidth, n = rows.length;
    // On wide screens the card is sized by the verify grid row (the rig card's height), so the lineup
    // fills the height it is given: the column count that shows the largest figures wins.
    const bounded = getComputedStyle(card).position === 'absolute' && host.clientHeight > 0;
    let cols, rowsN, cellW, cellH;
    if (bounded) {
      host.style.height = '';
      const h = host.clientHeight; let best = null;
      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c), cw = w / c, ch = h / r, fh = Math.min(ch - 62, (cw - 10) * 1.5);
        if (!best || fh > best.fh) best = {c, r, cw, ch, fh};
      }
      ({c: cols, r: rowsN, cw: cellW, ch: cellH} = best);
    } else {
      cols = w < 560 ? 3 : n; rowsN = Math.ceil(n / cols);
      cellW = w / cols; cellH = cols === n ? Math.min(300, Math.max(210, cellW * 1.9)) : cellW * 1.55;
      host.style.height = (cellH * rowsN) + 'px';
    }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(cellH * rowsN * dpr);
    layout = {w, cols, rowsN, cellW, cellH, dpr};
    rows.forEach((_, k) => {
      const x = (k % cols + .5) * cellW, y = Math.floor(k / cols) * cellH;
      tags[k].style.left = names[k].style.left = x + 'px';
      tags[k].style.top = (y + 8) + 'px'; names[k].style.top = (y + cellH - (bounded ? 28 : 22)) + 'px';
      names[k].style.maxWidth = tags[k].style.maxWidth = (cellW - 6) + 'px';
    });
  }
  async function draw(now) {
    const figs = await figures; if (!layout) fit();
    const {cols, cellW, cellH, dpr, w, rowsN} = layout, time = reduced ? Infinity : (now - start) / 1000 % (SWEEP + HOLD);
    const beam = reduced ? Infinity : time / SWEEP * (w + 40) - 20;   // beam x across the lineup (one row's width)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#06070b'; ctx.fillRect(0, 0, w, cellH * rowsN);
    // A faint sensor grid.
    ctx.strokeStyle = 'rgba(120,150,255,.06)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 18) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, cellH * rowsN); ctx.stroke(); }
    for (let y = 0; y < cellH * rowsN; y += 18) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); ctx.stroke(); }
    rows.forEach((r, k) => {
      const fig = figs[k], cx = (k % cols + .5) * cellW, top = Math.floor(k / cols) * cellH;
      const scanned = beam >= cx, near = Math.max(0, 1 - Math.abs(beam - cx) / 60);
      tags[k].classList.toggle('on', scanned); names[k].classList.toggle('on', scanned);
      if (!fig) return;
      let fh = cellH - 62, fw = fh * fig.width / fig.height;
      if (fw > cellW - 10) { fw = cellW - 10; fh = fw * fig.height / fig.width; }   // narrow cells: the width limits the figure
      const fx = cx - fw / 2, fy = top + 34 + (cellH - 62 - fh) / 2;
      ctx.globalAlpha = scanned ? 1 : .55; ctx.drawImage(fig, fx, fy, fw, fh);
      if (near > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = near * .35; ctx.drawImage(fig, fx, fy, fw, fh); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
    });
    if (beam > -20 && beam < w + 20) {
      // The beam runs down every row of the lineup at once.
      const g = ctx.createLinearGradient(beam - 46, 0, beam + 4, 0);
      g.addColorStop(0, 'rgba(36,186,230,0)'); g.addColorStop(1, 'rgba(36,186,230,.22)');
      ctx.fillStyle = g; ctx.fillRect(beam - 46, 0, 50, cellH * rowsN);
      ctx.fillStyle = 'rgba(160,235,255,.9)'; ctx.fillRect(beam, 0, 1.5, cellH * rowsN);
    }
    if (running) requestAnimationFrame(draw);
  }
  new ResizeObserver(() => { fit(); if (!running) requestAnimationFrame(draw); }).observe(host);
  watchVisible(host, v => {
    if (v && !running) { running = !reduced; start = performance.now(); requestAnimationFrame(draw); }
    else if (!v) running = false;
  }, .2);
}
