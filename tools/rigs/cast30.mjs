// Build lab/data/cast.json as the 30 example avatars of the Inkinesis studio, in its order and with
// its labels. Rigs, card images and full illustrations are looked up by slug in lab/.
import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path';
// INKINESIS_DIR: a checkout of the Inkinesis repository (the studio catalog lives in example-avatars/).
const R = process.env.INKINESIS_DIR, W = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
if (!R) throw Error('Usage: INKINESIS_DIR=/path/to/inkinesis node tools/rigs/cast30.mjs [cast-source-dir]');
const D = process.argv[2] ? path.resolve(process.argv[2]) : W;   // where lab/ lives (defaults to this repository)
const studio = JSON.parse(fs.readFileSync(path.join(R, 'example-avatars/catalog.json'), 'utf8'));
const entries = Array.isArray(studio) ? studio : Object.values(studio).find(Array.isArray);
const old = JSON.parse(fs.readFileSync(path.join(D, 'lab/data/cast.json'), 'utf8'));
const held = fs.readFileSync(path.join(W, 'static/js/ainime-held.js'), 'utf8');
const HELD = Object.fromEntries([...held.matchAll(/'([\w-]+)': \{name: '([^']+)', props: '([^']+)'/g)].map(m => [m[1], m[3]]));
const rigs = fs.readdirSync(path.join(D, 'lab/rigs')).filter(f => f.endsWith('.json.gz'));
const slug = id => id.replace(/^\d+-/, '');
const out = [];
for (const e of entries) {
  const s = slug(e.id);
  const rigFile = rigs.find(f => slug(f.replace('.json.gz', '')) === s);
  if (!rigFile) throw Error('no rig for ' + e.id);
  const id = rigFile.replace('.json.gz', '');
  const rigPath = path.join(D, 'lab/rigs', rigFile);
  const puppet = JSON.parse(zlib.gunzipSync(fs.readFileSync(rigPath))).puppet;
  const caps = puppet.meta.motionCapabilities?.chains ?? {};
  const live = n => caps[n]?.mode && caps[n].mode !== 'fixed' && puppet.param.some(p => p.name === n && p.bindings.length);
  const parts = []; const walk = n => { if (n.type === 'Part') parts.push(n.name); (n.children ?? []).forEach(walk); }; walk(puppet.nodes);
  const holds = parts.some(n => /^(objects|prop)/.test(n));
  const text = old.find(o => slug(o.id) === s);   // prompts and excerpts carry over from the existing cast.json
  if (!text) throw Error('no prompt for ' + e.id);
  for (const f of [`lab/cast/${id}.webp`, `lab/cast-full/${id}.webp`]) if (!fs.existsSync(path.join(D, f))) throw Error('missing ' + f);
  out.push({
    id, name: e.label, studio: e.id, image: `lab/cast/${id}.webp`, full: `lab/cast-full/${id}.webp`, rig: `lab/rigs/${rigFile}`, bytes: fs.statSync(rigPath).size,
    arms: ['Arm L', 'Arm R'].filter(live).length, legs: ['Leg L', 'Leg R'].filter(live).length,
    holds, props: HELD[id] ?? (holds ? 'an object' : null),
    excerpt: text.excerpt, prompt: text.prompt,
    ...(text.downloads ? {downloads: text.downloads} : {}),
  });
}
fs.writeFileSync(path.join(D, 'lab/data/cast.json'), JSON.stringify(out));
console.log(out.length + ' entries'); console.log(out.map(o => `${o.studio} -> ${o.id}  arms ${o.arms} legs ${o.legs} ${o.holds ? 'holds ' + o.props : ''} ${o.downloads ? 'dl' : ''} ${(o.bytes / 1e6).toFixed(1)}MB`).join('\n'));
