/* Working university districts over the existing Education university seat ledger. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network,typeof module==='object'?require('./active-travel.js'):root.ActiveTravel,typeof module==='object'?require('./economy.js'):root.Economy,typeof module==='object'?require('./districts.js'):root.Districts);
 if(typeof module==='object')module.exports=api;else root.CampusLife=api;
})(globalThis,function(N,A,E,D){
'use strict';
const DISCIPLINES={
 engineering:{name:'工程技术',products:['components','equipment','software','materials'],sectors:['electronics','utility_equipment','software_studio','metal_fabrication']},
 business:{name:'经济与管理',products:['finance','professional','groceries'],sectors:['finance_center','business_services','supermarket']},
 science:{name:'自然与应用科学',products:['research','processed_food','produce','fuel'],sectors:['research_lab','food_processing','seafood_kitchen','urban_farms','refinery']},
 humanities:{name:'人文与传播',products:['media','recreation','meals'],sectors:['media_studio','leisure_mix','dining']}
};
const ASSETS={
 engineering:{name:'工程学院',icon:'工',kind:'faculty',discipline:'engineering',width:34,depth:23,cost:18800,monthly:730,capacity:24,jobs:3,color:'#87b7d8'},
 business:{name:'商学院',icon:'商',kind:'faculty',discipline:'business',width:31,depth:22,cost:16800,monthly:650,capacity:22,jobs:3,color:'#dab684'},
 science:{name:'理学院',icon:'理',kind:'faculty',discipline:'science',width:34,depth:24,cost:19400,monthly:760,capacity:22,jobs:3,color:'#98c8a8'},
 humanities:{name:'人文学院',icon:'文',kind:'faculty',discipline:'humanities',width:30,depth:22,cost:15100,monthly:580,capacity:20,jobs:2,color:'#b5a1d6'},
 dormitory:{name:'学生宿舍',icon:'宿',kind:'housing',width:32,depth:22,cost:13400,monthly:440,capacity:28,jobs:1,color:'#e5ad93'},
 lab:{name:'校园实验室',icon:'研',kind:'research',width:30,depth:22,cost:21800,monthly:910,capacity:20,jobs:3,color:'#9abbeb'},
 library:{name:'大学图书馆',icon:'阅',kind:'support',width:29,depth:21,cost:14300,monthly:490,capacity:15,jobs:1,color:'#beafdb'},
 studentCenter:{name:'学生服务中心',icon:'服',kind:'support',width:25,depth:19,cost:11100,monthly:380,capacity:13,jobs:1,color:'#87c5bb'}
};
const REASONS={hub:'此区没有绑定的可用大学主楼',route:'与大学主楼无可用步行线路',funding:'校园预算不足',staff:'缺少可往返且未被使用的合格人员',
 students:'本月没有真实在读学员',active:'实体设施在运行'};
const LIMIT={campuses:65,assets:270,perCampus:40,cohorts:6000,homes:4000,people:500,history:36,range:375};
const KEYS=Object.keys(DISCIPLINES),programs=['general',...KEYS],grades=['university','vocational'];
const num=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),rnd=(v,d=3)=>Math.round(v*10**d)/10**d;
const int=(v,d=0,a=0,b=1e9)=>Math.floor(clamp(num(v,d),a,b)),own=(o,k)=>Object.hasOwn(o,k),arr=v=>Array.isArray(v)?v:[];
const id=(v,n=72)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,n):'';
const valid=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=2000&&v.y<=1400;
const did=v=>/^D[1-9][0-9]{0,8}$/.test(id(v)),eid=v=>/^Edu[1-9][0-9]{0,7}$/.test(id(v)),aid=v=>/^Campus[1-9][0-9]{0,8}$/.test(id(v));
const base=ks=>Object.fromEntries(ks.map(k=>[k,0])),read=(ks,v,max=1e9)=>Object.fromEntries(ks.map(k=>[k,int(v?.[k],0,0,max)]));
const cal=v=>Math.max(1,int(v,1));const fund=v=>int(v,100,0,125);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const bbox=p=>({left:Math.min(...p.map(v=>v.x)),right:Math.max(...p.map(v=>v.x)),top:Math.min(...p.map(v=>v.y)),bottom:Math.max(...p.map(v=>v.y))});
const fail=(reason,more={})=>({ok:false,reason,...more});
const zones=c=>arr(c?.districts?.districts).filter(v=>v&&v.type==='university'&&did(v.id)&&Array.isArray(v.points)&&v.points.length>=3&&v.points.length<=48&&v.points.every(valid));
const schools=c=>arr(c?.education?.sites).filter(s=>s&&s.type==='university'&&eid(s.id)&&valid(s));
const wetOf=o=>typeof o.water==='function'?o.water:N.water;
const landOf=o=>typeof o.land==='function'?o.land:typeof o.isBuildable==='function'?o.isBuildable:v=>valid(v);
const noStaff=()=>({vocational:0,university:0}),nStaff=v=>int(v?.vocational)+int(v?.university);
const keys=['enrolled','graduates','specializedGraduates','beds','bedsUsed','bonus','rangeBonus','staff','jobs','income','expense','research'];
function create(seed='city-campus'){
 return {version:1,seed:String(seed).slice(0,96),next:1,lastMonth:0,points:0,campuses:[],students:[],alumni:{},last:null,history:[]};
}
function asset(v){
 if(!valid(v)||!did(v.districtId)||!own(ASSETS,v.type)||!aid(v.id))return null;
 return {id:id(v.id),districtId:id(v.districtId),type:v.type,x:v.x,y:v.y};
}
function stats(v){
 const a=asset(v);if(!a)return null;
 return {...a,connected:!!v.connected,active:!!v.active,staff:read(grades,v.staff,8),jobs:int(v.jobs),capacity:int(v.capacity),
  enrolled:int(v.enrolled),bedsUsed:int(v.bedsUsed),research:int(v.research),monthly:int(v.monthly),distance:rnd(clamp(num(v.distance),0,800)),
  reason:own(REASONS,v.reason)?v.reason:'route'};
}
function cohort(v){
 if(!v||!eid(v.siteId)||!id(v.lotId)||!programs.includes(v.program)||!int(v.count,0,0,LIMIT.people))return null;
 return {siteId:id(v.siteId),lotId:id(v.lotId),program:v.program,count:int(v.count,0,0,LIMIT.people),terms:int(v.terms,0,0,15)};
}
function campusRow(v){
 if(!v||!did(v.id)||!eid(v.siteId)||!valid(v.focus)||!Array.isArray(v.points)||v.points.length<3||v.points.length>48||!v.points.every(valid))return null;
 const points=v.points.map(q=>({x:q.x,y:q.y})),t=read(keys,v);
 return {id:id(v.id),type:'university',siteId:id(v.siteId),focus:{x:v.focus.x,y:v.focus.y},points,box:bbox(points),budget:fund(v.budget),...t,net:t.income-t.expense,
  active:!!v.active,reason:own(REASONS,v.reason)?v.reason:'hub',
  byProgram:read(programs,v.byProgram),byDegree:read(KEYS,v.byDegree),researchByDiscipline:read(KEYS,v.researchByDiscipline),
  assets:arr(v.assets).slice(0,LIMIT.perCampus).map(stats).filter(Boolean)};
}
function sums(v){
 const t=read(keys,v);return {campuses:int(v?.campuses),...t,net:t.income-t.expense};
}
function history(v){
 if(!v||!Number.isFinite(v.month))return null;
 return {month:cal(v.month),enrolled:int(v.enrolled),graduates:int(v.graduates),specializedGraduates:int(v.specializedGraduates),research:int(v.research),net:int(v.net,0,-1e9)};
}
function restoreLast(v,month){
 if(!v||typeof v!=='object')return null;
 const districts=Object.fromEntries(Object.values(v.districts||{}).slice(0,LIMIT.campuses).map(campusRow).filter(Boolean).map(v=>[v.id,v]));
 return {month,districts,totals:sums(v.totals),degrees:read(KEYS,v.degrees),industryDemand:read(KEYS,v.industryDemand),
  activity:Object.fromEntries(Object.entries(v.activity||{}).slice(0,LIMIT.homes).filter(([k])=>id(k)).map(([k,x])=>[id(k),rnd(clamp(num(x,1),1,1.12))])),
  byWork:Object.fromEntries(Object.entries(v.byWork||{}).slice(0,LIMIT.homes).filter(([k])=>id(k)).map(([k,x])=>[id(k),read(KEYS,x)])),
  benefitsByLot:Object.fromEntries(Object.entries(v.benefitsByLot||{}).slice(0,LIMIT.homes).filter(([k])=>id(k)).map(([k,x])=>[id(k),rnd(clamp(num(x)))])),
  staffedByHome:Object.fromEntries(Object.entries(v.staffedByHome||{}).slice(0,LIMIT.homes).filter(([k])=>id(k)).map(([k,x])=>[id(k),read(grades,x)]))};
}
function normalize(raw,seed='city-campus'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(raw?.version!==1)return s;
 s.lastMonth=int(raw.lastMonth);s.points=int(raw.points);s.next=int(raw.next,1,1,999999999);
 const ids=new Set(),sites=new Set(),objects=new Set();let assets=0;
 for(const v of arr(raw.campuses).slice(0,LIMIT.campuses)){
  if(!v||!did(v.districtId)||!eid(v.siteId)||ids.has(v.districtId)||sites.has(v.siteId))continue;
  ids.add(v.districtId);sites.add(v.siteId);
  const c={id:v.districtId,districtId:v.districtId,siteId:v.siteId,budget:fund(v.budget),assets:[]};
  for(const x of arr(v.assets).slice(0,LIMIT.perCampus)){
   const a=asset({...x,districtId:c.id});if(!a||objects.has(a.id)||assets>=LIMIT.assets)continue;
   c.assets.push(a);objects.add(a.id);assets++;s.next=Math.max(s.next,+a.id.slice(6)+1);
  }
  s.campuses.push(c);
 }
 const grouped=new Map();
 for(const v of arr(raw.students).slice(0,LIMIT.cohorts)){
  const a=cohort(v);if(!a||!sites.has(a.siteId))continue;
  const key=a.siteId+'|'+a.lotId,used=grouped.get(key)||0;
  a.count=Math.min(a.count,LIMIT.people-used);if(!a.count)continue;
  grouped.set(key,used+a.count);s.students.push(a);
 }
 s.alumni=Object.fromEntries(Object.entries(raw.alumni||{}).slice(0,LIMIT.homes).filter(([k])=>id(k)).map(([k,v])=>[id(k),read(KEYS,v,LIMIT.people)]));
 s.last=s.lastMonth?restoreLast(raw.last,s.lastMonth):null;
 s.history=arr(raw.history).slice(-LIMIT.history).map(history).filter(Boolean);
 return s;
}
const campusOf=(s,v)=>s.campuses.find(c=>c.districtId===id(v));
function adopt(s,city,districtId,siteId){
 const z=zones(city).find(v=>v.id===id(districtId)),available=schools(city).filter(v=>z&&D.inPolygon(v,z.points)&&!s.campuses.some(c=>c.siteId===v.id));
 const hub=siteId?available.find(v=>v.id===id(siteId)):available[0];
 if(!z||!hub||s.campuses.length>=LIMIT.campuses||campusOf(s,z.id))return null;
 const c={id:z.id,districtId:z.id,siteId:hub.id,budget:100,assets:[]};s.campuses.push(c);return c;
}
function release(s,v){
 const c=campusOf(s,v);if(!c||c.assets.length)return false;
 s.campuses=s.campuses.filter(x=>x!==c);s.students=s.students.filter(v=>v.siteId!==c.siteId);return true;
}
function remove(s,v){
 for(const c of s.campuses){const i=c.assets.findIndex(x=>x.id===id(v));if(i>=0){c.assets.splice(i,1);return true;}}
 return false;
}
function setBudget(s,v,value){
 const c=campusOf(s,v);if(!c||!Number.isFinite(value))return false;c.budget=fund(value);return true;
}
function plan(s,city,data={},opts={}){
 const c=campusOf(s,data.districtId),z=zones(city).find(v=>v.id===id(data.districtId)),kind=data.type;
 if(!c||!z)return fail('先把一个大学区与实际大学主楼绑定');
 if(!own(ASSETS,kind)||!valid(data))return fail('请选择有效的校园设施和位置');
 if(c.assets.length>=LIMIT.perCampus||s.campuses.reduce((n,v)=>n+v.assets.length,0)>=LIMIT.assets)return fail('校园设施数量已达上限');
 const def=ASSETS[kind],a={x:data.x,y:data.y},water=wetOf(opts),land=landOf(opts);
 const allowed=q=>D.inPolygon(q,z.points)&&!water(q)&&land(q)!==false;
 const hw=def.width/2,hd=def.depth/2;
 for(let i=0;i<=Math.ceil(def.width/4);i++)for(let j=0;j<=Math.ceil(def.depth/4);j++){
  const q={x:a.x-hw+def.width*i/Math.ceil(def.width/4),y:a.y-hd+def.depth*j/Math.ceil(def.depth/4)};
  if(!allowed(q))return fail('设施须完整落在校区内可建陆地上');
 }
 const overlap=(q,w,d)=>valid(q)&&Math.abs(a.x-q.x)<(w+def.width)/2+2&&Math.abs(a.y-q.y)<(d+def.depth)/2+2;
 const all=s.campuses.flatMap(v=>v.assets);
 if(all.some(x=>overlap(x,ASSETS[x.type].width,ASSETS[x.type].depth)))return fail('设施占地与现有校园建筑重叠');
 const outside=opts.occupied||[...arr(city.civic?.lots),...arr(city.civic?.services),...arr(city.parks?.parks).flatMap(p=>p.assets),...arr(city.transit?.stations)];
 if(schools(city).some(x=>overlap(x,36,26))||outside.some(q=>overlap(q,num(q?.width,15),num(q?.depth,14))))return fail('施工占地与大学主楼或附近建筑重叠');
 const net=opts.network||city.network||{edges:[],nodes:[]};
 const road=N.snap({nodes:[],edges:arr(net.edges).filter(e=>e?.kind==='road')},{...a,z:0},31,true);
 if(road){
  const edge=net.edges.find(e=>e.id===road.edge),d=N.dist(a,road);
  const width=d?(Math.abs(a.x-road.x)*def.width+Math.abs(a.y-road.y)*def.depth)/(2*d):Infinity;
  if(d<width+N.crossSection(edge).width/2+1)return fail('校园设施不能压住道路');
 }
 const cash=num(opts.cash,num(city.network?.cash,Infinity));
 if(cash<def.cost)return fail('市库不足',{cost:def.cost});
 const a2={districtId:c.id,type:kind,x:a.x,y:a.y};
 return {ok:true,districtId:c.id,type:kind,cost:def.cost,asset:a2,item:a2};
}
function add(s,v){
 if(!v?.ok||s.next>=1000000000)return null;
 const c=campusOf(s,v.districtId);
 if(!c||c.assets.length>=LIMIT.perCampus||s.campuses.reduce((n,c)=>n+c.assets.length,0)>=LIMIT.assets)return null;
 const a=asset({...v.asset,districtId:c.id,id:'Campus'+s.next});if(!a)return null;
 s.next++;c.assets.push(a);return a;
}
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
function learning(s,city,opts={}){
 const net=opts.network||city.network||{nodes:[],edges:[]},active=opts.activeTravel||city.activeTravel||A.create(),water=wetOf(opts),land=landOf(opts);
 const graph=opts.graph?.adj instanceof Map&&opts.graph?.bins instanceof Map?opts.graph:A.build(active,net,{shareBike:false});
 const zonesNow=new Map(zones(city).map(z=>[z.id,z])),hubs=new Map(schools(city).map(x=>[x.id,x]));
 const older=new Map(Object.values(s.last?.districts||{}).flatMap(v=>v.assets).map(v=>[v.id,v]));
 const layouts=[],memo=new Map();
 function station(hub,max){
  const k=hub.id+'|'+max;
  if(!memo.has(k)){const a=walkAnchors(graph,hub,water);memo.set(k,{a,t:distanceTree(graph,a,max)});}
  return memo.get(k);
 }
 function walk(hub,point,range){
  if(!hub||N.dist(hub,point)>range)return Infinity;
  const {a,t}=station(hub,range),other=walkAnchors(graph,point,water);let best=Infinity;
  for(const {l,q,m} of other){
   best=Math.min(best,m+metres(l.a,q)+(t.get(l.ka)??Infinity),m+metres(l.b,q)+(t.get(l.kb)??Infinity));
   for(const c of a)if(c.l.key===l.key)best=Math.min(best,m+c.m+metres(q,c.q));
  }
  return best<=range?best:Infinity;
 }
 for(const c of s.campuses){
  const z=zonesNow.get(c.id);if(!z)continue;
  const hub=hubs.get(c.siteId),polygon=z.points,box=bbox(polygon);
  const found=hub&&D.inPolygon(hub,polygon)&&hub.funding>0,connected=!!(found&&station(hub,680).a.length),open=connected&&c.budget>=20;
  const assets=c.assets.map(a=>{
   const d=ASSETS[a.type],legal=D.inPolygon(a,polygon)&&!water(a)&&land(a)!==false;
   let legs=Infinity;
   if(found&&legal){
    if(typeof opts.moduleAccess==='function'){
     const x=opts.moduleAccess(hub,a,c);legs=x===true?N.dist(hub,a):num(typeof x==='number'?x:x?.ok===false?undefined:x?.distance??x?.metres,Infinity);
    }else if(connected)legs=walk(hub,a,LIMIT.range);
   }
   const link=Number.isFinite(legs)&&legs>=0&&legs<=LIMIT.range;
   const prior=older.get(a.id),jobs=link&&open?Math.ceil(d.jobs*Math.min(1,c.budget/100)):0;
   const rawCap=link&&open?Math.floor(d.capacity*Math.min(1.15,c.budget/100)):0;
   const booked=link&&open&&prior?.active?nStaff(prior.staff):0;
   const ready=booked?Math.floor(rawCap*Math.min(1,booked/Math.max(1,jobs))):0;
   const reason=!found?'hub':!link?'route':!open?'funding':!ready?'staff':'active';
   return {...a,connected:link,active:!!ready,capacity:ready,jobs,enrolled:0,bedsUsed:0,research:0,staff:noStaff(),rawCap,
    monthly:Math.round(d.monthly*(.22+.78*c.budget/100)),distance:Number.isFinite(legs)?legs:0,reason};
  });
  const p=base(KEYS);
  for(const a of assets){const d=ASSETS[a.type];if(d.discipline)p[d.discipline]+=a.capacity;}
  const seats=Object.values(p).reduce((n,v)=>n+v,0),beds=assets.filter(a=>a.type==='dormitory').reduce((n,v)=>n+v.capacity,0);
  const support=assets.filter(a=>ASSETS[a.type].kind==='support').reduce((n,v)=>n+v.capacity,0);
  const bonus=Math.min(180,seats+(seats?Math.min(9,Math.floor(support/5)):0));
  const profile={siteId:c.siteId,districtId:c.id,bonus,rangeBonus:Math.min(135,Math.floor(beds*2.8)),programs:p,beds,support,connected};
  const expense=Math.round((140+num(z.area)*.016)*(.25+.75*c.budget/100))+assets.reduce((n,a)=>n+a.monthly,0);
  layouts.push({c,z,hub:found?hub:null,focus:found?{x:hub.x,y:hub.y}:{x:(box.left+box.right)/2,y:(box.top+box.bottom)/2},open,profile,assets,expense});
 }
 return {walk,layouts};
}
function prepare(s,city,opts={}){
 const frame=learning(s,city,opts),profiles=Object.fromEntries(frame.layouts.map(f=>[f.c.siteId,f.profile])),observed=new Map();
 function profile(input){return profiles[id(typeof input==='object'?input?.id:input)]||{bonus:0,rangeBonus:0,programs:base(KEYS),beds:0,support:0,connected:false};}
 function observe(x){
  const siteId=id(x?.siteId),lotId=id(x?.lotId),count=int(x?.count,0,0,LIMIT.people);
  if(!own(profiles,siteId)||!lotId||!count||observed.size>=LIMIT.cohorts&&!observed.has(siteId+'|'+lotId))return false;
  const k=siteId+'|'+lotId,r=observed.get(k)||{siteId,lotId,count:0,graduated:0,metres:0};
  const n=Math.min(count,LIMIT.people-r.count);if(!n)return false;
  r.count+=n;r.graduated+=int(x.graduated,0,0,n);r.metres+=clamp(num(x.distance),0,1000)*n;
  observed.set(k,r);return true;
 }
 return {month:cal(city.month),profiles,profile,observe,_frame:frame,_observed:observed};
}
function industryDemand(city,labor){
 const d=base(KEYS);
 for(const v of Object.values(labor?.byWork||{})){
  for(const k of KEYS)if(DISCIPLINES[k].sectors.includes(v?.sector))
   d[k]+=Math.max(0,int(v.slots?.professional)-int(v.filled?.professional))+Math.max(0,int(v.slots?.technical)-int(v.filled?.technical))+
    Math.ceil((int(v.filled?.professional)+int(v.filled?.technical))*.25);
 }
 // Keep a small industry signal even while the first employment ledger forms.
 for(const l of arr(city.civic?.lots).slice(0,4000)){
  if(!l||num(l.level)<1)continue;const e=E.sector(l);
  for(const k of KEYS)if(DISCIPLINES[k].sectors.includes(e?.id))d[k]++;
 }
 return d;
}
function staffing(city,opts,session){
 const labor=opts.labor||city.labor?.last,ind=opts.industry||city.industry?.last,social=opts.social||city.social?.last,m=session.month;
 const exact=labor?.month===m&&(!(city.industry?.modules?.length)||ind?.month===m)&&(!(city.social?.sites?.some(s=>s.type==='research'))||social?.month===m);
 const workers=[],used=new Map(),paid=new Map();
 if(!exact)return {};
 for(const a of arr(labor.assignments||city.labor?.assignments)){
  const k=id(a?.home);if(!k||!grades.includes(a.grade))continue;
  if(!paid.has(k))paid.set(k,noStaff());
  paid.get(k)[a.grade]+=int(a.count);
 }
 for(const v of arr(city.civic?.lots).slice(0,LIMIT.homes)){
  if(v?.type!=='residential'||num(v.level)<1||num(v.occupants)<1||!valid(v))continue;
  const k=id(v.id),h=labor.byHome?.[k];
  if(!h)continue;
  let industry=int(ind?.month===m?ind.byHome?.[k]:0),space=Math.max(0,int(h.unemployed)-industry);
  const r=social?.month===m?social.researchByHome?.[k]:null;
  space=Math.max(0,space-nStaff(r));
  const spare=noStaff();
  for(const g of grades){
   const all=Math.max(0,Math.min(int(h.eligible?.[g]),int(h.credentials?.[g]))-int(paid.get(k)?.[g])-int(r?.[g]));
   const hold=Math.min(industry,all);industry-=hold;spare[g]=Math.min(space,all-hold);space-=spare[g];
  }
  if(nStaff(spare))workers.push({...v,id:k,spare});
 }
 const priority={faculty:0,research:1,housing:2,support:3};
 const ready=session._frame.layouts.filter(f=>f.open&&f.assets.some(a=>a.jobs));
 const rank=ready.map(f=>({f,people:workers.map(v=>{
  const d=typeof opts.workerAccess==='function'?opts.workerAccess(v,f.hub,f.c):session._frame.walk(f.hub,v,680);
  return {v,d:d===true?N.dist(v,f.hub):num(typeof d==='number'?d:d?.ok===false?undefined:d?.distance??d?.metres,Infinity)};
 }).filter(x=>x.d>=0&&x.d<=680).sort((a,b)=>a.d-b.d||a.v.id.localeCompare(b.v.id))})).sort((a,b)=>a.people.length-b.people.length||a.f.c.id.localeCompare(b.f.c.id));
 for(const {f,people} of rank){
  const orders=f.assets.filter(a=>a.jobs).sort((a,b)=>priority[ASSETS[a.type].kind]-priority[ASSETS[b.type].kind]||
   nStaff(a.staff)-nStaff(b.staff)||a.id.localeCompare(b.id));
  for(const a of orders){
   const groups=ASSETS[a.type].kind==='research'?['university']:ASSETS[a.type].kind==='faculty'?['university','vocational']:['vocational','university'];
   for(const g of groups)for(const {v} of people){
    const n=Math.min(a.jobs-nStaff(a.staff),v.spare[g]);
    if(n<=0)continue;
    a.staff[g]+=n;v.spare[g]-=n;
    if(!used.has(v.id))used.set(v.id,noStaff());
    used.get(v.id)[g]+=n;
   }
   a.active=nStaff(a.staff)>0;a.reason=a.active?'active':'staff';
  }
 }
 return Object.fromEntries(used);
}
function homeCaps(education,which){
 return Object.fromEntries(Object.entries(education?.byLot||{}).slice(0,LIMIT.homes).map(([k,v])=>[k,int(which(v),0,0,LIMIT.people)]));
}
function compactCohorts(rows){
 const found=new Map();
 for(const a of rows){
  const b=cohort(a);if(!b)continue;
  const k=[b.siteId,b.lotId,b.program,b.terms].join('|'),prev=found.get(k);
  if(prev)prev.count=Math.min(LIMIT.people,prev.count+b.count);
  else found.set(k,b);
 }
 return [...found.values()].slice(0,LIMIT.cohorts);
}
function balanceAlumni(raw,education){
 const cap=homeCaps(education,v=>v?.credentials?.university),out={};
 for(const [k,v] of Object.entries(raw).slice(0,LIMIT.homes)){
  let remaining=cap[k]||0;if(!remaining)continue;
  // Proportional departure instead of treating a missing resident as an
  // automatic specialist or keeping more diplomas than actual credentials.
  const jobs=KEYS.map(d=>({d,n:int(v?.[d],0,0,LIMIT.people)})),all=jobs.reduce((n,a)=>n+a.n,0);
  const n=Math.min(remaining,all),slots=base(KEYS);
  if(n===0)continue;
  if(n===all){for(const x of jobs)slots[x.d]=x.n;}
  else {
   for(const a of jobs){const ideal=a.n*n/all;slots[a.d]=Math.floor(ideal);a.rem=ideal-slots[a.d];}
   remaining=n-Object.values(slots).reduce((q,x)=>q+x,0);
   for(const a of jobs.sort((a,b)=>b.rem-a.rem||a.d.localeCompare(b.d)))if(remaining>0){slots[a.d]++;remaining--;}
  }
  Object.defineProperty(out,k,{value:slots,enumerable:true,writable:true,configurable:true});
 }
 return out;
}
function economyEffects(alumni,labor,m){
 if(labor?.month!==m)return {activity:{},byWork:{}};
 const spare=Object.fromEntries(Object.entries(alumni).map(([k,v])=>[k,{...v}])),jobs=new Map();
 for(const a of arr(labor.assignments).slice(0,16000)){
  if(!a||a.grade!=='university'||!['general','technical','professional'].includes(a.role)||!id(a.work))continue;
  const h=spare[id(a.home)],work=labor.byWork?.[a.work],sector=work?.sector;
  if(!h||!sector)continue;
  let available=int(a.count,0,0,LIMIT.people);
  for(const k of KEYS)if(DISCIPLINES[k].sectors.includes(sector)&&available&&h[k]>0){
   const n=Math.min(h[k],available);
   if(!jobs.has(a.work))jobs.set(a.work,base(KEYS));
   jobs.get(a.work)[k]+=n;h[k]-=n;available-=n;
  }
 }
 const activity={},byWork={};
 for(const [k,v] of jobs){
  const employed=int(labor.byWork[k]?.employees),specialized=Math.min(employed,Object.values(v).reduce((n,x)=>n+x,0));
  if(!specialized)continue;
  Object.defineProperty(byWork,k,{value:v,enumerable:true});
  Object.defineProperty(activity,k,{value:rnd(1+.12*specialized/employed),enumerable:true});
 }
 return {activity,byWork};
}
function nowRows(s,city,opts){
 const frame=learning(s,city,opts),districts={};
 for(const f of frame.layouts){
  const old=s.last?.districts?.[f.c.id],p=f.profile,prior=new Map(arr(old?.assets).map(a=>[a.id,a]));
  const assets=f.assets.map(a=>{const b=prior.get(a.id);return b&&a.connected&&f.open?{...a,staff:b.staff,enrolled:b.enrolled,bedsUsed:b.bedsUsed,research:b.research}:a;});
  const next=campusRow({...old,id:f.c.id,siteId:f.c.siteId,budget:f.c.budget,points:f.z.points,focus:f.focus,expense:f.expense,
   assets,bonus:p.bonus,rangeBonus:p.rangeBonus,beds:p.beds,active:f.open,reason:!f.hub?'hub':!f.open?'funding':old?.reason||'staff'});
  districts[next.id]=next;
 }
 const t=base(keys);for(const row of Object.values(districts))for(const k of keys)t[k]+=row[k];
 return {month:s.lastMonth,districts,totals:sums({...t,campuses:Object.keys(districts).length}),
  degrees:s.last?.degrees||base(KEYS),industryDemand:s.last?.industryDemand||base(KEYS),activity:s.last?.activity||{},
  byWork:s.last?.byWork||{},benefitsByLot:s.last?.benefitsByLot||{},staffedByHome:s.last?.staffedByHome||{}};
}
function report(s,city,opts={}){
 const blank={month:s.lastMonth,districts:{},totals:sums(),degrees:base(KEYS),industryDemand:base(KEYS),
  activity:{},byWork:{},benefitsByLot:{},staffedByHome:{}};
 return {...(city?nowRows(s,city,opts):s.last||blank),points:s.points,campuses:s.campuses,history:s.history};
}
function advance(s,city,opts={},session){
 const month=cal(city?.month);
 if(month<=s.lastMonth)return {...report(s),noOp:true};
 const edu=opts.education||city.education?.last;
 if(edu?.month!==month||session?.month!==month||!(session._observed instanceof Map))
  return {...report(s),noOp:true,reason:'需要同月真实高校考勤记录'};
 const labor=opts.labor||city.labor?.last,staffedByHome=staffing(city,opts,session),demand=industryDemand(city,labor);
 const districts={},graduates=base(KEYS),received=[],homeLeft=homeCaps(edu,v=>v?.enrolled),
  prior=new Map(),benefits={};
 for(const v of s.students){
  const key=v.siteId+'|'+v.lotId;
  if(!prior.has(key))prior.set(key,[]);
  prior.get(key).push(v);
 }
 const histories=Object.fromEntries(Object.entries(s.alumni).map(([k,v])=>[k,{...v}]));
 let remainingGraduates=int(edu.graduates?.university);
 for(const f of session._frame.layouts){
  const site=edu.sites.find(v=>v.id===f.c.siteId&&v.type==='university'),schoolActive=!!(f.hub&&site?.connected),active=!!(f.open&&schoolActive),p=f.profile,profileCaps={...p.programs};
  const t={...base(keys),id:f.c.id,siteId:f.c.siteId,budget:f.c.budget,focus:f.focus,points:f.z.points,beds:p.beds,bonus:p.bonus,rangeBonus:p.rangeBonus,
   expense:f.expense,active,reason:!f.hub?'hub':!f.open?'funding':'students',byProgram:base(programs),byDegree:base(KEYS),researchByDiscipline:base(KEYS),assets:f.assets};
  for(const a of f.assets){t.staff+=nStaff(a.staff);t.jobs+=a.jobs;}
  let left=schoolActive?int(site.enrolled):0,beds=p.beds;
  // Coursework can only be allocated to actual Education seats; one observed
  // student packet is split into major cohorts and a single degree end.
  const registered=[...session._observed.values()].filter(x=>x.siteId===f.c.siteId)
   .sort((a,b)=>b.metres/Math.max(1,b.count)-a.metres/Math.max(1,a.count)||a.lotId.localeCompare(b.lotId));
  for(const v of registered){
   const n=Math.min(left,int(homeLeft[v.lotId]),v.count);
   if(!n)continue;
   left-=n;homeLeft[v.lotId]-=n;t.enrolled+=n;
   const g=Math.min(n,v.graduated,remainingGraduates);remainingGraduates-=g;t.graduates+=g;
   let vacancies=n;const existing=(prior.get(v.siteId+'|'+v.lotId)||[]).slice().sort((a,b)=>b.terms-a.terms||a.program.localeCompare(b.program)),bound=[];
   for(const a of existing){
    if(a.program==='general'||vacancies<=0)continue;
    const taken=Math.min(vacancies,profileCaps[a.program],a.count);
    if(taken){profileCaps[a.program]-=taken;bound.push({...a,count:taken,terms:a.terms+1});vacancies-=taken;}
   }
   // Programs with real jobs are favoured, while vacant seats permit
   // broad choice. No person is duplicated to raise a program count.
   for(const k of KEYS.slice().sort((a,b)=>demand[b]-demand[a]||a.localeCompare(b))){
    const n2=Math.min(vacancies,profileCaps[k]);if(!n2)continue;
    bound.push({siteId:v.siteId,lotId:v.lotId,program:k,count:n2,terms:1});profileCaps[k]-=n2;vacancies-=n2;
    if(!vacancies)break;
   }
   if(vacancies)bound.push({siteId:v.siteId,lotId:v.lotId,program:'general',count:vacancies,terms:1});
   let finished=g;
   const exact=bound.sort((a,b)=>b.terms-a.terms||a.program.localeCompare(b.program));
   for(const x of exact){
    t.byProgram[x.program]+=x.count;
    // Specialization occupies an actual program for at least two settled
    // terms and is attached to an existing Education graduation only.
    const out=Math.min(x.count,finished);finished-=out;
    if(out&&x.terms>=2&&own(DISCIPLINES,x.program)){
     t.byDegree[x.program]+=out;t.specializedGraduates+=out;graduates[x.program]+=out;
     if(!own(histories,x.lotId))Object.defineProperty(histories,x.lotId,{value:base(KEYS),enumerable:true,writable:true});
     histories[x.lotId][x.program]+=out;
    }
    if(x.count>out)received.push({...x,count:x.count-out});
   }
   let dorm=0;
   if(beds&&v.metres/v.count>=135){dorm=Math.min(beds,n);beds-=dorm;t.bedsUsed+=dorm;}
   const support=clamp((dorm+Math.min(n,p.support)*.32)/Math.max(1,n));
   if(support>0)Object.defineProperty(benefits,v.lotId,{value:rnd(Math.max(num(benefits[v.lotId]),support*.39)),enumerable:true,configurable:true});
  }
  let dormUsed=t.bedsUsed,labStudents=t.enrolled;const labDistribution={...t.byProgram},fac={...t.byProgram};
  for(const a of f.assets){
   const def=ASSETS[a.type];
   if(def.discipline){a.enrolled=Math.min(a.capacity,fac[def.discipline]);fac[def.discipline]-=a.enrolled;}
   else if(a.type==='dormitory'){a.bedsUsed=Math.min(a.capacity,dormUsed);dormUsed-=a.bedsUsed;}
   else if(a.type==='lab'&&active&&a.active&&a.staff.university&&labStudents){
    const participation=Math.min(labStudents,Math.floor(a.rawCap*Math.min(1,a.staff.university/Math.max(1,a.jobs))));
    if(participation){
     labStudents-=participation;a.enrolled=participation;
     a.research=Math.min(50,Math.floor(participation*.27)+Math.min(participation,a.staff.university)*2);t.research+=a.research;
     let taking=participation;
     for(const k of [...KEYS,'general']){
      const h=Math.min(taking,labDistribution[k]);if(!h)continue;
      if(k!=='general')t.researchByDiscipline[k]+=Math.floor(a.research*h/participation);
      labDistribution[k]-=h;taking-=h;if(!taking)break;
     }
    }
   }else if(def.kind==='support')a.enrolled=Math.min(a.capacity,t.enrolled);
  }
  t.income=active&&t.staff?t.enrolled*3:0; // supplementary campus fees, not Q funding again
  if(t.enrolled&&active)t.reason=t.staff?'active':'staff';
  else if(t.active&&!t.staff)t.reason='staff';
  const row=campusRow(t);districts[row.id]=row;
 }
 s.students=compactCohorts(received);s.alumni=balanceAlumni(histories,edu);
 const current=economyEffects(s.alumni,labor,month),sum=base(keys);
 for(const r of Object.values(districts))for(const k of keys)sum[k]+=r[k];
 const totals=sums({...sum,campuses:Object.keys(districts).length});
 s.points=Math.min(1e9,s.points+totals.research);s.lastMonth=month;
 s.last=restoreLast({month,districts,totals,degrees:graduates,industryDemand:demand,benefitsByLot:benefits,staffedByHome,...current},month);
 s.history.push(history({month,...totals}));s.history=s.history.slice(-LIMIT.history);
 return report(s);
}
function sample(r,lot){return clamp(num(r?.benefitsByLot?.[id(typeof lot==='object'?lot?.id:lot)]));}
function merge(base,campus){
 if(base&&!Object.keys(campus?.districts||{}).length)return base;
 const districts={...(base?.districts||{})},t={...(base?.total||base?.totals||{})};
 for(const [id,r] of Object.entries(campus?.districts||{})){
  const old=districts[id];
  if(old?.type==='university'){
   for(const k of ['jobs','staff','income','expense','net','education'])t[k]=num(t[k])-num(old[k]);
  }
  const newRow={...old,...r,reason:REASONS[r.reason]||r.reason,education:0,park:0,plannedCampus:true,airportCapacity:0,production:0};
  districts[id]=newRow;
  for(const k of ['jobs','staff','income','expense','net'])t[k]=num(t[k])+newRow[k];
 }
 return {...base,districts,total:t,totals:t,airportBoost:base?.airportBoost||{}};
}
return {ASSETS,DISCIPLINES,REASONS,LIMIT,create,normalize,adopt,release,plan,add,remove,setBudget,prepare,advance,tick:advance,report,sample,merge};
});
