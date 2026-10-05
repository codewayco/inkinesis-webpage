/* Inkinesis browser rig evaluator, renderer and bounded showcase motion.
 * Copyright 2026 Codeway. Licensed under Apache-2.0. See LICENSE and SOURCES.md.
 * Web preview adaptation: WebP texture decoding; original control semantics retained.
 */
function e(e, t) {
	if (e.length === 1) return [
		0,
		0,
		0
	];
	let n = Math.max(e[0], Math.min(e.at(-1), t)), r = 1;
	for (; r < e.length - 1 && e[r] < n;) r++;
	return [
		r - 1,
		r,
		(n - e[r - 1]) / (e[r] - e[r - 1])
	];
}
function t(t, n = {}) {
	let r = t.parts.map((e) => ({
		uuid: e.uuid,
		xy: [...e.mesh.verts],
		opacity: e.opacity ?? 1,
		enabled: e.enabled
	})), i = new Map(r.map((e) => [e.uuid, e])), a = /* @__PURE__ */ new Set();
	for (let r of t.puppet.param) {
		let t = n[r.name] ?? r.defaults, o = (e) => r.max[e] === r.min[e] ? 0 : ((t[e] ?? r.defaults[e]) - r.min[e]) / (r.max[e] - r.min[e]), [s, c, l] = e(r.axis_points[0], o(0)), [u, d, f] = e(r.axis_points[1], o(1)), p = [
			[
				s,
				u,
				(1 - l) * (1 - f)
			],
			[
				c,
				u,
				l * (1 - f)
			],
			[
				s,
				d,
				(1 - l) * f
			],
			[
				c,
				d,
				l * f
			]
		];
		for (let e of r.bindings) {
			let t = i.get(e.node);
			if (!t) throw Error("Binding refers to an absent node");
			if (e.param_name === "opacity") {
				let n = p.reduce((t, [n, r, i]) => t + Number(e.values[n][r]) * i, 0);
				a.has(e.node) ? t.opacity *= n : (t.opacity = n, a.add(e.node));
			} else for (let n = 0; n < t.xy.length; n++) t.xy[n] += p.reduce((t, [r, i, a]) => t + e.values[r][i][Math.floor(n / 2)][n % 2] * a, 0);
		}
	}
	return r;
}
function n(e, t) {
	return e.puppet.param.find((e) => e.name === t);
}
async function r(e, n, r = {}) {
	let i = r.background ?? [
		.125,
		.13,
		.145
	], a = e.getContext("webgl2", {
		alpha: !1,
		stencil: !0,
		preserveDrawingBuffer: !0
	});
	if (!a) throw Error("WebGL 2 is required");
	let o = (e, t) => {
		let n = a.createShader(e);
		if (a.shaderSource(n, t), a.compileShader(n), !a.getShaderParameter(n, a.COMPILE_STATUS)) throw Error(a.getShaderInfoLog(n) ?? "Shader failed");
		return n;
	}, s = a.createProgram(), c = [o(a.VERTEX_SHADER, "#version 300 es\n    in vec2 pos; in vec2 uv; uniform vec2 view; out vec2 tex;\n    void main(){gl_Position=vec4(pos.x/view.x*2.,-pos.y/view.y*2.,0,1);tex=uv;}"), o(a.FRAGMENT_SHADER, "#version 300 es\n    precision highp float; in vec2 tex; uniform sampler2D image; uniform float opacity; uniform float threshold; out vec4 color;\n    void main(){vec4 c=texture(image,tex);if(threshold>=0. && c.a<=threshold)discard;color=c*opacity;}")];
	if (c.forEach((e) => a.attachShader(s, e)), a.linkProgram(s), !a.getProgramParameter(s, a.LINK_STATUS)) throw Error("Shader link failed");
	a.useProgram(s);
	let l = a.getUniformLocation(s, "view"), u = a.getUniformLocation(s, "opacity"), d = a.getUniformLocation(s, "threshold"), f = [];
	for (let e of n.textures) {
		let t = await createImageBitmap(new Blob([new Uint8Array(e)], { type: "image/webp" }), { premultiplyAlpha: "premultiply" }), n = a.createTexture();
		f.push(n), a.bindTexture(a.TEXTURE_2D, n), a.texImage2D(a.TEXTURE_2D, 0, a.RGBA, a.RGBA, a.UNSIGNED_BYTE, t), a.texParameteri(a.TEXTURE_2D, a.TEXTURE_MIN_FILTER, a.LINEAR), a.texParameteri(a.TEXTURE_2D, a.TEXTURE_MAG_FILTER, a.LINEAR), a.texParameteri(a.TEXTURE_2D, a.TEXTURE_WRAP_S, a.CLAMP_TO_EDGE), a.texParameteri(a.TEXTURE_2D, a.TEXTURE_WRAP_T, a.CLAMP_TO_EDGE), t.close();
	}
	let p = [], m = n.parts.map((e) => {
		let t = a.createVertexArray();
		a.bindVertexArray(t);
		let n = (e, t) => {
			let n = a.createBuffer();
			return p.push(n), a.bindBuffer(e, n), a.bufferData(e, t, a.DYNAMIC_DRAW), n;
		}, r = n(a.ARRAY_BUFFER, new Float32Array(e.mesh.verts)), i = a.getAttribLocation(s, "pos");
		a.enableVertexAttribArray(i), a.vertexAttribPointer(i, 2, a.FLOAT, !1, 0, 0), n(a.ARRAY_BUFFER, new Float32Array(e.mesh.uvs));
		let o = a.getAttribLocation(s, "uv");
		return a.enableVertexAttribArray(o), a.vertexAttribPointer(o, 2, a.FLOAT, !1, 0, 0), n(a.ELEMENT_ARRAY_BUFFER, new Uint32Array(e.mesh.indices)), {
			vao: t,
			xy: r
		};
	}), h = new Map(n.parts.map((e, t) => [e.uuid, t])), g = n.parts.map((e, t) => t).sort((e, t) => n.parts[e].zsort - n.parts[t].zsort);
	return {
		draw(r) {
			let o = e.getBoundingClientRect(), c = Math.min(devicePixelRatio, 2), p = Math.max(1, Math.round(o.width * c)), _ = Math.max(1, Math.round(o.height * c));
			(e.width !== p || e.height !== _) && (e.width = p, e.height = _), a.viewport(0, 0, p, _), a.useProgram(s);
			let v = Math.min(p / n.width, _ / n.height) * .96;
			a.uniform2f(l, p / v, _ / v), a.clearColor(i[0], i[1], i[2], 1), a.stencilMask(255), a.clear(a.COLOR_BUFFER_BIT | a.STENCIL_BUFFER_BIT), a.enable(a.BLEND), a.blendFuncSeparate(a.ONE, a.ONE_MINUS_SRC_ALPHA, a.ONE, a.ONE_MINUS_SRC_ALPHA);
			let y = t(n, r);
			for (let e = 0; e < m.length; e++) a.bindBuffer(a.ARRAY_BUFFER, m[e].xy), a.bufferSubData(a.ARRAY_BUFFER, 0, new Float32Array(y[e].xy));
			let b = (e, t, r = -1) => {
				a.bindVertexArray(m[e].vao), a.bindTexture(a.TEXTURE_2D, f[n.parts[e].textures[0]]), a.uniform1f(u, t), a.uniform1f(d, r), a.drawElements(a.TRIANGLES, n.parts[e].mesh.indices.length, a.UNSIGNED_INT, 0);
			};
			for (let e of g) {
				let t = y[e], r = n.parts[e];
				if (!t.enabled || t.opacity <= 0) continue;
				let i = r.masks?.[0];
				if (i) {
					let e = h.get(i.source);
					if (e === void 0) throw Error("Missing mask source");
					a.enable(a.STENCIL_TEST), a.stencilMask(255), a.clear(a.STENCIL_BUFFER_BIT), a.stencilFunc(a.ALWAYS, 1, 255), a.stencilOp(a.KEEP, a.KEEP, a.REPLACE), a.colorMask(!1, !1, !1, !1), b(e, 1, n.parts[e].mask_threshold ?? .5), a.colorMask(!0, !0, !0, !0), a.stencilMask(0), a.stencilFunc(a.EQUAL, 1, 255), a.stencilOp(a.KEEP, a.KEEP, a.KEEP);
				} else a.disable(a.STENCIL_TEST);
				b(e, Math.max(0, Math.min(1, t.opacity)));
			}
			a.disable(a.STENCIL_TEST);
		},
		dispose() {
			f.forEach((e) => a.deleteTexture(e)), p.forEach((e) => a.deleteBuffer(e)), m.forEach((e) => a.deleteVertexArray(e.vao)), c.forEach((e) => a.deleteShader(e)), a.deleteProgram(s);
		}
	};
}
var i = {
	yaw: 20,
	pitch: 0,
	roll: 10,
	shoulder: 16,
	elbow: 30,
	hip: 18,
	knee: 45,
	mouth: .65
}, a = {
	period: 4,
	arms: [0, 1.2],
	rightLeg: [1, 1.8],
	leftLeg: [1.8, 2.6],
	head: [2.4, 4],
	settle: [3.6, 4]
}, o = (e) => {
	let t = Math.max(0, Math.min(1, e));
	return t * t * (3 - 2 * t);
}, s = (e, t, n) => {
	if (e <= t || e >= n) return 0;
	let r = (n - t) / 2;
	return e < t + r ? o((e - t) / r) : 1 - o((e - t - r) / r);
}, c = [
	[2.4, 0],
	[2.75, 1],
	[3, 0],
	[3.2, -1],
	[3.5, 0],
	[3.6, .5],
	[4, 0]
];
function l(e) {
	if (e <= c[0][0]) return 0;
	for (let t = 1; t < c.length; t++) if (e <= c[t][0]) {
		let [n, r] = c[t - 1], [i, a] = c[t];
		return r + (a - r) * o((e - n) / (i - n));
	}
	return 0;
}
function u(e) {
	let t = e.meta.motionCapabilities, n = (n) => e.param.some((e) => e.name === n && e.bindings.length) && t?.chains[n]?.mode !== "fixed";
	return {
		family: "gif-motion",
		arms: ["Arm L", "Arm R"].filter(n),
		legs: ["Leg L", "Leg R"].filter(n)
	};
}
function d(e, t, n) {
	let r = {}, c = e.meta.motionCapabilities;
	if (n < 0) return r;
	let u = n % a.period;
	if (u === 0) return r;
	let d = (t, n) => {
		let i = e.param.find((e) => e.name === t && e.bindings.length);
		i && c?.chains[t]?.mode !== "fixed" && (r[t] = i.defaults.map((e, t) => Math.max(i.min[t], Math.min(i.max[t], e + (n[t] ?? 0)))));
	}, f = s(u, ...a.arms);
	for (let e of t.arms) {
		let t = e.endsWith("L") ? -1 : 1;
		d(e, [t * i.shoulder * f, t * i.elbow * f]);
	}
	for (let e of t.legs) {
		let t = e.endsWith("L"), n = s(u, ...t ? a.leftLeg : a.rightLeg);
		d(e, [(t ? -1 : 1) * i.hip * n, i.knee * n]);
	}
	let p = l(u), m = (e) => (c?.headAxes?.[e]?.mode ?? c?.face.head.mode) !== "fixed";
	if (d("Head Angles", [m("yaw") ? i.yaw * p : 0, 0]), d("ParamAngleZ", [m("roll") ? i.roll * p : 0]), c?.face.blink.mode !== "fixed") {
		let e = o((u - 2.86) / .12) * (1 - o((u - 3.06) / .14));
		d("ParamEyeLOpen", [-e]), d("ParamEyeROpen", [-e]);
	}
	return c?.face.mouth.mode !== "fixed" && d("ParamMouthOpenY", [i.mouth * s(u, 2.4, 4)]), r;
}
export { r as createCombinedRenderer, t as evaluateCombined, n as parameterByName, u as recipeFor, d as showcaseValues };
