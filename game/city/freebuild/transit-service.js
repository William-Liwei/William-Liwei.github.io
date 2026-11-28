(function(root,factory){const api=typeof module==='object'?factory(require('./network.js'),require('./transit.js')):factory(root.Network,root.Transit);if(typeof module==='object')module.exports=api;else root.TransitService=api;})(globalThis,function(N,T){
'use strict';
const SPEC={
 bus:{name:'巴士',headway:45,fare:2,layover:4,slots:8,variants:{standard:{name:'标准巴士',seats:28,speed:1,maint:74},articulated:{name:'铰接巴士',seats:52,speed:.9,maint:118,garage:true},express:{name:'快速巴士',seats:35,speed:1.12,maint:103,garage:true}}},
 metro:{name:'地铁',headway:42,fare:4,layover:6,slots:9,variants:{short:{name:'短编组',seats:48,speed:1,maint:150},long:{name:'长编组',seats:108,speed:.96,maint:265},rapid:{name:'快速编组',seats:74,speed:1.2,maint:220}}},
 tram:{name:'有轨电车',headway:57,fare:3,layover:4,slots:7,variants:{street:{name:'街面电车',seats:29,speed:1,maint:92},light:{name:'长编组轻轨',seats:66,speed:1.08,maint:164},heritage:{name:'观光电车',seats:19,speed:.72,maint:55}}},
 rail:{name:'区域铁路',headway:80,fare:6,layover:8,slots:7,variants:{local:{name:'区域通勤列车',seats:55,speed:1,maint:174},regional:{name:'跨城快速列车',seats:96,speed:1.2,maint:284},double:{name:'双层通勤列车',seats:148,speed:.89,maint:320}}},
 ferry:{name:'客运轮渡',headway:72,fare:5,layover:7,slots:6,variants:{launch:{name:'近岸渡船',seats:32,speed:1,maint:99},catamaran:{name:'快速双体船',seats:52,speed:1.42,maint:172,garage:true},large:{name:'大型渡轮',seats:106,speed:.84,maint:240,garage:true}}}
};
const MODES=Object.freeze(Object.fromEntries(Object.entries(SPEC).map(([id,m])=>[id,Object.freeze({...m,variants:Object.freeze(Object.fromEntries(Object.entries(m.variants).map(([k,v])=>[k,Object.freeze(v)])))})])));
const TAXI_DEPOT=Object.freeze({name:'出租车场',cost:7200,monthly:195,cars:4,w:12,h:9,access:48,color:'#ce9d28'});
const LIMIT={lines:96,depots:24,walkQueue:420,stopQueue:100,taxiQueue:96,active:650,events:500};
const finite=Number.isFinite,xy=p=>p&&finite(p.x)&&finite(p.y);
const str=s=>typeof s==='string'&&s.length>0&&s.length<=96;
const bound=(v,d,a,b)=>finite(+v)?Math.max(a,Math.min(b,+v)):d;
const pathLength=p=>p.slice(1).reduce((sum,q,i)=>sum+Math.hypot(q.x-p[i].x,q.y-p[i].y),0);
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const baseVehicle=m=>Object.keys(m.variants)[0];
const key=(...p)=>JSON.stringify(p);
const money=()=>({fareRevenue:0,taxiRevenue:0,distanceExpense:0});
const tally=()=>({boarded:0,completed:0,abandoned:0,denied:0,departures:0,taxiCompleted:0,taxiAbandoned:0});
function normalize(raw={}){
 const saved=raw&&typeof raw==='object'?raw:{},settings=Object.create(null),depots=[],ids=new Set();
 for(const [id,r] of Object.entries(saved.settings||{}).slice(0,LIMIT.lines))if(str(id)&&str(r?.vehicle))settings[id]={vehicle:r.vehicle,headway:bound(r.headway,60,12,300),fare:bound(r.fare,4,0,25)};
 let next=1;
 for(const p of (Array.isArray(saved.taxiDepots)?saved.taxiDepots:[]).slice(0,LIMIT.depots))if(/^X[0-9]{1,8}$/.test(p?.id)&&xy(p)&&p.x>=0&&p.y>=0&&p.x<3000&&p.y<3000&&!ids.has(p.id)){
  ids.add(p.id);depots.push({id:p.id,x:p.x,y:p.y,z:0});next=Math.max(next,+p.id.slice(1)+1);
 }
 return {settings,taxiDepots:depots,next:Math.round(bound(saved.next,next,next,99999999)),time:bound(saved.time,0,0,1e12)};
}
function sanitize(raw={}){
 const base=normalize(raw),arr=(k,n)=>Array.isArray(raw?.[k])?raw[k].filter(q=>q&&typeof q==='object').slice(0,n):[];
 const id=v=>typeof v==='string'&&v.length<=240?v:null;
 const val=v=>typeof v==='number'&&finite(v)?v:null;
 const counters=(input,sample)=>Object.fromEntries(Object.keys(sample).map(k=>[k,bound(input?.[k],0,0,1e12)]));
 return {...base,seq:bound(raw?.seq,0,0,1e12),period:counters(raw?.period,money()),totals:counters(raw?.totals,tally()),
  nextDepart:Object.fromEntries(Object.entries(raw?.nextDepart||{}).slice(0,LIMIT.lines*4).filter(([k,v])=>str(k)&&finite(v))),
  lineCounters:Object.fromEntries(Object.entries(raw?.lineCounters||{}).slice(0,LIMIT.lines).filter(([k])=>str(k)).map(([k,v])=>[k,counters(v,tally())])),
  riders:arr('riders',LIMIT.walkQueue).map(r=>({id:id(r.id),on:id(r.on),party:val(r.party),index:val(r.index),start:val(r.start),ready:val(r.ready),deadline:val(r.deadline),spent:val(r.spent),wait:val(r.wait),lastWalk:val(r.lastWalk),legs:Array.isArray(r.legs)?r.legs.slice(0,4).map(l=>({line:id(l?.line),from:id(l?.from),to:id(l?.to),transfer:val(l?.transfer)})):[]})),
  vehicles:arr('vehicles',LIMIT.active).map(v=>({id:id(v.id),line:id(v.line),index:val(v.index),next:val(v.next),start:val(v.start),live:!!v.live,capacity:val(v.capacity),fare:val(v.fare),liveAt:val(v.liveAt),seenAt:val(v.seenAt),visits:Array.isArray(v.visits)?v.visits.slice(0,20).filter(finite):[],on:Array.isArray(v.on)?v.on.slice(0,200).map(id).filter(Boolean):[]})),
  taxiJobs:arr('taxiJobs',LIMIT.taxiQueue).map(j=>({id:id(j.id),party:val(j.party),from:id(j.from),to:id(j.to),start:val(j.start),deadline:val(j.deadline)})),
  cabs:arr('cabs',LIMIT.depots*TAXI_DEPOT.cars).map(c=>({id:id(c.id),stage:id(c.stage),job:id(c.job),meters:val(c.meters),start:val(c.start),due:val(c.due),wait:val(c.wait),fare:val(c.fare),trip:{ride:{from:id(c.trip?.ride?.from),to:id(c.trip?.ride?.to)}}}))};
}
function create(raw={},options={}){
 const {network={},transitState={},transitMetrics={},transitOptions={},commuteLines=[],loads={},isLand=()=>true,onFinish=()=>{}}=options;
 const net={nodes:[],edges:[],buses:[],...network};
 raw=sanitize(raw);
 const state=normalize(raw),edges=new Map(net.edges.map(e=>[e.id,e])),nodes=new Map(net.nodes.map(p=>[p.id,p]));
 let now=state.time;
 const cityStations=Array.isArray(transitState.stations)?transitState.stations:[];
 const busGraph=N.graph(net,'bus',loads),carGraph=N.graph(net,'car',loads);
 const roadTypes=e=>e.kind==='road'&&e.pts?.length>1&&e.pts.every(p=>Math.abs(p.z||0)<=4);
 const frontage=net.edges.filter(roadTypes),roadNodes=new Set(frontage.flatMap(e=>[e.a,e.b]));
 const along=(p,q)=>{const k=Math.max(1,Math.ceil(d(p,q)/4));for(let i=0;i<=k;i++)if(!isLand({x:p.x+(q.x-p.x)*i/k,y:p.y+(q.y-p.y)*i/k,z:0}))return false;return true;};
 function access(p,r=48){
  if(str(p))return roadNodes.has(p)?p:null;
  if(!xy(p)||!isLand(p))return null;
  const s=N.snap({nodes:[],edges:frontage},{...p,z:0},r,true),e=edges.get(s?.edge);
  if(!e||!along(p,s))return null;
  return (d(s,e.pts[0])<=d(s,e.pts.at(-1))?e.a:e.b);
 }
 const busDepots=cityStations.filter(p=>p.type==='busDepot').map(p=>({id:p.id,node:access(p,55)})).filter(p=>p.node);
 const yardDepots=cityStations.filter(p=>p.type==='shipyard').filter(p=>access(p,56));
 const pool=new Map(),physical=new Map(),routes=new Map(),linesById=new Map(),nextDepart=new Map();
 const riders=new Map(),vehicles=new Map(),queuedAt=new Map(),taxiJobs=new Map(),cabs=new Map();
 const totals=tally(),cash=money(),lineCounters=new Map();
 for(const k in totals)totals[k]=Math.floor(bound(raw?.totals?.[k],0,0,1e12));
 for(const k in cash)cash[k]=bound(raw?.period?.[k],0,0,1e12);
 function lineCounter(id){if(!lineCounters.has(id)){const out=tally();for(const k in out)out[k]=Math.floor(bound(raw?.lineCounters?.[id]?.[k],0,0,1e12));lineCounters.set(id,out);}return lineCounters.get(id);}
 function wet(p){return p?.wet&&(!transitOptions.water||transitOptions.water(p.wet))?p.wet:null;}
 function wetYard(model,yard){
  if(!T||typeof transitOptions.water!=='function'||!wet(yard))return false;
  return model.points.some(p=>{
   if(p.external||!wet(p)||d(p,yard)>=290)return false;
   const a=wet(p),b=wet(yard);
   if(d(a,b)<6)for(let i=0;i<=6;i++){if(!transitOptions.water({x:a.x+(b.x-a.x)*i/6,y:a.y+(b.y-a.y)*i/6,z:0}))return false;if(i===6)return true;}
   return T.waterRoute(a,b,transitOptions)?.length>1;
  });
 }
 const explicitTransfers=new Map((options.transfers||[]).filter(t=>str(t?.from)&&str(t.to)&&finite(t.seconds)&&t.seconds>=0&&t.seconds<=180).map(t=>[key(t.from,t.to),t.seconds]));
 const busDefs=new Map();
 for(const l of commuteLines.slice(0,LIMIT.lines*3))if(l?.mode==='bus'&&str(l.busId)&&str(l.id)&&Array.isArray(l.stops)&&l.stops.length>1&&new Set(l.stops).size===l.stops.length&&l.stops.every(str)&&Array.isArray(l.ride)&&l.ride.length===l.stops.length-1&&l.ride.every(x=>finite(x)&&x>0)){
   if(!busDefs.has(l.busId))busDefs.set(l.busId,[]);
   busDefs.get(l.busId).push({...l});
 }
 for(const b of net.buses.slice(0,70)){
  if(!str(b?.id)||b.broken||!busDefs.has(b.id))continue;
  const depots=busDepots.filter(x=>b.stops?.some(s=>busGraph[s]?.length&&N.path(busGraph,x.node,s)!==null&&N.path(busGraph,s,x.node)!==null)).map(x=>x.id);
  physical.set(b.id,{id:b.id,mode:'bus',valid:true,depots,definitions:busDefs.get(b.id),legacy:!depots.length});
 }
 const railModels=[];
 for(const m of Object.values(transitMetrics?.lines||{}).slice(0,LIMIT.lines)){
  if(m?.passengerEnabled===false||!str(m?.id)||!Object.hasOwn(MODES,m.mode)||m.mode==='bus'||physical.has(m.id))continue;
  const supports=MODES[m.mode],points=m.points||[],segments=m.segments||[];
  const valid=!!m.valid&&points.length>=2&&new Set(points.map(p=>p.id)).size===points.length&&points.every(p=>str(p.id)&&xy(p))&&segments.length===points.length-1&&segments.every(s=>Array.isArray(s)&&s.length>=2&&s.every(xy)&&pathLength(s)>1);
  const deps=m.mode==='ferry'?(valid?yardDepots.filter(y=>wetYard(m,y)).map(y=>y.id):[]):[];
  const physicalLine={id:m.id,mode:m.mode,valid,reason:valid?'':m.reason||'线路设施或路径无效',depots:deps,definitions:[],model:m};
  if(valid&&(m.mode==='ferry'||m.depots>0)){
   const ride=segments.map(p=>pathLength(p)/Math.max(5,T.MODES[m.mode].speed/3.6)+supports.layover*.42),stops=points.map(p=>m.mode+':'+p.id);
   for(const reverse of [false,true]){
    const r={id:m.mode+':'+m.id+(reverse?':back':':out'),[m.mode+'Id']:m.id,mode:m.mode,stops:reverse?[...stops].reverse():stops,
      ride:reverse?[...ride].reverse():ride,externalStops:points.filter(p=>p.external).map(p=>m.mode+':'+p.id),segments:reverse?[...segments].reverse().map(s=>[...s].reverse()):segments};
    physicalLine.definitions.push(r);
   }
   if(m.mode!=='ferry')railModels.push(physicalLine);
  }else if(valid){physicalLine.valid=false;physicalLine.reason='缺少相连车辆段';}
  physical.set(m.id,physicalLine);
 }
 // Existing rail adjudication counts reachable depots but does not expose their IDs.
 // Group lines sharing physical segment(s) or stops to share that actual count, rather than duplicating fleet on every route.
 const signatures=new Map(),tree=new Map(railModels.map(p=>[p.id,p.id]));
 function leader(i){while(tree.get(i)!==i)i=tree.get(i);return i;}
 for(const p of railModels){
  const marks=p.model.points.map(x=>'s:'+x.id);
  for(const s of p.model.segments)for(let j=1;j<s.length;j++){
   const a=s[j-1],b=s[j],loc=q=>[q.x,q.y,q.z||0].map(v=>Math.round(v)).join(',');marks.push('e:'+[loc(a),loc(b)].sort().join('/'));
  }
  for(const s of marks){
   const k=p.mode+'/'+s,first=signatures.get(k);if(first)tree.set(leader(p.id),leader(first));else signatures.set(k,p.id);
  }
 }
 for(const p of railModels){
  const id=p.mode+':network:'+leader(p.id);
  p.depots=[id];pool.set(id,Math.max(pool.get(id)||0,Math.trunc(p.model.depots)*MODES[p.mode].slots));
 }
 for(const p of physical.values())for(const id of p.depots)if(!pool.has(id))pool.set(id,MODES[p.mode].slots);
 function requested(p,setting=state.settings[p.id]){
  const m=MODES[p.mode];
  const vehicle=Object.hasOwn(m.variants,setting?.vehicle)?setting.vehicle:baseVehicle(m);
  return {vehicle,headway:Math.round(bound(setting?.headway,m.headway,12,300)),fare:Math.round(bound(setting?.fare,m.fare,0,25)*10)/10};
 }
 function rebuild(initial=false){
  const used=new Map(),previous=new Map(routes);routes.clear();linesById.clear();
  // Reserve one unit per viable line before adding frequency, avoiding starvation by ID ordering.
  const pending=[];
  for(const p of physical.values()){
   const m=MODES[p.mode],cfg=requested(p),restricted=m.variants[cfg.vehicle].garage&&!p.depots.length;
   const v=restricted?m.variants[baseVehicle(m)]:m.variants[cfg.vehicle];
   const normalized={...cfg,vehicle:restricted?baseVehicle(m):cfg.vehicle};
   const rideSeconds=p.definitions.reduce((l,r)=>l+r.ride.reduce((a,b)=>a+b,0),0)/v.speed;
   const cycle=Math.max(12,rideSeconds+p.definitions.length*m.layover);
   const design={...normalized,requested:cfg,id:p.id,mode:p.mode,valid:p.valid,reason:p.reason||'',capacity:v.seats,monthly:0,fleet:0,cycle,headway:null,currentFare:normalized.fare,
      garage:!!p.depots.length,depots:p.depots.length,garageCapacity:p.depots.reduce((s,id)=>s+(pool.get(id)||0),0),vehicleName:v.name,designHeadway:normalized.headway,usesLiveRoad:p.mode==='bus'};
   const take=()=>{
    if(!p.depots.length)return (p.legacy||p.mode==='ferry')&&!design.fleet?(design.fleet++,true):false;
    const id=p.depots.find(i=>(used.get(i)||0)<pool.get(i));if(!id)return false;
    used.set(id,(used.get(id)||0)+1);design.fleet++;return true;
   };
   const target=Math.min(15,Math.ceil(cycle/normalized.headway));
   if(p.valid&&p.definitions.length){take();pending.push({p,m,v,design,cycle,take,target});}
   linesById.set(p.id,design);lineCounter(p.id);
  }
  // Repeated allocation keeps shared garage fleets finite and gives each operating route a chance to scale.
  for(let pass=1;pass<15;pass++)for(const x of pending)if(x.design.fleet===pass&&x.target>pass)x.take();
  for(const {p,m,v,design,cycle} of pending){
   if(!design.fleet){design.valid=false;design.reason='同一车辆段的车辆全部被其他线路占用';continue;}
   design.headway=Math.max(design.designHeadway,Math.ceil(cycle/design.fleet));design.monthly=design.fleet*v.maint;
   let offset=0;
   for(const def of p.definitions){
    const r={...def,ride:def.ride.map(s=>s/v.speed),offset,physicalId:p.id,capacity:design.capacity,headway:design.headway,fare:design.currentFare,fleet:design.fleet,vehicle:design.vehicle};
    routes.set(r.id,r);
    if(!r.busId){
     const old=previous.get(r.id),persist=raw?.nextDepart?.[r.id];
     if(initial&&finite(persist)&&persist>=now&&persist<now+2000)nextDepart.set(r.id,persist);
     else if(!old||old.headway!==r.headway)nextDepart.set(r.id,now+offset);
    }
    offset+=r.ride.reduce((a,b)=>a+b,0)+m.layover;
   }
  }
  for(const id of nextDepart.keys())if(!routes.has(id))nextDepart.delete(id);
 }
 rebuild(true);
 function setLine(id,patch={}){
  const p=physical.get(id);if(!p)return {ok:false,reason:'线路不存在'};
  const m=MODES[p.mode],cfg={...requested(p),...patch};
  if(!Object.hasOwn(m.variants,cfg.vehicle))return {ok:false,reason:'车型不属于该交通方式'};
  if(m.variants[cfg.vehicle].garage&&!p.depots.length)return {ok:false,reason:p.mode==='ferry'?'高速或大型渡船需要相通航道上的船坞':'该车型需要可双向调度的公交车场'};
  if(!finite(+cfg.headway)||cfg.headway<12||cfg.headway>300||!finite(+cfg.fare)||cfg.fare<0||cfg.fare>25)return {ok:false,reason:'班距为 12–300 秒，票价为 0–25'};
  state.settings[id]=requested(p,cfg);rebuild();return {ok:true,line:{...linesById.get(id)}};
 }
 const stopLocations=new Map();
 for(const b of busDefs.values())for(const r of b)for(const [i,id] of r.stops.entries()){const p=nodes.get(r.rawStops?.[i]);if(p)stopLocations.set(id,p);}
 for(const p of physical.values())for(const a of p.model?.points||[])if(!a.external)stopLocations.set(p.mode+':'+a.id,a);
 let walkGraph=null;const transfersCache=new Map();
 function transferTime(a,b){
  if(a===b)return 0;const id=key(a,b);
  if(explicitTransfers.has(id))return explicitTransfers.get(id);
  if(transfersCache.has(id))return transfersCache.get(id);
  const x=stopLocations.get(a),y=stopLocations.get(b);
  let t=null;
  if(x&&y&&d(x,y)<170){
   const u=access(x,45),v=access(y,45);
   if(u&&v){
    walkGraph??=N.graph({...net,edges:frontage},'walk');
    const road=N.path(walkGraph,u,v);
    const meters=road&&road.reduce((s,p)=>s+edges.get(p.edge).len,d(x,nodes.get(u))+d(y,nodes.get(v)));
    if(meters!=null&&meters<=180)t=Math.max(1,meters/2.8);
   }
  }
  if(transfersCache.size>300)transfersCache.clear();transfersCache.set(id,t);return t;
 }
 function validateLegs(input){
  if(!Array.isArray(input)||!input.length||input.length>4)return null;
  let prev=null;const result=[];
  for(const l of input){
   const r=routes.get(l?.line);const a=r?.stops.indexOf(l?.from),b=r?.stops.indexOf(l?.to);
   if(!r||a<0||b<=a)return null;
   const transfer=!prev?0:transferTime(prev.to,l.from);
   if(!finite(transfer))return null;
   result.push({line:r.id,from:l.from,to:l.to,transfer});prev=l;
  }
  return result;
 }
 function put(r){
  const l=r.legs[r.index],k=key(l.line,l.from);
  let list=queuedAt.get(k);if(!list){list=new Set();queuedAt.set(k,list);}
  if(list.size>=LIMIT.stopQueue)return false;list.add(r.id);return true;
 }
 function clean(r){
  const l=r.legs[r.index],k=l&&key(l.line,l.from),list=k&&queuedAt.get(k);if(!list)return;
  list.delete(r.id);if(!list.size)queuedAt.delete(k);
 }
 function fail(r,at,reason){
  clean(r);riders.delete(r.id);totals.abandoned+=r.party;
  const l=routes.get(r.legs[r.index]?.line);if(l)lineCounter(l.physicalId).abandoned+=r.party;
  onFinish({id:r.id,ok:false,mode:'transit',reason,at,party:r.party,seconds:at-r.start});
 }
 function submit(p){
  const legs=validateLegs(p?.legs);
  if(!str(p?.id)||!legs||riders.has(p.id)||taxiJobs.has(p.id)||riders.size>=LIMIT.walkQueue||!finite(p.at)||p.at<now||p.at>now+1000)return false;
  const party=Math.trunc(p.party??1);
  if(!finite(party)||party<1||party>12||legs.some(x=>routes.get(x.line).capacity<party))return false;
  if(finite(p.maxFare)&&legs.reduce((total,leg)=>total+routes.get(leg.line).fare,0)>p.maxFare)return false;
  const walk=bound(p.walk,0,0,300),patience=bound(p.patience,230,15,1200);
  const r={id:p.id,party,legs,index:0,start:p.at,ready:p.at+walk,deadline:p.at+patience,on:null,spent:0,wait:0,lastWalk:bound(p.lastWalk,0,0,300)};
  if(!put(r))return false;riders.set(r.id,r);return true;
 }
 function begin(r,id,at,live){
  if(vehicles.size>=LIMIT.active||vehicles.has(id))return null;
  const v={id,line:r.id,index:0,next:at,start:at,seenAt:at,visits:[],on:new Set(),live,capacity:r.capacity,fare:r.fare};
  vehicles.set(id,v);lineCounter(r.physicalId).departures++;totals.departures++;
  return v;
 }
 function serve(v,at){
  const line=routes.get(v.line),stop=line?.stops[v.index];
  if(!stop){
   for(const id of v.on){const r=riders.get(id);if(r)fail(r,at,'service-changed');}
   vehicles.delete(v.id);return;
  }
  const counter=lineCounter(line.physicalId);
  for(const id of v.on){
   const r=riders.get(id);if(!r){v.on.delete(id);continue;}
   if(r.legs[r.index].to!==stop)continue;
   v.on.delete(id);r.on=null;r.index++;
   if(r.index>=r.legs.length){
    r.ready=at+r.lastWalk;
   }else{
    r.ready=at+r.legs[r.index].transfer;
    if(!put(r))fail(r,at,'transfer-queue-full');
   }
  }
  let available=v.capacity;for(const q of v.on)available-=riders.get(q)?.party||0;
  const list=queuedAt.get(key(line.id,stop));
  if(list)for(const id of [...list].sort((a,b)=>riders.get(a).ready-riders.get(b).ready)){
   const r=riders.get(id);if(!r)continue;
   if(r.ready>at)continue;
   if(r.deadline<at){fail(r,at,'wait-timeout');continue;}
   if(r.party>available){totals.denied+=r.party;counter.denied+=r.party;continue;}
   clean(r);v.on.add(id);r.on=v.id;r.wait+=at-r.ready;available-=r.party;
   r.spent+=v.fare*r.party;cash.fareRevenue+=v.fare*r.party;totals.boarded+=r.party;counter.boarded+=r.party;
  }
  if(v.index===line.stops.length-1){
   for(const id of v.on){const r=riders.get(id);if(r)fail(r,at,'service-ended');}
   vehicles.delete(v.id);
  }else if(!v.live){v.start=at;v.next=at+line.ride[v.index];v.index++;}
 }
 function visit(lineId,vehicleId,stop,at){
  const r=routes.get(lineId);if(!r?.busId||!str(vehicleId)||!finite(at)||at<now||at>now+1000)return false;
  const i=r.stops.indexOf(stop);if(i<0)return false;
  const id=key(lineId,vehicleId);
  let v=vehicles.get(id);
  if(i===0&&!v)v=begin(r,id,at,true);
  if(!v||v.index+v.visits.length!==i||at<(v.visits.at(-1)??v.seenAt))return false;
  v.visits.push(at);v.seenAt=at;
  if(at===now&&v.visits.length===1){v.visits.shift();serve(v,at);v.index++;}
  return true;
 }
 const taxiDepotAccess=new Map(),taxiPaths=new Map();
 const taxiTime=(e)=>e.len/Math.max(3,e.speed/3.6)*(1+.9*Math.max(0,+loads[e.id]||0)/N.capacity(e));
 function taxiRoute(a,b,arrive=null){
  const k=key(a,b,arrive);
  if(taxiPaths.has(k))return taxiPaths.get(k);
  const path=N.path(carGraph,a,b,arrive),last=path?.at(-1)?.edge??arrive,len=path?.reduce((t,p)=>t+edges.get(p.edge).len,0);
  const route=path&&{from:a,to:b,arrival:arrive,last,path,length:len,seconds:Math.max(1,path.reduce((t,p)=>t+taxiTime(edges.get(p.edge)),0))};
  if(taxiPaths.size>=640)taxiPaths.clear();taxiPaths.set(k,route);return route;
 }
 function parkCabs(p){
  const node=access(p,TAXI_DEPOT.access);
  if(!node)return;
  taxiDepotAccess.set(p.id,node);
  for(let i=0;i<TAXI_DEPOT.cars;i++){const id=p.id+':'+(i+1);cabs.set(id,{id,depot:p.id,node,job:null,stage:'idle',meters:0});}
 }
 for(const p of state.taxiDepots)parkCabs(p);
 function addTaxiDepot(p){
  if(state.taxiDepots.length>=LIMIT.depots)return {ok:false,reason:'出租车场达到上限'};
  if(!xy(p)||p.x<0||p.y<0||p.x>=3000||p.y>=3000)return {ok:false,reason:'场站位置无效'};
  for(const x of [-TAXI_DEPOT.w,TAXI_DEPOT.w])for(const y of [-TAXI_DEPOT.h,TAXI_DEPOT.h])if(!isLand({x:p.x+x,y:p.y+y,z:0}))return {ok:false,reason:'车场用地须在陆地上'};
  if(!access(p,TAXI_DEPOT.access))return {ok:false,reason:'车场需接通地面街道'};
  const n=N.snap({nodes:[],edges:frontage},{...p,z:0},TAXI_DEPOT.access,true),edge=edges.get(n?.edge);
  if(edge&&d(n,p)<N.crossSection(edge).width/2+Math.max(TAXI_DEPOT.w,TAXI_DEPOT.h)+1)return {ok:false,reason:'车场占地与道路相交'};
  const overlap=state.taxiDepots.some(q=>Math.abs(p.x-q.x)<2*TAXI_DEPOT.w&&Math.abs(p.y-q.y)<2*TAXI_DEPOT.h)
    ||cityStations.some(q=>d(p,q)<TAXI_DEPOT.w+(T?.FACILITIES?.[q.type]?.radius||9))
    ||options.occupied?.some(q=>xy(q)&&d(p,q)<TAXI_DEPOT.w+(q.radius||9));
  if(overlap)return {ok:false,reason:'车场占地与已有设施重叠'};
  const depot={id:'X'+state.next++,x:p.x,y:p.y,z:0};state.taxiDepots.push(depot);parkCabs(depot);
  return {ok:true,cost:TAXI_DEPOT.cost,id:depot.id,depot:{...depot}};
 }
 function removeTaxiDepot(id){
  const index=state.taxiDepots.findIndex(p=>p.id===id);
  if(index<0)return {ok:false,reason:'出租车场不存在'};
  if([...cabs.values()].some(c=>c.depot===id&&c.stage!=='idle'))return {ok:false,reason:'仍有车辆运营，请等车辆回场'};
  state.taxiDepots.splice(index,1);taxiDepotAccess.delete(id);
  for(const [k,c] of cabs)if(c.depot===id)cabs.delete(k);
  return {ok:true};
 }
 function taxiChoice(from,to,cab){
  const pickup=taxiRoute(cab.node,from);if(!pickup)return null;
  const ride=taxiRoute(from,to,pickup.last);if(!ride?.path.length)return null;
  const back=taxiRoute(to,cab.node,ride.last);if(!back)return null;
  return {pickup,ride,back,meters:pickup.length+ride.length+back.length};
 }
 function requestTaxi(p){
  if(!str(p?.id)||taxiJobs.has(p.id)||riders.has(p.id)||!finite(p.at)||p.at<now||p.at>now+1000||taxiJobs.size>=LIMIT.taxiQueue)return {ok:false,reason:'出租车请求无效或队列已满'};
  const from=access(p.from,50),to=access(p.to,50);
  if(!from||!to||from===to)return {ok:false,reason:'起终点须接入不同地面街道节点'};
  const depots=[...taxiDepotAccess].filter(([id,node])=>taxiChoice(from,to,{depot:id,node}));
  if(!depots.length)return {ok:false,reason:'没有可合法接客、送客并返场的出租车场'};
  const party=Math.round(bound(p.party,1,1,4));
  const j={id:p.id,from,to,party,start:p.at,deadline:p.at+bound(p.patience,110,10,500),cab:null,wait:0,fare:0};
  taxiJobs.set(j.id,j);if(p.at===now)dispatch(now);
  return {ok:true,id:j.id,status:j.cab?'dispatched':'queued'};
 }
 function finishTaxi(j,at,ok,reason){
  taxiJobs.delete(j.id);totals[ok?'taxiCompleted':'taxiAbandoned']+=j.party;
  if(ok)cash.taxiRevenue+=j.fare;
  onFinish({id:j.id,mode:'taxi',ok,reason,at,seconds:at-j.start,wait:j.wait,party:j.party,fare:ok?j.fare:0});
 }
 function dispatch(at){
  for(const j of taxiJobs.values()){
   if(j.cab||j.start>at||j.deadline<at)continue;
   let best=null;
   for(const c of cabs.values()){
    if(c.stage!=='idle')continue;
    const trip=taxiChoice(j.from,j.to,c);
    if(!trip||at+trip.pickup.seconds>j.deadline)continue;
    if(!best||trip.pickup.seconds<best.trip.pickup.seconds||trip.pickup.seconds===best.trip.pickup.seconds&&trip.meters<best.trip.meters)best={c,trip};
   }
   if(best){
    const {c,trip}=best;j.cab=c.id;j.wait=at+trip.pickup.seconds-j.start;j.fare=Math.round((4+trip.ride.length*.042)*10)/10;
    c.job=j.id;c.trip=trip;c.stage='pickup';c.start=at;c.due=at+trip.pickup.seconds;
   }
  }
 }
 function moveTaxi(c,at){
  const route=c.trip[c.stage],j=taxiJobs.get(c.job);
  c.meters+=route.length;cash.distanceExpense+=route.length*.018;
  if(c.stage==='pickup')c.stage='ride';
  else if(c.stage==='ride'){c.stage='back';if(j)finishTaxi(j,at,true);}
  else{c.stage='idle';c.job=null;delete c.trip;delete c.start;delete c.due;dispatch(at);return;}
  c.start=at;c.due=at+c.trip[c.stage].seconds;
 }
 const copy=value=>JSON.parse(JSON.stringify(value));
 for(const q of (Array.isArray(raw?.riders)?raw.riders:[]).slice(0,LIMIT.walkQueue)){
  const legs=validateLegs(q?.legs);
  if(!str(q?.id)||!legs||riders.has(q.id)||![q.start,q.ready,q.deadline].every(finite)||q.start>now+1000||q.ready>now+1500||q.deadline>now+2500||!Number.isInteger(q.index)||q.index<0||q.index>legs.length)continue;
  const r={id:q.id,legs,index:q.index,party:Math.round(bound(q.party,1,1,12)),start:q.start,ready:q.ready,deadline:q.deadline,on:typeof q.on==='string'&&q.on.length<=240?q.on:null,spent:bound(q.spent,0,0,1200),wait:bound(q.wait,0,0,4800),lastWalk:bound(q.lastWalk,0,0,300)};
  if(!r.on&&r.index<legs.length&&!put(r))continue;riders.set(r.id,r);
 }
 for(const q of (Array.isArray(raw?.vehicles)?raw.vehicles:[]).slice(0,LIMIT.active)){
  const r=routes.get(q?.line);
  if(typeof q?.id!=='string'||q.id.length>240||!r||vehicles.has(q.id)||!Number.isInteger(q.index)||q.index<0||q.index>=r.stops.length||!!q.live!==!!r.busId||(!q.live&&(!finite(q.next)||q.next<now||q.next>now+2000)))continue;
  const v={id:q.id,line:r.id,index:q.index,next:q.next,live:!!q.live,start:finite(q.start)?q.start:now,seenAt:finite(q.seenAt)?Math.min(now+1000,q.seenAt):now,visits:q.visits.filter(a=>a>=now&&a<=now+1000).sort((a,b)=>a-b).slice(0,r.stops.length-q.index),on:new Set(),capacity:Math.round(bound(q.capacity,r.capacity,1,200)),fare:bound(q.fare,r.fare,0,25)};
  for(const id of (Array.isArray(q.on)?q.on:[]).slice(0,200)){const x=riders.get(id);if(x?.on===v.id&&x.legs[x.index]?.line===r.id)v.on.add(id);}
  // Live bus IDs are available on in-session rebuilds only when Studio preserved
  // its simulator; call resetLive() for a reload with freshly generated vehicles.
  vehicles.set(v.id,v);
 }
 for(const r of riders.values())if(r.on&&!vehicles.get(r.on)?.on.has(r.id)){
  r.on=null;r.ready=Math.max(now,r.ready);if(!put(r))riders.delete(r.id);
 }
 for(const q of (Array.isArray(raw?.taxiJobs)?raw.taxiJobs:[]).slice(0,LIMIT.taxiQueue))if(str(q?.id)&&roadNodes.has(q.from)&&roadNodes.has(q.to)&&finite(q.start)&&finite(q.deadline)&&q.deadline>=now&&q.deadline<=now+1800&&!taxiJobs.has(q.id)&&!riders.has(q.id)){
  taxiJobs.set(q.id,{id:q.id,from:q.from,to:q.to,party:Math.round(bound(q.party,1,1,4)),start:q.start,deadline:q.deadline,cab:null,wait:0,fare:0});
 }
 for(const q of (Array.isArray(raw?.cabs)?raw.cabs:[]).slice(0,LIMIT.depots*TAXI_DEPOT.cars)){
  const c=cabs.get(q?.id);if(!c)continue;c.meters=bound(q.meters,0,0,1e12);
  const j=taxiJobs.get(q.job);
  const src=j||q.trip?.ride;
  if(!['pickup','ride','back'].includes(q.stage)||!src||!roadNodes.has(src.from)||!roadNodes.has(src.to)||!finite(q.due)||q.due<now||q.due>now+3000||!finite(q.start)||q.start>now||q.stage!=='back'&&(!j||j.cab))continue;
  const trip=taxiChoice(src.from,src.to,c);if(!trip)continue;
  c.job=q.job;c.trip=trip;c.stage=q.stage;c.start=q.start;c.due=q.due;
  if(j){j.cab=c.id;j.wait=bound(q.wait,0,0,1000);j.fare=bound(q.fare,0,0,250);}
 }
 function resetLive(){
  for(const [id,v] of vehicles)if(v.live){
   for(const p of v.on){const r=riders.get(p);if(r){r.on=null;r.ready=now;if(!put(r))fail(r,now,'reset-queue-full');}}
   vehicles.delete(id);
  }
 }
 let seq=Math.round(bound(raw?.seq,0,0,1e12));
 function step(until){
  if(!finite(until)||until<now)return now;
  dispatch(now);
  for(let n=0;n<LIMIT.events;n++){
   let at=until,rank=Infinity,task=null;
   function event(when,order,fn){if(!finite(when)||when>at||when===at&&order>=rank)return;at=Math.max(now,when);rank=order;task=fn;}
   for(const [id,due] of nextDepart)event(due,2,t=>{
    const r=routes.get(id);
    nextDepart.set(id,t+r.headway);
    const v=begin(r,'run:'+(++seq),t,false);
    if(v)serve(v,t);
   });
   for(const v of vehicles.values()){
    if(v.live&&v.visits.length)event(v.visits[0],2,t=>{v.visits.shift();serve(v,t);v.index++;});
    if(v.live&&!v.visits.length)event(v.seenAt+Math.max(250,(routes.get(v.line)?.headway||100)*4),4,t=>{
     for(const p of v.on){const r=riders.get(p);if(r)fail(r,t,'vehicle-out-of-service');}
     vehicles.delete(v.id);
    });
    if(!v.live)event(v.next,1,t=>serve(v,t));
   }
   for(const r of riders.values()){
    if(r.on)continue;
    if(r.index===r.legs.length)event(r.ready,1,t=>{
     riders.delete(r.id);totals.completed+=r.party;
     const last=routes.get(r.legs.at(-1)?.line);if(last)lineCounter(last.physicalId).completed+=r.party;
     onFinish({id:r.id,mode:'transit',ok:true,at:t,seconds:t-r.start,wait:r.wait,fare:r.spent,party:r.party});
    });else event(r.deadline,3,t=>fail(r,t,'wait-timeout'));
   }
   for(const j of taxiJobs.values())if(!j.cab){
    if(j.start>now)event(j.start,1,dispatch);
    event(j.deadline,3,t=>finishTaxi(j,t,false,'taxi-wait-timeout'));
   }
   for(const c of cabs.values())if(c.stage!=='idle')event(c.due,1,t=>moveTaxi(c,t));
   if(!task){now=until;dispatch(now);return now;}
   now=at;task(at);
  }
  return now;
 }
 const measured=new WeakMap();
 function geo(points,frac){
  let cum=measured.get(points);if(!cum){cum=[0];for(let i=1;i<points.length;i++)cum.push(cum.at(-1)+d(points[i-1],points[i]));measured.set(points,cum);}
  const q=frac*cum.at(-1);let l=1,r=cum.length-1;
  while(l<r){const m=(l+r)>>1;if(cum[m]<q)l=m+1;else r=m;}
  const a=points[l-1],b=points[l],f=cum[l]>cum[l-1]?(q-cum[l-1])/(cum[l]-cum[l-1]):0;
  return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:(a.z||0)+((b.z||0)-(a.z||0))*f,angle:Math.atan2(b.y-a.y,b.x-a.x)};
 }
 function agents(at=now,opts={}){
  const all=[];
  if(opts.lines!==false)for(const v of vehicles.values()){
   if(v.live||v.index<1||all.length>=72)continue;
   const r=routes.get(v.line),geom=r?.segments?.[v.index-1],mode=T?.MODES?.[r?.mode];
   if(!geom?.length||!mode||at<v.start||at>v.next)continue;
   const frac=Math.max(0,Math.min(1,(at-v.start)/(v.next-v.start))),ridersOn=[...v.on].reduce((s,id)=>s+(riders.get(id)?.party||0),0);
   all.push({...geo(geom,frac),id:'service:'+v.id,kind:mode.vehicle,mode:r.mode,color:mode.color,line:r.physicalId,physicalId:r.physicalId,riders:ridersOn,underground:r.mode==='metro',size:r.capacity>=100?1.2:1});
  }
  for(const c of cabs.values()){
   if(c.stage==='idle')continue;
   const r=c.trip[c.stage],frac=Math.max(0,Math.min(1,(at-c.start)/(c.due-c.start)));
   let q=frac*r.length,p=nodes.get(r.from),angle=0;
   for(const e of r.path){
    const road=edges.get(e.edge);let delta=Math.min(q,road.len);
    const pts=e.reverse?[...road.pts].reverse():road.pts;
    for(let i=1;i<pts.length;i++){
     const a=pts[i-1],b=pts[i],len=d(a,b);
     if(delta>len+.0001){delta-=len;p=b;continue;}
     const s=len?Math.min(1,delta/len):0;p={x:a.x+(b.x-a.x)*s,y:a.y+(b.y-a.y)*s,z:(a.z||0)+((b.z||0)-(a.z||0))*s};angle=Math.atan2(b.y-a.y,b.x-a.x);break;
    }
    if(q<=road.len)break;q-=road.len;
   }
   if(p)all.push({...p,angle,id:'taxi:'+c.id,kind:'taxi',mode:'taxi',color:TAXI_DEPOT.color,stage:c.stage,riders:c.stage==='ride'?(taxiJobs.get(c.job)?.party||1):0});
  }
  return all;
 }
 function baseExpense(){return [...linesById.values()].reduce((s,l)=>s+l.monthly,0)+state.taxiDepots.length*TAXI_DEPOT.monthly;}
 function period(){
  const fleetExpense=baseExpense(),income=cash.fareRevenue+cash.taxiRevenue,expense=fleetExpense+cash.distanceExpense;
  return {...cash,fleetExpense,income,expense,net:income-expense};
 }
 function settle(){const v=period();Object.assign(cash,money());return v;}
 function report(){
  const waiting=Object.create(null),pending=Object.create(null),active=Object.create(null),queueByStop=[];
  for(const r of riders.values())if(!r.on&&r.index<r.legs.length){
   const leg=r.legs[r.index],id=routes.get(leg.line)?.physicalId;if(!id)continue;
   const b=r.ready<=now?waiting:pending;b[id]=(b[id]||0)+r.party;
  }
  for(const [k,ids] of queuedAt){
   const count=[...ids].reduce((s,id)=>{const r=riders.get(id);return s+(r&&r.ready<=now?r.party:0);},0);
   if(count){const [line,stop]=JSON.parse(k);queueByStop.push({line,stop,count});}
  }
  for(const v of vehicles.values()){const id=routes.get(v.line)?.physicalId;if(id)active[id]=(active[id]||0)+1;}
  return {time:now,lines:Object.fromEntries([...linesById].map(([id,l])=>[id,{...l,...lineCounter(id),waiting:waiting[id]||0,approaching:pending[id]||0,active:active[id]||0}])),
   queueByStop,totals:{...totals,waiting:Object.values(waiting).reduce((a,b)=>a+b,0),approaching:Object.values(pending).reduce((a,b)=>a+b,0)},period:period(),
   taxi:{depots:state.taxiDepots.map(p=>({...p,connected:taxiDepotAccess.has(p.id),cars:taxiDepotAccess.has(p.id)?TAXI_DEPOT.cars:0,busy:[...cabs.values()].filter(c=>c.depot===p.id&&c.stage!=='idle').length})),fleet:cabs.size,busy:[...cabs.values()].filter(c=>c.stage!=='idle').length,waiting:[...taxiJobs.values()].filter(j=>!j.cab&&j.start<=now).length,completed:totals.taxiCompleted,abandoned:totals.taxiAbandoned}};
 }
 function snapshot(){
  return copy({...state,time:now,seq,totals,period:cash,lineCounters:Object.fromEntries(lineCounters),nextDepart:Object.fromEntries(nextDepart),riders:[...riders.values()],vehicles:[...vehicles.values()].map(v=>({...v,on:[...v.on]})),taxiJobs:[...taxiJobs.values()],cabs:[...cabs.values()].map(c=>{
   if(c.stage==='idle')return c;const j=taxiJobs.get(c.job);return {...c,trip:{ride:{from:c.trip.ride.from,to:c.trip.ride.to}},wait:j?.wait,fare:j?.fare};
  })});
 }
 return {setLine,report,lines:()=>[...routes.values()],submit,visit,step,snapshot,resetLive,addTaxiDepot,removeTaxiDepot,requestTaxi,agents,settle,now:()=>now};
}
return {MODES,TAXI_DEPOT,create,normalize,sanitize};
});
