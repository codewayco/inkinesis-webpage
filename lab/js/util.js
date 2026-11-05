/* Small shared helpers for the lab page.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOut = t => 1 - (1 - clamp(t)) ** 3;
export const easeOutBack = t => { t = clamp(t); const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
export const heldRig = id => `lab/rigs/${id}.json.gz`;   // full-resolution previews rebuilt from the original rigs
export const liteData = () => Boolean(navigator.connection?.saveData) || !globalThis.DecompressionStream;

/** Where the pointer is, in viewport pixels, and when it last moved. `virtual` is set while the
 * device's tilt stands in for a pointer; `gaze` is true when either can drive a look. */
export const pointer = {x: innerWidth / 2, y: innerHeight * .4, moved: -1e9, fine: matchMedia('(pointer: fine)').matches, virtual: false, get gaze() { return this.fine || this.virtual; }};
addEventListener('pointermove', e => { if (e.pointerType === 'touch' && pointer.virtual) return; pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = performance.now(); }, {passive: true});

/** Tilt-to-look: map the phone's orientation onto a virtual pointer. Returns whether it
 * started. On iOS this must run inside a tap because of the permission prompt. */
let tiltOn = false, tiltBase = null;
export async function enableTilt() {
  if (tiltOn) return true;
  if (!('DeviceOrientationEvent' in globalThis)) return false;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false; } catch { return false; }
  }
  addEventListener('deviceorientation', e => {
    if (e.gamma == null || e.beta == null) return;
    // The first reading is the neutral pose; look is relative to how the phone is held.
    tiltBase ??= {g: e.gamma, b: e.beta};
    const gx = clamp((e.gamma - tiltBase.g) / 22, -1, 1), gy = clamp((e.beta - tiltBase.b) / 22, -1, 1);
    pointer.x = innerWidth * (.5 + .5 * gx); pointer.y = innerHeight * (.45 + .45 * gy);
    pointer.virtual = true; pointer.moved = performance.now();
  }, {passive: true});
  tiltOn = true;
  return true;
}
export const tiltAvailable = () => !pointer.fine && 'DeviceOrientationEvent' in globalThis;
export const tiltNeedsTap = () => typeof globalThis.DeviceOrientationEvent?.requestPermission === 'function';

/** Run setup once when the element first comes near the viewport. */
export function whenNear(el, setup, margin = '400px') {
  if (!el) return;
  const io = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    io.disconnect();
    Promise.resolve().then(setup).catch(error => { el.classList.add('live-failed'); console.warn(error); });
  }, {rootMargin: margin});
  io.observe(el);
}

/** Fire callback(visible) as the element enters or leaves the viewport. */
export function watchVisible(el, callback, threshold = 0) {
  const io = new IntersectionObserver(([e]) => callback(e.isIntersecting), {threshold});
  io.observe(el);
  return io;
}

let toastTimer;
export function toast(message) {
  const el = $('#toast'); if (!el) return;
  clearTimeout(toastTimer); el.textContent = message; el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2800);
}

/** Keep a range input's filled track in sync (WebKit has no progress pseudo-element). */
export function fillRange(input) {
  const sync = () => { const min = Number(input.min || 0), max = Number(input.max || 100); input.style.setProperty('--fill', ((Number(input.value) - min) / (max - min || 1) * 100) + '%'); };
  input.addEventListener('input', sync); sync();
  return sync;
}

export async function copyText(value) {
  if (navigator.clipboard && globalThis.isSecureContext) { await navigator.clipboard.writeText(value); return; }
  const field = document.createElement('textarea'); field.value = value; field.style.cssText = 'position:fixed;left:-9999px';
  document.body.append(field); field.select(); const ok = document.execCommand('copy'); field.remove();
  if (!ok) throw Error('Clipboard unavailable');
}

/** A 2D overlay canvas that tracks its element's size at device resolution. */
export function overlay2d(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    ctx,
    fit() {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
      return dpr;
    },
  };
}
