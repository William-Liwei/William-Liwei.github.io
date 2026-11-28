/* Bounded cohort-based labor matching for City Blueprint. No private resident data. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network,typeof module==='object'?require('./active-travel.js'):root.ActiveTravel,typeof module==='object'?require('./economy.js'):root.Economy);
 if(typeof module==='object')module.exports=api;else root.Labor=api;
})(globalThis,function(N,A,E){
'use strict';
const ROLES={
 entry:{name:'入门岗位',wage:105,color:'#a7c6a0'},
 general:{name:'中学岗位',wage:146,color:'#91c0dc'},
 technical:{name:'技能岗位',wage:195,color:'#e2c17f'},
 professional:{name:'大学专业岗位',wage:263,color:'#bc9ee6'}
};
const GRADES={none:'无学历要求',primary:'小学',secondary:'中学',vocational:'职业技术',university:'大学'};
const REASONS={noJobs:'本市尚无岗位',qualification:'现有岗位需要不同学历',unreachable:'合适岗位没有可往返通勤的路线',experience:'可达职位需要更多实际工作经验',capacity:'高峰往返座位、班次或停车未满足',competition:'能到达的合适岗位已经招满',searchLimit:'近邻岗位搜索达到本月上限，未核完更远岗位'};
const roleKeys=Object.keys(ROLES),gradeKeys=Object.keys(GRADES),reasonKeys=Object.keys(REASONS);
const qualified={
 none:['entry'],primary:['entry'],secondary:['entry','general'],
 vocational:['entry','general','technical'],university:roleKeys
};
const mixByZone={commercial:[.66,.29,.05,0],industrial:[.53,.24,.23,0],office:[.25,.39,.19,.17]};
const mixBySector={
 corner_retail:[.77,.23,0,0],dining:[.78,.14,.08,0],repair_market:[.53,.21,.26,0],
 urban_farms:[.73,.17,.10,0],food_processing:[.61,.25,.14,0],metal_fabrication:[.51,.20,.29,0],
 electronics:[.40,.19,.36,.05],utility_equipment:[.38,.26,.31,.05],refinery:[.47,.19,.29,.05],
 software_studio:[.13,.27,.31,.29],finance_center:[.15,.42,.19,.24],research_lab:[.08,.17,.24,.51],
 media_studio:[.24,.39,.27,.10]
};
const wages={commercial:1,industrial:1.11,office:1.24};
const LIMIT={lots:4000,assignments:16000,people:500,log:96,walking:335,driving:1500};
const number=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),int=(v,d=0,a=0,b=1e9)=>Math.floor(clamp(number(v,d),a,b));
const id=(v,n=72)=>typeof v==='number'||typeof v==='string'?String(v).slice(0,n):'';
const arr=v=>Array.isArray(v)?v:[];
const own=(o,k)=>Object.hasOwn(o,k);
const valid=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=2000&&v.y>=0&&v.y<=1400;
const blank=(keys)=>Object.fromEntries(keys.map(k=>[k,0]));
const hydrate=(raw,keys,max=1e9)=>Object.fromEntries(keys.map(k=>[k,int(raw?.[k],0,0,max)]));
const totalFields=['population','students','adults','workers','jobs','employed','unemployed','vacancies','hired','separated','retained','graduatesHired','payroll','walking','driving','publicTransit','parkRide'];
const homeFields=['population','students','adults','workers','employed','unemployed','payroll','hired','retained','graduatesHired'];
const workFields=['jobs','employees','vacancies','payroll','hired','retained','graduatesHired'];
const sectorFields=['jobs','employees','vacancies','payroll','hired','graduatesHired'];
const fiscalFields=['payroll','payrollTax','businessTax','existingBusinessTax','businessAdjustment','adjustment'];
function create(seed='city-labor'){
 return {version:1,seed:String(seed).slice(0,96),lastMonth:0,assignments:[],log:[],last:null};
}
const MOBILITY_MODES=['walk','drive','transit','pr'];
const transitLeg=x=>x&&id(x.line,140)&&id(x.from,100)&&id(x.to,100)?{line:id(x.line,140),from:id(x.from,100),to:id(x.to,100)}:null;
function itinerary(x){
 if(!x||!Array.isArray(x.legs))return null;
 const legs=x.legs.slice(0,5).map(transitLeg).filter(Boolean);if(!legs.length)return null;
 return {legs,walk:int(x.walk,0,0,1000),lastWalk:int(x.lastWalk,0,0,1000),start:int(x.start,0,-300,1500)};
}
const tripEdge=x=>x&&id(x.edge,72)?{edge:id(x.edge,72),reverse:!!x.reverse}:null;
function routeFields(v){
 const route={mode:v.mode,distance:int(v.distance,0,0,3000)};
 if(Number.isFinite(v.seconds))route.seconds=int(v.seconds,0,0,3000);
 if(Number.isFinite(v.fare))route.fare=Math.round(clamp(v.fare,0,500)*100)/100;
 if(['day','early','late'].includes(v.shift))route.shift=v.shift;
 if(['pr','transit'].includes(v.mode)){
  route.outbound=itinerary(v.outbound);route.returnTrip=itinerary(v.returnTrip);
  const p=v.parking;
  if(v.mode==='pr'&&p&&id(p.site)){
   const road=v=>{const fields={seconds:int(v?.seconds,0,0,700),path:arr(v?.roadPath??v?.path).slice(0,150).map(tripEdge).filter(Boolean)};
    for(const k of ['accessEdge','arrivalEdge','accessNode','arrivalNode'])if(id(v?.[k],72))fields[k]=id(v[k],72);
    if(v?.direct===true)fields.direct=true;
    return fields;
   };
   route.parking={site:id(p.site),node:id(p.node),driveOut:road(p.driveOut),driveBack:road(p.driveBack)};
  }
 }
 return route;
}
function source(v){
 const home=id(v?.home),work=id(v?.work),grade=v?.grade,role=v?.role,mode=v?.mode,count=int(v?.count,0,0,LIMIT.people);
 if(!home||!work||!count||!own(GRADES,grade)||!own(ROLES,role)||!qualified[grade].includes(role)||!MOBILITY_MODES.includes(mode))return null;
 const retained=int(v.retained,0,0,count),wage=int(v.wage,0,0,5000),payroll=int(v.payroll,count*wage,0,count*5000);
 return {home,work,grade,role,...routeFields(v),count,wage:int(v.wage,0,0,5000),
  payroll,newGraduates:int(v.newGraduates,0,0,count-retained),retained};
}
function searchRow(v){return v?.strategy==='exact'||v?.strategy==='spatial'?{strategy:v.strategy,routeProbes:int(v.routeProbes,0,0,10000000),cacheHits:int(v.cacheHits,0,0,10000000),limitedHomes:int(v.limitedHomes,0,0,LIMIT.lots)}:null;}
function fiscalRow(v){
 return {payroll:int(v?.payroll),payrollTax:int(v?.payrollTax),businessTax:int(v?.businessTax),existingBusinessTax:int(v?.existingBusinessTax,0,-1e9),
  businessAdjustment:int(v?.businessAdjustment,0,-1e9),adjustment:int(v?.adjustment,0,-1e9),payrollRate:clamp(number(v?.payrollRate),0,5),ready:!!v?.ready};
}
function pointRow(v,key,d){
 if(!valid(v)||!id(key))return null;
 const p={id:id(key),x:v.x,y:v.y};
 if(d==='home')return {...p,...hydrate(v,homeFields),credentials:hydrate(v.credentials,gradeKeys),eligible:hydrate(v.eligible,gradeKeys),waitingReasons:hydrate(v.waitingReasons,reasonKeys)};
 if(!own(E.SECTORS,v.sector)||!own(wages,v.zone))return null;
 return {...p,sector:v.sector,zone:v.zone,name:E.SECTORS[v.sector].name,...hydrate(v,workFields),
  slots:hydrate(v.slots,roleKeys),filled:hydrate(v.filled,roleKeys),wage:hydrate(v.wage,roleKeys),tax:int(v.tax)};
}
function timeline(v){
 if(!v||!['hired','separated','graduatedHired'].includes(v.action)||!id(v.home))return null;
 return {month:int(v.month),action:v.action,home:id(v.home),count:int(v.count,0,0,LIMIT.people)};
}
function normalize(raw,seed='city-labor'){
 const out=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(!raw||typeof raw!=='object')return out;
 out.lastMonth=int(raw.lastMonth);
 const seen=new Set(),residents=new Map(),employees=new Map();
 for(const v of arr(raw.assignments).slice(0,LIMIT.assignments)){
  const a=source(v);if(!a)continue;
  const k=JSON.stringify([a.home,a.work,a.grade,a.role,a.mode,a.shift||'']);if(seen.has(k))continue;
  const homeLimit=own(raw.last?.byHome||{},a.home)?int(raw.last.byHome[a.home]?.workers,0,0,LIMIT.people):LIMIT.people;
  const workLimit=own(raw.last?.byWork||{},a.work)?int(raw.last.byWork[a.work]?.jobs,0,0,LIMIT.people):LIMIT.people;
  if((residents.get(a.home)||0)+a.count>homeLimit||(employees.get(a.work)||0)+a.count>workLimit)continue;
  residents.set(a.home,(residents.get(a.home)||0)+a.count);employees.set(a.work,(employees.get(a.work)||0)+a.count);
  seen.add(k);out.assignments.push(a);
 }
 out.log=arr(raw.log).slice(-LIMIT.log).map(timeline).filter(Boolean);
 if(raw.last&&typeof raw.last==='object'){
  const points=(values,kind)=>Object.fromEntries(Object.entries(values||{}).slice(0,LIMIT.lots).flatMap(([key,v])=>{
   const a=pointRow(v,key,kind);return a?[[a.id,a]]:[];
  }));
  const sectors=Object.fromEntries(Object.entries(raw.last.bySector||{}).filter(([k])=>own(E.SECTORS,k)).map(([k,v])=>[k,{...hydrate(v,sectorFields),tax:int(v?.tax)}]));
  out.last={month:out.lastMonth,totals:hydrate(raw.last.totals,totalFields),byHome:points(raw.last.byHome,'home'),byWork:points(raw.last.byWork,'work'),
   bySector:sectors,fiscal:fiscalRow(raw.last.fiscal),search:searchRow(raw.last.search)};
 }
 return out;
}
const netOf=(city,o)=>o.network||city.network||{edges:[],nodes:[]};
const wetOf=(o)=>typeof o.water==='function'?o.water:N.water;
function roadAccess(net,water){
 const vehicular=(net.edges||[]).filter(e=>['road','highway','ramp'].includes(e.kind)),edges=new Map(vehicular.map(e=>[e.id,e])),bins=new Map(),memo=new Map(),cache=new Map(),cell=64,range=48;
 for(const e of edges.values()){
  if(e.kind!=='road')continue;
  for(let i=1;i<e.pts.length;i++){
   const a=e.pts[i-1],b=e.pts[i];
   if(!valid(a)||!valid(b)||(Math.min(Math.abs(a.z||0),Math.abs(b.z||0))>2))continue;
   for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)
    for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++){
     const k=x+'|'+y;if(!bins.has(k))bins.set(k,new Set());bins.get(k).add(e);
    }
  }
 }
 function access(p){
  const key=p.x+'|'+p.y;
  if(memo.has(key))return memo.get(key);
  const es=new Set();
  for(let x=Math.floor((p.x-range)/cell);x<=Math.floor((p.x+range)/cell);x++)
   for(let y=Math.floor((p.y-range)/cell);y<=Math.floor((p.y+range)/cell);y++)
    for(const e of bins.get(x+'|'+y)||[])es.add(e);
  let best=null;
  for(const e of es){
   const hit=N.snap({edges:[e],nodes:[]},{...p,z:0},range,true);
   if(!hit||Math.abs(hit.z||0)>2)continue;
   const d=N.dist(p,hit);
   if(best&&(best.d<d-1e-6||(Math.abs(best.d-d)<=1e-6&&String(best.e.id)<String(e.id))))continue;
   const steps=Math.max(1,Math.ceil(d/4));let overWater=false;
   for(let i=0;i<=steps;i++)if(water(N.mix(p,hit,i/steps))){overWater=true;break;}
   if(overWater)continue;
   let q=0,idx=Math.floor(hit.pos);
   for(let i=0;i<Math.min(idx,e.pts.length-1);i++)q+=N.dist(e.pts[i],e.pts[i+1]);
   if(e.pts[idx+1])q+=N.dist(e.pts[idx],e.pts[idx+1])*(hit.pos-idx);
   const length=number(e.len,N.length(e.pts));
   best={e,hit,q:clamp(q,0,length),n:length,d};
  }
  memo.set(key,best);return best;
 }
 function ends(p,from){
  const a=p.q,b=p.n-a,s=[];
  // At exact junctions, a driveway can enter or leave the intersection. Else obey lane direction.
  if(a<.001)s.push({node:p.e.a,d:0,edge:null});
  if(b<.001)s.push({node:p.e.b,d:0,edge:null});
  if(from){
   if(b>=.001)s.push({node:p.e.b,d:b,edge:p.e.id});
   if(a>=.001&&!p.e.oneway)s.push({node:p.e.a,d:a,edge:p.e.id});
  }else{
   if(a>=.001)s.push({node:p.e.a,d:a,edge:p.e.id});
   if(b>=.001&&!p.e.oneway)s.push({node:p.e.b,d:b,edge:p.e.id});
  }return s;
 }
 return {access,ends,vehicular};
}
const metres=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
function dryConnector(a,b,water){
 const steps=Math.max(1,Math.ceil(N.dist(a,b)/4));
 for(let i=0;i<=steps;i++)if(water(N.mix(a,b,i/steps)))return false;
 return true;
}
function walkAnchors(graph,query,water){
 const p={x:query.x,y:query.y,z:0},cell=graph.cell||36,seen=new Set(),points=[],radius=44;
 for(let x=Math.floor((p.x-radius)/cell);x<=Math.floor((p.x+radius)/cell);x++)
  for(let y=Math.floor((p.y-radius)/cell);y<=Math.floor((p.y+radius)/cell);y++)
   for(const l of graph.bins.get(x+':'+y)||[]){
    if(seen.has(l.key)||!l.modes.includes('walk'))continue;seen.add(l.key);
    const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,base=dx*dx+dy*dy;
    const t=base?clamp(((p.x-l.a.x)*dx+(p.y-l.a.y)*dy)/base,0,1):0;
    const q=N.mix(l.a,l.b,t),m=metres(q,p);
    if(m>radius||Math.abs(q.z)>.65||!dryConnector(q,p,water))continue;
    points.push({l,q,m});
   }
 points.sort((a,b)=>a.m-b.m||a.l.key-b.l.key);
 return points.filter(v=>v.m<=points[0].m+5).slice(0,14);
}
function distanceTree(graph,anchors,range){
 const heap=[],out=new Map();
 const push=(k,d)=>{
  if(d>range||(out.get(k)??Infinity)<=d)return;
  out.set(k,d);
  const a={k,d};let i=heap.length;heap.push(a);
  while(i){const j=(i-1)>>1;if(heap[j].d<=d)break;heap[i]=heap[j];i=j;}heap[i]=a;
 };
 const pop=()=>{
  const x=heap[0],last=heap.pop();
  if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].d<heap[c].d)c++;if(last.d<=heap[c].d)break;heap[i]=heap[c];i=c;}heap[i]=last;}
  return x;
 };
 for(const {l,q,m} of anchors){push(l.ka,m+metres(l.a,q));push(l.kb,m+metres(l.b,q));}
 while(heap.length){
  const {k,d}=pop();if(out.get(k)!==d)continue;
  for(const n of graph.adj.get(k)||[])if(n.l.modes.includes('walk'))push(n.to,d+metres(n.l.a,n.l.b));
 }
 return out;
}
function hash(s){
 let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.charCodeAt(0),16777619);
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
 return (h>>>0)/4294967296;
}
function carRouter(net,road,loads=null){
 const vehicle={...net,edges:road.vehicular},adj=N.graph(vehicle,'car'),byEdge=new Map(vehicle.edges.map(e=>[e.id,e]));
 const trees=new Map(),max=loads?LIMIT.driving*5:LIMIT.driving,turns=N.normalizedTurns(vehicle).length>0;
 const cost=(edge,length)=>length*(loads?clamp(31.32/Math.max(15,number(edge.speed,36)),.37,2.2)*(1+.85*clamp(number(loads[edge.id])/Math.max(1,N.capacity(edge)),0,2.3)):1);
 function tree(start,arrival){
  const key=JSON.stringify([start,turns?arrival:null]);
  if(trees.has(key))return trees.get(key);
  const dist=new Map(),nodes=new Map(),heap=[];
  function push(node,edge,d){
   if(d>max)return;
   const k=turns?JSON.stringify([node,edge]):node;
   if((dist.get(k)??Infinity)<=d)return;
   dist.set(k,d);
   const item={k,node,edge,d};let i=heap.length;heap.push(item);
   while(i){const j=(i-1)>>1;if(heap[j].d<=d)break;heap[i]=heap[j];i=j;}heap[i]=item;
  }
  function pop(){
   const a=heap[0],last=heap.pop();
   if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].d<heap[c].d)c++;if(last.d<=heap[c].d)break;heap[i]=heap[c];i=c;}heap[i]=last;}
   return a;
  }
  push(start,arrival,0);
  while(heap.length){
   const x=pop();if(x.d!==dist.get(x.k))continue;
   if(!nodes.has(x.node))nodes.set(x.node,[]);
   nodes.get(x.node).push(x);
   for(const e of adj[x.node]||[])if(N.turnAllowed(adj,x.node,x.edge,e.edge)){
    push(e.to,e.edge,x.d+cost(byEdge.get(e.edge),number(byEdge.get(e.edge)?.len)));
   }
  }
  trees.set(key,nodes);return nodes;
 }
 function distance(a,b){
  if(!a||!b)return Infinity;
  const off=a.d+b.d;
  let best=a.e.id===b.e.id&&(!a.e.oneway||a.q<=b.q+1e-6)?cost(a.e,Math.abs(a.q-b.q)):Infinity;
  if(best===0)return off;
  for(const s of road.ends(a,true))for(const t of road.ends(b,false)){
   const end=cost(a.e,s.d)+cost(b.e,t.d);if(end+off>max||end>=best)continue;
   // Same node can require an actual loop to enter a turn-restricted departure.
   for(const x of tree(s.node,s.edge).get(t.node)||[]){
    if(x.d+end>=best)break;
    if(!N.turnAllowed(adj,t.node,x.edge,t.edge))continue;
    best=x.d+end;break;
   }
  }
  return best+off;
 }
 return {distance};
}
function routing(city,opts){
 const net=netOf(city,opts),water=wetOf(opts),road=roadAccess(net,water),car=carRouter(net,road),timeCar=opts.mobility&&opts.roadLoads?carRouter(net,road,opts.roadLoads):null;
 const graph=A.build(opts.activeTravel||city.activeTravel||A.create(),net,{shareBike:false}),foot=new Map(),trees=new Map();
 const walkAt=(v)=>{
  if(!foot.has(v.id))foot.set(v.id,walkAnchors(graph,v,water));
  return foot.get(v.id);
 };
 function route(a,b,treeAllowed=true){
  const direct=N.dist(a,b);if(direct>LIMIT.driving)return null;
  // Walking is deliberately preferred nearby. A car requires both trips
  // (not just the legal inbound half of a one-way access street).
  if(direct<=LIMIT.walking){
   const anchors=walkAt(a),other=walkAt(b);
   if(anchors.length&&other.length){
    if(!trees.has(a.id))trees.set(a.id,distanceTree(graph,anchors,LIMIT.walking));
    const tree=trees.get(a.id);let best=Infinity;
    for(const {l,q,m} of other){
     best=Math.min(best,m+metres(l.a,q)+(tree.get(l.ka)??Infinity),m+metres(l.b,q)+(tree.get(l.kb)??Infinity));
     for(const v of anchors)if(v.l.key===l.key)best=Math.min(best,m+v.m+metres(v.q,q));
    }
    if(best<=LIMIT.walking)return {mode:'walk',distance:Math.round(best)};
   }
  }
  if(!treeAllowed)return null;
  const x=road.access(a),y=road.access(b),out=car.distance(x,y),back=car.distance(y,x);
  if(out>LIMIT.driving||back>LIMIT.driving)return null;
  const routedTime=timeCar?(timeCar.distance(x,y)+timeCar.distance(y,x))/17.4:null;
  return {mode:'drive',distance:Math.round((out+back)/2),...(Number.isFinite(routedTime)?{seconds:Math.round(routedTime)}:{})};
 }
 return {route};
}
function apportioned(n,sh){
 const ideal=sh.map(x=>x*n),v=ideal.map(Math.floor);
 let left=n-v.reduce((a,b)=>a+b,0);
 for(const index of ideal.map((_,i)=>i).sort((a,b)=>(ideal[b]-v[b])-(ideal[a]-v[a])||a-b))if(left>0){v[index]++;left--;}
 return Object.fromEntries(roleKeys.map((k,i)=>[k,v[i]]));
}
function adultPool(lot,education,rawGroups){
 const pop=int(lot.occupants,0,0,LIMIT.people),edu=education?.byLot?.[id(lot.id)],cred=hydrate(edu?.credentials,gradeKeys,LIMIT.people);
 // The current education engine exposes disjoint highest credentials but that
 // table includes enrolled pupils. The live group stage resolves that overlap.
 if(Array.isArray(rawGroups)&&rawGroups.length){
  const ad=blank(gradeKeys);let pupils=0,groupN=0;
  for(const q of rawGroups.slice(0,LIMIT.people)){
   if(!q||!own(GRADES,q.grade))continue;
   const n=int(q.n,0,0,LIMIT.people);groupN+=n;
   if(q.stage==='adult')ad[q.grade]+=n;else pupils+=n;
  }
  const totals=gradeKeys.reduce((k,g)=>k+cred[g],0);
  const hasSnapshot=edu&&totals>0;
  let room=Math.min(pop,groupN)-Math.min(pop,pupils);
  for(const g of [...gradeKeys].reverse()){
   ad[g]=Math.min(ad[g],hasSnapshot?cred[g]:ad[g],Math.max(0,room));room-=ad[g];
  }
  return {pop,ad,pupils:Math.min(pop,pupils)};
 }
 const remaining=edu?int(edu.students?.demand??edu.enrolled,0,0,pop):0;
 const ad=blank(gradeKeys);let raw=pop,consume=remaining;
 // In an old/partial snapshot, the precise pupil grades are unknown. Do not
 // invent skilled adult supply: conservatively remove pupils at highest grades.
 for(const g of [...gradeKeys].reverse()){
  const n=Math.min(raw,cred[g]),students=Math.min(n,consume);
  ad[g]=n-students;raw-=n;consume-=students;
 }
 ad.none+=Math.max(0,raw-consume);
 return {pop,ad,pupils:remaining};
}
const fiscalOpts=(city)=>({...city.finance,economy:city.economy});
function economyOf(city,opts){return opts.economy?.lots?opts.economy:E.evaluate(city.civic,fiscalOpts(city));}
function validLots(city,includeVacant=false){
 const indexed=new Map();
 for(const l of arr(city?.civic?.lots)){
  const k=id(l?.id);
  if(!valid(l)||!k||(!includeVacant&&number(l.level)<=0)||indexed.has(k))continue;
  indexed.set(k,{...l,id:k});
  if(indexed.size>=LIMIT.lots)break;
 }
 return indexed;
}
function collect(city,opts,econ,state,month){
 const grounds=validLots(city),homes=new Map(),firms=new Map(),edu=opts.education||city.education?.last;
 const events=new Map();
 for(const v of arr(edu?.log??city.education?.log)){
  if(v?.month!==month||v.action!=='graduated'||!['vocational','university'].includes(v.type)||!id(v.lotId))continue;
  const k=id(v.lotId)+'|'+v.type;events.set(k,(events.get(k)||0)+int(v.count,0,0,LIMIT.people));
 }
 for(const l of grounds.values()){
  const def=E.sector(l),e=econ.lots[l.id];if(!def||!e)continue;
  if(l.type==='residential'){
   const {pop,ad,pupils}=adultPool(l,edu,city.education?.households?.[l.id]?.groups);
   if(!pop)continue;
   const r={id:l.id,x:l.x,y:l.y,...blank(homeFields),population:pop,students:pupils,
    adults:gradeKeys.reduce((sum,k)=>sum+ad[k],0),credentials:ad,eligible:blank(gradeKeys),waitingReasons:blank(reasonKeys)};
   const free=blank(gradeKeys),fresh=blank(gradeKeys);
   const ratio=clamp(def.participation+.15,.55,.85);
   for(const g of gradeKeys){
    const newGrad=Math.min(ad[g],events.get(l.id+'|'+g)||0);
    const estimate=(ad[g]-newGrad)*ratio;
    const settled=Math.min(ad[g]-newGrad,Math.floor(estimate)+Number(hash(state.seed+'|'+l.id+'|'+g)<estimate%1));
    free[g]=settled+newGrad;fresh[g]=newGrad;r.eligible[g]=free[g];r.workers+=free[g];
   }
   homes.set(l.id,{r,free,fresh,l});continue;
  }
  const jobs=int(e.jobs,0,0,LIMIT.people);
  if(!jobs||!own(wages,def.zone))continue;
  const roles=apportioned(jobs,mixBySector[def.id]||mixByZone[def.zone]);
  const byWage=Object.fromEntries(roleKeys.map(k=>{
   const base=Math.round(ROLES[k].wage*wages[def.zone]),offered=opts.career?.postedWage(base,{sector:def.id,role:k});
   return [k,int(offered,base,1,5000)];
  }));
  const r={id:l.id,x:l.x,y:l.y,sector:def.id,zone:def.zone,name:def.name,...blank(workFields),jobs,
   slots:roles,filled:blank(roleKeys),wage:byWage,tax:0};
  firms.set(l.id,{r,available:{...roles},l});
 }
 return {homes,firms};
}
function fiscal(state,city,opts={}){
 const work=opts.work||state?.last?.byWork;
 if(!work)return fiscalRow(null);
 const econ=economyOf(city,opts),metrics=opts.civicMetrics;
 const rate=clamp(number(opts.payrollRate,number(city.finance?.payrollTax,number(city.finance?.tax,9)*.25)),0,5);
 const detailed=Object.create(null);
 let payroll=0,business=0,oldBusiness=0,oldHousing=0;
 for(const l of validLots(city,true).values()){
  const def=E.sector(l),e=econ.lots[l.id],base=metrics?.lots?.[l.id]||{},v=work[l.id];
  if(!def||!e)continue;
  const taxRate=clamp(number(e.taxRate,9),0,20)/9,activity=1+(def.zone==='industrial'?.12*number(base.logistics):def.zone==='commercial'?.08*number(base.plaza)+.035*number(base.logistics):0);
  const legacyAmount=number(l.occupants)*def.baseTax*taxRate*activity;
  if(def.zone==='residential'){oldHousing+=legacyAmount;continue;}
  const employees=v?.sector===def.id?Math.min(int(v?.employees),int(e.jobs)):0;
  const realPayroll=v?.sector===def.id?int(v?.payroll):0;
  const sales=.56+.44*clamp(number(e.inputReliability,1))*(.33+.67*clamp(number(e.sellThrough,1)));
  const actualTax=employees*def.baseTax*taxRate*activity*sales;
  payroll+=realPayroll;business+=actualTax;oldBusiness+=legacyAmount;
  detailed[l.id]=Math.round(actualTax);
 }
 // Civic already credits estimated business taxes as part of general income;
 // Economy provides a second *adjustment* to that baseline, not gross revenue.
 // Subtract those exact layers before making any new monthly treasury entry.
 const hasBaseline=!!metrics?.lots&&Number.isFinite(econ.totals?.taxAdjustment);
 const civicCredited=Number.isFinite(metrics?.totals?.income)?Math.round(metrics.totals.income)-Math.round(oldHousing):Math.round(oldBusiness);
 const existing=civicCredited+int(econ.totals?.taxAdjustment,0,-1e9);
 const businessTax=Math.round(business),payrollTax=Math.round(payroll*rate/100);
 return {...fiscalRow({ready:hasBaseline,payroll,payrollRate:rate,payrollTax,businessTax,existingBusinessTax:existing,
  businessAdjustment:businessTax-existing,adjustment:hasBaseline?businessTax-existing+payrollTax:0}),byWork:detailed};
}
function emptyReport(){
 return {month:0,totals:blank(totalFields),byHome:{},byWork:{},bySector:{},assignments:[],fiscal:fiscalRow(null),log:[]};
}
function report(state){
 if(!state?.last)return {...emptyReport(),month:state?.lastMonth||0};
 return {...state.last,assignments:state.assignments,log:state.log};
}
// The town-size matcher below intentionally stays exhaustive. Above this
// product, a spatial vacancy index grows each search in batches. This avoids
// retaining an H×F matrix while keeping role-specific/global rare jobs visible.
const EXACT_PAIRS=24000, BATCHES=[10,18,44], GRID_SIDE=96, PATH_CACHE=24;
function vacancyIndex(jobs){
 const roles=Object.fromEntries(roleKeys.map(key=>[key,{cells:new Map(),live:0}]));
 for(const f of jobs)for(const key of roleKeys){
  if(!f.r.slots[key])continue;
  const x=Math.floor(f.l.x/GRID_SIDE),y=Math.floor(f.l.y/GRID_SIDE),id=x+':'+y,role=roles[key];
  let cell=role.cells.get(id);
  if(!cell){cell={x:x*GRID_SIDE,y:y*GRID_SIDE,all:[],live:new Set()};role.cells.set(id,cell);}
  cell.all.push(f);if(f.available[key]>0){cell.live.add(f);role.live++;}
 }
 const consume=(f,key)=>{
  if(f.available[key]>0)return;
  const role=roles[key],cell=role.cells.get(Math.floor(f.l.x/GRID_SIDE)+':'+Math.floor(f.l.y/GRID_SIDE));
  if(cell?.live.delete(f))role.live--;
 };
 function nearby(h,key,n,{available=true,skip=null,maxDistance=Infinity}={}){
  const role=roles[key];
  if(!role||available&&role.live===0)return [];
  const p=h.l,limit=n,maxSq=maxDistance*maxDistance,cells=[];
  for(const cell of role.cells.values()){
   if(available&&!cell.live.size)continue;
   const dx=Math.max(cell.x-p.x,0,p.x-cell.x-GRID_SIDE),dy=Math.max(cell.y-p.y,0,p.y-cell.y-GRID_SIDE),bound=dx*dx+dy*dy;
   if(bound<=maxSq)cells.push({cell,bound});
  }
  cells.sort((a,b)=>a.bound-b.bound);
  const found=[];
  for(const {cell,bound} of cells){
   if(found.length===limit&&bound>found.at(-1).d)break;
   for(const f of available?cell.live:cell.all){
    if(skip?.has(f.r.id))continue;
    const dx=f.l.x-p.x,dy=f.l.y-p.y,d=dx*dx+dy*dy,last=found.at(-1);
    if(d>maxSq||found.length===limit&&(d>last.d||d===last.d&&f.r.id>=last.f.r.id))continue;
    let lo=0,hi=found.length;
    while(lo<hi){const m=(lo+hi)>>1,z=found[m];if(d>z.d||d===z.d&&f.r.id>=z.f.r.id)lo=m+1;else hi=m;}
    found.splice(lo,0,{f,d});if(found.length>limit)found.pop();
   }
  }
  return found;
 }
 return {consume,nearby,open:key=>roles[key]?.live||0};
}
function advance(state,city,opts={}){
 const month=int(city?.month,1,1);
 if(month<=state.lastMonth)return {...report(state),noOp:true};
 const econ=economyOf(city,opts),{homes,firms}=collect(city,opts,econ,state,month),routes=routing(city,opts);
 const jobs=[...firms.values()].sort((a,b)=>a.r.id.localeCompare(b.r.id));
 const people=[...homes.values()].sort((a,b)=>a.r.id.localeCompare(b.r.id));
 const mobility=opts.mobility,exact=people.length*jobs.length<=EXACT_PAIRS;
 const spatial=exact?null:vacancyIndex(jobs),maxDistance=mobility?Infinity:LIMIT.driving;
 const search={strategy:exact?'exact':'spatial',routeProbes:0,cacheHits:0,limitedHomes:0};
 const pools=new Map(),found=new Map(),stored=[],byHome={},byWork={},bySector={},t=blank(totalFields);
 function path(h,f){
  if(!pools.has(h.r.id))pools.set(h.r.id,new Map());
  const v=pools.get(h.r.id);
  if(v.has(f.r.id)){search.cacheHits++;return v.get(f.r.id);}
  search.routeProbes++;
  const direct=routes.route(h.l,f.l);
  const params={home:h.l,work:f.l,walk:direct?.mode==='walk'?direct:null,drive:direct?.mode==='drive'?direct:null};
  const result=mobility?(mobility.routes({...params,wage:Math.max(...Object.values(f.r.wage))})[0]||null):direct;
  if(!exact&&v.size>=PATH_CACHE)v.delete(v.keys().next().value);
  const entry={result,params};v.set(f.r.id,entry);
  if(!exact&&result){
   h.reachable??=new Set();h.sampled??=new Map();
   for(const k of roleKeys)if(f.r.slots[k])h.reachable.add(k);
   // A bounded sample for unemployment diagnostics, not a second route cache.
   if(h.sampled.size<PATH_CACHE||h.sampled.has(f.r.id))h.sampled.set(f.r.id,f);
  }
  return entry;
 }
 function allFor(h){
  if(!h.candidates){
   h.candidates=[];
   for(const f of jobs){
    const {result:route,params}=path(h,f);
    if(route)h.candidates.push({f,route,params});
   }
   h.candidates.sort((a,b)=>a.route.distance-b.route.distance||a.f.r.id.localeCompare(b.f.r.id));
  }
  return h.candidates;
 }
 const career=opts.career;
 if(career)for(const h of people)for(const g of gradeKeys)career.register(h.r.id,g,h.free[g],h.fresh[g]);
 const assignmentKey=(h,f,g,k,route)=>JSON.stringify([h.r.id,f.r.id,g,k,route.mode,route.shift||'']);
 const jobArgs=(h,f,g,k,retained=false)=>({home:h.r.id,work:f.r.id,grade:g,role:k,sector:f.r.sector,baseWage:f.r.wage[k],retained});
 function pair(h,f,g,k,route,n,retained){
  if(n<=0)return 0;
  const asked=n;
  const key=assignmentKey(h,f,g,k,route);let a=found.get(key);
  if(!a&&stored.length>=LIMIT.assignments)return 0;
  if(mobility){n=Math.min(n,mobility.capacity(route));if(!n){mobility.take(route,asked);return 0;}}
  const accepted=career?.take({...jobArgs(h,f,g,k,retained),count:n});
  if(career)n=int(accepted?.count,0,0,n);
  if(!n)return 0;
  if(mobility)mobility.take(route,n);
  if(!a){
   a={home:h.r.id,work:f.r.id,grade:g,role:k,count:0,...routeFields(route),wage:f.r.wage[k],payroll:0,retained:0,newGraduates:0};
   stored.push(a);found.set(key,a);
  }
  const graduates=retained?0:int(accepted?.newGraduates,Math.min(n,h.fresh[g]),0,Math.min(n,h.fresh[g])),money=int(accepted?.payroll,n*f.r.wage[k],0,n*5000);
  a.count+=n;a.payroll+=money;a.wage=Math.round(a.payroll/a.count);a.retained+=retained?n:0;a.newGraduates+=graduates;
  h.free[g]-=n;h.fresh[g]-=graduates;f.available[k]-=n;
  spatial?.consume(f,k);
  h.r.employed+=n;h.r.payroll+=money;h.r.graduatesHired+=graduates;
  f.r.employees+=n;f.r.payroll+=money;f.r.filled[k]+=n;f.r.graduatesHired+=graduates;
  if(retained){h.r.retained+=n;f.r.retained+=n;}
  else{h.r.hired+=n;f.r.hired+=n;}
  t[({walk:'walking',drive:'driving',transit:'publicTransit',pr:'parkRide'})[route.mode]]+=n;
  return n;
 }
 function place(h,f,g,k,base,n,retained){
  if(!mobility)return pair(h,f,g,k,base.result,n,retained);
  let left=n;
  for(const r of mobility.routes({...base.params,wage:f.r.wage[k]})){
   const take=pair(h,f,g,k,r,left,retained);left-=take||0;if(!left)break;
  }
  return n-left;
 }
 // Preserve qualified existing jobs if both housing & business still exist and
 // the road or walking network still works. Recent graduates are accounted
 // as new workforce, never retained with another month's previous employee.
 let previous=0,retained=0;
 for(const a of state.assignments){
  previous+=a.count;
  const h=homes.get(a.home),f=firms.get(a.work);
  if(!h||!f||!qualified[a.grade]?.includes(a.role))continue;
  let n=Math.min(a.count,h.free[a.grade]-h.fresh[a.grade],f.available[a.role]);
  if(n<=0)continue;
  const commute=path(h,f);if(!commute.result)continue;
  if(career){
   const higher=roleKeys.slice(roleKeys.indexOf(a.role)+1).filter(k=>qualified[a.grade].includes(k)&&f.available[k]>0).map(k=>({role:k,open:f.available[k]}));
   if(higher.length)n-=int(career.promotionQuota({...jobArgs(h,f,a.grade,a.role,true),count:n,higher}),0,0,n);
  }
  const before=h.r.retained;place(h,f,a.grade,a.role,commute,n,true);retained+=h.r.retained-before;
 }
 // Scarcer advanced positions match first. Within a qualification band,
 // recent graduates and closer commutes get priority; no worker can be reused.
 if(exact){
 for(const k of [...roleKeys].reverse()){
  const opening=jobs.some(f=>f.available[k]>0);if(!opening)continue;
  for(const g of gradeKeys){
   if(!qualified[g].includes(k))continue;
   const qualifiedHomes=people.filter(h=>h.free[g]>0);
   for(const h of qualifiedHomes)allFor(h);
   qualifiedHomes.sort((a,b)=>Number(b.fresh[g]>0)-Number(a.fresh[g]>0)||
    (a.candidates.find(x=>x.f.r.slots[k])?.route.distance??1e8)-(b.candidates.find(x=>x.f.r.slots[k])?.route.distance??1e8)||a.r.id.localeCompare(b.r.id));
   for(const h of qualifiedHomes){
    if(!h.free[g])continue;
    const choices=h.candidates.filter(x=>x.f.available[k]>0).sort((a,b)=>{
     const score=x=>x.route.distance+(x.route.mode==='drive'?60:0)-x.f.r.wage[k]*.7;
     return score(a)-score(b)||a.f.r.id.localeCompare(b.f.r.id);
    });
    for(const {f,route,params} of choices){
     const n=Math.min(h.free[g],f.available[k]);
     place(h,f,g,k,{result:route,params},n,false);
     if(!h.free[g])break;
    }
   }
  }
 }
 }else for(const k of [...roleKeys].reverse()){
  if(!spatial.open(k))continue;
  for(const g of gradeKeys){
   if(!qualified[g].includes(k)||!spatial.open(k))continue;
   const qualifiedHomes=people.filter(h=>h.free[g]>0).map(h=>({h,d:spatial.nearby(h,k,1,{maxDistance})[0]?.d??Infinity}));
   qualifiedHomes.sort((a,b)=>Number(b.h.fresh[g]>0)-Number(a.h.fresh[g]>0)||a.d-b.d||a.h.r.id.localeCompare(b.h.r.id));
   for(const {h} of qualifiedHomes){
    if(!spatial.open(k))break;
    const tried=new Set();
    for(const size of BATCHES){
     const available=spatial.nearby(h,k,size+1,{skip:tried,maxDistance}),choices=[];
     for(const {f} of available.slice(0,size)){
      tried.add(f.r.id);const {result:route,params}=path(h,f);if(route)choices.push({f,route,params});
     }
     const score=x=>x.route.distance+(x.route.mode==='drive'?60:0)-x.f.r.wage[k]*.7;
     choices.sort((a,b)=>score(a)-score(b)||a.f.r.id.localeCompare(b.f.r.id));
     for(const {f,route,params} of choices){
      const n=Math.min(h.free[g],f.available[k]);if(n)place(h,f,g,k,{result:route,params},n,false);
      if(!h.free[g])break;
     }
     if(!h.free[g]||available.length<=size)break;
     if(size===BATCHES.at(-1))h.searchLimited=true;
    }
   }
  }
 }
 const compatible=Object.fromEntries(gradeKeys.map(g=>[g,new Set(qualified[g])]));
 const activeRoles=new Set(),vacantRoles=new Set();
 for(const f of jobs)for(const k of roleKeys){
  if(f.r.slots[k]>0)activeRoles.add(k);
  if(f.available[k]>0)vacantRoles.add(k);
 }
 for(const h of people){
  const r=h.r;Object.defineProperty(byHome,r.id,{value:r,enumerable:true,configurable:true,writable:true});
  r.unemployed=r.workers-r.employed;
  for(const g of gradeKeys)if(h.free[g]>0){
   const can=compatible[g],anySlots=[...can].some(k=>activeRoles.has(k)),anyVacancy=[...can].some(k=>vacantRoles.has(k));
   let local=anySlots&&(exact?allFor(h).some(x=>[...can].some(k=>x.f.r.slots[k]>0)):[...can].some(k=>h.reachable?.has(k)));
   if(!exact&&anySlots&&!local){
    // Closed-but-reachable jobs can explain ordinary competition. This
    // diagnostic lookup is deliberately shallower than placement.
    for(const k of can){
     if(!activeRoles.has(k))continue;
     const rows=spatial.nearby(h,k,9,{available:false,maxDistance});
     for(const {f} of rows.slice(0,8)){if(path(h,f).result){local=true;break;}}
     if(local)break;
     if(rows.length>8)h.searchLimited=true;
    }
   }
   const nearbyVacancies=career&&local?(exact?allFor(h).map(x=>x.f):[...h.sampled?.values()||[]]).flatMap(f=>[...can].filter(k=>f.available[k]>0).map(k=>[f,k])):[];
   const noCommuteSeat=mobility&&local&&nearbyVacancies.length>0&&nearbyVacancies.every(([f,k])=>{
    const q=path(h,f);return !mobility.routes({...q.params,wage:f.r.wage[k]}).some(x=>mobility.capacity(x)>0);
   });
   const noExperience=nearbyVacancies.length>0&&nearbyVacancies.every(([f,k])=>career.capacity(jobArgs(h,f,g,k))===0);
   const reason=!jobs.length?'noJobs':!anySlots?'qualification':!anyVacancy&&[...vacantRoles].some(k=>!can.has(k))?'qualification':h.searchLimited&&(!local||anyVacancy)?'searchLimit':!local?'unreachable':noExperience?'experience':noCommuteSeat?'capacity':'competition';
   r.waitingReasons[reason]+=h.free[g];
  }
  if(h.searchLimited)search.limitedHomes++;
  for(const k of homeFields)if(Object.hasOwn(t,k))t[k]+=r[k];
  for(const [action,count] of [['hired',r.hired],['graduatedHired',r.graduatesHired]]){
   if(count)state.log.push({month,action,home:r.id,count});
  }
 }
 const prior=new Map(),remaining=new Map();
 for(const a of state.assignments)prior.set(a.home,(prior.get(a.home)||0)+a.count);
 for(const a of stored)remaining.set(a.home,(remaining.get(a.home)||0)+a.retained);
 for(const [home,old] of prior)if(old>(remaining.get(home)||0))state.log.push({month,action:'separated',home,count:old-(remaining.get(home)||0)});
 t.separated=Math.max(0,previous-retained);
 for(const {r} of jobs){
  r.vacancies=r.jobs-r.employees;
  Object.defineProperty(byWork,r.id,{value:r,enumerable:true,configurable:true,writable:true});
  t.jobs+=r.jobs;t.vacancies+=r.vacancies;
 }
 const {byWork:taxByWork,...ledger}=fiscal(state,city,{...opts,economy:econ,work:byWork});
 for(const {r} of jobs){
  r.tax=taxByWork[r.id]||0;
  const group=bySector[r.sector]??={...blank(sectorFields),tax:0};
  for(const k of Object.keys(group))group[k]+=r[k];
 }
 state.assignments=stored;state.log=state.log.slice(-LIMIT.log);state.lastMonth=month;
 state.last={month,totals:t,byHome,byWork,bySector,fiscal:ledger,search};
 return report(state);
}
function preview(state,city,opts={}){
 const next=normalize(state,state?.seed);
 return advance(next,{...city,month:Math.max(int(city?.month,1,1),next.lastMonth+1)},opts);
}
return {ROLES,GRADES,REASONS,LIMIT,create,normalize,report,advance,tick:advance,preview,fiscal};
});
