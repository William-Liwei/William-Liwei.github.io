/* Distance-sampled sidewalks. Walkers offset from road width/vehicles, not
   from the live frame tangent, so corner rounding doesn't snap between sides. */
(function (root,factory) {
  const value=factory();
  if(typeof module==='object'&&module.exports)module.exports=value;
  else root.Pedestrians=value;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const EPS=1e-6, valid=Number.isFinite, TAU=2*Math.PI;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const mix=(a,b,t)=>{
    const length=(a.crosswalk||b.crosswalk)?dist(a,b):0;
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,edge:t<.5?a.edge:b.edge,
      crosswalk:!!((a.crosswalk&&t*length<=17)||(b.crosswalk&&(1-t)*length<=17))};
  };
  const pOf=p=>p&&valid(p.x)&&valid(p.y)?{x:p.x,y:p.y,z:valid(p.z)?p.z:0}:null;
  const dir=(a,b)=>{const d=dist(a,b);return d>EPS?{x:(b.x-a.x)/d,y:(b.y-a.y)/d,d}:null;};
  const cross=(a,b)=>a.x*b.y-a.y*b.x;
  const smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n);};
  const mod=(x,y)=>((x%y)+y)%y;
  const palette=['#d6ecba','#f1d7a5','#d9ebf9','#f3c8bc','#ede6ab'];
  function hash(text){
    let n=2166136261;for(const c of String(text))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;
  }
  function sidewalk(edge={},gap=1.7) {
    const lanes=clamp(Math.round(Number(edge.lanes)||2),1,8);
    const halfPaint=(lanes*(edge.kind==='highway'?3.8:3.35)+(edge.kind==='highway'?5.8:edge.kind==='ramp'?2.5:4.5))/2;
    const laneCount=edge.oneway?lanes:Math.ceil(lanes/2);
    const laneEnvelope=(laneCount-.48)*2.85+1.6;
    return Math.max(halfPaint,laneEnvelope)+gap;
  }
  function atSide(p,t,offset,side,edge,crosswalk=false){
    return {x:p.x-side*offset*t.y,y:p.y+side*offset*t.x,z:p.z,edge,crosswalk};
  }
  function link(network,path,settings,side,variant=0){
    const lookup=network instanceof Map?network:new Map((network?.edges||[]).map(x=>[String(x.id),x]));
    if(!Array.isArray(path)||path.length===0)return null;
    const segments=[];
    for(const r of path){
      const id=r?.edge??r?.id??r,edge=lookup.get(String(id));
      if(!edge||(edge.kind&&edge.kind!=='road'))return null;
      let source=edge.pts||edge.points;
      if(!Array.isArray(source)||source.length<2)return null;
      source=source.map(pOf);
      if(source.some(p=>!p||p.z< -3))return null;
      if(r?.reverse)source.reverse();
      const before=segments.at(-1);
      if(before&&(dist(before.b,source[0])>1.5||Math.abs(before.b.z-source[0].z)>1.5))return null;
      if(before)source[0]=before.b;
      for(let i=1;i<source.length;i++){
        const a=source[i-1],b=source[i],t=dir(a,b);
        if(!t)continue;
        segments.push({a,b,t,width:sidewalk(edge,settings.gap)+variant,id,
          // An edge transition is a junction; internal Bezier sampling isn't.
          junction:!!before&&segments.at(-1)===before});
      }
    }
    if(!segments.length)return null;
    const last=segments.at(-1),first=segments[0],raw=[atSide(first.a,first.t,first.width,side,first.id)];
    const push=p=>{if(dist(raw.at(-1),p)>.01)raw.push(p);else if(p.crosswalk)raw.at(-1).crosswalk=true;};
    for(let i=1;i<segments.length;i++){
      const a=segments[i-1],b=segments[i],p=a.b;
      const u=atSide(p,a.t,a.width,side,a.id,b.junction),v=atSide(p,b.t,b.width,side,b.id,b.junction);
      const s=cross(a.t,b.t),dot=a.t.x*b.t.x+a.t.y*b.t.y;
      if(Math.abs(s)<.025&&dot>.90){
        if(Math.abs(a.width-b.width)<.15)push(mix(u,v,.5));
        else{
          // Ease width tapers longitudinally, not by instant sideward steps.
          const r=Math.min(6,a.t.d*.46,b.t.d*.46);
          push({...u,x:u.x-a.t.x*r,y:u.y-a.t.y*r});
          push({...v,x:v.x+b.t.x*r,y:v.y+b.t.y*r});
        }
        continue;
      }
      if(Math.abs(s)>=.025){
        const displacement={x:v.x-u.x,y:v.y-u.y};
        const at=cross(displacement,b.t)/s,bt=cross(displacement,a.t)/s;
        const peak={...v,x:u.x+at*a.t.x,y:u.y+at*a.t.y,crosswalk:b.junction};
        // Regular corners use the intersection of the two sidewalk rails.
        // Acute hairpins can send that miter far away; use a bounded bevel.
        if(dot>-.80&&dist(p,peak)<=2.3*Math.max(a.width,b.width)&&
          (at>=-a.t.d*.93||raw.length===1)&&bt<=b.t.d*.93){push(peak);continue;}
      }
      push(u);push(v);
    }
    push(atSide(last.b,last.t,last.width,side,last.id));
    if(raw.length<2)return null;
    const points=[raw[0]];
    for(let i=1;i<raw.length-1;i++){
      const a=raw[i-1],p=raw[i],b=raw[i+1],d=dist(a,p),e=dist(p,b);
      if(d<EPS||e<EPS){points.push(p);continue;}
      const turn=dir(a,p),after=dir(p,b),dot=turn.x*after.x+turn.y*after.y;
      if(dot>.996){points.push(p);continue;}
      const r=Math.min(settings.rounding,d*.30,e*.30);
      const enter=mix(p,a,r/d),exit=mix(p,b,r/e);
      points.push(enter);
      for(let j=1;j<=6;j++){
        const t=j/6;
        points.push(mix(mix(enter,p,t),mix(p,exit,t),t));
      }
    }
    points.push(raw.at(-1));
    const runs=[];let length=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],d=distance3(a,b);
      if(d<EPS)continue;
      runs.push({a,b,from:length,to:length+d,d});length+=d;
    }
    return length>=.5?{runs,length,side}:null;
  }
  function distance3(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}
  function sample(route,distance){
    let l=0,r=route.runs.length-1;
    while(l<r){const m=(l+r)>>1;if(route.runs[m].to<distance)l=m+1;else r=m;}
    const run=route.runs[l],t=clamp((distance-run.from)/run.d,0,1);
    return mix(run.a,run.b,t);
  }
  function options(raw){
    return {gap:clamp(valid(raw.gap)?raw.gap:2.05,1,9),rounding:clamp(valid(raw.rounding)?raw.rounding:3.8,.5,8),
      dead:clamp(valid(raw.deadTime)?raw.deadTime:1.4,.45,8),useTripPhase:raw.useTripPhase===true,
      max:clamp(Math.floor(valid(raw.max)?raw.max:100),0,400),side:raw.side===1||raw.side===-1?raw.side:null};
  }
  const isWalk=t=>['walk','walker','pedestrian'].includes(t?.kind);
  function create(network={},trips=[],raw={}){
    const settings=options(raw),lookup=new Map((network.edges||[]).map(e=>[String(e.id),e])),routes=[],duplicates=new Map();
    for(const trip of trips){
      if(!isWalk(trip)||routes.length>=settings.max)continue;
      const p=trip.p||trip.path;
      if(!Array.isArray(p)||!p.length)continue;
      const key=trip.id!=null?'trip:'+trip.id:p.map(r=>String(r?.edge??r?.id??r)+(r?.reverse?'r':'f')).join('>');
      const ordinal=duplicates.get(key)||0;duplicates.set(key,ordinal+1);
      const seed=hash(key+'#'+ordinal),side=settings.side??(seed&1?1:-1);
      const shape=link(lookup,p,settings,side,.12+(seed%13)*.048);
      if(!shape)continue;
      // Legacy visual units are not metres/second; convert visibly oversized
      // descriptor speeds into a pedestrian-like range. Explicit mps wins.
      const speed=clamp(valid(trip.mps)?trip.mps:valid(trip.speed)?trip.speed*.21:2.75,.8,4.8);
      const moving=shape.length/speed,hold=settings.dead+(seed%19)*.025,cycle=moving+hold;
      const fraction=settings.useTripPhase&&valid(trip.phase)?mod(trip.phase,1):(seed%16777213)/16777213;
      routes.push({...shape,id:'ped:'+key+'#'+ordinal,speed,moving,hold,cycle,
        fade:Math.min(.88,moving*.26),lag:fraction*cycle,seed,color:trip.color||palette[seed%palette.length]});
    }
    const model={routes,agents(t){return agents(model,t);}};
    return model;
  }
  function agents(model,timeMs){
    const result=[];
    if(!model||!valid(timeMs))return result;
    for(const r of model.routes){
      const age=mod(timeMs/1000+r.lag,r.cycle);
      if(age>=r.moving)continue; // Invisible dwell before a respawn at origin.
      const opacity=smooth(age/r.fade)*smooth((r.moving-age)/r.fade);
      if(opacity<.008)continue;
      const d=age*r.speed,p=sample(r,d),a=sample(r,Math.max(0,d-.25)),b=sample(r,Math.min(r.length,d+.25));
      const angle=Math.atan2((b.y-a.y)-.76*(b.z-a.z),b.x-a.x);
      result.push({...p,id:r.id,angle,kind:'walk',speed:r.speed,color:r.color,
        opacity,side:r.side,phase:d*TAU/.86+(r.seed%47)/7});
    }
    return result;
  }
  return {create,agents,sidewalk};
});
