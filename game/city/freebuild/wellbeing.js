/* Bounded fictional resident wellbeing. Observes city facts; never mutates citizens or cash. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./economy.js'):root.Economy);
 if(typeof module==='object')module.exports=api;else root.Wellbeing=api;
})(globalThis,function(E){
'use strict';
const COMPONENTS={
 employment:{name:'就业稳定',description:'本地申请和真实匹配岗位，包含未填补的求职需求',weight:.25,color:'#a9c680'},
 commute:{name:'通勤便利',description:'已匹配工作往返的距离与方式，加上因无可用通勤路径而未匹配的居民',weight:.19,color:'#88c3dc'},
 housing:{name:'住房负担',description:'以真实已领工资、参考住房支出与消费篮子估算，不从市库扣租金',weight:.18,color:'#e8bc87'},
 environment:{name:'环境质量',description:'地块环境污染与交通噪声',weight:.13,color:'#72c6a1'},
 amenities:{name:'设施与便利',description:'当地水电、教育、医疗、社区与公园的实际覆盖',weight:.16,color:'#a8a4e7'},
 safety:{name:'社区安全',description:'应急保障与已记录的真实本地事件冲击',weight:.09,color:'#eba699'}
};
const KEYS=Object.keys(COMPONENTS);
const REASONS={
 employment:'就业机会不足或目前就业不稳定',commute:'通勤距离过大或没有可走通的路线',housing:'实际工资相对住房与必需开支偏低',
 environment:'污染、货车噪声或持续环境压力',amenities:'用水用电、教育或生活支持不足',safety:'应急覆盖较低或本地长时间处于压力中',
 incident:'本月事件造成短期不满',attractive:'住区持续满意且有可住空位',stable:'未出现持续迁出或迁入压力',observation:'尚在观察，未到迁移阈值'
};
const LIMIT={lots:4000,history:36,people:450,cityExit:64,cityIn:46,poorMonths:4,goodMonths:5};
const RENT={neighborhood_homes:24,garden_homes:29,apartments:26,affordable_homes:18,highrise_living:37};
const detailKeys=['workers','employed','unreachable','commuteMinutes','monthlyPayroll','payrollPerResident','rentPerResident','basketPerResident','burden',
 'pollution','noise','utilities','amenityCoverage','incidentShock','baselineTarget','availability'];
const totalFields=['population','households','lots','exitResidents','exitHouseholds','inResidents','inHouseholds','atRisk','attractive','satisfaction','happiness','wellbeing'];
const num=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),rnd=(v,d=2)=>Math.round(v*10**d)/10**d;
const int=(v,d=0,a=0,b=1e9)=>Math.floor(clamp(num(v,d),a,b)),score=(v,d=62)=>rnd(clamp(num(v,d),0,100),2);
const own=(o,k)=>Object.hasOwn(o,k),arr=v=>Array.isArray(v)?v:[];
const id=(x,n=72)=>typeof x==='string'||typeof x==='number'?String(x).slice(0,n):'';
const valid=x=>x&&Number.isFinite(x.x)&&Number.isFinite(x.y)&&x.x>=0&&x.y>=0&&x.x<=2000&&x.y<=1400;
const cal=v=>Math.max(1,int(v,1));
const baseScore=()=>Object.fromEntries(KEYS.map(k=>[k,62]));
const noMove=()=>({exitResidents:0,exitHouseholds:0,inResidents:0,inHouseholds:0,reason:'stable'});
const nonneg=(n,d=0)=>rnd(clamp(num(n,d),0,1e8),3);
const metricScores=(v)=>Object.fromEntries(KEYS.map(k=>[k,score(v?.[k])]));
const reasonsOf=(v)=>arr(v).filter(k=>own(REASONS,k)).slice(0,5);
function cleanMigration(v){
 return {exitResidents:int(v?.exitResidents,0,0,8),exitHouseholds:int(v?.exitHouseholds,0,0,8),
  inResidents:int(v?.inResidents,0,0,5),inHouseholds:int(v?.inHouseholds,0,0,5),reason:own(REASONS,v?.reason)?v.reason:'stable'};
}
function details(v){return Object.fromEntries(detailKeys.map(k=>[k,nonneg(v?.[k])]));}
function lotRow(k,v){
 if(!valid(v)||!id(k))return null;
 const moves=cleanMigration(v.migration);
 const pop=int(v.population,0,0,LIMIT.people);
 if(moves.exitResidents>pop){moves.exitResidents=pop;moves.exitHouseholds=Math.min(moves.exitHouseholds,pop);}
 return {id:id(k),x:v.x,y:v.y,population:pop,households:int(v.households,0,0,pop),capacity:int(v.capacity,0,0,LIMIT.people),
  satisfaction:score(v.satisfaction),happiness:score(v.happiness),wellbeing:score(v.happiness),shock:nonneg(v.shock),
  badMonths:int(v.badMonths,0,0,60),goodMonths:int(v.goodMonths,0,0,60),components:metricScores(v.components),details:details(v.details),
  reasons:reasonsOf(v.reasons),reason:own(REASONS,v.reason)?v.reason:'stable',migration:moves,observed:!!v.observed};
}
function totalsRow(v){
 const out={};
 for(const k of totalFields)out[k]=['satisfaction','happiness','wellbeing'].includes(k)?score(v?.[k]):int(v?.[k]);
 out.components=metricScores(v?.components);out.scoreCoverage=rnd(clamp(num(v?.scoreCoverage)),3);
 return out;
}
function historyRow(v){
 if(!v||!Number.isFinite(v.month))return null;
 const t=totalsRow(v);
 return {month:cal(v.month),population:t.population,satisfaction:t.satisfaction,happiness:t.happiness,
  exitResidents:t.exitResidents,inResidents:t.inResidents};
}
function create(seed='city-wellbeing'){
 return {version:1,seed:String(seed).slice(0,96),lastMonth:0,last:null,history:[]};
}
function normalize(raw,seed='city-wellbeing'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(raw?.version!==1)return s;
 s.lastMonth=int(raw.lastMonth);
 s.history=arr(raw.history).slice(-LIMIT.history).map(historyRow).filter(Boolean);
 if(s.lastMonth&&raw.last&&typeof raw.last==='object'){
  const byLot=Object.fromEntries(Object.entries(raw.last.byLot||{}).slice(0,LIMIT.lots).map(([k,v])=>lotRow(k,v)).filter(Boolean).map(v=>[v.id,v]));
  s.last={month:s.lastMonth,byLot,totals:totalsRow(raw.last.totals)};
 }
 return s;
}
function report(s){
 return {...(s.last||{month:s.lastMonth,byLot:{},totals:totalsRow()}),history:s.history};
}
function weighted(v){return KEYS.reduce((n,k)=>n+v[k]*COMPONENTS[k].weight,0);}
const hazardWeights={fire:.83,crime:1,illness:.36,death:.24};
const incidence={reported:.22,escalated:.70,waiting:.50,responding:.44,expired:1,resolved:.35};
function shocks(upstream,month){
 const raw=Array.isArray(upstream)?upstream:arr(upstream?.log);
 const exact=new Map();
 for(const r of raw.slice(-260)){
  if(!r||r.month!==month||!own(hazardWeights,r.type)||!own(incidence,r.action)||!id(r.lotId)||!id(r.id))continue;
  const k=id(r.lotId)+'|'+r.id;
  const impact=hazardWeights[r.type]*incidence[r.action]*clamp(num(r.severity,1),1,4)*4.8;
  const old=exact.get(k);
  if(!old||impact>old.value)exact.set(k,{lot:id(r.lotId),value:impact});
 }
 const byLot=new Map();
 for(const r of exact.values())byLot.set(r.lot,Math.min(24,(byLot.get(r.lot)||0)+r.value));
 return byLot;
}
function commuteByHome(assignments,city){
 const out=new Map();
 for(const a of arr(assignments).slice(0,17000)){
  const k=id(a?.home);if(!k||!Number.isFinite(a.distance))continue;
  const n=int(a.count,0,0,LIMIT.people),km=clamp(a.distance,0,2200);
  const minutes=a.mode==='walk'?4.5+km/39:a.mode==='drive'?7+km/92+Math.min(6,km/145):Number.isFinite(a.seconds)?8+Math.min(53,a.seconds/4.6):7+km/82;
  const row=out.get(k)||{count:0,total:0};
  const accepted=Math.max(0,Math.min(n,LIMIT.people-row.count));
  row.count+=accepted;row.total+=accepted*minutes;out.set(k,row);
 }
 return out;
}
function provider(opts,city){
 const labor=opts.labor||city.labor?.last,industry=opts.industry||city.industry?.last,
  social=opts.social||city.social?.last,price=opts.market||city.market?.last,metrics=opts.civicMetrics||opts.metrics;
 const month=cal(city.month),laborExact=labor?.month===month,industryExact=industry?.month===month,socialExact=social?.month===month;
 const assigned=commuteByHome(laborExact?(labor.assignments||city.labor?.assignments):[],city),spikes=shocks(opts.incidents||city.civicEvents,month);
 const getPrice=(k)=>num(price?.products?.[k]?.[price?.month===month?'previousPrice':'price'],num(price?.prices?.[k],E.PRODUCTS[k].value));
 const basket=clamp(.76*getPrice('groceries')+.23*getPrice('meals')+.12*getPrice('repair'),9,85);
 return {month,labor,industry,social,metrics,laborExact,industryExact,socialExact,assigned,spikes,basket,commute:opts.commute};
}
function familyOf(l){
 const def=E.sector(l);
 return {name:def?.id||'neighborhood_homes',size:Math.max(1.8,num(def?.family,2.7)),design:clamp(num(def?.capacity,18)*[0,1,1.66,2.45][int(l.level,1,1,3)],8,LIMIT.people)};
}
function assess(s,city,l,source){
 const key=id(l.id),old=s.last?.byLot?.[key],m=source.metrics?.lots?.[key]||source.metrics?.byLot?.[key],
  h=source.laborExact?source.labor.byHome?.[key]:null,v=source.commute?.byHome?.[key]??source.commute?.[key],drive=source.assigned.get(key);
 const observed=!!(m&&h),housing=familyOf(l),population=int(l.occupants,0,0,LIMIT.people),households=Math.ceil(population/housing.size);
 const capacity=Math.max(population,int(m?.capacity,housing.design,0,LIMIT.people)),baselineTarget=clamp(num(m?.target,population),0,capacity);
 const seeking=h?int(h.workers,0,0,population):0,ordinary=h?int(h.employed,0,0,seeking):0;
 const industry=source.industryExact?int(source.industry?.byHome?.[key],0,0,seeking):0;
 const research=source.socialExact?source.social?.researchByHome?.[key]:null;
 const other=Math.min(seeking-ordinary,industry+int(research?.vocational)+int(research?.university));
 const employed=ordinary+other;
 const unserved=clamp(num(v?.unreachable,num(h?.waitingReasons?.unreachable))-other,0,seeking);
 const commuteMinutes=clamp(num(v?.minutes,drive?.count?drive.total/drive.count:h&&seeking?13:11),0,180);
 const employment=h&&seeking?clamp(20+80*employed/seeking-6*clamp(num(h.hired)/Math.max(1,seeking))*Number(!!old&&num(old.details?.employed)>employed),8,100):65;
 const commute=h||v?clamp(100-2.55*Math.max(0,commuteMinutes-7)-88*unserved/Math.max(1,seeking),7,100):65;
 const payroll=clamp(num(h?.payroll),0,1e7),per=population?payroll/population:0;
 const rent=(RENT[housing.name]||24)*[1,1,1.12,1.29][int(l.level,1,1,3)]*(.87+.27*clamp(num(m?.quality,.54)));
 // The constant keeps essential spending from making zero-wage neighborhoods a
 // mathematical divide-by-zero; it is not wages, a payment or bank credit.
 const dollars=Math.max(8,per+22),burden=(rent+source.basket)/dollars;
 const housingScore=h?clamp(106-104*Math.max(0,rent/dollars-.24)-31*Math.max(0,source.basket/dollars-.23),12,98):62;
 const pollution=clamp(num(m?.pollution)),noise=clamp(num(m?.truckNoise));
 const environment=m?clamp(96-66*pollution-26*noise,10,98):70;
 const w=m?clamp(num(m.water)):0,power=m?clamp(num(m.power)):0,utility=Math.min(w,power);
 const amenitiesMix=m?clamp(.26*clamp(num(m.park))+.22*clamp(num(m.school))+.18*clamp(num(m.clinic))+.14*clamp(num(m.library))+
  .10*clamp(num(m.plaza))+.10*clamp(num(m.waste))):.5;
 const delivered=source.socialExact?source.social?.benefitsByLot?.[key]:null;
 const care=clamp((num(delivered?.family)+num(delivered?.elder))/Math.max(4,population*.25));
 const amenities=m?clamp(23+47*utility+25*amenitiesMix+8*care,10,100):64;
 const fire=m?clamp(num(m.fire)):.5,police=m?clamp(num(m.police)):.5,clinic=m?clamp(num(m.clinic)):.5,access=m?.access!=null?1:0;
 const current=source.spikes.get(key)||0,elapsed=Math.max(1,source.month-s.lastMonth);
 const shock=Math.min(28,current+(num(old?.shock)*Math.pow(.42,elapsed)));
 const safety=m?clamp(43+32*police+13*fire+9*clinic+3*access-.54*shock,10,100):clamp(65-.54*shock,10,100);
 const components=metricScores({employment,commute,housing:housingScore,environment,amenities,safety});
 const satisfaction=score(weighted(components)-shock*.54),previous=old?.happiness??62;
 // Events can change how the month feels immediately, while long-term
 // wellbeing listens slowly and gives a transient incident less influence.
 const underlying=score(weighted(components)-shock*.10),alpha=underlying<previous?.22:.18;
 const happiness=score(previous+clamp((underlying-previous)*alpha,-8,6));
 const adjacent=old&&source.month===s.lastMonth+1;
 const bad=observed&&satisfaction<48,good=observed&&satisfaction>=72;
 const badMonths=bad?Math.min(60,(adjacent?old.badMonths:0)+1):0;
 const goodMonths=good?Math.min(60,(adjacent?old.goodMonths:0)+1):0;
 const gap=KEYS.map(k=>({k,weight:Math.max(0,71-components[k])*COMPONENTS[k].weight})).filter(x=>x.weight>1.4)
  .sort((a,b)=>b.weight-a.weight||a.k.localeCompare(b.k));
 const barrier=seeking>0&&unserved/seeking>=.55&&commute<42;
 const reasons=(barrier?['commute',...gap.filter(x=>x.k!=='commute').map(x=>x.k)]:gap.map(x=>x.k)).slice(0,3);
 if(current>=6)reasons.unshift('incident');
 if(!reasons.length)reasons.push('stable');
 const main=barrier?'commute':gap[0]?.k||'stable';
 const out={id:key,x:l.x,y:l.y,population,households,capacity,satisfaction,happiness,wellbeing:happiness,shock,
  badMonths,goodMonths,components,details:{workers:seeking,employed,unreachable:unserved,commuteMinutes,monthlyPayroll:payroll,
   payrollPerResident:per,rentPerResident:rent,basketPerResident:source.basket,burden,pollution,noise,utilities:utility,
   amenityCoverage:amenitiesMix,incidentShock:current,baselineTarget,availability:Math.max(0,baselineTarget-population)},
  reasons,reason:main,migration:noMove(),familySize:housing.size,observed};
 const harsh=happiness<=49&&badMonths>=LIMIT.poorMonths;
 if(harsh&&population>=2){
  out.migration.exitResidents=Math.min(population-1,8,Math.max(1,Math.floor(population*clamp((54-happiness)/151,.035,.10))));
  out.migration.reason=main;
 }else if(goodMonths>=LIMIT.goodMonths&&happiness>=68&&population>0&&baselineTarget-population>=1){
  out.migration.inResidents=Math.floor(Math.min(5,baselineTarget-population,Math.max(1,capacity*.065)));
  out.migration.reason='attractive';
 }else if(bad||good)out.migration.reason='observation';
 return out;
}
function shuffleKey(seed,v){
 let h=2166136261;
 for(const c of seed+'|'+v)h=Math.imul(h^c.charCodeAt(0),16777619);
 return h>>>0;
}
function assessCity(s,city,opts={}){
 const source=provider(opts,city),byLot={},rows=[],seen=new Set();
 for(const l of arr(city?.civic?.lots).slice(0,LIMIT.lots)){
  const k=id(l?.id);
  if(!k||seen.has(k)||l.type!=='residential'||!valid(l)||num(l.level)<1)continue;
  seen.add(k);rows.push(assess(s,city,l,source));
 }
 const population=rows.reduce((n,l)=>n+l.population,0);
 let outs=population>1?Math.min(LIMIT.cityExit,Math.max(1,Math.floor(population*.023))):0;
 let ins=population>0?Math.min(LIMIT.cityIn,Math.max(1,Math.floor(population*.020))):0;
 const order=rows.slice().sort((a,b)=>b.badMonths-a.badMonths||a.happiness-b.happiness||
  shuffleKey(s.seed,source.month+'|'+a.id)-shuffleKey(s.seed,source.month+'|'+b.id)||a.id.localeCompare(b.id));
 // Independent, small citywide caps make the feedback playable and prevent
 // a map-wide event from turning into instant depopulation.
 for(const v of order){
  const m=v.migration;
  m.exitResidents=Math.min(m.exitResidents,outs);outs-=m.exitResidents;
  m.exitHouseholds=m.exitResidents?Math.min(v.households,Math.ceil(m.exitResidents/v.familySize)):0;
 }
 for(const v of rows.slice().sort((a,b)=>b.goodMonths-a.goodMonths||b.happiness-a.happiness||
  shuffleKey(s.seed,source.month+'|'+a.id)-shuffleKey(s.seed,source.month+'|'+b.id)||a.id.localeCompare(b.id))){
  const m=v.migration;
  m.inResidents=Math.min(m.inResidents,ins);ins-=m.inResidents;
  m.inHouseholds=m.inResidents?Math.ceil(m.inResidents/v.familySize):0;
 }
 for(const v of rows)Object.defineProperty(byLot,v.id,{value:lotRow(v.id,v),enumerable:true,writable:true,configurable:true});
 const totals=totalsRow({
  population,lots:rows.length,households:rows.reduce((n,v)=>n+v.households,0),
  ...Object.fromEntries(['exitResidents','exitHouseholds','inResidents','inHouseholds'].map(k=>[k,rows.reduce((n,v)=>n+v.migration[k],0)])),
  atRisk:rows.filter(v=>v.badMonths>=LIMIT.poorMonths&&v.happiness<=49).length,
  attractive:rows.filter(v=>v.goodMonths>=LIMIT.goodMonths&&v.happiness>=68).length,
  scoreCoverage:population?rows.filter(v=>v.observed).reduce((n,v)=>n+v.population,0)/population:0,
  ...Object.fromEntries(['satisfaction','happiness','wellbeing'].map(k=>[k,population?rows.reduce((n,v)=>n+v[k]*v.population,0)/population:62])),
  components:Object.fromEntries(KEYS.map(k=>[k,population?rows.reduce((n,v)=>n+v.components[k]*v.population,0)/population:62]))
 });
 return {month:source.month,byLot,totals};
}
function forecast(s,city,opts={}){
 if(cal(city?.month)<=s.lastMonth)return report(s);
 return {...assessCity(s,city,opts),history:s.history};
}
function advance(s,city,opts={}){
 if(cal(city?.month)<=s.lastMonth)return {...report(s),noOp:true};
 const q=assessCity(s,city,opts);
 s.lastMonth=q.month;s.last=q;
 s.history.push(historyRow({month:q.month,...q.totals}));s.history=s.history.slice(-LIMIT.history);
 return report(s);
}
function migration(s,value,opts={}){
 if(Number.isFinite(opts.month)&&s.lastMonth+1!==cal(opts.month))return noMove();
 const k=id(typeof value==='object'?value?.id:value),v=k?s?.last?.byLot?.[k]:null;
 return v?{...v.migration}:noMove();
}
function migrationAdjustment(s,lot,before,after,opts={}){
 if(!lot||lot.type!=='residential'||!Number.isFinite(before)||!Number.isFinite(after)||before<0||after<0)return 0;
 const v=migration(s,lot,opts);
 if(v.exitResidents>0&&before>=1){
  // Do not add last month's recommendation to existing losses. If the policy
  // calls for net departure, normal filling cannot hide that movement either.
  const expected=Math.max(0,before-Math.min(v.exitResidents,Math.floor(before)));
  return rnd(Math.min(0,expected-after),6)||0;
 }
 if(v.inResidents>0&&after+1e-6>=before){
  const cap=Number.isFinite(opts.capacity)?opts.capacity:after,target=Number.isFinite(opts.target)?opts.target:after;
  const preferred=Math.min(before+v.inResidents,cap,target);
  return rnd(Math.max(0,preferred-after),6)||0;
 }
 return 0;
}
return {COMPONENTS,REASONS,LIMIT,create,normalize,forecast,advance,tick:advance,report,migration,migrationAdjustment};
});
