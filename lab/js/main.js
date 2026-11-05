/* Lab entry point: one shared scene, then each section wires itself to it.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {createScene} from './scene.js';
import {$, $$, toast, copyText} from './util.js';

const scene = createScene();
document.documentElement.classList.toggle('no-webgl', !scene.ok);
if (new URLSearchParams(location.search).has('debug')) globalThis.__lab = {scene};

const sections = [
  ['./hero.js', 'hero'],
  ['./evidence.js', 'evidence'],
  ['./replay.js', 'replay'],
  ['./story.js', 'story'],
  ['./compare.js', 'compare'],
  ['./playground.js', 'playground'],
  ['./mirror.js', 'mirror'],
  ['./verify.js', 'verify'],
  ['./limits.js', 'limits'],
  ['./asset.js', 'asset'],
];
for (const [path, name] of sections) {
  import(path).then(m => m[name](scene)).catch(error => console.warn(`[${name}]`, error));
}

/* ---------- page chrome ---------- */
for (const button of $$('[data-close]')) button.addEventListener('click', () => document.getElementById(button.dataset.close).close());
for (const modal of $$('dialog')) modal.addEventListener('click', event => {
  if (event.target !== modal) return;
  const r = modal.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close();
});
$('#copy-citation').addEventListener('click', async () => { try { await copyText($('#citation-code').textContent); toast('Citation copied.'); } catch { toast('Select the citation text to copy it.'); } });

// Recorded films play only while on screen.
for (const video of $$('.film video, .limit-frame video')) {
  new IntersectionObserver(([e]) => { if (!e.isIntersecting) video.pause(); }, {threshold: .2}).observe(video);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) $$('video').forEach(v => { if (v.id !== 'hero-video') v.pause(); }); });

// Navigation highlight.
const links = $$('.site-header nav a[href^="#"]:not(.wordmark)');
const navObserver = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.hash === '#' + e.target.id));
}, {rootMargin: '-35% 0px -55% 0px'});
links.forEach(a => { const s = document.querySelector(a.hash); if (s) navObserver.observe(s); });

// Text reveals (never on elements that contain live views: they must not form stacking contexts).
const reveal = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-revealed'); reveal.unobserve(e.target); } }), {threshold: .12});
$$('.section-head, .two-col, .abstract, .ack, .formats').forEach(el => { el.classList.add('reveal'); reveal.observe(el); });

/* ---------- colour floods between surfaces ---------- */
{
  const sections = $$('main > section');
  const floods = [];
  sections.forEach((s, k) => {
    const prev = sections[k - 1];
    if (!prev || prev.classList.contains('stage') === s.classList.contains('stage')) return;
    const f = document.createElement('div'); f.className = 'flood'; f.setAttribute('aria-hidden', 'true');
    s.prepend(f); floods.push(s);
  });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const vh = innerHeight;
      for (const s of floods) {
        const r = s.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (vh - r.top) / (vh * .6)));
        s.style.setProperty('--flood', reducedMotion ? '0' : String((1 - p * p * (3 - 2 * p)).toFixed(3)));
      }
    });
  };
  addEventListener('scroll', onScroll, {passive: true}); addEventListener('resize', onScroll); onScroll();
}

/* ---------- page-wide x-ray lens; tilt-to-look ---------- */
import('./util.js').then(({pointer, enableTilt, tiltAvailable, tiltNeedsTap}) => {
  const toggle = $('#xray-toggle');
  const setLens = on => { scene.lens.on = on; toggle.setAttribute('aria-pressed', String(on)); document.documentElement.classList.toggle('xray-on', on); };
  if (!scene.ok) toggle.hidden = true;
  toggle.addEventListener('click', () => setLens(!scene.lens.on));
  addEventListener('pointermove', e => { scene.lens.x = e.clientX; scene.lens.y = e.clientY; }, {passive: true});
  // Hold X to peek through the lens anywhere; it lifts when the key does.
  let held = false;
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'x' && !e.repeat && !e.metaKey && !e.ctrlKey && !/input|textarea/i.test(document.activeElement?.tagName ?? '')) { held = !scene.lens.on; if (held) setLens(true); } });
  addEventListener('keyup', e => { if (e.key.toLowerCase() === 'x' && held) { held = false; setLens(false); } });
  if (pointer.fine) { scene.lens.x = pointer.x; scene.lens.y = pointer.y; }
  else if (!pointer.fine) { scene.lens.size = 90; addEventListener('touchmove', e => { if (!scene.lens.on) return; const t = e.touches[0]; scene.lens.x = t.clientX; scene.lens.y = t.clientY; }, {passive: true}); }

  const tilt = $('#tilt-enable');
  if (tiltAvailable()) {
    if (tiltNeedsTap()) { tilt.hidden = false; tilt.addEventListener('click', async () => { if (await enableTilt()) { tilt.textContent = 'Tilt on'; tilt.setAttribute('aria-pressed', 'true'); toast('Tilt the phone: the characters look where you lean.'); } else toast('Motion access was not granted.'); }); }
    else enableTilt();
  }
});
