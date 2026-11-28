/* City Blueprint terrain: elevations/distances in metres, work in cubic metres. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object')module.exports=api;else root.TerrainWork=api;
})(globalThis,function(){
'use strict';
const GRID=8,AREA=GRID*GRID;
const LIMIT={nodes:28000,changes:720,segments:17000,contourCells:16000,x:2000,y:1400,min:-42,max:140,delta:74,
 radiusMin:16,radiusMax:96,amountMax:26};
const TOOLS={
 raise:{name:'填土抬高',color:'#e9a07b'},lower:{name:'挖土降低',color:'#82b8dc'},
 level:{name:'整理成平台',color:'#e9cd82'},smooth:{name:'平滑坡面',color:'#8ad7ad'}
};
const PRICES={base:240,cut:.48,fill:.69};
const REASONS={water:'必须保留河道和水岸缓冲',protected:'保护山脊或保留区不能施工',road:'不能改动既有道路与轨道的基础',
 building:'不能改动已建地块或设施基础',edge:'超出可施工地图范围',limit:'该地图的地形编辑节点已达上限',
 level:'没有达到可结算的高度变化',cash:'市库不足'};
const blockedCounts=()=>({water:0,protected:0,road:0,building:0,edge:0,limit:0});
const number=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rounded=(v,d=2)=>Math.round(v*10**d)/10**d,point=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y),
 own=(v,k)=>Object.hasOwn(v,k),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),arr=v=>Array.isArray(v)?v:[];
const rec=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const key=(i,j)=>i+':'+j;
const clip=(v)=>rounded(clamp(number(v),-LIMIT.delta,LIMIT.delta));
function create(seed='city-terrain'){
 return {version:1,seed:String(seed).slice(0,96),revision:0,nodes:{},statistics:{cut:0,fill:0,cost:0,operations:0}};
}
function normalize(raw,seed='city-terrain'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(!raw||typeof raw!=='object')return s;
 s.revision=Math.floor(clamp(number(raw.revision),0,1e9));
 if(raw.nodes&&typeof raw.nodes==='object'&&!Array.isArray(raw.nodes)){
  for(const [k,v] of Object.entries(raw.nodes).slice(0,LIMIT.nodes)){
   if(!/^(0|[1-9][0-9]{0,2}):(0|[1-9][0-9]{0,2})$/.test(k))continue;
   const [i,j]=k.split(':').map(Number);
   if(i*GRID>LIMIT.x||j*GRID>LIMIT.y)continue;
   const h=clip(v);if(h)s.nodes[k]=h;
  }
 }
 for(const k of Object.keys(s.statistics))s.statistics[k]=Math.round(clamp(number(raw.statistics?.[k]),0,1e12));
 return s;
}
function size(map){
 const width=map?.extent?.width??map?.size?.width??map?.mapWidth??map?.width,height=map?.extent?.height??map?.size?.height??map?.mapHeight??map?.height;
 return {width:clamp(number(width,1200),100,LIMIT.x),height:clamp(number(height,800),100,LIMIT.y)};
}
function base(map,p){
 const f=typeof map==='function'?map:
  typeof map?.elevation==='function'?map.elevation:
  typeof map?.height==='function'?map.height:null;
 return clamp(number(f?.call(map,p)),LIMIT.min,LIMIT.max);
}
function height(state,map,p){
 if(!point(p))return 0;
 const a=base(map,p),nodes=state?.nodes;
 if(!nodes||p.x<0||p.y<0||p.x>LIMIT.x||p.y>LIMIT.y)return a;
 const i=Math.floor(p.x/GRID),j=Math.floor(p.y/GRID),fx=p.x/GRID-i,fy=p.y/GRID-j;
 const v=(x,y)=>number(nodes[key(x,y)]);
 const offset=(1-fy)*(v(i,j)*(1-fx)+v(i+1,j)*fx)+fy*(v(i,j+1)*(1-fx)+v(i+1,j+1)*fx);
 return clamp(a+offset,LIMIT.min,LIMIT.max);
}
function gradient(state,map,p,step=GRID/2){
 if(!point(p))return {x:0,y:0,magnitude:0};
 const h=clamp(number(step,GRID/2),1,32);
 const x=(height(state,map,{x:p.x+h,y:p.y})-height(state,map,{x:p.x-h,y:p.y}))/(2*h);
 const y=(height(state,map,{x:p.x,y:p.y+h})-height(state,map,{x:p.x,y:p.y-h}))/(2*h);
 return {x,y,magnitude:Math.hypot(x,y)};
}
function slope(state,map,p,step){return gradient(state,map,p,step).magnitude;}
function rules(map,opts={}){
 const dim=size(map);
 const water=typeof opts.water==='function'?opts.water:
  typeof map?.water==='function'?p=>map.water(p):
  typeof map?.river==='function'&&typeof map?.width==='function'?p=>Math.abs(p.x-map.river(p.y))<map.width(p.y):()=>false;
 const reserve=typeof opts.protected==='function'?opts.protected:
  typeof map?.protected==='function'?p=>map.protected(p):
  typeof map?.ridge==='function'?p=>map.ridge(p)>.67:()=>false;
 return {dim,water,reserve};
}
function nearest(a,b,p){
 const vx=b.x-a.x,vy=b.y-a.y,k=vx*vx+vy*vy,t=k?clamp(((p.x-a.x)*vx+(p.y-a.y)*vy)/k,0,1):0;
 return rec(a,b,t);
}
function withinPolygon(p,poly){
 let yes=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if(dist(p,nearest(a,b,p))<.0001)return true;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<((b.x-a.x)*(p.y-a.y))/(b.y-a.y)+a.x)yes=!yes;
 }
 return yes;
}
function polygonOf(v){
 const direct=Array.isArray(v)?v:v?.footprint||v?.polygon||v?.poly||v?.points;
 if(Array.isArray(direct)&&direct.length>=3&&direct.length<=100&&direct.every(point))
  return direct.map(p=>({x:p.x,y:p.y}));
 if(!point(v))return null;
 const w=clamp(number(v.width,number(v.w,14)),2,550)/2,d=clamp(number(v.depth,number(v.h,14)),2,550)/2,a=number(v.angle,0),sin=Math.sin(a),cos=Math.cos(a);
 const transform=(x,y)=>({x:v.x+x*cos-y*sin,y:v.y+x*sin+y*cos});
 return [transform(-w,-d),transform(w,-d),transform(w,d),transform(-w,d)];
}
function masks(map,opts,brush){
 const {dim,water,reserve}=rules(map,opts),pad=Math.SQRT2*GRID;
 const roads=[],buildings=[];
 const inBox=(p,a,b,w)=>p.x>=Math.min(a.x,b.x)-w&&p.x<=Math.max(a.x,b.x)+w&&p.y>=Math.min(a.y,b.y)-w&&p.y<=Math.max(a.y,b.y)+w;
 for(const e of arr(opts.roads||opts.network?.edges).slice(0,8000)){
  if(!e)continue;
  const pts=Array.isArray(e)?e:e.pts||e.points||[],w=clamp(number(e.width,4.5+3.45*number(e.lanes,2)),3,80)/2+pad+2;
  for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i];if(!point(a)||!point(b)||!inBox(brush,a,b,brush.radius+w))continue;
   roads.push({a,b,w});
  }
 }
 for(const v of arr(opts.buildings).slice(0,9200)){
  const poly=polygonOf(v);if(!poly)continue;
  const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y),w=pad+2;
  const a={x:Math.min(...xs),y:Math.min(...ys)},b={x:Math.max(...xs),y:Math.max(...ys)};
  if(inBox(brush,a,b,brush.radius+w))buildings.push({poly,a,b,w});
 }
 function blocked(p){
  if(p.x<=GRID||p.y<=GRID||p.x>=dim.width-GRID||p.y>=dim.height-GRID)return 'edge';
  // A painted lattice node influences four adjacent tiles. Sample the
  // complete support, not only its center, before moving any vertex.
  const halo=[-GRID,-GRID/2,0,GRID/2,GRID];
  let wet=false,protectedHere=false;
  for(const x of halo)for(const y of halo){
   const q={x:p.x+x,y:p.y+y};
   wet ||= !!water(q);protectedHere ||= !!reserve(q);
  }
  if(wet)return 'water';if(protectedHere)return 'protected';
  for(const {a,b,w} of roads)if(inBox(p,a,b,w)&&dist(p,nearest(a,b,p))<=w)return 'road';
  for(const {poly,a,b,w} of buildings)if(inBox(p,a,b,w)){
   if(withinPolygon(p,poly))return 'building';
   for(let i=0;i<poly.length;i++)if(dist(p,nearest(poly[i],poly[(i+1)%poly.length],p))<=w)return 'building';
  }
  return '';
 }
 return {blocked,dim};
}
function quote(changes){
 let cut=0,fill=0;
 for(const {before,after} of changes){
  const n=(after-before)*AREA;if(n>0)fill+=n;else cut-=n;
 }
 const cost=Math.ceil(PRICES.base+cut*PRICES.cut+fill*PRICES.fill-1e-8);
 return {cut:rounded(cut,2),fill:rounded(fill,2),volume:rounded(cut+fill,2),cost};
}
function signature(s,changes){
 let h=2166136261;
 const w=s.seed+'|'+s.revision+'|'+changes.map(a=>[a.i,a.j,a.before,a.after].join(',')).join(';');
 for(const c of w)h=Math.imul(h^c.charCodeAt(0),16777619);
 return (h>>>0).toString(36);
}
function plateau(d){
 if(d<=.50)return 1;
 const t=clamp((d-.5)*2,0,1);
 return 1-t*t*(3-2*t);
}
function plan(state,map,data={},opts={}){
 const blocked=blockedCounts();
 const fail=(reason,extra={})=>({ok:false,reason,blocked,...extra});
 if(!state||!point(data)||!own(TOOLS,data.tool))return fail('请选择地形工具和位置');
 const br={tool:data.tool,x:data.x,y:data.y,radius:clamp(number(data.radius,36),LIMIT.radiusMin,LIMIT.radiusMax),
  amount:clamp(Math.abs(number(data.amount,data.tool==='smooth'?60:6)),data.tool==='smooth'?1:.25,data.tool==='smooth'?100:LIMIT.amountMax),
  target:clamp(number(data.target,height(state,map,data)),LIMIT.min,LIMIT.max)};
 const protection=masks(map,opts,br),dim=protection.dim,nodes=state.nodes||{},changes=[];
 if(br.x<2||br.x>dim.width-2||br.y<2||br.y>dim.height-2)return fail(REASONS.edge,{brush:br});
 let sizeNow=Object.keys(nodes).length,peak=0,maxBefore=-Infinity,minBefore=Infinity;
 for(let j=Math.max(0,Math.ceil((br.y-br.radius)/GRID));j<=Math.min(Math.floor(dim.height/GRID),Math.floor((br.y+br.radius)/GRID));j++)
  for(let i=Math.max(0,Math.ceil((br.x-br.radius)/GRID));i<=Math.min(Math.floor(dim.width/GRID),Math.floor((br.x+br.radius)/GRID));i++){
   const p={x:i*GRID,y:j*GRID},d=dist(p,br)/br.radius;
   if(d>=1)continue;
   const falloff=(1-d*d)**2,old=number(nodes[key(i,j)]),alt=height(state,map,p);
   maxBefore=Math.max(maxBefore,alt);minBefore=Math.min(minBefore,alt);
   let wanted=alt;
   if(br.tool==='raise'||br.tool==='lower')wanted+=br.amount*falloff*(br.tool==='lower'?-1:1);
   else if(br.tool==='level')wanted+=clamp(br.target-alt,-LIMIT.amountMax,LIMIT.amountMax)*plateau(d);
   else {
    let n=0,weight=0;
    for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++){
     if(!x&&!y)continue;
     const f=(3-Math.abs(x))*(3-Math.abs(y));
     n+=height(state,map,{x:p.x+x*GRID,y:p.y+y*GRID})*f;weight+=f;
    }
    wanted+=(n/weight-alt)*falloff*br.amount/100;
   }
   wanted=clamp(wanted,LIMIT.min,LIMIT.max);
   const after=clip(old+wanted-alt);
   if(Math.abs(after-old)<.04999)continue;
   const reason=protection.blocked(p);
   if(reason){blocked[reason]++;continue;}
   if(!old&&after&&sizeNow>=LIMIT.nodes){blocked.limit++;continue;}
   sizeNow+=Number(!old&&!!after)-Number(!!old&&!after);
   changes.push({i,j,x:p.x,y:p.y,before:old,after});
   peak=Math.max(peak,Math.abs(after-old));
   if(changes.length>=LIMIT.changes)break;
  }
 const partial=Object.values(blocked).some(Boolean);
 if(!changes.length){
  const reason=Object.keys(blocked).sort((a,b)=>blocked[b]-blocked[a])[0];
  return fail(partial?REASONS[reason]:REASONS.level,{brush:br,partial});
 }
 const money=quote(changes);
 const extra={...money,brush:br,partial,depth:rounded(peak),minBefore:rounded(minBefore),maxBefore:rounded(maxBefore),revision:state.revision};
 if(Number.isFinite(opts.cash)&&opts.cash<money.cost)return fail(REASONS.cash,extra);
 return {ok:true,...extra,blocked,changes,signature:signature(state,changes)};
}
function apply(state,draft){
 if(!state||!draft?.ok||draft.revision!==state.revision||!Array.isArray(draft.changes)||
  !draft.changes.length||draft.changes.length>LIMIT.changes)return false;
 const seen=new Set(),nodes=state.nodes||{},stats=state.statistics||create().statistics;
 let count=Object.keys(nodes).length;
 for(const a of draft.changes){
  if(!a||!Number.isInteger(a.i)||!Number.isInteger(a.j)||a.i<1||a.j<1||a.i*GRID>=LIMIT.x||a.j*GRID>=LIMIT.y||
   !Number.isFinite(a.after)||clip(a.after)!==a.after||Math.abs(a.after-a.before)<.04999)return false;
  const k=key(a.i,a.j);
  if(seen.has(k)||number(nodes[k])!==a.before)return false;
  seen.add(k);count+=Number(!a.before&&!!a.after)-Number(!!a.before&&!a.after);
 }
 if(count>LIMIT.nodes||draft.signature!==signature(state,draft.changes))return false;
 const money=quote(draft.changes);
 if(money.cost!==draft.cost||money.cut!==draft.cut||money.fill!==draft.fill)return false;
 for(const a of draft.changes)if(a.after)nodes[key(a.i,a.j)]=a.after;else delete nodes[key(a.i,a.j)];
 state.nodes=nodes;state.revision++;
 stats.cut+=Math.round(money.cut);stats.fill+=Math.round(money.fill);stats.cost+=money.cost;stats.operations++;
 state.statistics=stats;
 return true;
}
function sampleLine(points,step){
 const out=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],d=dist(a,b);
  if(d<.001)continue;
  const n=Math.max(1,Math.ceil(d/step)),nx=-(b.y-a.y)/d,ny=(b.x-a.x)/d;
  for(let j=out.length===0?0:1;j<=n;j++){
   const f=j/n;
   out.push({...rec(a,b,f),nx,ny,inputZ:number(a.z)+(number(b.z)-number(a.z))*f});
   if(out.length>1400)return null;
  }
 }
 return out;
}
function checkRoad(state,map,points,opts={}){
 if(!Array.isArray(points)||points.length<2||points.length>500||!points.every(point))return {ok:false,reason:'需要有效的道路中心线'};
 const {dim,water,reserve}=rules(map,opts),spec=opts.profile;
 const kind=typeof spec==='string'?(/^h(?:[46]|ighway)$/.test(spec)?'highway':spec):spec?.kind||opts.kind||'road';
 const limit=clamp(number(opts.grade,kind==='highway'?.08:kind==='ramp'?.14:.12),.025,.24);
 const crossLimit=clamp(number(opts.maxCrossSlope,kind==='highway'?.16:.22),.05,.60);
 const clearance=clamp(number(opts.clearance,10),5,40),cover=clamp(number(opts.cover,12),5,48);
 const alignment=opts.alignment==='absolute'?'absolute':opts.alignment==='ground'?'ground':'relative';
 const strip=clamp(number(opts.width,kind==='highway'?21:kind==='ramp'?10:11),5,40);
 const step=clamp(number(opts.step,2),1.5,6),samples=sampleLine(points,step);
 if(!samples||samples.length<2)return {ok:false,reason:'道路中心线没有长度，或超出地形采样范围'};
 let prev=null,grade=0,crossSlope=0,min=Infinity,max=-Infinity;
 const profile=[];
 const fail=(reason,p)=>({ok:false,reason,point:{x:p.x,y:p.y},grade:rounded(grade,4),limit,crossSlope:rounded(crossSlope,4),crossLimit,profile});
 for(const u of samples){
  if(u.x<1||u.x>dim.width-1||u.y<1||u.y>dim.height-1)return fail('道路超出当前地图',u);
  const h=height(state,map,u),z=alignment==='absolute'?u.inputZ:h+(alignment==='ground'?0:u.inputZ),offset=z-h;
  const q={x:u.x,y:u.y,z,ground:h,offset};
  profile.push(q);
  min=Math.min(min,z);max=Math.max(max,z);
  if(prev){
   const d=dist(prev,q);
   if(d>.001)grade=Math.max(grade,Math.abs(z-prev.z)/d);
  }
  prev=q;
  if(water(u)&&offset<clearance-.02&&offset>-cover+.02)return fail('跨水需满足桥梁净空 '+clearance+' 米或地下覆土 '+cover+' 米',u);
  if(reserve(u)&&offset>-cover+.02)return fail('保护区域只能从足够深的隧道下方通过',u);
  if(opts.alignment==='absolute'&&opts.groundOnly&&Math.abs(offset)>clamp(number(opts.groundTolerance,1.5),.4,4))
   return fail('地面道路没有贴合新地形，先整地或改用桥隧',u);
  if(Math.abs(offset)<2.0){
   const w=strip/2;
   const a={x:u.x-u.nx*w,y:u.y-u.ny*w},b={x:u.x+u.nx*w,y:u.y+u.ny*w};
   crossSlope=Math.max(crossSlope,Math.abs(height(state,map,a)-height(state,map,b))/strip);
   if(crossSlope>crossLimit+.002)return fail('路幅横坡过陡，先切坡或整理平台',u);
  }
  if(grade>limit+.002)return fail('纵坡 '+Math.round(grade*100)+'% 超过 '+Math.round(limit*100)+'%，请延长坡道、改线或整地',u);
 }
 return {ok:true,grade:rounded(grade,4),limit,crossSlope:rounded(crossSlope,4),crossLimit,rise:rounded(max-min),profile};
}
function checkBuilding(state,map,footprint,opts={}){
 const poly=polygonOf(footprint),maxSlope=clamp(number(opts.maxSlope,.16),.03,.7),maxRelief=clamp(number(opts.maxRelief,3.5),.25,30);
 if(!poly)return {ok:false,reason:'需要有效的建筑占地'};
 const {dim,water,reserve}=rules(map,opts),xs=poly.map(p=>p.x),ys=poly.map(p=>p.y),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 if(x0<1||x1>dim.width-1||y0<1||y1>dim.height-1)return {ok:false,reason:REASONS.edge};
 const sample=[...poly],step=clamp(number(opts.step,4),2,12);
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],n=Math.ceil(dist(a,b)/step);
  for(let j=1;j<n;j++)sample.push(rec(a,b,j/n));
  if(sample.length>16000)return {ok:false,reason:'建筑占地太大，无法核验基础'};
 }
 const cols=Math.ceil((x1-x0)/step),rows=Math.ceil((y1-y0)/step);
 if(cols*rows>16000)return {ok:false,reason:'建筑占地太大，无法核验基础'};
 for(let x=0;x<cols;x++)for(let y=0;y<rows;y++){
  const q={x:x0+(x+.5)*(x1-x0)/cols,y:y0+(y+.5)*(y1-y0)/rows};
  if(withinPolygon(q,poly))sample.push(q);
 }
 let min=Infinity,max=-Infinity,grade=0,protectedHere=false,wet=false;
 for(const p of sample){
  const h=height(state,map,p);
  min=Math.min(h,min);max=Math.max(h,max);grade=Math.max(grade,slope(state,map,p,2));
  wet ||= !!water(p);protectedHere ||= !!reserve(p);
 }
 const info={slope:rounded(grade,4),relief:rounded(max-min),foundation:rounded((min+max)/2),min:rounded(min),max:rounded(max),maxSlope,maxRelief};
 if(wet)return {ok:false,reason:REASONS.water,...info};
 if(protectedHere)return {ok:false,reason:REASONS.protected,...info};
 if(grade>maxSlope+.002||max-min>maxRelief+.02)return {ok:false,reason:'建筑基础太陡或高差过大，请先整理等高平台',...info};
 return {ok:true,...info};
}
function contours(state,map,opts={}){
 const dim=size(map),bb=Array.isArray(opts.bounds)?{x0:opts.bounds[0],y0:opts.bounds[1],x1:opts.bounds[2],y1:opts.bounds[3]}:opts.bounds||{};
 let spacing=clamp(number(opts.spacing,20),8,80),interval=clamp(number(opts.interval,8),2,60);
 const x0=clamp(number(bb.x0??bb.minX,0),0,dim.width),y0=clamp(number(bb.y0??bb.minY,0),0,dim.height),
  x1=clamp(number(bb.x1??bb.maxX,dim.width),0,dim.width),y1=clamp(number(bb.y1??bb.maxY,dim.height),0,dim.height);
 if(x1<=x0||y1<=y0)return [];
 const colsAt=f=>Math.ceil((x1-x0)/f),rowsAt=f=>Math.ceil((y1-y0)/f);
 while(colsAt(spacing)*rowsAt(spacing)>LIMIT.contourCells)spacing++;
 const cols=colsAt(spacing),rows=rowsAt(spacing),polygon=[];
 for(let j=0;j<=rows;j++){
  const row=[];
  for(let i=0;i<=cols;i++){
   const p={x:x0+(x1-x0)*i/cols,y:y0+(y1-y0)*j/rows};
   row.push({...p,h:height(state,map,p)});
  }
  polygon.push(row);
 }
 const segments=[];
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const c=[polygon[j][i],polygon[j][i+1],polygon[j+1][i+1],polygon[j+1][i]];
  const hi=Math.max(...c.map(a=>a.h)),lo=Math.min(...c.map(a=>a.h));
  if(hi-lo<1e-7)continue;
  for(let k=Math.floor(lo/interval)+1;k<=Math.floor(hi/interval);k++){
   const level=k*interval,out=[];
   for(let s=0;s<4;s++){
    const a=c[s],b=c[(s+1)%4];
    if((a.h<level)===(b.h<level))continue;
    out.push(rec(a,b,(level-a.h)/(b.h-a.h)));
   }
   const save=(a,b)=>{if(dist(a,b)>.001)segments.push({level,a,b});};
   if(out.length===2)save(out[0],out[1]);
   else if(out.length===4){
    const middle=height(state,map,{x:(c[0].x+c[2].x)/2,y:(c[0].y+c[2].y)/2});
    if((middle>=level)===(c[0].h>=level)){save(out[0],out[1]);save(out[2],out[3]);}
    else {save(out[0],out[3]);save(out[1],out[2]);}
   }
   if(segments.length>=LIMIT.segments)return segments.slice(0,LIMIT.segments);
  }
 }
 return segments;
}
return {GRID,LIMIT,TOOLS,PRICES,REASONS,create,normalize,height,slope,gradient,plan,apply,checkRoad,checkBuilding,contours};
});
