/* City Blueprint: contiguous title acquisition and evidence-funded branching research. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object')module.exports=api;else root.Progression=api;
})(globalThis,function(){
'use strict';
const TILE=200,COLS=6,ROWS=4,WIDTH=COLS*TILE,HEIGHT=ROWS*TILE;
const TECH={
 learning:{name:'技术教育与研究',branch:'civic',cost:11,requires:[],features:['vocational','research'],description:'开办职业技术学校与科研院所。'},
 surveying:{name:'工程测绘',branch:'planning',cost:9,requires:[],features:['earthworks'],effect:{earthworkCost:.9},description:'开放付费整地，改良基础测绘。'},
 arterials:{name:'主干路与信号',branch:'transport',cost:10,requires:[],features:['arterial','signals'],description:'开放大断面道路与可调信号。'},
 academy:{name:'高等教育',branch:'civic',cost:18,requires:['learning'],features:['university','universityArea'],description:'开放大学及大学特别区。'},
 care:{name:'综合公共照护',branch:'civic',cost:16,requires:['learning'],features:['hospital','elder','crematorium'],effect:{careUpkeep:.94},description:'扩建综合医院、养老院和纪念服务。'},
 structures:{name:'立体工程',branch:'transport',cost:22,requires:['arterials','surveying'],features:['bridge','tunnel','highway'],description:'开放高架、隧道和高速，仍须满足实际纵坡与净空。'},
 transit:{name:'地面公交优先',branch:'transport',cost:16,requires:['arterials'],features:['tram','busLane'],effect:{transitCost:.94},description:'开放有轨电车和专用公交道。'},
 rail:{name:'城市轨道',branch:'transport',cost:27,requires:['transit'],features:['metro','rail'],description:'开放地铁和客运铁路。'},
 logistics:{name:'区域货运',branch:'economy',cost:17,requires:['arterials'],features:['cargoRail','cargoPort','cargoYard'],description:'开放货运铁路、港口和铁路货场。'},
 resources:{name:'产业链规划',branch:'economy',cost:13,requires:['surveying'],features:['industryProcessor','industryStorage'],effect:{industryCost:.95},description:'开放专项产业加工和仓配设施。'},
 extractive:{name:'深层资源开发',branch:'economy',cost:25,requires:['resources','logistics'],features:['mine','oil','industryIntensive'],description:'开放矿井、油井和集约生产政策，不会重置自然资源。'},
 aviation:{name:'区域航空',branch:'economy',cost:41,requires:['logistics','rail'],features:['airport','cargoAirport'],description:'开放客货航空设施。'},
 metropolitan:{name:'区域土地统筹',branch:'planning',cost:23,requires:['surveying','arterials'],features:[],effect:{landCost:.84},description:'后续相邻地皮购买价格降低 16%。'}
};
const FEATURES=Object.fromEntries(Object.entries(TECH).flatMap(([k,t])=>t.features.map(x=>[x,k])));
const MILESTONES={
 settlement:{name:'市镇开张',points:16,description:'至少到第 2 月，已有 120 米普通道路与 18 位住户。'},
 service:{name:'基本水电',points:9,description:'至少到第 2 月，至少有 18 位住户实际获得稳定的供水和供电。'},
 commerce:{name:'劳动市场',points:12,description:'至少到第 2 月，至少 3 宗营业地块和 15 名实际匹配员工。'},
 education:{name:'第一批学员',points:12,description:'至少到第 2 月，同月有 10 名在读学生。'},
 transit:{name:'公交开行',points:10,description:'至少到第 2 月，有开放的公交环线和至少 2 个不同站。'}
};
const START={
 river:['P0-1','P1-1','P2-1','P1-2','P2-2'],
 coast:['P0-1','P1-1','P2-1','P1-2'],
 hills:['P0-2','P1-2','P2-2','P1-1'],
 alpine:['P0-2','P1-2','P1-1']
};
const BRANCHES={civic:'市政与教育',planning:'勘测与土地',transport:'城市交通',economy:'资源与贸易'};
const ALL=Array.from({length:ROWS*COLS},(_,k)=>'P'+k%COLS+'-'+Math.floor(k/COLS));
const KINDS=['point','circle','path','polygon','rectangle'];
const TECHIDS=Object.keys(TECH),MILEIDS=Object.keys(MILESTONES);
const own=(o,k)=>Object.hasOwn(o,k),arr=v=>Array.isArray(v)?v:[],num=(v,d=0)=>Number.isFinite(v)?v:d,
 clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),int=(v,d=0,a=0,b=1e9)=>Math.floor(clamp(num(v,d),a,b));
const pvalid=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y),inside=v=>pvalid(v)&&v.x>=0&&v.y>=0&&v.x<=WIDTH&&v.y<=HEIGHT;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),round=(n,scale=1000)=>Math.round(n*scale)/scale;
const parse=v=>{const a=/^P([0-5])-([0-3])$/.exec(String(v));return a?[+a[1],+a[2]]:null;};
const fail=(reason,info={})=>({ok:false,reason,...info});
function config(o={}){
 if(typeof o==='string')o={mapId:o};
 return {mapId:own(START,o.mapId)?o.mapId:'river',sandbox:o.sandbox===true,legacy:o.legacy===true};
}
function create(o={}){
 const c=config(o),all=c.sandbox||c.legacy;
 return {version:1,mapId:c.mapId,sandbox:c.sandbox,legacy:c.legacy,revision:0,lastMonth:0,
  owned:all?ALL.slice():START[c.mapId].slice().sort(tileSort),unlocked:all?TECHIDS.slice():[],claimed:[],spent:0,landSpent:0,history:[]};
}
function historyRow(v){
 if(!v||!['research','land','milestone'].includes(v.kind))return null;
 const k=v.kind==='land'?!!parse(v.id):v.kind==='research'?own(TECH,v.id):own(MILESTONES,v.id);
 if(!k)return null;
 return {kind:v.kind,id:v.id,month:int(v.month),cost:int(v.cost)};
}
function contiguous(owned,initial){
 const accepted=new Set(initial),remaining=new Set(owned);
 let changed=true;
 while(changed){
  changed=false;
  for(const id of remaining){
   if(accepted.has(id)||adjacent(id,accepted)){accepted.add(id);remaining.delete(id);changed=true;}
  }
 }
 return [...accepted].sort(tileSort);
}
function normalize(raw,o={}){
 const supplied=typeof o==='string'?{mapId:o}:o||{},cfg=config({
  mapId:supplied.mapId??raw?.mapId,sandbox:supplied.sandbox??raw?.sandbox,legacy:supplied.legacy??raw?.legacy
 });
 const s=create(cfg);
 if(!raw||typeof raw!=='object')return s;
 if(raw.version!==1||raw.mapId&&raw.mapId!==s.mapId||typeof raw.sandbox==='boolean'&&raw.sandbox!==s.sandbox)return s;
 s.revision=int(raw.revision);s.lastMonth=int(raw.lastMonth);s.landSpent=int(raw.landSpent);
 s.claimed=MILEIDS.filter(k=>arr(raw.claimed).includes(k));
 if(!s.sandbox&&!s.legacy){
  s.owned=contiguous(arr(raw.owned).slice(0,24).filter(parse),START[s.mapId]);
  const src=new Set(arr(raw.unlocked).slice(0,TECHIDS.length));
  s.unlocked=[];
  for(const k of TECHIDS)if(src.has(k)&&TECH[k].requires.every(d=>s.unlocked.includes(d)))s.unlocked.push(k);
  s.spent=s.unlocked.reduce((n,k)=>n+TECH[k].cost,0);
 }
 s.history=arr(raw.history).slice(-64).map(historyRow).filter(Boolean);
 return s;
}
function tileSort(a,b){return ALL.indexOf(a)-ALL.indexOf(b);}
function lookup(v){
 const k=parse(v);if(!k)return null;
 const [i,j]=k,x=i*TILE,y=j*TILE;
 return {id:'P'+i+'-'+j,i,j,x,y,width:TILE,height:TILE,area:TILE*TILE,x0:x,y0:y,x1:x+TILE,y1:y+TILE};
}
function tileAt(s,p){
 if(!inside(p))return null;
 return 'P'+Math.min(COLS-1,Math.floor(p.x/TILE))+'-'+Math.min(ROWS-1,Math.floor(p.y/TILE));
}
function adjacent(value,values){
 const k=parse(value);if(!k)return false;
 const [x,y]=k;
 return [[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>values.has('P'+(x+a)+'-'+(y+b)));
}
function effects(s){
 const out={landCost:1,earthworkCost:1,transitCost:1,industryCost:1,careUpkeep:1};
 for(const k of arr(s?.unlocked)){
  if(!own(TECH,k))continue;
  for(const [x,v] of Object.entries(TECH[k].effect||{}))out[x]=round(out[x]*v,10000);
 }
 return out;
}
function watery(map,opts,p){
 if(typeof opts.water==='function')return !!opts.water(p);
 if(typeof map?.water==='function')return !!map.water(p);
 return typeof map?.river==='function'&&typeof map?.width==='function'?Math.abs(p.x-map.river(p.y))<map.width(p.y):false;
}
function protectedAt(map,opts,p){
 if(typeof opts.protected==='function')return !!opts.protected(p);
 if(typeof map?.protected==='function')return !!map.protected(p);
 return typeof map?.ridge==='function'&&map.ridge(p)>.64;
}
function surveyed(s,map,value,opts){
 const t=lookup(value);if(!t)return null;
 let wet=0,protectedCount=0,land=0,border=0,steep=0,prevWet=false,total=0;
 const n=8,side=t.width/n,owned=new Set(s.owned);
 for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const p={x:t.x0+(i+.5)*side,y:t.y0+(j+.5)*side};
  const w=watery(map,opts,p),reserve=!w&&protectedAt(map,opts,p);
  if(i>0&&w!==prevWet)border++;
  prevWet=w;total++;
  if(w)wet++;
  else if(reserve)protectedCount++;
  else {
   land++;
   const e=map?.elevation;
   if(typeof e==='function'){
    const g=Math.hypot((num(e.call(map,{x:p.x+8,y:p.y}))-num(e.call(map,{x:p.x-8,y:p.y})))/16,
      (num(e.call(map,{x:p.x,y:p.y+8}))-num(e.call(map,{x:p.x,y:p.y-8})))/16);
    if(g>.16)steep++;
   }
  }
 }
 const ratio=land/total,waterRatio=wet/total,p=protectedCount/total,steepRatio=steep/total;
 const kind=ratio<.12&&waterRatio>=.46?'water':'land',ownedTitle=owned.has(value),contiguous=adjacent(value,owned);
 const purchasable=ownedTitle||ratio>=.12||kind==='water';
 const fixed=2700+t.area*.106+t.area*ratio*.136+border*98+t.area*steepRatio*.025;
 const premium=Math.min(.52,Math.max(0,s.owned.length-START[s.mapId].length)*.034);
 const cost=Math.ceil((kind==='water'?(fixed*.61+800):fixed)*(1+premium)*effects(s).landCost/50)*50;
 return {...t,name:'地皮 '+(t.i+1)+'–'+(t.j+1),owned:ownedTitle,contiguous,adjacent:contiguous,purchasable,kind,
  landRatio:round(ratio),waterRatio:round(waterRatio),protectedRatio:round(p),steepRatio:round(steepRatio),
  buildableArea:Math.round(t.area*ratio),selectable:!ownedTitle&&purchasable&&contiguous,
  cost:ownedTitle?0:cost,affordable:ownedTitle||Number.isFinite(opts.cash)&&opts.cash>=cost};
}
function tiles(s,map,opts={}){return ALL.map(k=>surveyed(s,map,k,opts));}
function sign(...data){
 let h=2166136261;
 for(const c of data.join('|'))h=Math.imul(h^c.charCodeAt(0),16777619);
 return (h>>>0).toString(36);
}
function planLand(s,map,value,opts={}){
 if(!s)return fail('请先读取城市产权记录');
 const k=typeof value==='string'?value:value?.id||tileAt(s,value),t=surveyed(s,map,k,opts);
 if(!t)return fail('未找到此地皮');
 if(t.owned)return fail('这块地皮已经属于本市',{tile:t});
 if(!t.purchasable)return fail('保护区地皮不能购买',{tile:t,cost:t.cost});
 if(!t.contiguous)return fail('只能购买与本市共享边界的相邻地皮，对角不算',{tile:t,cost:t.cost});
 if(!t.affordable)return fail('市库不足，不能透支购买地皮',{tile:t,cost:t.cost});
 return {ok:true,tile:t,id:t.id,cost:t.cost,revision:s.revision,signature:sign(s.mapId,s.revision,t.id,t.cost,s.owned.join(','))};
}
function applyLand(s,v,opts={}){
 const id=v?.id,k=parse(id);
 if(!s||!v?.ok||!k||v.revision!==s.revision||s.owned.includes(id)||!adjacent(id,new Set(s.owned))||
  !Number.isFinite(opts.cash)||!Number.isSafeInteger(v.cost)||v.cost<=0||opts.cash<v.cost||
  v.signature!==sign(s.mapId,s.revision,id,v.cost,s.owned.join(',')))return false;
 s.owned.push(id);s.owned.sort(tileSort);s.landSpent+=v.cost;s.revision++;
 s.history.push({kind:'land',id,cost:v.cost,month:int(opts.month,s.lastMonth)});s.history=s.history.slice(-64);
 return true;
}
function checkFeature(s,feature){
 if(feature==='sharedRail'){
  const ok=checkFeature(s,'rail').ok||checkFeature(s,'cargoRail').ok;
  return ok?{ok:true,feature}:fail('先研究「城市轨道」或「区域货运」才能建设共用铁路',{feature});
 }
 const k=own(FEATURES,feature)?FEATURES[feature]:'';
 if(!k||s?.sandbox||arr(s?.unlocked).includes(k))return {ok:true,feature,tech:k||null};
 return fail('先研究「'+TECH[k].name+'」才能建设此项目',{feature,tech:k});
}
function segmentRect(a,b,r){
 const dx=b.x-a.x,dy=b.y-a.y,terms=[[-dx,a.x-r.x0],[dx,r.x1-a.x],[-dy,a.y-r.y0],[dy,r.y1-a.y]];
 let lo=0,hi=1;
 for(const [p,q] of terms){
  if(Math.abs(p)<1e-9){if(q<0)return false;continue;}
  const v=q/p;
  if(p<0)lo=Math.max(lo,v);else hi=Math.min(hi,v);
  if(lo>hi+1e-9)return false;
 }
 return true;
}
function pointPoly(p,poly){
 let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
function box(points){
 return {x0:Math.min(...points.map(p=>p.x)),x1:Math.max(...points.map(p=>p.x)),y0:Math.min(...points.map(p=>p.y)),y1:Math.max(...points.map(p=>p.y))};
}
function overlap(a,b){return a.x0<=b.x1&&a.x1>=b.x0&&a.y0<=b.y1&&a.y1>=b.y0;}
const rect=(p,w,h)=>[{x:p.x-w/2,y:p.y-h/2},{x:p.x+w/2,y:p.y-h/2},{x:p.x+w/2,y:p.y+h/2},{x:p.x-w/2,y:p.y+h/2}];
function geometry(shape,opts={}){
 if(!shape)return null;
 const raw=Array.isArray(shape)?shape:shape.points||shape.footprint||shape.polygon||shape.poly||shape.path;
 const typed=opts.kind||shape.kind||shape.type;
 let kind=KINDS.includes(typed)?typed:'';
 if(!kind&&Array.isArray(raw))kind=shape.closed||shape.polygon||shape.footprint||typed==='footprint'?'polygon':'path';
 if(!kind)kind=Number.isFinite(shape.radius)?'circle':Number.isFinite(shape.width)&&Number.isFinite(shape.depth??shape.height)?'rectangle':'point';
 if(kind==='point')return inside(shape)?{kind,p:shape}:null;
 if(kind==='circle'){
  const r=clamp(num(shape.radius,0),0,1200),p={x:shape.x,y:shape.y};
  if(!inside(p))return null;
  if(r<=0)return {kind:'point',p};
  const b={x0:p.x-r,x1:p.x+r,y0:p.y-r,y1:p.y+r};
  if(opts.allowMapEdge!==true&&(b.x0<0||b.y0<0||b.x1>WIDTH||b.y1>HEIGHT))return null;
  return {kind,p,r,b};
 }
 const points=kind==='rectangle'?rect(shape,clamp(num(shape.width),.01,800),clamp(num(shape.depth??shape.height),.01,800)):raw;
 if(!Array.isArray(points)||points.length<(kind==='path'?2:3)||points.length>1200||!points.every(inside))return null;
 const b=box(points),radius=kind==='path'?clamp(num(shape.width,num(opts.width)),0,160)/2:0;
 if(radius){b.x0-=radius;b.x1+=radius;b.y0-=radius;b.y1+=radius;}
 return {kind:kind==='rectangle'?'polygon':kind,points,b,radius};
}
function hit(g,t){
 if(!overlap(g.b,t))return false;
 const q=.0005,r={x0:t.x0+q,y0:t.y0+q,x1:t.x1-q,y1:t.y1-q};
 if(g.kind==='circle'){
  const x=clamp(g.p.x,r.x0,r.x1),y=clamp(g.p.y,r.y0,r.y1);
  return Math.hypot(g.p.x-x,g.p.y-y)<g.r;
 }
 if(g.kind==='path'){
  const p=g.radius;
  r.x0-=p;r.y0-=p;r.x1+=p;r.y1+=p;
  for(let i=1;i<g.points.length;i++)if(segmentRect(g.points[i-1],g.points[i],r))return true;
  return false;
 }
 for(let i=0;i<g.points.length;i++)if(segmentRect(g.points[i],g.points[(i+1)%g.points.length],r))return true;
 return pointPoly({x:(r.x0+r.x1)/2,y:(r.y0+r.y1)/2},g.points);
}
function checkConstruction(s,shape,opts={}){
 const feature=opts.feature||shape?.feature;
 const tech=checkFeature(s,feature);
 if(!tech.ok)return tech;
 const g=geometry(shape,opts);
 if(!g)return fail('施工图形无效或超出地图',{feature,tiles:[],locked:[]});
 const owned=new Set(arr(s?.owned));
 let touched;
 if(g.kind==='point')touched=[tileAt(s,g.p)];
 else touched=ALL.filter(k=>hit(g,lookup(k)));
 // Intersections sample parcel interiors. Explicitly handle centerlines on
 // a legal coordinate boundary using the same half-open rule as point picks.
 if(g.kind==='path'){
  const more=new Set(touched);
  for(let i=1;i<g.points.length;i++){
   const a=g.points[i-1],b=g.points[i],dx=b.x-a.x,dy=b.y-a.y,parts=[0,1];
   if(Math.abs(dx)>.0001)for(let k=TILE;k<WIDTH;k+=TILE){const u=(k-a.x)/dx;if(u>0&&u<1)parts.push(u);}
   if(Math.abs(dy)>.0001)for(let k=TILE;k<HEIGHT;k+=TILE){const u=(k-a.y)/dy;if(u>0&&u<1)parts.push(u);}
   parts.sort((a,b)=>a-b);
   for(let j=1;j<parts.length;j++){
    const f=(parts[j-1]+parts[j])/2;
    more.add(tileAt(s,{x:a.x+dx*f,y:a.y+dy*f}));
   }
  }
  if(!more.size)more.add(tileAt(s,g.points[0]));
  touched=[...more].filter(Boolean).sort(tileSort);
 }
 const locked=s?.sandbox?[]:touched.filter(t=>!owned.has(t));
 if(locked.length)return fail('施工经过未购买的地皮：'+locked.join('、'),{feature,tiles:touched,locked});
 return {ok:true,feature,tiles:touched,locked:[]};
}
function pointsTotal(opts){
 return int(typeof opts==='number'?opts:opts?.points??opts?.social?.points,0);
}
function starter(s){return arr(s?.claimed).reduce((n,k)=>n+(MILESTONES[k]?.points||0),0);}
function available(s,opts){return Math.max(0,starter(s)+pointsTotal(opts)-s.spent);}
function report(s,opts={}){
 const v=available(s,opts),unlocked=new Set(s.unlocked),research=Object.fromEntries(TECHIDS.map(k=>{
  const d=TECH[k],done=unlocked.has(k),missing=d.requires.filter(p=>!unlocked.has(p));
  return [k,{id:k,...d,unlocked:done,missing,affordable:v>=d.cost,ready:!done&&!missing.length&&v>=d.cost}];
 }));
 return {month:s.lastMonth,mapId:s.mapId,sandbox:s.sandbox,legacy:s.legacy,owned:[...s.owned],ownedCount:s.owned.length,totalTiles:ALL.length,
  unlocked:[...s.unlocked],claimed:[...s.claimed],research,points:pointsTotal(opts),starterPoints:starter(s),spent:s.spent,available:v,
  landSpent:s.landSpent,effects:effects(s),history:s.history};
}
function planResearch(s,k,opts={}){
 if(!s||!own(TECH,k))return fail('未找到所选科技');
 const d=TECH[k],bank=available(s,opts);
 if(s.unlocked.includes(k))return fail('这项科技已经解锁',{id:k,cost:d.cost,available:bank});
 const missing=d.requires.filter(x=>!s.unlocked.includes(x));
 if(missing.length)return fail('先完成前置：'+missing.map(x=>TECH[x].name).join('、'),{id:k,cost:d.cost,available:bank,missing});
 if(bank<d.cost)return fail('研究点不足',{id:k,cost:d.cost,available:bank});
 return {ok:true,id:k,cost:d.cost,available:bank,revision:s.revision,signature:sign(s.mapId,s.revision,k,d.cost,s.unlocked.join(','))};
}
function applyResearch(s,v,opts={}){
 if(!s||!v?.ok||v.revision!==s.revision||!own(TECH,v.id))return false;
 const d=planResearch(s,v.id,opts);
 if(!d.ok||d.cost!==v.cost||d.signature!==v.signature)return false;
 s.unlocked.push(v.id);s.unlocked.sort((a,b)=>TECHIDS.indexOf(a)-TECHIDS.indexOf(b));s.spent+=v.cost;s.revision++;
 s.history.push({kind:'research',id:v.id,month:int(opts?.month,s.lastMonth),cost:v.cost});s.history=s.history.slice(-64);
 return true;
}
function evidence(city,month,{network,civicMetrics}={}){
 if(month<2)return new Set();
 const ready=new Set(),lots=arr(city.civic?.lots),net=network||city.network||{};
 const population=lots.filter(l=>l?.type==='residential'&&num(l.level)>0).reduce((n,l)=>n+Math.max(0,int(l.occupants)),0);
 const roads=arr(net.edges).filter(e=>e?.kind==='road').reduce((n,e)=>{
  const geometry=arr(e.pts);
  if(geometry.length<2||!geometry.every(pvalid))return n;
  let metres=0;for(let i=1;i<geometry.length;i++)metres+=dist(geometry[i-1],geometry[i]);
  return n+metres;
 },0);
 if(population>=18&&roads>=120)ready.add('settlement');
 const publicTypes=new Set(arr(city.civic?.services).filter(v=>pvalid(v)).map(v=>v.type));
 const supplied=civicMetrics?.lots?lots.reduce((n,l)=>{
  const m=civicMetrics.lots[l.id];
  return n+(l.type==='residential'&&l.level>0&&m?.roadId&&m.water>=.25&&m.power>=.25?int(l.occupants):0);
 },0):0;
 if(supplied>=18||(!civicMetrics&&population>=18&&publicTypes.has('water')&&publicTypes.has('power')))ready.add('service');
 const employers=lots.filter(l=>l?.type!=='residential'&&num(l.level)>0&&num(l.occupants)>0).length;
 const labor=city.labor?.last;
 if(employers>=3&&labor?.month===month&&num(labor.totals?.employed)>=15)ready.add('commerce');
 const edu=city.education?.last;
 if(edu?.month===month&&num(edu.students?.enrolled)>=10)ready.add('education');
 if(arr(net.buses).some(v=>v&&!v.broken&&new Set(arr(v.stops)).size>=2&&arr(v.path).length>=2))ready.add('transit');
 return ready;
}
function advance(s,city,observed){
 const month=int(city?.month,1,1);
 if(month<=s.lastMonth)return {...report(s,{points:city.social?.points}),awarded:[],noOp:true};
 s.lastMonth=month;
 const possible=evidence(city,month,observed),awarded=[];
 for(const k of MILEIDS){
  if(!possible.has(k)||s.claimed.includes(k))continue;
  s.claimed.push(k);awarded.push({id:k,...MILESTONES[k]});
  s.history.push({kind:'milestone',id:k,month,cost:0});
 }
 s.claimed.sort((a,b)=>MILEIDS.indexOf(a)-MILEIDS.indexOf(b));
 if(awarded.length)s.revision++;
 s.history=s.history.slice(-64);
 return {...report(s,{points:city.social?.points}),awarded};
}
return {TILE,COLS,ROWS,WIDTH,HEIGHT,TECH,FEATURES,MILESTONES,BRANCHES,START,create,normalize,tileAt,tiles,planLand,applyLand,checkConstruction,checkFeature,effects,advance,report,planResearch,applyResearch};
});
