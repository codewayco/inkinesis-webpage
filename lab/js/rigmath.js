/* Gaze and arm-drag helpers. Every sign and joint position is measured from the rig itself
 * (by evaluating it at small test values), so no axis convention is assumed; every command is
 * clamped into the rig's own parameter bounds before it is applied.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {evaluateCombined, recipeFor, showcaseValues} from '../../static/js/rig-engine.js';
import {clampParam, chainAvailable, defaults, chainsOf, centroid} from './scene.js';

const has = (asset, name) => asset.puppet.param.some(p => p.name === name && p.bindings.length);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const cache = new WeakMap();
const recipes = new WeakMap();

/** Leg values of the original page's showcase motion at `seconds`: in each 4 s cycle the right leg
 * steps out from the hip and bends at the knee (1.0–1.8 s), then the left (1.8–2.6 s), within the
 * rig's own bounds. */
export function showcaseLegs(asset, seconds) {
  const all = showcaseValues(asset.puppet, recipe(asset), seconds);
  return Object.fromEntries(Object.entries(all).filter(([name]) => name.startsWith('Leg ')));
}
/** Head tilt of the same showcase motion, in degrees from the rig's default: right, left, then half
 * right between 2.4 s and 4 s of each cycle, 10 degrees at most (0 when the rig's roll is fixed). */
export function showcaseTilt(asset, seconds) {
  const v = showcaseValues(asset.puppet, recipe(asset), seconds).ParamAngleZ, p = asset.puppet.param.find(q => q.name === 'ParamAngleZ');
  return v && p ? v[0] - p.defaults[0] : 0;
}
function recipe(asset) {
  if (!recipes.has(asset)) recipes.set(asset, recipeFor(asset.puppet));
  return recipes.get(asset);
}

/** Measure how the face and limbs of a rig respond to its controls. */
export function calibrate(asset) {
  if (cache.has(asset)) return cache.get(asset);
  const base = defaults(asset), rest = evaluateCombined(asset, base);
  // Facial features (not the face outline, which can shift the other way in a 2.5D turn) give the turn direction.
  const faceTest = n => /^(nose|face)$/.test(n), irisTest = n => /^irides/.test(n);
  const featureTest = asset.parts.some(p => p.name === 'nose') ? n => n === 'nose' : n => /^(irides|eyewhite)/.test(n);
  const shift = (values, test, axis) => {
    const posed = evaluateCombined(asset, {...base, ...values});
    const a = centroid(rest, asset, test), b = centroid(posed, asset, test);
    return a && b ? b[axis] - a[axis] : 0;
  };
  const sign = v => (v >= 0 ? 1 : -1);
  const head = has(asset, 'Head Angles');
  const cal = {
    head,
    yaw: head ? sign(shift({'Head Angles': [10, 0]}, featureTest, 0)) : 0,
    pitchDown: head ? sign(shift({'Head Angles': [0, 10]}, featureTest, 1)) : 0,
    eyeX: has(asset, 'ParamEyeBallX') ? sign(shift({ParamEyeBallX: [1]}, irisTest, 0)) : 0,
    eyeY: has(asset, 'ParamEyeBallY') ? sign(shift({ParamEyeBallY: [1]}, irisTest, 1)) : 0,
    roll: has(asset, 'ParamAngleZ'),
    // Screen-clockwise rotation of the eye line for a positive roll command.
    rollSign: has(asset, 'ParamAngleZ') ? (() => {
      const line = posed => { const l = centroid(posed, asset, n => n === 'irides-l'), r = centroid(posed, asset, n => n === 'irides-r'); return l && r ? Math.atan2(r[1] - l[1], r[0] - l[0]) : 0; };
      return sign(wrap(line(evaluateCombined(asset, {...base, ParamAngleZ: [10]})) - line(rest)));
    })() : 0,
    blink: has(asset, 'ParamEyeLOpen') && has(asset, 'ParamEyeROpen'),
    face: centroid(rest, asset, faceTest) ?? [0, -asset.height * .3],
    arms: {}, legs: {},
  };
  // Limbs: follow one vertex near the recorded wrist or ankle to measure each axis' screen rotation.
  for (const chain of chainsOf(asset)) {
    const kind = chain.name.startsWith('Arm') ? 'arms' : chain.name.startsWith('Leg') ? 'legs' : null;
    if (!kind || !chainAvailable(asset, chain.name)) continue;
    let partIndex = -1, best = 0, bestD = Infinity;
    for (const name of chain.parts) {
      const i = asset.parts.findIndex(p => p.name === name); if (i < 0) continue;
      const xy = rest[i].xy;
      for (let k = 0; k < xy.length; k += 2) { const d = Math.hypot(xy[k] - chain.tip[0], xy[k + 1] - chain.tip[1]); if (d < bestD) { bestD = d; best = k; partIndex = i; } }
      if (kind === 'arms') break; // the hand sits on the arm layer itself
    }
    if (partIndex < 0) continue;
    const xy = rest[partIndex].xy;
    const at = values => { const p = evaluateCombined(asset, {...base, [chain.name]: values})[partIndex].xy; return [p[best], p[best + 1]]; };
    const angle = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]);
    const t0 = [xy[best], xy[best + 1]], t1 = at([10, 0]), t2 = at([0, 10]);
    const k1 = wrap(angle(chain.root, t1) - angle(chain.root, t0)) / (10 * Math.PI / 180);
    const k2 = wrap(angle(chain.joint, t2) - angle(chain.joint, t0)) / (10 * Math.PI / 180);
    if (Math.abs(k1) < .2 || Math.abs(k2) < .2) continue;
    cal[kind][chain.name] = {chain, part: partIndex, vertex: best, k1, k2, hand: t0};
  }
  cache.set(asset, cal);
  return cal;
}

/** Face values for a gaze direction gx (screen right) and gy (screen down), both in [-1, 1]. */
export function gazeValues(asset, cal, gx, gy, {yaw = 10, pitch = 7, roll = 2, eyes = .9} = {}) {
  const out = {};
  if (cal.head) out['Head Angles'] = clampParam(asset, 'Head Angles', [cal.yaw * gx * yaw, cal.pitchDown * gy * pitch]);
  // A slight lean toward the look direction (screen-clockwise when looking right).
  if (cal.roll && roll) out.ParamAngleZ = clampParam(asset, 'ParamAngleZ', [cal.rollSign * gx * roll]);
  if (cal.eyeX) out.ParamEyeBallX = clampParam(asset, 'ParamEyeBallX', [cal.eyeX * gx * eyes]);
  if (cal.eyeY) out.ParamEyeBallY = clampParam(asset, 'ParamEyeBallY', [cal.eyeY * gy * eyes]);
  return out;
}

/** Blink envelope: 1 open, 0 closed, for a blink that started `dt` seconds ago. */
export const blinkOpen = dt => dt < 0 || dt > .34 ? 1 : dt < .13 ? 1 - dt / .13 : dt < .19 ? 0 : (dt - .19) / .15;

/** Two-joint inverse kinematics in rig pixels: shoulder and elbow commands that bring the hand
 * toward `target`, keeping the drawn bend direction, clamped to the rig's ranges. */
const LEG_RANGE = [[-18, 0], [18, 45]];  // the viewer's gentle hip and knee range

export function reach(asset, arm, target) {
  const {chain, k1, k2} = arm, R = chain.root, J = chain.joint, T = chain.tip;
  const L1 = Math.hypot(J[0] - R[0], J[1] - R[1]), L2 = Math.hypot(T[0] - J[0], T[1] - J[1]);
  const a1 = Math.atan2(J[1] - R[1], J[0] - R[0]), a2 = Math.atan2(T[1] - J[1], T[0] - J[0]), rest = wrap(a2 - a1);
  const dx = target[0] - R[0], dy = target[1] - R[1];
  const d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(L1 + L2 - 1e-3, Math.hypot(dx, dy)));
  const phi = Math.atan2(dy, dx);
  const interior = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  const alpha = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const deg = 180 / Math.PI, solve = side => {
    const bend = side * (Math.PI - interior), upper = bend >= 0 ? phi - alpha : phi + alpha;
    const raw = [wrap(upper - a1) * deg / k1, (bend - rest) * deg / k2];
    let clamped = clampParam(asset, chain.name, raw);
    if (clamped && chain.name.startsWith('Leg')) clamped = clamped.map((v, d) => Math.max(LEG_RANGE[0][d], Math.min(LEG_RANGE[1][d], v)));
    return clamped && {clamped, cost: Math.hypot(raw[0] - clamped[0], raw[1] - clamped[1])};
  };
  // Prefer the drawn bend direction unless the rig's ranges only allow the other one.
  const a = solve(rest >= 0 ? 1 : -1), b = solve(rest >= 0 ? -1 : 1);
  const pick = !b || (a && a.cost <= b.cost + 1) ? a : b;
  if (!pick || pick.cost < 1e-6) return pick?.clamped ?? null;
  // A clamped solution can carry the hand away from the target, farther than the drawn pose
  // (a limited, bent arm); only then search the allowed range with the same two-joint model.
  const hand = v => { const u = a1 + v[0] * k1 / deg, w = u + rest + v[1] * k2 / deg; return [R[0] + L1 * Math.cos(u) + L2 * Math.cos(w), R[1] + L1 * Math.sin(u) + L2 * Math.sin(w)]; };
  const miss = v => { const p = hand(v); return Math.hypot(p[0] - target[0], p[1] - target[1]); };
  const drawn = asset.puppet.param.find(p => p.name === chain.name).defaults;
  if (miss(pick.clamped) <= miss(drawn)) return pick.clamped;
  const lo = clampParam(asset, chain.name, [-Infinity, -Infinity]), hi = clampParam(asset, chain.name, [Infinity, Infinity]);
  if (chain.name.startsWith('Leg')) for (let d = 0; d < 2; d++) { lo[d] = Math.max(lo[d], LEG_RANGE[0][d]); hi[d] = Math.min(hi[d], LEG_RANGE[1][d]); }
  let best = pick.clamped, bestMiss = miss(best);
  for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
    const v = [lo[0] + (hi[0] - lo[0]) * i / 24, lo[1] + (hi[1] - lo[1]) * j / 24], m = miss(v);
    if (m < bestMiss - 1) { best = v; bestMiss = m; }
  }
  return best;
}

/** Head command for a drag of (dx, dy) view pixels: at most about ±10° turn and ±8° nod. */
export function headDrag(asset, cal, dx, dy, {yaw = 10, pitch = 8, span = 80} = {}) {
  if (!cal.head) return null;
  return clampParam(asset, 'Head Angles', [cal.yaw * Math.max(-1, Math.min(1, dx / span)) * yaw, cal.pitchDown * Math.max(-1, Math.min(1, dy / span)) * pitch]);
}

/** Current screen position of the tracked hand vertex of an arm (view CSS pixels). */
export function handOf(view, rig, arm) {
  const p = rig.lastPosed?.[arm.part]?.xy;
  if (!p) return null;
  return view.project(rig, p[arm.vertex], p[arm.vertex + 1]);
}
