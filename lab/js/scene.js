/* One WebGL canvas for every live rig on the page.
 * Sections register views (ordinary DOM elements); each frame the scene draws the rigs of every
 * visible view into that element's rectangle. Deformation is the unchanged Inkinesis runtime
 * (evaluateCombined); only placement, clipping and optional tints are added here.
 * The canvas lives in the document (not position:fixed) and is re-centred on the viewport every
 * frame with overscan, so rigs stay glued to their elements while the page scrolls.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {evaluateCombined} from '../../static/js/rig-engine.js';
export {loadPreview, gateLoads, clampParam, chainAvailable, smooth} from '../../static/js/stage.js';

const VS = `#version 300 es
in vec2 pos; in vec2 uv;
uniform vec2 view; uniform vec2 center; uniform float scale; uniform vec3 part;
out vec2 tex;
void main(){vec2 q=pos*(1.+part.z)+part.xy;vec2 p=center+q*scale;gl_Position=vec4(p.x/view.x*2.-1.,1.-p.y/view.y*2.,0,1);tex=uv;}`;
const FS = `#version 300 es
precision highp float;
in vec2 tex; uniform sampler2D image; uniform float opacity; uniform float threshold;
uniform vec4 tint; uniform vec4 spread; uniform float dim;
out vec4 color;
void main(){vec4 c=texture(image,tex);if(threshold>=0. && c.a<=threshold)discard;
float k=tint.a;if(spread.z>=0.)k*=1.-smoothstep(spread.z-spread.w,spread.z,distance(gl_FragCoord.xy,spread.xy));
c.rgb=mix(c.rgb,tint.rgb*c.a,k);c.rgb*=1.-dim;color=c*opacity;}`;

const NO_PART = [0, 0, 0];

/** Create the page scene. `root` receives the canvas layer; `fixed` pins it to the viewport
 * (used inside dialogs, which scroll on their own). */
export function createScene({root = document.body, fixed = false, maxDpr = 2} = {}) {
  const layer = document.createElement('div');
  layer.className = fixed ? 'scene-layer is-fixed' : 'scene-layer';
  layer.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas');
  layer.append(canvas);
  root.prepend(layer);
  const gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true, stencil: true, antialias: true});
  const views = new Set();
  // A 2D overlay fixed to the viewport, above every section: wireframes while textures decode
  // and the page-wide x-ray lens draw here.
  const overlay = document.createElement('canvas');
  overlay.className = 'scene-overlay'; overlay.setAttribute('aria-hidden', 'true');
  const octx = overlay.getContext('2d');
  const scene = {ok: Boolean(gl), canvas, gl, views, dpr: 1, time: 0, layer, overlay, fps: 0, lens: {on: false, x: 0, y: 0, r: 0}, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches};
  if (!gl) { layer.remove(); scene.view = () => null; return scene; }
  if (!fixed) root.append(overlay);

  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s) ?? 'Shader failed'); return s; };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Shader link failed');
  const U = Object.fromEntries(['view', 'center', 'scale', 'part', 'opacity', 'threshold', 'tint', 'spread', 'dim'].map(n => [n, gl.getUniformLocation(program, n)]));
  const posLoc = gl.getAttribLocation(program, 'pos'), uvLoc = gl.getAttribLocation(program, 'uv');

  /* GPU resources are shared by every instance of an asset; posed vertices are uploaded just
   * before each instance draws, so instances can reuse one vertex buffer. */
  const gpu = new Map();
  async function acquire(asset) {
    let entry = gpu.get(asset);
    if (!entry) {
      entry = {refs: 0, ready: null, idle: 0};
      gpu.set(asset, entry);
      entry.ready = (async () => {
        const textures = [];
        for (const bytes of asset.textures) {
          const bitmap = await createImageBitmap(new Blob([bytes], {type: 'image/webp'}), {premultiplyAlpha: 'premultiply'});
          const t = gl.createTexture(); textures.push(t);
          gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          bitmap.close();
        }
        const buffers = [];
        const meshes = asset.parts.map(part => {
          const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
          const buffer = (target, data) => { const b = gl.createBuffer(); buffers.push(b); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.DYNAMIC_DRAW); return b; };
          const xy = buffer(gl.ARRAY_BUFFER, new Float32Array(part.mesh.verts));
          gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
          buffer(gl.ARRAY_BUFFER, new Float32Array(part.mesh.uvs));
          gl.enableVertexAttribArray(uvLoc); gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
          buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(part.mesh.indices));
          return {vao, xy, count: part.mesh.indices.length};
        });
        gl.bindVertexArray(null);
        const byUuid = new Map(asset.parts.map((p, i) => [p.uuid, i]));
        const order = asset.parts.map((_, i) => i).sort((a, b) => asset.parts[a].zsort - asset.parts[b].zsort);
        Object.assign(entry, {textures, buffers, meshes, byUuid, order});
        return entry;
      })();
      entry.ready.catch(() => gpu.delete(asset));
    }
    entry.refs++;
    return entry.ready;
  }
  function release(asset) {
    const entry = gpu.get(asset);
    if (!entry) return;
    entry.refs--; entry.idle = performance.now();
    // Keep a few unreferenced assets warm (gallery hover, dialog reopen); free the rest.
    const idle = [...gpu.entries()].filter(([, e]) => e.refs <= 0 && e.textures).sort((a, b) => b[1].idle - a[1].idle);
    for (const [key, e] of idle.slice(4)) { e.textures.forEach(t => gl.deleteTexture(t)); e.buffers.forEach(b => gl.deleteBuffer(b)); e.meshes.forEach(m => gl.deleteVertexArray(m.vao)); gpu.delete(key); }
  }

  let width = 1, height = 1, over = 0, top = 0;
  function layout() {
    const dpr = Math.min(devicePixelRatio || 1, maxDpr), vw = document.documentElement.clientWidth, vh = innerHeight;
    over = fixed ? 0 : Math.round(vh * .5);
    top = fixed ? 0 : scrollY - over;
    const cssH = vh + 2 * over, w = Math.round(vw * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; canvas.style.width = vw + 'px'; canvas.style.height = cssH + 'px'; }
    if (!fixed) canvas.style.transform = `translate3d(0,${top}px,0)`;
    scene.dpr = dpr; width = w; height = h;
    if (!fixed) { const ow = Math.round(vw * dpr), oh = Math.round(vh * dpr); if (overlay.width !== ow || overlay.height !== oh) { overlay.width = ow; overlay.height = oh; } }
  }

  /** Pose a rig for this frame (always, so wireframes and hit-tests work before textures land). */
  function pose(rig) {
    let posed = rig.frozen ?? evaluateCombined(rig.asset, rig.values);
    if (rig.posedHook) posed = rig.posedHook(posed) ?? posed;
    rig.lastPosed = posed;
    return posed;
  }

  function drawRig(view, rig, entry, vx, vy, vw, vh, opacity) {
    const dpr = scene.dpr, {cx, cy, scale} = view.placement(rig);
    const clip = rig.clip ?? [0, 1];
    const sx = Math.round((vx + vw * clip[0]) * dpr), sw = Math.round(vw * (clip[1] - clip[0]) * dpr);
    if (sw <= 0) return;
    gl.scissor(sx, Math.round(height - (vy + vh) * dpr), sw, Math.round(vh * dpr));
    gl.uniform2f(U.center, cx * dpr, cy * dpr); gl.uniform1f(U.scale, scale * dpr);
    const posed = rig.lastPosed;
    for (let i = 0; i < entry.meshes.length; i++) { gl.bindBuffer(gl.ARRAY_BUFFER, entry.meshes[i].xy); gl.bufferSubData(gl.ARRAY_BUFFER, 0, posed[i].xy instanceof Float32Array ? posed[i].xy : new Float32Array(posed[i].xy)); }
    const spread = rig.spread;
    gl.uniform4f(U.spread, ...(spread ? [spread[0] * dpr, height - spread[1] * dpr, spread[2] * dpr, spread[3] * dpr] : [0, 0, -1, 0]));
    gl.uniform1f(U.dim, rig.dim ?? 0);
    const drawPart = (i, opacity, threshold = -1) => {
      const part = rig.asset.parts[i], tint = rig.tint?.(part, i) ?? null;
      gl.bindVertexArray(entry.meshes[i].vao); gl.bindTexture(gl.TEXTURE_2D, entry.textures[part.textures[0]]);
      gl.uniform1f(U.opacity, opacity); gl.uniform1f(U.threshold, threshold);
      gl.uniform4f(U.tint, ...(tint ?? [0, 0, 0, 0]));
      gl.uniform3f(U.part, ...(rig.partXform?.(i, part) ?? NO_PART));
      gl.drawElements(gl.TRIANGLES, entry.meshes[i].count, gl.UNSIGNED_INT, 0);
    };
    for (const i of entry.order) {
      const p = posed[i], part = rig.asset.parts[i];
      if (!p.enabled || p.opacity <= 0) continue;
      const alpha = rig.partOpacity ? rig.partOpacity(i, part) : 1;
      if (alpha <= 0) continue;
      const mask = part.masks?.[0];
      if (mask) {
        const source = entry.byUuid.get(mask.source);
        if (source === undefined) continue;
        gl.enable(gl.STENCIL_TEST); gl.stencilMask(255); gl.clear(gl.STENCIL_BUFFER_BIT);
        gl.stencilFunc(gl.ALWAYS, 1, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); gl.colorMask(false, false, false, false);
        drawPart(source, 1, rig.asset.parts[source].mask_threshold ?? .5);
        gl.colorMask(true, true, true, true); gl.stencilMask(0); gl.stencilFunc(gl.EQUAL, 1, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      } else gl.disable(gl.STENCIL_TEST);
      drawPart(i, Math.max(0, Math.min(1, p.opacity)) * opacity * alpha);
    }
    gl.disable(gl.STENCIL_TEST);
  }

  /* Page-wide x-ray lens on the overlay: any live rig under the pointer shows its deformed
   * mesh and the limb that owns every part, from the rig's own chain lists. */
  function lensPass(visible) {
    const {lens} = scene, dpr = scene.dpr;
    if (lens.r < 1) return;
    const ctx = octx, x = lens.x * dpr, y = lens.y * dpr, rr = lens.r * dpr;
    let drew = false;
    for (const view of visible) {
      const r = view.rect;
      if (lens.x + lens.r < r.left || lens.x - lens.r > r.right || lens.y + lens.r < r.top || lens.y - lens.r > r.bottom) continue;
      for (const rig of view.rigs) {
        if (!rig.visible || rig.hidden || rig.opacity <= .05 || !rig.lastPosed) continue;
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.clip();
        const clip = rig.clip ?? [0, 1];
        ctx.beginPath(); ctx.rect((r.left + r.width * clip[0]) * dpr, r.top * dpr, r.width * (clip[1] - clip[0]) * dpr, r.height * dpr); ctx.clip();
        if (!drew) { ctx.fillStyle = 'rgba(9,8,13,.94)'; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); drew = true; }
        ctx.translate(r.left * dpr, r.top * dpr);
        ctx.globalAlpha = rig.opacity;
        fillOwners(ctx, view, rig, {dpr, alpha: .8});
        ctx.lineWidth = .6 * dpr; ctx.strokeStyle = 'rgba(255,255,255,.55)'; strokeMesh(ctx, view, rig, {dpr});
        ctx.restore();
      }
    }
    if (!drew) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fillStyle = 'rgba(9,8,13,.35)'; ctx.fill(); ctx.restore(); }
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.shadowColor = 'rgba(148,112,216,.9)'; ctx.shadowBlur = 18 * dpr; ctx.stroke(); ctx.shadowBlur = 0;
    if (lens.r > 60) { ctx.font = `600 ${10 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(drew ? 'X-RAY · MESH + OWNERSHIP' : 'X-RAY · MOVE OVER A LIVE RIG', x, y + rr + 18 * dpr); }
  }

  let last = performance.now(), wasEmpty = false, fpsAcc = 0, fpsN = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now; scene.time += dt;
    fpsAcc += dt; fpsN++; if (fpsAcc >= .5) { scene.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (document.hidden) return;
    layout();
    const vh = innerHeight, visible = [];
    for (const view of views) {
      if (view.hidden) continue;
      const r = view.el.getBoundingClientRect();
      view.rect = r;
      view.onscreen = r.width > 0 && r.bottom > 0 && r.top < vh;
      if (r.width > 0 && r.bottom > -over && r.top < vh + over) visible.push(view);
    }
    if (!fixed) { octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overlay.width, overlay.height); }
    if (!visible.length && wasEmpty) return;
    wasEmpty = !visible.length;
    for (const view of visible) { try { view.update?.(scene.time, dt, view); } catch (error) { console.warn(error); } }
    gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0); gl.stencilMask(255); gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.useProgram(program); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    for (const view of visible) {
      const r = view.rect, vx = r.left, vy = r.top + over;
      // The projection maps view pixels; the viewport is the view rectangle on the canvas.
      gl.viewport(Math.round(vx * scene.dpr), Math.round(height - (vy + r.height) * scene.dpr), Math.round(r.width * scene.dpr), Math.round(r.height * scene.dpr));
      gl.uniform2f(U.view, Math.round(r.width * scene.dpr), Math.round(r.height * scene.dpr));
      for (const rig of view.rigs) {
        if (!rig.visible || rig.hidden || rig.opacity <= 0) continue;
        const entry = gpu.get(rig.asset);
        if (!entry?.textures) continue;
        pose(rig);
        const opacity = rig.opacity;
        // Scissor and spread are in canvas pixels; drawRig receives the view origin.
        const saved = rig.spread;
        if (saved) rig.spread = [saved[0] + vx, saved[1] + vy, saved[2], saved[3]];
        drawRig(view, rig, entry, vx, vy, r.width, r.height, opacity);
        rig.spread = saved;
      }
      try { view.after?.(scene.time, view); } catch (error) { console.warn(error); }   // one view's overlay must not stop the frame for the others
    }
    gl.bindVertexArray(null);
    if (!fixed) {
      const lens = scene.lens, target = lens.on ? (lens.size ?? 110) : 0;
      lens.r += (target - lens.r) * (1 - Math.exp(-dt * 12)); if (lens.r < .5 && !lens.on) lens.r = 0;
      lensPass(visible);
    }
  }
  requestAnimationFrame(frame);

  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); scene.ok = false; document.documentElement.classList.add('scene-lost'); });

  /** Register a DOM element as a view. update(t, dt, view) runs every frame while it is near
   * the viewport; after(t, view) runs once its rigs are drawn (for 2D overlays). */
  scene.view = (el, {update, after} = {}) => {
    const view = {
      el, rigs: [], update, after, rect: el.getBoundingClientRect(), onscreen: false, hidden: false,
      async add(asset, options = {}) {
        await acquire(asset);
        const rig = {asset, values: defaults(asset), x: .5, y: .5, fit: .96, height: null, zoom: 1, focus: [0, 0], opacity: 1, visible: true, hidden: false, ...options};
        view.rigs.push(rig);
        return rig;
      },
      remove(rig) { const i = view.rigs.indexOf(rig); if (i >= 0) { view.rigs.splice(i, 1); release(rig.asset); } },
      clear() { for (const rig of [...view.rigs]) view.remove(rig); },
      destroy() { view.clear(); views.delete(view); },
      /** View-pixel transform of a rig: canvas-centred rig pixels → CSS pixels in the view. */
      placement(rig) {
        const w = view.rect.width, h = view.rect.height, a = rig.asset;
        const base = rig.height != null ? rig.height * h / a.height : Math.min(w / a.width, h / a.height) * rig.fit;
        const scale = base * rig.zoom;
        return {cx: rig.x * w - rig.focus[0] * scale, cy: rig.y * h - rig.focus[1] * scale, scale};
      },
      project(rig, x, y) { const {cx, cy, scale} = view.placement(rig); return [cx + x * scale, cy + y * scale]; },
      unproject(rig, vx, vy) { const {cx, cy, scale} = view.placement(rig); return [(vx - cx) / scale, (vy - cy) / scale]; },
    };
    views.add(view);
    return view;
  };
  return scene;
}

export const defaults = asset => Object.fromEntries(asset.puppet.param.map(p => [p.name, [...p.defaults]]));

/* ------------------------------------------------------------------ rig helpers */

export const OWNER_RGB = {left: [0.12, 0.66, 0.6], right: [0.88, 0.6, 0.24], seat: [0.58, 0.42, 0.85], torso: [0.46, 0.5, 0.58]};
const ownerCache = new WeakMap();
/** Which limb carries each part, read from the rig itself: the parts each chain lists, plus the
 * fragment names Algorithm 1 writes (__Arm_L, __seat, __torso, ...). Unlisted garments stay with
 * the torso; body, face and hair parts get null. */
export function ownersOf(asset) {
  if (ownerCache.has(asset)) return ownerCache.get(asset);
  const chainOf = new Map();
  for (const c of asset.puppet.meta.combined?.chains ?? []) for (const name of c.parts ?? []) chainOf.set(name, c.name.endsWith('L') ? 'left' : 'right');
  const owners = asset.parts.map(part => {
    const n = part.name;
    if (/__seat/.test(n)) return 'seat';
    if (/__(Arm|Leg)_L/.test(n)) return 'left';
    if (/__(Arm|Leg)_R/.test(n)) return 'right';
    if (chainOf.has(n)) return chainOf.get(n);
    if (/^(topwear|bottomwear|neckwear)/.test(n)) return 'torso';
    return null;
  });
  ownerCache.set(asset, owners);
  return owners;
}

export const isObject = name => /^(objects|prop)(#|__|$)/.test(name);

const edgeCache = new WeakMap();
/** Unique triangle edges of every part, for wireframes. */
export function edgesOf(asset) {
  if (edgeCache.has(asset)) return edgeCache.get(asset);
  const edges = asset.parts.map(part => {
    const m = new Map(), idx = part.mesh.indices;
    for (let i = 0; i < idx.length; i += 3) for (const [a, b] of [[idx[i], idx[i + 1]], [idx[i + 1], idx[i + 2]], [idx[i + 2], idx[i]]]) { const lo = Math.min(a, b), hi = Math.max(a, b); m.set(lo * 65536 + hi, [lo, hi]); }
    return [...m.values()];
  });
  edgeCache.set(asset, edges);
  return edges;
}

/** Centroid of the posed vertices of the parts that pass `test`. */
export function centroid(posed, asset, test) {
  let x = 0, y = 0, n = 0;
  asset.parts.forEach((part, i) => { if (!test(part.name, i)) return; const xy = posed[i].xy; for (let k = 0; k < xy.length; k += 2) { x += xy[k]; y += xy[k + 1]; n++; } });
  return n ? [x / n, y / n] : null;
}

/** Recorded joints of each chain in canvas-centred rig pixels. */
export function chainsOf(asset) {
  const ox = asset.width / 2, oy = asset.height / 2;
  return (asset.puppet.meta.combined?.chains ?? []).map(c => ({
    name: c.name, axes: c.axes, parts: c.parts,
    root: [c.chain.root.x - ox, c.chain.root.y - oy], joint: [c.chain.joint.x - ox, c.chain.joint.y - oy], tip: [c.chain.tip.x - ox, c.chain.tip.y - oy],
  }));
}

/** Draw a wireframe of the posed rig into a 2D context, in view CSS pixels. */
export function strokeMesh(ctx, view, rig, {filter, dpr = 1} = {}) {
  const posed = rig.lastPosed; if (!posed) return;
  const edges = edgesOf(rig.asset), {cx, cy, scale} = view.placement(rig);
  ctx.beginPath();
  posed.forEach((p, i) => {
    if (!p.enabled || p.opacity <= .05 || (filter && !filter(i))) return;
    const xy = p.xy, d = rig.partXform?.(i, rig.asset.parts[i]) ?? NO_PART, s = 1 + d[2];
    for (const [a, b] of edges[i]) {
      ctx.moveTo((cx + (xy[a * 2] * s + d[0]) * scale) * dpr, (cy + (xy[a * 2 + 1] * s + d[1]) * scale) * dpr);
      ctx.lineTo((cx + (xy[b * 2] * s + d[0]) * scale) * dpr, (cy + (xy[b * 2 + 1] * s + d[1]) * scale) * dpr);
    }
  });
  ctx.stroke();
}

/** Fill posed triangles by owner colour (x-ray), in view CSS pixels. */
export function fillOwners(ctx, view, rig, {dpr = 1, alpha = .78} = {}) {
  const posed = rig.lastPosed; if (!posed) return;
  const owners = ownersOf(rig.asset), {cx, cy, scale} = view.placement(rig);
  const paths = {};
  posed.forEach((p, i) => {
    const o = owners[i] ?? (isObject(rig.asset.parts[i].name) ? 'object' : 'body');
    if (!p.enabled || p.opacity <= .05) return;
    const path = paths[o] ??= new Path2D(), xy = p.xy, idx = rig.asset.parts[i].mesh.indices;
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 2, b = idx[k + 1] * 2, c = idx[k + 2] * 2;
      path.moveTo((cx + xy[a] * scale) * dpr, (cy + xy[a + 1] * scale) * dpr);
      path.lineTo((cx + xy[b] * scale) * dpr, (cy + xy[b + 1] * scale) * dpr);
      path.lineTo((cx + xy[c] * scale) * dpr, (cy + xy[c + 1] * scale) * dpr);
      path.closePath();
    }
  });
  const rgb = o => o === 'body' ? [0.2, 0.22, 0.3] : o === 'object' ? [0.95, 0.95, 0.98] : OWNER_RGB[o];
  for (const o of ['body', 'torso', 'seat', 'left', 'right', 'object']) {
    if (!paths[o]) continue;
    const [r, g, b] = rgb(o).map(v => Math.round(v * 255));
    ctx.fillStyle = `rgba(${r},${g},${b},${o === 'body' ? alpha * .7 : alpha})`;
    ctx.fill(paths[o]);
  }
}
