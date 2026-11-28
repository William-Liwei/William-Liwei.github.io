(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.Transit=api})(globalThis,()=>{
'use strict';
const MODES=Object.freeze({
 rail:{name:'地面铁路',station:'railStation',depot:'railDepot',track:true,speed:110,capacity:150,freight:92,upkeep:680,vehicle:'train',color:'#8046a4'},
 metro:{name:'地铁',station:'metroStation',depot:'metroDepot',track:true,speed:84,capacity:165,upkeep:510,vehicle:'metro',color:'#685bd6'},
 tram:{name:'有轨电车',station:'tramStop',depot:'tramDepot',track:true,speed:49,capacity:72,upkeep:275,vehicle:'tram',color:'#e98729'},
 ferry:{name:'客运轮渡',station:'ferryTerminal',water:true,speed:48,capacity:82,upkeep:280,vehicle:'ferry',color:'#1d809c'},
 ship:{name:'货轮',station:'cargoPort',water:true,speed:44,capacity:190,freightOnly:true,upkeep:510,vehicle:'ship',color:'#4560a5'},
 plane:{name:'客运航班',station:'airport',air:true,speed:240,capacity:132,upkeep:1100,vehicle:'plane',color:'#5579c4'},
 cargoPlane:{name:'货运航班',station:'cargoAirport',air:true,speed:228,capacity:140,freightOnly:true,upkeep:1080,vehicle:'cargoPlane',color:'#a16b44'}
});
const FACILITIES=Object.freeze({
 railStation:{name:'铁路客货站',mode:'rail',cost:16800,monthly:550,access:160,radius:16,color:'#8046a4'},
 metroStation:{name:'地铁站',mode:'metro',cost:13800,monthly:430,access:122,radius:15,color:'#685bd6'},
 tramStop:{name:'电车站',mode:'tram',cost:4400,monthly:105,access:92,radius:9,color:'#e98729'},
 ferryTerminal:{name:'客运轮渡站',mode:'ferry',cost:9500,monthly:275,access:145,radius:12,shore:true,color:'#1d809c'},
 cargoPort:{name:'货运港口',mode:'ship',cost:19600,monthly:630,access:190,radius:19,shore:true,color:'#4560a5'},
 airport:{name:'客运机场',mode:'plane',cost:39000,monthly:1400,access:220,radius:39,runway:true,color:'#5579c4'},
 cargoAirport:{name:'货运机场',mode:'cargoPlane',cost:35500,monthly:1220,access:235,radius:37,runway:true,color:'#a16b44'},
 railDepot:{name:'铁路车辆段',mode:'rail',depot:true,cost:12300,monthly:410,radius:20,color:'#ac7c9c'},
 metroDepot:{name:'地铁车辆段',mode:'metro',depot:true,cost:12800,monthly:390,radius:18,color:'#9285e0'},
 tramDepot:{name:'电车停车场',mode:'tram',depot:true,cost:6800,monthly:175,radius:15,color:'#d7a766'},
 busDepot:{name:'公交车场',mode:'bus',depot:true,cost:5850,monthly:155,radius:16,color:'#70b0a4'},
 shipyard:{name:'船坞',mode:'water',depot:true,cost:10300,monthly:320,radius:16,shore:true,color:'#5689a5'},
 airHangar:{name:'飞机维修库',mode:'air',depot:true,cost:12500,monthly:430,radius:24,color:'#9c9aaa'},
 cargoYard:{name:'货物转运场',mode:'freight',depot:true,cost:6900,monthly:190,radius:15,color:'#aa8963'}
});
const capLimits={stations:130,tracks:160,lines:64};
const create=()=>({version:1,next:1,stations:[],tracks:[],lines:[]});
const fail=reason=>({ok:false,reason});
const finite=Number.isFinite, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clonePoint=p=>({x:+p.x,y:+p.y,z:finite(p.z)?p.z:0});
const pointValid=p=>p&&finite(p.x)&&finite(p.y)&&Math.abs(p.x)<3000&&Math.abs(p.y)<3000&&(!('z' in p)||finite(p.z));
const sum=(a,b)=>a+b;
const len=p=>p.slice(1).reduce((s,q,i)=>s+dist(q,p[i]),0);
const noWater=()=>false;
const opt=(o={})=>({width:1200,height:800,water:noWater,...o});
const inner=(p,o)=>pointValid(p)&&p.x>=0&&p.y>=0&&p.x<=o.width&&p.y<=o.height;
const land=(p,o)=>inner(p,o)&&!o.water(p)&&(!o.isBuildable||o.isBuildable(p));
const interpolate=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:(a.z||0)+((b.z||0)-(a.z||0))*t});
function everySample(a,b,step,fn){const n=Math.max(1,Math.ceil(dist(a,b)/step));for(let i=0;i<=n;i++)if(!fn(interpolate(a,b,i/n)))return false;return true}
function nearestWater(p,o,radius=50){
 if(o.water(p))return p;
 for(let r=3;r<=radius;r+=3){let n=Math.ceil(2*Math.PI*r/5);for(let i=0;i<n;i++){let angle=i/n*2*Math.PI,q={x:p.x+Math.cos(angle)*r,y:p.y+Math.sin(angle)*r,z:0};if(inner(q,o)&&o.water(q))return q;}}
 return null;
}
function stationAccess(s,o){
 if(typeof o.roadAccess==='function')return !!o.roadAccess(s,FACILITIES[s.type]?.radius||12);
 return true;
}
function gates(options={}){
 const o=opt(options),out=[
  {id:'@rail-west',name:'西部铁路外联',type:'railStation',x:0,y:o.height*.36,z:0,external:true,mode:'rail'},
  {id:'@rail-east',name:'东部铁路外联',type:'railStation',x:o.width,y:o.height*.64,z:0,external:true,mode:'rail'},
  {id:'@air-northwest',name:'西北空域',type:'airport',x:-100,y:o.height*.22,z:50,external:true,mode:'plane'},
  {id:'@air-southeast',name:'东南空域',type:'airport',x:o.width+100,y:o.height*.73,z:50,external:true,mode:'plane'},
  {id:'@cargo-northeast',name:'东北货运空域',type:'cargoAirport',x:o.width+110,y:o.height*.24,z:55,external:true,mode:'cargoPlane'},
  {id:'@cargo-southwest',name:'西南货运空域',type:'cargoAirport',x:-110,y:o.height*.78,z:55,external:true,mode:'cargoPlane'}
 ];
 for(const [side,w] of [['north',0],['south',o.height],['west',0],['east',o.width]]){
  const vertical=side==='north'||side==='south',end=vertical?o.width:o.height;
  let spans=[],begin=null;
  for(let c=0;c<=end;c+=5){
   const p=vertical?{x:c,y:w}:{x:w,y:c},wet=o.water(p);
   if(wet&&begin==null)begin=c;
   if((!wet||c+5>end)&&begin!=null){if(c-begin>=15)spans.push([begin,c-(wet?0:5)]);begin=null;}
  }
  if(!spans.length)continue;
  spans.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));const mid=(spans[0][0]+spans[0][1])/2;
  out.push({id:'@ship-'+side,name:({north:'北',south:'南',east:'东',west:'西'})[side]+'侧外航道',type:'cargoPort',mode:'ship',x:vertical?mid:w,y:vertical?w:mid,z:0,external:true});
 }
 return out;
}
function stopOptions(state,mode,options={}){const m=MODES[mode];return m?[...state.stations.filter(s=>s.type===m.station).map(s=>({...s,name:s.name||FACILITIES[s.type].name+' '+s.id})),...gates(options).filter(s=>s.mode===mode)]:[];}
function addStation(state,data,options={}){
 const o=opt(options),d=Object.hasOwn(FACILITIES,data?.type)?FACILITIES[data.type]:null,p=data;
 if(!d)return fail('未知交通设施');
 if(state.stations.length>=capLimits.stations)return fail('交通设施达到上限');
 if(!inner(p,o))return fail('设施超出地图范围');
 let wet=null;
 if(d.shore){
  if(o.water(p))return fail('请把港口或站房放在岸边陆地上');
  wet=nearestWater(p,o,47);if(!wet)return fail('港口和船站必须临可通航水域');
 }else if(!land(p,o))return fail('此设施只能建在陆地');
 if(d.runway){
  for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4){
   if(!land({x:p.x+Math.cos(angle)*36,y:p.y+Math.sin(angle)*36},o))return fail('机场周边至少需要 36 米完整陆地作为跑道净空');
  }
 }
 if(state.stations.some(s=>dist(s,p)<Math.max(14,.60*((FACILITIES[s.type]?.radius||12)+d.radius))))return fail('与已有交通设施重叠');
 const id='S'+state.next++,s={id,type:data.type,...clonePoint(data),...(wet?{wet:clonePoint(wet)}:{})};
 state.stations.push(s);return {ok:true,cost:d.cost,id,station:s};
}
function nearSegment(a,b,p){const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/d,0,1):0;const hit=interpolate(a,b,t);return {...hit,t,distance:dist(hit,p)};}
function projectTrack(tracks,p,limit=Infinity){
 let best=null,distBest=limit;
 for(const t of tracks)for(let i=1;i<t.points.length;i++){const q=nearSegment(t.points[i-1],t.points[i],p);if(q.distance<=distBest){distBest=q.distance;best={...q,id:t.id,seg:i-1};}}
 return best;
}
function addTrack(state,data,options={}){
 const o=opt(options),mode=data?.mode,raw=data?.points,m=Object.hasOwn(MODES,mode)&&MODES[mode];
 if(!m?.track)return fail('只有铁路、地铁和有轨电车需要轨道');
 if(state.tracks.length>=capLimits.tracks)return fail('轨道达到上限');
 if(!Array.isArray(raw)||raw.length<2||raw.length>180||!raw.every(p=>inner(p,o)))return fail('轨道需要 2–180 个有效地图坐标');
 const pts=raw.filter((p,i)=>i===0||dist(p,raw[i-1])>.15).map(clonePoint);
 if(pts.length<2||len(pts)<18)return fail('轨道至少 18 米');
 if(mode==='metro')for(const p of pts)p.z=Math.min(-12,p.z||0);
 const choices=state.tracks.filter(s=>s.mode===mode);
 for(const k of [0,pts.length-1]){
  const existing=projectTrack(choices,pts[k],7);
  if(existing&&Math.abs(existing.z-pts[k].z)<=2)pts[k]={x:existing.x,y:existing.y,z:existing.z};
 }
 for(let i=1;i<pts.length;i++){
  const a=pts[i-1],b=pts[i];
  if(dist(a,b)<1)return fail('相邻轨道控制点太近');
  if(Math.abs(a.z-b.z)>dist(a,b)*.16+.01)return fail('轨道坡度不能超过 16%');
  if(mode!=='metro'&&!everySample(a,b,4,p=>!o.water(p)||p.z>=10))return fail('跨水铺轨需要至少 10 米高的桥面，或改用地铁');
  const q=projectTrack(choices,interpolate(a,b,.5),1.1);
  if(q&&Math.abs(q.z-interpolate(a,b,.5).z)<=1.1)return fail('该轨道与已有同类轨道重叠');
 }
 const l=len(pts),vertical=pts.some(p=>Math.abs(p.z)>3)?1.3:1,cost=Math.ceil(l*({rail:72,metro:132,tram:41})[mode]*vertical);
 const id='T'+state.next++,track={id,mode,points:pts,length:l};state.tracks.push(track);
 return {ok:true,id,track,cost};
}
function joinGraph(tracks,attachments){
 // Same-mode glued endpoints and T connections. Unrelated X crossings, especially at another height, are not switches.
 const pieces=[],nodeList=[],nodeBins=new Map(),segmentBins=new Map(),pById=new Map(),vertIds=new Map(),joinVertices=new Set(),near=2,nsize=2,ssize=48;
 const assign=(p,local,join)=>{
  if(local&&vertIds.has(local))return vertIds.get(local);
  if(!join){const i=nodeList.length;nodeList.push(clonePoint(p));if(local)vertIds.set(local,i);return i;}
  let x=Math.floor(p.x/nsize),y=Math.floor(p.y/nsize);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
   const bucket=nodeBins.get((x+dx)+','+(y+dy));if(!bucket)continue;
   for(const n of bucket){const q=nodeList[n];if(dist(q,p)<=near&&Math.abs(q.z-p.z)<=1.6){if(local)vertIds.set(local,n);return n;}}
  }
  const n=nodeList.length;nodeList.push(clonePoint(p));const key=x+','+y;
  if(!nodeBins.has(key))nodeBins.set(key,[]);nodeBins.get(key).push(n);if(local)vertIds.set(local,n);return n;
 };
 const graph=[],anchors=new Map();
 for(const t of tracks)for(let i=1;i<t.points.length;i++){
  const a=t.points[i-1],b=t.points[i],s={id:t.id,seg:i-1,a,b,cuts:[{t:0,...a,local:t.id+'/'+(i-1)},{t:1,...b,local:t.id+'/'+i}]};pieces.push(s);
  if(i===1)joinVertices.add(t.id+'/0');if(i===t.points.length-1)joinVertices.add(t.id+'/'+i);
  pById.set(t.id+':'+(i-1),s);
  for(let x=Math.floor((Math.min(a.x,b.x)-2)/ssize);x<=Math.floor((Math.max(a.x,b.x)+2)/ssize);x++)
   for(let y=Math.floor((Math.min(a.y,b.y)-2)/ssize);y<=Math.floor((Math.max(a.y,b.y)+2)/ssize);y++){
    const key=x+','+y;if(!segmentBins.has(key))segmentBins.set(key,[]);segmentBins.get(key).push(s);
   }
 }
 const ends=tracks.flatMap(t=>[t.points[0],t.points.at(-1)]);
 for(const p of ends){
  for(const s of segmentBins.get(Math.floor(p.x/ssize)+','+Math.floor(p.y/ssize))||[]){
   const q=nearSegment(s.a,s.b,p);
   if(q.distance>=1.8||Math.abs(q.z-p.z)>1.6)continue;
   if(q.t<1e-4||dist(q,s.a)<.15)joinVertices.add(s.id+'/'+s.seg);
   else if(q.t>1-1e-4||dist(q,s.b)<.15)joinVertices.add(s.id+'/'+(s.seg+1));
   else s.cuts.push({...q,join:true});
  }
 }
 for(const [id,link] of attachments){
  if(!link)continue;
  const s=pById.get(link.id+':'+link.seg);
  if(!s)continue;
  s.cuts.push({...link,anchor:id});
 }
 for(const s of pieces){
  s.cuts.sort((a,b)=>a.t-b.t||Number(!!b.local)-Number(!!a.local)||Number(!!b.join)-Number(!!a.join));let prev=null,prevT=-1;
  for(const v of s.cuts){
   const n=Math.abs(v.t-prevT)<1e-7?prev:assign(v,v.local,!!v.join||joinVertices.has(v.local));
   if(v.anchor)anchors.set(v.anchor,n);
   if(prev!=null&&n!==prev){let w=dist(nodeList[n],nodeList[prev]);(graph[n]??=[]).push({to:prev,w});(graph[prev]??=[]).push({to:n,w});}
   prev=n;prevT=v.t;
  }
 }
 let component=new Map(),next=0;
 for(let i=0;i<nodeList.length;i++)if(!component.has(i)){let q=[i];component.set(i,next);for(let c=0;c<q.length;c++)for(const e of graph[q[c]]||[])if(!component.has(e.to)){component.set(e.to,next);q.push(e.to)}next++;}
 return {graph,nodes:nodeList,anchors,component};
}
function dijkstraTree(g,a,b,accept=()=>true){
 const scores=new Map([[a,0]]),back=new Map(),heap=[];
 function push(v){let i=heap.length;heap.push(v);while(i){const j=(i-1)>>1;if(heap[j][0]<=v[0])break;heap[i]=heap[j];i=j;}heap[i]=v;}
 function pop(){const first=heap[0],v=heap.pop();if(!heap.length)return first;let i=0,k;while((k=2*i+1)<heap.length){if(k+1<heap.length&&heap[k+1][0]<heap[k][0])k++;if(v[0]<=heap[k][0])break;heap[i]=heap[k];i=k;}heap[i]=v;return first}
 push([0,a]);
 while(heap.length){
  const [d,k]=pop();if(d!==scores.get(k))continue;if(k===b)break;
  for(const e of g[k]||[]){
   if(!accept(e))continue;const n=e.to,d2=d+e.w;
   if(d2<(scores.get(n)??Infinity)){scores.set(n,d2);back.set(n,{edge:e,from:k});push([d2,n]);}
  }
 }
 return {scores,back};
}
function recoverRoute(tree,a,b){
 if(a===b)return [];if(!tree.scores.has(b))return null;
 const path=[];for(let n=b;n!==a;){const v=tree.back.get(n);if(!v)return null;path.push(v.edge);n=v.from;}return path.reverse();
}
function dijkstra(g,a,b){if(a==null||b==null)return null;return recoverRoute(dijkstraTree(g,a,b),a,b);}
function waterRoute(a,b,options={}){
 const o=opt(options);
 if(!a||!b)return null;
 const wet=p=>inner(p,o)&&o.water(p);
 if(!wet(a)||!wet(b))return null;
 if(typeof o.waterPath==='function'){
  const ext=o.waterPath(a,b);
  if(Array.isArray(ext)&&ext.length>1&&dist(ext[0],a)<3&&dist(ext.at(-1),b)<3&&ext.every(p=>wet(p))&&ext.slice(1).every((p,i)=>everySample(ext[i],p,4,wet)))return ext.map(clonePoint);
 }
 if(everySample(a,b,4,wet))return [a,b];
 const step=12,w=Math.floor(o.width/step)+1,h=Math.floor(o.height/step)+1,n=w*h;
 const decode=i=>({x:(i%w)*step,y:Math.floor(i/w)*step,z:0});
 function pick(p){
  let best=null,bd=Infinity,r=3,c=Math.round(p.x/step),l=Math.round(p.y/step);
  for(let y=Math.max(0,l-r);y<=Math.min(h-1,l+r);y++)for(let x=Math.max(0,c-r);x<=Math.min(w-1,c+r);x++){
   const i=y*w+x,q=decode(i),d=dist(p,q);
   if(d<bd&&wet(q)&&everySample(p,q,4,wet)){best=i;bd=d;}
  }
  return best;
 }
 const s=pick(a),goal=pick(b);
 if(s==null||goal==null)return null;
 const back=new Int32Array(n).fill(-2),queue=new Int32Array(n);
 back[s]=-1;queue[0]=s;let tail=1,head=0;
 const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
 while(head<tail&&back[goal]===-2){
  const i=queue[head++],p=decode(i),x=i%w,y=Math.floor(i/w);
  for(const [dx,dy] of dirs){
   const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;
   const j=yy*w+xx;if(back[j]!==-2)continue;
   const q=decode(j);
   if(!everySample(p,q,4,wet))continue;
   back[j]=i;queue[tail++]=j;
  }
 }
 if(back[goal]===-2)return null;
 let raw=[b];for(let i=goal;i>=0;i=back[i])raw.push(decode(i));raw.push(a);raw.reverse();
 let out=[a],i=0;
 while(i<raw.length-1){
  let j=i+1;while(j+1<raw.length&&everySample(raw[i],raw[j+1],4,wet))j++;
  if(dist(out.at(-1),raw[j])>.1)out.push(raw[j]);i=j;
 }
 return out;
}
function linePath(state,line,opts,setup){
 const m=MODES[line.mode],bad=(reason)=>({valid:false,reason,path:[],segments:[],depots:0});
 if(!m||!Array.isArray(line.stops)||line.stops.length<2||line.stops.length>12)return bad('线路至少需要两站，最多 12 站');
 const points=line.stops.map(id=>setup.byStation.get(id));if(points.some(s=>!s||s.type!==m.station||s.external&&s.mode!==line.mode))return bad('路线包含不相容的站点或外联端口');
 if(points.every(s=>s.external))return bad('线路至少需要一座本地设施');
 if(points.some(s=>!s.external&&!stationAccess(s,opts)))return bad('有站点未接入道路');
 if(points.some(s=>opts.closedStations?.includes?.(s.id)))return bad('有站点暂停开放');
 let segments=[],depots=0;
 if(m.track){
  const info=setup.rails[line.mode];
  const ids=points.map(s=>info.anchors.get(s.id));
  if(ids.some(n=>n==null)||new Set(ids).size!==ids.length)return bad('每个站点都要接入不同的相容轨道节点');
  depots=setup.depots[line.mode].filter(s=>info.component.get(info.anchors.get(s.id))===info.component.get(ids[0])&&stationAccess(s,opts)).length;
  if(!depots)return bad('缺少接入同一轨道网络的车辆段');
  for(let i=1;i<ids.length;i++){
   const p=dijkstra(info.graph,ids[i-1],ids[i]);if(!p?.length)return bad('站间轨道未连通或在不同高程');
   segments.push([info.nodes[ids[i-1]],...p.map(e=>info.nodes[e.to])]);
  }
 }else if(m.water){
  const wet=s=>s.external?s:s.wet&&opts.water(s.wet)?s.wet:nearestWater(s,opts,47);
  const waters=points.map(wet);if(waters.some(p=>!p))return bad('站点附近没有航道');
  for(let i=1;i<waters.length;i++){
   const key=points[i-1].id+':'+points[i].id;
   if(!setup.waterPaths.has(key))setup.waterPaths.set(key,waterRoute(waters[i-1],waters[i],opts));
   let p=setup.waterPaths.get(key);if(!p||len(p)<16)return bad('两站之间没有相通的航道');segments.push(p);
  }
  depots=state.stations.filter(s=>s.type==='shipyard'&&stationAccess(s,opts)&&points.some(p=>!p.external&&dist(p,s)<105)).length;
 }else if(m.air){
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],l=dist(a,b);if(l<135)return bad('航段太短，机场之间至少需要 135 米');
   const turn=Math.min(85,l*.15),n=10,p=[];
   for(let j=0;j<=n;j++){const t=j/n,q=interpolate(a,b,t);q.z=Math.max(q.z,Math.sin(Math.PI*t)*turn);p.push(q);}
   segments.push(p);
  }
  depots=state.stations.filter(s=>s.type==='airHangar'&&stationAccess(s,opts)&&points.some(p=>!p.external&&dist(p,s)<115)).length;
 }
 return {valid:true,reason:'',path:segments.flatMap((r,i)=>i?r.slice(1):r),segments,depots,points};
}
const setups=new WeakMap();
function makeSetup(state,o){
 const prev=setups.get(state),finger=[state.next,state.stations.length,state.tracks.length,state.lines.length].join('/');
 if(prev&&prev.finger===finger&&prev.width===o.width&&prev.height===o.height&&prev.water===o.water&&prev.waterPath===o.waterPath)return prev.result;
 const g=gates(o),all=[...state.stations,...g],byStation=new Map(all.map(p=>[p.id,p])),rails=Object.create(null),depots=Object.create(null);
 for(const mode of Object.keys(MODES).filter(k=>MODES[k].track)){
  const m=MODES[mode],tracks=state.tracks.filter(t=>t.mode===mode);
  depots[mode]=state.stations.filter(s=>s.type===m.depot);
  const attachments=all.filter(s=>s.type===m.station&&(!s.external||s.mode===mode)||s.type===m.depot).map(s=>[s.id,projectTrack(tracks,s,s.external?3:s.type===m.depot?62:48)]);
  rails[mode]=joinGraph(tracks,attachments);
 }
 const result={gates:g,byStation,rails,depots,waterPaths:new Map()};setups.set(state,{finger,width:o.width,height:o.height,water:o.water,waterPath:o.waterPath,result});return result;
}
function addLine(state,data,options={}){
 if(state.lines.length>=capLimits.lines)return fail('线路达到上限');
 if(!Object.hasOwn(MODES,data?.mode)||!Array.isArray(data.stops)||data.stops.length<2||data.stops.length>12||new Set(data.stops).size!==data.stops.length)return fail('请选择 2–12 个彼此不同、模式匹配的站点');
 const o=opt(options),test={mode:data.mode,stops:[...data.stops]},result=linePath(state,test,o,makeSetup(state,o));
 if(!result.valid)return fail(result.reason);
 const m=MODES[data.mode],l=len(result.path),cost=Math.round(m.upkeep*1.8+l*.7);
 const id='L'+state.next++,line={id,...test};state.lines.push(line);
 return {ok:true,cost,id,line,path:result.path};
}
function remove(state,id){
 for(const field of ['lines','stations','tracks']){
  const i=state[field].findIndex(v=>v.id===id);
  if(i>=0){state[field].splice(i,1);return {ok:true,cost:0,id};}
 }
 return fail('未找到要拆除的项目');
}
function normalize(raw,options={}){
 if(raw==null)return create();
 if(raw.version!==1||!['stations','tracks','lines'].every(k=>Array.isArray(raw[k])&&raw[k].length<=capLimits[k]))throw Error('无效交通存档');
 const o=opt(options),ids=new Set(),reserve=(id,prefix)=>{if(typeof id!=='string'||!new RegExp('^'+prefix+'[1-9][0-9]{0,8}$').test(id)||ids.has(id))throw Error('交通存档有重复或无效编号');ids.add(id);};
 const state=create();
 for(const s of raw.stations){
  if(!inner(s,o)||!Object.hasOwn(FACILITIES,s.type))throw Error('交通设施数据不合法');
  reserve(s.id,'S');const item={id:s.id,type:s.type,...clonePoint(s)};if(FACILITIES[s.type].shore)item.wet=nearestWater(s,o,47);state.stations.push(item);
 }
 for(const t of raw.tracks){
  if(!Object.hasOwn(MODES,t.mode)||!MODES[t.mode].track||!Array.isArray(t.points)||t.points.length<2||t.points.length>180||!t.points.every(p=>inner(p,o))||len(t.points)<1)throw Error('轨道数据不合法');
  reserve(t.id,'T');const points=t.points.map(clonePoint);state.tracks.push({id:t.id,mode:t.mode,points,length:len(points)});
 }
 for(const l of raw.lines){
  if(!Object.hasOwn(MODES,l.mode)||!Array.isArray(l.stops)||l.stops.length<2||l.stops.length>12||new Set(l.stops).size!==l.stops.length||l.stops.some(s=>typeof s!=='string'||!/^S[1-9][0-9]{0,8}$|^@[a-z-]{4,25}$/.test(s)))throw Error('线路数据不合法');
  reserve(l.id,'L');state.lines.push({id:l.id,mode:l.mode,stops:[...l.stops]});
 }
 state.next=Math.max(1,...[...ids].map(id=>parseInt(id.slice(1),10)+1),Number.isSafeInteger(raw.next)&&raw.next>0&&raw.next<1e9?raw.next:1);
 return state;
}
function stationDemand(byStation,stationIds,civic,freight){
 const ids=[...stationIds].filter(id=>!byStation.get(id).external);
 const assigned=new Map([...stationIds].map(id=>[id,{supply:0,demand:0}]));
 for(const id of stationIds)if(byStation.get(id).external){assigned.set(id,{supply:freight?95:60,demand:freight?190:122});}
 for(const l of civic?.lots||[]){
  if(!l||l.level<=0||!finite(l.occupants)||l.occupants<=.2)continue;
  let winner=null,distance=Infinity;
  for(const id of ids){const s=byStation.get(id),r=FACILITIES[s.type].access,d=dist(l,s)/r;if(d<1&&d<distance){distance=d;winner=id}}
  if(!winner)continue;
  const a=assigned.get(winner),attract=.86-.28*distance;
  if(freight){if(l.type==='industrial')a.supply+=l.occupants*.72*attract;if(l.type==='commercial')a.demand+=l.occupants*.52*attract;if(l.type==='industrial')a.demand+=l.occupants*.25*attract;}
  else {if(l.type==='residential')a.supply+=l.occupants*.54*attract;else a.demand+=l.occupants*.63*attract;}
 }
 return assigned;
}
function allocate(lines,setup,civic,freight){
 const graph=Object.create(null),stationIds=new Set(),eligible=lines.filter(l=>l.valid&&(freight?l.freightCapacity>0:l.passengerEnabled&&!MODES[l.mode].freightOnly));
 for(const l of eligible){
  for(const p of l.points)stationIds.add(p.id);
  for(let i=1;i<l.points.length;i++){
   const a=l.points[i-1].id,b=l.points[i].id,w=len(l.segments[i-1])/MODES[l.mode].speed+.36;
   (graph[a]??=[]).push({to:b,w,line:l.id});(graph[b]??=[]).push({to:a,w,line:l.id});
  }
 }
 // A short walk (or transfer between freight terminals) permits multimodal transfers.
 const stations=[...stationIds].map(id=>setup.byStation.get(id)).filter(s=>!s.external);
 for(let i=0;i<stations.length;i++)for(let j=i+1;j<stations.length;j++){
  const a=stations[i],b=stations[j],d=dist(a,b);if(d>(freight?100:124))continue;
  const w=d/(freight?30:24)+(freight?1.0:.54);
  (graph[a.id]??=[]).push({to:b.id,w,transfer:true});(graph[b.id]??=[]).push({to:a.id,w,transfer:true});
 }
 const d=stationDemand(setup.byStation,stationIds,civic,freight),out=Object.create(null),regional=new Map(),
  remaining=new Map(eligible.map(l=>[l.id,freight?l.freightCapacity:l.capacity]));
 const origins=[...d].filter(([,o])=>o.supply>=.6).sort((a,b)=>b[1].supply-a[1].supply).slice(0,35);
 const destinations=[...d].filter(([,o])=>o.demand>=.6).sort((a,b)=>b[1].demand-a[1].demand).slice(0,42);
 let intra=0,outbound=0,inbound=0,transfers=0;
 for(const [a,stock] of origins){
  const old=setup.byStation.get(a),choices=[],tree=dijkstraTree(graph,a,undefined,e=>!e.line||(remaining.get(e.line)||0)>0);
  for(const [b,needs] of destinations){
   if(a===b||needs.demand<.6)continue;
   const dest=setup.byStation.get(b);if(old.external&&dest.external)continue;
   const p=recoverRoute(tree,a,b);
   if(!p?.some(v=>v.line))continue;
   const cost=p.map(v=>v.w).reduce(sum,0);
   if(!freight&&cost>35)continue;
   const services=[...new Set(p.map(e=>e.line).filter(Boolean))];
   if(services.some(k=>!remaining.get(k)))continue;
   choices.push({needs,cost,services,dest,path:p});
  }
  choices.sort((a,b)=>a.cost-b.cost);
  for(const c of choices.slice(0,9)){
   const n=Math.min(Math.round(stock.supply),Math.round(c.needs.demand),...c.services.map(l=>remaining.get(l)));
   if(n<=0)continue;
   stock.supply-=n;c.needs.demand-=n;
   for(const k of c.services){remaining.set(k,remaining.get(k)-n);out[k]=(out[k]||0)+n;}
   if(old.external)inbound+=n;else if(c.dest.external)outbound+=n;else intra+=n;
   if(!freight&&(old.external||c.dest.external)){
    let from=a;
    for(let i=0;i<c.path.length;){
     const start=from, id=c.path[i].line;
     from=c.path[i++].to;
     while(id&&c.path[i]?.line===id)from=c.path[i++].to;
     if(!id||setup.byStation.get(start).external===setup.byStation.get(from).external)continue;
     const key=JSON.stringify([id,start,from]),row=regional.get(key)||{line:id,from:start,to:from,count:0};
     row.count+=n;regional.set(key,row);
    }
   }
   if(c.services.length>1)transfers+=n;
  }
 }
 return {byLine:out,intra,inbound,outbound,transfers,regional:[...regional.values()]};
}
function evaluate(state,civic,options={}){
 const o=opt(options),setup=makeSetup(state,o),models=[];
 for(const line of state.lines){
  const p=linePath(state,line,o,setup),m=MODES[line.mode];if(!m)continue;
  const length=p.valid?Math.round(len(p.path)):0;
  const support=p.valid&&state.stations.some(s=>s.type==='cargoYard'&&p.points.some(q=>!q.external&&dist(q,s)<115)&&stationAccess(s,o));
  const expansion=p.valid&&m.air?Math.max(0,...p.points.filter(s=>!s.external).map(s=>clamp(+o.airportBoost?.[s.id]||0,0,.35))):0;
  const boost=1+.20*Math.min(m.track?2:3,Math.max(0,p.depots-(m.track?1:0)))+expansion;
  const facilityCost=p.valid?Math.ceil(m.upkeep+length*(m.air ? .82 : m.water ? .36 : .22)):Math.round(m.upkeep*.18);
  models.push({...line,...p,points:p.points||line.stops.map(id=>setup.byStation.get(id)).filter(Boolean),length,freightEnabled:line.mode!=='rail'||o.railCargo!==false,passengerEnabled:line.mode!=='rail'||o.railPassenger!==false,capacity:p.valid?Math.round(m.capacity*boost):0,
    freightCapacity:p.valid&&(line.mode!=='rail'||o.railCargo!==false)?Math.round((m.freightOnly?m.capacity:m.freight||0)*boost*(support?1.25:1)):0,
    passengers:0,cargo:0,income:0,expense:facilityCost,net:0,color:m.color});
 }
 const passenger=allocate(models,setup,civic,false),goods=allocate(models,setup,civic,true),
 total={passengers:passenger.intra+passenger.inbound+passenger.outbound,cargo:goods.intra+goods.inbound+goods.outbound,income:0,expense:0,net:0,
 inbound:passenger.inbound,outbound:passenger.outbound,localPassengers:passenger.intra,transfers:passenger.transfers,
 cargoIn:goods.inbound,cargoOut:goods.outbound,localCargo:goods.intra,validLines:0};
 for(const s of state.stations)total.expense+=FACILITIES[s.type]?.monthly||0;
 for(const t of state.tracks)total.expense+=Math.round((t.length||len(t.points))*({rail:.54,metro:1.0,tram:.34})[t.mode]);
 for(const l of models){
  l.passengers=passenger.byLine[l.id]||0;l.cargo=goods.byLine[l.id]||0;
  l.income=Math.round(l.passengers*({rail:6,metro:4.5,tram:4,ferry:5,plane:18})[l.mode]||0)+l.cargo*({rail:9,ship:12,cargoPlane:21}[l.mode]||0);
  l.net=l.income-l.expense; if(l.valid)total.validLines++;
  total.income+=l.income;total.expense+=l.expense;
  if(l.valid){let s=0;l.distances=l.path.map((p,i)=>{if(i)s+=dist(p,l.path[i-1]);return s});}
 }
 total.net=total.income-total.expense;
 return {lines:Object.fromEntries(models.map(l=>[l.id,l])),total,totals:total,regionalJourneys:passenger.regional,gates:setup.gates};
}
function interpolatePath(path,cumulative,x){
 let a=1,b=path.length-1;
 while(a<b){const m=(a+b)>>1;if(cumulative[m]>=x)b=m;else a=m+1;}
 const p=path[a-1],q=path[a],l=cumulative[a]-cumulative[a-1];const r=interpolate(p,q,l?clamp((x-cumulative[a-1])/l,0,1):0);
 return {...r,angle:Math.atan2(q.y-p.y,q.x-p.x)};
}
function agents(metrics,timeMs){
 let out=[];const t=finite(timeMs)?Math.max(0,timeMs):0;
 for(const l of Object.values(metrics?.lines||{})){
  if(!l.valid||!l.distances?.length)continue;const m=MODES[l.mode],length=l.distances.at(-1);
  if(length<1)continue;
  const n=l.mode==='metro'||l.mode==='rail'?Math.min(4,1+l.depots):Math.min(3,1+l.depots);
  for(let i=0;i<n&&out.length<84;i++){
   const at=(t/1000*m.speed*.56+length*(l.id.charCodeAt(l.id.length-1)%13)/13+i*length*2/n)%(length*2);
   const reverse=at>length,x=reverse?length*2-at:at,a=interpolatePath(l.path,l.distances,x),angle=a.angle+(reverse?Math.PI:0);
   out.push({...a,angle,id:l.id+'-'+i,kind:m.vehicle,mode:l.mode,color:m.color,size:m.freightOnly?1.25:1,riders:l.passengers,freight:l.cargo,underground:l.mode==='metro'});
  }
 }
 return out;
}
return {MODES,FACILITIES,create,normalize,addStation,addTrack,addLine,remove,gates,stopOptions,waterRoute,evaluate,agents};
});
