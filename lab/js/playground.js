/* 5 + 7 · Playground and the character collection, one section: the catalog feeds the inline
 * viewer. Gallery cards wake up on hover (their rig waves and looks at the pointer, drawn in the
 * same shared scene), re-flow with FLIP animations when filtered, and load into the viewer above
 * when clicked.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {loadPreview, defaults, clampParam, chainAvailable} from './scene.js';
import {calibrate, gazeValues, blinkOpen, showcaseLegs} from './rigmath.js';
import {HELD, heldValues} from '../../static/js/ainime-held.js';
import {CharacterViewer} from './viewer.js';
import {$, $$, reduced, pointer, clamp, lerp, toast, whenNear} from './util.js';


export async function playground(scene) {
  let entries;
  try {
    const response = await fetch('lab/data/cast.json'); if (!response.ok) throw Error('The character catalog could not be loaded.');
    entries = await response.json();
  } catch (error) { $('#gallery-count').textContent = error.message + ' Please reload the page.'; return; }

  // ---------- inline viewer: the catalog's first character opens it; any card replaces it
  const inline = new CharacterViewer($('#inline-viewer'), scene, {toast});
  let selected = entries[0];
  const markLoaded = entry => { for (const [id, card] of cards) card.classList.toggle('loaded', id === entry.id); };
  // Item 9: a pose permalink selects the character and restores the pose.
  const linked = CharacterViewer.parseHash();
  const linkedEntry = linked && entries.find(e => e.id === linked.pose);
  if (linkedEntry) {
    selected = linkedEntry; inline.applyPose(linked); inline.load(selected);
    setTimeout(() => { markLoaded(selected); $('#playground').scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'start'}); }, 300);
  } else whenNear($('#inline-viewer'), () => { inline.load(selected); markLoaded(selected); }, '300px');

  // ---------- gallery
  const grid = $('#character-grid'), cards = new Map();
  if (linkedEntry) markLoaded(selected);
  let filter = 'all', query = '', expanded = false;
  $('[data-total]').textContent = String(entries.length);
  const cardFor = entry => {
    if (cards.has(entry.id)) return cards.get(entry.id);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'character-card'; b.setAttribute('aria-label', `Load ${entry.name} into the viewer: animate the rig and read its prompt`);
    const motion = entry.props ? `${entry.props[0].toUpperCase()}${entry.props.slice(1)} in hand` : entry.legs ? 'Arms, legs & expression' : 'Arms & expression';
    b.innerHTML = `<span class="card-frame"><img alt="" loading="lazy" width="260" height="350"><span class="card-view"></span><span class="card-loaded">in the viewer ↑</span><span class="card-wake">live</span></span><span class="card-name"></span><span class="card-motion">${motion}</span>`;
    b.querySelector('img').src = entry.image; b.querySelector('img').alt = `${entry.name} original illustration`;
    b.querySelector('.card-name').textContent = entry.name;
    b.addEventListener('click', () => {
      // On touch, the first tap wakes the rig; the second opens it.
      if (b.classList.contains('touch-woke') && !b.dataset.secondTap) { b.dataset.secondTap = '1'; return; }
      delete b.dataset.secondTap; if (entry.id === selected.id && inline.asset) { $('#inline-viewer').scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'center'}); return; } open(entry, b);
    });
    if (scene.ok && !reduced) wake(b, entry);
    cards.set(entry.id, b);
    return b;
  };

  function render() {
    const matched = entries.filter(e => (filter === 'all' || filter === 'full' && e.arms === 2 && e.legs === 2 || filter === 'holds' && e.holds) && (!query || (e.name + ' ' + e.prompt).toLowerCase().includes(query)));
    const visible = expanded || query || filter !== 'all' ? matched : matched.slice(0, 15);
    // FLIP: remember where every card was, re-flow, then animate from there.
    const before = new Map([...grid.children].map(el => [el, el.getBoundingClientRect()]));
    const next = visible.map(cardFor);
    grid.replaceChildren(...next);
    if (!reduced) for (const el of next) {
      const was = before.get(el), now = el.getBoundingClientRect();
      if (was) { const dx = was.left - now.left, dy = was.top - now.top; if (dx || dy) el.animate([{transform: `translate(${dx}px,${dy}px)`}, {transform: 'none'}], {duration: 520, easing: 'cubic-bezier(.2,.7,.1,1)'}); }
      else el.animate([{opacity: 0, transform: 'translateY(16px) scale(.96)'}, {opacity: 1, transform: 'none'}], {duration: 420, delay: 40 + 25 * next.indexOf(el) % 300, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'backwards'});
    }
    $('#gallery-count').textContent = `${visible.length} of ${matched.length} characters${query ? ' match your search' : ''}`;
    $('#show-all').hidden = visible.length === matched.length; $('#no-characters').hidden = matched.length > 0;
  }
  $$('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter; $$('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); }));
  $('#character-search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); render(); });
  $('#show-all').addEventListener('click', () => { expanded = true; render(); });
  render();

  async function open(entry, card, pose = null) {
    card.classList.remove('touch-woke'); delete card.dataset.secondTap;
    selected = entry; markLoaded(entry);
    inline.setPlaying(false);
    if (pose) inline.applyPose(pose);
    const load = inline.load(entry);
    $('#inline-viewer').scrollIntoView({behavior: reduced ? 'auto' : 'smooth', block: 'center'});
    await load;
    if (inline.entry === entry && inline.asset && inline.mode === 'source') inline.setMode('rig');
  }

  /* Hover wake: the card's own rig fades in over its illustration and waves. */
  function wake(card, entry) {
    const host = card.querySelector('.card-view');
    let timer = 0, state = null;
    card.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (state) { state.leaving = false; return; }
        card.classList.add('loading');
        const s = state = {leaving: false, t0: 0, view: null, rig: null};
        try {
          const asset = await loadPreview(entry.rig);
          if (state !== s) return;
          s.view = scene.view(host, {update: (t, dt) => step(s, t, dt)});
          s.rig = await s.view.add(asset, {height: 1, y: .5, opacity: 0});
          s.cal = calibrate(asset); s.base = defaults(asset); s.gaze = [0, 0];
          s.arm = ['Arm R', 'Arm L'].find(n => chainAvailable(asset, n));
          card.classList.remove('loading'); card.classList.add('awake');
        } catch { card.classList.remove('loading'); state = null; }
      }, 140);
    });
    card.addEventListener('pointerleave', () => { clearTimeout(timer); if (state) state.leaving = true; card.classList.remove('awake', 'loading'); });
    // Touch: a tap wakes the rig for a few seconds; a second tap opens the viewer.
    let sleep = 0;
    card.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      clearTimeout(sleep);
      if (!card.classList.contains('touch-woke')) { delete card.dataset.secondTap; card.classList.add('touch-woke'); card.dispatchEvent(new PointerEvent('pointerenter', {pointerType: 'mouse'})); }
      sleep = setTimeout(() => { card.classList.remove('touch-woke'); delete card.dataset.secondTap; card.dispatchEvent(new PointerEvent('pointerleave')); }, 3200);
    }, {passive: true});
    function step(s, t, dt) {
      const {rig} = s; if (!rig) return;
      s.t0 ||= t;
      rig.opacity = clamp(rig.opacity + (s.leaving ? -dt * 5 : dt * 4));
      if (s.leaving && rig.opacity <= 0) { s.view.destroy(); if (state === s) state = null; return; }
      const local = t - s.t0, r = s.view.rect, values = {...s.base}, up = clamp(local / .5);
      // Every limb wakes: an arm without a task rises gently, a held arm rises to the teaser pose, a
      // free-handed rig waves one arm, and the legs step one after the other (the original showcase timing).
      const gentle = up * (.75 + .25 * Math.sin(local * 3));
      for (const name of ['Arm L', 'Arm R']) { if (!chainAvailable(rig.asset, name)) continue; const side = name.endsWith('L') ? -1 : 1, v = clampParam(rig.asset, name, [side * 24 * gentle, side * 20 * gentle]); if (v) values[name] = v; }
      if (HELD[entry.id]) Object.assign(values, heldValues(rig, entry.id, clamp(local / .6) * (.75 + .25 * Math.sin(local * 3))));
      else if (s.arm) {
        const side = s.arm.endsWith('L') ? -1 : 1;
        values[s.arm] = clampParam(rig.asset, s.arm, [side * 30 * up, side * (28 + 22 * Math.sin(local * 9)) * up]);
      }
      Object.assign(values, showcaseLegs(rig.asset, local));
      const [fx, fy] = s.view.project(rig, s.cal.face[0], s.cal.face[1]);
      const gx = clamp((pointer.x - r.left - fx) / (r.width * .6), -1, 1), gy = clamp((pointer.y - r.top - fy) / r.height, -1, 1);
      s.gaze = [lerp(s.gaze[0], gx, .15), lerp(s.gaze[1], gy, .15)];
      Object.assign(values, gazeValues(rig.asset, s.cal, s.gaze[0], s.gaze[1]));
      const open = blinkOpen(local - .55);
      if (s.cal.blink && open < 1) { values.ParamEyeLOpen = [open]; values.ParamEyeROpen = [open]; }
      rig.values = values;
    }
  }
}
