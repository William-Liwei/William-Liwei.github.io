/* Browser/Node microscopic traffic, independent from map and monthly economy. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.Traffic=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const Road=typeof module==='object'?require('./network.js'):globalThis.Network;
  const EPS=1e-7, PI=Math.PI, TAU=2*PI;
  const finite=Number.isFinite, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const number=(v,f,a=-Infinity,b=Infinity)=>finite(+v)?clamp(+v,a,b):f;
  const array=v=>Array.isArray(v)?v:[];
  const id=String, dict=()=>Object.create(null);
  const angleDiff=(a,b)=>Math.abs(((a-b+3*PI)%TAU)-PI);
  const axis=a=>Math.abs(Math.cos(a))>=Math.SQRT1_2?0:1;
  const PALETTE=['#eaf4fc','#eedbb0','#b8d9dc','#f0b49d','#b4c6a3','#d9c5e6'];
  const LENGTH={car:4.5,bus:10.1,truck:6.8,walker:0.6};
  const GAP=2.05, STOP_SPEED=.65;
  function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}

  function geometry(pts) {
    const pieces=[];let total=0;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y;
      const d=Math.hypot(dx,dy);
      if(!finite(d)||d<EPS)continue;
      const az=+a.z||0,bz=+b.z||0;
      pieces.push({x:+a.x,y:+a.y,z:az,dx,dy,dz:bz-az,d,start:total,end:total+d,
        angle:Math.atan2(dy-(bz-az)*.76,dx),heading:Math.atan2(dy,dx)});
      total+=d;
    }
    return {pieces,total};
  }
  function sample(edge,distance,reverse){
    const {geo,total}=edge;
    const p=clamp(reverse?total-distance:distance,0,total);
    let lo=0,hi=geo.length-1;
    while(lo<hi){let m=(lo+hi)>>1;if(geo[m].end<p)lo=m+1;else hi=m;}
    const s=geo[lo], ratio=clamp((p-s.start)/s.d,0,1);
    return {x:s.x+s.dx*ratio,y:s.y+s.dy*ratio,z:s.z+s.dz*ratio,angle:s.angle+(reverse?PI:0),heading:s.heading+(reverse?PI:0)};
  }
  function graph(network,signalOption){
    const nodes=new Map(),edges=new Map(),lanes=[];
    const ensure=(raw,n={})=>{
      const k=id(raw);
      if(!nodes.has(k))nodes.set(k,{id:k,degree:0,roadDegree:0,forced:n.signal??null,active:[],offset:(hash(k)%26)*.65});
      return nodes.get(k);
    };
    for(const n of array(network?.nodes))if(n?.id!=null)ensure(n.id,n);
    for(const raw of array(network?.edges)){
      if(raw?.id==null||raw.a==null||raw.b==null)continue;
      const g=geometry(array(raw.pts??raw.points));
      if(g.total<.50||edges.has(id(raw.id)))continue;
      const k=id(raw.id), a=ensure(raw.a),b=ensure(raw.b);
      const kind=raw.kind??'road', count=Math.round(number(raw.lanes,2,1,8));
      const cross=Road.crossSection(raw);
      const roadSpeed=number(raw.speed,kind==='highway'?82:kind==='ramp'?44:39,5,140)/3.6;
      const e={id:k,rawId:raw.id,a:a.id,b:b.id,geo:g.pieces,total:g.total,roadSpeed,kind,fwd:[],rev:[]};
      a.degree++;b.degree++;
      if(kind==='road'){a.roadDegree++;b.roadDegree++;}
      const add=(reverse,count)=>{
        const dest=reverse?e.rev:e.fwd;
        for(let i=0;i<count;i++){
          const busOnly=raw.bus===true&&count>1&&i===count-1;
          const lane={id:lanes.length,e,reverse,index:i,offset:cross?.offset(i,reverse)??(raw.oneway?(i+.5-count/2)*3.35:(i+.5)*2.85),busOnly:listType(busOnly,kind),vehicles:[],entryAt:0};
          lanes.push(lane);dest.push(lane);
        }
      };
      add(false,raw.oneway?count:Math.max(1,Math.ceil(count/2)));
      if(!raw.oneway)add(true,Math.max(1,Math.floor(count/2)));
      edges.set(k,e);
    }
    for(const node of nodes.values())node.signal=Boolean(node.forced??(signalOption&&node.roadDegree>=3));
    return {nodes,edges,lanes};
  }
  function listType(busOnly,kind){return busOnly&&kind==='road';}

  function create(network={}, descriptors=[], options={}){
    const dt=number(options.fixedStep,.08,.033333,.125);
    const maxVehicles=Math.floor(number(options.maxVehicles,240,1,600));
    const maxWalkers=Math.floor(number(options.maxWalkers,70,0,160));
    const arrivalScale=number(options.arrivalScale,1,.05,6);
    const speedFactor=number(options.speedFactor,1,.3,3);
    const junctionTime=number(options.junctionTime,.72,.16,4);
    const dwellTime=number(options.busDwell,2.4,0,12);
    const seed=hash(options.seed??'blueprint-traffic');
    const {nodes,edges,lanes}=graph(network,options.signal!==false);
    const routing=network.turns?.length?Road.graph(network,'car'):null;
    const cars=new Map(), walkers=[], demands=[], transfers=new Set();
    const candidates=[], cooldown=new Map();
    let seconds=0, accumulator=0, wallClock=null, serial=0, completed=0, issued=0,
      rejected=0, waitFinished=0, tripFinished=0, lostDemand=0;
    const kinds={car:0,truck:0,bus:0}, finishedByKind={car:0,truck:0,bus:0};
    const signalCycle=number(options.signalCycle,14,6,100);
    const allRed=number(options.allRed,.75,0,signalCycle*.20), half=signalCycle/2;

    function signature(parts){return parts.map(s=>id(s?.edge??s?.id??s)+(s?.reverse?'~':'')).join('>');}
    const busByPath=new Map(array(network?.buses).filter(b=>!b?.broken).map(b=>[signature(array(b.path)),b]));
    const busByID=new Map(array(network?.buses).filter(b=>b?.id!=null).map(b=>[id(b.id),b]));
    function compile(desc,i) {
      if(!desc||typeof desc!=='object')return;
      const kind=Object.hasOwn(LENGTH,desc.kind)?desc.kind:'car';
      const original=array(desc.p??desc.path);
      if(!original.length||original.length>2048)return;
      const path=[];
      let prev=null,total=0;
      for(const s of original){
        const e=edges.get(id(s?.edge??s?.id??s)), reverse=Boolean(s?.reverse);
        if(!e||kind!=='walker'&&reverse&&!e.rev.length)return;
        const from=reverse?e.b:e.a,to=reverse?e.a:e.b;
        if(prev!==null&&(prev!==from||routing&&kind!=='walker'&&!Road.turnAllowed(routing,from,path.at(-1).e.rawId,e.rawId)))return;
        const f=e.geo[0],l=e.geo[e.geo.length-1];
        path.push({e,reverse,from,to,start:total,end:total+e.total,lanes:reverse?e.rev:e.fwd,
          departure:reverse?l.heading+PI:f.heading,arrival:reverse?f.heading+PI:l.heading});
        total+=e.total;prev=to;
      }
      if(!path.length||total<EPS)return;
      const rnd=(hash(seed+'/'+i)%100000)/100000;
      const phase=number(desc.phase,rnd,0,1);
      const speed=number(desc.speed,kind==='bus'?46:kind==='truck'?34:kind==='walker'?10:51,1,130);
      // Legacy game descriptors express nominal car/bus speed on a km/h-like scale.
      const cruise=number(desc.mps,kind==='walker'?clamp(speed/4.8,1.5,3.2):clamp(speed/3.6,3.5,35),.6,60)*speedFactor;
      const line=busByID.get(id(desc.busId??desc.line??''))??busByPath.get(signature(original));
      const stops=new Set(array(desc.stops??line?.stops).map(s=>id(s?.node??s?.id??s)));
      const oneShot=desc.repeat===false;
      const continuous=kind==='bus'&&path[0].from===path.at(-1).to&&!oneShot;
      if(continuous&&routing&&!Road.turnAllowed(routing,path[0].from,path.at(-1).e.rawId,path[0].e.rawId))return;
      const interval=number(desc.interval,kind==='bus'?Math.max(17,total/cruise*.9):clamp(15+total/cruise*.45,17,45),.12,2000)/arrivalScale;
      const offset=Math.min(kind==='bus'?5:11,interval*1.1)*phase;
      return {kind,path,total,cruise,phase,stops,continuous,interval,oneShot,
        at:number(desc.departAt,offset,0,1e7),pending:0,active:0,rnd,i};
    }
    for(const [i,d] of array(descriptors).slice(0,620).entries()){
      const route=compile(d,i);
      if(!route){rejected++;continue;}
      if(route.kind==='walker'){if(walkers.length<maxWalkers)walkers.push(route);}
      else demands.push(route);
    }

    const stopAt=(lane,length)=>lane.e.total-Math.min(lane.e.total*.24,length*.53);
    const beginAt=(lane,length)=>Math.min(length*.54,lane.e.total*.26);
    const lengthOf=a=>LENGTH[a.kind];
    const canEnter=(lane,length)=>{
      if(lane.reserved||seconds+EPS<lane.entryAt)return false;
      const back=lane.vehicles[0], start=beginAt(lane,length);
      return stopAt(lane,length)>=start-EPS&&(!back||Math.min(back.s,back.prevS)-start+EPS>=(length+lengthOf(back))*.5+GAP);
    };
    function laneChoices(seg,kind){
      const canUse=seg.lanes.filter(l=>kind==='bus'||!l.busOnly);
      const good=canUse.filter(l=>canEnter(l,LENGTH[kind]));
      good.sort((a,b)=> (kind==='bus'?Number(b.busOnly)-Number(a.busOnly):0)||
        a.vehicles.length-b.vehicles.length||a.index-b.index);
      return good;
    }
    function join(a,lane,carry=0){
      a.lane=lane;a.s=beginAt(lane,lengthOf(a));a.prevS=a.s;
      a.speed=Math.min(carry,lane.e.roadSpeed*speedFactor,a.route.cruise);
      a.ready=false;a.queued=false;a.arrival=0;a.busDwellUntil=null;
      lane.vehicles.unshift(a);
      lane.entryAt=seconds+Math.max(dt,.37);
    }
    function departures(){
      for(const q of demands){
        if(seconds+EPS>=q.at){
          if(q.continuous&&q.active){q.at=seconds+q.interval;continue;}
          const due=q.oneShot?1:Math.min(32,Math.floor((seconds-q.at+EPS)/q.interval)+1);
          q.at=q.oneShot?Infinity:q.at+due*q.interval;
          const cap=q.kind==='bus'?1:5;
          lostDemand+=Math.max(0,q.pending+due-cap);
          q.pending=Math.min(cap,q.pending+due);
        }
        if(!q.pending||cars.size>=maxVehicles||q.continuous&&q.active)continue;
        const seg=q.path[0], chosen=laneChoices(seg,q.kind)[0];
        if(!chosen)continue;
        const a={id:'v'+(++serial),kind:q.kind,route:q,index:0,s:0,speed:0,wait:0,started:seconds,
          chosenVar:(serial+seed)%PALETTE.length,dwellCount:0};
        join(a,chosen,Math.min(2.6,q.cruise*.22));cars.set(a.id,a);q.pending--;q.active++;issued++;kinds[q.kind]++;
      }
    }
    function updateLane(lane) {
      const stack=lane.vehicles;
      if(!stack.length)return;
      for(let i=stack.length-1;i>=0;i--){
        const a=stack[i], len=lengthOf(a), end=stopAt(lane,len);
        a.prevS=a.s;
        const ahead=stack[i+1], lim=ahead?Math.min(end,ahead.s-(lengthOf(ahead)+len)*.5-GAP):end;
        const gap=Math.max(0,lim-a.s), target=Math.min(a.route.cruise,lane.e.roadSpeed*speedFactor);
        const braking=a.kind==='truck'?3.25:a.kind==='bus'?3.6:4.1, accel=a.kind==='truck'?1.25:a.kind==='bus'?1.5:2.85;
        const brakingTarget=ahead?Math.sqrt((ahead.speed||0)**2+2*braking*gap):Math.sqrt(2*braking*(gap+.45));
        // A following driver's reaction margin stretches at speed and vanishes at rest.
        const timeGap=ahead?(ahead.speed*.80+gap/.81):Infinity;
        let speed=clamp(Math.min(target,brakingTarget,timeGap),Math.max(0,a.speed-braking*dt),a.speed+accel*dt);
        const ds=Math.min(gap,speed*dt);
        a.s+=ds;
        a.speed=Math.min(speed,ds/dt);
        let atEnd=!ahead&&end-a.s<.22;
        if(atEnd&&a.kind==='bus'&&a.route.stops.has(a.route.path[a.index].to)&&a.busDwellUntil===null){
          a.busDwellUntil=seconds+dwellTime;
          if(dwellTime>0)a.dwellCount++;
        }
        const dwelling=a.busDwellUntil!==null&&seconds+EPS<a.busDwellUntil;
        a.ready=atEnd&&!dwelling;
        if(a.ready&&a.arrival===0)a.arrival=seconds;
        a.queued=!dwelling&&a.speed<STOP_SPEED&&((Boolean(ahead)&&gap<2.3)||atEnd);
        if(a.queued)a.wait+=dt;
        if(a.ready)candidates.push(a);
      }
    }
    function light(node,heading){
      const time=(seconds+node.offset)%signalCycle;
      return (time<half?0:1)===axis(heading)&&(time%half)<half-allRed;
    }
    function compatible(a,b){
      if(a.inLane===b.inLane||a.outLane===b.outLane)return false;
      if(a.from===b.from&&a.to===b.to)return true;
      // Opposing straight traffic can pass concurrently; turns reserve the box.
      return a.straight&&b.straight&&angleDiff(a.heading,b.heading)>PI*.80;
    }
    function retire(a){
      cars.delete(a.id);a.route.active--;completed++;kinds[a.kind]--;finishedByKind[a.kind]++;
      waitFinished+=a.wait;tripFinished+=seconds-a.started;
    }
    function crossing(){
      candidates.sort((a,b)=>a.arrival-b.arrival||a.lane.id-b.lane.id);
      for(const a of candidates){
        const own=a.lane, route=a.route, from=route.path[a.index];
        if(own.vehicles.at(-1)!==a)continue;
        const wrap=a.index+1===route.path.length&&route.continuous;
        const to=route.path[wrap?0:a.index+1];
        if(!to){own.vehicles.pop();retire(a);continue;}
        const node=nodes.get(from.to);
        if(node.signal&&!light(node,from.arrival))continue;
        const outs=laneChoices(to,a.kind);
        const straight=angleDiff(from.arrival,to.departure)<PI*.26;
        for(const lane of outs){
          const movement={inLane:own.id,outLane:lane.id,from:from.e.id,to:to.e.id,heading:from.arrival,straight};
          if(node.degree>=3&&node.active.some(o=>o.until>seconds&&!compatible(movement,o)))continue;
          const key=own.id+'>'+lane.id;
          if((cooldown.get(key)||0)>seconds+EPS)continue;
          const start=paintPoint(from,a.s,own.offset),end=paintPoint(to,beginAt(lane,lengthOf(a)),lane.offset);
          const gap=Math.hypot(start.x-end.x,start.y-end.y), arm=clamp(gap*.43,.9,9);
          const entry={x:start.x+Math.cos(start.heading)*arm,y:start.y+Math.sin(start.heading)*arm};
          const exit={x:end.x-Math.cos(end.heading)*arm,y:end.y-Math.sin(end.heading)*arm};
          const duration=Math.max(dt*2,Math.min(2.5,gap/(straight?7.2:5.1)));
          own.vehicles.pop();lane.reserved=a;
          if(node.degree>=3){
            node.active=node.active.filter(o=>o.until>seconds);
            node.active.push({...movement,until:seconds+duration+dt});
          }
          cooldown.set(key,seconds+Math.max(duration,junctionTime*(straight?.73:1)));
          a.cross={start,end,entry,exit,begin:seconds,duration,lane,wrap};
          a.queued=false;a.ready=false;a.speed=gap/duration;transfers.add(a);
          break;
        }
      }
    }
    function finishTransfers(){
      for(const a of transfers){
        const t=a.cross;
        if(seconds+EPS<t.begin+t.duration)continue;
        transfers.delete(a);t.lane.reserved=null;a.cross=null;
        if(t.wrap){completed++;finishedByKind.bus++;waitFinished+=a.wait;tripFinished+=seconds-a.started;a.wait=0;a.started=seconds;}
        a.index=t.wrap?0:a.index+1;
        join(a,t.lane,Math.max(1.9,a.speed));
        a.joinBlend=t;
      }
    }
    function tick(){
      seconds+=dt;candidates.length=0;
      for(const lane of lanes)updateLane(lane);
      finishTransfers();
      departures();
      crossing();
    }
    function step(span=dt){
      accumulator+=number(span,0,0,2);
      let loops=0, limit=Math.ceil(2/dt)+2;
      while(accumulator+EPS>=dt&&loops<limit){tick();accumulator=Math.max(0,accumulator-dt);loops++;}
      return loops;
    }
    function advance(ms){
      if(finite(ms)){if(wallClock!==null&&ms>=wallClock)step(clamp((ms-wallClock)*.001,0,.3));wallClock=ms;}
      return agents();
    }
    function paintPoint(seg,d,side){
      const p=sample(seg.e,d,seg.reverse),a=sample(seg.e,d-.78,seg.reverse),b=sample(seg.e,d+.78,seg.reverse);
      if(Math.hypot(b.x-a.x,b.y-a.y)>EPS){
        p.heading=Math.atan2(b.y-a.y,b.x-a.x);
        p.angle=Math.atan2(b.y-a.y-(b.z-a.z)*.76,b.x-a.x);
      }
      p.x-=Math.sin(p.heading)*side;p.y+=Math.cos(p.heading)*side;
      return p;
    }
    function agents(){
      const frame=[];
      const alpha=clamp(accumulator/dt,0,1);
      for(const a of cars.values()){
        const seg=a.route.path[a.index];
        const now=seconds-dt+alpha*dt,t=a.cross||a.joinBlend;
        let p;
        if(t&&(a.cross||now<t.begin+t.duration)){
          const u=clamp((now-t.begin)/t.duration,0,1),v=1-u,{start,end,entry,exit}=t;
          const x=v*v*v*start.x+3*v*v*u*entry.x+3*v*u*u*exit.x+u*u*u*end.x;
          const y=v*v*v*start.y+3*v*v*u*entry.y+3*v*u*u*exit.y+u*u*u*end.y;
          const z=start.z+(end.z-start.z)*u;
          const dx=v*v*(entry.x-start.x)+2*v*u*(exit.x-entry.x)+u*u*(end.x-exit.x);
          const dy=v*v*(entry.y-start.y)+2*v*u*(exit.y-entry.y)+u*u*(end.y-exit.y)-(end.z-start.z)*.76/3;
          p={x,y,z,angle:Math.atan2(dy,dx)};
        }else{
          a.joinBlend=null;p=paintPoint(seg,a.prevS+(a.s-a.prevS)*alpha,a.lane.offset);
        }
        frame.push({...p,id:a.id,kind:a.kind==='truck'?'truck':a.kind,edge:seg.e.rawId,lane:a.lane.index,
          reverse:seg.reverse,speed:a.speed,queued:a.queued,dwell:a.busDwellUntil!==null&&a.busDwellUntil>seconds,
          color:a.kind==='bus'?'#f7d274':PALETTE[a.chosenVar]});
      }
      for(const r of walkers){
        let d=(seconds*r.cruise+r.phase*r.total)%r.total;
        const seg=r.path.find(p=>d<p.end)||r.path.at(-1);
        const p=paintPoint(seg,d-seg.start,seg.lanes.length*2.85+3.8);
        frame.push({...p,id:'w'+r.i,kind:'walker',edge:seg.e.rawId,speed:r.cruise,phase:seconds*10+r.rnd*7});
      }
      return frame;
    }
    function stats(){
      const edgeQueues=dict(),edgeOccupancy=dict(),edgeSpeed=dict(),edgeCapacity=dict(),junctionQueues=dict(),edgeTraffic=dict();
      let queued=0,dwell=0,waitActive=0,backlog=0,moving=transfers.size;
      for(const a of transfers)waitActive+=a.wait;
      for(const q of demands)backlog+=q.pending;
      for(const [k,e] of edges){
        let n=0,slow=0,speed=0,size=0;
        for(const lane of [...e.fwd,...e.rev]){
          size+=Math.max(1,Math.floor(e.total/(LENGTH.car+GAP)));
          for(const a of lane.vehicles){
            n++;speed+=a.speed;waitActive+=a.wait;
            if(a.queued){slow++;if(a.ready){const j=a.route.path[a.index].to;junctionQueues[j]=(junctionQueues[j]||0)+1;}}
            else if(a.busDwellUntil!==null&&a.busDwellUntil>seconds)dwell++;
            if(a.speed>=STOP_SPEED)moving++;
          }
        }
        edgeQueues[k]=slow;edgeOccupancy[k]=n;
        edgeSpeed[k]=n?speed/n:0;edgeCapacity[k]=size;
        edgeTraffic[k]=n?clamp(.59*slow/Math.max(1,n)+.41*n/Math.max(1,size),0,1):0;
        queued+=slow;
      }
      return {time:seconds,vehicles:cars.size,queued,moving,dwell,completed,issued,backlog,lostDemand,rejected,
        meanWait:completed+cars.size?(waitFinished+waitActive)/(completed+cars.size):0,
        meanTrip:completed?tripFinished/completed:0,byKind:{...kinds},completedByKind:{...finishedByKind},
        edgeQueues,edgeOccupancy,edgeSpeed,edgeCapacity,edgeTraffic,junctionQueues};
    }
    function setSignal(nodeId,state=true){
      const node=nodes.get(id(nodeId));if(!node)return false;
      node.signal=Boolean(state);return true;
    }
    function signals(){
      return [...nodes.values()].filter(n=>n.signal).map(n=>{
        const t=(seconds+n.offset)%signalCycle;
        return {node:n.id,phase:t%half>=half-allRed?'all-red':t<half?'east-west':'north-south',
          remaining:(t%half>=half-allRed?half:half-allRed)-t%half};
      });
    }
    for(let left=number(options.warmupSeconds,0,0,20);left>EPS;left-=2)step(Math.min(left,2));
    return {step,advance,agents,stats,setSignal,signals};
  }
  return {create};
});
