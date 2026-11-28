/* Fictional City Blueprint treasury. No cash mutation or real-world lending. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object')module.exports=api;else root.MunicipalFinance=api;
})(globalThis,function(){
'use strict';
const PRODUCTS={
 bridge:{name:'建设周转贷',min:5000,max:20000,term:12,rateBps:145,feeFlat:95,feeBps:45,prepayBps:0,description:'短期、小额度，可无罚金提前偿还；需有结余或充足现金。'},
 capital:{name:'长期建设贷',min:15000,max:60000,term:36,rateBps:92,feeFlat:140,feeBps:80,prepayBps:110,description:'利率较低、分期较长；要求稳定营运结余，前半程提前还本有小额费用。'},
 stabilize:{name:'调整周转贷',min:8000,max:24000,term:18,rateBps:178,feeFlat:165,feeBps:95,prepayBps:70,description:'可用于应对轻度短期赤字；需要自有流动资金，不接受拖欠或严重且持续的赤字。'}
};
const LEGACY={name:'原版借款',rateBps:120,principal:1250};
const LIMIT={activeLoans:3,modernLoans:2,debt:90000,reserve:2000000,history:72,balance:1e9};
const REASONS={overdue:'已有逾期，先清理欠款才能新增借款',term:'在贷数量或产品上限已达到',
 cash:'可用现金不足',noAutoReserve:'储备金不会自动划转',arrears:'本月未付金额转入逾期，不计复利',
 pressure:'营运结余不足以覆盖下期偿还',negative:'偿还后可用现金为负',next:'有待下月开始偿还的借款'};
const events=['opened','repaid','deposit','withdraw','monthly'];
const num=(n,d=0)=>Number.isFinite(n)?n:d,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const money=(n,d=0)=>Math.round(clamp(num(n,d),-LIMIT.balance,LIMIT.balance))||0;
const whole=(n,d=0,max=LIMIT.balance)=>Math.floor(clamp(num(n,d),0,max));
const positive=(n,d=0,max=LIMIT.balance)=>Math.round(clamp(num(n,d),0,max));
const calendar=n=>Math.max(1,whole(n,1));
const own=(o,k)=>Object.hasOwn(o,k),arr=n=>Array.isArray(n)?n:[];
const lid=n=>typeof n==='string'&&/^L[1-9][0-9]{0,7}$/.test(n);
const name=k=>k==='legacy'?LEGACY.name:PRODUCTS[k]?.name||'未知借款';
const ceiling=(amount,bps)=>Math.ceil(amount*bps/10000);
function legacyLoan(amount,month){
 const original=positive(amount,0,LIMIT.debt);
 if(!original)return null;
 const term=Math.ceil(original/LEGACY.principal);
 return {id:'L1',product:'legacy',original,balance:original,term,rateBps:LEGACY.rateBps,issued:month,nextDue:month+1,scheduled:LEGACY.principal,
  elapsed:0,overduePrincipal:0,overdueInterest:0,overdueMonths:0};
}
function create(options={}){
 if(Number.isFinite(options))options={legacyDebt:options};
 const l=legacyLoan(options.legacyDebt,calendar(options.month));
 return {version:1,revision:0,next:l?2:1,month:0,reserve:0,loans:l?[l]:[],last:null,history:[]};
}
function loan(v){
 if(!v||!lid(v.id)||v.product!=='legacy'&&!own(PRODUCTS,v.product))return null;
 const legacy=v.product==='legacy',def=legacy?LEGACY:PRODUCTS[v.product];
 const original=legacy?positive(v.original,0,LIMIT.debt):whole(v.original,0,def.max);
 if(!original||!legacy&&original<def.min)return null;
 const balance=positive(v.balance,original,original),term=legacy?Math.ceil(original/LEGACY.principal):def.term;
 const issued=calendar(v.issued),nextDue=Math.max(issued+1,calendar(v.nextDue));
 const overdueInterest=legacy?0:positive(v.overdueInterest,0,interestCap(original));
 if(!balance&&!overdueInterest)return null;
 return {id:v.id,product:v.product,original,balance,term,rateBps:legacy?LEGACY.rateBps:whole(v.rateBps,def.rateBps,def.rateBps+20),
  issued,nextDue,scheduled:legacy?LEGACY.principal:Math.ceil(original/term),elapsed:whole(v.elapsed,0,10000),
  overduePrincipal:legacy?0:positive(v.overduePrincipal,0,balance),overdueInterest,
  overdueMonths:legacy?0:whole(v.overdueMonths,0,10000)};
}
function historyRow(v){
 if(!v||!events.includes(v.kind))return null;
 return {kind:v.kind,month:calendar(v.month),loan:lid(v.loan)?v.loan:'',amount:positive(v.amount),cashDelta:money(v.cashDelta),overdue:positive(v.overdue)};
}
function lineRow(v){
 if(!v||!lid(v.id)||v.product!=='legacy'&&!own(PRODUCTS,v.product))return null;
 const fields=['regularPrincipal','regularInterest','principalDue','interestDue','due','principal','interest','paid','waived','balance','overduePrincipal','overdueInterest','overdue','overdueMonths'];
 return {id:v.id,name:name(v.product),product:v.product,legacy:v.product==='legacy',
  ...Object.fromEntries(fields.map(k=>[k,positive(v[k])])),nextDue:calendar(v.nextDue)};
}
const severitySet=['stable','watch','critical'];
function cycle(v){
 const fields=['reserve','debt','exposure','principalDue','interestDue','due','principal','interest','paid','waived','overdue','overdueMonths'];
 return {month:calendar(v?.month),cash:money(v?.cash),operatingNet:money(v?.operatingNet),cashDelta:money(v?.cashDelta),projectedCash:money(v?.projectedCash),net:money(v?.net),
  ...Object.fromEntries(fields.map(k=>[k,positive(v?.[k])])),
  severity:severitySet.includes(v?.severity)?v.severity:'stable',reasons:arr(v?.reasons).filter(x=>own(REASONS,x)).slice(0,8),
  loans:arr(v?.loans).slice(0,LIMIT.activeLoans).map(lineRow).filter(Boolean)};
}
function normalize(raw,opts={}){
 if(!raw||raw.version!==1)return create(opts);
 const s=create();s.revision=whole(raw.revision);s.month=whole(raw.month);s.reserve=positive(raw.reserve,0,LIMIT.reserve);
 const used=new Set(),kinds=new Set();let amount=0,modern=0;
 for(const v of arr(raw.loans).slice(0,LIMIT.activeLoans)){
  const a=loan(v);
  if(!a||used.has(a.id)||kinds.has(a.product)||amount+a.balance>LIMIT.debt||a.product!=='legacy'&&modern>=LIMIT.modernLoans)continue;
  used.add(a.id);kinds.add(a.product);amount+=a.balance;if(a.product!=='legacy')modern++;
  s.next=Math.max(s.next,+a.id.slice(1)+1);s.loans.push(a);
 }
 s.next=Math.max(s.next,whole(raw.next,1,99999999));
 s.history=arr(raw.history).slice(-LIMIT.history).map(historyRow).filter(Boolean);
 if(raw.last&&s.month)s.last=cycle({...raw.last,month:s.month});
 return s;
}
function describe(l){
 return {...l,name:name(l.product),legacy:l.product==='legacy',rate:l.rateBps/10000,overdue:l.overduePrincipal+l.overdueInterest,
  remaining:Math.max(0,l.term-l.elapsed)};
}
function totals(s){
 const debt=s.loans.reduce((n,v)=>n+v.balance,0),overdue=s.loans.reduce((n,v)=>n+v.overduePrincipal+v.overdueInterest,0);
 const interest=s.loans.reduce((n,v)=>n+v.overdueInterest,0);
 return {debt,exposure:debt+interest,overdue};
}
function report(s){return {loans:s.loans.map(describe),reserve:s.reserve,...totals(s),revision:s.revision,month:s.month,last:s.last,history:s.history};}
function fail(reason,extras={}){return {ok:false,reason,...extras};}
function sign(...p){
 let h=2166136261;
 for(const c of p.join('|'))h=Math.imul(h^c.charCodeAt(0),16777619);
 return (h>>>0).toString(36);
}
function quoteLoan(s,product,amount,opts={}){
 if(!s||!own(PRODUCTS,product))return fail('请选择有效的市政借款产品');
 const d=PRODUCTS[product],a=whole(amount),month=calendar(opts.month??Math.max(1,s.month));
 const denominator=totals(s);
 if(!Number.isSafeInteger(amount)||a<d.min||a>d.max)return fail('借款金额须在 '+d.min+' 至 '+d.max+' 之间',{product,min:d.min,max:d.max});
 if(!Number.isFinite(opts.cash)||!Number.isFinite(opts.operatingNet))return fail('需要本市现金与月度营运结余');
 if(s.month>month)return fail('借款申请所属月份已过期');
 const cash=money(opts.cash),operatingNet=money(opts.operatingNet),liquid=Math.max(0,cash)+Math.floor(s.reserve*.50);
 if(cash<0)return fail('可用现金已为负，请先缩减支出或动用储备金');
 if(denominator.overdue>0)return fail(REASONS.overdue,{overdue:denominator.overdue});
 if(s.loans.length>=LIMIT.activeLoans||s.loans.filter(v=>v.product!=='legacy').length>=LIMIT.modernLoans||s.loans.some(x=>x.product===product))return fail(REASONS.term);
 if(denominator.debt+a>LIMIT.debt)return fail('本市本金授信上限为 '+LIMIT.debt,{debt:denominator.debt});
 const currentDue=s.loans.reduce((n,x)=>n+Math.min(x.balance,x.scheduled)+ceiling(x.balance,x.rateBps),0);
 const monthlyPrincipal=Math.ceil(a/d.term),baseDue=currentDue+monthlyPrincipal+ceiling(a,d.rateBps);
 const preCoverage=baseDue?operatingNet/baseDue:0,preLiquidity=baseDue?liquid/(baseDue+Math.max(0,-operatingNet)):0;
 const risk=preCoverage>=1.38?'low':preCoverage>=.72||preLiquidity>=8?'medium':'high';
 const rateBps=d.rateBps+(risk==='low'?0:risk==='medium'?8:20),fee=d.feeFlat+ceiling(a,d.feeBps),proceeds=a-fee;
 const monthlyInterest=ceiling(a,rateBps),initialDue=currentDue+monthlyPrincipal+monthlyInterest;
 const coverage=initialDue?operatingNet/initialDue:0,liquidityMonths=initialDue?liquid/(initialDue+Math.max(0,-operatingNet)):0;
 if(product==='capital'&&(operatingNet<Math.max(650,Math.ceil(initialDue*1.16))||liquid<Math.max(3000,initialDue*2)))
  return fail('长期建设贷要求结余覆盖月供，并留出至少两期流动资金',{risk,coverage,liquidityMonths});
 if(product==='bridge'&&coverage<.72&&liquidityMonths<6)
  return fail('周转贷要求能够支付大部分月供，或拥有至少六个月的流动资金',{risk,coverage,liquidityMonths});
 if(product==='stabilize'&&(operatingNet<-1400||liquidityMonths<3||coverage<0&&denominator.debt>24000))
  return fail('调整周转贷仅支持轻度赤字且拥有至少三个月流动资金的城市',{risk,coverage,liquidityMonths});
 const quote={ok:true,product,amount:a,term:d.term,rateBps,rate:rateBps/10000,fee,proceeds,cashDelta:proceeds,
  firstDue:month+1,monthlyPrincipal,monthlyInterest,monthlyPayment:monthlyPrincipal+monthlyInterest,firstPayment:monthlyPrincipal+monthlyInterest,risk,
  coverage:Math.round(coverage*100)/100,liquidityMonths:Math.round(liquidityMonths*100)/100,revision:s.revision,month};
 return {...quote,signature:sign('loan',s.revision,month,product,a,rateBps,fee)};
}
function push(s,v){
 s.history.push(historyRow(v));s.history=s.history.slice(-LIMIT.history);s.revision++;
}
function applyLoan(s,v,opts={}){
 if(!s||!v?.ok||v.revision!==s.revision||s.next>99999999)return fail('借款报价已过期');
 const q=quoteLoan(s,v.product,v.amount,opts);
 if(!q.ok)return q;
 if(q.signature!==v.signature)return fail('月供条件已改变，请重新报价');
 const l={id:'L'+s.next++,product:q.product,original:q.amount,balance:q.amount,term:q.term,rateBps:q.rateBps,
  issued:q.month,nextDue:q.firstDue,scheduled:q.monthlyPrincipal,elapsed:0,overduePrincipal:0,overdueInterest:0,overdueMonths:0};
 s.loans.push(l);
 push(s,{kind:'opened',month:q.month,loan:l.id,amount:q.amount,cashDelta:q.cashDelta});
 return {ok:true,cashDelta:q.cashDelta,loan:describe(l)};
}
function repayFee(l,principal,month){
 if(l.product==='legacy'||!principal)return 0;
 const d=PRODUCTS[l.product],age=Math.max(l.elapsed,month-l.issued);
 if(age>=Math.ceil(l.term/2))return 0;
 // Scheduled arrears can always be cured without an early-principal fee.
 return ceiling(Math.max(0,principal-l.overduePrincipal),d.prepayBps);
}
function quoteRepay(s,value,amount='full',opts={}){
 const l=s?.loans.find(v=>v.id===value),month=calendar(opts.month??Math.max(1,s?.month||1));
 if(!l)return fail('没有找到这笔市政借款');
 const all=amount==='full',principal=all?l.balance:whole(amount);
 if(!all&&(!Number.isSafeInteger(amount)||principal<Math.min(500,l.balance)||principal>l.balance)||!principal&&!l.overdueInterest)
  return fail('还本额不在允许范围内，可选全额结清');
 if(month<s.month)return fail('还款报价所属月份已过期');
 const interest=l.overdueInterest,fee=repayFee(l,principal,month),total=principal+interest+fee;
 if(!Number.isFinite(opts.cash)||money(opts.cash)<total)return fail('市库现金不足，储备金须先明确转出',{id:l.id,principal,interest,fee,total});
 return {ok:true,id:l.id,amount:all?'full':principal,principal,interest,fee,total,cashDelta:-total,month,revision:s.revision,
  signature:sign('repay',s.revision,month,l.id,principal,interest,fee)};
}
function applyRepay(s,v,opts={}){
 if(!s||!v?.ok||v.revision!==s.revision)return fail('还款报价已过期');
 const q=quoteRepay(s,v.id,v.amount,opts);
 if(!q.ok)return q;
 if(q.signature!==v.signature)return fail('还款条件已改变，请重新报价');
 const l=s.loans.find(x=>x.id===q.id);
 l.balance-=q.principal;l.overdueInterest-=q.interest;l.overduePrincipal=Math.min(l.balance,Math.max(0,l.overduePrincipal-q.principal));
 if(!l.overduePrincipal&&!l.overdueInterest)l.overdueMonths=0;
 if(!l.balance&&!l.overdueInterest)s.loans=s.loans.filter(x=>x.id!==l.id);
 push(s,{kind:'repaid',month:q.month,loan:l.id,amount:q.principal,cashDelta:q.cashDelta,overdue:l.overduePrincipal+l.overdueInterest});
 return {ok:true,cashDelta:q.cashDelta,principal:q.principal,interest:q.interest,fee:q.fee,loan:describe(l)};
}
function quoteReserve(s,action,amount,opts={}){
 if(!s||!['deposit','withdraw'].includes(action)||!Number.isSafeInteger(amount)||amount<=0||amount>LIMIT.reserve)return fail('请选择有效的储备金划转金额');
 const month=calendar(opts.month??Math.max(1,s.month));
 if(s.month>month)return fail('储备金报价所属月份已过期');
 if(action==='deposit'&&(!Number.isFinite(opts.cash)||money(opts.cash)<amount))return fail('市库没有足够的可用现金');
 if(action==='deposit'&&s.reserve+amount>LIMIT.reserve)return fail('储备金达到上限');
 if(action==='withdraw'&&s.reserve<amount)return fail('储备金余额不足');
 const cashDelta=action==='deposit'?-amount:amount;
 return {ok:true,action,amount,cashDelta,reserve:s.reserve-cashDelta,month,revision:s.revision,signature:sign('reserve',s.revision,month,action,amount,s.reserve)};
}
function applyReserve(s,v,opts={}){
 if(!s||!v?.ok||v.revision!==s.revision)return fail('储备金报价已过期');
 const q=quoteReserve(s,v.action,v.amount,opts);
 if(!q.ok)return q;
 if(q.signature!==v.signature)return fail('储备金余额已改变，请重新报价');
 s.reserve=q.reserve;push(s,{kind:q.action,month:q.month,amount:q.amount,cashDelta:q.cashDelta});
 return {ok:true,cashDelta:q.cashDelta,reserve:s.reserve};
}
function interestCap(original){return Math.max(180,Math.ceil(original*.12));}
function frame(s,city,opts={}){
 const month=calendar(opts.month??city?.month??Math.max(1,s.month+1)),cash=money(opts.cash,num(city?.network?.cash)),operatingNet=money(opts.operatingNet);
 const loans=s.loans.map(l=>({...l})).sort((a,b)=>a.issued-b.issued||(+a.id.slice(1))-(+b.id.slice(1)));
 const records=loans.map(l=>{
  const old=l.product==='legacy',live=month>=l.nextDue;
  const ordinaryPrincipal=!live?0:old?Math.min(l.balance,LEGACY.principal):
   Math.min(Math.max(0,l.balance-l.overduePrincipal),l.elapsed+1>=l.term?l.balance:l.scheduled);
  const currentInterest=live?ceiling(l.balance,l.rateBps):0;
  const ordinaryInterest=old?currentInterest:Math.min(currentInterest,Math.max(0,interestCap(l.original)-l.overdueInterest));
  const principalDue=live?ordinaryPrincipal+l.overduePrincipal:0,interestDue=live?ordinaryInterest+l.overdueInterest:0;
  return {l,live,old,regularPrincipal:ordinaryPrincipal,regularInterest:ordinaryInterest,principalDue,interestDue,due:principalDue+interestDue,
   principal:0,interest:0,waived:currentInterest-ordinaryInterest};
 });
 let available=cash+operatingNet;
 // Original loans paid exactly these amounts, even into a negative treasury.
 // Do not change an old world's involuntary commitments at migration.
 for(const r of records)if(r.live&&r.old){
  r.principal=r.principalDue;r.interest=r.interestDue;available-=r.principal+r.interest;
 }
 for(const r of records)if(r.live&&!r.old){
  r.interest=Math.min(r.interestDue,Math.max(0,available));available-=r.interest;
 }
 for(const r of records)if(r.live&&!r.old){
  r.principal=Math.min(r.principalDue,Math.max(0,available));available-=r.principal;
 }
 for(const r of records){
  const l=r.l;
  if(r.live){
   l.balance-=r.principal;
   l.elapsed++;l.nextDue=month+1;
   if(!r.old){
    l.overduePrincipal=Math.min(l.balance,r.principalDue-r.principal);
    l.overdueInterest=r.interestDue-r.interest;
    l.overdueMonths=l.overduePrincipal||l.overdueInterest?l.overdueMonths+1:0;
   }
  }
  r.balance=l.balance;r.overduePrincipal=l.overduePrincipal;r.overdueInterest=l.overdueInterest;
  r.overdue=l.overduePrincipal+l.overdueInterest;r.overdueMonths=l.overdueMonths;r.paid=r.principal+r.interest;r.nextDue=l.nextDue;
  r.id=l.id;r.product=l.product;
 }
 const summary={month,cash,operatingNet,reserve:s.reserve,projectedCash:available,net:available-cash,cashDelta:0,
  debt:0,exposure:0,principalDue:0,interestDue:0,due:0,principal:0,interest:0,paid:0,overdue:0,overdueMonths:0,
  waived:0,reasons:[],loans:records.map(lineRow)};
 for(const r of records){
  summary.debt+=r.balance;summary.exposure+=r.balance+r.overdueInterest;
  summary.overdueMonths=Math.max(summary.overdueMonths,r.overdueMonths);
  for(const k of ['principalDue','interestDue','due','principal','interest','paid','waived','overdue'])summary[k]+=r[k];
 }
 summary.cashDelta=-summary.paid;
 if(summary.overdue>0)summary.reasons.push('arrears');
 if(summary.overdue>0&&s.reserve>0)summary.reasons.push('noAutoReserve');
 if(summary.due>Math.max(0,operatingNet))summary.reasons.push('pressure');
 if(summary.projectedCash<0)summary.reasons.push('negative');
 if(records.some(r=>!r.live))summary.reasons.push('next');
 summary.severity=summary.projectedCash<0||summary.overdueMonths>=3?'critical':summary.overdue>0||summary.due>Math.max(0,operatingNet)?'watch':'stable';
 return {view:cycle(summary),next:loans.filter(l=>l.balance||l.overdueInterest)};
}
function forecast(s,city,opts={}){
 const month=calendar(opts.month??city?.month??Math.max(1,s.month+1));
 if(s.last&&s.last.month===month)return {...s.last,settled:true};
 return frame(s,city,{...opts,month}).view;
}
function advance(s,city,opts={}){
 const month=calendar(opts.month??city?.month??Math.max(1,s.month+1));
 if(month<=s.month){
  const booked=s.last||forecast(s,city,opts);
  return {...booked,cashDelta:0,paid:0,principal:0,interest:0,net:booked.operatingNet,noOp:true};
 }
 const {view,next}=frame(s,city,{...opts,month});
 const old=totals(s).overdue;
 s.loans=next;s.month=month;s.last=view;
 if(view.due||view.overdue||old){
  push(s,{kind:'monthly',month,amount:view.paid,cashDelta:view.cashDelta,overdue:view.overdue});
 }else s.revision++;
 return view;
}
return {PRODUCTS,LEGACY,LIMIT,REASONS,create,normalize,report,quoteLoan,applyLoan,quoteRepay,applyRepay,quoteReserve,applyReserve,forecast,advance,tick:advance};
});
