/* Independent underground mains and electricity lines; zero dependencies. */
(function(root,factory){
  const result=factory();
  if(typeof module==='object'&&module.exports)module.exports=result;
  else root.Utilities=result;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const TYPES={
    water:{name:'供水管网',caption:'水管',color:'#68c7ee',cost:23,baseCost:65,capacity:500,range:315,maintenance:.19},
    power:{name:'电力线路',caption:'电线',color:'#f6cf71',cost:18,baseCost:55,capacity:520,range:345,maintenance:.14}
  };
  const EPS=1e-7, MAX_LINES=2400, MAX_POINTS=180, MAX_LINE_LENGTH=3600;
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const hasType=t=>Object.hasOwn(TYPES,t);
  const round=n=>Math.round(n*1e6)/1e6;
  const validNumber=Number.isFinite;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const delta=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
  const cross=(a,b)=>a.x*b.y-a.y*b.x;
  const atFraction=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const error=reason=>({ok:false,reason});
  function point(raw){
    const p=Array.isArray(raw)?{x:raw[0],y:raw[1]}:raw;
    return p&&validNumber(p.x)&&validNumber(p.y)&&Math.abs(p.x)<=50000&&Math.abs(p.y)<=50000?{x:round(p.x),y:round(p.y)}:null;
  }
  const pathLength=poly=>poly.reduce((n,p,i)=>i?n+distance(p,poly[i-1]):0,0);
  function geometry(raw){
    if(!Array.isArray(raw)||raw.length>MAX_POINTS||raw.length<2)return null;
    const points=[];
    for(const item of raw){
      const p=point(item);if(!p)return null;
      if(!points.length||distance(p,points.at(-1))>.005)points.push(p);
    }
    // Collinear sample points along old road edges need not be retained.
    for(let i=points.length-2;i>0;i--){
      const a=points[i-1],b=points[i],c=points[i+1],u=delta(b,a),v=delta(c,b);
      if(Math.abs(cross(u,v))<.00005&&u.x*v.x+u.y*v.y>0)points.splice(i,1);
    }
    return points.length>=2?points:null;
  }
  function create(opts={}){
    return {version:1,nextId:1,lines:[],legacy:opts?.legacy!==false,managed:{water:false,power:false},bootstrapped:false};
  }
  const isManaged=(state,type)=>hasType(type)&&!!state&&(state.legacy===false||state.managed?.[type]===true);
  function setManaged(state,type,active=true){
    if(!state||!hasType(type))return false;
    (state.managed??={})[type]=!!active;return true;
  }
  function quote(state,spec){
    if(!state||!Array.isArray(state.lines)||!hasType(spec?.type))return error('请选择水管或电力线路。');
    const points=geometry(spec.points||spec.pts);if(!points)return error('线路需要至少两个不同、有效的位置。');
    const len=pathLength(points);
    if(len<6||len>MAX_LINE_LENGTH)return error('线路长度需要在 6–3,600 米之间。');
    if(state.lines.length>=MAX_LINES)return error('达到线路数量上限。');
    const type=spec.type,final=points.at(-1),first=points[0];
    const same=(a,b)=>a.x===b.x&&a.y===b.y;
    const identical=state.lines.some(line=>{
      if(line.type!==type||line.points.length!==points.length)return false;
      const p=line.points;
      if(same(first,p[0])&&same(final,p.at(-1)))return points.every((q,i)=>same(q,p[i]));
      if(same(first,p.at(-1))&&same(final,p[0]))return points.every((q,i)=>same(q,p[p.length-1-i]));
      return false;
    });
    if(identical)return error('这段同类线路已经存在。');
    const rule=TYPES[type],cost=Math.round(rule.baseCost+rule.cost*len);
    if(validNumber(spec.budget)&&cost>spec.budget)return {...error('市库不足。'),cost};
    return {ok:true,type,points,length:len,cost};
  }
  const append=(state,p,legacy)=>{
    if(!Number.isSafeInteger(state.nextId)||state.nextId<1)state.nextId=1;
    let id;do{id='U'+state.nextId++;}while(state.lines.some(x=>x.id===id));
    const line={id,type:p.type,points:p.points,...(legacy?{legacy:true}:{})};
    state.lines.push(line);return line;
  };
  function add(state,spec){
    const result=quote(state,spec);
    if(!result.ok)return result;
    const line=append(state,result,false);setManaged(state,result.type);
    return {...result,id:line.id,line};
  }
  function remove(state,id){
    const i=state?.lines?.findIndex(l=>l.id===id)??-1;
    if(i<0)return false;
    const [line]=state.lines.splice(i,1);setManaged(state,line.type);
    return true;
  }
  function restore(raw){
    if(raw?.version!==1||!Array.isArray(raw.lines)||raw.lines.length>MAX_LINES)return null;
    const state=create({legacy:raw.legacy!==false}),ids=new Set();
    let next=1;
    for(const l of raw.lines){
      if(typeof l?.id!=='string'||!/^U[1-9][0-9]{0,12}$/.test(l.id)||ids.has(l.id)||!hasType(l.type))return null;
      const points=geometry(l.points);if(!points||pathLength(points)>MAX_LINE_LENGTH)return null;
      ids.add(l.id);next=Math.max(next,Number(l.id.slice(1))+1);
      state.lines.push({id:l.id,type:l.type,points,...(l.legacy===true?{legacy:true}:{})});
    }
    state.nextId=Number.isSafeInteger(raw.nextId)?Math.max(next,Math.min(raw.nextId,1e13-1)):next;
    state.bootstrapped=raw.bootstrapped===true;
    for(const t of Object.keys(TYPES))state.managed[t]=raw.managed?.[t]===true||state.lines.some(l=>l.type===t&&!l.legacy);
    return state;
  }
  function bootstrap(state,civic,roads,opts={}){
    if(!state||!Array.isArray(state.lines)||state.bootstrapped)return {created:0,lines:[]};
    const list=Array.isArray(roads)?roads:roads?.edges;
    if(!Array.isArray(list)||!list.length)return {created:0,lines:[]};
    if(state.legacy===false&&opts.force!==true)return {created:0,lines:[]};
    const sorted=[...list].sort((a,b)=>String(a?.id)<String(b?.id)?-1:String(a?.id)>String(b?.id)?1:0);
    const added=[];
    for(const type of Object.keys(TYPES)){
      if(isManaged(state,type)&&opts.force!==true)continue;
      for(const road of sorted){
        const points=geometry(road?.points||road?.pts);
        if(!points)continue;
        const r=quote(state,{type,points});
        if(r.ok)added.push(append(state,r,true));
      }
    }
    state.bootstrapped=true;
    return {created:added.length,lines:added};
  }
  function projected(p,e){
    const {a,b,len}=e,v=delta(p,a),u=delta(b,a),t=clamp((u.x*v.x+u.y*v.y)/(len*len));
    const x=a.x+t*u.x,y=a.y+t*u.y;
    return {x,y,t,sq:(x-p.x)**2+(y-p.y)**2};
  }
  function crossing(a,b){
    const u=delta(a.b,a.a),v=delta(b.b,b.a),w=delta(b.a,a.a),den=cross(u,v);
    if(Math.abs(den)<EPS)return null;
    const t=cross(w,v)/den,s=cross(w,u)/den;
    return t>=-EPS&&t<=1+EPS&&s>=-EPS&&s<=1+EPS?[clamp(t),clamp(s)]:null;
  }
  const cache=new WeakMap();
  function buildNetwork(state,type,disabled){
    const lines=state.lines.filter(line=>line.type===type&&!disabled.has(line.id));
    const signature=lines.map(l=>l.id+'='+l.points.map(p=>p.x+','+p.y).join(';')).join('|');
    const prior=cache.get(state)?.[type];
    if(prior?.signature===signature)return prior.graph;
    const seg=[];
    for(const line of lines)for(let i=1;i<line.points.length;i++){
      const a=point(line.points[i-1]),b=point(line.points[i]);if(!a||!b)continue;
      const len=distance(a,b);if(len<EPS)continue;
      seg.push({a,b,len,id:line.id,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y),split:[0,1]});
    }
    for(let i=0;i<seg.length;i++)for(let j=i+1;j<seg.length;j++){
      const a=seg[i],b=seg[j];
      if(a.maxX+EPS<b.minX||b.maxX+EPS<a.minX||a.maxY+EPS<b.minY||b.maxY+EPS<a.minY)continue;
      const hit=crossing(a,b);
      if(hit){a.split.push(hit[0]);b.split.push(hit[1]);continue;}
      for(const p of [a.a,a.b]){const q=projected(p,b);if(q.sq<EPS*EPS)b.split.push(q.t);}
      for(const p of [b.a,b.b]){const q=projected(p,a);if(q.sq<EPS*EPS)a.split.push(q.t);}
    }
    const nodes=[],edges=[],coords=new Map();
    function node(p){
      const key=Math.round(p.x*1e4)+','+Math.round(p.y*1e4);
      if(coords.has(key))return coords.get(key);
      const i=nodes.length;nodes.push({...p,to:[]});coords.set(key,i);return i;
    }
    for(const part of seg){
      const split=part.split.sort((a,b)=>a-b);
      for(let i=1;i<split.length;i++){
        if(split[i]-split[i-1]<EPS)continue;
        const a=atFraction(part.a,part.b,split[i-1]),b=atFraction(part.a,part.b,split[i]);
        const u=node(a),v=node(b),len=distance(a,b);
        if(u===v||len<EPS)continue;
        nodes[u].to.push([v,len]);nodes[v].to.push([u,len]);edges.push({a,b,u,v,len,id:part.id});
      }
    }
    const seen=new Int32Array(nodes.length).fill(-1);
    for(let start=0;start<nodes.length;start++)if(seen[start]<0){
      const q=[start];seen[start]=start;
      for(let i=0;i<q.length;i++)for(const [n] of nodes[q[i]].to)if(seen[n]<0){seen[n]=start;q.push(n);}
    }
    const graph={edges,nodes,components:seen,attached:new Map()};
    const record=cache.get(state)??{};record[type]={signature,graph};cache.set(state,record);
    return graph;
  }
  function attach(graph,p,max,all=false){
    const key=p.x+','+p.y+';'+max+';'+all;
    if(graph.attached.has(key))return graph.attached.get(key);
    let best=null,min=max*max+EPS;
    const byComponent=new Map();
    for(const e of graph.edges){
      const v=projected(p,e);
      if(all&&v.sq<=max*max+EPS){
        const id=graph.components[e.u],current=byComponent.get(id);
        if(!current||v.sq<current.sq)byComponent.set(id,{edge:e,t:v.t,offset:Math.sqrt(v.sq),sq:v.sq});
      }else if(!all&&v.sq<min){min=v.sq;best={edge:e,t:v.t,offset:Math.sqrt(v.sq)};}
    }
    if(graph.attached.size>20000)graph.attached.clear();
    const result=all?[...byComponent.values()].sort((a,b)=>a.sq-b.sq||String(a.edge.id).localeCompare(String(b.edge.id))):best;
    graph.attached.set(key,result);return result;
  }
  function distances(graph,entry,limit){
    const d=new Float64Array(graph.nodes.length).fill(Infinity),queue=[];
    function push(v,c){
      if(c>=d[v]||c>limit)return;
      d[v]=c;let i=queue.length;const item=[v,c];queue.push(item);
      while(i){const up=(i-1)>>1;if(queue[up][1]<=c)break;queue[i]=queue[up];i=up;}queue[i]=item;
    }
    const e=entry.edge;
    push(e.u,e.len*entry.t);push(e.v,e.len*(1-entry.t));
    while(queue.length){
      const [u,c]=queue[0],last=queue.pop();
      if(queue.length){
        let i=0;
        while(i*2+1<queue.length){
          let j=i*2+1;
          if(j+1<queue.length&&queue[j+1][1]<queue[j][1])j++;
          if(queue[j][1]>=last[1])break;
          queue[i]=queue[j];i=j;
        }
        queue[i]=last;
      }
      if(c!==d[u])continue;
      for(const [v,len] of graph.nodes[u].to)push(v,c+len);
    }
    return d;
  }
  function segmentDistance(model,target){
    const edge=target.edge,{route,entry}=model;
    let len=Math.min(route[edge.u]+edge.len*target.t,route[edge.v]+edge.len*(1-target.t));
    if(edge===entry.edge)len=Math.min(len,Math.abs(entry.t-target.t)*edge.len);
    return len+entry.offset+target.offset;
  }
  const signal=(d,range)=>d>range?0:clamp(1-.58*d/range);
  const defaults={lotDistance:48,sourceDistance:48,range:{},capacity:{}};
  const numeric=(n,d,max=Infinity)=>validNumber(n)&&n>0?Math.min(n,max):d;
  const setFrom=x=>x instanceof Set?x:new Set(Array.isArray(x)?x:[]);
  function findOptions(graph,entries,models){
    if(!entries.length)return [];
    const options=[];
    for(const model of models){
      const component=graph.components[model.entry.edge.u];
      const entry=entries.find(q=>graph.components[q.edge.u]===component);
      if(!entry)continue;
      const distance=segmentDistance(model,entry),strength=signal(distance,model.range);
      if(strength)options.push({model,distance,strength});
    }
    options.sort((a,b)=>a.model.priority-b.model.priority||a.distance-b.distance||(String(a.model.id)<String(b.model.id)?-1:1));
    return options;
  }
  function lotLoad(lot,type){
    const on=validNumber(lot.occupants)?clamp(lot.occupants,0,200):0;
    const reserve=lot.type==='industrial'?3.5:2.4;
    const work=lot.type==='industrial'?(type==='power'?1.34:1.13):lot.type==='office'&&type==='power'?1.09:1;
    return (Math.max(reserve,on)*work);
  }
  function evaluate(state,civic,raw={}){
    const util=state&&Array.isArray(state.lines)?state:create(),settings={...defaults,...raw};
    const lotDistance=numeric(raw.lotDistance??raw.serviceDistance,48,400),sourceDistance=numeric(settings.sourceDistance,48,400);
    const disabled=setFrom(settings.disabledLines),offline=setFrom(settings.offlineSources);
    const city=civic?.civic||civic||{},lotsInput=Array.isArray(city.lots)?city.lots:[];
    const synthetic=Array.isArray(settings.syntheticSources)?settings.syntheticSources.slice(0,400).map(x=>({...x,synthetic:true})):[];
    const sourcesInput=[...(Array.isArray(city.services)?city.services:[]),...synthetic];
    const lots=Object.create(null),sources=Object.create(null),lines=Object.create(null),details=Object.create(null),types={},network={},modelsByType={},componentDemand={water:Object.create(null),power:Object.create(null)};
    for(const lot of lotsInput){if(lot&&lot.id!=null){lots[lot.id]={water:0,power:0};details[lot.id]={};}}
    for(const line of util.lines)if(line&&line.id!=null&&hasType(line.type))lines[line.id]={type:line.type,connected:false,strength:0,disabled:disabled.has(line.id),length:0};
    let maintenance=0;
    for(const type of Object.keys(TYPES)){
      const def=TYPES[type], graph=buildNetwork(util,type,disabled);
      const summary={managed:isManaged(util,type),count:0,active:0,capacity:0,demand:0,supplied:0,connectedLots:0,reliableLots:0,outageLots:0,maintenance:0};
      const models=[];
      for(const station of sourcesInput){
        if(!station||station.type!==type||station.id==null)continue;
        const p=point(station),entry=p?attach(graph,p,sourceDistance):null,override=station.synthetic?station:settings.sourceOverrides?.[station.id];
        const pct=clamp(validNumber(city.budgets?.[type])?city.budgets[type]/100:1,0,1.5);
        const priority=validNumber(override?.priority)?clamp(override.priority,-100,100):8;
        const cap=validNumber(override?.capacity)?clamp(override.capacity,0,20000):numeric(settings.capacity?.[type],def.capacity)*pct;
        const ready=entry&&cap>0&&!offline.has(station.id),component=entry?String(graph.components[entry.edge.u]):null;
        const source={id:station.id,type,active:!!ready,connected:!!entry,component,capacity:ready?cap:0,requested:0,used:0,reason:ready?'运营中':offline.has(station.id)?'设施停运':entry?'容量为零或待机':'未接入同类型线路'};
        sources[station.id]=source;summary.count++;
        if(!ready)continue;
        const range=validNumber(override?.range)?clamp(override.range,1,1800):numeric(settings.range?.[type],def.range)*Math.min(1.14,.74+pct*.26);
        source.range=range;
        models.push({id:station.id,entry,route:distances(graph,entry,range),priority,range,cap,stats:source});
        summary.capacity+=cap;
        summary.active++;
      }
      const prepared=[];
      for(const lot of lotsInput){
        if(!lot||lot.id==null)continue;
        const p=point(lot),entries=p?attach(graph,p,lotDistance,true):[];
        const eligible=settings.strictComponents&&entries.length?entries.filter(x=>graph.components[x.edge.u]===graph.components[entries[0].edge.u]):entries;
        const demand=lotLoad(lot,type),options=findOptions(graph,eligible,models);
        const primary=options[0],entry=entries.length>0,part=entry?String(graph.components[entries[0].edge.u]):null;
        if(part!==null)componentDemand[type][part]=(componentDemand[type][part]||0)+demand;
        if(primary)primary.model.stats.requested+=demand;
        prepared.push({id:lot.id,entry,part,demand,options,assigned:0,score:0,sourceId:primary?.model.id??null,distance:primary?.distance??null});
        summary.demand+=demand;
        if(entry)summary.connectedLots++;
      }
      for(const item of prepared){
        const first=item.options[0];if(!first)continue;
        const {model}=first, fraction=clamp(model.cap/model.stats.requested), assigned=item.demand*fraction;
        item.assigned=assigned;item.score=assigned*first.strength;model.stats.used+=assigned;
      }
      // A nearby overloaded utility can be backed up by a second reachable
      // source. Initial capacity is shared proportionally, not by lot order.
      for(const item of prepared){
        for(const alt of item.options.slice(1)){
          const need=item.demand-item.assigned,spare=alt.model.cap-alt.model.stats.used;
          if(need<EPS)break;
          if(spare<EPS)continue;
          const n=Math.min(need,spare);
          item.assigned+=n;item.score+=n*alt.strength;alt.model.stats.used+=n;
        }
        const rawQuality=type==='water'&&item.part!==null?settings.quality?.water?.[item.part]:null;
        const quality=validNumber(rawQuality)?clamp(rawQuality):1;
        const strength=clamp(item.score/item.demand)*quality;
        lots[item.id][type]=strength;
        details[item.id][type]={strength,quality,component:item.part,connected:!!item.entry,sourceId:item.sourceId,distance:item.distance,reliability:clamp(item.assigned/item.demand),
          reason:!item.entry?'未接入线路':!item.options.length?'线路未接到有效设施或超出输配范围':item.assigned/item.demand<.98?'设施容量不足':'正常供给'};
        summary.supplied+=item.assigned;
        if(strength>=.25)summary.reliableLots++;
        else summary.outageLots++;
      }
      for(const model of models)if(model.stats.requested>0)model.pressure=clamp(model.cap/model.stats.requested);else model.pressure=1;
      for(const edge of graph.edges){
        const report=lines[edge.id];if(!report)continue;
        report.length+=edge.len;
        for(const source of models){
          const d=segmentDistance(source,{edge,t:.5,offset:0});
          report.strength=Math.max(report.strength,signal(d,source.range)*source.pressure);
        }
        report.connected=report.strength>0;
      }
      for(const line of util.lines)if(line.type===type){
        const len=lines[line.id]?.length||pathLength(line.points);
        // Legacy mains are still funded by the existing service budget until activated.
        if(summary.managed)summary.maintenance+=len*def.maintenance;
      }
      summary.maintenance=Math.round(summary.maintenance);
      maintenance+=summary.maintenance;
      types[type]=summary;modelsByType[type]=models;network[type]=graph;
    }
    return {lots,details,sources,lines,types,network,componentDemand,models:modelsByType,lotDistance,maintenance};
  }
  function at(metrics,type,p){
    if(!hasType(type)||!metrics?.network?.[type])return 0;
    const q=point(p);if(!q)return 0;
    const graph=metrics.network[type],entries=attach(graph,q,metrics.lotDistance,true);
    return findOptions(graph,entries,metrics.models[type]).reduce((max,o)=>Math.max(max,o.strength*o.model.pressure),0);
  }
  function connections(result,p,type,radius=48){
    if(!hasType(type)||!result?.network?.[type]||!point(p))return [];
    const net=result.network[type],hits=attach(net,point(p),clamp(radius,1,100),true),seen=new Set(),out=[];
    for(const x of hits){const component=String(net.components[x.edge.u]);if(!seen.has(component)){seen.add(component);out.push({component,distance:x.offset,lineId:x.edge.id});}}
    return out;
  }
  const routeTrees=new WeakMap();
  function routeDistance(result,a,b,type,component=null){
    const graph=result?.network?.[type];if(!graph||!point(a)||!point(b))return Infinity;
    const filter=z=>component==null||String(graph.components[z.edge.u])===String(component);
    const from=attach(graph,point(a),48,true).filter(filter),to=attach(graph,point(b),48,true).filter(filter);
    if(!from.length||!to.length)return Infinity;
    if(!routeTrees.has(graph))routeTrees.set(graph,new Map());
    const cache=routeTrees.get(graph);
    return Math.min(...from.map(entry=>{
      const targets=to.filter(x=>graph.components[x.edge.u]===graph.components[entry.edge.u]);if(!targets.length)return Infinity;
      const key=entry.edge.u+'|'+entry.edge.v+'|'+entry.t;
      if(!cache.has(key)){if(cache.size>=600)cache.clear();cache.set(key,distances(graph,entry,1800));}
      const model={entry,route:cache.get(key)};
      return Math.min(...targets.map(x=>segmentDistance(model,x)));
    }));
  }
  return {create,restore,quote,add,remove,bootstrap,isManaged,setManaged,evaluate,connections,routeDistance,at,TYPES};
});
