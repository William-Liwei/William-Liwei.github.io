'use strict';
(()=>{
const P=Parking,N=Network,C=Civic,U=Utilities,T=Transit,E=Economy,D=Districts,M=CityMaps,$=s=>document.getElementById(s);
const parameters=new URLSearchParams(location.search),map=M.select(parameters.get('map')),mapId=map.id,sandbox=parameters.get('mode')==='sandbox';
const canvas=$('map'),view=new CityView(canvas,{width:1200,height:800}),storeKey=M.storage(mapId,sandbox),prefKey='city.blueprint.settings.1',format=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0});
let prefs={};try{prefs=JSON.parse(localStorage.getItem(prefKey))||{};localStorage.setItem('city.blueprint.map.1',mapId);localStorage.setItem('city.blueprint.mode.1',sandbox?'sandbox':'career')}catch{}
$('map-name').textContent=map.name;document.querySelector('.brand p').textContent=(sandbox?'规划沙盒':'自由经营')+' · '+map.name;
const serviceNames={fire:'消防',police:'警务',water:'供水',power:'电力',health:'医疗',clinic:'医疗',education:'教育',school:'教育',waste:'环卫站',park:'绿地',library:'图书馆',plaza:'市民广场',logistics:'物流中心'};
const labels={residential:'住宅',commercial:'商业',office:'办公',industrial:'工业'};
const defaults={profile:'r2',oneway:false,bus:false,startZ:0,endZ:0,shape:'line',signalAction:'switch',signalEW:50,signalCycle:26,signalOffset:0,parkingType:'small',parkingFee:0,parkingMode:'build',snap:true,flip:false,zone:'residential',density:2,depth:38,side:'both',service:'fire',utilityType:'water',stationType:'tramStop',trackMode:'tram',trackStart:0,trackEnd:0,transitMode:'tram',districtType:'farm'};
function normalizeSignals(input,nodes){
 const valid=new Set(nodes.map(n=>n.id));
 if(!input||typeof input!=='object')return {};
 return Object.fromEntries(Object.entries(input).flatMap(([k,v])=>{
  if(!valid.has(k)||!/^n[0-9]+$/.test(k))return [];
  if(typeof v==='boolean')return [[k,v]];
  if(v&&typeof v==='object'&&[v.ew,v.cycle,v.offset].every(Number.isFinite))return [[k,{enabled:v.enabled!==false,ew:N.clamp(v.ew,.2,.8),cycle:N.clamp(v.cycle,12,80),offset:N.clamp(v.offset,-80,80)}]];
  return [];
 }));
}
const stateStore={make:()=>({version:1,network:N.create(),civic:C.create(17),mapId,sandbox,utilities:U.create(),transit:T.create(),districts:D.create(),economy:E.create(),parking:P.normalize(),signals:{},month:1,contracts:{},history:[],finance:{tax:9,debt:0,frequency:"normal"}}),restore(raw){
 if(raw?.version!==1||!Array.isArray(raw.network?.edges)||!Array.isArray(raw.network?.nodes)||!Array.isArray(raw.network?.buses)||!Array.isArray(raw.civic?.lots)||!Array.isArray(raw.civic?.zones)||!Array.isArray(raw.civic?.services)||!Number.isInteger(raw.month)||raw.month<1||!Number.isFinite(raw.network.cash)||!Number.isInteger(raw.network.next))throw Error('不兼容的城市存档');
 if((raw.mapId||'river')!==mapId||!!raw.sandbox!==sandbox)throw Error('此存档属于其他地图或模式，请先从大厅切换。');
 raw.mapId=mapId;
 const u=raw.utilities?U.restore(raw.utilities):U.create(), tt=raw.transit?T.normalize(raw.transit,{water:N.water}):T.create(), dd=raw.districts?D.normalize(raw.districts,{mapId,water:N.water,isBuildable:p=>M.land(p)}):D.create(), ee=raw.economy?E.restore(raw.economy):E.create();
 if(!u||!tt||!dd||!ee)throw Error('水电、交通、特别分区或产业存档无效');
 Object.assign(raw,{utilities:u,transit:tt,districts:dd,economy:ee,parking:P.normalize(raw.parking),signals:normalizeSignals(raw.signals,raw.network.nodes)});
 const {nodes,edges,buses}=raw.network;
 if(nodes.length>1500||edges.length>1800||buses.length>200||raw.civic.lots.length>4000)throw Error('存档规模超出预览版上限');
 const ids=new Set();for(let n of nodes){if(typeof n.id!=='string'||ids.has(n.id)||![n.x,n.y,n.z].every(Number.isFinite))throw Error('无效节点');ids.add(n.id)}
 const eids=new Set();for(let e of edges){if(typeof e.id!=='string'||eids.has(e.id)||!ids.has(e.a)||!ids.has(e.b)||!Array.isArray(e.pts)||e.pts.length<2||e.pts.length>500||!e.pts.every(p=>[p.x,p.y,p.z].every(Number.isFinite))||![2,3,4,6,8].includes(e.lanes)||!['road','highway','ramp'].includes(e.kind)||!Number.isFinite(e.speed)||e.speed<1)throw Error('无效道路');e.len=N.length(e.pts);eids.add(e.id);}
 if(buses.some(b=>!/^B[0-9]+$/.test(b.id)||!Array.isArray(b.stops)||b.stops.length<2||!b.stops.every(s=>ids.has(s)))||raw.civic.lots.some(l=>!Number.isFinite(l.x)||!Number.isFinite(l.y)||!Object.hasOwn(labels,l.type))||raw.civic.services.some(s=>!Number.isFinite(s.x)||!Number.isFinite(s.y)))throw Error('无效设施或地块');
 raw.finance={tax:N.clamp(Math.round(+raw.finance?.tax||9),5,16),debt:N.clamp(Math.round(+raw.finance?.debt||0),0,40000),frequency:raw.finance?.frequency==="frequent"?"frequent":"normal"};
 raw.network.turns=N.normalizedTurns(raw.network);
 U.bootstrap(raw.utilities,raw.civic,N.mapRoads(raw.network));
 N.rebuildBuses(raw.network);
 raw.contracts=Object.fromEntries(Object.entries(raw.contracts||{}).filter(([k,v])=>Contracts.ids.includes(k)&&Number.isInteger(v)&&v>0&&v<=raw.month));
 raw.history=Array.isArray(raw.history)?raw.history.slice(-18).filter(r=>r&&[r.month,r.pop,r.net,r.bus].every(Number.isFinite)):[];
 return raw;
}};
const onLand=p=>M.land(p);
const parkedLand=(p,pad=0)=>city?.parking?.lots.some(l=>{
 const d=P.LOTS[l.type];return Math.abs(l.x-p.x)<d.w/2+pad&&Math.abs(l.y-p.y)<d.h/2+pad;
});
const roadOpts={isBuildable:p=>onLand(p)&&!parkedLand(p,2.5)};
let coverageGrid=null,sceneWorld=null,edgeTraffic={},pending=null,utilityMetrics=null,regional=null,transitMetrics=null,districtMetrics=null,econ=null,micro=null,pedestrians=null;
let opts={...defaults},tool='road',draft=[],hover=null,selected={},layer='none',playing=false,forecast=null,metrics={},load={},trips=[],city=null;
let camera={x:600,y:400,zoom:1}, drag=null,panMode=false, lastAuto=0, clock=0, previous=0;
function starter(){
 if(mapId!=='river')return regionalStarter();
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
 U.bootstrap(s.utilities,s.civic,roads);n.cash=sandbox?2600000:map.cash;return s;
}
function regionalStarter(){
 const s=stateStore.make(),n=s.network,pt=(x,y,z=0)=>({x,y,z});
 const coastal=mapId==='coast', yw=coastal?275:421,ye=coastal?275:330,bx=coastal?325:306,ex=coastal?914:860;
 const add=(a,b,profile='r2')=>N.add(n,N.plan(a,b),{profile});
 add(pt(8,yw),pt(coastal?490:488,yw),'r4');add(pt(690,ye),pt(1192,ye),'r4');
 add(pt(bx,yw-110),pt(bx,yw+160));add(pt(ex,ye-145),pt(ex,ye+120));
 const roads=N.mapRoads(n);
 for(const [type,x1,x2,y] of [['residential',bx-122,bx-20,yw],['commercial',bx+18,bx+132,yw],['industrial',ex+20,ex+131,ye],['residential',ex-132,ex-18,ye]])C.zoneFrontage(s.civic,{type,points:[pt(x1,y),pt(x2,y)],depth:34,density:2,side:'both'},roads,roadOpts);
 for(const [type,x,y] of [['water',bx+16,yw+86],['power',bx-17,yw+63],['fire',bx+19,yw-69],['water',ex+16,ye-86],['power',ex-18,ye-65],['police',ex-17,ye+72]])C.addService(s.civic,{type,x,y},roads,roadOpts);
 for(let k=0;k<13;k++)C.tick(s.civic,roads,roadOpts);
 U.bootstrap(s.utilities,s.civic,roads);n.cash=sandbox?2600000:map.cash;return s;
}
let lastStored=null,saveError='',saveConflict=false,recoveryRaw=null;
const recoveryHint='原存档无法读取，已保留原始数据。本页暂不写入；请先导出原始存档，再明确选择导入或重建。';
function reportSaveProblem(msg,conflict=false){
 saveError=msg;saveConflict=conflict;
 $('save-warning-text').textContent=msg;
 $('save-warning').hidden=!msg;
 if(conflict){
  playing=false;$('auto').setAttribute('aria-pressed','false');$('auto').textContent='▶';
 }
}
function checkCanSave(replacing=false){
 if(!saveConflict){
  try{
   const actual=localStorage.getItem(storeKey);
   if(actual===lastStored){if(recoveryRaw!==null&&!replacing){reportSaveProblem(recoveryHint);return false;}return true;}
   reportSaveProblem('另一个标签页更新了此城市。本页不会覆盖它；可以导出本页的进度，再重开游戏。',true);
  }catch{reportSaveProblem('保存失败：浏览器无法读取本机存档，请先导出 JSON。');}
 }
 return false;
}
function save(next=city,replacing=false){
 if(buildDepth)return false;
 if(!checkCanSave(replacing))return false;
 try{
  const saved=JSON.stringify(next);
  localStorage.setItem(storeKey,saved);lastStored=saved;recoveryRaw=null;updateRawExport();reportSaveProblem('');return true;
 }catch{reportSaveProblem('保存失败：浏览器无法写入本机存档，请先导出 JSON。');return false;}
}
window.addEventListener('storage',e=>{
 if((e.key===storeKey||e.key===null)&&e.newValue!==lastStored)checkCanSave();
});
function notify(msg,bad=false){$('notice').textContent=msg;$('notice').classList.toggle('bad',bad);clearTimeout(notify.timer);if(msg)notify.timer=setTimeout(()=>{$('notice').textContent=''},5300)}
function loadCity(){
 try{lastStored=localStorage.getItem(storeKey);}catch{return starter();}
 if(lastStored===null)return starter();
 try{return stateStore.restore(JSON.parse(lastStored));}
 catch{recoveryRaw=lastStored;return starter();}
}
city=loadCity();
function changeCity(s){if(batch)return false;if(!save(s,true))return false;city=s;comparison=null;draft=[];selected={};playing=false;flowKey='';flowClock=0;showTools();$('auto').setAttribute('aria-pressed','false');$('auto').textContent='▶';refresh();return true;}
const help={parking:'普通道路自带有限路侧位，私家车按同一到达节点找位，公交和货车不占位。选择建造或调整收费。别让收费车库挡住路面或占到旧地块。',junction:'点地图上的路口，再选择驶入方向。勾选要禁止的出口；应用后先审核蓝图，不会直接改路。转向规则影响汽车、货车和道路公交，不影响步行。',utility:'选水管或电线，沿地面点起点和终点；同类线相交即接通。可建独立支线，水电不会互串。首次编辑每一类网络会启用真实供给。',station:'先建有道路接驳的车站、港口、机场或车辆段。码头和船坞需要岸边，机场需要完整的陆地跑道。',track:'选地面铁路、地铁或电车轨道，在地图点起点和终点；端点贴近已有轨道、对应站点或车辆段才能接通。地面铁路可接东西边界口。',line:'选择运输方式和站点，依次加入。铁路、地铁、电车需要接通对应车辆段；轮渡和货轮必须有连续水域；飞机可选图外航点。',district:'选择独立特别分区，先打开资源图层找合适位置，然后点至少三个角。资源与运输条件共同决定产出。',signal:'点路口切换信号，或自定东西向时间配额、周期与相位。提高某向配额会压缩另一向；下游没空间时，绿灯也不会放行。',road:'直线点起终点；曲线依次点起点、控制点、终点。可分别调起终点高程。红色预览不可建设，选择「不吸附」可自由落点。',upgrade:'先选新断面，再点击现有同类型道路。单行方向按原路绘制方向。',bus:'按发车顺序在普通道路上点至少两个站，可选路口或路段中间。系统沿可行车方向闭环，遇单行须有回程。',frontage:'沿普通道路点击起点和终点；要跟随弯道可加入中间点。可选单侧或两侧、纵深与密度。',polygon:'在地图点至少三个角，完成后按按钮或 Enter。区域不限栅格，地块仍需接近地面道路才能成长。',service:'选择设施，再点地图放置；设施须靠近可服务道路。可在此调服务预算，右侧图层检查实际覆盖。',inspect:'点道路、设施或分区看属性。高架与地面叠在一起时，可用图层辅助识别。',erase:'点击一段道路，确认后才拆除。相交分段有独立路段，断开的公交会暂停。'};
const toolNames={parking:'停车设施',junction:'路口规则',utility:'水电线路',station:'枢纽设施',track:'轨道',line:'运输线路',district:'特别分区',signal:'交通信号',road:'道路',upgrade:'道路改造',bus:'公交线路',frontage:'沿街分区',polygon:'多边形分区',service:'公共服务',inspect:'查阅',erase:'拆除'};
const layers={parking:['停车','P 表示公共场库，数字是已用／总位；红色已满，灰色未接通。小圆点是路侧位，蓝色队尾表示等待停车。'],connections:['对外连接','公路、铁路、港口和航空的城市外接点；铁路必须铺轨连到边界。'],resources:['自然资源','选特别分区类型后查看相应资源。'],districts:['特别分区','显示特别区边界及其用途。'],routes:['铁路、水运和航线','可查看有效线路和已建轨道、车辆段。'],none:['实景','鸟瞰地形、建筑、人车与道路。'],traffic:['道路交通','橙线：该方向正在排队。紫线：队尾堵住上游入口。用查阅工具点击道路查看停在哪、为什么。'],transit:['公共交通','青色标出有效公交线路；断线不发车。'],elevation:['高程／隧道','高架、桥梁与地下通道按高程显色。'],zones:['土地用途','住区、商业、办公与工业分色。'],land:['建设潜力','有道路、基础设施和服务的地块更容易升高密度。'],fire:['消防覆盖','由消防站经路网抵达；互不连通的道路不会跨河覆盖。'],police:['警务覆盖','由警务设施经道路提供。'],water:['供水覆盖','供水设施经道路计算覆盖；本版没有独立管线。'],power:['电力覆盖','电力设施经道路计算覆盖；本版没有独立电网。']};
function civicTypes(){return C.SERVICE_TYPES||C.SERVICES||{}}
function serviceKeys(){let v=civicTypes();return Array.isArray(v)?v.map(x=>typeof x==='string'?x:x.id||x.type):Object.keys(v).length?Object.keys(v):['fire','police','water','power'];}
for(let k of serviceKeys())if(!layers[k])layers[k]=[(serviceNames[k]||k)+'覆盖','沿可达道路计算服务覆盖，地块得分可用查阅工具查看。'];
layers.water[1]='蓝线是水管。连接到供水源且有余量才供水；独立网络未启用时保留旧存档供水方式。';
layers.power[1]='金线是电网。异种线路不串联，断开后影响实际地块。';
const layerGroups={
 '总览与规划':['none','zones','districts','elevation','resources'],
 '出行与对外连接':['traffic','transit','routes','parking','connections'],
 '水电与环境':['water','power','sewage','waste','pollution','noise'],
 '市政与生活':['services','fire','police','health','education','clinic','school','park','library','plaza','logistics']
};
const grouped=new Set();
function layerOptions(keys){return keys.filter(k=>Object.hasOwn(layers,k)&&!grouped.has(k)).map(k=>{grouped.add(k);return '<option value="'+k+'">'+layers[k][0]+'</option>';}).join('');}
$('layer').innerHTML=Object.entries(layerGroups).map(([name,keys])=>{const x=layerOptions(keys);return x?'<optgroup label="'+name+'">'+x+'</optgroup>':'';}).join('')+
 (Object.keys(layers).some(k=>!grouped.has(k))?'<optgroup label="其他服务">'+layerOptions(Object.keys(layers))+'</optgroup>':'');
function setLayer(k){layer=k;$('layer').value=k;$('legend').textContent=layers[k][1];$('flow-panel').hidden=!['traffic','parking'].includes(k);if(metrics.graph)paintCoverage();}
$('layer').onchange=e=>setLayer(e.target.value);setLayer(Object.hasOwn(layers,prefs.overlay)?prefs.overlay:'none');
function lines(entries){return entries.map(([k,v])=>'<div class="line"><span>'+k+'</span><span>'+v+'</span></div>').join('');}
function stats(){
 const t=metrics.totals||{};renderContracts();$('event-status').textContent=[incident.name,incident.detail].filter(Boolean).join(' · ');
 $('cash').textContent='¥'+format.format(city.network.cash);$('pop').textContent=format.format(t.population||0);
 $('jobs').textContent=format.format(t.jobs||0);const net=forecast?.net??(t.net||0);
 $('net').textContent=(net>0?'+':'')+'¥'+format.format(net);$('month').textContent='第 '+city.month+' 月';
 const u=utilityMetrics?.types||{};
 $('regional').innerHTML=lines([['水网',u.water?.managed?u.water.connectedLots+' 地块':'兼容供水'],['电网',u.power?.managed?u.power.connectedLots+' 地块':'兼容供电'],['铁路等客运',(transitMetrics?.total?.passengers||0)+' 人'],['港航等货运',(transitMetrics?.total?.cargo||0)+' 单位'],['公路外接',regional.gates+' / '+M.gates(mapId).length],['公路货运',regional.freight+' 单位'],['特别区岗位',format.format(districtMetrics?.total?.jobs||0)]]);
 $('summary').innerHTML=lines([['道路',city.network.edges.length+' 段'],['税率',city.finance.tax+'%'],['营运补助','¥'+format.format(grant)+' / 月'],['未偿借款','¥'+format.format(city.finance.debt)],['分区',city.civic.zones.length+' 片'],['服务',city.civic.services.length+' 处'],['公交',(effective||city.network).buses.filter(b=>!b.broken).length+' 条运营'],['跨河通勤',format.format(trafficStats.cross)+' 人 / 月'],['未通达岗位',format.format(trafficStats.unserved)+' 人 / 月'],['步行／公交',format.format((trafficStats.walkers||0)+(trafficStats.busRiders||0))+' 人 / 月']])+(comparison?'<p class="help">'+comparison+'</p>':'');
}
function contractInputs(){const t=metrics.totals||{},s=metrics.services||{},workers=trafficStats.drivers+trafficStats.walkers+trafficStats.busRiders+(trafficStats.railRiders||0)+trafficStats.unserved;return {population:t.population,developed:t.developedLots,access:workers?100*(workers-trafficStats.unserved)/workers:0,buses:(effective||city.network).buses.filter(b=>!b.broken).length,busRiders:trafficStats.busRiders,fire:(s.fire?.coverage||0)*100,police:(s.police?.coverage||0)*100,waterLots:utilityMetrics?.types?.water?.managed?utilityMetrics.types.water.reliableLots:0,powerLots:utilityMetrics?.types?.power?.managed?utilityMetrics.types.power.reliableLots:0,regionalPassenger:(transitMetrics?.total?.inbound||0)+(transitMetrics?.total?.outbound||0)+(regional?.visitors||0),regionalCargo:(regional?.freight||0)+(transitMetrics?.total?.cargoIn||0)+(transitMetrics?.total?.cargoOut||0),districtGoods:districtMetrics?.total?.goods,processed:Object.values(econ?.lots||{}).filter(z=>z.zone==='industrial'&&z.sector!=='urban_farms').reduce((n,z)=>n+Object.values(z.output||{}).reduce((a,b)=>a+b,0),0)};}
function renderContracts(){
 const r=Contracts.report(city.contracts,contractInputs());
 $('contracts').innerHTML=r.map(d=>'<div class="contract"><b>'+(d.done?'✓ ':'')+d.title+'</b><p>'+d.checks.map(o=>o.name+' '+o.current+' / '+o.target+o.unit).join(' · ')+'</p><p>'+(d.done?'已领建设拨款':'达标发放')+' ¥'+format.format(d.reward)+'</p></div>').join('');
 const hist=(city.history||[]).slice(-6);
 $('history').innerHTML=hist.length?'<table class="history"><tr><th>月</th><th>人口</th><th>结余</th><th>公交</th></tr>'+hist.map(r=>'<tr><td>'+r.month+'</td><td>'+r.pop+'</td><td>'+r.net+'</td><td>'+r.bus+'</td></tr>').join('')+'</table>':'<p class="help">推进一月后查看记录。公交为模拟通勤人次，拨款不计入经营结余。</p>';
}
function htmlSel(name,label,values){return '<label class="field">'+label+'<select id="'+name+'">'+Object.entries(values).map(([k,v])=>'<option value="'+k+'" '+(String(opts[name])===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'}
function checkbox(name,label){return '<label class="check"><input id="'+name+'" type="checkbox" '+(opts[name]?'checked':'')+'>'+label+'</label>'}
function value(name,label,min,max){return '<label class="field">'+label+'<input id="'+name+'" type="number" min="'+min+'" max="'+max+'" step="1" value="'+opts[name]+'"></label>'}
function listOptions(obj){return Object.fromEntries(Object.entries(obj).map(([id,value])=>[id,value.name]));}
function clean(value){return String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
function hasRoad(p,r=85,n=effective||city.network){return !!N.snap({nodes:[],edges:n.edges.filter(e=>e.kind==='road')},{x:p.x,y:p.y,z:0},r,true);}
function transitOpts(net=effective||city.network){return {water:N.water,isBuildable:onLand,width:1200,height:800,mapId,centerline:N.river,river:N.river,roadAccess:(p,r)=>hasRoad(p,Math.min(112,Math.max(58,(Number(r)||16)*2.7)),net)};}
function districtOpts(net=effective||city.network){const stations=city.transit.stations;return {...transitOpts(net),transit:city.transit,waterAt:p=>U.isManaged(city.utilities,'water')?U.at(utilityMetrics,'water',p):1,powerAt:p=>U.isManaged(city.utilities,'power')?U.at(utilityMetrics,'power',p):1,roadAccess:(p,r)=>hasRoad(p,Math.min(76,Number(r)||58),net),seaports:stations.filter(s=>s.type==='cargoPort'||s.type==='ferryTerminal'),airports:stations.filter(s=>s.type==='airport'||s.type==='cargoAirport')};}
let turnNode=null,turnEnter=null;
function showTools(){return withBuildCity(()=>showToolsWork());}
function showToolsWork(){
 $('tools').querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',b.dataset.tool===tool);});
 let s='';
 if(['road','upgrade'].includes(tool)){
  const profile=N.profiles[opts.profile],dedicated=N.crossSection({...profile,oneway:opts.oneway||profile.oneway,bus:true}).busOffsets.length;
  if(!dedicated)opts.bus=false;
  s=htmlSel('profile','道路断面',Object.fromEntries(Object.entries(N.profiles).map(([k,v])=>[k,v.name])))+checkbox('oneway','单向通行：起点 → 终点')+(tool==='upgrade'&&opts.oneway?checkbox('flip','单行方向反转'):'' )+(dedicated?checkbox('bus','预留 '+dedicated+' 条公交专用车道'):'<p class="help">公交专用道需在同一方向保留普通车道；可改用单向或更宽的普通道路。</p>');
 }
 if(tool==='road')s+=htmlSel('shape','铺设方式',{line:'任意角度直线',curve:'自由曲线（控制点）'})+'<div class="row">'+value('startZ','起点高程 m',-70,70)+value('endZ','终点高程 m',-70,70)+'</div>'+checkbox('snap','吸附到同层路口／路段')+'<div class="row"><button id="ground">地面</button><button id="bridge">桥 +18 m</button><button id="tunnel">隧道 −16 m</button><button id="grade">上坡 0→18</button></div>';
 if(['frontage','polygon'].includes(tool))s=htmlSel('zone','用地',labels)+htmlSel('density','容许密度',{1:'低密 · 低层',2:'中密 · 多层',3:'高密 · 塔楼'})+(tool==='frontage'?value('depth','纵深 m',18,72)+htmlSel('side','沿街方向',{both:'双侧',left:'左侧',right:'右侧'}):'');
 if(tool==='parking'){
  const variants=Object.fromEntries(Object.entries(P.LOTS).map(([k,v])=>[k,v.label+' · '+v.slots+' 位']));
  s=htmlSel('parkingMode','停车设施操作',{build:'新建停车场／车库',price:'调整已建设施收费'});
  if(opts.parkingMode==='build')s+=htmlSel('parkingType','设施规格',variants);
  s+=value('parkingFee','停车每次收费 ¥',0,12);
  if(opts.parkingMode==='build'){const v=P.LOTS[opts.parkingType];s+='<p class="help">造价 ¥'+format.format(v.cost)+' · 养护 ¥'+v.monthly+'／月。收费影响车位选择和出价意愿；抽样收费不直接计入月度财政。</p>';}
 }
 if(tool==='signal'){
  s=htmlSel('signalAction','信号操作',{switch:'切换信号开关',timing:'自定配时'});
  if(opts.signalAction==='timing')s+=value('signalEW','东西向时间配额 %',20,80)+value('signalCycle','全周期（秒）',12,80)+value('signalOffset','相位提前（秒）',-80,80);
 }
 if(tool==='utility')s=htmlSel('utilityType','线路类型',{water:'供水管网',power:'输配电网'})+'<p class="help">首段实际建设会启用该类型独立供给；先检查旧有主线。</p>';
 if(tool==='station')s=htmlSel('stationType','枢纽与配套',listOptions(T.FACILITIES))+'<p class="help">造价 ¥'+format.format(T.FACILITIES[opts.stationType].cost)+' · 月费 ¥'+format.format(T.FACILITIES[opts.stationType].monthly)+'</p>';
 if(tool==='track')s=htmlSel('trackMode','轨道类别',listOptions(Object.fromEntries(Object.entries(T.MODES).filter(([,m])=>m.track))))+(opts.trackMode==='metro'?'<p class="help">地下标准标高 −12 m</p>':'<div class="row">'+value('trackStart','起点高程 m',0,50)+value('trackEnd','终点高程 m',0,50)+'</div>');
 if(tool==='line')s=htmlSel('transitMode','运输方式',listOptions(T.MODES));
 if(tool==='district')s=htmlSel('districtType','特别分区用途',listOptions(D.TYPES));
 if(tool==='service')s=htmlSel('service','服务种类',Object.fromEntries(serviceKeys().map(k=>[k,serviceNames[k]||k])))+'<label class="field">运营预算 %<input type="number" id="service-budget" min="25" max="160" step="5" value="'+(city.civic.budgets?.[opts.service]??100)+'"></label>';
 $('options').innerHTML=s;$('tool-help').textContent=help[tool];
 $('options').querySelectorAll('select,input').forEach(el=>el.addEventListener('change',()=>{if(el.id==='service-budget'){if(batch){showTools();return notify('经营预算不属于施工蓝图，请先完成当前批次',true);}C.setBudget(city.civic,opts.service,+el.value);refresh();save();return}opts[el.id]=el.type==='checkbox'?el.checked:el.type==='number'?N.clamp(+el.value,+el.min,+el.max):el.value;if(el.id==='service'){showTools();setLayer(opts.service)}
 if(el.id==='profile'||el.id==='oneway'||el.id==='signalAction'||el.id==='parkingMode'||el.id==='parkingType'){showTools();hintDraft();$(el.id)?.focus({preventScroll:true});}
 if(el.id==='shape'||el.id==='startZ'){draft=[];hintDraft();}
 if(['stationType','trackMode','transitMode','utilityType','districtType'].includes(el.id)){draft=[];showTools();if(el.id==='utilityType')setLayer(opts.utilityType);if(el.id==='districtType')setLayer('resources');}
 updatePreview();}));
 for(let [id,a,b] of [['ground',0,0],['bridge',18,18],['tunnel',-16,-16],['grade',0,18]])if($(id))$(id).onclick=()=>{opts.startZ=a;opts.endZ=b;draft=[];showTools();updatePreview()};
 $('actions').innerHTML=['bus','frontage','polygon','line','district'].includes(tool)?'<button id="finish">完成'+toolNames[tool]+'</button><button id="undo">撤回最后一点</button>':'';
 if(batch&&$('service-budget'))$('service-budget').disabled=true;
 if(tool==='line'){
  const list=T.stopOptions(city.transit,opts.transitMode,transitOpts());
  $('actions').innerHTML='<select aria-label="站点或外部连接" id="line-stop"><option value="">选择站点或外部连接</option>'+list.map(k=>'<option value="'+clean(k.id)+'">'+clean(k.name||k.id)+'</option>').join('')+'</select><button id="line-add">加入线路</button><div class="help" id="line-points">'+draft.map(x=>clean(x.name||x.id)).join(' → ')+'</div>'+$('actions').innerHTML;
  $('line-add').onclick=()=>joinStop(list.find(k=>k.id===$('line-stop').value));
  for(const z of city.transit.lines.filter(l=>l.mode===opts.transitMode)){
   const v=transitMetrics?.lines?.[z.id];
   const row=document.createElement('div');row.className='line';const text=document.createElement('span');text.textContent=z.id+' '+(v?.valid?((v.passengers||0)+' 人／'+(v.cargo||0)+' 货'):(v?.reason||'未运营'));row.append(text);const btn=document.createElement('button');btn.textContent='撤线';btn.onclick=()=>withBuildCity(()=>{const tr=structuredClone(city),r=T.remove(tr.transit,z.id);beginPlan(tr,r,{points:v?.path||[],kind:'line'},'撤除运输线路','line');});row.append(btn);$('actions').append(row);
  }
 }
 if(tool==='bus'){$('actions').innerHTML+=city.network.buses.map(b=>'<div class="line"><span>'+b.id+' · '+(b.broken?'断线':b.stops.length+' 站')+'</span><button data-remove="'+b.id+'">撤线</button></div>').join('');
 $('actions').querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=()=>withBuildCity(()=>{
  const tr=structuredClone(city),line=tr.network.buses.find(b=>b.id===btn.dataset.remove);if(!line)return;
  const points=line.path.flatMap(h=>{const e=tr.network.edges.find(e=>e.id===h.edge);return e?(h.reverse?[...e.pts].reverse():e.pts):[]});
  tr.network.buses=tr.network.buses.filter(b=>b.id!==line.id);
  beginPlan(tr,{ok:true},{points,kind:'erase'},'撤除公交 '+line.id,'bus','取消线路后不再收取运营费');
 }));}
 if(tool==='junction')renderTurnEditor();
 if($('finish')){$('finish').onclick=finish;$('undo').onclick=()=>{draft.pop();updatePreview();hintDraft()}}
}
$('tools').onclick=e=>{let b=e.target.closest('[data-tool]');if(!b)return;if(b.dataset.tool!==tool){tool=b.dataset.tool;draft=[];selected={};turnNode=null;turnEnter=null;turnPreview=null;if(tool==='bus')setLayer('transit');if(tool==='line'||tool==='track'||tool==='station')setLayer('routes');if(tool==='utility')setLayer(opts.utilityType);if(tool==='district')setLayer('resources');if(tool==='signal'||tool==='junction')setLayer('traffic');if(tool==='parking')setLayer('parking');if(tool==='service')setLayer(opts.service);if(tool==='polygon'||tool==='frontage')setLayer('zones');showTools();updatePreview()}};
const turnPoint=(e,n)=>{
 const f=Math.min(.45,(16+N.crossSection(e).width*.24)/Math.max(e.len,1));
 return N.sample(e.pts,e.a===n.id?f:1-f);
};
function bearing(n,p){return ['东','东南','南','西南','西','西北','北','东北'][((Math.round(Math.atan2(p.y-n.y,p.x-n.x)/(.25*Math.PI))%8)+8)%8];}
function turnLabel(n,entry,exit){
 if(entry.id===exit.id)return '掉头';
 const a=turnPoint(entry,n),b=turnPoint(exit,n),angle=Math.atan2(b.y-n.y,b.x-n.x)-Math.atan2(n.y-a.y,n.x-a.x);
 const d=(angle+3*Math.PI)%(2*Math.PI)-Math.PI;
 return Math.abs(d)<Math.PI*.21?'直行':Math.abs(d)>Math.PI*.79?'大角度转向':d>0?'右转':'左转';
}
function renderTurnEditor(){return withBuildCity(()=>renderTurnEditorWork());}
function renderTurnEditorWork(){
 const target=$('actions'),n=city.network.nodes.find(n=>n.id===turnNode);
 if(!n){target.innerHTML='<p class="help">请选择有至少两段道路的路口。</p>';return;}
 const roads=N.approaches(city.network,n.id),entries=roads.filter(e=>N.enters(e,n.id));
 const exits=roads.filter(e=>N.exits(e,n.id));if(!entries.length||!exits.length){target.innerHTML='<p class="help">无有效驶入或驶出方向。请先改造单行方向。</p>';return;}
 const entry=entries.find(e=>e.id===turnEnter)||entries[0];turnEnter=entry.id;
 const has=new Set((city.network.turns||[]).filter(r=>r.node===n.id&&r.enter===entry.id).map(r=>r.exit));
 const name=e=>bearing(n,turnPoint(e,n))+'侧 · '+(N.profiles[e.profile]?.name||'道路')+' · '+e.id;
 target.innerHTML='<div class="field">路口 '+clean(n.id)+' · '+Math.round(n.z)+' m</div><label class="field">驶入方向<select id="turn-entry">'+entries.map(e=>'<option value="'+clean(e.id)+'" '+(e.id===turnEnter?'selected':'')+'>'+clean(name(e))+'</option>').join('')+'</select></label><div class="turn-exits"><small>勾选要禁止的出口</small>'+exits.map(e=>'<label class="check"><input type="checkbox" data-turn-exit value="'+clean(e.id)+'" '+(has.has(e.id)?'checked':'')+'>'+clean(turnLabel(n,entry,e)+' · '+name(e))+'</label>').join('')+'</div><button id="turn-review" disabled>预览规则变更</button>';
 const checked=()=>[...target.querySelectorAll('[data-turn-exit]:checked')].map(e=>e.value);
 function update(){
  const blocked=new Set(checked());
  $('turn-review').disabled=has.size===blocked.size&&[...has].every(id=>blocked.has(id));
  turnGuide(n,entry,exits,blocked);
 }
 $('turn-entry').onchange=e=>{turnEnter=e.target.value;renderTurnEditor();};
 target.querySelectorAll('[data-turn-exit]').forEach(el=>el.onchange=update);
 $('turn-review').onclick=()=>withBuildCity(()=>{
  const blocked=checked(),trial=structuredClone(city),r=N.setTurns(trial.network,n.id,entry.id,blocked);
  const changed=exits.find(e=>e.id!==entry.id&&has.has(e.id)!==blocked.includes(e.id));
  const from=entry.a===n.id?entry.b:entry.a,to=changed?(changed.a===n.id?changed.b:changed.a):null;
  const trialRoute=net=>{
   const res=to&&N.path(N.graph(net,'car'),from,to);
   if(!res)return null;
   const path=res.map(h=>({h,e:net.edges.find(v=>v.id===h.edge)}));
   return {len:Math.round(path.reduce((x,{e})=>x+e.len,0)),points:path.flatMap(({h,e},i)=>(h.reverse?[...e.pts].reverse():e.pts).slice(i?1:0))};
  };
  const before=changed?trialRoute(city.network):null,after=changed?trialRoute(trial.network):null;
  const journey=changed&&from!==to?' · 相邻街段试走 '+(before?before.len+' m':'不通')+' → '+(after?after.len+' m':'不通'):'';
  const info=blocked.length+' 个禁止转向'+(r.newBreaks?' · '+r.newBreaks+' 条既有公交将暂停':'')+journey;
  beginPlan(trial,r,{...turnPreview,points:[n],kind:'junction',detour:journey&&after?.points},'调整 '+n.id+' 路口规则','junction',info);
 });
 update();
}
let turnPreview=null;
function turnGuide(n,entry,exits,blocked){
 turnPreview={points:[n],kind:'junction',movement:{entry:turnPoint(entry,n),at:n,exits:exits.map(e=>({point:turnPoint(e,n),blocked:blocked.has(e.id),uturn:e.id===entry.id}))}};
 updatePreview();
}
function joinStop(s){if(!s)return notify('请选择站点',true);if(draft.some(p=>p.id===s.id))return notify('该站点已在线路内',true);draft.push(s);showTools();hintDraft();updatePreview();}
function hintDraft(){const n=draft.length,$h=$('tool-help');$h.textContent=help[tool]+(n?' 已选 '+n+' 点。':'');}
const getRoads=()=>N.mapRoads(city.network);
const roadsAt=()=>getRoads();
let flowMode='auto',flowClock=0,flowKey='';
let trafficStats={cross:0,unserved:0};let grant=0,edgeFlows={},comparison=null,incident={},effective=null,activeRoads=[],roadIdentity=null,roadClosure='';
function applyIncident(){
 incident=map.rain?CityEvents.status(city):{phase:'normal',name:'区域运输',detail:'青岭走廊不受周期汛期封桥影响；外部铁路的运力更重要。',closed:[]};const blocked=new Set(incident.closed||[]);
 const n=city.network, closure=JSON.stringify(incident.closed||[]);
 if(roadIdentity===n&&closure===roadClosure)return;
 roadIdentity=n;roadClosure=closure;
 if(!blocked.size)effective=n;
 else {effective={...n,edges:n.edges.filter(e=>!blocked.has(e.id)),buses:n.buses.map(b=>({...b}))};N.rebuildBuses(effective);}
 activeRoads=N.mapRoads(effective);
}
function buildTraffic(){
 const n=effective||city.network,g=N.graph(n,'car',load),walk=N.graph(n,'walk'),byId=new Map(n.edges.map(e=>[e.id,e])),nodes=new Map(n.nodes.map(x=>[x.id,x]));
 load={};edgeFlows={};trips=[];trafficStats={cross:0,unserved:0,drivers:0,walkers:0,busRiders:0};const cap=150;
 const urbanDemand=new Map(),pairs=new Map(),walkPairs=new Map(),bt=new Map(),l=city.civic.lots;
 const modeNode=lot=>{const direct=byId.get(metrics.lots?.[lot.id]?.roadId);if(direct)return N.dist(nodes.get(direct.a),lot)<N.dist(nodes.get(direct.b),lot)?direct.a:direct.b;const hit=N.snap(n,{x:lot.x,y:lot.y,z:0},110,true);if(hit?.node)return hit.node;if(hit?.edge){let e=byId.get(hit.edge);if(!e)return null;return N.dist(nodes.get(e.a),lot)<N.dist(nodes.get(e.b),lot)?e.a:e.b;}return null;};
 const home=l.filter(x=>x.type==='residential'&&x.level>0).map(l=>({l,node:modeNode(l)}));
 const sites=l.filter(x=>x.type!=='residential'&&x.level>0).map(l=>({l,node:modeNode(l),left:Math.max(1,Math.round(l.occupants||metrics.lots?.[l.id]?.capacity||1))})).filter(x=>x.node);
 const pools=new Map();for(const job of sites){if(!pools.has(job.node))pools.set(job.node,[]);pools.get(job.node).push(job);}
 const trees=new Map(),buses=n.buses.filter(x=>!x.broken&&x.path.length);
 const busGraph=N.graph(n,'bus'),busDepots=city.transit.stations.filter(s=>s.type==='busDepot'&&hasRoad(s,55,n)).map(s=>n.nodes.filter(a=>N.dist(a,s)<100).sort((a,b)=>N.dist(a,s)-N.dist(b,s))[0]).filter(Boolean);
 const depotLines=new Set(buses.filter(b=>busDepots.some(depot=>b.stops.some(stop=>N.path(busGraph,depot.id,stop)!==null&&N.path(busGraph,stop,depot.id)!==null))).map(b=>b.id));
 const railShare=transitMetrics?.total?.localPassengers||0;
 function route(cache,graph,a,b){const k=a+'>'+b;if(!cache.has(k))cache.set(k,N.path(graph,a,b));return cache.get(k)}
 function stopWithin(lot,bus){return bus.stops.find(id=>N.dist(nodes.get(id),lot)<104);}
 for(let {l:from,node:a} of home){
  const total=Math.max(1,Math.round((from.occupants||1)*.56));
  if(!a){trafficStats.unserved+=total;continue;}
  let best=null;
  if(!trees.has(a))trees.set(a,N.pathsFrom(g,a));
  const tree=trees.get(a);
  for(const [node,batch] of pools){const distance=tree.distances[node];if(!Number.isFinite(distance)||distance>(best?.cost??Infinity))continue;
   for(const dst of batch){if(dst.left<1)continue;const cost=distance+N.dist(from,dst.l)*.004;if(!best||cost<best.cost)best={dst,cost};}
  }
  if(best)best.road=tree.route(best.dst.node);
  if(!best){trafficStats.unserved+=total;continue;}
  let {dst,road}=best,b=dst.node,commuters=Math.min(total,dst.left);dst.left-=commuters;trafficStats.unserved+=total-commuters;
  if((from.x<N.river(from.y))!==(dst.l.x<N.river(dst.l.y)))trafficStats.cross+=commuters;
  const straight=N.dist(from,dst.l);let wr=straight<180?route(walkPairs,walk,a,b):null,busLine=null;
  if(straight>95)busLine=buses.find(bus=>{let x=stopWithin(from,bus),y=stopWithin(dst.l,bus);return x&&y&&x!==y;});
  let foot=wr?Math.max(1,Math.round(commuters*.45)):0;let transit=busLine?Math.round((commuters-foot)*((city.finance.frequency==='frequent'?.70:.50)+(depotLines.has(busLine.id)?.08:0))):0;
  const nearby=railShare>0&&Object.values(transitMetrics.lines).some(line=>line.valid&&line.passengers>0&&line.points?.some(p=>!p.external&&N.dist(p,from)<100)&&line.points?.some(p=>!p.external&&N.dist(p,dst.l)<100));
  const multi=nearby?Math.round((commuters-foot-transit)*.28):0;
  let drivers=commuters-foot-transit-multi;
  trafficStats.drivers+=drivers;trafficStats.walkers+=foot;trafficStats.busRiders+=transit;trafficStats.railRiders=(trafficStats.railRiders||0)+multi;
  const bank=p=>p.x<N.river(p.y)?'西岸':'东岸', k=bank(from)+'住宅 → '+bank(dst.l)+labels[dst.l.type];
  function visual(path,kind,count){
    if(!path?.length||count<=0||trips.length>=cap)return;
    let p=path.map(e=>({...e,l:byId.get(e.edge)?.len||0})).filter(e=>e.l>0);
    if(!p.length)return;const total=p.reduce((s,a)=>s+a.l,0);for(let i=0;i<Math.min(kind==='walker'?3:4,Math.max(1,Math.ceil(count/8)))&&trips.length<cap;i++){trips.push({p,total,kind,phase:((trips.length*0.618+.04+i*.09)%1),speed:kind==='walker'?16:kind==='bus'?45:52});}
  }
  for(let e of road){load[e.edge]=(load[e.edge]||0)+drivers;if(drivers){const flows=edgeFlows[e.edge]??={};flows[k]=(flows[k]||0)+drivers;}}
  function commute(p,count,profile){
    if(!p?.length||count<=0)return;
    const key=profile+':'+p.map(t=>t.edge+(t.reverse?'r':'')).join('/');
    if(!urbanDemand.has(key))urbanDemand.set(key,{p,profile,count:0});
    urbanDemand.get(key).count+=count;
  }
  if(drivers>0){commute(road,drivers,'commute');commute(route(pairs,g,b,a),drivers,'home');}
  if(foot>0)visual(wr,'walker',foot);
  if(busLine)bt.set(busLine.id,(bt.get(busLine.id)||0)+transit);
 }
 for(const {p,profile,count} of [...urbanDemand.values()].sort((a,b)=>b.count-a.count).slice(0,180)){
  // Aggregate equivalent commutes before sampling; the simulated fleet has a hard cap.
  const total=p.reduce((n,h)=>n+(byId.get(h.edge)?.len||0),0);
  trips.push({p,total,kind:'car',profile,parking:true,parkDwell:profile==='home'?37:48,phase:((trips.length*.618+.04)%1),speed:52,interval:N.clamp(88/(1+Math.sqrt(count)),4,50)});
 }
 for(let b of buses){for(let e of b.path)load[e.edge]=(load[e.edge]||0)+2;const p=b.path.map(e=>({...e,l:byId.get(e.edge)?.len||0})).filter(e=>e.l>0);const total=p.reduce((s,a)=>s+a.l,0);if(total)for(let i=0;i<(total>760?2:1)+(depotLines.has(b.id)?1:0);i++)trips.push({p,total,kind:'bus',phase:i*.5,speed:47,stops:b.stops,riders:bt.get(b.id)||0});}
 if(regional){for(const [id,count] of Object.entries(regional.loads))load[id]=(load[id]||0)+count;trips.push(...regional.paths.map(p=>({...p,profile:p.kind==='truck'?'freight':'steady'})));}
 resetFlow(n);
 pedestrians=Pedestrians.create(n,trips);
 buildTraffic.edges=byId;edgeTraffic=Object.fromEntries(n.edges.map(e=>[e.id,Math.min(1,(load[e.id]||0)/N.capacity(e))]));
}
function resetFlow(n=effective||city.network){
 const descriptors=trips.filter(t=>t.kind!=='walker');
 const key=JSON.stringify([flowMode,city.signals,n.edges.map(e=>[e.id,e.a,e.b,e.len,e.speed,e.lanes,e.oneway,e.bus,e.kind]),n.turns,city.parking]);
 if(micro&&flowKey===key){micro.updateDemand(descriptors);return;}
 flowKey=key;
 micro=Traffic.create(n,descriptors,{seed:17,maxVehicles:180,warmupSeconds:5,signal:true,
   signals:city.signals,parking:P.build(n,city.parking),profileMode:flowMode,profileOffset:Math.max(0,flowClock/1000-5)});
 liveQueues=null;
}
function getAgents(t){
 if(!animate)return [];
 return [...(micro?.agents()||[]),...(pedestrians?.agents(t)||[]),...T.agents(transitMetrics,t)];
}
function renderFlow(s){
 if(!s||!['traffic','parking'].includes(layer))return;
 const name=flowMode==='auto'?s.periodName:flowMode==='low'?'固定低峰':'固定高峰';
 const w=s.rolling;
 $('flow-stats').innerHTML=lines([
 ['时段',name],['近 30 秒 · 到达／完成',w.offered+' / '+w.completed+' 辆'],['在路／候入',s.vehicles+' / '+s.backlog+' 辆'],
 ['实时排队',s.queued+' 辆'],['回堵入口',s.spillback+' 个'],['累计换道',s.laneChanges+' 次'],
 ['本轮未入场',s.lostDemand+' 辆'],
 ...(s.parking?[['停车已占／总数',s.parking.occupied+' / '+s.parking.capacity+' 位'],['满位点／停车队首',s.parking.full+' 处 / '+s.parking.waiting+' 辆'],
  ['已停车／离位',s.parking.served+' / '+s.parking.released+' 辆'],
  ['停车等候原因','满位 '+s.parking.causes.full+' · 价高 '+s.parking.causes.price+' · 无接点 '+s.parking.causes.unconnected]]:[])
 ]);
}
$('flow-mode').onchange=e=>{flowMode=e.target.value;resetFlow();renderFlow(micro.stats());lastSignature='';};
function paintCoverage(){coverageGrid=null;if(!serviceKeys().includes(layer)&&layer!=='resources')return;
 const cells=[],dopt=layer==='resources'?districtOpts():null;for(let y=6;y<800;y+=12)for(let x=6;x<1200;x+=12){const p={x,y};let v=layer==='resources'?D.resource(opts.districtType,p,dopt):(['water','power'].includes(layer)&&U.isManaged(city.utilities,layer)?(onLand(p)?U.at(utilityMetrics,layer,p):0):C.serviceAt(metrics,layer,p));if(v>0)cells.push({x,y,strength:v});}
 coverageGrid={key:layer,cells};
}
function refresh(){
 applyIncident();const fin=city.finance;
 utilityMetrics=U.evaluate(city.utilities,city.civic);
 regional=Outside.assess(effective,M.gates(mapId),city.civic,map,N);
 districtMetrics=D.evaluate(city.districts,city.civic,districtOpts());
 transitMetrics=T.evaluate(city.transit,{...city.civic,lots:[...city.civic.lots,...D.freightLots(districtMetrics)]},{...transitOpts(),airportBoost:districtMetrics.airportBoost});
 const supply=supplyOptions();E.allocate(city.civic,{...fin,economy:city.economy},supply);
 econ=E.evaluate(city.civic,{...fin,economy:city.economy},supply);
 metrics=C.evaluate(city.civic,activeRoads,civicOptions());
 const pop=metrics.totals?.population||0;
 grant=Math.max(0,Math.round(map.grant-pop*1.45));
 const road=Math.round(city.network.edges.reduce((n,e)=>n+e.len*(e.lanes*.28+(e.pts.some(q=>Math.abs(q.z)>3)?.85:0)),0));
 const bus=(fin.frequency==='frequent'?410:220)*city.network.buses.filter(b=>!b.broken).length,interest=Math.ceil(fin.debt*.012),principal=Math.min(fin.debt,1250);
 const infra=utilityMetrics.maintenance||0, transit=Math.round((transitMetrics.total?.net||0)*(map.port+map.air)/2),district=Math.round(districtMetrics.total?.net||0),regionalNet=regional.net||0;
 const parking=city.parking.lots.reduce((v,l)=>v+P.LOTS[l.type].monthly,0);
 const chains=Math.round(econ.totals?.taxAdjustment||0);forecast={road,bus,infra,parking,transit,district,regionalNet,chains,interest,principal,net:grant+(metrics.totals?.net||0)-road-bus-infra-parking-interest-principal+transit+district+regionalNet+chains};buildTraffic();sceneWorld=showWorld();paintCoverage();stats();renderDetails();}
function supplyOptions(){
 const d=districtMetrics?.total?.goodsByType||{},t=transitMetrics?.total||{};
 const incoming=(t.cargoIn||0)+(regional?.freight||0);
 const local={produce:d['粮食']||0,livestock:d['畜产']||0,fish:d['水产']||0,ore:d['矿石']||0,timber:d['木材']||0,oil:d['原油']||0};
 const commodities=Object.values(E.PRODUCTS).filter(x=>x.importable),weights=commodities.map(x=>1+(econ?.products?.[x.id]?.shortage||0)),sum=weights.reduce((a,b)=>a+b,0)||1;
 const imports=Object.fromEntries(commodities.map((p,i)=>[p.id,incoming*weights[i]/sum]));
 const exportBudget=(t.cargoOut||0)+(regional?.freight||0);
 const exports=Object.fromEntries(Object.values(E.PRODUCTS).filter(v=>v.exportable).map(v=>[v.id,exportBudget/commodities.length]));
 return {outside:incoming>0||!!regional?.gates,local,imports,exports,context(lot){return {waterfront:Math.abs(lot.x-N.river(lot.y))<M.width(lot.y)+55,access:hasRoad(lot,35),traffic:(regional?.visitors||0)/100,education:D.sample(districtMetrics,'education',lot)};}};
}
function civicOptions(){
 return {...roadOpts,tax:city.finance.tax,utilityFor(lot,type){return ['water','power'].includes(type)&&U.isManaged(city.utilities,type)?utilityMetrics?.lots?.[lot.id]?.[type]||0:null;},
 districtFor:lot=>({park:D.sample(districtMetrics,'park',lot),education:D.sample(districtMetrics,'education',lot),pollution:D.sample(districtMetrics,'pollution',lot)}),
 sectorFor:lot=>E.modifiers(lot,{...city.finance,economy:city.economy},econ)};
}
function tick(){
 if(pending||batch||saveConflict)return [];comparison=null;city.month++;applyIncident();D.tick(city.districts,city.civic,districtOpts());C.tick(city.civic,activeRoads,civicOptions());refresh();
 const net=forecast.net;city.network.cash+=net;city.finance.debt-=forecast.principal;
 const paid=Contracts.settle(city,contractInputs());city.history=(city.history||[]).concat({month:city.month,pop:metrics.totals?.population||0,net,bus:(trafficStats.busRiders||0)+(transitMetrics?.total?.passengers||0)}).slice(-18);
 refresh();save();return paid;
}
$('step').onclick=()=>{if(!checkCanSave())return;const paid=tick();notify(paid.length?paid.map(x=>x.title+' · 拨款 ¥'+format.format(x.reward)).join('；'):'月报已更新')};$('auto').onclick=()=>{if(!checkCanSave())return;playing=!playing;$('auto').setAttribute('aria-pressed',String(playing));$('auto').textContent=playing?'Ⅱ':'▶';};
function roadPoint(p,z){const u={...p,y:p.y+.76*z,z};const gate=opts.snap&&z===0&&M.gates(mapId).find(q=>N.dist(u,q)<13/camera.zoom);if(gate)return {x:gate.x,y:gate.y,z:0};return opts.snap?(N.snap(city.network,u,Math.max(5,13/camera.zoom),true)||u):u;}
function atPoint(event){const r=canvas.getBoundingClientRect();return view.screenToWorld({x:event.clientX-r.left,y:event.clientY-r.top},camera);}
function groundRoad(p){const candidates=city.network.edges.filter(e=>e.kind==='road'&&e.pts.some(q=>Math.abs(q.z)<4)); let best=null;for(let e of candidates){const nn=N.snap({nodes:[],edges:[e]},{...p,z:0},20/camera.zoom,true);if(nn&&(!best||N.dist(p,nn)<N.dist(p,best)))best=nn;}return best;}
function junction(p,min=1){
 const degree=new Map();for(const e of city.network.edges){degree.set(e.a,(degree.get(e.a)||0)+1);degree.set(e.b,(degree.get(e.b)||0)+1);}
 let best=null,delta=20/camera.zoom;
 for(const n of city.network.nodes){if((degree.get(n.id)||0)<min)continue;const d=N.dist({x:n.x,y:n.y-.76*n.z},p);if(d<=delta){best=n;delta=d;}}
 return best;
}
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
let batch=null,buildDepth=0;
const BATCH_LIMIT=24;
function withBuildCity(fn){
 if(!batch||buildDepth)return fn();
 const live=city,net=effective;buildDepth++;
 city=batch.world;effective=null;
 try{return fn();}finally{city=live;effective=net;buildDepth--;}
}
function clearBuildSelection(){draft=[];hover=null;selected={};turnNode=null;turnEnter=null;turnPreview=null;}
function renderBatch(){
 const enabled=!!batch;
 $('batch-toggle').setAttribute('aria-pressed',String(enabled));
 $('batch-toggle').textContent=enabled?'批量蓝图已开':'批量蓝图';
 $('batch-review').hidden=!enabled;
 for(const id of ['step','auto','budget','economy','files','menu-files'])$(id).disabled=enabled;
 if(!enabled)return;
 const cost=city.network.cash-batch.world.network.cash;
 $('batch-total').textContent=batch.items.length+' 项待施工 · 费用 ¥'+format.format(cost)+' · 预计市库 ¥'+format.format(batch.world.network.cash);
 $('batch-items').replaceChildren(...batch.items.map((p,i)=>{
  const li=document.createElement('li');li.textContent=(i+1)+'. '+p.title+' · ¥'+format.format(p.cash);return li;
 }));
 for(const id of ['batch-undo','batch-commit'])$(id).disabled=!batch.items.length;
}
function updateBatchScene(){if(batch)batch.scene=withBuildCity(showWorld);renderBatch();showTools();updatePreview();}
function discardBatch(){
 batch=null;clearBuildSelection();renderBatch();showTools();updatePreview();
 notify('已退出批量蓝图，未扣款');
}
$('batch-toggle').onclick=()=>{
 if(pending)return;
 if(batch){$('batch-review').scrollIntoView({block:'nearest'});return;}
 if(!checkCanSave())return;
 clearBuildSelection();batch={world:city,items:[],ghosts:[],scene:sceneWorld};renderBatch();showTools();updatePreview();
 notify('批量蓝图已打开。继续画路、摆设施，最后一次施工。');
};
$('batch-undo').onclick=()=>{
 if(!batch?.items.length)return;
 const last=batch.items.pop();batch.world=last.prior;batch.ghosts=batch.items.map(v=>v.geometry);
 clearBuildSelection();$('batch-discard').textContent='退出／放弃';updateBatchScene();notify('已撤回：'+last.title);
};
$('batch-discard').onclick=()=>{
 if(batch?.items.length&&$('batch-discard').textContent!=='确认放弃整批'){$('batch-discard').textContent='确认放弃整批';return;}
 if(batch)discardBatch();
};
$('batch-commit').onclick=()=>{
 if(!batch?.items.length)return;
 const p=batch;
 if(draft.length){notify('还有未完成的绘制，先完成或按 Esc 收起这笔',true);return;}
 if(!save(p.world)){notify(saveError,true);return;} // Persist the full plan before swapping any live state.
 batch=null;city=p.world;clearBuildSelection();renderBatch();refresh();showTools();updatePreview();
 notify('已一次施工 '+p.items.length+' 项 · 本月生效');
};
window.addEventListener('beforeunload',e=>{if(batch?.items.length){e.preventDefault();e.returnValue='';}});
function beginPlan(trial,r,geometry,title,kind,info=''){
 if(!r?.ok)return notify(r?.reason||'无法生成蓝图',true);
 const cash=city.network.cash-trial.network.cash;
 if(batch){
  if(batch.items.length>=BATCH_LIMIT)return notify('单批最多 '+BATCH_LIMIT+' 项；可先确认这批或撤回最后一项',true);
  batch.items.push({prior:batch.world,title,kind,cash,geometry});batch.world=trial;batch.ghosts=batch.items.map(v=>v.geometry);
  clearBuildSelection();$('batch-discard').textContent='退出／放弃';
  // Refresh outside the planning context so the subtotal is computed against live cash.
  queueMicrotask(updateBatchScene);notify('已加入蓝图 · '+title);return;
 }
 pending={trial,geometry:{...geometry,valid:true},title,kind,cash,before:trafficBefore()};
 $('plan-title').textContent='待确认 · '+title;
 $('plan-cost').textContent='施工费用 ¥'+format.format(Math.max(0,cash))+' · 预计余额 ¥'+format.format(trial.network.cash)+(info?' · '+info:'');
 $('plan-review').hidden=false; $('build-guide').hidden=true;
 $('plan-flow-estimate').hidden=!geometry.signalNode&&!geometry.parkNode;
 $('plan-flow-estimate').disabled=false;$('plan-flow-result').hidden=true;$('plan-flow-result').textContent='';
 for(const id of ['step','auto','budget','economy','files'])$(id).disabled=true;
 for(const el of document.querySelectorAll('#tools button,#options input,#options select,#options button,#actions button'))el.disabled=true;
 notify('');updatePreview();$('plan-apply').focus({preventScroll:true});
}
function endPlan(apply){
 if(!pending)return;if(apply&&!checkCanSave()){notify(saveError,true);return;}const p=pending;pending=null;
 $('plan-review').hidden=true;
 for(const id of ['step','auto','budget','economy','files'])$(id).disabled=false;
 for(const el of document.querySelectorAll('#tools button'))el.disabled=false;
 if(apply){city=p.trial;draft=[];hover=null;selected={};refresh();if(['road','bus','upgrade','erase','junction'].includes(p.kind))comparePlan(p.before);if(save())notify('已确认 · '+p.title);else notify(saveError,true);}
 else {draft=[];hover=null;notify('蓝图已取消，未扣款');}
 showTools();updatePreview();hintDraft();canvas.focus({preventScroll:true});
}
$('plan-apply').onclick=()=>endPlan(true);
$('plan-cancel').onclick=()=>endPlan(false);
$('plan-flow-estimate').onclick=async()=>{
 const plan=pending,j=plan?.geometry.signalNode||plan?.geometry.parkNode;
 if(!j)return;
 const out=$('plan-flow-result'),btn=$('plan-flow-estimate'),net=effective||city.network;
 const descriptors=trips.filter(t=>t.kind!=='walker');
 const outbound=N.approaches(net,j).flatMap(e=>e.a===j?[[e.id,0]]:e.oneway?[]:[[e.id,1]]);
 const sig=city.signals,options={seed:17,maxVehicles:180,signal:true,profileMode:'high'};
 btn.disabled=true;out.hidden=false;
 out.textContent='正在用相同需求试跑。不会扣款或改写城市。';
 try{
  const scenarios=[Traffic.create(net,descriptors,{...options,signals:sig,parking:P.build(net,city.parking)}),
   Traffic.create(net,descriptors,{...options,signals:plan.trial.signals,parking:P.build(net,plan.trial.parking)})];
  let start=[],last=[],maxExit=[0,0],maxSpill=[0,0];
  for(let t=0;t<120;t+=2){
   if(pending!==plan)return;
   for(let i=0;i<2;i++)scenarios[i].step(2);
   if(t===28)start=scenarios.map(s=>s.stats());
   if(t>=30&&(t%6===0||t===118)){
    last=scenarios.map(s=>s.stats());
    last.forEach((s,i)=>{
     const q=outbound.reduce((a,[id,dir])=>a+(s.directions?.[id]?.[dir]?.queued||0),0);
     maxExit[i]=Math.max(maxExit[i],q);maxSpill[i]=Math.max(maxSpill[i],s.spillback);
    });
   }
   if(t%8===0)await new Promise(r=>setTimeout(r,0));
  }
  if(pending!==plan)return;
  const metrics=last.map((q,i)=>({
   offered:q.offered-start[i].offered,
   finished:q.completed-start[i].completed,
   wait:Math.round(q.waitSeconds+q.pendingSeconds-start[i].waitSeconds-start[i].pendingSeconds)
  }));
  const pair=(a,b)=>a+' → '+b;
  const summary='同城高峰试跑（预热 30 秒，观测 90 秒）：需求 '+pair(metrics[0].offered,metrics[1].offered)+'，完成 '+pair(metrics[0].finished,metrics[1].finished)+'，全城等候 '+pair(metrics[0].wait,metrics[1].wait)+' 车·秒；该路口下游最大队列 '+pair(maxExit[0],maxExit[1])+' 辆，回堵入口峰值 '+pair(maxSpill[0],maxSpill[1])+'。';
  const parking=last.every(s=>s.parking)?' 停车等候 '+pair(...last.map((q,i)=>Math.round(q.parking.wait-start[i].parking.wait)))+' 车·秒，成功停车 '+pair(...last.map((q,i)=>q.parking.served-start[i].parking.served))+' 辆。':'';
  out.textContent=summary+parking+(metrics[1].offered===0?' 没有可抽样的出行。':maxExit[1]>maxExit[0]?' 注意：下游队列变长。':'');
 }catch(err){if(pending===plan)out.textContent='未能完成试跑；蓝图没有改动。';console.warn(err);}
 finally{if(pending===plan)btn.disabled=false;}
};

function finish(){return withBuildCity(()=>finishWork());}
function finishWork(){
 if(pending)return;
 let r,geometry={points:[...draft],kind:tool};const trial=structuredClone(city);

 if(tool==='line'){
  r=T.addLine(trial.transit,{mode:opts.transitMode,stops:draft.map(x=>x.id)},transitOpts());
  if(r.ok)geometry.points=r.path;
 }else if(tool==='district'){
  r=D.add(trial.districts,{type:opts.districtType,points:draft},districtOpts());
  geometry.closed=true;
 }else if(tool==='bus'){
  const stops=draft.map(p=>p.id??N.splitAt(trial.network,p));
  if(stops.includes(null))return notify('有站点不在可用道路上',true);
  r=N.bus(trial.network,stops);
  if(r.ok){const bus=trial.network.buses.at(-1);geometry.points=bus.path.flatMap(v=>{const pts=trial.network.edges.find(e=>e.id===v.edge).pts;return v.reverse?[...pts].reverse():pts;});}
 }
 else if(tool==='frontage'){
  if(draft.length<2)return notify('先在同一条街或相接街段选择至少两点',true);
  geometry.points=draft.slice(1).flatMap((q,i)=>splitPathFollowing(draft[i],q).slice(i?1:0));
  r=C.zoneFrontage(trial.civic,{type:opts.zone,points:geometry.points,depth:opts.depth,side:opts.side,density:+opts.density,...roadOpts},roadsAt(),roadOpts);
 }else if(tool==='polygon'){
  if(draft.length<3)return notify('至少点三个角',true);if(!legalPolygon(draft))return notify('分区不能跨越河道或超出地图',true);
  geometry.closed=true;r=C.addZone(trial.civic,{type:opts.zone,polygon:draft,density:+opts.density,...roadOpts},roadsAt(),roadOpts);
 }
 if(!r?.ok)return notify(r?.reason||'操作未完成',true);
 if(trial.network.cash<(r.cost||0))return notify('市库不足 · 需要 ¥'+format.format(r.cost),true);
 trial.network.cash-=r.cost||0;
 beginPlan(trial,r,geometry,tool==='district'?D.TYPES[opts.districtType].name:toolNames[tool],tool,tool==='bus'||tool==='line'?'开通后计运营费':tool==='district'?'产出受地段和交通影响':(r.lots?.length||0)+' 个规划地块');
}
function trafficBefore(){return {cross:trafficStats.cross,unserved:trafficStats.unserved,drivers:trafficStats.drivers,bus:trafficStats.busRiders,broken:(effective||city.network).buses.filter(b=>b.broken).length};}
function comparePlan(before){const after=trafficBefore();comparison='路网改动前 → 后：未通达 '+before.unserved+' → '+after.unserved+'，开车 '+before.drivers+' → '+after.drivers+'，乘公交 '+before.bus+' → '+after.bus+(before.broken!==after.broken?'，暂停线路 '+before.broken+' → '+after.broken:'')+'。';stats();}
function roadDraft(end){
 const [first,control]=draft;
 const guide=opts.shape==='curve'&&control?control:null,points=N.plan(first,end,guide);
 const half=N.crossSection(N.profiles[opts.profile]).width*.5;
 const hit=points.some(p=>Math.abs(p.z||0)<2.5&&parkedLand(p,half));
 const r=hit?{ok:false,reason:'道路与停车设施冲突，先移除设施或改线'}:N.check(city.network,points,opts,[first,end]);
 const hits=new Map((r.hits||[]).filter(h=>N.dist(h.p,first)>2&&N.dist(h.p,end)>2).map(h=>[Math.round(h.p.x)+':'+Math.round(h.p.y),h.p]));
 const split=new Map((r.overpasses||[]).map(h=>[Math.round(h.p.x)+':'+Math.round(h.p.y),h]));
 return {r,geometry:{points,overpasses:[...split.values()],kind:'road',control:guide,snapped:!!(end.node||end.edge),junctions:[...hits.values()],width:N.crossSection(N.profiles[opts.profile]).width,valid:r.ok}};
}
function completeRoad(end){
 const {r,geometry}=roadDraft(end);
 if(!r.ok){updatePreview();return notify(r.reason,true);}
 const trial=structuredClone(city);
 const result=N.add(trial.network,geometry.points,opts,[draft[0],end]);
 const grade=geometry.points.at(-1).z-geometry.points[0].z;
 const info=Math.round(N.length(geometry.points))+' m'+(Math.abs(grade)>.5?' · 高差 '+(grade>0?'+':'')+Math.round(grade)+' m':'')+(geometry.junctions.length?' · 接入 '+geometry.junctions.length+' 处路口':'')+(geometry.overpasses.length?' · '+geometry.overpasses.length+' 处立体交叉（不接通）':'');
 beginPlan(trial,result,geometry,'铺设 '+N.profiles[opts.profile].name,'road',info);
}
function nearestAt(list,p,r=18){return list.filter(s=>Number.isFinite(s.x)&&N.dist(s,p)<r/camera.zoom).sort((a,b)=>N.dist(a,p)-N.dist(b,p))[0];}
function nearestPolyline(list,p,r=16){
 let best=null,d=r/camera.zoom;
 for(const l of list)for(let k=1;k<l.points.length;k++){const a=l.points[k-1],b=l.points[k],dx=b.x-a.x,dy=b.y-a.y,t=N.clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1),q=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(q<d){d=q;best=l;}}
 return best;
}
function trackPoint(p){
 const candidates=city.transit.tracks.filter(t=>t.mode===opts.trackMode).flatMap(t=>[t.points[0],t.points.at(-1)]).concat(city.transit.stations.filter(s=>T.FACILITIES[s.type]?.mode===opts.trackMode),T.gates(transitOpts()).filter(g=>g.mode===opts.trackMode));
 const q=nearestAt(candidates,p,20);
 return {x:q?.x??p.x,y:q?.y??p.y,z:opts.trackMode==='metro'?-12:(!draft.length?opts.trackStart:opts.trackEnd)};
}
function parkingHit(p){
 return city.parking.lots.find(l=>{
  const v=P.LOTS[l.type];return Math.abs(l.x-p.x)<=v.w/2+5/camera.zoom&&Math.abs(l.y-p.y)<=v.h/2+5/camera.zoom;
 });
}
function parkingCandidate(p){
 const occupied=[...city.civic.services,...city.transit.stations,...city.civic.lots.map(l=>({x:l.x,y:l.y,w:l.width||8,h:l.depth||8}))];
 return P.validate(city.parking,city.network,p,opts.parkingType,onLand,occupied);
}
function parkingOutline(p,spec){
 return [{x:p.x-spec.w/2,y:p.y-spec.h/2},{x:p.x+spec.w/2,y:p.y-spec.h/2},
  {x:p.x+spec.w/2,y:p.y+spec.h/2},{x:p.x-spec.w/2,y:p.y+spec.h/2}];
}
function parkingPlan(p,tr){
 const fee=P.validFee(opts.parkingFee);
 if(opts.parkingMode==='price'){
  const lot=parkingHit(p);
  if(!lot)return {reason:'请选择地图上的停车场或车库（路侧位不收费）'};
  const l=tr.parking.lots.find(x=>x.id===lot.id),spec=P.LOTS[l.type];
  if(l.fee===fee)return {reason:'这处设施已按相同费率收费'};
  l.fee=fee;
  return {r:{ok:true,cost:0},g:{points:parkingOutline(l,spec),closed:true,parkNode:P.access(city.network,l)?.node},
   title:'调整停车收费',more:spec.label+' · ¥'+lot.fee+' → ¥'+fee+'／次'};
 }
 const valid=parkingCandidate(p);
 if(!valid.ok)return {reason:valid.reason};
 const {spec,access}=valid,id='P'+tr.parking.next++;
 tr.parking.lots.push({id,type:opts.parkingType,x:p.x,y:p.y,fee});
 return {r:{ok:true,cost:spec.cost},g:{points:parkingOutline(p,spec),closed:true,parkNode:access.node},
   title:'建造'+spec.label,more:spec.slots+' 位 · 每月养护 ¥'+spec.monthly+' · 收费 ¥'+fee+'／次'};
}
function addInfraPlan(p){
 if(tool==='line')return joinStop(nearestAt(T.stopOptions(city.transit,opts.transitMode,transitOpts()),p,25));
 if(tool==='district'){if(draft.length>=48)return notify('特别区最多 48 个角',true);draft.push(p);return;}
 const tr=structuredClone(city);let r,g,title,more='';
 if(tool==='parking'){const spec=parkingPlan(p,tr);if(!spec.r)return notify(spec.reason,true);({r,g,title,more}=spec);}
 else if(tool==='station'){const f=T.FACILITIES[opts.stationType];r=T.addStation(tr.transit,{type:opts.stationType,...p},transitOpts());g={points:[p],kind:'service'};title=f.name;more='养护 ¥'+format.format(f.monthly)+'/月';}
 else if(tool==='signal'){
  const j=junction(p,2);if(!j)return notify('请点道路交叉口',true);
  const was=micro.signals().find(x=>x.node===j.id);
  if(opts.signalAction==='timing'){
   tr.signals[j.id]={enabled:true,ew:opts.signalEW/100,cycle:opts.signalCycle,offset:opts.signalOffset};
   r={ok:true,cost:was?360:900};
   title='设置路口信号配时';
   more='东西向时间配额 '+(was?Math.round(was.ew*100)+'% → ':'')+opts.signalEW+'% · 周期 '+opts.signalCycle+' 秒 · 相位 '+opts.signalOffset+' 秒';
  }else{tr.signals[j.id]=!was;r={ok:true,cost:was?0:900};title=was?'撤除交通信号':'安装交通信号';}
  g={points:[j],kind:'service',signalNode:j.id};
 }
 else if(tool==='track'||tool==='utility'){const q=tool==='track'?trackPoint(p):{...p,z:0};
  if(!draft.length){draft=[q];return;}
  const points=[draft[0],q];g={points,kind:tool==='track'?'road':'line'};
  if(tool==='track'){r=T.addTrack(tr.transit,{mode:opts.trackMode,points},transitOpts());title=T.MODES[opts.trackMode].name+'轨道';}
  else{r=U.add(tr.utilities,{type:opts.utilityType,points,budget:tr.network.cash});title=opts.utilityType==='water'?'铺设供水管':'铺设电网';}
 }
 if(!r?.ok)return notify(r?.reason||'无法建设',true);if(tr.network.cash<(r.cost||0))return notify('市库不足 · 需要 ¥'+format.format(r.cost),true);
 tr.network.cash-=r.cost||0;beginPlan(tr,r,g,title,tool,more);
}
function pointerAction(p){return withBuildCity(()=>pointerActionWork(p));}
function pointerActionWork(p){
 if(pending)return;
 if(tool==='junction'){const j=junction(p,2);if(!j)return notify('请选择有两段或以上道路的路口',true);turnNode=j.id;turnEnter=null;selected={junction:j.id};renderTurnEditor();return;}
 if(['utility','track','station','line','district','signal','parking'].includes(tool)){addInfraPlan(p);updatePreview();hintDraft();return;}
 if(tool==='road'){if(!draft.length){draft=[roadPoint(p,opts.startZ)];notify('已定起点；拖动地图不会落点');}else if(opts.shape==='curve'&&draft.length===1){draft.push(p);notify('已定控制点，点击终点');}else completeRoad(roadPoint(p,opts.endZ));}
 else if(tool==='polygon'){if(!onLand(p))return notify('只能在陆地分区',true);if(draft.length>=48)return notify('分区达到 48 点上限，请完成当前区域',true);draft.push(p);}
 else if(tool==='frontage'){let q=groundRoad(p);if(!q)return notify('请点击普通地面道路',true);if(draft.length>=32)return notify('请先完成此沿街分区',true);if(draft.length&&draft.at(-1).edge!==q.edge){let a=draft.at(-1),edges=city.network.edges;
  let e1=edges.find(e=>e.id===a.edge),e2=edges.find(e=>e.id===q.edge);let shared=[e1.a,e1.b].find(n=>n===e2.a||n===e2.b);
  if(!shared)return notify('请沿同一条路或通过相邻路口继续',true);
  const n=city.network.nodes.find(n=>n.id===shared);draft.push({...n,edge:e1.id,pos:shared===e1.a?0:e1.pts.length-1},{...n,edge:e2.id,pos:shared===e2.a?0:e2.pts.length-1});
 }draft.push(q);}
 else if(tool==='bus'){let q=junction(p);if(q&&!city.network.edges.some(e=>e.kind==='road'&&(e.a===q.id||e.b===q.id)))q=null;q=q||groundRoad(p);
 if(!q)return notify('请点普通道路上的站点位置',true);if(draft.some(v=>N.dist(v,q)<8))return notify('这个站点已在当前线路中',true);draft.push(q);notify('已添加第 '+draft.length+' 站');}
 else if(tool==='service'){
  if(!onLand(p))return notify('设施只能建在陆地',true);
  const trial=structuredClone(city),r=C.addService(trial.civic,{type:opts.service,...p,...roadOpts},roadsAt(),roadOpts);
  if(!r.ok)return notify(r.reason,true);
  if(trial.network.cash<r.cost)return notify('市库不足 · 需要 ¥'+format.format(r.cost),true);
  trial.network.cash-=r.cost;
  const def=C.SERVICES[opts.service],loc={...p,z:0};
  beginPlan(trial,r,{points:[loc],kind:'service'},'建设 '+(serviceNames[opts.service]||def.name),'service','养护 ¥'+format.format(def.monthly)+' / 月');
 }
 else if(tool==='inspect'){
  const lotPark=parkingHit(p);
  if(lotPark){selected={parking:lotPark.id};renderDetails();return;}
  if(layer==='parking'){
   const s=Object.values((liveQueues||micro?.stats())?.parking?.sites||{}).filter(x=>x.type==='curb');
   const curb=nearestAt(s,p,11);
   if(curb){selected={parking:curb.id};renderDetails();return;}
  }
  const du=city.districts.districts.find(q=>inPoly(p,q.points)),f0=nearestAt(city.transit.stations,p),u0=['water','power'].includes(layer)?nearestPolyline(city.utilities.lines.filter(l=>l.type===layer),p):null;
  const lot=city.civic.lots.filter(l=>l.level>0).sort((a,b)=>N.dist(a,p)-N.dist(b,p))[0];
  if(['traffic','parking'].includes(layer)){
   const road=edgeAt(p);if(road){selected={edge:road.id};renderDetails();return;}
  }
  if(f0||u0||du||lot&&N.dist(lot,p)<8/camera.zoom){selected=f0?{station:f0.id}:u0?{utility:u0.id}:du?{district:du.id}:{lot:lot.id};renderDetails();return;}
  const f=city.civic.services.find(s=>N.dist(s,p)<15/camera.zoom),z=city.civic.zones.find(z=>inPoly(p,z.polygon||z.poly||[])),e=edgeAt(p);
  selected=f?{service:f.id}:e?{edge:e.id}:z?{zone:z.id}:{};renderDetails();}
 else if(tool==='erase'||tool==='upgrade'){
   if(tool==='erase'){
    const parking=['traffic','parking'].includes(layer)&&parkingHit(p);
    if(parking){
     const t=structuredClone(city);t.parking.lots=t.parking.lots.filter(l=>l.id!==parking.id);const spec=P.LOTS[parking.type];
     beginPlan(t,{ok:true},{points:parkingOutline(parking,spec),closed:true,kind:'erase',parkNode:P.access(city.network,parking)?.node},'拆除'+spec.label,'erase','不返还造价，取消停车容量和月养护');return;
    }
    const u=['water','power'].includes(layer)&&nearestPolyline(city.utilities.lines.filter(l=>l.type===layer),p),d=layer==='districts'&&city.districts.districts.find(q=>inPoly(p,q.points)),st=layer==='routes'&&(nearestAt(city.transit.stations,p)||nearestPolyline(city.transit.tracks,p));
    if(u||d||st){const tr=structuredClone(city);let r=st?T.remove(tr.transit,st.id):{ok:u?U.remove(tr.utilities,u.id):D.remove(tr.districts,d.id).ok};const hit=u||d||st;beginPlan(tr,r,{points:hit.points||[hit],closed:!!d,kind:'erase'},'拆除 '+(d?'特别区':u?'水电线路':'枢纽／轨道'),'erase');return;}
   }
   const e=edgeAt(p);if(!e)return notify('未选中道路；请在相关图层上拆除设施',true);
   const trial=structuredClone(city);let r;
   if(tool==='erase'){N.remove(trial.network,e.id);r={ok:true};}
   else r=N.upgrade(trial.network,e.id,opts);
   const modified=trial.network.edges.find(q=>q.id===e.id),flipped=modified?.a!==e.a&&tool==='upgrade';
   const info=tool==='erase'?'可能切断公交与服务覆盖':flipped?'反转单行方向；失效的转向规则将移除':'仅在确认后更新道路';
   beginPlan(trial,r,{points:modified?.pts||e.pts,kind:tool,arrow:tool==='upgrade'&&modified?.oneway},tool==='erase'?'拆除道路':flipped?'反转单行方向':'道路改造',tool,info);
 }
 updatePreview();hintDraft();
}
function renderDetails(){
 const n=city.network,e=n.edges.find(e=>e.id===selected.edge),z=city.civic.zones.find(z=>z.id===selected.zone),f=city.civic.services.find(s=>s.id===selected.service);
 const txt=$('details');
 if(selected.parking){
  const lot=city.parking.lots.find(x=>x.id===selected.parking),site=(liveQueues||micro?.stats())?.parking?.sites?.[selected.parking];
  if(lot||site){
   const spec=lot&&P.LOTS[lot.type];
   txt.innerHTML=lines([['停车设施',spec?.label||'道路路侧位'],['车辆占用',site?site.occupied+' / '+site.capacity+' 位':'未接通'],
    ['现场收费','¥'+(lot?.fee||0)+'／次'],['月养护','¥'+(spec?.monthly||0)],['本轮已停',site?.visits||0]]);
   return;
  }
 }
 if(selected.station){const s=city.transit.stations.find(x=>x.id===selected.station),f=T.FACILITIES[s?.type];if(f){txt.innerHTML=lines([['枢纽',f.name],['养护','¥'+f.monthly],['道路接驳',hasRoad(s,92)?'已接驳':'缺道路'],['经过的线路',Object.values(transitMetrics.lines).filter(l=>l.points?.some(p=>p.id===s.id)).length]]);return;}}
 if(selected.utility){const u=utilityMetrics.lines[selected.utility];if(u){txt.innerHTML=lines([['线路',u.type==='water'?'水管':'电线'],['已连接源',u.connected?'是':'否'],['强度',Math.round((u.strength||0)*100)+'%'],['长度',Math.round(u.length)+' m']]);return;}}
 if(selected.district){const d=districtMetrics.districts[selected.district];if(d){txt.innerHTML=lines([['特别区',D.TYPES[d.type]?.name||'特别区'],['适宜度',Math.round(d.suitability*100)+'%'],['岗位',d.jobs],['产出',d.production],['净收入','¥'+format.format(d.net)],['状态',clean(d.reason)]]);return;}}
 if(selected.lot){const l=city.civic.lots.find(l=>l.id===selected.lot);if(l){const sec=E.sector(l),v=econ.lots[l.id],m=metrics.lots[l.id];txt.innerHTML=lines([['业态',sec.name],['容量',m?.capacity||0],['岗位',v?.jobs||0],['在岗',v?.employees||0],['人口',v?.population||0],['产出',Object.entries(v?.output||{}).map(([k,n])=>(E.PRODUCTS[k]?.name||k)+' '+format.format(n)).join('／')||'—'],['发展',m?.reason||'—']]);return;}}
 if(e){
  const heights=e.pts.map(p=>p.z),flow=liveQueues||micro?.stats(),q=flow?.directions?.[e.id]||[];
  const direction=(a,b)=>{
   const da=n.nodes.find(q=>q.id===a),db=n.nodes.find(q=>q.id===b);
   return da&&db?'向'+bearing(da,db):'—';
  };
  const parkingAt=id=>{
   const sites=Object.values(flow?.parking?.sites||{}).filter(x=>x.node===id);
   return [sites.reduce((n,s)=>n+s.occupied,0),sites.reduce((n,s)=>n+s.capacity,0)];
  };
  const detail=q.flatMap((v,i)=>{
   if(i&&e.oneway)return [];
   const name=i?direction(e.b,e.a):direction(e.a,e.b);
   const why=Object.entries(v.causes).sort((a,b)=>b[1]-a[1]).filter(x=>x[1]>0);
   return [[name+'排队',v.queued+' 辆 · '+Math.round(v.tail)+' m'],
    ...(['traffic','parking'].includes(layer)?[[name+'终点停车',parkingAt(i?e.a:e.b).join(' / ')+' 位']]:[]),
    ...(v.spill?[[name+'瓶颈','队尾已堵到入口']]:[]),
    ...(why.length?[[name+'主要原因',v.blockedBy?'下游 '+clean(v.blockedBy)+' 无入口空间':Traffic.causeNames[v.causes.parking?'parking':why[0][0]]]]:[])];
  });
  txt.innerHTML=lines([['道路',N.profiles[e.profile]?.name||'道路'],['长度',Math.round(e.len)+' m'],
   ['高程',Math.round(Math.min(...heights))+' → '+Math.round(Math.max(...heights))+' m'],['方向',e.oneway?'单行':'双向'],['公交专用',e.bus?'有':'无'],
   ['通行',(incident.closed||[]).includes(e.id)?'汛期临时封闭':'开放'],['在路车辆',(flow?.edgeOccupancy[e.id]||0)+' 辆'],...detail,
   ['通勤分配',Math.round(load[e.id]||0)+' 人／月'],...Object.entries(edgeFlows[e.id]||{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>[k,v+' 人'])]);
  return;
 }
 if(z){let lots=city.civic.lots.filter(l=>l.zoneId===z.id),list=[['用途',labels[z.type]||'分区'],['地块',lots.length],['已开发',lots.filter(l=>l.level>0).length],['最高等级',Math.max(0,...lots.map(l=>l.level))]];for(let k of serviceKeys().slice(0,7)){let m=lots.length?lots.reduce((s,l)=>s+(metrics.lots?.[l.id]?.[k]||0),0)/lots.length:0;list.push([serviceNames[k]||k,Math.round(m*100)+'%']);}txt.innerHTML=lines(list);return;}
 if(f){txt.innerHTML=lines([['设施',serviceNames[f.type]||'公共服务'],['预算',(city.civic.budgets?.[f.type]??100)+'%'],['作用',C.SERVICES[f.type]?.effect||'提供道路可达范围内的城市服务']]);return}
 txt.textContent='选择查阅并点击道路、建筑或设施。';
}
let preview=null;
function updatePreview(){return withBuildCity(()=>updatePreviewWork());}
function updatePreviewWork(){
 const guide=$('build-guide');
 const label=(message='',bad=false)=>{if(guide.textContent!==message)guide.textContent=message;guide.classList.toggle('bad',bad);guide.hidden=!message;};
 if(pending){label();preview=pending.geometry;return;}
 if(tool==='junction'){label();preview=turnPreview;return;}
 if(tool==='parking'&&hover&&opts.parkingMode==='build'){
  const r=parkingCandidate(hover),v=P.LOTS[opts.parkingType];
  preview={points:parkingOutline(hover,v),closed:true,valid:r.ok,kind:'parking'};
  label(r.ok?v.slots+' 位 · ¥'+format.format(v.cost)+' · 已连接地面道路':r.reason,!r.ok);return;
 }
 if(tool==='road'&&hover){
  const end=roadPoint(hover,draft.length?opts.endZ:opts.startZ);
  let anchor=end.node?'吸附路口':end.edge?'吸附已有道路':'';
  if(!draft.length){preview={points:[end],kind:'road',snapped:!!anchor};label('选起点'+(anchor?' · '+anchor:'')+' · '+Math.round(end.z)+' m');return;}
  if(opts.shape==='curve'&&draft.length===1){
   preview={points:[draft[0],hover],kind:'line'};label('点击放置控制点，再选终点');return;
  }
  const {r,geometry}=roadDraft(end);preview=geometry;
  label(r.ok?[Math.round(N.length(geometry.points))+' m','¥'+format.format(r.cost),anchor,geometry.junctions.length?geometry.junctions.length+' 处路口':'',geometry.overpasses.length?geometry.overpasses.length+' 处立体交叉（不接通）':''].filter(Boolean).join(' · '):r.reason,!r.ok);return;
 }
 if(draft.length){
  let pts=[...draft];if(hover&&['polygon','frontage','utility','track','district'].includes(tool))pts.push(tool==='track'?trackPoint(hover):tool==='frontage'?groundRoad(hover)||hover:hover);
  preview={points:pts,valid:true,kind:tool==='track'?'road':tool,closed:['polygon','district'].includes(tool)&&pts.length>2};label();return;
 }
 preview=hover&&tool==='service'?{points:[hover],valid:onLand(hover),kind:'service'}:null;label();
}
function showWorld(){
 const n=city.network,by=new Map();
 for(let l of city.civic.lots){if(!by.has(l.zoneId))by.set(l.zoneId,[]);if(l.level>0)by.get(l.zoneId).push({...l,w:l.width,d:l.depth});}
 return {...n,parking:city.parking.lots,buses:(effective||n).buses,utilities:city.utilities.lines,transit:city.transit,transitGates:T.gates(transitOpts()),roadGates:M.gates(mapId),districts:city.districts.districts,zones:city.civic.zones.map(z=>({...z,poly:z.polygon||z.poly||[],buildings:by.get(z.id)||[]})),services:city.civic.services.map(s=>({...s,radius:130}))};
}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const fingers=new Map();let touchGesture=null;
function screenPoint(x,y){const r=canvas.getBoundingClientRect();return {x:x-r.left,y:y-r.top};}
function touchCenter(){
 const a=[...fingers.values()],first=a[0],second=a[1]||first;
 return {x:(first.x+second.x)/2,y:(first.y+second.y)/2,d:Math.hypot(first.x-second.x,first.y-second.y)};
}
function beginTouch(moved=false){
 const c=touchCenter();
 touchGesture={...c,zoom:camera.zoom,world:view.screenToWorld(screenPoint(c.x,c.y),camera),moved:moved||fingers.size>1||panMode};
}
canvas.addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch'){
  fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
  beginTouch();if(touchGesture.moved){hover=null;updatePreview();}return;
 }
 if(e.button<0||e.button>2)return;
 const moved=e.button!==0||e.shiftKey||panMode;
 drag={id:e.pointerId,world:atPoint(e),x:e.clientX,y:e.clientY,moved};
 canvas.setPointerCapture(e.pointerId);
 if(moved){canvas.style.cursor='grabbing';hover=null;updatePreview();}

});
canvas.addEventListener('pointermove',e=>{
 if(fingers.has(e.pointerId)){
  fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const c=touchCenter(),g=touchGesture;
  if(g.moved||Math.hypot(c.x-g.x,c.y-g.y)>7){
   g.moved=true;hover=null;updatePreview();
   if(c.d>0&&g.d>0)camera.zoom=N.clamp(g.zoom*c.d/g.d,.53,3.2);
   const here=view.screenToWorld(screenPoint(c.x,c.y),camera);
   camera.x+=g.world.x-here.x;camera.y+=g.world.y-here.y;
  }return;
 }
 if(e.pointerType==='touch')return;
 if(drag&&drag.id===e.pointerId){
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<=5)return;
  drag.moved=true;canvas.style.cursor='grabbing';hover=null;
  const p=atPoint(e);camera.x+=drag.world.x-p.x;camera.y+=drag.world.y-p.y;updatePreview();
 }else{hover=atPoint(e);updatePreview();}
});
canvas.addEventListener('pointerleave',()=>{hover=null;updatePreview();});
function releasePointer(e,cancelled=false){
 if(fingers.has(e.pointerId)){
  const tap=!cancelled&&fingers.size===1&&!touchGesture.moved;
  fingers.delete(e.pointerId);
  if(fingers.size)beginTouch(true);else touchGesture=null;
  if(tap){canvas.focus({preventScroll:true});pointerAction(atPoint(e));}
 }else if(drag?.id===e.pointerId){
  const d=drag;drag=null;canvas.style.cursor=panMode?'grab':'';
  if(!cancelled&&!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<=5){
   hover=atPoint(e);canvas.focus({preventScroll:true});pointerAction(hover);
  }else updatePreview();
 }
}
canvas.addEventListener('pointerup',e=>releasePointer(e));canvas.addEventListener('pointercancel',e=>releasePointer(e,true));
canvas.addEventListener('lostpointercapture',e=>{if(fingers.has(e.pointerId)||drag?.id===e.pointerId)releasePointer(e,true);});
function zoom(z){camera.zoom=N.clamp(camera.zoom*z,.53,3.2);}
canvas.addEventListener('wheel',e=>{e.preventDefault();let a=atPoint(e);zoom(Math.exp(-e.deltaY*.0015));let b=atPoint(e);camera.x+=a.x-b.x;camera.y+=a.y-b.y;},{passive:false});
$('pan').onclick=()=>{panMode=!panMode;$('pan').setAttribute('aria-pressed',String(panMode));canvas.style.cursor=panMode?'grab':'';};
$('zoom-in').onclick=()=>zoom(1.25);$('zoom-out').onclick=()=>zoom(.8);$('home').onclick=()=>{camera={x:600,y:400,zoom:1};};
let menuChild='',menuDestination=null;
const pauseDialog=$('pause-dialog'),settingsDialog=$('game-settings');
const lobbyURL=location.protocol==='file:'&&location.pathname.includes('试玩.html')?'https://www.weili.space/game/city/':'../index.html';
function modalOpen(){return !!document.querySelector('dialog[open]');}
function clearLeave(){menuDestination=null;$('menu-leave-confirm').hidden=true;}
function openMenu(){
 if(modalOpen())return;
 clearLeave();$('menu-status').textContent='';$('pause-location').textContent=map.name+' · '+(sandbox?'规划沙盒':'经营模式')+' · 第 '+city.month+' 月';
 pauseDialog.showModal();$('resume-game').focus({preventScroll:true});
}
$('hall').onclick=openMenu;
$('resume-game').onclick=()=>{pauseDialog.close();canvas.focus({preventScroll:true});};
pauseDialog.addEventListener('close',()=>{clearLeave();lastAuto=performance.now();});
$('menu-save').onclick=()=>{$('menu-status').textContent=save()?'当前进度已保存。':saveError;};
function requestLeave(url){
 if(pending||batch?.items.length||draft.length){menuDestination=url;$('menu-leave-confirm').hidden=false;$('menu-leave-cancel').focus();return;}
 leaveGame(url);
}
function leaveGame(url){
 if(!save()){$('menu-status').textContent=saveError+' 未离开游戏。';return;}
 batch=null;location.assign(url);
}
$('menu-lobby').onclick=()=>requestLeave(lobbyURL);
$('menu-website').onclick=()=>requestLeave('https://www.weili.space/');
$('menu-leave-cancel').onclick=()=>{clearLeave();$('menu-lobby').focus();};
$('menu-leave-apply').onclick=()=>{const target=menuDestination;if(target)leaveGame(target);};
function switchMenuChild(id){menuChild=id;pauseDialog.close();$(id).showModal();}
$('menu-files').onclick=()=>switchMenuChild('file-dialog');
$('menu-settings').onclick=()=>{
 $('motion-in-game').checked=animate;$('default-layer').innerHTML=$('layer').innerHTML;
 $('default-layer').value=Object.hasOwn(layers,prefs.overlay)?prefs.overlay:'none';$('settings-status').textContent='';
 switchMenuChild('game-settings');
};
function saveGameSettings(){
 animate=$('motion-in-game').checked;prefs={...prefs,motion:animate,overlay:$('default-layer').value};
 try{localStorage.setItem(prefKey,JSON.stringify(prefs));$('settings-status').textContent='设置已保存。';}
 catch{$('settings-status').textContent='设置只在本次游戏生效，浏览器未允许保存。';}
}
$('motion-in-game').onchange=saveGameSettings;$('default-layer').onchange=saveGameSettings;
$('settings-back').onclick=()=>settingsDialog.close();
for(const id of ['file-dialog','game-settings'])$(id).addEventListener('close',()=>{lastAuto=performance.now();if(menuChild===id){menuChild='';openMenu();}});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){
  if(pauseDialog.open){e.preventDefault();if(menuDestination)clearLeave();else $('resume-game').click();return;}
  if(modalOpen())return; // Browser closes the foreground dialog only.
  e.preventDefault();
  if(pending){endPlan(false);return;}
  if(turnNode&&tool==='junction'){turnNode=null;turnEnter=null;turnPreview=null;selected={};renderTurnEditor();updatePreview();return;}
  if(draft.length){draft=[];selected={};hintDraft();updatePreview();renderDetails();return;}
  openMenu();return;
 }
 if(pending||modalOpen()||e.target.matches('input,select,button'))return;
 if(e.key==='Enter'&&['bus','polygon','frontage','district','line'].includes(tool)){e.preventDefault();finish();}
 if(e.key.startsWith('Arrow')){e.preventDefault();camera.x+=e.key==='ArrowRight'?32:e.key==='ArrowLeft'?-32:0;camera.y+=e.key==='ArrowDown'?32:e.key==='ArrowUp'?-32:0;}
});
function budgetInfo(){
 const f=city.finance,t=metrics.totals||{};$('tax').value=f.tax;$('frequency').value=f.frequency;
 $('budget-info').innerHTML=lines([['税收','¥'+format.format(t.income||0)],['公共设施','−¥'+format.format(t.expense||0)],['道路养护','−¥'+format.format(forecast.road)],['停车设施养护','−¥'+format.format(forecast.parking)],['公交运营','−¥'+format.format(forecast.bus)],['水电线养护','−¥'+format.format(forecast.infra)],['铁路港航净额','¥'+format.format(forecast.transit)],['特别区净额','¥'+format.format(forecast.district)],['对外公路净额','¥'+format.format(forecast.regionalNet)],['供货与产出税差','¥'+format.format(forecast.chains)],['发展补助','¥'+format.format(grant)],['本金／利息','−¥'+format.format(forecast.principal)+'／¥'+format.format(forecast.interest)],['借款余额','¥'+format.format(f.debt)],['月结预测','¥'+format.format(forecast.net)]]);
 $('loan-take').disabled=f.debt>0;$('loan-repay').disabled=f.debt<=0||city.network.cash<f.debt;
}
$('budget').onclick=()=>{budgetInfo();$('budget-dialog').showModal();};
$('tax-apply').onclick=()=>{city.finance.tax=N.clamp(Math.round(+$('tax').value||9),5,16);city.finance.frequency=$('frequency').value==='frequent'?'frequent':'normal';refresh();save();budgetInfo();};
$('loan-take').onclick=()=>{if(city.finance.debt)return;city.finance.debt=40000;city.network.cash+=40000;refresh();save();budgetInfo();};
$('loan-repay').onclick=()=>{const debt=city.finance.debt;if(city.network.cash<debt||debt<=0)return;city.finance.debt=0;city.network.cash-=debt;refresh();save();budgetInfo();};
$('budget-close').onclick=()=>$('budget-dialog').close();
function policyView(){
 const name=$('sector-policy').value,p=city.economy.policies?.[name];$('stance').value=p?.stance||'neutral';$('sector-tax').value=p?.tax??'';
 const table=Object.entries(econ.products||{}).map(([id,v])=>'<tr><td>'+clean(E.PRODUCTS[id]?.name||id)+'</td><td>'+format.format(v.output??v.production??0)+'</td><td>'+format.format(v.demand||0)+'</td><td>'+format.format(v.shortage??v.unmet??0)+'</td></tr>').join('');
 $('product-table').innerHTML='<table><tr><th>产品</th><th>产出</th><th>需求</th><th>缺口</th></tr>'+table+'</table>';
}
$('sector-policy').innerHTML=Object.entries(E.SECTORS).map(([id,k])=>'<option value="'+id+'">'+clean(k.name)+'</option>').join('');
$('sector-policy').onchange=policyView;$('sector-apply').onclick=()=>{const v=$('sector-tax').value;E.setPolicy(city.economy,$('sector-policy').value,{stance:$('stance').value,tax:v===''?null:+v});refresh();save();policyView();};$('economy').onclick=()=>{policyView();$('economy-dialog').showModal()};$('economy-close').onclick=()=>$('economy-dialog').close();
$('files').onclick=()=>$('file-dialog').showModal();$('close').onclick=()=>$('file-dialog').close();$('save-warning-open').onclick=()=>{if(!modalOpen())$('file-dialog').showModal();};
function confirmAction(label,fn){
 if(recoveryRaw!==null)label='原存档将被替换。请先导出原始存档。'+label;
 if($('file-status').textContent!==label){$('file-status').textContent=label;return}
 if(!checkCanSave(true)||!fn()){$('file-status').textContent=saveError;return;}
 $('file-status').textContent='操作已完成。';$('file-dialog').close();
}
$('blank').onclick=()=>confirmAction('再点「清空重建」确认。请先导出要保留的城市。',()=>{const s=stateStore.make();s.network.cash=sandbox?2600000:Math.max(105000,map.cash-15000);s.utilities=U.create({legacy:false});return changeCity(s)});$('starter').onclick=()=>confirmAction('再点「载入示例城」确认。请先导出当前进度。',()=>changeCity(starter()));
function downloadSave(raw,name,type='application/json'){
 let url=URL.createObjectURL(new Blob([raw],{type}));let a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function updateRawExport(){
 $('export-raw').hidden=recoveryRaw===null;
 $('raw-explain').hidden=recoveryRaw===null;
}
$('export').onclick=()=>downloadSave(JSON.stringify(city),'city-blueprint-'+mapId+'.json');
$('export-raw').onclick=()=>{if(recoveryRaw!==null)downloadSave(recoveryRaw,'city-blueprint-'+mapId+'-recovery.txt','application/octet-stream');};

$('import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>4000000)throw Error('文件过大');const s=stateStore.restore(JSON.parse(await file.text()));if(!window.confirm(recoveryRaw!==null?'用这个存档替换当前无法读取的原存档？请确认已导出原始备份。':'用这个存档替换当前城市？'))return;if(!changeCity(s))throw Error(saveError);$('file-status').textContent='已载入并保存。';}catch(x){$('file-status').textContent='导入失败：'+x.message;}finally{e.target.value='';}};
let nextStats=0,liveQueues=null;let lastFrame=0,lastSignature='',lastWorld=null,lastPreview=null,lastSelection=null,animate=prefs.motion!==false;
FlowUI.attach();
function scene(now){
 if(!previous)previous=now;const modal=modalOpen(),elapsed=Math.min(75,now-previous);
 if(!modal&&!pending&&!batch){flowClock+=elapsed;micro?.step(elapsed/1000);if(animate)clock+=elapsed;}
 previous=now;
 if(!modal&&!pending&&!batch&&playing&&now-lastAuto>3100&&checkCanSave()){lastAuto=now;const paid=tick();if(paid.length)notify('市政委托完成 · 拨款 ¥'+format.format(paid.reduce((s,p)=>s+p.reward,0)));}else if(!playing||pending||batch||modal)lastAuto=now;
 view.resize();const sig=[camera.x,camera.y,camera.zoom,layer,tool,view.width,view.height].join('|');
 const visualWorld=batch?.scene||sceneWorld;
 const changed=sig!==lastSignature||lastWorld!==visualWorld||lastPreview!==preview||lastSelection!==selected;
 const diagnostics=!modal&&(['traffic','parking'].includes(layer)||Boolean(selected.edge||selected.parking)||!liveQueues)&&now>=nextStats;
 if(diagnostics){liveQueues=micro?.stats();nextStats=now+350;renderFlow(liveQueues);if(selected.edge||selected.parking)renderDetails();}
 if(!changed&&!diagnostics&&(modal||!animate||now-lastFrame<1000/30)){window.requestAnimationFrame(scene);return;}
 lastFrame=now;lastSignature=sig;lastWorld=visualWorld;lastPreview=preview;lastSelection=selected;
 const actors=getAgents(clock);
 view.render(visualWorld,{camera,overlay:layer,preview,selected,batchGhosts:batch?.ghosts,agents:actors,metrics:{...metrics,edgeTraffic,coverageGrid,closed:incident.closed||[],utilityMetrics,transitMetrics,districtMetrics,queue:liveQueues,signals:micro?.signals()},tool},clock);window.requestAnimationFrame(scene);}
showTools();refresh();updateRawExport();if(recoveryRaw!==null)reportSaveProblem(recoveryHint);window.requestAnimationFrame(scene);
 if(new URLSearchParams(location.search).get('menu')==='saves')$('file-dialog').showModal();
window.Blueprint={batch:()=>batch&&({count:batch.items.length,cash:batch.world.network.cash}),preview:()=>preview,world:()=>city, metrics:()=>metrics,traffic:()=>trafficStats,view,camera:()=>({...camera}),setLayer,save,plan:()=>pending&&{title:pending.title,cost:pending.cash},forecast:()=>({...forecast}),incident:()=>incident,trafficSim:()=>micro?.stats(),map:()=>mapId,utility:()=>utilityMetrics,transit:()=>transitMetrics,districts:()=>districtMetrics,economy:()=>econ,agents:()=>getAgents(clock),coverage:()=>coverageGrid};
})();
