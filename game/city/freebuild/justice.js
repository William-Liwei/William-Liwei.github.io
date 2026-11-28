/* Fictional city justice logistics. Cases and outcomes are abstract game tokens. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network);
 if(typeof module==='object')module.exports=api;else root.Justice=api;
})(globalThis,function(N){
'use strict';
const TYPES={
 police:{name:'警察局',icon:'警',color:'#a3bdf6',cost:14800,monthly:780,capacity:5,width:22,depth:17},
 court:{name:'法院',icon:'审',color:'#e8c886',cost:22300,monthly:1250,capacity:4,width:30,depth:22},
 jail:{name:'监狱',icon:'狱',color:'#cfa6da',cost:28000,monthly:1120,capacity:8,width:32,depth:24},
 hall:{name:'市政厅',icon:'政',color:'#8bd6c0',cost:26500,monthly:925,capacity:1,width:32,depth:24}
};
const POLICIES={
 balanced:{name:'均衡运行',description:'使用常规调查、审理和在押容量',police:1,court:1,monthly:0},
 investigation:{name:'优先调查',description:'增加调查人手，减少法院可用班次并增加行政费',police:1.5,court:.75,monthly:170},
 casework:{name:'优先清理积案',description:'增加法院审理量，减少调查人手并增加行政费',police:.8,court:1.5,monthly:200},
 community:{name:'社区矫正',description:'只影响低严重度且有结论的案件，部分以社区处置代替入监；每案有支出',police:1,court:1,monthly:95}
};
const REASONS={
 new:'案件转入',working:'正在收集抽象证据',noPolice:'没有可用的警察局',policeRoad:'到事件现场的道路不通',policeQueue:'调查人手已用完',
 noCourt:'没有运营中的法院',courtRoad:'警察局到法院的道路不通',courtQueue:'审理名额已用完',noJail:'没有运营中的监狱',
 jailRoad:'法院到监狱的道路不通',jailFull:'可到达的监狱没有空位',sourceGone:'原经办设施停用或拆除，案件须重新分派',
 evidence:'证据不足，未移送',dismissed:'审理结案，未判监禁',community:'社区处置',admitted:'转送入监',released:'期限届满释放',
 capacity:'案件上限已满',review:'待法院审理',sentence:'待押送',expired:'超期未办，记录归档'
};
const LIMIT={sites:96,legacy:128,cases:180,log:100,seen:768,inmates:2400,age:36};
const ACTIONS=['received','investigated','dismissed','sentenced','community','admitted','released','dropped','expired','reassigned'];
const STAGES=['investigation','court','transfer'];
const own=(a,k)=>Object.hasOwn(a,k),clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),num=(x,d=0)=>Number.isFinite(x)?x:d;
const int=(x,d=0,a=0,b=1e9)=>Math.round(clamp(num(x,d),a,b));
const id=(x,l=70)=>typeof x==='string'||typeof x==='number'?String(x).slice(0,l):'';
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=2000&&p.y>=0&&p.y<=1400;
const iid=x=>/^I[1-9][0-9]{0,9}$/.test(x);
const jid=x=>/^J[1-9][0-9]{0,7}$/.test(x);
const funding=x=>int(x,100,0,100);
const emptyCounters=()=>({received:0,investigated:0,dismissed:0,sentenced:0,community:0,admitted:0,released:0,dropped:0,expired:0,reassigned:0});
function create(seed='city-justice'){
 return {version:1,seed:String(seed).slice(0,96),next:1,lastMonth:0,sites:[],policy:'balanced',cases:[],inmates:[],seen:[],log:[],totals:emptyCounters(),last:null};
}
function site(v){
 if(!valid(v)||!own(TYPES,v.type)||!jid(id(v.id)))return null;
 return {id:id(v.id),type:v.type,x:v.x,y:v.y,funding:funding(v.funding)};
}
function pending(v){
 if(!valid(v)||!iid(id(v.id))||!STAGES.includes(v.stage))return null;
 const severity=int(v.severity,1,1,4),opened=int(v.opened,1,1),required=severity+1;
 return {id:id(v.id),lotId:id(v.lotId),x:v.x,y:v.y,severity,opened,stage:v.stage,reason:own(REASONS,v.reason)?v.reason:'new',
  responder:id(v.responder),police:id(v.police),court:id(v.court),work:int(v.work,0,0,required),required,
  evidence:clamp(num(v.evidence),0,1),sentence:int(v.sentence,0,0,24),
  origin:valid(v.origin)?{x:v.origin.x,y:v.origin.y}:null};
}
function custody(v){
 if(!v||!iid(id(v.id))||!jid(id(v.jail)))return null;
 const admitted=int(v.admitted,1,1),release=int(v.release,admitted+1,admitted+1,admitted+24);
 return {id:id(v.id),jail:id(v.jail),admitted,release};
}
function row(v){
 if(!v||!iid(id(v.id))||!ACTIONS.includes(v.action))return null;
 return {month:int(v.month,1,1),id:id(v.id),action:v.action,reason:own(REASONS,v.reason)?v.reason:'new',
  site:id(v.site),x:valid(v)?v.x:null,y:valid(v)?v.y:null};
}
function siteSummary(v){
 if(!valid(v)||!own(TYPES,v.type)||!id(v.id))return null;
 const capacity=int(v.capacity,0,0,32);
 return {id:id(v.id),type:v.type,x:v.x,y:v.y,funding:v.legacy?int(v.funding,100,0,150):funding(v.funding),capacity,
  used:int(v.used,0,0,v.type==='jail'?LIMIT.inmates:capacity),connected:Boolean(v.connected),legacy:Boolean(v.legacy),monthly:int(v.monthly),governed:Boolean(v.governed)};
}
function counts(v){return Object.fromEntries(Object.keys(emptyCounters()).map(k=>[k,int(v?.[k])]));}
function policyName(v){return own(POLICIES,v)?v:'balanced';}
function normalize(raw,seed='city-justice'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(!raw||typeof raw!=='object')return s;
 const seenSites=new Set(),seenCases=new Set();
 const arr=(v)=>Array.isArray(v)?v:[];
 for(const v of arr(raw.sites).slice(0,LIMIT.sites)){
  const a=site(v);if(!a||seenSites.has(a.id))continue;
  seenSites.add(a.id);s.sites.push(a);s.next=Math.max(s.next,Number(a.id.slice(1))+1);
 }
 s.next=Math.max(s.next,int(raw.next,1,1,99999999));s.lastMonth=int(raw.lastMonth);
 s.policy=policyName(raw.policy);
 const present=new Set(s.sites.filter(x=>x.type==='jail').map(x=>x.id)),held=new Map();
 for(const v of arr(raw.inmates).slice(0,LIMIT.inmates)){
  const c=custody(v);if(!c||!present.has(c.jail)||seenCases.has(c.id)||(held.get(c.jail)||0)>=TYPES.jail.capacity)continue;
  held.set(c.jail,(held.get(c.jail)||0)+1);seenCases.add(c.id);s.inmates.push(c);
 }
 for(const v of arr(raw.cases).slice(0,LIMIT.cases)){
  const c=pending(v);if(!c||seenCases.has(c.id))continue;
  seenCases.add(c.id);s.cases.push(c);
 }
 s.seen=[...new Set(arr(raw.seen).slice(-LIMIT.seen).filter(v=>typeof v==='string'&&iid(v)))];
 const tracked=new Set(s.seen);
 for(const v of seenCases)if(!tracked.has(v))s.seen.push(v);
 s.seen=s.seen.slice(-LIMIT.seen);
 s.log=arr(raw.log).slice(-LIMIT.log).map(row).filter(Boolean);
 s.totals=counts(raw.totals);
 if(raw.last&&typeof raw.last==='object'){
  s.last={month:int(raw.last.month,s.lastMonth,0,s.lastMonth),...counts(raw.last),blocked:int(raw.last.blocked),maintenance:int(raw.last.maintenance),
   communityCost:int(raw.last.communityCost),policyCost:int(raw.last.policyCost),policy:{selected:policyName(raw.last.policy?.selected),active:Boolean(raw.last.policy?.active)},
   sites:arr(raw.last.sites).slice(0,LIMIT.sites+LIMIT.legacy).map(siteSummary).filter(Boolean)};
 }
 return s;
}
const networkOf=(city,opts)=>opts.network||city.network||{nodes:[],edges:[]};
function roadAccess(net,water){
 const vehicular=(net.edges||[]).filter(e=>['road','highway','ramp'].includes(e.kind)),edges=new Map(vehicular.map(e=>[e.id,e])),adj=N.graph({...net,edges:vehicular},'car'),bins=new Map(),memo=new Map(),cache=new Map(),cell=64,range=48;
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
 function distance(a,b){
  if(!a||!b)return Infinity;
  let best=a.e.id===b.e.id&&(!a.e.oneway||a.q<=b.q+1e-6)?Math.abs(a.q-b.q):Infinity;
  if(best===0)return a.d+b.d;
  for(const s of ends(a,true))for(const t of ends(b,false)){
   if(s.d+t.d>=best)continue;
   const key=JSON.stringify([s.node,t.node,s.edge,t.edge]);
   if(!cache.has(key)){
    const path=N.path(adj,s.node,t.node,s.edge,t.edge);
    cache.set(key,path?path.reduce((v,p)=>v+num(edges.get(p.edge)?.len,0),0):Infinity);
   }
   best=Math.min(best,s.d+t.d+cache.get(key));
  }
  return best+a.d+b.d;
 }
 return {access,distance};
}
const fixedCost=(s)=>Math.round(TYPES[s.type].monthly*(.20+.80*funding(s.funding)/100));
function plan(state,city,data={},opts={}){
 const fail=reason=>({ok:false,reason});
 if(!valid(data)||!own(TYPES,data.type))return fail('请选择司法设施类别和位置');
 if(state.sites.length>=LIMIT.sites)return fail('公共司法设施数量已达上限');
 if(data.type==='hall'&&state.sites.some(x=>x.type==='hall'))return fail('每座城市只建一座市政厅');
 const spec=TYPES[data.type],p={x:data.x,y:data.y,z:0};
 const water=typeof opts.water==='function'?opts.water:N.water;
 const land=opts.land||opts.isLand||opts.isBuildable||((q)=>q.x>=2&&q.x<=1198&&q.y>=2&&q.y<=798&&!water(q));
 const footprint=[p,...[-1,1].flatMap(x=>[-1,1].map(y=>({x:p.x+spec.width*x/2,y:p.y+spec.depth*y/2,z:0})))];
 if(footprint.some(q=>!land(q)))return fail('整个设施必须位于可建设的陆地上');
 const dims=f=>state.sites.includes(f)?TYPES[f.type]:{width:num(f.width,num(f.w,18)),depth:num(f.depth,num(f.h,16))};
 const overlap=f=>valid(f)&&Math.abs(f.x-p.x)<(dims(f).width+spec.width)/2+2&&Math.abs(f.y-p.y)<(dims(f).depth+spec.depth)/2+2;
 const occupied=opts.occupied||[...(city.civic?.services||[]),...(city.civic?.lots||[]),...(city.education?.sites||[]),...(city.parking?.lots||[]),...(city.transit?.stations||[])];
 if([...state.sites,...occupied].some(overlap))return fail('选址与已有地块或公共设施重叠');
 const net=networkOf(city,opts),access=roadAccess(net,water).access(p);
 if(!access)return fail('设施需要在地面普通道路旁接入');
 const roadWidth=N.crossSection(access.e).width/2;
 const d=access.d,w=d?(Math.abs(access.hit.x-p.x)*spec.width+Math.abs(access.hit.y-p.y)*spec.depth)/(2*d):Infinity;
 if(d<w+roadWidth+1)return fail('设施占地不能压住地面道路');
 if(num(opts.cash,num(city.network?.cash,Infinity))<spec.cost)return {ok:false,reason:'市库不足',cost:spec.cost};
 const chosen={type:data.type,x:p.x,y:p.y,funding:funding(data.funding)};
 return {ok:true,cost:spec.cost,site:chosen,monthly:fixedCost(chosen),capacity:Math.floor(spec.capacity*chosen.funding/100)};
}
function add(state,draft){
 if(!draft?.ok||state.sites.length>=LIMIT.sites||state.next>99999999)return null;
 if(draft.site?.type==='hall'&&state.sites.some(x=>x.type==='hall'))return null;
 const s=site({...draft.site,id:'J'+state.next});if(!s)return null;
 state.next++;state.sites.push(s);return s;
}
function remove(state,value){
 const i=state.sites.findIndex(s=>s.id===value);
 if(i<0||state.inmates.some(x=>x.jail===value))return false;
 state.sites.splice(i,1);return true;
}
function setFunding(state,value,percent){
 const s=state.sites.find(x=>x.id===value);
 if(!s||!Number.isFinite(percent))return false;s.funding=funding(percent);return true;
}
function setPolicy(state,k){
 if(!own(POLICIES,k))return false;state.policy=k;return true;
}
function responders(state){
 return (state?.sites||[]).filter(x=>x.type==='police'&&funding(x.funding)>0).map(({id,type,x,y})=>({id,type,x,y}));
}
function facilities(state,city,opts){
 const reach=roadAccess(networkOf(city,opts),typeof opts.water==='function'?opts.water:N.water);
 const list=[],seen=new Set();
 function put(v,legacy=false){
  const driveway=reach.access(v),f=legacy?int(city.civic?.budgets?.police,100,0,150):funding(v.funding);
  if(seen.has(v.id))return;seen.add(v.id);
  list.push({...v,legacy,driveway,funding:f,connected:!!driveway,used:0,monthly:legacy?0:fixedCost(v),governed:false,capacity:0});
 }
 for(const v of state.sites)put(v);
 for(const v of (city.civic?.services||[]).filter(v=>v?.type==='police').slice(0,LIMIT.legacy)){
  if(valid(v)&&id(v.id))put({id:id(v.id),type:'police',x:v.x,y:v.y},true);
 }
 const h=list.find(f=>f.type==='hall'&&f.connected&&f.funding>=50),active=!!h,selected=state.policy;
 const effective=active?selected:'balanced',rules=POLICIES[effective],held=new Map();
 for(const c of state.inmates)held.set(c.jail,(held.get(c.jail)||0)+1);
 for(const f of list){
  const p=f.type==='police'||f.type==='court';
  // Administration only adjusts facilities that can both receive and return records over the road network.
  if(h&&p&&effective!=='balanced')f.governed=Number.isFinite(reach.distance(h.driveway,f.driveway))&&Number.isFinite(reach.distance(f.driveway,h.driveway));
  const scale=f.governed?rules[f.type]:1;
  f.capacity=!f.connected?0:f.type==='hall'?Number(f.funding>=50):Math.floor(TYPES[f.type].capacity*f.funding*scale/100);
  if(f.type==='jail')f.used=held.get(f.id)||0;
 }
 const policyCost=active?rules.monthly:0;
 return {list,reach,policy:{selected,active},policyCost,maintenance:list.reduce((sum,f)=>sum+f.monthly,policyCost)};
}
function maintenance(state,city,opts={}){
 if(!city)return state.sites.reduce((sum,v)=>sum+fixedCost(v),0);
 return facilities(state,city,opts).maintenance;
}
function hash(seed){
 let h=2166136261;
 for(const c of String(seed))h=Math.imul(h^c.charCodeAt(0),16777619);
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
 return (h>>>0)/4294967296;
}
function report(state,city,opts={}){
 const f=city?facilities(state,city,opts):null;
 const past=new Map((state.last?.sites||[]).map(s=>[s.id,s]));
 const sites=f?f.list.map(s=>siteSummary({...s,used:s.type==='jail'?s.used:past.get(s.id)?.used||0})):state.last?.sites||[];
 const policy=f?.policy||{selected:state.policy,active:Boolean(state.last?.policy?.active)};
 return {month:state.lastMonth,sites,cases:state.cases,inmates:state.inmates,log:state.log,totals:state.totals,last:state.last,policy,
  maintenance:f?.maintenance??state.last?.maintenance??maintenance(state)};
}
function advance(state,city,opts={}){
 const month=int(city?.month,1,1);
 if(month<=state.lastMonth)return {...report(state),maintenance:0,noOp:true};
 const last={month,...emptyCounters(),blocked:0,maintenance:0,communityCost:0,policyCost:0};
 const append=(c,action,reason,by='')=>{
  const s=row({...c,month,action,reason,site:by});if(!s)return;
  state.log.push(s);last[action]++;
 };
 const siteMap=new Map(state.sites.map(x=>[x.id,x])),released=[];
 for(const c of state.inmates)if(c.release<=month){
  const j=siteMap.get(c.jail);
  append({...c,x:j?.x,y:j?.y},'released','released',c.jail);released.push(c.id);
 }
 if(released.length){const removed=new Set(released);state.inmates=state.inmates.filter(c=>!removed.has(c.id));}
 const f=facilities(state,city,opts),loc=new Map(f.list.map(v=>[v.id,v])),byType={};
 for(const k of Object.keys(TYPES))byType[k]=f.list.filter(s=>s.type===k&&s.capacity>0);
 last.maintenance=f.maintenance;last.policyCost=f.policyCost;last.policy=f.policy;
 const upstream=opts.incidents||city.civicEvents||city.incidents;
 const logs=Array.isArray(upstream)?upstream:(Array.isArray(upstream?.log)?upstream.log:[]);
 const wanted=new Set([...state.seen,...state.cases.map(x=>x.id),...state.inmates.map(x=>x.id)]);
 const incoming=[];
 for(const v of logs.slice(-200)){
  if(!v||v.type!=='crime'||v.action!=='resolved'||v.month!==month||!id(v.provider)||!iid(id(v.id))||wanted.has(id(v.id)))continue;
  const c=pending({...v,id:id(v.id),responder:id(v.provider),opened:month,stage:'investigation'});
  if(!c)continue;
  wanted.add(c.id);state.seen.push(c.id);incoming.push(c);
 }
 const closed=new Set(),order=(x,y)=>y.severity-x.severity||x.opened-y.opened||Number(x.id.slice(1))-Number(y.id.slice(1));
 const queue=[...state.cases].sort(order);
 const candidates=(from,list,reverse=false)=>list
  .map(s=>({s,d:reverse?f.reach.distance(s.driveway,from):f.reach.distance(from,s.driveway)}))
  .filter(r=>Number.isFinite(r.d)).sort((a,b)=>a.d-b.d||a.s.id.localeCompare(b.s.id)).map(r=>r.s);
 function select(c,k,point,reverse,reasons,preferred=''){
  const sites=byType[k];
  if(!sites.length){c.reason=reasons[0];return null;}
  const legal=candidates(point,sites,reverse);
  if(!legal.length){c.reason=reasons[1];return null;}
  const match=legal.find(s=>s.id===preferred&&s.used<s.capacity)||legal.find(s=>s.used<s.capacity);
  if(!match)c.reason=reasons[2];
  return match||null;
 }
 for(const c of queue){
  if(month-c.opened>=LIMIT.age){closed.add(c.id);append(c,'expired','expired');continue;}
  if(c.stage==='transfer'){
   // Keep a completed disposition when a courthouse closes. The documented archive point still
   // needs a directional driveway; a broken link cannot move a file/custody token.
   const court=loc.get(c.court),source=court?.driveway||(c.origin&&f.reach.access(c.origin));
   const jail=select(c,'jail',source,false,['noJail','jailRoad','jailFull']);
   if(!jail)continue;
   jail.used++;closed.add(c.id);
   state.inmates.push({id:c.id,jail:jail.id,admitted:month,release:month+Math.max(1,c.sentence)});
   append(c,'admitted','admitted',jail.id);continue;
  }
  if(c.stage==='court'){
   const station=loc.get(c.police),source=station?.driveway||(c.origin&&f.reach.access(c.origin));
   const court=select(c,'court',source,false,['noCourt','courtRoad','courtQueue']);
   if(!court)continue;
   court.used++;c.court=court.id;c.origin={x:court.x,y:court.y};
   const verdict=hash(state.seed+'|verdict|'+c.id);
   if(c.evidence*.70+verdict*.30<.54){
    closed.add(c.id);append(c,'dismissed','dismissed',court.id);continue;
   }
   if(state.policy==='community'&&court.governed&&c.severity<=2){
    closed.add(c.id);last.communityCost+=70*c.severity;append(c,'community','community',court.id);continue;
   }
   c.stage='transfer';c.reason='sentence';c.sentence=c.severity+Math.floor(hash(state.seed+'|sentence|'+c.id)*2);
   append(c,'sentenced','sentence',court.id);continue;
  }
  const station=select(c,'police',f.reach.access(c),true,['noPolice','policeRoad','policeQueue'],c.police||c.responder);
  if(!station)continue;
  if(c.police&&c.police!==station.id)append(c,'reassigned','working',station.id);
  c.police=station.id;c.work++;station.used++;c.reason='working';
  if(c.work<c.required)continue;
  c.evidence=hash(state.seed+'|evidence|'+c.id);
  append(c,'investigated','review',station.id);
  if(c.evidence<.28){
   closed.add(c.id);append(c,'dismissed','evidence',station.id);continue;
  }
  c.stage='court';c.reason='review';c.origin={x:station.x,y:station.y};
 }
 state.cases=state.cases.filter(c=>!closed.has(c.id));
 for(const c of incoming.sort(order)){
  if(state.cases.length>=LIMIT.cases){append(c,'dropped','capacity');continue;}
  state.cases.push(c);append(c,'received','new',c.responder);
 }
 state.log=state.log.slice(-LIMIT.log);state.seen=state.seen.slice(-LIMIT.seen);
 last.blocked=state.cases.filter(c=>!['new','working','review','sentence'].includes(c.reason)).length;
 last.maintenance+=last.communityCost;
 last.sites=f.list.map(siteSummary).filter(Boolean);
 state.lastMonth=month;state.last=last;
 for(const k of Object.keys(state.totals))state.totals[k]+=last[k];
 return report(state);
}
return {TYPES,POLICIES,REASONS,LIMIT,create,normalize,plan,add,remove,setFunding,setPolicy,responders,maintenance,advance,tick:advance,report};
});
