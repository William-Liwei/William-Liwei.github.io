/* Bounded resident cohorts and seats for City Blueprint. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network,typeof module==='object'?require('./active-travel.js'):root.ActiveTravel);
 if(typeof module==='object')module.exports=api;else root.Education=api;
})(globalThis,function(N,A){
'use strict';
const TYPES={
 primary:{name:'小学',icon:'小',color:'#f2ce86',capacity:32,range:290,duration:6,cost:10500,monthly:540,width:22,depth:17},
 secondary:{name:'中学',icon:'中',color:'#8dd7eb',capacity:42,range:420,duration:6,cost:15600,monthly:850,width:28,depth:20},
 vocational:{name:'职业技术学校',icon:'职',color:'#b6e297',capacity:28,range:525,duration:4,cost:20400,monthly:1120,width:29,depth:23},
 university:{name:'大学',icon:'大',color:'#d6b7f1',capacity:56,range:680,duration:6,cost:36000,monthly:1720,width:36,depth:26}
};
const keys=Object.keys(TYPES),grades=['none',...keys],MAX_SITES=100,MAX_LOTS=4000,MAX_LOG=64,MAX_RES=500;
const WAIT_REASONS={capacity:'学位已满',unreachable:'没有可走通的通学路',noSchool:'尚无该阶段学校',closed:'学校未营业或没有经费'};
const has=(o,k)=>Object.hasOwn(o,k),num=(v,d=0)=>Number.isFinite(v)?v:d;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),int=(v,d=0,a=0,b=1e9)=>Math.round(clamp(num(v,d),a,b));
const dict=()=>Object.create(null),id=(v,n=72)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,n):'';
const pt=(a)=>a&&Number.isFinite(a.x)&&Number.isFinite(a.y)?{x:a.x,y:a.y,z:0}:null;
const siteId=s=>/^Edu[1-9][0-9]{0,7}$/.test(id(s))||/^legacy:[^\s]{1,65}$/.test(id(s));
const isGood=(p)=>p&&p.x>=0&&p.y>=0&&p.x<=1600&&p.y<=1300;
const counts=()=>Object.fromEntries(keys.map(k=>[k,0]));
const cred=()=>Object.fromEntries(grades.map(k=>[k,0]));
const reasons=()=>({capacity:0,unreachable:0,noSchool:0,closed:0});
const types=()=>Object.fromEntries(keys.map(k=>[k,{capacity:0,demand:0,enrolled:0,waiting:0,graduates:0,sites:0,waitingReasons:reasons()}]));
const students=()=>({demand:0,enrolled:0,waiting:0});
const funding=s=>int(s,100,0,100);
function hash(x){
 let h=2166136261;for(const c of String(x))h=Math.imul(h^c.charCodeAt(0),16777619);
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
 return (h>>>0)/4294967296;
}
function create(seed='city-school'){
 return {version:1,seed:String(seed).slice(0,90),next:1,lastMonth:0,sites:[],households:dict(),graduatesTotal:counts(),log:[],last:null};
}
function site(raw){
 const p=pt(raw);
 if(!isGood(p)||!has(TYPES,raw.type)||!/^Edu[1-9][0-9]{0,7}$/.test(id(raw.id)))return null;
 return {id:id(raw.id),type:raw.type,x:p.x,y:p.y,funding:funding(raw.funding)};
}
function group(raw){
 if(!raw||!['adult',...keys].includes(raw.stage)||!grades.includes(raw.grade))return null;
 const n=int(raw.n,0,0,MAX_RES);if(!n)return null;
 const stage=raw.stage,grade=stage==='adult'?raw.grade:stage==='primary'?'none':stage==='secondary'?'primary':'secondary';
 return {stage,grade,n,credit:stage==='adult'?0:int(raw.credit,0,0,TYPES[stage].duration-1),
   wait:stage==='adult'?0:int(raw.wait,0,0,200),school:stage==='adult'||!siteId(raw.school)?'':id(raw.school),
   ready:stage==='adult'?0:int(raw.ready,0)};
}
function row(raw){
 if(!raw||!has(TYPES,raw.type)||!['graduated','joined','left','opened','closed'].includes(raw.action))return null;
 return {month:int(raw.month),action:raw.action,type:raw.type,count:int(raw.count,0,0,MAX_LOTS*MAX_RES),
  lotId:id(raw.lotId),siteId:siteId(raw.siteId)?id(raw.siteId):''};
}
function clippedDict(raw,base,cap=MAX_LOTS*MAX_RES){
 return Object.fromEntries(Object.keys(base).map(k=>[k,int(raw?.[k],0,0,cap)]));
}
function hydrateLast(raw,month){
 if(!raw||typeof raw!=='object')return null;
 const byType=types(),byLot=dict();
 for(const k of keys){
  const x=raw.byType?.[k];
  byType[k]={...clippedDict(x,byType[k]),waitingReasons:clippedDict(x?.waitingReasons,reasons())};
 }
 for(const [lotId,v] of Object.entries(raw.byLot||{}).slice(0,MAX_LOTS)){
  const p=pt(v);
  if(!lotId||!isGood(p))continue;
  byLot[lotId.slice(0,72)]={lotId:lotId.slice(0,72),x:p.x,y:p.y,population:int(v.population,0,0,MAX_RES),
   students:clippedDict(v.students,students(),MAX_RES),enrolled:int(v.enrolled,0,0,MAX_RES),waiting:int(v.waiting,0,0,MAX_RES),
   education:clamp(num(v.education)),credentials:clippedDict(v.credentials,cred(),MAX_RES),waitingReasons:clippedDict(v.waitingReasons,reasons(),MAX_RES)};
 }
 const sites=(Array.isArray(raw.sites)?raw.sites:[]).slice(0,400).flatMap(v=>{
  const p=pt(v);if(!isGood(p)||!has(TYPES,v.type)||!siteId(v.id))return [];
  const capacity=int(v.capacity,0,0,1000);
  return [{id:id(v.id),type:v.type,x:p.x,y:p.y,capacity,funding:funding(v.funding),enrolled:int(v.enrolled,0,0,capacity),
   monthly:int(v.monthly),connected:Boolean(v.connected),legacy:Boolean(v.legacy)}];
 });
 return {month,population:int(raw.population),students:clippedDict(raw.students,students()),byType,sites,byLot,maintenance:int(raw.maintenance),
  graduates:clippedDict(raw.graduates,counts())};
}
function normalize(raw,seed='city-school'){
 const out=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(!raw||typeof raw!=='object')return out;
 const seen=new Set();
 for(const v of (Array.isArray(raw.sites)?raw.sites:[]).slice(0,MAX_SITES)){
  const s=site(v);if(!s||seen.has(s.id))continue;seen.add(s.id);out.sites.push(s);out.next=Math.max(out.next,+s.id.slice(3)+1);
 }
 out.next=Math.max(out.next,int(raw.next,1,1,9e7));out.lastMonth=int(raw.lastMonth);
 for(const [k,v] of Object.entries(raw.households||{}).slice(0,MAX_LOTS)){
  const key=k.slice(0,72);if(!key||!v||!Array.isArray(v.groups))continue;
  let count=0;
  const groups=v.groups.slice(0,MAX_RES).flatMap(v=>{
   const a=group(v);if(!a||count>=MAX_RES)return [];
   a.n=Math.min(a.n,MAX_RES-count);count+=a.n;return [a];
  });
  out.households[key]={serial:int(v.serial),groups};
 }
 out.graduatesTotal=clippedDict(raw.graduatesTotal,counts(),1e9);
 out.log=(Array.isArray(raw.log)?raw.log:[]).slice(-MAX_LOG).map(row).filter(Boolean);
 out.last=hydrateLast(raw.last,out.lastMonth);
 return out;
}
function monthly(site){
 return Math.round(TYPES[site.type].monthly*(.18+.82*funding(site.funding)/100));
}
function maintenance(state){
 return (state?.sites||[]).reduce((n,s)=>n+monthly(s),0);
}
function plan(state,city,data={},opts={}){
 const fail=reason=>({ok:false,reason});
 const p=pt(data),type=data.type,spec=TYPES[type];
 if(!has(TYPES,type)||!isGood(p))return fail('请选择学校类别和校址');
 if(state.sites.length>=MAX_SITES)return fail('学校数量已达上限');
 const water=typeof opts.water==='function'?opts.water:N.water;
 const land=opts.land||opts.isLand||opts.isBuildable||((q)=>q.x>=2&&q.x<=1198&&q.y>=2&&q.y<=798&&!water(q));
 const footprint=[
  p,{x:p.x-spec.width/2,y:p.y-spec.depth/2},{x:p.x+spec.width/2,y:p.y-spec.depth/2},
  {x:p.x-spec.width/2,y:p.y+spec.depth/2},{x:p.x+spec.width/2,y:p.y+spec.depth/2}
 ];
 if(footprint.some(q=>!land({...q,z:0})))return fail('整个校园占地必须在可用陆地上');
 const net=opts.network||city.network||{edges:[],nodes:[]},active=opts.activeTravel||city.activeTravel||A.create();
 const access=A.snap(active,net,p,{mode:'walk',radius:44,ground:true});
 if(!access)return fail('学校入口须靠近可步行的普通道路或人行道');
 const road=N.snap({nodes:[],edges:net.edges.filter(e=>e.kind==='road')},p,24,true);
 if(road){
  const e=net.edges.find(x=>x.id===road.edge);
  const d=N.dist(road,p);
  const w=d?(Math.abs(road.x-p.x)*spec.width+Math.abs(road.y-p.y)*spec.depth)/(2*d):Infinity;
  if(d<w+N.crossSection(e).width/2+1)return fail('校园占地不能压住地面道路');
 }
 const block=opts.occupied||[...(city.civic?.lots||[]),...(city.civic?.services||[]),...(city.transit?.stations||[]),...(city.parking?.lots||[])];
 const overlap=(q,w,h)=>Math.abs(q.x-p.x)<(spec.width+w)/2+2&&Math.abs(q.y-p.y)<(spec.depth+h)/2+2;
 if(state.sites.some(v=>overlap(v,TYPES[v.type].width,TYPES[v.type].depth))||
 block.some(v=>pt(v)&&overlap(v,num(v.width,num(v.w,11)),num(v.depth,num(v.h,11)))))return fail('占地与既有地块或设施重叠');
 const cash=num(opts.cash,num(city.network?.cash,Infinity));
 if(spec.cost>cash)return {ok:false,reason:'市库不足',cost:spec.cost};
 const chosen={id:'Edu'+state.next,type,x:p.x,y:p.y,funding:funding(data.funding)};
 return {ok:true,site:chosen,cost:spec.cost,monthly:monthly(chosen),capacity:Math.floor(spec.capacity*chosen.funding/100)};
}
function add(state,city,data,opts){
 const r=plan(state,city,data,opts);
 if(r.ok){state.sites.push(r.site);state.next++;}
 return r;
}
function remove(state,id){
 const i=state.sites.findIndex(s=>s.id===id);
 if(i<0)return false;state.sites.splice(i,1);return true;
}
function setFunding(state,id,percent){
 const s=state.sites.find(s=>s.id===id);if(!s||!Number.isFinite(percent))return false;
 s.funding=funding(percent);return true;
}

const weights={none:0,primary:.28,secondary:.57,vocational:.82,university:1};
const groupKey=g=>[g.stage,g.grade,g.credit,g.wait,g.school,g.ready].join('|');
function compact(list){
 const merged=new Map();
 for(const g of list)if(g.n>0){
  const k=groupKey(g);
  if(merged.has(k))merged.get(k).n+=g.n;else merged.set(k,{...g});
 }
 return [...merged.values()];
}
function balance(state,city){
 const list=[],present=new Set();
 for(const lot of city?.civic?.lots||[]){
  const p=pt(lot),k=id(lot.id),pop=Math.floor(clamp(num(lot.occupants),0,MAX_RES));
  if(lot.type!=='residential'||!k||!isGood(p)||pop<1||present.has(k))continue;
  present.add(k);
  let h=state.households[k];
  if(!h)state.households[k]=h={serial:0,groups:[]};
  const current=h.groups.reduce((sum,g)=>sum+g.n,0);
  if(current>pop){
   const m=h.groups.map((g,i)=>({g,i,n:Math.floor(g.n*pop/current),rem:(g.n*pop)%current}));
   let slack=pop-m.reduce((sum,v)=>sum+v.n,0);
   m.sort((a,b)=>b.rem-a.rem||a.i-b.i);
   for(const v of m)if(slack>0&&v.n<v.g.n){v.n++;slack--;}
   h.groups=m.filter(v=>v.n>0).sort((a,b)=>a.i-b.i).map(v=>({...v.g,n:v.n}));
  }
  if(current<pop){
   const gen=counts();let adults=0;
   for(let i=current;i<pop;i++){
    const r=hash(state.seed+'|'+(city.mapId||'')+'|'+k+'|arrival|'+h.serial++);
    // Age of new arrivals is estimated from fixed shares; every student is
    // apportioned OUT OF actual occupied housing, never added on top of it.
    r<.13?gen.primary++:r<.235?gen.secondary++:r<.275?gen.vocational++:r<.315?gen.university++:adults++;
   }
   for(const stage of keys)if(gen[stage])h.groups.push({stage,grade:stage==='primary'?'none':stage==='secondary'?'primary':'secondary',n:gen[stage],credit:0,wait:0,school:'',ready:0});
   if(adults)h.groups.push({stage:'adult',grade:'none',n:adults,credit:0,wait:0,school:'',ready:0});
  }
  h.groups=compact(h.groups);list.push({id:k,x:p.x,y:p.y,pop,h});
  if(list.length>=MAX_LOTS)break;
 }
 for(const k of Object.keys(state.households))if(!present.has(k))delete state.households[k];
 return list;
}
// Shared with ActiveTravel's ground-door semantics. A campus solves one bounded
// shortest-distance tree for the entire catchment, not one Dijkstra per lot.
const metres=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
function dryConnector(a,b,water){
 const steps=Math.max(1,Math.ceil(N.dist(a,b)/4));
 for(let i=0;i<=steps;i++)if(water(N.mix(a,b,i/steps)))return false;
 return true;
}
function walkAnchors(graph,query,water){
 const p={x:query.x,y:query.y,z:0},cell=graph.cell||36,seen=new Set(),points=[],radius=57;
 for(let x=Math.floor((p.x-radius)/cell);x<=Math.floor((p.x+radius)/cell);x++)
  for(let y=Math.floor((p.y-radius)/cell);y<=Math.floor((p.y+radius)/cell);y++)
   for(const l of graph.bins.get(x+':'+y)||[]){
    if(seen.has(l.key)||!l.modes.includes('walk'))continue;seen.add(l.key);
    const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,base=dx*dx+dy*dy;
    const t=base?clamp(((p.x-l.a.x)*dx+(p.y-l.a.y)*dy)/base):0;
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
function campuses(state,city,network,active,options){
 const schools=state.sites.map(s=>({...s,legacy:false,monthly:monthly(s)}));
 const civicFunding=funding(city.civic?.budgets?.school);
 for(const v of (city.civic?.services||[])){
  if(v.type!=='school'||!isGood(pt(v))||!id(v.id,60))continue;
  schools.push({id:'legacy:'+id(v.id,60),type:'primary',x:v.x,y:v.y,funding:civicFunding,legacy:true,monthly:0});
  if(schools.length>=400)break;
 }
 const graph=options.graph?.adj instanceof Map&&options.graph?.bins instanceof Map?options.graph:A.build(active,network,{shareBike:false});
 const water=typeof options.water==='function'?options.water:N.water;
 const campusPaths=new Map(),homePaths=new Map();
 const unique=new Set(),byType=Object.fromEntries(keys.map(k=>[k,[]]));
 const all=schools.flatMap(s=>{
  if(unique.has(s.id))return [];unique.add(s.id);
  const join=A.snap(active,network,s,{mode:'walk',radius:52,ground:true});
  const connected=Boolean(join&&dryConnector({...s,z:0},join,water));
  const prof=s.type==='university'?options.campus?.profile(s.id):null;
  const expansion=Math.max(0,Math.min(400,Number(prof?.bonus)||0)),range=TYPES[s.type].range+Math.max(0,Math.min(320,Number(prof?.rangeBonus)||0));
  const capacity=connected?Math.floor((TYPES[s.type].capacity+expansion)*s.funding/100):0;
  const row={...s,capacity,enrolled:0,connected};
  if(connected&&capacity){
   const anchors=walkAnchors(graph,s,water);
   campusPaths.set(s.id,{anchors,range,tree:distanceTree(graph,anchors,range)});
  }
  byType[s.type].push(row);return [row];
 });
 const cache=new Map();
 function choices(lot,type){
  const index=lot.id+'|'+type;if(cache.has(index))return cache.get(index);
  const sites=byType[type],open=sites.filter(s=>s.funding>0),spec=TYPES[type],options=[];
  for(const s of open){
   if(!s.connected||!s.capacity)continue;
   const target=campusPaths.get(s.id);if(!target||N.dist(lot,s)>target.range)continue;
   if(!homePaths.has(lot.id))homePaths.set(lot.id,walkAnchors(graph,lot,water));
   let best=Infinity;
   for(const {l,q,m} of homePaths.get(lot.id)){
    best=Math.min(best,m+metres(l.a,q)+(target.tree.get(l.ka)??Infinity),m+metres(l.b,q)+(target.tree.get(l.kb)??Infinity));
    for(const c of target.anchors)if(c.l.key===l.key)best=Math.min(best,m+c.m+metres(q,c.q));
   }
   if(best<=target.range)options.push({s,d:best});
  }
  options.sort((a,b)=>a.d-b.d||a.s.id.localeCompare(b.s.id));
  const reason=!sites.length?'noSchool':!open.length?'closed':!options.length?'unreachable':'capacity';
  const v={reason,options};cache.set(index,v);return v;
 }
 return {all,choices};
}
function append(state,month,action,type,count,lotId='',siteId=''){
 if(!count)return;
 const v=row({month,action,type,count,lotId,siteId});if(!v)return;
 state.log.push(v);if(state.log.length>MAX_LOG)state.log.splice(0,state.log.length-MAX_LOG);
}
function stageNext(g,n,l,city,state,month){
 const adult=()=>({stage:'adult',grade:g.stage,n,credit:0,wait:0,school:'',ready:0});
 const student=(stage,grade,count)=>({stage,grade,n:count,credit:0,wait:0,school:'',ready:month+1});
 if(g.stage==='primary')return [student('secondary','primary',n)];
 if(g.stage==='secondary'){
  let v=0,u=0;
  for(let i=0;i<n;i++){
   const r=hash(state.seed+'|'+(city.mapId||'')+'|'+l.id+'|after-middle|'+l.h.serial++);
   if(r<.42)v++;else if(r<.84)u++;
  }
  return [student('vocational','secondary',v),student('university','secondary',u),{...adult(),n:n-v-u}].filter(x=>x.n);
 }
 return [adult()];
}
function report(state){
 if(!state.last)return {month:state.lastMonth,population:0,students:students(),byType:types(),
  sites:state.sites.map(s=>({...s,capacity:Math.floor(TYPES[s.type].capacity*s.funding/100),enrolled:0,monthly:monthly(s),connected:false,legacy:false})),
  byLot:dict(),maintenance:maintenance(state),graduates:counts(),graduatesTotal:{...state.graduatesTotal},log:state.log};
 return {...state.last,maintenance:maintenance(state),graduatesTotal:{...state.graduatesTotal},log:state.log};
}
function advance(state,city,opts={}){
 const month=int(city?.month,1,1);
 if(month<=state.lastMonth)return {...report(state),noOp:true};
 const entries=balance(state,city),network=opts.network||city.network||{edges:[],nodes:[]},active=opts.activeTravel||city.activeTravel||A.create();
 const {all,choices}=campuses(state,city,network,active,opts),summaries=types(),byLot=dict(),monthStats=students(),graduates=counts(),jobs=[];
 const distinctByType=new Map();
 for(const s of all){const q=summaries[s.type];q.capacity+=s.capacity;q.sites++;}
 for(const l of entries){
  l.next=[];
  const row=byLot[l.id]={lotId:l.id,x:l.x,y:l.y,population:l.pop,students:students(),enrolled:0,waiting:0,education:0,credentials:cred(),waitingReasons:reasons()};
  for(const g of l.h.groups){
   if(g.stage==='adult'||g.ready>month){l.next.push(g);continue;}
   const info=choices(l,g.stage),target=info.options.find(x=>x.s.id===g.school);
   jobs.push({l,g,row,info,target});
  }
 }
 // Returning students keep their places when possible, then give queued
 // cohorts priority by waiting months; distance breaks ties deterministically.
 jobs.sort((a,b)=>Number(Boolean(b.target))-Number(Boolean(a.target))||b.g.wait-a.g.wait||
  (a.info.options[0]?.d??Infinity)-(b.info.options[0]?.d??Infinity)||a.l.id.localeCompare(b.l.id)||a.g.stage.localeCompare(b.g.stage));
 for(const {l,g,row,info,target} of jobs){
  const stage=g.stage,q=summaries[stage];let left=g.n;
  const d=distinctByType.get(stage)||new Map();distinctByType.set(stage,d);
  q.demand+=g.n;monthStats.demand+=g.n;row.students.demand+=g.n;
  const candidates=target?[target,...info.options.filter(s=>s!==target)]:info.options;
  for(const {s,d:distance} of candidates){
   if(!left)break;
   const n=Math.min(left,s.capacity-s.enrolled);if(n<=0)continue;
   left-=n;s.enrolled+=n;q.enrolled+=n;monthStats.enrolled+=n;row.enrolled+=n;row.students.enrolled+=n;
   if(stage==='university')opts.campus?.observe({siteId:s.id,lotId:l.id,count:n,graduated:g.credit+1>=TYPES[stage].duration?n:0,distance});
   if(g.school!==s.id&&g.wait>0)append(state,month,'joined',stage,n,l.id,s.id);
   if(g.credit+1>=TYPES[stage].duration){
    graduates[stage]+=n;q.graduates+=n;state.graduatesTotal[stage]+=n;
    // Keep the timeline compact: one row per affected lot, stage and campus.
    const eventKey=l.id+'|'+s.id;
    d.set(eventKey,{l:l.id,s:s.id,n:(d.get(eventKey)?.n||0)+n});
    l.next.push(...stageNext(g,n,l,city,state,month));
   }else l.next.push({...g,n,school:s.id,credit:g.credit+1,wait:0});
  }
  if(left){
   q.waiting+=left;monthStats.waiting+=left;row.waiting+=left;row.students.waiting+=left;
   const reason=info.options.length?'capacity':info.reason;
   q.waitingReasons[reason]+=left;row.waitingReasons[reason]+=left;
   l.next.push({...g,n:left,school:'',wait:Math.min(200,g.wait+1)});
  }
 }
 for(const [type,d] of distinctByType)for(const v of d.values())append(state,month,'graduated',type,v.n,v.l,v.s);
 let population=0;
 for(const l of entries){
  const o=byLot[l.id];population+=l.pop;
  l.h.groups=compact(l.next);
  for(const g of l.h.groups)o.credentials[g.grade]+=g.n;
  o.education=l.pop?grades.reduce((n,k)=>n+o.credentials[k]*weights[k],0)/l.pop:0;
 }
 state.lastMonth=month;
 state.last={month,population,students:monthStats,byType:summaries,sites:all,byLot,maintenance:maintenance(state),graduates};
 return report(state);
}
function preview(state,city,opts={}){
 const s=normalize(state,state.seed),month=Math.max(int(city?.month,1,1),s.lastMonth+1);
 return advance(s,{...city,month},opts);
}
return {TYPES,WAIT_REASONS,create,normalize,plan,add,remove,setFunding,maintenance,advance,tick:advance,report,preview};
});
