/* Multi-rig WebGL stage for the project page.
 * Draws several Inkinesis web-preview rigs into one transparent canvas, each with its own
 * placement (center, scale) and camera zoom. Deformation comes from the unchanged
 * evaluateCombined runtime; only the projection differs from the single-rig renderer.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {evaluateCombined} from './rig-engine.js';

const rigCache = new Map();

/** Load a gzip-compressed inkinesis-web-preview-v1 rig. */
export function loadPreview(url) {
  if (rigCache.has(url)) return rigCache.get(url);
  const pending = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw Error('Rig preview could not be downloaded: ' + url);
    const data = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    if (data.schema !== 'inkinesis-web-preview-v1') throw Error('Unsupported preview format.');
    const textures = data.textures.map(s => Uint8Array.from(atob(s), c => c.charCodeAt(0))), parts = [];
    const walk = n => { if (n.type === 'Part') parts.push(n); (n.children ?? []).forEach(walk); };
    walk(data.puppet.nodes);
    return {puppet: data.puppet, textures, parts, width: data.puppet.meta.canvas.width, height: data.puppet.meta.canvas.height};
  })();
  rigCache.set(url, pending);
  pending.catch(() => rigCache.delete(url));
  return pending;
}

const VS = `#version 300 es
in vec2 pos; in vec2 uv; uniform vec2 view; uniform vec2 center; uniform float scale; out vec2 tex;
void main(){vec2 p=center+pos*scale;gl_Position=vec4(p.x/view.x*2.-1.,1.-p.y/view.y*2.,0,1);tex=uv;}`;
const FS = `#version 300 es
precision highp float; in vec2 tex; uniform sampler2D image; uniform float opacity; uniform float threshold;
uniform vec4 tint; out vec4 color;
void main(){vec4 c=texture(image,tex);if(threshold>=0. && c.a<=threshold)discard;
c.rgb=mix(c.rgb,tint.rgb*c.a,tint.a);color=c*opacity;}`;

/** Create a stage on a canvas. Rigs are added with addRig and drawn by draw(). */
export function createStage(canvas) {
  const gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true, stencil: true, antialias: true});
  if (!gl) throw Error('WebGL 2 is required');
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s) ?? 'Shader failed'); return s; };
  const program = gl.createProgram(), shaders = [shader(gl.VERTEX_SHADER, VS), shader(gl.FRAGMENT_SHADER, FS)];
  shaders.forEach(s => gl.attachShader(program, s)); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Shader link failed');
  const U = name => gl.getUniformLocation(program, name);
  const uView = U('view'), uCenter = U('center'), uScale = U('scale'), uOpacity = U('opacity'), uThreshold = U('threshold'), uTint = U('tint');
  const rigs = [];
  const stage = {
    canvas, gl, rigs, dpr: 1, width: 1, height: 1, clearColor: null,
    async addRig(asset, options = {}) {
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
      gl.useProgram(program);
      const buffers = [];
      const meshes = asset.parts.map(part => {
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const buffer = (target, data) => { const b = gl.createBuffer(); buffers.push(b); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.DYNAMIC_DRAW); return b; };
        const xy = buffer(gl.ARRAY_BUFFER, new Float32Array(part.mesh.verts));
        const posLoc = gl.getAttribLocation(program, 'pos'); gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        buffer(gl.ARRAY_BUFFER, new Float32Array(part.mesh.uvs));
        const uvLoc = gl.getAttribLocation(program, 'uv'); gl.enableVertexAttribArray(uvLoc); gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
        buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(part.mesh.indices));
        return {vao, xy, count: part.mesh.indices.length};
      });
      gl.bindVertexArray(null);
      const byUuid = new Map(asset.parts.map((p, i) => [p.uuid, i]));
      const order = asset.parts.map((_, i) => i).sort((a, b) => asset.parts[a].zsort - asset.parts[b].zsort);
      const rig = {asset, textures, buffers, meshes, byUuid, order, values: {}, x: .5, y: .5, height: 1, zoom: 1, focus: [0, 0], opacity: 1, tint: null, visible: true, ...options};
      rigs.push(rig);
      return rig;
    },
    resize() {
      const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      stage.dpr = dpr; stage.width = w; stage.height = h;
    },
    /** Pixel transform of a rig. The rig-space focus point (canvas-centered pixels) lands at
     * (x, y) of the stage; height is the rig canvas height as a fraction of the stage height. */
    placement(rig) {
      const scale = rig.height * stage.height / rig.asset.height * rig.zoom;
      return {cx: rig.x * stage.width - rig.focus[0] * scale, cy: rig.y * stage.height - rig.focus[1] * scale, scale};
    },
    posed(rig) { return evaluateCombined(rig.asset, rig.values); },
    draw() {
      stage.resize();
      gl.viewport(0, 0, stage.width, stage.height); gl.useProgram(program);
      gl.clearColor(...(stage.clearColor ?? [0, 0, 0, 0])); gl.stencilMask(255); gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform2f(uView, stage.width, stage.height);
      for (const rig of rigs) {
        if (!rig.visible || rig.opacity <= 0) continue;
        const {cx, cy, scale} = stage.placement(rig);
        gl.uniform2f(uCenter, cx, cy); gl.uniform1f(uScale, scale);
        const posed = evaluateCombined(rig.asset, rig.values); rig.lastPosed = posed;
        for (let i = 0; i < rig.meshes.length; i++) { gl.bindBuffer(gl.ARRAY_BUFFER, rig.meshes[i].xy); gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(posed[i].xy)); }
        const drawPart = (i, opacity, threshold = -1) => {
          const part = rig.asset.parts[i], tint = rig.tint?.(part) ?? null;
          gl.bindVertexArray(rig.meshes[i].vao); gl.bindTexture(gl.TEXTURE_2D, rig.textures[part.textures[0]]);
          gl.uniform1f(uOpacity, opacity); gl.uniform1f(uThreshold, threshold);
          gl.uniform4f(uTint, ...(tint ?? [0, 0, 0, 0]));
          gl.drawElements(gl.TRIANGLES, rig.meshes[i].count, gl.UNSIGNED_INT, 0);
        };
        for (const i of rig.order) {
          const p = posed[i], part = rig.asset.parts[i];
          if (!p.enabled || p.opacity <= 0) continue;
          const mask = part.masks?.[0];
          if (mask) {
            const source = rig.byUuid.get(mask.source);
            if (source === undefined) continue;
            gl.enable(gl.STENCIL_TEST); gl.stencilMask(255); gl.clear(gl.STENCIL_BUFFER_BIT);
            gl.stencilFunc(gl.ALWAYS, 1, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); gl.colorMask(false, false, false, false);
            drawPart(source, 1, rig.asset.parts[source].mask_threshold ?? .5);
            gl.colorMask(true, true, true, true); gl.stencilMask(0); gl.stencilFunc(gl.EQUAL, 1, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
          } else gl.disable(gl.STENCIL_TEST);
          drawPart(i, Math.max(0, Math.min(1, p.opacity)) * rig.opacity);
        }
        gl.disable(gl.STENCIL_TEST);
      }
      gl.bindVertexArray(null);
    },
    dispose() {
      for (const rig of rigs) { rig.textures.forEach(t => gl.deleteTexture(t)); rig.buffers.forEach(b => gl.deleteBuffer(b)); rig.meshes.forEach(m => gl.deleteVertexArray(m.vao)); }
      shaders.forEach(s => gl.deleteShader(s)); gl.deleteProgram(program);
    },
  };
  return stage;
}

/** Clamp a value into a parameter's bounds. */
export function clampParam(asset, name, values) {
  const p = asset.puppet.param.find(q => q.name === name && q.bindings.length);
  if (!p) return null;
  return values.map((v, d) => Math.max(p.min[d], Math.min(p.max[d], v)));
}

/** True when a chain is bound and not reported fixed by the rig's motion capabilities. */
export function chainAvailable(asset, name) {
  const p = asset.puppet.param.find(q => q.name === name && q.bindings.length);
  return Boolean(p) && asset.puppet.meta.motionCapabilities?.chains?.[name]?.mode !== 'fixed';
}

export const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
