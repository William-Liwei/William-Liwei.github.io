(function(root,factory){const v=factory();if(typeof module==='object')module.exports=v;else root.Outside=v})(globalThis,()=>{
'use strict';
// Signed off-map connectors are opt-in geography, not a catchment area.
function gateNode(network,gate,N){
 if(!gate||!Number.isFinite(gate.x)||!Number.isFinite(gate.y))return null;
 const z=Number.isFinite(gate.z)?gate.z:0,ids=new Set();
 const match=p=>p&&Math.abs((p.z||0)-z)<=.75&&N.dist(p,gate)<=2+1e-7;
 for(const e of network.edges){
  if(!['road','highway','ramp'].includes(e.kind||'road')||!e.pts?.length)continue;
  if(match(e.pts[0]))ids.add(e.a);
  if(match(e.pts.at(-1)))ids.add(e.b);
 }
 return network.nodes.filter(n=>ids.has(n.id)&&match(n))
 .sort((a,b)=>N.dist(a,gate)-N.dist(b,gate)||String(a.id).localeCompare(String(b.id)))[0]||null;
}
function assess(network,gates,civic,map,N){
 const g=N.graph(network,'car'), edges=new Map(network.edges.map(e=>[e.id,e]));
 const nodeAt=(pt,r)=>network.nodes.filter(n=>Math.abs(n.z)<4&&N.dist(n,pt)<=r&&(g[n.id]||[]).length)
 .sort((a,b)=>N.dist(a,pt)-N.dist(b,pt))[0];
 const data=civic.lots.filter(x=>x.level>0), groups=[['truck',data.filter(x=>x.type==='industrial')],['car',data.filter(x=>['residential','commercial','office'].includes(x.type))]];
 const activated=new Set(), totals={gates:0,visitors:0,freight:0,net:0,loads:{},paths:[],links:[]};
 for(let gate of gates){const n=gateNode(network,gate,N),result={id:gate.id,name:gate.name,connected:false,visitors:0,freight:0};
 if(!n){totals.links.push(result);continue;}
 for(const [kind,lots] of groups){
  for(const lot of [...lots].sort((a,b)=>b.occupants-a.occupants||a.id.localeCompare(b.id)).slice(0,28)){
   if(activated.has(lot.id))continue;
   const d=nodeAt(lot,82);if(!d||n.id===d.id)continue;
   const out=N.path(g,n.id,d.id);if(!out?.length)continue;
   const back=N.path(g,d.id,n.id,out.at(-1).edge);if(!back?.length)continue;
   const bottleneck=Math.min(...out.map(n=>N.capacity(edges.get(n.edge))));
   const count=Math.min(Math.round(Math.max(0,lot.occupants||0)*(kind==='truck'?.24:.13)*(map.freight||1)), Math.max(0,Math.floor(bottleneck/7)));
   if(count===0)continue;
   activated.add(lot.id);result.connected=true;
   const key=kind==='truck'?'freight':'visitors';
   result[key]+=count;totals[key]+=count;
   for(const p of out)totals.loads[p.edge]=(totals.loads[p.edge]||0)+count;
   if(totals.paths.length<26){
    const p=[...out,...back].map(s=>({...s,l:edges.get(s.edge).len})),total=p.reduce((a,s)=>a+s.l,0);
    totals.paths.push({p,total,kind,phase:((totals.paths.length*.618+.1)%1),speed:kind==='truck'?36:48});
   }
  }
 }
 if(result.connected)totals.gates++;
 totals.links.push(result);
 }
 totals.net=totals.freight*17+totals.visitors*8-totals.gates*70;
 return totals;
}
return {assess,gateNode};
});
