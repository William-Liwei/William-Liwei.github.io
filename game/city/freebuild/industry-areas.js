/* Specialized, material-balanced area industry. Market sectors still choose ordinary zoning. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network,typeof module==='object'?require('./districts.js'):root.Districts,typeof module==='object'?require('./economy.js'):root.Economy);
 if(typeof module==='object')module.exports=api;else root.IndustryAreas=api;
})(globalThis,function(N,D,E){
'use strict';
const TYPES={
 farm:{name:'农业区',raw:'produce',product:'processed_food',extractor:'田间生产站',processor:'农产加工厂',rate:34,factor:1,employment:1,pollution:.07,levy:.28},
 ranch:{name:'牧业区',raw:'livestock',product:'processed_food',extractor:'畜牧站',processor:'畜产加工厂',rate:29,factor:1.10,employment:1.1,pollution:.22,levy:.26},
 fishery:{name:'渔业区',raw:'fish',product:'processed_food',extractor:'渔获卸货站',processor:'水产加工厂',rate:27,factor:1.08,employment:1.1,pollution:.09,stock:'renewable',recovery:.052,levy:.28},
 forestry:{name:'林业区',raw:'timber',product:'materials',extractor:'林木采运站',processor:'木材加工厂',rate:33,factor:1.08,employment:1.1,pollution:.13,stock:'renewable',recovery:.024,levy:.29},
 mine:{name:'采矿区',raw:'ore',product:'materials',extractor:'采矿作业站',processor:'矿材加工厂',rate:30,factor:1.28,employment:1.32,pollution:.54,stock:'finite',levy:.26},
 oil:{name:'石油区',raw:'oil',product:'fuel',extractor:'原油采集站',processor:'炼化加工厂',rate:28,factor:1.54,employment:1.45,pollution:.76,stock:'finite',levy:.26}
};
const MODULES={
 extractor:{name:'采集设施',icon:'采',width:24,depth:18,cost:8700,monthly:92,jobs:6,capacity:28,haul:30,color:'#e2c271'},
 processor:{name:'加工设施',icon:'工',width:32,depth:22,cost:15100,monthly:132,jobs:9,capacity:56,haul:28,color:'#e6925a'},
 storage:{name:'仓储设施',icon:'仓',width:29,depth:19,cost:8300,monthly:70,jobs:3,capacity:104,haul:61,color:'#85c1be'}
};
const POLICIES={
 balanced:{name:'平衡经营',description:'常规采集速度、成本和环境影响',rate:1,pollution:1,care:1},
 conserve:{name:'保护性生产',description:'压低采集产量、提高再生和降低污染',rate:.60,pollution:.56,care:1.30},
 intensive:{name:'集约提产',description:'增产、升高污染和日常开支；有限储量更快耗尽',rate:1.42,pollution:1.34,care:.76}
};
const REASONS={noModules:'已划定范围；还未建设产业设施',noRoad:'缺少可用地面道路',noStaff:'没有可往返的闲置劳动力',stock:'储量已耗尽',reserve:'当地资源稀少',
 utility:'供水或供电不足',port:'缺少可往返的在营港口',raw:'没有接通的原料或原料不足',full:'本地缓冲或仓储已满',
 shipments:'缺少可往返的物流出口或客户',operating:'运营中'};
const ALPINE={
 farm:[[445,480,180,230,.72],[740,415,110,210,.55]],ranch:[[345,560,180,140,.75],[785,318,140,220,.62]],
 forestry:[[325,226,124,160,.9],[870,405,165,170,1],[874,658,130,122,.72]],
 mine:[[280,333,115,112,1],[971,358,135,108,.93]],oil:[[835,601,108,132,.84],[451,684,126,90,.78]]
};
const CELL=26, LIMIT={modules:108,cells:9200,policies:90,rows:90,log:96,lots:4000,haul:1100};
const GOODS=[...new Set(Object.values(TYPES).flatMap(v=>[v.raw,v.product]))];
const ACTIONS=['extracted','processed','shipped','stored'];
const num=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),int=(v,d=0,a=0,b=1e9)=>Math.floor(clamp(num(v,d),a,b));
const round=(v,n=2)=>Math.round(v*10**n)/10**n;
const id=(v,n=70)=>typeof v==='number'||typeof v==='string'?String(v).slice(0,n):'';
const own=(v,k)=>Object.hasOwn(v,k),arr=(v)=>Array.isArray(v)?v:[],valid=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=2000&&v.y>=0&&v.y<=1400;
const did=v=>/^D[1-9][0-9]{0,8}$/.test(v),mid=v=>/^Ind[1-9][0-9]{0,7}$/.test(v);
const counts=(v={})=>Object.fromEntries(GOODS.map(k=>[k,int(v?.[k])]).filter(([,n])=>n>0));
const total=o=>Object.values(o).reduce((a,b)=>a+b,0);
const cashFields=['jobs','staff','production','processed','shipped','income','expense','net'];
const metricFields=['jobs','staff','production','processed','shipped','income','expense'];
const metric=(v)=>({...Object.fromEntries(metricFields.map(k=>[k,int(v?.[k])])),net:int(v?.net,0,-1e9)});
const key=(type,i,j)=>type+':'+i+':'+j;
const jobCap=(kind,type)=>Math.round(MODULES[kind].jobs*TYPES[type].employment);
const moduleCost=(kind,type)=>Math.round(MODULES[kind].cost*TYPES[type].factor);
function create(seed='city-industry'){
 return {version:1,seed:String(seed).slice(0,96),next:1,lastMonth:0,migrated:false,modules:[],cells:{},policies:{},log:[],last:null};
}
function moduleRow(v){
 if(!valid(v)||!mid(id(v.id))||!did(id(v.districtId))||!own(MODULES,v.kind)||!own(TYPES,v.type))return null;
 const spec=MODULES[v.kind],rule=TYPES[v.type],buffer={},inbound=counts(v.buffer);
 let capacity=spec.capacity;
 for(const k of [rule.raw,rule.product]){
  if(!inbound[k]||k===rule.product&&v.kind==='extractor')continue;
  const amount=Math.min(inbound[k],capacity);if(amount){buffer[k]=amount;capacity-=amount;}
 }
 return {id:id(v.id),districtId:id(v.districtId),kind:v.kind,type:v.type,x:v.x,y:v.y,buffer};
}
function logRow(v){
 if(!v||!did(id(v.districtId))||!mid(id(v.site))||!ACTIONS.includes(v.action)||!GOODS.includes(v.good))return null;
 return {month:int(v.month),districtId:id(v.districtId),site:id(v.site),action:v.action,good:v.good,count:int(v.count,0,0,1000)};
}
function summary(v){
 if(!v||!valid(v.focus)||!own(TYPES,v.type)||!did(id(v.id)))return null;
 const points=arr(v.points).slice(0,48).filter(valid).map(p=>({x:p.x,y:p.y}));if(points.length<3)return null;
 const box=bbox(points);
 return {id:id(v.id),type:v.type,focus:{x:v.focus.x,y:v.focus.y},points,box,policy:policy(v.policy),
  ...metric(v),suitability:clamp(num(v.suitability)),access:clamp(num(v.access)),utility:clamp(num(v.utility)),pollution:clamp(num(v.pollution)),
  reason:own(REASONS,v.reason)?v.reason:'noRoad',active:!!v.active,stock:v.stock==null?null:int(v.stock),maxStock:v.maxStock==null?null:int(v.maxStock),
  buffer:counts(v.buffer),extractedByGood:counts(v.extractedByGood),consumedByGood:counts(v.consumedByGood),processedByGood:counts(v.processedByGood),shippedByGood:counts(v.shippedByGood)};
}
function siteSummary(v){
 const m=moduleRow(v);if(!m)return null;
 return {...m,...metric(v),capacity:int(v.capacity),connected:!!v.connected,haul:int(v.haul),reason:own(REASONS,v.reason)?v.reason:'noRoad'};
}
function hydrateLast(v,month){
 if(!v||typeof v!=='object')return null;
 return {month,districts:Object.fromEntries(Object.values(v.districts||{}).slice(0,LIMIT.rows).map(summary).filter(Boolean).map(d=>[d.id,d])),
  modules:arr(v.modules).slice(0,LIMIT.modules).map(siteSummary).filter(Boolean),local:counts(v.local),
  total:{...metric(v.total),pollution:round(clamp(num(v.total?.pollution),0,100),3)},byHome:Object.fromEntries(Object.entries(v.byHome||{}).slice(0,LIMIT.lots).map(([k,n])=>[id(k),int(n,0,0,500)]))};
}
const policy=v=>own(POLICIES,v)?v:'balanced';
function normalize(raw,seed='city-industry'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(!raw||typeof raw!=='object')return s;
 s.lastMonth=int(raw.lastMonth);s.migrated=!!raw.migrated;
 const seen=new Set();
 for(const v of arr(raw.modules).slice(0,LIMIT.modules)){
  const m=moduleRow(v);if(!m||seen.has(m.id))continue;
  seen.add(m.id);s.next=Math.max(s.next,+m.id.slice(3)+1);s.modules.push(m);
 }
 s.next=Math.max(s.next,int(raw.next,1,1,99999999));
 for(const [k,v] of Object.entries(raw.cells||{}).slice(0,LIMIT.cells)){
  const m=/^(mine|oil|fishery|forestry):([0-9]{1,2}):([0-9]{1,2})$/.exec(k);
  if(!m||!v||+m[2]*CELL>2000||+m[3]*CELL>1400)continue;
  const used=round(clamp(num(v.used),0,114),4);
  if(used>0)s.cells[k]={used,month:int(v.month,0,0,s.lastMonth),care:round(clamp(num(v.care,1),.6,1.6),2)};
 }
 for(const [k,v] of Object.entries(raw.policies||{}).slice(0,LIMIT.policies))if(did(k)&&own(POLICIES,v))s.policies[k]=v;
 s.log=arr(raw.log).slice(-LIMIT.log).map(logRow).filter(Boolean);s.last=hydrateLast(raw.last,s.lastMonth);
 return s;
}
const netOf=(c,o)=>o.network||c.network||{edges:[],nodes:[]},waterOf=o=>typeof o.water==='function'?o.water:N.water;
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
function bbox(poly){
 return {left:Math.min(...poly.map(p=>p.x)),right:Math.max(...poly.map(p=>p.x)),top:Math.min(...poly.map(p=>p.y)),bottom:Math.max(...poly.map(p=>p.y))};
}
function zoneRows(city){
 return arr(city.districts?.districts).filter(d=>d&&did(d.id)&&own(TYPES,d.type)&&Array.isArray(d.points)&&d.points.length>=3&&d.points.length<=48&&d.points.every(valid)).slice(0,LIMIT.rows);
}
function influence(type,p,opts={}){
 if(!valid(p)||!own(TYPES,type))return 0;
 const wet=waterOf(opts);
 if(type==='fishery'&&!wet(p))return 0;
 if(typeof opts.resourceAt==='function')return clamp(num(opts.resourceAt(type,p)));
 if(opts.mapId==='alpine'){
  if(type==='fishery')return .60;
  if(wet(p))return 0;
  const peak=Math.max(0,...(ALPINE[type]||[]).map(([x,y,w,h,a])=>a*Math.exp(-1.35*(((p.x-x)/w)**2+((p.y-y)/h)**2))));
  const base=type==='farm'||type==='ranch'?.19:type==='forestry'?.11:.015;
  return clamp(base+peak*.83+.035*Math.sin(.029*p.x+.035*p.y));
 }
 // Geology belongs to the map, not to current earthwork or building rules.
 return D.resource(type,p,{...opts,water:wet,isBuildable:undefined});
}
function quantity(state,type,i,j,opts,month){
 const p={x:i*CELL+CELL/2,y:j*CELL+CELL/2},t=TYPES[type],k=key(type,i,j),suitability=influence(type,p,opts);
 const capacity=t.stock?Math.floor(suitability*CELL*CELL*.165):null;
 const old=state.cells[k];
 const restored=t.stock==='renewable'&&old?capacity*t.recovery*num(old.care,1)*Math.max(0,month-old.month):0;
 const used=Math.min(capacity||0,Math.max(0,num(old?.used)-restored));
 return {type,i,j,key:k,x:p.x,y:p.y,suitability,capacity,remaining:capacity===null?null:Math.max(0,Math.floor(capacity-used+1e-6)),used};
}
function resource(state,type,p,opts={}){
 if(!valid(p)||!own(TYPES,type))return {strength:0,suitability:0,remaining:null,capacity:null};
 const month=int(opts.month,state.lastMonth,0),q=quantity(state,type,Math.floor(p.x/CELL),Math.floor(p.y/CELL),opts,month);
 return {strength:q.capacity===null?q.suitability:q.capacity?clamp(q.remaining/q.capacity)*q.suitability:0,
  suitability:q.suitability,remaining:q.remaining,capacity:q.capacity};
}
function cellsFor(state,zone,opts,month){
 const b=bbox(zone.points),cells=[];
 for(let i=Math.floor(b.left/CELL);i*CELL<b.right;i++)
  for(let j=Math.floor(b.top/CELL);j*CELL<b.bottom;j++){
   const p={x:i*CELL+CELL/2,y:j*CELL+CELL/2};
   if(D.inPolygon(p,zone.points))cells.push(quantity(state,zone.type,i,j,opts,month));
  }
 if(!cells.length){
  const p={x:(b.left+b.right)/2,y:(b.top+b.bottom)/2};
  if(D.inPolygon(p,zone.points))cells.push(quantity(state,zone.type,Math.floor(p.x/CELL),Math.floor(p.y/CELL),opts,month));
 }
 return cells;
}
function migrate(s,city,opts,month){
 if(s.migrated)return;
 for(const [k,n] of Object.entries(city.districts?.extraction||{}).slice(0,LIMIT.cells)){
  if(/^(mine|oil):[0-9]{1,2}:[0-9]{1,2}$/.test(k)&&num(n)>0)s.cells[k]={used:round(clamp(n,0,114),4),month,care:1};
 }
 for(const d of zoneRows(city)){
  if(!TYPES[d.type].stock||!(d.maxStock>0)||!Number.isFinite(d.stock))continue;
  const depleted=1-clamp(d.stock/d.maxStock);
  if(depleted<=0)continue;
  const cells=cellsFor(s,d,opts,month),capacity=cells.reduce((q,c)=>q+c.capacity,0);
  const historic=cells.reduce((q,c)=>q+c.used,0);
  const empty=capacity-historic;
  const fill=empty>0?clamp((capacity*depleted-historic)/empty):0;
  if(!fill)continue;
  for(const c of cells)if(c.capacity>c.used)s.cells[c.key]={used:round(c.used+fill*(c.capacity-c.used),4),month,care:1};
 }
 s.migrated=true;
}
function plan(state,city,data={},opts={}){
 const fail=reason=>({ok:false,reason}),kind=data.kind,districtId=id(data.districtId);
 const zone=zoneRows(city).find(v=>v.id===districtId);
 if(!valid(data)||!own(MODULES,kind)||!zone)return fail('请先划定相应产业区，再选择区内设施位置');
 if(state.modules.length>=LIMIT.modules)return fail('产业设施数量已达上限');
 const spec=MODULES[kind],center={x:data.x,y:data.y,z:0},wet=waterOf(opts),net=netOf(city,opts);
 const land=opts.land||opts.isBuildable||((p)=>p.x>=2&&p.x<=1198&&p.y>=2&&p.y<=798&&!wet(p));
 const footprint=[center,...[-1,1].flatMap(x=>[-1,1].map(y=>({x:center.x+spec.width*x/2,y:center.y+spec.depth*y/2,z:0})))];
 if(footprint.some(p=>wet(p)||!land(p)||!D.inPolygon(p,zone.points)))return fail('整座设施须在该产业区内的可建陆地上');
 if(kind==='extractor'&&zone.type==='fishery'&&![16,30,47].some(r=>Array.from({length:12},(_,i)=>i*Math.PI/6).some(t=>wet({x:center.x+r*Math.cos(t),y:center.y+r*Math.sin(t)}))))
  return fail('卸渔站必须在该片水域近岸');
 const overlap=(p,w,h)=>valid(p)&&Math.abs(center.x-p.x)<(spec.width+w)/2+2&&Math.abs(center.y-p.y)<(spec.depth+h)/2+2;
 const occupied=opts.occupied||[...arr(city.civic?.lots),...arr(city.civic?.services),...arr(city.transit?.stations),...arr(city.care?.sites),...arr(city.education?.sites),...arr(city.justice?.sites)];
 if(state.modules.some(m=>overlap(m,MODULES[m.kind].width,MODULES[m.kind].depth))||occupied.some(m=>m&&overlap(m,num(m.width,14),num(m.depth,14))))return fail('产业设施占地与已有地块或设施冲突');
 const a=roadAccess(net,wet).access(center);
 if(!a)return fail('设施必须位于连通的地面道路旁');
 const d=a.d,pad=d?(Math.abs(a.hit.x-center.x)*spec.width+Math.abs(a.hit.y-center.y)*spec.depth)/(2*d):Infinity;
 if(d<pad+N.crossSection(a.e).width/2+1)return fail('设施占地不能压住道路');
 const cost=moduleCost(kind,zone.type);
 if(num(opts.cash,num(city.network?.cash,Infinity))<cost)return {ok:false,reason:'市库不足',cost};
 return {ok:true,cost,module:{districtId,kind,type:zone.type,x:center.x,y:center.y,buffer:{}}};
}
function add(state,draft){
 if(!draft?.ok||state.modules.length>=LIMIT.modules||state.next>99999999)return null;
 const m=moduleRow({...draft.module,id:'Ind'+state.next});if(!m)return null;
 state.next++;state.modules.push(m);return m;
}
function remove(state,value){
 const i=state.modules.findIndex(m=>m.id===value);
 if(i<0||total(state.modules[i].buffer)>0)return false;
 state.modules.splice(i,1);return true;
}
function setPolicy(state,districtId,key){
 if(!did(id(districtId))||!own(POLICIES,key)||(!own(state.policies,districtId)&&Object.keys(state.policies).length>=LIMIT.policies))return false;
 if(key==='balanced')delete state.policies[districtId];else state.policies[districtId]=key;
 return true;
}
function blankDistrict(d,opts,s,month){
 const cells=cellsFor(s,d,opts,month),box=bbox(d.points),hasStock=!!TYPES[d.type].stock;
 const focus={x:d.points.reduce((a,p)=>a+p.x,0)/d.points.length,y:d.points.reduce((a,p)=>a+p.y,0)/d.points.length};
 return {id:d.id,type:d.type,focus,box,points:d.points,policy:policy(s.policies[d.id]),...metric(),suitability:cells.length?cells.reduce((q,c)=>q+c.suitability,0)/cells.length:0,
  access:0,utility:0,pollution:0,reason:'noModules',active:false,
  stock:hasStock?cells.reduce((a,c)=>a+c.remaining,0):null,maxStock:hasStock?cells.reduce((a,c)=>a+c.capacity,0):null,
  buffer:{},extractedByGood:{},consumedByGood:{},processedByGood:{},shippedByGood:{},cells};
}
const weight=(o,k,n)=>{if(n>0)o[k]=(o[k]||0)+n;};
const take=(o,k,n)=>{if(n<=0)return;o[k]=(o[k]||0)-n;if(o[k]<=0)delete o[k];};
function frame(s,city,opts,month,planningOnly=false){
 const wet=waterOf(opts),roads=roadAccess(netOf(city,opts),wet),zones=new Map(),modules=[], byArea=new Map();
 const utility=p=>Math.min(clamp(num(opts.powerAt?.(p),1)),clamp(num(opts.waterAt?.(p),1)));
 for(const d of zoneRows(city)){zones.set(d.id,blankDistrict(d,opts,s,month));byArea.set(d.id,[]);}
 const legs=new Map();
 function route(a,b,max=LIMIT.haul){
  if(!a?.drive||!b?.drive||N.dist(a,b)>max)return Infinity;
  const key=JSON.stringify([a.x,a.y,b.x,b.y]);
  if(!legs.has(key)){
   const d=Math.max(roads.distance(a.drive,b.drive),roads.distance(b.drive,a.drive));
   legs.set(key,d);legs.set(JSON.stringify([b.x,b.y,a.x,a.y]),d);
  }
  const d=legs.get(key);return d<=max?d:Infinity;
 }
 const ports=arr(opts.seaports??city.transit?.stations).filter(v=>v&&valid(v)&&['ferryTerminal','cargoPort','fishPort'].includes(v.type)&&v.operating!==false&&v.valid!==false)
  .map(v=>({...v,drive:roads.access(v)}));
 for(const m of s.modules){
  const zone=zones.get(m.districtId);
  if(!zone||zone.type!==m.type||!D.inPolygon(m,zone.points))continue;
  const spec=MODULES[m.kind],drive=roads.access(m);
  const item={...m,drive,capacity:spec.capacity,...metric(),jobs:jobCap(m.kind,m.type),haul:0,reason:drive?'noStaff':'noRoad',connected:!!drive,utility:utility(m),port:true};
  if(m.type==='fishery'&&m.kind==='extractor')item.port=ports.some(v=>route(item,v,238)<Infinity);
  modules.push(item);byArea.get(m.districtId).push(item);
 }
 const receivers=[],targetKeys=new Set();
 function receiver(v,goods,c,kind){
  if(!valid(v)||!goods.length||!id(v.id)||c<=0)return;
  const k=JSON.stringify([id(v.id),v.x,v.y]);
  const drive=roads.access(v);if(!drive||kind==='gate'&&drive.d>14||targetKeys.has(k))return;
  targetKeys.add(k);receivers.push({...v,goods:new Set(goods),free:int(c),kind,drive});
 }
 if(!planningOnly){
 for(const v of arr(opts.receivers).slice(0,600))if(v)receiver(v,arr(v.goods).filter(x=>GOODS.includes(x)),int(v.capacity,32,0,360),'client');
 for(const l of arr(city.civic?.lots).slice(0,LIMIT.lots)){
  if(!valid(l)||num(l.level)<=0||l.type==='residential')continue;
  const def=E.sector(l),inputs=Object.keys(def?.inputs||{}).filter(k=>GOODS.includes(k));
  receiver(l,inputs,Math.ceil(Math.max(0,num(l.occupants))*Math.max(.25,...Object.values(def?.inputs||{}))), 'client');
 }
 for(const l of arr(opts.ports??city.transit?.stations).slice(0,250)){
  if(!l||!['cargoYard','cargoPort','cargoAirport'].includes(l.type)||l.operating===false||l.valid===false)continue;
  receiver(l,GOODS,int(l.capacity,78,1,160),'cargo');
 }
 for(const l of arr(opts.gates).slice(0,26))if(l&&l.operating!==false&&l.valid!==false)receiver(l,GOODS,int(l.capacity,62,1,160),'gate');
 }
 return {zones,modules,byArea,route,receiver:receivers,roads};
}
function workforce(city,opts,month,f){
 const report=opts.labor||city.labor?.last, byHome={},workers=[];
 if(report?.month!==month)return byHome;
 const homesById=new Map(arr(city.civic?.lots).slice(0,LIMIT.lots).filter(v=>v?.type==='residential'&&num(v.level)>0&&valid(v)).map(v=>[id(v.id),v]));
 for(const [k,v] of Object.entries(report.byHome||{}).slice(0,LIMIT.lots)){
  if(!v||int(v.unemployed)<=0)continue;
  const built=homesById.get(k);
  if(!built)continue;
  const h={...built,id:k,free:Math.min(int(v.unemployed,0,0,500),int(built.occupants,0,0,500)),drive:f.roads.access(built)};
  if(h.drive&&h.free)workers.push(h);
 }
 // Serve modules with fewer reachable households first, then fill by nearest.
 const choices=f.modules.map(m=>({m,options:workers.map(h=>({h,d:f.route(h,m,680)})).filter(v=>Number.isFinite(v.d)).sort((a,b)=>a.d-b.d||a.h.id.localeCompare(b.h.id))}))
  .sort((a,b)=>a.options.length-b.options.length||a.m.id.localeCompare(b.m.id));
 for(const {m,options} of choices)for(const {h} of options){
  const n=Math.min(h.free,m.jobs-m.staff);
  if(n>0){m.staff+=n;h.free-=n;weight(byHome,h.id,n);}
  if(m.staff>=m.jobs)break;
 }
 return byHome;
}
function deplete(s,zone,m,count,month){
 if(!TYPES[zone.type].stock)return count;
 const local=zone.cells.filter(c=>c.remaining>0).sort((a,b)=>N.dist(a,m)-N.dist(b,m)||a.key.localeCompare(b.key));
 let removed=0,usedCells=Object.keys(s.cells).length;
 for(const c of local){
  if(removed>=count)break;
  const old=s.cells[c.key];
  if(old?.month===month){
   c.used=Math.max(c.used,old.used);c.remaining=Math.max(0,Math.floor(c.capacity-c.used+1e-6));
  }
  const n=Math.min(c.remaining,count-removed);if(!n)continue;
  if(!old&&usedCells>=LIMIT.cells)break;
  if(!old)usedCells++;
  c.used+=n;c.remaining-=n;s.cells[c.key]={used:round(c.used,4),month,care:POLICIES[zone.policy].care};
  removed+=n;
 }
 return removed;
}
function snapshot(f,month,local,byHome){
 const aggregate={...metric(),pollution:0},districts={};
 for(const d of f.zones.values()){
  const modules=f.byArea.get(d.id);
  d.buffer={};
  for(const m of modules){
   m.net=m.income-m.expense;
   for(const k of cashFields)d[k]+=m[k];
   for(const [k,n] of Object.entries(m.buffer))weight(d.buffer,k,n);
  }
  d.access=modules.length?modules.filter(x=>x.connected).length/modules.length:0;
  d.utility=modules.length?modules.reduce((n,x)=>n+x.utility,0)/modules.length:0;
  d.active=modules.some(x=>x.staff&&x.connected);
  d.reason=!modules.length?'noModules':modules.find(x=>x.reason==='operating')?.reason||modules[0].reason;
  if(d.maxStock!=null)d.stock=d.cells.reduce((sum,c)=>sum+c.remaining,0);
  const def=TYPES[d.type],pol=POLICIES[d.policy];
  d.pollution=round(clamp(def.pollution*pol.pollution*(d.production*.018+d.processed*.019)),3);
  for(const k of cashFields)aggregate[k]+=d[k];aggregate.pollution+=d.pollution;
  districts[d.id]=summary(d);
 }
 aggregate.pollution=round(aggregate.pollution,3);
 return {month,districts,modules:f.modules.map(siteSummary),local,total:aggregate,byHome};
}
function attach(r,s){return {...r,totals:r.total,log:s.log};}
function report(s,city,opts={}){
 if(s.last&&!city)return attach(s.last,s);
 const empty={month:s.lastMonth,districts:{},modules:[],local:{},byHome:{},total:{...metric(),pollution:0}};
 if(!city)return attach(empty,s);
 const raw=s.migrated?s:normalize(s,s.seed);
 if(raw!==s)migrate(raw,city,opts,s.lastMonth);
 const f=frame(raw,city,opts,s.lastMonth,true);
 const candidate=snapshot(f,s.lastMonth,{},{}),last=s.last||empty;
 // Keep last realised outputs while still showing newly built sites/areas in
 // planning. Ignore deleted parcels/sites without inventing transfer revenue.
 const districtKeys=Object.keys(candidate.districts),keep=new Set(districtKeys);
 const modules=new Map(candidate.modules.map(m=>[m.id,m]));
 const districts=Object.fromEntries(districtKeys.map(k=>{
  const a=candidate.districts[k],b=last.districts[k];
  return [k,b?{...b,policy:a.policy,box:a.box,focus:a.focus,points:a.points,stock:a.stock,maxStock:a.maxStock}:a];
 }));
 return attach({...candidate,districts,local:last.local,total:last.total,byHome:last.byHome,
  modules:[...modules.values()].map(m=>last.modules.find(a=>a.id===m.id&&keep.has(a.districtId))||m)},s);
}
function advance(s,city,opts={}){
 const month=int(city?.month,1,1);
 if(month<=s.lastMonth)return {...report(s),noOp:true};
 migrate(s,city,opts,month);
 const f=frame(s,city,opts,month),local={},byHome=workforce(city,opts,month,f);
 const log=(m,action,good,count)=>{
  if(!count)return;
  s.log.push({month,districtId:m.districtId,site:m.id,action,good,count});
 };
 const transport=new Map();
 function haul(a,b,limit){
  if(a===b||a.haul<=0||!b.drive)return 0;
  const d=f.route(a,b);if(!Number.isFinite(d))return 0;
  const k=a.id+'|'+b.id+'|'+(b.kind||'');
  const spare=Math.max(0,Math.floor(limit*(1-d/(LIMIT.haul*1.55)))-(transport.get(k)||0));
  return Math.min(a.haul,spare);
 }
 function move(from,to,g,n){
  if(n<=0)return;
  take(from.buffer,g,n);weight(to.buffer,g,n);from.haul-=n;
  const k=from.id+'|'+to.id+'|'+(to.kind||'');transport.set(k,(transport.get(k)||0)+n);
 }
 for(const [id,d] of f.zones){
  const rules=TYPES[d.type],pol=POLICIES[d.policy],all=f.byArea.get(id);
  if(rules.stock==='renewable')for(const c of d.cells){
   const old=s.cells[c.key];if(!old||old.month>=month)continue;
   if(c.used>0)s.cells[c.key]={used:round(c.used,4),month,care:pol.care};else delete s.cells[c.key];
  }
  const extract=all.filter(x=>x.kind==='extractor'),proc=all.filter(x=>x.kind==='processor'),stores=all.filter(x=>x.kind==='storage');
  function setReason(m){
   if(!m.connected)return 'noRoad';if(!m.staff)return 'noStaff';
   if(m.utility<.22)return 'utility';
   if(m.kind==='extractor'&&!m.port)return 'port';
   return 'operating';
  }
  for(const m of all){
   const def=MODULES[m.kind],staff=m.staff/Math.max(1,m.jobs);
   m.reason=setReason(m);
   m.expense=Math.round(def.monthly*rules.factor*(.40+.60*staff)*(d.policy==='intensive'?1.13:d.policy==='conserve'?.94:1));
   m.haul=m.reason==='operating'?Math.ceil(def.haul*staff):0;
  }
  for(const m of extract){
   if(m.reason!=='operating')continue;
   if(d.suitability<.11){m.reason='reserve';continue;}
   if(d.maxStock!=null&&!d.cells.some(c=>c.remaining>0)){m.reason='stock';continue;}
   const limit=m.capacity-total(m.buffer);
   if(limit<=0){m.reason='full';continue;}
   const natural=clamp(d.suitability*1.28,.13,1),staff=m.staff/m.jobs;
   const n=deplete(s,d,m,Math.min(limit,Math.floor(rules.rate*pol.rate*natural*staff*m.utility)),month);
   if(n){m.production+=n;weight(m.buffer,rules.raw,n);weight(d.extractedByGood,rules.raw,n);log(m,'extracted',rules.raw,n);}
  }
  for(const m of proc){
   if(m.reason!=='operating')continue;
   const target=Math.max(0,Math.min(m.capacity-total(m.buffer),Math.ceil(2*27*m.staff/m.jobs*m.utility*pol.rate*.66)-(m.buffer[rules.raw]||0)));
   let needed=target;
   const sources=[...extract,...stores].sort((a,b)=>f.route(a,m)-f.route(b,m)||a.id.localeCompare(b.id));
   for(const a of sources){
    const n=Math.min(needed,a.buffer[rules.raw]||0,haul(a,m,30));
    if(n>0){move(a,m,rules.raw,n);needed-=n;}
    if(needed<=0)break;
   }
   const output=Math.min(Math.floor((m.buffer[rules.raw]||0)/2),Math.floor(27*m.staff/m.jobs*m.utility*pol.rate*.66));
   if(!output){m.reason=total(m.buffer)>=m.capacity?'full':'raw';continue;}
   take(m.buffer,rules.raw,2*output);weight(m.buffer,rules.product,output);
   weight(d.consumedByGood,rules.raw,2*output);m.processed+=output;
   weight(d.processedByGood,rules.product,output);log(m,'processed',rules.product,output);
  }
  // Storage is a real intermediate buffer, never a new supply. When a
  // corridor or buyer is temporarily missing it lets work continue longer.
  for(const m of [...proc,...extract])for(const g of [rules.product,rules.raw]){
   if(!(m.buffer[g]>0)||m.haul<=0)continue;
   const destination=stores.filter(v=>v.reason==='operating').map(v=>[v,f.route(m,v)]).filter(([,d])=>Number.isFinite(d)).sort((a,b)=>a[1]-b[1]);
   // Leave an operating processor raw reserve for the following shift.
   let movable=Math.max(0,m.buffer[g]-(m.kind==='processor'&&g===rules.raw?6:0));
   for(const [v] of destination){
    const n=Math.min(movable,v.capacity-total(v.buffer),haul(m,v,42));
    if(n>0){move(m,v,g,n);log(v,'stored',g,n);movable-=n;}
    if(movable<=0)break;
   }
  }
  for(const m of [...stores,...proc,...extract])for(const g of [rules.product,rules.raw]){
   if(!(m.buffer[g]>0)||m.haul<=0)continue;
   if(m.kind==='processor'&&g===rules.raw)continue;
   const targets=f.receiver.filter(r=>r.free>0&&r.goods.has(g)).map(r=>({r,c:f.route(m,r)})).filter(v=>Number.isFinite(v.c))
    .sort((a,b)=>a.c-b.c||String(a.r.id).localeCompare(String(b.r.id)));
   for(const {r} of targets){
    const n=Math.min(m.buffer[g]||0,r.free,haul(m,r,MODULES[m.kind].haul));
    if(n>0){
     take(m.buffer,g,n);m.haul-=n;r.free-=n;
     const pair=m.id+'|'+r.id+'|'+(r.kind||'');transport.set(pair,(transport.get(pair)||0)+n);
     m.shipped+=n;weight(d.shippedByGood,g,n);weight(local,g,n);
     m.income+=Math.round(n*E.PRODUCTS[g].value*rules.levy);log(m,'shipped',g,n);
    }
    if(!(m.buffer[g]>0)||m.haul<=0)break;
   }
   if(!targets.length&&m.reason==='operating'&&total(m.buffer)>0)m.reason='shipments';
  }
 }
 for(const d of f.zones.values())if(d.maxStock!=null)for(const c of d.cells){
  const o=s.cells[c.key];if(o?.month===month)c.remaining=Math.max(0,Math.floor(c.capacity-o.used+1e-6));
 }
 s.lastMonth=month;
 s.log=s.log.slice(-LIMIT.log);
 s.last=snapshot(f,month,local,byHome);
 return report(s);
}
function preview(s,c,opts={}){
 const copy=normalize(s,s.seed),month=Math.max(copy.lastMonth+1,int(c?.month,1));
 return advance(copy,{...c,month},opts);
}
function freightLots(r){
 return Object.values(r?.districts||{}).filter(v=>v.shipped>0).map(v=>({id:'industry:'+v.id,type:'industrial',level:1,x:v.focus.x,y:v.focus.y,occupants:v.shipped*1.35}));
}
function merge(b,r){
 const districts=Object.fromEntries(Object.entries(b?.districts||{}).filter(([,x])=>!own(TYPES,x.type)));
 const totalRow={...(b?.total||b?.totals||{})};
 for(const row of Object.values(b?.districts||{})){
  if(!own(TYPES,row.type))continue;
  for(const k of ['jobs','staff','income','expense','net','pollution'])totalRow[k]=num(totalRow[k])-num(row[k]);
  totalRow.goods=num(totalRow.goods)-num(row.production);
 }
 // Keep district net distinct from market commodity accounting. Only dispatch
 // enters Economy.local; unshipped inventory does not populate that ledger.
 totalRow.goodsByType={};
 for(const [g,n] of Object.entries(r?.local||{}))if(E.PRODUCTS[g])totalRow.goodsByType[E.PRODUCTS[g].name]=n;
 for(const [k,v] of Object.entries(r?.districts||{})){
  districts[k]={...v,reason:REASONS[v.reason]||v.reason};
  for(const label of ['jobs','staff','income','expense','net','pollution'])totalRow[label]=num(totalRow[label])+num(v[label]);
  totalRow.goods=num(totalRow.goods)+num(v.shipped);
 }
 return {...b,districts,total:totalRow,totals:totalRow,airportBoost:b?.airportBoost||{}};
}
return {TYPES,MODULES,POLICIES,REASONS,GOODS,CELL,LIMIT,create,normalize,plan,add,remove,setPolicy,resource,report,advance,tick:advance,preview,merge,freightLots};
});
