(function(root,factory){let x=factory();if(typeof module==='object')module.exports=x;else root.Network=x})(globalThis,()=>{
'use strict';
const river=y=>600+45*Math.sin(y/115), water=p=>Math.abs(p.x-river(p.y))<35, dist=(p,q)=>Math.hypot(q.x-p.x,q.y-p.y), clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:(a.z||0)+((b.z||0)-(a.z||0))*t});
const profiles={r2:{name:'2 车道',lanes:2,speed:36},r3:{name:'3 车道',lanes:3,speed:40},r4:{name:'4 车道',lanes:4,speed:45},r6:{name:'6 车道',lanes:6,speed:53},r8:{name:'8 车道',lanes:8,speed:58},h4:{name:'4 车道高速',lanes:4,speed:82,kind:'highway'},h6:{name:'6 车道高速',lanes:6,speed:92,kind:'highway'},ramp:{name:'互通匝道',lanes:2,speed:44,kind:'ramp',oneway:true}};
const create=()=>({nodes:[],edges:[],buses:[],next:1,cash:850000});
const length=pts=>pts.slice(1).reduce((s,p,i)=>s+dist(p,pts[i]),0);
function sample(points,t){if(points.length<2)return null;let l=clamp(t,0,1)*length(points);for(let i=1;i<points.length;i++){let a=points[i-1],b=points[i],d=dist(a,b);if(l<=d||i===points.length-1){let p=mix(a,b,d?clamp(l/d,0,1):0);return {...p,angle:Math.atan2(b.y-a.y,b.x-a.x)}}l-=d}}
function nearest(a,b,p){let dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return {...mix(a,b,t),t}}
function snap(city,p,r=13,matchZ=true){let best=null,d=r;for(let n of city.nodes){let d1=dist(n,p);if(d1<=d&&(!matchZ||Math.abs(n.z-p.z)<2)){d=d1;best={...n,node:n.id}}}if(best)return best;for(let e of city.edges)for(let i=1;i<e.pts.length;i++){let q=nearest(e.pts[i-1],e.pts[i],p),d1=dist(q,p);if(d1<d&&(!matchZ||Math.abs(q.z-p.z)<2)){d=d1;best={...q,edge:e.id,pos:i-1+q.t}}}return best}
function plan(a,b,c=null){let pts=[],m=Math.max(2,Math.min(100,Math.ceil((c?dist(a,c)+dist(c,b):dist(a,b))/8)));for(let i=0;i<=m;i++){let t=i/m,p=c?mix(mix(a,c,t),mix(c,b,t),t):mix(a,b,t);p.z=a.z+(b.z-a.z)*t;pts.push(p)}return pts}
function intersect(a,b,c,d){let vx=b.x-a.x,vy=b.y-a.y,wx=d.x-c.x,wy=d.y-c.y,den=vx*wy-vy*wx;if(Math.abs(den)<1e-7)return null;let x=c.x-a.x,y=c.y-a.y,t=(x*wy-y*wx)/den,u=(x*vy-y*vx)/den;return t>=-1e-7&&t<=1.0000001&&u>=-1e-7&&u<=1.0000001?[clamp(t,0,1),clamp(u,0,1)]:null}
const kind=p=>p.kind||'road';
function options(o){let spec=profiles[o.profile]||profiles.r2;return {...spec,profile:o.profile in profiles?o.profile:'r2',kind:kind(spec),oneway:!!(o.oneway||spec.oneway),bus:!!(o.bus&&kind(spec)==='road')}}
function check(city,pts,o,starts=[]){let p=options(o),l=length(pts);if(l<22)return {ok:false,reason:'路段至少要有 22 米'};for(let i=0;i<pts.length;i++){let a=pts[i];if(![a.x,a.y,a.z].every(Number.isFinite)||a.x<2||a.x>1198||a.y<2||a.y>798||Math.abs(a.z)>70)return {ok:false,reason:'超出地图或高度限制'};if(water(a)&&a.z<10&&a.z>-12)return {ok:false,reason:'河道需要至少 +10 m 桥高或 −12 m 隧道深度'};if(i&&Math.abs(pts[i-1].z-a.z)>dist(pts[i-1],a)*.23+.02)return {ok:false,reason:'纵坡过陡，拉长坡道或降低高差'};}
for(let i=1;i<pts.length;i++)for(let j=i+2;j<pts.length;j++){let q=intersect(pts[i-1],pts[i],pts[j-1],pts[j]);if(q&&dist(pts[i-1],pts[j])>.01)return {ok:false,reason:'该曲线与自己相交'};}
let hits=[];for(let e of city.edges){
 for(let i=1;i<pts.length;i++){
 for(let j=1;j<e.pts.length;j++){
  let a=pts[i-1],b=pts[i],c=e.pts[j-1],d=e.pts[j],r=intersect(a,b,c,d);
  if(!r){let dx=b.x-a.x,dy=b.y-a.y,ex=d.x-c.x,ey=d.y-c.y;if(Math.abs(dx*ey-dy*ex)/(dist(a,b)*dist(c,d)||1)<.025){const m=mix(a,b,.5),s=nearest(c,d,m);if(s.t>.02&&s.t<.98&&dist(m,s)<2.5&&Math.abs(m.z-s.z)<2)return {ok:false,reason:'道路重叠，请改线或用改造工具'};}continue;}
  let u=mix(a,b,r[0]),v=mix(c,d,r[1]),gap=Math.abs(u.z-v.z),p1=i-1+r[0],p2=j-1+r[1];
  if(gap>=6)continue;if(gap>1.3)return {ok:false,reason:'交叉净高至少需要 6 m，或降至同层相接'};
  if(p.kind==='highway'||e.kind==='highway'){
   let end=p1<.01||p1>pts.length-1.01, endOld=p2<.01||p2>e.pts.length-1.01;
   const direct=end&&endOld&&p.kind===e.kind;
   if(!(direct||(end&&(p.kind==='ramp'||(e.kind==='ramp'&&endOld)))))return {ok:false,reason:'高速不设平交路口，请在端点接互通匝道'};
  }
  hits.push({p:u,newPos:p1,oldPos:p2,edge:e.id});
 }
 }
}
for(let k=0;k<2;k++){let s=starts[k];if(s&&s.edge){let e=city.edges.find(a=>a.id===s.edge);if(e.kind==='highway'&&p.kind!=='ramp')return {ok:false,reason:'高速入口请用互通匝道'};hits.push({p:s,newPos:k?pts.length-1:0,oldPos:s.pos,edge:s.edge});}}
let cost=Math.round(l*(26+p.lanes*17+(p.bus?18:0)+(p.kind==='highway'?24:0)) + pts.slice(1).reduce((s,v,i)=>s+dist(v,pts[i])*(v.z<-2?80+Math.abs(v.z)*2:v.z>2?42+v.z*1.8:0),0));
return city.cash<cost?{ok:false,reason:'市库不足',cost}:{ok:true,cost,hits,profile:p};}
function add(city,pts,o,starts=[]){let out=check(city,pts,o,starts);if(!out.ok)return out;
let node=p=>{let n=city.nodes.find(q=>dist(q,p)<1.4&&Math.abs(q.z-p.z)<1.3);if(!n){n={...p,id:'n'+city.next++};city.nodes.push(n)}return n.id};
let from=starts[0]?.node||node(pts[0]),to=starts[1]?.node||node(pts.at(-1));let nlist=[{i:0,n:from},{i:pts.length-1,n:to}],by={};
for(let h of out.hits){let n=node(h.p);(by[h.edge]??=[]).push({i:h.oldPos,n});nlist.push({i:h.newPos,n})}
const slice=(arr,a,b)=>[mix(arr[Math.floor(a)],arr[Math.min(Math.ceil(a),arr.length-1)],a%1),...arr.slice(Math.floor(a)+1,Math.ceil(b)),mix(arr[Math.floor(b)],arr[Math.min(Math.ceil(b),arr.length-1)],b%1)];
function pieces(pts,stops,meta){stops.sort((a,b)=>a.i-b.i);let u=[];for(let v of stops){if(!u.length||v.i-u.at(-1).i>1e-5)u.push(v);}
let ids=[];for(let i=1;i<u.length;i++){let a=u[i-1],b=u[i];if(a.n===b.n)continue;let p=slice(pts,a.i,b.i); const na=city.nodes.find(v=>v.id===a.n),nb=city.nodes.find(v=>v.id===b.n);p[0]={x:na.x,y:na.y,z:na.z};p[p.length-1]={x:nb.x,y:nb.y,z:nb.z};let id='e'+city.next++;city.edges.push({...meta,id,a:a.n,b:b.n,pts:p,len:length(p)});ids.push(id)}return ids}
for(let e of [...city.edges]){if(!by[e.id]?.some(v=>v.i>1e-5&&v.i<e.pts.length-1-1e-5))continue;city.edges=city.edges.filter(q=>q.id!==e.id);pieces(e.pts,[{i:0,n:e.a},{i:e.pts.length-1,n:e.b},...by[e.id]],e)}
const ids=pieces(pts,nlist,out.profile);city.cash-=out.cost;rebuildBuses(city);return {...out,ids};}
function graph(city,mode,loads={}){let adj={};for(let e of city.edges){if(mode==='walk'&&(e.kind!=='road'||e.pts.some(p=>p.z<-4)))continue;let speed=mode==='walk'?5:e.speed,cap=capacity(e),pen=mode==='walk'?1:1+.9*(loads[e.id]||0)/cap; if(mode==='bus'&&e.bus)pen=1+((loads[e.id]||0)/cap)*.25;
let w=Math.max(.02,e.len/speed*pen);(adj[e.a]??=[]).push({to:e.b,edge:e.id,reverse:false,w}); if(!e.oneway||mode==='walk')(adj[e.b]??=[]).push({to:e.a,edge:e.id,reverse:true,w});}return adj}
function path(adj,a,b){if(!a||!b)return null;if(a===b)return [];let todo=[[0,a]],ds={[a]:0},pr={};while(todo.length){todo.sort((x,y)=>y[0]-x[0]);let [d,n]=todo.pop();if(n===b){let route=[];while(n!==a){let s=pr[n];route.unshift({edge:s.edge,reverse:s.reverse});n=s.prev}return route}if(d!==ds[n])continue;for(let e of adj[n]||[]){let z=d+e.w;if(z<(ds[e.to]??Infinity)){ds[e.to]=z;pr[e.to]={...e,prev:n};todo.push([z,e.to])}}}return null}
function capacity(e){return Math.max(12,(e.lanes-(e.bus?1:0))*24*(e.kind==='highway'?1.8:1)*(e.oneway?1.1:1))}
function rebuildBuses(city){let g=graph(city,'bus');for(let b of city.buses){let seq=[...b.stops,b.stops[0]],r=[];for(let i=1;i<seq.length;i++){let p=path(g,seq[i-1],seq[i]);if(!p){r=null;break}r.push(...p)}b.path=r||[];b.broken=!r;}return city.buses}
function bus(city,stops){if(stops.length<2||new Set(stops).size!==stops.length)return {ok:false,reason:'至少两个不同的车站'};let b={id:'B'+city.next++,stops:[...stops]};city.buses.push(b);rebuildBuses(city);if(b.broken){city.buses.pop();return {ok:false,reason:'受单行限制或路网不通，线路无法闭环'}}return {ok:true,id:b.id}}
function remove(city,id){city.edges=city.edges.filter(e=>e.id!==id);rebuildBuses(city)}
function upgrade(city,id,o){let e=city.edges.find(x=>x.id===id);if(!e)return {ok:false,reason:'未找到道路'};let p=options(o);if(p.kind!==e.kind)return {ok:false,reason:'普通道路与高速需要重建接驳，不能直接互换'};let cost=Math.round(e.len*(7+4*Math.max(0,p.lanes-e.lanes)+(p.bus&&!e.bus?5:0)));if(city.cash<cost)return {ok:false,reason:'市库不足'};city.cash-=cost;Object.assign(e,p);rebuildBuses(city);return {ok:true,cost}}
function splitAt(city,p){
 const q=snap(city,p,3,true);
 if(q?.node)return q.node;
 if(!q?.edge)return null;
 const e=city.edges.find(e=>e.id===q.edge);
 if(e.kind!=='road'||q.z<-3)return null;
 if(dist(q,e.pts[0])<2)return e.a;if(dist(q,e.pts.at(-1))<2)return e.b;
 const id='n'+city.next++,i=Math.floor(q.pos),pt={x:q.x,y:q.y,z:q.z};
 city.nodes.push({...pt,id});
 const lhs=[...e.pts.slice(0,i+1),pt],rhs=[pt,...e.pts.slice(i+1)];
 const update=(a,b,pts)=>({...e,id:'e'+city.next++,a,b,pts,len:length(pts)});
 city.edges=city.edges.filter(s=>s.id!==e.id);
 city.edges.push(update(e.a,id,lhs),update(id,e.b,rhs));
 rebuildBuses(city);return id;
}
const mapRoads=city=>city.edges.map(e=>({...e,points:e.pts}));
return {create,river,water,dist,clamp,mix,sample,snap,plan,check,add,graph,path,bus,rebuildBuses,remove,upgrade,splitAt,mapRoads,profiles,capacity,length}
});
