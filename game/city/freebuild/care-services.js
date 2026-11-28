/* Fictional shared city operations, not real-world emergency or medical guidance. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network,typeof module==='object'?require('./active-travel.js'):root.ActiveTravel);
 if(typeof module==='object')module.exports=api;else root.CareServices=api;
})(globalThis,function(N,A){
'use strict';
const TYPES={
 fire:{name:'消防救援站',icon:'消',color:'#ff9069',cost:14600,monthly:790,capacity:4,width:25,depth:19,stock:6,restock:2,minReady:3},
 clinic:{name:'社区诊所',icon:'诊',color:'#79d5ca',cost:9800,monthly:580,capacity:5,width:20,depth:16,stock:7,restock:3,minReady:2},
 hospital:{name:'综合医院',icon:'医',color:'#89c5fb',cost:31000,monthly:1750,capacity:8,width:34,depth:24,range:950},
 community:{name:'社区服务中心',icon:'社',color:'#e4ca8d',cost:13000,monthly:655,capacity:8,width:25,depth:20,range:340}
};
const REASONS={
 new:'已生成住院转诊',noHospital:'没有开放接诊的医院',noOrigin:'原转诊设施缺少地面道路入口',hospitalRoad:'救护往返道路不通或路程过长',
 hospitalFull:'可到达医院没有空床',admitted:'已入住病床',discharged:'完成住院并释放病床',expired:'超期待接诊，转诊记录归档',
 duplicate:'此地块已有住院转诊或住院记录',queueFull:'转诊记录达到上限',used:'动用救援储备',restocked:'人员与装备补充',
 covered:'本月已完成社区探访'
};
const LIMIT={sites:96,legacy:120,referrals:160,patients:768,visits:768,logs:112,seen:768,maxWait:6,lots:4000};
const ACTIONS=['referred','admitted','discharged','expired','skipped','response','restock','outreach'];
const stockKind=k=>k==='fire'||k==='clinic';
const own=(o,k)=>Object.hasOwn(o,k),num=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),
 int=(v,d=0,a=0,b=1e9)=>Math.round(clamp(num(v,d),a,b));
const funding=(v)=>int(v,100,0,100),budget=(v)=>int(v,100,0,150);
const id=(v,n=72)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,n):'';
const iid=v=>/^I[1-9][0-9]{0,9}$/.test(v),sid=v=>/^Care[1-9][0-9]{0,7}$/.test(v),legacyId=v=>/^legacy:.{1,65}$/.test(v);
const valid=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=2000&&v.y>=0&&v.y<=1400;
const zero=()=>({referred:0,admitted:0,discharged:0,expired:0,skipped:0,response:0,restock:0,outreach:0});
const objCount=(v)=>Object.fromEntries(Object.keys(zero()).map(k=>[k,int(v?.[k])]));
const list=(v)=>Array.isArray(v)?v:[];
function create(seed='city-care'){
 return {version:1,seed:String(seed).slice(0,96),next:1,lastMonth:0,sites:[],referrals:[],patients:[],assignments:[],seen:[],log:[],totals:zero(),last:null};
}
function site(v){
 if(!valid(v)||!own(TYPES,v.type)||!sid(id(v.id)))return null;
 const spec=TYPES[v.type];
 return {id:id(v.id),type:v.type,x:v.x,y:v.y,funding:funding(v.funding),stock:spec.stock?int(v.stock,spec.stock,0,spec.stock):0};
}
function referral(v){
 if(!valid(v)||!iid(id(v.id))||!id(v.lotId)||!id(v.provider))return null;
 return {id:id(v.id),lotId:id(v.lotId),x:v.x,y:v.y,provider:id(v.provider),source:valid(v.source)?{x:v.source.x,y:v.source.y}:null,
  opened:int(v.opened,1,1),severity:int(v.severity,3,3,4),reason:own(REASONS,v.reason)?v.reason:'new'};
}
function patient(v){
 const r=referral(v);
 if(!r||!(sid(id(v.hospital))||legacyId(id(v.hospital))))return null;
 r.reason='admitted';const admitted=int(v.admitted,r.opened,r.opened);
 return {...r,hospital:id(v.hospital),admitted,discharge:int(v.discharge,admitted+1,admitted+1,admitted+7)};
}
function assignment(v){
 if(!valid(v)||!id(v.lotId)||!sid(id(v.site)))return null;
 return {lotId:id(v.lotId),x:v.x,y:v.y,site:id(v.site),month:int(v.month,1,1),distance:int(v.distance,0,0,800)};
}
function row(v){
 if(!v||!ACTIONS.includes(v.action))return null;
 return {month:int(v.month,1,1),action:v.action,reason:own(REASONS,v.reason)?v.reason:'new',id:iid(id(v.id))?id(v.id):'',
  site:id(v.site),lotId:id(v.lotId),x:valid(v)?v.x:null,y:valid(v)?v.y:null,count:int(v.count,1,1,1000)};
}
function summary(v){
 if(!valid(v)||!own(TYPES,v.type)||!id(v.id))return null;
 return {id:id(v.id),type:v.type,x:v.x,y:v.y,funding:v.legacy?budget(v.funding):funding(v.funding),
  capacity:int(v.capacity,0,0,20),used:int(v.used,0,0,20),stock:int(v.stock,0,0,TYPES[v.type].stock||0),stockMax:TYPES[v.type].stock||0,
  dispatchFunding:budget(v.dispatchFunding),lastCapacity:int(v.lastCapacity,0,0,20),deployed:int(v.deployed,0,0,10),restocked:int(v.restocked,0,0,10),
  connected:!!v.connected,legacy:!!v.legacy,monthly:int(v.monthly)};
}
function normalize(raw,seed='city-care'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(!raw||typeof raw!=='object')return s;
 const sites=new Map(),seen=new Set(),lotUsed=new Set(),occupancy=new Map();
 for(const v of list(raw.sites).slice(0,LIMIT.sites)){
  const a=site(v);if(!a||sites.has(a.id))continue;
  sites.set(a.id,a);s.sites.push(a);s.next=Math.max(s.next,+a.id.slice(4)+1);
 }
 s.next=Math.max(s.next,int(raw.next,1,1,99999999));s.lastMonth=int(raw.lastMonth);
 for(const v of list(raw.patients).slice(0,LIMIT.patients)){
  const a=patient(v),max=a&&legacyId(a.hospital)?12:TYPES.hospital.capacity;
  if(!a||seen.has(a.id)||lotUsed.has(a.lotId)||(!legacyId(a.hospital)&&sites.get(a.hospital)?.type!=='hospital')||(occupancy.get(a.hospital)||0)>=max)continue;
  occupancy.set(a.hospital,(occupancy.get(a.hospital)||0)+1);seen.add(a.id);lotUsed.add(a.lotId);s.patients.push(a);
 }
 for(const v of list(raw.referrals).slice(0,LIMIT.referrals)){
  const a=referral(v);if(!a||seen.has(a.id)||lotUsed.has(a.lotId))continue;
  seen.add(a.id);lotUsed.add(a.lotId);s.referrals.push(a);
 }
 const used=new Set();
 for(const v of list(raw.assignments).slice(0,LIMIT.visits)){
  const a=assignment(v);if(!a||used.has(a.lotId)||sites.get(a.site)?.type!=='community'||a.month!==s.lastMonth)continue;
  used.add(a.lotId);s.assignments.push(a);
 }
 s.seen=[...new Set(list(raw.seen).slice(-LIMIT.seen).filter(v=>typeof v==='string'&&iid(v)))];
 const tracked=new Set(s.seen);for(const v of seen)if(!tracked.has(v))s.seen.push(v);
 s.seen=s.seen.slice(-LIMIT.seen);s.log=list(raw.log).slice(-LIMIT.logs).map(row).filter(Boolean);s.totals=objCount(raw.totals);
 if(raw.last&&typeof raw.last==='object'){
  s.last={month:int(raw.last.month,s.lastMonth,0,s.lastMonth),...objCount(raw.last),maintenance:int(raw.last.maintenance),
   waiting:int(raw.last.waiting,0,0,LIMIT.referrals),occupied:int(raw.last.occupied,0,0,LIMIT.patients),covered:int(raw.last.covered,0,0,LIMIT.visits),
   sites:list(raw.last.sites).slice(0,LIMIT.sites+LIMIT.legacy).map(summary).filter(Boolean)};
 }
 return s;
}
const networkOf=(city,opts)=>opts.network||city.network||{nodes:[],edges:[]},
 waterOf=(opts)=>typeof opts.water==='function'?opts.water:N.water;
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
   const length=num(e.len,N.length(e.pts));
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
 let adj;
 function distance(a,b){
  if(!a||!b)return Infinity;
  let best=a.e.id===b.e.id&&(!a.e.oneway||a.q<=b.q+1e-6)?Math.abs(a.q-b.q):Infinity;
  if(best===0)return a.d+b.d;
  for(const s of ends(a,true))for(const t of ends(b,false)){
   if(s.d+t.d>=best)continue;
   const key=JSON.stringify([s.node,t.node,s.edge,t.edge]);
   if(!cache.has(key)){
    adj??=N.graph({...net,edges:vehicular},'car');
    const path=N.path(adj,s.node,t.node,s.edge,t.edge);
    cache.set(key,path?path.reduce((v,p)=>v+num(edges.get(p.edge)?.len,0),0):Infinity);
   }
   best=Math.min(best,s.d+t.d+cache.get(key));
  }
  return best+a.d+b.d;
 }
 return {access,distance};
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
function monthly(s){return Math.round(TYPES[s.type].monthly*(.20+.80*funding(s.funding)/100));}
function maintenance(state){return (state?.sites||[]).reduce((sum,v)=>sum+monthly(v),0);}
function dispatchFunding(s,city){
 if(!stockKind(s?.type))return 0;
 const spec=TYPES[s.type];
 if(s.stock<spec.minReady)return 0;
 const allowed=Math.min(funding(s.funding),budget(city?.civic?.budgets?.[s.type]),Math.floor(100*s.stock/spec.capacity));
 return Math.floor(spec.capacity*allowed/100)>0?allowed:0;
}
function responders(state,city){
 const r=[];
 for(const s of state?.sites||[]){
  const f=dispatchFunding(s,city);
  if(f>0)r.push({id:s.id,type:s.type,x:s.x,y:s.y,funding:f});
 }
 return r;
}
function plan(state,city,data={},opts={}){
 const fail=reason=>({ok:false,reason});
 if(!valid(data)||!own(TYPES,data.type))return fail('请选择服务类别和位置');
 if(state.sites.length>=LIMIT.sites)return fail('城市服务设施数量已达上限');
 const spec=TYPES[data.type],p={x:data.x,y:data.y,z:0},water=waterOf(opts),net=networkOf(city,opts);
 const land=opts.land||opts.isLand||opts.isBuildable||((q)=>q.x>=2&&q.x<=1198&&q.y>=2&&q.y<=798&&!water(q));
 const footprint=[p,...[-1,1].flatMap(x=>[-1,1].map(y=>({x:p.x+spec.width*x/2,y:p.y+spec.depth*y/2,z:0})))];
 if(footprint.some(q=>!land(q)))return fail('整个设施必须位于可建设的陆地上');
 const occupied=opts.occupied||[...list(city.civic?.services),...list(city.civic?.lots),...list(city.education?.sites),...list(city.justice?.sites),...list(city.parking?.lots),...list(city.transit?.stations)];
 const overlap=(f,w,h)=>valid(f)&&Math.abs(f.x-p.x)<(w+spec.width)/2+2&&Math.abs(f.y-p.y)<(h+spec.depth)/2+2;
 if(state.sites.some(f=>overlap(f,TYPES[f.type].width,TYPES[f.type].depth))||occupied.some(f=>f&&overlap(f,num(f.width,num(f.w,18)),num(f.depth,num(f.h,16)))))return fail('选址与已有地块或公共设施重叠');
 const access=roadAccess(net,water).access(p);
 if(access){
  const d=access.d,w=d?(Math.abs(access.hit.x-p.x)*spec.width+Math.abs(access.hit.y-p.y)*spec.depth)/(2*d):Infinity;
  if(d<w+N.crossSection(access.e).width/2+1)return fail('设施占地不能压住地面道路');
 }
 if(data.type==='community'){
  const join=A.snap(opts.activeTravel||city.activeTravel||A.create(),net,p,{mode:'walk',radius:44,ground:true});
  if(!join||!dryConnector(p,join,water))return fail('社区中心需要干燥且连续的步行入口');
 }else if(!access)return fail('消防、诊所和医院须靠近有地面接入口的普通道路');
 if(num(opts.cash,num(city.network?.cash,Infinity))<spec.cost)return {ok:false,reason:'市库不足',cost:spec.cost};
 const chosen={type:data.type,x:p.x,y:p.y,funding:funding(data.funding),stock:spec.stock||0};
 return {ok:true,cost:spec.cost,site:chosen,monthly:monthly(chosen),capacity:Math.floor(spec.capacity*chosen.funding/100)};
}
function add(state,draft){
 if(!draft?.ok||state.sites.length>=LIMIT.sites||state.next>99999999)return null;
 const s=site({...draft.site,id:'Care'+state.next});
 if(!s)return null;
 state.next++;state.sites.push(s);return s;
}
function remove(state,value){
 const i=state.sites.findIndex(s=>s.id===value);
 if(i<0||state.patients.some(v=>v.hospital===value))return false;
 state.sites.splice(i,1);state.assignments=state.assignments.filter(v=>v.site!==value);return true;
}
function setFunding(state,value,percent){
 const s=state.sites.find(x=>x.id===value);
 if(!s||!Number.isFinite(percent))return false;s.funding=funding(percent);return true;
}
function layout(state,city,opts){
 const net=networkOf(city,opts),water=waterOf(opts),roads=roadAccess(net,water);
 const legacy=list(city.civic?.services).filter(v=>v&&valid(v)&&['fire','clinic','hospital'].includes(v.type)&&id(v.id)).slice(0,LIMIT.legacy);
 const walk=state.sites.some(s=>s.type==='community')?A.build(opts.activeTravel||city.activeTravel||A.create(),net,{shareBike:false}):null;
 const bySource=new Map(),occupancy=new Map(),result=[];
 for(const r of state.patients)occupancy.set(r.hospital,(occupancy.get(r.hospital)||0)+1);
 function push(v,isLegacy=false){
  const rawId=id(v.id,isLegacy?65:72),k=isLegacy?'legacy:'+rawId:rawId;
  if(bySource.has(rawId))return;
  const def=TYPES[v.type],fund=isLegacy?budget(city.civic?.budgets?.[v.type]):funding(v.funding);
  const anchors=v.type==='community'?walkAnchors(walk,v,water):null;
  const drive=anchors?null:roads.access(v),connected=anchors?anchors.length>0:!!drive;
  const dispatch=stockKind(v.type)?(isLegacy?fund:dispatchFunding(v,city)):0;
  const cap=!connected?0:Math.floor(def.capacity*(stockKind(v.type)?dispatch:fund)/100);
  const f={...v,id:k,rawId,funding:fund,connected,legacy:isLegacy,dispatchFunding:dispatch,capacity:cap,used:occupancy.get(k)||0,
   monthly:isLegacy?0:monthly(v),drive,anchors,restocked:0,deployed:0,lastCapacity:0};
  bySource.set(rawId,f);result.push(f);
 }
 for(const s of state.sites)push(s);
 for(const s of legacy)push(s,true);
 return {result,bySource,roads,walk,water};
}
function outreach(state,city,frame,month){
 const centers=frame.result.filter(f=>f.type==='community'&&f.capacity>0);
 if(!centers.length)return [];
 const spec=TYPES.community,graph=frame.walk,water=frame.water,old=new Set(state.assignments.map(a=>a.lotId));
 const lots=[],seen=new Set(),anchored=new Map(),done=new Set(),out=[];
 for(const l of list(city.civic?.lots)){
  const k=id(l?.id);if(!k||seen.has(k)||l.type!=='residential'||!valid(l)||num(l.occupants)<1||num(l.level)<1)continue;
  seen.add(k);lots.push({...l,id:k});if(lots.length>=LIMIT.lots)break;
 }
 // Sort global candidates to give a household one appointment, favor an
 // unserved catchment and shorter walks, then allocate finite center capacity.
 const choices=[];
 for(const f of centers){
  const tree=distanceTree(graph,f.anchors,spec.range);
  for(const l of lots){
   if(N.dist(f,l)>spec.range)continue;
   if(!anchored.has(l.id))anchored.set(l.id,walkAnchors(graph,l,water));
   let distance=Infinity;
   for(const {l:edge,q,m} of anchored.get(l.id)){
    distance=Math.min(distance,m+metres(edge.a,q)+(tree.get(edge.ka)??Infinity),m+metres(edge.b,q)+(tree.get(edge.kb)??Infinity));
    for(const a of f.anchors)if(edge.key===a.l.key)distance=Math.min(distance,m+a.m+metres(q,a.q));
   }
   if(distance<=spec.range)choices.push({f,l,distance,seen:old.has(l.id)});
  }
 }
 choices.sort((a,b)=>Number(a.seen)-Number(b.seen)||a.distance-b.distance||a.f.id.localeCompare(b.f.id)||a.l.id.localeCompare(b.l.id));
 for(const {f,l,distance} of choices){
  if(f.used>=f.capacity||done.has(l.id))continue;
  const v=assignment({lotId:l.id,x:l.x,y:l.y,site:f.id,distance,month});
  if(v){out.push(v);f.used++;done.add(l.id);}
  if(out.length>=LIMIT.visits)break;
 }
 return out;
}
function riskMetrics(state,metrics,city){
 if(!state?.assignments?.length)return metrics;
 const source=metrics?.lots||metrics?.byLot||{},lots=Object.assign(Object.create(null),source);
 const actual=city?new Map(list(city.civic?.lots).filter(v=>valid(v)&&v.type==='residential'&&num(v.occupants)>=1&&num(v.level)>=1).map(v=>[id(v.id),v])):null;
 for(const q of state.assignments){
  const l=actual?.get(q.lotId);
  if(actual&&(!l||N.dist(l,q)>2))continue;
  const m=source[q.lotId]||{};
  const clinic=clamp(num(m.clinic,.30)),park=clamp(num(m.park,.30));
  lots[q.lotId]={...m,clinic:clinic+(1-clinic)*.24,park:park+(1-park)*.18};
 }
 return {...metrics,lots,...(metrics?.byLot?{byLot:lots}:{})};
}
function workOf(frame,upstream,month){
 const authoritative=!Array.isArray(upstream)&&Array.isArray(upstream?.last?.facilities)&&upstream.last.month===month;
 if(authoritative)return new Map(upstream.last.facilities.filter(v=>stockKind(v?.type)&&id(v.id)).map(v=>[id(v.id),int(v.used,0,0,10)]));
 const used=new Map(),unique=new Map();
 for(const r of frame){
  if(r?.month!==month||!iid(id(r.id))||!r.provider||!['responding','resolved'].includes(r.action))continue;
  if(r.type==='fire'||r.type==='illness'||r.type==='death'){
   const k=String(r.provider)+'|'+r.id,work=Math.floor(int(r.severity,1,1,4)*.5)+1;
   // Civic writes one outcome per event/frame; importing a duplicate cannot
   // debit supplies twice even if it has both responding and resolved rows.
   if(!unique.has(k)||unique.get(k).work<work)unique.set(k,{id:id(r.provider),work});
  }
 }
 for(const v of unique.values())used.set(v.id,(used.get(v.id)||0)+v.work);
 return used;
}
function hash(t){
 let h=2166136261;for(const c of String(t))h=Math.imul(h^c.charCodeAt(0),16777619);
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
 return (h>>>0)/4294967296;
}
function report(state,city,opts={}){
 const old=new Map((state.last?.sites||[]).map(s=>[s.id,s]));
 const sites=city?layout(state,city,opts).result.map(s=>{
  const p=old.get(s.id);
  return summary({...s,used:s.type==='hospital'?s.used:p?.used||0,deployed:p?.deployed||0,restocked:p?.restocked||0,lastCapacity:p?.lastCapacity||0});
 }):state.last?.sites||state.sites.map(summary).filter(Boolean);
 return {month:state.lastMonth,sites,referrals:state.referrals,patients:state.patients,assignments:state.assignments,log:state.log,totals:state.totals,
  last:state.last,maintenance:maintenance(state)};
}
function advance(state,city,opts={}){
 const month=int(city?.month,1,1);
 if(month<=state.lastMonth)return {...report(state),maintenance:0,noOp:true};
 const last={month,...zero(),maintenance:maintenance(state),waiting:0,occupied:0,covered:0};
 const append=(item,action,reason,site='',count=1)=>{
  const r=row({...item,month,action,reason,site,count});if(!r)return;
  state.log.push(r);last[action]+=r.count;
 };
 const upstream=opts.incidents||city.civicEvents||city.incidents;
 const logs=(Array.isArray(upstream)?upstream:list(upstream?.log)).slice(-240);
 const past=workOf(logs,upstream,month),released=new Set();
 const layoutBefore=layout(state,city,opts),siteMap=new Map(layoutBefore.result.map(s=>[s.id,s]));
 for(const a of state.patients)if(a.discharge<=month){
  const f=siteMap.get(a.hospital);
  append({...a,x:f?.x??a.x,y:f?.y??a.y},'discharged','discharged',a.hospital);released.add(a.id);
  if(f)f.used--;
 }
 if(released.size)state.patients=state.patients.filter(v=>!released.has(v.id));
 for(const s of state.sites){
  if(!stockKind(s.type))continue;
  const f=siteMap.get(s.id),spec=TYPES[s.type];
  f.lastCapacity=f.capacity;
  const used=Math.min(f.capacity,int(past.get(s.id),0,0,10),s.stock);
  const recharge=Math.min(spec.stock-(s.stock-used),Math.ceil(spec.restock*Math.min(s.funding,budget(city.civic?.budgets?.[s.type]))/100));
  if(used)append(s,'response','used',s.id,used);
  if(recharge)append(s,'restock','restocked',s.id,recharge);
  s.stock+=recharge-used;
  f.used=used;f.deployed=used;f.restocked=recharge;f.stock=s.stock;
  f.dispatchFunding=dispatchFunding(s,city);
  f.capacity=f.connected?Math.floor(spec.capacity*f.dispatchFunding/100):0;
 }
 for(const f of layoutBefore.result)if(f.legacy&&stockKind(f.type)){
  f.lastCapacity=f.capacity;
  f.used=Math.min(f.capacity,int(past.get(f.rawId),0,0,10));f.deployed=f.used;
 }
 const hospitals=layoutBefore.result.filter(s=>s.type==='hospital'&&s.capacity>0);
 const pending=state.referrals.slice().sort((a,b)=>b.severity-a.severity||a.opened-b.opened||+a.id.slice(1)-+b.id.slice(1));
 const done=new Set();
 for(const r of pending){
  if(month-r.opened>=LIMIT.maxWait){append(r,'expired','expired');done.add(r.id);continue;}
  if(!hospitals.length){r.reason='noHospital';continue;}
  const from=r.source?layoutBefore.roads.access(r.source):null;
  if(!from){r.reason='noOrigin';continue;}
  const options=hospitals.map(f=>({f,out:layoutBefore.roads.distance(f.drive,from),back:layoutBefore.roads.distance(from,f.drive)}))
   .filter(k=>k.out<=TYPES.hospital.range&&k.back<=TYPES.hospital.range).sort((a,b)=>a.out+a.back-b.out-b.back||a.f.id.localeCompare(b.f.id));
  if(!options.length){r.reason='hospitalRoad';continue;}
  const h=options.find(k=>k.f.used<k.f.capacity)?.f;
  if(!h||state.patients.length>=LIMIT.patients){r.reason='hospitalFull';continue;}
  h.used++;done.add(r.id);
  const stay=r.severity-1+Number(hash(state.seed+'|stay|'+r.id)>.65);
  state.patients.push({...r,reason:'admitted',hospital:h.id,admitted:month,discharge:month+stay});
  append({...r,x:h.x,y:h.y},'admitted','admitted',h.id);
 }
 state.referrals=state.referrals.filter(v=>!done.has(v.id));
 const known=new Set([...state.seen,...state.referrals.map(v=>v.id),...state.patients.map(v=>v.id)]);
 const activeLots=new Set([...state.referrals,...state.patients].map(v=>v.lotId));
 for(const v of logs){
  if(!v||v.type!=='illness'||v.action!=='resolved'||v.month!==month||num(v.deaths)>0||!Number.isFinite(v.severity)||v.severity<3||known.has(id(v.id)))continue;
  // Admission is a case token, never an extra resident or population change.
  const source=layoutBefore.bySource.get(id(v.provider));
  const r=referral({...v,opened:month,source:source?.type==='clinic'?source:null});
  if(!r)continue;
  known.add(r.id);state.seen.push(r.id);
  if(activeLots.has(r.lotId)){append(r,'skipped','duplicate',r.provider);continue;}
  if(state.referrals.length>=LIMIT.referrals){append(r,'skipped','queueFull',r.provider);continue;}
  activeLots.add(r.lotId);state.referrals.push(r);append(r,'referred','new',r.provider);
 }
 const assignments=outreach(state,city,layoutBefore,month);
 state.assignments=assignments;
 for(const f of layoutBefore.result)if(f.type==='community'&&f.used)append(f,'outreach','covered',f.id,f.used);
 last.waiting=state.referrals.length;last.occupied=state.patients.length;last.covered=assignments.length;
 last.sites=layoutBefore.result.map(summary).filter(Boolean);
 state.log=state.log.slice(-LIMIT.logs);state.seen=state.seen.slice(-LIMIT.seen);
 state.lastMonth=month;state.last=last;
 for(const k of Object.keys(state.totals))state.totals[k]+=last[k];
 return report(state);
}
return {TYPES,REASONS,LIMIT,create,normalize,plan,add,remove,setFunding,responders,riskMetrics,maintenance,report,advance,tick:advance};
});
