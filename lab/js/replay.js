/* 8 · Prompt-to-rig replay for Ember Forge Smith. Everything shown is recorded: the prompt text
 * of the run, its saved illustration, and the delivered rig (whose own parts are the layers that
 * separate). Nothing is generated in the browser. Item 6 adds a hand-authored link between words
 * of this one prompt and the parts of this one rig: as a word lights up, the parts it names tint.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {loadPreview, defaults, chainsOf, centroid} from './scene.js';
import {layerModel, explode, syncLabels} from './layers.js';
import {heldValues} from '../../static/js/ainime-held.js';
import {calibrate, gazeValues, blinkOpen, showcaseLegs} from './rigmath.js';
import {$, $$, reduced, pointer, clamp, lerp, ease, easeOutBack, heldRig, watchVisible} from './util.js';

const ID = '16-ember-forge-smith';
const T = {bar: .5, card: 1.1, typeEnd: 5.6, sent: 5.8, illus: 6.1, illusEnd: 7.4, rig: 7.6, rigEnd: 8.3, link: 8.6, linkEnd: 13.2, apart: 13.4, apartEnd: 15.0, together: 15.9, togetherEnd: 16.7, alive: 16.9, badge: 17.6, end: 18.6};
const STEPS = [0, T.sent, T.rigEnd, T.togetherEnd];
/* Words of the recorded prompt and the delivered parts they describe. Authored by hand for this
 * run only; the mapping is read against the rig's own part names. */
const COLORS = {teal: [.12, .66, .6], gold: [.88, .6, .24], violet: [.58, .42, .85], rose: [.99, .03, .3]};
const LINKS = [
  ['bronze skin', 'teal', n => /^(arm-[lr]|face|neck|ears-[lr])$/.test(n)],
  ['hair', 'violet', n => /hair/.test(n)],
  ['bandana', 'gold', n => /^headwear/.test(n)],
  ['eyes', 'teal', n => /^(eyewhite|irides|eyelash|eye_close|eyebrow)/.test(n)],
  ['apron', 'gold', n => n === 'topwear'],
  ['trousers', 'violet', n => /^legwear/.test(n)],
  ['boots', 'gold', n => /^footwear/.test(n)],
  ['hammer', 'rose', n => /^(objects|prop).*:r$/.test(n)],
  ['tongs', 'teal', n => /^(objects|prop).*:l$/.test(n)],
];

export async function replay(scene) {
  const section = $('#replay'), shell = $('.prompt-shell', section), text = $('.prompt-text', section);
  const viewEl = $('#replay-view'), img = $('.replay-illustration', section), labels = $('.replay-labels', section), badge = $('.replay-badge', section);
  const steps = $$('.replay-steps li', section), track = $('.replay-progress', section), bar = $('i', track), linkNote = $('.link-note', section);
  const [excerpt, full] = await Promise.all(['lab/data/ember-excerpt.txt', 'lab/data/ember-prompt.txt'].map(u => fetch(u).then(r => r.text())));
  $('#prompt-full').textContent = full;
  $('[data-open-prompt]', section).addEventListener('click', () => $('#prompt-dialog').showModal());
  const words = excerpt.trim();
  // Keyword ranges inside the excerpt, in prompt order.
  const keys = LINKS.map(([word, color, test]) => { const at = words.indexOf(word); return at >= 0 ? {word, color, test, at, end: at + word.length} : null; }).filter(Boolean).sort((a, b) => a.at - b.at);
  // The first sentence is typed at reading speed; the rest of the excerpt streams.
  const slow = words.indexOf('. ') + 1 || 200;
  const typed = t => { const s = t - T.card, a = slow / 80; if (s <= 0) return 0; if (s < a) return Math.floor(s * 80); return Math.min(words.length, slow + Math.floor((s - a) / (T.typeEnd - T.card - a) * (words.length - slow))); };
  const esc = s => s.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
  const renderTyped = (n, lit) => {
    let html = '', pos = 0;
    for (const k of keys) {
      if (k.end > n) break;
      html += esc(words.slice(pos, k.at)) + `<mark class="pk ${k.color}${lit === k ? ' lit' : ''}">${esc(k.word)}</mark>`; pos = k.end;
    }
    return html + esc(words.slice(pos, n));
  };

  let figure = null, t = reduced ? T.end : 0, playing = false, started = false, rig = null, view = null, cal = null, base = null, model = null, lastN = -1, lastLit = null;
  const setT = value => { t = value; playing = !reduced; };
  steps.forEach((li, k) => li.querySelector('button').addEventListener('click', () => { started = true; setT(STEPS[k]); }));
  $('#replay-restart').addEventListener('click', () => { started = true; setT(0); });
  // Pause and resume the replay wherever it is.
  const pauseButton = $('#replay-pause');
  const syncPause = () => { pauseButton.setAttribute('aria-pressed', String(!playing)); pauseButton.innerHTML = playing ? 'Pause <span aria-hidden="true">Ⅱ</span>' : 'Play <span aria-hidden="true">▶</span>'; };
  pauseButton.addEventListener('click', () => { started = true; if (!playing && t >= T.end) t = 0; playing = !playing; syncPause(); });
  watchVisible(section.querySelector('.replay-stage'), v => { if (v && !started) { started = true; playing = !reduced; } }, .15);
  // Scrub: dragging the progress bar holds the replay at the pointer and resumes it on release.
  let scrub = null;
  const seek = clientX => { const r = track.getBoundingClientRect(); t = clamp((clientX - r.left) / r.width) * T.end; };
  track.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    started = true; scrub = {resume: playing}; playing = false;
    track.setPointerCapture(e.pointerId); track.classList.add('is-scrubbing'); seek(e.clientX); e.preventDefault();
  });
  track.addEventListener('pointermove', e => { if (scrub) seek(e.clientX); });
  const endScrub = () => { if (!scrub) return; playing = scrub.resume && t < T.end; scrub = null; track.classList.remove('is-scrubbing'); };
  track.addEventListener('pointerup', endScrub); track.addEventListener('pointercancel', endScrub);
  track.addEventListener('keydown', e => {
    const now = Math.min(t, T.end), step = e.shiftKey ? 2 : .5;
    const to = {ArrowLeft: now - step, ArrowDown: now - step, ArrowRight: now + step, ArrowUp: now + step, Home: 0, End: T.end}[e.key];
    if (to === undefined) return;
    e.preventDefault(); started = true; playing = false; t = clamp(to, 0, T.end);
  });
  track.setAttribute('aria-valuemax', String(T.end));

  let parts = [], linkLabel = null, lastPlaying = null;
  if (scene.ok) {
    const asset = await loadPreview(heldRig(ID));
    view = scene.view(viewEl, {update});
    rig = await view.add(asset, {fit: .94, opacity: 0});
    cal = calibrate(asset); base = defaults(asset);
    model = layerModel(asset);
    parts = asset.parts.map(p => p.name);
    $('span', badge).textContent = `${asset.parts.length} layers · ${chainsOf(asset).length} limb chains · 0 manual edits`;
    alignIllustration(asset);
    viewEl.classList.add('is-live');
    linkLabel = document.createElement('span'); linkLabel.className = 'link-label'; labels.append(linkLabel);
  }

  // Place the illustration so its drawn figure covers the rig's rest silhouette.
  function alignIllustration(asset) {
    const probe = new Image(); probe.src = img.src;
    probe.decode().then(() => {
      const c = document.createElement('canvas'), w = 96, h = Math.round(96 * probe.naturalHeight / probe.naturalWidth);
      c.width = w; c.height = h; const g = c.getContext('2d', {willReadFrequently: true}); g.drawImage(probe, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h).data; let y0 = h, y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 40) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      img.dataset.top = String(y0 / h); img.dataset.bottom = String((y1 + 1) / h);
    }).catch(() => {});
  }

  function update(time, dt) {
    if (playing) { t = Math.min(T.end + 60, t + dt); if (t >= T.end + 60) playing = false; }
    if (playing !== lastPlaying) { lastPlaying = playing; syncPause(); }
    render(time, dt);
  }

  function render(time, dt) {
    // Prompt: dot → bar → card, then typing, then docking.
    shell.dataset.phase = t < T.bar ? 'dot' : t < T.card ? 'bar' : 'card';
    const n = typed(t);
    // Word-to-layer link phase: each keyword lights for its share of the window, in prompt order.
    const linking = t >= T.link && t < T.linkEnd && keys.length;
    const lit = linking ? keys[Math.min(keys.length - 1, Math.floor((t - T.link) / (T.linkEnd - T.link) * keys.length))] : null;
    if (n !== lastN || lit !== lastLit) {
      text.innerHTML = renderTyped(n, lit); lastN = n; lastLit = lit;
      const mark = text.querySelector('mark.lit'); if (mark) text.scrollTop = Math.max(0, mark.offsetTop - text.clientHeight / 2 + 8);
    }
    shell.classList.toggle('sent', t >= T.sent);
    shell.classList.toggle('docked', t >= T.illus && !linking);
    shell.classList.toggle('linking', Boolean(linking));
    if (linkNote) linkNote.classList.toggle('on', Boolean(linking));
    // Illustration develops from the centre, then hands over to the live rig.
    const reveal = ease((t - T.illus) / (T.illusEnd - T.illus)), handover = ease((t - T.rig) / (T.rigEnd - T.rig));
    img.style.opacity = String(reveal * (1 - handover));
    img.style.setProperty('--reveal', (reveal * 80) + '%');
    img.style.filter = `blur(${(1 - reveal) * 18}px) saturate(${.6 + .4 * reveal}) brightness(${1.4 - .4 * reveal})`;
    if (rig && !figure && rig.lastPosed) {
      let y0 = Infinity, y1 = -Infinity;
      rig.lastPosed.forEach(p => { if (!p.enabled || p.opacity <= 0) return; for (let k = 1; k < p.xy.length; k += 2) { y0 = Math.min(y0, p.xy[k]); y1 = Math.max(y1, p.xy[k]); } });
      figure = [y0, y1];
    }
    if (figure && img.dataset.top && view.rect.height) {
      // Match the illustration's drawn figure to the rig's rest silhouette.
      const [, top] = view.project(rig, 0, figure[0]), [, bottom] = view.project(rig, 0, figure[1]);
      const frac = Number(img.dataset.bottom) - Number(img.dataset.top), height = (bottom - top) / frac;
      img.style.height = height + 'px';
      img.style.top = (top - Number(img.dataset.top) * height + height / 2) + 'px';
    }
    // Steps and progress.
    const step = t < STEPS[1] ? 0 : t < STEPS[2] ? 1 : t < STEPS[3] ? 2 : 3;
    steps.forEach((li, k) => { li.classList.toggle('on', k === step); li.classList.toggle('done', k < step); });
    bar.style.width = (clamp(t / T.end) * 100) + '%';
    const at = Math.min(t, T.end).toFixed(1);
    if (track.getAttribute('aria-valuenow') !== at) { track.setAttribute('aria-valuenow', at); track.setAttribute('aria-valuetext', `${steps[step].querySelector('button').lastChild.textContent} · ${at} s`); }
    if (!rig) return;
    rig.opacity = handover;
    // Link phase: the named parts tint, the rest dims, and a label sits on their centroid.
    if (lit) {
      const rgb = COLORS[lit.color], k = ease(((t - T.link) % ((T.linkEnd - T.link) / keys.length)) / .25);
      rig.tint = (part, i) => lit.test(parts[i]) ? [...rgb, .72 * k] : null;
      rig.dim = .42 * k;
      const c = rig.lastPosed ? centroid(rig.lastPosed, rig.asset, name => lit.test(name)) : null;
      if (c && linkLabel) { const [x, y] = view.project(rig, c[0], c[1]); linkLabel.textContent = lit.word; linkLabel.className = `link-label on ${lit.color}`; linkLabel.style.left = x + 'px'; linkLabel.style.top = (y - 22) + 'px'; }
    } else { rig.tint = null; rig.dim = 0; if (linkLabel) linkLabel.classList.remove('on'); }
    // Layers: the rig's own parts glide into a labelled grid and back.
    const apart = ease((t - T.apart) / (T.apartEnd - T.apart)) * (1 - ease((t - T.together) / (T.togetherEnd - T.together)));
    const r = view.rect;
    syncLabels(labels.querySelector('.replay-layer-labels') ?? (() => { const d = document.createElement('div'); d.className = 'replay-layer-labels'; labels.append(d); return d; })(), explode(view, rig, model, apart, {tilt: pointer.gaze ? clamp((pointer.x - r.left) / r.width * 2 - 1, -1, 1) : 0}));
    // Alive: held arms rise, eyes blink and follow the pointer.
    const alive = t >= T.alive, raise = alive ? easeOutBack((t - T.alive) / 1.1) * (.78 + .22 * Math.sin((t - T.alive) * 1.3)) : 0;
    let gx = 0, gy = .1;
    if (alive && pointer.gaze && performance.now() - pointer.moved < 4000) {
      const [fx, fy] = view.project(rig, cal.face[0], cal.face[1]);
      gx = clamp((pointer.x - r.left - fx) / (r.width * .4), -1, 1); gy = clamp((pointer.y - r.top - fy) / (r.height * .6), -1, 1);
    } else if (alive) { gx = .4 * Math.sin(t * .5); gy = .1; }
    rig.gaze = rig.gaze ? [lerp(rig.gaze[0], gx, .08), lerp(rig.gaze[1], gy, .08)] : [gx, gy];
    const open = alive ? blinkOpen((t - T.alive) % 3.7 - 1.2) : 1;
    rig.values = {...base, ...heldValues(rig, ID, clamp(raise, 0, 1)), ...(alive && !reduced ? showcaseLegs(rig.asset, t - T.alive) : {}), ...(alive ? gazeValues(rig.asset, cal, rig.gaze[0], rig.gaze[1]) : {})};
    if (cal.blink && open < 1) { rig.values.ParamEyeLOpen = [open]; rig.values.ParamEyeROpen = [open]; }
    badge.classList.toggle('on', t >= T.badge);
  }
  if (!scene.ok) { // Without WebGL the replay still runs its prompt and illustration beats.
    const tick = now => { if (playing) t = Math.min(T.rig, t + 1 / 60); render(0, 1 / 60); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
}
