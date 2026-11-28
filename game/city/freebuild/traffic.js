/* Browser/Node microscopic traffic, independent from map and monthly economy. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.Traffic=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const Road=typeof module==='object'?require('./network.js'):globalThis.Network;
  const Park=typeof module==='object'?require('./parking.js'):globalThis.Parking;
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
  const PROFILES={
    commute:[.38,2.10,.78,.54,.53], home:[.38,.48,.78,2.10,.53],
    freight:[.50,1.05,1.47,.91,.70], steady:[1,1,1,1,1]
  };
  const PERIODS=['dawn','morning','day','evening','night'];
  const WINDOW_NAMES=['清晨','早高峰','日间','晚高峰','夜间'];
  const causeNames={signal:'红灯等待',space:'下游回堵',conflict:'交叉口让行',queue:'跟车排队',parking:'停车位已满或未接通'};
  function dayPeriod(time){const t=(Math.floor(Math.max(0,time))%300);return t<35?0:t<105?1:t<185?2:t<250?3:4;}
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
      if(!nodes.has(k))nodes.set(k,{id:k,degree:0,roadDegree:0,forced:n.signal??null,active:[],offset:(hash(k)%26)*.65,ew:.5,cycle:null});
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
          const lane={id:lanes.length,e,reverse,index:i,offset:cross?.offset(i,reverse)??(raw.oneway?(i+.5-count/2)*3.35:(i+.5)*2.85),busOnly:listType(busOnly,kind),vehicles:[],entryAt:0,spaceBlocked:false,blockedBy:null};
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
    const profileMode=Object.hasOwn({auto:1,low:1,high:1},options.profileMode)?options.profileMode:'auto';
    const profileOffset=number(options.profileOffset,0,0,1e8);
    function profileIndex(){return profileMode==='low'?0:profileMode==='high'?1:dayPeriod(seconds+profileOffset);}
    const speedFactor=number(options.speedFactor,1,.3,3);
    const junctionTime=number(options.junctionTime,.72,.16,4);
    const dwellTime=number(options.busDwell,2.4,0,12);
    const seed=hash(options.seed??'blueprint-traffic');
    const {nodes,edges,lanes}=graph(network,options.signal!==false);
    const routing=network.turns?.length?Road.graph(network,'car'):null;
    const park=options.parking&&Park?Park.service(options.parking.configs,options.parking.candidates):null;
    let parkingWait=0,peakParkingQueue=0;
    const cars=new Map(), walkers=[], demands=[], transfers=new Set();
    const candidates=[], cooldown=new Map();
    let seconds=0, accumulator=0, wallClock=null, serial=0, completed=0, issued=0,
      rejected=0, waitFinished=0, tripFinished=0, lostDemand=0, offered=0, transferred=0, laneChanges=0,
      waitSeconds=0, pendingSeconds=0, maxQueue=0, maxSpill=0;
    const windows=Array.from({length:31},()=>({second:-1,offered:0,issued:0,completed:0,wait:0,laneChanges:0,spill:0}));
    const counters=Object.create(null), byExit=Object.create(null), bySource=Object.create(null);
    const bucket=()=>{
      const second=Math.floor(seconds), b=windows[second%windows.length];
      if(b.second!==second)Object.assign(b,{second,offered:0,issued:0,completed:0,wait:0,laneChanges:0,spill:0});
      return b;
    };
    const kinds={car:0,truck:0,bus:0}, finishedByKind={car:0,truck:0,bus:0};
    const signalCycle=number(options.signalCycle,14,6,100);
    const allRed=number(options.allRed,.75,0,signalCycle*.20);

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
      const profile=Object.hasOwn(PROFILES,desc.profile)?desc.profile:'steady';
      return {kind,path,total,cruise,phase,stops,continuous,interval,oneShot,busId:line?.id??desc.busId??null,
        journeyId:oneShot&&typeof desc.journeyId==='string'?desc.journeyId:null,
        parkingSite:oneShot&&typeof desc.parkingSite==='string'?desc.parkingSite:null,
        needsParking:Boolean(park&&kind==='car'&&desc.parking===true),parkDwell:number(desc.parkDwell,0,0,1500),profile,credit:0,tag:typeof desc.tag==='string'?desc.tag.slice(0,72):null,
        at:number(desc.departAt,offset,0,1e7),pending:0,active:0,rnd,i};
    }
    const offeredJourneys=[];
    function offer(desc){
      if(typeof desc?.journeyId!=='string'||offeredJourneys.length>=32||offeredJourneys.some(q=>q.journeyId===desc.journeyId))return false;
      const q=compile({...desc,kind:'car',repeat:false,departAt:seconds},400+offeredJourneys.length);
      if(!q)return false;
      q.offeredAt=seconds;offeredJourneys.push(q);return true;
    }
    function routeIdentity(q){
      return q.kind+'|'+q.profile+'|'+(q.tag||'')+'|'+q.oneShot+'|'+q.needsParking+'|'+signature(q.path.map(s=>({edge:s.e.rawId,reverse:s.reverse})))+
       '|'+[...q.stops].join('>');
    }
    function updateDemand(input){
      walkers.length=0;
      const lookup=new Map();
      for(const q of demands){const k=routeIdentity(q);if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(q);}
      const next=[];
      for(const [i,d] of array(input).slice(0,620).entries()){
        const route=compile(d,i);
        if(!route){rejected++;continue;}
        if(route.kind==='walker'){if(walkers.length<maxWalkers)walkers.push(route);continue;}
        const q=lookup.get(routeIdentity(route))?.shift();
        if(q){
          q.interval=route.interval;q.cruise=route.cruise;q.parkDwell=route.parkDwell;next.push(q);
        }else{
          route.at+=seconds;next.push(route);
        }
      }
      for(const leftover of lookup.values())for(const q of leftover){lostDemand+=q.pending;q.pending=0;q.continuous=false;}
      demands.splice(0,demands.length,...next);
    }
    updateDemand(descriptors);

    const stopAt=(lane,length)=>lane.e.total-Math.min(lane.e.total*.24,length*.53);
    const beginAt=(lane,length)=>Math.min(length*.54,lane.e.total*.26);
    const lengthOf=a=>LENGTH[a.kind];
    const canEnter=(lane,length)=>{
      if(lane.reserved||seconds+EPS<lane.entryAt)return false;
      const back=lane.vehicles[0], start=beginAt(lane,length);
      return stopAt(lane,length)>=start-EPS&&(!back||Math.min(back.s,back.prevS)-start+EPS>=(length+lengthOf(back))*.5+GAP);
    };
    function laneChoices(seg,kind,own=null){
      const canUse=seg.lanes.filter(l=>kind==='bus'||!l.busOnly);
      const good=canUse.filter(l=>canEnter(l,LENGTH[kind]));
      good.sort((a,b)=> (kind==='bus'?Number(b.busOnly)-Number(a.busOnly):0)||
        a.vehicles.length-b.vehicles.length||(own?Math.abs(a.offset-own.offset)-Math.abs(b.offset-own.offset):0)||a.index-b.index);
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
      const period=profileIndex();
      // Rotate the first admission so high load cannot permanently starve later sources.
      const all=offeredJourneys.length?[...demands,...offeredJourneys]:demands;
      const first=all.length?Math.floor(seconds/dt)%all.length:0;
      for(let i=0;i<all.length;i++){
        const q=all[(i+first)%all.length];
        if(q.oneShot&&seconds+EPS>=q.at){q.at=Infinity;q.pending++;offered++;bucket().offered++;}
        else if(!q.oneShot&&seconds+EPS>=q.at&&!(q.continuous&&q.active)){
          q.credit+=dt/q.interval*PROFILES[q.profile][period];
          if(!q.started){q.started=true;q.credit+=1;}
          const due=Math.floor(q.credit+EPS);
          if(due){
            q.credit-=due;offered+=due;bucket().offered+=due;
            const cap=q.kind==='bus'?1:16;
            lostDemand+=Math.max(0,q.pending+due-cap);
            q.pending=Math.min(cap,q.pending+due);
          }
        }
        if(!q.pending||cars.size>=maxVehicles||q.continuous&&q.active)continue;
        const seg=q.path[0], chosen=laneChoices(seg,q.kind)[0];
        if(!chosen)continue;
        const a={id:'v'+(++serial),kind:q.kind,route:q,index:0,s:0,speed:0,wait:0,started:seconds,
          chosenVar:(serial+seed)%PALETTE.length,dwellCount:0,nextChange:seconds+1.4};
        if(q.continuous){q.credit=0;q.started=false;q.at=seconds+q.interval;}
        join(a,chosen,Math.min(2.6,q.cruise*.22));cars.set(a.id,a);q.pending--;q.active++;issued++;bucket().issued++;kinds[q.kind]++;
        if(q.tag)bySource[q.tag]=(bySource[q.tag]||0)+1;
      }
    }
    function gapAhead(lane,s,len){
      let i=0;while(i<lane.vehicles.length&&lane.vehicles[i].s<s)i++;
      const lead=lane.vehicles[i], back=lane.vehicles[i-1];
      const frontGap=lead?lead.s-s-(len+lengthOf(lead))*.5-GAP:lane.e.total-s;
      const rearGap=back?s-back.s-(len+lengthOf(back))*.5-GAP:Infinity;
      return {i,frontGap,rearGap,back};
    }
    function switchLanes(){
      if(options.laneChanges===false)return;
      for(const lane of lanes){
        if(lane.vehicles.length<2)continue;
        const family=lane.reverse?lane.e.rev:lane.e.fwd;
        if(family.length<2)continue;
        for(let i=lane.vehicles.length-2;i>=0;i--){
          const a=lane.vehicles[i],len=lengthOf(a);
          if(a.kind==='bus'||seconds<a.nextChange||a.s<14||lane.e.total-a.s<Math.max(20,a.speed*1.35))continue;
          const rear=lane.vehicles[i-1];
          if(rear&&a.s-rear.s-(len+lengthOf(rear))*.5-GAP<rear.speed*1.15+2.3)continue;
          const leader=lane.vehicles[i+1],present=leader.s-a.s-(len+lengthOf(leader))*.5-GAP;
          if(present>Math.min(15,a.speed*1.2+3)||leader.speed>lane.e.roadSpeed*.84)continue;
          let choice=null;
          for(const adj of [family[lane.index-1],family[lane.index+1]]){
            if(!adj||adj.busOnly||adj.reserved&&a.s<20)continue;
            const g=gapAhead(adj,a.s,len);
            if(g.frontGap<Math.max(5.5,present+7,a.speed*.90)||g.rearGap<Math.max(5.5,(g.back?.speed||0)*1.05))continue;
            if(!choice||g.frontGap>choice.g.frontGap)choice={adj,g};
          }
          if(!choice)continue;
          lane.vehicles.splice(i,1);choice.adj.vehicles.splice(choice.g.i,0,a);
          a.lateral={from:lane.offset,begin:seconds,duration:1.15};a.lane=choice.adj;a.nextChange=seconds+4.1;laneChanges++;bucket().laneChanges++;
        }
      }
    }
    function updateLane(lane) {
      const stack=lane.vehicles;
      if(!stack.length)return;
      for(let i=stack.length-1;i>=0;i--){
        const a=stack[i], len=lengthOf(a), end=stopAt(lane,len);
        a.prevS=a.s;a.blockCause=null;a.blockedBy=null;
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
          if(a.route.busId)options.onBusStop?.({busId:a.route.busId,vehicleId:a.id,node:a.route.path[a.index].to,at:seconds});
        }
        const dwelling=a.busDwellUntil!==null&&seconds+EPS<a.busDwellUntil;
        a.ready=atEnd&&!dwelling;
        if(a.ready&&a.arrival===0)a.arrival=seconds;
        a.queued=!dwelling&&a.speed<STOP_SPEED&&((Boolean(ahead)&&gap<2.3)||atEnd);
        if(a.queued){a.wait+=dt;waitSeconds+=dt;bucket().wait+=dt;a.blockCause=ahead?'queue':null;}
        if(a.ready)candidates.push(a);
      }
    }
    function signalState(node){
      const cycle=node.cycle||signalCycle, t=((seconds+node.offset)%cycle+cycle)%cycle;
      const ew=cycle*node.ew, half=t<ew?0:1, end=half?cycle:ew;
      return end-t<=allRed?{axis:-1,remaining:end-t}:{axis:half,remaining:end-t-allRed};
    }
    function configureSignal(node,state){
      if(state&&typeof state==='object'){
        node.signal=state.enabled!==false;
        node.ew=number(state.ew,.5,.2,.8);
        node.cycle=number(state.cycle,signalCycle,6,100);
        node.offset=number(state.offset,node.offset,-100,100);
      }else node.signal=Boolean(state);
    }
    for(const [node,config] of Object.entries(options.signals||{}))if(nodes.has(node))configureSignal(nodes.get(node),config);
    function compatible(a,b){
      if(a.inLane===b.inLane||a.outLane===b.outLane)return false;
      if(a.from===b.from&&a.to===b.to)return true;
      // Opposing straight traffic can pass concurrently; turns reserve the box.
      return a.straight&&b.straight&&angleDiff(a.heading,b.heading)>PI*.80;
    }
    function retire(a,abort=false){
      if(a.route.journeyId){
        const i=offeredJourneys.indexOf(a.route);if(i>=0)offeredJourneys.splice(i,1);
      }
      cars.delete(a.id);a.route.active--;if(abort){kinds[a.kind]--;lostDemand++;return;}completed++;bucket().completed++;if(a.route.tag)byExit[a.route.tag]=(byExit[a.route.tag]||0)+1;kinds[a.kind]--;finishedByKind[a.kind]++;
      waitFinished+=a.wait;tripFinished+=seconds-a.started;
    }
    function crossing(){
      candidates.sort((a,b)=>a.arrival-b.arrival||a.lane.id-b.lane.id);
      for(const a of candidates){
        const own=a.lane, route=a.route, from=route.path[a.index];
        if(own.vehicles.at(-1)!==a)continue;
        const wrap=a.index+1===route.path.length&&route.continuous;
        const to=route.path[wrap?0:a.index+1];
        if(!to){
          if(route.needsParking){
            const space=park.park(from.to,seconds,a);
            if(!space){
              if(route.journeyId&&seconds-(route.offeredAt??a.started)>290){own.vehicles.pop();retire(a,true);continue;}
              a.parkingWaitStart??=seconds;
              a.blockCause='parking';parkingWait+=dt;
              continue;
            }
            if(route.journeyId){
              const wait=a.parkingWaitStart===undefined?0:seconds-a.parkingWaitStart;
              options.onPark?.({journeyId:route.journeyId,site:space.id,node:from.to,at:seconds,drive:Math.max(0,seconds-(route.offeredAt??a.started)-wait)});
            }
          }else if(route.journeyId)options.onArrive?.({journeyId:route.journeyId,node:from.to,at:seconds,drive:seconds-(route.offeredAt??a.started)});
          own.vehicles.pop();retire(a);continue;
        }
        const node=nodes.get(from.to);
        const eligible=to.lanes.filter(l=>a.kind==='bus'||!l.busOnly);
        const outs=laneChoices(to,a.kind,own);
        // A temporary reserving vehicle is not itself a spillback. It counts only
        // if an actual downstream tail is already within the physical entry gap.
        const start=beginAt(eligible[0]||own,lengthOf(a));
        const full=eligible.length>0&&eligible.every(l=>{
          const tail=l.vehicles[0];return tail&&Math.min(tail.s,tail.prevS)-start<(lengthOf(a)+lengthOf(tail))*.5+GAP;
        });
        if(full){a.blockCause='space';a.blockedBy=to.e.rawId;own.spaceBlocked=true;own.blockedBy=to.e.rawId;}
        else if(node.signal&&signalState(node).axis!==axis(from.arrival))a.blockCause='signal';
        else a.blockCause='conflict';
        if(full||node.signal&&signalState(node).axis!==axis(from.arrival))continue;
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
          a.queued=false;a.ready=false;a.blockCause=null;a.blockedBy=null;a.lateral=null;a.speed=gap/duration;transfers.add(a);
          transferred++;counters[from.e.rawId]=(counters[from.e.rawId]||0)+1;
          break;
        }
      }
    }
    function finishTransfers(){
      for(const a of transfers){
        const t=a.cross;
        if(seconds+EPS<t.begin+t.duration)continue;
        transfers.delete(a);t.lane.reserved=null;a.cross=null;
        if(t.wrap){completed++;bucket().completed++;finishedByKind.bus++;waitFinished+=a.wait;tripFinished+=seconds-a.started;a.wait=0;a.started=seconds;}
        a.index=t.wrap?0:a.index+1;
        join(a,t.lane,Math.max(1.9,a.speed));
        a.joinBlend=t;
      }
    }
    function tick(){
      seconds+=dt;candidates.length=0;
      const b=bucket();
      park?.advance(seconds);
      for(let i=offeredJourneys.length-1;i>=0;i--){
        const q=offeredJourneys[i];
        if(!q.active&&seconds-q.offeredAt>290){offeredJourneys.splice(i,1);lostDemand++;}
      }
      switchLanes();
      for(const lane of lanes){lane.spaceBlocked=false;lane.blockedBy=null;updateLane(lane);}
      finishTransfers();
      crossing();
      departures();
      let queue=0,spill=0,parkQueue=0;
      for(const a of cars.values())if(a.queued){queue++;if(a.blockCause==='parking')parkQueue++;}
      peakParkingQueue=Math.max(peakParkingQueue,parkQueue);
      for(const lane of lanes){
        const tail=lane.vehicles[0];
        if(lane.spaceBlocked&&tail&&tail.queued&&tail.s<=Math.max(8,beginAt(lane,lengthOf(tail))+lengthOf(tail)))spill++;
      }
      b.spill=Math.max(b.spill,spill);maxQueue=Math.max(maxQueue,queue);maxSpill=Math.max(maxSpill,spill);
      for(const q of demands)pendingSeconds+=q.pending*dt;
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
          a.joinBlend=null;
          const blend=a.lateral,t=blend?clamp((now-blend.begin)/blend.duration,0,1):1;
          const side=blend?blend.from+(a.lane.offset-blend.from)*t*t*(3-2*t):a.lane.offset;
          if(t===1)a.lateral=null;
          p=paintPoint(seg,a.prevS+(a.s-a.prevS)*alpha,side);
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
      const directions=dict(), causes={signal:0,space:0,conflict:0,queue:0,parking:0},parkingCauses={unconnected:0,price:0,full:0,entry:0};
      let queued=0,dwell=0,waitActive=0,backlog=0,moving=transfers.size,spillback=0,blockedApproaches=0;
      for(const a of transfers)waitActive+=a.wait;
      for(const q of demands)backlog+=q.pending;
      for(const [k,e] of edges){
        let n=0,slow=0,speed=0,size=0;
        const dir=[0,1].map(()=>({occupancy:0,queued:0,tail:0,spill:0,blockedBy:null,causes:{signal:0,space:0,conflict:0,queue:0,parking:0}}));
        for(const lane of [...e.fwd,...e.rev]){
          const d=dir[+lane.reverse];d.occupancy+=lane.vehicles.length;
          const first=lane.vehicles[0],head=lane.vehicles.at(-1);
          if(lane.spaceBlocked){blockedApproaches++;d.blockedBy=lane.blockedBy;}
          if(lane.spaceBlocked&&first&&first.queued&&first.s<=Math.max(8,beginAt(lane,lengthOf(first))+lengthOf(first))){spillback++;d.spill++;}
          let queueTail=null;
          for(let i=lane.vehicles.length-1;i>=0;i--){const q=lane.vehicles[i];if(!q.queued)break;queueTail=q;}
          if(queueTail&&head?.queued)d.tail=Math.max(d.tail,e.total-queueTail.s);
          size+=Math.max(1,Math.floor(e.total/(LENGTH.car+GAP)));
          for(const a of lane.vehicles){
            n++;speed+=a.speed;waitActive+=a.wait;
            if(a.queued){slow++;d.queued++;const reason=a.blockCause;if(reason==='parking'&&a.parkingReason)parkingCauses[a.parkingReason]++;if(reason){causes[reason]++;d.causes[reason]++;}if(a.ready){const j=a.route.path[a.index].to;junctionQueues[j]=(junctionQueues[j]||0)+1;}}
            else if(a.busDwellUntil!==null&&a.busDwellUntil>seconds)dwell++;
            if(a.speed>=STOP_SPEED)moving++;
          }
        }
        directions[k]=dir;edgeQueues[k]=slow;edgeOccupancy[k]=n;
        edgeSpeed[k]=n?speed/n:0;edgeCapacity[k]=size;
        edgeTraffic[k]=n?clamp(.59*slow/Math.max(1,n)+.41*n/Math.max(1,size),0,1):0;
        queued+=slow;
      }
      const rolling={offered:0,issued:0,completed:0,wait:0,laneChanges:0,spill:0,seconds:Math.min(30,seconds)};
      const oldest=Math.floor(seconds)-29;
      for(const b of windows)if(b.second>=oldest&&b.second>=0){
        for(const k of ['offered','issued','completed','wait','laneChanges'])rolling[k]+=b[k];
        rolling.spill=Math.max(rolling.spill,b.spill);
      }
      return {time:seconds,vehicles:cars.size,queued,moving,dwell,completed,issued,offered,transferred,backlog,lostDemand,rejected,
        meanWait:completed?waitFinished/completed:0,meanActiveWait:cars.size?waitActive/cars.size:0,
        meanTrip:completed?tripFinished/completed:0,byKind:{...kinds},completedByKind:{...finishedByKind},
        edgeQueues,edgeOccupancy,edgeSpeed,edgeCapacity,edgeTraffic,junctionQueues,directions,causes,spillback,blockedApproaches,rolling,
        waitSeconds,pendingSeconds,maxQueue,maxSpill,laneChanges,byExit:{...byExit},bySource:{...bySource},edgePassed:{...counters},
        parking:park?{...park.report(),wait:parkingWait,waiting:causes.parking,causes:parkingCauses,peakWaiting:peakParkingQueue}:null,
        period:PERIODS[profileIndex()],periodName:WINDOW_NAMES[profileIndex()],profileMode};
    }
    function setSignal(nodeId,state=true){
      const node=nodes.get(id(nodeId));if(!node)return false;
      configureSignal(node,state);return true;
    }
    function signals(){
      return [...nodes.values()].filter(n=>n.signal).map(n=>{
        const t=signalState(n);
        return {node:n.id,phase:t.axis<0?'all-red':t.axis===0?'east-west':'north-south',remaining:t.remaining,ew:n.ew,cycle:n.cycle||signalCycle};
      });
    }
    for(let left=number(options.warmupSeconds,0,0,20);left>EPS;left-=2)step(Math.min(left,2));
    return {step,advance,agents,stats,setSignal,signals,updateDemand,offer,now:()=>seconds};
  }
  return {create,causeNames};
});
