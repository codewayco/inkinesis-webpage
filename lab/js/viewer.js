/* Character viewer on the shared scene, with an x-ray lens: hover the character to see the posed
 * mesh and the limb that owns every part, filled from the rig's own chain lists.
 * Controls, bounds and the showcase motion are those of the published viewer.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {activeParameter, motionProfile, garmentSwayValue} from '../../static/js/motion.js';
import {recipeFor, showcaseValues} from '../../static/js/rig-engine.js';
import {loadPreview, defaults, strokeMesh, fillOwners} from './scene.js';
import {blinkOpen} from './rigmath.js';
import {copyText, fillRange, overlay2d, clamp, lerp} from './util.js';

const CONTROLS = [['yaw', 'Turn', 'Head Angles', 0, -20, 20, '°'], ['pitch', 'Nod', 'Head Angles', 1, -10, 10, '°'], ['roll', 'Tilt', 'ParamAngleZ', 0, -10, 10, '°'], ['mouth', 'Mouth', 'ParamMouthOpenY', 0, 0, .65, ''],
  ['shoulder', 'Shoulder', 'Arm', 0, -16, 16, '°'], ['elbow', 'Elbow', 'Arm', 1, -30, 30, '°'], ['hip', 'Hip', 'Leg', 0, -18, 18, '°'], ['knee', 'Knee', 'Leg', 1, 0, 45, '°'], ['sway', 'Sway', 'ParamGarmentSway', 0, -1, 1, '']];
const BODY = new Set(['shoulder', 'elbow', 'hip', 'knee', 'sway']);
let serial = 0;

export class CharacterViewer {
  constructor(root, scene, {toast = () => {}} = {}) {
    this.root = root; this.scene = scene; this.toast = toast; this.key = 'lv' + (++serial);
    this.side = 'L'; this.values = {}; this.playing = false; this.token = 0; this.mode = 'rig'; this.lens = {x: 0, y: 0, r: 0, on: false};
    root.innerHTML = `<div class="viewer-scene"><div class="scene-top"><span class="scene-tag"><span class="status-dot"></span><span data-scene-label>LIVE RIG</span></span><div class="view-toggle" role="group" aria-label="Source image, interactive rig, or mesh"><button type="button" data-view="source" aria-pressed="false">Illustration</button><button type="button" data-view="rig" aria-pressed="true">Rig</button><button type="button" data-view="mesh" aria-pressed="false">Mesh</button></div></div><div class="viewer-slot"></div><canvas class="mesh-overlay" aria-hidden="true"></canvas><canvas class="lens-overlay" aria-hidden="true"></canvas><img class="source-preview" alt="" hidden><div class="scene-loader" role="status"><span class="spinner"></span><span data-loading-text>Choose a character to begin.</span></div><span class="lens-hint" aria-hidden="true">X-ray lens: hover</span><span data-scene-name hidden></span><span data-scene-state hidden></span></div><div class="viewer-controls"><h3 class="viewer-title"></h3><div class="viewer-actions"><button class="btn primary" data-action="animate" aria-pressed="false" disabled>▶ Animate</button><button class="btn secondary" data-action="reset" disabled>↺ Reset</button><button class="btn share" data-action="share" disabled title="Copy a link that reopens this character in exactly this pose">⤴ Share pose</button></div><div class="control-heading"><h4>HEAD &amp; EXPRESSION</h4><button type="button" data-action="blink" disabled>Blink</button></div><div data-head-controls></div><div class="control-heading"><h4 data-body-heading>ARMS &amp; LEGS</h4><div class="side-selector" role="group" aria-label="Choose anatomical side"><button type="button" data-side="L" aria-pressed="true">Left</button><button type="button" data-side="R" aria-pressed="false">Right</button></div></div><div data-body-controls></div><p class="control-note" role="status"></p><div class="viewer-downloads"><span>Original files</span><a data-download="inp" target="_blank" rel="noopener">Inochi2D ↗</a><a data-download="zip" target="_blank" rel="noopener">Live2D ↗</a></div></div><details class="prompt-details"><summary><span>THE ORIGINAL PROMPT</span><span class="prompt-preview"></span><span aria-hidden="true">+</span></summary><p class="prompt-full"></p><button type="button" class="copy-prompt" data-action="copy">Copy full prompt ⧉</button></details>`;
    const q = s => root.querySelector(s);
    this.sceneEl = q('.viewer-scene'); this.slot = q('.viewer-slot'); this.loader = q('.scene-loader'); this.preview = q('.source-preview');
    this.mesh = overlay2d(q('.mesh-overlay')); this.lensLayer = overlay2d(q('.lens-overlay'));
    this.inputs = new Map();
    for (const [id, label, , axis, , , unit] of CONTROLS) {
      const row = document.createElement('label'); row.className = 'control-row'; row.htmlFor = `${this.key}-${id}`;
      row.innerHTML = `<span>${label}</span><input id="${this.key}-${id}" type="range" step="any" value="0" disabled><output for="${this.key}-${id}">0${unit}</output>`;
      q(BODY.has(id) ? '[data-body-controls]' : '[data-head-controls]').append(row);
      const input = row.querySelector('input'), fill = fillRange(input);
      this.inputs.set(id, {input, output: row.querySelector('output'), row, fill});
      input.addEventListener('input', () => { const value = Number(input.value); this.setPlaying(false); if (this.mode === 'source') this.setMode('rig'); const name = this.controlName(id); if (this.values[name]) this.values[name][axis] = value; this.sync(); });
    }
    root.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => { this.side = b.dataset.side; root.querySelectorAll('[data-side]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); this.sync(); }));
    root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => this.setMode(b.dataset.view)));
    q('[data-action="animate"]').addEventListener('click', () => { if (this.mode === 'source') this.setMode('rig'); this.setPlaying(!this.playing); });
    q('[data-action="reset"]').addEventListener('click', () => { this.setPlaying(false); this.values = defaults(this.asset); this.sync(); });
    q('[data-action="blink"]').addEventListener('click', () => { this.blinkAt = performance.now() / 1000; });
    q('[data-action="share"]').addEventListener('click', () => this.share());
    q('[data-action="copy"]').addEventListener('click', async () => { try { await copyText(this.entry.prompt); this.toast('Original prompt copied.'); } catch { this.toast('Select the prompt text to copy it.'); } });
    // The lens follows a fine pointer over the character.
    this.sceneEl.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || this.mode !== 'rig') return;
      const r = this.slot.getBoundingClientRect(); this.lens.x = e.clientX - r.left; this.lens.y = e.clientY - r.top;
      this.lens.on = this.lens.y > -20 && this.lens.y < r.height + 20; this.sceneEl.classList.add('lens-on');
    });
    this.sceneEl.addEventListener('pointerleave', () => { this.lens.on = false; });
    this.view = scene.ok ? scene.view(this.slot, {update: (t, dt) => this.update(t, dt), after: () => this.after()}) : null;
  }

  controlName(id) { const c = CONTROLS.find(c => c[0] === id); return c[2] === 'Arm' || c[2] === 'Leg' ? `${c[2]} ${this.side}` : c[2]; }

  async load(entry) {
    const ticket = ++this.token;
    this.entry = entry; this.setPlaying(false); this.asset = null; this.blinkAt = 0;
    const q = s => this.root.querySelector(s);
    q('[data-loading-text]').textContent = `Loading ${entry.name} · ${(entry.bytes / 1e6).toFixed(1)} MB`; this.loader.hidden = false;
    q('.viewer-title').textContent = entry.name; q('[data-scene-name]').textContent = entry.name;
    // The card thumbnail shows at once; the full 1024×1536 original replaces it once decoded.
    this.preview.src = entry.image; this.preview.alt = `${entry.name} original illustration`;
    if (entry.full) { const full = new Image(); full.src = entry.full; full.decode().then(() => { if (this.entry === entry) this.preview.src = entry.full; }, () => {}); }
    q('.prompt-full').textContent = entry.prompt; q('.prompt-preview').textContent = entry.excerpt;
    const dl = q('.viewer-downloads'); dl.hidden = !entry.downloads; if (entry.downloads) { q('[data-download="inp"]').href = entry.downloads['character.inp']; q('[data-download="zip"]').href = entry.downloads['Live2D.zip']; }
    q('.prompt-details').open = false;
    this.sync();
    if (!this.view) { q('[data-loading-text]').textContent = 'WebGL 2 is required for the live rig. The illustration and original files remain available.'; q('.spinner').hidden = true; this.setMode('source'); return; }
    try {
      const asset = await loadPreview(entry.rig);
      if (ticket !== this.token) return;
      const old = this.rig;
      this.rig = await this.view.add(asset, {fit: .94, opacity: 0});
      if (ticket !== this.token) { this.view.remove(this.rig); return; }
      if (old) this.view.remove(old);
      this.asset = asset; this.recipe = recipeFor(asset.puppet); this.values = defaults(asset); this.loader.hidden = true;
      if (this.pendingPose) { this.applyPose(this.pendingPose); this.pendingPose = null; }
      if (this.mode === 'source') this.setMode('source'); else this.setMode(this.mode);
      this.sync(); this.root.dataset.ready = entry.id;
    } catch (error) {
      if (ticket !== this.token) return;
      q('[data-loading-text]').textContent = (error?.message ?? 'Preview unavailable.') + ' The original files remain available below.'; q('.spinner').hidden = true;
      this.toast('Live preview unavailable. The illustration and original files are still available.');
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.root.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === mode)));
    this.preview.hidden = mode !== 'source';
    if (this.rig) this.rig.visible = mode !== 'source';
    this.root.querySelector('[data-scene-label]').textContent = mode === 'source' ? 'ORIGINAL ILLUSTRATION' : mode === 'mesh' ? 'DEFORMED MESH' : 'LIVE RIG';
  }

  setPlaying(value) {
    if (!value && this.playing && this.lastPose) this.values = structuredClone(this.lastPose);
    this.playing = value; if (value) { this.started = performance.now() / 1000; this.values = defaults(this.asset); }
    const b = this.root.querySelector('[data-action="animate"]'); b.textContent = value ? 'Ⅱ Pause' : '▶ Animate'; b.setAttribute('aria-pressed', String(value));
    this.root.querySelector('[data-scene-state]').textContent = value ? '4-SECOND MOTION STUDY' : 'WEB PREVIEW';
    if (!value) this.sync();
  }

  sync(display = this.values) {
    const puppet = this.asset?.puppet, caps = puppet?.meta.motionCapabilities, profile = motionProfile(puppet), garmentOnly = profile.garmentSway && !profile.arms.length && !profile.legs.length;
    for (const [id, , , axis, safeMin, safeMax, unit] of CONTROLS) {
      const {input, output, row, fill} = this.inputs.get(id), name = this.controlName(id), p = activeParameter(puppet, name);
      const cap = name.startsWith('Arm') || name.startsWith('Leg') ? caps?.chains?.[name] : id === 'sway' ? undefined : id === 'mouth' ? caps?.face?.mouth : (caps?.headAxes?.[id] ?? caps?.face?.head);
      row.hidden = id === 'sway' ? !profile.garmentSway : garmentOnly && ['shoulder', 'elbow', 'hip', 'knee'].includes(id);
      input.disabled = !p || cap?.mode === 'fixed'; row.title = input.disabled ? 'This movement is held still for this character.' : '';
      if (p) { input.min = String(Math.max(p.min[axis], safeMin)); input.max = String(Math.min(p.max[axis], safeMax)); input.value = String(display[name]?.[axis] ?? p.defaults[axis]); }
      output.textContent = input.disabled ? '—' : Number(Number(input.value).toFixed(unit ? 1 : 2)) + unit; fill();
    }
    const ready = Boolean(this.asset), q = s => this.root.querySelector(s);
    q('[data-action="animate"]').disabled = !ready; q('[data-action="reset"]').disabled = !ready; q('[data-action="share"]').disabled = !ready;
    q('[data-action="blink"]').disabled = !ready || caps?.face?.blink?.mode === 'fixed' || !['ParamEyeLOpen', 'ParamEyeROpen'].every(n => puppet.param.some(p => p.name === n && p.bindings.length));
    q('[data-body-heading]').textContent = garmentOnly ? 'GARMENT' : profile.garmentSway ? 'ARMS, LEGS & GARMENT' : 'ARMS & LEGS';
    q('.side-selector').hidden = garmentOnly;
    const names = {'Arm L': 'left arm', 'Arm R': 'right arm', 'Leg L': 'left leg', 'Leg R': 'right leg'}, available = [...profile.arms, ...profile.legs];
    const missing = Object.keys(names).filter(n => !available.includes(n)).map(n => names[n]);
    q('.control-note').textContent = !ready ? 'Preparing the character…' : garmentOnly ? 'Garment sway and facial controls are available. This rig has no independent arm or leg controls.' + (this.entry.swayNote ? ' ' + this.entry.swayNote : '') : missing.length ? 'No independent motion for this design: ' + missing.join(', ') + '.' : 'Both arms and legs are available. Preview angles stay within a gentle range.';
  }

  update(t, dt) {
    if (!this.rig || !this.asset) return;
    this.rig.opacity = Math.min(1, this.rig.opacity + dt * 4);
    let values = this.values;
    const now = performance.now() / 1000;
    if (this.playing) {
      const seconds = now - this.started;
      values = {...defaults(this.asset), ...showcaseValues(this.asset.puppet, this.recipe, seconds)};
      const sway = activeParameter(this.asset.puppet, 'ParamGarmentSway');
      if (sway) values.ParamGarmentSway = [garmentSwayValue(sway, seconds), ...sway.defaults.slice(1)];
      if (Math.floor(t * 4) % 2 === 0) this.sync(values);
    }
    if (this.blinkAt) { const open = blinkOpen(now - this.blinkAt); if (now - this.blinkAt > .4) this.blinkAt = 0; else values = {...values, ParamEyeLOpen: [open], ParamEyeROpen: [open]}; }
    this.lastPose = values; this.rig.values = values;
    this.lens.r = lerp(this.lens.r, this.lens.on && this.mode === 'rig' ? 96 : 0, 1 - Math.exp(-dt * 12));
    this.rig.dim = this.mode === 'mesh' ? .45 : 0;
  }

  after() {
    if (!this.rig?.lastPosed) return;
    const view = this.view;
    let dpr = this.mesh.fit();
    if (this.mode === 'mesh') { const ctx = this.mesh.ctx; ctx.lineWidth = .7 * dpr; ctx.strokeStyle = 'rgba(170,220,255,.6)'; strokeMesh(ctx, view, this.rig, {dpr}); }
    dpr = this.lensLayer.fit();
    const {x, y, r} = this.lens;
    if (r < 1) return;
    const ctx = this.lensLayer.ctx;
    ctx.save(); ctx.beginPath(); ctx.arc(x * dpr, y * dpr, r * dpr, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(9,8,13,.94)'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    fillOwners(ctx, view, this.rig, {dpr, alpha: .8});
    ctx.lineWidth = .6 * dpr; ctx.strokeStyle = 'rgba(255,255,255,.55)'; strokeMesh(ctx, view, this.rig, {dpr});
    ctx.restore();
    ctx.beginPath(); ctx.arc(x * dpr, y * dpr, r * dpr, 0, Math.PI * 2); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.shadowColor = 'rgba(148,112,216,.9)'; ctx.shadowBlur = 18 * dpr; ctx.stroke(); ctx.shadowBlur = 0;
    if (r > 60) {
      ctx.font = `600 ${10 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillText('X-RAY · MESH + OWNERSHIP', x * dpr, (y + r + 18) * dpr);
    }
  }

  /* Item 9: a pose permalink. The hash carries the character, the side and every control that
   * differs from its default; opening the link reloads the same rig in the same pose. */
  poseHash() {
    const parts = [`pose=${this.entry.id}`, `side=${this.side}`];
    for (const [id, , , axis] of CONTROLS) { const name = this.controlName(id), v = this.values[name]?.[axis], d = this.asset.puppet.param.find(p => p.name === name)?.defaults[axis]; if (v != null && d != null && Math.abs(v - d) > 1e-3) parts.push(`${id}=${Number(v.toFixed(2))}`); }
    return '#' + parts.join('&');
  }
  async share() {
    if (!this.asset) return;
    const url = location.origin + location.pathname + this.poseHash();
    history.replaceState(null, '', this.poseHash());
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({title: `Inkinesis · ${this.entry.name}`, text: 'A live Inkinesis rig in this exact pose', url}); return; }
      await copyText(url); this.toast('Pose link copied. It reopens this character in exactly this pose.');
    } catch { this.toast('The link is in the address bar; copy it from there.'); }
  }
  applyPose(pose) {
    if (!this.asset) { this.pendingPose = pose; return; }
    if (pose.side === 'L' || pose.side === 'R') { this.side = pose.side; this.root.querySelectorAll('[data-side]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.side === this.side))); }
    this.setPlaying(false); this.values = defaults(this.asset);
    for (const [id, , , axis] of CONTROLS) {
      if (pose[id] == null) continue;
      const name = this.controlName(id), p = this.asset.puppet.param.find(q => q.name === name); if (!p) continue;
      const v = Math.max(p.min[axis], Math.min(p.max[axis], Number(pose[id])));
      if (!this.values[name]) this.values[name] = [...p.defaults];
      this.values[name][axis] = v;
    }
    if (this.mode === 'source') this.setMode('rig');
    this.sync();
  }
  static parseHash(hash = location.hash) {
    if (!hash.startsWith('#pose=')) return null;
    const out = {};
    for (const kv of hash.slice(1).split('&')) { const [k, v] = kv.split('='); if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? ''); }
    return out.pose ? out : null;
  }

  destroy() { ++this.token; this.view?.destroy(); this.root.replaceChildren(); }
}
