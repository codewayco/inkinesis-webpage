/* 4 · Drag comparison of one component of Inkinesis, live, on the same delivered rig and the same
 * motion, split by a divider. Left: the delivered rig. Right: the same mesh with one component
 * replaced by the alternative the manuscript ablates, computed in the browser on the same vertices:
 *  - carriers: held-object parts evaluated at the drawn pose (objects stay where they were drawn);
 *  - garment ownership: garment vertices follow their nearest limb bone rigidly instead of the
 *    anatomical ownership written into the rig (the torso fabric is dragged along);
 *  - joint blend: arm vertices rotate rigidly about the shoulder or the elbow with a hard split at
 *    the joint instead of the per-chain blended keyforms (the elbow pinches and can fold).
 * The alternatives are geometric models applied live; the tally numbers are the manuscript's.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {evaluateCombined} from '../../static/js/rig-engine.js';
import {loadPreview, defaults, isObject, clampParam, chainAvailable} from './scene.js';
import {HELD, heldValues} from '../../static/js/ainime-held.js';
import {calibrate, gazeValues, showcaseLegs} from './rigmath.js';
import {$, $$, reduced, clamp, heldRig, fillRange, watchVisible} from './util.js';

const GARMENT = /^(topwear|bottomwear|neckwear)/, DEG = Math.PI / 180;
const MODES = {
  carriers: {left: 'With carriers', right: 'Carriers removed', readout: 'Hand–object gap', raise: 'Raise the holding arms',
    note: 'Right half: the held-object parts are evaluated at the drawn pose while the arms move, the recorded carrier ablation. The readout is the distance the object has left the hand.'},
  garment: {left: 'Anatomical ownership', right: 'Nearest-bone assignment', readout: 'Fabric dragged', raise: 'Raise the arms',
    note: 'Right half: every garment vertex near a limb bone follows that bone rigidly, the nearest-bone rule the manuscript ablates, instead of the anatomical ownership written into the rig. The torso fabric is dragged with the sleeve and the trouser fabric with the leg; the readout is how far it moved.'},
  blend: {left: 'Continuous joint blend', right: 'Rigid joint split', readout: 'Reversed triangles', raise: 'Bend the arms',
    note: 'Right half: the arm vertices rotate rigidly about the shoulder or the elbow with a hard split at the joint, the rigid alternative the manuscript ablates, instead of the per-chain blended keyforms. The readout counts triangles the rigid model turns inside out.'},
};

export async function compare(scene) {
  const section = $('#compare'), el = $('#wipe-live'), range = $('#wipe-range'), raiseInput = $('#compare-raise'), play = $('#compare-play');
  const gapOn = $('[data-gap="on"]', section), gapOff = $('[data-gap="off"]', section), sideL = $('.wipe-side.left b', section), sideR = $('.wipe-side.right b', section);
  const readouts = $$('.gap-readout [data-readout]', section), raiseLabel = $('[data-raise-label]', section), tallyBox = $('.contact-tally', section), note = $('[data-compare-note]', section);
  const modeButtons = $$('[data-mode]', section);
  tally(section);
  if (!scene.ok) return;
  const syncRange = fillRange(range), syncRaise = fillRange(raiseInput);
  let split = .5, playing = !reduced, raise = 0, pair = null, loading = 0, mode = 'carriers', legT = 0;
  const view = scene.view(el, {update});

  async function use(id) {
    const ticket = ++loading;
    el.classList.remove('is-live');
    const asset = await loadPreview(heldRig(id));
    if (ticket !== loading) return;
    view.clear();
    const base = defaults(asset), rest = evaluateCombined(asset, base), cal = calibrate(asset);
    const held = Boolean(HELD[id]);
    // Carried objects: object parts that the delivered rig moves when the holding arms rise.
    const raised = held ? evaluateCombined(asset, {...base, ...heldValues({asset}, id, 1)}) : rest;
    const shift = i => { const a = rest[i].xy, b = raised[i].xy; let m = 0; for (let k = 0; k < a.length; k += 2) m = Math.max(m, Math.hypot(a[k] - b[k], a[k + 1] - b[k + 1])); return m; };
    const objects = held ? asset.parts.map((p, i) => isObject(p.name) && shift(i) > 8 ? i : -1).filter(i => i >= 0) : [];
    const hands = Object.values(cal.arms);
    const links = objects.map(i => {
      let best = null;
      for (const arm of hands) { const d = minDistance(rest[i].xy, rest[arm.part].xy[arm.vertex], rest[arm.part].xy[arm.vertex + 1]); if (!best || d < best.d) best = {arm, d}; }
      return best && {part: i, ...best};
    }).filter(Boolean);
    // Limb chains with measured screen gains, as the rigid models need them.
    const chains = Object.values({...cal.arms, ...cal.legs}).map(c => ({...c, name: c.chain.name, root: c.chain.root, joint: c.chain.joint, tip: c.chain.tip, L1: Math.hypot(c.chain.joint[0] - c.chain.root[0], c.chain.joint[1] - c.chain.root[1])}));
    const arms = chains.filter(c => c.name.startsWith('Arm'));
    // Joint blend: parts the arm chains move, each vertex classed as upper arm or forearm at rest.
    const partIndex = name => asset.parts.findIndex(p => p.name === name);
    const rigid = [];
    for (const c of arms) {
      const parts = [...(c.chain.parts ?? []).map(partIndex).filter(i => i >= 0), ...links.filter(l => l.arm.chain.name === c.name).map(l => l.part)];
      for (const i of parts) {
        const xy = rest[i].xy, lower = new Uint8Array(xy.length / 2), ux = (c.joint[0] - c.root[0]) / c.L1, uy = (c.joint[1] - c.root[1]) / c.L1;
        for (let k = 0; k < xy.length; k += 2) lower[k / 2] = (xy[k] - c.root[0]) * ux + (xy[k + 1] - c.root[1]) * uy > c.L1 ? 1 : 0;
        if (isObject(asset.parts[i].name)) lower.fill(1);
        rigid.push({i, c, lower});
      }
    }
    // Garment ownership: for every garment vertex, the nearest limb bone within reach of a bone.
    const nearest = [];
    asset.parts.forEach((p, i) => {
      if (!GARMENT.test(p.name)) return;
      const xy = rest[i].xy, owner = new Int16Array(xy.length / 2).fill(-1), seg = new Uint8Array(xy.length / 2);
      for (let k = 0; k < xy.length; k += 2) {
        let best = Infinity;
        chains.forEach((c, ci) => {
          const d0 = segDist(xy[k], xy[k + 1], c.root, c.joint), d1 = segDist(xy[k], xy[k + 1], c.joint, c.tip), reach = c.L1 * .38;
          if (d0 < best && d0 < reach) { best = d0; owner[k / 2] = ci; seg[k / 2] = 0; }
          if (d1 < best && d1 < reach) { best = d1; owner[k / 2] = ci; seg[k / 2] = 1; }
        });
      }
      if (owner.some(o => o >= 0)) nearest.push({i, owner, seg});
    });
    const on = await view.add(asset, {fit: .9, y: .52});
    const off = await view.add(asset, {fit: .9, y: .52});
    pair = {id, asset, base, cal, on, off, links, rest, objects, chains, arms, rigid, nearest, held, reversed: 0, dragged: 0};
    setMode(held || mode !== 'carriers' ? mode : 'garment');
    el.classList.add('is-live');
  }

  /* Rigid two-segment transform of a rest vertex under a chain's current command. */
  const angles = c => { const v = pair.off.values[c.name] ?? pair.base[c.name] ?? [0, 0]; return [v[0] * DEG * c.k1, v[1] * DEG * c.k2]; };
  function rigidPoint(x, y, c, lower, th) {
    if (lower) [x, y] = rotate(x, y, c.joint[0], c.joint[1], th[1]);
    return rotate(x, y, c.root[0], c.root[1], th[0]);
  }
  function setMode(next) {
    mode = next;
    const m = MODES[mode];
    modeButtons.forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); b.disabled = b.dataset.mode === 'carriers' && pair && !pair.held; b.title = b.disabled ? `${HELD[pair?.id]?.name ?? 'This character'} holds no object, so there is no carrier to remove.` : ''; });
    sideL.textContent = m.left; sideR.textContent = m.right; readouts.forEach(s => { s.textContent = m.readout; }); raiseLabel.textContent = m.raise; note.textContent = m.note;
    if (tallyBox) tallyBox.hidden = mode !== 'carriers';
    if (!pair) return;
    for (const rig of [pair.on, pair.off]) { rig.zoom = 1; rig.focus = [0, 0]; rig.x = .5; rig.y = .52; }
    setSplit(.5);
    if (mode === 'carriers') pair.off.posedHook = posed => posed.map((p, i) => pair.objects.includes(i) ? pair.rest[i] : p);
    else if (mode === 'blend') pair.off.posedHook = posed => {
      const out = posed.slice(); let reversed = 0;
      for (const {i, c, lower} of pair.rigid) {
        const th = angles(c), src = pair.rest[i].xy, xy = new Float32Array(src.length);
        for (let k = 0; k < src.length; k += 2) { const [x, y] = rigidPoint(src[k], src[k + 1], c, lower[k / 2], th); xy[k] = x; xy[k + 1] = y; }
        reversed += reversedTriangles(pair.asset.parts[i].mesh.indices, src, xy);
        out[i] = {...posed[i], xy};
      }
      pair.reversed = reversed; return out;
    };
    else pair.off.posedHook = posed => {
      const out = posed.slice(); let dragged = 0;
      const th = pair.chains.map(angles);
      for (const {i, owner, seg} of pair.nearest) {
        const src = pair.rest[i].xy, cur = posed[i].xy, xy = new Float32Array(cur);
        for (let k = 0; k < src.length; k += 2) {
          const o = owner[k / 2]; if (o < 0) continue;
          const [x, y] = rigidPoint(src[k], src[k + 1], pair.chains[o], seg[k / 2], th[o]); xy[k] = x; xy[k + 1] = y;
          dragged = Math.max(dragged, Math.hypot(x - cur[k], y - cur[k + 1]));
        }
        out[i] = {...posed[i], xy};
      }
      pair.dragged = dragged; return out;
    };
  }
  function gap(rig) {
    let worst = 0;
    for (const l of pair.links) {
      const hand = rig.lastPosed?.[l.arm.part]?.xy, obj = rig.lastPosed?.[l.part]?.xy;
      if (!hand || !obj) continue;
      worst = Math.max(worst, minDistance(obj, hand[l.arm.vertex], hand[l.arm.vertex + 1]) - l.d);
    }
    return Math.max(0, worst);
  }
  function update(t) {
    if (!pair) return;
    if (playing) { raise = .5 - .5 * Math.cos(t * 1.15); raiseInput.value = String(Math.round(raise * 100)); syncRaise(); legT = t; }
    let motion = {};
    if (mode === 'carriers') motion = heldValues(pair.on, pair.id, raise);
    else for (const c of pair.arms) { const side = c.name.endsWith('L') ? -1 : 1, v = clampParam(pair.asset, c.name, mode === 'blend' ? [side * 20 * raise, side * 60 * raise] : [side * 30 * raise, side * 25 * raise]); if (v) motion[c.name] = v; }
    // The legs step one after the other (the original showcase timing) on both sides of the divider.
    if (!reduced) Object.assign(motion, showcaseLegs(pair.asset, legT));
    const values = {...pair.base, ...motion, ...gazeValues(pair.asset, pair.cal, .15 * Math.sin(t * .7), .05)};
    pair.on.values = values; pair.off.values = values;
    pair.on.clip = [0, split]; pair.off.clip = [split, 1];
    if (mode === 'carriers') { gapOn.textContent = gap(pair.on).toFixed(1) + ' px'; gapOff.textContent = gap(pair.off).toFixed(1) + ' px'; }
    else if (mode === 'blend') { gapOn.textContent = '0'; gapOff.textContent = String(pair.reversed); }
    else { gapOn.textContent = '0.0 px'; gapOff.textContent = pair.dragged.toFixed(1) + ' px'; }
  }

  const setSplit = v => { split = clamp(v, .04, .96); el.style.setProperty('--split', (split * 100) + '%'); range.value = String(Math.round(split * 100)); syncRange(); };
  const fromPointer = e => { const r = el.getBoundingClientRect(); setSplit((e.clientX - r.left) / r.width); };
  el.addEventListener('pointerdown', e => { if (e.button !== 0) return; el.setPointerCapture(e.pointerId); fromPointer(e); });
  el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) fromPointer(e); });
  range.addEventListener('input', () => setSplit(Number(range.value) / 100));
  raiseInput.addEventListener('input', () => { playing = false; raise = Number(raiseInput.value) / 100; syncPlay(); });
  const syncPlay = () => { play.textContent = playing ? 'Pause' : 'Play'; play.setAttribute('aria-pressed', String(playing)); };
  play.addEventListener('click', () => { playing = !playing; syncPlay(); }); syncPlay();
  $$('[data-compare]', section).forEach(b => b.addEventListener('click', () => {
    $$('[data-compare]', section).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    use(b.dataset.compare);
  }));
  modeButtons.forEach(b => b.addEventListener('click', () => { if (!b.disabled) setMode(b.dataset.mode); }));
  setSplit(.5);
  // A one-time sweep of the divider shows that it moves.
  watchVisible(el, v => {
    if (!v || el.dataset.swept || reduced) return; el.dataset.swept = '1';
    const start = performance.now();
    const sweep = now => { const k = clamp((now - start) / 1800); setSplit(.5 + .22 * Math.sin(k * Math.PI * 2) * (1 - k)); if (k < 1) requestAnimationFrame(sweep); };
    setTimeout(() => requestAnimationFrame(sweep), 600);
  }, .5);
  await use('17-cedar-ridge-ranger');
}

const rotate = (x, y, cx, cy, th) => { const c = Math.cos(th), s = Math.sin(th), dx = x - cx, dy = y - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
const area = (xy, a, b, c) => ((xy[b * 2] - xy[a * 2]) * (xy[c * 2 + 1] - xy[a * 2 + 1]) - (xy[c * 2] - xy[a * 2]) * (xy[b * 2 + 1] - xy[a * 2 + 1]));
function reversedTriangles(idx, rest, posed) {
  let n = 0;
  for (let k = 0; k < idx.length; k += 3) { const a0 = area(rest, idx[k], idx[k + 1], idx[k + 2]); if (Math.abs(a0) < 1e-6) continue; if (area(posed, idx[k], idx[k + 1], idx[k + 2]) / a0 <= 0) n++; }
  return n;
}
function minDistance(xy, x, y) {
  let d = Infinity;
  for (let k = 0; k < xy.length; k += 2) d = Math.min(d, Math.hypot(xy[k] - x, xy[k + 1] - y));
  return d;
}

/* Recorded tallies grow when the card enters the viewport. */
function tally(section) {
  const card = $('.contact-tally', section); if (!card) return;
  watchVisible(card, v => { if (!v) return; $('[data-tally-bar="on"]', card).style.width = '2.86%'; $('[data-tally-bar="off"]', card).style.width = '95.71%'; }, .6);
}
