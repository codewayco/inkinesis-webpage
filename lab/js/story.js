/* Method as one scene on Asphalt Comet Skater's delivered rig, stepped with the rail buttons: layers separate, the
 * recorded joints draw themselves, ownership colours spread from the fragments Algorithm 1 wrote into the rig,
 * the deformed mesh appears, and the rig moves under its own showcase motion.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {loadPreview, defaults, ownersOf, OWNER_RGB, chainsOf, strokeMesh} from './scene.js';
import {recipeFor, showcaseValues} from '../../static/js/rig-engine.js';
import {layerModel, explode, syncLabels} from './layers.js';
import {calibrate, gazeValues, showcaseLegs} from './rigmath.js';
import {$, $$, reduced, clamp, ease, overlay2d} from './util.js';

const RIG = 'lab/rigs/19-asphalt-comet-skater.json.gz', STEPS = 6;
const SVG = 'http://www.w3.org/2000/svg';
const JOINT_NAMES = {Arm: ['shoulder', 'elbow', 'wrist'], Leg: ['hip', 'knee', 'ankle']};

export async function story(scene) {
  const section = $('#story'), viewEl = $('#story-view'), copy = $$('.story-step', section), rail = $('.story-rail', section);
  const svg = $('.story-joints', section), mesh = overlay2d($('.story-mesh', section)), labels = $('.story-labels', section), stamp = $('.story-stamp', section);
  const buttons = copy.map((step, k) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = String(k + 1).padStart(2, '0');
    b.setAttribute('aria-label', step.querySelector('h3').textContent);
    b.addEventListener('click', () => { target = k; setStep(k); });
    rail.append(b); return b;
  });
  // The scene position `s` eases toward the chosen step (each step's centre is k + .55), so every
  // transition plays through: layers part, joints draw, ownership spreads, the mesh sweeps in.
  let target = 0, s = .55, current = -1;
  const setStep = k => {
    if (k === current) return; current = k;
    copy.forEach((el, i) => el.classList.toggle('on', i === k));
    buttons.forEach((b, i) => { b.classList.toggle('on', i === k); b.classList.toggle('done', i < k); b.setAttribute('aria-current', i === k ? 'step' : 'false'); });
  };
  setStep(0);
  if (!scene.ok) return;

  const asset = await loadPreview(RIG), base = defaults(asset), model = layerModel(asset), owners = ownersOf(asset), chains = chainsOf(asset), recipe = recipeFor(asset.puppet), cal = calibrate(asset);
  let rig = null;
  const view = scene.view(viewEl, {update, after});
  rig = await view.add(asset, {fit: .9, y: .5});
  viewEl.classList.add('is-live');

  // Joint polylines and markers, one per recorded chain.
  const marks = chains.map(c => {
    const path = document.createElementNS(SVG, 'path'); path.setAttribute('pathLength', '1'); path.style.strokeDasharray = '1'; svg.append(path);
    const dots = [0, 1, 2].map(() => { const d = document.createElementNS(SVG, 'circle'); d.setAttribute('r', '6'); svg.append(d); return d; });
    const text = document.createElement('span'); labels.append(text);
    return {c, path, dots, text};
  });
  const layerLabels = document.createElement('div'); layerLabels.className = 'story-layer-labels'; labels.append(layerLabels);

  let motion = 0;
  function update(t, dt) {
    if (!rig) return;
    const want = target + .55, speed = dt * 1.6;   // about 0.6 s per step
    s = reduced ? want : s < want ? Math.min(want, s + speed) : Math.max(want, s - speed);
    const bump = (a, b, f = .35) => ease((s - a) / f) * (1 - ease((s - b + f) / f));
    const apart = reduced ? (s >= 1 && s < 2 ? 1 : 0) : bump(1.05, 1.95, .4);
    const joints = bump(2, 3.05, .3), own = bump(3, 4.15, .35), wire = bump(4, 6.2, .3), live = ease((s - 4.2) / .5);
    // Motion: still while separated and during joints; then the limbs move.
    if (!reduced) motion += dt * live;
    let values = {...base};
    if (own > 0 && live <= 0) {
      const swing = .5 - .5 * Math.cos(t * 1.6);
      for (const c of chains) if (c.name.startsWith('Arm')) values[c.name] = [(c.name.endsWith('L') ? -1 : 1) * 14 * swing * own, (c.name.endsWith('L') ? -1 : 1) * 18 * swing * own];
      if (!reduced) for (const [name, v] of Object.entries(showcaseLegs(asset, t))) values[name] = v.map(x => x * own);
    }
    if (live > 0) values = {...values, ...showcaseValues(asset.puppet, recipe, motion % 4 + .001)};
    if (s < 1 || s > 5) values = {...values, ...gazeValues(asset, cal, .25 * Math.sin(t * .6), .1)};
    rig.values = values;
    syncLabels(layerLabels, explode(view, rig, model, apart));
    rig.dim = .55 * joints + .35 * wire * (1 - ease((s - 5) / .4));
    // Ownership spreads from the chest outward.
    if (own > 0) {
      const [cx, cy] = view.project(rig, 0, -150), r = view.rect;
      rig.tint = (part, i) => { const o = owners[i]; return o ? [...OWNER_RGB[o], .78 * own] : null; };
      rig.spread = [cx, cy, ease((s - 3) / .7) * Math.hypot(r.width, r.height) * .8, 120];
    } else { rig.tint = null; rig.spread = null; }
    rig.wire = wire;
    // Joints draw themselves.
    marks.forEach(({c, path, dots, text}, k) => {
      const f = clamp((s - 2.05 - k * .06) / .45), pts = [c.root, c.joint, c.tip].map(p => view.project(rig, p[0], p[1]));
      path.setAttribute('d', `M${pts[0]}L${pts[1]}L${pts[2]}`);
      path.style.strokeDashoffset = String(1 - f * (joints > 0 ? 1 : 0));
      path.style.opacity = String(joints);
      dots.forEach((d, j) => { d.setAttribute('cx', pts[j][0]); d.setAttribute('cy', pts[j][1]); d.style.transform = `scale(${joints * (f > j / 2 ? 1 : 0)})`; d.classList.toggle('v', s > 2.6); });
      const names = JOINT_NAMES[c.name.slice(0, 3)] ?? JOINT_NAMES.Arm, side = c.name.endsWith('L') ? 1 : -1;
      text.textContent = `${c.name.endsWith('L') ? 'left' : 'right'} ${names[1]} ✓`;
      text.style.left = (pts[1][0] + side * 64) + 'px'; text.style.top = pts[1][1] + 'px';
      text.classList.toggle('on', joints > .9 && s > 2.55);
    });
    stamp.classList.toggle('on', s > 5.3);
  }
  function after() {
    if (!rig) return;
    const dpr = mesh.fit();
    if (rig.wire <= 0.01) return;
    const ctx = mesh.ctx, h = ctx.canvas.height, sweep = clamp((s - 4) / .6);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, ctx.canvas.width, h * sweep); ctx.clip();
    ctx.globalAlpha = rig.wire * (1 - .55 * ease((s - 5.1) / .5));
    ctx.lineWidth = .7 * dpr; ctx.strokeStyle = 'rgba(160,220,255,.55)'; ctx.shadowColor = 'rgba(120,180,255,.9)'; ctx.shadowBlur = 3 * dpr;
    strokeMesh(ctx, view, rig, {dpr});
    ctx.restore();
    if (sweep > 0 && sweep < 1) { ctx.fillStyle = 'rgba(160,220,255,.9)'; ctx.fillRect(0, h * sweep - dpr, ctx.canvas.width, 2 * dpr); }
  }
}
