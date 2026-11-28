/* Separate walking/cycling infrastructure. Never adds a motor-graph edge. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./network.js'):root.Network);
 if(typeof module==='object')module.exports=api;else root.ActiveTravel=api;
})(globalThis,function(N){
'use strict';
const TYPES={
 sidewalk:{name:'专用人行道',modes:['walk'],width:3.6,color:'#b6e9ff',min:8,perM:17,maintenance:.22},
 bike:{name:'独立自行车道',modes:['bike'],width:4.4,color:'#79dfa0',min:12,perM:24,maintenance:.32},
 bridge:{name:'人行天桥／步行桥',modes:['walk'],width:4.2,color:'#f3cc84',min:90,perM:75,maintenance:.78}
};
const EPS=1e-6,Z_JOIN=.60,MAX_LINKS=460,MAX_POINTS=16000;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.z==null||Number.isFinite(p.z))?{x:+p.x,y:+p.y,z:+p.z||0}:null;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const same=(a,b)=>dist(a,b)<1e-5&&Math.abs(a.z-b.z)<1e-5;
const dist3=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const length=pts=>pts.slice(1).reduce((n,p,i)=>n+dist3(pts[i],p),0);
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const levels=type=>TYPES[type]?.modes||[];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const create=()=>({links:[],next:1});
function normalize(raw){
 const out=create(),seen=new Set();let count=0;
 if(!Array.isArray(raw?.links))return out;
 for(const x of raw.links.slice(0,MAX_LINKS)){
  if(!x||!/^A[0-9]{1,9}$/.test(String(x.id))||seen.has(x.id)||!Object.hasOwn(TYPES,x.type)||!Array.isArray(x.points)||x.points.length<2||x.points.length>320)continue;
  const points=x.points.map(point),stairs=x.type==='bridge'&&x.approach==='stairs';
  if(points.some(p=>!p||p.x<0||p.x>4096||p.y<0||p.y>4096||p.z<-.2||p.z>36))continue;
  if(points.some((p,i)=>i&&(dist(p,points[i-1])<.05||Math.abs(p.z-points[i-1].z)>dist(p,points[i-1])*(x.type==='bridge'?(stairs?.655:.145):.025)+.05)))continue;
  if(x.type==='bridge'&&(Math.abs(points[0].z)>.3||Math.abs(points.at(-1).z)>.3||Math.max(...points.map(p=>p.z))<5.9))continue;
  if(x.type!=='bridge'&&points.some(p=>Math.abs(p.z)>.35))continue;
  const d=length(points);if(d<(stairs?27:TYPES[x.type].min)-.2||d>3600)continue;
  if(count+points.length>MAX_POINTS)continue;count+=points.length;
  seen.add(x.id);out.links.push({id:x.id,type:x.type,points,length:d,...(stairs?{approach:'stairs'}:{})});
  out.next=Math.max(out.next,+x.id.slice(1)+1);
 }
 if(Number.isSafeInteger(raw.next)&&raw.next>0&&raw.next<1e9)out.next=Math.max(out.next,raw.next);
 return out;
}
function roadModes(e,points){
 if(e.kind!=='road'||points.some(p=>p.z< -2))return [];
 const walk=true,bike=(e.speed||36)<=48&&(e.lanes||2)<=4&&points.every(p=>p.z>=-1);
 return walk?(bike?['walk','bike']:['walk']):[];
}
function nearest(a,b,p){
 const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l>EPS?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/l,0,1):0;
 return {p:mix(a,b,t),t};
}
function has(c,mode){return !mode||c.includes(mode);}
function snap(state,network,input,{mode=null,radius=12,ground=false}={}){
 const p=point(input);if(!p)return null;
 let answer=null,best=Math.min(80,Math.max(.1,+radius||0));
 const search=(pts,k)=>{
  if(!has(k,mode))return;
  for(let i=1;i<pts.length;i++){
   const q=nearest(pts[i-1],pts[i],p);
   if(Math.abs(q.p.z-p.z)>Z_JOIN||ground&&Math.abs(q.p.z)>.024)continue;
   const d=dist(q.p,p);
   if(d<=best){answer=q.p;best=d;}
  }
 };
 for(const x of state?.links||[])search(x.points,levels(x.type));
 for(const e of network?.edges||[]){
  const pts=(e.pts||e.points||[]).map(point).filter(Boolean);
  if(pts.length>1)search(pts,roadModes(e,pts));
 }
 return answer;
}
function xAt(a,b,c,d){
 const vx=b.x-a.x,vy=b.y-a.y,wx=d.x-c.x,wy=d.y-c.y,det=vx*wy-vy*wx;
 if(Math.abs(det)<EPS)return null;
 const x=c.x-a.x,y=c.y-a.y,t=(x*wy-y*wx)/det,u=(x*vy-y*vx)/det;
 return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?[clamp(t,0,1),clamp(u,0,1)]:null;
}
function parallelSpans(a,b,c,d){
 // Collinear overlaps also need endpoint joins and clash validation.
 const vx=b.x-a.x,vy=b.y-a.y,wx=d.x-c.x,wy=d.y-c.y;
 const l1=Math.hypot(vx,vy),l2=Math.hypot(wx,wy);
 if(l1<EPS||l2<EPS||Math.abs(vx*wy-vy*wx)/(l1*l2)>.0005)return [];
 if(Math.abs(vx*(c.y-a.y)-vy*(c.x-a.x))/l1>.08)return [];
 const t=p=>((p.x-a.x)*vx+(p.y-a.y)*vy)/(l1*l1);
 const lo=Math.max(0,Math.min(t(c),t(d))),hi=Math.min(1,Math.max(t(c),t(d)));
 if(hi<lo-EPS)return [];
 return (hi-lo>EPS?[lo,hi]:[clamp(lo,0,1)]).map(t=>[t,nearest(c,d,mix(a,b,t)).t]);
}
function bound(a,b,c,d,pad=0){
 return Math.max(a.x,b.x)+pad>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)+pad>=Math.min(a.x,b.x)&&
 Math.max(a.y,b.y)+pad>=Math.min(c.y,d.y)&&Math.max(c.y,d.y)+pad>=Math.min(a.y,b.y);
}
function plan(state,network,data={},opt={}){
 const type=data.type,spec=TYPES[type];
 const fail=reason=>({ok:false,reason});
 if(!Object.hasOwn(TYPES,type))return fail('请选择有效的步行或自行车设施');
 if((state?.links?.length||0)>=MAX_LINKS)return fail('设施已达当前地图上限');
 if(!Array.isArray(data.points)||data.points.length<2||data.points.length>50)return fail('请提供起终点，可增加中间控制点');
 let line=data.points.map(point);
 if(line.some(p=>!p))return fail('路线含有无效坐标');
 const stairs=type==='bridge'&&data.approach==='stairs',grade=stairs?.65:.14;
 const height=Number.isFinite(+data.height)?clamp(+data.height,6,32):9;
 const mode=spec.modes[0];
 if(type==='bridge'){
  // Always require both approaches to reach an existing eligible ground path.
  for(const k of [0,line.length-1]){
   const p={...line[k],z:0},anchor=snap(state,network,p,{mode:'walk',radius:12,ground:true});
   if(!anchor)return fail('天桥两端需接到既有人行道或普通地面道路');
   line[k]={...anchor,z:0};
  }
 }else if(data.snap!==false){
  for(const k of [0,line.length-1]){
   const hit=snap(state,network,{...line[k],z:0},{mode,radius:Math.min(14,Math.max(2,+data.snapRadius||9)),ground:true});
   if(hit)line[k]=hit;
  }
 }
 const spans=line.slice(1).map((p,i)=>dist(line[i],p));
 if(spans.some(d=>d<.2))return fail('相邻选点太近');
 const metres=spans.reduce((s,n)=>s+n,0);
 const minimum=stairs?27:spec.min;
 if(metres<minimum||metres>3200)return fail('该设施长度须在 '+minimum+' 至 3200 米之间');
 if(type==='bridge'&&metres<2*height/grade+8)return fail('两端坡道和桥面长度不足，延长路线或降低桥面');
 for(let i=1;i<line.length;i++)for(let j=i+2;j<line.length;j++){
  const hit=xAt(line[i-1],line[i],line[j-1],line[j]);
  if(hit||parallelSpans(line[i-1],line[i],line[j-1],line[j]).length)return fail('路线不能与自己交叉或重叠');
 }
 const width=Number.isFinite(+opt.width)?+opt.width:1200,heightMap=Number.isFinite(+opt.height)?+opt.height:800;
 const water=typeof opt.water==='function'?opt.water:N.water;
 const land=typeof opt.land==='function'?opt.land:p=>!water(p);
 const ridge=typeof opt.ridge==='function'?opt.ridge:p=>globalThis.CityMaps?.current()?.ridge?.(p)||0;
 const sampleStep=Math.max(3.8,metres/235);
 let traversed=0,points=[];
 for(let i=0;i<spans.length;i++){
  const d=spans[i],div=Math.ceil(d/sampleStep),cuts=new Set(Array.from({length:div+1},(_,j)=>j/div));
  if(type==='bridge'){
   for(const k of [height/grade,metres-height/grade])if(k>traversed&&k<traversed+d)cuts.add((k-traversed)/d);
  }
  for(const t of [...cuts].sort((a,b)=>a-b)){
   if(t===0&&i)continue;
   const p=mix(line[i],line[i+1],t),s=traversed+d*t;
   p.z=type==='bridge'?Math.max(0,Math.min(height,s*grade,(metres-s)*grade)):0;
   if(points.length&&dist(p,points.at(-1))<.06){if(t===1)points[points.length-1]=p;continue;}
   if(p.x<1||p.x>width-1||p.y<1||p.y>heightMap-1)return fail('路线超出地图');
   if(ridge(p)>.67)return fail('避开保护山脊');
   if(stairs&&water(p))return fail('跨水用坡道步行桥；短楼梯式只用于城市街道');
   if(type==='bridge'&&water(p)&&p.z<8.95)return fail('跨水桥面净高须至少 9 米，两端坡道必须在岸上');
   if(type!=='bridge'&&!land(p))return fail('地面设施不能穿水；步行跨水请建天桥');
   points.push(p);
  }
  traversed+=d;
 }
 if(type==='bridge'&&(!land(points[0])||!land(points.at(-1))))return fail('天桥上下坡端点需在陆地');
 if(points.length<2||points.length>320)return fail('路线折点太多，请分两段建设');
 if((state?.links||[]).reduce((n,l)=>n+l.points.length,points.length)>MAX_POINTS)return fail('当前地图的道路点总量达到上限');
 const crossings=[], crossingKeys=new Set();
 const bounds=pts=>{
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const p of pts){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
  return [{x:x0,y:y0},{x:x1,y:y1}];
 };
 const routeBox=bounds(points);
 const motor=(network?.edges||[]).map(e=>({kind:e.kind||'road',id:e.id,points:(e.pts||e.points||[]).map(point).filter(Boolean)}));
 const others=(state?.links||[]).map(e=>({...e,kind:'active'}));
 for(const entry of [...motor,...others]){
  const pts=entry.points;if(pts.length<2||!bound(...routeBox,...bounds(pts)))continue;
  for(let i=1;i<points.length;i++)for(let j=1;j<pts.length;j++){
   const a=points[i-1],b=points[i],c=pts[j-1],d=pts[j];
   if(!bound(a,b,c,d))continue;
   const cut=xAt(a,b,c,d),par=cut?[]:parallelSpans(a,b,c,d);
   if(par.length===2&&entry.kind==='active'&&levels(entry.type).includes(mode)){
    const [x,y]=par;
    if(dist(mix(a,b,x[0]),mix(a,b,y[0]))>.2&&par.every(([t,u])=>Math.abs(mix(a,b,t).z-mix(c,d,u).z)<Z_JOIN))
     return fail('同模式的设施不能同层重叠');
   }
   for(const [t,u] of (cut?[cut]:par)){
    const p=mix(a,b,t),q=mix(c,d,u),gap=p.z-q.z;
    const atBoundary=(i===1&&t<EPS)||(i===points.length-1&&t>1-EPS);
    if(Math.abs(gap)<=Z_JOIN){
     if(entry.kind==='highway'||entry.kind==='ramp')return fail('高速及匝道不能平面接入，改用有足够净高的天桥');
     if(type==='bridge'&&!atBoundary&&!(entry.kind==='active'&&entry.type==='bridge'))
      return fail('天桥坡道不得与道路或地面路径平交，请调整桥端或提高桥面');
    }else if(Math.abs(gap)<5.98)return fail('跨越道路或路径时净高至少 6 米，坡道不得压住交叉点');
    else {
     const id=entry.id+'|'+p.x.toFixed(2)+'|'+p.y.toFixed(2);
     if(!crossingKeys.has(id)){crossingKeys.add(id);crossings.push({point:p,clearance:Math.abs(gap),against:entry.id});}
    }
   }
  }
 }
 if(type==='bridge'&&!crossings.length&&!points.some(water))return fail('请让天桥实际跨越一条道路或水面；普通路线用人行道');
 const trueLength=length(points),id='A'+(state?.next||1),cost=Math.max(160,Math.round(trueLength*spec.perM+(type==='bridge'?3200:0)));
 if(Number.isFinite(opt.cash)&&cost>opt.cash)return {ok:false,reason:'市库不足',cost};
 return {ok:true,link:{id,type,points,length:trueLength,...(stairs?{approach:'stairs'}:{})},cost,crossings};
}
function add(state,network,data,opts){
 const r=plan(state,network,data,opts);
 if(!r.ok)return r;
 if(!Array.isArray(state.links))state.links=[];
 state.links.push(r.link);
 state.next=(state.next||1)+1;
 return r;
}
function remove(state,id){
 const i=(state?.links||[]).findIndex(x=>x.id===id);
 if(i<0)return false;state.links.splice(i,1);return true;
}

function build(state,network,{shareBike=true,shareWalk=true}={}){
 const nodes=new Map(),adj=new Map(),links=[],pieces=[],bins=new Map(),byRoad=new Map(),cell=36;
 const key=p=>[Math.round(p.x*20),Math.round(p.y*20),Math.round(p.z*20)].join(',');
 const put=p=>{const k=key(p);if(!nodes.has(k)){nodes.set(k,p);adj.set(k,[]);}return k;};
 const indexed=(a,b,fn)=>{
  for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)
   for(let y=Math.floor(Math.min(a.y,b.y)/cell);y<=Math.floor(Math.max(a.y,b.y)/cell);y++)fn(x+':'+y);
 };
 const relay=(points,type,id,modes,oneway)=>{
  if(!modes.length)return;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i];
   if(!a||!b||dist(a,b)<.025)continue;
   const s={a,b,type,id,modes,oneway,cuts:[0,1],i:pieces.length};pieces.push(s);
   indexed(a,b,k=>{if(!bins.has(k))bins.set(k,[]);bins.get(k).push(s);});
  }
 };
 for(const e of network?.edges||[]){
  const pts=(e.pts||e.points||[]).map(point);
  if(pts.some(p=>!p)||pts.length<2)continue;
  const modes=roadModes(e,pts).filter(m=>m==='walk'?shareWalk:shareBike);
  relay(pts,'road',e.id,modes,Boolean(e.oneway));
 }
 for(const f of state?.links||[])relay(f.points.map(point),f.type,f.id,levels(f.type),false);
 for(const s of pieces){
  if(s.type==='road')continue;
  const seen=new Set();
  indexed(s.a,s.b,k=>{
   for(const other of bins.get(k)||[]){
    if(s.id===other.id&&s.type===other.type||other.type!=='road'&&other.i<=s.i||seen.has(other.i)||!s.modes.some(m=>other.modes.includes(m)))continue;
    seen.add(other.i);
    if(!bound(s.a,s.b,other.a,other.b))continue;
    const x=xAt(s.a,s.b,other.a,other.b);
    const cuts=x?[x]:parallelSpans(s.a,s.b,other.a,other.b);
    for(const [a,b] of cuts){
     const p=mix(s.a,s.b,a),q=mix(other.a,other.b,b);
     // A grade-separated crossing is deliberately not a junction. Equal-level
     // joins are represented with identical geometric node keys.
     if(Math.abs(p.z-q.z)>.022||dist(p,q)>.025)continue;
     s.cuts.push(a);other.cuts.push(b);
    }
   }
  });
 }
 for(const s of pieces){
  s.cuts.sort((a,b)=>a-b);
  const cuts=s.cuts.filter((p,i)=>i===0||p-s.cuts[i-1]>.00001);
  for(let i=1;i<cuts.length;i++){
   const a=mix(s.a,s.b,cuts[i-1]),b=mix(s.a,s.b,cuts[i]);
   const ka=put(a),kb=put(b);
   if(ka===kb)continue;
   const l={key:links.length,type:s.type,id:s.id,a,b,ka,kb,modes:s.modes,oneway:s.oneway};
   links.push(l);adj.get(ka).push({l,to:kb,reverse:false});adj.get(kb).push({l,to:ka,reverse:true});
  }
 }
 for(const n of network?.nodes||[]){
  const p=point(n);if(!p)continue;
  const k=key(p);if(nodes.has(k))byRoad.set(String(n.id),k);
 }
 const nearbyBins=new Map();
 for(const l of links)indexed(l.a,l.b,k=>{if(!nearbyBins.has(k))nearbyBins.set(k,[]);nearbyBins.get(k).push(l);});
 return {nodes,adj,links,byRoad,bins:nearbyBins,cell};
}
const speed=(mode,type)=>mode==='bike'?(type==='bike'?5.7:4.3):type==='sidewalk'?1.52:type==='bridge'?1.28:1.25;
const allowed=(l,mode,reverse)=>l.modes.includes(mode)&&!(reverse&&mode==='bike'&&l.oneway);
function travel(a,b,mode,type){
 const metres=dist3(a,b),rise=b.z-a.z;
 return {meters:metres,seconds:metres/speed(mode,type)*(1+Math.min(1.35,Math.max(0,rise)/Math.max(.1,metres)*7))};
}
function route(g,from,to,mode='walk',opts={}){
 if(!g||!['walk','bike'].includes(mode))return null;
 const radius=clamp(Number.isFinite(+opts.radius)?+opts.radius:58,2,130),zTolerance=clamp(+opts.zTolerance||.65,.02,3);
 const exact=new Map();
 function isDry(a,b){
  const wet=typeof opts.water==='function'?opts.water:N.water;
  // Elevated start points from test/visual tools may access the elevated path,
  // but ground door-to-path links must not jump across any water.
  if(Math.min(a.z,b.z)>4)return true;
  const n=Math.ceil(dist(a,b)/4);
  for(let i=0;i<=n;i++)if(wet(mix(a,b,n?i/n:0)))return false;
  return true;
 }
 function attach(input){
  if(typeof input==='string'||typeof input==='number'){
   const k=g.byRoad.get(String(input))||(g.nodes.has(String(input))?String(input):null);
   if(!k)return [];
   return [{k,q:g.nodes.get(k),p:g.nodes.get(k),c:0}];
  }
  const p=point(input);if(!p)return [];
  const all=[],seen=new Set();
  const ix=Math.floor(p.x/g.cell),iy=Math.floor(p.y/g.cell),steps=Math.ceil(radius/g.cell);
  for(let x=ix-steps;x<=ix+steps;x++)for(let y=iy-steps;y<=iy+steps;y++)for(const l of g.bins.get(x+':'+y)||[]){
   if(seen.has(l.key)||!l.modes.includes(mode))continue;seen.add(l.key);
   const q=nearest(l.a,l.b,p),d=dist3(q.p,p);if(d>radius||Math.abs(q.p.z-p.z)>zTolerance||!isDry(q.p,p))continue;
   all.push({l,q:q.p,t:q.t,p,c:d});
  }
  all.sort((a,b)=>a.c-b.c||a.l.key-b.l.key);
  // Several equivalent topologically adjacent segments are enough to avoid
  // choosing the wrong direction at the door; exclude distant cut-throughs.
  return all.filter(x=>x.c<=all[0].c+5).slice(0,14);
 }
 const A=attach(from),B=attach(to);
 if(!A.length||!B.length)return null;
 let winner=null;
 const append=(list,p)=>{if(p&&(!list.length||!same(list.at(-1),p)))list.push(p);};
 const found=(a,b,parts)=>{
  let meters=a.c+b.c,seconds=(a.c+b.c)/(mode==='bike'?2.3:1.10),usesDedicated=false;
  const points=[],segments=[];
  append(points,a.p);append(points,a.q);
  for(const {l,start,end} of parts){
   append(points,start);append(points,end);
   const k=travel(start,end,mode,l.type);
   meters+=k.meters;seconds+=k.seconds;
   if(k.meters>.03){
    const last=segments.at(-1);
    if(last?.id===l.id&&last.type===l.type){last.meters+=k.meters;append(last.points,end);}
    else segments.push({id:l.id,type:l.type,meters:k.meters,points:[start,end]});
    if(l.type!=='road')usesDedicated=true;
   }
  }
  append(points,b.q);append(points,b.p);
  if(!winner||seconds<winner.seconds-EPS)winner={points,meters,seconds,usesDedicated,segments};
 };
 const finish=new Map();
 function goal(id,b,part){if(!finish.has(id))finish.set(id,[]);finish.get(id).push({b,part});}
 for(const b of B){
  if(b.k){goal(b.k,b,null);continue;}
  if(b.t>=1-EPS)goal(b.l.kb,b,null);
  if(b.t<=EPS)goal(b.l.ka,b,null);
  if(allowed(b.l,mode,false))goal(b.l.ka,b,{l:b.l,start:b.l.a,end:b.q});
  if(allowed(b.l,mode,true))goal(b.l.kb,b,{l:b.l,start:b.l.b,end:b.q});
 }
 for(const a of A)for(const b of B)if(a.l&&a.l===b.l&&allowed(a.l,mode,a.t>b.t))found(a,b,[{l:a.l,start:a.q,end:b.q}]);
 const heap=[];
 const push=x=>{let i=heap.length;heap.push(x);while(i){const p=(i-1)>>1;if(heap[p].cost<=x.cost)break;heap[i]=heap[p];i=p;}heap[i]=x;};
 const pop=()=>{const x=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;if(last.cost<=heap[c].cost)break;heap[i]=heap[c];i=c;}heap[i]=last;}return x;};
 const insert=x=>{if((exact.get(x.k)?.cost??Infinity)<=x.cost)return;exact.set(x.k,x);push(x);};
 function begin(k,a,part){
  const cost=a.c/(mode==='bike'?2.3:1.10)+(part?travel(part.start,part.end,mode,part.l.type).seconds:0);
  insert({k,a,part,cost});
 }
 for(const a of A){
  if(a.k){begin(a.k,a,null);continue;}
  if(a.t<=EPS)begin(a.l.ka,a,null);
  if(a.t>=1-EPS)begin(a.l.kb,a,null);
  if(allowed(a.l,mode,false))begin(a.l.kb,a,{l:a.l,start:a.q,end:a.l.b});
  if(allowed(a.l,mode,true))begin(a.l.ka,a,{l:a.l,start:a.q,end:a.l.a});
 }
 while(heap.length){
  const cur=pop();if(exact.get(cur.k)!==cur)continue;
  if(winner&&cur.cost>winner.seconds+EPS)break;
  for(const {b,part} of finish.get(cur.k)||[]){
   const parts=part?[part]:[];
   for(let q=cur;q;q=q.prev)if(q.part)parts.push(q.part);
   found(cur.a,b,parts.reverse());
  }
  for(const x of g.adj.get(cur.k)||[]){
   if(!allowed(x.l,mode,x.reverse))continue;
   const part={l:x.l,start:x.reverse?x.l.b:x.l.a,end:x.reverse?x.l.a:x.l.b};
   insert({a:cur.a,k:x.to,prev:cur,part,cost:cur.cost+travel(part.start,part.end,mode,x.l.type).seconds});
  }
 }
 return winner;
}
function maintenance(state){return Math.round((state?.links||[]).reduce((n,l)=>n+l.length*(TYPES[l.type]?.maintenance||0),0));}
return {TYPES,create,normalize,snap,plan,add,remove,build,route,maintenance};
});
