const reduced=matchMedia('(prefers-reduced-motion: reduce)');
for(const el of document.querySelectorAll('.comparison')){
 const input=el.querySelector('input'),stage=el.querySelector('.comparison-stage'),output=el.querySelector('output');
 const update=value=>{input.value=String(value);stage.style.setProperty('--split',value+'%');output.value=Math.round(value)+'%';input.setAttribute('aria-valuetext',Math.round(value)+'% Inkinesis view revealed');};
 input.addEventListener('input',()=>update(Number(input.value)));
 const point=e=>{const rect=stage.getBoundingClientRect();update(Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100)));};
 stage.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;stage.setPointerCapture(e.pointerId);point(e);});
 stage.addEventListener('pointermove',e=>{if(stage.hasPointerCapture(e.pointerId))point(e);});
 update(50);
}
const story=document.querySelector('#layer-story'),stage=document.querySelector('#layer-stage'),slider=document.querySelector('#layer-spread'),follow=document.querySelector('#layer-follow'),state=document.querySelector('#layer-status');
if(story){
 follow.checked=!reduced.matches;
 let data=[],visible=false,pending=false;
 const paint=()=>{pending=false;if(!data.length)return;
  if(follow.checked){const rect=stage.getBoundingClientRect(),distance=rect.height+innerHeight*.7,t=Math.max(0,Math.min(1,(innerHeight*.85-rect.top)/distance));slider.value=String(Math.round(Math.sin(Math.PI*t)**2*100));}
  const a=Number(slider.value)/100,w=stage.clientWidth,h=stage.clientHeight,base=Math.min(330,h*.9,w*.8)/1280,cols=w<600?2:3,rows=Math.ceil(data.length/cols),cellW=w/cols,cellH=h/rows;
  const order=cols===3?['back-hair','face','front-hair','arms','clothing','legs']:['back-hair','front-hair','face','arms','clothing','legs'];
  const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  // Anatomical target order keeps the legs below the face throughout separation.
  const travel=ease(a);
  for(const item of data){
   const i=order.indexOf(item.id),[x,y,bw,bh]=item.box,scale=Math.min((cellW-20)/bw,(cellH-36)/bh);
   const size=base+(scale-base)*travel;
   const rx=w/2+(x+bw/2-640)*base,ry=h/2+(y+bh/2-640)*base,tx=cellW*(i%cols+.5),ty=cellH*(Math.floor(i/cols)+.5)-12;
   const img=stage.querySelector('[data-layer="'+item.id+'"]'),label=stage.querySelector('[data-layer-label="'+item.id+'"]');
   img.style.left=(rx+(tx-rx)*travel-bw*size/2)+'px';img.style.top=(ry+(ty-ry)*travel-bh*size/2)+'px';img.style.width=bw*size+'px';
   label.style.left=tx+'px';label.style.top=(cellH*(Math.floor(i/cols)+1)-25)+'px';label.style.visibility=a>=.99?'visible':'hidden';
  }
  state.textContent=a<.05?'Assembled layers':a>.95?'Separated semantic groups':Math.round(a*100)+'% separated';
 };
 const schedule=()=>{if(!pending&&visible){pending=true;requestAnimationFrame(paint);}};
 slider.addEventListener('input',()=>{follow.checked=false;paint();});follow.addEventListener('change',paint);
 document.querySelector('#layer-reset').onclick=()=>{follow.checked=false;slider.value='0';paint();};
 new ResizeObserver(schedule).observe(stage);
 new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible)schedule();}).observe(story);
 addEventListener('scroll',()=>{if(follow.checked)schedule();},{passive:true});
 try{const response=await fetch('static/media/research/layers.json');if(!response.ok)throw Error('Layer images unavailable.');data=await response.json();for(const item of data){const img=document.createElement('img');img.dataset.layer=item.id;img.src=item.image;img.alt=item.label+' semantic layers';img.width=Math.round(item.box[2]);img.height=Math.round(item.box[3]);img.loading='lazy';stage.append(img);const label=document.createElement('span');label.dataset.layerLabel=item.id;label.textContent=item.label;stage.append(label);}paint();}catch(error){state.textContent=error.message;slider.disabled=true;follow.disabled=true;}
}
for(const video of document.querySelectorAll('.limitation-video')){
 new IntersectionObserver(([entry])=>{if(!entry.isIntersecting)video.pause();else if(!reduced.matches)video.play().catch(()=>{});},{threshold:.5}).observe(video);
}

// One decoded video contains both variants, so every comparison frame is synchronized.
const facialVideo=document.querySelector('#facial-video');
if(facialVideo){
 const card=document.querySelector('#facial-comparison'),canvas=document.querySelector('#facial-canvas'),ctx=canvas.getContext('2d'),range=card.querySelector('input'),toggle=document.querySelector('#facial-toggle');
 const poster=new Image();poster.src='static/media/research/obsidian-pitch-motion-poster.webp?v=wide';
 let visible=false,userPaused=false,automaticPause=false,frameRequest=0;
 const paint=()=>{
  const source=facialVideo.readyState>=2?facialVideo:poster,sw=source.videoWidth||source.naturalWidth,sh=source.videoHeight||source.naturalHeight;if(!sw||!sh)return;
  const bounds=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2),w=Math.max(1,Math.round(bounds.width*dpr)),h=Math.max(1,Math.round(bounds.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const half=sw/2,scale=Math.min(w/half,h/sh),dw=half*scale,dh=sh*scale,x=(w-dw)/2,y=(h-dh)/2;
  // Video halves: source on the left, Inkinesis on the right.
  // Reveal Inkinesis behind a divider that follows the pointer to the right.
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(source,0,0,half,sh,x,y,dw,dh);
  ctx.save();ctx.beginPath();ctx.rect(0,0,w*Number(range.value)/100,h);ctx.clip();ctx.drawImage(source,half,0,half,sh,x,y,dw,dh);ctx.restore();
 };
 const syncButton=()=>{toggle.textContent=facialVideo.paused?'Play':'Pause';toggle.setAttribute('aria-label',(facialVideo.paused?'Play':'Pause')+' facial movement');};
 const tick=()=>{paint();if(!facialVideo.paused)frameRequest=requestAnimationFrame(tick);};
 const autoPause=()=>{if(!facialVideo.paused){automaticPause=true;facialVideo.pause();}};
 const resume=()=>{if(visible&&!document.hidden&&!reduced.matches&&!userPaused)facialVideo.play().catch(syncButton);};
 facialVideo.addEventListener('pause',()=>{if(automaticPause)automaticPause=false;else userPaused=true;cancelAnimationFrame(frameRequest);syncButton();paint();});
 facialVideo.addEventListener('play',()=>{userPaused=false;cancelAnimationFrame(frameRequest);syncButton();tick();});
 for(const event of ['loadeddata','seeked'])facialVideo.addEventListener(event,paint);
 poster.onload=paint;new ResizeObserver(paint).observe(canvas);
 range.addEventListener('input',paint);new MutationObserver(paint).observe(card.querySelector('.comparison-stage'),{attributes:true,attributeFilter:['style']});
 toggle.onclick=()=>{if(facialVideo.paused)facialVideo.play().catch(syncButton);else facialVideo.pause();};
 new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)resume();else autoPause();},{threshold:.35}).observe(canvas);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();else resume();});
 reduced.addEventListener('change',()=>{if(reduced.matches)autoPause();else resume();});
 syncButton();
}

// The saved ablation changes garment assignment only; both images switch together.
const ownership=document.querySelector('#ownership');
if(ownership){
 const modes={
  nearestBone:{title:'Nearest bone',description:'Assigning each pixel to the closest chain gives parts of the jacket front to an arm. When the arms cross, that fabric is pulled across the torso.',count:4131},
  soft:{title:'Soft falloff',description:'Distance-based weights fade the arm influence gradually. The influence also reaches the shirt front, stretching fabric that should remain on the torso.',count:12697},
  anatomical:{title:'Inkinesis',description:'Anatomy and the garment’s visible shape define the sleeve boundaries, keeping more of the torso fabric anchored as the arms move.',count:1380}
 };
 const map=ownership.querySelector('#ownership-map'),pose=ownership.querySelector('#ownership-pose'),buttons=[...ownership.querySelectorAll('[data-ownership]')],show=ownership.querySelector('#show-moved'),overlays=[ownership.querySelector('#moved-map'),ownership.querySelector('#moved-pose')];
 let ticket=0;
 const overlayVisibility=()=>{overlays.forEach(img=>img.hidden=!show.checked);ownership.querySelector('#moved-note').hidden=!show.checked;};
 show.addEventListener('change',overlayVisibility);
 overlayVisibility();
 const select=async mode=>{
  const current=++ticket,info=modes[mode],sources=['ownership-'+mode+'.webp','ownership-pose-'+mode+'.webp','moved-map-'+mode+'.png','moved-pose-'+mode+'.png'].map(name=>'static/media/method/'+name);
  try{
   await Promise.all(sources.map(src=>{const image=new Image();image.src=src;return image.decode();}));if(current!==ticket)return;
   map.src=sources[0];map.alt=info.title+': ownership of Saffron Orbit’s topwear pixels';pose.src=sources[1];pose.alt=info.title+': jacket at the identical recorded crossed-arm pose';overlays.forEach((img,i)=>img.src=sources[i+2]);
   buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ownership===mode)));
   ownership.querySelector('#ownership-rule').textContent=info.title;ownership.querySelector('#ownership-description').textContent=info.description;
   ownership.querySelector('#ownership-metric').textContent=(info.count/40985*100).toFixed(1)+'%';ownership.querySelector('#ownership-count').textContent=info.count.toLocaleString('en-US')+' of 40,985 pixels';overlayVisibility();
  }catch{if(current===ticket)ownership.querySelector('#ownership-description').textContent='This comparison could not be loaded. Please try the rule again.';}
 };
 buttons.forEach(b=>b.addEventListener('click',()=>select(b.dataset.ownership)));

}
const methodSteps=[...document.querySelectorAll('[data-method-step]')],pipelinePanels=[...document.querySelectorAll('.pipeline-v2 [data-pipeline-step]')];
const highlightMethod=step=>{methodSteps.forEach(el=>el.classList.toggle('is-highlighted',el.dataset.methodStep===step));pipelinePanels.forEach(el=>el.classList.toggle('is-highlighted',el.dataset.pipelineStep===step));};
for(const el of [...methodSteps,...pipelinePanels]){
 const step=el.dataset.methodStep||el.dataset.pipelineStep;
 el.addEventListener('pointerenter',()=>highlightMethod(step));el.addEventListener('pointerleave',()=>highlightMethod(document.activeElement?.dataset.methodStep));
 el.addEventListener('focus',()=>highlightMethod(step));el.addEventListener('blur',()=>highlightMethod(null));
}
