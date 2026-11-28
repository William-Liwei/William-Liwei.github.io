(function(root,factory){let x=factory();if(typeof module==='object')module.exports=x;else root.Network=x})(globalThis,()=>{
'use strict';
const river=y=>globalThis.CityMaps?.center(y)??(600+45*Math.sin(y/115)), water=p=>globalThis.CityMaps?.water(p)??(Math.abs(p.x-river(p.y))<35), dist=(p,q)=>Math.hypot(q.x-p.x,q.y-p.y), clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:(a.z||0)+((b.z||0)-(a.z||0))*t});
const profiles={r2:{name:'2 车道',lanes:2,speed:36},r3:{name:'3 车道',lanes:3,speed:40},r4:{name:'4 车道',lanes:4,speed:45},r6:{name:'6 车道',lanes:6,speed:53},r8:{name:'8 车道',lanes:8,speed:58},h4:{name:'4 车道高速',lanes:4,speed:82,kind:'highway'},h6:{name:'6 车道高速',lanes:6,speed:92,kind:'highway'},ramp:{name:'互通匝道',lanes:2,speed:44,kind:'ramp',oneway:true}};
// One shared cross-section for pavement, vehicles, pavement markings and sidewalks.
function crossSection(edge={}){
 const count=clamp(Math.round(Number(edge.lanes)||2),1,8);
 const lane=edge.kind==='highway'?3.8:3.35;
 const width=count*lane+(edge.kind==='highway'?5.8:edge.kind==='ramp'?2.5:4.5);
 const forward=edge.oneway?count:Math.ceil(count/2),reverse=count-forward;
 const divider=edge.oneway?null:(reverse-forward)*lane/2;
 const offset=(i,back)=>edge.oneway?(i+.5-count/2)*lane:(back?-divider:divider)+(i+.5)*lane;
 const boundaries=Array.from({length:count-1},(_,i)=>(i+1-count/2)*lane);
 const bus=edge.bus&&edge.kind!=='highway'&&edge.kind!=='ramp';
 const busOffsets=bus?[...(forward>1?[offset(forward-1,false)]:[]),...(reverse>1?[-offset(reverse-1,true)]:[])]:[];
 return {lane,width,forward,reverse,divider,offset,boundaries,busOffsets};
}
const create=()=>({nodes:[],edges:[],buses:[],turns:[],next:1,cash:850000});
const length=pts=>pts.slice(1).reduce((s,p,i)=>s+dist(p,pts[i]),0);
function sample(points,t){if(points.length<2)return null;let l=clamp(t,0,1)*length(points);for(let i=1;i<points.length;i++){let a=points[i-1],b=points[i],d=dist(a,b);if(l<=d||i===points.length-1){let p=mix(a,b,d?clamp(l/d,0,1):0);return {...p,angle:Math.atan2(b.y-a.y,b.x-a.x)}}l-=d}}
function nearest(a,b,p){let dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return {...mix(a,b,t),t}}
function snap(city,p,r=13,matchZ=true){
 let node=null,nodeDist=r,edge=null,edgeDist=r;
 const active=new Set(city.edges.flatMap(e=>[e.a,e.b]));
 for(let n of city.nodes){let d=dist(n,p);if(active.has(n.id)&&d<=nodeDist&&(!matchZ||Math.abs(n.z-p.z)<2)){nodeDist=d;node={...n,node:n.id};}}
 if(node&&nodeDist<.001)return node;
 for(let e of city.edges)for(let i=1;i<e.pts.length;i++){
  let q=nearest(e.pts[i-1],e.pts[i],p),d=dist(q,p);
  if(d<edgeDist&&(!matchZ||Math.abs(q.z-p.z)<2)){edgeDist=d;edge={...q,edge:e.id,pos:i-1+q.t};}
 }
 return node&&(!edge||nodeDist<=edgeDist+1.75)?node:edge;
}
function plan(a,b,c=null){let pts=[],m=Math.max(2,Math.min(100,Math.ceil((c?dist(a,c)+dist(c,b):dist(a,b))/8)));for(let i=0;i<=m;i++){let t=i/m,p=c?mix(mix(a,c,t),mix(c,b,t),t):mix(a,b,t);p.z=a.z+(b.z-a.z)*t;pts.push(p)}return pts}
function intersect(a,b,c,d){let vx=b.x-a.x,vy=b.y-a.y,wx=d.x-c.x,wy=d.y-c.y,den=vx*wy-vy*wx;if(Math.abs(den)<1e-7)return null;let x=c.x-a.x,y=c.y-a.y,t=(x*wy-y*wx)/den,u=(x*vy-y*vx)/den;return t>=-1e-7&&t<=1.0000001&&u>=-1e-7&&u<=1.0000001?[clamp(t,0,1),clamp(u,0,1)]:null}
const kind=p=>p.kind||'road';
function options(o){const name=Object.hasOwn(profiles,o.profile)?o.profile:'r2',spec=profiles[name];return {...spec,profile:name,kind:kind(spec),oneway:!!(o.oneway||spec.oneway),bus:!!(o.bus&&kind(spec)==='road')}}
const atEnd=(pos,pts)=>pos<.01||pos>pts.length-1.01;
function permits(newKind,oldKind,newEnd,oldEnd){
 if(newKind!=='highway'&&oldKind!=='highway')return true;
 if(newKind===oldKind)return newEnd&&oldEnd;
 if(newKind==='ramp')return newEnd;
 return newKind==='highway'&&oldKind==='ramp'&&oldEnd;
}
function parallelOverlap(a,b,c,d){
 const l=dist(a,b),m=dist(c,d);if(l<1e-5||m<1e-5)return false;
 const dx=(b.x-a.x)/l,dy=(b.y-a.y)/l,ex=(d.x-c.x)/m,ey=(d.y-c.y)/m;
 if(Math.abs(dx*ey-dy*ex)>.003)return false;
 const u=(c.x-a.x)*dx+(c.y-a.y)*dy,v=(d.x-a.x)*dx+(d.y-a.y)*dy;
 const lo=Math.max(0,Math.min(u,v)),hi=Math.min(l,Math.max(u,v));
 if(hi-lo<.2)return false;
 for(const x of [.15,.5,.85]){
  const p=mix(a,b,(lo+(hi-lo)*x)/l),q=nearest(c,d,p);
  if(dist(p,q)>.92||Math.abs(p.z-q.z)>1.3)return false;
 }
 return true;
}
function check(city,pts,o,starts=[]){let p=options(o),l=length(pts);if(l<22)return {ok:false,reason:'路段至少要有 22 米'};if(dist(pts[0],pts.at(-1))<1.4)return {ok:false,reason:'起点和终点须分开；环路请分段建设'};for(let i=0;i<pts.length;i++){let a=pts[i];if(![a.x,a.y,a.z].every(Number.isFinite)||a.x<2||a.x>1198||a.y<2||a.y>798||Math.abs(a.z)>70)return {ok:false,reason:'超出地图或高度限制'};if(globalThis.CityMaps?.current().ridge?.(a)>.67&&a.z>-12)return {ok:false,reason:'保护山脊需从地下穿越（不浅于 −12 m）'};if(water(a)&&a.z<10&&a.z>-12)return {ok:false,reason:'河道需要至少 +10 m 桥高或 −12 m 隧道深度'};if(i&&Math.abs(pts[i-1].z-a.z)>dist(pts[i-1],a)*.23+.02)return {ok:false,reason:'纵坡过陡，拉长坡道或降低高差'};}
for(let i=1;i<pts.length;i++)for(let j=i+2;j<pts.length;j++){let q=intersect(pts[i-1],pts[i],pts[j-1],pts[j]);if(q&&dist(pts[i-1],pts[j])>.01)return {ok:false,reason:'该曲线与自己相交'};}
// A local blueprint should not run segment-intersection math across the city.
const x0=Math.min(...pts.map(q=>q.x))-1,x1=Math.max(...pts.map(q=>q.x))+1,y0=Math.min(...pts.map(q=>q.y))-1,y1=Math.max(...pts.map(q=>q.y))+1;
let hits=[],overpasses=[];for(let e of city.edges){
 let left=true,right=true,above=true,below=true;
 for(const q of e.pts){left=left&&q.x<x0;right=right&&q.x>x1;above=above&&q.y<y0;below=below&&q.y>y1;if(!left&&!right&&!above&&!below)break;}
 if(left||right||above||below)continue;
 for(let i=1;i<pts.length;i++){
 for(let j=1;j<e.pts.length;j++){
  let a=pts[i-1],b=pts[i],c=e.pts[j-1],d=e.pts[j],r=intersect(a,b,c,d);
  if(!r){if(parallelOverlap(a,b,c,d))return {ok:false,reason:'道路重叠，请改线或用改造工具'};continue;}
  let u=mix(a,b,r[0]),v=mix(c,d,r[1]),gap=Math.abs(u.z-v.z),p1=i-1+r[0],p2=j-1+r[1];
  if(gap>=6){overpasses.push({p:u,gap,edge:e.id});continue;}if(gap>1.3)return {ok:false,reason:'交叉净高至少需要 6 m，或降至同层相接'};
  if(!permits(p.kind,e.kind,atEnd(p1,pts),atEnd(p2,e.pts)))return {ok:false,reason:'高速不设平交路口，请在端点接互通匝道'};
  hits.push({p:u,newPos:p1,oldPos:p2,edge:e.id});
 }
 }
}
for(let k=0;k<2;k++){
 let s=starts[k],end=k?pts.at(-1):pts[0];
 // A collinear continuation may touch only an existing endpoint: it has no
 // mathematical intersection, but will still share that endpoint in add().
 const n=s?.node?city.nodes.find(n=>n.id===s.node):city.nodes.find(n=>dist(n,end)<1.4&&Math.abs(n.z-end.z)<1.3);
 if(n&&city.edges.some(e=>(e.a===n.id||e.b===n.id)&&!permits(p.kind,e.kind,true,true)))return {ok:false,reason:'高速入口请用互通匝道'};
 if(s?.edge){
  let e=city.edges.find(a=>a.id===s.edge);
  if(!e)return {ok:false,reason:'吸附的道路已改变，请重新选择端点'};
  if(!permits(p.kind,e.kind,true,atEnd(s.pos,e.pts)))return {ok:false,reason:'高速入口请用互通匝道'};
  hits.push({p:s,newPos:k?pts.length-1:0,oldPos:s.pos,edge:s.edge});
 }
}
let cost=Math.round(l*(26+p.lanes*17+(p.bus?18:0)+(p.kind==='highway'?24:0)) + pts.slice(1).reduce((s,v,i)=>s+dist(v,pts[i])*(v.z<-2?80+Math.abs(v.z)*2:v.z>2?42+v.z*1.8:0),0));
return city.cash<cost?{ok:false,reason:'市库不足',cost}:{ok:true,cost,hits,overpasses,profile:p};}
function add(city,pts,o,starts=[]){let out=check(city,pts,o,starts);if(!out.ok)return out;
let node=p=>{let n=city.nodes.find(q=>dist(q,p)<1.4&&Math.abs(q.z-p.z)<1.3);if(!n){n={...p,id:'n'+city.next++};city.nodes.push(n)}return n.id};
let from=starts[0]?.node||node(pts[0]),to=starts[1]?.node||node(pts.at(-1));let nlist=[{i:0,n:from},{i:pts.length-1,n:to}],by={};
for(let h of out.hits){let n=node(h.p);(by[h.edge]??=[]).push({i:h.oldPos,n});nlist.push({i:h.newPos,n})}
const slice=(arr,a,b)=>[mix(arr[Math.floor(a)],arr[Math.min(Math.ceil(a),arr.length-1)],a%1),...arr.slice(Math.floor(a)+1,Math.ceil(b)),mix(arr[Math.floor(b)],arr[Math.min(Math.ceil(b),arr.length-1)],b%1)];
function pieces(pts,stops,meta){stops.sort((a,b)=>a.i-b.i);let u=[];for(let v of stops){if(!u.length||v.i-u.at(-1).i>1e-5)u.push(v);}
let ids=[];for(let i=1;i<u.length;i++){let a=u[i-1],b=u[i];if(a.n===b.n)continue;let p=slice(pts,a.i,b.i); const na=city.nodes.find(v=>v.id===a.n),nb=city.nodes.find(v=>v.id===b.n);p[0]={x:na.x,y:na.y,z:na.z};p[p.length-1]={x:nb.x,y:nb.y,z:nb.z};let id='e'+city.next++;city.edges.push({...meta,id,a:a.n,b:b.n,pts:p,len:length(p)});ids.push(id)}return ids}
for(let e of [...city.edges]){
 if(!by[e.id]?.some(v=>v.i>1e-5&&v.i<e.pts.length-1-1e-5))continue;
 city.edges=city.edges.filter(q=>q.id!==e.id);
 const parts=pieces(e.pts,[{i:0,n:e.a},{i:e.pts.length-1,n:e.b},...by[e.id]],e);
 remapTurns(city,e,parts[0],parts.at(-1));
}
const ids=pieces(pts,nlist,out.profile);city.cash-=out.cost;rebuildBuses(city);return {...out,ids};}

const ruleKey=(node,enter,exit)=>JSON.stringify([node,enter,exit]);
const RULES=Symbol('turn policy');
const approaches=(city,node)=>city.edges.filter(e=>e.a===node||e.b===node);
const enters=(edge,node)=>edge.b===node||!edge.oneway&&edge.a===node;
const exits=(edge,node)=>edge.a===node||!edge.oneway&&edge.b===node;
function normalizedTurns(city){
 const lookup=new Map(city.edges.map(e=>[e.id,e])),seen=new Set(),rules=[];
 if(!Array.isArray(city.turns))return rules;
 for(const r of city.turns.slice(0,8192)){
  if(!r||typeof r.node!=='string'||typeof r.enter!=='string'||typeof r.exit!=='string')continue;
  const a=lookup.get(r.enter),b=lookup.get(r.exit),key=ruleKey(r.node,r.enter,r.exit);
  if(!a||!b||!enters(a,r.node)||!exits(b,r.node)||seen.has(key))continue;
  seen.add(key);rules.push({node:r.node,enter:r.enter,exit:r.exit});
 }
 return rules;
}
function remapTurns(city,edge,a,b){
 if(!Array.isArray(city.turns))return;
 for(const r of city.turns){
  const id=r.node===edge.a?a:r.node===edge.b?b:null;
  if(r.enter===edge.id)r.enter=id;
  if(r.exit===edge.id)r.exit=id;
 }
}
function setTurns(city,node,enter,blocked){
 const related=approaches(city,node),source=related.find(e=>e.id===enter);
 if(!source||!enters(source,node))return {ok:false,reason:'这段路不能驶入该路口'};
 const out=new Set(related.filter(e=>exits(e,node)).map(e=>e.id));
 const requested=[...new Set(blocked)];
 if(requested.some(e=>!out.has(e)))return {ok:false,reason:'选中的出口不可驶出，请重选路口'};
 const rest=normalizedTurns(city).filter(r=>r.node!==node||r.enter!==enter);
 if(rest.length+requested.length>8192)return {ok:false,reason:'全城转向规则已达上限'};
 city.turns=rest.concat(requested.map(exit=>({node,enter,exit})));
 const old=new Set(city.buses.filter(b=>b.broken).map(b=>b.id));
 rebuildBuses(city);
 return {ok:true,count:requested.length,newBreaks:city.buses.filter(b=>b.broken&&!old.has(b.id)).length};
}
function turnAllowed(adj,node,arrival,departure){return !arrival||!departure||!adj[RULES]?.get(node)?.get(arrival)?.has(departure);}
function graph(city,mode,loads={}){let adj=Object.create(null);if(mode!=='walk'&&city.turns?.length){
 const policy=adj[RULES]=new Map();
 for(const r of normalizedTurns(city)){
  if(!policy.has(r.node))policy.set(r.node,new Map());
  const from=policy.get(r.node);
  if(!from.has(r.enter))from.set(r.enter,new Set());
  from.get(r.enter).add(r.exit);
 }
}for(let e of city.edges){if(mode==='walk'&&(e.kind!=='road'||e.pts.some(p=>p.z<-4)))continue;let speed=mode==='walk'?5:e.speed,cap=capacity(e),pen=mode==='walk'?1:1+.9*(loads[e.id]||0)/cap; if(mode==='bus'&&e.bus)pen=1+((loads[e.id]||0)/cap)*.25;
let w=Math.max(.02,e.len/speed*pen);(adj[e.a]??=[]).push({to:e.b,edge:e.id,reverse:false,w}); if(!e.oneway||mode==='walk')(adj[e.b]??=[]).push({to:e.a,edge:e.id,reverse:true,w});}return adj}
function path(adj,a,b,arrival=null,departure=null){if(!a||!b)return null;if(adj[RULES]?.size)return turnPaths(adj,a,{arrival,target:b,departure}).route(b);if(a===b)return [];let todo=[[0,a]],ds={[a]:0},pr={};while(todo.length){todo.sort((x,y)=>y[0]-x[0]);let [d,n]=todo.pop();if(n===b){let route=[];while(n!==a){let s=pr[n];route.unshift({edge:s.edge,reverse:s.reverse});n=s.prev}return route}if(d!==ds[n])continue;for(let e of adj[n]||[]){let z=d+e.w;if(z<(ds[e.to]??Infinity)){ds[e.to]=z;pr[e.to]={...e,prev:n};todo.push([z,e.to])}}}return null}
function pathsFrom(adj,start){
 if(adj[RULES]?.size)return turnPaths(adj,start);
 const distances=Object.create(null),prev=Object.create(null),heap=[];
 const push=(x)=>{let i=heap.length;heap.push(x);while(i>0){let p=(i-1)>>1;if(heap[p][0]<=x[0])break;heap[i]=heap[p];i=p;}heap[i]=x;};
 const pop=()=>{let x=heap[0],h=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=h[0])break;heap[i]=heap[c];i=c;}heap[i]=h;}return x;};
 distances[start]=0;push([0,start]);
 while(heap.length){const [d,n]=pop();if(d!==distances[n])continue;
   for(const e of adj[n]||[]){const f=d+e.w;if(f>=(distances[e.to]??Infinity))continue;distances[e.to]=f;prev[e.to]={...e,from:n};push([f,e.to]);}}
 return {distances,route(end){if(!Number.isFinite(distances[end]))return null;let a=[];for(let n=end;n!==start;){const e=prev[n];if(!e)return null;a.push({edge:e.edge,reverse:e.reverse});n=e.from;}return a.reverse();}};
}
// Routing keeps the inbound edge as part of each junction state. A cheap arrival
// on the wrong approach must not hide a legal arrival from another street.
function turnPaths(adj,start,{arrival=null,target=null,departure=null,waypoints=null}={}){
 const heap=[],states=new Map(),best=new Map(),distances=Object.create(null);
 const push=x=>{let i=heap.length;heap.push(x);while(i){const p=(i-1)>>1;if(heap[p].cost<=x.cost)break;heap[i]=heap[p];i=p;}heap[i]=x;};
 const pop=()=>{const x=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;if(last.cost<=heap[c].cost)break;heap[i]=heap[c];i=c;}heap[i]=last;}return x;};
 const key=(n,incoming,k)=>JSON.stringify([n,adj[RULES]?.get(n)?.has(incoming)?incoming:null,k||0]);
 const initial={n:start,incoming:arrival,k:0,cost:0,key:key(start,arrival,0)};
 states.set(initial.key,initial);push(initial);
 while(heap.length){
  const cur=pop();if(states.get(cur.key)!==cur)continue;
  if(!waypoints&&(!departure||cur.n!==target||turnAllowed(adj,cur.n,cur.incoming,departure))&&!best.has(cur.n)){
   best.set(cur.n,cur);distances[cur.n]=cur.cost;
   if(cur.n===target)break;
  }
  if(waypoints&&cur.k===waypoints.length&&cur.n===target&&turnAllowed(adj,cur.n,cur.incoming,departure)){
   best.set(cur.n,cur);distances[cur.n]=cur.cost;break;
  }
  for(const e of adj[cur.n]||[]){
   if(!turnAllowed(adj,cur.n,cur.incoming,e.edge))continue;
   const k=waypoints&&waypoints[cur.k]===e.to?cur.k+1:cur.k;
   const next=key(e.to,e.edge,k),cost=cur.cost+e.w;
   if(cost>=(states.get(next)?.cost??Infinity))continue;
   const q={key:next,n:e.to,incoming:e.edge,k,cost,via:e,prev:cur};states.set(next,q);push(q);
  }
 }
 return {distances,route(n){if(!best.has(n))return null;const p=[];for(let a=best.get(n);a.via;a=a.prev)p.push({edge:a.via.edge,reverse:a.via.reverse});return p.reverse();}};
}
function capacity(e){return Math.max(7,Math.max(12,(e.lanes-crossSection(e).busOffsets.length)*24*(e.kind==='highway'?1.8:1)*(e.oneway?1.1:1))*(Number.isFinite(e.conditionCapacity)?clamp(e.conditionCapacity,.40,1):1))}
function busLoop(g,stops){
 const start=stops[0],seq=[...stops.slice(1),start];
 if(g[RULES]?.size){
  let best=null,cost=Infinity;
  // Try each legal first exit, then solve in stop order. The last approach must
  // also be allowed to enter the first exit for the next circuit.
  for(const first of g[start]||[]){
   const rest=first.to===seq[0]?seq.slice(1):seq;
   const t=turnPaths(g,first.to,{arrival:first.edge,target:start,departure:first.edge,waypoints:rest});
   const c=t.distances[start]+first.w;
   if(c<cost){cost=c;best=[{edge:first.edge,reverse:first.reverse},...t.route(start)];}
  }
  return best;
 }
 let prev=start,r=[];
 for(const n of seq){const p=path(g,prev,n);if(!p)return null;r.push(...p);prev=n;}
 return r;
}
function rebuildBuses(city){const g=graph(city,'bus');for(const b of city.buses){const r=busLoop(g,b.stops);b.path=r||[];b.broken=!r;}return city.buses;}
function bus(city,stops){if(stops.length<2||new Set(stops).size!==stops.length)return {ok:false,reason:'至少两个不同的车站'};let b={id:'B'+city.next++,stops:[...stops]};city.buses.push(b);rebuildBuses(city);if(b.broken){city.buses.pop();return {ok:false,reason:'受单行、转向限制或断路影响，线路无法闭合'}}return {ok:true,id:b.id}}
function remove(city,id){city.edges=city.edges.filter(e=>e.id!==id);city.turns=normalizedTurns(city);rebuildBuses(city)}
function upgrade(city,id,o){let e=city.edges.find(x=>x.id===id);if(!e)return {ok:false,reason:'未找到道路'};let p=options(o);if(p.kind!==e.kind)return {ok:false,reason:'普通道路与高速需要重建接驳，不能直接互换'};let cost=Math.round(e.len*(7+4*Math.max(0,p.lanes-e.lanes)+(p.bus&&!e.bus?5:0)));if(city.cash<cost)return {ok:false,reason:'市库不足',cost};city.cash-=cost;Object.assign(e,p);if(o.flip&&e.oneway){[e.a,e.b]=[e.b,e.a];e.pts=[...e.pts].reverse();}city.turns=normalizedTurns(city);rebuildBuses(city);return {ok:true,cost}}
function splitAt(city,p){
 const q=snap({nodes:city.nodes,edges:city.edges.filter(e=>e.kind==='road')},p,3,true);
 if(q?.node)return q.z>=-3?q.node:null;
 if(!q?.edge)return null;
 const e=city.edges.find(e=>e.id===q.edge);
 if(e.kind!=='road'||q.z<-3)return null;
 if(dist(q,e.pts[0])<2)return e.a;if(dist(q,e.pts.at(-1))<2)return e.b;
 const id='n'+city.next++,i=Math.floor(q.pos),pt={x:q.x,y:q.y,z:q.z};
 city.nodes.push({...pt,id});
 const lhs=e.pts.slice(0,i+1),rhs=e.pts.slice(i+1);
 if(dist(lhs.at(-1),pt)>.0001)lhs.push(pt);else lhs[lhs.length-1]=pt;
 if(!rhs.length||dist(rhs[0],pt)>.0001)rhs.unshift(pt);else rhs[0]=pt;
 const update=(a,b,pts)=>({...e,id:'e'+city.next++,a,b,pts,len:length(pts)});
 city.edges=city.edges.filter(s=>s.id!==e.id);
 const head=update(e.a,id,lhs),tail=update(id,e.b,rhs);
 city.edges.push(head,tail);remapTurns(city,e,head.id,tail.id);
 rebuildBuses(city);return id;
}
const mapRoads=city=>city.edges.map(e=>({...e,points:e.pts}));
return {create,river,water,dist,clamp,mix,sample,snap,plan,check,add,graph,path,pathsFrom,bus,rebuildBuses,remove,upgrade,splitAt,mapRoads,profiles,capacity,length,crossSection,approaches,enters,exits,normalizedTurns,turnAllowed,setTurns}
});
