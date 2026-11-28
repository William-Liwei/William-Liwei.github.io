/* Reproducible workshop for 2.0.3: same road geometry, arrival seed and windows in each alternative. */
(function(root,factory){const api=factory(typeof module==='object'?require('./traffic.js'):root.Traffic,typeof module==='object'?require('./parking.js'):root.Parking);if(typeof module==='object')module.exports=api;else root.FlowStudy=api;})(globalThis,function(Traffic,Parking){
'use strict';
const labels={low:'低峰基线',high:'高峰 · 原配时',priority:'高峰 · 主路优先',extreme:'高峰 · 主路过度优先',parkingBase:'仅路侧位',parkingLot:'新建公共场'};
const observations={upstream:'住宅入口',bridge:'上游路段',short:'短连接段',out:'主路出口',sideIn:'支路入口',sideOut:'支路出口'};
function corridor(options={}){
  const nodes=[
    ['a',78,165],['b',183,165],['c',235,165],['d',277,165],['e',438,165],
    ['f',277,43],['g',277,273],['h',183,57],['i',183,272]
  ].map(([id,x,y])=>({id,x,y,z:0}));
  const ns=Object.fromEntries(nodes.map(n=>[n.id,n]));
  const edges=[['upstream','a','b'],['bridge','b','c'],['short','c','d'],['out','d','e'],
    ['sideIn','f','d'],['sideOut','d','g'],['feeder','h','b'],['sideExit','b','i']].map(([id,a,b])=>({
      id,a,b,kind:'road',speed:38,lanes:2,profile:'r2',len:Math.hypot(ns[b].x-ns[a].x,ns[b].y-ns[a].y),pts:[ns[a],ns[b]]
  }));
  const demand=(paths,profile,interval,tag,departAt=0)=>({p:paths.map(edge=>({edge})),kind:'car',profile,interval,departAt,tag});
  const network={nodes,edges,buses:[],turns:[]};
  const state=Parking.normalize();
  if(options.lot)state.lots.push({id:'P1',type:'small',x:421,y:191,fee:3});
  const parking=options.park?Parking.build(network,state):null;
  return {
    network,parking,
    descriptors:[
      {...demand(['upstream','bridge','short','out'],'commute',6.1,'主路'),parking:Boolean(parking),parkDwell:56},
      demand(['sideIn','sideOut'],'steady',6.9,'支路',1.6),
      demand(['feeder','sideExit'],'steady',16.0,'上游支路',3.3)
    ],
    settings:{seed:29,signal:false,maxVehicles:180,profileMode:options.mode||'high',parking,signals:{d:{ew:options.ew??.33,cycle:26,offset:0}}}
  };
}
function pick(v){
  if(v==='low')return {mode:'low',ew:.33};
  if(v==='priority')return {mode:'high',ew:.57};
  if(v==='parkingBase'||v==='parkingLot')return {mode:'high',ew:.57,park:true,lot:v==='parkingLot'};
 if(v==='extreme')return {mode:'high',ew:.79};
  return {mode:'high',ew:.33};
}
function run(key){const {network,descriptors,settings}=corridor(pick(key));return Traffic.create(network,descriptors,settings);}
function measure(sim,{warm=50,span=140}={}){
 for(let t=0;t<warm;t++)sim.step(1);
 const before=sim.stats(), peaks={},tail={},spill=new Set(), queueByEdge={}, reasons={};let parkingPeak=0;
 for(let t=0;t<span;t++){
  sim.step(1);
  const s=sim.stats();parkingPeak=Math.max(parkingPeak,s.parking?.waiting||0);
  for(const [edge,[f,b]] of Object.entries(s.directions)){
    const q=f.queued+b.queued;peaks[edge]=Math.max(peaks[edge]||0,q);
    queueByEdge[edge]=(queueByEdge[edge]||0)+q;
    tail[edge]=Math.max(tail[edge]||0,f.tail,b.tail);
    if(f.spill+b.spill)spill.add(edge);
  }
  for(const [k,size] of Object.entries(s.causes))reasons[k]=(reasons[k]||0)+size;
 }
 const after=sim.stats(),delta=k=>after[k]-before[k], flow={};
 for(const k of new Set([...Object.keys(before.byExit),...Object.keys(after.byExit)]))flow[k]=(after.byExit[k]||0)-(before.byExit[k]||0);
 return {span,offered:delta('offered'),issued:delta('issued'),completed:delta('completed'),lost:delta('lostDemand'),
  flow,delay:Math.round(delta('waitSeconds')+delta('pendingSeconds')),wait:Math.round(delta('waitSeconds')),
  virtualWait:Math.round(delta('pendingSeconds')),backlog:after.backlog,spill:[...spill],peaks,tail,queueByEdge,reasons,
  parking:after.parking?{waiting:Math.round(after.parking.wait-before.parking.wait),parked:after.parking.served-before.parking.served,
   released:after.parking.released-before.parking.released,atEnd:after.parking.occupied,peakWait:parkingPeak,capacity:after.parking.capacity,
   localCapacity:Object.values(after.parking.sites).filter(x=>x.node==='e').reduce((n,s)=>n+s.capacity,0),
   receipts:after.parking.fee-before.parking.fee}:null};
}
return {corridor,pick,run,measure,labels,observations};
});
