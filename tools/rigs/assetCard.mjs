// Data for the "whole rig inside" card: what one delivered character's .inp and Live2D export
// contain, read from the files themselves. The .inp pages are drawn into one contact sheet at their
// relative scale and the packed Live2D page is previewed at 1024 px (WebP; needs cwebp and ffmpeg);
// nothing else from the packages is copied.
// Usage: node tools/rigs/assetCard.mjs character.inp live2d-export-dir web-rig-id
import fs from 'node:fs'; import zlib from 'node:zlib'; import os from 'node:os'; import path from 'node:path'; import crypto from 'node:crypto'; import {execFileSync} from 'node:child_process';
const [,, inpPath, exportDir, rigId] = process.argv;
if (!inpPath || !exportDir || !rigId) throw Error('Usage: node tools/rigs/assetCard.mjs character.inp live2d-export-dir web-rig-id');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const b = fs.readFileSync(inpPath);
if (b.slice(0, 8).toString('latin1') !== 'TRNSRTS\0') throw Error('not an inp');
const jl = b.readUInt32BE(8), puppet = JSON.parse(b.slice(12, 12 + jl).toString());
let o = 12 + jl + 8; const n = b.readUInt32BE(o); o += 4; const pages = [];
for (let i = 0; i < n; i++) { const len = b.readUInt32BE(o); pages.push(b.slice(o + 5, o + 5 + len)); o += 5 + len; }
const parts = []; const walk = node => { if (node.type === 'Part') parts.push(node); (node.children ?? []).forEach(walk); }; walk(puppet.nodes);

// The web preview the card draws must be the same rig.
const preview = JSON.parse(zlib.gunzipSync(fs.readFileSync(`lab/rigs/${rigId}.json.gz`))).puppet, previewParts = []; (function w(n) { if (n.type === 'Part') previewParts.push(n); (n.children ?? []).forEach(w); })(preview.nodes);
if (previewParts.length !== parts.length || preview.param.map(p => p.name).join() !== puppet.param.map(p => p.name).join()) throw Error(`lab/rigs/${rigId} is not built from ${inpPath}`);

const report = JSON.parse(fs.readFileSync(path.join(exportDir, 'export.json'), 'utf8'));
if (report.sourceSha256 !== sha(b)) throw Error('The export was not made from this .inp');
const model = path.dirname(path.join(exportDir, report.runtimeManifest)), manifest = JSON.parse(fs.readFileSync(path.join(exportDir, report.runtimeManifest), 'utf8'));
const validation = JSON.parse(fs.readFileSync(path.join(exportDir, 'validation', 'validation.json'), 'utf8'));
const slug = rigId.replace(/^\d+-/, ''), outDir = 'lab/data/asset';
fs.mkdirSync(outDir, {recursive: true});
const textures = manifest.FileReferences.Textures.map((file, i) => {
  const png = fs.readFileSync(path.join(model, file)), preview = `${outDir}/${slug}-page-${String(i).padStart(2, '0')}.webp`;
  execFileSync('cwebp', ['-quiet', '-q', '86', '-alpha_q', '100', '-m', '6', '-resize', '1024', '0', path.join(model, file), '-o', preview], {stdio: 'ignore'});
  return {file, width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length, preview};
});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-card-')), firstOf = new Map();
const inpTextures = pages.map((png, i) => {
  const hash = sha(png), sameAs = firstOf.get(hash); if (sameAs === undefined) firstOf.set(hash, i);
  fs.writeFileSync(path.join(tmp, `${i}.png`), png);
  return {width: png.readUInt32BE(16), height: png.readUInt32BE(20), bytes: png.length, meshes: parts.filter(p => p.textures?.[0] === i).length, ...(sameAs === undefined ? {} : {sameAs})};
});
// Contact sheet: every page in order, one scale for all (the largest page is 480 px), rows wrapped
// at 2048 px, each page on its own panel so its empty area reads as part of it.
const SHEET = 2048, GAP = 28, scale = 480 / Math.max(...inpTextures.map(t => Math.max(t.width, t.height)));
let x = 0, y = 0, row = 0, sheetH = 0;
const tiles = inpTextures.map(t => {
  const w = Math.round(t.width * scale), h = Math.round(t.height * scale);
  if (x && x + w > SHEET) { x = 0; y += row + GAP; row = 0; }
  const tile = {x, y, w, h}; x += w + GAP; row = Math.max(row, h); sheetH = Math.max(sheetH, y + h);
  return tile;
});
const graph = [`color=c=black@0:s=${SHEET}x${sheetH},format=rgba[c0]`,
  ...tiles.map(({w, h}, i) => `color=c=0x2c242b:s=${w}x${h},format=rgba[b${i}];[${i}:v]format=rgba,scale=${w}:${h}:flags=area[s${i}];[b${i}][s${i}]overlay=format=auto,drawbox=x=0:y=0:w=iw:h=ih:color=0x8d7a86:t=3[p${i}]`),
  ...tiles.map(({x, y}, i) => `[c${i}][p${i}]overlay=${x}:${y}:format=auto[c${i + 1}]`)].join(';');
const sheetPng = path.join(tmp, 'sheet.png'), sheet = `${outDir}/${slug}-inp-pages.webp`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...pages.flatMap((_, i) => ['-i', path.join(tmp, `${i}.png`)]), '-filter_complex', graph, '-map', `[c${tiles.length}]`, '-frames:v', '1', sheetPng]);
execFileSync('cwebp', ['-quiet', '-q', '84', '-alpha_q', '100', '-m', '6', '-resize', '1024', '0', sheetPng, '-o', sheet], {stdio: 'ignore'});
fs.rmSync(tmp, {recursive: true, force: true});
const range = p => ({min: p.min, max: p.max, defaults: p.defaults, vector: p.is_vec2});
const card = {
  rig: rigId, name: slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
  inp: {file: path.basename(inpPath), bytes: b.length, meshes: parts.length, pages: pages.length, distinctPages: firstOf.size, textures: inpTextures, sheet,
    parameters: puppet.param.map(p => ({name: p.name, ...range(p)}))},
  live2d: {moc: manifest.FileReferences.Moc, manifest: path.basename(report.runtimeManifest), textures,
    parameters: report.parameters.map(({id, source, axis, min, max, default: value}) => ({id, source, axis, min, max, default: value})),
    atlas: report.atlas},
  checks: {strictSourceParity: validation.strictSourceParity, maxPositionError: validation.maxPositionError, maxTexelDifference: validation.textureSampling.maxTexelDifference, frames: validation.frames},
};
fs.writeFileSync(`${outDir}/${slug}.json`, JSON.stringify(card, null, 1) + '\n');
console.log(`${card.name}: ${parts.length} meshes, .inp ${pages.length} pages -> Live2D ${textures.length} (${textures.map(t => `${t.width}x${t.height}`).join(', ')}); ${card.live2d.parameters.length} Live2D parameters`);
