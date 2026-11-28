/* Fictional municipal support: memorial capacity, household care and research. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network,typeof module==='object'?require('./active-travel.js'):root.ActiveTravel);
 if(typeof module==='object')module.exports=api;else root.SocialCare=api;
})(globalThis,function(N,A){
'use strict';
const TYPES={
 cemetery:{name:'墓地',icon:'墓',color:'#a9c49e',cost:11800,monthly:185,capacity:42,monthlyCapacity:7,width:42,depth:32,range:720},
 crematorium:{name:'火葬场',icon:'纪',color:'#d6b6b2',cost:23100,monthly:690,capacity:6,monthlyCapacity:6,width:31,depth:23,range:925},
 research:{name:'科研院所',icon:'研',color:'#8fbcf2',cost:29800,monthly:1100,capacity:8,width:33,depth:25,range:760},
 family:{name:'婴幼儿与月子照护中心',icon:'幼',color:'#efbdca',cost:13800,monthly:530,capacity:12,width:25,depth:18,range:490},
 elder:{name:'养老院',icon:'养',color:'#d6c691',cost:18300,monthly:760,capacity:14,width:28,depth:20,range:580}
};
const POLICIES={
 balanced:{name:'按距离安排',description:'选择有能力且路程较短的场所'},
 burial:{name:'优先使用墓地',description:'优先有限墓位，满位后可用火葬场'},
 cremation:{name:'优先使用火葬场',description:'先排运营班次，无空班次时可用墓地'}
};
const REASONS={
 new:'本月登记',noRoad:'没有可用的地面接驳',noFacility:'没有运营中的对应设施',unreachable:'设施与住区之间无法通行',
 slots:'所有可达场所的名额已用完',plots:'可到达的墓地已无剩余墓位',buried:'已安排墓位',cremated:'已结清纪念服务',
 admitted:'获得照护名额',completed:'照护期结束，释放名额',left:'原住户不再属于该组',queue:'达到排队容量',
 noWorkers:'没有余量且符合学历要求的本地研发人员',researched:'完成本月研究'
};
const LIMIT={sites:104,memorials:400,waiting:600,stays:1800,seen:1000,log:116,lots:4000,people:360};
const careTypes=['family','elder'],memTypes=['cemetery','crematorium'];
const confirmedActions=new Set(['waiting','responding','resolved','expired','escalated']);
const actions=['registered','buried','cremated','requested','admitted','completed','left','overflow','research'];
const num=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),int=(v,d=0,a=0,b=1e9)=>Math.floor(clamp(num(v,d),a,b));
const id=(v,n=72)=>typeof v==='number'||typeof v==='string'?String(v).slice(0,n):'';
const own=(v,k)=>Object.hasOwn(v,k),arr=v=>Array.isArray(v)?v:[],valid=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=2000&&v.y>=0&&v.y<=1400;
const sid=v=>/^Soc[1-9][0-9]{0,7}$/.test(v),iid=v=>/^I[1-9][0-9]{0,9}$/.test(v);
const funding=x=>int(x,100,0,100),rule=x=>own(POLICIES,x)?x:'balanced';
const tally=()=>({registered:0,buried:0,cremated:0,requested:0,admitted:0,completed:0,left:0,overflow:0,research:0});
const logs=v=>Object.fromEntries(Object.keys(tally()).map(k=>[k,int(v?.[k])]));
function create(seed='city-social-care'){
 return {version:1,seed:String(seed).slice(0,96),next:1,lastMonth:0,policy:'balanced',sites:[],memorials:[],requests:[],stays:[],seen:[],points:0,log:[],totals:tally(),last:null};
}
function site(v){
 if(!valid(v)||!sid(id(v.id))||!own(TYPES,v.type))return null;
 return {id:id(v.id),type:v.type,x:v.x,y:v.y,funding:funding(v.funding),plots:v.type==='cemetery'?int(v.plots,0,0,TYPES.cemetery.capacity):0};
}
function memorial(v){
 if(!valid(v)||!iid(id(v.id))||!int(v.people,0,0,100))return null;
 return {id:id(v.id),lotId:id(v.lotId),x:v.x,y:v.y,opened:int(v.opened,1,1),people:int(v.people,0,0,100),reason:own(REASONS,v.reason)?v.reason:'new'};
}
const careKey=(lotId,type,index)=>JSON.stringify([lotId,type,index]);
function request(v){
 if(!valid(v)||!id(v.lotId)||!careTypes.includes(v.type))return null;
 const slot=int(v.slot,-1,-1,LIMIT.people-1);
 if(slot<0)return null;
 return {id:careKey(id(v.lotId),v.type,slot),lotId:id(v.lotId),type:v.type,slot,x:v.x,y:v.y,opened:int(v.opened,1,1),reason:own(REASONS,v.reason)?v.reason:'new'};
}
function stay(v){
 const r=request(v);if(!r||!sid(id(v.site)))return null;
 const entered=int(v.entered,r.opened,r.opened);
 return {...r,site:id(v.site),reason:'admitted',entered,release:int(v.release,entered+1,entered+1,entered+7)};
}
function row(v){
 if(!v||!actions.includes(v.action))return null;
 return {month:int(v.month,1,1),id:id(v.id,150),site:id(v.site),lotId:id(v.lotId),x:valid(v)?v.x:null,y:valid(v)?v.y:null,
  action:v.action,reason:own(REASONS,v.reason)?v.reason:'new',type:own(TYPES,v.type)?v.type:'',count:int(v.count,1,1,10000)};
}
function siteStats(v){
 const s=site(v);if(!s)return null;
 const cap=TYPES[s.type].capacity;
 return {...s,capacity:int(v.capacity,0,0,cap),used:int(v.used,0,0,cap),processed:int(v.processed,0,0,cap),monthlyCapacity:int(v.monthlyCapacity,0,0,32),
  connected:!!v.connected,monthly:int(v.monthly),reason:own(REASONS,v.reason)?v.reason:'new',
  points:int(v.points),staff:{vocational:int(v.staff?.vocational,0,0,cap),university:int(v.staff?.university,0,0,cap)}};
}
function hydrateLast(v,month){
 if(!v||typeof v!=='object')return null;
 return {month,...logs(v),memorialWaiting:int(v.memorialWaiting),familyWaiting:int(v.familyWaiting),elderWaiting:int(v.elderWaiting),
  occupiedSlots:int(v.occupiedSlots),maintenance:int(v.maintenance),sites:arr(v.sites).slice(0,LIMIT.sites).map(siteStats).filter(Boolean),
  benefitsByLot:Object.fromEntries(Object.entries(v.benefitsByLot||{}).slice(0,LIMIT.lots).filter(([k])=>id(k)).map(([k,z])=>[id(k),{
   family:int(z?.family,0,0,LIMIT.people),elder:int(z?.elder,0,0,LIMIT.people)
  }])),
  researchByHome:Object.fromEntries(Object.entries(v.researchByHome||{}).slice(0,LIMIT.lots).filter(([k])=>id(k)).map(([k,z])=>[id(k),{
   vocational:int(z?.vocational,0,0,LIMIT.people),university:int(z?.university,0,0,LIMIT.people)
  }]))};
}
function normalize(raw,seed='city-social-care'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(!raw||typeof raw!=='object')return s;
 s.lastMonth=int(raw.lastMonth);
 s.policy=rule(raw.policy);s.points=int(raw.points);s.totals=logs(raw.totals);
 const sites=new Map(),mem=new Set(),usedSlots=new Set(),beds=new Map();
 for(const v of arr(raw.sites).slice(0,LIMIT.sites)){
  const a=site(v);if(!a||sites.has(a.id))continue;
  sites.set(a.id,a);s.sites.push(a);s.next=Math.max(s.next,+a.id.slice(3)+1);
 }
 s.next=Math.max(s.next,int(raw.next,1,1,99999999));
 for(const v of arr(raw.memorials).slice(0,LIMIT.memorials)){
  const a=memorial(v);if(!a||mem.has(a.id))continue;mem.add(a.id);s.memorials.push(a);
 }
 s.seen=[...new Set(arr(raw.seen).slice(-LIMIT.seen).filter(v=>typeof v==='string'&&iid(v)))];
 const already=new Set(s.seen);
 for(const a of mem)if(!already.has(a))s.seen.push(a);
 s.seen=s.seen.slice(-LIMIT.seen);
 for(const v of arr(raw.stays).slice(0,LIMIT.stays)){
  const a=stay(v);
  if(!a||usedSlots.has(a.id)||sites.get(a.site)?.type!==a.type||(beds.get(a.site)||0)>=TYPES[a.type].capacity)continue;
  beds.set(a.site,(beds.get(a.site)||0)+1);usedSlots.add(a.id);s.stays.push(a);
 }
 for(const v of arr(raw.requests).slice(0,LIMIT.waiting)){
  const a=request(v);if(!a||usedSlots.has(a.id))continue;usedSlots.add(a.id);s.requests.push(a);
 }
 s.log=arr(raw.log).slice(-LIMIT.log).map(row).filter(Boolean);
 s.last=hydrateLast(raw.last,s.lastMonth);
 return s;
}
const netOf=(c,o)=>o.network||c.network||{nodes:[],edges:[]},waterOf=o=>typeof o.water==='function'?o.water:N.water;
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
function maintenance(s){return (s?.sites||[]).reduce((n,x)=>n+monthly(x),0);}
function plan(state,city,data={},opts={}){
 const fail=reason=>({ok:false,reason});
 if(!valid(data)||!own(TYPES,data.type))return fail('请选择设施类别与地图位置');
 if(state.sites.length>=LIMIT.sites)return fail('设施数量达到上限');
 const spec=TYPES[data.type],wet=waterOf(opts),net=netOf(city,opts),p={x:data.x,y:data.y,z:0};
 const land=opts.land||opts.isBuildable||((q)=>q.x>=2&&q.x<=1198&&q.y>=2&&q.y<=798&&!wet(q));
 const footprint=[p,...[-1,1].flatMap(x=>[-1,1].map(y=>({x:p.x+x*spec.width/2,y:p.y+y*spec.depth/2,z:0})))];
 if(footprint.some(q=>wet(q)||!land(q)))return fail('整个设施必须位于可建设的陆地上');
 const occupied=opts.occupied||[...arr(city.civic?.lots),...arr(city.civic?.services),...arr(city.education?.sites),...arr(city.care?.sites),...arr(city.justice?.sites),...arr(city.transit?.stations),...arr(city.industry?.modules)];
 const overlap=(q,w,h)=>valid(q)&&Math.abs(q.x-p.x)<(w+spec.width)/2+2&&Math.abs(q.y-p.y)<(h+spec.depth)/2+2;
 if(state.sites.some(s=>overlap(s,TYPES[s.type].width,TYPES[s.type].depth))||occupied.some(s=>s&&overlap(s,num(s.width,14),num(s.depth,14))))return fail('设施占地与既有建筑或地块重叠');
 const a=roadAccess(net,wet).access(p);
 if(a){
  const d=a.d,pad=d?(Math.abs(a.hit.x-p.x)*spec.width+Math.abs(a.hit.y-p.y)*spec.depth)/(2*d):Infinity;
  if(d<pad+N.crossSection(a.e).width/2+1)return fail('设施占地不能压住道路');
 }
 if(!a){
  const walk=!memTypes.includes(data.type)&&A.snap(opts.activeTravel||city.activeTravel||A.create(),net,p,{mode:'walk',radius:44,ground:true});
  if(!walk||!dryConnector(p,walk,wet))return fail(memTypes.includes(data.type)?'纪念设施须靠近可供车辆出入的普通道路':'服务设施需要道路或人行道入口');
 }
 if(num(opts.cash,num(city.network?.cash,Infinity))<spec.cost)return {ok:false,reason:'市库不足',cost:spec.cost};
 const chosen={type:data.type,x:p.x,y:p.y,funding:funding(data.funding),plots:0};
 return {ok:true,cost:spec.cost,site:chosen,monthly:monthly(chosen),capacity:spec.capacity};
}
function add(state,draft){
 if(!draft?.ok||state.sites.length>=LIMIT.sites||state.next>99999999)return null;
 const s=site({...draft.site,id:'Soc'+state.next});if(!s)return null;
 state.next++;state.sites.push(s);return s;
}
function remove(state,value){
 const i=state.sites.findIndex(s=>s.id===value);
 if(i<0||state.sites[i].plots>0||state.stays.some(x=>x.site===value))return false;
 state.sites.splice(i,1);return true;
}
function setFunding(state,value,percent){
 const s=state.sites.find(x=>x.id===value);
 if(!s||!Number.isFinite(percent))return false;s.funding=funding(percent);return true;
}
function setPolicy(state,value){
 if(!own(POLICIES,value))return false;state.policy=value;return true;
}
function hash(t){
 let h=2166136261;for(const c of String(t))h=Math.imul(h^c.charCodeAt(0),16777619);
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
 return (h>>>0)/4294967296;
}
function layout(state,city,opts){
 const net=netOf(city,opts),water=waterOf(opts),roads=roadAccess(net,water);
 const graph=state.sites.some(s=>!memTypes.includes(s.type))?A.build(opts.activeTravel||city.activeTravel||A.create(),net,{shareBike:false}):null;
 const homeAnchors=new Map(),trees=new Map(),located=state.sites.map(s=>{
  const spec=TYPES[s.type],drive=roads.access(s),anchors=!memTypes.includes(s.type)&&graph?walkAnchors(graph,s,water):[];
  const connected=!!drive||anchors.length>0,cap=connected?Math.floor(spec.capacity*s.funding/100):0;
  return {...s,source:s,drive,anchors,connected,capacity:s.type==='cemetery'?spec.capacity:cap,
   monthlyCapacity:connected&&memTypes.includes(s.type)?Math.floor(spec.monthlyCapacity*s.funding/100):0,
   used:s.type==='cemetery'?s.plots:0,monthly:monthly(s),processed:0,points:0,reason:connected?'new':'noRoad',staff:{vocational:0,university:0}};
 });
 function road(m,p,max){
  if(!m.drive||N.dist(m,p)>max)return Infinity;
  const q=roads.access(p);if(!q)return Infinity;
  const d=Math.max(roads.distance(m.drive,q),roads.distance(q,m.drive));
  return d<=max?d:Infinity;
 }
 function people(m,p){
  const limit=TYPES[m.type].range;
  if(N.dist(m,p)>limit)return Infinity;
  const walkway=Math.min(limit,390);
  if(m.anchors.length&&N.dist(m,p)<=walkway){
   const k=id(p.lotId??p.id)+'|'+p.x+'|'+p.y;
   if(!homeAnchors.has(k))homeAnchors.set(k,walkAnchors(graph,p,water));
   if(!trees.has(m.id))trees.set(m.id,distanceTree(graph,m.anchors,walkway));
   const tree=trees.get(m.id);let best=Infinity;
   for(const {l,q,m:offset} of homeAnchors.get(k)){
    best=Math.min(best,offset+metres(l.a,q)+(tree.get(l.ka)??Infinity),offset+metres(l.b,q)+(tree.get(l.kb)??Infinity));
    for(const x of m.anchors)if(x.l.key===l.key)best=Math.min(best,offset+x.m+metres(q,x.q));
   }
   if(best<=walkway)return best;
  }
  return road(m,p,limit);
 }
 return {located,road,people};
}
function households(city,opts,month){
 const labor=opts.labor||city.labor?.last,industry=opts.industry||city.industry?.last;
 const industryReady=!(city.industry?.modules?.length)||industry?.month===month;
 const workersByHome=new Map();
 if(labor?.month===month&&industryReady)for(const a of arr(labor.assignments||city.labor?.assignments)){
  if(!a||!['vocational','university'].includes(a.grade))continue;
  const k=id(a.home);
  if(!workersByHome.has(k))workersByHome.set(k,{vocational:0,university:0});
  workersByHome.get(k)[a.grade]+=int(a.count,0,0,LIMIT.people);
 }
 const houses=new Map();
 for(const l of arr(city.civic?.lots).slice(0,LIMIT.lots)){
  if(l?.type!=='residential'||!valid(l)||num(l.level)<1||!id(l.id)||houses.has(id(l.id)))continue;
  const pop=int(l.occupants,0,0,LIMIT.people);if(!pop)continue;
  const k=id(l.id),h=labor?.month===month?labor.byHome?.[k]:null;
  const education=city.education?.households?.[k]?.groups;
  const adults=h?int(h.adults,0,0,pop):Array.isArray(education)?
   Math.min(pop,education.filter(v=>v?.stage==='adult').reduce((n,v)=>n+int(v.n,0,0,pop),0)):Math.floor(pop*.68);
  const nonworking=h?Math.max(0,adults-int(h.workers,0,0,adults)):Math.floor(adults*.46);
  const paid=workersByHome.get(k)||{vocational:0,university:0};
  const spare={vocational:0,university:0};
  let pool=h&&industryReady?Math.max(0,int(h.unemployed,0,0,adults)-int(industry?.month===month?industry?.byHome?.[k]:0,0,0,adults)):0;
  // The previous industrial matcher does not break its assignments down by
  // diploma. Reserve its positions from the qualified pool conservatively
  // before marking any additional resident available to research.
  let reserved=industry?.month===month?int(industry.byHome?.[k],0,0,adults):0;
  for(const g of ['university','vocational']){
   const cap=Math.max(0,Math.min(int(h?.eligible?.[g]),int(h?.credentials?.[g],0,0,adults))-paid[g]);
   const used=Math.min(cap,reserved);reserved-=used;
   spare[g]=Math.min(pool,cap-used);pool-=spare[g];
  }
  houses.set(k,{id:k,x:l.x,y:l.y,pop,nonworking,spare});
 }
 return houses;
}
function cohort(state,house,slot){
 const r=hash(state.seed+'|support-cohort|'+house.id+'|'+slot);
 return r<.28?'elder':r<.52?'family':'';
}
function drawRequests(s,homes,month,append){
 const intake=new Set([...s.requests,...s.stays].map(v=>v.id));
 for(const h of homes.values())for(let slot=0;slot<h.nonworking;slot++){
  const type=cohort(s,h,slot);if(!type)continue;
  const period=type==='elder'?10:7,phase=Math.floor(hash(s.seed+'|support-calendar|'+h.id+'|'+type+'|'+slot)*period);
  if(month%period!==phase)continue;
  const r=request({type,slot,x:h.x,y:h.y,lotId:h.id,opened:month});
  if(!r||intake.has(r.id))continue;
  if(s.requests.length>=LIMIT.waiting){append(r,'overflow','queue');continue;}
  intake.add(r.id);s.requests.push(r);append(r,'requested','new');
 }
}
function memorialOrder(policy,v){
 return policy==='burial'?Number(v!=='cemetery'):policy==='cremation'?Number(v!=='crematorium'):0;
}
function report(s,city,opts={}){
 const prior=new Map((s.last?.sites||[]).map(x=>[x.id,x])),held=new Map();
 for(const x of s.stays)held.set(x.site,(held.get(x.site)||0)+1);
 const current=city?layout(s,city,opts).located:null;
 const sites=current?current.map(f=>{
  const prev=prior.get(f.id);
  return siteStats({...f,used:f.type==='cemetery'?f.plots:careTypes.includes(f.type)?held.get(f.id)||0:prev?.used||0,
   staff:prev?.staff,points:prev?.points,processed:prev?.processed,reason:!f.connected?'noRoad':prev?.reason||'new'});
 }):s.last?.sites||s.sites.map(siteStats).filter(Boolean);
 return {month:s.lastMonth,sites,memorials:s.memorials,requests:s.requests,stays:s.stays,points:s.points,policy:s.policy,maintenance:maintenance(s),
  totals:s.totals,last:s.last,log:s.log,benefitsByLot:s.last?.benefitsByLot||{},researchByHome:s.last?.researchByHome||{}};
}
function riskMetrics(s,metrics,city){
 const effect=s?.last?.benefitsByLot;
 if(!effect||!Object.keys(effect).length)return metrics;
 const source=metrics?.lots||metrics?.byLot||{},lots=Object.assign(Object.create(null),source);
 const real=city?new Map(arr(city.civic?.lots).filter(v=>v?.type==='residential'&&num(v.level)>0&&num(v.occupants)>0).map(v=>[id(v.id),v])):null;
 for(const [k,v] of Object.entries(effect)){
  if(real&&!real.has(k))continue;
  const m=source[k]||{},clinic=clamp(num(m.clinic,.30));
  const share=clamp(v.elder*.036+v.family*.016,0,.16);
  lots[k]={...m,clinic:clinic+(1-clinic)*share};
 }
 return {...metrics,lots,...(metrics?.byLot?{byLot:lots}:{})};
}
function advance(s,city,opts={}){
 const month=int(city?.month,1,1);
 if(month<=s.lastMonth)return {...report(s),maintenance:0,noOp:true};
 const f=layout(s,city,opts),all=f.located,byId=new Map(all.map(x=>[x.id,x])),homes=households(city,opts,month);
 const last={month,...tally(),memorialWaiting:0,familyWaiting:0,elderWaiting:0,occupiedSlots:0,maintenance:maintenance(s),benefitsByLot:{},researchByHome:{},sites:[]};
 const append=(v,action,reason,facility='',n=1,type)=>{
  const l=row({...v,month,site:facility,action,reason,count:n,type:type??v.type});
  if(l){s.log.push(l);last[action]+=l.count;}
 };
 // Civic owns population, including deaths that are logged before resolution.
 // Intake only the confirmed positive accounting row for this incident/month.
 const incidents=opts.incidents||city.civicEvents||city.incidents;
 const logs=Array.isArray(incidents)?incidents:arr(incidents?.log);
 const known=new Set([...s.seen,...s.memorials.map(x=>x.id)]);
 for(const record of logs.slice(-250)){
  const key=id(record?.id);
  if(!record||!iid(key)||record.month!==month||!confirmedActions.has(record.action)||!Number.isFinite(record.deaths)||record.deaths<=0||known.has(key))continue;
  const m=memorial({...record,id:key,people:record.deaths,opened:month});
  if(!m)continue;
  known.add(key);s.seen.push(key);append(m,'registered','new','',m.people);
  if(s.memorials.length>=LIMIT.memorials){append(m,'overflow','queue','',m.people);continue;}
  s.memorials.push(m);
 }
 const providers=all.filter(v=>memTypes.includes(v.type)&&v.monthlyCapacity>0);
 const settled=new Set();
 for(const m of s.memorials.slice().sort((a,b)=>a.opened-b.opened||Number(a.id.slice(1))-Number(b.id.slice(1)))){
  if(!providers.length){m.reason='noFacility';continue;}
  const eligible=providers.map(x=>({x,d:f.road(x,m,TYPES[x.type].range)})).filter(x=>Number.isFinite(x.d))
   .sort((a,b)=>memorialOrder(s.policy,a.x.type)-memorialOrder(s.policy,b.x.type)||a.d-b.d||a.x.id.localeCompare(b.x.id));
  if(!eligible.length){m.reason='unreachable';continue;}
  for(const {x} of eligible){
   const remaining=x.type==='cemetery'?x.capacity-x.plots:x.monthlyCapacity;
   const n=Math.min(m.people,remaining,x.monthlyCapacity-x.processed);if(n<=0)continue;
   if(x.type==='cemetery'){x.plots+=n;x.source.plots=x.plots;x.used=x.plots;}
   else x.used+=n;
   x.processed+=n;x.reason=x.type==='cemetery'?'buried':'cremated';
   append(m,x.type==='cemetery'?'buried':'cremated',x.reason,x.id,n,x.type);
   m.people-=n;if(!m.people){settled.add(m.id);break;}
  }
  if(m.people)m.reason=eligible.every(({x})=>x.type==='cemetery'&&x.plots>=x.capacity)?'plots':'slots';
 }
 s.memorials=s.memorials.filter(m=>!settled.has(m.id));
 // Services stand for support episodes from disjoint, currently resident
 // non-working adult slots. They neither add citizens nor create jobs.
 function eligible(r){
  const h=homes.get(r.lotId);
  return h&&h.nonworking>r.slot&&cohort(s,h,r.slot)===r.type;
 }
 s.stays=s.stays.filter(r=>{
  const x=byId.get(r.site);
  if(!x||!eligible(r)){append(r,'left','left',r.site);return false;}
  if(r.release<=month){append(r,'completed','completed',r.site);return false;}
  x.used++;return true;
 });
 s.requests=s.requests.filter(r=>{
  if(!eligible(r)){append(r,'left','left');return false;}
  return true;
 });
 drawRequests(s,homes,month,append);
 const done=new Set();
 for(const r of s.requests.slice().sort((a,b)=>a.opened-b.opened||a.lotId.localeCompare(b.lotId)||a.slot-b.slot)){
  const providers=all.filter(x=>x.type===r.type&&x.capacity>0);
  if(!providers.length){r.reason='noFacility';continue;}
  const available=providers.map(x=>({x,d:f.people(x,r)})).filter(x=>Number.isFinite(x.d)).sort((a,b)=>a.d-b.d||a.x.id.localeCompare(b.x.id));
  if(!available.length){r.reason='unreachable';continue;}
  const site=available.find(({x})=>x.used<x.capacity)?.x;
  if(!site||s.stays.length>=LIMIT.stays){r.reason='slots';continue;}
  const roll=hash(s.seed+'|support-length|'+r.id+'|'+month);
  const stayLength=r.type==='elder'?3+Math.floor(roll*3):1+Number(roll>.48);
  s.stays.push({...r,site:site.id,reason:'admitted',entered:month,release:month+stayLength});site.used++;site.processed++;site.reason='admitted';
  done.add(r.id);append(r,'admitted','admitted',site.id);
 }
 s.requests=s.requests.filter(r=>!done.has(r.id));
 const careBenefits=new Map();
 for(const v of s.stays){
  if(!careBenefits.has(v.lotId))careBenefits.set(v.lotId,{elder:0,family:0});
  careBenefits.get(v.lotId)[v.type]++;
 }
 last.benefitsByLot=Object.fromEntries(careBenefits);
 // Cohort qualification is explicit Labor education evidence and travelling
 // both ways is required. One spare worker can be assigned to only one lab.
 const qualifiedHomes=[...homes.values()].filter(h=>h.spare.vocational+h.spare.university);
 const research=all.filter(x=>x.type==='research'&&x.capacity>0)
  .map(x=>({x,eligible:qualifiedHomes.map(h=>({h,d:f.people(x,h)})).filter(r=>Number.isFinite(r.d))
   .sort((a,b)=>a.d-b.d||a.h.id.localeCompare(b.h.id))}))
  .sort((a,b)=>a.eligible.length-b.eligible.length||a.x.id.localeCompare(b.x.id));
 const staffed=new Map();
 for(const {x,eligible} of research){
  for(const g of ['university','vocational'])for(const {h} of eligible){
   const n=Math.min(x.capacity-x.used,h.spare[g]);if(n<=0)continue;
   h.spare[g]-=n;x.used+=n;x.staff[g]+=n;
   if(!staffed.has(h.id))staffed.set(h.id,{vocational:0,university:0});
   staffed.get(h.id)[g]+=n;
  }
  x.points=2*x.staff.vocational+4*x.staff.university;
  x.reason=x.used?'researched':'noWorkers';
  if(x.points){s.points+=x.points;append(x,'research','researched',x.id,x.points);}
 }
 last.researchByHome=Object.fromEntries(staffed);
 last.memorialWaiting=s.memorials.reduce((n,v)=>n+v.people,0);
 last.familyWaiting=s.requests.filter(v=>v.type==='family').length;
 last.elderWaiting=s.requests.length-last.familyWaiting;
 last.occupiedSlots=s.stays.length;
 last.sites=all.map(siteStats).filter(Boolean);
 s.lastMonth=month;s.last=last;s.seen=s.seen.slice(-LIMIT.seen);s.log=s.log.slice(-LIMIT.log);
 for(const k of Object.keys(last))if(own(s.totals,k))s.totals[k]+=last[k];
 return report(s);
}
function preview(s,city,opts={}){
 const copy=normalize(s,s.seed),month=Math.max(copy.lastMonth+1,int(city?.month,1));
 return advance(copy,{...city,month},opts);
}
return {TYPES,POLICIES,REASONS,LIMIT,create,normalize,plan,add,remove,setFunding,setPolicy,maintenance,report,riskMetrics,advance,tick:advance,preview};
});
