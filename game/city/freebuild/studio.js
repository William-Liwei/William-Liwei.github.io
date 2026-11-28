'use strict';
(()=>{
const SL=SystemLedger,CL=CampusLife,PL=ParkLife,CR=Careers,WB=Wellbeing,H=CargoLogistics,HG=CargoGateways,V=MunicipalFinance,W=MarketCycle,B=CityBalance,G=Progression,R=SocialCare,X=IndustryAreas,F=TerrainWork,Z=RoadsideZoning,S=TransitService,L=Labor,K=CareServices,J=Justice,Q=Education,I=CivicIncidents,A=ActiveTravel,P=Parking,N=Network,C=Civic,U=Utilities,T=Transit,E=Economy,D=Districts,M=CityMaps,$=s=>document.getElementById(s);
const parameters=new URLSearchParams(location.search),map=M.select(parameters.get('map')),mapId=map.id,sandbox=parameters.get('mode')==='sandbox',startDifficulty=parameters.get('difficulty')==='challenge'?'challenge':'standard';
const systemContext='city-'+mapId+(sandbox?'-sandbox':'-career'),scenarioRunner=parameters.get('ledger-runner')==='1'&&parent!==window;
let scenarioOverride=null,scenarioControl='';
const canvas=$('map'),view=new CityView(canvas,{width:1200,height:800}),storeKey=M.storage(mapId,sandbox),prefKey='city.blueprint.settings.1',format=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0});
let prefs={};if(!scenarioRunner)try{prefs=JSON.parse(localStorage.getItem(prefKey))||{};localStorage.setItem('city.blueprint.map.1',mapId);localStorage.setItem('city.blueprint.mode.1',sandbox?'sandbox':'career')}catch{}
$('map-name').textContent=map.name;document.querySelector('.brand p').textContent=(sandbox?'规划沙盒':'自由经营')+' · '+map.name;
const serviceNames={fire:'消防',police:'警务',water:'供水',power:'电力',health:'医疗',clinic:'医疗',education:'教育',school:'教育',waste:'环卫站',park:'绿地',library:'图书馆',plaza:'市民广场',logistics:'物流中心'};
const labels={residential:'住宅',commercial:'商业',office:'办公',industrial:'工业'};
const techLabels={earthworks:'整地',arterial:'六/八车道路',signals:'交通信号',highway:'高速公路',bridge:'高架与桥梁',tunnel:'隧道',tram:'有轨电车',busLane:'公交专用车道',metro:'地铁',rail:'客运铁路',cargoRail:'货运铁路',cargoPort:'货运港口',cargoYard:'货物转运场',airport:'客运机场',cargoAirport:'货运机场',vocational:'职业学校',research:'科研院所',university:'大学',universityArea:'大学特别区',hospital:'综合医院',elder:'养老院',crematorium:'火葬场',industryProcessor:'产业加工厂',industryStorage:'产业仓库',mine:'采矿区',oil:'石油区',industryIntensive:'集约采集政策'};
const defaults={campusDistrict:'',campusAsset:'engineering',parkDistrict:'',parkMode:'asset',parkAsset:'gate',parkPath:'trail',socialType:"cemetery",industryKind:"extractor",earthMode:"level",earthRadius:42,earthAmount:5,earthTarget:10,earthSmooth:60,frontageMode:"route",careType:"fire",justiceType:"police",schoolType:'primary',schoolFunding:100,activeType:'sidewalk',activeAction:'build',activeHeight:6,activeApproach:'stairs',profile:'r2',oneway:false,bus:false,startZ:0,endZ:0,shape:'line',signalAction:'switch',signalEW:50,signalCycle:26,signalOffset:0,parkingType:'small',parkingFee:0,parkingMode:'build',snap:true,flip:false,zone:'residential',density:2,depth:38,side:'both',service:'fire',utilityType:'water',stationType:'tramStop',trackMode:'tram',trackStart:0,trackEnd:0,transitMode:'tram',districtType:'farm'};
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
function careerProduction(v,month){
 if(v?.month!==month)return {month:0,products:{}};
 const n=x=>Math.round((Number.isFinite(x)?Math.max(-1e8,Math.min(1e8,x)):0)*100)/100;
 return {month,products:Object.fromEntries(Object.entries(E.PRODUCTS).map(([k])=>{
  const q=v.products?.[k];return [k,{output:n(q?.output),neutral:n(q?.neutral),delta:n(q?.delta)}];
 }))};
}
function restoreWellbeingApplied(v,month){
 if(v?.month!==month)return {month:0,byLot:{}};
 return {month,byLot:Object.fromEntries(Object.entries(v.byLot||{}).slice(0,4000).filter(([,q])=>q&&[q.extra,q.before,q.base,q.actual].every(x=>Number.isFinite(x)&&Math.abs(x)<=10000)))};
}
const stateStore={make:()=>({version:1,network:N.create(),civic:C.create(17),mapId,sandbox,utilities:U.create(),transit:T.create(),districts:D.create(),economy:E.create(),parking:P.normalize(),activeTravel:A.create(),civicEvents:I.create(44017),education:Q.create(mapId),justice:J.create(mapId),care:K.create(mapId),labor:L.create(mapId),transitService:S.normalize(),terrain:F.create(mapId),industry:X.create(mapId),social:R.create(mapId),progression:G.create({mapId,sandbox}),balance:B.create({sandbox,mode:startDifficulty}),market:W.create(mapId),cargo:H.create(mapId),wellbeing:WB.create(mapId),careers:CR.create(mapId),parks:PL.create(mapId),campus:CL.create(mapId),systemLedger:SL.create(systemContext),careerProduction:{month:0,products:{}},wellbeingApplied:{month:0,byLot:{}},credit:V.create({month:1}),signals:{},month:1,contracts:{},history:[],finance:{tax:9,debt:0,frequency:"normal"}}),restore(raw){
 if(raw?.version!==1||!Array.isArray(raw.network?.edges)||!Array.isArray(raw.network?.nodes)||!Array.isArray(raw.network?.buses)||!Array.isArray(raw.civic?.lots)||!Array.isArray(raw.civic?.zones)||!Array.isArray(raw.civic?.services)||!Number.isInteger(raw.month)||raw.month<1||!Number.isFinite(raw.network.cash)||!Number.isInteger(raw.network.next))throw Error('不兼容的城市存档');
 if((raw.mapId||'river')!==mapId||!!raw.sandbox!==sandbox)throw Error('此存档属于其他地图或模式，请先从大厅切换。');
 raw.mapId=mapId;
 const u=raw.utilities?U.restore(raw.utilities):U.create(), tt=raw.transit?T.normalize(raw.transit,{water:N.water}):T.create(), dd=raw.districts?D.normalize(raw.districts,{mapId,water:N.water,isBuildable:p=>M.land(p)}):D.create(), ee=raw.economy?E.restore(raw.economy):E.create();
 if(!u||!tt||!dd||!ee)throw Error('水电、交通、特别分区或产业存档无效');
 Object.assign(raw,{utilities:u,transit:tt,districts:dd,economy:ee,parking:P.normalize(raw.parking),activeTravel:A.normalize(raw.activeTravel),civicEvents:I.normalize(raw.civicEvents,44017),education:Q.normalize(raw.education,mapId),justice:J.normalize(raw.justice,mapId),care:K.normalize(raw.care,mapId),labor:L.normalize(raw.labor,mapId),transitService:(S.sanitize||S.normalize)(raw.transitService),terrain:F.normalize(raw.terrain,mapId),industry:X.normalize(raw.industry,mapId),social:R.normalize(raw.social,mapId),progression:G.normalize(raw.progression,{mapId,sandbox,...(!raw.progression?{legacy:true}:{})}),balance:B.normalize(raw.balance,{sandbox,...(!raw.balance?{legacy:true}:{})}),market:W.normalize(raw.market,mapId),cargo:H.normalize(raw.cargo,mapId),wellbeing:WB.normalize(raw.wellbeing,mapId),careers:CR.normalize(raw.careers,mapId),parks:PL.normalize(raw.parks,mapId),campus:CL.normalize(raw.campus,mapId),systemLedger:SL.normalize(raw.systemLedger,systemContext),careerProduction:careerProduction(raw.careerProduction,raw.month),wellbeingApplied:restoreWellbeingApplied(raw.wellbeingApplied,raw.month),credit:V.normalize(raw.credit,{legacyDebt:raw.finance?.debt,month:raw.month}),signals:normalizeSignals(raw.signals,raw.network.nodes)});
 const {nodes,edges,buses}=raw.network;
 if(nodes.length>1500||edges.length>1800||buses.length>200||raw.civic.lots.length>4000)throw Error('存档规模超出预览版上限');
 const ids=new Set();for(let n of nodes){if(typeof n.id!=='string'||ids.has(n.id)||![n.x,n.y,n.z].every(Number.isFinite))throw Error('无效节点');ids.add(n.id)}
 const eids=new Set();for(let e of edges){if(typeof e.id!=='string'||eids.has(e.id)||!ids.has(e.a)||!ids.has(e.b)||!Array.isArray(e.pts)||e.pts.length<2||e.pts.length>500||!e.pts.every(p=>[p.x,p.y,p.z].every(Number.isFinite))||![2,3,4,6,8].includes(e.lanes)||!['road','highway','ramp'].includes(e.kind)||!Number.isFinite(e.speed)||e.speed<1)throw Error('无效道路');e.len=N.length(e.pts);eids.add(e.id);}
 if(buses.some(b=>!/^B[0-9]+$/.test(b.id)||!Array.isArray(b.stops)||b.stops.length<2||!b.stops.every(s=>ids.has(s)))||raw.civic.lots.some(l=>!Number.isFinite(l.x)||!Number.isFinite(l.y)||!Object.hasOwn(labels,l.type))||raw.civic.services.some(s=>!Number.isFinite(s.x)||!Number.isFinite(s.y)))throw Error('无效设施或地块');
 raw.finance={tax:N.clamp(Math.round(+raw.finance?.tax||9),5,16),debt:V.report(raw.credit).debt,frequency:raw.finance?.frequency==="frequent"?"frequent":"normal"};
 raw.network.turns=N.normalizedTurns(raw.network);
 U.bootstrap(raw.utilities,raw.civic,N.mapRoads(raw.network));
 N.rebuildBuses(raw.network);
 raw.contracts=Object.fromEntries(Object.entries(raw.contracts||{}).filter(([k,v])=>Contracts.ids.includes(k)&&Number.isInteger(v)&&v>0&&v<=raw.month));
 raw.history=Array.isArray(raw.history)?raw.history.slice(-18).filter(r=>r&&[r.month,r.pop,r.net,r.bus].every(Number.isFinite)):[];
 return raw;
}};
const onLand=p=>M.land(p);
const landSurface={...map,mapWidth:1200,mapHeight:800};
const terrainActive=()=>!!map.elevation||!!city?.terrain?.revision;
const parkedLand=(p,pad=0)=>city?.parking?.lots.some(l=>{
 const d=P.LOTS[l.type];return Math.abs(l.x-p.x)<d.w/2+pad&&Math.abs(l.y-p.y)<d.h/2+pad;
});
const campusLand=(p,pad=0)=>city?.education?.sites.some(s=>{const q=Q.TYPES[s.type];return Math.abs(p.x-s.x)<q.width/2+pad&&Math.abs(p.y-s.y)<q.depth/2+pad;});
const justiceLand=(p,pad=0)=>city?.justice?.sites.some(s=>{const q=J.TYPES[s.type];return !!q&&Math.abs(p.x-s.x)<q.width/2+pad&&Math.abs(p.y-s.y)<q.depth/2+pad;});
const careLand=(p,pad=0)=>city?.care?.sites.some(s=>{const q=K.TYPES[s.type];return !!q&&Math.abs(p.x-s.x)<q.width/2+pad&&Math.abs(p.y-s.y)<q.depth/2+pad;});
const socialLand=(p,pad=0)=>city?.social?.sites.some(s=>{const q=R.TYPES[s.type];return Math.abs(p.x-s.x)<q.width/2+pad&&Math.abs(p.y-s.y)<q.depth/2+pad;});
const roadOpts={isBuildable:p=>onLand(p)&&!parkedLand(p,2.5)&&!campusLand(p,3)&&!justiceLand(p,3)&&!careLand(p,3)&&!socialLand(p,3)};
let serviceOps=null,serviceClock=0,serviceOwner=null,serviceStopMarks=[],serviceNumbers=0,lastServiceMonth=null;
let industryReport=null,socialReport=null,selectedTile=null,progressLayerCache=null;
let coverageGrid=null,sceneWorld=null,edgeTraffic={},pending=null,utilityMetrics=null,regional=null,transitMetrics=null,districtMetrics=null,econ=null,micro=null,pedestrians=null;
let opts={...defaults},tool='road',draft=[],hover=null,selected={},layer='none',playing=false,forecast=null,metrics={},load={},trips=[],city=null;
let renderer3d=null,mode3d=false,orbitTouch=false,scenePrefs={};
try{scenePrefs=JSON.parse(localStorage.getItem('city.blueprint.scene.1'))||{}}catch{}
let camera={x:600,y:400,zoom:1}, drag=null,panMode=false, lastAuto=0, clock=0, previous=0;
function starter(){
 if(mapId==='alpine'){const a=stateStore.make();a.network.cash=sandbox?2600000:map.cash;N.add(a.network,N.plan({x:8,y:470,z:0},{x:205,y:470,z:0}),{profile:'r2'});return a;}
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
 if(scenarioRunner)return true;
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
 if(scenarioRunner)return true;
 if(!checkCanSave(replacing))return false;
 try{
  if(!replacing&&serviceOps&&serviceOwner===city&&(next===city||next.transitService===city.transitService||JSON.stringify(next.transitService)===JSON.stringify(city.transitService)))next.transitService=serviceOps.snapshot();
  const saved=JSON.stringify(next);
  localStorage.setItem(storeKey,saved);lastStored=saved;recoveryRaw=null;updateRawExport();reportSaveProblem('');return true;
 }catch{reportSaveProblem('保存失败：浏览器无法写入本机存档，请先导出 JSON。');return false;}
}
window.addEventListener('storage',e=>{
 if((e.key===storeKey||e.key===null)&&e.newValue!==lastStored)checkCanSave();
});
function notify(msg,bad=false){$('notice').textContent=msg;$('notice').classList.toggle('bad',bad);clearTimeout(notify.timer);if(msg)notify.timer=setTimeout(()=>{$('notice').textContent=''},5300)}
function loadCity(){
 if(scenarioRunner)return stateStore.make();
 try{lastStored=localStorage.getItem(storeKey);}catch{return starter();}
 if(lastStored===null)return starter();
 try{return stateStore.restore(JSON.parse(lastStored));}
 catch{recoveryRaw=lastStored;return starter();}
}
city=loadCity();
function changeCity(s){if(batch)return false;if(!save(s,true))return false;city=s;comparison=null;draft=[];selected={};playing=false;flowKey='';flowClock=0;showTools();$('auto').setAttribute('aria-pressed','false');$('auto').textContent='▶';refresh();return true;}
const help={campusLife:'在大学区内建设绑定的大学主楼，再放置配套。校内设施须与大学主楼有实际步行连通，且有合格工作人员。',parkLife:'先画特别公园区；在右侧公园管理启用。建入口，铺数段相通步道，再在步道旁放设施。各项施工均可先放入批量蓝图。',landTitle:"点击地块查看报价，只有与已拥有地块共享边的地块可买。购买也能加入批量蓝图，再接着规划施工。",social:"墓园与火葬场承接真实死亡事件；家庭和养老设施提供有限名额，研究所需要可通勤的合格工作人员。",industry:"先划一个特别产业区，再把采集站、加工厂或仓库建在该区内。加工和出货要用接通的道路、工人、以及必要的水电。",earth:"选择整地方式，指向地图看报价，点击加入蓝图。现有道路、轨道、已开发地块、水域及保护山脊不会被改动。",taxiDepot:"出租车队须有普通道路出入口。有限车辆要先到乘客处接人，再沿合法路线送达；右侧公共交通运营可试叫一辆。",careBuild:"消防队需要装备补给；诊所处理急症，重症按可达道路转到医院，社区中心只为可达住区提供有限走访。",justiceBuild:"建设后由警务、法院和监狱分别处理不同阶段。设施要有普通道路；市政厅可切换政策。返回右侧图层查看拥堵在哪一环。",schoolBuild:'选校种，在普通道路或人行道旁选一块陆地。学位有限，学生必须有通学路线；推进一月才更新实际入学。',active:'选择步行道、自行车道或人行天桥，再点起终点。立体天桥两端要能走到地面，不能作为机动车捷径。也可以用试走检查真正可达。',parking:'普通道路自带有限路侧位，私家车按同一到达节点找位，公交和货车不占位。选择建造或调整收费。别让收费车库挡住路面或占到旧地块。',junction:'点地图上的路口，再选择驶入方向。勾选要禁止的出口；应用后先审核蓝图，不会直接改路。转向规则影响汽车、货车和道路公交，不影响步行。',utility:'选水管或电线，沿地面点起点和终点；同类线相交即接通。可建独立支线，水电不会互串。首次编辑每一类网络会启用真实供给。',station:'先建有道路接驳的车站、港口、机场或车辆段。码头和船坞需要岸边，机场需要完整的陆地跑道。',track:'选地面铁路、地铁或电车轨道，在地图点起点和终点；端点贴近已有轨道、对应站点或车辆段才能接通。地面铁路可接东西边界口。',line:'选择运输方式和站点，依次加入。铁路、地铁、电车需要接通对应车辆段；轮渡和货轮必须有连续水域；飞机可选图外航点。',district:'选择独立特别分区，先打开资源图层找合适位置，然后点至少三个角。资源与运输条件共同决定产出。',signal:'点路口切换信号，或自定东西向时间配额、周期与相位。提高某向配额会压缩另一向；下游没空间时，绿灯也不会放行。',road:'直线点起终点；曲线依次点起点、控制点、终点。可分别调起终点高程。红色预览不可建设，选择「不吸附」可自由落点。',upgrade:'先选新断面，再点击现有同类型道路。单行方向按原路绘制方向。',bus:'按发车顺序在普通道路上点至少两个站，可选路口或路段中间。系统沿可行车方向闭环，遇单行须有回程。',frontage:'选两点自动沿相连普通街道，或点对角框选区域内的街道。可选侧向、纵深、密度；方框不生成独立分区。',polygon:'在地图点至少三个角，完成后按按钮或 Enter。区域不限栅格，地块仍需接近地面道路才能成长。',service:'选择设施，再点地图放置；设施须靠近可服务道路。可在此调服务预算，右侧图层检查实际覆盖。',inspect:'点道路、设施或分区看属性。高架与地面叠在一起时，可用图层辅助识别。',erase:'点击一段道路，确认后才拆除。相交分段有独立路段，断开的公交会暂停。'};
const toolNames={campusLife:'大学校园',parkLife:'公园步道',active:'慢行设施',parking:'停车设施',junction:'路口规则',utility:'水电线路',station:'枢纽设施',track:'轨道',line:'运输线路',district:'特别分区',signal:'交通信号',road:'道路',upgrade:'道路改造',bus:'公交线路',frontage:'沿街分区',polygon:'多边形分区',service:'公共服务',inspect:'查阅',erase:'拆除'};
const WB_ACTIONS={employment:'检查附近空缺与居民技能，优先增加他们可以到达的岗位。',commute:'检查住区与岗位之间的断路、单行和换乘，优先恢复一条往返通路。',housing:'查看就业工资和市场账本，增加平价住宅与必需品的稳定供给。',environment:'把高噪声装卸区与住宅隔开，改善污废处理。',amenities:'先检查水电，再补近处可达、未超载的学校、诊所或绿地。',safety:'检查消防、医疗与警务覆盖，以及附近的未处理事件。'};
const WB_COMPONENTS={employment:'就业稳定',commute:'通勤可达',housing:'生活负担',environment:'污染与噪声',amenities:'设施便利',safety:'社区安全'};
const wellNumber=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1});
const wellNum=x=>wellNumber.format(Number.isFinite(x)?x:0);
let wellMarkerCache=null;
function wellbeingTone(v){return v>=70?'#7ae6a0':v>=50?'#ffd172':'#f78b74';}
function wellbeingMarkers(){
 const r=WB.report(city.wellbeing),short=$('wellbeing-map-score').value==='satisfaction';
 if(wellMarkerCache?.source===r.byLot&&wellMarkerCache.short===short)return wellMarkerCache.points;
 const points=Object.values(r.byLot||{}).filter(q=>q.population>0).map(q=>({id:q.id,x:q.x,y:q.y,population:q.population,color:wellbeingTone(short?q.satisfaction:q.happiness),value:short?q.satisfaction:q.happiness,arrow:q.migration?.exitResidents>0}));
 wellMarkerCache={source:r.byLot,short,points};return points;
}
function wellbeingReason(q){
 const raw=q?.reason||q?.reasons?.[0],labels=WB.REASONS||{};
 return (raw&&(labels[raw]||WB_COMPONENTS[raw]||raw))||'暂无持续压力';
}
function wellbeingBuildingInfo(lot){
 const q=WB.report(city.wellbeing).byLot?.[lot.id],move=city.wellbeingApplied?.byLot?.[lot.id];
 if(!q)return [];
 return [['当月满意度／长期幸福度',wellNum(q.satisfaction)+' / '+wellNum(q.happiness)],['主要生活压力',clean(wellbeingReason(q))],
  ...(move?[['因长期趋势而追加的人口调整',(move.extra>0?'+':'')+wellNum(move.extra)+' 人']]:[])];
}
function selectWellbeingLot(id){
 const q=WB.report(city.wellbeing).byLot?.[id];if(!q)return;
 $('wellbeing-lot').value=id;focusView(q.x,q.y,1.45);selected={lot:id};renderWellbeingDetail();renderDetails();
}
function renderWellbeingDetail(){
 const r=WB.report(city.wellbeing),q=r.byLot?.[$('wellbeing-lot').value],t=$('wellbeing-inspect');
 if(!q){t.innerHTML='';return;}
 const d=q.details||{},v=q.migration||{},actual=city.wellbeingApplied?.byLot?.[q.id];
 t.innerHTML=lines([['当月满意度／长期幸福度',wellNum(q.satisfaction)+' / '+wellNum(q.happiness)],
  ['主要压力',clean(wellbeingReason(q))],['持续不佳',wellNum(q.badMonths)+' 月'],...Object.entries(WB_COMPONENTS).map(([k,label])=>[label,wellNum(q.components?.[k])+' / 100']),
  ['通勤估计',d.employed&&Number.isFinite(d.commuteMinutes)?wellNum(d.commuteMinutes)+' 分钟':'—'],['没有可达岗位的求职者',wellNum(d.unreachable)+' 人'],['工资用于住房及日常开支',Number.isFinite(d.burden)?wellNum(d.burden*100)+'%':'—'],
  ['下月迁居压力',wellNum(v.exitResidents)+' 人迁出 / '+wellNum(v.inResidents)+' 人迁入'],
  ...(actual?[['本月较原增长趋势的净调整',(actual.extra>0?'+':'')+wellNum(actual.extra)+' 人']]:[])]);
 const advice=WB_ACTIONS[q.reason]||WB_ACTIONS[q.reasons?.find(k=>Object.hasOwn(WB_ACTIONS,k))];
 if(advice){const p=document.createElement('p');p.className='help';p.textContent=advice;t.append(p);}
}
function renderWellbeing(){
 const r=WB.report(city.wellbeing),t=r.totals||{},a=city.wellbeingApplied?.byLot||{},moved=Object.values(a),rows=Object.values(r.byLot||{}).filter(v=>v.population>0);
 $('wellbeing-status').textContent=r.month?'第 '+r.month+' 月 · '+wellNum(rows.length)+' 个住区样本':'推进一个月后按住区记录满意度。旧存档不会补算历史。';
 const weighted=k=>rows.reduce((n,v)=>n+(v[k]||0)*v.population,0)/Math.max(1,rows.reduce((n,v)=>n+v.population,0));
 $('wellbeing-summary').innerHTML=lines([['全城当月满意度',r.month?wellNum(t.satisfaction??weighted('satisfaction')):'—'],['全城长期幸福度',r.month?wellNum(t.happiness??weighted('happiness')):'—'],
  ['本月长期趋势额外调整',(moved.length?wellNum(moved.reduce((n,q)=>n+q.extra,0)):'0')+' 人'],['下月面临迁出压力',wellNum(rows.reduce((n,q)=>n+(q.migration?.exitResidents||0),0))+' 人']]);
 const mode=$('wellbeing-sort').value,sel=$('wellbeing-lot'),prior=sel.value;
 rows.sort((x,y)=>mode==='exit'?(y.migration?.exitResidents||0)-(x.migration?.exitResidents||0)||x.happiness-y.happiness:mode==='long'?x.happiness-y.happiness:x.satisfaction-y.satisfaction);
 sel.replaceChildren(...rows.slice(0,180).map(q=>new Option('住区 '+q.id+' · '+wellNum(mode==='long'?q.happiness:q.satisfaction)+' 分',q.id)));
 if(rows.slice(0,180).some(q=>q.id===prior))sel.value=prior;
 $('wellbeing-locate').disabled=!sel.value;renderWellbeingDetail();
 const trend=$('wellbeing-history');trend.replaceChildren();
 for(const h of (r.history||[]).slice(-8).reverse()){
  const p=document.createElement('li'),t=h.totals||h;p.textContent='第 '+h.month+' 月：满意度 '+wellNum(t.satisfaction)+'／长期幸福度 '+wellNum(t.happiness);trend.append(p);
 }
}
$('wellbeing-show').onclick=()=>setLayer('wellbeing');
$('wellbeing-sort').onchange=renderWellbeing;
$('wellbeing-lot').onchange=renderWellbeingDetail;
$('wellbeing-map-score').onchange=()=>{wellMarkerCache=null;lastSignature='';setLayer('wellbeing');};
$('wellbeing-locate').onclick=()=>selectWellbeingLot($('wellbeing-lot').value);
const layers={campuses:['大学校园','学校、院系、宿舍、图书馆和实验楼。校内通路断开会影响招生和科研。'],parks:['公园规划','入口和设施须接进真实步道；亮色标记连接，游客必须能从城市走到入口。'],wellbeing:['满意度与幸福度','绿：70 分及以上，黄：50–69 分，珊瑚红：低于 50 分。可切换当月满意度和长期幸福度；点击住区查看原因。'],progress:["土地与科技","经营模式的新城须先购买相邻地块，再动土。科技树按可验证的经营里程碑和科研院所发放点数。老存档原施工范围保持不变。"],social:["市民照护与科研","显示墓园、火葬场、婴幼儿与产后照护中心、养老院和研究所。右侧可查经费、名额、等候与科研点。"],industry:["产业供应链","查看各区的开采、加工、仓储、外运和剩余资源。把采集、加工、仓库和市场用可以往返的道路串起来。"],earth:["海拔与坡度","5 米一条等高线。越密越陡，坡地可先整平；深色山脊受保护。土方可先列入蓝图，取消不扣款。"],serviceOps:["交通运营","读取各线路的容量、班距、待乘人次、车队成本和票款。出租车场按可达道路派车。"],labor:["就业与收入","住宅按就业比例显示颜色，企业点显示岗位是否空缺。右侧可区分交通不通、技能不符和岗位不足。"],care:["消防与医疗","地图显示消防、诊所、医院、社区中心和转诊等候点；绿色表示上月接受过社区走访的住宅。"],justice:["司法与市政","蓝色：调查。紫色：法院候审。橙色：待转送。地块上的点可在司法面板定位；路网单行和封路影响转送。"],schoolAccess:['学位与通学','圆点标出住区：绿色已入学，黄色有人候补，红色有需求但无人入学。校旁显示上月实际用位；切断道路会在下月重新分配。'],incidents:['应急事件','图标是待处理事件；点列表定位，事件优先级会改变有限服务如何派出。风险热区不是已发生事件。'],active:['步行与骑行','淡蓝为步行道，金色为天桥，绿色为自行车道。用「慢行」的试走功能检查连通。'],parking:['停车','P 表示公共场库，数字是已用／总位；红色已满，灰色未接通。小圆点是路侧位，蓝色队尾表示等待停车。'],connections:['对外连接','公路、铁路、港口和航空的城市外接点；铁路必须铺轨连到边界。'],resources:['自然资源','选特别分区类型后查看相应资源。'],districts:['特别分区','显示特别区边界及其用途。'],routes:['铁路、水运和航线','可查看有效线路和已建轨道、车辆段。'],none:['实景','鸟瞰地形、建筑、人车与道路。'],traffic:['道路交通','橙线：该方向正在排队。紫线：队尾堵住上游入口。用查阅工具点击道路查看停在哪、为什么。'],transit:['公共交通','青色标出有效公交线路；断线不发车。'],elevation:['高程／隧道','高架、桥梁与地下通道按高程显色。'],zones:['土地用途','住区、商业、办公与工业分色。'],land:['建设潜力','有道路、基础设施和服务的地块更容易升高密度。'],fire:['消防覆盖','由消防站经路网抵达；互不连通的道路不会跨河覆盖。'],police:['警务覆盖','由警务设施经道路提供。'],water:['供水覆盖','供水设施经道路计算覆盖；本版没有独立管线。'],power:['电力覆盖','电力设施经道路计算覆盖；本版没有独立电网。']};
function civicTypes(){return C.SERVICE_TYPES||C.SERVICES||{}}
function serviceKeys(){let v=civicTypes();return Array.isArray(v)?v.map(x=>typeof x==='string'?x:x.id||x.type):Object.keys(v).length?Object.keys(v):['fire','police','water','power'];}
for(let k of serviceKeys())if(!layers[k])layers[k]=[(serviceNames[k]||k)+'覆盖','沿可达道路计算服务覆盖，地块得分可用查阅工具查看。'];
layers.water[1]='蓝线是水管。连接到供水源且有余量才供水；独立网络未启用时保留旧存档供水方式。';
layers.power[1]='金线是电网。异种线路不串联，断开后影响实际地块。';
const layerGroups={
 '总览与规划':['progress','industry','earth','none','zones','districts','elevation','resources'],
 '出行与对外连接':['serviceOps','traffic','transit','routes','parking','active','connections'],
 '水电与环境':['water','power','sewage','waste','pollution','noise'],
 '市政与生活':['campuses','parks','wellbeing','social','labor','care','justice','schoolAccess','incidents','services','fire','police','health','education','clinic','school','park','library','plaza','logistics']
};
const grouped=new Set();
function layerOptions(keys){return keys.filter(k=>Object.hasOwn(layers,k)&&!grouped.has(k)).map(k=>{grouped.add(k);return '<option value="'+k+'">'+layers[k][0]+'</option>';}).join('');}
$('layer').innerHTML=Object.entries(layerGroups).map(([name,keys])=>{const x=layerOptions(keys);return x?'<optgroup label="'+name+'">'+x+'</optgroup>':'';}).join('')+
 (Object.keys(layers).some(k=>!grouped.has(k))?'<optgroup label="其他服务">'+layerOptions(Object.keys(layers))+'</optgroup>':'');
let commuteModel=null,commuteMap=null,commuteLast=[],commuteId=0,commuteSchedule=new Map(),commuteDirect=new Map(),commutePairs=new Map(),commuteHistory=new Map();
const justiceStage={investigation:"调查中",court:"等待审理",transfer:"等待转送"};
let effective=null,careSnapshot=null,justiceCaseCost=0,justiceSnapshot=null,civicEventLoss=0,eventRisk=null,batch=null,buildDepth=0;
function setLayer(k){layer=k;$('layer').value=k;$('legend').textContent=layers[k][1];$('flow-panel').hidden=!['traffic','parking'].includes(k);if(metrics.graph)paintCoverage();$('commute-panel').hidden=k!=='transit';if(k==='transit'){commuteFill();renderCommute();}if(k==='incidents')renderCivicEvents();$('education-panel').hidden=k!=='schoolAccess';if(k==='schoolAccess')renderEducation();$('justice-panel').hidden=k!=='justice';if(k==='justice')renderJustice();$('care-panel').hidden=k!=='care';if(k==='care')renderCare();$('labor-panel').hidden=k!=='labor';if(k==='labor')renderLabor();$('service-ops').hidden=k!=='serviceOps';if(k==='serviceOps'){fillServiceOps();renderServiceOps();}if(k==='earth')renderEarthInfo();$('earth-panel').hidden=k!=='earth';$('industry-panel').hidden=k!=='industry';if(k==='industry')renderIndustry();$('social-panel').hidden=k!=='social';if(k==='social')renderSocial();$('progress-panel').hidden=k!=='progress';if(k==='progress')renderProgress();$('wellbeing-panel').hidden=k!=='wellbeing';if(k==='wellbeing')renderWellbeing();}
$('layer').onchange=e=>setLayer(e.target.value);setLayer(Object.hasOwn(layers,prefs.overlay)?prefs.overlay:'none');
function lines(entries){return entries.map(([k,v])=>'<div class="line"><span>'+k+'</span><span>'+v+'</span></div>').join('');}
function stats(){
 if(layer==='wellbeing')renderWellbeing();
 const t=metrics.totals||{};renderContracts();renderCivicEvents();if(layer==='schoolAccess')renderEducation();if(layer==='justice')renderJustice();if(layer==='care')renderCare();if(layer==='labor')renderLabor();if(layer==='earth')renderEarthInfo();if(layer==='industry')renderIndustry();if(layer==='social')renderSocial();if(layer==='progress')renderProgress();$('event-status').textContent=[incident.name,incident.detail].filter(Boolean).join(' · ');
 showBudgetSignal();
 $('cash').textContent='¥'+format.format(city.network.cash);$('pop').textContent=format.format(t.population||0);
 $('jobs').textContent=format.format(t.jobs||0);const net=forecast?.net??(t.net||0);
 $('net').textContent=(net>0?'+':'')+'¥'+format.format(net);$('month').textContent='第 '+city.month+' 月';
 const u=utilityMetrics?.types||{};
 $('regional').innerHTML=lines([['水网',u.water?.managed?u.water.connectedLots+' 地块':'兼容供水'],['电网',u.power?.managed?u.power.connectedLots+' 地块':'兼容供电'],['铁路等客运',(transitMetrics?.total?.passengers||0)+' 人'],['对外到货／交付',format.format(cargoNumbers().arrivedImports||0)+' / '+format.format(cargoNumbers().paidExports||0)+' 单位'],['公路外接',cargoGateways.filter(x=>x.mode==='road'&&x.connected).length+' / '+M.gates(mapId).length],['在途货运',format.format(cargoNumbers().inFlight||0)+' 单位'],['特别区岗位',format.format(districtMetrics?.total?.jobs||0)]]);
 $('summary').innerHTML=lines([['道路',city.network.edges.length+' 段'],['税率',city.finance.tax+'%'],['营运补助','¥'+format.format(forecast?.balance?.isNeutral?grant:(forecast?.balance?.starter||0)+(forecast?.balance?.serviceMatch||0))+' / 月'],['未偿借款','¥'+format.format(city.finance.debt)],['分区',city.civic.zones.length+' 片'],['服务',city.civic.services.length+' 处'],['公交',(effective||city.network).buses.filter(b=>!b.broken).length+' 条运营'],['跨河通勤',format.format(trafficStats.cross)+' 人 / 月'],['未通达岗位',format.format(trafficStats.unserved)+' 人 / 月'],['步行／骑行',format.format(trafficStats.walkers||0)+' / '+format.format(trafficStats.cyclists||0)+' 人 / 月']])+(comparison?'<p class="help">'+comparison+'</p>':'');
}
function contractInputs(){const t=metrics.totals||{},s=metrics.services||{},workers=trafficStats.drivers+trafficStats.walkers+trafficStats.busRiders+(trafficStats.railRiders||0)+(trafficStats.cyclists||0)+trafficStats.unserved;return {population:t.population,developed:t.developedLots,access:workers?100*(workers-trafficStats.unserved)/workers:0,buses:(effective||city.network).buses.filter(b=>!b.broken).length,busRiders:trafficStats.busRiders,fire:(s.fire?.coverage||0)*100,police:(s.police?.coverage||0)*100,waterLots:utilityMetrics?.types?.water?.managed?utilityMetrics.types.water.reliableLots:0,powerLots:utilityMetrics?.types?.power?.managed?utilityMetrics.types.power.reliableLots:0,regionalPassenger:(transitMetrics?.total?.inbound||0)+(transitMetrics?.total?.outbound||0)+(regional?.visitors||0),regionalCargo:(cargoNumbers().arrivedImports||0)+(cargoNumbers().paidExports||0),districtGoods:districtMetrics?.total?.goods,processed:Object.values(econ?.lots||{}).filter(z=>z.zone==='industrial'&&z.sector!=='urban_farms').reduce((n,z)=>n+Object.values(z.output||{}).reduce((a,b)=>a+b,0),0)};}
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
 if(tool==='frontage')s=htmlSel('frontageMode','选择方式',{route:'两点自动沿路',region:'框选区域内街道'})+htmlSel('zone','用地',labels)+htmlSel('density','容许密度',{1:'低密 · 低层',2:'中密 · 多层',3:'高密 · 塔楼'})+(tool==='frontage'?value('depth','纵深 m',18,72)+htmlSel('side','沿街方向',{both:'双侧',left:'左侧',right:'右侧'}):'');
 if(tool==='active'){
  s=htmlSel('activeAction','慢行操作',{build:'建设慢行设施',walk:'试走步行',bike:'试走骑行'});
  if(opts.activeAction==='build')s+=htmlSel('activeType','设施种类',Object.fromEntries(Object.entries(A.TYPES).map(([k,v])=>[k,v.name])))+
   (opts.activeType==='bridge'?htmlSel('activeApproach','接入方式',{stairs:'楼梯过街天桥',ramp:'长坡道步行桥（可跨水）'})+value('activeHeight','桥面高程（米）',6,24):'');
 }
 if(tool==='parking'){
  const variants=Object.fromEntries(Object.entries(P.LOTS).map(([k,v])=>[k,v.label+' · '+v.slots+' 位']));
  s=htmlSel('parkingMode','停车设施操作',{build:'新建停车场／车库',price:'调整已建设施收费'});
  if(opts.parkingMode==='build')s+=htmlSel('parkingType','设施规格',variants);
  s+=value('parkingFee','停车每次收费 ¥',0,12);
  if(opts.parkingMode==='build'){const v=P.LOTS[opts.parkingType];s+='<p class="help">造价 ¥'+format.format(v.cost)+' · 养护 ¥'+v.monthly+'／月'+(v.entry?' · 入口间隔 '+v.entry+' 模拟秒':'')+'。收费影响车位选择和出价意愿；抽样收费不直接计入月度财政。</p>';}
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
 if(tool==='campusLife'){
  const q=city.campus.campuses;
  if(!q.some(x=>x.districtId===opts.campusDistrict))opts.campusDistrict=q[0]?.districtId||'';
  s=q.length?htmlSel('campusDistrict','施工校区',Object.fromEntries(q.map(x=>[x.districtId,'大学区 '+clean(x.districtId)])))+
    htmlSel('campusAsset','校园配套',listOptions(CL.ASSETS)):'<p class="help">先绘制大学区，在区内建大学主楼，再从右侧大学管理启用。</p>';
 }
 if(tool==='parkLife'){
  const list=parkZones().filter(z=>city.parks.parks.some(q=>q.districtId===z.id));
  if(!list.some(z=>z.id===opts.parkDistrict))opts.parkDistrict=list[0]?.id||'';
  s=list.length?htmlSel('parkDistrict','施工公园',Object.fromEntries(list.map(z=>[z.id,'公园 '+clean(z.id)])))+
   htmlSel('parkMode','建设类型',{asset:'地面设施或入口',path:'绘制公园步道'})+
   (opts.parkMode==='path'?htmlSel('parkPath','步道类别',listOptions(PL.PATHS)):htmlSel('parkAsset','公园设施',listOptions(PL.ASSETS))):
   '<p class="help">请先用「特别分区 → 公园区」画边界，再在右侧「公园管理」启用。</p>';
 }
 if(tool==='social'){
  const q=R.TYPES[opts.socialType];
  s=htmlSel('socialType','市民服务设施',listOptions(R.TYPES))+'<p class="help">造价 ¥'+format.format(q.cost)+' · 额定 '+q.capacity+' · 月费 ¥'+format.format(q.monthly)+'</p>';
 }
 if(tool==='industry'){
  const q=X.MODULES[opts.industryKind];
  s=htmlSel('industryKind','产业设施',listOptions(X.MODULES))+'<p class="help">基准造价 ¥'+format.format(q.cost)+' · '+q.jobs+' 个基准岗位；随产业类型而变</p>';
 }
 if(tool==='earth'){
  s=htmlSel('earthMode','整地方式',listOptions(F.TOOLS))+value('earthRadius','笔刷半径 m',16,96)+
   (opts.earthMode==='level'?value('earthTarget','平台海拔 m',-30,160):opts.earthMode==='smooth'?value('earthSmooth','平滑强度 %',1,100):value('earthAmount','高度变化 m',1,26));
 }
 if(tool==='careBuild'){
  const q=K.TYPES[opts.careType];
  s=htmlSel('careType','服务设施种类',listOptions(K.TYPES))+'<p class="help">造价 ¥'+format.format(q.cost)+' · 基准月费 ¥'+format.format(q.monthly)+'</p>';
 }
 if(tool==='justiceBuild'){
  const q=J.TYPES[opts.justiceType];
  s=htmlSel('justiceType','市政设施种类',listOptions(J.TYPES))+
   '<p class="help">造价 ¥'+format.format(q.cost)+' · 月费 ¥'+format.format(q.monthly)+'</p>';
 }
 if(tool==='schoolBuild'){
  const q=Q.TYPES[opts.schoolType];
  s=htmlSel('schoolType','学校种类',listOptions(Q.TYPES))+value('schoolFunding','初始运营经费 %',0,100)+
   '<p class="help">'+q.capacity+' 个标准学位 · 积满 '+q.duration+' 个游戏月完成学段 · 最大步行 '+q.range+' m · 造价 ¥'+format.format(q.cost)+'</p>';
 }
 if(tool==='service')s=htmlSel('service','服务种类',Object.fromEntries(serviceKeys().map(k=>[k,serviceNames[k]||k])))+'<label class="field">运营预算 %<input type="number" id="service-budget" min="25" max="160" step="5" value="'+(city.civic.budgets?.[opts.service]??100)+'"></label>';
 $('options').innerHTML=s;const locked=featureFor(tool).map(key=>G.checkFeature(city.progression,key)).find(q=>!q.ok);$('tool-help').textContent=(help[tool]||'')+(locked?' '+locked.reason:'');
 $('options').querySelectorAll('select,input').forEach(el=>el.addEventListener('change',()=>{if(el.id==='service-budget'){if(batch){showTools();return notify('经营预算不属于施工蓝图，请先完成当前批次',true);}C.setBudget(city.civic,opts.service,+el.value);refresh();save();return}opts[el.id]=el.type==='checkbox'?el.checked:el.type==='number'?N.clamp(+el.value,+el.min,+el.max):el.value;if(el.id==='service'){showTools();setLayer(opts.service)}
 if(el.id==='profile'||el.id==='oneway'||el.id==='signalAction'||el.id==='parkingMode'||el.id==='parkingType'){showTools();hintDraft();$(el.id)?.focus({preventScroll:true});}
 if(['industryKind','socialType'].includes(el.id))showTools();
 if(['parkDistrict','parkMode','parkPath','parkAsset','campusDistrict','campusAsset'].includes(el.id)){draft=[];showTools();hintDraft();}
 if(el.id==='earthMode'){showTools();$(el.id)?.focus({preventScroll:true});}
 if(el.id==='frontageMode'){draft=[];hintDraft();}
 if(['schoolType','justiceType','careType'].includes(el.id)){showTools();$(el.id)?.focus({preventScroll:true});}
 if(['activeAction','activeType'].includes(el.id)){draft=[];activeResult=null;showTools();}
 if(el.id==='shape'||el.id==='startZ'){draft=[];hintDraft();}
 if(['stationType','trackMode','transitMode','utilityType','districtType'].includes(el.id)){draft=[];showTools();if(el.id==='utilityType')setLayer(opts.utilityType);if(el.id==='districtType')setLayer('resources');}
 updatePreview();}));
 for(let [id,a,b] of [['ground',0,0],['bridge',18,18],['tunnel',-16,-16],['grade',0,18]])if($(id))$(id).onclick=()=>{opts.startZ=a;opts.endZ=b;draft=[];showTools();updatePreview()};
 $('actions').innerHTML=(['bus','frontage','polygon','line','district'].includes(tool)||tool==='parkLife'&&opts.parkMode==='path')?'<button id="finish">完成'+toolNames[tool]+'</button><button id="undo">撤回最后一点</button>':'';
 if(batch&&$('service-budget'))$('service-budget').disabled=true;
 if(tool==='line'){
  const list=T.stopOptions(city.transit,opts.transitMode,transitOpts());
  $('actions').innerHTML='<select aria-label="站点或外部连接" id="line-stop"><option value="">选择站点或外部连接</option>'+list.map(k=>'<option value="'+clean(k.id)+'">'+clean(k.name||k.id)+'</option>').join('')+'</select><button id="line-add">加入线路</button><div class="help" id="line-points">'+draft.map(x=>clean(x.name||x.id)).join(' → ')+'</div>'+$('actions').innerHTML;
  $('line-add').onclick=()=>joinStop(list.find(k=>k.id===$('line-stop').value));
  for(const z of city.transit.lines.filter(l=>l.mode===opts.transitMode)){
   const v=transitMetrics?.lines?.[z.id];
   const row=document.createElement('div');row.className='line';const text=document.createElement('span');text.textContent=z.id+' '+(v?.valid?((v.passengers||0)+' 人／'+format.format(cargoOnLine(z.id))+' 货运作业'):(v?.reason||'未运营'));row.append(text);const btn=document.createElement('button');btn.textContent='撤线';btn.onclick=()=>withBuildCity(()=>{const tr=structuredClone(city),r=T.remove(tr.transit,z.id);beginPlan(tr,r,{points:v?.path||[],kind:'line'},'撤除运输线路','line');});row.append(btn);$('actions').append(row);
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
$('tools').onclick=e=>{let b=e.target.closest('[data-tool]');if(!b)return;if(b.dataset.tool!==tool){tool=b.dataset.tool;draft=[];selected={};turnNode=null;turnEnter=null;turnPreview=null;if(tool==='bus')setLayer('transit');if(tool==='line'||tool==='track'||tool==='station')setLayer('routes');if(tool==='utility')setLayer(opts.utilityType);if(tool==='district')setLayer('resources');if(tool==='signal'||tool==='junction')setLayer('traffic');if(tool==='parking')setLayer('parking');if(tool==='active'){activeResult=null;setLayer('active');}if(tool==='service')setLayer(opts.service);if(tool==='schoolBuild')setLayer('schoolAccess');if(tool==='justiceBuild')setLayer('justice');if(tool==='careBuild')setLayer('care');if(tool==='taxiDepot')setLayer('serviceOps');if(tool==='earth')setLayer('earth');if(tool==='industry')setLayer('industry');if(tool==='social')setLayer('social');if(tool==='landTitle')setLayer('progress');if(tool==='polygon'||tool==='frontage')setLayer('zones');showTools();updatePreview()}};
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
let trafficStats={cross:0,unserved:0};let grant=0,edgeFlows={},comparison=null,incident={},activeRoads=[],roadIdentity=null,roadClosure='';
function applyIncident(){
 incident=map.rain?CityEvents.status(city):{phase:'normal',name:'区域运输',detail:'青岭走廊不受周期汛期封桥影响；外部铁路的运力更重要。',closed:[]};if(scenarioOverride?.kind==='road')incident={...incident,closed:[...new Set([...(incident.closed||[]),scenarioOverride.id])]};const blocked=new Set(incident.closed||[]);
 const n=city.network, closure=JSON.stringify(incident.closed||[]);
 if(roadIdentity===n&&closure===roadClosure)return;
 roadIdentity=n;roadClosure=closure;
 if(!blocked.size)effective=n;
 else {effective={...n,edges:n.edges.filter(e=>!blocked.has(e.id)),buses:n.buses.map(b=>({...b}))};N.rebuildBuses(effective);}
 activeRoads=N.mapRoads(effective);
}
function buildTraffic(){
 const n=effective||city.network,g=N.graph(n,'car',load),walk=N.graph(n,'walk'),byId=new Map(n.edges.map(e=>[e.id,e])),nodes=new Map(n.nodes.map(x=>[x.id,x]));
 const walkBike=city.activeTravel.links.length?A.build(city.activeTravel,n):null,activeCache=new Map();
 activeTrips=[];
 function linked(a,b,mode){
  if(!walkBike)return null;
  const key=mode+':'+a+'>'+b;
  if(!activeCache.has(key))activeCache.set(key,A.route(walkBike,a,b,mode));
  return activeCache.get(key);
 }
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
 const employment=L.report(city.labor),workUnits=[];
 if(employment.month){
  const homeBy=new Map(home.map(r=>[String(r.l.id),r])),workBy=new Map(sites.map(r=>[String(r.l.id),r])),groups=new Map();
  for(const q of employment.assignments){
   const key=JSON.stringify([q.home,q.work,q.mode]);let entry=groups.get(key);
   if(!entry){const h=homeBy.get(q.home),dst=workBy.get(q.work);if(!h||!dst)continue;entry={...h,dst,mode:q.mode,total:0};groups.set(key,entry);}
   entry.total+=q.count;
  }
  for(const q of groups.values())workUnits.push(q);
  trafficStats.unserved=employment.totals.unemployed;
 }else for(const h of home)workUnits.push({...h,total:Math.max(1,Math.round((h.l.occupants||1)*.56))});
 for(let {l:from,node:a,total,dst:assigned,mode:assignedMode} of workUnits){
  if(!a){trafficStats.unserved+=total;continue;}
  let best=null;
  if(!trees.has(a))trees.set(a,N.pathsFrom(g,a));
  const tree=trees.get(a);
  if(assigned){
   const b=assigned.node,slow=walkBike&&assignedMode==='walk'?A.route(walkBike,{x:from.x,y:from.y,z:0},{x:assigned.l.x,y:assigned.l.y,z:0},'walk',{water:N.water,radius:48}):null;
   best={dst:assigned,road:assignedMode==='walk'?[]:tree.route(b)||[],slow};
  }else for(const [node,batch] of pools){const distance=tree.distances[node];if(!Number.isFinite(distance)&&!walkBike||Number.isFinite(distance)&&distance>(best?.cost??Infinity))continue;
   for(const dst of batch){
    if(dst.left<1)continue;
    let slow=null,bike=null;
    if(!Number.isFinite(distance)&&walkBike&&N.dist(from,dst.l)<420){
     slow=linked(a,node,'walk');bike=linked(a,node,'bike');
    }
    const cost=(distance??((bike?.seconds??slow?.seconds??Infinity)/2))+N.dist(from,dst.l)*.004;
    if(Number.isFinite(cost)&&(!best||cost<best.cost))best={dst,cost,slow,bike};
   }
  }
  if(best&&!assigned)best.road=tree.route(best.dst.node)||[];
  if(!best){trafficStats.unserved+=total;continue;}
  let {dst,road}=best,b=dst.node;
  if(assignedMode==='drive'&&a!==b&&(!road.length||!route(pairs,g,b,a))){trafficStats.unserved+=total;continue;}
  let commuters=assigned?total:Math.min(total,dst.left);if(!assigned)dst.left-=commuters;trafficStats.unserved+=total-commuters;
  if((from.x<N.river(from.y))!==(dst.l.x<N.river(dst.l.y)))trafficStats.cross+=commuters;
  const straight=N.dist(from,dst.l);let wr=assignedMode==='walk'||straight<180?route(walkPairs,walk,a,b):null,busLine=null;
  if(straight>95)busLine=buses.find(bus=>{let x=stopWithin(from,bus),y=stopWithin(dst.l,bus);return x&&y&&x!==y;});
  const altWalk=best.slow||(!wr&&walkBike&&straight<240?linked(a,b,'walk'):null);
  const cycle=best.bike||(walkBike&&straight<330?linked(a,b,'bike'):null);
  const withoutCar=!road.length&&a!==b;
  let foot=wr?Math.max(1,Math.round(commuters*.45)):0;
  if(altWalk?.usesDedicated&&altWalk.seconds<=170)foot=Math.min(commuters,Math.max(foot,Math.round(commuters*.50)));
  if(assignedMode==='walk')foot=commuters;
  else if(withoutCar)foot=altWalk&&(!cycle||altWalk.seconds<=cycle.seconds*1.25)?commuters:0;
  const transit=assignedMode!=='walk'&&!withoutCar&&busLine?Math.round((commuters-foot)*((city.finance.frequency==='frequent'?.70:.50)+(depotLines.has(busLine.id)?.08:0))):0;
  const nearby=assignedMode!=='walk'&&!withoutCar&&railShare>0&&Object.values(transitMetrics.lines).some(line=>line.valid&&line.passengers>0&&line.points?.some(p=>!p.external&&N.dist(p,from)<100)&&line.points?.some(p=>!p.external&&N.dist(p,dst.l)<100));
  const multi=nearby?Math.round((commuters-foot-transit)*.28):0;
  const riders=assignedMode==='walk'?0:withoutCar?commuters-foot:cycle?.usesDedicated?Math.max(0,Math.round((commuters-foot-transit-multi)*.425)):0;
  const drivers=commuters-foot-transit-multi-riders;
  if(activeTrips.length<36&&riders>0&&cycle)activeTrips.push({...cycle,mode:'bike',start:-activeTrips.length*1700});
  if(activeTrips.length<36&&foot>0&&altWalk?.usesDedicated)activeTrips.push({...altWalk,mode:'walk',start:-activeTrips.length*1700});
  trafficStats.cyclists=(trafficStats.cyclists||0)+riders;
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
  if(foot>0&&!altWalk?.usesDedicated)visual(wr,'walker',foot);
  if(busLine)bt.set(busLine.id,(bt.get(busLine.id)||0)+transit);
 }
 for(const {p,profile,count} of [...urbanDemand.values()].sort((a,b)=>b.count-a.count).slice(0,180)){
  // Aggregate equivalent commutes before sampling; the simulated fleet has a hard cap.
  const total=p.reduce((n,h)=>n+(byId.get(h.edge)?.len||0),0);
  trips.push({p,total,kind:'car',profile,parking:true,parkDwell:profile==='home'?37:48,phase:((trips.length*.618+.04)%1),speed:52,interval:N.clamp(88/(1+Math.sqrt(count)),4,50)});
 }
 for(let b of buses){for(let e of b.path)load[e.edge]=(load[e.edge]||0)+2;const p=b.path.map(e=>({...e,l:byId.get(e.edge)?.len||0})).filter(e=>e.l>0);const total=p.reduce((s,a)=>s+a.l,0);if(total)for(let i=0;i<(total>760?2:1)+(depotLines.has(b.id)?1:0)+(city.finance.frequency==='frequent'?1:0);i++)trips.push({p,total,kind:'bus',busId:b.id,phase:i*.5,speed:47,stops:b.stops,riders:bt.get(b.id)||0});}
 if(regional){for(const [id,count] of Object.entries(regional.loads))load[id]=(load[id]||0)+count;trips.push(...regional.paths.map(p=>({...p,profile:p.kind==='truck'?'freight':'steady'})));}
 resetFlow(n,depotLines);
 pedestrians=Pedestrians.create(n,trips);
 buildTraffic.edges=byId;edgeTraffic=Object.fromEntries(n.edges.map(e=>[e.id,Math.min(1,(load[e.id]||0)/N.capacity(e))]));
}
function resetCommute(n,depotLines){
 const parking=P.build(n,city.parking);
 const p={network:n,transitMetrics,parking:city.parking,parkingConfig:parking,isLand:onLand,extraWalking:city.activeTravel.links.length?((g)=>(a,b)=>A.route(g,a,b,'walk'))(A.build(city.activeTravel,n)):null,loads:load,frequency:city.finance.frequency,depotLines};
 const base=CommuteNetwork.create(p);
 if(serviceOps&&serviceOwner===city)city.transitService=serviceOps.snapshot();
 serviceOps=makeService(city,base.lines,n,base.transfers);serviceOwner=city;
 serviceOps.resetLive?.();serviceClock=serviceOps.now();
 commuteMap=CommuteNetwork.create({...p,operatingLines:serviceOps.lines()});
 if(layer==='serviceOps'){fillServiceOps();renderServiceOps();}
 commuteLast=[];commuteSchedule=new Map();commuteDirect=new Map();commutePairs=new Map();commuteHistory=new Map();
 commuteModel=CommuteOperations.create({lines:commuteMap.lines,transfers:commuteMap.transfers,onFinish:r=>{
  commuteDirect.delete(r.id);
  const key=commutePairs.get(r.id);commutePairs.delete(r.id);
  if(key){
   const observations=commuteHistory.get(key)||{},prev=observations[r.mode];
   const cost=r.ok?r.total+(100-r.quality)*.75:305;
   observations[r.mode]={cost:prev?.cost*.35+cost*.65||cost,ok:r.ok};commuteHistory.set(key,observations);
   if(commuteHistory.size>60)commuteHistory.delete(commuteHistory.keys().next().value);
  }
  commuteLast.push(r);if(commuteLast.length>18)commuteLast.shift();
 }});
 for(const l of commuteMap.lines)if(!l.busId)commuteSchedule.set(l.id,l.offset||0);
}
function commuteParked(e){
 if(commuteDirect.has(e.journeyId)){commuteModel?.arrived(e.journeyId,{...e,lastWalk:commuteDirect.get(e.journeyId)});return;}
 commuteModel?.parked(e.journeyId,e);
}
function commuteBus(e){
 const value=commuteMap?.liveBusStops?.[e.busId]?.[e.node];if(!value)return;
 for(const l of commuteMap.lines)if(l.busId===e.busId&&l.stops.includes(value)){commuteModel.visit(l.id,e.vehicleId,value,e.at);serviceOps?.visit(l.id,e.vehicleId,value,serviceClock+e.at);}
}
function commuteLots(type){
 return city.civic.lots.filter(l=>l.level>0&&(type==='home'?l.type==='residential':l.type!=='residential')).slice(0,120);
}
function commuteFill(){
 for(const [id,type] of [['commute-from','home'],['commute-to','work']]){
  const el=$(id),sel=el.value;
  const data=commuteLots(type);
  el.replaceChildren(...data.map((l,i)=>new Option((type==='home'?'住宅 ':'工作地 ')+(i+1)+' · '+Math.round(l.x)+', '+Math.round(l.y),l.id)));
  if(data.some(l=>l.id===sel))el.value=sel;
 }
}
function commutePoint(l,n){
 if(!l)return null;
 const pt=N.snap(n,{x:l.x,y:l.y,z:0},48,true);
 if(!pt)return null;
 const e=pt.edge?n.edges.find(e=>e.id===pt.edge):null;
 const near=e?[e.a,e.b].map(id=>n.nodes.find(k=>k.id===id)).filter(Boolean).sort((a,b)=>N.dist(a,l)-N.dist(b,l))[0]:null;
 return {...l,node:pt.node??near?.id};
}
function addCommute(){
 if(!micro||!commuteModel||!commuteMap)return false;
 const observation=commuteModel.stats();if(observation.total-observation.finished-observation.failed>=32){ $('commute-note').textContent='当前观测已满，请等一些样本到达。';return false;}
 const n=effective||city.network,from=commutePoint(city.civic.lots.find(l=>l.id===$('commute-from').value),n),to=commutePoint(city.civic.lots.find(l=>l.id===$('commute-to').value),n),method=$('commute-method').value;
 if(!from||!to){$('commute-note').textContent='请先建成有道路接驳的住宅和工作地。';return false;}
 const key=from.id+'>'+to.id,observed=commuteHistory.get(key)||{};
 const carPath=N.path(N.graph(n,'car',load),from.node,to.node);
 const lengths=new Map(n.edges.map(e=>[e.id,e]));
 const target=n.nodes.find(x=>x.id===to.node),carWalk=target?N.dist(to,target)/1.5:0;
 const direct=carPath?.length?{ok:true,mode:'car',lastWalk:carWalk,seconds:carWalk+5+carPath.reduce((sum,p)=>{
   const e=lengths.get(p.edge);return sum+(e?.len||0)/Math.max(3,(e?.speed||30)/3.6)*(1+Math.min(2,(load[p.edge]||0)/Math.max(1,N.capacity(e)))*.55);
 },0)}:null;
 const plain=method==='car'||method==='pr'?null:commuteMap.plan({from,to,allowParking:false,prefer:'transit'});
 const pr=method==='car'||method==='transit'?null:commuteMap.plan({from,to,allowParking:true,prefer:'pr'});
 const options=(method==='car'?[direct]:method==='transit'?[plain]:method==='pr'?[pr?.mode==='pr'?pr:null]:[direct,plain,pr?.mode==='pr'?pr:null]).filter(x=>x?.ok);
 const mode=options.sort((a,b)=>(observed[a.mode]?.cost??a.seconds)-(observed[b.mode]?.cost??b.seconds))[0];
 if(!mode){$('commute-note').textContent=method==='car'?'没有可用的驾车路线。':'没有找到可用的公交／地铁接驳。先接通停车入口与车站，并开通线路。';return false;}
 const real=mode.mode,id='journey-'+(++commuteId),at=micro.now(),lastWalk=mode.lastWalk||0;
 const path=real==='car'?carPath:mode.pr?.roadPath;
 if((real==='car'||real==='pr')&&(!path?.length||!micro.offer({p:path,parking:true,parkingSite:mode.pr?.site??null,journeyId:id,parkDwell:real==='pr'?300:60}))){
  $('commute-note').textContent='该出行没有可走的驾车路，或样本出行已达上限。';return false;
 }
 if(!commuteModel.submit({id,at,direct:real==='car',pr:real==='pr',walk:mode.walk||mode.pr?.walk||0,lastWalk,legs:mode.legs,patience:290}))return false;
 commutePairs.set(id,key);if(real==='car')commuteDirect.set(id,lastWalk);
 $('commute-note').textContent=(real==='car'?'直驾':real==='pr'?'停车换乘':'公交／地铁')+'样本已出发；完成后显示实际用时。';
 return true;
}
function commuteTick(){
 if(!micro||!commuteModel)return;
 const now=micro.now();
 serviceOps?.step(serviceClock+now);
 for(const l of commuteMap.lines)if(!l.busId){
  let at=commuteSchedule.get(l.id)??0;
  const step=Math.max(9,l.headway||35);
  while(at<=now){if(at>=commuteModel.now())commuteModel.departure(l.id,at);at+=step;}
  commuteSchedule.set(l.id,at);
 }
 commuteModel.step(now);
}
function renderCommute(){
 if(!commuteModel||layer!=='transit')return;
 const x=commuteModel.stats(),done=commuteLast.at(-1);
 $('commute-totals').textContent='已完成 '+x.finished+' 趟 · 途中 '+Math.max(0,x.total-x.finished-x.failed)+' 趟 · 候车 '+(x.state.waiting||0)+' 人 · 满载未上 '+x.missed+' 次 · 未成行 '+x.failed+' 趟';
 if(done){
  const label=done.mode==='pr'?'停车换乘':done.mode==='car'?'直驾':'公交／地铁';
  const name={drive:'驾驶',park:'等车位',walk:'步行',wait:'候车',ride:'乘车',transfer:'换乘步行'};
  $('commute-detail').textContent=done.ok?label+' · '+Math.round(done.total)+' 秒 · 体验 '+done.quality+'/100 · '+Object.entries(done.parts).filter(([,v])=>v>.1).map(([k,v])=>name[k]+' '+Math.round(v)).join('／'):label+' · 等候太久，未成行';
 }else $('commute-detail').textContent='暂无完成样本。';
}
$('commute-start').onclick=()=>{if(pending||batch)return notify('请先完成当前蓝图',true);addCommute();renderCommute();};
function advanceCommuteObservation(sec){
 if(pending||batch||modalOpen())return;
 for(let i=0;i<Math.min(Math.max(sec,0),300)*4;i++){micro?.step(.25);commuteTick();}
 liveQueues=null;renderCommute();lastSignature='';
}
$('commute-fast').onclick=()=>advanceCommuteObservation(30);
function resetFlow(n=effective||city.network,depotLines){
 const descriptors=trips.filter(t=>t.kind!=='walker');
 const key=JSON.stringify([flowMode,city.activeTravel,city.finance.frequency,n.buses.map(b=>[b.id,b.broken,b.stops,b.path]),city.signals,city.transit.lines,city.transit.stations,city.transit.tracks,n.edges.map(e=>[e.id,e.a,e.b,e.len,e.speed,e.lanes,e.oneway,e.bus,e.kind]),n.turns,city.parking,city.transitService?.settings,city.transitService?.taxiDepots]);
 const same=micro&&flowKey===key;
 if(!same){flowKey=key;resetCommute(n,depotLines);}
 const options=serviceOps?.report().lines||{},byBus=new Set(),activeDescriptors=[];
 for(const t of descriptors){
  if(t.kind!=='bus'||!options[t.busId]){activeDescriptors.push(t);continue;}
  if(byBus.has(t.busId))continue;byBus.add(t.busId);
  const q=options[t.busId];for(let i=0;i<q.fleet;i++)activeDescriptors.push({...t,tag:'fleet:'+t.busId+':'+i,phase:i/Math.max(1,q.fleet),interval:q.headway,terminal:t.stops[0],terminalDwell:Math.max(0,(q.headway||0)*q.fleet-q.cycle)});
 }
 if(same){serviceOwner=city;micro.updateDemand(activeDescriptors);return;}
 micro=Traffic.create(n,activeDescriptors,{seed:17,maxVehicles:180,warmupSeconds:5,signal:true,
   signals:city.signals,parking:P.build(n,city.parking),onPark:commuteParked,onBusStop:commuteBus,profileMode:flowMode,profileOffset:Math.max(0,flowClock/1000-5)});
 liveQueues=null;
}
function getAgents(t){
 if(!animate)return [];
 const marks=[];
 for(const probe of [...activeTrips,...(activeProbe?[activeProbe]:[])]){
  if(!probe?.points?.length||probe.points.length<2)continue;
  const age=(t-probe.start)/1000,duration=Math.max(1,probe.seconds);
  if(probe===activeProbe&&age>duration)continue;
  const f=probe===activeProbe?age/duration:((age/duration)%1+1)%1;
  let meters=f*probe.meters;
  for(let i=1;i<probe.points.length;i++){
   const a=probe.points[i-1],b=probe.points[i],d=Math.hypot(b.x-a.x,b.y-a.y,(b.z||0)-(a.z||0));
   if(meters<=d){marks.push({...N.mix(a,b,d?N.clamp(meters/d,0,1):0),angle:Math.atan2(b.y-a.y,b.x-a.x),kind:probe.mode==='bike'?'bike':'walk',color:'#f7d67b'});break;}
   meters-=d;
  }
 }
 for(const q of parkVisualTrips){
  const phase=((t*.00123+q.phase)%(2*q.length)+2*q.length)%(2*q.length),back=phase>q.length;
  let left=back?2*q.length-phase:phase;
  for(const seg of q.segments){
   if(left<=seg.length){marks.push({...N.mix(seg.a,seg.b,left/seg.length),z:0,kind:'walk',angle:seg.angle+(back?Math.PI:0),id:q.id,color:q.color});break;}
   left-=seg.length;
  }
 }
 return [...marks,...(micro?.agents()||[]),...(pedestrians?.agents(t)||[]),...T.agents(transitMetrics,t).filter(q=>!serviceOps||!['metro','rail','tram','ferry'].includes(q.mode)||q.freight>0&&q.mode==='rail'),...(serviceOps?.agents()||[])];
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
  ['停车等候原因','满位 '+s.parking.causes.full+' · 价高 '+s.parking.causes.price+' · 入口排队 '+s.parking.causes.entry+' · 无接点 '+s.parking.causes.unconnected]]:[])
 ]);
}
$('flow-mode').onchange=e=>{flowMode=e.target.value;resetFlow();renderFlow(micro.stats());lastSignature='';};
function paintCoverage(){coverageGrid=null;if(!serviceKeys().includes(layer)&&layer!=='resources')return;
 const cells=[],dopt=layer==='resources'?districtOpts():null;for(let y=6;y<800;y+=12)for(let x=6;x<1200;x+=12){const p={x,y};let v=layer==='resources'?(X.TYPES[opts.districtType]?X.resource(city.industry,opts.districtType,p,{...dopt,month:city.month}).strength:D.resource(opts.districtType,p,dopt)):(['water','power'].includes(layer)&&U.isManaged(city.utilities,layer)?(onLand(p)?U.at(utilityMetrics,layer,p):0):C.serviceAt(metrics,layer,p));if(v>0)cells.push({x,y,strength:v});}
 coverageGrid={key:layer,cells};
}
let cargoGateways=[];
function cargoNumbers(){return H.report(city.cargo).last?.totals||{};}
function cargoOnLine(id){const g=H.report(city.cargo).last?.gateways?.find(x=>x.id.endsWith('-'+id)&&x.mode!=='road');return (g?.departed||0)+(g?.arrived||0);}
let parksView=null,parkRouteCache=null,parkVisualTrips=[];
function makeParkActors(r){
 const list=[];
 for(const p of Object.values(r?.districts||{})){
  const park=city.parks.parks.find(x=>x.districtId===p.id);
  for(const v of (p.paths||[])){
   if(v.visitors<=0||list.length>=32)continue;
   const points=park?.paths.find(x=>x.id===v.id)?.points;
   if(!points)continue;
   const segments=points.slice(1).map((b,i)=>{const a=points[i];return {a,b,length:N.dist(a,b),angle:Math.atan2(b.y-a.y,b.x-a.x)};}).filter(v=>v.length>.1);
   const length=segments.reduce((n,v)=>n+v.length,0);if(!length)continue;
   const num=Math.min(4,1+Math.floor(v.visitors/21));
   for(let i=0;i<num&&list.length<32;i++)list.push({id:'park-visitor-'+v.id+'-'+i,segments,length,phase:2*length*(i+.28)/num,color:['#f0c887','#adc5d2','#dcab9d','#a5bc8a'][i]});
  }
 }
 return list;
}
function parkZones(tr=city){return tr.districts.districts.filter(z=>z.type==='park');}
function parkOperatingOptions(tr=city){
 if(!tr.parks.parks.length)return {land:onLand,water:N.water};
 const net=effective||tr.network,a=tr.activeTravel;
 if(!parkRouteCache||parkRouteCache.net!==net||parkRouteCache.a!==a)parkRouteCache={net,a,g:A.build(a,net),cache:new Map(),at:new Map()};
 const c=parkRouteCache,wet=N.water;
 const fp=p=>({x:p.x,y:p.y,z:0});
 function gateAccess(p){
  const k=p.x+':'+p.y;if(!c.at.has(k))c.at.set(k,!!A.route(c.g,fp(p),fp(p),'walk',{radius:27,water:wet}));
  return c.at.get(k);
 }
 return {land:onLand,water:wet,gateAccess,labor:L.report(tr.labor),accessFor(home,gate){
  if(N.dist(home,gate)>490)return Infinity;
  const k=[home.x,home.y,gate.x,gate.y].join(':');
  if(!c.cache.has(k)){
   if(c.cache.size>=14000)c.cache.clear();
   c.cache.set(k,A.route(c.g,fp(home),fp(gate),'walk',{radius:41,water:wet})?.meters??Infinity);
  }
  return c.cache.get(k);
 }};
}
function wellbeingParkMetrics(){
 if(!parksView||!city.parks.parks.length)return metrics;
 return {...metrics,lots:Object.fromEntries(Object.entries(metrics.lots||{}).map(([id,q])=>{
  const v=PL.sample(parksView,id);return [id,v>q.park?{...q,park:v}:q];
 }))};
}
function parkFoot(p,t){const a=PL.ASSETS[t];return padShape(p,a.width,a.depth);}
function parkHit(p,tr=city,alsoPaths=true){
 for(const q of tr.parks.parks){
  const a=q.assets.find(x=>{const d=PL.ASSETS[x.type];return Math.abs(p.x-x.x)<d.width/2+2&&Math.abs(p.y-x.y)<d.depth/2+2;});
  if(a)return a;
  const path=alsoPaths&&nearestPolyline(q.paths,p,10/camera.zoom);if(path)return path;
 }
 return null;
}
function parkObstacles(tr){
 return [...tr.civic.lots.filter(l=>l.level>0),...tr.civic.services,...tr.education.sites,...tr.justice.sites,...tr.care.sites,...tr.social.sites,
  ...tr.transit.stations.map(v=>({...v,width:(T.FACILITIES[v.type]?.radius||10)*2,depth:(T.FACILITIES[v.type]?.radius||10)*2})),
  ...tr.industry.modules,...tr.parking.lots,...tr.parks.parks.filter(q=>q.districtId!==opts.parkDistrict).flatMap(q=>q.assets.map(v=>({...v,...PL.ASSETS[v.type]})))];
}
function parkBuild(p,pts){
 const tr=structuredClone(city),type=pts?opts.parkPath:opts.parkAsset;
 if(!opts.parkDistrict)return {ok:false,reason:'请先在公园管理里启用一个特别公园区'};
 if(!pts&&p){
  const d=PL.ASSETS[type],near=N.snap({nodes:[],edges:tr.network.edges.filter(e=>e.kind==='road')},{...p,z:0},Math.hypot(d.width,d.depth)/2+15,true);
  const e=near&&tr.network.edges.find(v=>v.id===near.edge);
  if(e&&N.dist(p,near)<N.crossSection(e).width/2+Math.min(d.width,d.depth)*.49)return {ok:false,reason:'设施不能盖到行车道；入口请放在路边'};
  facilityClaim(tr,p,d.width,d.depth);
 }
 if(pts)constructionLots(tr,{points:pts,clearance:PL.PATHS[type].width/2});
 const r=PL.plan(tr.parks,tr,{districtId:opts.parkDistrict,kind:pts?'path':'asset',type,...p,points:pts},{land:onLand,water:N.water,occupied:parkObstacles(tr),cash:tr.network.cash});
 if(!r.ok)return r;
 if(!PL.add(tr.parks,r))return {ok:false,reason:'施工项目没有加入蓝图'};
 tr.network.cash-=r.cost;
 const f=pts?null:parkFoot(p,type);
 return {...r,tr,geometry:pts?{kind:'active',points:pts,width:PL.PATHS[type].width}:{kind:'service',points:f,closed:true,foundation:f},
   title:'建设 '+(pts?PL.PATHS[type].name:PL.ASSETS[type].name)};
}
function placeParkItem(p){
 if(opts.parkMode==='path'){
  if(draft.length>=24)return notify('一段可以有 24 个点。完成后可接着建下一段',true);
  draft.push({...p,z:0});notify('已选步道第 '+draft.length+' 点；可继续或点完成');return;
 }
 const q=parkBuild(p);
 if(!q.ok)return notify(q.reason,true);
 beginPlan(q.tr,q,q.geometry,q.title,'parkLife','与入口和步道相接后才能开放');
}
function campusZones(tr=city){return tr.districts.districts.filter(z=>z.type==='university');}
function campusOptions(tr=city){return {network:tr===city?(effective||tr.network):tr.network,activeTravel:tr.activeTravel,land:onLand,water:N.water};}
function campusAssets(tr=city){return tr.campus.campuses.flatMap(q=>q.assets);}
function campusAt(p,tr=city){return campusAssets(tr).find(v=>{const q=CL.ASSETS[v.type];return Math.abs(p.x-v.x)<q.width/2+2&&Math.abs(p.y-v.y)<q.depth/2+2;});}
function campusStart(p){
 const d=CL.ASSETS[opts.campusAsset],tr=structuredClone(city),pad=padShape(p,d.width,d.depth);
 if(!opts.campusDistrict)return notify('先在大学管理里绑定大学主楼与大学区',true);
 facilityClaim(tr,p,d.width,d.depth);
 const occupied=[...parkObstacles(tr),...tr.parks.parks.flatMap(q=>q.assets.map(v=>({...v,width:PL.ASSETS[v.type].width,depth:PL.ASSETS[v.type].depth})))];
 const q=CL.plan(tr.campus,tr,{districtId:opts.campusDistrict,type:opts.campusAsset,...p},{...campusOptions(tr),cash:tr.network.cash,occupied});
 if(!q.ok)return notify(q.reason,true);
 if(!CL.add(tr.campus,q))return notify('无法把校园配套列入施工蓝图',true);
 tr.network.cash-=q.cost;
 beginPlan(tr,q,{kind:'service',closed:true,points:pad,foundation:pad},'建设 '+d.name,'campusLife','须通过步行路线连到大学主楼；启用后按实际工作人员和学生运营');
}
function campusProductivity(careers=true){
 const base=careers?(CR.report(city.careers).activity||{}):{},college=CL.report(city.campus).activity||{};
 const out={...base};
 for(const [id,f] of Object.entries(college))if(Number.isFinite(f))out[id]=Math.min(1.35,Math.max(.75,(out[id]??1)*f));
 return out;
}
function refresh(settleLabor=false,campusSession=null){
 applyIncident();const fin=city.finance;
 utilityMetrics=U.evaluate(city.utilities,city.civic);
 regional=Outside.assess(effective,M.gates(mapId),city.civic,map,N);
 const districtBase=D.evaluate(city.districts,city.civic,districtOpts());
 parksView=PL.evaluate(city.parks,city,parkOperatingOptions());
 parkVisualTrips=makeParkActors(parksView);
 industryReport=X.report(city.industry,city,industryOptions());
 districtMetrics=CL.merge(PL.merge(X.merge(districtBase,industryReport),parksView),CL.report(city.campus,city.campus.campuses.length?city:undefined,campusOptions()));
 updateDistrictTransit();
 const supply=supplyOptions(settleLabor?H.begin(city.cargo,city,{gateways:cargoGateways}).imports:city.cargo.inbound);E.allocate(city.civic,{...fin,economy:city.economy},supply);
 econ=E.evaluate(city.civic,{...fin,economy:city.economy},supply);
 metrics=C.evaluate(city.civic,activeRoads,civicOptions());
 if(settleLabor){
  const career=CR.prepare(city.careers,city);
  const employed=L.advance(city.labor,city,{education:Q.report(city.education),economy:econ,civicMetrics:metrics,network:effective||city.network,activeTravel:city.activeTravel,water:N.water,career});
  CR.advance(city.careers,city,employed,career);
  industryReport=X.advance(city.industry,city,industryOptions());
  parksView=PL.advance(city.parks,city,parkOperatingOptions());
  parkVisualTrips=makeParkActors(parksView);
  districtMetrics=CL.merge(PL.merge(X.merge(districtBase,industryReport),parksView),CL.report(city.campus,city.campus.campuses.length?city:undefined,campusOptions()));
  R.advance(city.social,city,{...socialOptions(),incidents:city.civicEvents,labor:L.report(city.labor),industry:industryReport});
  const academy=campusSession?CL.advance(city.campus,city,{...campusOptions(),education:Q.report(city.education),labor:L.report(city.labor),industry:industryReport,social:R.report(city.social,city,socialOptions())},campusSession):CL.report(city.campus);
  const industrial=X.merge(districtBase,industryReport),recreation=PL.merge(industrial,parksView);
  districtMetrics=CL.merge(recreation,academy);districtEvidence=districtEvidenceOf(districtBase,[industrial,recreation,districtMetrics]);
  G.advance(city.progression,city);
  updateDistrictTransit();
  const available=H.begin(city.cargo,city,{gateways:cargoGateways});
  const baseSupply=supplyOptions(available.imports),fiscal={...fin,economy:city.economy};
  const raw=E.evaluate(city.civic,fiscal,baseSupply);
  const prices=Object.fromEntries(Object.entries(W.report(city.market).products||{}).map(([k,p])=>[k,p.price]));
  const quote=H.plan(city.cargo,city,{gateways:cargoGateways,market:raw,prices});
  let finalSupply={...baseSupply,imports:quote.imports,exports:quote.exports};
  econ=E.evaluate(city.civic,fiscal,finalSupply);
  const result=H.advance(city.cargo,city,{gateways:cargoGateways,market:econ,plan:quote,prices});
  if(!result.ok){
   // An inconsistent cargo frame must never remove or create market stock.
   finalSupply=supplyOptions();econ=E.evaluate(city.civic,fiscal,finalSupply);
   console.warn('Cargo settlement rejected:',result.reason);
  }
  const factors=Object.values(finalSupply.activity||{}),neutral=factors.some(v=>Math.abs(v-1)>.001)?E.evaluate(city.civic,fiscal,{...finalSupply,activity:campusProductivity(false)}):econ;
  city.careerProduction=careerProduction({month:city.month,products:Object.fromEntries(Object.keys(E.PRODUCTS).map(k=>[k,{
   output:econ.products[k].output,neutral:neutral.products[k].output,delta:econ.products[k].output-neutral.products[k].output
  }]))},city.month);
  W.advance(city.market,city,econ,{supply:finalSupply,labor:L.report(city.labor)});
  metrics=C.evaluate(city.civic,activeRoads,civicOptions());
  WB.advance(city.wellbeing,city,{civicMetrics:wellbeingParkMetrics(),labor:L.report(city.labor),market:W.report(city.market),incidents:I.report(city.civicEvents),industry:industryReport,social:R.report(city.social,city,socialOptions())});
 }
 if(settleLabor&&city.labor.last){
  const {byWork,...f}=L.fiscal(city.labor,city,{economy:econ,civicMetrics:metrics});
  city.labor.last.fiscal=f;
  for(const sector of Object.values(city.labor.last.bySector))sector.tax=0;
  for(const [id,w] of Object.entries(city.labor.last.byWork)){
   w.tax=byWork[id]||0;
   if(city.labor.last.bySector[w.sector])city.labor.last.bySector[w.sector].tax+=w.tax;
  }
 }
 socialReport=R.report(city.social,city,socialOptions());
 const pop=metrics.totals?.population||0;
 grant=Math.max(0,Math.round(map.grant-pop*1.45));
 const road=Math.round(city.network.edges.reduce((n,e)=>n+e.len*(e.lanes*.28+(e.pts.some(q=>Math.abs(q.z)>3)?.85:0)),0));
 const bus=(fin.frequency==='frequent'?410:220)*city.network.buses.filter(b=>!b.broken).length,interest=0,principal=0;
 const virtualCargoIncome=Object.values(transitMetrics.lines||{}).reduce((n,l)=>n+(l.cargo||0)*({rail:9,ship:12,cargoPlane:21}[l.mode]||0),0);
 const settledCargo=H.report(city.cargo).last;
 // Service income follows completed orders rather than the old estimate; private cargo value is not city income.
 const cargoLevy=settledCargo?Math.round((settledCargo.totals.arrivedImports||0)*.75+(settledCargo.totals.paidExports||0)*1.20):0;
 const infra=utilityMetrics.maintenance||0, transit=Math.round(((transitMetrics.total?.net||0)-virtualCargoIncome)*(map.port+map.air)/2),district=Math.round(districtMetrics.total?.net||0),regionalNet=(regional.net||0)-(regional.freight||0)*17+cargoLevy;
 const parking=city.parking.lots.reduce((v,l)=>v+P.LOTS[l.type].monthly,0);
 const walking=Math.round(city.activeTravel.links.reduce((v,l)=>v+(Number(A.TYPES[l.type].maintenance)||0)*l.length,0));
 const upkeep=techCosts().careUpkeep??1,social=Math.round(R.maintenance(city.social)*upkeep),care=Math.round(K.maintenance(city.care,city,careOpts())*upkeep),justice=J.maintenance(city.justice,city,{network:effective||city.network,water:N.water}),school=Q.maintenance(city.education),chains=Math.round(econ.totals?.taxAdjustment||0),laborTax=L.report(city.labor).month?L.fiscal(city.labor,city,{economy:econ,civicMetrics:metrics}):null;forecast={laborTax,social,care,justice,school,road,bus,infra,parking,walking,transit,district,regionalNet,chains,interest,principal,net:grant+(metrics.totals?.net||0)-road-bus-infra-parking-walking-school-justice-care-social+transit+district+regionalNet+chains+(laborTax?.adjustment||0)};
 forecast.baseNet=forecast.net;forecast.inputs=balanceInputs();
 forecast.balance=B.forecast(city.balance,city,forecast.inputs);forecast.operatingNet=forecast.balance.net;
 forecast.finance=V.forecast(city.credit,city,{cash:city.network.cash,operatingNet:forecast.operatingNet,month:city.month+1});
 forecast.net=forecast.finance.net;forecast.interest=forecast.finance.interest;forecast.principal=forecast.finance.principal;buildTraffic();sceneWorld=showWorld();paintCoverage();stats();renderDetails();}
function updateDistrictTransit(){
 const other=Object.fromEntries(Object.entries(districtMetrics.districts).filter(([,d])=>!X.TYPES[d.type]));
 const lots=[...city.civic.lots,...D.freightLots({districts:other}),...X.freightLots(industryReport)];
 transitMetrics=T.evaluate(city.transit,{...city.civic,lots},{...transitOpts(),airportBoost:districtMetrics.airportBoost});
 cargoGateways=HG.collect(effective||city.network,M.gates(mapId),lots,transitMetrics,N,map.freight);
}
function supplyOptions(imports={},exports={}){
 const local=industryReport?.local||{};
 const rpt=L.report(city.labor),staff=rpt.month?Object.create(null):null;
 if(staff)for(const [id,w] of Object.entries(rpt.byWork||{}))staff[id]=w.employees;
 if(staff)for(const l of city.civic.lots)if(l.type!=='residential'&&!Object.hasOwn(staff,l.id))staff[l.id]=0;
 const priceIndex=Object.fromEntries(Object.entries(W.report(city.market).products||{}).map(([id,p])=>[id,p.priceIndex]));
 const input={staff,activity:campusProductivity(),priceIndex,outside:true,local,imports,exports,importsOnly:true,exportsOnly:true,context(lot){return {waterfront:Math.abs(lot.x-N.river(lot.y))<M.width(lot.y)+55,access:hasRoad(lot,35),traffic:(regional?.visitors||0)/100,education:D.sample(districtMetrics,'education',lot)};}};
 return W.prepare(city.market,city,input,{labor:rpt});
}
function civicOptions(){
 return {...roadOpts,canDevelop:l=>!terrainActive()||foundation(lotFootprint(l)).ok,tax:city.finance.tax,utilityFor(lot,type){return ['water','power'].includes(type)&&U.isManaged(city.utilities,type)?utilityMetrics?.lots?.[lot.id]?.[type]||0:null;},
 districtFor:lot=>({park:Math.max(D.sample(districtMetrics,'park',lot),PL.sample(parksView,lot)),education:Math.max(D.sample(districtMetrics,'education',lot),CL.sample(CL.report(city.campus),lot)),pollution:D.sample(districtMetrics,'pollution',lot)}),
 sectorFor:lot=>E.modifiers(lot,{...city.finance,economy:city.economy},econ)};
}
function justiceEventCity(){
 const newPolice=J.responders(city.justice).map(q=>({...q,funding:city.justice.sites.find(s=>s.id===q.id)?.funding??100}));
 const sites=[...newPolice,...K.responders(city.care,city)];
 return sites.length?{...city,civic:{...city.civic,services:[...city.civic.services,...sites]}}:city;
}
function justiceOpts(tr=city){return {network:tr.network,water:N.water,land:p=>onLand(p)&&!campusLand(p,3)&&!parkedLand(p,3)&&!careLand(p,3)&&!socialLand(p,3)};}
function justiceCandidate(tr,p){
 const q=J.TYPES[opts.justiceType],net=tr.network;
 const near=N.snap({nodes:[],edges:net.edges.filter(e=>e.kind==='road')},{...p,z:0},35,true);
 if(near){
  const e=net.edges.find(x=>x.id===near.edge),d=N.dist(near,p);
  const w=d?(Math.abs(near.x-p.x)*q.width+Math.abs(near.y-p.y)*q.depth)/(2*d):Infinity;
  if(e&&d<w+N.crossSection(e).width/2+1)return {ok:false,reason:'设施占地不能压住地面道路'};
 }
 if(tr.civic.lots.some(l=>Math.abs(l.x-p.x)<(q.width+(l.width||12))/2+1&&Math.abs(l.y-p.y)<(q.depth+(l.depth||12))/2+1))return {ok:false,reason:'设施占地与既有分区地块重叠'};
 return J.plan(tr.justice,tr,{...p,type:opts.justiceType},justiceOpts(tr));
}
function justiceShape(p,type){const q=J.TYPES[type],w=q.width/2,d=q.depth/2;
 return {kind:'service',closed:true,points:[{x:p.x-w,y:p.y-d},{x:p.x+w,y:p.y-d},{x:p.x+w,y:p.y+d},{x:p.x-w,y:p.y+d}]};}
function justiceAt(p){return city.justice.sites.find(s=>{const q=J.TYPES[s.type];return q&&Math.abs(s.x-p.x)<=q.width/2+3&&Math.abs(s.y-p.y)<=q.depth/2+3;});}
function renderJustice(){
 const v=justiceSnapshot=J.report(city.justice,city,{network:effective||city.network,water:N.water});
 const cases=v.cases||[],inmates=v.inmates||[],policy=v.policy?.selected||'balanced',staff=v.sites||[];
 $('justice-status').textContent=cases.length+' 宗待处理 · '+inmates.length+' 人在押 · 每月运转 ¥'+format.format(v.maintenance||0);
 $('justice-results').textContent=v.month?'第 '+v.month+' 月 · 新登记 '+(v.last?.received||0)+' 宗 · 完成调查 '+(v.last?.investigated||0)+' 宗 · 释放 '+(v.last?.released||0)+' 人':'推进月份后可查流转结果。';
 $('justice-queues').innerHTML=lines(Object.entries(justiceStage).map(([k,n])=>[n,cases.filter(x=>x.stage===k).length+' 宗']));
 const sel=$('justice-policy');if(!sel.children.length){for(const [k,q] of Object.entries(J.POLICIES)){const o=document.createElement('option');o.value=k;o.textContent=q.name||q.label||k;sel.append(o);}}
 sel.value=policy;
 const policyHint=()=>{const q=J.POLICIES[sel.value];$('justice-policy-help').textContent=(q?.detail||q?.description||q?.name||'')+(v.policy?.active?' · 仅影响与市政厅双向连通的机构。':' · 需要接通道路且经费至少 50% 的市政厅。');};
 policyHint();sel.onchange=policyHint;
 const blocked=!!(pending||batch);
 sel.disabled=$('justice-policy-apply').disabled=blocked||!staff.some(q=>q.type==='hall'&&q.connected&&q.funding>=50);
 $('justice-policy-apply').onclick=()=>{if(pending||batch)return;const tr=structuredClone(city);if(!J.setPolicy(tr.justice,sel.value))return;
  if(!save(tr)){notify(saveError,true);return;}city=tr;refresh();notify('市政政策已保存，推进月份后生效');};
 const siteList=$('justice-sites');siteList.replaceChildren();
 for(const q of staff){
  const kind=J.TYPES[q.type],row=document.createElement('div');row.className='school-entry';
  const title=document.createElement('span');title.textContent=(q.legacy?'原有':'')+kind.name+' · '+q.used+'/'+q.capacity+(q.connected?(q.governed?' · 政策生效':''):' · 未接通');
  const siteBtn=document.createElement('button');siteBtn.textContent='定位';siteBtn.onclick=()=>{focusView(q.x,q.y,1.3);selected={justice:q.id};renderDetails();};
  row.append(title,siteBtn);
  if(!q.legacy){
   const f=document.createElement('input');f.type='number';f.required=true;f.min=0;f.max=100;f.step=1;f.value=q.funding;f.setAttribute('aria-label',kind.name+' '+q.id+' 运营经费');
   const apply=document.createElement('button');apply.textContent='设置经费';apply.disabled=blocked;apply.onclick=()=>{
    if(pending||batch||!f.reportValidity())return;const tr=structuredClone(city);if(!J.setFunding(tr.justice,q.id,+f.value))return;
    if(!save(tr)){notify(saveError,true);return;}city=tr;refresh();notify('已更新设施经费');
   };
   row.append(f,apply);
  }
  siteList.append(row);
 }
 if(!siteList.children.length)siteList.textContent='在「建设 → 司法与市政」规划设施。';
 const list=$('justice-cases');list.replaceChildren();
 for(const q of cases.slice(0,20)){
  const row=document.createElement('div');row.className='civic-event';const title=document.createElement('span');
  title.textContent=q.id+' · '+(justiceStage[q.stage]||q.stage)+(q.reason?' · '+(J.REASONS[q.reason]||q.reason):'')+(q.stage==='investigation'&&q.required?' · '+q.work+'/'+q.required:'');
  const b=document.createElement('button');b.textContent='定位';b.disabled=!Number.isFinite(q.x)||!Number.isFinite(q.y);
  b.onclick=()=>{focusView(q.x,q.y,1.3);};row.append(title,b);list.append(row);
 }
 if(!list.children.length)list.textContent='没有待办案件。已响应的治安事件进入案件队列。';
 const logs=$('justice-log');logs.replaceChildren();
 const actions={received:'登记',community:'转社区服务',dropped:'未登记',expired:'处理期限已过',reassigned:'办案移交',intake:'登记',opened:'立案',investigated:'调查完成',filed:'送审',dismissed:'结案',convicted:'裁定',sentenced:'裁定',admitted:'入所',released:'释放',diverted:'转社区服务',closed:'结案',waiting:'等待'};
 for(const q of (v.log||[]).slice(-10).reverse()){
  const li=document.createElement('li');li.textContent='第 '+q.month+' 月 · '+(q.id||'')+' · '+(J.ACTIONS?.[q.action]||actions[q.action]||q.action)+(q.reason?'（'+(J.REASONS[q.reason]||q.reason)+'）':'');logs.append(li);
 }
 if(!logs.children.length)logs.textContent='暂无流转记录。';
}
$('justice-show').onclick=()=>setLayer('justice');
function renderLabor(){
 const v=L.report(city.labor),t=v.totals||{},f=forecast?.laborTax||v.fiscal||{};
 const employed=t.employed??t.matched??0,jobseekers=t.unemployed??t.seeking??0,open=t.vacancies??0;
 $('labor-status').textContent=v.month?'第 '+v.month+' 月 · '+employed+' 人已就业 · '+jobseekers+' 人求职 · '+open+ ' 个空缺 · 毕业后上岗 '+(t.graduatesHired||0)+' 人':'推进一月，开始按真实住户与企业岗位匹配。';
 $('labor-ledger').innerHTML=lines([['工资总额','¥'+format.format(f.wages??f.payroll??t.wages??0)],['企业经营税','¥'+format.format(f.businessTax??0)],['工资税','¥'+format.format(f.payrollTax??0)],['财政实际调整','¥'+format.format(f.adjustment??0)]]);
 const sectors=Object.entries(v.bySector||{}).filter(([,x])=>(x.jobs??x.slots??0)>0||x.employees||x.employed);
 $('labor-sectors').innerHTML=sectors.length?lines(sectors.map(([k,w])=>[clean(E.SECTORS[k]?.name||w.name||k),(w.employees??w.employed??0)+' / '+(w.jobs??w.slots??0)+' 人 · '+(w.vacancies??0)+' 空缺'])):'暂无营业企业。';
 const why={};for(const row of Object.values(v.byHome||{}))for(const [k,n] of Object.entries(row.waitingReasons||{}))why[k]=(why[k]||0)+n;
 $('labor-reasons').innerHTML=Object.keys(why).length?lines(Object.entries(why).map(([key,n])=>[clean(L.REASONS[key]||key),n])):'暂无求职记录。';
}
function parkManageAction(kind){
 if(pending||batch||!checkCanSave())return $('park-status').textContent='请先处理当前蓝图。';
 const id=$('park-zone').value,tr=structuredClone(city),p=tr.parks.parks.find(v=>v.districtId===id);
 let okay=false;
 if(kind==='adopt')okay=!!PL.adopt(tr.parks,tr,id);
 if(kind==='release')okay=PL.release(tr.parks,id);
 if(kind==='settings'){
  const b=$('park-budget'),f=$('park-fee');if(!b.reportValidity()||!f.reportValidity())return;
  okay=PL.setBudget(tr.parks,id,+b.value)&&PL.setFee(tr.parks,id,+f.value);
 }
 if(kind==='toggle'){
  const a=p?.assets.find(g=>g.id===$('park-gate').value&&g.type==='gate');if(a)okay=PL.setGate(tr.parks,a.id,!a.open);
 }
 if(!okay)return $('park-status').textContent=kind==='release'?'需要先拆除园内设施和步道。':'设置不可用，请重新选择公园。';
 if(!save(tr))return $('park-status').textContent=saveError;
 city=tr;opts.parkDistrict=id;refresh();showTools();renderParks();$('park-status').textContent=kind==='adopt'?'已启用。先把入口放在靠近道路的一侧。':kind==='release'?'已恢复旧公园区。':'已保存。已结算财政不会被追扣。';
}
function renderParks(){
 const select=$('park-zone'),old=select.value||opts.parkDistrict,list=parkZones();
 select.replaceChildren(...list.map(p=>new Option('公园区 '+p.id,p.id)));
 if(list.some(p=>p.id===old))select.value=old;
 const id=select.value,planned=city.parks.parks.find(q=>q.districtId===id),book=PL.report(city.parks),x=parksView?.districts[id],last=book.districts[id];
 $('park-adopt').disabled=!id||!!planned||!!(pending||batch);$('park-release').disabled=!planned||!!(pending||batch);
 $('park-build').disabled=!planned;
 $('park-settings').hidden=!planned;
 $('park-summary').innerHTML=x?lines([['运营状态',PL.REASONS[x.reason]||x.reason],['主题与等级',(PL.THEMES[x.theme]||x.theme)+' · '+(PL.BANDS[x.band]||x.band)],
  ['预计访客／待入',wellNum(x.visitors)+' / '+wellNum(x.waiting)],['入口／游憩接通',x.connectedGates+' / '+x.connectedAttractions],['预计满意／拥挤',wellNum(x.enjoyment*100)+'% / '+wellNum(x.crowding*100)+'%'],
  ['预计门票餐饮／养护','¥'+wellNum(x.income)+' / ¥'+wellNum(x.expense)],['已结算上次月报',last?'第 '+book.month+' 月 · '+last.visitors+' 访客 · 净额 '+moneyBadge(last.net):'尚未结算']]):
  id?'此处目前沿用旧公园规则。启用后将按真实入口、路径和设施结算。':'还没有公园区。先用建设工具的「特别分区 → 公园区」绘制边界。';
 if(planned){
  $('park-budget').value=planned.budget;$('park-fee').value=planned.fee;
  const gates=planned.assets.filter(v=>v.type==='gate');careerSelect($('park-gate'),gates,v=>v.id+' · '+(v.open?'开放':'关闭'));
  $('park-toggle').disabled=!gates.length||!!(pending||batch);
 }
 const items=$('park-assets');items.replaceChildren();
 for(const v of (x?.assets||[])){
  const el=document.createElement('li');
  el.textContent=PL.ASSETS[v.type].name+' · '+v.id+(v.connected?' · 已接通 · '+wellNum(v.visitors)+' 访客':' · 尚未接通');
  items.append(el);
 }
}
$('park-open').onclick=()=>{renderParks();$('park-status').textContent='';$('park-dialog').showModal();};
$('park-close').onclick=()=>$('park-dialog').close();
$('park-zone').onchange=renderParks;
$('park-adopt').onclick=()=>parkManageAction('adopt');
$('park-release').onclick=()=>parkManageAction('release');
$('park-apply').onclick=()=>parkManageAction('settings');
$('park-toggle').onclick=()=>parkManageAction('toggle');
$('park-build').onclick=()=>{
 opts.parkDistrict=$('park-zone').value;$('park-dialog').close();setLayer('parks');
 document.querySelector('[data-tool=parkLife]').click();
 const q=parksView?.districts[opts.parkDistrict];if(q)focusView(q.focus.x,q.focus.y,1.18);
};
const systemFields=[
 ['失去可达岗位的求职者','labor','waiting.unreachable'],['实际就业','labor','employed'],['实发工资','labor','payroll','money'],
 ['家庭购买力','market','households.affordability'],['商品短缺','market','shortage'],['到货','cargo','arrivedImports'],
 ['工资税','labor','tax.payrollTax','money'],['企业经营税','labor','tax.businessTax','money'],['市库本月变化','treasury','actualDelta','money'],
 ['市库月末现金','treasury','closing','money'],['消防覆盖','services','fire.reach','percent'],['诊所覆盖','services','clinic.reach','percent'],
 ['学校学位覆盖','services','school.reach','percent'],['防火运营经费','services','fire.funded','money']
];
let lastStudy=null,studyFrame=null,studyCancel=null;
const auditValue=(o,k)=>k.split('.').reduce((v,x)=>v?.[x],o);
const auditFormatted=(n,kind='number')=>Number.isFinite(n)?kind==='money'?moneyBadge(n):kind==='percent'?wellNum(n*100)+'%':wellNum(n):'—';
function renderSystems(){
 const r=SL.report(city.systemLedger),q=r.last;
 $('system-period').textContent=q?'第 '+q.month+' 月实际结算 · 非预测':'推进一月，开始保留跨系统的真实月报。';
 $('system-summary').innerHTML=q?lines(systemFields.map(([label,g,k,f])=>[label,auditFormatted(auditValue(q[g],k),f)])):'';
 const node=$('system-checks');node.replaceChildren();
 for(const [k,x] of Object.entries(q?.checks||{})){
  const li=document.createElement('li'),name=SL.CHECKS[k];li.dataset.status=x.status;
  li.textContent=(typeof name==='string'?name:k)+'：'+(x.status==='passed'?'对上了':x.status==='failed'?'未对上（差额 '+auditFormatted(x.difference)+'）':'未有足够记录');node.append(li);
 }
 $('system-flags').textContent=(q?.flags||[]).map(k=>SL.REASONS[k]||k).join('；');
 const history=$('system-history');history.replaceChildren();
 for(const x of r.history.slice(-10).reverse()){
  const li=document.createElement('li');li.textContent='第 '+x.month+' 月 · 就业 '+auditFormatted(x.employed)+' · 工资 '+auditFormatted(x.payroll,'money')+' · 市库 '+auditFormatted(x.cash,'money');history.append(li);
 }
 const road=$('system-road'),v=road.value||selected.edge;
 const items=[...city.network.edges].sort((a,b)=>Number(b.id===v)-Number(a.id===v)||b.len-a.len).slice(0,900);
 road.replaceChildren(...items.map(e=>new Option(e.id+' · '+(N.profiles[e.profile]?.name||'道路')+' · '+Math.round(e.len)+' 米',e.id)));
 if(items.some(e=>e.id===v))road.value=v;
 renderSystemScenario();
}
function renderSystemScenario(){
 const type=$('system-kind').value;
 $('system-road-field').hidden=type!=='road';$('system-tax-field').hidden=type!=='tax';$('system-budget-field').hidden=type!=='school';
 $('system-run').disabled=!!studyFrame||type==='road'&&!$('system-road').value||type==='school'&&!city.education.sites.length;
}
function showSystemStudy(result){
 const table=$('system-comparison');table.replaceChildren();
 if(!result?.ok)return;
 const html=systemFields.map(([label,g,k,f])=>{
  const a=auditValue(result.base[g],k),b=auditValue(result.changed[g],k),d=Number.isFinite(a)&&Number.isFinite(b)?b-a:null;
  return [label,auditFormatted(a,f)+' → '+auditFormatted(b,f)+(d===null?'':'（'+(d>0?'+':'')+auditFormatted(d,f)+'）')];
 });
 table.innerHTML=lines(html);
}
function beginSystemStudy(){
 if(studyFrame||pending||batch)return;
 const type=$('system-kind').value,field=type==='tax'?$('system-tax'):type==='school'?$('system-budget'):null;
 if(field&&!field.reportValidity())return;
 const p=type==='road'?{kind:type,id:$('system-road').value}:type==='tax'?{kind:type,value:+$('system-tax').value}:{kind:'school',value:+$('system-budget').value};
 if(!p.id&&p.kind==='road')return;
 const msg=$('system-scenario-status');const nonce=globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random();
 const src=new URL(location.href);src.searchParams.set('ledger-runner','1');src.searchParams.delete('view');src.searchParams.delete('menu');src.hash='';
 const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.title='本地只读对照';frame.hidden=true;
 const finish=(d)=>{
  window.removeEventListener('message',receive);clearTimeout(timer);frame.remove();studyFrame=null;studyCancel=null;
  lastStudy=d;
  if(d?.ok)msg.textContent='完成：同一份城市、下一结算月，仅改一项。差额为试验 − 基准；未修改存档。';
  else msg.textContent=d?.reason||'已取消；存档未变。';
  showSystemStudy(d);renderSystemScenario();
 };
 const receive=e=>{
  if(e.source!==frame.contentWindow||e.data?.type!=='city-system-result'||e.data.nonce!==nonce)return;
  finish(e.data.result);
 };
 const timer=setTimeout(()=>finish({ok:false,reason:'对照没有在限定时间内完成。当前存档未变。'}),35000);
 window.addEventListener('message',receive);
 const frozen=structuredClone(city);
 if(serviceOps&&serviceOwner===city)frozen.transitService=structuredClone(serviceOps.snapshot());
 frame.addEventListener('load',()=>frame.contentWindow?.postMessage({type:'city-system-study',nonce,world:frozen,lever:p},'*'),{once:true});
 studyFrame=frame;studyCancel=()=>finish(null);lastStudy=null;
 msg.textContent='正在同一份城市副本上运行两次下一月，不会保存……';showSystemStudy(null);renderSystemScenario();frame.src=src.href;document.body.append(frame);
}
function serveSystemStudy(e){
 if(!scenarioRunner||e.source!==parent||e.data?.type!=='city-system-study'||typeof e.data.nonce!=='string')return;
 const {world,lever,nonce}=e.data;
 const run=(knob,context)=>{
  const trial=stateStore.restore(structuredClone(world));trial.systemLedger=SL.create(context);
  if(knob?.kind==='tax')trial.finance.tax=N.clamp(Math.round(knob.value),5,16);
  if(knob?.kind==='school')for(const s of trial.education.sites)Q.setFunding(trial.education,s.id,N.clamp(Math.round(knob.value),0,100));
  scenarioOverride=knob;scenarioControl=context;
  changeCity(trial);
  tick();
  return SL.report(city.systemLedger).last;
 };
 let result;
 try{
  if(!['road','tax','school'].includes(lever?.kind)||lever.kind==='road'&&!world?.network?.edges?.some(x=>x.id===lever.id)||lever.kind!=='road'&&!Number.isFinite(lever.value))throw Error('试验设置无效，存档未变。');
  const control='study-'+nonce,base=run(null,control),changed=run(lever,control);
  const delta=SL.compare(base,changed,{controlId:control,lever:lever.kind==='road'?'road:'+lever.id:lever.kind+':'+lever.value,controlled:true});
  result={...delta,base,changed};
 }catch(err){result={ok:false,reason:err?.message||'试验没能完成；存档未变。'};}
 parent.postMessage({type:'city-system-result',nonce,result},'*');
}
window.addEventListener('message',serveSystemStudy);
$('systems-open').onclick=()=>{renderSystems();$('systems-dialog').showModal();};
$('system-close').onclick=()=>$('systems-dialog').close();
$('systems-dialog').addEventListener('close',()=>studyCancel?.());
$('system-kind').onchange=renderSystemScenario;
$('system-run').onclick=beginSystemStudy;
function renderCampus(){
 const list=campusZones(),sel=$('campus-zone'),prior=sel.value||opts.campusDistrict;
 sel.replaceChildren(...list.map(z=>new Option('大学区 '+z.id,z.id)));if(list.some(z=>z.id===prior))sel.value=prior;
 const districtId=sel.value,z=list.find(x=>x.id===districtId),p=city.campus.campuses.find(x=>x.districtId===districtId),q=CL.report(city.campus),v=q.districts[districtId];
 const sites=city.education.sites.filter(s=>s.type==='university'&&z&&D.inPolygon(s,z.points)&&(!city.campus.campuses.some(c=>c.siteId===s.id)||p?.siteId===s.id));
 careerSelect($('campus-university'),sites,s=>'大学主楼 '+s.id);if(p)$('campus-university').value=p.siteId;
 $('campus-adopt').disabled=!districtId||!!p||!sites.length||!!(pending||batch);
 $('campus-build').disabled=!p;$('campus-release').disabled=!p||!!(pending||batch);
 $('campus-management').hidden=!p;
 if(p)$('campus-budget').value=p.budget;
 const available=p&&CL.prepare(city.campus,city,campusOptions()).profile(p.siteId);
 $('campus-summary').innerHTML=!z?'先在「特别分区」选择大学区，画边界。':!p?'在区内用「学校 → 大学」建设主楼，选择后绑定。启用后该区不再收取旧大学区的费用，主楼学校费用保留。':lines([
  ['主楼',p.siteId],['下期增设学位',wellNum(available?.bonus)+' 位'],['真实通学扩展',wellNum(available?.rangeBonus)+' 米'],
  ['已结算入学／毕业',wellNum(v?.enrolled)+' / '+wellNum(v?.graduates)],['设有专业的毕业生',wellNum(v?.specializedGraduates)],
  ['宿舍入住／可用床位',wellNum(v?.bedsUsed)+' / '+wellNum(v?.beds)],['教职到岗／需求',wellNum(v?.staff)+' / '+wellNum(v?.jobs)],
  ['本月研究产出',wellNum(v?.research)],['校园累计科研点',wellNum(q.points)],['校园收支净额',moneyBadge(v?.net)],
  ['说明',v?'第 '+q.month+' 月结算。设施要实际接通、有人运营。':'先推进一月，让已连通设施分配教职。']]);
 const program=$('campus-programs');program.innerHTML=p?lines(Object.entries(CL.DISCIPLINES).map(([k,d])=>{
  const u=v?.byProgram?.[k],a=v?.byDegree?.[k],n=typeof u==='number'?u:u?.enrolled,graduated=typeof a==='number'?a:a?.graduates;
  return [d.name,wellNum(n)+' 在读 · '+wellNum(graduated)+' 毕业 · 本地行业需求 '+wellNum(q.industryDemand?.[k])];
 })):'';
 const labs=$('campus-buildings');labs.replaceChildren();
 for(const a of (p?.assets||[])){
  const status=v?.assets?.find(x=>x.id===a.id),li=document.createElement('li'),b=document.createElement('button');
  li.textContent=CL.ASSETS[a.type].name+' · '+a.id+(status?' · '+(status.active?'运营中':status.connected?'未达运营条件':'未接主楼'):' · 暂无结算')+' ';
  b.type='button';b.textContent='定位';b.onclick=()=>{$('campus-dialog').close();setLayer('campuses');focusView(a.x,a.y,1.35);selected={campus:a.id};renderDetails();};
  li.append(b);labs.append(li);
 }
}
function updateCampus(kind){
 if(pending||batch||!checkCanSave())return $('campus-status').textContent='请先处理当前蓝图。';
 const id=$('campus-zone').value,tr=structuredClone(city);let ok=false;
 if(kind==='adopt')ok=!!CL.adopt(tr.campus,tr,id,$('campus-university').value);
 if(kind==='release')ok=CL.release(tr.campus,id);
 if(kind==='budget'){const n=$('campus-budget');if(!n.reportValidity())return;ok=CL.setBudget(tr.campus,id,+n.value);}
 if(!ok)return $('campus-status').textContent=kind==='release'?'请先拆除校内配套。':'无法应用。请确认有可绑定的校区和大学主楼。';
 if(!save(tr))return $('campus-status').textContent=saveError;
 city=tr;opts.campusDistrict=id;refresh();showTools();renderCampus();$('campus-status').textContent='已保存，下次月结后生效。';
}
$('campus-open').onclick=()=>{renderCampus();$('campus-status').textContent='';$('campus-dialog').showModal();};
$('campus-close').onclick=()=>$('campus-dialog').close();
$('campus-zone').onchange=renderCampus;
$('campus-adopt').onclick=()=>updateCampus('adopt');
$('campus-release').onclick=()=>updateCampus('release');
$('campus-apply').onclick=()=>updateCampus('budget');
$('campus-build').onclick=()=>{
 opts.campusDistrict=$('campus-zone').value;$('campus-dialog').close();setLayer('campuses');
 document.querySelector('[data-tool=campusLife]').click();
 const c=city.campus.campuses.find(q=>q.districtId===opts.campusDistrict),school=city.education.sites.find(v=>v.id===c?.siteId);if(school)focusView(school.x,school.y,1.2);
};
function careerBuildingInfo(lot){
 const r=CR.report(city.careers),a=lot.type==='residential'?r.byHome[lot.id]:r.byWork[lot.id];if(!a)return [];
 return [['人均工作经验',wellNum(a.meanExperience)+' 月'],['实发工资／经验等加成','¥'+wellNum(a.payroll)+'／¥'+wellNum(a.premium)],
  ...(lot.type!=='residential'?[['员工熟练度产能',wellNum(a.activity*100)+'%']]:[])];
}
function careerSelect(el,rows,toLabel){
 const old=el.value;el.replaceChildren(...rows.map(v=>new Option(toLabel(v),v.id)));if(rows.some(v=>v.id===old))el.value=old;el.disabled=!rows.length;
}
function renderCareerDetails(){
 const r=CR.report(city.careers),labor=L.report(city.labor),w=r.byWork[$('career-work').value],h=r.byHome[$('career-home').value],p=city.careerProduction.products?.[$('career-product').value];
 const title=k=>L.ROLES[k].name;
 $('career-work-detail').innerHTML=w?lines([
  ['经验／见习／晋升',wellNum(w.meanExperience)+' 月／'+w.trained+' 人／'+w.promoted+' 人'],['实际工资总额','¥'+wellNum(w.payroll)],
  ['熟练度产能',wellNum(w.activity*100)+'% · '+w.mentors+' 位可指导员工'],
  ...Object.entries(w.requirements).filter(([k])=>labor.byWork?.[w.id]?.slots?.[k]>0).map(([k,a])=>{
   const slots=labor.byWork[w.id].slots[k];return [title(k),w.roles[k]+' / '+slots+' 位 · ¥'+wellNum(w.posted[k])+' ／人 · '+a.education+(a.experience?'＋ '+a.experience+' 月经验':' · 可零经验')];
  })]):'暂无已结算的企业数据。';
 $('career-home-detail').innerHTML=h?lines([['就业／劳动人口',h.employed+' / '+h.workers+' 人'],['实发／经验及留任加成','¥'+wellNum(h.payroll)+' / ¥'+wellNum(h.premium)],['本月见习／晋升',h.trained+' / '+h.promoted+' 人'],['平均经验',wellNum(h.meanExperience)+' 月']]):'暂无已结算的居民收入。';
 $('career-product-detail').innerHTML=p?lines([['结算产出',wellNum(p.output)],['无经验影响时',wellNum(p.neutral)],['熟练度带来的差额',(p.delta>0?'+':'')+wellNum(p.delta)]]):'推进一月后有对照。';
 $('career-home-locate').disabled=!h;$('career-work-locate').disabled=!w;
}
function careerPolicyView(){
 const k=$('career-policy').value;
 $('career-policy-help').textContent=CR.POLICIES[k]?.description||'';
 $('career-policy-apply').disabled=k===CR.report(city.careers).policy||!!(pending||batch);
}
function renderCareers(){
 const r=CR.report(city.careers),t=r.totals,v=$('career-policy'),products=$('career-product');
 if(!v.options.length)v.replaceChildren(...Object.entries(CR.POLICIES).map(([k,q])=>new Option(q.name,k)));
 if(!products.options.length)products.replaceChildren(...Object.values(E.PRODUCTS).map(q=>new Option(q.name,q.id)));
 v.value=r.policy;careerPolicyView();
 $('career-period').textContent=r.month?'第 '+r.month+' 月已结算 · '+(CR.POLICIES[r.settledPolicy]?.name||'当期政策已计入工资'):'推进一月后记录工作经验、实发工资与产能变化。';
 $('career-overview').innerHTML=lines([['真实岗位实发工资','¥'+wellNum(t.payroll)],['经验／留任加成','¥'+wellNum(t.premium)],['本月见习／晋升',t.trained+' / '+t.promoted+' 人'],['已就业居民平均经验',wellNum(t.meanExperience)+' 月']]);
 careerSelect($('career-work'),Object.values(r.byWork).sort((a,b)=>b.employed-a.employed||a.id.localeCompare(b.id)).slice(0,400),v=>v.name+' · '+v.id);
 careerSelect($('career-home'),Object.values(r.byHome).sort((a,b)=>b.workers-a.workers||a.id.localeCompare(b.id)).slice(0,400),v=>'住区 '+v.id+' · '+v.employed+' 人就业');
 const history=$('career-history');history.replaceChildren();
 for(const h of r.history.slice(-14).reverse()){
  const li=document.createElement('li');li.textContent='第 '+h.month+' 月 · '+(h.action==='promoted'?'晋升':'见习')+' '+h.count+' 人 · '+(E.SECTORS[h.sector]?.name||h.work)+' · '+L.ROLES[h.role].name;history.append(li);
 }
 if(!history.children.length)history.textContent='尚无见习或晋升记录。';
 renderCareerDetails();
}
function locateCareer(id){
 const q=city.civic.lots.find(x=>x.id===id);if(!q)return;
 $('career-dialog').close();setLayer('labor');focusView(q.x,q.y,1.45);selected={lot:id};renderDetails();
}
$('career-open').onclick=()=>{renderCareers();$('career-feedback').textContent='';$('career-dialog').showModal();};
$('career-close').onclick=()=>$('career-dialog').close();
$('career-policy').onchange=careerPolicyView;
$('career-work-locate').onclick=()=>locateCareer($('career-work').value);
$('career-home-locate').onclick=()=>locateCareer($('career-home').value);
for(const id of ['career-home','career-work','career-product'])$(id).onchange=renderCareerDetails;
$('career-policy-apply').onclick=()=>{
 if(pending||batch||!checkCanSave())return;
 const tr=structuredClone(city),k=$('career-policy').value;
 if(!CR.setPolicy(tr.careers,k))return;
 if(!save(tr))return $('career-feedback').textContent=saveError;
 city=tr;refresh();renderCareers();$('career-feedback').textContent='已保存，下月结算生效；本月工资和岗位不变。';
};
$('labor-show').onclick=()=>setLayer('labor');
function makeService(tr,lines=commuteMap?.lines||[],n=tr.network,transfers=commuteMap?.transfers||[]){
 return S.create(tr.transitService,{network:n,transitState:tr.transit,transitMetrics,commuteLines:lines,transfers,loads:load,isLand:onLand,transitOptions:transitOpts(n)});
}
function serviceFormat(mode){return S.MODES[mode]?.name||mode;}
function fillServiceOps(){
 if(!serviceOps)return;
 const d=serviceOps.report().lines,x=$('service-ops-line'),key=x.value;
 x.replaceChildren(...Object.values(d).map(q=>new Option(serviceFormat(q.mode)+' · '+q.id,q.id)));
 if(d[key])x.value=key;
 for(const [id,kind] of [['service-taxi-from','home'],['service-taxi-to','work']]){
  const el=$(id),prior=el.value;const list=commuteLots(kind);
  el.replaceChildren(...list.map((l,i)=>new Option((kind==='home'?'住宅':'工作地')+' '+(i+1)+' · '+Math.round(l.x)+', '+Math.round(l.y),l.id)));
  if(list.some(l=>String(l.id)===prior))el.value=prior;
 }
 serviceLineForm();
}
function serviceLineForm(){
 const q=serviceOps?.report().lines[$('service-ops-line').value],sel=$('service-ops-vehicle');
 sel.replaceChildren(...Object.entries(S.MODES[q?.mode]?.variants||{}).map(([k,v])=>{
  const o=new Option(v.name+' · '+v.seats+' 位',k);o.disabled=!!v.garage&&!q.garage;return o;
 }));
 if(q)sel.value=q.vehicle;
 $('service-ops-headway').value=q?.designHeadway??q?.headway??45;$('service-ops-fare').value=q?.currentFare??2;
 $('service-ops-apply').disabled=!q||!!(pending||batch);
}
function renderServiceOps(){
 if(!serviceOps||layer!=='serviceOps')return;
 const q=serviceOps.report(),v=q.lines[$('service-ops-line').value],t=q.taxi,p=q.period;
 const marks=new Map();for(const z of q.queueByStop){const pt=commuteMap?.stops?.[z.stop];if(!pt)continue;const m=marks.get(z.stop)||{x:pt.x,y:pt.y,count:0};m.count+=z.count;marks.set(z.stop,m);}serviceStopMarks=[...marks.values()];
 $('service-ops-total').textContent=Object.keys(q.lines).length+' 条营运 · 候车 '+q.totals.waiting+' 人 · 累计满载未上 '+q.totals.denied+' 人次 · 放弃 '+q.totals.abandoned+' 人';
 $('service-ops-line-readout').textContent=v?[v.fleet+' 辆／组在编',v.capacity+' 位／车','实际计划班距 '+Math.round(v.headway)+' 秒','候车 '+v.waiting+' 人',v.garage?'车辆库容量 '+v.garageCapacity:(v.reason||'基础调度')].join(' · '):'先规划并接通公交、地铁、电车、铁路或轮渡线路。';
 $('service-ops-taxi').textContent=t.fleet+' 辆可派 · '+t.busy+' 辆在忙 · '+t.waiting+' 单等候；累计完成 '+t.completed+' 单。';
 $('service-ops-finance').innerHTML=lines([['本期乘车票款','¥'+format.format(p.fareRevenue)],['本期出租车费','¥'+format.format(p.taxiRevenue)],['车队养护','¥'+format.format(p.fleetExpense)],['营运净额','¥'+format.format(p.net)]]);
}
$('service-ops-line').onchange=()=>{serviceLineForm();renderServiceOps();};
$('service-ops-show').onclick=()=>setLayer('serviceOps');
$('service-ops-apply').onclick=()=>{
 if(!serviceOps||pending||batch||!checkCanSave())return;
 const h=$('service-ops-headway'),f=$('service-ops-fare');if(!h.reportValidity()||!f.reportValidity())return;
 const tr=structuredClone(city);tr.transitService=serviceOps.snapshot();const draft=makeService(tr,commuteMap.lines,effective||city.network);
 const result=draft.setLine($('service-ops-line').value,{vehicle:$('service-ops-vehicle').value,headway:+h.value,fare:+f.value});
 if(!result.ok)return notify(result.reason,true);
 tr.transitService=draft.snapshot();if(!save(tr))return notify(saveError,true);
 city=tr;refresh();notify('已保存线路车辆、班距和票价');
};
$('service-taxi-probe').onclick=()=>{
 if(!serviceOps||pending||batch)return;
 const from=city.civic.lots.find(l=>String(l.id)===$('service-taxi-from').value),to=city.civic.lots.find(l=>String(l.id)===$('service-taxi-to').value);
 const r=serviceOps.requestTaxi({id:'cab-'+Math.floor(serviceOps.now()*100)+'-'+(++serviceNumbers),from,to,at:serviceOps.now()});
 $('service-taxi-message').textContent=r.ok?(r.status==='dispatched'?'已发车接乘客。':'已加入等车队列。'):(r.reason||'没有可用的出租车线路');
 renderServiceOps();
};
function taxiAt(p){return (city.transitService?.taxiDepots||[]).find(s=>Math.abs(p.x-s.x)<=S.TAXI_DEPOT.w+4&&Math.abs(p.y-s.y)<=S.TAXI_DEPOT.h+4);}
function taxiShape(p){const w=S.TAXI_DEPOT.w,d=S.TAXI_DEPOT.h;return {kind:'service',closed:true,points:[{x:p.x-w,y:p.y-d},{x:p.x+w,y:p.y-d},{x:p.x+w,y:p.y+d},{x:p.x-w,y:p.y+d}]};}
function seedServiceDemand(){
 if(!serviceOps||!commuteMap)return;
 const now=serviceOps.now(),emp=L.report(city.labor);
 const homes=new Map(city.civic.lots.map(l=>[String(l.id),l])),pending=new Map();
 for(const a of emp.assignments||[]){const k=JSON.stringify([a.home,a.work]);pending.set(k,(pending.get(k)||0)+a.count);}
 let i=0;
 for(const [k,count] of [...pending].sort((a,b)=>b[1]-a[1]).slice(0,32)){
  const [from,to]=JSON.parse(k).map(k=>homes.get(k));
  if(!from||!to||N.dist(from,to)<85)continue;
  const plan=commuteMap.plan({from,to,allowParking:false,prefer:'transit'});
  if(!plan?.ok||!plan.legs?.length)continue;
  for(let n=Math.min(12,Math.max(1,Math.round(count*.55)));n>0;n-=4){
   const party=Math.min(n,4),at=now+(i++%12)*3;
   serviceOps.submit({id:'work-'+city.month+'-'+i,legs:plan.legs,party,at,walk:plan.walk||0,lastWalk:plan.lastWalk||0,maxFare:Math.max(7,Math.min(18,10+Math.round(count/4))),patience:240});
  }
 }
 // External/seasonal passengers originate from modeled valid station demand.
 for(const l of serviceOps.lines().filter(x=>!x.busId&&/:out$/.test(x.id))){
  const model=transitMetrics.lines[l.physicalId];if(!model?.passengers)continue;
  const samples=Math.min(34,Math.round(model.passengers*.35));
  for(let n=samples;n>0;n-=4){
   const party=Math.min(n,4),at=now+(i++%16)*4;
   serviceOps.submit({id:'region-'+city.month+'-'+i,legs:[{line:l.id,from:l.stops[0],to:l.stops.at(-1)}],party,at,patience:275});
  }
 }
}
function bookServicePeriod(){
 if(!serviceOps)return 0;
 const prices={rail:6,metro:4.5,tram:4,ferry:5},covered=Object.keys(serviceOps.report().lines);
 const phantom=covered.reduce((n,id)=>{const v=transitMetrics.lines[id];return n+(v&&prices[v.mode]?Math.round(v.passengers*prices[v.mode]):0);},0);
 const p=serviceOps.settle(),discount=Math.round(p.fleetExpense*(1-(techCosts().transitCost??1))),scale=(map.port+map.air)/2,oldBus=(city.finance.frequency==='frequent'?410:220)*city.network.buses.filter(b=>!b.broken&&covered.includes(b.id)).length,replaced=Math.round(phantom*scale)-oldBus;
 lastServiceMonth={...p,replaced,oldBus,discount,projectedFare:Math.round(phantom*scale),adjustment:Math.round(p.net-replaced)+discount,month:city.month};city.serviceLedger=lastServiceMonth;
 return lastServiceMonth.adjustment;
}
function careOpts(tr=city){return {network:tr===city?(effective||tr.network):tr.network,activeTravel:tr.activeTravel,water:N.water,land:onLand};}
function careBuildOpts(tr){return {...careOpts(tr),network:tr.network,occupied:[...tr.social.sites.map(s=>({...s,...R.TYPES[s.type]})),...tr.civic.lots,...tr.civic.services,
 ...tr.education.sites.map(s=>({...s,width:Q.TYPES[s.type].width,depth:Q.TYPES[s.type].depth})),
 ...tr.justice.sites.map(s=>({...s,width:J.TYPES[s.type].width,depth:J.TYPES[s.type].depth})),
 ...tr.parking.lots.map(s=>({...s,width:P.LOTS[s.type].w,depth:P.LOTS[s.type].h})),...tr.transit.stations]};}
function careShape(p,type){const q=K.TYPES[type],w=q.width/2,d=q.depth/2;
 return {kind:'service',closed:true,points:[{x:p.x-w,y:p.y-d},{x:p.x+w,y:p.y-d},{x:p.x+w,y:p.y+d},{x:p.x-w,y:p.y+d}]};}
function careAt(p){return city.care.sites.find(s=>{const q=K.TYPES[s.type];return q&&Math.abs(s.x-p.x)<=q.width/2+3&&Math.abs(s.y-p.y)<=q.depth/2+3;});}
function renderCare(){
 const v=careSnapshot=K.report(city.care,city,careOpts()),sites=v.sites||[],queue=v.referrals||[],patients=v.patients||[];
 $('care-status').textContent=queue.length+' 人等待转诊 · '+patients.length+' 人住院 · 运营 ¥'+format.format(v.maintenance||0)+'／月';
 $('care-results').textContent=v.month?'第 '+v.month+' 月 · 入院 '+(v.last?.admitted||0)+' 人 · 出院 '+(v.last?.discharged||0)+' 人 · 社区走访 '+(v.last?.outreach||0)+' 户':'推进月份后查看服务记录。';
 const s=$('care-sites');s.replaceChildren();
 for(const q of sites){
  const d=K.TYPES[q.type],row=document.createElement('div');row.className='school-entry';
  const title=document.createElement('span');title.textContent=(q.legacy?'原有':'')+d.name+' · '+(q.stockMax>0?(q.deployed||0)+'/'+(q.lastCapacity||q.capacity||0)+' 装备用量':(q.used||0)+'/'+(q.capacity||0))+(q.stockMax>0?' · 装备 '+q.stock+'/'+q.stockMax:'')+(q.connected?'':' · 未接通');
  const b=document.createElement('button');b.textContent='定位';b.onclick=()=>{focusView(q.x,q.y,1.3);selected={care:q.id};renderDetails();};row.append(title,b);
  if(!q.legacy){
   const f=document.createElement('input');f.type='number';f.required=true;f.min=0;f.max=100;f.step=1;f.value=q.funding;f.setAttribute('aria-label',d.name+' '+q.id+' 运营经费');
   const a=document.createElement('button');a.textContent='设置经费';a.disabled=!!(batch||pending);a.onclick=()=>{
    if(batch||pending||!f.reportValidity())return;const tr=structuredClone(city);if(!K.setFunding(tr.care,q.id,+f.value))return;
    if(!save(tr)){notify(saveError,true);return;}city=tr;refresh();notify('已更新经费；补给和出诊将受影响');
   };row.append(f,a);
  }
  s.append(row);
 }
 if(!s.children.length)s.textContent='可在「建设 → 消防与医疗」规划设施。';
 const list=$('care-queue');list.replaceChildren();
 for(const q of queue.slice(0,18)){
  const row=document.createElement('div'),t=document.createElement('span');row.className='civic-event';
  t.textContent=q.id+' · '+(K.REASONS?.[q.reason]||q.reason||'待分配病床');
  const b=document.createElement('button');b.textContent='定位';b.disabled=!Number.isFinite(q.x)||!Number.isFinite(q.y);
  b.onclick=()=>{focusView(q.x,q.y,1.3);};row.append(t,b);list.append(row);
 }
 if(!list.children.length)list.textContent='当前没有待转诊记录。';
 const logs=$('care-log');logs.replaceChildren();
 for(const row of (v.log||[]).slice(-10).reverse()){
  const li=document.createElement('li');li.textContent='第 '+row.month+' 月 · '+(K.ACTION_LABELS?.[row.action]||{referred:'转诊登记',response:'动用救援装备',restock:'补充装备',outreach:'社区走访',expired:'转诊归档',skipped:'未重复登记',referral:'转诊登记',admitted:'入院',discharged:'出院',unserved:'未接诊',served:'已走访',ready:'已补给'}[row.action]||row.action)+(row.reason?' · '+(K.REASONS?.[row.reason]||row.reason):'');logs.append(li);
 }
 if(!logs.children.length)logs.textContent='暂无服务记录。';
}
$('care-show').onclick=()=>setLayer('care');
function eventLot(e){
 const l=city.civic.lots.find(l=>l.id===(e.lotId??e.lot));
 return l??(Number.isFinite(e.x)&&Number.isFinite(e.y)?e:null);
}
function renderCivicEvents(){
 const report=I.report(city.civicEvents),items=report.active??city.civicEvents.active;
 civicEventLoss=report.cost||0;
 $('civic-count').textContent=items.length+' 起待处理'+(civicEventLoss?' · 本月应急支出 ¥'+format.format(civicEventLoss):'');
 const filter=$('civic-kind').value;
 const body=$('civic-event-list');body.replaceChildren();
 for(const e of items.filter(x=>filter==='all'||x.type===filter).slice(0,18)){
  const type=I.TYPES[e.type],row=document.createElement('div');row.className='civic-event';
  const info=document.createElement('span');info.textContent=(type?.name||e.type)+' · '+e.id+(e.priority?' · 优先':'')+(e.reason?' · '+(I.REASONS[e.reason]||e.reason):'');
  const where=document.createElement('button');where.textContent='定位';where.disabled=!eventLot(e);where.onclick=()=>{
   const q=eventLot(e);if(!q)return;focusView(q.x,q.y,1.15);setLayer('incidents');
  };
  const priority=document.createElement('button');priority.textContent=e.priority?'取消优先':'设优先';priority.disabled=!!(batch||pending);priority.onclick=()=>{
   if(batch||pending)return;
   const next=structuredClone(city);I.prioritize(next.civicEvents,e.id,!e.priority);
   if(!save(next)){notify(saveError,true);return;}
   city=next;refresh();notify('已调整下一轮派遣优先级');
  };
  row.append(info,where,priority);body.append(row);
 }
 if(!body.children.length)body.textContent='当前筛选没有待处理事件。';
 const log=$('civic-event-log');log.replaceChildren();
 for(const e of (report.log??city.civicEvents.log).filter(x=>filter==='all'||x.type===filter).slice(-8).reverse()){
  const li=document.createElement('li'),verbs={reported:'已报告',responding:'已派遣',waiting:'等待',escalated:'已升级',resolved:'已处理',expired:'未赶上',cancelled:'撤销'},desc=(verbs[e.action]||'已记录')+' · '+(I.REASONS[e.reason]||e.reason||'')+(e.cost?' · 支出 ¥'+format.format(e.cost):'')+(e.deaths?' · 死亡 '+e.deaths:'')+(e.displaced?' · 搬离 '+e.displaced:'');
  li.textContent='第 '+(e.month??city.month)+' 月 · '+(I.TYPES[e.type]?.name||e.type)+' · '+desc;log.append(li);
 }
 if(!log.children.length)log.textContent='暂无处理记录。';
 if(layer==='incidents'&&metrics.graph)eventRisk=I.forecast(city.civicEvents,justiceEventCity(),{network:effective||city.network,metrics:R.riskMetrics(city.social,K.riskMetrics(city.care,metrics,city),city),water:N.water});
 const u=report.facilities||[],damage=report.impact||{};
 $('civic-impact').textContent='本月处理 '+(report.resolved||0)+' · 未赶上 '+(report.expired||0)+' · 建筑受损 '+(damage.damage||0)+' · 搬离 '+(damage.displaced||0)+' · 死亡 '+(damage.deaths||0);
 $('civic-capacity').textContent=u.length?'应急服务用量 '+u.reduce((v,x)=>v+x.used,0)+' / '+u.reduce((v,x)=>v+x.capacity,0)+' · 已连通 '+u.filter(x=>x.connected).length+' 处':'推进月份后可查服务容量。';
 $('civic-drill').hidden=!sandbox;$('civic-practice').disabled=!sandbox||!!(batch||pending);
}
$('civic-show').onclick=()=>setLayer('incidents');$('civic-kind').onchange=()=>{renderCivicEvents();lastSignature='';};
$('civic-practice').onclick=()=>{
 if(!sandbox||pending||batch)return;
 const type=$('civic-drill-kind').value;
 const lot=city.civic.lots.find(l=>l.level>0&&(type!=='illness'&&type!=='death'||l.type==='residential'&&l.occupants>0));
 if(!lot)return notify('先让城市出现正在使用的地块，再做演练',true);
 const next=structuredClone(city);
 const evt=I.enqueue(next.civicEvents,{type,lot,month:city.month,severity:Number($('civic-drill-severity').value)||2});
 if(!evt)return notify('该地块已有同类事件或已达上限',true);
 if(!save(next)){notify(saveError,true);return;}
 city=next;refresh();setLayer('incidents');notify('练习事件已加入；推进一月查看实际响应');
};
function schoolGeometry(p,type){const q=Q.TYPES[type],w=q.width/2,d=q.depth/2;
 return {kind:'service',closed:true,points:[{x:p.x-w,y:p.y-d},{x:p.x+w,y:p.y-d},{x:p.x+w,y:p.y+d},{x:p.x-w,y:p.y+d}]};}
function schoolOpts(tr=city){return {land:onLand,water:N.water,network:tr.network,activeTravel:tr.activeTravel,
 occupied:[...tr.social.sites.map(s=>({...s,...R.TYPES[s.type]})),...tr.care.sites.map(s=>({...s,width:K.TYPES[s.type].width,depth:K.TYPES[s.type].depth})),...tr.justice.sites.map(s=>({...s,width:J.TYPES[s.type].width,depth:J.TYPES[s.type].depth})),...tr.civic.lots,...tr.civic.services.map(s=>({...s,width:21,depth:17})),
  ...tr.transit.stations.map(s=>{const d=T.FACILITIES[s.type];return {...s,width:d?.width||24,depth:d?.depth||21};}),
  ...tr.parking.lots.map(s=>({...s,width:P.LOTS[s.type].w,depth:P.LOTS[s.type].h}))]};}
function schoolAt(p){return city.education.sites.find(s=>{const q=Q.TYPES[s.type];return Math.abs(s.x-p.x)<=q.width/2+3&&Math.abs(s.y-p.y)<=q.depth/2+3;});}
function renderEducation(){
 const r=Q.report(city.education),v=r.students;
 $('education-status').textContent=(r.month?'第 '+r.month+' 月 · ':'尚未推进月份 · ')+v.enrolled+' 人在读 / '+v.demand+' 人有需求 · '+v.waiting+' 人候补';
 $('education-types').innerHTML=lines(Object.entries(Q.TYPES).map(([id,q])=>{
  const f=r.byType[id],why=Object.entries(f.waitingReasons).filter(([,n])=>n).map(([k,n])=>(Q.WAIT_REASONS[k]||k)+' '+n);
  return [q.name,f.enrolled+' / '+f.capacity+' 位 · 毕业 '+f.graduates+(why.length?' · '+why.join('、'):'')];
 }));
 $('education-monthly').textContent='新校月费 ¥'+format.format(Q.maintenance(city.education))+' · 旧小学仍计入原市政费用，不重复收费。';
 const list=$('education-sites');list.replaceChildren();
 for(const s of city.education.sites){
  const q=Q.TYPES[s.type],last=r.sites.find(x=>x.id===s.id),row=document.createElement('div');row.className='school-entry';
  const name=document.createElement('span');name.textContent=q.name+' · '+s.id+(last?' · '+last.enrolled+'/'+last.capacity+' 位':' · 尚未结算');
  const locate=document.createElement('button');locate.textContent='定位';locate.onclick=()=>{focusView(s.x,s.y,1.35);selected={school:s.id};renderDetails();};
  const budget=document.createElement('input');budget.type='number';budget.required=true;budget.min=0;budget.max=100;budget.step=5;budget.value=s.funding;budget.setAttribute('aria-label',q.name+' '+s.id+' 运营经费百分比');
  const apply=document.createElement('button');apply.textContent='设置经费';apply.disabled=!!(pending||batch);
  apply.onclick=()=>{if(pending||batch||!budget.reportValidity())return;const tr=structuredClone(city);Q.setFunding(tr.education,s.id,+budget.value);
   if(!save(tr)){notify(saveError,true);return;}city=tr;refresh();notify('运营经费已更新，下月重新分配学位');};
  row.append(name,locate,budget,apply);list.append(row);
 }
 if(!list.children.length)list.textContent='可在「建设 → 学校」新增学校。';
}
$('education-show').onclick=()=>setLayer('schoolAccess');
let districtEvidence=null;
function districtEvidenceOf(old,parts){
 const money=q=>q?.total?.net||0,of=(r,test)=>Object.values(r?.districts||{}).filter(test).reduce((n,q)=>n+(q.net||0),0);
 const [ind,park,academy]=parts;
 const descriptors=[
  ['industry',old,ind,q=>Object.hasOwn(X.TYPES,q.type),q=>Object.hasOwn(X.TYPES,q.type)],
  ['parks',ind,park,q=>park.districts?.[q.id]?.plannedPark===true,q=>q.plannedPark===true],
  ['campus',park,academy,q=>academy.districts?.[q.id]?.plannedCampus===true,q=>q.plannedCampus===true]
 ];
 return {baseline:money(old),merged:money(academy),layers:descriptors.map(([key,a,b,was,now])=>({key,replaced:of(a,was),net:of(b,now)}))};
}
function citySystemMonth(opening,settled,credit,paid){
 const l=L.report(city.labor),e=Q.report(city.education),p=CL.report(city.campus),t=transitMetrics?.total||{},sv={};
 for(const k of ['fire','police','clinic','park','waste','water','power']){
  const a=metrics.services?.[k],u=utilityMetrics?.types?.[k];
  if(u?.managed){sv[k]={reach:(u.reliableLots||0)/Math.max(1,metrics.totals.developedLots),sites:1,served:u.reliableLots||0,need:metrics.totals.developedLots,isActive:(u.reliableLots||0)>0};continue;}
  if(!a)continue;
  sv[k]={reach:a.coverage,funded:a.monthly,spent:a.monthly,sites:a.count,isActive:a.capacity>0};
 }
 const d=e.students;
 sv.utilities={funded:forecast.infra,spent:forecast.infra,isActive:forecast.infra>0};
 sv.school={sites:e.sites?.length,reach:d?.demand?d.enrolled/d.demand:null,funded:e.maintenance,spent:e.maintenance,need:d?.demand,served:d?.enrolled,isActive:!!e.sites?.some(x=>x.connected)};
 if(p.totals.campuses)sv.campus={reach:null,funded:p.totals.expense,spent:p.totals.expense,served:p.totals.enrolled,isActive:p.totals.staff>0};
 return SL.advance(city.systemLedger,city,{contextId:scenarioControl||systemContext,labor:l,market:W.report(city.market),cargo:H.report(city.cargo),balance:settled,credit,
  treasury:{opening,closing:city.network.cash,contractGrants:paid.reduce((a,b)=>a+(b.reward||0),0),otherDelta:0},
  transit:{passengers:t.passengers,validLines:t.validLines,inbound:t.inbound,outbound:t.outbound,buses:(effective||city.network).buses.filter(b=>!b.broken).length},
  traffic:{unserved:trafficStats.unserved,drivers:trafficStats.drivers,walkers:trafficStats.walkers,cross:trafficStats.cross},
  services:sv,booking:city.serviceLedger,districts:districtEvidence});
}
function tick(){
 if(pending||batch||saveConflict)return [];comparison=null;const opening=city.network.cash;city.month++;applyIncident();D.tick(city.districts,city.civic,{...districtOpts(),excludeStockTypes:Object.keys(X.TYPES)});
 const applied={month:city.month,byLot:Object.create(null)};
 C.tick(city.civic,activeRoads,{...civicOptions(),residentialAdjustment(lot,before,base,opts){
  return WB.migrationAdjustment(city.wellbeing,lot,before,base,{...opts,month:city.month});
 },onResidentialAdjustment(id,extra,before,base,actual){applied.byLot[id]={extra,before,base,actual};}});
 city.wellbeingApplied=applied;
 const events=I.advance(city.civicEvents,justiceEventCity(),{network:effective||city.network,metrics:R.riskMetrics(city.social,K.riskMetrics(city.care,metrics,city),city),water:N.water});
 civicEventLoss=Math.max(0,Number(events?.cost)||0);
 K.advance(city.care,city,{incidents:city.civicEvents,...careOpts()});
 const justiceMonth=J.advance(city.justice,city,{incidents:city.civicEvents,network:effective||city.network,water:N.water});
 justiceCaseCost=justiceMonth.last?.communityCost||0;
 const academic=city.campus.campuses.length?CL.prepare(city.campus,city,campusOptions()):null;
 Q.advance(city.education,city,{...campusOptions(),campus:academic});
 refresh(true,academic);
 const serviceAdjustment=bookServicePeriod();seedServiceDemand();
 const settled=B.advance(city.balance,city,{...forecast.inputs,baseNet:forecast.baseNet+serviceAdjustment,incidentCost:civicEventLoss+justiceCaseCost});
 const credit=V.advance(city.credit,city,{month:city.month,cash:city.network.cash,operatingNet:settled.net});
 const net=settled.net+(credit.cashDelta||0);city.network.cash+=net;city.finance.debt=V.report(city.credit).debt;
 const paid=Contracts.settle(city,contractInputs());citySystemMonth(opening,settled,credit,paid);city.history=(city.history||[]).concat({month:city.month,pop:metrics.totals?.population||0,net,bus:(trafficStats.busRiders||0)+(transitMetrics?.total?.passengers||0)}).slice(-18);
 refresh();save();return paid;
}
$('step').onclick=()=>{if(!checkCanSave())return;const paid=tick();notify(paid.length?paid.map(x=>x.title+' · 拨款 ¥'+format.format(x.reward)).join('；'):'月报已更新')};$('auto').onclick=()=>{if(!checkCanSave())return;playing=!playing;$('auto').setAttribute('aria-pressed',String(playing));$('auto').textContent=playing?'Ⅱ':'▶';};
function roadPoint(p,z){const u={...p,y:p.y+(mode3d?0:.76*z),z};const gate=opts.snap&&z===0&&M.gates(mapId).find(q=>N.dist(u,q)<13/camera.zoom);if(gate)return {x:gate.x,y:gate.y,z:0};return opts.snap?(N.snap(city.network,u,Math.max(5,13/camera.zoom),true)||u):u;}
function activeProject(p){return mode3d?renderer3d.project(p):view.worldToScreen(p,camera);}
function atPoint(event){const p=screenPoint(event.clientX,event.clientY);return mode3d?renderer3d.raycast(p):view.screenToWorld(p,camera);}
function scenePreference(){
 try{localStorage.setItem('city.blueprint.scene.1',JSON.stringify({enabled:mode3d,map:mapId,camera:renderer3d?.camera||scenePrefs.camera}));}catch{}
}
function scenicCamera(){return mapId==='alpine'?{x:315,y:354,yaw:-.21,pitch:.74,distance:685}:mapId==='hills'?{x:435,y:382,yaw:-.31,pitch:.79,distance:750}:{x:525,y:402,yaw:-.32,pitch:.83,distance:790};}
function setup3d(){
 if(renderer3d?.available)return true;
 if(renderer3d)return false;
 const c=$('map3d');c.hidden=false;
 try{
  renderer3d=new City3D(c,{width:1200,height:800,heightAt:(p,w)=>F.height(w?.terrain?.state||city.terrain,landSurface,p),waterAt:N.water,
   riverCenter:N.river,riverWidth:M.width,waterLevel:0,groundColors:map.color,onLoss:()=>switchScene(false,{persist:false,why:'三维图形暂时不可用，已返回平面；进度不受影响。'})});
 }catch(e){console.warn('3D unavailable',e);}
 if(!renderer3d?.available){c.hidden=true;return false;}
 renderer3d.reset(scenePrefs.map===mapId&&scenePrefs.camera?scenePrefs.camera:scenicCamera());return true;
}
function switchScene(next,{persist=true,why=''}={}){
 if(next&&!setup3d()){
  mode3d=false;$('scene-help').textContent='设备不支持 WebGL，已保留可施工的平面地图。';
  notify('三维图形不可用，平面模式仍可游玩。',true);return false;
 }
 if(!next&&mode3d&&renderer3d){camera={...camera,x:renderer3d.camera.x,y:renderer3d.camera.y};}
 mode3d=!!next;
 $('map3d').hidden=!mode3d;canvas.parentElement.classList.toggle('three-dimensional',mode3d);
 $('scene-2d').setAttribute('aria-pressed',String(!mode3d));$('scene-3d').setAttribute('aria-pressed',String(mode3d));$('scene-orient').hidden=!mode3d;
 $('scene-help').textContent=mode3d?'点击施工 · 拖动平移 · 右键旋转／俯仰 · 双指缩放与转向':'平面精确规划 · 可随时切换 3D';
 if(mode3d){renderer3d.resize();sync3dZoom();}
 if(why)notify(why,true);
 hover=null;updatePreview();lastSignature='';
 if(persist)scenePreference();return true;
}
function focusView(x,y,z=1.3){
 camera={x,y,zoom:Math.max(camera.zoom,z)};
 if(mode3d){renderer3d.camera.x=x;renderer3d.camera.y=y;renderer3d.camera.distance=Math.min(renderer3d.camera.distance,650);sync3dZoom();}
}
function sync3dZoom(){if(mode3d){camera.zoom=N.clamp(690/renderer3d.camera.distance,.53,3.2);}}
function orient(dx,dy){if(!mode3d)return;renderer3d.orbit(dx,dy);sync3dZoom();scenePreference();}
$('scene-2d').onclick=()=>switchScene(false);$('scene-3d').onclick=()=>switchScene(true);
$('scene-left').onclick=()=>orient(-35,0);$('scene-right').onclick=()=>orient(35,0);
$('scene-up').onclick=()=>orient(0,-23);$('scene-down').onclick=()=>orient(0,23);
$('scene-orbit').onclick=()=>{orbitTouch=!orbitTouch;$('scene-orbit').setAttribute('aria-pressed',String(orbitTouch));};
function groundRoad(p){const candidates=city.network.edges.filter(e=>e.kind==='road'&&e.pts.some(q=>Math.abs(q.z)<4)); let best=null;for(let e of candidates){const nn=N.snap({nodes:[],edges:[e]},{...p,z:0},20/camera.zoom,true);if(nn&&(!best||N.dist(p,nn)<N.dist(p,best)))best=nn;}return best;}
function junction(p,min=1){
 const degree=new Map();for(const e of city.network.edges){degree.set(e.a,(degree.get(e.a)||0)+1);degree.set(e.b,(degree.get(e.b)||0)+1);}
 let best=null,delta=20/camera.zoom;
 for(const n of city.network.nodes){if((degree.get(n.id)||0)<min)continue;const d=N.dist({x:n.x,y:n.y-(mode3d?0:.76*n.z)},p);if(d<=delta){best=n;delta=d;}}
 return best;
}
function edgeAt(p){
 let best=null,d=17/camera.zoom;
 for(let e of city.network.edges)for(let i=1;i<e.pts.length;i++){
  // Query at projected height so an overpass can be selected independently.
  let a=activeProject(e.pts[i-1]),b=activeProject(e.pts[i]),x=activeProject(p);if(!a||!b||!x)continue;
  const v=b.x-a.x,w=b.y-a.y,t=N.clamp(((x.x-a.x)*v+(x.y-a.y)*w)/(v*v+w*w||1),0,1);
  const dd=Math.hypot(a.x+t*v-x.x,a.y+t*w-x.y);
  if(dd<d*camera.zoom){d=dd/camera.zoom;best=e;}
 }return best;
}

function techCosts(){return city.progression.sandbox||city.progression.legacy?{}:G.effects(city.progression);}
function progressPoints(){return {points:(city.social.points||0)+(CL.report(city.campus).points||0)};}
function tileOptions(tr=city){return {cash:tr.network.cash,water:N.water,protected:p=>!!map.ridge&&map.ridge(p)>.67};}
function featureFor(kind,geometry={}){
 if(kind==='road'||kind==='upgrade'){
  const f=N.profiles[opts.profile],out=[];
  if(f.kind==='highway'||f.kind==='ramp')out.push('highway');
  else if(f.lanes>4)out.push('arterial');
  if(opts.bus)out.push('busLane');
  if(geometry.points?.some(p=>(p.z||0)>4))out.push('bridge');
  if(geometry.points?.some(p=>(p.z||0)<-4))out.push('tunnel');
  return out;
 }
 if(kind==='earth')return ['earthworks'];
 if(kind==='signal')return ['signals'];
 if(kind==='schoolBuild'&&['vocational','university'].includes(opts.schoolType))return [opts.schoolType];
 if(kind==='social'&&['research','elder','crematorium'].includes(opts.socialType))return [opts.socialType];
 if(kind==='careBuild'&&opts.careType==='hospital')return ['hospital'];
 if(kind==='industry'&&opts.industryKind!=='extractor')return [opts.industryKind==='storage'?'industryStorage':'industryProcessor'];
 if(kind==='district')return opts.districtType==='university'?['universityArea']:opts.districtType==='airportZone'?['airport']:['mine','oil'].includes(opts.districtType)?[opts.districtType]:[];
 if(kind==='track')return [opts.trackMode];
 if(kind==='line')return [{plane:'airport',cargoPlane:'cargoAirport',ship:'cargoPort',railCargo:'cargoRail'}[opts.transitMode]||opts.transitMode];
 if(kind==='station'){
  const mode=T.FACILITIES[opts.stationType].mode;
  return [({cargoPort:'cargoPort',cargoYard:'cargoYard',airport:'airport',cargoAirport:'cargoAirport',cargoRailTerminal:'cargoRail'})[opts.stationType]||mode];
 }
 return [];
}
function checkBuildAccess(kind,g,tr){
 for(const feature of featureFor(kind,g)){
  const test=G.checkFeature(city.progression,feature);
  if(!test.ok)return test;
 }
 if(city.progression.sandbox||city.progression.legacy||['line','bus','land','research','erase','junction'].includes(kind))return {ok:true};
 if(g.kind==='erase'||kind==='parking'&&opts.parkingMode==='price')return {ok:true};
 let shape;
 if(kind==='earth')shape={kind:'polygon',points:g.points};
 else if(g.foundation)shape={kind:'polygon',points:g.foundation};
 else if(g.closed&&kind!=='frontage'&&g.points?.length>2)shape={kind:'polygon',points:g.points};
 else if(g.points?.length>1&&kind!=='frontage')shape={kind:'path',points:g.points,width:g.width||(['track','road','upgrade'].includes(kind)?8:2)};
 else if(g.points?.length===1)shape={x:g.points[0].x,y:g.points[0].y,width:1,depth:1};
 if(shape){const q=G.checkConstruction(city.progression,shape);if(!q.ok)return q;}
 if(kind==='frontage'){
  for(const strip of (g.strips||[])){
   const q=G.checkConstruction(city.progression,{kind:'path',points:strip,width:2});if(!q.ok)return q;
  }
  const before=new Set(city.civic.lots.map(l=>l.id));
  for(const l of tr.civic.lots.filter(l=>!before.has(l.id))){
   const q=G.checkConstruction(city.progression,{kind:'polygon',points:lotFootprint(l)});if(!q.ok)return q;
  }
 }
 return {ok:true};
}
function tileRows(){return G.tiles(city.progression,landSurface,tileOptions());}
function progressMapTiles(){
 if(!city.progression)return [];
 const key=city.progression,ledger=key.revision??JSON.stringify(key.owned),cash=city.network.cash;
 if(progressLayerCache?.key===key&&progressLayerCache.ledger===ledger&&progressLayerCache.cash===cash&&progressLayerCache.selected===selectedTile)return progressLayerCache.tiles;
 const tiles=tileRows().map(t=>({...t,selected:t.id===selectedTile}));
 progressLayerCache={key,ledger,cash,selected:selectedTile,tiles};return tiles;
}
function chooseLand(id){
 if(pending||!id)return;
 const tr=structuredClone(city),q=G.planLand(tr.progression,landSurface,id,tileOptions(tr));
 if(!q.ok)return notify(q.reason,true);
 if(!G.applyLand(tr.progression,q,{cash:tr.network.cash}))return notify('购买报价已过期，请重选',true);
 tr.network.cash-=q.cost;
 const tile=tileRows().find(t=>t.id===id),b=tile?.bounds||tile?.box||tile;
 const x=b?.x0??b?.left??b?.x??0,y=b?.y0??b?.top??b?.y??0,w=b?.x1??b?.right??x+200,h=b?.y1??b?.bottom??y+200;
 beginPlan(tr,q,{kind:'land',closed:true,points:[{x,y},{x:w,y},{x:w,y:h},{x,y:h}]},'购买地块 '+id,'land','确认后的所有权永久保留');
}
function renderProgress(){
 const q=G.report(city.progression,progressPoints());
 $('progress-points').textContent='可用科研点 '+format.format(q.available??q.availablePoints??0)+(city.progression.sandbox?' · 沙盒：土地和施工全部开放':city.progression.legacy?' · 旧档施工权限保留':' · 经营模式：新工程须在自有地块');
 const land=$('progress-tiles'),prev=selectedTile,items=tileRows();
 land.replaceChildren(...items.map(t=>{
  const bought=t.owned||t.purchased;
  const tag=(bought?'自有':t.selectable?'可买 ¥'+format.format(t.cost||0):'未相邻');
  return new Option(t.id+' · '+tag,t.id);
 }));
 if(!prev||!items.some(t=>t.id===prev))selectedTile=items.find(t=>t.selectable)?.id||items[0]?.id;
 land.value=selectedTile||'';detailLand();
 const tech=$('progress-research');tech.replaceChildren();
 const status=q.research||{};const groups={};for(const [id,name] of Object.entries(G.BRANCHES)){const b=document.createElement('section'),h=document.createElement('h3');h.textContent=name;b.append(h);groups[id]=b;tech.append(b);}
 for(const [id,v] of Object.entries(G.TECH)){
  const row=document.createElement('div');row.className='tech-row';
  const text=document.createElement('div'),head=document.createElement('strong'),desc=document.createElement('p'),button=document.createElement('button');
  head.textContent=v.name||id;
  const c=G.planResearch(city.progression,id,progressPoints()),flags=status[id]||{};
  const done=flags.done||flags.unlocked||q.unlocked?.includes?.(id)||city.progression.researched?.includes?.(id);
  const unlocks=Object.entries(G.FEATURES).filter(([,k])=>k===id).map(([k])=>techLabels[k]||k).join('、');
  desc.className='help';desc.textContent=(v.description||v.detail||'')+(unlocks?' 解锁：'+unlocks:'')+(v.requires?.length?' · 前置：'+v.requires.map(p=>G.TECH[p].name).join('、'):'')+(!c.ok&&!done?' · '+c.reason:'');
  button.dataset.tech=id;button.textContent=done?'已研发':'研发 · '+(v.cost??c.cost??0)+' 点';button.disabled=!!(done||!c.ok||pending||batch);
  button.onclick=()=>{if(pending||batch)return;const tr=structuredClone(city),quote=G.planResearch(tr.progression,id,progressPoints());
   if(!quote.ok)return notify(quote.reason,true);
   if(!G.applyResearch(tr.progression,quote,progressPoints()))return notify('科研点或条件已变动，请重新确认',true);
   beginPlan(tr,quote,{kind:'research',points:[]},'研发 '+(v.name||id),'research','消耗 '+(quote.cost??v.cost??0)+' 科研点；不会重复扣除');
  };text.append(head,desc);row.append(text,button);(groups[v.branch]||tech).append(row);
 }
 const list=$('progress-milestones');list.replaceChildren(...Object.entries(G.MILESTONES).map(([id,v])=>{
  const li=document.createElement('li');li.textContent=(q.claimed?.includes(id)?'已达成：':'待达成：')+(v.name||id)+' · '+(v.description||v.detail||'')+' · '+(v.points||v.reward||0)+' 点';return li;
 }));
}
function detailLand(){
 const id=$('progress-tiles').value,b=G.planLand(city.progression,landSurface,id,tileOptions());
 $('progress-land-info').textContent=b.ok?'地块 '+id+' · ¥'+format.format(b.cost)+' · 购买需再次确认':b.reason||'选择地块';
 $('progress-land-buy').disabled=!b.ok||!!pending;
}
$('progress-show').onclick=()=>setLayer('progress');
$('progress-tiles').onchange=()=>{selectedTile=$('progress-tiles').value;detailLand();lastSignature='';};
$('progress-land-buy').onclick=()=>withBuildCity(()=>chooseLand($('progress-tiles').value));
function socialOptions(tr=city){
 const network=tr===city?(effective||tr.network):tr.network;
 return {network,activeTravel:tr.activeTravel,water:N.water,land:onLand};
}
function socialAt(p){return city.social.sites.find(s=>{const v=R.TYPES[s.type];return Math.abs(s.x-p.x)<=v.width/2+4&&Math.abs(s.y-p.y)<=v.depth/2+4;});}
function socialBuild(tr,p){
 const v=R.TYPES[opts.socialType],f=foundation(padShape(p,v.width,v.depth));
 if(!f.ok)return f;facilityClaim(tr,p,v.width+4,v.depth+4);
 const occupied=[...tr.civic.lots,...tr.civic.services,...tr.transit.stations,...tr.parking.lots.map(q=>({...q,width:P.LOTS[q.type].w,depth:P.LOTS[q.type].h})),
  ...tr.education.sites.map(q=>({...q,...Q.TYPES[q.type]})),...tr.justice.sites.map(q=>({...q,...J.TYPES[q.type]})),
  ...tr.care.sites.map(q=>({...q,...K.TYPES[q.type]})),...tr.industry.modules.map(q=>({...q,...X.MODULES[q.kind]})),...(tr.transitService.taxiDepots||[]).map(q=>({...q,width:S.TAXI_DEPOT.w*2,depth:S.TAXI_DEPOT.h*2}))];
 return R.plan(tr.social,tr,{...p,type:opts.socialType},{...socialOptions(tr),network:tr.network,occupied});
}
function renderSocial(){
 const q=socialReport||R.report(city.social);
 $('social-overview').textContent=(q.month?'第 '+q.month+' 月 · ':'')+'科研点 '+format.format(q.points||0)+' · 运转 ¥'+format.format(q.maintenance||0)+'/月';
 const sites=$('social-sites');sites.replaceChildren();
 for(const v of q.sites||[]){
  const k=R.TYPES[v.type],row=document.createElement('div');row.className='school-entry';
  const name=document.createElement('span');name.textContent=k.name+' · '+(v.used??v.occupied??0)+'／'+(v.capacity||0)+(v.connected?'':' · 未接通')+(v.type==='cemetery'?' · 月安葬 '+(v.processed||0)+'／'+(v.monthlyCapacity||0):v.type==='research'?' · 月科研 '+(v.points||0):'');
  const go=document.createElement('button');go.textContent='定位';go.onclick=()=>{focusView(v.x,v.y,1.35);selected={social:v.id};renderDetails();};
  const n=document.createElement('input');n.type='number';n.required=true;n.min=0;n.max=100;n.step=1;n.value=v.funding;n.setAttribute('aria-label',k.name+' '+v.id+' 经费');
  const b=document.createElement('button');b.textContent='设置经费';b.disabled=!!(pending||batch);b.onclick=()=>{
   if(pending||batch||!n.reportValidity())return;const tr=structuredClone(city);if(!R.setFunding(tr.social,v.id,+n.value))return;
   if(!save(tr))return notify(saveError,true);city=tr;refresh();notify('已保存，经费影响下期服务量');
  };row.append(name,go,n,b);sites.append(row);
 }
 if(!sites.children.length)sites.textContent='可从建设工具进入「市民照护与科研」。';
 const policy=$('social-policy');
 if(!policy.children.length)policy.replaceChildren(...Object.entries(R.POLICIES).map(([k,v])=>new Option(v.name||v.label||k,k)));
 policy.value=typeof q.policy==='string'?q.policy:city.social.policy||'balanced';
 $('social-help').textContent=R.POLICIES[policy.value]?.description||'';
 $('social-apply').disabled=!!(pending||batch);
 renderSocialData(q);
}
function renderSocialData(q){
 const m=q.last||q.totals||q.total||{};
 $('social-activity').innerHTML=lines([['等候安置',m.memorialWaiting??q.memorials?.reduce((s,v)=>s+v.people,0)??0],['本月安葬',m.buried||0],['本月火化',m.cremated||0],['家庭／养老候位',(m.familyWaiting||0)+'／'+(m.elderWaiting||0)],['当前照护占位',m.occupiedSlots||0],['本月科研',m.research||0]]);
 const detail=$('social-log');detail.replaceChildren();
 for(const v of (q.log||[]).slice(-10).reverse()){
  const li=document.createElement('li');li.textContent='第 '+v.month+' 月 · '+(R.ACTIONS?.[v.action]||{buried:'安葬',cremated:'火化',queued:'登记',admitted:'入住',discharged:'结束照护',research:'科研产出'}[v.action]||v.action||'记录')+(v.count?' · '+v.count:'');
  detail.append(li);
 }
 if(!detail.children.length)detail.textContent='暂无服务记录。';
}
$('social-show').onclick=()=>setLayer('social');
$('social-policy').onchange=()=>$('social-help').textContent=R.POLICIES[$('social-policy').value]?.description||'';
$('social-apply').onclick=()=>{
 if(pending||batch)return;const tr=structuredClone(city);
 if(!R.setPolicy(tr.social,$('social-policy').value))return;
 if(!save(tr))return notify(saveError,true);city=tr;refresh();notify('已保存安置策略，下月生效');
};
function industryOptions(tr=city){
 const net=tr===city?(effective||tr.network):tr.network,f=districtOpts(net);
 const usable=Object.values(transitMetrics?.lines||{}).filter(q=>q.valid&&q.freightCapacity>0);
 const ports=tr.transit.stations.filter(q=>['cargoYard','cargoPort','cargoAirport'].includes(q.type)&&usable.some(l=>l.points?.some(p=>p.id===q.id)));
 return {...f,gates:M.gates(mapId),network:net,transit:tr.transit,
  labor:L.report(tr.labor),economy:econ,land:onLand,ports,seaports:ports.filter(q=>q.type==='cargoPort')};
}
function industryZone(p,tr=city){
 return tr.districts.districts.find(q=>X.TYPES[q.type]&&D.inPolygon(p,q.points));
}
function industryAt(p){
 return city.industry.modules.find(q=>{const s=X.MODULES[q.kind];return Math.abs(q.x-p.x)<=s.width/2+2&&Math.abs(q.y-p.y)<=s.depth/2+2;});
}
function industryName(q){
 const t=X.TYPES[q.type];return q.kind==='storage'?t.name+'仓储中心':t[q.kind]||X.MODULES[q.kind].name;
}
function industryBuild(tr,p){
 const q=X.MODULES[opts.industryKind],zone=industryZone(p,tr);
 if(!zone)return {ok:false,reason:'请在农业、牧业、渔业、林业、采矿或石油区内施工'};
 facilityClaim(tr,p,q.width+4,q.depth+4);
 const price=techCosts().industryCost??1,opt={...industryOptions(tr),cash:tr.network.cash/price,network:tr.network,occupied:[
 ...tr.social.sites.map(s=>({...s,...R.TYPES[s.type]})),...tr.civic.lots,...tr.civic.services,...tr.education.sites.map(p=>({...p,...Q.TYPES[p.type]})),...tr.justice.sites.map(p=>({...p,...J.TYPES[p.type]})),...tr.care.sites.map(p=>({...p,...K.TYPES[p.type]})),
 ...tr.parking.lots.map(p=>({...p,width:P.LOTS[p.type].w,depth:P.LOTS[p.type].h})),
 ...tr.transit.stations,...(tr.transitService.taxiDepots||[]).map(p=>({...p,width:S.TAXI_DEPOT.w*2,depth:S.TAXI_DEPOT.h*2}))]};
 const f=foundation(padShape(p,q.width,q.depth));if(!f.ok)return f;
 const quote=X.plan(tr.industry,tr,{...p,districtId:zone.id,kind:opts.industryKind},opt);return quote.ok?{...quote,cost:Math.round(quote.cost*price)}:quote;
}
function productCount(m){
 return Object.entries(m||{}).filter(([,n])=>n>0).map(([k,n])=>(E.PRODUCTS[k]?.name||k)+' '+format.format(n)).join(' · ')||'空';
}
function renderIndustry(){
 const rr=industryReport||X.report(city.industry),t=rr.total||rr.totals||{};
 $('industry-health').textContent=rr.month?'第 '+rr.month+' 月 · '+(t.staff||0)+' 人在岗 · 采集 '+(t.production||0)+' · 加工 '+(t.processed||0)+' · 已交付 '+(t.shipped||0):'推进一个月后查看真实出货结算。';
 $('industry-market').textContent='本期入市：'+productCount(rr.local)+' · 市库净收入 ¥'+format.format(t.net||0)+'（运维已扣）';
 const list=$('industry-zones'),old=list.value,zones=city.districts.districts.filter(q=>X.TYPES[q.type]);
 if([...list.options].map(q=>q.value).join()!==zones.map(q=>q.id).join()){
  list.replaceChildren(...zones.map(q=>new Option(q.id+' · '+X.TYPES[q.type].name,q.id)));if(zones.some(q=>q.id===old))list.value=old;
 }
 industryDetail();
}
function industryDetail(){
 const v=$('industry-zones').value,d=(industryReport||{}).districts?.[v],m=city.industry.modules.filter(q=>q.districtId===v),policy=$('industry-policy');
 if(!policy.children.length)policy.replaceChildren(...Object.entries(X.POLICIES).map(([id,q])=>new Option(q.name,id)));
 policy.value=city.industry.policies?.[v]||'balanced';
 $('industry-policy-apply').disabled=!v||!!(pending||batch);
 $('industry-policy-help').textContent=X.POLICIES[policy.value]?.description||'';
 $('industry-row').innerHTML=d?lines([['储量',d.maxStock?format.format(d.stock)+'／'+format.format(d.maxStock):'不受固定储量限制'],['岗位',d.staff+'／'+d.jobs],['原料采集',productCount(d.extractedByGood)],['加工产物',productCount(d.processedByGood)],['仓储与缓冲',productCount(d.buffer)],['交付到市场',productCount(d.shippedByGood)],['状态',clean(X.REASONS[d.reason]||d.reason||'运营中')]]):'在「特别分区」先规划产业区。';
 const box=$('industry-modules');box.replaceChildren();
 for(const q of m){
  const r=(industryReport?.modules||[]).find(x=>x.id===q.id),row=document.createElement('div'),label=document.createElement('span'),btn=document.createElement('button');
  row.className='civic-event';label.textContent=industryName(q)+' · '+(r?X.REASONS[r.reason]||'运营中':'尚未结算')+' · '+productCount(q.buffer);
  btn.textContent='定位';btn.onclick=()=>{focusView(q.x,q.y,1.4);selected={industry:q.id};renderDetails();};
  row.append(label,btn);box.append(row);
 }
 if(!m.length)box.textContent='可从建设工具进入「产业设施」。旧产业区保留边界和储量，建设设施后开始新供应链。';
}
$('industry-show').onclick=()=>setLayer('industry');
$('industry-zones').onchange=industryDetail;
$('industry-policy').onchange=()=>$('industry-policy-help').textContent=X.POLICIES[$('industry-policy').value]?.description||'';
$('industry-policy-apply').onclick=()=>{
 if(pending||batch)return;
 if($('industry-policy').value==='intensive'){const v=G.checkFeature(city.progression,'industryIntensive');if(!v.ok)return notify(v.reason,true);}
 const tr=structuredClone(city);if(!X.setPolicy(tr.industry,$('industry-zones').value,$('industry-policy').value))return;
 if(!save(tr))return notify(saveError,true);city=tr;refresh();notify('已保存采集政策，推进月份后生效');
};
function terrainRoad(pts,profile,width,grade){
 if(!terrainActive())return {ok:true};
 return F.checkRoad(city.terrain,landSurface,pts,{profile,width,grade,water:N.water,protected:p=>!!map.ridge&&map.ridge(p)>.67});
}
function foundation(shape){
 if(!terrainActive())return {ok:true};
 return F.checkBuilding(city.terrain,landSurface,shape,{water:N.water,protected:p=>!!map.ridge&&map.ridge(p)>.67});
}
function padShape(p,w,d){return [{x:p.x-w/2,y:p.y-d/2},{x:p.x+w/2,y:p.y-d/2},{x:p.x+w/2,y:p.y+d/2},{x:p.x-w/2,y:p.y+d/2}];}
function earthOptions(){
 const data=city;
 const roads=[...data.network.edges.map(e=>({...e,width:N.crossSection(e).width})),...data.transit.tracks.filter(t=>t.mode!=='metro').map(t=>({...t,width:9})),...data.activeTravel.links.map(t=>({...t,width:A.TYPES[t.type].width}))];
 const buildings=[...data.civic.lots.filter(l=>l.level>0),...data.civic.services.map(q=>({...q,width:24,depth:22})),...data.education.sites.map(q=>({...q,...Q.TYPES[q.type]})),...data.justice.sites.map(q=>({...q,...J.TYPES[q.type]})),...data.care.sites.map(q=>({...q,...K.TYPES[q.type]})),...data.industry.modules.map(q=>({...q,...X.MODULES[q.kind]})),...data.social.sites.map(q=>({...q,...R.TYPES[q.type]})),...data.parking.lots.map(q=>({...q,width:P.LOTS[q.type].w,depth:P.LOTS[q.type].h})),...data.transit.stations.map(q=>({...q,width:Math.max(20,(T.FACILITIES[q.type]?.radius||11)*2),depth:Math.max(20,(T.FACILITIES[q.type]?.radius||11)*2)})),...(data.transitService.taxiDepots||[]).map(q=>({...q,width:S.TAXI_DEPOT.w*2,depth:S.TAXI_DEPOT.h*2}))];
 return {cash:data.network.cash,roads,buildings,water:N.water,protected:p=>!!map.ridge&&map.ridge(p)>.67};
}
function earthPrice(q){return Math.round(q.cost*(techCosts().earthworkCost??1));}
function earthPlan(p){return F.plan(city.terrain,landSurface,{...p,tool:opts.earthMode,radius:opts.earthRadius,amount:opts.earthMode==='smooth'?opts.earthSmooth:opts.earthAmount,target:opts.earthTarget},{...earthOptions(),cash:city.network.cash/(techCosts().earthworkCost??1)});}
function earthShape(p){return {kind:'earth',closed:true,points:Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return {x:p.x+Math.cos(a)*opts.earthRadius,y:p.y+Math.sin(a)*opts.earthRadius};})};}
function earthSummary(q){return '挖方 '+format.format(q.cut||0)+' m³ · 填方 '+format.format(q.fill||0)+' m³'+(q.partial?' · 保留受保护部分':'');}
function renderEarthInfo(){
 const t=city.terrain.statistics;
 $('earth-stats').textContent=t.operations+' 项完成 · 累计土方 '+format.format(t.cut+t.fill)+' m³ · 已付 ¥'+format.format(t.cost);
}
$('earth-show').onclick=()=>setLayer('earth');
function zoneBox(a,b){return [a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];}
function frontagePlan(points){
 return opts.frontageMode==='region'?Z.region(city.network,zoneBox(points[0],points[1]),{isLand:onLand}):Z.route(city.network,points,{isLand:onLand});
}
function lotFootprint(q){
 const w=(q.width||14)/2,d=(q.depth||12)/2,c=Math.cos(q.angle||0),s=Math.sin(q.angle||0);
 return [[-w,-d],[w,-d],[w,d],[-w,d]].map(([x,y])=>({x:q.x+x*c-y*s,y:q.y+x*s+y*c}));
}
function constructionLots(tr,{point=null,width=0,depth=0,points=null,clearance=0,ground=true}){
 if(!point&&!points)return;
 const doomed=new Set();
 if(point){
  for(const l of tr.civic.lots){
   const [u,v]=[Math.cos(l.angle||0),Math.sin(l.angle||0)],w=(l.width||14)/2,d=(l.depth||12)/2;
   const dx=l.x-point.x,dy=l.y-point.y,a=width/2,b=depth/2;
   if(Math.abs(dx)>a+w*Math.abs(u)+d*Math.abs(v)||Math.abs(dy)>b+w*Math.abs(v)+d*Math.abs(u))continue;
   if(Math.abs(dx*u+dy*v)<=w+a*Math.abs(u)+b*Math.abs(v)&&Math.abs(-dx*v+dy*u)<=d+a*Math.abs(v)+b*Math.abs(u))doomed.add(l.id);
  }
 }else for(const id of Z.conflicts(tr.civic.lots,points,{clearance,grade:ground?4.7:100}).ids)doomed.add(id);
 if(!doomed.size)return;
 tr.civic.lots=tr.civic.lots.filter(l=>!doomed.has(l.id));
 const surviving=new Set(tr.civic.lots.map(l=>l.zoneId));tr.civic.zones=tr.civic.zones.filter(z=>surviving.has(z.id));
}
function cleanFrontage(tr,removedRoad){
 const near=p=>removedRoad.pts.slice(1).some((b,i)=>{
  const a=removedRoad.pts[i],dx=b.x-a.x,dy=b.y-a.y,t=N.clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);
  return Math.hypot(a.x+dx*t-p.x,a.y+dy*t-p.y)<3;
 });
 const lots=tr.civic.lots.filter(l=>!l.frontageAnchor||!near(l.frontageAnchor)||Z.snap(tr.network,l.frontageAnchor,{radius:3,isLand:onLand}));
 if(lots.length===tr.civic.lots.length)return;
 tr.civic.lots=lots;const keep=new Set(lots.map(l=>l.zoneId));tr.civic.zones=tr.civic.zones.filter(z=>keep.has(z.id));
}
function facilityClaim(tr,p,w,d){constructionLots(tr,{point:p,width:w,depth:d});}
function zoningOptions(){
 const tr=city,occupied=[
  ...tr.civic.services.map(s=>({...s,width:23,depth:21})),
  ...tr.education.sites.map(s=>({...s,...Q.TYPES[s.type]})),
  ...tr.justice.sites.map(s=>({...s,...J.TYPES[s.type]})),
  ...tr.care.sites.map(s=>({...s,...K.TYPES[s.type]})),...tr.industry.modules.map(s=>({...s,...X.MODULES[s.kind]})),...tr.social.sites.map(s=>({...s,...R.TYPES[s.type]})),
  ...tr.transit.stations.map(s=>({...s,width:Math.max(20,(T.FACILITIES[s.type]?.radius||11)*2),depth:Math.max(20,(T.FACILITIES[s.type]?.radius||11)*2)})),
  ...(tr.transitService?.taxiDepots||[]).map(s=>({...s,width:S.TAXI_DEPOT.w*2,depth:S.TAXI_DEPOT.h*2}))
 ];
 return {...roadOpts,requireFrontage:true,checkParcel:pts=>foundation(pts).ok,isBuildable:p=>roadOpts.isBuildable(p)&&!occupied.some(o=>Math.abs(o.x-p.x)<o.width/2&&Math.abs(o.y-p.y)<o.depth/2)};
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
const BATCH_LIMIT=24;
function withBuildCity(fn){
 if(!batch||buildDepth)return fn();
 const live=city,net=effective;buildDepth++;
 city=batch.world;effective=null;
 try{return fn();}finally{city=live;effective=net;buildDepth--;}
}
function clearBuildSelection(){activeResult=null;activeProbe=null;draft=[];hover=null;selected={};turnNode=null;turnEnter=null;turnPreview=null;}
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
  const li=document.createElement('li');li.textContent=(i+1)+'. '+p.title+' · ¥'+format.format(p.cash)+(p.info?' · '+p.info:'');return li;
 }));
 for(const id of ['batch-undo','batch-commit'])$(id).disabled=!batch.items.length;
}
function updateBatchScene(){if(batch)batch.scene=withBuildCity(showWorld);renderBatch();showTools();updatePreview();if(layer==='progress')withBuildCity(renderProgress);}
function discardBatch(){
 batch=null;clearBuildSelection();renderBatch();showTools();updatePreview();
 notify('已退出批量蓝图，未扣款');
}
$('batch-toggle').onclick=()=>{
 if(pending)return;
 if(batch){$('batch-review').scrollIntoView({block:'nearest'});return;}
 if(!checkCanSave())return;
 if(serviceOps&&serviceOwner===city)city.transitService=serviceOps.snapshot();
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
 if(!['land','research','finance'].includes(kind)&&geometry.kind!=='erase'){const gate=checkBuildAccess(kind,geometry,trial);if(!gate.ok)return notify(gate.reason,true);}
 if(geometry.foundation){
  const f=foundation(geometry.foundation);if(!f.ok)return notify(f.reason,true);
 }
 const activeIds=new Set(trial.civic.lots.map(l=>l.id)),released=city.civic.lots.filter(l=>!activeIds.has(l.id));
 if(released.length){
  const built=released.filter(l=>l.level>0).length;
  info+=(info?' · ':'')+'腾出 '+released.length+' 块已划地块'+(built?'（将拆除 '+built+' 栋已开发建筑）':'（尚未开发）');
 }
 const cash=city.network.cash-trial.network.cash;
 if(!batch&&kind!=='taxiDepot'&&serviceOps&&serviceOwner===city)trial.transitService=serviceOps.snapshot();
 if(batch){
  if(batch.items.length>=BATCH_LIMIT)return notify('单批最多 '+BATCH_LIMIT+' 项；可先确认这批或撤回最后一项',true);
  batch.items.push({prior:batch.world,title,kind,cash,geometry,info});batch.world=trial;batch.ghosts=batch.items.map(v=>v.geometry);
  clearBuildSelection();$('batch-discard').textContent='退出／放弃';
  // Refresh outside the planning context so the subtotal is computed against live cash.
  queueMicrotask(updateBatchScene);notify('已加入蓝图 · '+title);return;
 }
 pending={trial,geometry:{...geometry,valid:true},title,kind,cash,before:trafficBefore()};
 $('plan-title').textContent='待确认 · '+title;
 $('plan-apply').textContent=kind==='finance'?'确认交易':'确认施工';
 $('plan-cost').textContent=(kind==='finance'?'市库变动 '+moneyBadge(-cash):'施工费用 ¥'+format.format(Math.max(0,cash)))+' · 预计余额 ¥'+format.format(trial.network.cash)+(info?' · '+info:'');
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
 if(apply){city=p.trial;draft=[];hover=null;selected={};refresh();if(['road','bus','upgrade','erase','junction','active'].includes(p.kind))comparePlan(p.before);if(save())notify('已确认 · '+p.title);else notify(saveError,true);}
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
 if(tool==='parkLife'){
  const q=parkBuild(null,draft);if(!q.ok)return notify(q.reason,true);
  return beginPlan(q.tr,q,q.geometry,q.title,'parkLife',Math.round(q.length||0)+' 米 · 可与另一段步道相接');
 }
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
  if(draft.length!==2)return notify('请选两个位置：道路起终点，或框选对角',true);
  const match=frontagePlan(draft);if(!match.ok)return notify(match.reason,true);
  const zoneOpts=zoningOptions(),work=match.runs;
  geometry={kind:'frontage',points:[],strips:work,...(opts.frontageMode==='region'?{points:zoneBox(draft[0],draft[1]),closed:true}:{points:match.points})};
  const rows=work.map(points=>C.zoneFrontage(trial.civic,{type:opts.zone,points,depth:opts.depth,side:opts.side,density:+opts.density},roadsAt(),zoneOpts)).filter(x=>x.ok);
  r=rows.length?{ok:true,cost:rows.reduce((n,x)=>n+x.cost,0),lots:rows.flatMap(x=>x.lots)}:{ok:false,reason:'这些道路旁没有可划的空地，请换位置或调整纵深'};
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
 const hit=points.some(p=>Math.abs(p.z||0)<2.5&&(parkedLand(p,half)||campusLand(p,half)||justiceLand(p,half)||careLand(p,half)||taxiAt(p)||industryAt(p)||socialAt(p)));
 const permit=checkBuildAccess('road',{kind:'road',points,width:half*2},city);
 const geo=permit.ok?terrainRoad(points,N.profiles[opts.profile],half*2):permit;
 const r=hit?{ok:false,reason:'道路与已建设施冲突，请改线；分区本身不会阻挡'}:!geo.ok?geo:N.check(city.network,points,opts,[first,end]);
 const hits=new Map((r.hits||[]).filter(h=>N.dist(h.p,first)>2&&N.dist(h.p,end)>2).map(h=>[Math.round(h.p.x)+':'+Math.round(h.p.y),h.p]));
 const split=new Map((r.overpasses||[]).map(h=>[Math.round(h.p.x)+':'+Math.round(h.p.y),h]));
 return {r,geometry:{points,slope:geo.grade,overpasses:[...split.values()],kind:'road',control:guide,snapped:!!(end.node||end.edge),junctions:[...hits.values()],width:N.crossSection(N.profiles[opts.profile]).width,valid:r.ok}};
}
function completeRoad(end){
 const {r,geometry}=roadDraft(end);
 if(!r.ok){updatePreview();return notify(r.reason,true);}
 const trial=structuredClone(city);
 const result=N.add(trial.network,geometry.points,opts,[draft[0],end]);
 if(result.ok)constructionLots(trial,{points:geometry.points,clearance:geometry.width/2+.25});
 const grade=geometry.points.at(-1).z-geometry.points[0].z;
 const info=Math.round(N.length(geometry.points))+' m'+(geometry.slope?' · 地形纵坡 '+Math.round(geometry.slope*100)+'%':'')+(Math.abs(grade)>.5?' · 高差 '+(grade>0?'+':'')+Math.round(grade)+' m':'')+(geometry.junctions.length?' · 接入 '+geometry.junctions.length+' 处路口':'')+(geometry.overpasses.length?' · '+geometry.overpasses.length+' 处立体交叉（不接通）':'');
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
 const occupied=[...city.civic.services,...city.transit.stations,...city.education.sites,...city.justice.sites,...city.care.sites,...city.social.sites.map(q=>({...q,w:R.TYPES[q.type].width,h:R.TYPES[q.type].depth})),...(city.transitService.taxiDepots||[])];
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
 const {spec,access}=valid;facilityClaim(tr,p,spec.w,spec.h);const id='P'+tr.parking.next++;
 tr.parking.lots.push({id,type:opts.parkingType,x:p.x,y:p.y,fee});
 return {r:{ok:true,cost:spec.cost},g:{points:parkingOutline(p,spec),closed:true,parkNode:access.node,foundation:parkingOutline(p,spec)},
   title:'建造'+spec.label,more:spec.slots+' 位'+(spec.entry?' · 入口间隔 '+spec.entry+' 模拟秒':'')+' · 每月养护 ¥'+spec.monthly+' · 收费 ¥'+fee+'／次'};
}
function addInfraPlan(p){
 if(tool==='line')return joinStop(nearestAt(T.stopOptions(city.transit,opts.transitMode,transitOpts()),p,25));
 if(tool==='district'){if(draft.length>=48)return notify('特别区最多 48 个角',true);draft.push(p);return;}
 const tr=structuredClone(city);let r,g,title,more='';
 if(tool==='parking'){const spec=parkingPlan(p,tr);if(!spec.r)return notify(spec.reason,true);({r,g,title,more}=spec);}
 else if(tool==='station'){const f=T.FACILITIES[opts.stationType];r=T.addStation(tr.transit,{type:opts.stationType,...p},transitOpts());if(r.ok)facilityClaim(tr,p,Math.max(18,(f.radius||10)*2),Math.max(18,(f.radius||10)*2));g={points:[p],kind:'service',...(!f.wet&&!(f.mode==='ferry'||f.mode==='ship')?{foundation:padShape(p,Math.max(18,(f.radius||10)*2),Math.max(18,(f.radius||10)*2))}:{})};title=f.name;more='养护 ¥'+format.format(f.monthly)+'/月';}
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
  if(tool==='track'){const f=terrainRoad(points,{kind:'road'},8,opts.trackMode==='tram'?.10:.065);if(!f.ok)return notify(f.reason,true);r=T.addTrack(tr.transit,{mode:opts.trackMode,points},transitOpts());if(r.ok)constructionLots(tr,{points,clearance:4.5});title=T.MODES[opts.trackMode].name+'轨道';}
  else{r=U.add(tr.utilities,{type:opts.utilityType,points,budget:tr.network.cash});title=opts.utilityType==='water'?'铺设供水管':'铺设电网';}
 }
 if(!r?.ok)return notify(r?.reason||'无法建设',true);if(tr.network.cash<(r.cost||0))return notify('市库不足 · 需要 ¥'+format.format(r.cost),true);
 tr.network.cash-=r.cost||0;beginPlan(tr,r,g,title,tool,more);
}
let activeResult=null,activeProbe=null,activeTrips=[];
function activeOpts(){return {water:N.water,land:onLand,isLand:onLand,isBuildable:onLand,width:1200,height:800};}
function activePoint(p){
 const mode=opts.activeAction==='bike'||opts.activeAction==='build'&&opts.activeType==='bike'?'bike':'walk';
 return A.snap(city.activeTravel,city.network,{...p,z:0},{mode,radius:12/camera.zoom,ground:true})||{...p,z:0};
}
function activeClick(p){
 const q=activePoint(p);
 if(!draft.length){draft=[q];activeResult=null;notify('慢行起点已定');return;}
 const mode=opts.activeAction;
 if(mode!=='build'){
  const graph=A.build(city.activeTravel,effective||city.network);
  activeResult=A.route(graph,draft[0],q,mode);
  draft=[];
  activeProbe=activeResult?{...activeResult,mode,start:clock}:null;
  if(activeResult)notify((mode==='walk'?'步行 ':'骑行 ')+Math.round(activeResult.meters)+' 米 · '+Math.round(activeResult.seconds)+' 模拟秒'+(activeResult.usesDedicated?' · 经专用设施':' · 共用道路'));
  else notify('两点之间没有连续可达的慢行路线',true);
  return;
 }
 const trial=structuredClone(city),r=A.add(trial.activeTravel,trial.network,{type:opts.activeType,points:[draft[0],q],height:opts.activeHeight,approach:opts.activeApproach,snap:false},activeOpts());
 if(!r.ok)return notify(r.reason,true);
 if(r.cost>trial.network.cash)return notify('市库不足 · 需要 ¥'+format.format(r.cost),true);
 trial.network.cash-=r.cost;
 beginPlan(trial,r,{points:r.link.points,kind:'active',width:A.TYPES[r.link.type].width},'建设 '+A.TYPES[r.link.type].name,'active',Math.round(r.link.length)+' 米 · 仅慢行');
}
function pointerAction(p){return withBuildCity(()=>pointerActionWork(p));}
function pointerActionWork(p){
 if(pending)return;
 if(tool==='landTitle'){
  const tile=G.tileAt(city.progression,p);selectedTile=typeof tile==='string'?tile:tile?.id;
  if(!selectedTile)return notify('请选择地图上的土地',true);
  renderProgress();lastSignature='';return;
 }
 if(tool==='campusLife'){campusStart(p);updatePreview();hintDraft();return;}
 if(tool==='parkLife'){placeParkItem(p);updatePreview();hintDraft();return;}
 if(tool==='active'){activeClick(p);updatePreview();hintDraft();return;}
 if(tool==='junction'){const j=junction(p,2);if(!j)return notify('请选择有两段或以上道路的路口',true);turnNode=j.id;turnEnter=null;selected={junction:j.id};renderTurnEditor();return;}
 if(['utility','track','station','line','district','signal','parking'].includes(tool)){addInfraPlan(p);updatePreview();hintDraft();return;}
 if(tool==='road'){if(!draft.length){draft=[roadPoint(p,opts.startZ)];notify('已定起点；拖动地图不会落点');}else if(opts.shape==='curve'&&draft.length===1){draft.push(p);notify('已定控制点，点击终点');}else completeRoad(roadPoint(p,opts.endZ));}
 else if(tool==='frontage'){
  const q=opts.frontageMode==='region'?p:Z.snap(city.network,p,{radius:Math.max(12,24/camera.zoom),isLand:onLand});
  if(!q)return notify('请选择普通道路的地面路段',true);
  if(draft.length>=2)draft=[];
  draft.push(q);
  if(draft.length===2)return finishWork();
  notify(opts.frontageMode==='region'?'已选一角，请点击另一角':'已选起点，请点击目标道路的位置');
 }
 else if(tool==='bus'){let q=junction(p);if(q&&!city.network.edges.some(e=>e.kind==='road'&&(e.a===q.id||e.b===q.id)))q=null;q=q||groundRoad(p);
 if(!q)return notify('请点普通道路上的站点位置',true);if(draft.some(v=>N.dist(v,q)<8))return notify('这个站点已在当前线路中',true);draft.push(q);notify('已添加第 '+draft.length+' 站');}
 else if(tool==='social'){
  const tr=structuredClone(city),q=socialBuild(tr,p),k=R.TYPES[opts.socialType];
  if(!q.ok)return notify(q.reason,true);
  if(tr.network.cash<q.cost)return notify('市库不足',true);
  if(!R.add(tr.social,q))return notify('未能加入施工蓝图',true);
  tr.network.cash-=q.cost;const f=padShape(p,k.width,k.depth);
  beginPlan(tr,q,{kind:'service',points:f,closed:true,foundation:f},'建设 '+k.name,'social','运转 ¥'+format.format(k.monthly)+'／月');
 }
 else if(tool==='industry'){
  const tr=structuredClone(city),q=industryBuild(tr,p),sp=X.MODULES[opts.industryKind];
  if(!q.ok)return notify(q.reason,true);
  if(!X.add(tr.industry,q))return notify('未能加入施工蓝图',true);
  tr.network.cash-=q.cost;
  const f=padShape(p,sp.width,sp.depth);
  beginPlan(tr,q,{kind:'service',points:f,foundation:f,closed:true},'建造 '+industryName(q.module),'industry','采集／加工／出货均受实际运力限制');
 }
 else if(tool==='earth'){
  const q=earthPlan(p);if(!q.ok)return notify(q.reason,true);
  const tr=structuredClone(city);if(!F.apply(tr.terrain,q))return notify('地形已变，请重新报价',true);
  const price=earthPrice(q);tr.network.cash-=price;tr.terrain.statistics.cost-=q.cost-price;beginPlan(tr,q,earthShape(p),F.TOOLS[opts.earthMode].name,'earth',earthSummary(q));
 }
 else if(tool==='taxiDepot'){
  const tr=structuredClone(city);if(!batch&&serviceOps&&serviceOwner===city)tr.transitService=serviceOps.snapshot();
  if(tr.network.cash<S.TAXI_DEPOT.cost)return notify('市库不足',true);
  if(parkedLand(p,11)||campusLand(p,10)||justiceLand(p,10)||careLand(p,10))return notify('设施占地重叠',true);
  const draft=makeService(tr,commuteMap?.lines||[],tr.network),res=draft.addTaxiDepot(p);
  if(!res.ok)return notify(res.reason,true);
  tr.network.cash-=res.cost;facilityClaim(tr,p,S.TAXI_DEPOT.w*2,S.TAXI_DEPOT.h*2);tr.transitService=draft.snapshot();
  beginPlan(tr,res,{...taxiShape(p),foundation:taxiShape(p).points},'建造出租车场','taxiDepot',S.TAXI_DEPOT.cars+' 辆车 · ¥'+S.TAXI_DEPOT.monthly+'／月');
 }
 else if(tool==='careBuild'){
  const tr=structuredClone(city),q0=K.TYPES[opts.careType];facilityClaim(tr,p,q0.width+4,q0.depth+4);const plan=K.plan(tr.care,tr,{...p,type:opts.careType},careBuildOpts(tr));
  if(!plan.ok)return notify(plan.reason,true);
  if(tr.network.cash<plan.cost)return notify('市库不足 · 需要 ¥'+format.format(plan.cost),true);
  if(!K.add(tr.care,plan))return notify('未能加入施工蓝图',true);
  tr.network.cash-=plan.cost;const q=K.TYPES[opts.careType];
  beginPlan(tr,plan,{...careShape(p,opts.careType),foundation:careShape(p,opts.careType).points},'建设 '+q.name,'careBuild','基准运营 ¥'+format.format(q.monthly)+'／月');
 }
 else if(tool==='justiceBuild'){
  const tr=structuredClone(city),q0=J.TYPES[opts.justiceType];facilityClaim(tr,p,q0.width+3,q0.depth+3);const plan=justiceCandidate(tr,p);
  if(!plan.ok)return notify(plan.reason,true);
  if(tr.network.cash<plan.cost)return notify('市库不足 · 需要 ¥'+format.format(plan.cost),true);
  if(!J.add(tr.justice,plan))return notify('未能加入施工蓝图',true);
  tr.network.cash-=plan.cost;const q=J.TYPES[opts.justiceType];
  beginPlan(tr,plan,{...justiceShape(p,opts.justiceType),foundation:justiceShape(p,opts.justiceType).points},'建设 '+q.name,'justiceBuild','运转 ¥'+format.format(q.monthly)+'／月');
 }
 else if(tool==='schoolBuild'){
  const tr=structuredClone(city),q0=Q.TYPES[opts.schoolType];facilityClaim(tr,p,q0.width+4,q0.depth+4);const r=Q.add(tr.education,tr,{...p,type:opts.schoolType,funding:opts.schoolFunding},schoolOpts(tr));
  if(!r.ok)return notify(r.reason,true);
  tr.network.cash-=r.cost;
  beginPlan(tr,r,{...schoolGeometry(p,opts.schoolType),foundation:schoolGeometry(p,opts.schoolType).points},'建设 '+Q.TYPES[opts.schoolType].name,'schoolBuild',r.capacity+' 位 · ¥'+format.format(r.monthly)+'／月');
 }
 else if(tool==='service'){
  if(!onLand(p)||campusLand(p,11)||justiceLand(p,11)||careLand(p,11))return notify('设施需要陆地，且不能和校区重叠',true);
  const trial=structuredClone(city);facilityClaim(trial,p,25,25);const r=C.addService(trial.civic,{type:opts.service,...p,...roadOpts},roadsAt(),roadOpts);
  if(!r.ok)return notify(r.reason,true);
  if(trial.network.cash<r.cost)return notify('市库不足 · 需要 ¥'+format.format(r.cost),true);
  trial.network.cash-=r.cost;
  const def=C.SERVICES[opts.service],loc={...p,z:0};
  beginPlan(trial,r,{points:[loc],kind:'service',foundation:padShape(p,25,25)},'建设 '+(serviceNames[opts.service]||def.name),'service','养护 ¥'+format.format(def.monthly)+' / 月');
 }
 else if(tool==='inspect'){
  const building=layer==='campuses'&&campusAt(p);if(building){selected={campus:building.id};renderDetails();return;}
  const park=layer==='parks'&&parkHit(p);if(park){selected={park:park.id};renderDetails();return;}
  const v=socialAt(p);if(v){selected={social:v.id};renderDetails();return;}
  const module=industryAt(p);if(module){selected={industry:module.id};renderDetails();return;}
  const h=careAt(p);if(h){selected={care:h.id};renderDetails();return;}
  const j=justiceAt(p);if(j){selected={justice:j.id};renderDetails();return;}
  const school=schoolAt(p);if(school){selected={school:school.id};renderDetails();return;}
  if(layer==='active'){
   const link=nearestPolyline(city.activeTravel.links,p,15);
   if(link){selected={active:link.id};renderDetails();return;}
  }
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
    const v=layer==='social'&&socialAt(p);
    if(v){const tr=structuredClone(city),k=R.TYPES[v.type];if(!R.remove(tr.social,v.id))return notify('设施仍在使用，暂不能拆除',true);
     beginPlan(tr,{ok:true},{kind:'erase',points:padShape(v,k.width,k.depth),closed:true},'拆除 '+k.name,'social','无退款');return;}
    const module=layer==='industry'&&industryAt(p);
    if(module){
     const tr=structuredClone(city),sp=X.MODULES[module.kind];if(!X.remove(tr.industry,module.id))return notify('库存尚未清空，不能拆除',true);
     beginPlan(tr,{ok:true},{kind:'erase',points:padShape(module,sp.width,sp.depth),closed:true},'拆除 '+industryName(module),'industry','无退款');return;
    }
    const x=layer==='serviceOps'&&taxiAt(p);
    if(x){const tr=structuredClone(city);if(!batch&&serviceOps&&serviceOwner===city)tr.transitService=serviceOps.snapshot();const draft=makeService(tr,commuteMap?.lines||[],tr.network);
     const removed=draft.removeTaxiDepot(x.id);if(!removed.ok)return notify(removed.reason,true);
     tr.transitService=draft.snapshot();beginPlan(tr,{ok:true},taxiShape(x),'拆除出租车场','taxiDepot','无退款');return;}
    const wing=layer==='campuses'&&campusAt(p);
    if(wing){const tr=structuredClone(city),d=CL.ASSETS[wing.type];CL.remove(tr.campus,wing.id);
     return beginPlan(tr,{ok:true},{kind:'erase',points:padShape(wing,d.width,d.depth),closed:true},'拆除 '+d.name,'erase','无退款；下月重新评估学位与科研');}
    const feature=layer==='parks'&&parkHit(p);
    if(feature){
     const tr=structuredClone(city);PL.remove(tr.parks,feature.id);
     return beginPlan(tr,{ok:true},{kind:'erase',points:feature.points||parkFoot(feature,feature.type),closed:!feature.points},'拆除 '+(PL.ASSETS[feature.type]?.name||PL.PATHS[feature.type]?.name),'erase','无退款；可能切断游客通路');
    }
    const h=layer==='care'&&careAt(p);
    if(h){const tr=structuredClone(city);if(!K.remove(tr.care,h.id))return notify('此医院还有住院患者，暂不能拆除',true);
     beginPlan(tr,{ok:true},careShape(h,h.type),'拆除 '+K.TYPES[h.type].name,'careBuild','无退款');return;}
    const j=layer==='justice'&&justiceAt(p);
    if(j){const tr=structuredClone(city);if(!J.remove(tr.justice,j.id))return notify('此设施还有待安置人员，暂不能拆除',true);
     beginPlan(tr,{ok:true},justiceShape(j,j.type),'拆除 '+J.TYPES[j.type].name,'justiceBuild','无退款；城市下月更新可用处理能力');return;}
    const s=['campuses','schoolAccess'].includes(layer)&&schoolAt(p);
    if(s){const tr=structuredClone(city),campus=tr.campus.campuses.find(q=>q.siteId===s.id);if(campus&&!CL.release(tr.campus,campus.districtId))return notify('主楼仍有院系和设施，请先在校园图层拆除配套',true);Q.remove(tr.education,s.id);beginPlan(tr,{ok:true},schoolGeometry(s,s.type),'拆除 '+Q.TYPES[s.type].name,'schoolBuild','无退款；下月重新分配原在读学生');return;}
    const active=layer==='active'&&nearestPolyline(city.activeTravel.links,p,16);
    if(active){
     const tr=structuredClone(city);A.remove(tr.activeTravel,active.id);
     beginPlan(tr,{ok:true},{points:active.points,kind:'erase'},'拆除 '+A.TYPES[active.type].name,'erase','慢行路线可能中断');return;
    }
    const parking=['traffic','parking'].includes(layer)&&parkingHit(p);
    if(parking){
     const t=structuredClone(city);t.parking.lots=t.parking.lots.filter(l=>l.id!==parking.id);const spec=P.LOTS[parking.type];
     beginPlan(t,{ok:true},{points:parkingOutline(parking,spec),closed:true,kind:'erase',parkNode:P.access(city.network,parking)?.node},'拆除'+spec.label,'erase','不返还造价，取消停车容量和月养护');return;
    }
    const u=['water','power'].includes(layer)&&nearestPolyline(city.utilities.lines.filter(l=>l.type===layer),p),d=layer==='districts'&&city.districts.districts.find(q=>inPoly(p,q.points)),st=layer==='routes'&&(nearestAt(city.transit.stations,p)||nearestPolyline(city.transit.tracks,p));
    if(u||d||st){if(d&&city.industry.modules.some(q=>q.districtId===d.id))return notify('先清空并拆除区内产业设施',true);const tr=structuredClone(city);if(d&&tr.campus.campuses.some(q=>q.districtId===d.id)&&!CL.release(tr.campus,d.id))return notify('大学区仍有校内配套，先拆除配套再取消边界',true);if(d&&tr.parks.parks.some(q=>q.districtId===d.id)&&!PL.release(tr.parks,d.id))return notify('此公园尚有道路或设施，请在公园图层拆除后再撤销边界',true);let r=st?T.remove(tr.transit,st.id):{ok:u?U.remove(tr.utilities,u.id):D.remove(tr.districts,d.id).ok};const hit=u||d||st;beginPlan(tr,r,{points:hit.points||[hit],closed:!!d,kind:'erase'},'拆除 '+(d?'特别区':u?'水电线路':'枢纽／轨道'),'erase');return;}
   }
   const e=edgeAt(p);if(!e)return notify('未选中道路；请在相关图层上拆除设施',true);
   const trial=structuredClone(city);let r;
   if(tool==='erase'){N.remove(trial.network,e.id);cleanFrontage(trial,e);r={ok:true};}
   else {r=N.upgrade(trial.network,e.id,opts);if(r.ok)constructionLots(trial,{points:e.pts,clearance:N.crossSection(N.profiles[opts.profile]).width/2+.25});}
   const modified=trial.network.edges.find(q=>q.id===e.id),flipped=modified?.a!==e.a&&tool==='upgrade';
   const info=tool==='erase'?'可能切断公交和服务；无道路可依附的新沿街地块会撤销':flipped?'反转单行方向；失效的转向规则将移除':'仅在确认后更新道路';
   beginPlan(trial,r,{points:modified?.pts||e.pts,kind:tool,width:tool==='upgrade'?N.crossSection(N.profiles[opts.profile]).width:undefined,arrow:tool==='upgrade'&&modified?.oneway},tool==='erase'?'拆除道路':flipped?'反转单行方向':'道路改造',tool,info);
 }
 updatePreview();hintDraft();
}
function laborBuildingInfo(l){
 const state=L.report(city.labor),w=state.byWork?.[l.id],h=state.byHome?.[l.id];
 if(h)return [['已计入劳动人口',h.workers],['本月求职',h.unemployed],['本月工资','¥'+format.format(h.payroll)]];
 if(!w)return [];
 return Object.entries(L.ROLES).filter(([k])=>w.slots?.[k]).map(([k,r])=>[r.name,w.filled[k]+' / '+w.slots[k]+' 位 · ¥'+format.format(w.wage[k])+'／人']);
}
function renderDetails(){
 const n=city.network,e=n.edges.find(e=>e.id===selected.edge),z=city.civic.zones.find(z=>z.id===selected.zone),f=city.civic.services.find(s=>s.id===selected.service);
 const txt=$('details');
 if(selected.campus){
  const q=campusAssets().find(x=>x.id===selected.campus);
  if(q){const d=CL.ASSETS[q.type];txt.innerHTML=lines([['大学配套',d.name],['额定容量',d.capacity||0],['额定教职或运营席位',d.jobs||0],['编号',clean(q.id)]]);return;}
 }
 if(selected.park){
  const q=city.parks.parks.flatMap(q=>[...q.assets,...q.paths]).find(q=>q.id===selected.park);
  if(q){const t=PL.ASSETS[q.type]||PL.PATHS[q.type];txt.innerHTML=lines([['公园设施',t.name],['编号',clean(q.id)],['容量',t.capacity||0],...(q.points?[['步道长度',wellNum(q.length)+' 米']]:[]),...(q.type==='gate'?[['入口',q.open?'开放':'关闭']]:[])]);return;}
 }
 if(selected.social){
  const v=(socialReport?.sites||[]).find(q=>q.id===selected.social);
  if(v){txt.innerHTML=lines([['设施',R.TYPES[v.type].name],['经费',v.funding+'%'],['使用／容量',(v.used??v.occupied??0)+'／'+(v.capacity||0)],['状态',clean(R.REASONS[v.reason]||(v.connected?'已连通':'未接通'))]]);return;}
 }
 if(selected.industry){
  const m=city.industry.modules.find(x=>x.id===selected.industry),q=industryReport?.modules?.find(x=>x.id===selected.industry);
  if(m){txt.innerHTML=lines([['产业设施',industryName(m)],['岗位',(q?.staff||0)+'／'+(q?.jobs||0)],['库存',productCount(m.buffer)],['发货',q?.shipped||0],['状态',clean(X.REASONS[q?.reason]||'推进月份后结算')]]);return;}
 }
 if(selected.care){
  const q=(K.report(city.care,city,careOpts()).sites||[]).find(s=>s.id===selected.care);
  if(q){txt.innerHTML=lines([['设施',K.TYPES[q.type].name],['经费',q.funding+'%'],['已用／容量',(q.stockMax>0?q.deployed||0:q.used||0)+' / '+(q.stockMax>0?q.lastCapacity||q.capacity||0:q.capacity||0)],...(q.stockMax>0?[['下月可用队伍',q.capacity],['补给',q.stock+' / '+q.stockMax]]:[]),['道路接驳',q.connected?'已接通':'未接通']]);return;}
 }
 if(selected.justice){
  const q=(J.report(city.justice,city,{network:effective||city.network,water:N.water}).sites||[]).find(s=>s.id===selected.justice);
  if(q){txt.innerHTML=lines([['设施',J.TYPES[q.type].name],['经费',q.funding+'%'],['可用处理量',q.capacity],['已占用／已使用',q.used],['道路接驳',q.connected?'已接通':'未接通']]);return;}
 }
 if(selected.school){
  const q=city.education.sites.find(s=>s.id===selected.school),r=Q.report(city.education).sites.find(s=>s.id===selected.school);
  if(q){txt.innerHTML=lines([['学校',Q.TYPES[q.type].name],['当前运营经费',q.funding+'%'],['上月学位',r?r.enrolled+' / '+r.capacity:'未结算'],['上月接驳',r?(r.connected?'已通':'未通'):'未结算']]);return;}
 }
 if(selected.active){const a=city.activeTravel.links.find(x=>x.id===selected.active);if(a){txt.innerHTML=lines([['设施',A.TYPES[a.type].name],['长度',Math.round(a.length)+' 米'],['用途',A.TYPES[a.type].modes.includes('bike')?'骑行':'步行']]);return;}}
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
 if(selected.lot){const l=city.civic.lots.find(l=>l.id===selected.lot);if(l){const sec=E.sector(l),v=econ.lots[l.id],m=metrics.lots[l.id];txt.innerHTML=lines([['业态',sec.name],['容量',m?.capacity||0],['岗位',v?.jobs||0],['在岗',L.report(city.labor).byWork?.[l.id]?.employees??v?.employees??0],['人口',v?.population||0],...(l.type==='residential'&&L.report(city.labor).byHome?.[l.id]?[['就业',L.report(city.labor).byHome[l.id].employed+' 人']]:[]),...(l.type==='residential'&&Q.report(city.education).byLot[l.id]?[['通学',Q.report(city.education).byLot[l.id].enrolled+' 人上学 · '+Q.report(city.education).byLot[l.id].waiting+' 人候补']]:[]),['产出',Object.entries(v?.output||{}).map(([k,n])=>(E.PRODUCTS[k]?.name||k)+' '+format.format(n)).join('／')||'—'],...laborBuildingInfo(l),...careerBuildingInfo(l),...wellbeingBuildingInfo(l),['发展',m?.reason||'—']]);return;}}
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
 if(tool==='active'){
  if(activeResult){preview={points:activeResult.points,kind:'active',valid:true};label(Math.round(activeResult.meters)+' 米 · '+Math.round(activeResult.seconds)+' 模拟秒');return;}
  if(hover){
   const q=activePoint(hover);
   if(!draft.length){preview={points:[q],kind:'active'};label('点选慢行起点');return;}
   if(opts.activeAction==='build'){
    const r=A.plan(city.activeTravel,city.network,{type:opts.activeType,points:[draft[0],q],height:opts.activeHeight,approach:opts.activeApproach,snap:false},activeOpts());
    preview={points:r.link?.points||[draft[0],q],kind:'active',width:A.TYPES[opts.activeType].width,valid:r.ok};
    label(r.ok?Math.round(r.link.length)+' 米 · ¥'+format.format(r.cost):r.reason,!r.ok);return;
   }
   preview={points:[draft[0],q],kind:'active'};label('点选终点，系统检查是否可达');return;
  }
 }
 if(tool==='campusLife'&&hover){
  const d=CL.ASSETS[opts.campusAsset],z=campusZones().find(q=>q.id===opts.campusDistrict),f=padShape(hover,d.width,d.depth),ok=!!z&&f.every(p=>onLand(p)&&D.inPolygon(p,z.points));
  preview={kind:'service',points:f,closed:true,valid:ok};label(ok?d.name+' · ¥'+format.format(d.cost):'选择院内可建设地面',!ok);return;
 }
 if(tool==='parkLife'){
  if(!opts.parkDistrict){preview=null;label('请先到公园管理启用一处公园区。');return;}
  if(opts.parkMode==='path'&&draft.length){const points=hover?[...draft,{x:hover.x,y:hover.y,z:0}]:draft;preview={kind:'active',points,width:PL.PATHS[opts.parkPath].width};label('选了 '+draft.length+' 点 · 点击完成公园步道审核');return;}
  if(hover&&opts.parkMode==='asset'){const d=PL.ASSETS[opts.parkAsset],z=parkZones().find(q=>q.id===opts.parkDistrict),ok=!!z&&onLand(hover)&&D.inPolygon(hover,z.points);
   preview={kind:'service',points:parkFoot(hover,opts.parkAsset),closed:true,valid:ok};label(ok?d.name+' · ¥'+format.format(d.cost):'选择当前公园区内的陆地',!ok);return;}
 }
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
 if(tool==='frontage'&&draft.length&&hover){
  const p=opts.frontageMode==='region'?hover:Z.snap(city.network,hover,{radius:Math.max(12,24/camera.zoom),isLand:onLand});
  if(!p){preview={points:[draft[0]],kind:'frontage'};label('请选择可用地面道路');return;}
  const q=frontagePlan([draft[0],p]);
  preview=opts.frontageMode==='region'?{points:zoneBox(draft[0],p),closed:true,strips:q.segments?.map(s=>s.points),kind:'frontage',valid:q.ok}:
   {points:q.points||[draft[0],p],kind:'frontage',valid:q.ok};
  label(q.ok?q.segments.length+' 段街道 · '+Math.round(q.length)+' m':q.reason,!q.ok);return;
 }
 if(draft.length){
  let pts=[...draft];if(hover&&['polygon','frontage','utility','track','district'].includes(tool))pts.push(tool==='track'?trackPoint(hover):tool==='frontage'?groundRoad(hover)||hover:hover);
  preview={points:pts,valid:true,kind:tool==='track'?'road':tool,closed:['polygon','district'].includes(tool)&&pts.length>2};label();return;
 }
 if(tool==='social'&&hover){
  const tr={...city,civic:{...city.civic,lots:city.civic.lots}},q=socialBuild(tr,hover),k=R.TYPES[opts.socialType];
  preview={kind:'service',points:padShape(hover,k.width,k.depth),closed:true,valid:q.ok};
  label(q.ok?k.name+' · ¥'+format.format(q.cost):q.reason,!q.ok);return;
 }
 if(tool==='industry'&&hover){
  const tr={...city,civic:{...city.civic,lots:city.civic.lots}},q=industryBuild(tr,hover),s=X.MODULES[opts.industryKind];
  preview={kind:'service',points:padShape(hover,s.width,s.depth),closed:true,valid:q.ok};
  label(q.ok?industryName(q.module)+' · ¥'+format.format(q.cost):q.reason,!q.ok);return;
 }
 if(tool==='earth'&&hover){
  const q=earthPlan(hover);preview={...earthShape(hover),valid:q.ok};
  label(q.ok?'¥'+format.format(earthPrice(q))+' · '+earthSummary(q)+' · 当前 '+Math.round(F.height(city.terrain,landSurface,hover))+' m':q.reason,!q.ok);return;
 }
 if(tool==='taxiDepot'&&hover){preview={...taxiShape(hover),valid:onLand(hover)&&hasRoad(hover,S.TAXI_DEPOT.access,city.network)};label('出租车场 · ¥'+format.format(S.TAXI_DEPOT.cost));return;}
 if(tool==='careBuild'&&hover){
  const q=K.TYPES[opts.careType],tr={...city,civic:{...city.civic,lots:city.civic.lots}};facilityClaim(tr,hover,q.width+4,q.depth+4);const r=K.plan(tr.care,tr,{...hover,type:opts.careType},careBuildOpts(tr));
  preview={...careShape(hover,opts.careType),valid:r.ok};label(r.ok?'¥'+format.format(r.cost):r.reason,!r.ok);return;
 }
 if(tool==='justiceBuild'&&hover){
  const q=J.TYPES[opts.justiceType],tr={...city,civic:{...city.civic,lots:city.civic.lots}};facilityClaim(tr,hover,q.width+3,q.depth+3);const r=justiceCandidate(tr,hover);
  preview={...justiceShape(hover,opts.justiceType),valid:r.ok};label(r.ok?'¥'+format.format(r.cost):r.reason,!r.ok);return;
 }
 if(tool==='schoolBuild'&&hover){
  const q=Q.TYPES[opts.schoolType],tr={...city,civic:{...city.civic,lots:city.civic.lots}};facilityClaim(tr,hover,q.width+4,q.depth+4);const r=Q.plan(tr.education,tr,{...hover,type:opts.schoolType,funding:opts.schoolFunding},schoolOpts(tr));
  preview={...schoolGeometry(hover,opts.schoolType),valid:r.ok};
  label(r.ok?r.capacity+' 位 · ¥'+format.format(r.cost):r.reason,!r.ok);return;
 }
 preview=hover&&tool==='service'?{points:[hover],valid:onLand(hover),kind:'service'}:null;label();
}
let terrainViewCache=null;
function terrainScene(){
 if(!terrainActive())return null;
 if(terrainViewCache?.state===city.terrain)return terrainViewCache;
 const heights=[],spacing=14;
 for(let y=spacing/2;y<800;y+=spacing)for(let x=spacing/2;x<1200;x+=spacing){
  const p={x,y};if(N.water(p))continue;
  const h=F.height(city.terrain,landSurface,p),g=F.gradient(city.terrain,landSurface,p);
  if(Math.abs(h)>.1||Math.abs(g.dx??g.x??0)>.018)heights.push({x,y,h,shade:g.dx??g.x??0});
 }
 return terrainViewCache={state:city.terrain,heights,spacing,contours:F.contours(city.terrain,landSurface,{spacing:14,interval:5}).filter(q=>!N.water(q.a)&&!N.water(q.b))};
}
function showWorld(){
 const n=city.network,by=new Map(),parcels=new Map();
 for(const q of city.civic.lots){if(!parcels.has(q.zoneId))parcels.set(q.zoneId,[]);parcels.get(q.zoneId).push({...q,footprint:lotFootprint(q)});}
 for(let l of city.civic.lots){if(!by.has(l.zoneId))by.set(l.zoneId,[]);if(l.level>0)by.get(l.zoneId).push({...l,w:l.width,d:l.depth});}
 return {...n,campus:campusAssets(),parks:city.parks.parks,terrain:terrainScene(),activeTravel:city.activeTravel.links,parking:city.parking.lots,buses:(effective||n).buses,utilities:city.utilities.lines,transit:city.transit,transitGates:T.gates(transitOpts()),roadGates:M.gates(mapId),districts:city.districts.districts,zones:city.civic.zones.map(z=>({...z,poly:z.polygon||z.poly||[],parcels:parcels.get(z.id)||[],buildings:by.get(z.id)||[]})),services:[...city.civic.services.map(s=>({...s,radius:130})),...city.education.sites.map(s=>({...s,type:'edu-'+s.type,radius:0})),...city.justice.sites.map(s=>({...s,type:'jst-'+s.type,radius:0})),...city.care.sites.map(s=>({...s,type:'csr-'+s.type,radius:0})),...city.industry.modules.map(s=>({...s,type:'ina-'+s.kind,radius:0})),...city.social.sites.map(s=>({...s,type:'soc-'+s.type,radius:0})),...(city.transitService?.taxiDepots||[]).map(s=>({...s,type:'taxi-depot',radius:0}))]};
}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const fingers=new Map();let touchGesture=null;
function screenPoint(x,y){const r=canvas.getBoundingClientRect();return {x:x-r.left,y:y-r.top};}
function touchCenter(){
 const a=[...fingers.values()],first=a[0],second=a[1]||first;
 return {x:(first.x+second.x)/2,y:(first.y+second.y)/2,d:Math.hypot(first.x-second.x,first.y-second.y),angle:Math.atan2(second.y-first.y,second.x-first.x)};
}
function beginTouch(moved=false){
 const c=touchCenter();
 touchGesture={...c,last:c,zoom:camera.zoom,world:view.screenToWorld(screenPoint(c.x,c.y),camera),moved:moved||fingers.size>1||panMode};
}
canvas.addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch'){
  fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);
  beginTouch();if(touchGesture.moved){hover=null;updatePreview();}return;
 }
 if(e.button<0||e.button>2)return;
 const moved=e.button!==0||e.shiftKey||panMode;
 drag={id:e.pointerId,world:atPoint(e),x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved,orbit:e.button===2&&!e.shiftKey};
 canvas.setPointerCapture(e.pointerId);
 if(moved){canvas.style.cursor='grabbing';hover=null;updatePreview();}

});
canvas.addEventListener('pointermove',e=>{
 if(fingers.has(e.pointerId)){
  fingers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const c=touchCenter(),g=touchGesture;
  if(g.moved||Math.hypot(c.x-g.x,c.y-g.y)>7){
   g.moved=true;hover=null;updatePreview();
   if(mode3d){
    const b=g.last;
    if(fingers.size>1&&c.d>=10&&b.d>=10){
     renderer3d.pan(c.x-b.x,c.y-b.y);
     renderer3d.zoom(c.d/b.d,screenPoint(c.x,c.y));
     const d=Math.atan2(Math.sin(c.angle-b.angle),Math.cos(c.angle-b.angle));
     renderer3d.orbit(d*140,0);
    }else if(orbitTouch&&!panMode)renderer3d.orbit(c.x-b.x,c.y-b.y);
    else renderer3d.pan(c.x-b.x,c.y-b.y);
    g.last=c;sync3dZoom();return;
   }
   if(c.d>0&&g.d>0)camera.zoom=N.clamp(g.zoom*c.d/g.d,.53,3.2);
   const here=view.screenToWorld(screenPoint(c.x,c.y),camera);
   camera.x+=g.world.x-here.x;camera.y+=g.world.y-here.y;
  }return;
 }
 if(e.pointerType==='touch')return;
 if(drag&&drag.id===e.pointerId){
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<=5)return;
  drag.moved=true;canvas.style.cursor='grabbing';hover=null;
  if(mode3d){
   const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;
   if(drag.orbit)renderer3d.orbit(dx,dy);else renderer3d.pan(dx,dy);
   drag.lastX=e.clientX;drag.lastY=e.clientY;sync3dZoom();
  }else{const p=atPoint(e);camera.x+=drag.world.x-p.x;camera.y+=drag.world.y-p.y;}
  updatePreview();
 }else{hover=atPoint(e);updatePreview();}
});
canvas.addEventListener('pointerleave',()=>{hover=null;updatePreview();});
function releasePointer(e,cancelled=false){
 if(fingers.has(e.pointerId)){
  const tap=!cancelled&&fingers.size===1&&!touchGesture.moved;
  fingers.delete(e.pointerId);
  if(fingers.size)beginTouch(true);else touchGesture=null;
  if(tap){const hit=atPoint(e);canvas.focus({preventScroll:true});if(hit)pointerAction(hit);}else if(mode3d)scenePreference();
 }else if(drag?.id===e.pointerId){
  const d=drag;drag=null;canvas.style.cursor=panMode?'grab':'';
  if(!cancelled&&!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<=5){
   hover=atPoint(e);canvas.focus({preventScroll:true});if(hover)pointerAction(hover);
  }else {if(mode3d)scenePreference();updatePreview();}
 }
}
canvas.addEventListener('pointerup',e=>releasePointer(e));canvas.addEventListener('pointercancel',e=>releasePointer(e,true));
canvas.addEventListener('lostpointercapture',e=>{if(fingers.has(e.pointerId)||drag?.id===e.pointerId)releasePointer(e,true);});
function zoom(z,p){if(mode3d){renderer3d.zoom(z,p);sync3dZoom();scenePreference();}else camera.zoom=N.clamp(camera.zoom*z,.53,3.2);}
canvas.addEventListener('wheel',e=>{e.preventDefault();if(mode3d){zoom(Math.exp(-e.deltaY*.0015),screenPoint(e.clientX,e.clientY));return;}let a=atPoint(e);zoom(Math.exp(-e.deltaY*.0015));let b=atPoint(e);camera.x+=a.x-b.x;camera.y+=a.y-b.y;},{passive:false});
$('pan').onclick=()=>{panMode=!panMode;$('pan').setAttribute('aria-pressed',String(panMode));canvas.style.cursor=panMode?'grab':'';};
$('zoom-in').onclick=()=>zoom(1.25);$('zoom-out').onclick=()=>zoom(.8);$('home').onclick=()=>{camera={x:600,y:400,zoom:1};if(mode3d){renderer3d.reset(scenicCamera());sync3dZoom();scenePreference();}};
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
 if(mode3d&&['q','e','r','f'].includes(e.key.toLowerCase())){
  e.preventDefault();const k=e.key.toLowerCase();orient(k==='q'?-34:k==='e'?34:0,k==='r'?-22:k==='f'?22:0);return;
 }
 if(e.key.startsWith('Arrow')&&mode3d){
  e.preventDefault();renderer3d.pan(e.key==='ArrowRight'?-25:e.key==='ArrowLeft'?25:0,e.key==='ArrowDown'?-25:e.key==='ArrowUp'?25:0);scenePreference();return;
 }
 if(e.key.startsWith('Arrow')){e.preventDefault();camera.x+=e.key==='ArrowRight'?32:e.key==='ArrowLeft'?-32:0;camera.y+=e.key==='ArrowDown'?32:e.key==='ArrowUp'?-32:0;}
});
function balanceInputs(){
 const t=metrics.totals||{},f=forecast,existing=metrics.services||{};
 const projected=K.responders(city.care,city);
 const services=projected.length&&['standard','challenge'].includes(city.balance.mode)?
  C.evaluate({...city.civic,services:[...city.civic.services,...projected]},activeRoads,civicOptions()).services:existing;
 const coverage=type=>{
  const counts=utilityMetrics?.types?.[type];
  if(counts?.managed)return (counts.reliableLots||0)/Math.max(1,t.developedLots||0);
  return services?.[type]?.coverage||0;
 };
 const labor=L.report(city.labor).totals,staff=industryReport?.total?.staff||0,scientists=Object.values(socialReport?.researchByHome||{}).reduce((a,v)=>a+(typeof v==='number'?v:Number(v.vocational||0)+Number(v.university||0)),0);
 return {mapGrant:map.grant,baseGrant:grant,baseNet:f.baseNet,cash:city.network.cash,population:t.population||0,employed:(labor?.employed||0)+staff+scientists,
  roadMetres:Math.round(city.network.edges.reduce((x,e)=>x+e.len,0)),ownedTiles:city.progression.owned.length,starterTiles:G.START[mapId]?.length??5,debt:city.finance.debt,
  serviceCoverage:Object.fromEntries(['water','power','fire','clinic'].map(k=>[k,coverage(k)])),
  expenses:{road:f.road,bus:f.bus,infra:f.infra,parking:f.parking,walking:f.walking,social:f.social,care:f.care,justice:f.justice,school:f.school,
   basicServices:['water','power','fire','clinic'].reduce((n,k)=>n+(services?.[k]?.monthly||0),f.infra),civic:t.expense||0,interest:f.interest,principal:f.principal,
   advanced:Math.max(0,-f.transit)+Math.max(0,-f.district),transit:Math.max(0,-f.transit)}};
}
function moneyBadge(n){return (n<0?'−':'')+'¥'+format.format(Math.abs(n||0));}
function showBudgetSignal(){
 const q=forecast?.balance,b=$('cash-runway');if(!q)return;
 const f=forecast.finance,run=forecast.net<0?Math.floor(Math.max(0,city.network.cash)/Math.max(1,-forecast.net)):q.runway;
 const severity=(f.overdue>0||f.severity==='critical'||run!==null&&run<2)?'critical':(q.severity!=='stable'||run!==null&&run<6)?'watch':'stable';
 const state=severity==='critical'?'紧张':severity==='watch'?'留意':'稳定';
 b.hidden=severity==='stable';b.dataset.severity=severity;
 b.textContent=f.overdue>0?'预计部分债务逾期':run===null?'财政 '+state:'现金约撑 '+run+' 月';b.title=[...(q.reasons||[]).map(k=>B.REASONS[k]),...(f.reasons||[]).map(k=>V.REASONS[k])].filter(Boolean).join('；');
}
function showDifficulty(){
 const now=city.balance.mode,q=forecast.balance,p=B.MODES[now],v=$('balance-choice'),old=v.value;
 const can=!pending&&!batch&&now!=='sandbox'&&(now==='classic'?!city.balance.switched:city.balance.settlements===0);
 $('balance-choice-wrap').hidden=!can;v.value=can&&['standard','challenge'].includes(old)?old:now==='challenge'?'challenge':'standard';
 $('balance-mode').textContent=(now==='classic'?'旧档规则':p.name)+(can?' · 可在确认后选择难度':' · 当前存档');
 $('balance-mode-detail').textContent=p.description;
 const net=forecast.net,run=net<0?'含偿债按当前收支可撑 '+Math.floor(Math.max(0,city.network.cash)/Math.max(1,-net))+' 月':q.runway===null?'当前无月度现金缺口':'本月可用资金已耗尽';
 $('balance-runway').textContent=run+'。'+(q.reasons||[]).map(k=>B.REASONS[k]).filter(Boolean).join('；');
 $('balance-decomposition').innerHTML=lines(q.isNeutral?[['原有营运补助',moneyBadge(q.baseGrant)],['新增调整','¥0']]:[
  ['开城扶持',moneyBadge(q.starter)],['基础服务配套',moneyBadge(q.serviceMatch)],['超前道路',moneyBadge(-q.breakdown.roads)],
  ['用地维护',moneyBadge(-q.breakdown.land)],['高开支设施配套压力',moneyBadge(-q.breakdown.optional)],
  ['可用扶持余额',moneyBadge(q.remainingAid)],['相对旧规则净调整',moneyBadge(q.adjustment)]]);
 const last=B.report(city.balance).last;$('balance-last').textContent=last?'第 '+last.month+' 月实际结余 '+moneyBadge(last.net)+'（经营，未扣偿债）':'推进一月后显示实际收支。';
}
$('balance-mode-change').onclick=()=>{
 if(pending||batch||!checkCanSave())return;
 const tr=structuredClone(city),name=$('balance-choice').value;
 if(name===tr.balance.mode||!B.setMode(tr.balance,name,{confirm:true}))return notify('当前存档不再允许切换此难度',true);
 $('budget-dialog').close();beginPlan(tr,{ok:true},{kind:'balance',points:[]},'采用 '+B.MODES[name].name,'balance','确认后本城使用该规则，不能靠切换重启扶持');
};
$('cash-runway').onclick=()=>{$('budget').click();};
function budgetInfo(){
 showDifficulty();
 const f=city.finance,t=metrics.totals||{};$('tax').value=f.tax;$('frequency').value=f.frequency;
 $('budget-info').innerHTML=lines([['税收','¥'+format.format(t.income||0)],['公共设施','−¥'+format.format(t.expense||0)],['道路养护','−¥'+format.format(forecast.road)],['停车设施养护','−¥'+format.format(forecast.parking)],['慢行设施养护','−¥'+format.format(forecast.walking)],['照护、安置与科研','−¥'+format.format(forecast.social)],['消防医疗与社区','−¥'+format.format(forecast.care)],['司法及市政运转','−¥'+format.format(forecast.justice)],['学校运营','−¥'+format.format(forecast.school)],['本月社区转介','−¥'+format.format(city.justice.last?.communityCost||0)],['本月应急支出','−¥'+format.format(civicEventLoss)],['公交运营','−¥'+format.format(forecast.bus)],['水电线养护','−¥'+format.format(forecast.infra)],['科技降低车队运维','¥'+format.format(city.serviceLedger?.discount||0)],['本期公交营运净调整','¥'+format.format(city.serviceLedger?.adjustment||0)],['铁路港航净额','¥'+format.format(forecast.transit)],['特别区净额','¥'+format.format(forecast.district)],['公路客运与对外货运附加','¥'+format.format(forecast.regionalNet)],['就业工资税','¥'+format.format(forecast.laborTax?.payrollTax||0)],['就业后财政净调节','¥'+format.format(forecast.laborTax?.adjustment||0)],['供货与产出税差','¥'+format.format(forecast.chains)],['发展补助','¥'+format.format(grant)],['本金／利息','−¥'+format.format(forecast.principal)+'／¥'+format.format(forecast.interest)],['借款余额','¥'+format.format(f.debt)],['月结预测',moneyBadge(forecast.net)]]);
 $('budget-credit-note').textContent='预算债务余额 '+moneyBadge(V.report(city.credit).debt)+' · 同期应偿 '+moneyBadge(forecast.finance.due);
}
$('budget').onclick=()=>{budgetInfo();$('budget-dialog').showModal();};
$('tax-apply').onclick=()=>{city.finance.tax=N.clamp(Math.round(+$('tax').value||9),5,16);city.finance.frequency=$('frequency').value==='frequent'?'frequent':'normal';refresh();save();budgetInfo();};
$('budget-close').onclick=()=>$('budget-dialog').close();
function financeInputs(tr=city){return {cash:tr.network.cash,month:tr.month,operatingNet:forecast.operatingNet,population:metrics.totals?.population||0};}
function percentBps(v){return (Number.isFinite(v)?v/100:0).toFixed(2)+'%';}
function financeBegin(title,quote,commit,summary){
 if(pending||batch||!checkCanSave())return;
 const tr=structuredClone(city),input=financeInputs(tr),q=quote(tr.credit,input);
 if(!q.ok){$('finance-quote-feedback').textContent=q.reason;return;}
 const x=commit(tr.credit,q,input);
 if(!x.ok||!Number.isFinite(x.cashDelta)){$('finance-quote-feedback').textContent=x.reason||'报价已变动，请重新报价';return;}
 tr.network.cash+=x.cashDelta;tr.finance.debt=V.report(tr.credit).debt;
 $('finance-dialog').close();
 beginPlan(tr,q,{kind:'finance',points:[]},title, 'finance',summary(q));
}
function showFinance(){
 const q=V.report(city.credit),d=forecast.finance,
  includes=[['可动用现金',moneyBadge(city.network.cash)],['保护准备金',moneyBadge(q.reserve)],['未偿本金',moneyBadge(q.debt)],['已逾期',moneyBadge(q.overdue)],
   ['下月应偿本金',moneyBadge(d.principalDue)],['下月应偿利息',moneyBadge(d.interestDue)],['按当前现金可实际付',moneyBadge(d.paid)]];
 $('finance-current').innerHTML=lines(includes);
 const last=q.last;$('finance-last').textContent=last?'第 '+last.month+' 月：实付 '+moneyBadge(last.paid)+'，到期 '+moneyBadge(last.due)+'，未付 '+moneyBadge(last.overdue):'尚无已结算的偿付记录。';
 const loans=$('finance-loans');loans.replaceChildren();
 for(const v of q.loans){
  const li=document.createElement('li');li.textContent=v.id+' · '+v.name+' · 余额 '+moneyBadge(v.balance)+' · '+percentBps(v.rateBps)+'/月 · 第 '+v.nextDue+' 月到期'+(v.overdueMonths?' · 已拖欠 '+v.overdueMonths+' 月':'');loans.append(li);
 }
 if(!loans.children.length)loans.textContent='当前没有借款。';
 const choose=$('finance-repay-id'),prev=choose.value;choose.replaceChildren(...q.loans.map(v=>new Option(v.id+' · '+v.name,v.id)));
 if(q.loans.some(v=>v.id===prev))choose.value=prev;
 $('finance-repay').disabled=!choose.value||!!(batch||pending);
 const p=$('finance-product');if(!p.options.length)p.replaceChildren(...Object.entries(V.PRODUCTS).map(([k,v])=>new Option(v.name,k)));
 const q1=V.PRODUCTS[p.value];$('finance-loan-value').min=q1.min;$('finance-loan-value').max=q1.max;
 if(!Number.isFinite(+$('finance-loan-value').value)||+$('finance-loan-value').value<q1.min||+$('finance-loan-value').value>q1.max)$('finance-loan-value').value=q1.min;
 financeQuotePreview();
}
function financeQuotePreview(){
 const f=$('finance-loan-value'),id=$('finance-product').value,d=V.PRODUCTS[id],q=V.quoteLoan(city.credit,id,+f.value,financeInputs());
 $('finance-loan-hint').textContent=d.description+' '+(q.ok?'预计 '+q.term+' 月，月利率 '+percentBps(q.rateBps)+'；签约费用 '+moneyBadge(q.fee)+'，到账 '+moneyBadge(q.proceeds):q.reason);
 $('finance-borrow').disabled=!q.ok||!!(pending||batch);
}
function openFinance(){
 if(pending||batch)return notify('请先处理当前蓝图',true);
 $('budget-dialog').close();$('finance-quote-feedback').textContent='';showFinance();$('finance-dialog').showModal();
}
$('budget-finance').onclick=openFinance;
$('finance-close').onclick=()=>{$('finance-dialog').close();budgetInfo();$('budget-dialog').showModal();};
$('finance-product').onchange=showFinance;$('finance-loan-value').oninput=financeQuotePreview;
$('finance-borrow').onclick=()=>{const id=$('finance-product').value,z=$('finance-loan-value');if(!z.reportValidity())return;
 financeBegin('签订 '+V.PRODUCTS[id].name,(s,o)=>V.quoteLoan(s,id,+z.value,o),V.applyLoan,
  q=>'本金 '+moneyBadge(q.amount)+' · '+q.term+' 月 · 月利率 '+percentBps(q.rateBps)+' · 费用 '+moneyBadge(q.fee)+' · 第 '+q.firstDue+' 月起还款');};
$('finance-repay').onclick=()=>{
 const id=$('finance-repay-id').value,n=$('finance-repay-amount'),full=$('finance-repay-full').checked;
 if(!full&&!n.reportValidity())return;
 financeBegin('提前还款 '+id,(s,o)=>V.quoteRepay(s,id,full?'full':+n.value,o),V.applyRepay,
  q=>'本次本金 '+moneyBadge(q.principal)+' · 利息 '+moneyBadge(q.interest)+' · 手续费 '+moneyBadge(q.fee));
};
$('finance-deposit').onclick=()=>queueReserve('deposit');$('finance-withdraw').onclick=()=>queueReserve('withdraw');
function queueReserve(action){
 const n=$('finance-reserve-value');if(!n.reportValidity())return;
 financeBegin(action==='deposit'?'划入保护准备金':'取回保护准备金',(s,o)=>V.quoteReserve(s,action,+n.value,o),V.applyReserve,
  q=>'同额在市库和准备金之间划转；不增加资金或利息。');
}
const marketNumber=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1}),marketFmt=x=>marketNumber.format(Number.isFinite(x)?x:0);
let marketReturn=false;
const cargoMove={ordered:'订购',committed:'进入待发仓',departed:'发运',unloaded:'卸货到城',delivered:'外部交付',rerouted:'改线',expired:'订单过期'};
function renderCargo(){
 const r=H.report(city.cargo),q=r.last,t=q?.totals||{},f=marketFmt;
 $('cargo-period').textContent=q?'第 '+q.month+' 月已结算 · 未发出的进口请求不是库存，已发运出口不是收入。':'尚未结算。推进月份后，外贸缺口会生成订单。';
 $('cargo-overview').innerHTML=lines([['进口到城／已用',f(t.arrivedImports)+' / '+f(t.usedImports)],['出口待发入仓／对外交付',f(t.committedExports)+' / '+f(t.paidExports)],['排队／在途／受阻',f(t.queued)+' / '+f(t.inFlight)+' / '+f(t.blocked)],['进口到货仓',f(t.inbound)],['口岸已用／月吞吐',f(t.used)+' / '+f(t.capacity)],['运输费用（企业）','¥'+f(q?.fees)],['已结算出口货值（企业）','¥'+f(q?.exportValue)]]);
 const gatewayRows=$('cargo-gateways');gatewayRows.replaceChildren();
 for(const g of cargoGateways){
  const prior=q?.gateways?.find(x=>x.id===g.id),box=document.createElement('div'),label=document.createElement('b'),desc=document.createElement('small'),loc=document.createElement('button');
  box.className='cargo-gate';label.textContent=g.name+' · '+H.MODES[g.mode].name+(g.connected?'':' · 未运营');loc.type='button';loc.textContent='定位';loc.onclick=()=>{$('cargo-dialog').close();focusView(g.x,g.y);};
  desc.textContent=g.connected?'月进口 '+f(g.importCapacity)+' / 出口 '+f(g.exportCapacity)+'，共用上限 '+f(Math.min(g.terminalCapacity,Math.max(g.importCapacity,g.exportCapacity)))+' · 在途约 '+g.travel+' 月'+(prior?' · 已结算用量 '+f(prior.used):''):(g.reason||'检查本地道路和对外线路');
  box.append(label,loc,desc);gatewayRows.append(box);
 }
 const product=$('cargo-product');if(!product.options.length)product.replaceChildren(...H.GOODS.map(k=>new Option(E.PRODUCTS[k].name,k)));
 const k=product.value,orders=r.orders.filter(v=>v.product===k),ships=r.shipments.filter(v=>v.product===k);
 const sum=(a,d)=>a.filter(x=>x.direction===d).reduce((n,v)=>n+v.quantity,0);
 $('cargo-commodity').innerHTML=lines([['待发进口请求',f(sum(orders,'import'))],['仓内待发出口',f(r.escrow[k])],['进口仓有货',f(r.inbound[k])],['本月到城／对外交付',f(q?.arrivedImports[k])+' / '+f(q?.paidExports[k])],['本月无可用运输',f(q?.unroutable[k])]]);
 const items=$('cargo-shipments');items.replaceChildren();
 for(const v of ships.slice(0,24)){
  const li=document.createElement('li'),gate=cargoGateways.find(g=>g.id===v.gateway);
  li.textContent=(v.direction==='import'?'进口':'出口')+' '+f(v.quantity)+' · '+H.MODES[v.mode].name+' · '+(gate?.name||v.gateway)+' · '+(v.status==='moving'?'剩 '+v.remaining+' 月':'待恢复或卸载');items.append(li);
 }
 if(!items.children.length)items.textContent='当前无此商品的在途批次。';
 const events=$('cargo-events');events.replaceChildren();
 for(const v of r.history.slice(-18).reverse()){
  const li=document.createElement('li');li.textContent='第 '+v.month+' 月 · '+cargoMove[v.action]+' '+E.PRODUCTS[v.product].name+' '+f(v.quantity)+(v.mode?' · '+H.MODES[v.mode].name:'');events.append(li);
 }
}
$('cargo-open').onclick=()=>{renderCargo();$('cargo-dialog').showModal();};
$('cargo-product').onchange=renderCargo;
$('cargo-close').onclick=()=>$('cargo-dialog').close();
function openMarket(fromIndustry=false){
 if(modalOpen()&&!fromIndustry)return;
 marketReturn=fromIndustry;
 if(fromIndustry)$('economy-dialog').close();
 const list=$('market-product');
 if(!list.children.length)list.replaceChildren(...Object.values(E.PRODUCTS).map(q=>new Option(q.name,q.id)));
 renderMarket();$('market-dialog').showModal();
}
function renderMarket(){
 const ledger=W.report(city.market),q=ledger.products?.[$('market-product').value],h=ledger.households||{},period=ledger.month;
 $('market-overview').textContent=period?'第 '+period+' 月 · 已结算市场数据':'推进一个月后查看价格和库存。';
 const spending=h.spending??h.spent??h.retailSpend??h.basketCost??0,coverage=h.affordability??h.affordabilityIndex??h.purchasingPower??0;
 $('market-households').innerHTML=lines([['住户工资总额','¥'+marketFmt(h.payroll??h.totalPayroll??0)],['家庭购物支出','¥'+marketFmt(spending)],['人均工资','¥'+marketFmt(h.payrollPerResident)],['购买力指数',marketFmt(coverage)]]);
 if(!q){$('market-tape').textContent='暂无此产品的结算';$('market-goods').replaceChildren();return;}
 const hist=$('market-history');hist.replaceChildren(...(ledger.history||[]).slice(-6).reverse().map(v=>{
  const li=document.createElement('li');li.textContent='第 '+v.month+' 月：购买力 '+marketFmt(v.affordability)+' · 家庭支出 ¥'+marketFmt(v.spending);return li;
 }));
 const p=q.price,change=q.previousPrice?(p-q.previousPrice)/q.previousPrice:0;
 $('market-tape').textContent=q.name+' · ¥'+marketFmt(p)+'／'+q.unit+' · 环比 '+(change>=0?'+':'')+marketFmt(100*change)+'%';
 $('market-goods').innerHTML=lines([
  ['本期新供给',marketFmt(q.fresh)+' '+q.unit],['其中本地特别产业',marketFmt(q.industryFresh)+' '+q.unit],['已入市进口／新入待发仓',marketFmt(q.imports)+'／'+marketFmt(q.exports)],
  ['企业／家庭需求',marketFmt(q.firmDemand)+'／'+marketFmt(q.householdDemand)],['未满足需求',marketFmt(q.shortage)+' '+q.unit],
  ...(q.storable?[['月初库存',marketFmt(q.opening)],['月度损耗',marketFmt(q.spoiled)],['从库存补充',marketFmt(q.reserveUsed)],
    ['新增入库',marketFmt(q.stored)],['月末库存／容量',marketFmt(q.closing)+'／'+marketFmt(q.capacity)],['无法入库的余货',marketFmt(q.overflow)]]:
    [['储存规则','属于服务，无法存到下月']])]);
}
$('market-open').onclick=()=>openMarket();$('economy-market').onclick=()=>openMarket(true);
$('market-close').onclick=()=>$('market-dialog').close();$('market-product').onchange=renderMarket;
$('market-dialog').addEventListener('close',()=>{if(marketReturn){marketReturn=false;policyView();$('economy-dialog').showModal();}});
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
 if(!modal&&!pending&&!batch){flowClock+=elapsed;micro?.step(elapsed/1000);commuteTick();if(animate)clock+=elapsed;}
 previous=now;
 if(!modal&&!pending&&!batch&&playing&&now-lastAuto>3100&&checkCanSave()){lastAuto=now;const paid=tick();if(paid.length)notify('市政委托完成 · 拨款 ¥'+format.format(paid.reduce((s,p)=>s+p.reward,0)));}else if(!playing||pending||batch||modal)lastAuto=now;
 view.resize();if(mode3d)renderer3d.resize();const sig=[mode3d,...(mode3d?Object.values(renderer3d.camera):[camera.x,camera.y,camera.zoom]),layer,tool,view.width,view.height].join('|');
 const visualWorld=batch?.scene||sceneWorld;
 const changed=sig!==lastSignature||lastWorld!==visualWorld||lastPreview!==preview||lastSelection!==selected;
 const diagnostics=!modal&&(['traffic','parking','transit','serviceOps'].includes(layer)||Boolean(selected.edge||selected.parking)||!liveQueues)&&now>=nextStats;
 if(diagnostics){liveQueues=micro?.stats();nextStats=now+350;renderFlow(liveQueues);renderCommute();renderServiceOps();if(selected.edge||selected.parking)renderDetails();}
 if(!changed&&!diagnostics&&(modal||!animate||now-lastFrame<1000/30)){window.requestAnimationFrame(scene);return;}
 lastFrame=now;lastSignature=sig;lastWorld=visualWorld;lastPreview=preview;lastSelection=selected;
 const actors=getAgents(clock);
 const draw={camera:mode3d?renderer3d.camera:camera,overlay:layer,wellbeing:layer==='wellbeing'?wellbeingMarkers():null,socialData:layer==='social'?socialReport:null,serviceStopMarks:layer==='serviceOps'?serviceStopMarks:[],progressTiles:layer==='progress'?withBuildCity(progressMapTiles):null,civicFilter:$('civic-kind').value,civicEvents:city.civicEvents?.active,justice:layer==='justice'?justiceSnapshot:null,care:layer==='care'?careSnapshot:null,labor:layer==='labor'?L.report(city.labor):null,education:layer==='schoolAccess'?Q.report(city.education):null,eventRisk,preview,selected,batchGhosts:batch?.ghosts,agents:actors,metrics:{...metrics,edgeTraffic,coverageGrid,closed:incident.closed||[],utilityMetrics,transitMetrics,districtMetrics,queue:liveQueues,signals:micro?.signals()},tool};
 if(mode3d){
  try{renderer3d.render(visualWorld,draw,clock);}catch(e){console.warn('3D frame failed',e);switchScene(false,{persist:false,why:'三维图形遇到问题，已回到平面。'});}
 }else view.render(visualWorld,draw,clock);
 window.requestAnimationFrame(scene);
}
showTools();refresh();if(!scenarioRunner&&(scenePrefs.enabled||parameters.get('view')==='3d'))switchScene(true,{persist:false});updateRawExport();if(recoveryRaw!==null)reportSaveProblem(recoveryHint);if(!scenarioRunner)window.requestAnimationFrame(scene);
 if(new URLSearchParams(location.search).get('menu')==='saves')$('file-dialog').showModal();
window.Blueprint={systems:()=>SL.report(city.systemLedger),lastStudy:()=>structuredClone(lastStudy),campus:()=>CL.report(city.campus),parks:()=>PL.report(city.parks),parkForecast:()=>parksView,careers:()=>CR.report(city.careers),careerProduction:()=>structuredClone(city.careerProduction),wellbeing:()=>WB.report(city.wellbeing),wellbeingApplied:()=>structuredClone(city.wellbeingApplied),cargo:()=>H.report(city.cargo),cargoGateways:()=>structuredClone(cargoGateways),credit:()=>V.report(city.credit),market:()=>W.report(city.market),balance:()=>B.report(city.balance),sceneStats:()=>renderer3d?.stats(),sceneMode:()=>mode3d?'3d':'2d',sceneCamera:()=>mode3d?{...renderer3d.camera}:{...camera},sceneProject:activeProject,sceneRaycast:p=>mode3d?renderer3d.raycast(p):view.screenToWorld(p,camera),progress:()=>G.report(city.progression,progressPoints()),social:()=>socialReport,industry:()=>industryReport,terrain:()=>({revision:city.terrain.revision,statistics:city.terrain.statistics}),ground:(x,y)=>F.height(city.terrain,landSurface,{x,y}),serviceOps:()=>serviceOps?.report(),labor:()=>L.report(city.labor),care:()=>K.report(city.care,city,careOpts()),justice:()=>J.report(city.justice,city,{network:effective||city.network,water:N.water}),education:()=>Q.report(city.education),events:()=>I.report(city.civicEvents),active:()=>activeResult,commute:()=>commuteModel?.stats(),batch:()=>batch&&({count:batch.items.length,cash:batch.world.network.cash}),preview:()=>preview,world:()=>city, metrics:()=>metrics,traffic:()=>trafficStats,view,camera:()=>({...camera}),setLayer,save,plan:()=>pending&&{title:pending.title,cost:pending.cash},forecast:()=>({...forecast}),incident:()=>incident,trafficSim:()=>micro?.stats(),map:()=>mapId,utility:()=>utilityMetrics,transit:()=>transitMetrics,districts:()=>districtMetrics,economy:()=>econ,agents:()=>getAgents(clock),coverage:()=>coverageGrid};
if(parameters.get('qa')==='commute'){
 window.Blueprint.commuteFastForward=advanceCommuteObservation;
 window.Blueprint.commuteLatest=()=>commuteLast.at(-1);
}
})();
