/* Compact settlement evidence for City Blueprint. No simulation or booking occurs here. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object')module.exports=api;else root.SystemLedger=api;
})(globalThis,function(){
'use strict';
const LIMIT=Object.freeze({history:24,services:24,rows:20000,month:1e9});
const CHECKS=Object.freeze({
 employment:'岗位／居民实际分配',payroll:'居民、企业和实际分配的工资守恒',
 laborTax:'已替换税额与工资税',householdPayroll:'消费模型使用的工资',market:'市场库存守恒',
 cargo:'货运托管、在途及入库守恒',cargoCapacity:'共用码头月度限额',cargoMarket:'货运与市场实际入账',
 cash:'市库现金变动',operating:'营运净额与实际经营调整',credit:'偿还本金、利息与市库扣款',booking:'公交运营替换旧预算',
 districts:'特别区预算替换旧预算'
});
const REASONS=Object.freeze({
 unreachable:'部分合适岗位无法往返通勤',unfilled:'仍有岗位未填补',qualification:'部分求职者缺少所需学历',
 experience:'部分求职者缺少实践经验',unroutableCargo:'部分货运需求没有适配口岸',blockedCargo:'货物在运输环节受阻',
 goodsShortage:'已结算商品需求有缺口',operatingDeficit:'经营月结为负（不含额外合约拨款）',
 overdue:'借款有逾期',noServiceBudget:'已报告的现有服务运营拨款为零',
 serviceGap:'已有服务记录未覆盖全部服务需求',auditFailed:'有结算差额待核查',missingEvidence:'部分核对没有足够的同月证据'
});
const LABOR=['workers','employed','unemployed','jobs','vacancies','payroll','walking','driving','graduatesHired'];
const WAIT=['noJobs','qualification','unreachable','experience','competition'];
const TAX=['payrollTax','businessTax','existingBusinessTax','businessAdjustment','adjustment'];
const MARKET=['opening','fresh','imports','exports','fulfilled','spoiled','overflow','unusedService','closing','demand','shortage','householdSpending','physicalBalance'];
const HOUSE=['payroll','affordability','spending'];
const CARGO=['inboundOpening','inbound','escrowOpening','escrow','inFlightImportOpening','inFlightImport','inFlightExportOpening','inFlightExport','closingInventory','arrivedImports','usedImports','committedExports','paidExports','dispatchedImports','dispatchedExports','capacity','used','ordered','queued','inFlight','blocked','fees','exportValue','flowError','unroutable'];
const MODES=['local','road','rail','sea','air'];
const MODE=['queued','inFlight','blocked','departed','arrived','capacity','used','imported','exported','fees'];
const CASH=['opening','closing','contractGrants','otherDelta','operatingNet','openingNet','balanceAdjustment','starter','serviceMatch','pressure','incidentCost','creditDelta','principal','interest','overdue','reserve','debt','actualDelta','expectedDelta'];
const BOOK=['income','expense','fleetExpense','fareRevenue','taxiRevenue','distanceExpense','net','replaced','oldBus','discount','projectedFare','adjustment','boarded','boardings','passengers','completed','abandoned'];
const TRANSIT=['passengers','validLines','inbound','outbound','buses','completed','denied','boarded','boardings','lines','missed','waiting','meanWait','meanTrip','connectedStops','routes','reachedHomes','reachedJobs'];
const TRAFFIC=['unserved','drivers','walkers','cross','cars','vehicles','delay','meanDelay','completed','queued','spillback','throughput','travelTime','gridlocked'];
const SERVICE=['reach','funded','spent','need','served','sites'];
const DISTRICTS=['industry','parks','campus'];
const OBJECT=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=Number.isFinite;
const arr=v=>Array.isArray(v)?v:[];
const n=v=>finite(v)&&Math.abs(v)<=1e12?Math.round(v*1e6)/1e6:null;
const month=v=>Number.isSafeInteger(v)&&v>0&&v<=LIMIT.month?v:0;
const label=(v,size=80)=>typeof v==='string'?v.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,size):'';
const code=v=>typeof v==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(v)&&!['constructor','prototype'].includes(v)?v:'';
const fields=(v,keys)=>Object.fromEntries(keys.map(k=>[k,n(v?.[k])]));
function each(v,fn){
 if(!OBJECT(v))return false;
 let count=0;
 for(const k in v)if(Object.hasOwn(v,k)){if(++count>LIMIT.rows||fn(v[k])===false)return false;}
 return true;
}
function sum(values){
 let total=0;
 for(const v of values){if(n(v)===null)return null;total+=v;}
 return n(total);
}
function fold(v,get){
 let value=0;return each(v,r=>{const x=n(get(r));if(x===null)return false;value+=x;})?n(value):null;
}
function foldArray(v,key){
 if(!Array.isArray(v)||v.length>LIMIT.rows)return null;
 let value=0;for(const r of v){const x=n(r?.[key]);if(x===null)return null;value+=x;}return n(value);
}
function at(v,m){return OBJECT(v)&&v.month===m&&v.noOp!==true&&v.provisional!==true?v:null;}
function row(v,m){return at(v?.last,m)||at(v,m);}
function range(value,a,b){return finite(value)&&value>=a&&value<=b?n(value):null;}
function eq(a,b,tol=0.00001){
 a=n(a);b=n(b);
 if(a===null||b===null)return {status:'missing',actual:a,expected:b,difference:null};
 const delta=difference(a,b);
 return {status:Math.abs(delta)<=tol?'passed':'failed',actual:a,expected:b,difference:delta};
}
function agreement(actual,expected,parts=[]){
 const top=eq(actual,expected);
 if(top.status==='failed')return top;
 const fail=parts.find(v=>v.status==='failed');
 if(fail)return fail;
 if(top.status==='missing'||parts.some(v=>v.status==='missing'))return {...top,status:'missing'};
 return top;
}
function difference(a,b){return finite(a)&&finite(b)?n(a-b):null;}
function limit(actual,expected){
 const v=eq(actual,expected);if(v.status!=='missing'&&v.difference<0&&v.actual>=0&&v.expected>=0)v.status='passed';return v;
}
function copyCoverage(v){
 const out={};
 if(!OBJECT(v))return out;
 for(const key of Object.keys(v).slice(0,LIMIT.services)){
  if(!code(key)||!OBJECT(v[key]))continue;
  const raw=v[key];const s=fields(raw,SERVICE);s.reach=range(s.reach,0,1);
  for(const f of SERVICE.slice(1))s[f]=range(s[f],0,1e12);
  s.isActive=typeof raw.isActive==='boolean'?raw.isActive:null;
  s.unit=['people','lots','students','seats','months'].includes(raw.unit)?raw.unit:null;out[key]=s;
 }
 return out;
}
function coverage(v,provided){
 const out=copyCoverage(provided);
 if(OBJECT(v))for(const key of Object.keys(v).slice(0,LIMIT.services)){
  if(!code(key)||Object.keys(out).length>=LIMIT.services&&!Object.hasOwn(out,key))continue;
  const reach=range(v[key],0,1);
  if(reach===null)continue;
  const old=out[key];out[key]={...(old||{...fields(null,SERVICE),isActive:null,unit:null}),reach:old?.reach??reach};
 }
 return out;
}
function districtView(v){
 if(!OBJECT(v))return null;
 const layers=[];
 for(const raw of arr(v.layers).slice(0,DISTRICTS.length*2)){
  const key=raw?.key;if(!DISTRICTS.includes(key)||layers.length===DISTRICTS.length*2)continue;
  layers.push({key,replaced:n(raw.replaced),net:n(raw.net)});
 }
 const baseline=n(v.baseline),merged=n(v.merged);
 const adjustment=sum(layers.map(x=>difference(x.net,x.replaced)));
 return {baseline,merged,layers,adjustment};
}
function districtAudit(v){
 if(!v)return eq(null,null);
 const audit=eq(v.merged,sum([v.baseline,v.adjustment]),.01);
 if(new Set(v.layers.map(x=>x.key)).size!==v.layers.length)
  return {...audit,status:'failed',reason:'duplicateLayer'};
 return audit;
}
function treasuryView(v,b,c){
 const opening=n(v?.opening),closing=n(v?.closing),contractGrants=range(v?.contractGrants,0,1e12);
 const otherDelta=v&&Object.hasOwn(v,'otherDelta')?n(v.otherDelta):0;
 const operatingNet=n(b?.net),creditDelta=n(c?.cashDelta);
 return {opening,closing,contractGrants,otherDelta,operatingNet,openingNet:n(b?.baseNet),balanceAdjustment:n(b?.adjustment),
  starter:n(b?.starter),serviceMatch:n(b?.serviceMatch),pressure:n(b?.pressure),incidentCost:n(b?.incidentCost),
  creditDelta,principal:n(c?.principal),interest:n(c?.interest),overdue:n(c?.overdue),reserve:n(c?.reserve),debt:n(c?.debt),
  actualDelta:difference(closing,opening),expectedDelta:sum([operatingNet,creditDelta,contractGrants,otherDelta])};
}
function cargoMarketChecks(h,m){
 if(!OBJECT(h?.usedImports)||!OBJECT(h?.exports)||!OBJECT(m?.products))return [eq(null,null)];
 const names=new Set();
 for(const part of [h.usedImports,h.exports,m.products])for(const k of Object.keys(part).slice(0,128))if(code(k))names.add(k);
 const checks=[];
 for(const k of names){checks.push(eq(h.usedImports[k]??0,m.products[k]?.imports),eq(h.exports[k]??0,m.products[k]?.exports));}
 return checks;
}
function flags(v){
 const out=[];
 if(v.labor.waiting.unreachable>0)out.push('unreachable');
 if(v.labor.vacancies>0)out.push('unfilled');
 if(v.labor.waiting.qualification>0)out.push('qualification');
 if(v.labor.waiting.experience>0)out.push('experience');
 if(v.cargo.unroutable>0)out.push('unroutableCargo');
 if(v.cargo.blocked>0)out.push('blockedCargo');
 if(v.market.shortage>0)out.push('goodsShortage');
 if(v.treasury.operatingNet<0)out.push('operatingDeficit');
 if(v.treasury.overdue>0)out.push('overdue');
 if(Object.values(v.services).some(s=>(s.sites>0||s.isActive===true)&&s.funded===0))out.push('noServiceBudget');
 if(Object.values(v.services).some(s=>s.reach!==null&&s.reach<.999&&s.need>0||s.served!==null&&s.need>s.served))out.push('serviceGap');
 if(Object.values(v.checks).some(c=>c.status==='failed'))out.push('auditFailed');
 if(Object.values(v.checks).some(c=>c.status==='missing'))out.push('missingEvidence');
 return out;
}
function snapshot(m,e={}){
 m=month(m);
 if(!m)return null;
 const l=at(e.labor,m),p=at(e.market,m),h=row(e.cargo,m),b=row(e.balance,m),c=row(e.credit,m),
  booking=at(e.booking,m),service=coverage(e.coverage||b?.serviceCoverage,e.services),districts=districtView(e.districts);
 const labor={...fields(l?.totals,LABOR),waiting:Object.fromEntries(WAIT.map(k=>[k,fold(l?.byHome,x=>x?.waitingReasons?.[k])])),
  tax:fields(l?.fiscal,TAX),fiscalReady:l?.fiscal?.ready===true};
 const market={...fields(p?.totals,MARKET),households:fields(p?.households,HOUSE),integrationReady:p?.integrationReady===true};
 const cargo={...fields(h?.totals,CARGO),unroutable:fold(h?.unroutable,v=>v),modes:Object.fromEntries(MODES.map(k=>[k,fields(h?.modes?.[k],MODE)]))};
 const treasury=treasuryView(e.treasury,b,c);
 const serviceBooking=fields(booking,BOOK),tr=fields(e.transit,TRANSIT),traffic=fields(e.traffic,TRAFFIC);
 const assignmentCount=foldArray(l?.assignments,'count'),assignmentPay=foldArray(l?.assignments,'payroll');
 const opening=sum([cargo.inboundOpening,cargo.escrowOpening,cargo.inFlightImportOpening,cargo.inFlightExportOpening]);
 const cargoClosing=sum([cargo.inbound,cargo.escrow,cargo.inFlightImport,cargo.inFlightExport]);
 const checks={
  employment:agreement(assignmentCount,labor.employed,[eq(fold(l?.byHome,x=>x?.employed),assignmentCount),eq(fold(l?.byWork,x=>x?.employees),assignmentCount),
   eq(labor.jobs,sum([labor.employed,labor.vacancies])),eq(labor.workers,sum([labor.employed,labor.unemployed])),
   eq(labor.unemployed,sum(Object.values(labor.waiting)))]),
  payroll:agreement(assignmentPay,labor.payroll,[eq(fold(l?.byHome,x=>x?.payroll),assignmentPay),eq(fold(l?.byWork,x=>x?.payroll),assignmentPay)]),
  laborTax:labor.fiscalReady?agreement(labor.tax.adjustment,sum([labor.tax.businessAdjustment,labor.tax.payrollTax]),
   [eq(labor.tax.businessAdjustment,difference(labor.tax.businessTax,labor.tax.existingBusinessTax)),eq(l?.fiscal?.payroll,assignmentPay)]):eq(null,null),
  householdPayroll:eq(market.households.payroll,labor.payroll),
  market:market.integrationReady?agreement(sum([market.opening,market.fresh,market.imports]),sum([market.fulfilled,market.exports,market.spoiled,market.overflow,market.unusedService,market.closing]),
   [eq(market.physicalBalance,0),eq(market.demand,sum([market.fulfilled,market.shortage]))]):eq(null,null),
  cargo:agreement(sum([opening,cargo.dispatchedImports,cargo.committedExports]),sum([cargo.usedImports,cargo.paidExports,cargo.closingInventory]),
   [eq(cargo.closingInventory,cargoClosing),eq(cargo.flowError,0),
    eq(sum([cargo.inboundOpening,cargo.arrivedImports]),sum([cargo.inbound,cargo.usedImports])),
    eq(sum([cargo.escrowOpening,cargo.committedExports]),sum([cargo.escrow,cargo.dispatchedExports])),
    eq(sum([cargo.inFlightImportOpening,cargo.dispatchedImports]),sum([cargo.inFlightImport,cargo.arrivedImports])),
    eq(sum([cargo.inFlightExportOpening,cargo.dispatchedExports]),sum([cargo.inFlightExport,cargo.paidExports]))]),
  cargoCapacity:agreement(foldArray(h?.terminals,'used'),cargo.used,[
   eq(foldArray(h?.terminals,'capacity'),cargo.capacity),limit(cargo.used,cargo.capacity),
   eq(sum(MODES.map(k=>cargo.modes[k].used)),cargo.used),
   ...arr(h?.terminals).slice(0,LIMIT.rows).map(t=>agreement(difference(t?.capacity,t?.used),t?.remaining,[limit(t?.used,t?.capacity)]))]),
  cargoMarket:market.integrationReady?agreement(cargo.usedImports,market.imports,[eq(cargo.committedExports,market.exports),...cargoMarketChecks(h,p)]):eq(null,null),
  cash:eq(treasury.actualDelta,treasury.expectedDelta,.01),
  operating:eq(treasury.operatingNet,sum([treasury.openingNet,treasury.balanceAdjustment,finite(treasury.incidentCost)?-treasury.incidentCost:null]),.01),
  credit:agreement(treasury.creditDelta,finite(c?.paid)?-c.paid:null,
   [eq(c?.paid,sum([treasury.principal,treasury.interest]),.01),eq(c?.operatingNet,treasury.operatingNet,.01)]),
  booking:agreement(serviceBooking.adjustment,sum([difference(serviceBooking.net,serviceBooking.replaced),serviceBooking.discount]),
   [eq(serviceBooking.net,difference(serviceBooking.income,serviceBooking.expense),.01)]),
  districts:districtAudit(districts)
 };
 const v={month:m,contextId:label(e.contextId),labor,market,cargo,treasury,transit:tr,traffic,services:service,booking:serviceBooking,districts,checks};
 return {...v,flags:flags(v)};
}
const CONTROL_LABELS=Object.freeze({
 transport:'可达通勤及运输',labor:'劳动力匹配与工资',market:'家庭购买力和商品分配',treasury:'税收与月度现金',services:'有预算、可达的公共服务'
});
// The order illustrates the game model; a ledger is not causal proof, and
// many arrows are conditional (e.g. a tax gain does not approve a new school).
function compact(v){
 const m=month(v?.month);if(!m)return null;
 return {month:m,workers:n(v.labor?.workers??v.workers),employed:n(v.labor?.employed??v.employed),
  unreachable:n(v.labor?.waiting?.unreachable??v.unreachable),vacancies:n(v.labor?.vacancies??v.vacancies),
  payroll:n(v.labor?.payroll??v.payroll),payrollTax:n(v.labor?.tax?.payrollTax??v.payrollTax),businessTax:n(v.labor?.tax?.businessTax??v.businessTax),
  cash:n(v.treasury?.closing??v.cash),operatingNet:n(v.treasury?.operatingNet??v.operatingNet),reserve:n(v.treasury?.reserve??v.reserve),
  arrivals:n(v.cargo?.arrivedImports??v.arrivals),inFlight:n(v.cargo?.inFlight??v.inFlight),shortage:n(v.market?.shortage??v.shortage),
  serviceCoverage:Object.fromEntries(Object.entries(copyCoverage(v.services)).filter(([,x])=>x.reach!==null).map(([k,x])=>[k,x.reach])
   .concat(Object.entries(v.serviceCoverage||{}).slice(0,LIMIT.services).filter(([k,x])=>code(k)&&range(x,0,1)!==null)).slice(0,LIMIT.services)),
  flags:[...new Set(arr(v.flags).slice(0,48).filter(x=>typeof x==='string'&&Object.hasOwn(REASONS,x)))]};
}
function checkSaved(v){
 if(!OBJECT(v)||!['passed','failed','missing'].includes(v.status))return eq(null,null);
 const a=n(v.actual),b=n(v.expected);
 const status=(a===null||b===null)&&v.reason!=='duplicateLayer'?'missing':v.status;
 return {status,actual:a,expected:b,difference:difference(a,b),...(v.reason==='duplicateLayer'?{reason:v.reason}:{})};
}
function cleanSnapshot(v,contextId){
 const m=month(v?.month);if(!m||!OBJECT(v))return null;
 const stored=label(v.contextId);if(stored&&contextId&&stored!==contextId)return null;
 const labor={...fields(v.labor,LABOR),waiting:fields(v.labor?.waiting,WAIT),tax:fields(v.labor?.tax,TAX),fiscalReady:v.labor?.fiscalReady===true};
 const market={...fields(v.market,MARKET),households:fields(v.market?.households,HOUSE),integrationReady:v.market?.integrationReady===true};
 const cargo={...fields(v.cargo,CARGO),modes:Object.fromEntries(MODES.map(k=>[k,fields(v.cargo?.modes?.[k],MODE)]))};
 const treasury=fields(v.treasury,CASH), booking=fields(v.booking,BOOK),transit=fields(v.transit,TRANSIT),traffic=fields(v.traffic,TRAFFIC);
 const services=copyCoverage(v.services),districts=districtView(v.districts);
 const checks=Object.fromEntries(Object.keys(CHECKS).map(k=>[k,checkSaved(v.checks?.[k])]));
 // Restoring a ledger is a display operation, not recertification.
 const out={month:m,contextId:contextId||stored,labor,market,cargo,treasury,transit,traffic,services,booking,districts,checks};
 return {...out,flags:flags(out)};
}
function create(contextId=''){return {version:1,contextId:label(contextId),lastMonth:0,last:null,history:[]};}
function normalize(raw,contextId){
 const stored=label(raw?.contextId),wanted=label(contextId),s=create(wanted||stored);
 if(raw?.version!==1||wanted&&stored&&wanted!==stored)return s;
 s.last=cleanSnapshot(raw.last,s.contextId);
 if(!s.last)return s;
 if(!s.contextId)s.contextId=s.last.contextId;
 s.lastMonth=s.last.month;
 const rows=new Map();
 for(const r of arr(raw.history).slice(-LIMIT.history*2)){
  const q=compact(r);if(q&&q.month<s.lastMonth)rows.set(q.month,q);
 }
 rows.set(s.lastMonth,compact(s.last));
 s.history=[...rows.values()].sort((a,b)=>a.month-b.month).slice(-LIMIT.history);
 return s;
}
function report(s){
 return {contextId:s?.contextId||'',lastMonth:s?.lastMonth||0,last:s?.last||null,history:s?.history||[]};
}
function advance(s,city,e={}){
 const m=month(city?.month);
 if(!m)return {...report(s),ok:false,reason:'invalidMonth'};
 const key=label(e.contextId);
 if(key&&s.contextId&&key!==s.contextId)return {...report(s),ok:false,reason:'contextMismatch'};
 if(m<=s.lastMonth)return {...report(s),ok:true,noOp:true};
 if(!s.contextId&&key)s.contextId=key;
 const v=snapshot(m,{...e,contextId:s.contextId});
 s.last=v;s.lastMonth=m;
 s.history=[...s.history,compact(v)].slice(-LIMIT.history);
 return {...report(s),ok:true};
}
const DELTA={
 labor:['employed','unemployed','vacancies','payroll','waiting.unreachable','tax.payrollTax','tax.businessTax','tax.adjustment'],
 market:['shortage','fulfilled','householdSpending','households.affordability','households.payroll'],
 cargo:['inFlight','arrivedImports','usedImports','blocked','unroutable'],
 treasury:['actualDelta','expectedDelta','operatingNet','contractGrants','closing','reserve','overdue'],
 transit:['passengers','validLines','completed','waiting','meanWait','meanTrip','reachedHomes','reachedJobs'],
 traffic:['unserved','drivers','walkers','meanDelay','completed','queued','spillback','throughput'],
 booking:['net','adjustment']
};
const pick=(v,k)=>k.split('.').reduce((x,path)=>x?.[path],v);
function compare(before,after,o={}){
 const a=cleanSnapshot(before),b=cleanSnapshot(after),controlId=label(o.controlId),lever=label(o.lever);
 if(!a||!b)return {ok:false,reason:'missingSnapshots'};
 if(!a.contextId||a.contextId!==b.contextId||a.month!==b.month)return {ok:false,reason:'contextMismatch'};
 if(o.controlled!==true||!controlId||!lever)return {ok:false,reason:'missingControl'};
 const delta=Object.fromEntries(Object.entries(DELTA).map(([k,keys])=>[k,Object.fromEntries(keys.map(x=>[x,difference(pick(b[k],x),pick(a[k],x))]))]));
 const services={};
 for(const k of [...new Set([...Object.keys(a.services),...Object.keys(b.services)])].slice(0,LIMIT.services)){
  const from=a.services[k],to=b.services[k],sameUnit=from?.unit===to?.unit;
  services[k]=Object.fromEntries(SERVICE.map(x=>[x,['served','need'].includes(x)&&!sameUnit?null:difference(to?.[x],from?.[x])]));
 }
 const verifiable=Object.values(delta).some(group=>Object.values(group).some(Number.isFinite));
 return {ok:true,month:a.month,contextId:a.contextId,controlId,lever,evidence:'controlledProjection',
  verified:false,verifiable,delta:{...delta,services},beforeFlags:a.flags,afterFlags:b.flags};
}
return {LIMIT,CHECKS,REASONS,CONTROL_LABELS,create,normalize,snapshot,advance,report,compare};
});
