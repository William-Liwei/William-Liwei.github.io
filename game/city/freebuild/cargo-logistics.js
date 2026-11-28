/* Fictional, monthly city cargo scheduler. Physical shipments, not municipal cash. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./economy.js'):root.Economy);
 if(typeof module==='object')module.exports=api;else root.CargoLogistics=api;
})(globalThis,function(E){
'use strict';
const MODES={
 local:{name:'短途道路',travel:1,fee:.35},road:{name:'公路货运',travel:1,fee:.85},
 rail:{name:'货运铁路',travel:2,fee:1.00},sea:{name:'港口货运',travel:3,fee:.67},air:{name:'货运航空',travel:1,fee:3.70}
};
const LIMIT={gates:96,queue:96,shipments:192,history:112,inbound:1800,inboundProduct:520,escrow:740,escrowProduct:300,
 order:430,orderAge:10,lane:2600,travel:12};
const REASONS={closed:'线路停运，货物等待恢复或换线',terminal:'端站吞吐量不足',storage:'入库区空间不足',wait:'等待本月运输额度',
 expires:'未发出的进口订单已超出等待时限',noGate:'没有能发运此类货物的线路',reroute:'改走同类备用线路并重新计在途时间'};
const PRODUCTS=Object.keys(E.PRODUCTS),GOODS=PRODUCTS.filter(k=>E.PRODUCTS[k].importable),EXP=PRODUCTS.filter(k=>E.PRODUCTS[k].exportable);
const dirs=['import','export'],modeKeys=Object.keys(MODES),events=['ordered','committed','departed','unloaded','delivered','rerouted','expired'];
const num=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),own=(o,k)=>Object.hasOwn(o,k),arr=v=>Array.isArray(v)?v:[];
const quant=(v,d=0,max=900000)=>Math.round(clamp(num(v,d),0,max)*1000)/1000;
const signed=(v)=>Math.round(num(v)*1000)/1000;
const money=(v,d=0)=>Math.round(clamp(num(v,d),0,1e10)*100)/100;
const int=(v,d=0,a=0,b=1e9)=>Math.floor(clamp(num(v,d),a,b)),calendar=v=>int(v,1,1);
const id=(v,n=100)=>typeof v==='string'||typeof v==='number'?String(v).slice(0,n):'';
const legalId=v=>id(v)&&/^[^\x00-\x1f\x7f]+$/.test(id(v)),jobId=v=>/^C[1-9][0-9]{0,8}$/.test(id(v));
const blank=(keys)=>Object.fromEntries(keys.map(k=>[k,0]));
const total=o=>quant(Object.values(o).reduce((n,v)=>n+num(v),0));
const alive=(q)=>q>0.00001;
const pick=(v,keys,max=900000,zeros=false)=>Object.fromEntries(keys.flatMap(k=>{
 const n=quant(v?.[k],0,max);return zeros||n?[[k,n]]:[];
}));
const stock=(v,max=LIMIT.inbound)=>{let free=max;return Object.fromEntries(GOODS.flatMap(k=>{
 const n=Math.min(free,quant(v?.[k],0,LIMIT.inboundProduct));free=quant(free-n);return n?[[k,n]]:[];
}));};
const add=(o,k,n)=>{if(n>0)o[k]=quant(num(o[k])+n);};
const take=(o,k,n)=>{const v=quant(num(o[k])-n);if(v)o[k]=v;else delete o[k];};
const goodFor=(d,k)=>GOODS.includes(k)&&!!E.PRODUCTS[k]?.[d==='import'?'importable':'exportable'];
function create(seed='city-cargo'){
 return {version:1,seed:String(seed).slice(0,100),next:1,revision:0,month:0,inbound:{},orders:[],shipments:[],last:null,history:[]};
}
function orderRow(v){
 if(!v||!jobId(v.id)||!dirs.includes(v.direction)||!goodFor(v.direction,v.product))return null;
 const quantity=quant(v.quantity,0,LIMIT.order);
 if(!quantity)return null;
 return {id:id(v.id),direction:v.direction,product:v.product,quantity,created:calendar(v.created)};
}
function shipmentRow(v){
 const a=orderRow(v);if(!a||!legalId(v.gateway)||!own(MODES,v.mode))return null;
 const dispatched=int(v.dispatched,a.created,a.created),remaining=int(v.remaining,1,0,LIMIT.travel);
 return {...a,gateway:id(v.gateway),mode:v.mode,dispatched,remaining,wait:int(v.wait,0,0,5000),
  status:['moving','closed','terminal','storage','reroute'].includes(v.status)?v.status:'moving',
  unitValue:money(v.unitValue,E.PRODUCTS[a.product].value)};
}
function gatewayRow(v){
 if(!v||!legalId(v.id)||!own(MODES,v.mode))return null;
 const m=MODES[v.mode],mode=v.mode,shared=id(v.terminalId??v.terminal??v.id);
 const importCapacity=quant(v.importCapacity??v.capacity,0,LIMIT.lane),exportCapacity=quant(v.exportCapacity??v.capacity,0,LIMIT.lane);
 const explicit=Number.isFinite(v.terminalCapacity);
 return {id:id(v.id),terminalId:legalId(shared)?shared:id(v.id),mode,
  connected:v.connected===true&&v.active!==false&&v.open!==false,
  travel:int(v.travel??v.travelMonths,m.travel,1,LIMIT.travel),importCapacity,exportCapacity,
  terminalCapacity:quant(v.terminalCapacity,Math.max(importCapacity,exportCapacity),LIMIT.lane),hasShared:explicit,
  fee:money(clamp(num(v.fee,m.fee),0,100)),goods:Array.isArray(v.goods)?[...new Set(v.goods.filter(k=>GOODS.includes(k)))].sort():null};
}
function marketGateway(v){
 const g=gatewayRow(v);if(!g)return null;
 const {hasShared,goods,...rest}=g;
 return {...rest,used:quant(v.used),departed:quant(v.departed),arrived:quant(v.arrived)};
}
function log(v){
 if(!v||!events.includes(v.action)||!goodFor(v.direction,v.product))return null;
 return {month:calendar(v.month),action:v.action,id:jobId(v.id)?id(v.id):'',gateway:legalId(v.gateway)?id(v.gateway):'',
  mode:own(MODES,v.mode)?v.mode:'',direction:v.direction,product:v.product,quantity:quant(v.quantity),value:money(v.value)};
}
const marketKeys=['imports','arrivedImports','usedImports','exports','dispatchedImports','dispatchedExports','paidExports','requestedImports','unroutable'];
const measureKeys=['inboundOpening','inbound','escrowOpening','escrow','inFlightImportOpening','inFlightImport',
 'inFlightExportOpening','inFlightExport','closingInventory','arrivedImports','usedImports','committedExports','paidExports','dispatchedImports','dispatchedExports','ordered'];
function measures(v){return {...Object.fromEntries(measureKeys.map(k=>[k,quant(v?.[k])])),
 flowError:signed(v?.flowError),capacity:quant(v?.capacity),used:quant(v?.used),blocked:quant(v?.blocked),queued:quant(v?.queued),inFlight:quant(v?.inFlight),fees:money(v?.fees),exportValue:money(v?.exportValue)};}
function modal(v){
 return Object.fromEntries(modeKeys.map(k=>{
  const r=v?.[k];return [k,{...Object.fromEntries(['queued','inFlight','blocked','departed','arrived','capacity','used','imported','exported'].map(t=>[t,quant(r?.[t])])),fees:money(r?.fees)}];
 }));
}
function statement(v){
 if(!v||typeof v!=='object')return null;
 return {month:calendar(v.month),...Object.fromEntries(marketKeys.map(k=>[k,pick(v[k],k==='exports'?EXP:GOODS,900000,k==='exports')])),
  fees:money(v.fees),exportValue:money(v.exportValue),totals:measures(v.totals),modes:modal(v.modes),
  gateways:arr(v.gateways).slice(0,LIMIT.gates).map(marketGateway).filter(Boolean),
  terminals:arr(v.terminals).slice(0,LIMIT.gates).filter(t=>t&&legalId(t.id)).map(t=>({id:id(t.id),capacity:quant(t.capacity),used:quant(t.used),remaining:quant(t.remaining)}))};
}
function normalize(raw,seed='city-cargo'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(raw?.version!==1)return s;
 s.revision=int(raw.revision);s.month=int(raw.month);s.inbound=stock(raw.inbound);
 const seen=new Set(),held={},ordered={},escrow={};let free=LIMIT.escrow;
 for(const v of arr(raw.orders).slice(0,LIMIT.queue)){
  const a=orderRow(v);if(!a||seen.has(a.id))continue;seen.add(a.id);
  if(a.direction==='export'){
   a.quantity=Math.min(a.quantity,free,Math.max(0,LIMIT.escrowProduct-num(escrow[a.product])));
   free=quant(free-a.quantity);add(escrow,a.product,a.quantity);
  }else{
   a.quantity=Math.min(a.quantity,Math.max(0,LIMIT.order-num(ordered[a.product])));add(ordered,a.product,a.quantity);
  }
  if(a.quantity){s.orders.push(a);s.next=Math.max(s.next,+a.id.slice(1)+1);}
 }
 for(const v of arr(raw.shipments).slice(0,LIMIT.shipments)){
  const a=shipmentRow(v);if(!a||seen.has(a.id))continue;seen.add(a.id);
  const k=a.direction+'/'+a.product;a.quantity=Math.min(a.quantity,Math.max(0,LIMIT.order*4-num(held[k])));add(held,k,a.quantity);
  if(a.quantity){s.shipments.push(a);s.next=Math.max(s.next,+a.id.slice(1)+1);}
 }
 s.next=Math.max(s.next,int(raw.next,1,1,999999999));
 s.history=arr(raw.history).slice(-LIMIT.history).map(log).filter(Boolean);
 s.last=s.month&&raw.last?statement({...raw.last,month:s.month}):null;
 return s;
}
function byProduct(rows,dir){
 const value={};for(const row of rows)if(row.direction===dir)add(value,row.product,row.quantity);
 return value;
}
function gateList(opts){
 const input=arr(opts.gateways),legacy=opts.legacyRoad;
 const raw=input.length?input:legacy?[{mode:'road',id:'legacy-road',...legacy}]:[];
 const kept=new Map();
 for(const v of raw.slice(0,LIMIT.gates)){const r=gatewayRow(v);if(r&&!kept.has(r.id))kept.set(r.id,r);}
 return [...kept.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
function bound(opts){
 return {inbound:quant(opts.inboundCapacity,LIMIT.inbound,LIMIT.inbound),escrow:quant(opts.escrowCapacity,LIMIT.escrow,LIMIT.escrow)};
}
function configured(gates,direction,g){
 const k=direction==='import'?'importCapacity':'exportCapacity';
 return gates.some(v=>v[k]>0&&(!v.goods||v.goods.includes(g)));
}
function budget(gates){
 const terminal=new Map(),per=new Map();
 for(const g of gates)if(g.connected){
  const t=terminal.get(g.terminalId)||{raw:0,shared:Infinity};
  t.raw+=Math.max(g.importCapacity,g.exportCapacity);
  if(g.hasShared)t.shared=Math.min(t.shared,g.terminalCapacity);
  terminal.set(g.terminalId,t);
 }
 for(const [key,v] of terminal){v.total=quant(Math.min(v.raw,v.shared,LIMIT.lane));v.left=v.total;}
 for(const g of gates)per.set(g.id,{...g,importLeft:g.connected?g.importCapacity:0,exportLeft:g.connected?g.exportCapacity:0,used:0,departed:0,arrived:0});
 function free(gateway,direction){
  const g=per.get(gateway),t=terminal.get(g?.terminalId);
  return t?Math.min(direction==='import'?g.importLeft:g.exportLeft,t.left):0;
 }
 function take(gateway,direction,quantity,arrival){
  const g=per.get(gateway),t=terminal.get(g.terminalId),k=direction==='import'?'importLeft':'exportLeft';
  g[k]=quant(g[k]-quantity);t.left=quant(t.left-quantity);
  g.used=quant(g.used+quantity);
  g[arrival?'arrived':'departed']=quant(g[arrival?'arrived':'departed']+quantity);
 }
 return {per,terminal,free,take};
}
function preference(g,product){
 const heavy=['oil','fuel','ore','timber','materials'].includes(product),quick=['fish','produce','components','equipment'].includes(product);
 const bonus=heavy?(g.mode==='sea'?1.9:g.mode==='rail'?1.55:0):quick&&g.mode==='air'?1.65:0;
 return g.travel+.23*g.fee-bonus;
}
function ranked(gates,direction,good,onlyOpen=true){
 const k=direction==='import'?'importCapacity':'exportCapacity';
 return gates.filter(v=>(!onlyOpen||v.connected)&&v[k]>0&&(!v.goods||v.goods.includes(good)))
  .sort((a,b)=>preference(a,good)-preference(b,good)||a.id.localeCompare(b.id));
}
function nextId(f){return f.next>=1000000000?'':'C'+f.next++;}
function append(f,o,action,quantity,value=0){
 const r=log({...o,month:f.month,action,quantity,value});if(r)f.logs.push(r);
}
function setup(s,city,opts){
 const month=calendar(opts.month??city?.month??s.month+1),gates=gateList(opts),caps=bound(opts),b=budget(gates);
 const inbound={...s.inbound},orders=s.orders.map(v=>({...v})),shipments=s.shipments.map(v=>({...v})),escrow=byProduct(orders,'export');
 return {month,gates,caps,b,next:s.next,inbound,orders,shipments,logs:[],arrivedImports:{},paidExports:{},
  usedImports:{},newExports:{},dispatchedImports:{},dispatchedExports:{},requestedImports:{},unroutable:{},
  exportValue:0,fees:0,modes:modal({}),
  opening:{inboundOpening:total(inbound),escrowOpening:total(escrow),
   inFlightImportOpening:total(byProduct(shipments,'import')),inFlightExportOpening:total(byProduct(shipments,'export'))}};
}
function arrivals(f){
 const done=new Set(),trips=f.shipments.slice().sort((a,b)=>a.dispatched-b.dispatched||(+a.id.slice(1))-(+b.id.slice(1)));
 for(const v of trips){
  if(v.dispatched>=f.month)continue;
  const g=f.b.per.get(v.gateway),m=f.modes[v.mode];
  if(!g?.connected||g.mode!==v.mode||g.goods&&!g.goods.includes(v.product)){
   v.wait++;v.status='closed';
   if(v.wait>=4){
    const other=ranked(f.gates,v.direction,v.product).find(x=>x.id!==v.gateway&&x.mode===v.mode);
    if(other){
     v.gateway=other.id;v.remaining=other.travel;v.wait=0;v.status='reroute';
     append(f,v,'rerouted',v.quantity);
    }
   }
   continue;
  }
  if(v.remaining>0)v.remaining--;
  if(v.remaining>0){v.wait=0;v.status='moving';continue;}
  if(v.direction==='export'){
   const value=money(v.quantity*v.unitValue);
   add(f.paidExports,v.product,v.quantity);f.exportValue=money(f.exportValue+value);
   m.arrived=quant(m.arrived+v.quantity);m.exported=quant(m.exported+v.quantity);
   append(f,v,'delivered',v.quantity,value);done.add(v.id);continue;
  }
  const free=Math.min(Math.max(0,f.caps.inbound-total(f.inbound)),Math.max(0,LIMIT.inboundProduct-num(f.inbound[v.product])));
  const available=f.b.free(g.id,'import'),qty=quant(Math.min(v.quantity,free,available));
  if(qty>0){
   add(f.inbound,v.product,qty);add(f.arrivedImports,v.product,qty);f.b.take(g.id,'import',qty,true);
   m.arrived=quant(m.arrived+qty);m.imported=quant(m.imported+qty);append(f,v,'unloaded',qty);
   v.quantity=quant(v.quantity-qty);
  }
  if(!v.quantity){done.add(v.id);continue;}
  v.wait++;v.status=free<=qty?'storage':'terminal';
 }
 f.shipments=f.shipments.filter(v=>!done.has(v.id));
 f.imports={...f.inbound};
 f.orders=f.orders.filter(v=>{
  if(v.direction==='import'&&f.month-v.created>=LIMIT.orderAge){append(f,v,'expired',v.quantity);return false;}
  return true;
 });
 return f;
}
function serialized(g){return g.map(k=>[k.id,k.mode,k.connected,k.travel,k.importCapacity,k.exportCapacity,k.terminalId,k.terminalCapacity,k.hasShared,k.fee,k.goods]);}
function signature(s,f,rows){
 const a=JSON.stringify([s.revision,f.month,serialized(f.gates),f.caps,f.imports,rows]);let h=2166136261;
 for(const c of a)h=Math.imul(h^c.charCodeAt(0),16777619);
 return (h>>>0).toString(36);
}
function begin(s,city,opts={}){
 const month=calendar(opts.month??city?.month??s.month+1);
 if(month<=s.month)return {month:s.month,settled:true,imports:{...(s.last?.imports||s.inbound)},arrivedImports:{...(s.last?.arrivedImports||{})},paidExports:{...(s.last?.paidExports||{})},gateways:s.last?.gateways||[]};
 const f=arrivals(setup(s,city,opts));
 return {month,revision:s.revision,imports:{...f.imports},arrivedImports:{...f.arrivedImports},paidExports:{...f.paidExports},
  gateways:[...f.b.per.values()].map(marketGateway)};
}
function requests(f,market,opts={}){
 const shortage={},unroutable={},offers={},prices={};
 const inWaiting=byProduct(f.orders,'import'),inFlight=byProduct(f.shipments,'import');
 for(const k of GOODS){
  const row=market?.products?.[k]||{},price=money(opts.prices?.[k],E.PRODUCTS[k].value);
  prices[k]=clamp(price,E.PRODUCTS[k].value*.3,E.PRODUCTS[k].value*3);
  const n=quant(row.shortage,0,LIMIT.order);
  if(n>0&&configured(f.gates,'import',k)){
   const remains=quant(Math.min(LIMIT.order-num(inWaiting[k]),n-num(inWaiting[k])-num(inFlight[k])));
   if(remains)shortage[k]=remains;
  }else if(n>0)unroutable[k]=n;
 }
 const stash=byProduct(f.orders,'export');
 let free=Math.max(0,f.caps.escrow-total(stash)),ordersFree=Math.max(0,LIMIT.queue-f.orders.length);
 const live=new Map();
 for(const k of f.gates)if(k.connected&&k.exportCapacity>0){
  const t=live.get(k.terminalId)||{limit:f.b.terminal.get(k.terminalId)?.total||0,combined:0};
  t.combined+=k.exportCapacity;live.set(k.terminalId,t);
 }
 const liveLimit=[...live.values()].reduce((n,t)=>n+Math.min(t.limit,t.combined),0);
 // Leave headroom for a limited export queue, not an infinite free warehouse.
 free=Math.min(free,Math.ceil(liveLimit*1.25));
 const exportable=EXP.filter(k=>goodFor('export',k));
 exportable.sort((a,b)=>num(market?.products?.[b]?.surplus)*prices[b]-num(market?.products?.[a]?.surplus)*prices[a]||a.localeCompare(b));
 for(const k of exportable){
  const row=market?.products?.[k];
  const residual=quant(Math.min(num(row?.surplus),Math.max(0,num(row?.output)-num(row?.demand))));
  const available=ranked(f.gates,'export',k).length>0;
  const n=quant(Math.min(free,LIMIT.escrowProduct-num(stash[k]),residual));
  if(n>0&&ordersFree>0&&available){
   offers[k]=n;free=quant(free-n);ordersFree--;
  }else if(residual>0&&!available)unroutable[k]=Math.max(residual,num(unroutable[k]));
 }
 return {shortage,offers,unroutable,prices};
}
function plan(s,city,opts={}){
 const month=calendar(opts.month??city?.month??s.month+1);
 if(month<=s.month)return {ok:false,reason:'本月货运已结算',month,revision:s.revision,imports:{...(s.last?.imports||{})},exports:blank(EXP)};
 if(!opts.market?.products)return {ok:false,reason:'需要本月交易前的市场结余',month,revision:s.revision,imports:{},exports:blank(EXP)};
 const f=arrivals(setup(s,city,opts)),r=requests(f,opts.market,opts);
 const imports={...f.imports},exports=pick(r.offers,EXP,900000,true);
 return {ok:true,month,revision:s.revision,imports,exports,arrivedImports:{...f.arrivedImports},quote:r,
  signature:signature(s,f,r),gateways:[...f.b.per.values()].map(marketGateway)};
}
function enqueue(f,product,direction,n){
 if(n<=0||f.orders.length>=LIMIT.queue)return 0;
 const id=nextId(f);if(!id)return 0;
 const row={id,product,direction,quantity:n,created:f.month};
 f.orders.push(row);append(f,row,direction==='export'?'committed':'ordered',n);return n;
}
function dispatch(f,prices){
 const flying={import:byProduct(f.shipments,'import'),export:byProduct(f.shipments,'export')};
 const pending=f.orders.slice().sort((a,b)=>a.created-b.created||(+a.id.slice(1))-(+b.id.slice(1)));
 for(const a of pending){
  if(f.shipments.length>=LIMIT.shipments)break;
  for(const g of ranked(f.gates,a.direction,a.product)){
   const cap=Math.max(0,LIMIT.order*4-num(flying[a.direction][a.product]));
   const qty=quant(Math.min(a.quantity,cap,f.b.free(g.id,a.direction)));
   if(qty>0){
    const id=nextId(f);if(!id)break;
    f.b.take(g.id,a.direction,qty,false);a.quantity=quant(a.quantity-qty);
    add(flying[a.direction],a.product,qty);
    const d={id,product:a.product,direction:a.direction,quantity:qty,created:a.created,gateway:g.id,mode:g.mode,
     dispatched:f.month,remaining:g.travel,wait:0,status:'moving',unitValue:money(prices[a.product],E.PRODUCTS[a.product].value)};
    const fees=money(qty*g.fee);
    f.shipments.push(d);append(f,d,'departed',qty,fees);
    add(a.direction==='import'?f.dispatchedImports:f.dispatchedExports,a.product,qty);
    const m=f.modes[g.mode];m.departed=quant(m.departed+qty);m.fees=money(m.fees+fees);
    f.fees=money(f.fees+fees);
   }
   if(!a.quantity||f.shipments.length>=LIMIT.shipments)break;
  }
 }
 f.orders=f.orders.filter(t=>t.quantity>0);
}
function output(f){
 const inbound=total(f.inbound),escrow=total(byProduct(f.orders,'export')),inFlightImport=total(byProduct(f.shipments,'import')),
  inFlightExport=total(byProduct(f.shipments,'export')), closingInventory=quant(inbound+escrow+inFlightImport+inFlightExport);
 const queued=quant(f.orders.reduce((n,v)=>n+v.quantity,0)),inFlight=inFlightImport+inFlightExport;
 let blocked=0;
 for(const v of f.shipments){
  const m=f.modes[v.mode];m.inFlight=quant(m.inFlight+v.quantity);
  if(v.status==='closed'||v.status==='storage'||v.status==='terminal'||v.status==='reroute'){
   m.blocked=quant(m.blocked+v.quantity);blocked+=v.quantity;
  }
 }
 for(const v of f.orders){
  const best=ranked(f.gates,v.direction,v.product)[0]||ranked(f.gates,v.direction,v.product,false)[0];
  if(best)f.modes[best.mode].queued=quant(f.modes[best.mode].queued+v.quantity);
 }
 for(const g of f.b.per.values()){
  const m=f.modes[g.mode];
  if(g.connected)m.capacity=quant(m.capacity+Math.min(g.terminalCapacity,Math.max(g.importCapacity,g.exportCapacity)));
  m.used=quant(m.used+g.used);
 }
 const arrivedImports=total(f.arrivedImports),usedImports=total(f.usedImports),committedExports=total(f.newExports),paidExports=total(f.paidExports),
  dispatchedImports=total(f.dispatchedImports),dispatchedExports=total(f.dispatchedExports),ordered=total(f.requestedImports);
 const o=f.opening,openingQty=o.inboundOpening+o.escrowOpening+o.inFlightImportOpening+o.inFlightExportOpening;
 const flowError=signed(openingQty+dispatchedImports+committedExports-usedImports-paidExports-closingInventory);
 return statement({month:f.month,imports:f.imports,arrivedImports:f.arrivedImports,usedImports:f.usedImports,
  exports:f.newExports,paidExports:f.paidExports,dispatchedImports:f.dispatchedImports,dispatchedExports:f.dispatchedExports,
  requestedImports:f.requestedImports,unroutable:f.unroutable,fees:f.fees,exportValue:f.exportValue,modes:f.modes,
  gateways:[...f.b.per.values()].map(marketGateway),terminals:[...f.b.terminal].map(([id,t])=>({id,capacity:t.total,used:quant(t.total-t.left),remaining:t.left})),
  totals:{...o,inbound,escrow,inFlightImport,inFlightExport,closingInventory,arrivedImports,usedImports,committedExports,paidExports,
   dispatchedImports,dispatchedExports,ordered,flowError,queued,inFlight,blocked,capacity:[...f.b.terminal.values()].reduce((n,v)=>n+v.total,0),used:[...f.b.terminal.values()].reduce((n,v)=>n+v.total-v.left,0),fees:f.fees,exportValue:f.exportValue}});
}
function report(s){
 return {month:s.month,revision:s.revision,inbound:{...s.inbound},escrow:byProduct(s.orders,'export'),orders:s.orders,shipments:s.shipments,
  last:s.last,history:s.history};
}
function advance(s,city,opts={}){
 const month=calendar(opts.month??city?.month??s.month+1);
 if(month<=s.month)return {...s.last,...report(s),ok:true,noOp:true};
 const deny=reason=>({...report(s),ok:false,reason});
 if(!opts.market?.products)return deny('需要本月最终市场流量');
 const quote=opts.plan||plan(s,city,opts);
 if(!quote?.ok||quote.month!==month||quote.revision!==s.revision)return deny('货运报价已失效，请重新计算本月供给');
 const f=arrivals(setup(s,city,opts)),r=quote.quote;
 if(quote.signature!==signature(s,f,r))return deny('线路、额度或在途状态已经变更');
 const actual={import:{},export:{}};
 for(const k of PRODUCTS){
  const p=opts.market.products[k],incoming=quant(p?.imports),leaving=quant(p?.exports);
  if(incoming>quant(f.imports[k])||leaving>quant(r.offers[k]))return deny('最终市场数超过可释放入库量或新出口托管量');
  add(actual.import,k,incoming);add(actual.export,k,leaving);
 }
 let countOut=Object.keys(actual.export).length;
 if(f.orders.length+countOut>LIMIT.queue||f.next+countOut>=1000000000)return deny('出口仓位不足，未重复扣除供给');
 // Commit only quantities actually removed by E, then fill orders from the
 // undispatched shortfall. Releases from old escrow do not touch E.
 for(const k of GOODS){
  const use=actual.import[k];if(use){take(f.inbound,k,use);add(f.usedImports,k,use);}
  const shipped=actual.export[k];if(shipped)add(f.newExports,k,enqueue(f,k,'export',shipped));
 }
 f.unroutable={...r.unroutable};
 for(const k of GOODS){
  const n=quant(r.shortage[k]);
  if(n)add(f.requestedImports,k,enqueue(f,k,'import',n));
 }
 dispatch(f,r.prices);
 const settled=output(f);
 s.month=month;s.revision++;s.inbound=f.inbound;s.orders=f.orders;s.shipments=f.shipments;s.next=f.next;s.last=settled;
 s.history=[...s.history,...f.logs].slice(-LIMIT.history);
 return {...settled,...report(s),ok:true};
}
return {MODES,LIMIT,REASONS,GOODS,create,normalize,begin,plan,advance,tick:advance,report};
});
