import {activeParameter,motionProfile,garmentSwayValue} from './motion.js?v=20261004-garment';
import {createCombinedRenderer, evaluateCombined, recipeFor, showcaseValues} from './rig-engine.js';
const rigCache=new Map();
export async function loadRig(entry) {
  if(rigCache.has(entry.id))return rigCache.get(entry.id);
  const pending=(async()=>{
    const response=await fetch(entry.rig);if(!response.ok)throw Error('The character preview could not be downloaded.');
    if(!globalThis.DecompressionStream)throw Error('This live preview needs a browser with gzip stream support. You can still download the original rig.');
    const data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    if(data.schema!=='inkinesis-web-preview-v1')throw Error('Unsupported preview format.');
    const textures=data.textures.map(s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0))),parts=[];
    const walk=n=>{if(n.type==='Part')parts.push(n);(n.children??[]).forEach(walk);};walk(data.puppet.nodes);
    return {puppet:data.puppet,textures,parts,width:data.puppet.meta.canvas.width,height:data.puppet.meta.canvas.height};
  })();rigCache.set(entry.id,pending);pending.catch(()=>rigCache.delete(entry.id));
  while(rigCache.size>3)rigCache.delete(rigCache.keys().next().value);
  return pending;
}
const controls=[['yaw','Turn','Head Angles',0,-20,20,'°'],['pitch','Nod','Head Angles',1,-10,10,'°'],['roll','Tilt','ParamAngleZ',0,-10,10,'°'],['mouth','Mouth','ParamMouthOpenY',0,0,.65,''],['shoulder','Shoulder','Arm',0,-16,16,'°'],['elbow','Elbow','Arm',1,-30,30,'°'],['hip','Hip','Leg',0,-18,18,'°'],['knee','Knee','Leg',1,0,45,'°'],['sway','Sway','ParamGarmentSway',0,-1,1,'']];
let nextViewer=0;
export class CharacterViewer {
  constructor(root,{toast=()=>{}}={}) {
    this.root=root;this.toast=toast;this.key='viewer-'+(++nextViewer);this.side='L';this.values={};this.playing=false;this.visible=true;this.token=0;this.renderQueue=Promise.resolve();
    root.innerHTML=`<div class="viewer-scene"><div class="scene-top"><span class="scene-tag"><span class="status-dot"></span><span data-scene-label>LIVE RIG</span></span><div class="view-toggle" role="group" aria-label="Source image, interactive rig, or mesh"><button type="button" data-view="source" aria-pressed="false">Illustration</button><button type="button" data-view="rig" class="active" aria-pressed="true">Rig</button><button type="button" data-view="mesh" aria-pressed="false">Mesh</button></div></div><canvas class="viewer-canvas" aria-label="Interactive character render"></canvas><canvas class="mesh-overlay" aria-hidden="true" hidden></canvas><img class="source-preview" alt="Original character illustration" hidden><div class="scene-loader" role="status"><span class="spinner"></span><span data-loading-text>Choose a character to begin.</span></div><div class="scene-caption"><span data-scene-name></span><span data-scene-state>WEB PREVIEW</span></div></div><div class="viewer-controls"><h3 class="viewer-title"></h3><p class="viewer-subtitle">One character. Independent controls.</p><div class="viewer-actions"><button class="button primary" data-action="animate" aria-pressed="false" disabled>▶ Animate</button><button class="button" data-action="reset" disabled>↺ Reset</button></div><div class="control-heading"><h4>HEAD & EXPRESSION</h4><button data-action="blink" disabled>Blink</button></div><div data-head-controls></div><div class="control-heading"><h4 data-body-heading>ARMS & LEGS</h4><div class="side-selector" role="group" aria-label="Choose anatomical side"><button class="active" data-side="L" aria-pressed="true">Left</button><button data-side="R" aria-pressed="false">Right</button></div></div><div data-body-controls></div><p class="control-note" role="status"></p><div class="viewer-downloads"><span>Original files</span><a data-download="inp" target="_blank" rel="noopener">Inochi2D ↗</a><a data-download="zip" target="_blank" rel="noopener">Live2D ↗</a></div></div><details class="prompt-details"><summary><span>THE ORIGINAL PROMPT</span><span class="prompt-preview"></span><span aria-hidden="true">+</span></summary><p class="prompt-full"></p><button class="text-button copy-prompt" data-action="copy">Copy full prompt ⧉</button></details>`;
    this.canvas=root.querySelector('.viewer-canvas');this.meshCanvas=root.querySelector('.mesh-overlay');this.loader=root.querySelector('.scene-loader');this.controlElements=new Map();
    for(const [id,label,,axis,,,unit] of controls){
      const row=document.createElement('label');row.className='control-row';row.htmlFor=this.key+'-'+id;
      row.innerHTML=`<span>${label}</span><input id="${this.key}-${id}" type="range" step="any" value="0" disabled aria-label="${id==='yaw'?'Head turn':id==='pitch'?'Head nod':id==='roll'?'Head tilt':label}"><output for="${this.key}-${id}">0${unit}</output>`;
      (root.querySelector(id==='shoulder'||id==='elbow'||id==='hip'||id==='knee'||id==='sway'?'[data-body-controls]':'[data-head-controls]')).append(row);
      const input=row.querySelector('input');this.controlElements.set(id,{input,output:row.querySelector('output'),row});
      input.addEventListener('input',()=>{const value=Number(input.value);this.setView(this.meshMode?'mesh':'rig');this.setPlaying(false);const name=this.controlName(id);if(this.values[name])this.values[name][axis]=value;this.syncControls();this.draw();});
    }
    root.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>{this.side=b.dataset.side;root.querySelectorAll('[data-side]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});this.syncControls();});
    root.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>this.setView(b.dataset.view));
    root.querySelector('[data-action="animate"]').onclick=()=>{this.setView(this.meshMode?'mesh':'rig');this.setPlaying(!this.playing);};
    root.querySelector('[data-action="reset"]').onclick=()=>{this.setPlaying(false);this.blinkAt=0;this.values=this.defaults();this.syncControls();this.draw();};
    root.querySelector('[data-action="blink"]').onclick=()=>{this.setView(this.meshMode?'mesh':'rig');this.blinkAt=performance.now();};
    root.querySelector('[data-action="copy"]').onclick=async()=>{try{await copyText(this.entry.prompt);this.toast('Original prompt copied.');}catch{this.toast('Select the prompt text to copy it.');}};
    this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(this.canvas);
    this.visibilityObserver=new IntersectionObserver(([entry])=>{this.visible=entry.isIntersecting;if(this.visible)this.draw();});this.visibilityObserver.observe(root);
    this.frame=now=>{if(this.destroyed)return;if(this.visible&&!document.hidden&&(this.playing||this.blinkAt)&&!this.sourceMode){if(!this.lastFrame||now-this.lastFrame>1000/30){this.draw(now);this.lastFrame=now;}}this.animationFrame=requestAnimationFrame(this.frame);};this.animationFrame=requestAnimationFrame(this.frame);
  }
  controlName(id){const c=controls.find(c=>c[0]===id);return c[2]==='Arm'||c[2]==='Leg'?c[2]+' '+this.side:c[2];}
  defaults(){return Object.fromEntries((this.asset?.puppet.param??[]).map(p=>[p.name,[...p.defaults]]));}
  async load(entry){
    const ticket=++this.token;this.entry=entry;this.asset=null;this.setPlaying(false);this.blinkAt=0;this.lastPose=null;delete this.root.dataset.ready;this.loader.hidden=false;this.loader.querySelector('.spinner').hidden=false;
    this.root.querySelector('[data-loading-text]').textContent=`Loading ${entry.name} · ${(entry.bytes/1e6).toFixed(1)} MB`;
    this.root.querySelector('.viewer-title').textContent=entry.name;this.root.querySelector('[data-scene-name]').textContent=entry.name;
    this.root.querySelector('.source-preview').src=entry.image;this.root.querySelector('.source-preview').alt=entry.name+' original illustration';
    this.root.querySelector('.prompt-full').textContent=entry.prompt;this.root.querySelector('.prompt-preview').textContent=entry.excerpt;
    this.root.querySelector('[data-download="inp"]').href=entry.downloads['character.inp'];this.root.querySelector('[data-download="zip"]').href=entry.downloads['Live2D.zip'];
    this.root.querySelector('.prompt-details').open=false;this.setView('rig');this.syncControls();
    try{
      const asset=await loadRig(entry);if(ticket!==this.token||this.destroyed)return;
      this.renderQueue=this.renderQueue.catch(()=>{}).then(async()=>{
        if(ticket!==this.token||this.destroyed)return;
        this.renderer?.dispose();this.renderer=null;
        const renderer=await createCombinedRenderer(this.canvas,asset,{background:[1,1,1]});
        if(ticket!==this.token||this.destroyed){renderer.dispose();return;}
        this.asset=asset;this.renderer=renderer;
        this.meshEdges=asset.parts.map(part=>{const edges=new Map(),idx=part.mesh.indices;for(let i=0;i<idx.length;i+=3)for(const [a,b] of [[idx[i],idx[i+1]],[idx[i+1],idx[i+2]],[idx[i+2],idx[i]]]){const lo=Math.min(a,b),hi=Math.max(a,b);edges.set(lo+':'+hi,[lo,hi]);}return [...edges.values()];});this.recipe=recipeFor(asset.puppet);this.values=this.defaults();this.loader.hidden=true;this.syncControls();this.draw();
        this.root.dataset.ready=entry.id;
      });await this.renderQueue;
    }catch(error){if(ticket!==this.token||this.destroyed)return;this.loader.querySelector('[data-loading-text]').textContent=(error instanceof Error?error.message:'Preview unavailable.')+' The original files remain available below.';this.loader.querySelector('.spinner').hidden=true;this.toast('Live preview unavailable. The illustration and original files are still available.');}
  }
  setView(mode){this.sourceMode=mode==='source';this.meshMode=mode==='mesh';this.meshCanvas.hidden=!this.meshMode;this.canvas.style.opacity=this.meshMode?'.55':'1';this.root.querySelectorAll('[data-view]').forEach(b=>{const chosen=b.dataset.view===mode;b.classList.toggle('active',chosen);b.setAttribute('aria-pressed',String(chosen));});this.root.querySelector('.source-preview').hidden=!this.sourceMode;this.canvas.style.visibility=this.sourceMode?'hidden':'visible';this.root.querySelector('[data-scene-label]').textContent=this.sourceMode?'ORIGINAL ILLUSTRATION':this.meshMode?'DEFORMED MESH':'LIVE RIG';if(this.sourceMode){this.setPlaying(false);this.loader.hidden=true;}else{this.loader.hidden=Boolean(this.asset);this.draw();}}
  setPlaying(value){if(!value&&this.playing&&this.lastPose)this.values=structuredClone(this.lastPose);this.playing=value;if(value){this.started=performance.now();this.values=this.defaults();}const button=this.root.querySelector('[data-action="animate"]');button.textContent=value?'Ⅱ Pause':'▶ Animate';button.setAttribute('aria-pressed',String(value));if(!value&&this.asset){this.syncControls();this.draw();}}
  syncControls(display=this.values){
    const caps=this.asset?.puppet.meta.motionCapabilities,profile=motionProfile(this.asset?.puppet),garmentOnly=profile.garmentSway&&!profile.arms.length&&!profile.legs.length;
    for(const [id,, ,axis,safeMin,safeMax,unit] of controls){
      const {input,output,row}=this.controlElements.get(id),name=this.controlName(id),p=activeParameter(this.asset?.puppet,name);
      const cap=(name.startsWith('Arm')||name.startsWith('Leg'))?caps?.chains?.[name]:id==='sway'?undefined:id==='mouth'?caps?.face?.mouth:(caps?.headAxes?.[id]??caps?.face?.head);
      row.hidden=id==='sway'?!profile.garmentSway:garmentOnly&&['shoulder','elbow','hip','knee'].includes(id);
      input.disabled=!p||cap?.mode==='fixed';row.title=input.disabled?'This movement is held still for this character.':'';
      if(p){input.min=String(Math.max(p.min[axis],safeMin));input.max=String(Math.min(p.max[axis],safeMax));input.value=String(display[name]?.[axis]??p.defaults[axis]);}
      output.textContent=input.disabled?'—':Number(Number(input.value).toFixed(unit?1:2))+unit;
    }
    const hasRig=Boolean(this.asset);this.root.querySelector('[data-action="animate"]').disabled=!hasRig;this.root.querySelector('[data-action="reset"]').disabled=!hasRig;
    this.root.querySelector('[data-action="blink"]').disabled=!hasRig||caps?.face?.blink?.mode==='fixed'||!['ParamEyeLOpen','ParamEyeROpen'].every(n=>this.asset.puppet.param.some(p=>p.name===n&&p.bindings.length));
    this.root.querySelector('[data-body-heading]').textContent=garmentOnly?'GARMENT':profile.garmentSway?'ARMS, LEGS & GARMENT':'ARMS & LEGS';
    this.root.querySelector('.side-selector').hidden=garmentOnly;
    const available=[...profile.arms,...profile.legs],names={'Arm L':'left arm','Arm R':'right arm','Leg L':'left leg','Leg R':'right leg'};
    const unavailable=Object.keys(names).filter(name=>!available.includes(name)).map(name=>names[name]);
    this.root.querySelector('.control-note').textContent=!hasRig?'Preparing the character…':garmentOnly?'Garment sway and facial controls are available. This rig has no independent arm or leg controls.'+(this.entry.swayNote?' '+this.entry.swayNote:''):unavailable.length?'No independent motion for this design: '+unavailable.join(', ')+'.':'Both arms and legs are available. Preview angles stay within a gentle range.';
  }
  draw(now=performance.now()){
    if(!this.renderer||!this.asset||this.sourceMode||this.destroyed)return;
    let values=this.values;
    if(this.playing){
      const seconds=(now-this.started)/1000;
      values={...this.defaults(),...showcaseValues(this.asset.puppet,this.recipe,seconds)};
      const sway=activeParameter(this.asset.puppet,'ParamGarmentSway');
      if(sway)values.ParamGarmentSway=[garmentSwayValue(sway,seconds),...sway.defaults.slice(1)];
    }
    if(this.blinkAt){const dt=now-this.blinkAt;if(dt>340)this.blinkAt=0;else{const open=dt<130?1-dt/130:dt<190?0:(dt-190)/150;values={...values,ParamEyeLOpen:[open],ParamEyeROpen:[open]};}}
    this.lastPose=values;this.renderer.draw(values);if(this.meshMode)this.drawMesh(values);if(this.playing)this.syncControls(values);
    this.root.querySelector('[data-scene-state]').textContent=this.playing?'4-SECOND MOTION STUDY':'WEB PREVIEW';
  }
  drawMesh(values){
    const overlay=this.meshCanvas,ctx=overlay.getContext('2d'),rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);
    const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h;}
    overlay.style.width=rect.width+'px';overlay.style.height=rect.height+'px';
    ctx.clearRect(0,0,w,h);const scale=Math.min(w/this.asset.width,h/this.asset.height)*.96;
    ctx.save();ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.lineWidth=.65*dpr/scale;ctx.strokeStyle='rgba(0,0,0,.35)';
    const posed=evaluateCombined(this.asset,values);ctx.beginPath();
    for(let i=0;i<posed.length;i++){const p=posed[i];if(!p.enabled||p.opacity<=.05)continue;for(const [a,b]of this.meshEdges[i]){ctx.moveTo(p.xy[a*2],p.xy[a*2+1]);ctx.lineTo(p.xy[b*2],p.xy[b*2+1]);}}
    ctx.stroke();ctx.restore();
  }
  destroy(){this.destroyed=true;++this.token;cancelAnimationFrame(this.animationFrame);this.resizeObserver.disconnect();this.visibilityObserver.disconnect();this.renderer?.dispose();this.renderer=null;this.canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();this.root.replaceChildren();}
}
export async function copyText(value){if(navigator.clipboard&&globalThis.isSecureContext){await navigator.clipboard.writeText(value);return;}const field=document.createElement('textarea');field.value=value;field.style.cssText='position:fixed;left:-9999px';document.body.append(field);field.select();const success=document.execCommand('copy');field.remove();if(!success)throw Error('Clipboard unavailable');}
