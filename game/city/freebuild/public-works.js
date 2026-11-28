/* Public works settlements. This engine never writes cash, Civic or base road geometry. */
(function(root,factory){
 const requireHere=typeof module==='object';
 const api=factory(requireHere?require('./network.js'):root.Network,requireHere?require('./civic.js'):root.Civic);
 if(requireHere)module.exports=api;else root.PublicWorks=api;
})(globalThis,function(N,C){
'use strict';
const LIMIT=Object.freeze({roads:4600,lots:4400,sites:160,history:24,stored:1500,routes:32000});
const REASONS=Object.freeze({
 noAccess:'没有合法环卫接入道路',noRoute:'环卫车不能往返',noFunding:'环卫服务没有运营预算',
 noSite:'没有环卫站',full:'沿途可达环卫站的本月吞吐已满',collected:'本月产生垃圾已清运',
 catchup:'仍有积压，清运继续',wear:'路况较差，车流速度和通行容量已下降'
});
const WR=['opening','generated','collected','backlog','escaped','capacity','serviceLots','lots','coverage','pollution','openingTotal','flowsError'];
const ROAD=['edges','length','base','spent','avgCondition','minCondition','poor','worn','priority','wear','repair'];
const WORK=['baseRoad','baseWaste','roadSpend','wasteSpend','adjustment'];
const TYPES={residential:.30,commercial:.53,industrial:.76,office:.22};
const BASIC_WASTE={monthly:370,capacity:390};
const EPS=.001;
const ok=Number.isFinite;
const arr=x=>Array.isArray(x)?x:[];
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'||typeof x==='number'?String(x).trim().slice(0,88):'';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const numeric=(v,d=0,a=0,b=1e12)=>ok(v)?clamp(v,a,b):d;
const integer=(v,d=0,a=0,b=1e9)=>Math.floor(numeric(v,d,a,b));
const month=v=>integer(v,0);
const q=(v,d=3)=>Math.round(v*10**d)/10**d;
const positive=(v,d=0)=>q(numeric(v,d));
const ns=()=>Object.create(null);
const own=(o,k)=>Object.hasOwn(o,k);
const pp=p=>p&&ok(p.x)&&ok(p.y)&&Math.abs(p.x)<=2400&&Math.abs(p.y)<=1800;
const loc=p=>({x:q(p.x,2),y:q(p.y,2),z:q(numeric(p.z,0,-300,400),2)});
const pt=e=>arr(e?.pts).filter(pp);
const validRoad=e=>id(e?.id)&&pt(e).length>=2;
const lane=e=>integer(e.lanes,2,1,8);
const metre=e=>numeric(e.len,N.length(pt(e)),0,4000);
const cost=e=>metre(e)*(lane(e)*.28+(pt(e).some(p=>Math.abs(p.z||0)>3)?.85:0));
const signature=e=>{const p=pt(e);return p.length?JSON.stringify([e.kind||'road',q(metre(e),2),loc(p[0]),loc(p.at(-1)),loc(N.sample(p,.5))]):'';};
const read=(v,keys)=>Object.fromEntries(keys.map(k=>[k,k==='adjustment'||k==='flowsError'?q(numeric(v?.[k],0,-1e12)):positive(v?.[k])]));
const grade=v=>q(numeric(v,100,20,100));
function create(seed='city-public-works'){
 return {version:1,seed:id(seed),revision:0,lastMonth:0,funding:{roads:100,waste:100},assets:ns(),backlog:ns(),last:null,history:[]};
}
function asset(v){
 return {condition:grade(v?.condition),priority:integer(v?.priority,0,0,2),signature:typeof v?.signature==='string'?v.signature.slice(0,450):'',
  points:arr(v?.points).filter(pp).slice(0,7).map(loc),kind:['road','highway','ramp'].includes(v?.kind)?v.kind:'road'};
}
function roadRows(v){
 const byEdge=ns();
 for(const [k,r] of Object.entries(obj(v?.byEdge)?v.byEdge:{}).slice(0,LIMIT.roads)){
  if(!id(k)||!obj(r))continue;
  byEdge[k]={condition:grade(r.condition),prior:grade(r.prior),wear:positive(r.wear),maintenance:positive(r.maintenance),
   priority:integer(r.priority,0,0,2),load:positive(r.load),cost:positive(r.cost)};
 }
 return {...read(v,ROAD),byEdge};
}
function lotRow(v){
 return {...read(v,['opening','generated','collected','backlog','escaped','route','coverage','pollution']),
  reason:own(REASONS,v?.reason)?v.reason:'noSite',service:id(v?.service),
  ...(pp(v)?{x:v.x,y:v.y,z:numeric(v.z,0,-300,400)}:{})};
}
function wasteRows(v){
 const byLot=ns(),bySite=ns();
 for(const [k,r] of Object.entries(obj(v?.byLot)?v.byLot:{}).slice(0,LIMIT.lots))if(id(k)&&obj(r))byLot[k]=lotRow(r);
 for(const [k,r] of Object.entries(obj(v?.bySite)?v.bySite:{}).slice(0,LIMIT.sites))if(id(k)&&obj(r))
  bySite[k]={...read(r,['capacity','collected','funding','distance']),connected:r.connected===true};
 return {...read(v,WR),byLot,bySite};
}
function historic(r){
 return {month:month(r?.month),...read(r,WORK),avgCondition:grade(r?.avgCondition),poor:integer(r?.poor),
  generated:positive(r?.generated),collected:positive(r?.collected),backlog:positive(r?.backlog),pollution:positive(r?.pollution)};
}
function lastRow(r){
 if(!obj(r)||!month(r.month))return null;
 return {month:month(r.month),...read(r,WORK),roads:roadRows(r.roads),waste:wasteRows(r.waste)};
}
function normalize(raw,seed='city-public-works'){
 const s=create(id(raw?.seed)||seed);
 if(raw?.version!==1)return s;
 s.revision=integer(raw.revision);s.lastMonth=month(raw.lastMonth);
 s.funding={roads:integer(raw.funding?.roads,100,0,125),waste:integer(raw.funding?.waste,100,0,125)};
 for(const [k,v] of Object.entries(obj(raw.assets)?raw.assets:{}).slice(0,LIMIT.roads))if(id(k)&&obj(v))s.assets[k]=asset(v);
 for(const [k,v] of Object.entries(obj(raw.backlog)?raw.backlog:{}).slice(0,LIMIT.lots))
  if(id(k)&&ok(v)&&v>0)s.backlog[k]=q(clamp(v,0,LIMIT.stored));
 s.last=s.lastMonth?lastRow(raw.last):null;
 if(s.last?.month!==s.lastMonth)s.last=null;
 s.history=arr(raw.history).slice(-LIMIT.history).map(historic).filter(r=>r.month&&r.month<=s.lastMonth);
 return s;
}
function setFunding(s,k,value){
 if(!['roads','waste'].includes(k)||!ok(value)||value<0||value>125)return false;
 const n=Math.floor(value);if(n!==s.funding[k]){s.funding[k]=n;s.revision++;}
 return true;
}
function setPriority(s,edgeId,value){
 const k=id(edgeId);
 if(!k||![0,1,2].includes(value)||!own(s.assets,k)&&Object.keys(s.assets).length>=LIMIT.roads)return false;
 const old=s.assets[k]||asset();
 if(old.priority!==value){s.assets[k]={...old,priority:value};s.revision++;}
 return true;
}
function nearest(p,a,b){
 const len=N.dist(a,b),r=len?clamp(((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/(len**2),0,1):0;
 return {...N.mix(a,b,r),r};
}
function nodeNear(p,line,bound=3.1){
 for(let i=1;i<line.length;i++){const a=nearest(p,line[i-1],line[i]);if(N.dist(p,a)<=bound&&Math.abs((p.z||0)-(a.z||0))<=2.1)return true;}
 return false;
}
const signs=e=>{const p=pt(e);return p.length<=7?p.map(loc):Array.from({length:7},(_,i)=>loc(N.sample(p,i/6)));};
function assetLookup(s){
 const cells=new Map(),step=70;
 function bucket(x,y){return Math.floor(x/step)+':'+Math.floor(y/step);}
 let ready=false;
 function populate(){
  for(const a of Object.values(s.assets))if(a.points.length>=2&&(a.condition<=99.5||a.priority)){
   const xs=a.points.map(x=>x.x),ys=a.points.map(x=>x.y);
   for(let x=Math.floor((Math.min(...xs)-4)/step);x<=Math.floor((Math.max(...xs)+4)/step);x++)
    for(let y=Math.floor((Math.min(...ys)-4)/step);y<=Math.floor((Math.max(...ys)+4)/step);y++){
     const k=x+':'+y;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(a);
    }
  }
  ready=true;
 }
 return e=>{
  const old=s.assets[id(e.id)];
  if(old&&(!old.signature||old.signature===signature(e)))return old;
  if(!ready)populate();
  const p=pt(e),test=[p[0],N.sample(p,.5),p.at(-1)];
  if(!test.every(pp))return asset();
  const parents=(cells.get(bucket(test[1].x,test[1].y))||[]).filter(x=>x.kind===(e.kind||'road')&&test.every(y=>nodeNear(y,x.points)));
  // An intersecting road is not an ancestor. Both ends and the middle
  // must still fall on the worn alignment; a genuine rebuild is new.
  if(!parents.length)return asset();
  return parents.sort((a,b)=>a.condition-b.condition||b.priority-a.priority)[0];
 };
}
function describe(old,e){
 return {condition:old.condition,priority:old.priority,signature:signature(e),points:signs(e),kind:e.kind||'road'};
}
function factors(value){
 const severity=clamp((87-grade(value))/67,0,1);
 return {speed:q(1-.36*severity,4),capacity:q(1-.42*severity,4)};
}
function applyNetwork(s,net){
 if(!s||!Array.isArray(net?.edges)||!Object.keys(s.assets).length)return net;
 const get=assetLookup(s);
 return {...net,edges:net.edges.map(e=>{
  if(!validRoad(e))return e;
  const a=get(e),f=factors(a.condition);
  // Idempotent on an already-effective network. Keep base speed out of saves.
  const base=ok(e.worksDesignSpeed)?e.worksDesignSpeed:numeric(e.speed,36,1,180);
  return {...e,speed:q(base*f.speed,2),worksDesignSpeed:base,worksCondition:a.condition,conditionCapacity:f.capacity};
 })};
}
function rawNet(city,o){return o.assetNetwork||city?.network||o.network||{nodes:[],edges:[]};}
const wasteDef=()=>C?.SERVICES?.waste||BASIC_WASTE;
function forecast(s,city,o={}){
 const e=arr(rawNet(city,o).edges).filter(validRoad).slice(0,LIMIT.roads);
 const baseRoad=Math.round(numeric(o.baseRoad,e.reduce((n,r)=>n+cost(r),0)));
 const sites=arr(city?.civic?.services).filter(x=>x?.type==='waste'&&pp(x)&&id(x.id)).slice(0,LIMIT.sites);
 const local=numeric(city?.civic?.budgets?.waste,100,0,100)/100;
 const nominal=Math.round(sites.length*wasteDef().monthly*local);
 const baseWaste=Math.round(numeric(o.baseWaste,nominal));
 const roadSpend=Math.round(baseRoad*s.funding.roads/100),wasteSpend=Math.round(baseWaste*s.funding.waste/100);
 return {baseRoad,baseWaste,roadSpend,wasteSpend,adjustment:baseRoad+baseWaste-roadSpend-wasteSpend};
}
function surfaceMonth(s,city,o,b){
 const edges=arr(rawNet(city,o).edges).filter(validRoad).slice(0,LIMIT.roads),byEdge=ns(),next=ns(),get=assetLookup(s);
 const rows=edges.map(e=>{
  const a=get(e),ratio=clamp(ok(o.loadRatios?.[e.id])?o.loadRatios[e.id]:numeric(o.loads?.[e.id])/Math.max(1,N.capacity(e)),0,5);
  const harsh=e.kind==='highway'?1.25:e.kind==='ramp'?1.32:pt(e).some(p=>Math.abs(p.z||0)>3)?1.22:1;
  const baseline=cost(e),wear=(1.55+2.0*Math.pow(ratio,.64))*harsh;
  const weight=baseline*(1+.2*Math.min(2,ratio)+.32*a.priority+.31*(100-a.condition)/80);
  return {e,a,ratio,baseline,wear,weight};
 });
 const weight=rows.reduce((n,r)=>n+r.weight,0);
 let avg=0,length=0,poor=0,worn=0,priorities=0,wear=0,repair=0,minCondition=100;
 for(const r of rows){
  const {e,a,ratio,baseline}=r,len=metre(e),l=id(e.id);
  const spent=b.roadSpend&&weight?r.weight/weight*b.roadSpend:0;
  const maintenance=Math.min(9.4,4.15*spent/Math.max(1,baseline));
  const condition=grade(a.condition-r.wear+maintenance);
  next[l]={...describe(a,e),condition};
  byEdge[l]={condition,prior:a.condition,priority:a.priority,cost:q(spent),load:q(ratio),wear:q(r.wear),maintenance:q(maintenance)};
  avg+=condition*len;length+=len;wear+=r.wear*len;repair+=maintenance*len;
  minCondition=Math.min(minCondition,condition);if(condition<55)poor++;if(condition<87)worn++;if(a.priority)priorities++;
 }
 return {next,roads:{edges:rows.length,length:q(length),base:b.baseRoad,spent:b.roadSpend,avgCondition:length?q(avg/length):100,minCondition,poor,worn,priority:priorities,
  wear:length?q(wear/length):0,repair:length?q(repair/length):0,byEdge}};
}
function defaultLand(water){return p=>!water(p);}
function wasteRouter(network,land){
 const eBy=new Map(),graph=N.graph(network,'car'),bins=new Map(),edgeCache=new Map(),anchors=new Map(),betweenCache=new Map(),trees=new Map();
 const turnAware=arr(network.turns).length>0;
 const step=60,bucket=(x,y)=>x+':'+y;
 for(const e of arr(network.edges).filter(validRoad).slice(0,LIMIT.roads)){
  eBy.set(e.id,e);
  if(e.kind!=='road')continue;
  const pts=e.pts;
  let d=0;
  for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i],len=N.dist(a,b),off=d;d+=len;
   if(!len||(Math.abs(a.z||0)>3&&Math.abs(b.z||0)>3))continue;
   const r={a,b,e,off,len};
   for(let x=Math.floor(Math.min(a.x,b.x)/step);x<=Math.floor(Math.max(a.x,b.x)/step);x++)
    for(let y=Math.floor(Math.min(a.y,b.y)/step);y<=Math.floor(Math.max(a.y,b.y)/step);y++){
     const k=bucket(x,y);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(r);
    }
  }
 }
 function dry(a,b){
  const size=Math.max(1,Math.ceil(N.dist(a,b)/4));
  for(let i=0;i<=size;i++)if(!land(N.mix(a,b,i/size)))return false;
  return true;
 }
 function anchor(p,r=48){
  if(!pp(p)||!land(p)||Math.abs(p.z||0)>3)return null;
  const k=JSON.stringify([p.x,p.y,p.z||0,r]);if(anchors.has(k))return anchors.get(k);
  let a=null;const seen=new Set();
  for(let x=Math.floor((p.x-r)/step);x<=Math.floor((p.x+r)/step);x++)
   for(let y=Math.floor((p.y-r)/step);y<=Math.floor((p.y+r)/step);y++)
    for(const b of bins.get(bucket(x,y))||[]){
     if(seen.has(b))continue;seen.add(b);
     const q2=nearest(p,b.a,b.b),d=N.dist(p,q2);
     if(d<=r&&Math.abs(q2.z||0)<=2.5&&(!a||d<a.off)&&dry(p,q2))
      a={e:b.e,along:b.off+b.len*q2.r,off:d};
    }
  anchors.set(k,a);return a;
 }
 const partial=(a,departure)=>{
  const back={node:a.e.b,d:clamp(metre(a.e)-a.along,0,metre(a.e))},front={node:a.e.a,d:clamp(a.along,0,metre(a.e))};
  return departure?[back,...(!a.e.oneway?[front]:[])]:[front,...(!a.e.oneway?[back]:[])];
 };
 const seconds=(e,m)=>m/Math.max(2,numeric(e.speed,36,1,180)/3.6);
 function route(a,b){
  const off=a.off+b.off;
  let best=Infinity,score=Infinity;
  if(a.e.id===b.e.id&&(!a.e.oneway||b.along+EPS>=a.along)){
   best=off+Math.abs(a.along-b.along);score=seconds(a.e,best);
  }
  for(const a1 of partial(a,true))for(const b1 of partial(b,false)){
   const k=JSON.stringify([a1.node,b1.node,a.e.id,b.e.id]);
   let part=edgeCache.get(k);
   if(!edgeCache.has(k)){
    if(edgeCache.size>=LIMIT.routes)continue;
    if(!turnAware&&!trees.has(a1.node)&&trees.size<160)trees.set(a1.node,N.pathsFrom(graph,a1.node));
    const t=trees.get(a1.node);
    const p=t?t.route(b1.node):N.path(graph,a1.node,b1.node,a.e.id,b.e.id);
    if(p===null)part=null;
    else {
     part={dist:0,seconds:0};
     for(const r of p){const e=eBy.get(r.edge),len=e?metre(e):0;part.dist+=len;part.seconds+=e?seconds(e,len):0;}
    }
    edgeCache.set(k,part);
   }
   if(!part)continue;
   const m=part.dist+off+a1.d+b1.d,cost=part.seconds+seconds(a.e,a1.d)+seconds(b.e,b1.d)+off/3;
   if(cost<score){best=m;score=cost;}
  }
  return {best,seconds:score};
 }
 function pair(a,b){
  if(!a||!b)return null;
  const k=JSON.stringify([a.e.id,a.along,a.off,b.e.id,b.along,b.off]);
  if(betweenCache.has(k))return betweenCache.get(k);
  const out=route(a,b),back=route(b,a);
  const limit=640,maxSeconds=135;
  const r=out.best<=limit&&back.best<=limit&&out.seconds<=maxSeconds&&back.seconds<=maxSeconds?
   {distance:(out.best+back.best)/2,seconds:(out.seconds+back.seconds)/2}:null;
  if(betweenCache.size<LIMIT.routes)betweenCache.set(k,r);
  return r;
 }
 return {anchor,pair};
}
function garbageMonth(s,city,o,b){
 const network=o.network||city?.network||{nodes:[],edges:[]},map={...network,nodes:arr(network.nodes),edges:arr(network.edges)};
 const land=typeof o.isLand==='function'?o.isLand:defaultLand(typeof o.water==='function'?o.water:()=>false);
 const router=wasteRouter(map,land),byLot=ns(),bySite=ns(),next=ns();
 const sites=arr(city?.civic?.services).filter(x=>x?.type==='waste'&&pp(x)&&id(x.id)).slice(0,LIMIT.sites);
 const monthly=wasteDef().monthly;
 const operating=sites.length&&monthly?clamp(b.wasteSpend/(monthly*sites.length),0,1.25):0;
 const rack=sites.map(v=>{
  const a=router.anchor(v,48),capacity=a?Math.floor(wasteDef().capacity*.295*operating*1000):0,l=id(v.id);
  const fixed={...v,id:l,a,left:capacity,capacity};
  bySite[l]={capacity:q(capacity/1000),collected:0,funding:q(monthly*operating,2),distance:0,connected:!!a};
  return fixed;
 });
 const lots=new Map();
 for(const l of arr(city?.civic?.lots).slice(0,LIMIT.lots))if(pp(l)&&id(l.id)&&own(TYPES,l.type)&&!lots.has(id(l.id)))lots.set(id(l.id),l);
 // Collection remains responsible for an emptied or recently bulldozed site.
 // Old waste does not disappear when a housing district loses its occupants.
 for(const [l,v] of Object.entries(s.backlog))if(v>0&&!lots.has(l)&&pp(s.last?.waste?.byLot?.[l])){
  const r=s.last.waste.byLot[l];lots.set(l,{id:l,x:r.x,y:r.y,z:r.z,occupants:0,removed:true});
 }
 const generated=l=>Math.round(Math.min(1000,(TYPES[l.type]||0)*numeric(l.occupants,0,0,3000))*1000);
 const eligible=[...lots.entries()].map(([l,v])=>{
  const old=Math.round(numeric(s.backlog[l],0,0,LIMIT.stored)*1000),newWaste=generated(v);
  return {id:l,loc:v,gen:newWaste,old,needed:old+newWaste};
 }).filter(x=>x.needed>0).sort((a,b)=>b.old/Math.max(1000,b.gen+1000)-a.old/Math.max(1000,a.gen+1000)||b.needed-a.needed||a.id.localeCompare(b.id));
 let totalGenerated=0,totalBacklog=0,totalCollected=0,overflow=0,served=0,pollution=0,currentOpening=0;
 for(const [index,row] of eligible.entries()){
  const {id:l,loc:v,old,gen,needed}=row;
  const a=index<LIMIT.lots&&rack.length?router.anchor(v,45):null;
  let left=needed,service='',distance=0,collected=0;
  const candidates=[];
  if(a&&operating>0)for(const site of rack){
   if(!site.a||N.dist(v,site)>640)continue;
   const path=router.pair(site.a,a);if(path)candidates.push({site,...path});
  }
  candidates.sort((a,b)=>a.seconds-b.seconds||a.site.id.localeCompare(b.site.id));
  for(const route of candidates){
   const {site}=route;
   // Farther sites use the same physical fleet for longer. Each tonne is
   // rounded against the facility's real shared route-adjusted workload.
   const multiplier=1+.63*clamp(route.distance/640,0,1);
   const take=Math.min(left,Math.floor(site.left/multiplier));
   if(take<=0)continue;
   const reserved=Math.ceil(take*multiplier-1e-7);
   site.left=Math.max(0,site.left-reserved);
   collected+=take;left-=take;
   const row=bySite[site.id];
   row.collected=q(row.collected+take/1000);
   row.distance=q(row.distance+take/1000*route.distance);
   if(!service){service=site.id;distance=route.distance;}
   if(!left)break;
  }
  // Collection clears old units first. Ignoring refuse for months builds
  // up lasting local pollution; reaching finite storage records escape.
  const stored=index<LIMIT.lots?Math.min(left,LIMIT.stored*1000):0,escaped=left-stored;
  const coverage=gen?clamp((collected-old)/gen,0,1):old?clamp(collected/old,0,1):0;
  const local=q(clamp(.65*(1-Math.exp(-stored/Math.max(6500,gen*2.7)))+.30*clamp(escaped/Math.max(1000,gen),0,1),0,.95));
  const reason=!rack.length?'noSite':operating<=0?'noFunding':!a?'noAccess':!candidates.length?'noRoute':
   left?(collected?'catchup':'full'):'collected';
  if(index<LIMIT.lots){
   byLot[l]={x:v.x,y:v.y,z:numeric(v.z,0,-300,400),opening:q(old/1000),generated:q(gen/1000),collected:q(collected/1000),
    backlog:q(stored/1000),escaped:q(escaped/1000),route:q(distance),coverage:q(coverage),pollution:local,reason,service};
   if(stored)next[l]=q(stored/1000);
  }
  currentOpening+=old;totalGenerated+=gen;totalCollected+=collected;totalBacklog+=stored;overflow+=escaped;
  if(coverage>=.35)served++;pollution+=local;
 }
 for(const r of Object.values(bySite))if(r.collected>0)r.distance=q(r.distance/r.collected);
 const openingTotal=Object.values(s.backlog).reduce((sum,x)=>sum+Math.round(x*1000),0);
 overflow+=Math.max(0,openingTotal-currentOpening);
 return {next,waste:{opening:q(openingTotal/1000),openingTotal:q(openingTotal/1000),generated:q(totalGenerated/1000),collected:q(totalCollected/1000),
  backlog:q(totalBacklog/1000),escaped:q(overflow/1000),capacity:q(rack.reduce((sum,r)=>sum+r.capacity,0)/1000),serviceLots:served,lots:eligible.length,
  coverage:eligible.length?q(served/eligible.length):0,pollution:eligible.length?q(pollution/eligible.length):0,
  flowsError:q((openingTotal+totalGenerated-totalCollected-totalBacklog-overflow)/1000),byLot,bySite}};
}
function sample(s,lotId){return s?.last?.waste?.byLot?.[id(obj(lotId)?lotId.id:lotId)]||null;}
function report(s){
 const r=s?.last;
 return {month:s?.lastMonth||0,last:r||null,funding:{...(s?.funding||{roads:100,waste:100})},lastMonth:s?.lastMonth||0,history:s?.history||[],
  revision:s?.revision||0,assets:s?.assets||{},roads:r?.roads||roadRows(),waste:r?.waste||wasteRows(),...read(r,WORK)};
}
function advance(s,city,o={}){
 const m=month(city?.month);
 if(!m)return {...report(s),ok:false,reason:'invalidMonth'};
 if(m<=s.lastMonth)return {...report(s),ok:true,noOp:true};
 const b=forecast(s,city,o),ground=surfaceMonth(s,city,o,b),w=garbageMonth(s,city,o,b);
 s.assets=ground.next;s.backlog=w.next;s.lastMonth=m;s.revision++;
 s.last={month:m,...b,roads:ground.roads,waste:w.waste};
 s.history=[...s.history,historic({month:m,...b,...w.waste,avgCondition:ground.roads.avgCondition,poor:ground.roads.poor})].slice(-LIMIT.history);
 return {...report(s),ok:true};
}
function quoteRepair(s,city,edgeId,{cash}={}){
 const e=arr(city?.network?.edges).find(r=>id(r?.id)===id(edgeId)&&validRoad(r));
 if(!e)return {ok:false,reason:'unknownEdge'};
 const a=assetLookup(s)(e),condition=a.condition,deficit=100-condition;
 if(deficit<.5)return {ok:false,reason:'notWorn',edge:id(e.id),condition};
 const price=Math.ceil(145+cost(e)*(.8+.33*deficit)+deficit*3.5);
 const available=numeric(cash,numeric(city?.network?.cash,0,-1e9),-1e9);
 const out={ok:price<=available,edge:id(e.id),condition,target:100,cost:price,cashDelta:-price,revision:s.revision};
 out.signature=JSON.stringify([s.seed,out.revision,out.edge,out.condition,out.cost,signature(e),lane(e)]);
 if(!out.ok)out.reason='cash';
 return out;
}
function applyRepair(s,city,request,opts={}){
 if(!request?.ok)return {ok:false,reason:'noQuote'};
 const now=quoteRepair(s,city,request.edge,opts);
 if(!now.ok)return now;
 if(request.signature!==now.signature||request.revision!==now.revision)return {ok:false,reason:'stale'};
 const e=arr(city.network.edges).find(r=>id(r.id)===now.edge),previous=assetLookup(s)(e);
 s.assets[now.edge]={...describe(previous,e),condition:now.target};
 s.revision++;
 return {...now,revision:s.revision};
}
return {LIMIT,REASONS,create,normalize,forecast,advance,report,sample,setFunding,setPriority,applyNetwork,quoteRepair,applyRepair,factors};
});
