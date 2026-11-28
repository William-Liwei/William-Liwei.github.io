/* Multi-month physical goods and private household purchasing in City Blueprint. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./economy.js'):root.Economy);
 if(typeof module==='object')module.exports=api;else root.MarketCycle=api;
})(globalThis,function(E){
'use strict';
// E.PRODUCTS keeps commercial activities abstract (one meal / visit / task).
// Only commodities have buffers. Spoilage is a game unit loss, never money.
const STORAGE={
 produce:{capacity:55,housing:.44,retail:1.35,cargo:9,decay:.28,description:'生鲜损耗高，结存适合短期调剂。'},
 fish:{capacity:31,housing:.22,retail:.70,cargo:8,decay:.38,description:'水产比其他货品更易损耗。'},
 livestock:{capacity:43,housing:.29,retail:.65,cargo:9,decay:.16,description:'畜产可短期入库。'},
 timber:{capacity:70,housing:.18,retail:.60,cargo:17,decay:.022,description:'木材可跨月储备。'},
 oil:{capacity:53,housing:.14,retail:.20,cargo:19,decay:.006,description:'原油需要专用储量。'},
 fuel:{capacity:45,housing:.18,retail:.44,cargo:14,decay:.011,description:'精炼燃料专门储存。'},
 ore:{capacity:80,housing:.18,retail:.36,cargo:20,decay:.004,description:'矿料可长期储备。'},
 processed_food:{capacity:61,housing:.49,retail:1.92,cargo:13,decay:.12,description:'加工食品仅有较小月度损耗。'},
 daily_goods:{capacity:57,housing:.45,retail:1.40,cargo:12,decay:.018,description:'日用品仓位随商业规模增长。'},
 components:{capacity:44,housing:.25,retail:.45,cargo:13,decay:.019,description:'电子元件可入库以应对短缺。'},
 materials:{capacity:80,housing:.18,retail:.55,cargo:18,decay:.009,description:'建材适合形成较长缓冲。'},
 equipment:{capacity:31,housing:.10,retail:.30,cargo:11,decay:.012,description:'设备仓位有限，需求较低。'}
};
const PRODUCTS=Object.keys(E.PRODUCTS),STORABLE=PRODUCTS.filter(k=>Object.hasOwn(STORAGE,k));
const LIMIT={stock:45000,indexMin:.65,indexMax:1.85,quantity:900000,lots:4000,history:24};
const quantityKeys=['opening','spoiled','availableReserve','reserveUsed','fresh','industryFresh','imports','exports','demand','firmDemand','householdDemand',
 'freshUsed','fulfilled','shortage','stored','overflow','unusedService','closing','capacity'];
const moneyTotals=['freshValue','importValue','exportValue','closingValue','spoilValue','householdSpending'];
const keep=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),qty=v=>Math.round(clamp(keep(v),0,LIMIT.quantity)*1000),
 unquant=v=>v/1000, quant=v=>unquant(qty(v)), cents=v=>Math.round(clamp(keep(v),0,1e10)*100)/100;
const idx=v=>Math.round(clamp(keep(v,1),LIMIT.indexMin,LIMIT.indexMax)*10000)/10000;
const count=(v,d=0)=>Math.floor(clamp(keep(v,d),0,1e9)), arr=v=>Array.isArray(v)?v:[],own=(o,k)=>Object.hasOwn(o,k);
const id=v=>typeof v==='string'||typeof v==='number'?String(v).slice(0,72):'';
const gameMonth=v=>Math.max(1,count(v,1));
const none=(keys)=>Object.fromEntries(keys.map(k=>[k,0]));
const stockOnly=v=>Object.fromEntries(STORABLE.flatMap(k=>qty(v?.[k])>0?[[k,Math.min(LIMIT.stock,quant(v[k]))]]:[]));
const starterPrices=()=>Object.fromEntries(PRODUCTS.map(k=>[k,1]));
const acceptPrices=v=>Object.fromEntries(PRODUCTS.map(k=>[k,idx(v?.[k])]));
const labels=(k)=>({id:k,name:E.PRODUCTS[k].name,unit:E.PRODUCTS[k].unit,unitValue:E.PRODUCTS[k].value,storable:own(STORAGE,k)});
function marketRow(k,row){
 const l=labels(k),p=idx(row?.previousIndex),q=idx(row?.priceIndex);
 return {...l,...Object.fromEntries(quantityKeys.map(x=>[x,quant(row?.[x])])),previousPrice:cents(l.unitValue*p),price:cents(l.unitValue*q),
  previousIndex:p,priceIndex:q,importShare:idxShare(row?.importShare),fill:idxShare(row?.fill,1)};
}
function idxShare(v,d=0){return Math.round(clamp(keep(v,d),0,1)*10000)/10000;}
function houseRow(v){
 return {population:count(v?.population),households:count(v?.households),payroll:cents(v?.payroll),payrollPerResident:cents(v?.payrollPerResident),
  basketCost:cents(v?.basketCost),pricePressure:Math.round(clamp(keep(v?.pricePressure,1),.25,4)*10000)/10000,
  affordability:Math.round(clamp(keep(v?.affordability,1),.2,2.5)*10000)/10000,spending:cents(v?.spending)};
}
function cycleTotal(v){
 return {...Object.fromEntries(quantityKeys.map(k=>[k,quant(v?.[k])])),...Object.fromEntries(moneyTotals.map(k=>[k,cents(v?.[k])])),
  stockUtilisation:idxShare(v?.stockUtilisation),physicalBalance:Math.round(keep(v?.physicalBalance)*1000)/1000};
}
function historyRow(v){
 if(!v||!Number.isFinite(v.month))return null;
 return {month:gameMonth(v.month),closing:quant(v.closing),spoiled:quant(v.spoiled),shortage:quant(v.shortage),imports:quant(v.imports),
  affordability:houseRow(v).affordability,spending:cents(v.spending)};
}
function create(seed='city-market'){
 return {version:1,seed:String(seed).slice(0,96),lastMonth:0,stock:{},index:starterPrices(),last:null,history:[]};
}
function normalize(raw,seed='city-market'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(raw?.version!==1)return s;
 s.lastMonth=count(raw.lastMonth);s.stock=stockOnly(raw.stock);s.index=acceptPrices(raw.index);
 if(s.lastMonth&&raw.last&&typeof raw.last==='object'){
  const products=Object.fromEntries(PRODUCTS.map(k=>[k,marketRow(k,raw.last.products?.[k])]));
  s.last={month:s.lastMonth,elapsed:count(raw.last.elapsed,1),products,totals:cycleTotal(raw.last.totals),households:houseRow(raw.last.households),
   integrationReady:!!raw.last.integrationReady};
 }
 s.history=arr(raw.history).slice(-LIMIT.history).map(historyRow).filter(Boolean);
 return s;
}
function population(city){
 return arr(city?.civic?.lots).slice(0,LIMIT.lots).reduce((a,l)=>l?.type==='residential'&&keep(l.level)>0?a+Math.floor(clamp(keep(l.occupants),0,450)):a,0);
}
function capacityFor(city){
 const rooms=arr(city?.civic?.lots).slice(0,LIMIT.lots).reduce((v,l)=>l?.type==='commercial'&&keep(l.level)>0?v+Math.min(3,keep(l.level)):v,0);
 const cargo=arr(city?.transit?.stations).slice(0,120).filter(s=>s&&['cargoYard','cargoPort','cargoAirport'].includes(s.type)&&s.operating!==false&&s.valid!==false).length;
 const pop=population(city);
 // A separate private-market pool. Industry modules' in-area buffers are not
 // included or reused, and neither is their inventory reported as local supply.
 return Object.fromEntries(STORABLE.map(k=>{
  const d=STORAGE[k];return [k,Math.floor(clamp(d.capacity+pop*d.housing+rooms*d.retail+cargo*d.cargo,1,LIMIT.stock))];
 }));
}
function contextFor(s,city){
 const month=gameMonth(city?.month),same=s.last?.month===month?s.last:null;
 const elapsed=same?same.elapsed:s.lastMonth?Math.max(1,Math.min(120,month-s.lastMonth)):1;
 const opening={},spoiled={},available={},index={};
 for(const k of PRODUCTS){
  index[k]=same?same.products[k].previousIndex:idx(s.index[k]);if(!own(STORAGE,k))continue;
  const n=qty(same?same.products[k].opening:s.stock[k]);
  const loss=clamp(Math.round(n*(1-(1-STORAGE[k].decay)**elapsed)),0,n);
  const good=n-loss;
  opening[k]=unquant(n);spoiled[k]=unquant(loss);available[k]=unquant(good);
 }
 return {month,elapsed,opening,spoiled,available,index,capacity:capacityFor(city)};
}
const BASKET={groceries:.76,meals:.43,repair:.14,recreation:.28,professional:.11,software:.12,finance:.085,research:.025,media:.23};
const necessities=new Set(['groceries','repair']);
const mixedGoods=new Set(['meals','professional']);
function householdRules(city,ctx,opts={}){
 const labor=opts.labor||city.labor?.last, map=new Map();
 const normalCost=Object.entries(BASKET).reduce((n,[k,v])=>n+v*E.PRODUCTS[k].value,0);
 const basketCost=Object.entries(BASKET).reduce((n,[k,v])=>n+v*E.PRODUCTS[k].value*ctx.index[k],0);
 const pricePressure=basketCost/normalCost;
 function place(l){
  const k=id(l?.id);
  if(map.has(k))return map.get(k);
  const n=count(l?.occupants),home=labor?.byHome?.[k],has=!!home&&Number.isFinite(home.payroll);
  const payroll=has?cents(home.payroll):0;
  const per=n?payroll/n:0;
  // No synthetic wages; the ¥35 in the ratio is built-in basic demand
  // resilience, not money paid to anyone or added to the city ledger.
  const relative=has?clamp((35+per)/(35+64),.40,1.62):1;
  const afford=clamp(relative/pricePressure,.28,1.75);
  const v={n,payroll,afford,has};map.set(k,v);return v;
 }
 function scale(l,k){
  if(l?.type!=='residential'||!own(BASKET,k))return 1;
  const p=place(l),price=ctx.index[k];
  if(necessities.has(k))return clamp(.83+.17*p.afford-.14*(price-1),.72,1.15);
  if(mixedGoods.has(k))return clamp(.68+.32*p.afford-.19*(price-1),.50,1.32);
  return clamp(.43+.57*p.afford-.25*(price-1),.33,1.48);
 }
 function households(){
  let households=0,population=0,payroll=0,weighted=0;const seen=new Set();
  for(const l of arr(city?.civic?.lots).slice(0,LIMIT.lots)){
   if(l?.type!=='residential'||keep(l.level)<1||!id(l.id)||seen.has(id(l.id)))continue;
   const def=E.sector(l),v=place(l);if(!v.n||!def)continue;
   seen.add(id(l.id));population+=v.n;households+=Math.ceil(v.n/Math.max(1,def.family));payroll+=v.payroll;weighted+=v.afford*v.n;
  }
  return houseRow({population,households,payroll,payrollPerResident:population?payroll/population:0,basketCost,pricePressure,
   affordability:population?weighted/population:1});
 }
 return {scale,households};
}
function prepare(s,city,supply={},opts={}){
 const ctx=contextFor(s,city),people=householdRules(city,ctx,opts);
 return {...supply,reserve:{...ctx.available},householdScale:people.scale,marketMonth:ctx.month};
}
function newIndex(previous,opening,closing,cap,freshUsed,overflow,demand,shortage,imports,storable){
 const n=unquant(demand),lack=demand?shortage/demand:0,importRate=demand?imports/demand:0;
 const longStock=storable&&cap?closing/cap:0;
 const toMarket=closing+freshUsed+overflow;
 const residual=toMarket?overflow/toMarket:0;
 const noTrade=!demand&&!freshUsed&&!closing&&!opening&&!overflow&&!imports;
 const target=noTrade?1:clamp(1+.98*lack+.12*importRate-.38*longStock-.31*residual,.66,1.83);
 const alpha=noTrade?.20:target>previous?.34:.29;
 return idx(previous+alpha*(target-previous));
}
function settle(s,city,snapshot,opts){
 const ctx=contextFor(s,city),people=householdRules(city,ctx,opts),products={},t=none(quantityKeys),amounts=none(moneyTotals);
 let balance=0,connected=0;
 for(const k of PRODUCTS){
  const def=E.PRODUCTS[k],e=snapshot?.products?.[k]||{},stores=own(STORAGE,k);
  const cap=stores?qty(ctx.capacity[k]):0,opening=stores?qty(ctx.opening[k]):0,loss=stores?qty(ctx.spoiled[k]):0;
  const spare=opening-loss,fresh=qty(e.output),demand=qty(e.demand);
  const first=Math.min(fresh,demand);
  // Only a wired E evaluator can confirm reserve actually purchased. It
  // never appears in fresh output, even when forecast asks multiple times.
  if(Number.isFinite(e.reserveUsed))connected++;
  const used=stores?Math.min(spare,Math.max(0,demand-first),qty(e.reserveUsed)):0;
  const imports=Math.min(Math.max(0,demand-first-used),qty(e.imports));
  const consumed=first+used+imports,shortage=demand-consumed;
  const exports=Math.min(fresh-first,qty(e.exports));
  const surplus=fresh-first-exports,rest=spare-used;
  const closing=stores?Math.min(cap,rest+surplus):0;
  const keptOld=Math.min(rest,closing),stored=closing-keptOld;
  const overflow=stores?rest+surplus-closing:0,unused=stores?0:surplus;
  const previous=ctx.index[k],price=newIndex(previous,opening,closing,cap,first,overflow+unused,demand,shortage,imports,stores);
  const firmDemand=Math.min(demand,qty(e.firmDemand));
  const householdDemand=Math.min(demand-firmDemand,qty(e.householdDemand));
  const row={opening,spoiled:loss,availableReserve:spare,reserveUsed:used,fresh,industryFresh:Math.min(fresh,qty(opts.supply?.local?.[k])),
   imports,exports,demand,firmDemand,householdDemand,freshUsed:first,fulfilled:consumed,shortage,stored,overflow,unusedService:unused,closing,capacity:cap};
  for(const name of quantityKeys)t[name]+=row[name];
  balance+=opening+fresh+imports-consumed-exports-loss-overflow-unused-closing;
  amounts.freshValue+=unquant(fresh)*def.value*previous;
  amounts.importValue+=unquant(imports)*def.value*previous;
  amounts.exportValue+=unquant(exports)*def.value*previous;
  amounts.closingValue+=unquant(closing)*def.value*price;
  amounts.spoilValue+=unquant(loss)*def.value*previous;
  if(demand>0&&householdDemand>0)amounts.householdSpending+=unquant(consumed)*householdDemand/demand*def.value*previous;
  products[k]=marketRow(k,{...Object.fromEntries(quantityKeys.map(x=>[x,unquant(row[x])])),
   previousIndex:previous,priceIndex:price,fill:demand?consumed/demand:1,importShare:demand?imports/demand:0});
 }
 const totals=cycleTotal({...Object.fromEntries(quantityKeys.map(k=>[k,unquant(t[k])])),...amounts,
  stockUtilisation:t.capacity?t.closing/t.capacity:0,physicalBalance:unquant(balance)});
 const households=houseRow({...people.households(),spending:totals.householdSpending});
 return {month:ctx.month,elapsed:ctx.elapsed,products,totals,households,integrationReady:connected===PRODUCTS.length};
}
function report(s){
 const rows=s.last||{month:s.lastMonth,elapsed:0,products:Object.fromEntries(PRODUCTS.map(k=>[k,marketRow(k)])),
  totals:cycleTotal(),households:houseRow(),integrationReady:false};
 return {...rows,stock:{...s.stock},prices:Object.fromEntries(PRODUCTS.map(k=>[k,cents(E.PRODUCTS[k].value*s.index[k])])),
  history:s.history};
}
function advance(s,city,economySnapshot,opts={}){
 const m=gameMonth(city?.month);
 if(m<=s.lastMonth)return {...report(s),noOp:true};
 if(!economySnapshot?.products)return {...report(s),noOp:true,reason:'缺少本月市场结算'};
 if(Number.isFinite(opts.supply?.marketMonth)&&opts.supply.marketMonth!==m)return {...report(s),noOp:true,reason:'市场供给快照并非本月'};
 const r=settle(s,city,economySnapshot,opts);
 s.stock=stockOnly(Object.fromEntries(STORABLE.map(k=>[k,r.products[k].closing])));
 s.index=acceptPrices(Object.fromEntries(PRODUCTS.map(k=>[k,r.products[k].priceIndex])));
 s.lastMonth=m;s.last=r;
 s.history.push(historyRow({month:m,...r.totals,...r.households}));s.history=s.history.slice(-LIMIT.history);
 return report(s);
}
function preview(s,city,economySnapshot,opts={}){
 return advance(normalize(s,s.seed),city,economySnapshot,opts);
}
return {STORAGE,STORABLE,LIMIT,create,normalize,prepare,report,advance,tick:advance,preview};
});
