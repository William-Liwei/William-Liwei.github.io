/* Runtime-only, same-month, save-gated construction history. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object')module.exports=api;else root.ConstructionHistory=api;
})(globalThis,function(){
'use strict';
const LIMIT=Object.freeze({entries:24,bytes:6000000,workNodes:360000,depth:28,array:14000,patches:8500});
const KEYS=Object.freeze([
 'network.nodes','network.edges','network.turns','network.buses','network.next',
 'civic.zones','civic.lots','civic.services','civic.nextId','civic.next','civic.serial',
 'utilities.lines','utilities.nextId','utilities.managed','utilities.bootstrapped',
 'transit.stations','transit.tracks','transit.lines','transit.next',
 'districts.districts','districts.next','parking.lots','parking.next','activeTravel.links','activeTravel.next',
 'education.sites','education.next','justice.sites','justice.next','care.sites','care.next','care.assignments',
 'terrain.nodes','terrain.statistics','terrain.revision','industry.modules','industry.next','social.sites','social.next',
 'parks.parks','parks.next','campus.campuses','campus.students','campus.next','signals',
 'grid.sites','grid.storage','grid.enabled','grid.next','grid.revision','publicWorks.assets','publicWorks.revision'
]);
const ALLOWED=new Set(KEYS);
const DEFAULT_KINDS=Object.freeze(['road','upgrade','erase','junction','bus','polygon','frontage','district','station','track','line','utility',
 'service','gridLife','worksRepair','active','parking','careBuild','justiceBuild','schoolBuild','parkLife','campusLife','social','industry','earth','signal','batch']);
const KINDS=new Set(DEFAULT_KINDS);
const PROTECTED=Object.freeze(['finance','credit','balance','contracts','history','progression','cargo.last','labor.lastMonth',
 'market.lastMonth','publicWorks.lastMonth','publicWorks.funding','grid.lastMonth','gridDrill','mobilityPolicy',
 'civic.budgets','justice.policy','social.policy','industry.policies','transitService.settings','transitService.taxiDepots','transitService.next']);
const REASONS=Object.freeze({
 empty:'没有可以操作的同月施工',notConstruction:'这项交易或政策不计入施工历史',
 scope:'施工更改超出安全撤销范围',noChange:'没有可撤销的施工改动',month:'已跨月，不能撤销已参与结算的施工',
 map:'城市或地图已切换',cash:'市库余额另有变动，不能独立撤销施工费用',
 conflict:'工程对象或相邻设施已经改变，无法安全还原',stale:'施工操作已变更，请重新查看',
 large:'这笔施工超出历史容量，不能撤销',invalid:'施工历史不能读取这份城市状态',
 notApplied:'尚未生成可保存的撤销结果'
});
const own=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===null||Object.getPrototypeOf(v)===Object.prototype);
const banned=new Set(['__proto__','constructor','prototype']);
const text=(v,n=120)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,n):'';
const cash=v=>Number.isFinite(v?.network?.cash)&&Math.abs(v.network.cash)<=1e12?v.network.cash:null;
const mon=v=>Number.isSafeInteger(v)&&v>0&&v<=1e9?v:0;
const paths=new Map([...KEYS,...PROTECTED].map(k=>[k,k.split('.')]));
const EMPTY=Object.freeze({has:false});
const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
const failed=reason=>({ok:false,reason});
const sessionData=new WeakMap(),quoteData=new WeakMap();
function rpath(root,path){
 let v=root;
 for(const p of path){if(!own(v,p)||v[p]===undefined)return EMPTY;v=v[p];}
 return {has:true,value:v};
}
function read(v,k){return rpath(v,paths.get(k));}
function put(root,path,wire){
 let v=root;
 for(let i=0;i<path.length-1;i++){
  const p=path[i];
  if(!own(v,p)||!plain(v[p]))return false;
  v=v[p];
 }
 const k=path.at(-1);
 if(banned.has(k))return false;
 if(wire===null)delete v[k];else Object.defineProperty(v,k,{value:JSON.parse(wire),writable:true,configurable:true,enumerable:true});
 return true;
}
const error=code=>{throw new Error(code);};
function budget(){return {seen:0,text:0};}
function wire(value,work,depth=0){
 if(++work.seen>LIMIT.workNodes||depth>LIMIT.depth)error('large');
 if(value===null)return 'null';
 if(typeof value==='string'){work.text+=value.length;if(value.length>LIMIT.bytes||work.text>LIMIT.bytes*3)error('large');return JSON.stringify(value);}
 if(typeof value==='boolean')return value?'true':'false';
 if(typeof value==='number'){if(!Number.isFinite(value))error('invalid');return JSON.stringify(value);}
 if(Array.isArray(value)){
  if(value.length>LIMIT.array)error('large');
  const tmp=[];
  for(let i=0;i<value.length;i++)tmp.push(wire(value[i]===undefined?null:value[i],work,depth+1));
  return '['+tmp.join(',')+']';
 }
 if(plain(value)){
  const keys=Object.keys(value).sort();if(keys.length>LIMIT.array)error('large');
  const parts=[];
  for(const k of keys){
   if(banned.has(k))error('invalid');if(value[k]===undefined)continue;
   parts.push(JSON.stringify(k)+':'+wire(value[k],work,depth+1));
  }
  return '{'+parts.join(',')+'}';
 }
 error('invalid');
}
function encode(v,work){return v.has?wire(v.value,work):null;}
function pairEqual(a,b,w){
 if(a.has!==b.has)return false;if(!a.has||Object.is(a.value,b.value))return true;
 return encode(a,w)===encode(b,w);
}
function itemId(v){
 if(!plain(v)||!own(v,'id')||typeof v.id!=='string'&&!Number.isSafeInteger(v.id))return '';
 if(typeof v.id==='string'&&(!v.id||v.id.length>180))return '';
 return typeof v.id==='string'?'s:'+v.id:'n:'+String(v.id);
}
function indexed(a){
 if(!Array.isArray(a)||a.length>LIMIT.array)return null;
 const map=new Map(),order=[];
 for(const x of a){const k=itemId(x);if(!k||map.has(k))return null;map.set(k,x);order.push(k);}
 return {order,map};
}
function compactDiff(a,b,path,result,w,depth=0){
 if(Object.is(a.value,b.value)&&a.has===b.has)return;
 if(result.length>=LIMIT.patches||depth>LIMIT.depth)error('large');
 if(a.has&&b.has&&plain(a.value)&&plain(b.value)){
  const keys=[...new Set([...Object.keys(a.value),...Object.keys(b.value)])].sort();
  if(keys.length>LIMIT.array)error('large');
  for(const k of keys){
   if(banned.has(k))error('invalid');
   compactDiff(rpath(a.value,[k]),rpath(b.value,[k]),[...path,k],result,w,depth+1);
  }
  return;
 }
 if(a.has&&b.has&&Array.isArray(a.value)&&Array.isArray(b.value)){
  const i=indexed(a.value),j=indexed(b.value);
  if(i&&j){
   const items=[],orderBefore=i.order.filter(k=>j.map.has(k)),orderAfter=j.order.filter(k=>i.map.has(k));
   const shuffle=orderBefore.length!==orderAfter.length||orderBefore.some((k,n)=>k!==orderAfter[n]);
   const at0=new Map(i.order.map((k,n)=>[k,n])),at1=new Map(j.order.map((k,n)=>[k,n]));
   for(const k of new Set([...i.order,...j.order])){
    const ni=i.map.get(k),nj=j.map.get(k);
    const before=i.map.has(k)?wire(ni,w):null,after=j.map.has(k)?wire(nj,w):null;
    if(before!==after)items.push({k,before,after,i0:before===null?-1:at0.get(k),i1:after===null?-1:at1.get(k)});
   }
   if(items.length||shuffle)result.push({path,array:true,order0:shuffle?i.order:null,order1:shuffle?j.order:null,items});
   return;
  }
 }
 const before=encode(a,w),after=encode(b,w);
 if(before!==after)result.push({path,array:false,before,after});
}
// Non-patched dependency fields are checked with a dual 32-bit canonical
// fingerprint for compactness; changed payloads are always matched exactly.
function digest(value,w){
 const s=encode(value,w);if(s===null)return null;
 let a=2166136261,b=0x9e3779b9;
 for(let i=0;i<s.length;i++){
  const x=s.charCodeAt(i);a=Math.imul(a^x,16777619);
  b=Math.imul(b^x^i,0x5bd1e995);b^=b>>>13;
 }
 return s.length+':'+(a>>>0)+':'+(b>>>0);
}
function guards(world,w,keys=KEYS){return Object.fromEntries(keys.map(k=>[k,digest(read(world,k),w)]));}
function guardMatch(world,target,w){return !Object.entries(target).some(([k,v])=>digest(read(world,k),w)!==v);}
function metadata(world,contextId){
 if(mon(world?.month)===0||cash(world)===null||typeof world?.mapId!=='string'||!world.mapId)return null;
 return {month:world.month,map:world.mapId,mode:world.sandbox===true,contextId};
}
function sameContext(world,e,contextId){
 if(world?.mapId!==e.map||(world?.sandbox===true)!==e.mode||contextId!==e.contextId)return 'map';
 return mon(world?.month)!==e.month?'month':'';
}
function patchItem(cur,p,from,to,w){
 const v=rpath(cur,p.path);
 if(!p.array){
  if(encode(v,w)!==p[from])return false;
  return put(cur,p.path,p[to]);
 }
 const f=v.has?indexed(v.value):null;
 const a=from==='before'?p.order0:p.order1,b=to==='before'?p.order0:p.order1;
 if(!f||a&&(f.order.length!==a.length||f.order.some((k,i)=>k!==a[i])))return false;
 const inserts=[];
 for(const item of p.items){
  const have=f.map.has(item.k)?wire(f.map.get(item.k),w):null;
  const expect=from==='before'?item.i0:item.i1;
  if(have!==item[from]||(expect>=0&&f.order[expect]!==item.k))return false;
  if(item[to]===null)f.map.delete(item.k);else {
   f.map.set(item.k,JSON.parse(item[to]));
   if(item[from]===null)inserts.push({k:item.k,i:to==='before'?item.i0:item.i1});
  }
 }
 const order=b||f.order.filter(k=>f.map.has(k));
 if(!b)for(const x of inserts.sort((a,b)=>a.i-b.i)){
  if(x.i<0||x.i>order.length)return false;
  order.splice(x.i,0,x.k);
 }
 if(order.length!==f.map.size||order.some(k=>!f.map.has(k)))return false;
 const parent=rpath(cur,p.path.slice(0,-1));
 if(!parent.has||!plain(parent.value))return false;
 parent.value[p.path.at(-1)]=order.map(k=>f.map.get(k));
 return true;
}
function conf(v,d,min,max){return Number.isFinite(v)?Math.floor(Math.max(min,Math.min(max,v))):d;}
function create(o={}){
 if(typeof o==='string')o={contextId:o};
 const s=Object.freeze({version:1});
 sessionData.set(s,{contextId:text(o.contextId,100),limit:conf(o.limit,LIMIT.entries,1,LIMIT.entries),
  maxBytes:conf(o.maxBytes,LIMIT.bytes,1024,LIMIT.bytes),undo:[],redo:[],generation:0,lastId:0,reason:''});
 return s;
}
function summary(e){return e?{id:e.id,label:e.label,kind:e.kind,month:e.month,items:e.items,cashDelta:e.afterCash-e.beforeCash,bytes:e.bytes}:null;}
function report(s){
 const d=sessionData.get(s);if(!d)return {undo:0,redo:0,undoTop:null,redoTop:null,bytes:0,reason:'invalid'};
 return {undo:d.undo.length,redo:d.redo.length,undoTop:summary(d.undo.at(-1)),redoTop:summary(d.redo.at(-1)),
  bytes:[...d.undo,...d.redo].reduce((x,r)=>x+r.bytes,0),limit:d.limit,reason:d.reason};
}
function clear(s,reason=''){
 const d=sessionData.get(s);if(!d)return false;
 d.undo=[];d.redo=[];d.generation++;d.reason=text(reason,100);return true;
}
function record(s,before,after,o={}){
 const d=sessionData.get(s);if(!d)return failed('invalid');
 const kind=text(o.kind,32),contextId=text(o.contextId,100)||d.contextId;
 if(!KINDS.has(kind)||kind==='batch'&&Array.isArray(o.kinds)&&o.kinds.some(k=>!KINDS.has(k)||k==='batch'))return failed('notConstruction');
 if(d.contextId&&contextId!==d.contextId)return failed('map');
 const a=metadata(before,contextId),b=metadata(after,contextId);if(!a||!b)return failed('invalid');
 const mismatch=sameContext(after,a,contextId);if(mismatch)return failed(mismatch);
 if(o.month!==undefined&&o.month!==a.month)return failed('month');
 if(o.keys!==undefined&&(!Array.isArray(o.keys)||o.keys.some(k=>!ALLOWED.has(k))))return failed('scope');
 const keys=o.keys?new Set(o.keys):null,patch=[],w=budget();
 try{
  if(PROTECTED.some(k=>!pairEqual(read(before,k),read(after,k),w)))return failed('scope');
  const g0={},g1={};
  for(const k of KEYS){
   const old=read(before,k),next=read(after,k),da=digest(old,w),db=digest(next,w);
   g0[k]=da;g1[k]=db;
   if(da===db)continue;
   if(keys&&!keys.has(k))return failed('scope');
   compactDiff(old,next,paths.get(k),patch,w);
  }
  if(!patch.length)return failed('noChange');
  const beforeCash=cash(before),afterCash=cash(after);
  const count=Array.isArray(o.kinds)?o.kinds.length:o.items;
  const e={...a,id:d.lastId+1,label:text(o.label)||'施工',kind,items:conf(count,1,1,500),
   beforeCash,afterCash,patch,g0,g1,protected:guards(before,w,PROTECTED)};
  e.bytes=2*JSON.stringify(e).length+48;
  if(e.bytes>d.maxBytes)return failed('large');
  // An untracked structural or cash edit between otherwise valid records is
  // a transaction boundary, not a way to make older frames undoable again.
  const top=d.undo.at(-1);
  if(top&&(top.month!==a.month||top.map!==a.map||top.mode!==a.mode||top.afterCash!==beforeCash||
    Object.keys(g0).some(k=>g0[k]!==top.g1[k])||Object.keys(e.protected).some(k=>e.protected[k]!==top.protected[k])))d.undo.length=0;
  d.contextId=contextId;d.lastId=e.id;d.generation++;d.reason='';d.redo.length=0;d.undo.push(e);
  let bytes=d.undo.reduce((x,r)=>x+r.bytes,0);
  while(d.undo.length>d.limit||bytes>d.maxBytes)bytes-=d.undo.shift().bytes;
  return {ok:true,entry:summary(e)};
 }catch(ex){return failed(ex.message==='large'?'large':'invalid');}
}
function ready(d,action,world,contextId){
 if(action!=='undo'&&action!=='redo')return failed('invalid');
 const e=d[action].at(-1);if(!e)return failed('empty');
 const why=sameContext(world,e,contextId);if(why)return failed(why);
 const undo=action==='undo',expected=undo?e.afterCash:e.beforeCash,restored=undo?e.beforeCash:e.afterCash;
 if(cash(world)!==expected)return failed('cash');
 try{
  const w=budget();
  if(!guardMatch(world,e.protected,w)||!guardMatch(world,undo?e.g1:e.g0,w))return failed('conflict');
 }catch(ex){return failed(ex.message==='large'?'large':'invalid');}
 return {ok:true,e,expected,restored,undo};
}
function quote(s,action,world,o={}){
 const d=sessionData.get(s);if(!d)return failed('invalid');
 const contextId=text(o.contextId,100)||d.contextId,r=ready(d,action,world,contextId);
 if(!r.ok)return r;
 const a=summary(r.e);
 const q=Object.freeze({ok:true,...a,action,expectedCash:r.expected,newCash:r.restored,cashDelta:r.restored-r.expected,generation:d.generation});
 quoteData.set(q,{s,generation:d.generation,id:r.e.id,action,contextId,applied:false});
 return q;
}
function authenticate(s,q){
 const d=sessionData.get(s),m=quoteData.get(q);
 if(!d||!m||m.s!==s||m.generation!==d.generation||d[m.action].at(-1)?.id!==m.id)return null;
 return {m,d};
}
function apply(s,q,world){
 const a=authenticate(s,q);if(!a)return failed('stale');
 a.m.applied=false;
 const r=ready(a.d,a.m.action,world,a.m.contextId);
 if(!r.ok)return r;
 try{
  const next=clone(world),w=budget(),from=r.undo?'after':'before',to=r.undo?'before':'after';
  for(const p of r.e.patch)if(!patchItem(next,p,from,to,w))return failed('conflict');
  next.network.cash=r.restored;
  if(!guardMatch(next,r.undo?r.e.g0:r.e.g1,w)||!guardMatch(next,r.e.protected,w))return failed('conflict');
  a.m.applied=true;
  return {ok:true,world:next,cashDelta:r.restored-r.expected,label:r.e.label,kind:r.e.kind,id:r.e.id};
 }catch(ex){return failed(ex.message==='large'?'large':'invalid');}
}
function commit(s,q,savedWorld){
 const a=authenticate(s,q);if(!a)return failed('stale');if(!a.m.applied)return failed('notApplied');
 const {d,m}=a,e=d[m.action].at(-1),undo=m.action==='undo';
 if(savedWorld!==undefined){
  const why=sameContext(savedWorld,e,m.contextId);if(why)return failed(why);
  if(cash(savedWorld)!==(undo?e.beforeCash:e.afterCash))return failed('cash');
  try{
   const w=budget();if(!guardMatch(savedWorld,e.protected,w)||!guardMatch(savedWorld,undo?e.g0:e.g1,w))return failed('conflict');
  }catch(ex){return failed(ex.message==='large'?'large':'invalid');}
 }
 d[m.action].pop();d[undo?'redo':'undo'].push(e);d.generation++;d.reason='';m.applied=false;
 return {ok:true,...report(s)};
}
return {LIMIT,KEYS,KINDS:DEFAULT_KINDS,REASONS,create,report,clear,record,quote,apply,commit};
});
