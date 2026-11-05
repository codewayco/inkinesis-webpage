/* 3 · Webcam mirror: MediaPipe face landmarks drive a paper rig's own head, eye, brow and mouth
 * controls, and pose landmarks drive its shoulder and elbow controls, all clamped to the rig's
 * bounds. Frames stay on the device; the models are downloaded from Google's CDN only after the
 * visitor presses the button.
 * Copyright 2026 Codeway. Licensed under Apache-2.0.
 */
import {loadPreview, defaults, clampParam, chainsOf} from './scene.js';
import {calibrate, gazeValues, blinkOpen} from './rigmath.js';
import {$, reduced, clamp, lerp, toast} from './util.js';

const CAST = {
  '07-neon-skater': 'lab/rigs/07-neon-skater.json.gz',
  '16-ember-forge-smith': 'lab/rigs/16-ember-forge-smith.json.gz',
};
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a)), DEG = 180 / Math.PI;

export async function mirror(scene) {
  const section = $('#live'), wrap = $('.mirror', section), el = $('#mirror-view'), video = $('#mirror-cam'), status = $('.mirror-status', el);
  const start = $('#mirror-start'), stop = $('#mirror-stop'), modeButtons = [...el.querySelectorAll('[data-mode]')], startLabel = $('[data-start-label]', el);
  const castButtons = [...el.querySelectorAll('[data-cast]')];
  if (!scene.ok) { start.disabled = true; $('[data-start-label]', el).textContent = 'The live mirror needs WebGL 2'; return; }
  if (!navigator.mediaDevices?.getUserMedia) start.disabled = true;
  let rig = null, asset = null, base = null, cal = null, arms = [], outgoing = null, loading = 0;
  const view = scene.view(el, {update});
  const has = name => asset.puppet.param.some(p => p.name === name && p.bindings.length);
  let mode = 'face', framing = 0, vision = null, poserLoading = null;
  let tracker = null, poser = null, stream = null, running = false, neutral = null, samples = [], last = -1, frame = 0;

  /* Switch the character: the new rig fades in over the old one. */
  async function use(id) {
    const ticket = ++loading;
    el.classList.remove('is-live');
    const next = await loadPreview(CAST[id]);
    if (ticket !== loading) return;
    const nextRig = await view.add(next, {fit: .95, y: .53, opacity: 0});
    if (ticket !== loading) { view.remove(nextRig); return; }
    if (outgoing) view.remove(outgoing);
    outgoing = rig;
    asset = next; base = defaults(asset); cal = calibrate(asset); rig = nextRig;
    // Recorded arm chains: rest directions of the upper arm and forearm on screen.
    arms = chainsOf(asset).filter(c => c.name.startsWith('Arm') && cal.arms[c.name]).map(c => {
      const a1 = Math.atan2(c.joint[1] - c.root[1], c.joint[0] - c.root[0]), a2 = Math.atan2(c.tip[1] - c.joint[1], c.tip[0] - c.joint[0]);
      return {name: c.name, right: c.root[0] > 0, a1, bend: wrapAngle(a2 - a1), k1: cal.arms[c.name].k1, k2: cal.arms[c.name].k2, value: [0, 0], seen: 0};
    });
    el.classList.add('is-live');
  }
  for (const b of castButtons) b.addEventListener('click', () => {
    if (b.getAttribute('aria-pressed') === 'true') return;
    castButtons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    use(b.dataset.cast).catch(error => console.warn(error));
  });
  const face = {gx: 0, gy: 0, roll: 0, blinkL: 0, blinkR: 0, jaw: 0, smile: 0, brow: 0, eyeX: 0, eyeY: 0, seen: 0};

  function update(t, dt) {
    if (!rig) return;
    rig.opacity = Math.min(1, rig.opacity + dt * 3);
    if (outgoing) { outgoing.opacity -= dt * 3; if (outgoing.opacity <= 0) { view.remove(outgoing); outgoing = null; } }
    // Framing: a head-and-shoulders close-up for the face, the full figure with the arms.
    framing = lerp(framing, mode === 'body' ? 1 : 0, 1 - Math.exp(-dt * (reduced ? 40 : 3.2)));
    const close = 1 - framing;
    rig.zoom = 1 + 1.2 * close;   // at most 2.2x: closer, the seams of the eye layers start to show
    rig.focus = [cal.face[0] * close, (cal.face[1] + 150) * close];
    rig.y = .53 - .03 * close;
    if (outgoing) Object.assign(outgoing, {zoom: rig.zoom, y: rig.y, focus: rig.focus});
    let values = {...base};
    if (running && tracker && video.readyState >= 2 && video.currentTime !== last) {
      last = video.currentTime;
      const result = tracker.detectForVideo(video, performance.now());
      if (result.faceLandmarks?.length) read(result); else face.seen = Math.max(0, face.seen - dt);
      if (mode === 'body' && poser && frame++ % 2 === 0) readPose(poser.detectForVideo(video, performance.now() + .5), dt);
      const armsOn = arms.some(a => a.seen > .3);
      status.textContent = face.seen > .2 ? (mode !== 'body' ? 'TRACKING FACE · ON DEVICE' : !poser ? 'LOADING THE BODY MODEL…' : armsOn ? 'TRACKING FACE + ARMS · ON DEVICE' : 'STEP BACK SO YOUR ARMS ARE IN VIEW') : 'LOOKING FOR YOUR FACE…';
    }
    if (running && face.seen > 0) {
      Object.assign(values, gazeValues(asset, cal, clamp(face.gx), clamp(face.gy), {yaw: 25, pitch: 15, roll: 0, eyes: 0}));
      if (has('ParamAngleZ')) values.ParamAngleZ = clampParam(asset, 'ParamAngleZ', [cal.rollSign * clamp(face.roll, -10, 10)]);
      if (cal.eyeX) values.ParamEyeBallX = clampParam(asset, 'ParamEyeBallX', [cal.eyeX * clamp(face.eyeX, -1, 1)]);
      if (cal.eyeY) values.ParamEyeBallY = clampParam(asset, 'ParamEyeBallY', [cal.eyeY * clamp(face.eyeY, -1, 1)]);
      if (cal.blink) { values.ParamEyeLOpen = [clamp(1 - face.blinkR)]; values.ParamEyeROpen = [clamp(1 - face.blinkL)]; }
      if (has('ParamMouthOpenY')) values.ParamMouthOpenY = clampParam(asset, 'ParamMouthOpenY', [face.jaw]);
      if (has('ParamMouthForm')) values.ParamMouthForm = clampParam(asset, 'ParamMouthForm', [face.smile]);
      for (const b of ['ParamBrowLY', 'ParamBrowRY']) if (has(b)) values[b] = clampParam(asset, b, [face.brow]);
    }
    if (running) for (const a of arms) {
      // Ease back to the drawn pose when an arm leaves the frame or the face-only mode is on.
      if (mode !== 'body') a.seen = 0;
      if (a.seen <= 0) a.value = a.value.map(v => lerp(v, 0, 1 - Math.exp(-dt * 3)));
      values[a.name] = clampParam(asset, a.name, a.value) ?? values[a.name];
    }
    if (!(running && face.seen > 0)) {
      // Idle: a calm look around with blinks, so the rig reads as live before the camera starts.
      Object.assign(values, gazeValues(asset, cal, reduced ? 0 : .35 * Math.sin(t * .45), reduced ? .05 : .08 * Math.sin(t * .31)));
      const open = blinkOpen(t % 4.2 - 2);
      if (cal.blink && open < 1) { values.ParamEyeLOpen = [open]; values.ParamEyeROpen = [open]; }
    }
    rig.values = values;
  }

  /* Landmarks → mirrored screen directions. Image x grows to the subject's left, so every horizontal
   * quantity is negated for the mirror view. */
  function read(result) {
    const lm = result.faceLandmarks[0], P = i => lm[i];
    const L = P(33), R = P(263), nose = P(1), eye = Math.hypot(R.x - L.x, R.y - L.y) || 1;
    const mid = {x: (L.x + R.x) / 2, y: (L.y + R.y) / 2};
    const raw = {x: (nose.x - mid.x) / eye, y: (nose.y - mid.y) / eye, roll: Math.atan2(R.y - L.y, R.x - L.x) * 180 / Math.PI};
    if (!neutral) { samples.push(raw); if (samples.length >= 12) neutral = {x: avg(samples, 'x'), y: avg(samples, 'y'), roll: avg(samples, 'roll')}; return; }
    const shapes = Object.fromEntries((result.faceBlendshapes?.[0]?.categories ?? []).map(c => [c.categoryName, c.score]));
    const s = n => shapes[n] ?? 0, k = .45;
    face.gx = lerp(face.gx, -(raw.x - neutral.x) * 3.2, k);
    face.gy = lerp(face.gy, (raw.y - neutral.y) * 4.2, k);
    face.roll = lerp(face.roll, -(raw.roll - neutral.roll), k);
    face.blinkL = lerp(face.blinkL, clamp((s('eyeBlinkLeft') - .18) / .5), .7);
    face.blinkR = lerp(face.blinkR, clamp((s('eyeBlinkRight') - .18) / .5), .7);
    face.jaw = lerp(face.jaw, clamp((s('jawOpen') - .04) * 1.8), .6);
    face.smile = lerp(face.smile, clamp((s('mouthSmileLeft') + s('mouthSmileRight')) / 2 * 1.6 - (s('mouthFrownLeft') + s('mouthFrownRight')) / 2 * 1.6, -1, 1), .4);
    face.brow = lerp(face.brow, clamp((s('browInnerUp') + (s('browOuterUpLeft') + s('browOuterUpRight')) / 2) * 1.4 - (s('browDownLeft') + s('browDownRight')) / 2 * 1.4, -1, 1), .4);
    face.eyeX = lerp(face.eyeX, -(s('eyeLookOutLeft') + s('eyeLookInRight') - s('eyeLookInLeft') - s('eyeLookOutRight')) / 2 * 1.6, .5);
    face.eyeY = lerp(face.eyeY, ((s('eyeLookDownLeft') + s('eyeLookDownRight')) - (s('eyeLookUpLeft') + s('eyeLookUpRight'))) / 2 * 1.6, .5);
    face.seen = Math.min(1, face.seen + .1);
  }
  const avg = (list, key) => list.reduce((a, b) => a + b[key], 0) / list.length;

  /* Pose landmarks → shoulder and elbow commands. In the mirrored view each tracked arm drives the
   * rig arm on the same side of the screen. The upper-arm and forearm directions are compared with
   * the rig's recorded rest directions, then converted with the measured per-axis screen gains. */
  function readPose(result, dt) {
    const lm = result.landmarks?.[0];
    if (!lm) { arms.forEach(a => { a.seen = Math.max(0, a.seen - dt * 2); }); return; }
    const ar = (video.videoWidth || 4) / (video.videoHeight || 3), P = i => ({x: (1 - lm[i].x) * ar, y: lm[i].y, v: lm[i].visibility ?? 1});
    const sides = [[11, 13, 15], [12, 14, 16]].map(([s, e, w]) => ({S: P(s), E: P(e), W: P(w)}));
    const mid = (sides[0].S.x + sides[1].S.x) / 2;
    for (const a of arms) {
      const side = sides.find(t => (t.S.x > mid) === a.right);
      if (!side || side.S.v < .5 || side.E.v < .5) { a.seen = Math.max(0, a.seen - dt * 2); continue; }
      const upper = Math.atan2(side.E.y - side.S.y, side.E.x - side.S.x);
      const target = [wrapAngle(upper - a.a1) * DEG / a.k1, a.value[1]];
      if (side.W.v >= .5) { const fore = Math.atan2(side.W.y - side.E.y, side.W.x - side.E.x); target[1] = wrapAngle(wrapAngle(fore - upper) - a.bend) * DEG / a.k2; }
      const clamped = clampParam(asset, a.name, target) ?? target;
      a.value = a.value.map((v, i) => lerp(v, clamped[i], .35));
      a.seen = Math.min(1, a.seen + .15);
    }
  }

  start.addEventListener('click', async () => {
    start.disabled = true; status.textContent = 'ASKING FOR THE CAMERA…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}}, audio: false});
      video.srcObject = stream; video.hidden = false; await video.play();
      wrap.classList.add('running'); stop.hidden = false; status.textContent = 'LOADING THE FACE MODEL…';
      if (!tracker) {
        const lib = await import(`${VISION}/vision_bundle.mjs`), {FilesetResolver, FaceLandmarker} = lib;
        const files = await FilesetResolver.forVisionTasks(`${VISION}/wasm`);
        vision = {lib, files};
        tracker = await FaceLandmarker.createFromOptions(files, {baseOptions: {modelAssetPath: MODEL, delegate: 'GPU'}, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true});
      }
      neutral = null; samples = []; running = true; status.textContent = 'LOOK AT THE CAMERA…';
      if (mode === 'body') loadPose();
    } catch (error) {
      console.warn(error); halt();
      toast(error?.name === 'NotAllowedError' ? 'Camera permission was declined. Nothing was recorded.' : 'The camera or face model could not start in this browser.');
    }
  });
  function halt() {
    running = false; stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; video.hidden = true;
    wrap.classList.remove('running'); stop.hidden = true; start.disabled = false; status.textContent = ''; face.seen = 0;
    arms.forEach(a => { a.value = [0, 0]; a.seen = 0; });
  }
  stop.addEventListener('click', halt);

  // The body model is fetched only when the visitor asks for the arms.
  function loadPose() {
    if (poser || poserLoading || !vision) return;
    poserLoading = vision.lib.PoseLandmarker.createFromOptions(vision.files, {baseOptions: {modelAssetPath: POSE, delegate: 'GPU'}, runningMode: 'VIDEO', numPoses: 1})
      .then(p => { poser = p; }).catch(error => { poserLoading = null; console.warn('Pose tracking unavailable', error); toast('Arm tracking could not start in this browser; the face keeps working.'); });
  }
  for (const b of modeButtons) b.addEventListener('click', () => {
    mode = b.dataset.mode;
    modeButtons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    startLabel.textContent = mode === 'body' ? 'Try it with your face + arms' : 'Try it with your face';
    if (mode === 'body' && running) loadPose();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) halt(); });
  await use('07-neon-skater');
}
