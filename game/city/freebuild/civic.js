/* Continuous-coordinate lots and city services. Distances include a short walk
   to/from the road; service vehicles share the geometric road graph. */
(function (root, factory) {
  const result = factory();
  if (typeof module === 'object' && module.exports) module.exports = result;
  else root.Civic = result;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const EPS = 1e-7, MAX_LOTS = 1800, MAX_NEW_LOTS = 320;
  const ZONES = {
    residential: { name:'住宅', cost:90, cap:12, tax:5, color:'#79b68e', levels:[0, 35, 67] },
    commercial: { name:'商业', cost:110, cap:10, tax:10, color:'#79bad2', levels:[0, 42, 73] },
    office: { name:'办公', cost:125, cap:16, tax:12, color:'#9e9dd5', levels:[0, 51, 77] },
    industrial: { name:'工业', cost:90, cap:17, tax:7, color:'#d1a16b', levels:[0, 45, 76] }
  };
  const SERVICES = {
    power:{name:'供电站',cost:7800,monthly:520,range:330,capacity:520,color:'#f4c574'},
    water:{name:'供水站',cost:6500,monthly:390,range:300,capacity:500,color:'#69c3ee'},
    fire:{name:'消防站',cost:6800,monthly:440,range:260,capacity:330,color:'#f58561'},
    police:{name:'警务站',cost:7200,monthly:480,range:265,capacity:350,color:'#88aef1'},
    school:{name:'学校',cost:9500,monthly:600,range:220,capacity:300,color:'#c6a3e5'},
    clinic:{name:'诊所',cost:7300,monthly:520,range:235,capacity:310,color:'#f4a3b7'},
    park:{name:'公园',cost:3100,monthly:160,range:155,capacity:330,color:'#9cce7c'},
    library:{name:'图书馆',cost:5400,monthly:290,range:190,capacity:225,color:'#dcc0f5',effect:'提高住宅和办公区的教育吸引力，并扩大办公需求。'},
    plaza:{name:'市民广场',cost:3800,monthly:210,range:125,capacity:240,color:'#f2c78b',effect:'改善步行可达的社区环境，显著增加附近商铺的客流和税收。'},
    waste:{name:'环卫站',cost:6200,monthly:370,range:250,capacity:390,color:'#94c68b',effect:'削减相连街区的工业污染，为高密度住宅和商业提供额外市政支持。'},
    logistics:{name:'物流中心',cost:10300,monthly:690,range:290,capacity:360,color:'#d6a680',effect:'增加工业岗位需求和产出税收，少量改善商业供货；紧邻住宅会有卡车噪声。'}
  };
  const DEFAULTS={lotPitch:25,roadSetback:7,frontage:31,maxAccess:48,serviceAccess:46,requireUtilities:true};
  const SQ = n => n*n, clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
  const finite = n => typeof n==='number' && Number.isFinite(n);
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:(a.z||0)+((b.z||0)-(a.z||0))*t});
  function point(p) {
    const a=Array.isArray(p)?{x:p[0],y:p[1],z:p[2]}:p;
    return a&&finite(a.x)&&finite(a.y)?{x:a.x,y:a.y,z:finite(a.z)?a.z:0}:null;
  }
  function cleanPoints(points) {
    if(!Array.isArray(points))return [];
    const result=[];
    for(const raw of points.slice(0,250)){const p=point(raw);if(p&&(!result.length||dist(p,result[result.length-1])>EPS))result.push(p);}
    if(result.length>2&&dist(result[0],result[result.length-1])<EPS)result.pop();
    return result;
  }
  function hash(text) {
    let n=2166136261;
    for (const c of String(text)) n=Math.imul(n ^ c.charCodeAt(0),16777619);
    return (n>>>0)/4294967296;
  }
  function settings(opts){return {...DEFAULTS,...opts,lotPitch:clamp(finite(opts?.lotPitch)?opts.lotPitch:DEFAULTS.lotPitch,13,75)};}
  function create(seed='岸城', options={}) {
    const opts=settings(options);
    return {seed:String(seed),zones:[],lots:[],services:[],budgets:{},options:Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,opts[k]])),nextId:1,month:0};
  }
  const optionsFor=(state,opt)=>settings({...state.options,...opt});
  const allow=(p,opt)=>{const f=opt.isBuildable||opt.canBuildAt;return typeof f!=='function'||(f.length>1?f(p.x,p.y):f(p))!==false;};
  const density=n=>clamp(Math.round(finite(n)?n:1),1,3);
  const next=(s,type)=>type+(s.nextId++);
  const bad=reason=>({ok:false,reason});
  const cross=(a,b)=>a.x*b.y-a.y*b.x, sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
  function lineIntersection(a,b,c,d) {
    const r=sub(b,a),s=sub(d,c),v=sub(c,a),denom=cross(r,s);
    if(Math.abs(denom)<EPS)return null;
    const t=cross(v,s)/denom,u=cross(v,r)/denom;
    return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?{t:clamp(t),u:clamp(u)}:null;
  }
  function nearest(p,a,b) {
    const len=SQ(b.x-a.x)+SQ(b.y-a.y);
    const t=len>EPS?clamp(((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/len):0;
    const q=mix(a,b,t);
    return {...q,t,distance:dist(p,q)};
  }
  function inPolygon(p,poly) {
    let hit=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[j],b=poly[i];
      if(nearest(p,a,b).distance<EPS)return true;
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
    }
    return hit;
  }
  function validPolygon(poly) {
    if(poly.length<3)return false;
    let area=0;
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length];area+=cross(a,b);
      for(let j=i+2;j<poly.length;j++){
        if(i===0&&j===poly.length-1)continue;
        const c=poly[j],d=poly[(j+1)%poly.length];
        if(lineIntersection(a,b,c,d)||nearest(a,c,d).distance<EPS||nearest(c,a,b).distance<EPS)return false;
      }
    }
    return Math.abs(area)>20;
  }
  const roadCache=new WeakMap();
  function network(input){
    if(input?.edges&&input?.nodes&&input.__civicGraph)return input;
    const roads=Array.isArray(input)?input:Array.isArray(input?.roads)?input.roads:[];
    const signature=roads.map((r,i)=>[r?.id??i,r?.kind??r?.type??'',r?.level??'',r?.oneway??'',...(r?.points||[r?.from,r?.to]).flatMap(v=>{const p=point(v);return p?[p.x,p.y,p.z]:[];})].join('/')).join('|');
    const last=roadCache.get(roads);
    if(last&&last.signature===signature)return last.graph;
    const raw=[];
    roads.forEach((r,i)=>{
      const pts=cleanPoints(r?.points||[r?.from,r?.to]);
      const kind=String(r?.kind??r?.type??'street').toLowerCase();
      for(let n=1;n<pts.length;n++){
        const a=pts[n-1],b=pts[n];
        raw.push({a,b,kind,roadId:r?.id??i,level:r?.level,
          oneway:r?.oneway===-1||r?.oneway==='reverse'?-1:r?.oneway===true||r?.oneway===1||r?.oneway==='forward'?1:0,
          split:[0,1]});
      }
    });
    const hasHighway=kind=>/motorway|highway|express|快速|高速/.test(kind);
    const hasTunnel=kind=>/tunnel|underground|隧道|地下/.test(kind);
    const touch=(x,y,p,q)=>Math.abs(p.z-q.z)<=5&&(x.level===undefined||y.level===undefined||x.level===y.level);
    for(let i=0;i<raw.length;i++){
      const x=raw[i];
      for(let j=i+1;j<raw.length;j++){
        const y=raw[j];
        if(Math.max(x.a.x,x.b.x)+EPS<Math.min(y.a.x,y.b.x)||Math.max(y.a.x,y.b.x)+EPS<Math.min(x.a.x,x.b.x)||
          Math.max(x.a.y,x.b.y)+EPS<Math.min(y.a.y,y.b.y)||Math.max(y.a.y,y.b.y)+EPS<Math.min(x.a.y,x.b.y))continue;
        const z=lineIntersection(x.a,x.b,y.a,y.b);
        if(z){
          if(touch(x,y,mix(x.a,x.b,z.t),mix(y.a,y.b,z.u))){x.split.push(z.t);y.split.push(z.u);}
        }else {
          for(const p of [x.a,x.b]){const q=nearest(p,y.a,y.b);if(q.distance<EPS&&touch(x,y,p,q))y.split.push(q.t);}
          for(const p of [y.a,y.b]){const q=nearest(p,x.a,x.b);if(q.distance<EPS&&touch(x,y,p,q))x.split.push(q.t);}
        }
      }
    }
    const nodes=[],edges=[],lookup=new Map();
    function node(p,edge) {
      const key=Math.round(p.x*1e4)+','+Math.round(p.y*1e4);
      const candidates=lookup.get(key)||[];
      for(const i of candidates)if(touch(edge,nodes[i],p,nodes[i]))return i;
      const i=nodes.length;
      nodes.push({...p,level:edge.level,edges:[],inbound:[]});candidates.push(i);lookup.set(key,candidates);
      return i;
    }
    for(const rawSeg of raw){
      const ts=rawSeg.split.sort((x,y)=>x-y);
      for(let j=1;j<ts.length;j++){
        if(ts[j]-ts[j-1]<EPS)continue;
        const a=mix(rawSeg.a,rawSeg.b,ts[j-1]),b=mix(rawSeg.a,rawSeg.b,ts[j]);
        const u=node(a,rawSeg),v=node(b,rawSeg), length=dist(a,b);
        if(length<EPS||u===v)continue;
        const edge={a,b,u,v,length,kind:rawSeg.kind,roadId:rawSeg.roadId,oneway:rawSeg.oneway};
        const ei=edges.push(edge)-1;
        if(edge.oneway>=0){nodes[u].edges.push([v,length,ei]);nodes[v].inbound.push([u,length,ei]);}
        if(edge.oneway<=0){nodes[v].edges.push([u,length,ei]);nodes[u].inbound.push([v,length,ei]);}
        edge.attachable=!hasHighway(edge.kind)&&!hasTunnel(edge.kind);
      }
    }
    const graph={__civicGraph:true,nodes,edges,projections:new Map()};
    roadCache.set(roads,{signature,graph});return graph;
  }
  function projectRoad(input,p,opt={}) {
    const graph=network(input),q=point(p);let best=null,bestSq=Infinity;
    if(!q)return best;
    const key=q.x+','+q.y+','+(opt.allowRestricted?1:0)+(opt.allowElevated?1:0);
    if(graph.projections.has(key))return graph.projections.get(key);
    for(let edgeIndex=0;edgeIndex<graph.edges.length;edgeIndex++){
      const edge=graph.edges[edgeIndex];if(!edge.attachable&&!opt.allowRestricted)continue;
      const {a,b,length}=edge,dx=b.x-a.x,dy=b.y-a.y;
      const t=clamp(((q.x-a.x)*dx+(q.y-a.y)*dy)/(length*length));
      const x=a.x+t*dx,y=a.y+t*dy,z=a.z+(b.z-a.z)*t;
      if(!opt.allowElevated&&Math.abs(z)>8)continue;
      const sq=SQ(q.x-x)+SQ(q.y-y);
      if(sq<bestSq-EPS){bestSq=sq;best={x,y,z,t,angle:Math.atan2(dy,dx),roadId:edge.roadId,edgeIndex,length};}
    }
    if(best)best.distance=Math.sqrt(bestSq);
    if(graph.projections.size>=20000)graph.projections.clear();
    graph.projections.set(key,best);return best;
  }
  function paths(graph, start, max) {
    const d=new Float64Array(graph.nodes.length).fill(Infinity),heap=[];
    const push=(i,w)=>{
      if(w>=d[i]||w>max)return;
      d[i]=w;let k=heap.length;heap.push([i,w]);
      while(k>0){const p=(k-1)>>1;if(heap[p][1]<=w)break;heap[k]=heap[p];k=p;}heap[k]=[i,w];
    };
    const e=graph.edges[start.edgeIndex];
    if(e.oneway<=0||start.t<EPS)push(e.u,start.t*e.length);
    if(e.oneway>=0||start.t>1-EPS)push(e.v,(1-start.t)*e.length);
    while(heap.length){
      const [i,value]=heap[0],last=heap.pop();
      if(heap.length){
        let k=0;
        while(k*2+1<heap.length){let left=k*2+1;if(left+1<heap.length&&heap[left+1][1]<heap[left][1])left++;if(last[1]<=heap[left][1])break;heap[k]=heap[left];k=left;}
        heap[k]=last;
      }
      if(value!==d[i])continue;
      for(const [j,l] of graph.nodes[i].edges)push(j,value+l);
    }
    return d;
  }
  function networkDistance(graph, source, target, d) {
    const e=graph.edges[target.edgeIndex];
    let travel=Infinity;
    if(e.oneway>=0||target.t<EPS)travel=Math.min(travel,d[e.u]+target.t*e.length);
    if(e.oneway<=0||target.t>1-EPS)travel=Math.min(travel,d[e.v]+(1-target.t)*e.length);
    if(source.edgeIndex===target.edgeIndex&&(e.oneway===0||((target.t-source.t)*e.oneway)>=0))travel=Math.min(travel,Math.abs(target.t-source.t)*e.length);
    return travel+source.distance+target.distance;
  }
  function zoneLots(state,type,d,points,place,net,opt){
    const {lotPitch}=opt, inserted=[];
    for(const p of place){
      if(state.lots.length+inserted.length>=MAX_LOTS||inserted.length>=MAX_NEW_LOTS)break;
      if(!allow(p,opt))continue;
      const entry=projectRoad(net,p);
      if(entry&&entry.distance<opt.roadSetback+3)continue;
      if(opt.requireFrontage&&(!entry||entry.distance>opt.maxAccess))continue;
      if(state.services.some(v=>dist(v,p)<lotPitch*.7)||state.lots.some(v=>dist(v,p)<lotPitch*.78)||inserted.some(v=>dist(v,p)<lotPitch*.78))continue;
      const n=hash([state.seed,type,Math.round(p.x*10),Math.round(p.y*10)].join('/'));
      const angle=entry?.angle??p.angle??0;
      const width=lotPitch*(.46+n*.12),depth=lotPitch*(.42+(1-n)*.11),u=Math.cos(angle),v=Math.sin(angle);
      const footprint=[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]]
        .map(([x,y])=>({x:p.x+x*u-y*v,y:p.y+x*v+y*u}));
      if(footprint.some(c=>!allow(c,opt)||(!opt.frontageZone&&!inPolygon(c,points)))||opt.checkParcel?.(footprint)===false)continue;
      inserted.push({id:null,zoneId:null,type,density:d,x:p.x,y:p.y,angle,width,depth,level:0,occupants:0,vacantMonths:0,...(opt.requireFrontage&&p.frontageAnchor?{frontageAnchor:p.frontageAnchor}:{})});
    }
    if(!inserted.length)return bad('没有可用地块；请拉大分区、远离路面或换一块空地。');
    const id=next(state,'z');const zone={id,type,density:d,polygon:points,...(opt.frontageZone?{frontage:true}:{})};
    state.zones.push(zone);
    for(const lot of inserted){lot.id=next(state,'l');lot.zoneId=id;state.lots.push(lot);}
    return {ok:true,id,zone,lots:inserted,cost:inserted.length*ZONES[type].cost};
  }
  function addZone(state, data, roads, extra={}) {
    if(!Object.hasOwn(ZONES,data?.type))return bad('未知分区类型。');
    const opt=optionsFor(state,{...data,...extra}),poly=cleanPoints(data.polygon),graph=network(roads);
    if(!validPolygon(poly))return bad('请画出面积足够、不自相交的分区。');
    const minX=Math.min(...poly.map(x=>x.x)),maxX=Math.max(...poly.map(x=>x.x)),minY=Math.min(...poly.map(x=>x.y)),maxY=Math.max(...poly.map(x=>x.y));
    const nx=Math.max(1,Math.floor((maxX-minX)/opt.lotPitch)),ny=Math.max(1,Math.floor((maxY-minY)/opt.lotPitch)), total=nx*ny;
    if(!Number.isSafeInteger(total)||total>9000)return bad('该分区太大；请拆成多个街区。');
    const place=[];
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const dx=(hash([state.seed,x,y,minX,minY,'x'].join('/'))-.5)*opt.lotPitch*.15;
      const dy=(hash([state.seed,x,y,minX,minY,'y'].join('/'))-.5)*opt.lotPitch*.15;
      const p={x:minX+(x+.5)*(maxX-minX)/nx+dx,y:minY+(y+.5)*(maxY-minY)/ny+dy};
      if(inPolygon(p,poly))place.push(p);
    }
    return zoneLots(state,data.type,density(data.density),poly,place,graph,opt);
  }
  function zoneFrontage(state,data,roads,extra={}){
    if(!Object.hasOwn(ZONES,data?.type))return bad('未知分区类型。');
    const opt=optionsFor(state,{...data,...extra}),points=cleanPoints(data.points),graph=network(roads);
    if(points.length<2)return bad('请选择至少一段道路。');
    const place=[],pitch=opt.lotPitch,extent=finite(data.depth)?clamp(data.depth,pitch*.75,pitch*3):Math.max(opt.frontage,pitch*.9);
    const sides=data.side==='left'?[1]:data.side==='right'?[-1]:[1,-1];
    const vector=(a,b,sign)=>{const d=dist(a,b);return {x:sign*(b.y-a.y)/d,y:-sign*(b.x-a.x)/d};};
    const add=(p,v,d)=>({x:p.x+v.x*d,y:p.y+v.y*d});
    const totalLength=points.slice(1).reduce((sum,b,i)=>sum+dist(points[i],b),0);
    if(!finite(totalLength)||totalLength>pitch*2400)return bad('这段沿街分区太长，请分段规划。');
    let cursor=pitch*.45;
    for(let j=1;j<points.length;j++){
      const a=points[j-1],b=points[j],length=dist(a,b);
      for(;cursor<length;cursor+=pitch)for(const sign of sides){
        const center=mix(a,b,cursor/length),v=vector(a,b,sign);
        for(let offset=Math.max(opt.roadSetback+pitch*.33,pitch*.63);offset<extent;offset+=pitch)
          if(place.length<MAX_NEW_LOTS*4)place.push({...add(center,v,offset),frontageAnchor:{x:center.x,y:center.y,z:center.z||0}});
      }
      cursor-=length;
    }
    // Store the reference centerline. Multiple candidate rows follow actual segment
    // normals, rather than a fragile self-crossing polygon around sharp turns.
    return zoneLots(state,data.type,density(data.density),points,place,graph,{...opt,frontageZone:true});
  }
  function addService(state,data,roads,extra={}) {
    if(!Object.hasOwn(SERVICES,data?.type))return bad('未知设施类型。');
    const p=point(data),opt=optionsFor(state,{...data,...extra});
    if(!p||!allow(p,opt))return bad('这里不能建设。');
    const found=projectRoad(roads,p);
    if(!found||found.distance>opt.serviceAccess)return bad('设施需要临街，且不能接入高速公路或隧道。');
    if(found.distance<opt.roadSetback)return bad('设施不能与道路重叠。');
    if(state.services.some(q=>dist(p,q)<opt.lotPitch*.75)||state.lots.some(q=>dist(p,q)<opt.lotPitch*.54))return bad('这个位置已被占用。');
    if(state.services.length>=120)return bad('设施达到上限。');
    const id=next(state,'s'),service={id,type:data.type,x:p.x,y:p.y};
    state.services.push(service);
    return {ok:true,id,service,cost:SERVICES[data.type].cost};
  }
  function remove(state,id){
    if(state.zones.some(v=>v.id===id)){state.zones=state.zones.filter(v=>v.id!==id);state.lots=state.lots.filter(v=>v.zoneId!==id);return true;}
    const i=state.services.findIndex(v=>v.id===id);if(i>=0){state.services.splice(i,1);return true;}
    return false;
  }
  function setBudget(state,type,percent){
    if(!Object.hasOwn(SERVICES,type)||!finite(percent))return false;
    state.budgets[type]=Math.round(clamp(percent,0,150));return true;
  }
  const lotCap=(v,level=v.level)=>Math.round(ZONES[v.type].cap*[0,1,1.66,2.45][Math.max(0,Math.min(3,level))]);
  function acceptsService(type,zone){
    if(type==='library')return zone==='residential'||zone==='office';
    if(type==='plaza')return zone!=='industrial';
    if(type==='logistics')return zone==='industrial'||zone==='commercial';
    return true;
  }
  function allocate(models,lots,type,capacityTotals){
    const loads=new Map(), assigned=new Map();
    for(const scored of lots){
      const lot=scored.lot;
      if(!scored.access||!acceptsService(type,lot.type))continue;
      let best=null;
      for(const f of models){
        if(f.type!==type||f.range<=0)continue;
        const d=networkDistance(f.graph,f.entry,scored.access,f.paths);
        const value=d<=f.range?clamp(1-d/(f.range*1.35),.25,1):0;
        if(value&&(!best||d<best.d))best={f,d,value};
      }
      if(!best)continue;
      const weight=lot.occupants>1?lot.occupants:lotCap(lot,1)*.22;
      loads.set(best.f.id,(loads.get(best.f.id)||0)+weight);
      assigned.set(lot.id,best);
    }
    for(const [id,a] of assigned){
      const load=loads.get(a.f.id)||0, ratio=load>0?Math.min(1,a.f.capacity/load):1;
      a.final=a.value*ratio;
    }
    for(const f of models)if(f.type===type)capacityTotals.used+=loads.get(f.id)||0;
    return assigned;
  }
  function evaluate(state,roads,extra={}){
    const opt=optionsFor(state,extra),graph=network(roads),lotScores={},total={population:0,jobs:0,occupiedJobs:0,income:0,expense:0,net:0,coveredLots:0,developedLots:0};
    const capacities=Object.fromEntries(Object.keys(SERVICES).map(type=>[type,{capacity:0,used:0,coverage:0,active:0,count:0,monthly:0}]));
    const models=[];
    for(const service of state.services){
      const def=SERVICES[service.type];if(!def)continue;
      const pct=(state.budgets[service.type]??100)/100;
      const entry = allow(service,opt)?projectRoad(graph,service):null;
      const stats=capacities[service.type];stats.count++;
      const monthly=def.monthly*pct;stats.monthly+=monthly;total.expense+=monthly;
      if(!pct||!entry||entry.distance>opt.serviceAccess)continue;
      const range=def.range*Math.min(1.1,.72+pct*.28),capacity=def.capacity*pct;
      stats.capacity+=capacity;stats.active++;
      models.push({...service,budget:pct,range,capacity,entry,graph,paths:paths(graph,entry,range)});
    }
    const prepared=state.lots.map(lot=>{
      let road=allow(lot,opt)?projectRoad(graph,lot):null;
      if(road&&road.distance>opt.maxAccess)road=null;
      return {lot,access:road};
    });
    const fields=Object.fromEntries(Object.keys(SERVICES).map(type=>[type,allocate(models,prepared,type,capacities[type])]));
    const count=state.lots.length;
    const industry=state.lots.filter(lot=>lot.type==='industrial'&&lot.occupants>=1);
    const depots=models.filter(x=>x.type==='logistics');
    const qDemand=opt.demand||{};
    let workers=0, jobsPotential=0;
    for(const lot of state.lots){if(lot.type==='residential')workers+=lot.occupants*.57;else jobsPotential+=lotCap(lot);}
    for(const {lot,access} of prepared){
      const m={access:access?.distance??null,roadId:access?.roadId??null,quality:0,target:0,capacity:0,tier:0,reason:''};
      for(const name of Object.keys(SERVICES)){
        const managed=typeof opt.utilityFor==='function'?opt.utilityFor(lot,name):null;
        m[name]=finite(managed)?clamp(managed):(fields[name].get(lot.id)?.final??0);
        capacities[name].coverage+=m[name]>=.35?1:0;
      }
      let pollution=0;
      if(lot.type!=='industrial'){
        for(const neighbor of industry){
          const d=dist(neighbor,lot);if(d<100)pollution+=neighbor.occupants/110*(1-d/100);
        }
      }
      const big=typeof opt.districtFor==='function'?opt.districtFor(lot)||{}:{};pollution+=(big.pollution||0)*.75;
      const rawPollution=pollution;
      pollution*=1-.62*m.waste;
      const truckNoise=lot.type==='residential'?clamp(depots.reduce((sum,d)=>sum+clamp(1-dist(d,lot)/72)*Math.min(1,d.budget),0)):0;
      const publicCulture=(lot.type==='office'?11:8)*m.library+(lot.type==='commercial'?8:5)*m.plaza;
      const denseWaste=lot.density>1&&lot.type!=='industrial'?5*m.waste:0;
      const industrySupport=lot.type==='industrial'?5*m.logistics:0;
      const risk=typeof opt.riskAt==='function'?clamp(Number(opt.riskAt(lot))||0):0;
      const utility=Math.min(m.power,m.water);
      const full=access&&(!opt.requireUtilities||utility>=.25);
      const mobility=access?1-clamp(access.distance/Math.max(1,opt.maxAccess))*.25:0;
      const quality=clamp((42+9*mobility+11*m.park+8*m.school+7*m.clinic+6*m.fire+6*m.police+7*utility+7*(big.park||0)+(lot.type==='office'?7:3)*(big.education||0)+publicCulture+denseWaste+industrySupport-18*clamp(pollution)-13*truckNoise-22*risk)/100);
      const def=ZONES[lot.type], sector=typeof opt.sectorFor==='function'?opt.sectorFor(lot):null;
      const capAt=t=>t?Math.max(1,Math.round(lotCap(lot,t)*((sector?.capacity||def.cap)/def.cap))):0;
      const max=density(lot.density);
      const tier=!full?0:quality*100>=def.levels[2]&&max===3&&state.month>=9?3:quality*100>=def.levels[1]&&max>=2&&state.month>=4?2:1;
      const balance=lot.type==='residential'?clamp(.74+jobsPotential/Math.max(84,workers)*.14,.74,1.02):clamp(.53+workers/Math.max(100,jobsPotential)*.48,.53,1);
      const raw=qDemand[lot.type];
      const baselineMarket=finite(raw)?clamp(raw>1?raw/100:raw,.1,1.15):1;
      const boost=lot.type==='office'?.19*m.library:lot.type==='commercial'?.26*m.plaza+.07*m.logistics:lot.type==='industrial'?.32*m.logistics:0;
      const market=clamp(baselineMarket*(1+boost)*(sector?.market||1)*(lot.type==='office'?1+.22*(big.education||0):1),.1,1.7);
      const taxRate=finite(sector?.taxRate)?clamp(sector.taxRate,0,25):finite(opt.tax)?clamp(opt.tax,0,20):9;
      const present=finite(sector?.taxRate)||finite(opt.tax)?taxRate/9:1;
      const taxEffect=clamp(1-(taxRate-9)*.024,.72,1.16);
      m.quality=quality;m.tier=tier;m.capacity=capAt(tier);
      m.market=market;m.pollution=pollution;m.rawPollution=rawPollution;m.truckNoise=truckNoise;
      m.target=full?m.capacity*clamp((.43+quality*.59)*balance*market*taxEffect*(.75+Math.max(utility,opt.requireUtilities?0:.65)*.25)):0;
      m.reason=!access?'没有临街道路':opt.requireUtilities&&utility<.25?(m.power<.25?'供电不足':'供水不足'):risk>.42?'地块面临较高洪水风险':pollution>.55?'工业污染压低地价':truckNoise>.48?'物流车辆噪声压低住宅吸引力':quality<.61&&lot.density>1?'公共服务不足，暂不能升密':market<.45?'此类用地需求偏弱':'道路与市政服务可用';
      lotScores[lot.id]=m;
      if(full)total.coveredLots++;
      if(lot.level>0)total.developedLots++;
      if(lot.type==='residential')total.population+=lot.occupants;else total.jobs+=capAt(lot.level);
      if(lot.type!=='residential')total.occupiedJobs+=lot.occupants;
      const activity=1+(lot.type==='industrial'?.12*m.logistics:lot.type==='commercial'?.08*m.plaza+.035*m.logistics:0);
      total.income+=lot.occupants*(sector?.baseTax||def.tax)*present*activity;
    }
    total.population=Math.round(total.population);total.jobs=Math.round(total.jobs);total.occupiedJobs=Math.round(total.occupiedJobs);
    total.income=Math.round(total.income);total.expense=Math.round(total.expense);total.net=total.income-total.expense;
    for(const m of Object.values(capacities)){m.coverage=count?m.coverage/count:0;m.used=Math.round(m.used);m.monthly=Math.round(m.monthly);}
    return {lots:lotScores,services:capacities,totals:total,month:state.month,graph,models,options:opt};
  }
  function serviceAt(metrics,type,p){
    const opt=metrics?.options;if(!opt||!point(p)||!allow(point(p),opt))return 0;
    const entry=projectRoad(metrics.graph,p);
    if(!entry||entry.distance>opt.maxAccess)return 0;
    let best=0;
    for(const f of metrics.models)if(f.type===type){
      const d=networkDistance(f.graph,f.entry,entry,f.paths);
      if(d<=f.range){
        const m=metrics.services[type];
        const capacity=m.used?Math.min(1,m.capacity/m.used):1;
        best=Math.max(best,clamp(1-d/(f.range*1.35),.25,1)*capacity);
      }
    }
    return best;
  }
  function tick(state,roads,extra={}){
    state.month++;
    const prev=evaluate(state,roads,extra);
    for(const lot of state.lots){
      const s=prev.lots[lot.id],target=lot.level<1&&extra.canDevelop?.(lot)===false?0:s.target,delta=target-lot.occupants;
      lot.occupants=clamp(lot.occupants+(delta>0?Math.min(delta,Math.max(.42,delta*.34)):Math.max(delta,-Math.max(.58,Math.abs(delta)*.3))),0,lotCap(lot,3));
      if(lot.occupants>.45){
        lot.vacantMonths=0;
        if(!lot.level)lot.level=1;
        if(s.tier>lot.level&&lot.occupants>lotCap(lot,lot.level)*.71)lot.level++;
        if(s.tier>0&&s.tier<lot.level&&lot.occupants<lotCap(lot,lot.level-1)*.63)lot.level--;
      }else{
        lot.vacantMonths++;
        if(lot.vacantMonths>=3)lot.level=0;
      }
    }
    return evaluate(state,roads,extra);
  }
  function drawBuilding(ctx,lot,project=(x,y)=>({x,y}),options={}){
    if(!ctx||!lot||!ZONES[lot.type])return false;
    const canvas=(x,y)=>{const a=project.length>=2?project(x,y):project({x,y});return Array.isArray(a)?{x:a[0],y:a[1]}:a;};
    const u=Math.cos(lot.angle||0),v=Math.sin(lot.angle||0),rx=lot.width/2,ry=lot.depth/2;
    const points=[[-rx,-ry],[rx,-ry],[rx,ry],[-rx,ry]].map(([x,y])=>canvas(lot.x+x*u-y*v,lot.y+x*v+y*u));
    if(points.some(p=>!p||!finite(p.x)||!finite(p.y)))return false;
    const color=ZONES[lot.type].color;
    const fill=(ps,style)=>{ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);for(const p of ps.slice(1))ctx.lineTo(p.x,p.y);ctx.closePath();ctx.fillStyle=style;ctx.fill();};
    const px=clamp(dist(points[0],points[1]),2,140);
    if(!lot.level){
      if(options.showEmpty===false)return false;
      fill(points,color+'55');return true;
    }
    const h=Math.max(1.5,px*(.15+lot.level*.14)), dx=h*.23;
    const roof=points.map(p=>({x:p.x-dx,y:p.y-h}));
    fill(points,'#24383844');
    const candidates=[0,1,2,3].sort((a,b)=>(points[b].y+points[(b+1)%4].y)-(points[a].y+points[(a+1)%4].y));
    for(const i of candidates.slice(0,2).reverse()){
      const j=(i+1)%4;fill([points[i],points[j],roof[j],roof[i]],i%2===0?'#63838a':'#465f6b');
    }
    fill(roof,color);
    if(lot.level>=2&&px>5){
      const cx=roof.reduce((sum,p)=>sum+p.x,0)/4,cy=roof.reduce((sum,p)=>sum+p.y,0)/4;
      fill(roof.map(p=>({x:cx+(p.x-cx)*.45,y:cy+(p.y-cy)*.42})),color+'77');
    }
    return true;
  }
  return {create,addZone,zoneFrontage,addService,remove,setBudget,evaluate,tick,network,projectRoad,serviceAt,inPolygon,drawBuilding,ZONES,SERVICES,DEFAULTS};
});
