/* Capacity adapter: only a routable road or a verified freight service creates a gateway. */
(function(root,make){const v=make();if(typeof module==='object')module.exports=v;else root.CargoGateways=v;})(globalThis,()=>{
'use strict';
const MODES={rail:'rail',ship:'sea',cargoPlane:'air'};
const lineTravel={rail:2,sea:3,air:1};
const fees={road:.9,rail:.55,sea:.38,air:2.4};
const tradeable=l=>l.level>0&&['residential','commercial','office','industrial'].includes(l.type);
function collect(net,entrances,lots,transit,N,scale=1){
 if(!net||!N)return [];
 const allNodes=net.nodes.filter(n=>Math.abs(n.z)<4),byId=new Map(net.edges.map(e=>[e.id,e]));
 const feedNodes=new Set(net.edges.filter(e=>e.kind==='road'&&e.pts?.some(p=>Math.abs(p.z)<4)).flatMap(e=>[e.a,e.b]));
 const graph=N.graph(net,'truck'),active=n=>(graph[n.id]||[]).length>0;
 const nearby=(pt,range,filter)=>{let best=null,d0=range;for(const n of allNodes){if(!filter(n))continue;const d=N.dist(n,pt);if(d<d0){best=n;d0=d;}}return best;};
 // A building can front a long, unsplit street; it need not sit near the street's endpoints.
 const nodeById=new Map(allNodes.map(n=>[n.id,n])),grid=new Map(),step=64,cell=(x,y)=>x+':'+y;
 for(const e of net.edges){
  if(e.kind!=='road')continue;
  for(let i=1;i<e.pts.length;i++){
   const a=e.pts[i-1],b=e.pts[i];if(Math.max(Math.abs(a.x),Math.abs(a.y),Math.abs(b.x),Math.abs(b.y))>2400||Math.min(Math.abs(a.z),Math.abs(b.z))>4||Math.hypot(b.x-a.x,b.y-a.y)>1600)continue;
   for(let x=Math.floor(Math.min(a.x,b.x)/step);x<=Math.floor(Math.max(a.x,b.x)/step);x++)
    for(let y=Math.floor(Math.min(a.y,b.y)/step);y<=Math.floor(Math.max(a.y,b.y)/step);y++){
     const key=cell(x,y),v=grid.get(key)||[];v.push({a,b,e});grid.set(key,v);
    }
  }
 }
 const access=(pt,range,filter)=>{
  if(Math.max(Math.abs(pt.x),Math.abs(pt.y))>2400)return null;
  const direct=nearby(pt,range,n=>feedNodes.has(n.id)&&filter(n));if(direct)return direct;
  let closest=null,best=range;
  const seen=new Set();
  for(let x=Math.floor((pt.x-range)/step);x<=Math.floor((pt.x+range)/step);x++)
   for(let y=Math.floor((pt.y-range)/step);y<=Math.floor((pt.y+range)/step);y++)for(const v of grid.get(cell(x,y))||[]){
    if(seen.has(v.a))continue;seen.add(v.a);const {a,b,e}=v,dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((pt.x-a.x)*dx+(pt.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    if(Math.abs(a.z+(b.z-a.z)*t)>3)continue;
    const d=Math.hypot(pt.x-a.x-dx*t,pt.y-a.y-dy*t);if(d>=best)continue;
    const anchors=[nodeById.get(e.a),nodeById.get(e.b)].filter(n=>n&&filter(n)).sort((u,v)=>N.dist(u,pt)-N.dist(v,pt));
    if(anchors.length){closest=anchors[0];best=d;}
   }
  return closest;
 };
 const work=new Map();
 for(const l of lots.filter(tradeable).sort((a,b)=>(b.occupants||0)-(a.occupants||0)||String(a.id).localeCompare(String(b.id))).slice(0,320)){
  const n=access(l,72,active);
  if(n){const old=work.get(n.id)||0;work.set(n.id,old+(l.type==='industrial'?2.1:1)+Math.min(60,l.occupants||0)*.025);}
 }
 const spokes=[...work.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))).slice(0,24).map(x=>x[0]);
 const trees=new Map(),tree=id=>{if(!trees.has(id))trees.set(id,N.pathsFrom(graph,id));return trees.get(id);};
 const routes=(n,radius,terminal=false)=>{
  if(!n)return {inCap:0,outCap:0,reachable:0};
  const src=tree(n.id);let inCap=0,outCap=0,reachable=0;
  for(const target of spokes){
   if(target===n.id){if(terminal){inCap=Math.max(inCap,32);outCap=Math.max(outCap,32);reachable++;}continue;}
   const a=src.route(target),b=tree(target).route(n.id);
   const weight=r=>r?.length?Math.min(radius,...r.map(e=>N.capacity(byId.get(e.edge)))):0;
   const inc=weight(a),out=weight(b);
   if(inc||out){inCap=Math.max(inc,inCap);outCap=Math.max(out,outCap);reachable++;}
  }
  return {inCap,outCap,reachable};
 };
 const out=[];
 for(const p of entrances){
  const n=nearby(p,24,()=>true),h=routes(n,300),factor=.82*Math.max(.55,Math.min(1.6,scale||1));
  out.push({id:'road-'+p.id,name:p.name,mode:'road',connected:!!(h.inCap||h.outCap),directional:true,travel:1,
   importCapacity:Math.floor(h.inCap*factor),exportCapacity:Math.floor(h.outCap*factor),
   terminalId:'road-'+p.id,terminalCapacity:Math.ceil(Math.max(h.inCap,h.outCap)*factor),fee:fees.road,
   reason:!n?'需把道路接到地图边缘的公路口':!h.reachable?'公路口与市内生产、消费地之间尚无可行车路线':'',x:p.x,y:p.y});
 }
 for(const l of Object.values(transit?.lines||{})){
  const mode=MODES[l.mode];if(!mode)continue;
  const local=l.points?.find(p=>!p.external),external=l.points?.find(p=>p.external);
  if(!local||!external)continue; // an entirely domestic service is not an international route
  const n=access(local,84,()=>true),h=routes(n,300,true),rating=Number(l.freightCapacity)||0;
  const terminalCapacity={rail:106,sea:225,air:156}[mode],capacity=Math.min(terminalCapacity,Math.floor(rating));
  out.push({id:mode+'-'+l.id, name:local.name||({rail:'铁路货站',sea:'货运港口',air:'货运机场'})[mode]+' '+local.id,
   mode,connected:!!(l.valid&&rating&&(h.inCap||h.outCap)),travel:lineTravel[mode],
   importCapacity:h.inCap?Math.min(capacity,Math.floor(h.inCap*2.1)):0,
   exportCapacity:h.outCap?Math.min(capacity,Math.floor(h.outCap*2.1)):0,
   terminalId:local.id,terminalCapacity,fee:fees[mode],reason:!l.valid?l.reason:!h.reachable?'货站缺少通向产业或消费区的接驳道路':'',
   x:local.x,y:local.y,externalName:external.name});
 }
 return out;
}
return {collect};
});
