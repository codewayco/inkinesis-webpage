import {CharacterViewer,copyText} from './viewer.js?v=20261004-research';
const $=s=>document.querySelector(s),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let toastTimer;const toast=message=>{clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2800);};
const hero=$('#hero-video'),pause=$('#hero-pause');let heroManuallyPaused=reduced.matches;
function syncHero(){const playing=!hero.paused;pause.innerHTML=playing?'Pause <span aria-hidden="true">Ⅱ</span>':'Play <span aria-hidden="true">▶</span>';pause.setAttribute('aria-label',playing?'Pause character animation':'Play character animation');}
const heroViewport=matchMedia('(max-width: 700px)');
function updateHeroComposition(){
 const mobile=heroViewport.matches,wasPlaying=!hero.paused;
 hero.poster='static/media/'+(mobile?'hero-mobile-poster.webp':'hero-poster.webp')+'?v=20261005-cast';
 hero.querySelector('source').src='static/media/'+(mobile?'hero-mobile.mp4':'hero-loop.mp4')+'?v=20261005-cast';
 hero.setAttribute('aria-label',(mobile?'Three':'Five')+' Inkinesis rigs performing their supported arm, leg, head and expression controls');
 hero.load();if(wasPlaying&&!heroManuallyPaused)hero.play().catch(()=>{});else hero.pause();
}
if(heroViewport.matches)updateHeroComposition();
heroViewport.addEventListener('change',updateHeroComposition);
if(reduced.matches)hero.pause();hero.addEventListener('play',syncHero);hero.addEventListener('pause',syncHero);hero.addEventListener('error',()=>{pause.disabled=true;});
pause.onclick=()=>{heroManuallyPaused=!hero.paused;if(hero.paused){hero.play().catch(()=>toast('Use the video controls to start playback.'));}else hero.pause();};syncHero();
new IntersectionObserver(([entry])=>{if(!entry.isIntersecting)hero.pause();else if(!heroManuallyPaused&&!document.hidden)hero.play().catch(()=>{});},{threshold:.1}).observe(hero);
const dialog=$('#character-dialog'),fullVideo=$('#full-video');let modalViewer,inlineViewer;
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>document.getElementById(button.dataset.close).close();
for(const modal of document.querySelectorAll('dialog'))modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}});
$('#watch-video').onclick=()=>{$('#video-dialog').showModal();hero.pause();inlineViewer?.setPlaying(false);fullVideo.play().catch(()=>{});};
$('#video-dialog').addEventListener('close',()=>{fullVideo.pause();if(!heroManuallyPaused&&!reduced.matches)hero.play().catch(()=>{});});
$('#zoom-pipeline').onclick=()=>$('#figure-dialog').showModal();
dialog.addEventListener('close',()=>{modalViewer?.destroy();modalViewer=null;});
$('#copy-citation').onclick=async()=>{try{await copyText($('#citation-code').textContent);toast('Citation copied.');$('#copy-status').textContent='Citation copied.';}catch{toast('Select the citation text to copy it.');}};
for(const video of document.querySelectorAll('.app-film-frame video')){
 const observer=new IntersectionObserver(([e])=>{if(!e.isIntersecting)video.pause();else if(!reduced.matches)video.play().catch(()=>{});},{threshold:.35});observer.observe(video);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){document.querySelectorAll('video').forEach(v=>v.pause());}else if(!heroManuallyPaused&&!reduced.matches&&hero.getBoundingClientRect().bottom>0)hero.play().catch(()=>{});});
const sectionObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){document.querySelectorAll('.site-header nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+(e.target.id==='comparisons'?'method':e.target.id)));}},{rootMargin:'-15% 0px -55% 0px'});document.querySelectorAll('main>section[id],#comparisons').forEach(s=>sectionObserver.observe(s));
try{
 const response=await fetch('static/avatars.json?v=20261004-research');if(!response.ok)throw Error('The character catalog could not be loaded.');const entries=await response.json();
 const featured=['04-purple-couture','21-ochre-nomad','27-ruby-encore','35-saffron-jester-acrobat'].map(id=>entries.find(e=>e.id===id));
 inlineViewer=new CharacterViewer($('#inline-viewer'),{toast});let selected=featured[0],loaded=false;
 for(const entry of featured){const button=document.createElement('button');button.type='button';button.className='featured-tab';button.classList.toggle('active',entry===selected);button.setAttribute('aria-pressed',String(entry===selected));const img=document.createElement('img');img.src=entry.image;img.alt='';img.width=26;img.height=37;button.append(img,document.createTextNode(entry.name));button.onclick=()=>{selected=entry;loaded=true;$('#featured-tabs').querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});void inlineViewer.load(entry);};$('#featured-tabs').append(button);}
 const loadObserver=new IntersectionObserver(([e])=>{if(e.isIntersecting&&!loaded){loaded=true;void inlineViewer.load(selected);loadObserver.disconnect();}},{rootMargin:'250px'});loadObserver.observe($('#inline-viewer'));
 let filter='all',expanded=false,query='';
 function openCharacter(entry,button){inlineViewer.setPlaying(false);modalViewer?.destroy();$('#dialog-title').textContent=entry.name;dialog.showModal();dialog.scrollTop=0;modalViewer=new CharacterViewer($('#dialog-viewer'),{toast});void modalViewer.load(entry);dialog.addEventListener('close',()=>button.focus({preventScroll:true}),{once:true});}
 function renderGallery(){
  const matched=entries.filter(e=>(filter==='all'||filter==='full'&&e.arms===2&&e.legs===2||filter==='gestures'&&e.arms>0)&&(!query||(e.name+' '+e.prompt).toLowerCase().includes(query)));
  const visible=expanded||query||filter!=='all'?matched:matched.slice(0,12);$('#character-grid').replaceChildren();
  for(const entry of visible){const button=document.createElement('button');button.type='button';button.className='character-card';button.dataset.character=entry.id;button.setAttribute('aria-label',`Explore ${entry.name}: animate the rig and read its prompt`);
   const frame=document.createElement('span');frame.className='card-image';frame.style.display='block';const img=document.createElement('img');img.src=entry.image;img.alt=entry.name+' original illustration';img.loading='lazy';img.width=260;img.height=350;const id=document.createElement('span');id.className='card-id';id.textContent=entry.id.slice(0,2);const arrow=document.createElement('span');arrow.className='card-open';arrow.setAttribute('aria-hidden','true');arrow.textContent='↗';frame.append(id,img,arrow);
   const name=document.createElement('span');name.className='card-name';name.textContent=entry.name;const motion=document.createElement('span');motion.className='card-motion';motion.textContent=entry.garmentSway?'Garment sway & expression':entry.arms===2&&entry.legs===2?'Arms, legs & expression':entry.arms>0?'Gesture & expression':'Design-specific motion';button.append(frame,name,motion);button.onclick=()=>openCharacter(entry,button);$('#character-grid').append(button);
  }
  $('#gallery-count').textContent=`${visible.length} of ${matched.length} characters${query?' match your search':''}`;$('#gallery-status').textContent=matched.length+' matching characters.';$('#show-all').hidden=visible.length===matched.length;$('#no-characters').hidden=matched.length>0;
 }
 document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});renderGallery();});
 $('#character-search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();renderGallery();});$('#show-all').onclick=()=>{expanded=true;renderGallery();};renderGallery();
}catch(error){$('#gallery-count').textContent=error.message+' Please reload the page.';$('#show-all').hidden=true;toast('The character collection is temporarily unavailable.');}
