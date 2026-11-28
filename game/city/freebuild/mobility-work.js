/* One representative workday: real routes, scheduled segment seats, and P+R occupancy.
 * This adapter never creates vehicles, hires people, books fares or mutates transport. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network);
 if(typeof module==='object')module.exports=api;else root.WorkMobility=api;
})(globalThis,function(N){
'use strict';
const LIMIT=Object.freeze({lines:260,stops:90,paths:24000,drives:12000,cars:14,parking:160,variants:18,workers:500,links:4});
const SHIFTS=Object.freeze({
 day:Object.freeze({start:0,return:520}),early:Object.freeze({start:-100,return:425}),late:Object.freeze({start:95,return:650})
});
const REASONS=Object.freeze({
 noPlanner:'没有可验证运营时刻的交通线路',noRoundTrip:'缺少可到达的往返公共交通',fare:'往返票价超过通勤预算',
 excessiveWait:'班次、步行或换乘耗时过长',full:'高峰往返座位或停车位已满',searchLimit:'本月路线搜索预算已达到上限'
});
const MODES=new Set(['bus','metro','tram','rail','ferry']);
const arr=v=>Array.isArray(v)?v:[];
const num=Number.isFinite;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const value=(x,d,a,b)=>num(x)?clamp(x,a,b):d;
const text=x=>typeof x==='string'||typeof x==='number'?String(x).slice(0,100):'';
const key=(...v)=>JSON.stringify(v);
const round=v=>Math.round(v*100)/100;
const point=p=>p&&num(p.x)&&num(p.y);
const emptyCounts=()=>({walk:0,drive:0,transit:0,pr:0});
const capInt=(v,d,up)=>Math.floor(value(v,d,0,up));
function hash(v){let h=2166136261;for(const c of v){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function shiftOf(v,id,spread){
 if(typeof v==='string'&&Object.hasOwn(SHIFTS,v))return {...SHIFTS[v],type:v};
 if(num(v?.start)&&num(v?.return)&&v.return-v.start>=240&&v.return-v.start<=1600&&Math.abs(v.start)<=300)return {start:v.start,return:v.return,type:'custom'};
 if(spread){const n=hash(id)%10;if(n<2)return {...SHIFTS.early,type:'early'};if(n===9)return {...SHIFTS.late,type:'late'};}
 return {...SHIFTS.day,type:'day'};
}
function asLine(r){
 const id=text(r?.id),mode=r?.mode,stops=arr(r?.stops).slice(0,LIMIT.stops).map(text),ride=arr(r?.ride);
 if(!id||!MODES.has(mode)||stops.length<2||new Set(stops).size!==stops.length||stops.some(x=>!x)||
  ride.length!==stops.length-1||ride.some(x=>!num(x)||x<=0||x>3600)||!num(r.headway)||r.headway<1||r.headway>4000||
  !num(r.capacity)||r.capacity<1||r.capacity>300||!num(r.fare)||r.fare<0||r.fare>100||r.active===false||r.valid===false||r.fleet===0)return null;
 const cum=[0];for(const d of ride)cum.push(cum.at(-1)+d);
 return {id,mode,stops,cum,indices:new Map(stops.map((s,i)=>[s,i])),headway:r.headway,capacity:Math.floor(r.capacity),
  fare:r.fare,offset:value(r.offset,0,-20000,20000),physicalId:text(r.physicalId||r.id)};
}
const posKey=p=>key(text(p.id),p.x,p.y,p.z||0);
function landSegment(a,b,land){
 const steps=Math.max(1,Math.ceil(N.dist(a,b)/4));
 for(let i=0;i<=steps;i++)if(!land(N.mix(a,b,i/steps)))return false;
 return true;
}
function driveBuilder(net,land,loads,maxRoadAccess){
 const graph=N.graph(net,'car',loads),nodes=new Map(arr(net?.nodes).map(n=>[n.id,n])),
  edges=new Map(arr(net?.edges).map(e=>[e.id,e])),anchors=new Map(),memo=new Map();
 const onSurface=arr(net?.edges).filter(e=>e?.kind==='road'&&e.pts?.length>=2&&e.pts.some(q=>Math.abs(q.z||0)<=2.5));
 function access(p,road){
  const k=key(posKey(p),road);
  if(anchors.has(k))return anchors.get(k);
  let closest=null;
  if(point(p)&&land(p)&&Math.abs(p.z||0)<=2.5){
   for(const e of onSurface){
    if(road&&e.id!==road)continue;
    let d=0;
    for(let i=1;i<e.pts.length;i++){
     const from=e.pts[i-1],to=e.pts[i],metres=N.dist(from,to);
     if(metres<=0)continue;
     const ratio=clamp(((p.x-from.x)*(to.x-from.x)+(p.y-from.y)*(to.y-from.y))/(metres*metres),0,1);
     const q=N.mix(from,to,ratio),offset=N.dist(p,q);
     if(Math.abs(q.z||0)<=2.5&&offset<=maxRoadAccess&&(!closest||offset<closest.off)&&landSegment(p,q,land))
      closest={e,d:d+metres*ratio,off:offset};
     d+=metres;
    }
   }
  }
  if(anchors.size<LIMIT.paths)anchors.set(k,closest);
  return closest;
 }
 function time(e,dist=e?.len){
  if(!num(dist))return Infinity;
  return dist/Math.max(3,num(e.speed)?e.speed/3.6:10)*(1+.75*Math.max(0,+loads?.[e.id]||0)/Math.max(1,N.capacity(e)));
 }
 function between(home,site){
  const k=key(posKey(home),site.id);
  if(memo.has(k))return memo.get(k);
  if(memo.size>=LIMIT.drives)return null;
  function find(){
   const a=access(home),b=access(site,site.road),node=site.node;
   if(!a||!b||!nodes.has(node)||![b.e.a,b.e.b].includes(node)||!land(site))return null;
   const metres=e=>num(e.len)?e.len:N.length(e.pts);
   function route(from,to){
    const fromLen=metres(from.e),toLen=metres(to.e),off=(from.off+to.off)/3;
    const ends=[{node:from.e.b,d:Math.max(0,fromLen-from.d)},...(!from.e.oneway?[{node:from.e.a,d:from.d}]:[])];
    const entries=[{node:to.e.a,d:to.d},...(!to.e.oneway?[{node:to.e.b,d:Math.max(0,toLen-to.d)}]:[])];
    let best=null;
    if(from.e.id===to.e.id&&(!from.e.oneway||to.d>=from.d)){
     best={seconds:off+time(from.e,Math.abs(to.d-from.d)),node,roadPath:[],accessEdge:from.e.id,
      accessNode:null,partial:Math.abs(to.d-from.d),arrivalEdge:to.e.id,arrivalNode:null,arrivalPartial:0,direct:true};
    }
    for(const x of ends)for(const y of entries){
     const roadPath=N.path(graph,x.node,y.node,from.e.id,to.e.id);
     if(roadPath===null)continue;
     const seconds=off+time(from.e,x.d)+time(to.e,y.d)+roadPath.reduce((sum,p)=>sum+time(edges.get(p.edge)),0);
     if(!best||seconds<best.seconds)best={seconds,node,roadPath,accessEdge:from.e.id,accessNode:x.node,partial:x.d,
      arrivalEdge:to.e.id,arrivalNode:y.node,arrivalPartial:y.d,direct:false};
    }
    return best;
   }
   const out=route(a,b),back=route(b,a);
   return out&&back&&out.seconds<=190&&back.seconds<=190?{out,back}:null;
  }
  const v=find();memo.set(k,v);return v;
 }
 return between;
}
function capacityData(p,availability){
 const sorted=arr(p?.configs??p).filter(q=>q&&q.type!=='curb'&&point(q)&&q.node&&text(q.id)&&num(q.spots)&&q.spots>0).slice(0,LIMIT.parking);
 const out=new Map();
 for(const q of sorted){
  const explicit=availability?.[q.id];
  const available=typeof explicit==='object'?explicit.available:explicit;
  const spots=capInt(q.spots,0,400),admissible=capInt(available,spots,spots);
  if(admissible>0&&!out.has(text(q.id)))out.set(text(q.id),{...q,id:text(q.id),spots:admissible,installed:spots,fee:value(q.fee,0,0,80),entry:value(q.entry,0,0,120)});
 }
 return out;
}
function create(o={}){
 const {planner,network={},parkingConfig,isLand=()=>true,loads={},parkingAvailability}=o,config=o.config||{};
 const land=typeof isLand==='function'?isLand:()=>true,lines=new Map(),transfers=new Map(),parks=capacityData(parkingConfig,parkingAvailability);
 for(const raw of arr(o.lines??planner?.lines).slice(0,LIMIT.lines)){
  const l=asLine(raw);
  if(l&&!lines.has(l.id))lines.set(l.id,l);
 }
 for(const t of arr(planner?.transfers).slice(0,20000))if(text(t?.from)&&text(t?.to)&&num(t.seconds)&&t.seconds>=0&&t.seconds<=240)
  transfers.set(key(text(t.from),text(t.to)),t.seconds);
 const stations=Object.values(planner?.stops||{}).filter(s=>point(s)&&s.accessible!==false);
 const canWalkToStop=p=>!stations.length||stations.some(s=>N.dist(p,s)<=walkMax);
 const walkMax=value(config.maxWalk,190,30,400),walkUnrivaled=value(config.directWalkShortcut,110,0,330),
  maxWait=value(config.maxWait,150,5,310),maxLegTime=value(config.maxLegTime,380,65,800),
  fareCap=value(config.fareCap,24,0,150),fareShare=value(config.fareShare,.145,0,1),
  pairBudget=capInt(config.pathBudget,LIMIT.paths,LIMIT.paths),parkingSearch=Math.max(1,capInt(config.parkingSearch,3,LIMIT.cars)),
  departures=clamp(capInt(config.departures,4,8),1,8),workSeconds=value(config.drivePenalty,19,0,220),
  fareWeight=value(config.fareWeight,3,0,30);
 const drivable=driveBuilder({...network,nodes:arr(network.nodes),edges:arr(network.edges)},land,loads,value(config.maxRoadAccess,47,5,80));
 const examined=new Set(),cache=new Map(),lotUse=new Map(),seats=new Map(),routeMeta=new WeakMap(),lineDemand=new Map(),
  reasons=Object.fromEntries(Object.keys(REASONS).map(k=>[k,0])),shiftDemand={day:0,early:0,late:0,custom:0};
 const assigned=emptyCounts(),lotCounts=new Map(),seenRoutes=new Set();let attempts=0,miss=0,rejections=0,lastReason=null;
 const trace=(tag,k)=>{if(tag&&!examined.has(k+tag)&&examined.size<LIMIT.paths){examined.add(k+tag);reasons[tag]++;}lastReason=tag;};
 function parse(plan){
  if(plan?.ok!==true||plan.mode!=='transit'||!Array.isArray(plan.legs)||!plan.legs.length||plan.legs.length>LIMIT.links||
   !num(plan.walk)||plan.walk<0||!num(plan.lastWalk)||plan.lastWalk<0)return null;
  let fare=0,prior='',stem=plan.walk+plan.lastWalk;
  const legs=[];
  for(const r of plan.legs){
   const l=lines.get(text(r.line)),from=text(r.from),to=text(r.to),a=l?.indices.get(from),b=l?.indices.get(to);
   if(!l||a===undefined||b===undefined||a>=b||legs.some(q=>q.line===l.id))return null;
   const change=!prior||prior===from?0:transfers.get(key(prior,from));
   if(change===undefined)return null;
   const duration=l.cum[b]-l.cum[a];stem+=change+duration;
   fare+=l.fare;legs.push({line:l.id,physicalId:l.physicalId,mode:l.mode,from,to,a,b,change,duration});prior=to;
  }
  return {fare,stem,walk:plan.walk,lastWalk:plan.lastWalk,legs};
 }
 function path(from,to){
  const k=key(posKey(from),posKey(to));
  if(cache.has(k))return cache.get(k);
  if(attempts>=pairBudget)return null;
  attempts++;
  const p=parse(planner?.plan?.({from,to,allowParking:false,maxWalk:walkMax,maxTransfers:Math.min(3,LIMIT.links-1)}));
  cache.set(k,p);return p;
 }
 // Every passenger occupies only the intervals they actually ride: another
 // passenger can board the same departure downstream after the first alights.
 const scheduleCache=new WeakMap();
 function schedule(p,start,delay){
  if(!p)return null;
  let bucket=scheduleCache.get(p);if(!bucket){bucket=new Map();scheduleCache.set(p,bucket);}
  const id=key(start,delay);if(bucket.has(id))return bucket.get(id);
  const save=x=>{if(bucket.size<16)bucket.set(id,x);return x;};
  let ready=start+p.walk;const legs=[],use=[];
  for(const [i,r] of p.legs.entries()){
   const l=lines.get(r.line),at=ready+r.change,base=l.offset+l.cum[r.a];
   const run=Math.ceil((at-base-1e-7)/l.headway)+(i===0?delay:0);
   const board=base+run*l.headway,wait=Math.max(0,board-at),alight=board+r.duration;
   if(wait>maxWait)return save(null);
   for(let section=r.a;section<r.b;section++)use.push({line:l.id,section,run,id:key(l.id,run,section),capacity:l.capacity});
   legs.push({line:r.line,physicalId:r.physicalId,mode:r.mode,from:r.from,to:r.to,run,board:round(board),alight:round(alight),wait:round(wait)});
   ready=alight;
  }
  const end=ready+p.lastWalk,seconds=end-start;
  if(seconds>maxLegTime)return save(null);
  const view=Object.freeze({legs:Object.freeze(legs.map(Object.freeze)),seconds:round(seconds),start:round(start),end:round(end),walk:p.walk,lastWalk:p.lastWalk});
  return save({view,use});
 }
 function variants(mode,out,back,shift,park){
  const rows=[],driveOut=park?park.car.out.seconds+park.site.entry:0,driveBack=park?park.car.back.seconds:0;
  for(let i=0;i<departures;i++){
   const a=schedule(out,shift.start+driveOut,i);
   if(!a||a.view.end>shift.return-150)continue;
   for(let j=0;j<departures;j++){
    const b=schedule(back,shift.return,j);
    if(!b||Math.max(a.view.seconds+driveOut,b.view.seconds+driveBack)>maxLegTime)continue;
    const spotKeys=park?Array.from({length:Math.max(0,Math.ceil(b.view.end/30)-Math.floor((shift.start+driveOut)/30))},
     (_,n)=>key(park.site.id,Math.floor((shift.start+driveOut)/30)+n)):[];
    const result={mode,outbound:a.view,returnTrip:b.view,seconds:round((a.view.seconds+b.view.seconds+driveOut+driveBack)/2),fare:round(out.fare+back.fare+(park?.site.fee||0)),
     parking:park?{site:park.site.id,node:park.site.node,fee:park.site.fee,driveOut:park.car.out,driveBack:park.car.back,
      arrival:round(shift.start+driveOut),release:round(b.view.end)}:null,shift:shift.type};
    result.distance=Math.round((result.seconds+result.fare*fareWeight+(park?10:0))*3.2);
    rows.push({result,use:[...a.use,...b.use],spotKeys,spots:park?.site.spots||0});
   }
  }
  return rows;
 }
 function ordinary(x,mode,shift){
  if(x?.mode!==mode||!num(x.distance)||x.distance<0)return null;
  const seconds=value(x.seconds,x.distance/(mode==='walk'?3.2:8.7),0,2000);
  const result={...x,mode,seconds:round(seconds),fare:0,shift:shift.type,score:round(seconds+(mode==='drive'?workSeconds:0))};
  routeMeta.set(Object.freeze(result),{result,use:[],spotKeys:[],spots:0});return result;
 }
 function routes(args={}){
  const {home,work,walk,drive}=args;
  if(!point(home)||!point(work))return [];
  const k=key(posKey(home),posKey(work)),shift=shiftOf(args.shift,text(work.id)||posKey(work),config.staggered===true),
   walking=ordinary(walk,'walk',shift),driving=ordinary(drive,'drive',shift),basic=[walking,driving].filter(Boolean);
  if(walking&&walking.distance<=walkUnrivaled)return [walking,...basic.filter(x=>x!==walking)];
  if(!lines.size||typeof planner?.plan!=='function'){trace('noPlanner',k);return basic;}
  const budget=value(args.maxFare,Math.min(fareCap,num(args.wage)?args.wage*fareShare:fareCap),0,150);
  const render=[];let legal=false,affordable=false;
  function consider(mode,out,back,park){
   if(!out||!back)return;
   legal=true;if(out.fare+back.fare+(park?.site.fee||0)>budget+1e-6)return;
   affordable=true;
   for(const q of variants(mode,out,back,shift,park)){
    const {result}=q;
    result.score=round(result.seconds+result.fare*fareWeight+(park?10:0));
    routeMeta.set(Object.freeze(result),q);render.push(result);
   }
  }
  if(canWalkToStop(work)){
   if(canWalkToStop(home))consider('transit',path(home,work),path(work,home));
   // Existing P+R lots are separate locations, not a proximity buff. A
   // walk-only return is planned TO the very same lot then a legal car route home.
   const nearby=[...parks.values()].filter(p=>N.dist(p,home)>24&&N.dist(p,home)<1050&&p.fee<=budget&&canWalkToStop(p))
    .sort((a,b)=>N.dist(home,a)-N.dist(home,b)||a.id.localeCompare(b.id)).slice(0,parkingSearch);
   if(!walking)for(const site of nearby){
    const car=drivable(home,site);if(!car)continue;
    consider('pr',path(site,work),path(work,site),{site,car});
   }
  }
  if(!render.length)trace(attempts>=pairBudget?'searchLimit':!legal?'noRoundTrip':!affordable?'fare':'excessiveWait',k);
  return [...basic,...render.sort((a,b)=>a.score-b.score||a.mode.localeCompare(b.mode)).slice(0,LIMIT.variants)]
   .sort((a,b)=>a.score-b.score||a.mode.localeCompare(b.mode));
 }
 function capacity(route){
  const q=routeMeta.get(route);if(!q)return 0;
  let free=LIMIT.workers;
  for(const s of q.use)free=Math.min(free,s.capacity-(seats.get(s.id)||0));
  for(const s of q.spotKeys)free=Math.min(free,q.spots-(lotUse.get(s)||0));
  return Math.max(0,free);
 }
 function choose(args={}){
  const choices=routes(args),r=choices.find(q=>capacity(q)>0);
  if(!r&&choices.length)trace('full',key(text(args.home?.id),text(args.work?.id)));
  return r||null;
 }
 function take(route,count){
  const want=capInt(count,0,LIMIT.workers),accepted=Math.min(want,capacity(route)),q=routeMeta.get(route);
  if(want>accepted){miss+=want-accepted;rejections++;}
  if(!q||!accepted)return 0;
  assigned[route.mode]+=accepted;shiftDemand[route.shift]+=accepted;
  for(const s of q.use){
   seats.set(s.id,(seats.get(s.id)||0)+accepted);
   const r=lineDemand.get(s.line)||{line:s.line,mode:lines.get(s.line).mode,physicalId:lines.get(s.line).physicalId,boardings:0,segmentSeats:0,peakLoad:0,capacity:s.capacity};
   r.segmentSeats+=accepted;r.peakLoad=Math.max(r.peakLoad,seats.get(s.id));lineDemand.set(s.line,r);
  }
  for(const l of [...route.outbound?.legs||[],...route.returnTrip?.legs||[]])lineDemand.get(l.line).boardings+=accepted;
  if(q.spotKeys.length){
   const id=route.parking.site,d=lotCounts.get(id)||{id,capacity:q.spots,commuters:0,peak:0};
   d.commuters+=accepted;
   for(const s of q.spotKeys){lotUse.set(s,(lotUse.get(s)||0)+accepted);d.peak=Math.max(d.peak,lotUse.get(s));}
   lotCounts.set(id,d);
  }
  if(seenRoutes.size<LIMIT.paths&&(route.mode==='transit'||route.mode==='pr'))seenRoutes.add(key(route.mode,route.outbound.legs.map(x=>x.line),route.returnTrip.legs.map(x=>x.line),route.parking?.site));
  return accepted;
 }
 function report(){
  const total=Object.values(assigned).reduce((a,b)=>a+b,0);
  return {assigned:{...assigned},total,denied:miss,rejections,shifts:{...shiftDemand},reasons:{...reasons},lastReason,
   operatedLines:lines.size,pairs:attempts,searchLimit:attempts>=pairBudget,routes:seenRoutes.size,
   lines:[...lineDemand.values()].map(x=>({...x})).sort((a,b)=>a.line.localeCompare(b.line)),lots:[...lotCounts.values()].map(x=>({...x})).sort((a,b)=>a.id.localeCompare(b.id))};
 }
 return {choose,routes,capacity,take,report};
}
return {LIMIT,SHIFTS,REASONS,create};
});
