'use strict';
(()=>{
const N=Network,C=Civic,$=s=>document.getElementById(s),canvas=$('map'),view=new CityView(canvas,{width:1200,height:800}),storeKey='city.blueprint.freebuild.1',prefKey='city.blueprint.settings.1',format=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0});
let prefs={};try{prefs=JSON.parse(localStorage.getItem(prefKey))||{}}catch{}
const serviceNames={fire:'消防',police:'警务',water:'供水',power:'电力',health:'医疗',clinic:'医疗',education:'教育',school:'教育',waste:'垃圾处理',park:'绿地'};
const labels={residential:'住宅',commercial:'商业',office:'办公',industrial:'工业'};
const defaults={profile:'r2',oneway:false,bus:false,startZ:0,endZ:0,shape:'line',snap:true,zone:'residential',density:2,depth:38,side:'both',service:'fire'};
const stateStore={make:()=>({version:1,network:N.create(),civic:C.create(17),month:1,contracts:{},history:[]}),restore(raw){
 if(raw?.version!==1||!Array.isArray(raw.network?.edges)||!Array.isArray(raw.network?.nodes)||!Array.isArray(raw.network?.buses)||!Array.isArray(raw.civic?.lots)||!Array.isArray(raw.civic?.zones)||!Array.isArray(raw.civic?.services)||!Number.isInteger(raw.month)||raw.month<1||!Number.isFinite(raw.network.cash)||!Number.isInteger(raw.network.next))throw Error('不兼容的城市存档');
 const {nodes,edges,buses}=raw.network;
 if(nodes.length>1500||edges.length>1800||buses.length>200||raw.civic.lots.length>4000)throw Error('存档规模超出预览版上限');
 const ids=new Set();for(let n of nodes){if(typeof n.id!=='string'||ids.has(n.id)||![n.x,n.y,n.z].every(Number.isFinite))throw Error('无效节点');ids.add(n.id)}
 const eids=new Set();for(let e of edges){if(typeof e.id!=='string'||eids.has(e.id)||!ids.has(e.a)||!ids.has(e.b)||!Array.isArray(e.pts)||e.pts.length<2||e.pts.length>500||!e.pts.every(p=>[p.x,p.y,p.z].every(Number.isFinite))||![2,3,4,6,8].includes(e.lanes)||!['road','highway','ramp'].includes(e.kind)||!Number.isFinite(e.speed)||e.speed<1)throw Error('无效道路');e.len=N.length(e.pts);eids.add(e.id);}
 if(buses.some(b=>!/^B[0-9]+$/.test(b.id)||!Array.isArray(b.stops)||b.stops.length<2||!b.stops.every(s=>ids.has(s)))||raw.civic.lots.some(l=>!Number.isFinite(l.x)||!Number.isFinite(l.y)||!Object.hasOwn(labels,l.type))||raw.civic.services.some(s=>!Number.isFinite(s.x)||!Number.isFinite(s.y)))throw Error('无效设施或地块');
 N.rebuildBuses(raw.network);
 raw.contracts=Object.fromEntries(Object.entries(raw.contracts||{}).filter(([k,v])=>['access','bus','safety'].includes(k)&&Number.isInteger(v)&&v>0&&v<=raw.month));
 raw.history=Array.isArray(raw.history)?raw.history.slice(-18).filter(r=>r&&[r.month,r.pop,r.net,r.bus].every(Number.isFinite)):[];
 return raw;
}};
const onLand=p=>p.x>1&&p.x<1199&&p.y>1&&p.y<799&&!N.water(p);
const roadOpts={isBuildable:onLand};
let coverageGrid=null,sceneWorld=null,edgeTraffic={};
let opts={...defaults},tool='road',draft=[],hover=null,selected={},layer='none',playing=false,forecast=null,metrics={},load={},trips=[],city=null;
let camera={x:600,y:400,zoom:1}, drag=null,panMode=false, lastAuto=0, clock=0, previous=0;
function starter(){
 const s=stateStore.make(),n=s.network, xy=(x,y,z=0)=>({x,y,z}), local=(a,b,o={})=>N.add(n,N.plan(a,b),{profile:'r2',...o});
 local(xy(310,125),xy(310,675),{profile:'r4',bus:true});
 local(xy(880,135),xy(880,655),{profile:'r4',bus:true});
 local(xy(120,275),xy(505,275));
 local(xy(700,275),xy(1060,275));
 local(xy(150,505),xy(470,505));
 local(xy(720,525),xy(1090,525));
 local(xy(310,405),xy(460,405,23),{profile:'r4'});
 local(xy(460,405,23),xy(730,405,23),{profile:'r4'});
 local(xy(730,405,23),xy(880,405),{profile:'r4'});
 local(xy(135,565),xy(305,645));
 local(xy(905,600),xy(1085,692));
 const roads=N.mapRoads(n), p=(x,y)=>({x,y});
 for(let [type,points,depth,density] of [
 ['residential',[p(145,275),p(299,275)],44,2],['commercial',[p(320,275),p(465,275)],38,3],
 ['residential',[p(175,505),p(295,505)],38,2],['office',[p(730,275),p(870,275)],47,3],
 ['industrial',[p(900,525),p(1065,525)],40,2],['residential',[p(891,275),p(1030,275)],42,2],
 ['commercial',[p(880,432),p(880,522)],38,3]
 ])C.zoneFrontage(s.civic,{type,points,depth,density,side:'both',...roadOpts},roads,roadOpts);
 for(let [type,x,y] of [['water',334,306],['power',334,374],['fire',285,352],['police',327,542],['water',858,423],['power',901,351],['police',904,560],['fire',900,378],['park',125,513],['school',858,553],['clinic',856,636],['park',900,610]])C.addService(s.civic,{type,x,y,...roadOpts},roads,roadOpts);
 for(let k=0;k<16;k++)C.tick(s.civic,roads,roadOpts);
 const stops=[N.snap(n,xy(310,275),16,false)?.node,N.snap(n,xy(880,525),16,false)?.node].filter(Boolean);if(stops.length===2)N.bus(n,stops);
 n.cash=420000;return s;
}
function save(){try{localStorage.setItem(storeKey,JSON.stringify(city));return true}catch{return false}}
function notify(msg,bad=false){$('notice').textContent=msg;$('notice').classList.toggle('bad',bad);clearTimeout(notify.timer);if(msg)notify.timer=setTimeout(()=>{$('notice').textContent=''},5300)}
function loadCity(){try{let raw=localStorage.getItem(storeKey);if(raw)return stateStore.restore(JSON.parse(raw))}catch{}return starter()}
city=loadCity();
function changeCity(s){city=s;comparison=null;draft=[];selected={};playing=false;showTools();$('auto').setAttribute('aria-pressed','false');$('auto').textContent='▶';refresh();save()}
const help={road:'直线点起终点；曲线依次点起点、控制点、终点。可分别调起终点高程。红色预览不可建设，选择「不吸附」可自由落点。',upgrade:'先选新断面，再点击现有同类型道路。单行方向按原路绘制方向。',bus:'按发车顺序在普通道路上点至少两个站，可选路口或路段中间。系统沿可行车方向闭环，遇单行须有回程。',frontage:'沿普通道路点击起点和终点；要跟随弯道可加入中间点。可选单侧或两侧、纵深与密度。',polygon:'在地图点至少三个角，完成后按按钮或 Enter。区域不限栅格，地块仍需接近地面道路才能成长。',service:'选择设施，再点地图放置；设施须靠近可服务道路。可在此调服务预算，右侧图层检查实际覆盖。',inspect:'点道路、设施或分区看属性。高架与地面叠在一起时，可用图层辅助识别。',erase:'点击一段道路，确认后才拆除。相交分段有独立路段，断开的公交会暂停。'};
const toolNames={road:'道路',upgrade:'道路改造',bus:'公交线路',frontage:'沿街分区',polygon:'多边形分区',service:'公共服务',inspect:'查阅',erase:'拆除'};
const layers={none:['实景','鸟瞰地形、建筑、人车与道路。'],traffic:['道路交通','通勤分配越高、容量比越大，颜色越暖。并不是逐车排队模型。'],transit:['公共交通','青色标出有效公交线路；断线不发车。'],elevation:['高程／隧道','高架、桥梁与地下通道按高程显色。'],zones:['土地用途','住区、商业、办公与工业分色。'],land:['建设潜力','有道路、基础设施和服务的地块更容易升高密度。'],fire:['消防覆盖','由消防站经路网抵达；互不连通的道路不会跨河覆盖。'],police:['警务覆盖','由警务设施经道路提供。'],water:['供水覆盖','供水设施经道路计算覆盖；本版没有独立管线。'],power:['电力覆盖','电力设施经道路计算覆盖；本版没有独立电网。']};
function civicTypes(){return C.SERVICE_TYPES||C.SERVICES||{}}
function serviceKeys(){let v=civicTypes();return Array.isArray(v)?v.map(x=>typeof x==='string'?x:x.id||x.type):Object.keys(v).length?Object.keys(v):['fire','police','water','power'];}
for(let k of serviceKeys())if(!layers[k])layers[k]=[(serviceNames[k]||k)+'覆盖','沿可达道路计算服务覆盖，地块得分可用查阅工具查看。'];
$('layer').innerHTML=Object.entries(layers).map(([k,[s]])=>'<option value="'+k+'">'+s+'</option>').join('');
function setLayer(k){layer=k;$('layer').value=k;$('legend').textContent=layers[k][1];if(metrics.graph)paintCoverage();}
$('layer').onchange=e=>setLayer(e.target.value);setLayer(Object.hasOwn(layers,prefs.overlay)?prefs.overlay:'none');
function lines(entries){return entries.map(([k,v])=>'<div class="line"><span>'+k+'</span><span>'+v+'</span></div>').join('');}
function stats(){
 const t=metrics.totals||{};renderContracts();
 $('cash').textContent='¥'+format.format(city.network.cash);$('pop').textContent=format.format(t.population||0);
 $('jobs').textContent=format.format(t.jobs||0);const net=forecast?.net??(t.net||0);
 $('net').textContent=(net>0?'+':'')+'¥'+format.format(net);$('month').textContent='第 '+city.month+' 月';
 $('summary').innerHTML=lines([['道路',city.network.edges.length+' 段'],['营运补助','¥'+format.format(grant)+' / 月'],['分区',city.civic.zones.length+' 片'],['服务',city.civic.services.length+' 处'],['公交',city.network.buses.filter(b=>!b.broken).length+' 条运营'],['跨河通勤',format.format(trafficStats.cross)+' 人 / 月'],['未通达岗位',format.format(trafficStats.unserved)+' 人 / 月'],['步行／公交',format.format((trafficStats.walkers||0)+(trafficStats.busRiders||0))+' 人 / 月']])+(comparison?'<p class="help">'+comparison+'</p>':'');
}
function contractInputs(){const t=metrics.totals||{},s=metrics.services||{},workers=trafficStats.drivers+trafficStats.walkers+trafficStats.busRiders+trafficStats.unserved;return {population:t.population,developed:t.developedLots,access:workers?100*(workers-trafficStats.unserved)/workers:0,buses:city.network.buses.filter(b=>!b.broken).length,busRiders:trafficStats.busRiders,fire:(s.fire?.coverage||0)*100,police:(s.police?.coverage||0)*100};}
function renderContracts(){
 const r=Contracts.report(city.contracts,contractInputs());
 $('contracts').innerHTML=r.map(d=>'<div class="contract"><b>'+(d.done?'✓ ':'')+d.title+'</b><p>'+d.checks.map(o=>o.name+' '+o.current+' / '+o.target+o.unit).join(' · ')+'</p><p>'+(d.done?'已领建设拨款':'达标发放')+' ¥'+format.format(d.reward)+'</p></div>').join('');
 const hist=(city.history||[]).slice(-6);
 $('history').innerHTML=hist.length?'<table class="history"><tr><th>月</th><th>人口</th><th>结余</th><th>公交</th></tr>'+hist.map(r=>'<tr><td>'+r.month+'</td><td>'+r.pop+'</td><td>'+r.net+'</td><td>'+r.bus+'</td></tr>').join('')+'</table>':'<p class="help">推进一月后查看记录。公交为模拟通勤人次，拨款不计入经营结余。</p>';
}
function htmlSel(name,label,values){return '<label class="field">'+label+'<select id="'+name+'">'+Object.entries(values).map(([k,v])=>'<option value="'+k+'" '+(String(opts[name])===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'}
function checkbox(name,label){return '<label class="check"><input id="'+name+'" type="checkbox" '+(opts[name]?'checked':'')+'>'+label+'</label>'}
function value(name,label,min,max){return '<label class="field">'+label+'<input id="'+name+'" type="number" min="'+min+'" max="'+max+'" step="1" value="'+opts[name]+'"></label>'}
function showTools(){
 $('tools').querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',b.dataset.tool===tool);});
 let s='';
 if(['road','upgrade'].includes(tool))s=htmlSel('profile','道路断面',Object.fromEntries(Object.entries(N.profiles).map(([k,v])=>[k,v.name])))+checkbox('oneway','单向通行：起点 → 终点')+checkbox('bus','公交专用车道（普通道路）');
 if(tool==='road')s+=htmlSel('shape','铺设方式',{line:'任意角度直线',curve:'自由曲线（控制点）'})+'<div class="row">'+value('startZ','起点高程 m',-70,70)+value('endZ','终点高程 m',-70,70)+'</div>'+checkbox('snap','吸附到同层路口／路段')+'<div class="row"><button id="ground">地面</button><button id="bridge">桥 +18 m</button><button id="tunnel">隧道 −16 m</button><button id="grade">上坡 0→18</button></div>';
 if(['frontage','polygon'].includes(tool))s=htmlSel('zone','用地',labels)+htmlSel('density','容许密度',{1:'低密 · 低层',2:'中密 · 多层',3:'高密 · 塔楼'})+(tool==='frontage'?value('depth','纵深 m',18,72)+htmlSel('side','沿街方向',{both:'双侧',left:'左侧',right:'右侧'}):'');
 if(tool==='service')s=htmlSel('service','服务种类',Object.fromEntries(serviceKeys().map(k=>[k,serviceNames[k]||k])))+'<label class="field">运营预算 %<input type="number" id="service-budget" min="25" max="160" step="5" value="'+(city.civic.budgets?.[opts.service]??100)+'"></label>';
 $('options').innerHTML=s;$('tool-help').textContent=help[tool];
 $('options').querySelectorAll('select,input').forEach(el=>el.addEventListener('change',()=>{if(el.id==='service-budget'){C.setBudget(city.civic,opts.service,+el.value);refresh();save();return}opts[el.id]=el.type==='checkbox'?el.checked:el.type==='number'?N.clamp(+el.value,+el.min,+el.max):el.value;if(el.id==='service'){showTools();setLayer(opts.service)}updatePreview();}));
 for(let [id,a,b] of [['ground',0,0],['bridge',18,18],['tunnel',-16,-16],['grade',0,18]])if($(id))$(id).onclick=()=>{opts.startZ=a;opts.endZ=b;draft=[];showTools();updatePreview()};
 $('actions').innerHTML=['bus','frontage','polygon'].includes(tool)?'<button id="finish">完成'+toolNames[tool]+'</button><button id="undo">撤回最后一点</button>':'';
 if(tool==='bus'){$('actions').innerHTML+=city.network.buses.map(b=>'<div class="line"><span>'+b.id+' · '+(b.broken?'断线':b.stops.length+' 站')+'</span><button data-remove="'+b.id+'">撤线</button></div>').join('');
 $('actions').querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=()=>{city.network.buses=city.network.buses.filter(b=>b.id!==btn.dataset.remove);refresh();showTools();save();notify('已撤线')});}
 if($('finish')){$('finish').onclick=finish;$('undo').onclick=()=>{draft.pop();updatePreview();hintDraft()}}
}
$('tools').onclick=e=>{let b=e.target.closest('[data-tool]');if(!b)return;if(b.dataset.tool!==tool){tool=b.dataset.tool;draft=[];selected={};if(tool==='bus')setLayer('transit');if(tool==='service')setLayer(opts.service);if(tool==='polygon'||tool==='frontage')setLayer('zones');showTools();updatePreview()}};
function hintDraft(){const n=draft.length,$h=$('tool-help');$h.textContent=help[tool]+(n?' 已选 '+n+' 点。':'');}
const getRoads=()=>N.mapRoads(city.network);
const roadsAt=()=>getRoads();
let trafficStats={cross:0,unserved:0};let grant=0,edgeFlows={},comparison=null;
function buildTraffic(){
 const n=city.network,g=N.graph(n,'car',load),walk=N.graph(n,'walk'),byId=new Map(n.edges.map(e=>[e.id,e])),nodes=new Map(n.nodes.map(x=>[x.id,x]));
 load={};edgeFlows={};trips=[];trafficStats={cross:0,unserved:0,drivers:0,walkers:0,busRiders:0};const cap=150;
 const pairs=new Map(),walkPairs=new Map(),bt=new Map(),l=city.civic.lots;
 const modeNode=lot=>{const hit=N.snap(n,{x:lot.x,y:lot.y,z:0},110,true);if(hit?.node)return hit.node;if(hit?.edge){let e=byId.get(hit.edge);if(!e)return null;return N.dist(nodes.get(e.a),lot)<N.dist(nodes.get(e.b),lot)?e.a:e.b;}return null;};
 const home=l.filter(x=>x.type==='residential'&&x.level>0).map(l=>({l,node:modeNode(l)}));
 const sites=l.filter(x=>x.type!=='residential'&&x.level>0).map(l=>({l,node:modeNode(l),left:Math.max(1,Math.round(l.occupants||metrics.lots?.[l.id]?.capacity||1))})).filter(x=>x.node);
 const buses=n.buses.filter(x=>!x.broken&&x.path.length);
 function route(cache,graph,a,b){const k=a+'>'+b;if(!cache.has(k))cache.set(k,N.path(graph,a,b));return cache.get(k)}
 function stopWithin(lot,bus){return bus.stops.find(id=>N.dist(nodes.get(id),lot)<104);}
 for(let {l:from,node:a} of home){
  const total=Math.max(1,Math.round((from.occupants||1)*.56));
  if(!a){trafficStats.unserved+=total;continue;}
  let best=null;
  for(let dst of sites){if(dst.left<1)continue;let road=route(pairs,g,a,dst.node);if(!road)continue;
   const cost=road.reduce((s,v)=>s+byId.get(v.edge).len/(byId.get(v.edge).speed||1),0)+N.dist(from,dst.l)*.004;
   if(!best||cost<best.cost)best={dst,road,cost};}
  if(!best){trafficStats.unserved+=total;continue;}
  let {dst,road}=best,b=dst.node,commuters=Math.min(total,dst.left);dst.left-=commuters;trafficStats.unserved+=total-commuters;
  if((from.x<N.river(from.y))!==(dst.l.x<N.river(dst.l.y)))trafficStats.cross+=commuters;
  const straight=N.dist(from,dst.l);let wr=straight<180?route(walkPairs,walk,a,b):null,busLine=null;
  if(straight>95)busLine=buses.find(bus=>{let x=stopWithin(from,bus),y=stopWithin(dst.l,bus);return x&&y&&x!==y;});
  let foot=wr?Math.max(1,Math.round(commuters*.45)):0;let transit=busLine?Math.round((commuters-foot)*.52):0;
  let drivers=commuters-foot-transit;
  trafficStats.drivers+=drivers;trafficStats.walkers+=foot;trafficStats.busRiders+=transit;
  const bank=p=>p.x<N.river(p.y)?'西岸':'东岸', k=bank(from)+'住宅 → '+bank(dst.l)+labels[dst.l.type];
  function visual(path,kind,count){
    if(!path?.length||count<=0||trips.length>=cap)return;
    let p=path.map(e=>({...e,l:byId.get(e.edge)?.len||0})).filter(e=>e.l>0);
    if(!p.length)return;const total=p.reduce((s,a)=>s+a.l,0);for(let i=0;i<Math.min(kind==='walker'?3:4,Math.max(1,Math.ceil(count/8)))&&trips.length<cap;i++){trips.push({p,total,kind,phase:((trips.length*0.618+.04+i*.09)%1),speed:kind==='walker'?16:kind==='bus'?45:52});}
  }
  for(let e of road){load[e.edge]=(load[e.edge]||0)+drivers;if(drivers){const flows=edgeFlows[e.edge]??={};flows[k]=(flows[k]||0)+drivers;}}
  if(drivers>0)visual(road,'car',drivers);
  if(foot>0)visual(wr,'walker',foot);
  if(busLine)bt.set(busLine.id,(bt.get(busLine.id)||0)+transit);
 }
 for(let b of buses){for(let e of b.path)load[e.edge]=(load[e.edge]||0)+2;const p=b.path.map(e=>({...e,l:byId.get(e.edge)?.len||0})).filter(e=>e.l>0);const total=p.reduce((s,a)=>s+a.l,0);if(total)for(let i=0;i<(total>760?2:1);i++)trips.push({p,total,kind:'bus',phase:i*.5,speed:47,riders:bt.get(b.id)||0});}
 buildTraffic.edges=byId;edgeTraffic=Object.fromEntries(n.edges.map(e=>[e.id,Math.min(1,(load[e.id]||0)/N.capacity(e))]));
}
function getAgents(t){
 const out=[];for(let tr of trips){let k=(t/1000*tr.speed+tr.phase*tr.total)%tr.total;if(tr.kind!=='bus'&&k>tr.total*.97)continue;for(let e of tr.p){if(k>e.l){k-=e.l;continue}let p=N.sample(buildTraffic.edges.get(e.edge).pts,e.reverse?1-k/e.l:k/e.l);if(!p)break;
 const angle=p.angle+(e.reverse?Math.PI:0),side=tr.kind==='walker'?10:tr.kind==='bus'?5:2.7;out.push({...p,x:p.x-Math.sin(angle)*side,y:p.y+Math.cos(angle)*side,angle,kind:tr.kind,color:tr.kind==='bus'?'#f7d274':tr.kind==='walker'?'#d7f8c0':'#eaf4fc'});break;}}return out;
}
function paintCoverage(){coverageGrid=null;if(!serviceKeys().includes(layer))return;
 const cells=[];for(let y=6;y<800;y+=12)for(let x=6;x<1200;x+=12){let v=C.serviceAt(metrics,layer,{x,y});if(v>0)cells.push({x,y,strength:v});}
 coverageGrid={key:layer,cells};
}
function refresh(){metrics=C.evaluate(city.civic,roadsAt(),roadOpts);grant=Math.max(0,6000-(metrics.totals?.population||0)*2);forecast={net:grant+(metrics.totals?.net||0)+Math.round((metrics.totals?.population||0)*.08)-Math.round(city.network.edges.reduce((n,e)=>n+e.len*(e.lanes*.30+(e.pts.some(q=>Math.abs(q.z)>3)?1.1:0)),0))-140*city.network.buses.filter(b=>!b.broken).length};buildTraffic();sceneWorld=showWorld();paintCoverage();stats();renderDetails();}
function tick(){
 comparison=null;C.tick(city.civic,roadsAt(),roadOpts);city.month++;refresh();city.network.cash+=forecast.net;
 const paid=Contracts.settle(city,contractInputs());city.history=(city.history||[]).concat({month:city.month,pop:metrics.totals?.population||0,net:forecast.net,bus:trafficStats.busRiders||0}).slice(-18);
 stats();save();return paid;
}
$('step').onclick=()=>{const paid=tick();notify(paid.length?paid.map(x=>x.title+' · 拨款 ¥'+format.format(x.reward)).join('；'):'月报已更新')};$('auto').onclick=()=>{playing=!playing;$('auto').setAttribute('aria-pressed',String(playing));$('auto').textContent=playing?'Ⅱ':'▶';};
function roadPoint(p,z){const u={...p,y:p.y+.76*z,z};return opts.snap?(N.snap(city.network,u,Math.max(5,13/camera.zoom),true)||u):u;}
function atPoint(event){const r=canvas.getBoundingClientRect();return view.screenToWorld({x:event.clientX-r.left,y:event.clientY-r.top},camera);}
function groundRoad(p){const candidates=city.network.edges.filter(e=>e.kind==='road'&&e.pts.some(q=>Math.abs(q.z)<4)); let best=null;for(let e of candidates){const nn=N.snap({nodes:[],edges:[e]},{...p,z:0},20/camera.zoom,true);if(nn&&(!best||N.dist(p,nn)<N.dist(p,best)))best=nn;}return best;}
function junction(p){let best=null,delta=23/camera.zoom;for(let n of city.network.nodes){let w=N.dist({x:n.x,y:n.y-.76*n.z},p);if(w<=delta){best=n;delta=w}}return best;}
function edgeAt(p){
 let best=null,d=17/camera.zoom;
 for(let e of city.network.edges)for(let i=1;i<e.pts.length;i++){
  // Query at projected height so an overpass can be selected independently.
  let a=view.worldToScreen(e.pts[i-1],camera),b=view.worldToScreen(e.pts[i],camera),x=view.worldToScreen(p,camera);
  const v=b.x-a.x,w=b.y-a.y,t=N.clamp(((x.x-a.x)*v+(x.y-a.y)*w)/(v*v+w*w||1),0,1);
  const dd=Math.hypot(a.x+t*v-x.x,a.y+t*w-x.y);
  if(dd<d*camera.zoom){d=dd/camera.zoom;best=e;}
 }return best;
}
function splitPathFollowing(a,b){let e=city.network.edges.find(x=>x.id===a.edge&&x.id===b.edge);if(!e)return [a,b];let sign=a.pos<=b.pos?1:-1;if(sign>0)return [a,...e.pts.slice(Math.floor(a.pos)+1,Math.ceil(b.pos)),b];return [a,...e.pts.slice(Math.floor(b.pos)+1,Math.ceil(a.pos)).reverse(),b]}
function legalPolygon(poly){
 if(poly.some(q=>!onLand(q)))return false;
 const min=Math.max(0,Math.floor(Math.min(...poly.map(q=>q.y))/10)*10),max=Math.max(...poly.map(q=>q.y));
 // Reject any polygon touching sampled river at its boundary or interior.
 for(let j=0;j<poly.length;j++){let a=poly[j],b=poly[(j+1)%poly.length],k=Math.ceil(N.dist(a,b)/5);for(let i=1;i<k;i++)if(!onLand(N.mix({...a,z:0},{...b,z:0},i/k)))return false;}
 for(let y=min;y<=max;y+=10)if(inPoly({x:N.river(y),y},poly))return false;
 return true;
}
function inPoly(p,list){let hit=false;for(let i=0,j=list.length-1;i<list.length;j=i++){let a=list[i],b=list[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit}return hit}
function finish(){
 let r;const before=trafficBefore();
 if(tool==='bus'){
  const trial=structuredClone(city.network),stops=draft.map(p=>p.id??N.splitAt(trial,p));
  if(stops.includes(null))return notify('有站点不在可用道路上',true);
  r=N.bus(trial,stops);if(r.ok)city.network=trial;
 }
 else if(tool==='frontage'){
  if(draft.length<2)return notify('先在同一条街或相接街段选择至少两点',true);
  const geometry=draft.slice(1).flatMap((q,i)=>splitPathFollowing(draft[i],q).slice(i?1:0));
  r=C.zoneFrontage(city.civic,{type:opts.zone,points:geometry,depth:opts.depth,side:opts.side,density:+opts.density,...roadOpts},roadsAt(),roadOpts);
 }else if(tool==='polygon'){
  if(draft.length<3)return notify('至少点三个角',true);if(!legalPolygon(draft))return notify('分区不能跨越河道或超出地图',true);
  r=C.addZone(city.civic,{type:opts.zone,polygon:draft,density:+opts.density,...roadOpts},roadsAt(),roadOpts);
 }
 if(r?.ok){if(r.cost&&city.network.cash<r.cost){C.remove(city.civic,r.id);return notify('市库不足 · 需要 ¥'+format.format(r.cost),true);}city.network.cash-=r.cost||0;draft=[];refresh();save();if(tool==='bus'){showTools();comparePlan(before);}notify('已完成 '+toolNames[tool]);updatePreview();hintDraft()}else if(r)notify(r.reason||'操作未完成',true);
}
function trafficBefore(){return {cross:trafficStats.cross,unserved:trafficStats.unserved,drivers:trafficStats.drivers,bus:trafficStats.busRiders};}
function comparePlan(before){const after=trafficBefore();comparison='路网改动前 → 后：未通达 '+before.unserved+' → '+after.unserved+'，开车 '+before.drivers+' → '+after.drivers+'，乘公交 '+before.bus+' → '+after.bus+'。';stats();}
function completeRoad(end){
 const before=trafficBefore(),[first,control]=draft;const pts=N.plan(first,end,opts.shape==='curve'?control:null);const r=N.add(city.network,pts,opts,[first,end]);if(!r.ok)return notify(r.reason,true);draft=[];hover=null;refresh();comparePlan(before);save();notify('道路建成 · ¥'+format.format(r.cost));updatePreview();hintDraft();
}
function pointerAction(p){
 if(tool==='road'){if(!draft.length){draft=[roadPoint(p,opts.startZ)];notify('已定起点');}else if(opts.shape==='curve'&&draft.length===1){draft.push(p);notify('已定控制点，点击终点');}else completeRoad(roadPoint(p,opts.endZ));}
 else if(tool==='polygon'){if(!onLand(p))return notify('只能在陆地分区',true);if(draft.length>=48)return notify('分区达到 48 点上限，请完成当前区域',true);draft.push(p);}
 else if(tool==='frontage'){let q=groundRoad(p);if(!q)return notify('请点击普通地面道路',true);if(draft.length>=32)return notify('请先完成此沿街分区',true);if(draft.length&&draft.at(-1).edge!==q.edge){let a=draft.at(-1),edges=city.network.edges;
  let e1=edges.find(e=>e.id===a.edge),e2=edges.find(e=>e.id===q.edge);let shared=[e1.a,e1.b].find(n=>n===e2.a||n===e2.b);
  if(!shared)return notify('请沿同一条路或通过相邻路口继续',true);
  const n=city.network.nodes.find(n=>n.id===shared);draft.push({...n,edge:e1.id,pos:shared===e1.a?0:e1.pts.length-1},{...n,edge:e2.id,pos:shared===e2.a?0:e2.pts.length-1});
 }draft.push(q);}
 else if(tool==='bus'){let q=junction(p);if(q&&!city.network.edges.some(e=>e.kind==='road'&&(e.a===q.id||e.b===q.id)))q=null;q=q||groundRoad(p);
 if(!q)return notify('请点普通道路上的站点位置',true);if(draft.some(v=>N.dist(v,q)<8))return notify('这个站点已在当前线路中',true);draft.push(q);notify('已添加第 '+draft.length+' 站');}
 else if(tool==='service'){if(!onLand(p))return notify('设施只能建在陆地',true);const r=C.addService(city.civic,{type:opts.service,...p,...roadOpts},roadsAt(),roadOpts);if(!r.ok)return notify(r.reason,true);if(city.network.cash<r.cost){C.remove(city.civic,r.id);return notify('市库不足 · 需要 ¥'+format.format(r.cost),true);}city.network.cash-=r.cost;refresh();save();notify('已建设 '+(serviceNames[opts.service]||opts.service));}
 else if(tool==='inspect'){const f=city.civic.services.find(s=>N.dist(s,p)<15/camera.zoom),z=city.civic.zones.find(z=>inPoly(p,z.polygon||z.poly||[])),e=edgeAt(p);
  selected=f?{service:f.id}:e?{edge:e.id}:z?{zone:z.id}:{};renderDetails();}
 else if(tool==='erase'||tool==='upgrade'){const e=edgeAt(p);if(!e)return notify('未选中道路',true);if(tool==='erase'){if(selected.edge!==e.id){selected={edge:e.id};renderDetails();return notify('再点同一路段确认拆除');}N.remove(city.network,e.id);selected={};notify('道路已拆除');}else{let r=N.upgrade(city.network,e.id,opts);if(!r.ok)return notify(r.reason,true);selected={edge:e.id};notify('道路已改造 · ¥'+format.format(r.cost));}refresh();save();}
 updatePreview();hintDraft();
}
function renderDetails(){
 const n=city.network,e=n.edges.find(e=>e.id===selected.edge),z=city.civic.zones.find(z=>z.id===selected.zone),f=city.civic.services.find(s=>s.id===selected.service);
 const txt=$('details');if(e){const heights=e.pts.map(p=>p.z);txt.innerHTML=lines([['道路',N.profiles[e.profile]?.name||'道路'],['长度',Math.round(e.len)+' m'],['高程',Math.round(Math.min(...heights))+' → '+Math.round(Math.max(...heights))+' m'],['方向',e.oneway?'单行':'双向'],['公交专用',e.bus?'有':'无'],['负荷 / 容量',Math.round(load[e.id]||0)+' / '+Math.round(N.capacity(e))],...Object.entries(edgeFlows[e.id]||{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>[k,v+' 人'])]);return}
 if(z){let lots=city.civic.lots.filter(l=>l.zoneId===z.id),list=[['用途',labels[z.type]||'分区'],['地块',lots.length],['已开发',lots.filter(l=>l.level>0).length],['最高等级',Math.max(0,...lots.map(l=>l.level))]];for(let k of serviceKeys().slice(0,7)){let m=lots.length?lots.reduce((s,l)=>s+(metrics.lots?.[l.id]?.[k]||0),0)/lots.length:0;list.push([serviceNames[k]||k,Math.round(m*100)+'%']);}txt.innerHTML=lines(list);return;}
 if(f){txt.innerHTML=lines([['设施',serviceNames[f.type]||'公共服务'],['预算',(city.civic.budgets?.[f.type]??100)+'%']]);return}
 txt.textContent='选择查阅并点击道路、建筑或设施。';
}
let preview=null;
function updatePreview(){
 if(tool==='road'&&hover&&draft.length){let u=roadPoint(hover,opts.endZ),shape=opts.shape==='curve'&&draft.length===2?draft[1]:null,pts=N.plan(draft[0],u,shape),r=N.check(city.network,pts,opts,[draft[0],u]);preview={points:pts,valid:r.ok,kind:'road',lanes:N.profiles[opts.profile].lanes,label:r.ok?'¥'+format.format(r.cost):r.reason};return}
 if(draft.length){let pts=[...draft];if(hover&&(tool==='polygon'||tool==='frontage'))pts.push(hover);preview={points:pts,valid:true,kind:tool,closed:tool==='polygon'&&pts.length>2};return}
 preview=hover&&tool==='service'?{points:[hover],valid:onLand(hover),kind:'service'}:null;
}
function showWorld(){
 const n=city.network,by=new Map();
 for(let l of city.civic.lots){if(!by.has(l.zoneId))by.set(l.zoneId,[]);if(l.level>0)by.get(l.zoneId).push({...l,w:l.width,d:l.depth});}
 return {...n,zones:city.civic.zones.map(z=>({...z,poly:z.polygon||z.poly||[],buildings:by.get(z.id)||[]})),services:city.civic.services.map(s=>({...s,radius:130}))};
}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(e.button===1||e.button===2||e.shiftKey||panMode){drag={x:e.clientX,y:e.clientY,orig:{...camera},world:atPoint(e)};canvas.setPointerCapture(e.pointerId);return;}if(e.button===0){canvas.focus({preventScroll:true});pointerAction(atPoint(e));}});
canvas.addEventListener('pointermove',e=>{if(drag){const p=atPoint(e);camera.x+=drag.world.x-p.x;camera.y+=drag.world.y-p.y;}else{hover=atPoint(e);updatePreview();}});
canvas.addEventListener('pointerleave',()=>{hover=null;updatePreview();});canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
function zoom(z){camera.zoom=N.clamp(camera.zoom*z,.53,3.2);}
canvas.addEventListener('wheel',e=>{e.preventDefault();let a=atPoint(e);zoom(Math.exp(-e.deltaY*.0015));let b=atPoint(e);camera.x+=a.x-b.x;camera.y+=a.y-b.y;},{passive:false});
$('pan').onclick=()=>{panMode=!panMode;$('pan').setAttribute('aria-pressed',String(panMode));canvas.style.cursor=panMode?'grab':'';};
$('zoom-in').onclick=()=>zoom(1.25);$('zoom-out').onclick=()=>zoom(.8);$('home').onclick=()=>{camera={x:600,y:400,zoom:1};};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,button')||$('file-dialog').open)return;if(e.key==='Escape'){draft=[];selected={};hintDraft();updatePreview();renderDetails();}if(e.key==='Enter'&&['bus','polygon','frontage'].includes(tool)){e.preventDefault();finish();}if(e.key.startsWith('Arrow')){e.preventDefault();camera.x+=e.key==='ArrowRight'?32:e.key==='ArrowLeft'?-32:0;camera.y+=e.key==='ArrowDown'?32:e.key==='ArrowUp'?-32:0;}});
$('files').onclick=()=>$('file-dialog').showModal();$('close').onclick=()=>$('file-dialog').close();
function confirmAction(label,fn){if($('file-status').textContent!==label){$('file-status').textContent=label;return}fn();$('file-status').textContent='操作已完成。';$('file-dialog').close();}
$('blank').onclick=()=>confirmAction('再点「清空重建」确认。请先导出要保留的城市。',()=>changeCity(stateStore.make()));$('starter').onclick=()=>confirmAction('再点「载入示例城」确认。请先导出当前进度。',()=>changeCity(starter()));
$('export').onclick=()=>{let url=URL.createObjectURL(new Blob([JSON.stringify(city)],{type:'application/json'}));let a=document.createElement('a');a.href=url;a.download='city-blueprint-freebuild.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
$('import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>4000000)throw Error('文件过大');const s=stateStore.restore(JSON.parse(await file.text()));if(!window.confirm('用这个存档替换当前预览城市？'))return;changeCity(s);$('file-status').textContent='已载入。';}catch(x){$('file-status').textContent='导入失败：'+x.message;}finally{e.target.value='';}};
let lastFrame=0,lastSignature='',lastWorld=null,lastPreview=null,lastSelection=null,animate=prefs.motion!==false;
function scene(now){if(!previous)previous=now;if(animate)clock+=Math.min(50,now-previous);previous=now;
 if(playing&&now-lastAuto>3100){lastAuto=now;const paid=tick();if(paid.length)notify('市政委托完成 · 拨款 ¥'+format.format(paid.reduce((s,p)=>s+p.reward,0)));}else if(!playing)lastAuto=now;
 view.resize();const sig=[camera.x,camera.y,camera.zoom,layer,tool,view.width,view.height].join('|');
 const changed=sig!==lastSignature||lastWorld!==sceneWorld||lastPreview!==preview||lastSelection!==selected;
 if(!changed&&(!animate||now-lastFrame<1000/30)){window.requestAnimationFrame(scene);return;}
 lastFrame=now;lastSignature=sig;lastWorld=sceneWorld;lastPreview=preview;lastSelection=selected;
 view.render(sceneWorld,{camera,overlay:layer,preview,selected,agents:getAgents(clock),metrics:{...metrics,edgeTraffic,coverageGrid},tool},clock);window.requestAnimationFrame(scene);}
showTools();refresh();window.requestAnimationFrame(scene);
 if(location.protocol==='file:'&&location.pathname.includes('试玩.html'))$('hall').href='https://www.weili.space/game/city/';
 if(new URLSearchParams(location.search).get('menu')==='saves')$('file-dialog').showModal();
window.Blueprint={world:()=>city, metrics:()=>metrics,traffic:()=>trafficStats,view,camera:()=>({...camera}),setLayer,save,agents:()=>getAgents(clock),coverage:()=>coverageGrid};
})();
