/* Exploded view of a rig's own parts: semantic groups glide from their drawn positions into a
 * labelled grid and back. Parts are only translated and scaled as a whole; nothing is redrawn.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {evaluateCombined} from '../../static/js/rig-engine.js';
import {defaults} from './scene.js';
import {clamp, ease} from './util.js';

export const LAYER_GROUPS = [
  ['Back hair', n => /back hair/.test(n)],
  ['Face & features', n => /^(face|nose|eye|irides|eyelash|eyebrow|mouth|ears|neck)/.test(n)],
  ['Front hair & headwear', n => /front hair|headwear/.test(n)],
  ['Held objects', n => /^(objects|prop)/.test(n)],
  ['Arms', n => /^arm-/.test(n)],
  ['Clothing', n => /^(topwear|bottomwear|neckwear|earwear)/.test(n)],
  ['Legs & shoes', n => /legwear|footwear/.test(n)],
];

/** Group membership and rest bounding boxes (canvas-centred rig pixels) of a rig's parts. */
export function layerModel(asset) {
  const rest = evaluateCombined(asset, defaults(asset));
  const raw = asset.parts.map(p => LAYER_GROUPS.findIndex(([, test]) => test(p.name)));
  const used = [...new Set(raw.filter(g => g >= 0))].sort((a, b) => a - b);
  const groupOf = raw.map(g => used.indexOf(g));
  const boxes = used.map((_, g) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    rest.forEach((p, i) => { if (groupOf[i] !== g || !p.enabled) return; for (let k = 0; k < p.xy.length; k += 2) { x0 = Math.min(x0, p.xy[k]); x1 = Math.max(x1, p.xy[k]); y0 = Math.min(y0, p.xy[k + 1]); y1 = Math.max(y1, p.xy[k + 1]); } });
    return {cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0};
  });
  return {groupOf, names: used.map(g => LAYER_GROUPS[g][0]), boxes, count: asset.parts.length};
}

/** Apply an exploded layout at `apart` ∈ [0, 1]. Returns label positions in view pixels. */
export function explode(view, rig, model, apart, {tilt = 0, top = .04, bottom = .1} = {}) {
  const n = model.boxes.length;
  if (apart <= 0 || !n) { rig.partXform = null; return []; }
  const r = view.rect, cols = n > 6 ? 4 : 3, rows = Math.ceil(n / cols);
  const slotW = r.width / cols, slotH = r.height * (1 - top - bottom) / rows;
  const {scale} = view.placement(rig);
  const xforms = model.boxes.map((b, g) => {
    const row = Math.floor(g / cols), inRow = Math.min(cols, n - row * cols), col = g - row * cols;
    const sx = r.width / 2 + (col - (inRow - 1) / 2) * slotW + tilt * (row - (rows - 1) / 2) * 24;
    const sy = r.height * top + (row + .46) * slotH;
    const [tx, ty] = view.unproject(rig, sx, sy);
    const fit = Math.min(1, .74 * slotW / Math.max(1, b.w * scale), .78 * slotH / Math.max(1, b.h * scale));
    const a = ease(apart * 1.25 - g * .035);
    const k = 1 + (fit - 1) * a, cx = b.cx + (tx - b.cx) * a, cy = b.cy + (ty - b.cy) * a;
    return {d: [cx - b.cx * k, cy - b.cy * k, k - 1], label: [sx, sy + Math.min(slotH * .46, b.h * scale * fit / 2 + 18)], a};
  });
  rig.partXform = i => { const g = model.groupOf[i]; return g < 0 ? [0, 0, 0] : xforms[g].d; };
  return xforms.map((x, g) => ({name: model.names[g], x: x.label[0], y: x.label[1], on: x.a > .92}));
}

/** Keep a set of label elements in sync with explode() output. */
export function syncLabels(container, list) {
  while (container.children.length < list.length) container.append(document.createElement('span'));
  [...container.children].forEach((el, k) => {
    const l = list[k];
    el.classList.toggle('on', Boolean(l?.on));
    if (!l) return;
    if (el.textContent !== l.name) el.textContent = l.name;
    el.style.left = l.x + 'px'; el.style.top = clamp(l.y, 0, 1e5) + 'px';
  });
}
