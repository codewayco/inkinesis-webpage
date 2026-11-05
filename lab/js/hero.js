/* 1 · Hero: the opening lineup, live. Characters look at the
 * pointer (or the phone's tilt), blink on their own, and a hand can be grabbed: dragging solves the
 * two-joint arm toward the pointer within the rig's own bounds, and the held object follows because
 * it rides the wrist carrier. If nobody touches the page, a ghost cursor shows what a drag does.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {loadPreview, defaults, clampParam, chainAvailable} from './scene.js';
import {HELD, heldValues} from '../../static/js/ainime-held.js';
import {calibrate, gazeValues, reach, handOf, headDrag, blinkOpen, showcaseLegs, showcaseTilt} from './rigmath.js';
import {$, reduced, pointer, clamp, lerp, ease, easeOutBack, heldRig, liteData, watchVisible} from './util.js';

// Held-object rigs alternate with free-handed ones; every rig has articulated arms and legs. The pink
// idols (Neon Penlight Cheer, Sakura Comet Idol, Bubblegum Idol) stand at least three characters apart.
const IDS = ['11-vermilion-shrine-bells', '04-purple-couture', '15-neon-penlight-cheer', '35-saffron-jester-acrobat', '17-cedar-ridge-ranger', '21-ochre-nomad',
  '18-midnight-brass-busker', '01-sakura-comet-idol', '14-twinlens-shutter-girl', '07-neon-skater', '16-ember-forge-smith', '08-bubblegum-idol', '13-foxfire-festival-sweet', '19-asphalt-comet-skater', '12-strawberry-cream-patissier'];
// Spacing in stage heights; each character takes 4 s to cross one spacing, as in the recording.
const SPACING = .84, PERIOD = IDS.length * 4, LOOP = IDS.length * SPACING;

export async function hero(scene) {
  const el = $('#hero-view'), video = $('#hero-video'), handle = $('.hand-handle', el), pauseButton = $('#hero-pause'), hint = $('[data-hero-hint]');
  const ghost = $('#ghost-cursor');
  // The recording is only a fallback: without WebGL 2, with Save-Data, or if the rigs fail to load.
  const fallback = () => { el.classList.add('use-fallback'); video.preload = 'auto'; if (!reduced) video.play().catch(() => {}); };
  if (!scene.ok || liteData()) { fallback(); return; }
  let assets;
  try { assets = await Promise.all(IDS.map(id => loadPreview(heldRig(id)))); } catch (error) { fallback(); throw error; }
  let start = Infinity, clock = 2.4, paused = reduced, visible = true, drag = null, hover = null, used = false;
  const actors = [];
  const view = scene.view(el, {update});
  for (const [k, asset] of assets.entries()) {
    const rig = await view.add(asset, {y: .53, height: .95, visible: false, opacity: 0});
    actors.push({rig, id: IDS[k], base: defaults(asset), cal: calibrate(asset), gaze: [0, .1], blinkAt: -1, nextBlink: 1 + Math.random() * 4, release: null});
  }
  start = scene.time;
  el.classList.add('is-live');
  watchVisible(el, v => { visible = v; });

  /* Both arms rise and fall together: an arm that holds an object to the manuscript teaser pose, a
   * free arm gently. The legs step one after the other, quickly, with the original page's showcase
   * timing, each character a little after the one before. Everything stays within the rig's bounds. */
  function limbValues(rig, id, k) {
    const phase = clock * 1.25 + k * 1.1, r = reduced ? .35 : .5 - .5 * Math.cos(phase), out = {};
    for (const name of ['Arm L', 'Arm R']) { if (!chainAvailable(rig.asset, name)) continue; const side = name.endsWith('L') ? -1 : 1; const v = clampParam(rig.asset, name, [side * 24 * r, side * 20 * r]); if (v) out[name] = v; }
    if (HELD[id]) Object.assign(out, heldValues(rig, id, r));
    if (!reduced) Object.assign(out, showcaseLegs(rig.asset, clock + k * .88));
    return out;
  }
  function layoutX(k) { return (((k * SPACING - clock * LOOP / PERIOD) % LOOP) + LOOP) % LOOP - SPACING; }
  const dragPoint = () => drag?.at ?? [pointer.x, pointer.y];

  function update(t, dt) {
    if (!visible) return;
    if (!paused && !drag) clock += dt;
    const r = view.rect, aspect = r.width / r.height, now = performance.now();
    const active = pointer.gaze && now - pointer.moved < 4500 && pointer.y > -40 && pointer.y < innerHeight + 40;
    actors.forEach((a, k) => {
      const {rig, cal} = a, x = layoutX(k);
      rig.x = x / aspect; rig.height = r.width < 600 ? .78 : .95;
      rig.visible = x > -SPACING && x < aspect + SPACING;
      if (!rig.visible) return;
      rig.opacity = Math.min(1, rig.opacity + dt * 2.2 * (reduced ? 10 : 1) * (t - start > k * .06 ? 1 : 0));
      // Gaze: toward the pointer from this face, or a slow idle drift.
      let tx, ty;
      const look = drag ? dragPoint() : [pointer.x, pointer.y];
      if (active || drag) {
        const [fx, fy] = view.project(rig, cal.face[0], cal.face[1]);
        tx = clamp((look[0] - r.left - fx) / (r.width * .32), -1, 1);
        ty = clamp((look[1] - r.top - fy) / (r.height * .55), -1, 1);
      } else { tx = .55 * Math.sin(t * .37 + k * 1.7); ty = .15 + .2 * Math.sin(t * .29 + k); }
      const follow = 1 - Math.exp(-dt * (active ? 7 : 2));
      a.gaze[0] = lerp(a.gaze[0], tx, follow); a.gaze[1] = lerp(a.gaze[1], ty, follow);
      // Blink on a loose, per-character rhythm.
      a.nextBlink -= reduced ? 0 : dt;
      if (a.nextBlink <= 0) { a.blinkAt = t; a.nextBlink = 2.2 + Math.random() * 4.5; }
      const open = blinkOpen(t - a.blinkAt);
      const values = {...a.base, ...limbValues(rig, a.id, k), ...gazeValues(rig.asset, cal, a.gaze[0], a.gaze[1])};
      // After the legs, the head tilts right, left and half right (the original showcase, 10 degrees
      // at most; every hero rig was checked to stay intact at 15) on top of the gaze.
      const tilt = reduced ? 0 : showcaseTilt(rig.asset, clock + k * .88);
      if (tilt) values.ParamAngleZ = clampParam(rig.asset, 'ParamAngleZ', [(values.ParamAngleZ?.[0] ?? 0) + tilt]) ?? values.ParamAngleZ;
      if (cal.blink && open < 1) { values.ParamEyeLOpen = [open]; values.ParamEyeROpen = [open]; }
      if (drag?.actor === a) {
        let target;
        const [px0, py0] = dragPoint();
        if (drag.head) target = headDrag(rig.asset, cal, px0 - drag.from[0], py0 - drag.from[1]);
        else { const [px, py] = view.unproject(rig, px0 - r.left, py0 - r.top); target = reach(rig.asset, drag.limb, [px, py]); }
        if (target) { drag.values = drag.values ? drag.values.map((v, i) => lerp(v, target[i], 1 - Math.exp(-dt * 18))) : target; values[drag.name] = drag.values; }
      } else if (a.release) {
        const s = clamp((t - a.release.at) / .7), held = values[a.release.name] ?? [0, 0], b = easeOutBack(s);
        values[a.release.name] = a.release.values.map((v, i) => lerp(v, held[i], b));
        if (s >= 1) a.release = null;
      }
      rig.values = values;
    });
    if (drag?.at) { const p = handlePoint(drag); if (p) placeHandle(p); }
  }

  // Grab handles: the nearest hand, foot or face within reach of the pointer.
  function nearestHandle(clientX, clientY, reachPx = 46) {
    const r = view.rect; let best = null, bestD = Infinity;
    for (const a of actors) {
      if (!a.rig.visible || !a.rig.lastPosed) continue;
      for (const limb of [...Object.values(a.cal.arms), ...Object.values(a.cal.legs)]) {
        const p = handOf(view, a.rig, limb); if (!p) continue;
        const d = Math.hypot(p[0] + r.left - clientX, p[1] + r.top - clientY);
        if (d < reachPx && d < bestD) { bestD = d; best = {actor: a, limb, name: limb.chain.name, p}; }
      }
      if (a.cal.head) {
        const p = view.project(a.rig, a.cal.face[0], a.cal.face[1]), d = Math.hypot(p[0] + r.left - clientX, p[1] + r.top - clientY);
        if (d < reachPx * .87 && d < bestD) { bestD = d; best = {actor: a, head: true, name: 'Head Angles', p}; }
      }
    }
    return best;
  }
  const handlePoint = h => h.head ? view.project(h.actor.rig, h.actor.cal.face[0], h.actor.cal.face[1]) : handOf(view, h.actor.rig, h.limb);
  function placeHandle(p) { const r = el.getBoundingClientRect(), v = view.rect; handle.style.left = (p[0] + v.left - r.left) + 'px'; handle.style.top = (p[1] + v.top - r.top) + 'px'; }
  el.addEventListener('pointermove', e => {
    if (drag) { if (!drag.at) { const p = handlePoint(drag); if (p) placeHandle(p); } return; }
    hover = e.pointerType === 'mouse' ? nearestHandle(e.clientX, e.clientY) : null;
    handle.classList.toggle('on', Boolean(hover)); handle.classList.toggle('face', Boolean(hover?.head)); el.classList.toggle('grab-ready', Boolean(hover));
    if (hover) placeHandle(hover.p);
  });
  el.addEventListener('pointerleave', () => { if (!drag) { handle.classList.remove('on'); el.classList.remove('grab-ready'); } });
  function begin(hit, clientX, clientY, at = null) {
    hit.actor.release = null;
    drag = {...hit, from: [clientX, clientY], values: null, at};
    handle.classList.add('on', 'held'); handle.classList.toggle('face', Boolean(hit.head)); el.classList.add('grabbing');
  }
  el.addEventListener('pointerdown', e => {
    stopTour();
    const hit = nearestHandle(e.clientX, e.clientY, e.pointerType === 'touch' ? 64 : 46);
    if (!hit) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = performance.now();
    begin(hit, e.clientX, e.clientY);
  });
  const end = () => {
    if (!drag) return;
    const a = drag.actor, wasGhost = Boolean(drag.at);
    if (drag.values) a.release = {name: drag.name, values: drag.values, at: scene.time};
    drag = null; handle.classList.remove('held', 'on'); el.classList.remove('grabbing', 'grab-ready');
    if (!used && !wasGhost) { used = true; hint.textContent = 'Every angle you just set was clamped to the rig’s own bounds; the object never left the hand.'; }
  };
  el.addEventListener('pointerup', e => { if (!drag?.at) end(); }); el.addEventListener('pointercancel', () => { if (!drag?.at) end(); });

  const sync = () => { pauseButton.setAttribute('aria-pressed', String(paused)); pauseButton.innerHTML = paused ? 'Play <span aria-hidden="true">▶</span>' : 'Pause <span aria-hidden="true">Ⅱ</span>'; };
  pauseButton.addEventListener('click', () => { paused = !paused; sync(); }); sync();
  if (!pointer.fine) hint.textContent = 'Live rigs, not a video. Touch and drag a hand, a foot or a face.';

  /* ---------- ghost cursor tour: if the visitor hasn't touched the page, a demo cursor
   * grabs a hand, raises it, lets go, then nudges a face. Any real input stops it at once. */
  let tour = null, toured = false;
  const loaded = performance.now();
  function stopTour() { if (!tour) return; tour = null; ghost.classList.remove('on'); if (drag?.at) end(); }
  for (const type of ['pointermove', 'pointerdown', 'touchstart', 'wheel', 'keydown']) addEventListener(type, stopTour, {passive: true});
  function ghostAt(x, y, press = 1) {
    const r = el.getBoundingClientRect();
    ghost.style.setProperty('--gx', (x - r.left) + 'px'); ghost.style.setProperty('--gy', (y - r.top) + 'px'); ghost.style.setProperty('--press', String(press));
  }
  async function runTour() {
    if (toured || reduced || !visible || drag) return;
    const r = view.rect;
    const central = a => { if (!a.rig.visible || a.rig.opacity < .9 || !a.rig.lastPosed || !Object.keys(a.cal.arms).length) return false; const [fx] = view.project(a.rig, a.cal.face[0], a.cal.face[1]); return fx > r.width * .2 && fx < r.width * .8; };
    const pick = actors.find(a => a.id === '16-ember-forge-smith' && central(a)) ?? actors.find(central);
    if (!pick) return;
    const arm = pick.cal.arms['Arm R'] ?? Object.values(pick.cal.arms)[0]; if (!arm) return;
    toured = true; tour = {};
    const me = tour;
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const glide = async (from, to, ms, press = 1) => {
      const t0 = performance.now();
      while (tour === me) { const k = ease(clamp((performance.now() - t0) / ms)); const x = lerp(from[0], to[0], k), y = lerp(from[1], to[1], k); ghostAt(x, y, press); if (drag?.at) drag.at = [x, y]; if (k >= 1) return [x, y]; await new Promise(requestAnimationFrame); }
      return to;
    };
    const handPos = () => { const p = handOf(view, pick.rig, arm); return p ? [p[0] + r.left, p[1] + r.top] : null; };
    let p = handPos(); if (!p) { stopTour(); return; }
    const startAt = [p[0] + 140, p[1] + 90];
    ghostAt(...startAt); ghost.classList.add('on');
    await wait(350); if (tour !== me) return;
    p = handPos() ?? p;
    const at = await glide(startAt, p, 900);
    if (tour !== me) return;
    const hit = nearestHandle(at[0], at[1], 80);
    if (!hit || hit.head) { stopTour(); return; }
    begin(hit, at[0], at[1], at); ghostAt(at[0], at[1], .82);
    await wait(220); if (tour !== me) return;
    const up = [at[0] + (hit.name.endsWith('L') ? -1 : 1) * r.height * .16, at[1] - r.height * .26];
    await glide(at, up, 1300, .82); if (tour !== me) return;
    await glide(up, [up[0] + 20, up[1] + 10], 500, .82); if (tour !== me) return;
    end(); ghostAt(up[0] + 20, up[1] + 10, 1);
    await wait(500); if (tour !== me) return;
    // Then the face: a small sideways nudge turns the head within its bounds.
    const face = view.project(pick.rig, pick.cal.face[0], pick.cal.face[1]), fp = [face[0] + r.left, face[1] + r.top];
    const near = await glide([up[0] + 20, up[1] + 10], fp, 800); if (tour !== me) return;
    const fhit = nearestHandle(near[0], near[1], 60);
    if (fhit?.head) {
      begin(fhit, near[0], near[1], near); ghostAt(near[0], near[1], .82);
      await glide(near, [near[0] - 70, near[1] + 10], 700, .82); if (tour !== me) return;
      await glide([near[0] - 70, near[1] + 10], [near[0] + 60, near[1]], 900, .82); if (tour !== me) return;
      end();
    }
    ghostAt(near[0] + 60, near[1], 1);
    await wait(400);
    if (tour === me) { tour = null; ghost.classList.remove('on'); }
  }
  const idle = setInterval(() => {
    if (toured) { clearInterval(idle); return; }
    const quiet = performance.now() - Math.max(pointer.moved, loaded) > 4500;
    if (quiet && visible && !drag && scrollY < innerHeight * .4) runTour().catch(() => stopTour());
  }, 700);
}
