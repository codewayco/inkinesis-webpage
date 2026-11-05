// Rebuild an inkinesis-web-preview-v1 rig with full-resolution textures from the original .inp.
// Geometry, bindings and keyforms stay exactly as in the preview; only UVs are recomputed for a
// crop rectangle of the original atlas and the textures are re-encoded with cwebp (no resize unless MAX is set).
import fs from 'node:fs'; import zlib from 'node:zlib'; import os from 'node:os'; import path from 'node:path'; import {execFileSync} from 'node:child_process';
const [,, previewPath, inpPath, outPath, maxSideArg, qArg] = process.argv;
const MAX = Number(maxSideArg || 0), Q = qArg || '88';
const preview = JSON.parse(zlib.gunzipSync(fs.readFileSync(previewPath)));
const b = fs.readFileSync(inpPath);
if (b.slice(0, 8).toString('latin1') !== 'TRNSRTS\0') throw Error('not an inp');
const jl = b.readUInt32BE(8), orig = JSON.parse(b.slice(12, 12 + jl).toString());
let o = 12 + jl; if (b.slice(o, o + 8).toString('latin1') !== 'TEX_SECT') throw Error('no TEX_SECT'); o += 8;
const n = b.readUInt32BE(o); o += 4; const pngs = [];
for (let i = 0; i < n; i++) { const len = b.readUInt32BE(o), type = b[o + 4]; if (type !== 0) throw Error('texture ' + i + ' is not PNG'); pngs.push(b.slice(o + 5, o + 5 + len)); o += 5 + len; }
const dims = png => [png.readUInt32BE(16), png.readUInt32BE(20)];
const walk = (node, out) => { if (node.type === 'Part') out.push(node); (node.children ?? []).forEach(c => walk(c, out)); return out; };
const pParts = walk(preview.puppet.nodes, []), oParts = new Map(walk(orig.nodes, []).map(p => [p.uuid, p]));
if (preview.textures.length !== pngs.length) throw Error(`texture count ${preview.textures.length} vs ${pngs.length}`);
// Fit u' = a*u + b per texture and axis from the preview's remapped UVs against the original UVs.
const fit = (xs, ys) => { const m = xs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 0; i < m; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; } const d = m * sxx - sx * sx; if (Math.abs(d) < 1e-9) return null; const a = (m * sxy - sx * sy) / d; return [a, (sy - a * sx) / m]; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-')), textures = [], report = [];
for (let t = 0; t < pngs.length; t++) {
  const [W, H] = dims(pngs[t]);
  const us = [], ous = [], vs = [], ovs = [];
  for (const p of pParts) { if (p.textures?.[0] !== t) continue; const op = oParts.get(p.uuid); if (!op) throw Error('no original part for ' + p.name); if (op.mesh.uvs.length !== p.mesh.uvs.length) throw Error('uv count differs for ' + p.name); for (let k = 0; k < p.mesh.uvs.length; k += 2) { us.push(p.mesh.uvs[k]); ous.push(op.mesh.uvs[k]); vs.push(p.mesh.uvs[k + 1]); ovs.push(op.mesh.uvs[k + 1]); } }
  let X0 = 0, Y0 = 0, CW = W, CH = H;
  const fu = us.length > 2 ? fit(ous, us) : null, fv = vs.length > 2 ? fit(ovs, vs) : null;
  if (fu && fv && fu[0] > 0 && fv[0] > 0) { CW = Math.round(W / fu[0]); X0 = Math.round(-fu[1] * CW); CH = Math.round(H / fv[0]); Y0 = Math.round(-fv[1] * CH); }
  X0 = Math.max(0, Math.min(W - 1, X0)); Y0 = Math.max(0, Math.min(H - 1, Y0)); CW = Math.max(1, Math.min(W - X0, CW)); CH = Math.max(1, Math.min(H - Y0, CH));
  // Recompute the preview UVs exactly for this integer crop.
  for (const p of pParts) { if (p.textures?.[0] !== t) continue; const op = oParts.get(p.uuid); const uv = p.mesh.uvs; for (let k = 0; k < uv.length; k += 2) { uv[k] = (op.mesh.uvs[k] * W - X0) / CW; uv[k + 1] = (op.mesh.uvs[k + 1] * H - Y0) / CH; } }
  const inFile = path.join(tmp, `t${t}.png`), outFile = path.join(tmp, `t${t}.webp`);
  fs.writeFileSync(inFile, pngs[t]);
  const args = ['-quiet', '-q', Q, '-alpha_q', '100', '-m', '6', '-crop', String(X0), String(Y0), String(CW), String(CH)];
  if (MAX && Math.max(CW, CH) > MAX) { const s = MAX / Math.max(CW, CH); args.push('-resize', String(Math.round(CW * s)), String(Math.round(CH * s))); }
  execFileSync('cwebp', [...args, inFile, '-o', outFile], {stdio: 'ignore'});
  const webp = fs.readFileSync(outFile); textures.push(webp.toString('base64'));
  report.push(`tex ${t}: ${W}x${H} crop [${X0},${Y0},${CW}x${CH}] -> ${(webp.length / 1024).toFixed(0)} KB`);
}
const out = zlib.gzipSync(Buffer.from(JSON.stringify({...preview, textures})), {level: 9});
fs.writeFileSync(outPath, out);
fs.rmSync(tmp, {recursive: true, force: true});
console.log(report.join('\n')); console.log(`out ${(out.length / 1048576).toFixed(1)} MB  (preview was ${(fs.statSync(previewPath).size / 1048576).toFixed(1)} MB)`);
