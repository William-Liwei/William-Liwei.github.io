/* Parking geometry and persistence are shared by the city and traffic workshop. */
(function(root,factory){const api=factory(typeof module==='object'?require('./network.js'):root.Network);if(typeof module==='object')module.exports=api;else root.Parking=api;})(globalThis,function(Net){
'use strict';
const LOTS={
 small:{label:'社区停车场',slots:14,w:20,h:14,cost:4200,monthly:58,dwell:42},
 large:{label:'街区公共停车场',slots:32,w:33,h:24,cost:10700,monthly:142,dwell:42},
 garage:{label:'公共立体车库',slots:58,w:25,h:22,cost:21900,monthly:260,dwell:42}
};
const clamp=Net.clamp, ground=e=>e.kind==='road'&&(e.pts||[]).length>1&&e.pts.every(p=>Math.abs(p.z||0)<=2.5);
function lotType(type){return Object.hasOwn(LOTS,type)?LOTS[type]:null;}
function validFee(fee){return Number.isFinite(+fee)?Math.round(clamp(+fee,0,12)):0;}
function normalize(stored){
 const state={lots:[],next:1};const seen=new Set();
 if(!Array.isArray(stored?.lots))return state;
 for(const lot of stored.lots.slice(0,150)){
  if(!lot||typeof lot.id!=='string'||!/^P[0-9]{1,10}$/.test(lot.id)||seen.has(lot.id)||!lotType(lot.type)||![lot.x,lot.y].every(Number.isFinite))continue;
  if(lot.x<0||lot.x>1200||lot.y<0||lot.y>800)continue;
  seen.add(lot.id);state.next=Math.max(state.next,+lot.id.slice(1)+1);
  state.lots.push({id:lot.id,type:lot.type,x:lot.x,y:lot.y,fee:validFee(lot.fee)});
 }
 if(Number.isSafeInteger(stored.next)&&stored.next>0&&stored.next<1e10)state.next=Math.max(state.next,stored.next);
 return state;
}
function access(net,p,max=34){
 const roads=net.edges.filter(ground), sample=Net.snap({nodes:[],edges:roads},{x:p.x,y:p.y,z:0},max,true);
 if(!sample?.edge)return null;
 const e=roads.find(e=>e.id===sample.edge);
 if(!e)return null;
 const a=e.pts[0],b=e.pts.at(-1);
 return {edge:e.id,node:Net.dist(sample,a)<=Net.dist(sample,b)?e.a:e.b,dist:Net.dist(sample,p),
  near:{x:sample.x,y:sample.y},half:Net.crossSection(e).width/2};
}
function validate(state,net,p,type,isLand,occupied=[]){
 const spec=lotType(type);
 if(!spec)return {ok:false,reason:'请选择停车设施'};
 if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return {ok:false,reason:'无有效位置'};
 for(const sx of [-.5,0,.5])for(const sy of [-.5,0,.5]){
  if(!isLand({x:p.x+spec.w*sx,y:p.y+spec.h*sy,z:0}))return {ok:false,reason:'停车场的整个占地必须在陆地内'};
 }
 const a=access(net,p);
 if(!a)return {ok:false,reason:'停车入口需距普通地面道路不超过 34 米（不能只连高速或匝道）'};
 const footprint=a.dist>0?(spec.w*Math.abs(p.x-a.near.x)+spec.h*Math.abs(p.y-a.near.y))/(2*a.dist):0;
 if(a.dist<=footprint+a.half+1.5)return {ok:false,reason:'占地与路面重叠，把停车场移到路边'};
 const overlaps=(q,x,y)=>Math.abs(q.x-p.x)<(x+spec.w)/2+2&&Math.abs(q.y-p.y)<(y+spec.h)/2+2;
 if(state.lots.some(l=>overlaps(l,LOTS[l.type].w,LOTS[l.type].h))||occupied.some(l=>overlaps(l,l.w||11,l.h||11)))return {ok:false,reason:'停车占地与已有设施重叠'};
 if(state.lots.length>=150)return {ok:false,reason:'此城市的停车设施已达上限'};
 return {ok:true,access:a,spec};
}
function build(net,state){
 const curb=Object.create(null), byNode=Object.create(null), configs=[];
 const push=(n,site)=>{configs.push(site);(byNode[n]??=[]).push(site);};
 for(const e of net.edges){
  if(!ground(e))continue;
  const len=+e.len||Net.length(e.pts);
  if(len<21)continue;
  const per=Math.min(8,Math.max(1,Math.floor(len/22)));
  curb[e.a]=(curb[e.a]||0)+per;curb[e.b]=(curb[e.b]||0)+per;
 }
 const lookup=new Map(net.nodes.map(n=>[n.id,n]));
 for(const [id,spaces] of Object.entries(curb)){
  const n=lookup.get(id);if(n)push(id,{id:'curb:'+id,type:'curb',node:id,spots:Math.min(25,spaces),fee:0,dwell:43,x:n.x,y:n.y});
 }
 for(const lot of state?.lots||[]){
  const a=access(net,lot),spec=lotType(lot.type);
  if(a&&spec)push(a.node,{...lot,node:a.node,road:a.edge,spots:spec.slots,dwell:spec.dwell});
 }
 // The street simulator stops cars at this node. Never grant a space on
 // another node merely because it is within walking distance.
 const destinations=new Map(Object.entries(byNode).map(([node,sites])=>{
  const n=lookup.get(node);
  return [node,sites.map(s=>({id:s.id,walk:s.type==='curb'?0:Math.round(Net.dist(n,s))})).sort((a,b)=>a.walk-b.walk||a.id.localeCompare(b.id))];
 }));
 const candidates=node=>destinations.get(node)||[];
 return {configs,candidates};
}
function service(specs,candidates){
 const data=new Map(), running=new Set(), stats={served:0,released:0,attempts:0,fee:0,peak:0};
 let occupied=0;
 for(const row of specs||[])if(row?.id&&row?.spots>0)data.set(row.id,{...row,visits:0,busy:[]});
 function advance(now){
  for(const s of running){
   let count=0;
   for(let i=s.busy.length-1;i>=0;i--)if(s.busy[i]<=now){s.busy[i]=s.busy.at(-1);s.busy.pop();count++;}
   if(count){occupied-=count;stats.released+=count;}
   if(!s.busy.length)running.delete(s);
  }
 }
 function park(node,now,vehicle){
  const available=candidates(node)||[];
  let pick=null,best=Infinity,affordable=4+(vehicle.chosenVar||0)%7,open=0;
  if(vehicle.parkingWaitStart!=null)affordable=Math.min(12,affordable+Math.floor((now-vehicle.parkingWaitStart)/4));
  for(const item of available){
   const s=data.get(item.id);
   if(!s||s.busy.length>=s.spots)continue;
   open++;if(s.fee>affordable)continue;
   const score=item.walk+s.fee*7+(s.type==='curb'?0:2);
   if(score<best){best=score;pick=s;}
  }
  if(!pick){
   vehicle.parkingReason=!available.length?'unconnected':open?'price':'full';
   if(vehicle.parkingWaitStart==null)stats.attempts++;return null;
  }
  vehicle.parkingReason=null;
  const dwell=(vehicle.route?.parkDwell||pick.dwell)*(0.83+((vehicle.chosenVar||0)%7)*.055);
  pick.busy.push(now+dwell);running.add(pick);occupied++;pick.visits++;stats.served++;stats.fee+=pick.fee;
  stats.peak=Math.max(stats.peak,occupied);return pick;
 }
 function report(){
  const sites=Object.create(null);let capacity=0,full=0;
  for(const s of data.values()){
   sites[s.id]={id:s.id,type:s.type,node:s.node,x:s.x,y:s.y,fee:s.fee,capacity:s.spots,occupied:s.busy.length,visits:s.visits};
   capacity+=s.spots;if(s.busy.length>=s.spots)full++;
  }
  return {...stats,occupied,capacity,full,sites};
 }
 return {advance,park,report};
}
return {LOTS,normalize,access,validate,build,service,validFee};
});
