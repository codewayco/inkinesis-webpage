// Build an inkinesis-web-preview-v1 rig straight from an original .inp: the full puppet JSON
// (every node, parameter, binding and capability as delivered), with each texture cropped to the
// rectangle its parts' UVs use (plus padding), re-encoded as WebP at the original scale, and the
// UVs remapped to that crop. Nothing else is changed.
import fs from 'node:fs'; import zlib from 'node:zlib'; import os from 'node:os'; import path from 'node:path'; import {execFileSync} from 'node:child_process';
const [,, inpPath, outPath, qArg] = process.argv, Q = qArg || '88';
const b = fs.readFileSync(inpPath);
if (b.slice(0, 8).toString('latin1') !== 'TRNSRTS\0') throw Error('not an inp');
const jl = b.readUInt32BE(8), puppet = JSON.parse(b.slice(12, 12 + jl).toString());
let o = 12 + jl; if (b.slice(o, o + 8).toString('latin1') !== 'TEX_SECT') throw Error('no TEX_SECT'); o += 8;
const n = b.readUInt32BE(o); o += 4; const pngs = [];
for (let i = 0; i < n; i++) { const len = b.readUInt32BE(o), type = b[o + 4]; if (type !== 0) throw Error('texture ' + i + ' is not PNG'); pngs.push(b.slice(o + 5, o + 5 + len)); o += 5 + len; }
const dims = png => [png.readUInt32BE(16), png.readUInt32BE(20)];
const parts = []; const walk = node => { if (node.type === 'Part') parts.push(node); (node.children ?? []).forEach(walk); }; walk(puppet.nodes);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-')), textures = [], report = [];
for (let t = 0; t < pngs.length; t++) {
  const [W, H] = dims(pngs[t]);
  let u0 = 1, v0 = 1, u1 = 0, v1 = 0, used = false;
  for (const p of parts) { if (p.textures?.[0] !== t) continue; used = true; const uv = p.mesh.uvs; for (let k = 0; k < uv.length; k += 2) { u0 = Math.min(u0, uv[k]); u1 = Math.max(u1, uv[k]); v0 = Math.min(v0, uv[k + 1]); v1 = Math.max(v1, uv[k + 1]); } }
  if (!used) { u0 = 0; v0 = 0; u1 = 1; v1 = 1; }
  const pad = 4;
  const X0 = Math.max(0, Math.floor(u0 * W) - pad), Y0 = Math.max(0, Math.floor(v0 * H) - pad);
  const X1 = Math.min(W, Math.ceil(u1 * W) + pad), Y1 = Math.min(H, Math.ceil(v1 * H) + pad);
  const CW = Math.max(1, X1 - X0), CH = Math.max(1, Y1 - Y0);
  for (const p of parts) { if (p.textures?.[0] !== t) continue; const uv = p.mesh.uvs; for (let k = 0; k < uv.length; k += 2) { uv[k] = (uv[k] * W - X0) / CW; uv[k + 1] = (uv[k + 1] * H - Y0) / CH; } }
  const inFile = path.join(tmp, `t${t}.png`), outFile = path.join(tmp, `t${t}.webp`);
  fs.writeFileSync(inFile, pngs[t]);
  execFileSync('cwebp', ['-quiet', '-q', Q, '-alpha_q', '100', '-m', '6', '-crop', String(X0), String(Y0), String(CW), String(CH), inFile, '-o', outFile], {stdio: 'ignore'});
  const webp = fs.readFileSync(outFile); textures.push(webp.toString('base64'));
  report.push(`tex ${t}: ${W}x${H} crop [${X0},${Y0},${CW}x${CH}] -> ${(webp.length / 1024).toFixed(0)} KB`);
}
// Keyform and vertex values rounded to 0.01 px, UVs to 1e-5, as the repo's previews are; topology, bindings and bounds unchanged.
const r2 = v => Math.round(v * 100) / 100, r5 = v => Math.round(v * 1e5) / 1e5;
const roundDeep = x => Array.isArray(x) ? x.map(roundDeep) : typeof x === 'number' ? r2(x) : x;
for (const p of parts) { p.mesh.verts = p.mesh.verts.map(r2); p.mesh.uvs = p.mesh.uvs.map(r5); }
for (const prm of puppet.param) for (const bd of prm.bindings) bd.values = roundDeep(bd.values);
const out = zlib.gzipSync(Buffer.from(JSON.stringify({schema: 'inkinesis-web-preview-v1', puppet, textures})), {level: 9});
fs.writeFileSync(outPath, out); fs.rmSync(tmp, {recursive: true, force: true});
console.log(report.join('\n')); console.log(`out ${(out.length / 1048576).toFixed(1)} MB; params: ${puppet.param.map(p => p.name).join(', ')}`);
