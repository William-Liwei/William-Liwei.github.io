(function(root,factory){const a=typeof module==='object'?factory(require('./network.js')):factory(root.Network);if(typeof module==='object')module.exports=a;else root.RoadsideZoning=a;})(globalThis,function(N){
'use strict';
const EPS=1e-7,finite=Number.isFinite,xy=p=>p&&finite(p.x)&&finite(p.y),z=p=>finite(p.z)?p.z:0,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cmp=(a,b)=>a<b?-1:a>b?1:0,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),pt=p=>({x:p.x,y:p.y,z:z(p)});
const bad=reason=>({ok:false,reason,points:[],segments:[],runs:[],length:0});
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:z(a)+(z(b)-z(a))*t});
const cross=(x,y,u,v)=>x*v-y*u;
const same=(a,b)=>dist(a,b)<=EPS&&Math.abs(z(a)-z(b))<=EPS;
const optNum=(v,d,a,b)=>finite(v)?clamp(v,a,b):d;
function isFrontage(e,{grade=2,isLand}={}){
 if((e?.kind||'road')!=='road'||e?.bridge||e?.tunnel||!Array.isArray(e?.pts)||e.pts.length<2||!e.pts.every(p=>xy(p)&&Math.abs(z(p))<=grade))return false;
 if(typeof isLand==='function')for(let i=1;i<e.pts.length;i++){
  const a=e.pts[i-1],b=e.pts[i],n=Math.max(1,Math.ceil(dist(a,b)/5));
  for(let j=0;j<=n;j++)if(!isLand(mix(a,b,j/n)))return false;
 }
 return true;
}
function compile(network,opts){
 const adjacency=new Map(),by=new Map();
 for(const e of (Array.isArray(network?.edges)?network.edges:[])){
  if(typeof e?.id!=='string'||by.has(e.id)||typeof e.a!=='string'||typeof e.b!=='string'||!isFrontage(e,opts))continue;
  const offsets=[0];for(let i=1;i<e.pts.length;i++)offsets.push(offsets.at(-1)+dist(e.pts[i-1],e.pts[i]));
  const length=offsets.at(-1);if(length<=EPS)continue;
  by.set(e.id,{e,offsets,length,last:e.pts.length-1});
 }
 const all=[...by.values()].sort((x,y)=>cmp(x.e.id,y.e.id));
 for(const m of all){
  const {e,last}=m;
  for(const [from,to,a,b] of [[e.a,e.b,0,last],[e.b,e.a,last,0]]){
   if(!adjacency.has(from))adjacency.set(from,[]);
   adjacency.get(from).push({to,m,a,b,d:m.length});
  }
 }
 return {all,by,adjacency};
}
function at(m,p){
 const i=Math.min(m.last-1,Math.floor(p));return mix(m.e.pts[i],m.e.pts[i+1],p-i);
}
function offset(m,p){
 const i=Math.min(m.last-1,Math.floor(p));return m.offsets[i]+(p-i)*(m.offsets[i+1]-m.offsets[i]);
}
function projected(a,b,p){
 const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
 return {point:mix(a,b,t),t};
}
function snapped(map,p,opts={}){
 if(!xy(p))return null;
 const max=optNum(opts.radius,25,1,120),hint=map.by.get(p.edge);
 if(hint&&finite(p.pos)&&p.pos>=0&&p.pos<=hint.last){
  const point=at(hint,p.pos);
  if(dist(p,point)<.7)return {...point,edge:hint.e.id,pos:p.pos,node:p.pos<=EPS?hint.e.a:p.pos>=hint.last-EPS?hint.e.b:undefined};
 }
 let winner=null,best=max+EPS;
 for(const m of map.all)for(let i=1;i<=m.last;i++){
  const {point,t}=projected(m.e.pts[i-1],m.e.pts[i],p),gap=dist(p,point);
  if(gap>=best-EPS)continue;
  const pos=i-1+t;best=gap;winner={...point,edge:m.e.id,pos,node:pos<=EPS?m.e.a:pos>=m.last-EPS?m.e.b:undefined};
 }
 return winner;
}
const snap=(network,p,opts={})=>snapped(compile(network,opts),p,opts);
function piece(m,a,b){
 const start=Math.min(a,b),end=Math.max(a,b),p=[at(m,start)];
 for(let i=Math.floor(start)+1;i<end-EPS;i++)if(!same(p.at(-1),m.e.pts[i]))p.push(pt(m.e.pts[i]));
 const last=at(m,end);if(!same(p.at(-1),last))p.push(last);
 return {edge:m.e.id,from:a,to:b,points:a<=b?p:p.reverse(),length:Math.abs(offset(m,b)-offset(m,a))};
}
function heap(){
 const h=[];
 return {get size(){return h.length;},push(a){
  let i=h.length;h.push(a);
  while(i){const p=(i-1)>>1;if(h[p].d<a.d||(h[p].d===a.d&&h[p].i<=a.i))break;h[i]=h[p];i=p;}h[i]=a;
 },pop(){
  const p=h[0],last=h.pop();if(!h.length)return p;
  let i=0;while(i*2+1<h.length){
   let c=i*2+1;if(c+1<h.length&&(h[c+1].d<h[c].d||h[c+1].d===h[c].d&&h[c+1].i<h[c].i))c++;
   if(last.d<h[c].d||last.d===h[c].d&&last.i<=h[c].i)break;h[i]=h[c];i=c;
  }
  h[i]=last;return p;
 }};
}
function bestLeg(map,a,b){
 const A=map.by.get(a.edge),B=map.by.get(b.edge),start=Symbol(),end=Symbol();
 const targets=new Map([[B.e.a,0],[B.e.b,B.last]]);
 const prior=new Map(),known=new Map([[start,0]]),h=heap();let seq=0;
 h.push({id:start,d:0,i:seq++});
 const move=(id,value,q)=>{
  const n=value+q.d;if(n>=(known.get(q.to)??Infinity)-EPS)return;
  known.set(q.to,n);prior.set(q.to,{id,...q});h.push({id:q.to,d:n,i:seq++});
 };
 while(h.size){
  const {id,d}=h.pop();if(d!==known.get(id))continue;
  if(id===end){
   const path=[];let u=id;
   while(u!==start){const q=prior.get(u);if(q.d>EPS)path.push(piece(q.m,q.a,q.b));u=q.id;}
   return path.reverse();
  }
  if(id===start){
   if(A===B)move(id,d,{to:end,m:A,a:a.pos,b:b.pos,d:Math.abs(offset(A,b.pos)-offset(A,a.pos))});
   move(id,d,{to:A.e.a,m:A,a:a.pos,b:0,d:offset(A,a.pos)});
   move(id,d,{to:A.e.b,m:A,a:a.pos,b:A.last,d:A.length-offset(A,a.pos)});
  }else{
   if(targets.has(id)){const q=targets.get(id);move(id,d,{to:end,m:B,a:q,b:b.pos,d:Math.abs(offset(B,b.pos)-offset(B,q))});}
   for(const q of map.adjacency.get(id)||[])move(id,d,q);
  }
 }
 return null;
}
function result(segments,opts,joined){
 const length=segments.reduce((a,p)=>a+p.length,0);
 if(segments.length>optNum(opts.maxSegments,64,1,200)||length>optNum(opts.maxLength,4000,30,20000))return bad('范围包含太多沿街路段，请分成较小的片区。');
 if(!segments.length||length<optNum(opts.minLength,2,0,30))return bad('没有足够长的普通地面道路。');
 const points=[];
 if(joined)for(const s of segments)for(const q of s.points)if(!points.length||!same(points.at(-1),q))points.push(q);
 // Civic allows 250 input samples per call. Supply ordered overlapping chunks, preserving every actual sample.
 const runs=[];
 for(const p of joined?[points]:segments.map(s=>s.points)){
  for(let i=0;i<p.length-1;i+=249)runs.push(p.slice(i,i+250));
 }
 return {ok:true,segments,points,runs,length};
}
function route(network,input,tail={},extra={}){
 const pairs=Array.isArray(input)?input:[input,tail],opts=Array.isArray(input)?tail:extra;
 if(pairs.length<2||pairs.length>32)return bad('请选择 2–32 个沿街点。');
 const map=compile(network,opts),stops=pairs.map(p=>snapped(map,p,opts));
 if(stops.some(p=>!p))return bad('请选择普通地面道路上的位置。');
 const segments=[];
 for(let i=1;i<stops.length;i++){
  const s=bestLeg(map,stops[i-1],stops[i]);if(!s)return bad('两点之间没有相连的普通地面道路。');
  for(const p of s)segments.push(p);
 }
 return {...result(segments,opts,true),stops};
}
// Returns exact segment parameters, including polygon side collinearity.
function crossings(a,b,c,d){
 const vx=b.x-a.x,vy=b.y-a.y,wx=d.x-c.x,wy=d.y-c.y,rx=c.x-a.x,ry=c.y-a.y,den=cross(vx,vy,wx,wy);
 if(Math.abs(den)>EPS){
  const t=cross(rx,ry,wx,wy)/den,u=cross(rx,ry,vx,vy)/den;
  return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?[clamp(t,0,1)]:[];
 }
 const l=vx*vx+vy*vy;if(l<=EPS||Math.abs(cross(rx,ry,vx,vy))>EPS)return [];
 const x=(rx*vx+ry*vy)/l,y=x+(wx*vx+wy*vy)/l;
 const from=Math.max(0,Math.min(x,y)),to=Math.min(1,Math.max(x,y));
 return from<=to+EPS?[clamp(from,0,1),clamp(to,0,1)]:[];
}
function inside(p,poly){
 for(let i=0,j=poly.length-1,yes=false;i<poly.length;j=i++){
  const a=poly[j],b=poly[i];
  if(dist(projected(a,b,p).point,p)<EPS)return true;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<a.x+(b.x-a.x)*(p.y-a.y)/(b.y-a.y))yes=!yes;
  if(i===poly.length-1)return yes;
 }
 return false;
}
function polygon(input){
 let a=input?.a,b=input?.b;
 if(Array.isArray(input)&&input.length===2)[a,b]=input;
 if(!Array.isArray(input)&&[input?.minX,input?.minY,input?.maxX,input?.maxY].every(finite)){a={x:input.minX,y:input.minY};b={x:input.maxX,y:input.maxY};}
 if(xy(a)&&xy(b))input=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];
 if(!Array.isArray(input)||input.length<3||input.length>65||!input.every(xy))return null;
 const p=input.map(pt);if(same(p[0],p.at(-1)))p.pop();
 if(p.length<3||p.some((q,i)=>dist(q,p[(i+1)%p.length])<EPS))return null;
 let area=0;for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length];area+=a.x*b.y-a.y*b.x;
  for(let j=i+2;j<p.length;j++){if(i===0&&j===p.length-1)continue;if(crossings(a,b,p[j],p[(j+1)%p.length]).length)return null;}
 }
 return Math.abs(area)>2?p:null;
}
function box(points){return points.reduce((r,p)=>({minX:Math.min(r.minX,p.x),minY:Math.min(r.minY,p.y),maxX:Math.max(r.maxX,p.x),maxY:Math.max(r.maxY,p.y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});}
function hits(a,b,pad=0){return a.maxX+pad>=b.minX&&b.maxX+pad>=a.minX&&a.maxY+pad>=b.minY&&b.maxY+pad>=a.minY;}
function region(network,input,opts={}){
 const poly=polygon(input);if(!poly)return bad('请选择面积足够、不自相交的沿街选区。');
 const map=compile(network,opts),bounds=box(poly),segments=[];
 for(const m of map.all){
  if(!hits(bounds,box(m.e.pts)))continue;
  let start=null,end=null;
  const flush=()=>{
   if(start!==null){const s=piece(m,start,end);if(s.length>=optNum(opts.minFragment,1,0,30))segments.push(s);}
   start=end=null;
  };
  for(let i=1;i<=m.last;i++){
   const a=m.e.pts[i-1],b=m.e.pts[i];if(dist(a,b)<=EPS)continue;
   if(!hits(bounds,box([a,b]))){flush();continue;}
   const t=[0,1];
   for(let j=0;j<poly.length;j++)t.push(...crossings(a,b,poly[j],poly[(j+1)%poly.length]));
   t.sort((a,b)=>a-b);
   for(let j=1;j<t.length;j++){
    const l=t[j-1],r=t[j];if(r-l<=EPS)continue;
    if(!inside(mix(a,b,(l+r)/2),poly)){flush();continue;}
    const from=i-1+l,to=i-1+r;
    if(start===null||Math.abs(from-end)>EPS){flush();start=from;}
    end=to;
   }
  }
  flush();
 }
 const r=result(segments,opts,false);return {...r,polygon:poly};
}

// Oriented lot footprint against the proposed road's real sampled envelope;
// neither the caller's lots nor the road geometry is modified.
function conflicts(lots,roadPoints,opts={}){
 const clearance=optNum(opts.clearance,optNum(opts.width,12,0,60)/2,0,40),grade=optNum(opts.grade,4,0,18);
 const points=Array.isArray(roadPoints)?roadPoints.filter(xy):[],targets=Array.isArray(lots)?lots:[];
 const candidates=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],delta=z(b)-z(a);
  if(!delta&&Math.abs(z(a))>grade)continue;
  const min=delta?Math.max(0,Math.min((-grade-z(a))/delta,(grade-z(a))/delta)):0,max=delta?Math.min(1,Math.max((-grade-z(a))/delta,(grade-z(a))/delta)):1;
  if(max<min)continue;
  const t=mix(a,b,min),u=mix(a,b,max);candidates.push({t,u,bounds:box([t,u])});
 }
 const entries=[],seen=new Set();
 for(const lot of targets){
  if(!xy(lot)||!lot.id||seen.has(lot.id))continue;
  const a=finite(lot.angle)?lot.angle:0,cs=Math.cos(a),sn=Math.sin(a),w=optNum(lot.width,13,1,100)/2,h=optNum(lot.depth,12,1,100)/2;
  const footprint=[[-w,-h],[w,-h],[w,h],[-w,h]].map(([x,y])=>({x:lot.x+x*cs-y*sn,y:lot.y+x*sn+y*cs}));
  const bounds=box(footprint);
  const touched=candidates.some(({t,u,bounds:roadBox})=>{
   if(!hits(bounds,roadBox,clearance))return false;
   if(inside(t,footprint)||inside(u,footprint))return true;
   for(let k=0;k<4;k++){
    const a=footprint[k],b=footprint[(k+1)%4];
    if(crossings(t,u,a,b).length||Math.min(dist(projected(t,u,a).point,a),dist(projected(t,u,b).point,b),dist(projected(a,b,t).point,t),dist(projected(a,b,u).point,u))<=clearance+EPS)return true;
   }
   return false;
  });
  if(!touched)continue;
  seen.add(lot.id);entries.push({id:lot.id,zoneId:lot.zoneId,x:lot.x,y:lot.y,type:lot.type,developed:(lot.level||0)>0||(lot.occupants||0)>0,occupants:Math.max(0,+lot.occupants||0)});
 }
 const developed=entries.filter(e=>e.developed),vacant=entries.filter(e=>!e.developed);
 return {entries,developed,vacant,count:entries.length,developedCount:developed.length,vacantCount:vacant.length,ids:entries.map(e=>e.id)};
}
return {isFrontage,snap,route,region,conflicts};
});
