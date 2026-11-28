/* 2.0.4 commute operations kernel; live city adapter will supply legal road/rail/walk legs. */
(function(root,factory){const x=factory();if(typeof module==='object')module.exports=x;else root.CommuteOperations=x;})(globalThis,function(){
 'use strict';
 const valid=x=>Number.isFinite(x)&&x>=0;
 function create({lines=[],transfers=[],onFinish=()=>{}}={}){
  const routes=new Map(),links=new Map(),riders=new Map(),queues=new Map(),realVehicles=new Map(),events=[];
  let time=0,order=0,finished=0,failed=0,missed=0,boards=0,changes=0,total=0;
  const enqueue=(at,run,priority=1)=>events.push({at,run,priority,order:order++});
  for(const l of lines){
   if(!l?.id||routes.has(l.id)||!['bus','metro'].includes(l.mode)||!Array.isArray(l.stops)||l.stops.length<2||new Set(l.stops).size!==l.stops.length||!Array.isArray(l.ride)||l.ride.length!==l.stops.length-1||!l.ride.every(x=>valid(x)&&x>0)||!Number.isInteger(l.capacity)||l.capacity<1)continue;
   routes.set(l.id,l);
  }
  for(const t of transfers)if(t?.from&&t.to&&valid(t.seconds))links.set(JSON.stringify([t.from,t.to]),t.seconds);
  function routeLegs(input){
   if(!Array.isArray(input)||!input.length||input.length>4)return null;
   const result=[];
   for(const q of input){
    const l=routes.get(q.line),from=l?.stops.indexOf(q.from),to=l?.stops.indexOf(q.to);
    if(!l||from<0||to<=from)return null;
    const previous=result.at(-1),link=previous?(previous.to===q.from?0:links.get(JSON.stringify([previous.to,q.from]))):0;
    if(link===undefined)return null;
    result.push({line:l.id,from:q.from,to:q.to,link});
   }
   return result;
  }
  function end(r,ok,at,reason){
   if(r.state==='complete'||r.state==='failed')return;
   r.state=ok?'complete':'failed';r.end=at;r.reason=reason??null;
   const d=r.parts,quality=ok?Math.round(Math.max(0,Math.min(100,100-(d.drive+d.walk+d.transfer+d.ride+d.park+d.wait)*.14-d.wait*.19-r.missed*5-r.crowd*12))):null;
   if(ok)finished++;else failed++;riders.delete(r.id);
   onFinish({id:r.id,ok,reason:r.reason,total:at-r.start,parts:{...d},quality,missed:r.missed,mode:r.mode});
  }
  function wait(r,at){
   if(r.state==='failed')return;
   const l=r.legs[r.index],key=JSON.stringify([l.line,l.from]);r.state='waiting';r.ready=at;
   (queues.get(key)||queues.set(key,[]).get(key)).push(r);
  }
  function submit(p){
   if(!p?.id||riders.has(p.id)||riders.size>=200||!valid(p.at)||p.at<time||!valid(p.walk??0)||!valid(p.lastWalk??0))return false;
   const legs=p.direct?[]:routeLegs(p.legs);if(!legs)return false;
   const r={id:p.id,legs,index:0,mode:p.direct?'car':p.pr?'pr':'transit',state:p.pr||p.direct?'driving':'approach',start:p.at,deadline:p.at+(valid(p.patience)?p.patience:270),ready:0,missed:0,crowd:0,walk:p.walk??0,lastWalk:p.lastWalk??0,parts:{drive:0,park:0,walk:0,wait:0,ride:0,transfer:0}};
   riders.set(r.id,r);total++;enqueue(r.deadline,at=>{if(['driving','approach','walking','waiting'].includes(r.state))end(r,false,at,'time-limit');},2);
   if(!p.pr&&!p.direct){r.parts.walk=r.walk;enqueue(r.start+r.walk,at=>wait(r,at));}
   return true;
  }
  // Only called from the road simulator after allocation of a real space.
  function parked(id,{at,drive,site}={}){
   const r=riders.get(id);
   if(!r||r.state!=='driving'||r.mode!=='pr'||!site||!valid(at)||at<Math.max(r.start,time)||!valid(drive)||drive>at-r.start+1e-6)return false;
   r.state='approach';r.parts.drive=drive;r.parts.park=Math.max(0,at-r.start-drive);r.parts.walk=r.walk;
   enqueue(at+r.walk,t=>wait(r,t));return true;
  }
  function serve(l,v,stop,at){
   for(let k=v.on.length-1;k>=0;k--){
    const r=v.on[k],q=r.legs[r.index];if(q.to!==stop)continue;
    v.on.splice(k,1);r.parts.ride+=at-r.boarded;r.index++;
    if(r.index===r.legs.length){r.state='egress';r.parts.walk+=r.lastWalk;enqueue(at+r.lastWalk,t=>end(r,true,t));}
    else{const links=r.legs[r.index].link;r.state='walking';changes++;r.parts.transfer+=links;enqueue(at+links,t=>wait(r,t));}
   }
   const key=JSON.stringify([l.id,stop]),queue=queues.get(key)||[],keep=[];
   for(const r of queue){
    if(r.state!=='waiting')continue;
    if(v.on.length>=v.capacity){r.missed++;missed++;keep.push(r);continue;}
    r.state='onboard';r.parts.wait+=at-r.ready;r.boarded=at;v.on.push(r);boards++;
   }
   const fill=v.on.length/v.capacity;for(const r of v.on)r.crowd=Math.max(r.crowd,fill);
   queues.set(key,keep);
  }
  function departure(lineId,firstAt){
   const l=routes.get(lineId);if(!l||!valid(firstAt)||firstAt<time)return false;
   const v={line:l.id,on:[],capacity:l.capacity};let scheduled=firstAt;
   for(const [i,stop] of l.stops.entries()){
    enqueue(scheduled,at=>serve(l,v,stop,at),2);scheduled+=l.ride[i]||0;
   }
   return true;
  }
  function visit(lineId,vehicleId,stop,at){
   const l=routes.get(lineId);if(!l||!l.stops.includes(stop)||!valid(at)||at+1e-6<time)return false;
   const key=JSON.stringify([lineId,vehicleId]),index=l.stops.indexOf(stop);
   let v=realVehicles.get(key);
   if(!v){
    if(index!==0||realVehicles.size>=180)return false;
    v={on:[],capacity:l.capacity,index:-1};realVehicles.set(key,v);
   }
   if(index!==v.index+1)return false;
   v.index=index;
   enqueue(Math.max(at,time),now=>{serve(l,v,stop,now);if(index===l.stops.length-1)realVehicles.delete(key);},2);
   return true;
  }
  function arrived(id,{at,drive,lastWalk=0}={}){
   const r=riders.get(id);if(!r||r.mode!=='car'||r.state!=='driving'||!valid(at)||at<time||!valid(drive)||!valid(lastWalk))return false;
   r.state='egress';r.parts.drive=drive;r.parts.park=Math.max(0,at-r.start-drive);r.parts.walk=lastWalk;
   enqueue(at+lastWalk,t=>end(r,true,t));return true;
  }
  function step(until){
   if(!valid(until)||until<time)return;
   while(events.length){events.sort((a,b)=>a.at-b.at||a.priority-b.priority||a.order-b.order);if(events[0].at>until)break;
    const e=events.shift();time=e.at;e.run(time);
   }
   time=until;
  }
  function stats(){
   const state={};for(const r of riders.values())state[r.state]=(state[r.state]||0)+1;
   return {time,finished,failed,missed,boards,changes,total,state,
    waiting:[...queues].map(([key,list])=>({stop:JSON.parse(key),count:list.filter(r=>r.state==='waiting').length})).filter(x=>x.count)};
  }
  return {submit,parked,arrived,departure,visit,step,stats,now:()=>time};
 }
 return {create};
});
