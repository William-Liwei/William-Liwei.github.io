/* Designed parks for City Blueprint. Optional simulation over existing park districts. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./districts.js'):root.Districts);
 if(typeof module==='object')module.exports=api;else root.ParkLife=api;
})(globalThis,function(D){
'use strict';
const ASSETS={
 gate:{name:'公园入口',icon:'门',width:12,depth:8,cost:2100,monthly:62,capacity:93,color:'#cbb394',kind:'gate',enjoyment:0},
 nature:{name:'自然观察区',icon:'林',width:28,depth:21,cost:3350,monthly:73,capacity:47,color:'#739c65',kind:'attraction',enjoyment:.76,theme:'nature'},
 play:{name:'儿童游乐场',icon:'玩',width:24,depth:19,cost:4900,monthly:116,capacity:57,color:'#e8a672',kind:'attraction',enjoyment:.87,theme:'family'},
 sports:{name:'社区运动场',icon:'球',width:41,depth:26,cost:7200,monthly:185,capacity:71,color:'#8db7d3',kind:'attraction',enjoyment:.79,theme:'sports'},
 garden:{name:'花园与花圃',icon:'花',width:29,depth:22,cost:4560,monthly:110,capacity:41,color:'#dda7c3',kind:'attraction',enjoyment:.84,theme:'garden'},
 picnic:{name:'草坪野餐点',icon:'餐',width:23,depth:16,cost:2780,monthly:61,capacity:37,color:'#b5cb89',kind:'attraction',enjoyment:.68,theme:'family'},
 vendor:{name:'餐饮售卖亭',icon:'铺',width:13,depth:10,cost:3100,monthly:78,capacity:52,color:'#d6a771',kind:'support',enjoyment:.08},
 restroom:{name:'公共厕所',icon:'厕',width:11,depth:9,cost:2220,monthly:68,capacity:92,color:'#b3c0cd',kind:'support',enjoyment:.10}
};
const PATHS={
 trail:{name:'林间小径',width:2.6,cost:17,monthly:.42,capacity:43,color:'#dbc5a5'},
 promenade:{name:'公园步行大道',width:5.8,cost:31,monthly:.87,capacity:107,color:'#d5b99a'}
};
const THEMES={nature:'自然与观景',family:'家庭休憩',sports:'社区运动',garden:'花园展陈',mixed:'综合公园',empty:'尚未布置'};
const BANDS={0:'未开放',1:'街坊公园',2:'社区目的地',3:'城市级休闲公园'};
const REASONS={noGate:'没有开放入口',street:'开放入口没有可用外部进路',path:'入口或设施与内部步道没有连通',
 unbuilt:'尚未建设可到达的游憩设施',funding:'养护经费不足，设施暂未运营',crowd:'入口、步道或热点设施拥挤',cost:'门票抑制本地需求',operating:'正常开放'};
const LIMIT={parks:65,assets:310,paths:320,perParkAssets:48,perParkPaths:55,segments:128,points:30,lots:4000,history:28,visitors:12000};
const num=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),rnd=(v,d=3)=>Math.round(v*10**d)/10**d;
const int=(v,d=0,a=0,b=1e9)=>Math.floor(clamp(num(v,d),a,b)),own=(o,k)=>Object.hasOwn(o,k),arr=v=>Array.isArray(v)?v:[];
const id=(v,n=75)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,n):'';
const valid=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=2000&&v.y>=0&&v.y<=1400;
const did=v=>/^D[1-9][0-9]{0,8}$/.test(id(v)),pid=v=>/^Park[1-9][0-9]{0,8}$/.test(id(v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),copy=p=>({x:p.x,y:p.y}),mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const bounds=p=>({left:Math.min(...p.map(v=>v.x)),right:Math.max(...p.map(v=>v.x)),top:Math.min(...p.map(v=>v.y)),bottom:Math.max(...p.map(v=>v.y))});
const fee=v=>int(v,0,0,20),fund=v=>int(v,100,0,125),cal=v=>Math.max(1,int(v,1));
const qtyKeys=['demand','visitors','waiting','income','expense','capacity','connectedGates','connectedAttractions','band'];
const types=Object.keys(ASSETS);
const length=p=>p.slice(1).reduce((n,x,i)=>n+dist(p[i],x),0);
const fail=(reason,more={})=>({ok:false,reason,...more});
const landOf=o=>typeof o.land==='function'?o.land:typeof o.isBuildable==='function'?o.isBuildable:p=>valid(p);
const wetOf=o=>typeof o.water==='function'?o.water:()=>false;
const zones=c=>arr(c?.districts?.districts).filter(v=>v&&v.type==='park'&&did(v.id)&&Array.isArray(v.points)&&v.points.length>=3&&v.points.length<=48&&v.points.every(valid));
function create(seed='city-park'){
 return {version:1,seed:String(seed).slice(0,96),next:1,lastMonth:0,parks:[],last:null,history:[]};
}
function asset(v){
 if(!valid(v)||!pid(v.id)||!own(ASSETS,v.type)||!did(v.districtId))return null;
 return {id:id(v.id),districtId:id(v.districtId),kind:'asset',type:v.type,x:v.x,y:v.y,open:v.open!==false};
}
function path(v){
 if(!v||!pid(v.id)||!own(PATHS,v.type)||!did(v.districtId)||!Array.isArray(v.points)||v.points.length<2||v.points.length>LIMIT.points||!v.points.every(valid))return null;
 const points=v.points.map(copy),metres=length(points);
 if(metres<5||metres>1500||points.slice(1).some((p,i)=>dist(p,points[i])<.30))return null;
 return {id:id(v.id),districtId:id(v.districtId),kind:'path',type:v.type,points,length:rnd(metres,3)};
}
function siteStats(v){
 const a=asset(v);if(!a)return null;
 return {...a,connected:!!v.connected,outside:!!v.outside,throughput:int(v.throughput),visitors:int(v.visitors),active:!!v.active};
}
function pathStats(v){
 const a=path(v);if(!a)return null;
 return {...a,capacity:int(v.capacity),visitors:int(v.visitors),active:!!v.active};
}
function totals(v){
 const r=Object.fromEntries(qtyKeys.filter(k=>k!=='band').map(k=>[k,int(v?.[k])]));
 return {...r,parks:int(v?.parks),net:r.income-r.expense,enjoyment:rnd(clamp(num(v?.enjoyment))),crowding:rnd(clamp(num(v?.crowding)))};
}
function districtRow(v){
 if(!v||!did(v.id)||!valid(v.focus)||!Array.isArray(v.points)||v.points.length<3||v.points.length>48||!v.points.every(valid))return null;
 const p=v.points.map(copy),n=Object.fromEntries(qtyKeys.map(k=>[k,int(v[k])]));
 return {id:id(v.id),type:'park',focus:copy(v.focus),points:p,box:bounds(p),budget:fund(v.budget),fee:fee(v.fee),...n,net:n.income-n.expense,
  park:rnd(clamp(num(v.park))),enjoyment:rnd(clamp(num(v.enjoyment))),safety:rnd(clamp(num(v.safety))),crowding:rnd(clamp(num(v.crowding))),
  theme:own(THEMES,v.theme)?v.theme:'empty',reason:own(REASONS,v.reason)?v.reason:'unbuilt',active:!!v.active,
  assets:arr(v.assets).slice(0,LIMIT.perParkAssets).map(siteStats).filter(Boolean),paths:arr(v.paths).slice(0,LIMIT.perParkPaths).map(pathStats).filter(Boolean)};
}
function hydrate(v,m){
 if(!v||typeof v!=='object')return null;
 const districts=Object.fromEntries(Object.values(v.districts||{}).slice(0,LIMIT.parks).map(districtRow).filter(Boolean).map(a=>[a.id,a]));
 return {month:m,districts,totals:totals(v.totals),benefitsByLot:Object.fromEntries(Object.entries(v.benefitsByLot||{}).slice(0,LIMIT.lots).map(([k,x])=>[id(k),rnd(clamp(num(x)))]))};
}
function historic(v){
 if(!v||!Number.isFinite(v.month))return null;
 const n=totals(v);
 return {month:cal(v.month),parks:n.parks,visitors:n.visitors,demand:n.demand,enjoyment:n.enjoyment,expense:n.expense,income:n.income,net:n.net};
}
function normalize(raw,seed='city-park'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(raw?.version!==1)return s;
 s.lastMonth=int(raw.lastMonth);s.next=int(raw.next,1,1,999999999);
 const seen=new Set(),areas=new Set();let usedAssets=0,usedPaths=0;
 for(const v of arr(raw.parks).slice(0,LIMIT.parks)){
  if(!v||!did(v.districtId)||areas.has(v.districtId))continue;
  areas.add(v.districtId);
  const item={id:v.districtId,districtId:v.districtId,budget:fund(v.budget),fee:fee(v.fee),assets:[],paths:[]};
  for(const [kind,limit,global,convert] of [['assets',LIMIT.perParkAssets,LIMIT.assets,asset],['paths',LIMIT.perParkPaths,LIMIT.paths,path]]){
   let segments=0;
   for(const a of arr(v[kind]).slice(0,limit)){
    const x=convert({...a,districtId:v.districtId});
    if(!x||seen.has(x.id)||(kind==='assets'?usedAssets:usedPaths)>=global)continue;
    if(kind==='paths'&&segments+x.points.length-1>LIMIT.segments)continue;
    item[kind].push(x);seen.add(x.id);s.next=Math.max(s.next,+x.id.slice(4)+1);
    if(kind==='assets')usedAssets++;else{usedPaths++;segments+=x.points.length-1;}
   }
  }
  s.parks.push(item);
 }
 s.history=arr(raw.history).slice(-LIMIT.history).map(historic).filter(Boolean);
 s.last=s.lastMonth?hydrate(raw.last,s.lastMonth):null;
 return s;
}
const parkOf=(s,v)=>s.parks.find(x=>x.districtId===id(v));
function adopt(s,city,v){
 if(!did(v)||parkOf(s,v)||s.parks.length>=LIMIT.parks||!zones(city).some(z=>z.id===id(v)))return null;
 const p={id:id(v),districtId:id(v),budget:100,fee:0,assets:[],paths:[]};s.parks.push(p);return p;
}
function release(s,v){
 const p=parkOf(s,v);if(!p||p.assets.length||p.paths.length)return false;
 s.parks=s.parks.filter(x=>x!==p);return true;
}
function remove(s,v){
 for(const p of s.parks){
  for(const k of ['assets','paths']){
   const ix=p[k].findIndex(x=>x.id===id(v));if(ix>=0){p[k].splice(ix,1);return true;}
  }
 }
 return false;
}
function setBudget(s,v,x){const p=parkOf(s,v);if(!p||!Number.isFinite(x))return false;p.budget=fund(x);return true;}
function setFee(s,v,x){const p=parkOf(s,v);if(!p||!Number.isFinite(x))return false;p.fee=fee(x);return true;}
function setGate(s,gateId,open){
 for(const p of s.parks){const a=p.assets.find(v=>v.id===id(gateId)&&v.type==='gate');if(a){a.open=open!==false;return true;}}
 return false;
}
function project(a,b,p){
 const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/d):0;
 return {...mix(a,b,t),t};
}
function cut(a,b,c,d){
 const dx=b.x-a.x,dy=b.y-a.y,ex=d.x-c.x,ey=d.y-c.y,rx=c.x-a.x,ry=c.y-a.y,det=dx*ey-dy*ex;
 if(Math.abs(det)<1e-7)return null;
 const u=(rx*ey-ry*ex)/det,v=(rx*dy-ry*dx)/det;
 return u>=-1e-7&&u<=1+1e-7&&v>=-1e-7&&v<=1+1e-7?[clamp(u),clamp(v)]:null;
}
function edgeDistance(p,poly){return Math.min(...poly.map((q,i)=>dist(p,project(q,poly[(i+1)%poly.length],p))));}
function inside(p,poly){return D.inPolygon(p,poly)||edgeDistance(p,poly)<.055;}
const footprint=(p,def)=>{
 const w=def.width/2,d=def.depth/2;
 return {left:p.x-w,right:p.x+w,top:p.y-d,bottom:p.y+d};
};
const boxPoints=r=>[{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.right,y:r.bottom},{x:r.left,y:r.bottom}];
function boxClear(r,ok){
 const x=Math.max(1,Math.ceil((r.right-r.left)/4)),y=Math.max(1,Math.ceil((r.bottom-r.top)/4));
 for(let i=0;i<=x;i++)for(let j=0;j<=y;j++){
  if(!ok({x:r.left+(r.right-r.left)*i/x,y:r.top+(r.bottom-r.top)*j/y}))return false;
 }
 return true;
}
const accessProof=v=>v===true||Number.isFinite(v)&&v>=0||!!v&&v.ok===true;
const insideBox=(p,b,pad=0)=>p.x>b.left-pad&&p.x<b.right+pad&&p.y>b.top-pad&&p.y<b.bottom+pad;
const boxOverlap=(a,b,pad=0)=>a.left<b.right+pad&&a.right>b.left-pad&&a.top<b.bottom+pad&&a.bottom>b.top-pad;
function obstacle(v){
 if(!valid(v))return null;
 return footprint(v,{width:clamp(num(v.width,num(v.w,13)),1,150),depth:clamp(num(v.depth,num(v.h,12)),1,150)});
}
function occupied(opts){return arr(opts.occupied).slice(0,8000).map(obstacle).filter(Boolean);}
function allowed(poly,land,water){
 return p=>valid(p)&&inside(p,poly)&&!water(p)&&land(p)!==false;
}
function lineClear(a,b,poly,validPoint,width=0,blocked=[]){
 const len=dist(a,b);if(len<.001)return validPoint(a);
 const dx=b.x-a.x,dy=b.y-a.y,off=width/2,steps=Math.ceil(len/3),parts=[0,1];
 for(let i=0;i<poly.length;i++){const s=cut(a,b,poly[i],poly[(i+1)%poly.length]);if(s)parts.push(s[0]);}
 parts.sort((a,b)=>a-b);
 for(let i=1;i<parts.length;i++)if(!validPoint(mix(a,b,(parts[i]+parts[i-1])/2)))return false;
 const routeBox=bounds([a,b]),near=blocked.filter(q=>boxOverlap(routeBox,q,off+1));
 for(let j=0;j<=steps;j++){
  const p=mix(a,b,j/steps);
  if(!validPoint(p)||near.some(v=>insideBox(p,v,off+.14)))return false;
  if(off>0&&(!validPoint({x:p.x-dy/len*off,y:p.y+dx/len*off})||!validPoint({x:p.x+dy/len*off,y:p.y-dx/len*off})))return false;
 }
 return true;
}
function plan(s,city,data={},opts={}){
 const p=parkOf(s,data.districtId),z=zones(city).find(v=>v.id===id(data.districtId)),kind=data.kind||(Array.isArray(data.points)?'path':'asset');
 if(!p||!z)return fail('先启用一个已绘制的特别公园区');
 if(!['asset','path'].includes(kind))return fail('请选择设施或步道');
 const poly=z.points,wet=wetOf(opts),land=landOf(opts),ok=allowed(poly,land,wet),obstacles=occupied(opts);
 let item,cost,summary={};
 if(kind==='asset'){
  const def=ASSETS[data.type],a={x:data.x,y:data.y};
  if(!own(ASSETS,data.type)||!valid(a))return fail('请选择公园设施与坐标');
  if(p.assets.length>=LIMIT.perParkAssets||s.parks.reduce((n,q)=>n+q.assets.length,0)>=LIMIT.assets)return fail('现有公园设施达到上限');
  if(data.type==='gate'&&edgeDistance(a,poly)>26)return fail('入口应该靠近公园边界');
  const box=footprint(a,def),corners=boxPoints(box);
  if(!ok(a)||!boxClear(box,ok)||corners.some((q,i)=>!lineClear(q,corners[(i+1)%4],poly,ok)))return fail('设施占地必须位于区内可建设地面');
  if([...obstacles,...p.assets.map(v=>footprint(v,ASSETS[v.type]))].some(v=>boxOverlap(v,box,1.2)))return fail('设施占地与现有建物重叠');
  if(p.paths.some(v=>v.points.slice(1).some((q,i)=>{
   const a=v.points[i],n=Math.ceil(dist(a,q)/3);
   return Array.from({length:n+1},(_,j)=>mix(a,q,j/n)).some(p=>insideBox(p,box,PATHS[v.type].width/2));
  })))return fail('设施不能盖住已有步道，请放在步道旁');
  cost=def.cost;item={districtId:p.districtId,kind,type:data.type,...a,open:true};
 }else{
  const def=PATHS[data.type],points=data.points;
  if(!own(PATHS,data.type)||!Array.isArray(points)||points.length<2||points.length>LIMIT.points||!points.every(valid))return fail('选择步道种类及有效的区内折线');
  if(p.paths.length>=LIMIT.perParkPaths||s.parks.reduce((n,q)=>n+q.paths.length,0)>=LIMIT.paths||
   p.paths.reduce((n,q)=>n+q.points.length-1,0)+points.length-1>LIMIT.segments)return fail('公园步道达到区内上限');
  const distance=length(points),blocks=[...obstacles,...p.assets.map(v=>footprint(v,ASSETS[v.type]))];
  if(distance<5||distance>1500||points.slice(1).some((q,i)=>dist(q,points[i])<.30))return fail('需要长度有效的步道');
  if(points.slice(1).some((q,i)=>!lineClear(points[i],q,poly,ok,def.width,blocks)))return fail('步道须连续位于区内，不可跨水或穿过建筑');
  for(let i=1;i<points.length;i++)for(let j=i+2;j<points.length;j++)if(cut(points[i-1],points[i],points[j-1],points[j]))return fail('步道不应自交；需要交叉口时分两条建设');
  const near=(a,b,c,d)=>dist(a,project(c,d,a))<.30&&dist(b,project(c,d,b))<.30;
  if(p.paths.some(r=>r.points.slice(1).some((d,j)=>points.slice(1).some((b,i)=>near(points[i],b,r.points[j],d)||near(r.points[j],d,points[i],b)))))return fail('已有同线步道，先拆除再改造');
  cost=Math.round(110+distance*def.cost);item={districtId:p.districtId,kind:'path',type:data.type,points:points.map(copy),length:rnd(distance)};
  summary={length:item.length};
 }
 if(Number.isFinite(opts.cash)&&opts.cash<cost)return fail('可用市库资金不足',{cost});
 return {ok:true,cost,districtId:p.districtId,kind:item.kind,type:item.type,item,...summary,...(item.kind==='path'?{path:item}:{asset:item})};
}
function add(s,draft){
 if(!draft?.ok||s.next>=1000000000)return null;
 const p=parkOf(s,draft.districtId);if(!p)return null;
 const pathKind=draft.kind==='path',k=pathKind?'paths':'assets';
 if(p[k].length>=(pathKind?LIMIT.perParkPaths:LIMIT.perParkAssets))return null;
 const v=(pathKind?path:asset)({...draft.item,districtId:p.districtId,id:'Park'+s.next});
 if(!v)return null;
 s.next++;p[k].push(v);return v;
}
function funded(value,budget){return budget<20?0:Math.floor(value*Math.min(1.20,budget/100));}
function graph(p,z,opts){
 const wet=wetOf(opts),land=landOf(opts),ok=allowed(z.points,land,wet),cityBlocks=(opts._parkObstacles||occupied(opts)).filter(q=>boxOverlap(q,bounds(z.points),27));
 const fixtures=p.assets.map(a=>({a,b:footprint(a,ASSETS[a.type])}));
 const blocks=[...cityBlocks,...fixtures.map(a=>a.b)];
 const segment=[],walks=new Map(),nodes=[],edges=[],links=new Map(),ids=new Map(),pairs=new Map();
 for(const line of p.paths){
  const def=PATHS[line.type],capacity=funded(def.capacity,p.budget);
  const active=line.points.slice(1).every((v,i)=>lineClear(line.points[i],v,z.points,ok,def.width,blocks));
  walks.set(line.id,{...line,capacity,visitors:0,active});
  if(active)for(let i=1;i<line.points.length;i++)segment.push({a:line.points[i-1],b:line.points[i],cuts:[0,1],path:line.id,cap:capacity});
 }
 const node=(v)=>{
  const k=Math.round(v.x*20)+':'+Math.round(v.y*20);
  if(!ids.has(k)){nodes.push(v);ids.set(k,nodes.length-1);links.set(nodes.length-1,[]);}
  return ids.get(k);
 };
 for(let i=0;i<segment.length;i++)for(let j=i+1;j<segment.length;j++){
  const a=segment[i],b=segment[j],hit=cut(a.a,a.b,b.a,b.b);
  if(hit){a.cuts.push(hit[0]);b.cuts.push(hit[1]);continue;}
  // Endpoint-on-segment joins also cover straight extensions.
  for(const [v,t] of [[a.a,0],[a.b,1]]){
   const q=project(b.a,b.b,v);if(dist(q,v)<.04){a.cuts.push(t);b.cuts.push(q.t);}
  }
  for(const [v,t] of [[b.a,0],[b.b,1]]){
   const q=project(a.a,a.b,v);if(dist(q,v)<.04){b.cuts.push(t);a.cuts.push(q.t);}
  }
 }
 for(const a of segment){
  const s=a.cuts.sort((a,b)=>a-b).filter((v,j,x)=>!j||v-x[j-1]>.0001);
  for(let i=1;i<s.length;i++){
   const l=mix(a.a,a.b,s[i-1]),r=mix(a.a,a.b,s[i]),x=node(l),y=node(r);
   if(x===y)continue;
   const k=Math.min(x,y)+'/'+Math.max(x,y),same=pairs.get(k);
   if(same){if(a.cap>same.capacity){same.capacity=a.cap;same.left=a.cap;same.path=a.path;}continue;}
   const e={id:edges.length,from:x,to:y,a:l,b:r,path:a.path,metres:dist(l,r),capacity:a.cap,left:a.cap};
   pairs.set(k,e);edges.push(e);links.get(x).push([y,e]);links.get(y).push([x,e]);
  }
 }
 const assets=p.assets.map(a=>{
  const def=ASSETS[a.type],legible=ok(a)&&boxClear(footprint(a,def),ok),near=legible?edges.map(e=>{
   const q=project(e.a,e.b,a);return {e,q,d:dist(q,a)};
  }).filter(v=>v.d<=Math.max(21,Math.min(def.width,def.depth)/2+17)).sort((x,y)=>x.d-y.d||x.e.id-y.e.id):[];
  // Short, dry frontage. Never leap across disconnected parallel segments or
  // reuse a facility as a free bridge through another building.
  const connect=near.find(v=>lineClear(a,v.q,z.points,ok,0,[...cityBlocks,...fixtures.filter(r=>r.a.id!==a.id).map(r=>r.b)]));
  let exterior=false;
  if(a.type==='gate'&&a.open&&legible){
   if(typeof opts.gateAccess==='function')exterior=accessProof(opts.gateAccess(a,p,a));
   else if(typeof opts.roadAccess==='function')exterior=accessProof(opts.roadAccess(a,38));
   else exterior=typeof opts.accessFor==='function'||!!opts.reachability;
  }
  const throughput=legible?funded(def.capacity,p.budget):0;
  return {...a,connect,connected:false,outside:exterior,throughput,left:throughput,visitors:0,active:legible};
 });
 function routeFrom(g){
  if(!g.connect)return ()=>null;
  const start=g.connect,record=new Map(),queue=[];
  function push(node,d,via){
   if((record.get(node)?.d??Infinity)<=d)return;
   const r={node,d,via};record.set(node,r);queue.push(r);
  }
  push(start.e.from,start.d+start.e.metres*start.q.t,[start.e]);push(start.e.to,start.d+start.e.metres*(1-start.q.t),[start.e]);
  while(queue.length){
   queue.sort((a,b)=>b.d-a.d||b.node-a.node);
   const a=queue.pop();if(record.get(a.node)!==a)continue;
   for(const [to,e] of links.get(a.node)||[])push(to,a.d+e.metres,[...a.via,e]);
  }
  return target=>{
   if(!target?.connect)return null;
   const q=target.connect,e=q.e;
   if(e===start.e)return {distance:start.d+q.d+dist(start.q,q.q),edges:[e]};
   const approaches=[[e.from,e.metres*q.q.t],[e.to,e.metres*(1-q.q.t)]];
   let best=null;
   for(const [id,offset] of approaches){
    const r=record.get(id);if(!r)continue;
    const distance=r.d+offset+q.d;
    if(!best||distance<best.distance)best={distance,edges:[...new Set([...r.via,e])]};
   }
   return best;
  };
 }
 const gates=assets.filter(a=>a.type==='gate'),paths=[...walks.values()],design=[];
 for(const g of gates){
  const from=routeFrom(g),able=g.active&&g.open&&g.outside&&g.throughput>0;
  g.connected=able&&!!g.connect;
  if(!g.connected)continue;
  const choices=[];
  for(const b of assets){
   if(b.type==='gate'||!b.active||!b.throughput)continue;
   const r=from(b);if(!r||r.distance>590)continue;
   b.connected=true;
   if(ASSETS[b.type].kind==='attraction')choices.push({asset:b,route:r});
  }
  design.push({gate:g,choices,amenities:assets.filter(a=>a.type==='restroom'||a.type==='vendor').filter(a=>a.active&&a.throughput&&from(a))});
 }
 return {assets,paths,gates,design,walks,edges};
}
function homes(city,opts){
 const x=[],group=new Set();
 for(const a of arr(opts.homes??city?.civic?.lots).slice(0,LIMIT.lots)){
  const k=id(a?.id);
  if(!k||group.has(k)||!valid(a)||a.type&&a.type!=='residential'||Number.isFinite(a.level)&&a.level<1)continue;
  const pop=int(a.occupants??a.population,0,0,420);if(!pop)continue;
  group.add(k);
  x.push({...a,id:k,pop,visits:Math.max(1,Math.floor(pop*.53)),payroll:num(opts.labor?.byHome?.[k]?.payroll,num(a.payroll))});
 }
 return x;
}
function measured(home,gate,model,opts){
 const source=typeof opts.accessFor==='function'?opts.accessFor(home,gate,model):
  opts.reachability?.[home.id]?.[gate.id];
 if(source===false||source==null||source?.ok===false)return Infinity;
 const d=source===true?dist(home,gate):num(typeof source==='number'?source:source.distance??source.metres??source.meters,Infinity);
 return d>=0&&d<=720?d:Infinity;
}
function idea(a){
 const counts={};for(const v of a){
  const t=ASSETS[v.type].theme;if(t&&v.connected)counts[t]=(counts[t]||0)+v.throughput;
 }
 const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 if(!sorted.length)return 'empty';
 if(sorted.length>=3||sorted.length>1&&sorted[1][1]>=sorted[0][1]*.78)return 'mixed';
 return sorted[0][0];
}
function hash(v){
 let h=2166136261;for(const x of v)h=Math.imul(h^x.charCodeAt(0),16777619);
 return (h>>>0)/4294967296;
}
function evaluate(s,city,opts={}){
 const month=cal(city?.month),params=zones(city),districts={},benefitsByLot={},models=[],q={...opts,_parkObstacles:occupied(opts)};
 for(const p of s.parks){
  const z=params.find(x=>x.id===p.districtId);if(!z)continue;
  const f=graph(p,z,q),a=f.assets;
  const served=a.filter(x=>x.connected&&ASSETS[x.type].kind==='attraction'),b=bounds(z.points);
  const world={...f,park:p,districtId:p.districtId,focus:{x:(b.left+b.right)/2,y:(b.top+b.bottom)/2},points:z.points,area:num(z.area,(b.right-b.left)*(b.bottom-b.top)),
   visitors:0,demand:0,waiting:0,enjoy:0,income:0,connectedGates:f.design.filter(x=>x.choices.length).length,connectedAttractions:served.length,feesLost:0};
  const openings=new Map();
  for(const g of f.design)if(g.choices.length){
   const e=g.gate.connect.e;openings.set(e,Math.min(e.capacity,(openings.get(e)||0)+g.gate.throughput));
  }
  world.capacity=Math.min([...openings.values()].reduce((n,v)=>n+v,0),served.reduce((n,a)=>n+a.throughput,0));
  world.expense=Math.round((75+world.area*.038+a.reduce((n,b)=>n+ASSETS[b.type].monthly,0)+f.paths.reduce((n,v)=>n+PATHS[v.type].monthly*v.length,0))*(.20+.80*p.budget/100));
  world.theme=idea(a);
  world.groups=new Set(served.map(v=>v.type)).size;
  models.push(world);
 }
 const done=homes(city,opts).map(h=>({h,key:hash(s.seed+'|'+h.id+'|'+month)})).sort((a,b)=>a.key-b.key||a.h.id.localeCompare(b.h.id));
 let visitorsMax=LIMIT.visitors;
 for(const {h} of done){
  if(visitorsMax<=0)break;
  const preferences=[];
  for(const m of models){
   if(!m.capacity||dist(h,m.focus)>1080)continue;
   const p=m.park,monthlyIncome=h.payroll/Math.max(1,h.pop),afford=clamp(8+monthlyIncome*.09,6,22);
   // Fees affect actual weighted visits and competition, not building counts.
   const draw=clamp(1-p.fee/(afford+16),.12,1);
   for(const g of m.design){
    if(!g.choices.length||dist(h,g.gate)>720)continue;
    const ext=measured(h,g.gate,p,opts);if(!Number.isFinite(ext))continue;
    const toilets=g.amenities.some(a=>a.type==='restroom'),vendor=g.amenities.some(a=>a.type==='vendor');
    for(const a of g.choices){
     const d=ASSETS[a.asset.type],bonus=(m.groups>1?.035:0)+(toilets?.065:0)+(vendor?.026:0);
     const enjoyment=clamp(d.enjoyment+bonus-p.fee*.009-(ext+a.route.distance)/4450,.18,1);
     const score=enjoyment-(ext+a.route.distance*.72)/1190-(1-draw)*.32;
     preferences.push({m,g,a,draw,enjoyment,score,ext,toilets});
    }
   }
  }
  preferences.sort((a,b)=>b.score-a.score||a.m.districtId.localeCompare(b.m.districtId)||a.g.gate.id.localeCompare(b.g.gate.id)||a.a.asset.id.localeCompare(b.a.asset.id));
  if(!preferences.length)continue;
  let left=Math.min(visitorsMax,h.visits),got=0,benefit=0;
  const offered=left,seenMove=new Map();
  for(const q of preferences){
   if(!left)break;
   const {m,g,a,draw,enjoyment,ext}=q;
   const old=seenMove.get(m.districtId)||0,affordable=Math.max(0,Math.ceil(offered*draw)-old);
   const capacity=a.route.edges.reduce((n,e)=>Math.min(n,e.left),Math.min(g.gate.left,a.asset.left));
   const n=Math.max(0,Math.min(left,affordable,capacity));
   if(!n)continue;
   g.gate.left-=n;g.gate.visitors+=n;a.asset.left-=n;a.asset.visitors+=n;
   for(const e of a.route.edges){e.left-=n;const path=m.walks.get(e.path);if(path)path.visitors=Math.max(path.visitors,e.capacity-e.left);}
   m.visitors+=n;m.demand+=n;m.income+=m.park.fee*n;
   const squeeze=clamp(Math.max(1-g.gate.left/Math.max(1,g.gate.throughput),1-a.asset.left/Math.max(1,a.asset.throughput)));
   const experience=clamp(enjoyment-.19*Math.max(0,(squeeze-.56)/.44),.14,1);
   m.enjoy+=experience*n;
   const vendor=g.amenities.filter(b=>b.type==='vendor'&&b.left>0).sort((a,b)=>b.left-a.left)[0];
   if(vendor){const used=Math.min(vendor.left,Math.floor(n*.36));vendor.left-=used;vendor.visitors+=used;m.income+=used*3;}
   const outhouse=g.amenities.find(b=>b.type==='restroom'&&b.left>0);
   if(outhouse){const used=Math.min(outhouse.left,n);outhouse.left-=used;outhouse.visitors+=used;}
   seenMove.set(m.districtId,old+n);benefit+=experience*n*(1-ext/1050);
   left-=n;got+=n;visitorsMax-=n;
  }
  if(left){
   const m=preferences[0].m;m.waiting+=left;m.demand+=left;
   if(preferences[0].draw<.77)m.feesLost+=left;
  }
  if(got)Object.defineProperty(benefitsByLot,h.id,{value:rnd(clamp(benefit/Math.max(1,h.visits))),enumerable:true});
 }
 const sum={...totals(),parks:models.length};let enjoyment=0,crowding=0;
 for(const m of models){
  const {park:p,visitors,demand,capacity}=m;
  const safety=visitors?clamp(.64+.17*Math.min(1,p.budget/100)+.13*Number(m.assets.some(a=>a.type==='restroom'&&a.connected))-
   .22*clamp(m.waiting/Math.max(1,demand))):0;
  const congest=clamp(Math.max(m.waiting/Math.max(1,demand),m.edges.some(e=>e.capacity>0)?Math.max(...m.edges.map(e=>e.capacity?(e.capacity-e.left)/e.capacity:0))*.65:0));
  const enjoy=visitors?clamp(m.enjoy/visitors*(.78+.22*safety)):0;
  const band=visitors>=140&&m.groups>=4&&enjoy>=.6?3:visitors>=52&&m.groups>=2&&enjoy>=.54?2:visitors?1:0;
  const reason=p.budget<20?'funding':!m.gates.some(g=>g.open)?'noGate':!m.gates.some(g=>g.outside)?'street':!m.gates.some(g=>g.connected)?'path':
   !m.connectedAttractions?'unbuilt':m.waiting>0&&m.feesLost>=m.waiting*.75?'cost':m.waiting>0&&congest>.30?'crowd':'operating';
  const row=districtRow({...m,id:m.districtId,budget:p.budget,fee:p.fee,band,park:enjoy,active:capacity>0,theme:m.theme,reason,enjoyment:enjoy,safety,crowding:congest});
  districts[row.id]=row;
  for(const k of qtyKeys)if(k!=='band')sum[k]+=row[k];
  enjoyment+=row.enjoyment*visitors;crowding+=row.crowding*visitors;
 }
 sum.enjoyment=sum.visitors?enjoyment/sum.visitors:0;sum.crowding=sum.visitors?crowding/sum.visitors:0;
 return {month,districts,totals:totals(sum),benefitsByLot};
}
function advance(s,city,opts={}){
 const month=cal(city?.month);
 if(month<=s.lastMonth)return {...report(s),noOp:true};
 const fresh=evaluate(s,city,opts);
 s.lastMonth=month;s.last=fresh;s.history.push(historic({month,...fresh.totals}));s.history=s.history.slice(-LIMIT.history);
 return report(s);
}
function report(s,city,opts={}){
 const empty={month:s.lastMonth,districts:{},totals:totals(),benefitsByLot:{}};
 if(city)return {...evaluate(s,city,opts),history:s.history,parks:s.parks};
 return {...(s.last||empty),history:s.history,parks:s.parks};
}
function sample(r,lot){return clamp(num(r?.benefitsByLot?.[id(typeof lot==='object'?lot?.id:lot)]));}
function merge(base,parks){
 if(base&&!Object.keys(parks?.districts||{}).length)return base;
 const districts={...(base?.districts||{})},t={...(base?.total||base?.totals||{})};
 for(const [id,r] of Object.entries(parks?.districts||{})){
  const old=districts[id];
  if(old?.type==='park'){
   for(const k of ['jobs','staff','income','expense','net','park'])t[k]=num(t[k])-num(old[k]);
  }
  const newRow={...old,...r,reason:REASONS[r.reason]||r.reason,park:0,plannedPark:true,education:0,airportCapacity:0,production:0,jobs:0,staff:0};
  districts[id]=newRow;
  for(const k of ['income','expense','net'])t[k]=num(t[k])+newRow[k];
 }
 return {...base,districts,total:t,totals:t,airportBoost:base?.airportBoost||{}};
}
return {ASSETS,PATHS,THEMES,BANDS,REASONS,LIMIT,create,normalize,adopt,release,plan,add,remove,setBudget,setFee,setGate,evaluate,advance,tick:advance,report,sample,merge};
});
