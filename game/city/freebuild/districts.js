(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.Districts=api})(globalThis,()=>{
'use strict';
const TYPES=Object.freeze({
 farm:{name:'农业区',color:'#b8ab52',cost:1.65,upkeep:.062,work:.0048,output:.019,price:12,goods:'粮食',effect:'依赖平地与肥力，稳定生产粮食。'},
 mine:{name:'采矿区',color:'#9b82a2',cost:2.45,upkeep:.114,work:.004,output:.021,price:23,goods:'矿石',stock:'finite',pollution:.58,effect:'矿床储量有限。货运可提高收益，周边有扬尘。'},
 fishery:{name:'渔业区',color:'#3e99b4',cost:1.85,upkeep:.065,work:.0033,output:.016,price:17,goods:'水产',stock:'fish',effect:'在水陆交界划区，有港口才能出货；鱼群可慢慢恢复。'},
 forestry:{name:'林业区',color:'#568d57',cost:1.85,upkeep:.052,work:.0031,output:.017,price:16,goods:'木材',stock:'forest',effect:'利用林地生产木材；过度采伐导致储量下降。'},
 ranch:{name:'牧业区',color:'#bbc875',cost:1.75,upkeep:.069,work:.0037,output:.014,price:18,goods:'畜产',effect:'依赖牧草和供水，生产畜产并带来少量环境负担。',pollution:.12},
 oil:{name:'石油区',color:'#99765a',cost:3.95,upkeep:.17,work:.0031,output:.018,price:34,goods:'原油',stock:'finite',pollution:.82,effect:'开发有限油藏，高收益、高污染、高启动成本。'},
 park:{name:'公园区',color:'#73ac86',cost:1.95,upkeep:.12,work:.0012,buff:'park',effect:'提供大范围休闲和地价加成，持续需要养护。'},
 university:{name:'大学区',color:'#a688ce',cost:3.45,upkeep:.215,work:.0028,buff:'education',effect:'吸引学生，提升周边教育与办公发展，但建设和维护不便宜。'},
 airportZone:{name:'机场区',color:'#7194bb',cost:3.4,upkeep:.13,work:.0020,buff:'airport',effect:'须包含已建成的机场；发展后可提高本区机场的运力。'}
});
const RESOURCE_MAPS={
 river:{farm:[[270,330,290,260,1],[850,550,280,240,.78]],mine:[[920,155,178,160,1]],oil:[[1030,575,175,175,.95]],forestry:[[146,134,210,165,.9],[947,706,235,125,1]],ranch:[[360,590,250,190,.94]]},
 coast:{farm:[[250,365,278,255,.86],[995,191,172,168,.78]],mine:[[1028,125,136,125,.72]],oil:[[853,615,204,140,1],[412,586,152,142,.85]],forestry:[[225,150,232,140,.9]],ranch:[[310,475,211,174,.92]]},
 hills:{farm:[[273,566,194,212,.88]],mine:[[270,212,183,200,1],[952,550,215,182,1]],oil:[[1042,160,120,133,.93]],forestry:[[131,284,242,230,1],[1080,650,245,184,.92]],ranch:[[853,257,210,242,.94]]}
};
const create=()=>({version:1,next:1,districts:[],extraction:{}});
const MAX=90,LOW=650,HIGH=96000;
const fail=reason=>({ok:false,reason});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),finite=Number.isFinite,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),copy=p=>({x:+p.x,y:+p.y});
const noWater=()=>false,noRoad=()=>false;
const opt=(o={})=>({width:1200,height:800,water:noWater,roadAccess:noRoad,...o});
const valid=(p,o)=>p&&finite(p.x)&&finite(p.y)&&p.x>=1&&p.y>=1&&p.x<o.width&&p.y<o.height;
const dry=(p,o)=>!o.water(p)&&(!o.isBuildable||o.isBuildable(p));
function inPolygon(p,poly){
 let c=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)c=!c;
 }
 return c;
}
const area=poly=>Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p.x*q.y-q.x*p.y;},0))/2;
function center(poly){let a=0,x=0,y=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],w=p.x*q.y-q.x*p.y;a+=w;x+=(p.x+q.x)*w;y+=(p.y+q.y)*w;}return {x:x/(3*a),y:y/(3*a)};}
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function touching(a,b,p){return Math.abs(cross(a,b,p))<1e-6&&p.x>=Math.min(a.x,b.x)-1e-6&&p.x<=Math.max(a.x,b.x)+1e-6&&p.y>=Math.min(a.y,b.y)-1e-6&&p.y<=Math.max(a.y,b.y)+1e-6;}
function intersect(a,b,c,d,all=false){
 if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return true;
 return all&&(touching(a,b,c)||touching(a,b,d)||touching(c,d,a)||touching(c,d,b));
}
function simple(poly){
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length];if(dist(a,b)<3)return false;
  for(let j=i+1;j<poly.length;j++){
   if(j===i+1||j===poly.length-1&&i===0)continue;
   if(intersect(a,b,poly[j],poly[(j+1)%poly.length],true))return false;
  }
 }
 return true;
}
const strictInside=(p,poly)=>inPolygon(p,poly)&&!poly.some((q,i)=>touching(q,poly[(i+1)%poly.length],p));
function overlaps(poly,other){
 if(poly.some(p=>strictInside(p,other))||other.some(p=>strictInside(p,poly)))return true;
 for(let i=0;i<poly.length;i++)for(let j=0;j<other.length;j++)if(intersect(poly[i],poly[(i+1)%poly.length],other[j],other[(j+1)%other.length]))return true;
 // Coincident polygons or identical borders still overlap, even with no strict interior vertices.
 const a=center(poly),b=center(other);return (strictInside(a,poly)&&strictInside(a,other))||(strictInside(b,poly)&&strictInside(b,other));
}
function bbox(poly){return {left:Math.min(...poly.map(p=>p.x)),right:Math.max(...poly.map(p=>p.x)),top:Math.min(...poly.map(p=>p.y)),bottom:Math.max(...poly.map(p=>p.y))};}
function samples(poly){
 const b=bbox(poly),w=b.right-b.left,h=b.bottom-b.top,step=Math.max(12,Math.sqrt(Math.max(144,w*h)/140));
 let out=[];
 for(let y=b.top+step*.5;y<b.bottom;y+=step)for(let x=b.left+step*.5;x<b.right;x+=step)if(inPolygon({x,y},poly))out.push({x,y});
 if(!out.length){let c=center(poly);if(inPolygon(c,poly))out.push(c);else out.push(poly[0]);}
 return out;
}
function frontage(poly){
 let out=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],n=Math.ceil(dist(a,b)/28);
  for(let j=0;j<n;j++)out.push({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n});
 }
 return out;
}
function resource(type,p,options={}){
 const o=opt(options);if(!valid(p,o)||!Object.hasOwn(TYPES,type))return 0;
 if(type==='fishery'){
  if(o.water(p))return o.mapId==='coast'?.98:o.mapId==='hills'?.55:.78;
  const around=[{x:p.x-26,y:p.y},{x:p.x+26,y:p.y},{x:p.x,y:p.y-26},{x:p.x,y:p.y+26}];
  return around.some(q=>valid(q,o)&&o.water(q))?.48:0;
 }
 if(!dry(p,o))return 0;
 if(['park','university','airportZone'].includes(type))return 1;
 const map=RESOURCE_MAPS[o.mapId]||RESOURCE_MAPS.river;
 const base=type==='farm'?.26:type==='ranch'?.24:type==='forestry'?.13:.021;
 let best=0;
 for(const [x,y,rx,ry,s] of map[type]||[]){const r2=((p.x-x)/rx)**2+((p.y-y)/ry)**2;best=Math.max(best,s*Math.exp(-1.28*r2));}
 const wave=.05*Math.sin(p.x*.039+p.y*.022)+.045*Math.cos(p.x*.021-p.y*.014);
 return clamp(base+best*.83+wave);
}
function deposits(type,poly,o){
 const b=bbox(poly),step=26,points=[];
 for(let y=Math.ceil((b.top-step/2)/step);y*step+step/2<b.bottom;y++)
  for(let x=Math.ceil((b.left-step/2)/step);x*step+step/2<b.right;x++){
   const p={x:x*step+step/2,y:y*step+step/2};
   if(inPolygon(p,poly))points.push({id:type+':'+x+':'+y,capacity:Math.max(0,resource(type,p,o)*step*step*.165)});
  }
 if(!points.length){const p=center(poly);if(finite(p.x)&&finite(p.y))points.push({id:type+':'+Math.floor(p.x/step)+':'+Math.floor(p.y/step),capacity:Math.min(112,Math.max(3,area(poly)*resource(type,p,o)*.165))});}
 return points;
}
function canonicalGeometry(data,o){
 const type=data?.type;
 const poly=(data?.points||data?.polygon);
 if(!Object.hasOwn(TYPES,type)||!Array.isArray(poly)||poly.length<3||poly.length>48||!poly.every(p=>valid(p,o)))return fail('规划区需要 3–48 个地图内的点');
 const pts=poly.map(copy),a=area(pts);if(!simple(pts)||a<LOW||a>HIGH)return fail('区域不可自交，面积需在 650–96,000 m² 之间');
 const cells=samples(pts),shore=frontage(pts),wet=cells.filter(p=>o.water(p)).length/Math.max(1,cells.length);
 if(type==='fishery'){
  if(wet<.15||wet>.88||!shore.some(p=>dry(p,o)))return fail('渔业区须同时覆盖可通航水面与陆岸');
 }else if([...cells,...shore].some(p=>!dry(p,o)))return fail('这个专精区只能划在可建设的陆地上');
 return {ok:true,type,points:pts,area:a,cells,shore,wet};
}
function add(state,data,options={}){
 const o=opt(options),g=canonicalGeometry(data,o);
 if(!g.ok)return g;if(state.districts.length>=MAX)return fail('专精区达到上限');
 if(state.districts.some(d=>overlaps(g.points,d.points)))return fail('专精区不能覆盖已有专精区');
 const id='D'+state.next++,def=TYPES[g.type],natural=g.cells.reduce((s,p)=>s+resource(g.type,p,o),0)/g.cells.length;
 const district={id,type:g.type,points:g.points,area:g.area};
 if(def.stock){
  if(def.stock==='finite'){
   const cells=deposits(g.type,g.points,o),initial=cells.reduce((s,c)=>s+c.capacity,0);
   const remaining=cells.reduce((s,c)=>s+Math.max(0,c.capacity-(state.extraction?.[c.id]||0)),0);
   district.maxStock=clamp(Math.round(initial),1,Math.max(1,Math.floor(g.area*.21)));
   district.stock=initial>0?Math.round(clamp(remaining/initial)*district.maxStock):0;
  }else{
   const quantity=Math.max(10,Math.round(g.area*.10*natural));district.stock=quantity;district.maxStock=quantity;
  }
 }
 state.districts.push(district);
 const cost=Math.round(780+def.cost*g.area);
 return {ok:true,id,cost,district,suitability:natural};
}
function remove(state,id){const i=state.districts.findIndex(d=>d.id===id);if(i<0)return fail('未找到专精区');state.districts.splice(i,1);return {ok:true,id,cost:0}}
function normalize(raw,options={}){
 if(raw==null)return create();
 if(raw.version!==1||!Array.isArray(raw.districts)||raw.districts.length>MAX)throw Error('无效专精区存档');
 const o=opt(options),ids=new Set(),state=create();
 if(raw.extraction!=null){
  if(typeof raw.extraction!=='object'||Array.isArray(raw.extraction)||Object.keys(raw.extraction).length>5000)throw Error('专精区开采记录无效');
  for(const [key,value] of Object.entries(raw.extraction)){
   if(!/^(mine|oil):[0-9]{1,3}:[0-9]{1,3}$/.test(key)||!finite(value)||value<0||value>112)throw Error('专精区开采记录无效');
   state.extraction[key]=value;
  }
 }
 for(const item of raw.districts){
  if(!item||typeof item.id!=='string'||!/^D[1-9]\d{0,8}$/.test(item.id)||ids.has(item.id))throw Error('专精区编号无效');
  const g=canonicalGeometry(item,o);
  if(!g.ok||state.districts.some(d=>overlaps(g.points,d.points)))throw Error('专精区边界无效');
  ids.add(item.id);
  const d={id:item.id,type:item.type,points:g.points,area:g.area};
  if(TYPES[item.type].stock){
   if(![item.stock,item.maxStock].every(finite)||item.maxStock<=0||item.stock<0||item.stock>item.maxStock||item.maxStock>Math.max(12,g.area*.22))throw Error('专精区储量无效');
   d.stock=item.stock;d.maxStock=item.maxStock;
  }
  state.districts.push(d);
 }
 state.next=Math.max(1,...[...ids].map(id=>+id.slice(1)+1),Number.isSafeInteger(raw.next)&&raw.next<1e9?raw.next:1);
 return state;
}
const indexes=new WeakMap();
function geometry(state,o){
 const fingerprint=[state.next,state.districts.length,o.mapId||'river'].join('/');
 const prev=indexes.get(state);if(prev?.fingerprint===fingerprint&&prev.water===o.water&&prev.isBuildable===o.isBuildable)return prev.data;
 const data=new Map();
 for(const d of state.districts){
  const sample=samples(d.points),edges=frontage(d.points),focus=center(d.points);
  const suitable=sample.reduce((sum,p)=>sum+resource(d.type,p,o),0)/Math.max(1,sample.length);
  data.set(d.id,{sample,edges,focus,suitable,box:bbox(d.points),deposits:TYPES[d.type]?.stock==='finite'?deposits(d.type,d.points,o):[]});
 }
 indexes.set(state,{fingerprint,water:o.water,isBuildable:o.isBuildable,data});return data;
}
const isOpen=s=>s&&s.operating!==false&&s.valid!==false;
function supportNear(sites,pos,reach){return Array.isArray(sites)&&sites.some(s=>isOpen(s)&&dist(pos,s)<reach);}
function evaluate(state,civic,options={}){
 const o=opt(options),geo=geometry(state,o),stations=o.transit?.stations||[];
 const ports=o.seaports||stations.filter(s=>['ferryTerminal','cargoPort'].includes(s.type));
 const airports=o.airports||stations.filter(s=>['airport','cargoAirport'].includes(s.type));
 const housing=(civic?.lots||[]).filter(l=>l?.type==='residential'&&finite(l.occupants)&&l.occupants>0.2),
  universityDemand=(civic?.lots||[]).filter(l=>l?.type==='office'&&finite(l.occupants)&&l.occupants>.2);
 const districts=Object.create(null),boost=Object.create(null);
 const total={jobs:0,staff:0,income:0,expense:0,net:0,goods:0,goodsByType:{},education:0,park:0,airportCapacity:0,pollution:0};
 const contexts=[];
 for(const d of state.districts){
  const def=TYPES[d.type],g=geo.get(d.id),usable=[...g.sample,...g.edges].filter(p=>dry(p,o));
  const accessible=usable.filter(p=>o.roadAccess(p,d.type));
  const access=clamp(accessible.length/Math.max(1,usable.length)*4.5);
  const natural=g.suitable,c=d.stock!=null?clamp(d.stock/(d.maxStock*.65)):1,requiresPort=d.type==='fishery';
  const port=requiresPort&&ports.some(s=>isOpen(s)&&g.sample.some(p=>dist(p,s)<190));
  const activeAir=d.type==='airportZone'?airports.filter(s=>isOpen(s)&&inPolygon(s,d.points)):[];
  const reqUtilities=['mine','oil','university','airportZone','ranch'].includes(d.type);
  let utility=1;
  if(reqUtilities&&(o.waterAt||o.powerAt)){
   const hits=accessible.filter((_,i)=>i%4===0);
   if(hits.length)utility=hits.reduce((z,p)=>z+Math.min(o.waterAt?clamp(+o.waterAt(p)||0):1,o.powerAt?clamp(+o.powerAt(p)||0):1),0)/hits.length;
   else utility=0;
  }
  const possible=access>.035&&natural>=.12&&(!requiresPort||port)&&(d.type!=='airportZone'||activeAir.length>0),factor=possible?Math.sqrt(access)*(.62+utility*.38):0;
  const jobs=Math.round(d.area*def.work*((.40+.60*natural)*factor));
  contexts.push({def,d,g,access,natural,c,requiresPort,port,activeAir,utility,possible,factor,jobs,locals:0});
 }
 // A household contributes a single fractional worker pool, apportioned between reachable districts.
 for(const h of housing){
  const candidate=[];let totalWeight=0;
  for(const row of contexts){if(!row.jobs)continue;const d=dist(h,row.g.focus);if(d<430){const w=(1-d/440)*Math.sqrt(row.jobs);candidate.push([row,w]);totalWeight+=w;}}
  for(const [row,w] of candidate)row.locals+=h.occupants*.42*w/Math.max(1,totalWeight);
 }
 for(const {def,d,g,access,natural,c,requiresPort,port,activeAir,utility,possible,factor,jobs,locals} of contexts){
  let offices=0;
  if(d.type==='university')for(const u of universityDemand){let a=dist(u,g.focus);if(a<460)offices+=u.occupants*(1-a/500);}
  const staffing=jobs?clamp(locals/Math.max(14,jobs)):0;
  const active=possible?(.25+staffing*.75)*factor*natural:0;
  const potential=def.output?d.area*def.output*active*(.35+.65*c):0;
  const production=Math.max(0,Math.round(def.stock==='finite'?Math.min(d.stock,potential):def.stock?Math.min(d.stock,potential):potential));
  const hasCargo=supportNear(o.cargoYards||stations.filter(s=>s.type==='cargoYard'),g.focus,255)||supportNear(ports,g.focus,270);
  const market=hasCargo?1.18:1;
  let income=Math.round(production*(def.price||0)*market);
  if(d.type==='park')income=Math.round(Math.min(visitors(g.focus,housing,300),140)*2.2*active);
  if(d.type==='university')income=Math.round(Math.min(locals*.35+offices*.17,170)*3.8*active);
  const expense=Math.round(160+d.area*def.upkeep*(possible?1:.32));
  const gsize=clamp(Math.sqrt(d.area/18000),.25,1.5),output=active*gsize;
  const pollution=def.pollution?clamp(def.pollution*output):0;
  const x={id:d.id,type:d.type,focus:g.focus,box:g.box,points:d.points,suitability:natural,access,utility,jobs,staff:Math.round(jobs*staffing),
    production,income,expense,net:income-expense,pollution,park:def.buff==='park'?clamp(output):0,
    education:def.buff==='education'?clamp(output):0,airportCapacity:def.buff==='airport'?clamp(output*.42,0,.35):0,
    stock:d.stock,maxStock:d.maxStock,active:possible,reason:access<=.035?'缺少道路接入':requiresPort&&!port?'需要开放的邻近港口或渡轮站':d.type==='airportZone'&&!activeAir.length?'区域内没有运营机场':natural<.12?'没有足够的自然资源':d.stock===0&&def.stock==='finite'?'储量已枯竭':utility<.3?'缺水或缺电，产出受限':staffing<.25?'缺少本地劳动力':'运营中'};
  districts[d.id]=x;
  if(activeAir.length)for(const a of activeAir)boost[a.id]=Math.max(boost[a.id]||0,x.airportCapacity);
  for(const key of ['jobs','staff','income','expense','net','education','park','pollution'])total[key]+=x[key];
  total.goods+=production;
  if(def.goods)total.goodsByType[def.goods]=(total.goodsByType[def.goods]||0)+production;
  total.airportCapacity=Math.max(total.airportCapacity,x.airportCapacity);
 }
 return {districts,total,totals:total,airportBoost:boost};
}
function visitors(p,housing,r){let out=0;for(const l of housing){const d=dist(p,l);if(d<r)out+=l.occupants*(1-d/r);}return out;}
function tick(state,civic,options={}){
 const m=evaluate(state,civic,options),geo=geometry(state,opt(options));
 for(const d of state.districts){const def=TYPES[d.type],s=m.districts[d.id];if(!def.stock)continue;
  const recovery=def.stock==='fish'?d.maxStock*.08:def.stock==='forest'?d.maxStock*.042:0;
  if(def.stock==='finite'&&s.production>0){
   const cells=geo.get(d.id).deposits,ledger=state.extraction??(state.extraction={});
   const remaining=cells.map(c=>Math.max(0,c.capacity-(ledger[c.id]||0)));
   const spare=remaining.reduce((a,b)=>a+b,0),before=d.stock;
   if(spare>0&&before>0)for(let i=0;i<cells.length;i++){
    const c=cells[i],cut=remaining[i]*clamp(s.production/before);
    if(cut>0)ledger[c.id]=Math.min(c.capacity,(ledger[c.id]||0)+cut);
   }
  }
  d.stock=clamp(d.stock-s.production+recovery,0,d.maxStock);
 }
 return m;
}
function sample(metrics,type,p){
 if(!metrics||!p||![p.x,p.y].every(finite))return 0;
 let max=0;
 for(const d of Object.values(metrics.districts||{})){
  const inside=p.x>=d.box.left&&p.x<=d.box.right&&p.y>=d.box.top&&p.y<=d.box.bottom&&inPolygon(p,d.points);
  if(type==='pollution'||type==='education'||type==='park'||type==='airport'){
   const influence=d[type==='airport'?'airportCapacity':type]||0,range=type==='education'?370:type==='park'?260:type==='pollution'?210:170;
   const distance=inside?0:dist(d.focus,p);if(distance<range)max=Math.max(max,influence*(1-distance/range));
  }else if(type===d.type&&inside)max=Math.max(max,d.suitability*d.access);
 }
 return clamp(max);
}
function freightLots(metrics){
 return Object.values(metrics?.districts||{}).filter(d=>d.production>0).map(d=>({id:d.id,type:'industrial',level:1,x:d.focus.x,y:d.focus.y,occupants:d.production*1.5}));
}
return {TYPES,create,add,remove,normalize,evaluate,tick,sample,resource,inPolygon,freightLots};
});
