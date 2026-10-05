// Capability checks require a real, bound parameter; missing metadata is not a limb.
export function activeParameter(puppet,name){
  const p=puppet?.param.find(p=>p.name===name&&p.bindings?.length);
  if(!p||puppet.meta.motionCapabilities?.chains?.[name]?.mode==='fixed')return undefined;
  if(name.startsWith('Arm ')&&puppet.meta.capabilities?.arms===false)return undefined;
  if(name.startsWith('Leg ')&&puppet.meta.capabilities?.legs===false)return undefined;
  if(name==='ParamGarmentSway'&&puppet.meta.capabilities?.garment===false)return undefined;
  return p;
}
export function motionProfile(puppet){
  return {
    arms:['Arm L','Arm R'].filter(name=>activeParameter(puppet,name)),
    legs:['Leg L','Leg R'].filter(name=>activeParameter(puppet,name)),
    garmentSway:Boolean(activeParameter(puppet,'ParamGarmentSway')),
  };
}
// Two bounded cloth gestures, then rest during the existing face sequence.
export function garmentSwayValue(parameter,seconds){
  const rest=parameter.defaults[0];
  if(seconds<0)return rest;
  const t=seconds%4,keys=[[0,0],[.6,.65],[1.2,0],[1.9,-.65],[2.6,0],[4,0]];
  let amount=0;
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
    const [a,x]=keys[i-1],[b,y]=keys[i],u=(t-a)/(b-a),ease=u*u*(3-2*u);
    amount=x+(y-x)*ease;break;
  }
  const extent=amount<0?rest-parameter.min[0]:parameter.max[0]-rest;
  return Math.max(parameter.min[0],Math.min(parameter.max[0],rest+amount*extent));
}
