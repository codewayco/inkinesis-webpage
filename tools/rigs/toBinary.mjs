// Convert inkinesis-web-preview-v1 rigs (the .json.gz files fromInp.mjs and rebuild.mjs write) to the
// binary container the page loads (lab/rigs/<id>.ikr, written next to each input). Lossless: every keyform value decodes to exactly the number JSON.parse gives
// for the original file, and every texture byte is kept; the converter checks both before writing.
//
// Container (then gzip): "IKR1", u32 header length (LE), the header JSON (the preview with each deform
// binding's values and each texture replaced by a blob reference), zero padding to 8 bytes, the blobs.
// Deform values: when every value of a binding is an exact decimal with at most 6 places, they are
// stored as int32 at that scale, each key as the difference to the key before it ("i32d"); otherwise as
// float64 ("f64"). Numeric blobs are byte-plane shuffled so gzip sees similar bytes together.
// Usage: node tools/rigs/toBinary.mjs preview.json.gz ...
import fs from 'node:fs'; import zlib from 'node:zlib';

const shuffle = (bytes, size) => { const n = bytes.length / size, out = Buffer.alloc(bytes.length); for (let p = 0; p < size; p++) for (let i = 0; i < n; i++) out[p * n + i] = bytes[i * size + p]; return out; };
const is4d = v => Array.isArray(v) && Array.isArray(v[0]) && Array.isArray(v[0][0]) && Array.isArray(v[0][0][0]) && typeof v[0][0][0][0] === 'number';

function encode(file) {
  const source = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const data = structuredClone(source), blobs = [];
  const push = buf => { blobs.push(buf); return blobs.length - 1; };
  data.textures = data.textures.map(b64 => ({$blob: push(Buffer.from(b64, 'base64'))}));
  for (const param of data.puppet.param) for (const binding of param.bindings) {
    const V = binding.values; if (!is4d(V)) continue;
    const a0 = V.length, a1 = V[0].length, nv = V[0][0].length, stride = nv * 2, flat = new Float64Array(a0 * a1 * stride);
    let k = 0;
    for (let i = 0; i < a0; i++) for (let j = 0; j < a1; j++) { if (V[i][j].length !== nv) throw Error(`${file}: ragged keyform`); for (const [x, y] of V[i][j]) { flat[k++] = x; flat[k++] = y; } }
    let places = -1;
    for (let d = 0; d <= 6 && places < 0; d++) { const s = 10 ** d; if (flat.every(x => Number.isFinite(x) && Math.abs(x * s) < 2 ** 31 && Math.round(x * s) / s === x)) places = d; }
    if (places >= 0) {
      const s = 10 ** places, ints = Int32Array.from(flat, x => Math.round(x * s)), delta = new Int32Array(ints.length);
      for (let n = 0; n < ints.length; n++) delta[n] = n < stride ? ints[n] : ints[n] - ints[n - stride];
      binding.values = {$blob: push(shuffle(Buffer.from(delta.buffer), 4)), type: 'i32d', places, shape: [a0, a1, nv]};
    } else binding.values = {$blob: push(shuffle(Buffer.from(flat.buffer), 8)), type: 'f64', shape: [a0, a1, nv]};
  }
  let offset = 0; data.blobs = blobs.map(b => { const at = offset; offset += b.length; offset += (8 - offset % 8) % 8; return [at, b.length]; });
  const header = Buffer.from(JSON.stringify(data)), head = Buffer.alloc(8); head.write('IKR1', 0, 'latin1'); head.writeUInt32LE(header.length, 4);
  const pad = n => Buffer.alloc((8 - n % 8) % 8);
  const parts = [head, header, pad(8 + header.length)];
  blobs.forEach((b, i) => { parts.push(b, pad(b.length)); });
  const raw = Buffer.concat(parts);
  verify(raw, source, file);
  return zlib.gzipSync(raw, {level: 9});
}

/* Decode the container the way static/js/stage.js does and compare with the source, value by value. */
function verify(raw, source, file) {
  const headerLength = raw.readUInt32LE(4), data = JSON.parse(raw.subarray(8, 8 + headerLength).toString());
  const base = 8 + headerLength + (8 - (8 + headerLength) % 8) % 8, blob = i => raw.subarray(base + data.blobs[i][0], base + data.blobs[i][0] + data.blobs[i][1]);
  data.textures.forEach((t, i) => { if (!blob(t.$blob).equals(Buffer.from(source.textures[i], 'base64'))) throw Error(`${file}: texture ${i} differs`); });
  data.puppet.param.forEach((param, pi) => param.bindings.forEach((binding, bi) => {
    const v = binding.values; if (!v?.type) return;
    const flat = decodeValues(blob(v.$blob), v), S = source.puppet.param[pi].bindings[bi].values, [a0, a1, nv] = v.shape;
    let k = 0;
    for (let i = 0; i < a0; i++) for (let j = 0; j < a1; j++) for (let n = 0; n < nv; n++) for (let c = 0; c < 2; c++) if (flat[k++] !== S[i][j][n][c]) throw Error(`${file}: ${param.name} value differs`);
  }));
}
function decodeValues(bytes, v) {
  const size = v.type === 'f64' ? 8 : 4, n = bytes.length / size, plain = new Uint8Array(bytes.length);
  for (let p = 0; p < size; p++) for (let i = 0; i < n; i++) plain[i * size + p] = bytes[p * n + i];
  if (v.type === 'f64') return new Float64Array(plain.buffer);
  const ints = new Int32Array(plain.buffer), stride = v.shape[2] * 2, s = 10 ** v.places, out = new Float64Array(ints.length);
  for (let k = stride; k < ints.length; k++) ints[k] += ints[k - stride];
  for (let k = 0; k < ints.length; k++) out[k] = ints[k] / s;
  return out;
}

const files = process.argv.slice(2);
if (!files.length) throw Error('Usage: node tools/rigs/toBinary.mjs preview.json.gz ...');
let before = 0, after = 0;
for (const file of files) {
  const out = encode(file), target = file.replace(/\.json\.gz$/, '.ikr');
  fs.writeFileSync(target, out);
  const a = fs.statSync(file).size; before += a; after += out.length;
  console.log(`${file.split('/').pop().padEnd(40)} ${(a / 1e6).toFixed(2)} MB -> ${(out.length / 1e6).toFixed(2)} MB`);
}
console.log(`total ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB (verified lossless)`);
