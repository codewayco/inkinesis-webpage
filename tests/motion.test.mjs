import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {motionProfile,garmentSwayValue} from '../static/js/motion.js';
import {evaluateCombined} from '../static/js/rig-engine.js';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(readFileSync(new URL('static/avatars.json',root)));
const read=e=>JSON.parse(gunzipSync(readFileSync(new URL(e.rig,root)))).puppet;
test('missing chain metadata does not invent moving limbs',()=>{
 assert.deepEqual(motionProfile({meta:{},param:[]}),{arms:[],legs:[],garmentSway:false});
 const param=[{name:'Arm L',bindings:[{}]}];
 assert.equal(motionProfile({meta:{},param}).arms.length,1);
 assert.equal(motionProfile({meta:{motionCapabilities:{chains:{'Arm L':{mode:'fixed'}}}},param}).arms.length,0);
 assert.equal(motionProfile({meta:{capabilities:{arms:false}},param}).arms.length,0);
});
test('every catalog motion label agrees with actual bound rig parameters',()=>{
 for(const e of catalog){const profile=motionProfile(read(e));assert.equal(e.arms,profile.arms.length,e.id);assert.equal(e.legs,profile.legs.length,e.id);assert.equal(e.garmentSway,profile.garmentSway,e.id);}
});
test('garment controls change geometry within the source range and return to rest',()=>{
 for(const e of catalog.filter(e=>e.garmentSway)){
  const puppet=read(e),parameter=puppet.param.find(p=>p.name==='ParamGarmentSway'),parts=[];
  const walk=n=>{if(n.type==='Part')parts.push(n);(n.children??[]).forEach(walk);};walk(puppet.nodes);
  const a=evaluateCombined({puppet,parts},{ParamGarmentSway:[-1,0]}),b=evaluateCombined({puppet,parts},{ParamGarmentSway:[1,0]});
  let delta=0;for(let i=0;i<a.length;i++)for(let j=0;j<a[i].xy.length;j++)delta=Math.max(delta,Math.abs(a[i].xy[j]-b[i].xy[j]));assert(delta>0,e.id+' must have a nonzero stored deformation');
  if(delta<1)assert(e.swayNote?.includes('extremely small'),'Subpixel sway must be disclosed');
  for(let seconds=0;seconds<12;seconds+=.013){const value=garmentSwayValue(parameter,seconds);assert(value>=parameter.min[0]&&value<=parameter.max[0]);}
  for(const seconds of [0,1.2,2.6,4])assert.equal(garmentSwayValue(parameter,seconds),parameter.defaults[0]);
 }
});
