/* 6 · Numbers as pictures. Every value is a manuscript number; nothing is computed here except
 * the live hand–object gap in the contact loop, which is read from the delivered rig.
 * The export card is a tolerance gauge: the nine recorded per-rig Core maxima (delivery check) sit on
 * a ×25 window of the 0.005 px tolerance. The fold card is a live fold detector: one arm of a delivered
 * rig sweeps its own bounds while every triangle is coloured by its signed-area ratio against rest and
 * reversed triangles are counted; the caption's 0 across 94 rigs is the manuscript's.
 * Item 4: lower-is-better numbers count DOWN from the baseline to ours, so the motion reads as
 * the improvement; two cards carry a micro-proof: a live carrier loop and the three recorded
 * ownership renders.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {evaluateCombined, recipeFor, showcaseValues} from '../../static/js/rig-engine.js';
import {loadPreview, defaults, isObject, ownersOf, chainsOf, clampParam, strokeMesh} from './scene.js';
import {HELD, heldValues} from '../../static/js/ainime-held.js';
import {calibrate, showcaseLegs} from './rigmath.js';
import {$, $$, reduced, clamp, ease, heldRig, whenNear, overlay2d} from './util.js';

export function evidence(scene) {
  const section = $('#evidence');
  for (const el of $$('[data-count]', section)) el.textContent = Number(el.dataset.count).toFixed(Number(el.dataset.digits ?? 0));
  const run = card => {
    card.classList.add('is-run');
    for (const el of $$('[data-count]', card)) {
      const end = Number(el.dataset.count), from = el.dataset.from != null ? Number(el.dataset.from) : 0, digits = Number(el.dataset.digits ?? 0), start = performance.now(), dur = reduced ? 1 : 1700;
      el.classList.toggle('counting-down', from > end);
      const step = now => { const t = clamp((now - start) / dur), k = 1 - (1 - t) ** 3; el.textContent = (from + (end - from) * k).toFixed(digits); if (t < 1) requestAnimationFrame(step); else el.classList.remove('counting-down'); };
      requestAnimationFrame(step);
    }
  };
  const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); run(e.target); } }), {threshold: .45});
  $$('.ev-card', section).forEach(card => io.observe(card));

  gauge(section);
  coreReplay(scene, section);
  foldDetector(scene, section);
  // Recorded ownership renders cycle: ours, soft assignment, nearest bone.
  for (const cycle of $$('.ev-cycle', section)) {
    const card = cycle.closest('.ev-card'), imgs = $$('.cyc', cycle), tag = $('.ev-cycle-tag', card), moved = $('[data-cycle-moved]', card);
    let k = 0;
    const show = () => { imgs.forEach((im, i) => im.classList.toggle('on', i === k)); tag.textContent = imgs[k].dataset.label; tag.classList.toggle('ours', k === 0); if (moved) { moved.textContent = imgs[k].dataset.moved; moved.parentElement.classList.toggle('ours', k === 0); } };
    show();
    if (!reduced) setInterval(() => { k = (k + 1) % imgs.length; show(); }, 1500);
  }

  // Live carrier loop: Twinlens Shutter Girl's camera hand, carriers on, then off, at the same arm motion.
  const host = $('[data-ev-live="contact"]', section);
  if (host && scene.ok) whenNear(host, async () => {
    const id = '14-twinlens-shutter-girl', asset = await loadPreview(heldRig(id)), base = defaults(asset), cal = calibrate(asset);
    const rest = evaluateCombined(asset, base), raised = evaluateCombined(asset, {...base, ...heldValues({asset}, id, 1)});
    const shift = i => { const a = rest[i].xy, b = raised[i].xy; let m = 0; for (let k = 0; k < a.length; k += 2) m = Math.max(m, Math.hypot(a[k] - b[k], a[k + 1] - b[k + 1])); return m; };
    const objects = asset.parts.map((p, i) => isObject(p.name) && shift(i) > 8 ? i : -1).filter(i => i >= 0);
    const armName = Object.keys(HELD[id].arms).find(n => cal.arms[n]) ?? Object.keys(cal.arms)[0], arm = cal.arms[armName];   // the arm that holds the camera
    const card = host.closest('.ev-card'), tag = $('[data-live-tag]', card), gap = $('[data-live-gap]', card);
    let rig = null, off = false;
    const meshLayer = overlay2d($('.ev-mesh', host)), chain = chainsOf(asset).find(c => c.name === armName);
    const view = scene.view(host, {update, after});
    rig = await view.add(asset, {fit: 1, x: .5, y: .5});
    // Frame the right hand between its drawn and raised positions.
    const h0 = [rest[arm.part].xy[arm.vertex], rest[arm.part].xy[arm.vertex + 1]], h1 = [raised[arm.part].xy[arm.vertex], raised[arm.part].xy[arm.vertex + 1]];
    rig.focus = [(h0[0] + h1[0]) / 2, (h0[1] + h1[1]) / 2 + 40]; rig.zoom = 2.1;
    const link = objects.map(i => { const d = minDistance(rest[i].xy, h0[0], h0[1]); return {part: i, d}; }).sort((a, b) => a.d - b.d)[0];
    // Wireframe: the carrying arm, the object (red once its carrier is removed), and the carrier itself
    // as a rigid bar from the wrist to the object's nearest drawn point, which stretches when removed.
    const armParts = new Set(asset.parts.map((p, i) => chain?.parts.includes(p.name) ? i : -1).filter(i => i >= 0));
    let anchor = 0;
    if (link) { const xy = rest[link.part].xy; let best = Infinity; for (let k = 0; k < xy.length; k += 2) { const d = Math.hypot(xy[k] - h0[0], xy[k + 1] - h0[1]); if (d < best) { best = d; anchor = k; } } }
    rig.dim = .3;
    host.classList.add('is-live');
    function after() {
      const dpr = meshLayer.fit(), ctx = meshLayer.ctx; if (!rig?.lastPosed) return;
      const ours = '#1fa99a', bad = '#fd084d';
      ctx.lineWidth = .7 * dpr; ctx.strokeStyle = 'rgba(31,169,154,.8)';
      strokeMesh(ctx, view, rig, {filter: i => armParts.has(i), dpr});
      if (!link) return;
      ctx.strokeStyle = off ? 'rgba(253,8,77,.85)' : 'rgba(31,169,154,.9)';
      strokeMesh(ctx, view, rig, {filter: i => objects.includes(i), dpr});
      const hand = rig.lastPosed[arm.part].xy, obj = rig.lastPosed[link.part].xy;
      const [hx, hy] = view.project(rig, hand[arm.vertex], hand[arm.vertex + 1]), [ox, oy] = view.project(rig, obj[anchor], obj[anchor + 1]);
      ctx.setLineDash(off ? [5 * dpr, 4 * dpr] : []); ctx.lineWidth = (off ? 1.5 : 3) * dpr; ctx.strokeStyle = off ? bad : ours;
      ctx.beginPath(); ctx.moveTo(hx * dpr, hy * dpr); ctx.lineTo(ox * dpr, oy * dpr); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = off ? bad : ours;
      for (const [x, y] of [[hx, hy], [ox, oy]]) { ctx.beginPath(); ctx.arc(x * dpr, y * dpr, 3.5 * dpr, 0, 7); ctx.fill(); }
    }
    function update(t) {
      if (!rig) return;
      const cycle = reduced ? 1.3 : t % 4.4; off = cycle >= 2.2;
      const local = off ? cycle - 2.2 : cycle, raise = reduced ? .8 : ease(local / 1.2) * (1 - ease((local - 1.7) / .4));
      rig.posedHook = off ? posed => posed.map((p, i) => objects.includes(i) ? rest[i] : p) : null;
      rig.values = {...base, ...heldValues(rig, id, raise), ...(reduced ? {} : showcaseLegs(asset, t))};
      tag.textContent = off ? 'Carriers removed' : 'Rigid wrist carriers'; tag.classList.toggle('ours', !off);
      if (link && rig.lastPosed) {
        const hand = rig.lastPosed[arm.part].xy, obj = rig.lastPosed[link.part].xy;
        const g = Math.max(0, minDistance(obj, hand[arm.vertex], hand[arm.vertex + 1]) - link.d);
        gap.textContent = `gap ${g.toFixed(1)} px`; gap.classList.toggle('bad', g > 2);
      }
    }
  });
}

/* Tolerance gauge: recorded Core maxima from the delivery check, drawn on a ×25 window. */
async function gauge(section) {
  const host = $('[data-gauge-ticks]', section), worstEl = $('[data-gauge-worst]', section);
  if (!host) return;
  try {
    const deltas = await fetch('lab/data/core-deltas.json').then(r => r.json());
    const WINDOW = .0002, rows = deltas.rows.slice().sort((a, b) => a.coreMaxPx - b.coreMaxPx);
    rows.forEach((row, k) => { const i = document.createElement('i'); i.style.setProperty('--x', String(clamp(row.coreMaxPx / WINDOW) * 100)); i.style.transitionDelay = (k * 90) + 'ms'; i.title = `${row.id}: ${row.coreMaxPx.toFixed(6)} px`; host.append(i); });
    const worst = rows[rows.length - 1];
    worstEl.textContent = `Worst recorded ${worst.coreMaxPx.toFixed(6)} px · ${(worst.coreMaxPx / deltas.tolerancePx * 100).toFixed(1)}% of tolerance`;
  } catch { worstEl.textContent = 'recorded maxima unavailable'; }
}

/* Live fold detector: Azure Prism Dancer's right arm sweeps its own bounds; every triangle of the
 * arm and the garment it owns is coloured by signed area against rest, and reversals are counted. */
function foldDetector(scene, section) {
  const host = $('[data-ev-live="fold"]', section);
  if (!host || !scene.ok) return;
  whenNear(host, async () => {
    const asset = await loadPreview('lab/rigs/02-azure-prism-dancer.json.gz'), base = defaults(asset);
    const chain = chainsOf(asset).find(c => c.name === 'Arm R') ?? chainsOf(asset).find(c => c.name.startsWith('Arm'));
    if (!chain) return;
    const side = chain.name.endsWith('L') ? 'left' : 'right', owners = ownersOf(asset);
    const chainParts = new Set(chain.parts ?? []);
    const partsOn = asset.parts.map((p, i) => chainParts.has(p.name) || owners[i] === side);
    const rest = evaluateCombined(asset, base);
    const restArea = asset.parts.map((p, i) => { if (!partsOn[i]) return null; const idx = p.mesh.indices, xy = rest[i].xy, out = new Float32Array(idx.length / 3); for (let k = 0; k < idx.length; k += 3) out[k / 3] = area(xy, idx[k], idx[k + 1], idx[k + 2]); return out; });
    const card = host.closest('.ev-card'), tag = $('[data-fold-tag]', card), count = $('[data-fold-count]', card), mesh = overlay2d($('.ev-mesh', host));
    const param = asset.puppet.param.find(p => p.name === chain.name);
    let rig = null;
    const view = scene.view(host, {update, after});
    rig = await view.add(asset, {fit: 1, x: .5, y: .5});
    rig.focus = [chain.joint[0], (chain.joint[1] + chain.root[1]) / 2]; rig.zoom = 1.9; rig.dim = .25;
    host.classList.add('is-live');
    let reversed = 0, total = 0, angle = 0;
    function update(t) {
      if (!rig) return;
      // Sweep shoulder and elbow through the rig's own bounds (min to max and back).
      const s = reduced ? .55 : .5 - .22 * Math.cos(t * .9), e = reduced ? .8 : .5 - .5 * Math.cos(t * 1.3 + 1);   // shoulder stays near the middle of its range so the elbow keeps the frame; the elbow sweeps fully
      const want = param ? [param.min[0] + (param.max[0] - param.min[0]) * s, param.min[1] + (param.max[1] - param.min[1]) * e] : [0, 0];
      const v = clampParam(asset, chain.name, want) ?? want;
      rig.values = {...base, [chain.name]: v};
      angle = v[1];
      tag.textContent = `Elbow ${angle.toFixed(0)}°`;
      count.textContent = `reversed ${reversed} / ${total.toLocaleString('en')}`; count.classList.toggle('bad', reversed > 0);
    }
    function after() {
      const posed = rig?.lastPosed; if (!posed) return;
      const dpr = mesh.fit(), ctx = mesh.ctx, {cx, cy, scale} = view.placement(rig);
      let rev = 0, n = 0;
      ctx.lineWidth = .5 * dpr;
      posed.forEach((p, i) => {
        if (!partsOn[i] || !p.enabled || p.opacity <= .05) return;
        const idx = asset.parts[i].mesh.indices, xy = p.xy, ra = restArea[i];
        for (let k = 0; k < idx.length; k += 3) {
          const a0 = ra[k / 3]; if (Math.abs(a0) < 1e-6) continue;
          const ratio = area(xy, idx[k], idx[k + 1], idx[k + 2]) / a0; n++;
          let fill;
          if (ratio <= 0) { rev++; fill = 'rgba(10,10,12,.92)'; }
          else { const l = Math.log2(ratio), m = clamp(Math.abs(l) / 1.2); fill = l < 0 ? `rgba(79,140,255,${.12 + .6 * m})` : `rgba(255,107,74,${.12 + .6 * m})`; }
          ctx.fillStyle = fill; ctx.strokeStyle = ratio <= 0 ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.14)';
          ctx.beginPath();
          for (const j of [idx[k], idx[k + 1], idx[k + 2]]) ctx.lineTo((cx + xy[j * 2] * scale) * dpr, (cy + xy[j * 2 + 1] * scale) * dpr);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      });
      reversed = rev; total = n;
    }
  });
}
const area = (xy, a, b, c) => ((xy[b * 2] - xy[a * 2]) * (xy[c * 2 + 1] - xy[a * 2 + 1]) - (xy[c * 2] - xy[a * 2]) * (xy[b * 2 + 1] - xy[a * 2 + 1])) / 2;

function minDistance(xy, x, y) {
  let d = Infinity;
  for (let k = 0; k < xy.length; k += 2) d = Math.min(d, Math.hypot(xy[k] - x, xy[k + 1] - y));
  return d;
}

/* Core replay: Midnight Brass Busker runs through its ranges frame by frame, the way the delivery check
 * replayed every recorded pose under the official Cubism Core. A check beam sweeps the rig once per
 * frame; the wireframe it has passed is lit, the frame count and the triangle tally come from the
 * recorded check (core-deltas.json), and the max difference is that rig's recorded maximum. */
function coreReplay(scene, section) {
  const host = $('[data-ev-live="core"]', section);
  if (!host || !scene.ok) return;
  whenNear(host, async () => {
    const id = '16-ember-forge-smith';   // the simplest mesh of the delivery check: its wireframe reads at card size
    const [asset, deltas] = await Promise.all([loadPreview(heldRig(id)), fetch('lab/data/core-deltas.json').then(r => r.json())]);
    const row = deltas.rows.find(r => r.id === id) ?? deltas.rows[0];
    const base = defaults(asset), cal = calibrate(asset), recipe = recipeFor(asset.puppet);
    const card = host.closest('.ev-card'), tag = $('[data-core-tag]', card), gap = $('[data-core-gap]', card), checks = $('[data-core-checks]', card);
    const meshCanvas = $('.ev-mesh', host), mesh = overlay2d(meshCanvas);
    const FRAME = .34, frames = row.frames, perFrame = row.triangleChecks / frames;
    let rig = null, frame = 0, phase = 1;
    const view = scene.view(host, {update, after});
    rig = await view.add(asset, {fit: 1, x: .5, y: .5});
    rig.focus = [cal.face[0], cal.face[1] + 110]; rig.zoom = 1.6; rig.dim = .22;
    host.classList.add('is-live');
    gap.textContent = `max Δ ${row.coreMaxPx.toFixed(6)} px`;
    function update(t) {
      if (!rig) return;
      const k = reduced ? 0 : Math.floor(t / FRAME); frame = k % frames; phase = reduced ? 1 : (t / FRAME) % 1;
      // The studio's own showcase motion (the viewer's Animate button): continuous, within the rig's bounds.
      rig.values = {...base, ...showcaseValues(asset.puppet, recipe, reduced ? 1.4 : t)};
      tag.textContent = `Core replay · frame ${frame + 1} / ${frames}`;
      checks.textContent = Math.round(perFrame * (frame + phase)).toLocaleString('en');
    }
    function after() {
      if (!rig?.lastPosed) return;
      const dpr = mesh.fit(), ctx = mesh.ctx, w = meshCanvas.width, h = meshCanvas.height;
      ctx.lineWidth = .5 * dpr; ctx.strokeStyle = 'rgba(31,169,154,.45)';
      strokeMesh(ctx, view, rig, {filter: () => true, dpr});
      if (reduced) return;
      // The check beam: one pass down the rig per frame; the wireframe it has passed is lit.
      const y = phase * (h + 30 * dpr) - 15 * dpr;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, Math.max(0, y)); ctx.clip();
      ctx.lineWidth = .8 * dpr; ctx.strokeStyle = 'rgba(120,240,205,.7)'; strokeMesh(ctx, view, rig, {filter: () => true, dpr});
      ctx.restore();
      const g = ctx.createLinearGradient(0, y - 30 * dpr, 0, y);
      g.addColorStop(0, 'rgba(60,207,145,0)'); g.addColorStop(1, 'rgba(60,207,145,.3)');
      ctx.fillStyle = g; ctx.fillRect(0, y - 30 * dpr, w, 30 * dpr);
      ctx.fillStyle = 'rgba(170,255,225,.95)'; ctx.fillRect(0, y, w, 1.5 * dpr);
    }
  });
}
