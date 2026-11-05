/** Per-vertex official-Core comparison for one rig: the same requests and the same strict source
 * parity as reference/cubism/runCombinedCapture.ts, but every vertex keeps its own maximum
 * |Core - evaluator| over all poses instead of only the rig maximum. No pictures. */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
// Run from a checkout of the Inkinesis repository (the import below is its player source): copy this file
// next to reference/cubism/runCombinedCapture.ts there, or adjust the path.
import { readCombined, evaluateCombined } from '../../player/src/combinedRuntime';
const [input, output, outFile] = process.argv.slice(2);
if (!input || !output || !outFile) throw new Error('Usage: perVertex source.inp export-directory out.json.gz');
const out = resolve(output), model = resolve(out, 'model');
const report = JSON.parse(readFileSync(resolve(out, 'export.json'), 'utf8')) as {sourceSha256: string; parameters: {id: string; source: string; axis: number; min: number; max: number; default: number}[]};
const bytes = readFileSync(input), asset = readCombined(bytes);
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
if (hash(bytes) !== report.sourceSha256) throw new Error('Source hash mismatch');
const requests: {label: string; values: Record<string, number>}[] = [{label: 'rest', values: {}}];
for (const p of asset.puppet.param) {
  const mapping = report.parameters.filter(a => a.source === p.name);
  for (const x of p.axis_points[0]) for (const y of p.axis_points[1]) {
    const key = [x, y]; requests.push({label: p.name + ' keys ' + key.join(','), values: Object.fromEntries(mapping.map(a => [a.id, p.min[a.axis] + key[a.axis] * (p.max[a.axis] - p.min[a.axis])]))});
  }
}
for (const p of report.parameters) for (const value of [p.min, p.max]) requests.push({label: p.id + (value === p.min ? ' min' : ' max'), values: {[p.id]: value}});
let seed = 7123; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
for (let i = 0; i < 64; i++) requests.push({label: `mixed-${i}`, values: Object.fromEntries(report.parameters.map(p => [p.id, p.min + random() * (p.max - p.min)]))});
process.env.CUBISM_REFERENCE_MODEL = model; process.env.CUBISM_REFERENCE_PORT = '5193';
const server = await createServer({configFile: resolve('reference/cubism/vite.config.ts')});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen(); browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 256, height: 256}});
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5193/?size=256');
  await page.waitForFunction(() => (window as any).referenceHarness || (window as any).referenceError);
  const core = await page.evaluate(async requests => {
    const w = window as any; if (w.referenceError) throw new Error(w.referenceError);
    const m = await (await fetch('/model-manifest')).json(); const url = new URL(m.url, location.href);
    const manifest = await (await fetch(url)).json();
    const bytes = await (await fetch(new URL(manifest.FileReferences.Moc, url))).arrayBuffer();
    const L = w.Live2DCubismCore; const moc = L.Moc.fromArrayBuffer(bytes); if (!moc) throw new Error('Core rejected MOC');
    const model = L.Model.fromMoc(moc); if (!model) throw new Error('Core rejected model');
    const frames = requests.map((request: any) => {
      model.parameters.values.set(model.parameters.defaultValues);
      for (const [id, value] of Object.entries(request.values)) { const i = model.parameters.ids.indexOf(id); if (i < 0) throw new Error('Missing ' + id); model.parameters.values[i] = value; }
      model.update();
      return model.drawables.ids.map((id: string, i: number) => ({id, xy: Array.from(model.drawables.vertexPositions[i]) as number[]}));
    });
    const result = {frames, ids: model.drawables.ids as string[], canvas: {ppu: model.canvasinfo.PixelsPerUnit}};
    model.release(); moc._release(); return result;
  }, requests);
  if (errors.length) throw new Error(errors.join('; '));
  const ppu = core.canvas.ppu;
  const perPart = asset.parts.map(p => ({uuid: p.uuid, name: p.name, max: new Float64Array(p.mesh!.verts.length / 2)}));
  let rigMax = 0;
  for (let f = 0; f < requests.length; f++) {
    const values: Record<string, number[]> = {};
    for (const p of asset.puppet.param) values[p.name] = [...p.defaults];
    for (const p of report.parameters) if (requests[f].values[p.id] !== undefined) values[p.source][p.axis] = requests[f].values[p.id];
    const expected = evaluateCombined(asset, values);
    for (let k = 0; k < asset.parts.length; k++) {
      const p = expected[k], actual = core.frames[f].find((d: any) => d.id === `ArtMesh${asset.parts[k].uuid}`);
      if (!actual || actual.xy.length !== p.xy.length) throw new Error('Missing or changed topology');
      const acc = perPart[k].max;
      for (let v = 0; v < acc.length; v++) {
        const dx = Math.abs(p.xy[v * 2] - actual.xy[v * 2] * ppu), dy = Math.abs(p.xy[v * 2 + 1] + actual.xy[v * 2 + 1] * ppu);
        const d = Math.max(dx, dy); if (d > acc[v]) acc[v] = d; if (d > rigMax) rigMax = d;
      }
    }
  }
  const UNIT = 1e-8;   // stored as integers in units of 1e-8 px
  const data = {schema: 'inkinesis-core-vertex-max-v1', rig: input.split('/').slice(-3).join('/'), sourceSha256: report.sourceSha256, frames: requests.length, tolerancePx: .005, unitPx: UNIT, rigMaxPx: rigMax,
    scope: 'Per-vertex maximum over the request set of |official Cubism Core position - source evaluator position| (strict source values), in source pixels. Same request set as reference/cubism/runCombinedCapture.ts without near-keys.',
    parts: perPart.map(p => ({uuid: p.uuid, name: p.name, max: Array.from(p.max, v => Math.round(v / UNIT))}))};
  writeFileSync(outFile, gzipSync(Buffer.from(JSON.stringify(data)), {level: 9}));
  console.log(JSON.stringify({frames: requests.length, rigMaxPx: rigMax, parts: perPart.length, vertices: perPart.reduce((n, p) => n + p.max.length, 0)}));
} finally { await browser?.close(); await server.close(); }
