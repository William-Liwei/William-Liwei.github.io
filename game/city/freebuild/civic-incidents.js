/* Abstract, deterministic monthly civic incidents. This is a game, not emergency or health guidance. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network);
 if(typeof module==='object')module.exports=api;else root.CivicIncidents=api;
})(globalThis,function(N){
'use strict';
const TYPES=Object.freeze({
 fire:{name:'着火',color:'#ef8a57',icon:'焰',service:'fire',deadline:3},
 crime:{name:'治安事件',color:'#d5a2ff',icon:'警',service:'police',deadline:4},
 illness:{name:'居民生病',color:'#7ddfbd',icon:'医',service:'clinic',deadline:4},
 death:{name:'居民离世',color:'#b2c5d8',icon:'记',service:'clinic',deadline:3}
});
const REASONS={
 new:'刚上报',capacity:'接驳可达，但本月班组已满',distance:'超出响应距离或道路无法通达',
 service:'没有投入运行的对应设施',partial:'已经处理一部分，仍需继续响应',priority:'已标记为优先',
 resolved:'已处理',expired:'超期，已结算影响',gone:'原地块已拆除或未开发'
};
const MAX_ACTIVE=38,MAX_LOG=100,KEYS=Object.keys(TYPES);
const FACILITIES={
 fire:{kind:'fire',units:4,reach:295},
 police:{kind:'police',units:5,reach:340},
 clinic:{kind:'clinic',units:5,reach:290}
};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),num=(v,n=0)=>Number.isFinite(v)?v:n;
const int=(v,n=0,lo=0,hi=1e9)=>Math.round(clamp(num(v,n),lo,hi));
const has=(obj,key)=>Object.hasOwn(obj,key);
const str=(v,n=64)=>typeof v==='string'?v.slice(0,n):'';
const validSite=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=2000&&v.y>=0&&v.y<=1400;
const point=v=>({x:v.x,y:v.y,z:0});
const hash=t=>{let h=2166136261;for(const c of String(t))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296;};
const zero=()=>({spawned:0,resolved:0,expired:0,cancelled:0,cost:0,displaced:0,deaths:0,damage:0});
const emptyImpact=()=>({displaced:0,deaths:0,damage:0});
function create(seed='civic-incident'){
 return {version:1,seed:String(seed).slice(0,96),next:1,lastMonth:0,active:[],log:[],totals:zero(),last:null};
}
function event(input){
 const t=input?.type;if(!has(TYPES,t)||!/^I[1-9][0-9]{0,9}$/.test(input?.id||'')||!validSite(input)||!str(input?.lotId))return null;
 const status=['waiting','responding'].includes(input.status)?input.status:'waiting';
 const started=int(input.started,1,1);const severity=int(input.severity,1,1,4);
 const remaining=int(input.remaining,severity+1,1,15);
 return {id:input.id,type:t,lotId:str(input.lotId),x:input.x,y:input.y,started,severity,remaining,status,
   priority:Boolean(input.priority),reason:has(REASONS,input.reason)?input.reason:'new',provider:str(input.provider),
   attempts:int(input.attempts,0,0,12),recorded:Boolean(input.recorded)};
}
function facility(input){
 if(!input||!has(FACILITIES,input.type)||!str(input.id)||!validSite(input))return null;
 const capacity=int(input.capacity,0,0,30);
 return {id:str(input.id),type:input.type,x:input.x,y:input.y,capacity,used:int(input.used,0,0,capacity),connected:Boolean(input.connected)};
}
function record(input){
 if(!input||!has(TYPES,input.type)||!/^I[1-9][0-9]{0,9}$/.test(input.id||'')||!validSite(input))return null;
 return {id:input.id,type:input.type,lotId:str(input.lotId),x:input.x,y:input.y,month:int(input.month,1,1),
   action:['reported','responding','waiting','escalated','resolved','expired','cancelled'].includes(input.action)?input.action:'reported',
   severity:int(input.severity,1,1,4),reason:has(REASONS,input.reason)?input.reason:'new',provider:str(input.provider),
   cost:int(input.cost),displaced:int(input.displaced),deaths:int(input.deaths),damage:int(input.damage)};
}
function normalize(raw,seed='civic-incident'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(!raw||typeof raw!=='object')return s;
 const seen=new Set();
 for(const v of (Array.isArray(raw.active)?raw.active:[]).slice(0,MAX_ACTIVE)){
  const e=event(v);if(!e||seen.has(e.id))continue;
  seen.add(e.id);s.active.push(e);s.next=Math.max(s.next,+e.id.slice(1)+1);
 }
 s.log=(Array.isArray(raw.log)?raw.log:[]).slice(-MAX_LOG).map(record).filter(Boolean);
 for(const e of s.log)s.next=Math.max(s.next,+e.id.slice(1)+1);
 s.lastMonth=int(raw.lastMonth);
 s.next=Math.max(s.next,int(raw.next,1,1,1e9));
 for(const k of Object.keys(s.totals))s.totals[k]=int(raw.totals?.[k]);
 if(raw.last&&typeof raw.last==='object'){
  const fields=['cost','spawned','resolved','expired','cancelled'];
  s.last={month:int(raw.last.month,0,0,s.lastMonth),...Object.fromEntries(fields.map(k=>[k,int(raw.last[k])])),
   impact:Object.fromEntries(Object.keys(emptyImpact()).map(k=>[k,int(raw.last.impact?.[k])])),
   facilities:(Array.isArray(raw.last.facilities)?raw.last.facilities:[]).slice(0,600).map(facility).filter(Boolean)};
 }
 return s;
}
const developed=lot=>validSite(lot)&&num(lot.level)>0&&(typeof lot.id==='string'||typeof lot.id==='number');
const monthOf=city=>int(city?.month,1,1);
function append(state,e,month,action,extra={}){
 const row=record({id:e.id,type:e.type,lotId:e.lotId,x:e.x,y:e.y,month,action,severity:e.severity,
   reason:extra.reason||e.reason,provider:extra.provider??e.provider,cost:extra.cost||0,displaced:extra.displaced||0,deaths:extra.deaths||0,damage:extra.damage||0});
 if(!row)return null;
 state.log.push(row);if(state.log.length>MAX_LOG)state.log.splice(0,state.log.length-MAX_LOG);return row;
}
function enqueue(state,{type,lot,month=state.lastMonth+1,severity=1,recorded=false}={}){
 if(!has(TYPES,type)||!validSite(lot)||lot.id==null||state.active.length>=MAX_ACTIVE)return null;
 const lotId=String(lot.id).slice(0,64);if(!lotId||state.active.some(e=>e.type===type&&e.lotId===lotId))return null;
 severity=int(severity,1,1,4);month=int(month,1,1);
 const e={id:'I'+state.next++,type,lotId,x:lot.x,y:lot.y,started:month,severity,remaining:type==='death'?1:severity+1,
  status:'waiting',priority:false,reason:'new',provider:'',attempts:0,recorded:Boolean(recorded)};
 state.active.push(e);state.totals.spawned++;append(state,e,month,'reported');return e;
}
function prioritize(state,id,on=true){
 const e=state?.active?.find(x=>x.id===id);if(!e)return false;e.priority=Boolean(on);return true;
}
function forecast(state,city,options={}){
 const source=options.metrics?.lots||options.metrics?.byLot||{},risks=[],riskByLot=Object.create(null);
 const totals=Object.fromEntries(KEYS.map(k=>[k,0])),any=Object.fromEntries(KEYS.map(k=>[k,0]));
 for(const lot of city?.civic?.lots||[]){
  if(!developed(lot))continue;
  const lotId=String(lot.id),m=source[lotId]||{},person=lot.type==='residential'&&num(lot.occupants)>0;
  const high=int(lot.level,1,1,3)-1,people=int(lot.occupants,0,0,220),dense=Math.min(1,people/70);
  const industrial=lot.type==='industrial'?1:0,commercial=lot.type==='commercial'?1:0;
  const f=(k,defaultValue)=>clamp(num(m[k],defaultValue));
  const care=f('clinic',.30),fire=f('fire',.28),police=f('police',.27),water=f('water',.66),power=f('power',.65),waste=f('waste',.3),park=f('park',.3);
  const r={
   fire:clamp(.035+.075*high+.20*industrial+.12*(1-water)+.10*(1-power)+.24*(1-fire)+.07*dense),
   crime:clamp(.034+.062*high+.14*commercial+.04*industrial+.25*(1-police)+.05*(1-park)+.085*dense),
   illness:person?clamp(.04+.095*high+.18*(1-water)+.18*(1-waste)+.23*(1-care)+.09*dense):0,
   death:person?clamp(.005+.006*high+.021*dense+.023*(1-care)):0
  };
  for(const k of KEYS){totals[k]+=r[k];if(r[k]>0)any[k]++;}
  riskByLot[lotId]=r;risks.push({lotId,x:lot.x,y:lot.y,type:lot.type,risks:r});
 }
 return {risks,riskByLot,averages:Object.fromEntries(KEYS.map(k=>[k,totals[k]/(any[k]||1)]))};
}

function roadAccess(network,waterFn){
 const roadGraph=N.graph(network,'car'),edges=new Map((network.edges||[]).map(e=>[e.id,e]));
 const local=[...edges.values()].filter(e=>e.kind==='road'&&Array.isArray(e.pts)&&e.pts.some(p=>Math.abs(p.z||0)<2));
 const cache=new Map(),roadDistances=new Map(),water=typeof waterFn==='function'?waterFn:N.water;
 const bins=new Map(),cell=56;
 for(const e of local)for(let i=1;i<e.pts.length;i++){
  const a=e.pts[i-1],b=e.pts[i];
  if(Math.min(Math.abs(a.z||0),Math.abs(b.z||0))>2||!validSite(a)||!validSite(b))continue;
  for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)
   for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++){
    const key=x+'|'+y;
    if(!bins.has(key))bins.set(key,new Set());
    bins.get(key).add(e);
   }
 }
 function landConnector(a,b){
  const steps=Math.max(1,Math.ceil(N.dist(a,b)/4));
  for(let i=0;i<=steps;i++)if(water(N.mix(a,b,i/steps)))return false;
  return true;
 }
 function access(target,max=50){
  const p=point(target),key=p.x+'|'+p.y+'|'+max;
  if(cache.has(key))return cache.get(key);
  let result=null;
  if(local.length){
   const nearby=new Set();
   for(let x=Math.floor((p.x-max)/cell);x<=Math.floor((p.x+max)/cell);x++)
    for(let y=Math.floor((p.y-max)/cell);y<=Math.floor((p.y+max)/cell);y++)
     for(const e of bins.get(x+'|'+y)||[])nearby.add(e);
   const hit=N.snap({nodes:[],edges:[...nearby]},p,max,true),e=edges.get(hit?.edge);
   if(e&&hit&&landConnector(p,{...hit,z:0})){
    let along=0,i=0,index=Math.floor(hit.pos);
    for(;i<Math.min(index,e.pts.length-1);i++)along+=N.dist(e.pts[i],e.pts[i+1]);
    if(i+1<e.pts.length)along+=N.dist(e.pts[i],e.pts[i+1])*(hit.pos-index);
    const total=num(e.len,N.length(e.pts));
    result={e,q:clamp(along,0,total),n:total,d:N.dist(p,hit)};
   }
  }
  cache.set(key,result);return result;
 }
 function suffix(a){
  const s=[];
  if(a.q<.3)s.push({node:a.e.a,c:0,in:null});
  if(a.n-a.q<.3)s.push({node:a.e.b,c:0,in:null});
  if(a.n-a.q>.01)s.push({node:a.e.b,c:a.n-a.q,in:a.e.id});
  if(!a.e.oneway&&a.q>.01)s.push({node:a.e.a,c:a.q,in:a.e.id});
  return s;
 }
 function prefix(b){
  const s=[];
  if(b.q<.3)s.push({node:b.e.a,c:0,out:null});
  if(b.n-b.q<.3)s.push({node:b.e.b,c:0,out:null});
  if(b.q>.01)s.push({node:b.e.a,c:b.q,out:b.e.id});
  if(!b.e.oneway&&b.n-b.q>.01)s.push({node:b.e.b,c:b.n-b.q,out:b.e.id});
  return s;
 }
 function pathDistance(a,b){
  const key=JSON.stringify([a.node,b.node,a.in,b.out]);
  if(!roadDistances.has(key)){
   const route=N.path(roadGraph,a.node,b.node,a.in,b.out);
   const delta=route?route.reduce((sum,h)=>sum+num(edges.get(h.edge)?.len,0),0):Infinity;
   roadDistances.set(key,delta);
  }
  return roadDistances.get(key);
 }
 function distance(src,dest){
  if(!src||!dest)return Infinity;
  let best=Infinity;
  if(src.e.id===dest.e.id&&(!src.e.oneway||dest.q+1e-6>=src.q))best=Math.abs(src.q-dest.q);
  for(const a of suffix(src))for(const b of prefix(dest)){
   best=Math.min(best,a.c+b.c+pathDistance(a,b));
  }
  return best+src.d+dest.d;
 }
 return {access,distance};
}
function facilities(city,net,water){
 const reach=roadAccess(net,water),budgets=city.civic?.budgets||{};
 const sites=[],known=new Set();
 for(const f of city.civic?.services||[]){
  if(!validSite(f)||!has(FACILITIES,f.type)||f.id==null||known.has(String(f.id)))continue;
  const id=String(f.id).slice(0,64);if(!id)continue;
  known.add(id);
  const def=FACILITIES[f.type],fund=clamp(num(budgets[f.type],100),0,150);
  const driveway=reach.access(f,52);
  sites.push({id,type:f.type,x:f.x,y:f.y,capacity:driveway?Math.floor(def.units*fund/100):0,used:0,connected:Boolean(driveway),
   driveway,range:def.reach*(.72+.28*Math.min(1.3,fund/100))});
  if(sites.length>=600)break;
 }
 return {sites,reach};
}
function autoReport(state,city,month,risks,options){
 if(options.spawn===false||state.active.length>=MAX_ACTIVE)return 0;
 const lotById=new Map((city.civic?.lots||[]).filter(developed).map(l=>[String(l.id),l]));
 const occupied=new Set(state.active.map(e=>e.type+'|'+e.lotId));
 const recent=state.log.filter(r=>r.month>=month-2&&r.action==='reported');
 for(const r of recent)occupied.add(r.type+'|'+r.lotId);
 const pop=[...lotById.values()].reduce((n,l)=>n+(l.type==='residential'?Math.max(0,num(l.occupants)):0),0);
 const cap=Math.min(6,Math.max(1,Math.ceil(Math.sqrt(lotById.size)/3)+Math.floor(pop/650)));
 const cityKey=state.seed+'|'+(city.mapId||'')+'|'+month;
 const kinds=[];
 for(const type of KEYS){
  const choices=risks.risks.filter(v=>v.risks[type]>0&&!occupied.has(type+'|'+v.lotId));
  const pressure=choices.reduce((n,v)=>n+v.risks[type],0);
  const base=type==='death'?25:type==='illness'?8:6;
  const chance=Math.min(type==='death'?.23:.92,pressure/(base+pressure));
  if(!choices.length||hash(cityKey+'|'+type+'|gate')>chance)continue;
  const s=choices.map(v=>({v,rank:-Math.log(Math.max(.00000001,hash(cityKey+'|'+type+'|'+v.lotId+'|pick')))/v.risks[type]}))
   .sort((a,b)=>a.rank-b.rank||a.v.lotId.localeCompare(b.v.lotId))[0];
  kinds.push({type,s,rank:hash(cityKey+'|'+type+'|ord')});
 }
 kinds.sort((a,b)=>a.rank-b.rank);
 let spawned=0;
 for(const {type,s} of kinds.slice(0,cap)){
  const sev=type==='death'?1:s.v.risks[type]>.64&&hash(cityKey+'|'+s.v.lotId+'|severity')>.36?3:s.v.risks[type]>.38?2:1;
  if(enqueue(state,{type,lot:lotById.get(s.v.lotId),month,severity:sev}))spawned++;
 }
 return spawned;
}
function report(state){
 const last=state.last;
 return {month:state.lastMonth, active:state.active, log:state.log, totals:{...state.totals}, facilities:last?.facilities||[],
  impact:{...(last?.impact||emptyImpact())}, cost:last?.cost||0,spawned:last?.spawned||0,resolved:last?.resolved||0,expired:last?.expired||0,
  cancelled:last?.cancelled||0, counts:Object.fromEntries(KEYS.map(type=>[type,state.active.filter(e=>e.type===type).length]))};
}
function subtractPerson(lot){
 if(lot.type!=='residential'||num(lot.occupants)<1)return 0;
 lot.occupants=Math.max(0,num(lot.occupants)-1);return 1;
}
function resolveImpact(e,lot,expired){
 const impact=emptyImpact(),fee=expired?
  ({fire:245,crime:165,illness:185,death:105})[e.type]*e.severity:
  ({fire:45,crime:31,illness:40,death:38})[e.type]*e.severity;
 if(!expired)return {cost:fee,impact};
 if(e.type==='fire'&&(e.severity>=3||e.remaining>=4)){
  const old=int(lot.level,1,1,3),level=Math.max(0,old-1);lot.level=level;impact.damage=1;
  const prev=int(lot.occupants),kept=level===0?0:Math.floor(prev*.7);
  if(lot.type==='residential')impact.displaced=Math.max(0,prev-kept);
  lot.occupants=kept;
 }
 if(e.type==='illness'&&e.severity>=4)impact.deaths+=subtractPerson(lot);
 return {cost:fee,impact};
}
function advance(state,city,options={}){
 const month=monthOf(city);
 if(month<=state.lastMonth)return {...report(state),cost:0,spawned:0,resolved:0,expired:0,cancelled:0,impact:emptyImpact(),noOp:true};
 const start=state.totals.spawned,risks=forecast(state,city,options);
 const net=options.network||city.network||{nodes:[],edges:[]};
 const {sites,reach}=facilities(city,net,options.water);
 const lots=new Map((city?.civic?.lots||[]).filter(developed).map(x=>[String(x.id),x]));
 const pending=[...state.active]; // Newly reported incidents are visible for a month before requests compete.
 const removed=new Set(),severe=[];
 const result={month,cost:0,spawned:0,resolved:0,expired:0,cancelled:0,impact:emptyImpact(),facilities:[]};
 function account(effect){
  result.cost+=effect.cost;
  for(const k of Object.keys(effect.impact))result.impact[k]+=effect.impact[k];
 }
 pending.sort((a,b)=>Number(b.priority)-Number(a.priority)||b.severity-a.severity||a.started-b.started||Number(a.id.slice(1))-Number(b.id.slice(1)));
 for(const e of pending){
  if(e.started>=month)continue;
  const lot=lots.get(e.lotId);
  if(!lot||num(lot.level)<1){
   result.cancelled++;removed.add(e.id);append(state,e,month,'cancelled',{reason:'gone',provider:''});continue;
  }
  // Natural loss happens once even if this event waits for coordination.
  let deathRecorded=0;
  if(e.type==='death'&&!e.recorded){deathRecorded=subtractPerson(lot);result.impact.deaths+=deathRecorded;e.recorded=true;}
  const dest=reach.access(lot,52),kind=TYPES[e.type].service;
  const facilitiesHere=sites.filter(f=>f.type===kind&&f.capacity>0);
  const eligible=facilitiesHere.flatMap(f=>{
   if(Math.hypot(f.x-lot.x,f.y-lot.y)>f.range+55)return [];
   const d=reach.distance(f.driveway,dest);
   return d<=f.range?[{f,d}]:[];
  }).sort((a,b)=>a.d-b.d||a.f.id.localeCompare(b.f.id));
  const responder=eligible.find(({f})=>f.used<f.capacity)?.f;
  e.attempts++;
  if(responder){
   e.provider=responder.id;
   const amount=Math.min(e.remaining,responder.capacity-responder.used,Math.max(1,Math.floor(e.severity*.5)+1));
   responder.used+=amount;e.remaining-=amount;e.status='responding';e.reason='partial';
   if(e.remaining<=0){
    result.resolved++;removed.add(e.id);
    const effect=resolveImpact(e,lot,false);account(effect);
    append(state,e,month,'resolved',{reason:'resolved',provider:responder.id,cost:effect.cost,deaths:deathRecorded});continue;
   }
  }else{
   e.provider='';e.status='waiting';
   e.reason=!facilitiesHere.length?'service':!eligible.length?'distance':'capacity';
   if(e.type!=='death'&&e.attempts>=1&&e.severity<4){e.severity++;e.remaining=Math.min(15,e.remaining+1);}
  }
  if(month-e.started>=TYPES[e.type].deadline){
   result.expired++;removed.add(e.id);
   const effect=resolveImpact(e,lot,true);account(effect);
   if(e.type==='illness'&&effect.impact.deaths>0)severe.push(lot);
   append(state,e,month,'expired',{reason:e.reason,cost:effect.cost,deaths:effect.impact.deaths+deathRecorded,displaced:effect.impact.displaced,damage:effect.impact.damage});continue;
  }
  append(state,e,month,responder?'responding':e.type==='death'?'waiting':'escalated',{deaths:deathRecorded});
 }
 state.active=state.active.filter(e=>!removed.has(e.id));
 for(const l of severe)enqueue(state,{type:'death',lot:l,month,severity:1,recorded:true});
 autoReport(state,city,month,risks,options);
 state.lastMonth=month;
 result.spawned=state.totals.spawned-start;
 result.facilities=sites.map(facility).filter(Boolean);
 for(const k of ['resolved','expired','cancelled','cost'])state.totals[k]+=result[k];
 for(const k of Object.keys(emptyImpact()))state.totals[k]+=result.impact[k];
 state.last=result;
 return report(state);
}
return {TYPES,REASONS,create,normalize,forecast,advance,tick:advance,report,enqueue,prioritize};
});
