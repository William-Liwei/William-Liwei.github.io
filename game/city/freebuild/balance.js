/* City Blueprint municipal balance. This module only quotes and records adjustments. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object')module.exports=api;else root.CityBalance=api;
})(globalThis,function(){
'use strict';
const MODES={
 standard:{name:'标准经营',description:'开城资助逐步退出，超前铺设的设施会产生少量额外维护。',starterScale:1.00,lastAidMonth:27,startCap:4600,matchCap:620,maxAid:55500,roadAllowance:360,roadPop:3.8,roadJob:2.1,roadRate:.115,tileRate:58,optionalRate:.055,pressureCap:780,watch:6},
 challenge:{name:'挑战经营',description:'扶持更短，空置地块与超前网络的维护压力更明显。',starterScale:.84,lastAidMonth:22,startCap:4050,matchCap:445,maxAid:39000,roadAllowance:300,roadPop:3.4,roadJob:1.9,roadRate:.175,tileRate:88,optionalRate:.095,pressureCap:1160,watch:8},
 classic:{name:'原版存档平衡',description:'沿用原有预算，不追加资助或养护调整。',neutral:true,watch:6},
 sandbox:{name:'规划沙盒',description:'此版本不改变沙盒现金、资助与费用。',neutral:true,watch:6}
};
const REASONS={
 classic:'沿用原版预算',sandbox:'沙盒不实施新增经济约束',startup:'开城扶持按已达规模及时间递减',
 expired:'开城扶持期已结束',aidCap:'本市已经用完开城扶持额度',match:'仅按已接通住户和合格基础公共服务费用配套',
 serviceGap:'水电或应急服务尚未形成基础配套',emptyRoad:'道路规模超过当前使用范围',
 idleTitles:'新增地皮多于当前承载的使用规模',optional:'城市基础覆盖不足，先运行高支出设施会增加养护',
 deficit:'当前月度支出超过收入',fewMonths:'按同样收支运行的现金余量较短',negativeCash:'可用资金已经耗尽'
};
const expenseKeys=['road','bus','infra','parking','walking','social','care','justice','school','basicServices','civic','interest','principal','advanced','transit'];
const own=(o,k)=>Object.hasOwn(o,k),num=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),arr=v=>Array.isArray(v)?v:[];
const money=(v,d=0)=>Math.max(-1e9,Math.min(1e9,Math.round(num(v,d))));
const count=(v,d=0)=>Math.max(0,Math.min(1e9,Math.floor(num(v,d))));
const fraction=(v,d=0)=>Math.round(clamp(num(v,d))*10000)/10000;
const preset=(v)=>own(MODES,v)?v:'standard';
const checkMonth=n=>Math.max(1,count(n,1));
const positiveMoney=(v,d=0)=>Math.max(0,money(v,d));
function create(opts={}){
 const mode=opts.sandbox?'sandbox':opts.legacy?'classic':['standard','challenge'].includes(opts.mode)?opts.mode:'standard';
 return {version:1,mode,startedAt:Math.max(1,count(opts.startedAt,1)),lastMonth:0,settlements:0,switched:false,
  peakPopulation:0,peakEmployment:0,aidPaid:0,starterPaid:0,matchedPaid:0,last:null,history:[]};
}
function expenses(v={}){
 return Object.fromEntries(expenseKeys.map(k=>[k,positiveMoney(v?.[k])]));
}
function cover(v={}){
 if(Number.isFinite(v))return {water:fraction(v),power:fraction(v),fire:fraction(v),clinic:fraction(v)};
 return {water:fraction(v?.water),power:fraction(v?.power),fire:fraction(v?.fire),clinic:fraction(v?.clinic)};
}
function result(v){
 const runway=v?.runway==null?null:count(v.runway);
 return {
  mode:preset(v?.mode),month:checkMonth(v?.month),age:count(v?.age),baseGrant:positiveMoney(v?.baseGrant),baseNet:money(v?.baseNet),
  starter:positiveMoney(v?.starter),serviceMatch:positiveMoney(v?.serviceMatch),pressure:positiveMoney(v?.pressure),
  adjustment:money(v?.adjustment),incidentCost:positiveMoney(v?.incidentCost),net:money(v?.net),cash:money(v?.cash),
  runway,runwayMonths:runway,severity:['stable','watch','critical'].includes(v?.severity)?v.severity:'stable',
  peakPopulation:count(v?.peakPopulation),peakEmployment:count(v?.peakEmployment),population:count(v?.population),employed:count(v?.employed),
  serviceCoverage:cover(v?.serviceCoverage),servedResidents:count(v?.servedResidents),roadMetres:count(v?.roadMetres),roadAllowance:count(v?.roadAllowance),
  ownedTiles:count(v?.ownedTiles),starterTiles:count(v?.starterTiles),extraTiles:count(v?.extraTiles),remainingAid:positiveMoney(v?.remainingAid),
  initialAid:positiveMoney(v?.initialAid),aidFactor:fraction(v?.aidFactor),expenses:expenses(v?.expenses),
  reasons:arr(v?.reasons).filter(k=>own(REASONS,k)).slice(0,12),
  breakdown:{roads:positiveMoney(v?.breakdown?.roads),land:positiveMoney(v?.breakdown?.land),optional:positiveMoney(v?.breakdown?.optional)},
  blended:positiveMoney(v?.blended),isNeutral:!!v?.isNeutral
 };
}
function normalize(raw,opts={}){
 const accepted=raw?.version===1&&own(MODES,raw.mode),sandbox=opts.sandbox??(accepted&&raw.mode==='sandbox');
 const s=create({...opts,sandbox,mode:accepted?raw.mode:opts.mode,legacy:accepted?raw.mode==='classic':opts.legacy,
  startedAt:accepted?raw.startedAt:opts.startedAt});
 if(!accepted||s.mode!==raw.mode)return s;
 s.lastMonth=count(raw.lastMonth);s.settlements=count(raw.settlements);s.switched=!!raw.switched;
 s.peakPopulation=count(raw.peakPopulation);s.peakEmployment=count(raw.peakEmployment);
 s.starterPaid=positiveMoney(raw.starterPaid);s.matchedPaid=positiveMoney(raw.matchedPaid);s.aidPaid=positiveMoney(s.starterPaid+s.matchedPaid);
 s.last=raw.last&&typeof raw.last==='object'?result({...raw.last,month:s.lastMonth,mode:s.mode}):null;
 s.history=arr(raw.history).slice(-32).flatMap(v=>v&&Number.isFinite(v.month)?[{
  month:checkMonth(v.month),mode:preset(v.mode),net:money(v.net),adjustment:money(v.adjustment),starter:positiveMoney(v.starter),
  serviceMatch:positiveMoney(v.serviceMatch),pressure:positiveMoney(v.pressure)
 }]:[]);
 return s;
}
function setMode(s,mode,opts={}){
 if(!s||!['standard','challenge'].includes(mode)||s.mode==='sandbox'||opts.confirm!==true)return false;
 if(s.mode===mode)return true;
 if(s.mode==='classic'){
  if(s.switched)return false;
  // Do not reset clock, peak population or remaining support on opt-in.
  s.mode=mode;s.switched=true;s.last=null;return true;
 }
 if(s.settlements>0||s.lastMonth>0)return false;
 s.mode=mode;return true;
}
function livePopulation(city){
 return arr(city?.civic?.lots).reduce((n,l)=>l?.type==='residential'&&num(l.level)>0?n+Math.max(0,num(l.occupants)):n,0);
}
function liveRoads(city){
 let sum=0;
 for(const o of arr(city?.network?.edges)){
  if(!o||!['road','highway','ramp'].includes(o.kind))continue;
  const points=arr(o.pts||o.points);
  if(points.length>=2&&points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))){
   for(let i=1;i<points.length;i++)sum+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  }else sum+=Math.max(0,num(o.len));
 }
 return sum;
}
function liveWorkers(city,month){
 const current=city?.labor?.last;
 return current?.month===month?num(current.totals?.employed)+num(city.industry?.last?.month===month?city.industry.last.total?.staff:0):0;
}
function piecesFor(s,metrics,opts){
 const d=MODES[s.mode],age=metrics.age;
 const ceiling=Math.min(d.startCap,positiveMoney(num(opts.mapGrant,metrics.baseGrant+metrics.population*1.45)*d.starterScale));
 // The first visible four settlements taper gently. Earned maturity never
 // decreases on demolition, population loss, unemployment or save/reload.
 const window=clamp((d.lastAidMonth-age)/Math.max(1,d.lastAidMonth-3));
 const pressureScale=Math.max(clamp((metrics.peakPopulation-55)/1075),clamp((metrics.peakEmployment-28)/645));
 const maturity=1-.65*pressureScale;
 const aidFactor=window*maturity;
 // Re-evaluating an already settled month does not double-consume the cap.
 const ownMonth=s.last?.month===metrics.month&&s.last.mode===s.mode?s.last:null;
 const prior=Math.max(0,s.aidPaid-(ownMonth?.starter||0)-(ownMonth?.serviceMatch||0));
 const left=Math.max(0,d.maxAid-prior);
 const starter=Math.min(left,positiveMoney(ceiling*aidFactor));
 const essential=Math.min(metrics.serviceCoverage.water,metrics.serviceCoverage.power);
 const protectedPeople=Math.floor(metrics.population*essential);
 const supportedWorkers=Math.min(metrics.employed,protectedPeople);
 const hasEmergency=metrics.serviceCoverage.fire>=.16||metrics.serviceCoverage.clinic>=.16;
 const verified=essential>=.38&&hasEmergency&&protectedPeople>=18;
 // No rebate on output, debt, or construction. Cover only a fraction of
 // verified current spending, clipped to actually served residents.
 const basic=metrics.expenses.basicServices;
 const eligible=Math.min(basic,protectedPeople*8+supportedWorkers*3);
 const matchPossible=verified?Math.min(d.matchCap,Math.round(eligible*.21))*window:0;
 const match=Math.min(Math.max(0,left-starter),positiveMoney(matchPossible));
 const roadsAllowed=d.roadAllowance+metrics.population*d.roadPop+metrics.employed*d.roadJob;
 const roadExcess=metrics.roadMetres>roadsAllowed?clamp((metrics.roadMetres-roadsAllowed)/Math.max(1,metrics.roadMetres)):0;
 const road=Math.min(Math.round(d.pressureCap*.65),positiveMoney(metrics.expenses.road*d.roadRate*roadExcess));
 const titledGrowth=Math.max(0,metrics.ownedTiles-metrics.starterTiles);
 const occupiedCapacity=Math.floor((protectedPeople+metrics.employed*.7)/210);
 const unused=Math.max(0,titledGrowth-occupiedCapacity),land=Math.min(d.tileRate*6,unused*d.tileRate);
 const optionalBudget=metrics.expenses.advanced||metrics.expenses.care+metrics.expenses.social+metrics.expenses.justice;
 const optional=Math.min(Math.round(d.pressureCap*.30),positiveMoney(optionalBudget*clamp((.64-essential)/.64)*d.optionalRate));
 const gross=road+land+optional;
 const pressure=Math.min(d.pressureCap,gross);
 const clipped={roads:Math.min(road,pressure),land:Math.min(land,Math.max(0,pressure-road)),optional:Math.min(optional,Math.max(0,pressure-road-land))};
 const why=[];
 if(starter)why.push('startup');else if(age>=d.lastAidMonth)why.push('expired');else if(!left)why.push('aidCap');
 if(match)why.push('match');else if(basic>0&&window>0&&!verified)why.push('serviceGap');
 if(clipped.roads)why.push('emptyRoad');if(clipped.land)why.push('idleTitles');if(clipped.optional)why.push('optional');
 return {starter,serviceMatch:match,pressure,aidFactor,initialAid:d.maxAid,remainingAid:left-starter-match,
  roadAllowance:roadsAllowed,servedResidents:protectedPeople,extraTiles:unused,breakdown:clipped,reasons:why};
}
function forecast(s,city,opts={}){
 const month=checkMonth(opts.month??city?.month),mode=s.mode,d=MODES[mode],age=Math.max(0,month-s.startedAt);
 const population=count(opts.population,livePopulation(city)),employed=Math.min(population,count(opts.employed,liveWorkers(city,month)));
 const peakPopulation=Math.max(population,s.peakPopulation),peakEmployment=Math.max(employed,s.peakEmployment);
 const cash=money(opts.cash,num(city?.network?.cash)),serviceCoverage=cover(opts.serviceCoverage),baseGrant=positiveMoney(opts.baseGrant),
  baseNet=money(opts.baseNet),incidentCost=positiveMoney(opts.incidentCost);
 const ownedTiles=count(opts.ownedTiles,arr(city?.progression?.owned).length),
  starterTiles=Math.min(ownedTiles,count(opts.starterTiles,city?.mapId==='alpine'?3:city?.mapId==='hills'||city?.mapId==='coast'?4:5));
 const input={mode,month,age,population,employed,peakPopulation,peakEmployment,cash,serviceCoverage,baseGrant,baseNet,incidentCost,ownedTiles,starterTiles,
  roadMetres:count(opts.roadMetres,liveRoads(city)),expenses:expenses(opts.expenses)};
 let r;
 if(d.neutral){
  r={starter:baseGrant,serviceMatch:0,pressure:0,remainingAid:0,initialAid:0,aidFactor:0,roadAllowance:0,
   servedResidents:Math.floor(population*Math.min(serviceCoverage.water,serviceCoverage.power)),extraTiles:0,
   breakdown:{roads:0,land:0,optional:0},reasons:[mode],isNeutral:true};
 }else r=piecesFor(s,input,opts);
 const adjustment=money(r.starter+r.serviceMatch-r.pressure-baseGrant),blended=positiveMoney(r.starter+r.serviceMatch);
 const net=money(baseNet+adjustment-incidentCost);
 const runway=net<0?Math.floor(Math.max(0,cash)/-net):null;
 const severity=cash<=0||runway!=null&&runway<=2?'critical':runway!=null&&runway<=d.watch?'watch':'stable';
 if(net<0)r.reasons.push('deficit');
 if(cash<=0)r.reasons.push('negativeCash');else if(severity!=='stable'&&runway!=null)r.reasons.push('fewMonths');
 return result({...input,...r,adjustment,net,runway,severity,blended});
}
function report(s){
 return {mode:s.mode,startedAt:s.startedAt,lastMonth:s.lastMonth,settlements:s.settlements,switched:s.switched,
  peakPopulation:s.peakPopulation,peakEmployment:s.peakEmployment,starterPaid:s.starterPaid,matchedPaid:s.matchedPaid,aidPaid:s.aidPaid,
  last:s.last,history:s.history};
}
function advance(s,city,opts={}){
 const month=checkMonth(opts.month??city?.month);
 if(month<=s.lastMonth)return {...(s.last||forecast(s,city,opts)),noOp:true};
 const r=forecast(s,city,opts);
 s.lastMonth=month;s.settlements++;s.peakPopulation=r.peakPopulation;s.peakEmployment=r.peakEmployment;
 if(!r.isNeutral){s.starterPaid+=r.starter;s.matchedPaid+=r.serviceMatch;s.aidPaid=s.starterPaid+s.matchedPaid;}
 s.last=r;
 s.history.push({month:r.month,mode:r.mode,net:r.net,adjustment:r.adjustment,starter:r.starter,serviceMatch:r.serviceMatch,pressure:r.pressure});
 s.history=s.history.slice(-32);
 return r;
}
return {MODES,REASONS,create,normalize,setMode,forecast,advance,tick:advance,report};
});
