/* Typed utility dispatch and storage for City Blueprint. All units are simulation units. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object')module.exports=api;else root.GridResilience=api;
})(globalThis,function(){
'use strict';
const TYPES=Object.freeze({
 solar:{name:'光伏电站',type:'power',width:28,depth:23,cost:7900,monthly:175,capacity:170,range:325,color:'#f4cc6b'},
 wind:{name:'风力电站',type:'power',width:23,depth:23,cost:10600,monthly:236,capacity:215,range:350,color:'#9ce0e8'},
 backup:{name:'调峰电站',type:'power',width:26,depth:22,cost:14200,monthly:365,capacity:245,range:395,fuel:1.95,color:'#ef9f76'},
 battery:{name:'电网储能站',type:'power',width:18,depth:16,cost:8500,monthly:188,capacity:145,range:335,storage:270,charge:120,efficiency:.86,color:'#aea6f4'},
 pump:{name:'加压泵站',type:'water',width:14,depth:13,cost:5900,monthly:146,capacity:230,range:0,power:24,color:'#80bde7'},
 reservoir:{name:'调蓄水库',type:'water',width:31,depth:27,cost:11800,monthly:245,capacity:195,range:360,storage:480,charge:160,efficiency:.96,color:'#79d0c9'},
 filter:{name:'净水过滤站',type:'water',width:18,depth:16,cost:7200,monthly:230,capacity:375,range:0,power:21,color:'#8ccf9a'},
 treatment:{name:'污水处理厂',type:'water',width:26,depth:22,cost:11100,monthly:296,capacity:320,range:0,power:31,color:'#c1ae80'}
});
const LIMIT=Object.freeze({sites:155,legacy:700,components:850,history:24});
const TYPES_BY=['power','water'];
const REASONS=Object.freeze({
 missingConnection:'未接入同类型实体管线',power:'接入管网但没有足够外部电力',funding:'该设施没有运行经费',
 outage:'此物理分区供给受扰动',storedEmpty:'储备为空',standby:'待命，未消耗储备',operating:'运行中',normal:'可用',
 drought:'枯水月压低原水产量'
});
const n=Number.isFinite,own=(a,k)=>Object.hasOwn(a,k),arr=v=>Array.isArray(v)?v:[],obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const val=(x,d=0,a=0,b=1e12)=>n(x)?clamp(x,a,b):d;
const q=(v,d=3)=>Math.round(v*10**d)/10**d||0;
const units=x=>q(val(x));
const month=x=>Math.floor(val(x,0,0,1e9));
const id=x=>(typeof x==='string'||n(x))?String(x).trim().slice(0,90):'';
const cmp=x=>{const k=id(obj(x)?x.component:x);return k&&!['__proto__','constructor','prototype'].includes(k)?k:null;};
const pp=x=>x&&n(x.x)&&n(x.y)&&Math.abs(x.x)<=2400&&Math.abs(x.y)<=1800;
const dict=()=>Object.create(null);
const statePlans=new WeakMap();
const LEGACY={power:{capacity:520,range:345},water:{capacity:500,range:315}};
const field=(v,ks)=>Object.fromEntries(ks.map(k=>[k,k==='balanceError'?q(val(v?.[k],0,-1e12)):units(v?.[k])]));
const A_KEYS=['potential','offered','used','internal','charged','discharged','opening','closing','loss','treated','cost','funding','powerRatio'];
const C_KEYS=['capacity','offered','used','internal','need','shortage','charged','discharged','waterQuality','pressure','treated','loss','drought'];
const T_KEYS=['upkeep','fuel','cost','solar','wind','backup','powerSupplied','waterSupplied','powerInternal','powerShortage','waterShortage',
 'batteryOpening','batteryChargeInput','batteryCharged','batteryDischarged','batteryClosing','batteryLoss','reservoirOpening','waterChargeInput',
 'reservoirCharged','reservoirDischarged','reservoirClosing','waterLoss','treated','balanceError'];
const weatherKeys=['solar','wind','drought','outage','purity'];
function seedUnit(seed,m,k){
 let x=2166136261;
 for(const ch of seed+'|'+m+'|'+k){x^=ch.charCodeAt(0);x=Math.imul(x,16777619);}
 x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;
 return (x>>>0)/4294967295;
}
function weather(seed,m,o={}){
 const time=month(m),monthOfYear=((time||1)-1)%12,curve=(1+Math.cos((monthOfYear-6)*Math.PI/6))/2;
 const salt=k=>seedUnit(id(seed)||'city-grid',time,k);
 const defaults={solar:.50+.29*curve+.12*salt('sun'),wind:.54+.27*(1-curve)+.15*salt('wind'),
  drought:clamp((curve*.56+salt('rain')*.42-.34)*1.25),outage:0,purity:.89+.065*salt('river')};
 return Object.fromEntries(weatherKeys.map(k=>[k,q(val(o?.[k]??(k==='purity'?o?.waterQuality:null),defaults[k],0,1),4)]));
}
function create(seed='city-grid'){
 return {version:1,seed:id(seed)||'city-grid',enabled:false,revision:0,next:1,lastMonth:0,sites:[],storage:dict(),last:null,history:[]};
}
function site(v){
 if(!own(TYPES,v?.kind??v?.type)||!pp(v)||!/^GR[1-9][0-9]{0,8}$/.test(v.id))return null;
 return {id:v.id,kind:v.kind??v.type,x:q(v.x,3),y:q(v.y,3),funding:Math.round(val(v.funding,100,0,125))};
}
function readSites(v){
 const byAsset=dict();
 for(const [k,r] of Object.entries(obj(v)?v:{}).slice(0,LIMIT.sites))if(/^GR[1-9][0-9]{0,8}$/.test(k)&&own(TYPES,r?.kind))
  byAsset[k]={kind:r.kind,component:cmp(r.component),connected:r.connected===true,reason:own(REASONS,r.reason)?r.reason:'normal',...field(r,A_KEYS)};
 return byAsset;
}
function readComponents(v){
 return Object.fromEntries(TYPES_BY.map(t=>[t,Object.fromEntries(Object.entries(obj(v?.[t])?v[t]:{}).slice(0,LIMIT.components)
  .filter(([k,r])=>cmp(k)&&obj(r)).map(([k,r])=>[k,field(r,C_KEYS)]))]));
}
function settlement(v){
 if(!obj(v)||!month(v.month))return null;
 return {month:month(v.month),weather:weather('history',v.month,v.weather),totals:field(v.totals,T_KEYS),
  byAsset:readSites(v.byAsset),byComponent:readComponents(v.byComponent)};
}
function historic(v){return {month:month(v?.month),...field(v,['cost','powerSupplied','waterSupplied','powerShortage','waterShortage','batteryClosing','reservoirClosing','treated']),weather:weather('history',v?.month,v?.weather)};}
function normalize(raw,seed='city-grid'){
 const s=create(id(raw?.seed)||seed);
 if(raw?.version!==1)return s;
 s.enabled=raw.enabled===true;s.revision=month(raw.revision);s.lastMonth=month(raw.lastMonth);
 const seen=new Set();
 for(const v of arr(raw.sites).slice(0,LIMIT.sites)){
  const a=site(v);if(!a||seen.has(a.id))continue;seen.add(a.id);
  s.sites.push(a);s.next=Math.max(s.next,Number(a.id.slice(2))+1);
  if(TYPES[a.kind].storage)s.storage[a.id]=q(val(raw.storage?.[a.id],0,0,TYPES[a.kind].storage));
 }
 s.next=Math.max(s.next,Math.floor(val(raw.next,1,1,999999999)));
 s.last=settlement(raw.last);if(s.last?.month!==s.lastMonth)s.last=null;
 s.history=arr(raw.history).slice(-LIMIT.history).map(historic).filter(v=>v.month&&v.month<=s.lastMonth);
 return s;
}
function setEnabled(s,enabled=true){
 if(s.enabled!==!!enabled){s.enabled=!!enabled;s.revision++;}return true;
}
function setFunding(s,id,value){
 const a=s.sites.find(v=>v.id===id);
 if(!a||!n(value)||value<0||value>125)return false;
 const f=Math.round(value);
 if(f!==a.funding){a.funding=f;s.revision++;}return true;
}
function quote(s,city,spec={},o={}){
 const kind=spec.kind??spec.type,d=TYPES[kind];
 if(!own(TYPES,kind)||!pp(spec))return {ok:false,reason:'invalidAsset'};
 if(s.sites.length>=LIMIT.sites||s.next>=999999999)return {ok:false,reason:'limit'};
 const row={kind,x:q(spec.x),y:q(spec.y),cost:d.cost,cashDelta:-d.cost,width:d.width,depth:d.depth};
 const land=o.isLand??o.land??(typeof o.water==='function'?(p=>!o.water(p)):null);
 if(typeof land==='function')for(const a of [-.5,0,.5])for(const b of [-.5,0,.5])
  if(!land({x:row.x+a*d.width,y:row.y+b*d.depth,z:0}))return {...row,ok:false,reason:'land'};
 const bySite=[...s.sites.map(v=>({...v,...TYPES[v.kind]})),...arr(o.occupied)].filter(pp);
 if(bySite.some(a=>Math.abs(row.x-a.x)<(d.width+val(a.width??a.w,10,1,200))/2+1&&
   Math.abs(row.y-a.y)<(d.depth+val(a.depth??a.h,10,1,200))/2+1))return {...row,ok:false,reason:'overlap'};
 const available=val(o.cash??spec.cash??city?.network?.cash,Infinity,-1e12);
 if(d.cost>available)return {...row,ok:false,reason:'cash'};
 return {...row,ok:true};
}
function add(s,city,spec={},o={}){
 const r=quote(s,city,spec,o);if(!r.ok)return r;
 const v={id:'GR'+s.next++,kind:r.kind,x:r.x,y:r.y,funding:100};
 s.sites.push(v);if(TYPES[v.kind].storage)s.storage[v.id]=0;
 s.enabled=true;s.revision++;
 return {...r,id:v.id,site:{...v}};
}
function remove(s,id){
 const i=s.sites.findIndex(x=>x.id===id);
 if(i<0)return false;
 s.sites.splice(i,1);delete s.storage[id];s.revision++;return true;
}
function gridDistance(o,t,src,dst,k){
 const v=typeof o.distance==='function'?o.distance(t,src,dst,k):Math.hypot(src.x-dst.x,src.y-dst.y);
 return n(v)&&v>=0?v:Infinity;
}
function connected(f,t,p){
 if(typeof f!=='function')return null;
 return cmp(f(t,p));
}
function legacy(city,o){
 const raw=arr(o.legacy??city?.civic?.services).slice(0,LIMIT.legacy),seen=new Set();
 return raw.flatMap(v=>{
  const type=v?.type,k=id(v?.id),d=LEGACY[type];
  if(!own(LEGACY,type)||!k||!pp(v)||seen.has(k)||/^GR[1-9][0-9]{0,8}$/.test(k))return [];
  seen.add(k);
  const budget=val(city?.civic?.budgets?.[type],100,0,150)/100;
  return [{id:k,type,x:v.x,y:v.y,capacity:v.active===false?0:val(v.capacity,d.capacity*budget,0,50000),
   range:val(v.range,d.range*Math.min(1.14,.74+budget*.26),1,2500),kind:'legacy',priority:2}];
 });
}
function mapInput(v){
 if(v instanceof Map)return [...v.entries()].slice(0,LIMIT.components);
 return Object.entries(obj(v)?v:{}).slice(0,LIMIT.components);
}
function prepare(s,city,o={}){
 const m=month(o.month??city?.month),enabled=s.enabled===true,
  w=enabled?weather(s.seed,m,o.weather):{solar:1,wind:1,drought:0,outage:0,purity:1};
 const publicPlan={month:m,revision:s.revision,enabled,weather:w,sources:[],overrides:dict(),quality:{water:dict()},pressure:{water:dict()},internalLoads:{power:dict()},upkeep:0,byAsset:dict(),byComponent:{power:dict(),water:dict()}};
 const groups={power:new Map(),water:new Map()},byAsset=new Map(),sources=new Map();
 function group(t,k){
  if(k===null)return null;
  const ls=groups[t];
  if(!ls.has(k)&&ls.size<LIMIT.components)ls.set(k,{type:t,component:k,need:null,sources:[],assets:[],internal:0,pump:0,filter:0,treatment:0,quality:1,pressure:1});
  return ls.get(k)||null;
 }
 for(const t of TYPES_BY)for(const [k,need] of mapInput(o.demand?.[t])){
  const g=group(t,cmp(k));if(g&&n(need))g.need=units(need);
 }
 function outage(t,k){
  const v=o.outages?.[t];
  return val(v instanceof Map?v.get(k):v?.[k],w.outage*(t==='power'?1:.36),0,1);
 }
 const reserve=(g,r)=>{
  if(!g||sources.has(r.id))return;
  g.sources.push(r);sources.set(r.id,r);
 };
 if(enabled){
  for(const src of legacy(city,o)){
   const k=connected(o.access,src.type,src),g=group(src.type,k);if(!g)continue;
   const derating=(1-outage(src.type,k))*(src.type==='water'?1-.56*w.drought:1);
   const available=q(src.capacity*derating);
   reserve(g,{...src,component:k,available,initial:available,internal:0,potential:src.capacity});
  }
  for(const a of s.sites){
   const def=TYPES[a.kind],type=def.type,k=connected(o.access,type,a),g=group(type,k),funding=a.funding/100;
   const row={...a,component:k,connected:!!g,reason:!g?'missingConnection':!funding?'funding':'normal',
    potential:0,offered:0,internal:0,powerRatio:0,opening:def.storage?q(val(s.storage[a.id],0,0,def.storage)):0};
   byAsset.set(a.id,row);publicPlan.upkeep+=Math.round(def.monthly*funding);
   if(!g||!funding)continue;
   g.assets.push(row);
   const nominal=def.capacity*funding,loss=outage(type,k);
   let amount=0,priority=0;
   if(a.kind==='solar')amount=nominal*w.solar*(1-loss*.32);
   if(a.kind==='wind')amount=nominal*w.wind*(1-loss*.27);
   if(a.kind==='backup'){amount=nominal*(1-loss*.24);priority=4;}
   if(a.kind==='battery'||a.kind==='reservoir'){
    amount=Math.min(nominal,row.opening)*(1-loss*.21);priority=3;
    if(!amount)row.reason='storedEmpty';else row.reason='standby';
   }
   row.potential=q(def.power?nominal:amount);
   if(amount>0){
    const available=q(amount);
    reserve(g,{id:a.id,kind:a.kind,type,x:a.x,y:a.y,component:k,range:def.range,priority,available,initial:available,internal:0,potential:available});
   }
  }
  // Each pump/filter/treatment buys real electricity from the verified
  // physical power component. Reservation happens before export to Utilities.
  for(const g of groups.power.values())g.sources.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  for(const g of groups.water.values()){
   const equipment=g.assets.filter(a=>TYPES[a.kind].power).sort((a,b)=>Number(b.kind==='pump')-Number(a.kind==='pump')||a.id.localeCompare(b.id));
   for(const a of equipment){
    const f=TYPES[a.kind],k=connected(o.access,'power',a),p=groups.power.get(k);
    const required=f.power*a.funding/100,reserved=[];
    let left=required;
    if(p)for(const src of p.sources){
     if(left<=.0001)break;
     if(gridDistance(o,'power',src,a,p.component)>src.range)continue;
     const used=Math.min(left,src.available);
     if(used>0){reserved.push([src,used]);left-=used;}
    }
    const power=required-left,ratio=required?power/required:0;
    if(ratio<.34){a.reason='power';continue;}
    for(const [src,v] of reserved){src.available=q(src.available-v);src.internal=q(src.internal+v);}
    p.internal=q(p.internal+power);
    a.internal=q(power);a.powerRatio=q(ratio);a.reason='operating';
    // Boost range, never extraction or source capacity.
    const effective=f.capacity*a.funding/100*ratio;
    if(a.kind==='pump')g.pump+=effective;
    if(a.kind==='filter')g.filter+=effective;
    if(a.kind==='treatment')g.treatment+=effective;
   }
   const approxNeed=Math.max(75,g.need??g.sources.reduce((v,r)=>v+r.available,0));
   const baseQuality=clamp(w.purity-.18*w.drought);
   g.quality=q(clamp(baseQuality+(1-baseQuality)*Math.min(.98,g.filter/approxNeed*.92)));
   g.pressure=q(1+.52*clamp(g.pump/Math.max(100,approxNeed*.60)));
   publicPlan.quality.water[g.component]=g.quality;
   publicPlan.pressure.water[g.component]=g.pressure;
  }
  for(const g of groups.power.values())if(g.internal)publicPlan.internalLoads.power[g.component]=g.internal;
  for(const g of groups.water.values())g.sources.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  for(const t of TYPES_BY)for(const g of groups[t].values()){
   for(const r of g.sources){
    const offered=q(r.available),range=q(r.range*(t==='water'?g.pressure:1));
    if(r.kind==='legacy')publicPlan.overrides[r.id]={capacity:offered,range,priority:r.priority,component:r.component};
    else {
     const a=byAsset.get(r.id);a.offered=offered;
     if(offered>0)publicPlan.sources.push({id:r.id,type:t,x:r.x,y:r.y,capacity:offered,range,priority:r.priority,component:g.component});
    }
   }
   publicPlan.byComponent[t][g.component]={capacity:q(g.sources.reduce((x,r)=>x+r.initial,0)),offered:q(g.sources.reduce((x,r)=>x+r.available,0)),
    internal:g.internal,need:g.need,waterQuality:g.quality,pressure:g.pressure};
  }
  for(const [k,r] of byAsset)publicPlan.byAsset[k]={kind:r.kind,component:r.component,connected:r.connected,reason:r.reason,...field(r,A_KEYS)};
 }
 statePlans.set(publicPlan,{s,revision:s.revision,month:m,enabled,groups,byAsset,sources,w:{...w},upkeep:publicPlan.upkeep});
 return publicPlan;
}
function observed(o,id){
 const value=o instanceof Map?o.get(id):o?.[id];
 return n(value)?value:n(value?.used)?value.used:null;
}
function report(s){
 return {month:s?.lastMonth||0,lastMonth:s?.lastMonth||0,enabled:s?.enabled===true,revision:s?.revision||0,sites:s?.sites||[],
  storage:s?.storage||{},last:s?.last||null,totals:s?.last?.totals||field(null,T_KEYS),
  byAsset:s?.last?.byAsset||{},byComponent:s?.last?.byComponent||{power:{},water:{}},history:s?.history||[]};
}
function advance(s,city,o={}){
 const m=month(o.month??city?.month);
 const deny=reason=>({...report(s),ok:false,reason});
 if(!m)return deny('invalidMonth');
 if(m<=s.lastMonth)return {...report(s),ok:true,noOp:true};
 const plan=o.plan||prepare(s,city,o),pr=statePlans.get(plan);
 if(!pr||pr.s!==s||pr.revision!==s.revision||pr.month!==m||pr.enabled!==s.enabled)return deny('stalePlan');
 const {groups,byAsset,sources,w,upkeep}=pr;
 // No settlement may discharge a store without the evaluator's actual
 // source use; reachable generating headroom is likewise never presumed.
 const usage=o.usage?.sources??o.usage;
 if(sources.size&&!(obj(usage)||usage instanceof Map))return deny('missingUsage');
 const use=new Map();
 for(const r of sources.values()){
  const actual=observed(usage,r.id);
  if(actual===null&&r.available>0)return deny('missingUsage');
  if(actual!==null&&(actual<-.002||actual>r.available+.003))return deny('unbalancedUse');
  use.set(r.id,q(clamp(actual??0,0,r.available)));
 }
 const storage=Object.assign(dict(),s.storage),totals=field({upkeep},T_KEYS), byComponent={power:dict(),water:dict()},assetMonth=dict();
 for(const a of byAsset.values()){
  const r={...a,used:0,charged:0,discharged:0,closing:a.opening,loss:0,treated:0,cost:Math.round(TYPES[a.kind].monthly*a.funding/100),chargeInput:0};
  assetMonth[a.id]=r;
 }
 function pull(g,a,amount,charge){
  // Refill only from real reachable spare upstream production. Neither
  // standby generation nor the outlet of another reservoir is a refill source.
  const source=g.sources.filter(r=>g.type==='power'?['solar','wind'].includes(r.kind):r.kind==='legacy');
  let picked=0,needed=amount;
  for(const r of source){
   if(needed<=.000001)break;
   const row=assetMonth[r.id];
   const mandatory=use.get(r.id)||0,written=r.chargeBooked||0,spare=Math.max(0,r.available-mandatory-written);
   if(gridDistance(o,g.type,r,a,g.component)>r.range)continue;
   const take=q(Math.min(needed,spare));
   if(take<=0)continue;
   r.chargeBooked=q(written+take);picked+=take;needed-=take;
   if(row)row.used=q(row.used+take);
  }
  const kept=q(picked*charge.efficiency);
  return {picked:q(picked),kept};
 }
 for(const type of TYPES_BY)for(const g of groups[type].values()){
  const row=field({capacity:g.sources.reduce((n,r)=>n+r.initial,0),offered:g.sources.reduce((n,r)=>n+r.available,0),
   internal:g.internal,need:g.need,pressure:g.pressure,waterQuality:g.quality,drought:type==='water'?w.drought:0},C_KEYS);
  const assets=g.assets.map(r=>assetMonth[r.id]);
  for(const r of g.sources){
   const used=use.get(r.id)||0,flow=q(used+r.internal),a=assetMonth[r.id];
   row.used=q(row.used+used);
   if(a){
    a.used=flow;a.internal=q(a.internal+r.internal);
    if(flow>0)a.reason='operating';
    if(TYPES[a.kind].storage){
     a.discharged=q(Math.min(a.opening,flow));a.closing=q(a.opening-a.discharged);
     row.discharged=q(row.discharged+a.discharged);
    }
   }
  }
  if(!row.discharged)for(const a of assets){
   const def=TYPES[a.kind];
   if(!def.storage)continue;
   const max=Math.max(0,(def.storage-a.closing)/def.efficiency);
   const req=Math.min(max,def.charge*a.funding/100);
   if(req<=.001)continue;
   const {picked,kept}=pull(g,a,req,def);
   if(!picked)continue;
   a.chargeInput=picked;a.charged=kept;a.loss=q(picked-kept);a.closing=q(Math.min(def.storage,a.closing+kept));
   row.charged=q(row.charged+kept);row.loss=q(row.loss+a.loss);a.reason='operating';
  }
  const treated=type==='water'?Math.min(row.used,g.treatment):0;
  if(treated>0)for(const a of assets.filter(x=>x.kind==='treatment'&&x.powerRatio>0))
   a.treated=q(treated*(TYPES[a.kind].capacity*a.funding/100*a.powerRatio)/g.treatment);
  row.treated=q(treated);row.shortage=q(Math.max(0,row.need-row.used));byComponent[type][g.component]=row;
  totals[type==='power'?'powerSupplied':'waterSupplied']+=row.used;
  totals[type==='power'?'powerShortage':'waterShortage']+=row.shortage;
  totals.powerInternal+=type==='power'?row.internal:0;
  totals.treated+=row.treated;
 }
 // No mutable per-plan shelf state survives a settlement. Disconnected
 // stores stay at the asset address and hold their previous contents.
 for(const r of sources.values())delete r.chargeBooked;
 let fuel=0;
 for(const a of Object.values(assetMonth)){
  const def=TYPES[a.kind];
  if(a.kind==='solar'||a.kind==='wind'||a.kind==='backup')totals[a.kind]+=a.used;
  if(def.fuel){const paid=a.used*def.fuel;fuel+=paid;a.cost=q(a.cost+paid,2);}
  if(def.storage){
   storage[a.id]=a.closing;
   const b=a.kind==='battery',prefix=b?'battery':'reservoir';
   totals[prefix+'Opening']+=a.opening;totals[prefix+'Charged']+=a.charged;totals[prefix+'Discharged']+=a.discharged;totals[prefix+'Closing']+=a.closing;
   totals[b?'batteryChargeInput':'waterChargeInput']+=a.chargeInput;
   totals[b?'batteryLoss':'waterLoss']+=a.loss;
   totals.balanceError+=a.opening+a.charged-a.discharged-a.closing;
  }
 }
 totals.fuel=Math.round(fuel);totals.cost=totals.upkeep+totals.fuel;
 s.storage=storage;s.lastMonth=m;s.last=settlement({month:m,weather:w,totals,byAsset:assetMonth,byComponent});s.revision++;
 s.history=[...s.history,historic({month:m,...s.last.totals,weather:w})].slice(-LIMIT.history);
 return {...report(s),ok:true};
}
return {TYPES,LIMIT,REASONS,create,normalize,setEnabled,setFunding,quote,add,remove,weather,prepare,advance,report};
});
