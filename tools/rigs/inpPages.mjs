// The .inp texture pages for the "whole rig inside" card, one image per distinct page, each cropped to
// the rectangle that holds artwork (plus a small margin), with the parts that sample it. Pages are
// kept as stored: their count, order, sizes and duplicate copies are reported as they are in the file.
// Adds `tile`, `crop` and `parts` to each entry of inp.textures in lab/data/asset/<slug>.json.
// Usage: node tools/rigs/inpPages.mjs character.inp lab/data/asset/<slug>.json   (needs ffmpeg and cwebp)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import {execFileSync, spawnSync} from 'node:child_process';

const [inpPath, cardPath] = process.argv.slice(2);
if (!inpPath || !cardPath) throw Error('Usage: node tools/rigs/inpPages.mjs character.inp lab/data/asset/<slug>.json');
const b = fs.readFileSync(inpPath), card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
if (b.length !== card.inp.bytes) throw Error(`${inpPath} is not the .inp this card was built from`);

// .inp: "TRNSRTS\0", u32 BE JSON length, JSON, "TEX_SECT", u32 BE count, then per page u32 BE length, u8 kind, bytes.
const jl = b.readUInt32BE(8), puppet = JSON.parse(b.subarray(12, 12 + jl));
let o = 12 + jl + 8; const count = b.readUInt32BE(o); o += 4; const pages = [];
for (let i = 0; i < count; i++) { const len = b.readUInt32BE(o); pages.push(b.subarray(o + 5, o + 5 + len)); o += 5 + len; }
if (pages.length !== card.inp.textures.length) throw Error('Page count differs from the card');

const parts = []; const walk = n => { if (n.type === 'Part') parts.push(n); (n.children ?? []).forEach(walk); }; walk(puppet.nodes);
const users = pages.map(() => []);
for (const p of parts) for (const t of new Set(p.textures ?? [])) if (t != null && t < pages.length) users[t].push(p.name);

// Readable part names, left and right pairs merged: "eyebrow-l" + "eyebrow-r" -> "eyebrows".
const NAMES = {'back hair': 'back hair', 'front hair': 'front hair', face: 'face', neck: 'neck', topwear: 'top', bottomwear: 'skirt', mouth_open: 'open mouth', mouth_close: 'closed mouth',
  arm: 'arm', ears: 'ear', eyebrow: 'eyebrow', eyelash: 'eyelashes', eyewhite: 'eye white', irides: 'iris', eye_close: 'closed eye', legwear: 'leg', footwear: 'shoe', nose: 'nose', headwear: 'headwear', neckwear: 'neckwear'};
const PLURAL = {arm: 'arms', ear: 'ears', eyebrow: 'eyebrows', eyelashes: 'eyelashes', 'eye white': 'eye whites', iris: 'irises', 'closed eye': 'closed eyes', leg: 'legs', shoe: 'shoes'};
function describe(names) {
  const seen = new Map();
  for (const raw of names) {
    let m = raw.match(/^objects#\d+:(l|r)$/);
    if (m) { seen.set(raw, `held object, ${m[1] === 'l' ? 'left' : 'right'} hand`); continue; }
    m = raw.match(/^(.*?)(?:-(l|r))?(__front)?$/);
    const base = NAMES[m[1]] ?? m[1].replace(/[_-]+/g, ' '), side = m[2], front = m[3] ? ', front layer' : '';
    const key = base + front;
    if (!seen.has(key)) seen.set(key, {base, side: side ? new Set([side]) : null, front});
    else if (side && seen.get(key).side) seen.get(key).side.add(side);
  }
  return [...seen.values()].map(v => typeof v === 'string' ? v
    : !v.side ? v.base + v.front
    : v.side.size === 2 ? (PLURAL[v.base] ?? v.base + 's') + v.front
    : `${[...v.side][0] === 'l' ? 'left' : 'right'} ${v.base}${v.front}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inp-pages-')), dir = path.dirname(cardPath), slug = path.basename(cardPath, '.json');
const hashes = pages.map(png => crypto.createHash('sha256').update(png).digest('hex'));
const oldSheet = card.inp.sheet;
card.inp.textures.forEach((t, i) => {
  t.parts = describe(users[i]);
  const first = hashes.indexOf(hashes[i]);
  if (first !== i) { t.sameAs = first; delete t.tile; delete t.crop; return; }
  if (hashes.indexOf(hashes[i], i + 1) > 0) { delete t.tile; delete t.crop; return; }   // the shared atlas: its parts are not shown one by one
  const src = path.join(tmp, `${i}.png`); fs.writeFileSync(src, pages[i]);
  // Bounding box of every pixel with any alpha.
  const out = spawnSync('ffmpeg', ['-hide_banner', '-i', src, '-vf', 'alphaextract,bbox=min_val=1', '-f', 'null', '-'], {encoding: 'utf8'}).stderr;
  const m = [...out.matchAll(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)].pop();
  if (!m) throw Error(`page ${i}: no artwork found`);
  const [x1, x2, y1, y2] = m.slice(1).map(Number), pad = Math.round(Math.max(t.width, t.height) * .01);
  const x = Math.max(0, x1 - pad), y = Math.max(0, y1 - pad), w = Math.min(t.width, x2 + pad + 1) - x, h = Math.min(t.height, y2 + pad + 1) - y;
  const crop = path.join(tmp, `${i}-crop.png`), tile = `${dir}/${slug}-inp-page-${String(i + 1).padStart(2, '0')}.webp`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `crop=${w}:${h}:${x}:${y}`, crop]);
  const scale = Math.max(w, h) > 1024 ? ['-resize', ...(w >= h ? ['1024', '0'] : ['0', '1024'])] : [];
  execFileSync('cwebp', ['-quiet', '-q', '86', '-alpha_q', '100', '-m', '6', ...scale, crop, '-o', tile], {stdio: 'ignore'});
  Object.assign(t, {tile, crop: [x, y, w, h]});
});
fs.rmSync(tmp, {recursive: true, force: true});
// The old contact sheet is replaced by the per-page tiles.
if (oldSheet && fs.existsSync(oldSheet)) fs.rmSync(oldSheet);
delete card.inp.sheet;
fs.writeFileSync(cardPath, JSON.stringify(card, null, 1) + '\n');
card.inp.textures.forEach((t, i) => console.log(`page ${String(i + 1).padStart(2)}  ${t.width}x${t.height}  ${t.sameAs !== undefined ? `same as page ${t.sameAs + 1}` : `artwork ${t.crop[2]}x${t.crop[3]}`}  ${t.parts.join(', ')}`));
