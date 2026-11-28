/* Sector detail, material flows and market-selected lots. No external state. */
(function(root,factory){
 const v=factory();
 if(typeof module==='object'&&module.exports)module.exports=v;
 else root.Economy=v;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const num=(x,d=0)=>Number.isFinite(x)?x:d;
 const round=x=>Math.round(x*100)/100, OWN=Object.hasOwn;
 const PRODUCT_ROWS={
  produce:['鲜菜与农产','箱',13,1,1],fish:['水产','箱',19,1,1],livestock:['畜产','箱',21,1,1],timber:['原木','吨',17,1,1],oil:['原油','桶',24,1,1],fuel:['燃料与化工品','桶',41,1,1],ore:['矿料与金属锭','吨',32,1,1],
  processed_food:['加工食品','箱',22,1,1], daily_goods:['日用杂货','箱',23,1,1],
  components:['电子元器件','批',52,1,1], materials:['建材与金属件','吨',49,1,1],
  equipment:['电力与机电设备','台',74,1,1],
  groceries:['零售购物','次',16,0,0], meals:['餐饮服务','份',24,0,0],
  repair:['维修与定制','单',29,0,0], recreation:['休闲文娱','次',22,0,0],
  professional:['行政与专业服务','单',37,0,1], software:['软件与信息服务','单',59,0,1],
  finance:['信贷与财务服务','单',50,0,1], research:['研发与设计成果','项',63,0,1],
  media:['文化与媒体服务','项',38,0,1]
 };
 const PRODUCTS=Object.fromEntries(Object.entries(PRODUCT_ROWS).map(([id,[name,unit,value,importable,exportable]])=>[id,{id,name,unit,value,importable:!!importable,exportable:!!exportable}]));
 const SECTORS={};
 const specify=(id,zone,name,capacity,baseTax,description,products={},inputs={},options={})=>{
   SECTORS[id]={id,zone,name,capacity,jobSlots:zone==='residential'?0:capacity,minLevel:1,
     baseTax,description,products,inputs,households:0,family:2.7,participation:.57,chain:3,...options};
 };
 specify('neighborhood_homes','residential','街坊住宅',12,5,'适中密度的家庭住宅，兼顾租金与就业参与。',{},{},{households:4,family:3.0,preference:'any'});
 specify('garden_homes','residential','花园住宅',8,6,'低密住宅，偏好安静、滨水和绿地，家庭规模较大。',{},{},{households:2,family:3.4,participation:.54,preference:'quiet'});
 specify('apartments','residential','城市公寓',18,5.5,'密度更高、通勤需求更大，中小户占多数。',{},{},{households:8,family:2.2,participation:.63,preference:'dense'});
 specify('affordable_homes','residential','保障性住房',16,3.7,'容纳更多家庭、税基较低，增加通勤与日常购物需求。',{},{},{households:8,family:2.05,participation:.59,preference:'affordable'});
 specify('highrise_living','residential','高层住区',24,7.2,'接驳与公共服务良好的地方更容易发展，带来高密度就业人口。',{},{},{households:11,family:2.15,participation:.65,preference:'tower'});
 specify('corner_retail','commercial','社区商店',10,10,'小规模日常购物，以加工食品与日用品为主要进货。',{groceries:1.7},{processed_food:.45,daily_goods:.40});
 specify('supermarket','commercial','综合超市',17,10.8,'较多零售岗位及供货需求，适合消费集中的街区。',{groceries:2.45},{produce:.38,processed_food:.59,daily_goods:.55},{preference:'busy'});
 specify('dining','commercial','餐饮街区',13,11.2,'依赖食材供应，填补家庭餐饮需求。',{meals:2.5},{produce:.45,processed_food:.48},{preference:'busy'});
 specify('seafood_market','commercial','海鲜市集',13,11.4,'沿岸商业，用本地水产和加工食品经营市场与餐饮。',{groceries:1.3,meals:2.15},{fish:.61,processed_food:.2},{preference:'waterfront'});
 specify('repair_market','commercial','维修与定制店',9,9.3,'为家庭与企业提供维修，消耗少量建材与零部件。',{repair:2.2},{daily_goods:.25,components:.28,materials:.14,equipment:.11},{chain:4});
 specify('leisure_mix','commercial','休闲商业',15,11.6,'面向住区与访客的休闲体验，依赖食品和消费品。',{recreation:2.4},{processed_food:.24,daily_goods:.22},{preference:'waterfront'});
 specify('food_processing','industrial','食品加工',17,7,'将农产转为加工食品，主要给零售与餐饮供货。',{processed_food:2.25},{produce:.74},{chain:1});
 specify('urban_farms','industrial','都市农业',11,5.9,'较少岗位，向加工厂与商业供应生鲜农产。',{produce:2.85},{},{chain:0,preference:'land'});
 specify('consumer_workshops','industrial','轻工制造',15,7.4,'加工建材和零部件，向商铺生产日用杂货。',{daily_goods:2.2},{materials:.56,components:.18},{chain:2});
 specify('metal_fabrication','industrial','金属与建材',23,8.6,'就业密集，从矿料制造建材，支持其他厂商及维修服务。',{materials:2.8},{ore:.72,timber:.18},{chain:1,preference:'freight'});
 specify('electronics','industrial','电子组装',20,8.3,'从金属和基础材料制造电子元器件，支持软件与研发。',{components:2.2},{ore:.44,materials:.44},{chain:2,preference:'freight'});
 specify('utility_equipment','industrial','机电设备制造',21,8.9,'需要元件与建材，生产电力和机电设备供高端岗位与维修。',{equipment:2.05},{components:.69,materials:.54,fuel:.12},{chain:3,preference:'freight'});
 specify('seafood_kitchen','industrial','水产加工',15,7.6,'把专项渔业区的水产制成加工食品。',{processed_food:2.5},{fish:1.03},{chain:1,preference:'waterfront'});
 specify('meat_processing','industrial','肉品加工',19,8.0,'采购畜牧产品，向商业供应加工食品。',{processed_food:2.7},{livestock:.94},{chain:1,preference:'freight'});
 specify('timberworks','industrial','板材加工',14,7.8,'以林区的原木生产板材和建材。',{materials:2.3},{timber:.92},{chain:1,preference:'freight'});
 specify('refinery','industrial','炼化厂',24,9.8,'加工专项油区的原油，产出燃料与化工品。',{fuel:2.5},{oil:1.05},{chain:1,preference:'freight'});
 specify('business_services','office','企业服务',16,12,'通用岗位，为住宅和其他企业提供专业服务。',{professional:1.8},{},{chain:3});
 specify('software_studio','office','软件与信息',20,13.2,'岗位密集，使用电子设备，产出软件与信息服务。',{software:2.05},{components:.32,equipment:.16},{chain:4,preference:'educated'});
 specify('finance_center','office','金融与会计',22,13.7,'提供信贷和财务服务，偏好商业核心与通达区位。',{finance:2},{professional:.26},{chain:4,preference:'busy'});
 specify('research_lab','office','研发与设计',14,12.6,'需元件设备、教育和专业服务，产出技术与设计成果。',{research:1.65},{components:.43,equipment:.28,professional:.18},{chain:4,preference:'educated'});
 specify('media_studio','office','文化传媒',13,11.7,'服务本地文化消费与办公需求，偏好靠水或商业活跃街区。',{media:2.1},{components:.17},{chain:3,preference:'waterfront'});
 const DEFAULTS={residential:'neighborhood_homes',commercial:'corner_retail',office:'business_services',industrial:'food_processing'};
 const MULT=[0,1,1.66,2.45];
 const STANCES={
  encourage:{tax:-2.5,market:1.17,output:1.14,weight:.24},
  neutral:{tax:0,market:1,output:1,weight:0},
  discourage:{tax:3,market:.80,output:.79,weight:-.36}
 };
 const householdDemand={groceries:.76,meals:.43,repair:.14,recreation:.28,professional:.11,software:.12,finance:.085,research:.025,media:.23};
 function create(){return {version:1,policies:{}};}
 function byZone(zone){return Object.values(SECTORS).filter(x=>x.zone===zone);}
 function sector(lot){
  const type=typeof lot==='string'?lot:lot?.type??lot?.zone;
  const s=typeof lot==='string'?SECTORS[lot]:SECTORS[lot?.sector];
  if(s&&(!type||type===s.zone||type===s.id))return s;
  return SECTORS[DEFAULTS[type]]||null;
 }
 const policyStore=f=>f?.economy?.policies||f?.policies||{};
 const policyTax=x=>Number.isFinite(x)?round(clamp(x,0,20)):null;
 function setPolicy(state,id,change={}){
  if(!state||!OWN(SECTORS,id))return false;
  const p=typeof change==='string'?{stance:change}:change;
  if(!p||p.stance!=null&&!OWN(STANCES,p.stance)||p.tax!=null&&!Number.isFinite(p.tax))return false;
  if(state.economy)return setPolicy(state.economy,id,p);
  const target=state.policies??={};
  const prev=target[id]||{};
  const stance=p.stance??prev.stance??'neutral',tax=OWN(p,'tax')?policyTax(p.tax):policyTax(prev.tax);
  if(stance==='neutral'&&tax===null)delete target[id];
  else target[id]={stance,tax};
  return true;
 }
 function restore(raw){
  if(raw==null)return create();
  if(raw?.version!==1||!raw.policies||typeof raw.policies!=='object'||Array.isArray(raw.policies))return null;
  const s=create();
  for(const [id,p] of Object.entries(raw.policies))if(!setPolicy(s,id,p))return null;
  return s;
 }
 function policy(fiscal,id){
  const raw=policyStore(fiscal)[id],stance=OWN(STANCES,raw?.stance)?raw.stance:'neutral',rule=STANCES[stance];
  const global=num(typeof fiscal==='number'?fiscal:fiscal?.tax,9);
  const taxRate=policyTax(raw?.tax)??clamp(global+rule.tax,0,20);
  return {stance,taxRate,rule};
 }
 function modifiers(lot,fiscal,snapshot){
  const def=sector(lot);
  if(!def)return {capacity:0,baseTax:0,market:1,taxRate:9,stance:'neutral',sector:null};
  const {stance,taxRate,rule}=policy(fiscal,def.id);
  const observed=snapshot?.lots?.[lot.id]?.market;
  return {capacity:def.capacity,baseTax:def.baseTax,market:clamp(rule.market*num(observed,1),.38,1.43),taxRate,stance,sector:def.id};
 }
 function sumEntries(source,to,mult=1){for(const [id,n] of Object.entries(source))to[id]=(to[id]||0)+n*mult;}
 const levelOf=l=>Math.round(clamp(num(l.level),0,3));
 function externalLimit(opts,id,needed){
  if(!PRODUCTS[id].importable||opts.outside===false)return 0;
  if(OWN(opts.imports||{},id))return Math.max(0,num(opts.imports[id]));
  if(opts.importsOnly)return 0;
  return Math.max(0,needed)*clamp(num(opts.importShare,opts.outside===true?.85:.58),0,1);
 }
 function exportLimit(opts,id,surplus){
  if(!PRODUCTS[id].exportable||opts.outside===false)return 0;
  if(OWN(opts.exports||{},id))return Math.max(0,num(opts.exports[id]));
  if(opts.outside===true)return surplus*clamp(num(opts.exportShare,.67),0,1);
  return 0;
 }
 function evaluate(civic,fiscal={},supply={}){
  const city=civic?.civic||civic||{}, raw=Array.isArray(city.lots)?city.lots:[];
  const reserve=id=>Math.max(0,num(supply.reserve?.[id]));
  const market={},firms=[],lots={},sectors={},gross=Object.fromEntries(Object.entries(supply.local||{}).filter(([id,n])=>OWN(PRODUCTS,id)&&Number.isFinite(n)&&n>=0));
  for(const def of Object.values(PRODUCTS))market[def.id]={...def,output:0,demand:0,firmDemand:0,householdDemand:0,local:0,imports:0,exports:0,shortage:0,surplus:0,fill:1};
  const totals={population:0,households:0,workers:0,jobs:0,occupiedJobs:0,output:0,demand:0,shortage:0,outputValue:0,importsValue:0,exportsValue:0,tax:0,nominalTax:0,taxAdjustment:0,tradeAdjustment:0,netAdjustment:0};
  for(const def of Object.values(SECTORS)){
    const p=policy(fiscal,def.id);
    sectors[def.id]={id:def.id,zone:def.zone,name:def.name,buildings:0,lots:0,jobs:0,workers:0,households:0,population:0,tax:0,taxRate:p.taxRate,stance:p.stance,output:{},demand:{}};
  }
  for(const l of raw){
    const def=sector(l);if(!def||l.id==null)continue;
    const level=levelOf(l),p=policy(fiscal,def.id),developed=level>0, group=sectors[def.id];
    const capacity=Math.round(def.capacity*MULT[level]),actual=clamp(num(l.occupants),0,Math.max(capacity*1.35,capacity));
    const people=def.zone==='residential'?actual:0;
    const staff=def.zone==='residential'?0:OWN(supply.staff||{},l.id)?clamp(num(supply.staff[l.id]),0,Math.round(def.jobSlots*MULT[level])):Math.min(capacity,actual);
    const housing=people>0?Math.min(Math.round(def.households*MULT[level]),Math.max(1,Math.ceil(people/def.family))):0;
    const row={id:l.id,sector:def.id,name:def.name,zone:def.zone,population:people,households:housing,
      workers:people*def.participation,jobs:def.zone==='residential'?0:Math.round(def.jobSlots*MULT[level]),employees:staff,
      output:{},demand:{},inputs:{},capacity,market:1,taxRate:p.taxRate,stance:p.stance,tax:0,inputReliability:1,sellThrough:1};
    const activity=clamp(num(supply?.activity?.[l.id],1),0,1.35),nominal=actual*def.baseTax*p.taxRate/9;
    lots[l.id]=row;group.lots++;if(developed)group.buildings++;
    for(const key of ['population','workers','jobs','households']){totals[key]+=row[key];group[key]+=row[key];}
    totals.occupiedJobs+=staff;totals.nominalTax+=nominal;
    if(people>0){
      const taste=def.id==='affordable_homes'?.9:def.id==='highrise_living'?1.12:1;
      for(const [id,units] of Object.entries(householdDemand))row.demand[id]=people*taste*units*clamp(num(supply.householdScale?.(l,id),1),.35,2.4);
      for(const [id,n] of Object.entries(row.demand))market[id].householdDemand+=n;
    }
    if(staff>0){
      const factor=staff*p.rule.output*activity*clamp(1-(p.taxRate-9)*.012,.82,1.12);
      sumEntries(def.inputs,row.inputs,factor);
      for(const [id,n] of Object.entries(row.inputs))market[id].firmDemand+=n;
      firms.push({def,row,nominal,factor});
    }else{row.tax=nominal;group.tax+=nominal;totals.tax+=nominal;}
  }
  for(const m of Object.values(market))m.demand=m.householdDemand+m.firmDemand;
  // Recipes only consume upstream goods/services. Process by chain depth so
  // inputs cannot be created by a loop or be counted as production twice.
  firms.sort((a,b)=>a.def.chain-b.def.chain||String(a.row.id).localeCompare(String(b.row.id),'en'));
  for(const f of firms){
    let reliability=1;
    for(const id of Object.keys(f.row.inputs)){
      const need=market[id].demand,availableLocal=(gross[id]||0)+reserve(id),available=availableLocal+externalLimit(supply,id,Math.max(0,need-availableLocal));
      if(need>0)reliability=Math.min(reliability,clamp(available/need));
    }
    f.row.inputReliability=reliability;
    sumEntries(f.def.products,f.row.output,f.factor*reliability);
    sumEntries(f.row.output,gross);
    sumEntries(f.row.inputs,f.row.demand);
  }
  for(const [id,m] of Object.entries(market)){
    m.output=gross[id]||0;
    m.reserveUsed=Math.min(reserve(id),Math.max(0,m.demand-m.output));
    m.local=Math.min(m.demand,m.output)+m.reserveUsed;
    const deficit=Math.max(0,m.demand-m.local);
    m.imports=Math.min(deficit,externalLimit(supply,id,deficit));
    m.shortage=Math.max(0,m.demand-m.local-m.imports);
    const left=Math.max(0,m.output-m.demand);
    m.exports=Math.min(left,exportLimit(supply,id,left));
    m.surplus=left-m.exports;m.fill=m.demand>0?(m.local+m.imports)/m.demand:1;
    totals.output+=m.output;totals.demand+=m.demand;totals.shortage+=m.shortage;
    totals.outputValue+=m.output*m.value;totals.importsValue+=m.imports*m.value;totals.exportsValue+=m.exports*m.value;
  }
  for(const f of firms){
    const {row,nominal,def}=f,weights=Object.entries(row.output);
    let of=0,sell=0;
    for(const [id,o] of weights){const m=market[id];of+=o;sell+=o*(m.output>0?clamp((m.local+m.exports)/m.output):0);}
    row.sellThrough=of?sell/of:0;
    // Idle firms still pay some fixed payroll/property tax; goods throughput
    // affects their taxable activity rather than giving gross trade to the treasury.
    const activity=.56+.44*row.inputReliability*(.33+.67*row.sellThrough);
    row.tax=nominal*activity;
    row.market=clamp(.69+.15*row.inputReliability+.20*row.sellThrough,.55,1.08);
    const group=sectors[def.id];group.tax+=row.tax;totals.tax+=row.tax;
    sumEntries(row.output,group.output);sumEntries(row.demand,group.demand);
  }
  // UI may add these differences to its civic ledger; never add total tax again.
  totals.taxAdjustment=Math.round(totals.tax-totals.nominalTax);
  totals.tradeAdjustment=supply.outside===true?Math.round(totals.exportsValue*.038-totals.importsValue*.025):0;
  totals.netAdjustment=totals.taxAdjustment+totals.tradeAdjustment;
  for(const row of Object.values(lots))for(const k of ['tax','population','workers','employees','market','inputReliability','sellThrough'])row[k]=round(row[k]);
  for(const s of Object.values(sectors))for(const k of ['tax','population','workers'])s[k]=round(s[k]);
  for(const k of Object.keys(totals))totals[k]=round(totals[k]);
  return {lots,products:market,sectors,totals};
 }
 function hash(s){let v=2166136261;for(const ch of String(s))v=Math.imul(v^ch.charCodeAt(0),16777619);return (v>>>0)/4294967296;}
 function allocate(civic,fiscal={},supply={}){
   const city=civic?.civic||civic||{},lots=Array.isArray(city.lots)?city.lots:[];
   const eligible=lots.filter(l=>l&&OWN(DEFAULTS,l.type)).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
   const snapshot=supply.snapshot||evaluate(city,fiscal,supply),counts={},totals={},assignments=[];
   let assigned=0,rebalanced=0;
   for(const l of eligible){
     const current=SECTORS[l.sector];
     if(current?.zone===l.type){counts[current.id]=(counts[current.id]||0)+1;totals[l.type]=(totals[l.type]||0)+1;}
   }
   const month=Math.max(0,Math.floor(num(supply.month,city.month??0)));
   const assign=(lot,d,reason)=>{
     lot.sector=d.id;lot.sectorAssignedMonth=month;
     counts[d.id]=(counts[d.id]||0)+1;totals[d.zone]=(totals[d.zone]||0)+1;
     assignments.push({id:lot.id,sector:d.id,reason});
   };
   function score(d,lot,context){
     const p=policy(fiscal,d.id);
     let marketSignal=0;
     for(const id of Object.keys(d.products)){
       const m=snapshot.products?.[id];
       if(m)marketSignal+=clamp((num(m.shortage)-num(m.surplus)*.45)/Math.max(22,num(m.demand))+.21*(num(supply.priceIndex?.[id],1)-1),-.28,.82);
     }
     marketSignal/=Math.max(1,Object.keys(d.products).length);
     // Construction still starts under scarce inputs, but shortages reward
     // upstream activity first rather than adding a third unavailable supplier.
     let supplySignal=0;
     for(const id of Object.keys(d.inputs)){
       const m=snapshot.products?.[id];if(m)supplySignal+=clamp((num(m.output)+num(m.imports))/Math.max(18,num(m.demand)),0,1);
     }
     supplySignal/=Math.max(1,Object.keys(d.inputs).length);
     const density=clamp(num(lot.density,1),1,3),access=clamp(num(context.access,.5)),water=clamp(num(context.waterfront,0)),
       load=clamp(num(context.traffic,0)),edu=clamp(num(context.education,.3));
     let geography=0;
     if(d.preference==='quiet')geography=.23*(1-load)+.22*water-(density-1)*.19;
     if(d.preference==='dense')geography=(density-1)*.16+access*.13;
     if(d.preference==='affordable')geography=.13+clamp(num(context.affordabilityPressure,.1))*.30;
     if(d.preference==='tower')geography=(density-1)*.21+access*.18+edu*.11-.27;
     if(d.preference==='busy')geography=access*.18+load*.12;
     if(d.preference==='waterfront')geography=.32*water;
     if(d.preference==='land')geography=.13*(3-density)+water*.10;
     if(d.preference==='freight')geography=.21*access+clamp(num(context.freight,supply.outside===true?.65:.25))*.15;
     if(d.preference==='educated')geography=edu*.28+access*.12-.11;
     const competition=(counts[d.id]||0)/Math.max(9,(totals[d.zone]||0)*.75);
     const variation=(hash([city.seed??17,lot.id,d.id].join(':'))-.5)*.17;
     const defaultBias=d.id===DEFAULTS[d.zone]?.06:0;
     return .42+marketSignal*.68+supplySignal*.18+geography+(p.rule.weight+(9-p.taxRate)*.025)-competition*.72+variation+defaultBias;
   }
   for(const l of eligible){
     const current=SECTORS[l.sector],existing=current?.zone===l.type;
     if(!existing&&(levelOf(l)>0||num(l.occupants)>.25)){assign(l,SECTORS[DEFAULTS[l.type]],'legacy');assigned++;continue;}
     const stable=!supply.evolve||levelOf(l)>0||num(l.occupants)>.25||num(l.vacantMonths)<8||month-num(l.sectorAssignedMonth,month)<8;
     if(existing&&stable)continue;
     const context=(typeof supply.context==='function'?supply.context(l):supply.context?.[l.id])||{};
     const ranking=byZone(l.type).map(d=>({d,n:score(d,l,context)})).sort((a,b)=>b.n-a.n);
     const pick=ranking[0];if(!pick)continue;
     if(!existing){assign(l,pick.d,'market');assigned++;}
     else if(pick.d.id!==current.id&&pick.n>score(current,l,context)+.30){
       counts[current.id]--;totals[current.zone]--;assign(l,pick.d,'long_vacancy');rebalanced++;
     }
   }
   return {assigned,rebalanced,assignments};
 }
 return {SECTORS,PRODUCTS,DEFAULTS,STANCES,create,restore,byZone,sector,setPolicy,modifiers,evaluate,allocate};
});
