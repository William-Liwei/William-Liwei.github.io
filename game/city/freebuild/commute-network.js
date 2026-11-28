/* Adapter: convert built streets, operating buses/metrolines and public parking into legal journey legs. */
(function(root,factory){const api=factory(
 typeof module==='object'?require('./network.js'):root.Network,
 typeof module==='object'?require('./parking.js'):root.Parking,
 typeof module==='object'?require('./transit.js'):root.Transit);
 if(typeof module==='object')module.exports=api;else root.CommuteNetwork=api;
})(globalThis,function(N,P,T){
'use strict';
const finite=Number.isFinite, limit=(x,a,b)=>Math.max(a,Math.min(b,x)), EPS=1e-6;
const busStop=id=>'bus:'+id;
const metroStop=id=>'metro:'+id;
const noop=()=>true;
const pairKey=(a,b)=>JSON.stringify([a,b]);
const num=(n,fallback,a,b)=>finite(n)?limit(n,a,b):fallback;
const xy=p=>p&&[p.x,p.y].every(finite)?{x:p.x,y:p.y,z:finite(p.z)?p.z:0}:null;
const length=pts=>Array.isArray(pts)&&pts.length>1?N.length(pts):0;
const walkable=e=>e?.kind==='road'&&Array.isArray(e.pts)&&e.pts.length>=2&&e.pts.every(p=>(p.z||0)>=-3);
const sidewalkAccess=e=>walkable(e)&&e.pts.some(p=>Math.abs(p.z||0)<=2.5);
function pointInLandSegment(a,b,land){
 const d=N.dist(a,b),n=Math.max(1,Math.ceil(d/5));
 // Even on a narrow river or protected terrain, access is never a straight
 // “nearby on the map” jump to the road on the other side.
 for(let i=0;i<=n;i++){const p=N.mix(a,b,i/n);if(!land(p))return false;}
 return true;
}
function nearest(a,b,p){
 const d=N.dist(a,b),x=b.x-a.x,y=b.y-a.y;
 const t=d>EPS?limit(((p.x-a.x)*x+(p.y-a.y)*y)/(d*d),0,1):0;
 return {...N.mix(a,b,t),t};
}
function makeAccess(net,land,maxSiteAccess,extraWalking){
 const nodeAt=new Map((net.nodes||[]).map(n=>[n.id,n])),edgeAt=new Map((net.edges||[]).map(e=>[e.id,e])),walkNet={...net,edges:(net.edges||[]).filter(walkable)};
 const walkGraph=N.graph(walkNet,'walk'),sideBins=new Map(),sideCell=48;
 const activeNodes=new Set(walkNet.edges.flatMap(e=>[e.a,e.b]));
 const bin=(x,y)=>x+':'+y;
 for(const e of walkNet.edges.filter(sidewalkAccess)){
  const cum=[0];for(let i=1;i<e.pts.length;i++)cum.push(cum.at(-1)+N.dist(e.pts[i-1],e.pts[i]));
  for(let j=1;j<e.pts.length;j++){
   const a=e.pts[j-1],b=e.pts[j],seg={e,a,b,offset:cum[j-1],end:cum.at(-1)};
   if((a.z||0)>2.5&&(b.z||0)>2.5)continue;
   for(let x=Math.floor(Math.min(a.x,b.x)/sideCell);x<=Math.floor(Math.max(a.x,b.x)/sideCell);x++)
    for(let y=Math.floor(Math.min(a.y,b.y)/sideCell);y<=Math.floor(Math.max(a.y,b.y)/sideCell);y++){
     const key=bin(x,y);if(!sideBins.has(key))sideBins.set(key,[]);sideBins.get(key).push(seg);
    }
  }
 }
 const anchors=new Map(),trees=new Map();
 function nodeAnchor(id){const p=nodeAt.get(id);return activeNodes.has(id)&&p?{p,q:p,off:0,node:id,connect:[{node:id,d:0}]}:null;}
 function anchor(location){
  if(typeof location==='string')return nodeAnchor(location);
  if(!location||typeof location!=='object')return null;
  const p=xy(location);
  if(!p)return location.node?nodeAnchor(location.node):null;
  const key=JSON.stringify([p.x,p.y,p.z]);
  if(anchors.has(key))return anchors.get(key);
  if(Math.abs(p.z)>2.5||!land(p)){anchors.set(key,null);return null;}
  const near=[],seen=new Set();
  for(let x=Math.floor((p.x-maxSiteAccess)/sideCell);x<=Math.floor((p.x+maxSiteAccess)/sideCell);x++)
   for(let y=Math.floor((p.y-maxSiteAccess)/sideCell);y<=Math.floor((p.y+maxSiteAccess)/sideCell);y++)
    for(const seg of sideBins.get(bin(x,y))||[]){
     if(seen.has(seg))continue;seen.add(seg);
     const q=nearest(seg.a,seg.b,p),d=N.dist(p,q);
     if(d<=maxSiteAccess&&Math.abs(q.z)<=2.5)near.push({seg,q,d});
    }
  near.sort((a,b)=>a.d-b.d||String(a.seg.e.id).localeCompare(String(b.seg.e.id)));
  // Select one site frontage. Multiple disconnected streets separated by a few
  // metres cannot become mutually accessible through an imaginary driveway.
  let result=null;
  for(const n of near){
   if(!pointInLandSegment(p,n.q,land))continue;
   const {seg,q,d}=n,offset=seg.offset+N.dist(seg.a,seg.b)*q.t;
   result={p,q,off:d,edge:seg.e,offset,connect:[{node:seg.e.a,d:offset},{node:seg.e.b,d:Math.max(0,seg.end-offset)}]};break;
  }
  anchors.set(key,result);return result;
 }
 function walking(a,b,max){
  if(!a||!b||N.dist(a.p,b.p)>max+EPS)return null;
  const extra=extraWalking?.(a.p,b.p);
  let best=extra&&extra.meters<=max?{metres:extra.meters,path:extra.segments??[],active:true}:null;
  if(a.edge&&b.edge&&a.edge.id===b.edge.id){
   const metres=a.off+b.off+Math.abs(a.offset-b.offset);
   if(metres<=max&&(!best||metres<best.metres))best={metres,path:[{edge:a.edge.id,reverse:b.offset<a.offset,partial:true,fromDistance:a.offset,toDistance:b.offset}]};
  }
  for(const start of a.connect){
   let tree=trees.get(start.node);
   if(!tree){tree=N.pathsFrom(walkGraph,start.node);trees.set(start.node,tree);}
   for(const end of b.connect){
    const d=(tree.distances[end.node]??Infinity)*5+start.d+end.d+a.off+b.off;
    if(d<=max&&(!best||d<best.metres-EPS)){
     const path=tree.route(end.node);if(path!==null)best={metres:d,path,start:start.node,end:end.node};
    }
   }
  }
  return best;
 }
 return {anchor,nodeAnchor,walking,nodeAt,edgeAt};
}
function roadTime(edge,loads,fallback=44){
 const met=finite(edge.len)?edge.len:length(edge.pts);
 const flow=1+.9*Math.max(0,+(loads?.[edge.id]||0))/N.capacity(edge);
 return met/Math.max(3.5,Math.min(35,(finite(edge.speed)?edge.speed:fallback)/3.6))*flow;
}
function onlyContinuous(bus,net,edges){
 const path=bus?.path||[],stops=bus?.stops||[];
 if(bus?.broken||stops.length<2||path.length<2||new Set(stops).size!==stops.length)return null;
 const legal=N.graph(net,'bus'),visited=new Set(stops);
 let at=stops[0],arrival=path.at(-1)?.edge;
 const trace=[];
 for(const item of path){
  const e=edges.get(item.edge),rev=!!item.reverse;
  if(!e||rev&&e.oneway)return null;
  const from=rev?e.b:e.a,to=rev?e.a:e.b;
  if(from!==at||!N.turnAllowed(legal,from,arrival,e.id))return null;
  trace.push({item,e,to,stop:visited.has(to)});at=to;arrival=e.id;
 }
 return at===stops[0]&&stops.every(id=>trace.some(t=>t.to===id))?trace:null;
}
function addBusLine(bus,network,a,all,stopMap,live,depot,loads,freq){
 const trace=onlyContinuous(bus,network,a.edgeAt);if(!trace)return;
 const dwell=2.4,visits=[{node:bus.stops[0],seconds:0}],ids=Object.create(null);
 let elapsed=0;
 for(const t of trace){elapsed+=Math.max(.25,roadTime(t.e,loads,46))+.6;if(t.stop){visits.push({node:t.to,seconds:elapsed});elapsed+=dwell;}}
 for(const v of visits){
  const id=busStop(v.node),p=a.nodeAt.get(v.node);
  if(!p)return;
  if(!stopMap.has(id))stopMap.set(id,{id,mode:'bus',node:v.node,x:p.x,y:p.y,z:p.z||0,anchor:a.nodeAnchor(v.node)});
  ids[v.node]=id;
 }
 const segments=[];
 let current=[visits[0]],seen=new Set([visits[0].node]);
 for(const v of visits.slice(1)){
  if(seen.has(v.node)){
   if(current.length>1)segments.push(current);
   // Same physical vehicle resumes this segment at the actual turning stop.
   current=[current.at(-1)];seen=new Set([current[0].node]);
  }
  current.push(v);seen.add(v.node);
 }
 if(current.length>1)segments.push(current);
 const headway=limit(elapsed/(freq==='frequent'?2.45:1.45)/(depot?1.3:1),12,96);
 const busLines=[];
 for(let i=0;i<segments.length;i++){
  const part=segments[i],id='bus:'+bus.id+(i===0?'':i===1?':return':':run'+i);
  const ride=part.slice(1).map((v,j)=>Math.max(.25,v.seconds-part[j].seconds));
  const def={id,mode:'bus',busId:bus.id,triggerNode:part[0].node,rawStops:part.map(p=>p.node),stops:part.map(v=>ids[v.node]),
   ride,headway,capacity:depot?39:32,offset:part[0].seconds};
  all.push(def);busLines.push(id);
 }
 live[bus.id]=ids;
 return {cycle:elapsed,lineIds:busLines,visits:visits.map(x=>x.node)};
}
function addMetroLine(l,a,all,stopMap){
 if(!l?.valid||l.mode!=='metro'||!Array.isArray(l.points)||l.points.length<2||!Array.isArray(l.segments)||l.segments.length!==l.points.length-1)return;
 const local=Object.hasOwn(T.MODES,'metro')?T.MODES.metro:null;
 if(!local||new Set(l.points.map(p=>p.id)).size!==l.points.length||l.points.some(p=>p.external))return;
 const anchored=l.points.map(p=>({...p,stopId:metroStop(p.id),anchor:a.anchor(p)}));
 // A line can keep moving through an inaccessible station, but the planner
 // cannot board there. No station is fabricated when a driveway is severed.
 const byRide=l.segments.map(q=>q.every(p=>xy(p))?length(q):0);
 if(byRide.some(m=>m<1))return;
 for(const [i,p] of anchored.entries())if(!stopMap.has(p.stopId))stopMap.set(p.stopId,{id:p.stopId,node:p.id,mode:'metro',x:p.x,y:p.y,z:p.z||0,anchor:p.anchor,index:i});
 const ride=byRide.map(L=>L/Math.max(6,local.speed/3.6)+2.1);
 const total=ride.reduce((u,v)=>u+v,0);
 const de=Math.max(1,Math.trunc(l.depots||1)),headway=limit((2*total+9)/Math.min(4,1+de),16,82);
 const capacity=limit(Math.round((l.capacity||local.capacity)*.28),22,83);
 for(const reverse of [false,true]){
  all.push({id:'metro:'+l.id+(reverse?':back':':out'),metroId:l.id,mode:'metro',stops:(reverse?[...anchored].reverse():anchored).map(p=>p.stopId),
   ride:reverse?[...ride].reverse():ride,capacity,headway,offset:reverse?total+4.5:0});
 }
}
function create({network={},transitMetrics,transit,parking,parkingConfig,isLand=noop,loads={},frequency='normal',depotLines,
                 maxWalk,maxTransferWalk,walkSpeed,maxSiteAccess,extraWalking,maxTransfers:defaultTransfers}={}){
 const net={nodes:[],edges:[],buses:[],...network},speed=num(walkSpeed,3.1,1.3,4.4);
 const walkMax=num(maxWalk,190,30,400),transferMax=num(maxTransferWalk,155,20,250),sourceLimit=num(maxSiteAccess,48,6,80);
 const a=makeAccess(net,isLand,sourceLimit,extraWalking),lines=[],stops=new Map(),liveBusStops=Object.create(null),liveBusTrips=Object.create(null);
 for(const bus of net.buses.slice(0,75)){
  if(bus?.id==null)continue;
  const r=addBusLine(bus,net,a,lines,stops,liveBusStops,depotLines?.has?.(bus.id)||depotLines?.includes?.(bus.id),loads,frequency);
  if(r)liveBusTrips[bus.id]=r;
 }
 const models=transitMetrics||(transit?.lines&&!Array.isArray(transit.lines)?transit:null);
 for(const model of Object.values(models?.lines||{}))addMetroLine(model,a,lines,stops);
 const rides=new Map(),services=new Map(lines.map(l=>[l.id,l]));
 for(const l of lines){
  for(let i=0;i<l.stops.length-1;i++){
   let t=0;
   for(let j=i+1;j<l.stops.length;j++){
    t+=l.ride[j-1];
    if(!rides.has(l.stops[i]))rides.set(l.stops[i],[]);
    rides.get(l.stops[i]).push({line:l.id,from:l.stops[i],to:l.stops[j],ride:t});
   }
  }
 }
 const transfers=[],transferBy=new Map(),possible=[...stops.values()].filter(s=>s.anchor);
 for(let i=0;i<possible.length;i++)for(let j=i+1;j<possible.length;j++){
  const p=possible[i],q=possible[j];
  if(p.mode===q.mode&&p.id!==q.id&&(rides.get(p.id)||[]).some(r=>r.to===q.id)&&N.dist(p,q)>transferMax*.65)continue;
  // Identical physical road-bus stops already share a key. Separate platforms
  // can only offer a transfer by tracing a physically connected sidewalk.
  const path=a.walking(p.anchor,q.anchor,transferMax);if(!path)continue;
  const seconds=Math.max(0,Math.round(path.metres/speed+2));
  for(const [from,to] of [[p.id,q.id],[q.id,p.id]]){
   const value={from,to,seconds,metres:path.metres};transfers.push(value);
   if(!transferBy.has(from))transferBy.set(from,[]);transferBy.get(from).push(value);
  }
 }
 const parkConf=parkingConfig?.configs?parkingConfig:P.build(net,parking||P.normalize());
 const parkSites=(parkConf.configs||[]).filter(s=>s&&s.type!=='curb'&&s.spots>0).map(s=>{
  const anchor=a.anchor(s),node=a.nodeAt.get(s.node);
  return anchor&&node?{...s,anchor}:null;
 }).filter(Boolean);
 const carGraph=N.graph(net,'car',loads),roadMemo=new Map();
 function drives(from,node){
  if(!from||!node)return null;let best=null;
  for(const c of from.connect){
   // A car cannot start upstream by turning against a one-way frontage.
   if(from.edge?.oneway&&c.node!==from.edge.b)continue;
   const key=JSON.stringify([c.node,node,from.edge?.id??null]);
   if(!roadMemo.has(key))roadMemo.set(key,N.path(carGraph,c.node,node,from.edge?.id??null));
   const p=roadMemo.get(key);if(!p?.length)continue;
   const secs=p.reduce((z,q)=>z+roadTime(a.edgeAt.get(q.edge),loads)+.7,0)
    +(from.edge?c.d/Math.max(3.5,(from.edge.speed||36)/3.6):0)+from.off/4.5;
   if(!best||secs<best.drive)best={roadPath:p.map(q=>({...q})),drive:secs,node,origin:c.node};
  }
  return best;
 }
 function entries(anchor,max){
  const out=new Map();
  for(const p of possible){
   const w=a.walking(anchor,p.anchor,max);
   if(w)out.set(p.id,w);
  }
  return out;
 }
 function findSchedule(origins,exits,maxLegs){
  let best=null;const q=[],seen=new Map();
  const push=(x)=>{
   let k=JSON.stringify([x.stop,x.legs.length,x.legs.at(-1)?.line||'']);
   if((seen.get(k)??Infinity)<=x.score)return;seen.set(k,x.score);x.key=k;q.push(x);
  };
  for(const start of origins){push({stop:start.stop,walk:start.seconds,walkPath:start.path,score:start.seconds+(start.pr?.cost||0),legs:[],pr:start.pr||null});}
  while(q.length){
   q.sort((a,b)=>b.score-a.score);const x=q.pop();
   if(seen.get(x.key)!==x.score||x.score>=(best?.seconds??Infinity))continue;
   const finish=exits.get(x.stop);
   if(x.legs.length&&finish){
    const seconds=x.score+finish.metres/speed;
    if(seconds<(best?.seconds??Infinity))best={ok:true,mode:x.pr?'pr':'transit',legs:x.legs.map(({line,from,to})=>({line,from,to})),
      walk:Math.round(x.walk),walkPath:x.walkPath,lastWalk:Math.round(finish.metres/speed),lastWalkPath:finish.path,
      seconds:Math.round(seconds),pr:x.pr?{site:x.pr.site,node:x.pr.node,origin:x.pr.origin,roadPath:x.pr.roadPath,drive:Math.round(x.pr.drive),walk:Math.round(x.walk)}:null};
   }
   if(x.legs.length>=maxLegs)continue;
   // One physical transfer at a time, as encoded by CommuteOperations. A
   // first walk is already planned from the origin directly to its platform.
   const boarding=[{to:x.stop,seconds:0},...(x.legs.length?transferBy.get(x.stop)||[]:[])];
   for(const b of boarding)for(const leg of rides.get(b.to)||[]){
    if(x.legs.some(l=>l.line===leg.line))continue;
    const m=services.get(leg.line),cost=b.seconds+leg.ride+m.headway/2;
    push({...x,stop:leg.to,score:x.score+cost,legs:[...x.legs,leg]});
   }
  }
  return best;
 }
 function plan({from,to,allowParking=true,prefer='fastest',maxTransfers=defaultTransfers, maxWalk:override,
                parkingFeeLimit=10}={}){
  const start=a.anchor(from),end=a.anchor(to);
  if(!start||!end)return {ok:false,reason:'出发地或目的地没有可达普通道路'};
  if(!lines.length)return {ok:false,reason:'没有可用的公交或地铁'};
  const cap=num(override,walkMax,30,400),maxLegs=1+Math.trunc(num(maxTransfers,2,0,3));
  const exits=entries(end,cap);if(!exits.size)return {ok:false,reason:'目的地没有可走到的公交或地铁站'};
  const starts=[...entries(start,cap)].map(([stop,w])=>({stop,seconds:w.metres/speed,path:w.path}));
  const plain=findSchedule(starts,exits,maxLegs);
  let parkRoute=null;
  if(allowParking&&parkSites.length){
   // We only examine affordable facilities accessible by a legal directed
   // car route; the actual vehicle will re-check vacancy and gate delay.
   const pr=[];
   for(const site of parkSites){
    if((site.fee||0)>parkingFeeLimit)continue;
    const d=drives(start,site.node);if(!d)continue;
    const cost=d.drive+6+(site.entry||0)+(site.fee||0)*1.75;
    for(const [stop,w] of entries(site.anchor,Math.min(cap,125))){
     pr.push({stop,seconds:w.metres/speed,path:w.path,pr:{...d,cost,site:site.id}});
    }
   }
   parkRoute=findSchedule(pr,exits,maxLegs);
  }
  const best=(prefer==='pr'&&parkRoute)||(prefer==='transit'&&plain)||(plain&&parkRoute?(plain.seconds<=parkRoute.seconds?plain:parkRoute):plain||parkRoute);
  if(!best)return {ok:false,reason:'站点间无可行线路；P+R 需要已接通的公共场库'};
  return {...best,alternatives:{transit:plain?.seconds??null,pr:parkRoute?.seconds??null}};
 }
 return {lines,transfers,plan,stops:Object.fromEntries([...stops].map(([id,{anchor,...s}])=>[id,{...s,accessible:!!anchor}])),liveBusStops,liveBusTrips};
}
return {create,busStop,metroStop};
});
