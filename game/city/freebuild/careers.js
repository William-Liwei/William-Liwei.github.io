/* Cohort careers: keeps experience on real matched adults without creating jobs or money. */
(function(root,factory){
 const api=factory(typeof module==='object'?require('./economy.js'):root.Economy);
 if(typeof module==='object')module.exports=api;else root.Careers=api;
})(globalThis,function(E){
'use strict';
const ROLES=['entry','general','technical','professional'],GRADES=['none','primary','secondary','vocational','university'];
const ACCESS={none:0,primary:0,secondary:1,vocational:2,university:3};
const ROLE_LABELS={entry:'入门岗位',general:'一般岗位',technical:'技术岗位',professional:'专业岗位'};
const GRADE_LABELS={none:'无指定学历',primary:'小学',secondary:'中学',vocational:'职业技术',university:'大学'};
const BASE_GRADES={entry:'none',general:'secondary',technical:'vocational',professional:'university'};
const POLICIES={
 balanced:{name:'常规晋升',description:'保持基本薪酬标准；实际工作逐步积累经验。'},
 training:{name:'企业见习计划',description:'真实有导师的单位提供有限见习席；训练期占用小部分产能，合格后更容易晋升。'},
 wages:{name:'稳岗工资指导',description:'一线岗位公布较高工资，影响实际家庭工资、价格和税基，不另征或另发补贴。'}
};
const SPECIAL={
 general:{finance_center:1,research_lab:1},
 technical:{electronics:2,utility_equipment:3,refinery:3,software_studio:2,research_lab:3,finance_center:2},
 professional:{electronics:3,utility_equipment:3,refinery:4,software_studio:3,research_lab:4,finance_center:3,media_studio:2,business_services:1}
};
const LIMIT={lots:4000,people:500,buckets:120,experience:48,tenure:36,idle:48,history:100,wage:5000};
const actions=['promoted','trained'];
const qs=['workers','employed','experienced','trained','promoted','payroll','basePayroll','premium'];
const zoneList=['commercial','industrial','office'];
const n=(v,d=0)=>Number.isFinite(v)?v:d,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),int=(v,d=0,a=0,b=1e9)=>Math.floor(clamp(n(v,d),a,b)),
 round=(v,d=3)=>Math.round(v*10**d)/10**d;
const own=(o,k)=>Object.hasOwn(o,k),arr=v=>Array.isArray(v)?v:[],words=v=>typeof v==='string'||typeof v==='number'?String(v).slice(0,72):'';
const month=v=>Math.max(1,int(v,1));
const roleRank=v=>ROLES.indexOf(v);
const vals=()=>Object.fromEntries(qs.map(k=>[k,0]));
const counts=(o)=>Object.fromEntries(qs.map(k=>[k,int(o?.[k])]));
const tenureOf=(b)=>Math.min(LIMIT.tenure,int(b?.tenure));
const validRole=(g,r)=>ROLES.includes(r)&&own(ACCESS,g)&&ACCESS[g]>=roleRank(r);
const policy=v=>own(POLICIES,v)?v:'balanced';
const actualCount=v=>int(v,0,0,LIMIT.people);
function requirements(sector,role){
 if(!ROLES.includes(role))return {name:'未知岗位',grade:'university',education:'大学',experience:LIMIT.experience};
 const grade=BASE_GRADES[role],experience=SPECIAL[role]?.[sector]??(role==='professional'?1:0);
 return {name:ROLE_LABELS[role],grade,education:GRADE_LABELS[grade],experience};
}
function create(seed='city-careers'){
 return {version:1,seed:String(seed).slice(0,96),policy:'balanced',lastMonth:0,cohorts:{},last:null,history:[]};
}
function cohort(v){
 const count=actualCount(v?.count);if(!count)return null;
 const work=words(v.work);
 return {count,work,role:work&&ROLES.includes(v.role)?v.role:'',experience:int(v.experience,0,0,LIMIT.experience),
  tenure:work?tenureOf(v):0,idle:work?0:int(v.idle,0,0,LIMIT.idle)};
}
function activityRow(v){return round(clamp(n(v,1),.82,1.24));}
function homeRow(k,v){return {id:k,...counts(v),meanExperience:round(clamp(n(v?.meanExperience),0,LIMIT.experience),2)};}
function workRow(k,v){
 const sector=own(E.SECTORS,v?.sector)?v.sector:null;
 if(!sector)return null;
 return {id:k,sector,name:E.SECTORS[sector].name,zone:zoneList.includes(E.SECTORS[sector].zone)?E.SECTORS[sector].zone:'',
  ...counts(v),activity:activityRow(v.activity),mentors:actualCount(v?.mentors),
  meanExperience:round(clamp(n(v?.meanExperience),0,LIMIT.experience),2),
  requirements:Object.fromEntries(ROLES.map(r=>[r,requirements(sector,r)])),
  posted:Object.fromEntries(ROLES.map(r=>[r,int(v?.posted?.[r],0,0,LIMIT.wage)])),
  roles:Object.fromEntries(ROLES.map(r=>[r,actualCount(v?.roles?.[r])]))};
}
function row(v){
 if(!v||!actions.includes(v.action)||!words(v.home)||!words(v.work)||!ROLES.includes(v.role))return null;
 return {month:month(v.month),action:v.action,home:words(v.home),work:words(v.work),role:v.role,count:actualCount(v.count),sector:own(E.SECTORS,v.sector)?v.sector:''};
}
function adapt(v,m,currentPolicy){
 if(!v||typeof v!=='object')return null;
 const byHome=Object.fromEntries(Object.entries(v.byHome||{}).slice(0,LIMIT.lots).filter(([k])=>words(k)).map(([k,x])=>[words(k),homeRow(words(k),x)]));
 const byWork=Object.fromEntries(Object.entries(v.byWork||{}).slice(0,LIMIT.lots).map(([k,x])=>workRow(words(k),x)).filter(x=>x?.id).map(x=>[x.id,x]));
 return {month:m,policy:policy(v.policy??currentPolicy),byHome,byWork,activity:Object.fromEntries(Object.values(byWork).map(x=>[x.id,x.activity])),
  totals:{...counts(v.totals),meanExperience:round(n(v.totals?.meanExperience),2)}};
}
function normalize(raw,seed='city-careers'){
 const s=create(typeof raw?.seed==='string'?raw.seed:seed);
 if(raw?.version!==1)return s;
 s.policy=policy(raw.policy);s.lastMonth=int(raw.lastMonth);
 for(const [key,v] of Object.entries(raw.cohorts||{}).slice(0,LIMIT.lots)){
  const k=words(key);if(!k||!v)continue;
  const bands={};let left=LIMIT.people;
  for(const g of GRADES){
   const values=[];
   for(const x of arr(v[g]).slice(0,LIMIT.buckets)){
    const b=cohort(x);if(!b||!left)continue;
    b.count=Math.min(b.count,left);left-=b.count;values.push(b);
   }
   if(values.length)bands[g]=values;
  }
  if(Object.keys(bands).length)Object.defineProperty(s.cohorts,k,{value:bands,enumerable:true,writable:true,configurable:true});
 }
 s.last=s.lastMonth?adapt(raw.last,s.lastMonth,s.policy):null;
 s.history=arr(raw.history).slice(-LIMIT.history).map(row).filter(Boolean);
 return s;
}
function setPolicy(s,k){
 if(!s||!own(POLICIES,k))return false;
 s.policy=k;return true;
}
function report(s){
 return {...(s.last||{month:s.lastMonth,byHome:{},byWork:{},activity:{},totals:{...vals(),meanExperience:0}}),policy:s.policy,settledPolicy:s.last?.policy||null,history:s.history};
}
function wageFactor(p,r){
 if(p!=='wages')return 1;
 return r==='entry'?1.14:r==='general'?1.09:r==='technical'?1.045:1.025;
}
function estimateWage(base,experience,tenure){
 return Math.min(LIMIT.wage,Math.round(base*(1+Math.min(.155,experience*.010)+Math.min(.085,tenure*.007))));
}
function contract(p){
 return {home:words(p?.home),work:words(p?.work),grade:p?.grade,role:p?.role,sector:p?.sector,retained:p?.retained===true,
  count:actualCount(p?.count),baseWage:int(p?.baseWage,0,0,LIMIT.wage)};
}
function mark(home,grade){return JSON.stringify([home,grade]);}
function pairkey(home,work,grade,role){return JSON.stringify([home,work,grade,role]);}
function spread(old,desired){
 const total=old.reduce((n,v)=>n+v.count,0);
 if(desired>=total)return old.map(v=>({...v}));
 if(!total||desired<=0)return [];
 const rows=old.map((b,i)=>({...b,i,want:b.count*desired/total,next:Math.floor(b.count*desired/total)}));
 let left=desired-rows.reduce((n,b)=>n+b.next,0);
 for(const v of rows.slice().sort((a,b)=>(b.want-b.next)-(a.want-a.next)||a.i-b.i))if(left>0){v.next++;left--;}
 return rows.flatMap(({want,next,i,...v})=>next?[{...v,count:next}]:[]);
}
function prepare(state,city){
 const m=month(city?.month),p=state.policy,groups=new Map(),accepted=[],holds=new Map();
 function register(home,grade,count,newGraduates=0){
  const k=words(home);
  if(!k||!GRADES.includes(grade))return false;
  const c=actualCount(count),key=mark(k,grade);
  if(groups.has(key))return false;
  const fresh=Math.min(c,actualCount(newGraduates)),settled=c-fresh;
  const existing=spread(arr(state.cohorts[k]?.[grade]),settled);
  const used=existing.reduce((n,b)=>n+b.count,0);
  if(settled>used)existing.push({count:settled-used,work:'',role:'',experience:0,tenure:0,idle:0});
  const bands=existing.map(b=>({...b,fresh:false,held:0}));
  if(fresh)bands.push({count:fresh,work:'',role:'',experience:0,tenure:0,idle:0,fresh:true,held:0});
  groups.set(key,{home:k,grade,count:c,bands});return true;
 }
 function postedWage(base,opts={}){
  return Math.min(LIMIT.wage,Math.max(1,Math.round(n(base,1)*wageFactor(p,opts.role))));
 }
 function viable(group,args,b,hold=false){
  if(!b.count||!validRole(args.grade,args.role))return 0;
  if(args.retained){
   if(b.fresh)return 0;
   // Existing stock is portable, but only an actual same job or the
   // untracked pre-release incumbent can use the save-compatibility waiver.
   if(b.work&&b.work!==args.work||b.work&&b.role!==args.role)return 0;
   return Math.max(0,b.count-(hold?0:b.held));
  }
  return b.experience>=requirements(args.sector,args.role).experience?b.count:0;
 }
 function capacity(o){
  const a=contract(o),g=groups.get(mark(a.home,a.grade));
  return g?g.bands.reduce((n,b)=>n+viable(g,a,b),0):0;
 }
 function promotionQuota(o){
  const a=contract(o),g=groups.get(mark(a.home,a.grade)),key=pairkey(a.home,a.work,a.grade,a.role);
  if(!g||holds.has(key)||!a.count||a.role==='professional')return 0;
  let cap=Math.min(Math.max(1,Math.floor(a.count*.35)),a.count,3),held=0;
  const proposals=arr(o.higher).filter(x=>x&&roleRank(x.role)>roleRank(a.role)&&validRole(a.grade,x.role)&&actualCount(x.open??x.count)>0)
   .sort((a,b)=>roleRank(b.role)-roleRank(a.role));
  const prior=g.bands.filter(x=>x.work===a.work&&x.role===a.role&&!x.fresh).sort((a,b)=>b.experience-a.experience||b.tenure-a.tenure);
  let spare=0;
  for(const q of proposals){
   const required=requirements(q.sector||a.sector,q.role).experience;
   spare=actualCount(q.open??q.count);
   for(const b of prior){
    if(b.experience<required)continue;
    const n=Math.min(b.count-b.held,cap-held,spare);
    if(n>0){b.held+=n;held+=n;spare-=n;}
    if(held>=cap||spare<=0)break;
   }
   if(held>=cap)break;
  }
  holds.set(key,held);return held;
 }
 function take(o){
  const a=contract(o),g=groups.get(mark(a.home,a.grade));
  if(!g||!a.work||!validRole(a.grade,a.role)||!a.count)return {count:0,payroll:0,basePayroll:0,premium:0,promoted:0,experience:0,newGraduates:0};
  const bunch=g.bands.slice().sort((x,y)=>{
   const matching=b=>Number(b.work===a.work&&b.role===a.role),homeProm=b=>Number(b.held>0&&b.work===a.work&&roleRank(a.role)>roleRank(b.role));
   if(a.retained)return matching(y)-matching(x)||y.tenure-x.tenure||y.experience-x.experience;
   return homeProm(y)-homeProm(x)||Number(y.fresh)-Number(x.fresh)||y.experience-x.experience||y.tenure-x.tenure||x.work.localeCompare(y.work);
  });
  let left=a.count,payroll=0,premium=0,promoted=0,experience=0,newGraduates=0;
  for(const b of bunch){
   if(left<=0)break;
   const take=Math.min(left,viable(g,a,b));if(!take)continue;
   const same=b.work===a.work&&b.role===a.role,oldWork=b.work,oldRole=b.role,tenure=same?b.tenure:0;
   const payout=estimateWage(a.baseWage,b.experience,tenure);
   const elevated=!!oldRole&&roleRank(a.role)>roleRank(oldRole);
   accepted.push({...a,count:take,previousWork:oldWork,previousRole:oldRole,oldExperience:b.experience,oldTenure:tenure,
    payout,promoted:elevated?take:0,fresh:b.fresh});
   b.count-=take;if(!a.retained)b.held=Math.max(0,b.held-take);
   left-=take;payroll+=take*payout;premium+=take*(payout-a.baseWage);experience+=b.experience*take;
   if(elevated)promoted+=take;
   if(b.fresh)newGraduates+=take;
  }
  const count=a.count-left;
  return {count,payroll,basePayroll:a.baseWage*count,premium,promoted,newGraduates,experience:count?round(experience/count,2):0};
 }
 return {month:m,policy:p,register,postedWage,capacity,promotionQuota,take,_groups:groups,_accepted:accepted};
}
function compact(input){
 const by=new Map();
 for(const raw of input){
  const a=cohort(raw);if(!a)continue;
  const k=[a.work,a.role,a.experience,a.tenure,a.idle].join('\u0001'),old=by.get(k);
  if(old)old.count+=a.count;else by.set(k,a);
 }
 const ordered=[...by.values()].sort((a,b)=>a.work.localeCompare(b.work)||a.role.localeCompare(b.role)||b.experience-a.experience||b.tenure-a.tenure||a.idle-b.idle);
 // Per-lot histories cannot grow forever when many people switch workplaces.
 // Preserve their headcount if the oldest small buckets are compacted.
 if(ordered.length<=LIMIT.buckets)return ordered;
 const kept=ordered.slice(0,LIMIT.buckets-1),rest=ordered.slice(LIMIT.buckets-1);
 const count=rest.reduce((n,a)=>n+a.count,0),experience=Math.floor(rest.reduce((n,a)=>n+a.count*a.experience,0)/count);
 kept.push({count,work:'',role:'',experience,tenure:0,idle:0});return kept;
}
function increment(o,k,n){o[k]+=n;return o;}
function advance(s,city,labor,session){
 const m=month(city?.month);
 if(m<=s.lastMonth)return {...report(s),noOp:true};
 if(labor?.month!==m||!session||session.month!==m||!(session._groups instanceof Map)||!Array.isArray(session._accepted))
  return {...report(s),noOp:true,reason:'需要同月实际用工与晋升账本'};
 const grouped=new Map();
 for(const a of arr(labor.assignments).slice(0,16000)){
  if(!a||!validRole(a.grade,a.role)||!words(a.home)||!words(a.work))continue;
  const key=pairkey(words(a.home),words(a.work),a.grade,a.role);
  grouped.set(key,(grouped.get(key)||0)+actualCount(a.count));
 }
 const verified=[],byWorkMap=new Map(),used=new Map();
 for(const c of session._accepted){
  const key=pairkey(c.home,c.work,c.grade,c.role),left=(grouped.get(key)||0)-(used.get(key)||0);
  const count=Math.min(left,actualCount(c.count));
  if(!count||count<0)continue;
  const def=E.SECTORS[labor.byWork?.[c.work]?.sector||c.sector];if(!def||!zoneList.includes(def.zone))continue;
  used.set(key,(used.get(key)||0)+count);
  const rec={...c,count,sector:def.id,trained:0,isMentor:c.oldExperience>=3||roleRank(c.role)>=2&&c.oldExperience>=1};
  verified.push(rec);
  if(!byWorkMap.has(rec.work))byWorkMap.set(rec.work,{id:rec.work,sector:rec.sector,crew:[],mentors:0});
  const b=byWorkMap.get(rec.work);b.crew.push(rec);b.mentors+=rec.isMentor?count:0;
 }
 const events=[],sum=vals(),next={},homes={},work={};
 const log=(a,action,count)=>{
  if(count){const q=row({...a,month:m,action,count});if(q)events.push(q);}
 };
 const byHomeMap=new Map(),assigned=new Map();
 function home(k){
  if(!byHomeMap.has(k))byHomeMap.set(k,{id:k,...vals(),experienceMonths:0});
  return byHomeMap.get(k);
 }
 for(const [k,g] of session._groups){
  const count=Math.min(g.count,actualCount(labor.byHome?.[g.home]?.eligible?.[g.grade]));
  home(g.home).workers+=count;
  assigned.set(k,[]);
 }
 for(const f of byWorkMap.values()){
  const grades=f.crew;
  if(session.policy==='training'&&f.mentors){
   let slots=Math.min(4,Math.max(1,Math.ceil(f.mentors/2)));
   const trainees=grades.filter(c=>!c.isMentor&&c.oldExperience<7&&roleRank(c.role)<ACCESS[c.grade])
    .sort((a,b)=>b.oldExperience-a.oldExperience||a.home.localeCompare(b.home)||rnk(a.grade)-rnk(b.grade));
   for(const a of trainees){
    a.trained=Math.min(slots,a.count);slots-=a.trained;
    if(!slots)break;
   }
  }
  const d={id:f.id,sector:f.sector,...vals(),posted:labor.byWork?.[f.id]?.wage,roles:Object.fromEntries(ROLES.map(k=>[k,0])),mentors:f.mentors};
  let xp=0;
  for(const a of grades){
   const g=assigned.get(mark(a.home,a.grade));if(!g)continue;
   const h=home(a.home),t=a.trained,others=a.count-t;
   const normalXP=Math.min(LIMIT.experience,a.oldExperience+1),advancedXP=Math.min(LIMIT.experience,a.oldExperience+2),tenure=Math.min(LIMIT.tenure,a.oldTenure+1);
   if(others)g.push({count:others,work:a.work,role:a.role,experience:normalXP,tenure,idle:0});
   if(t)g.push({count:t,work:a.work,role:a.role,experience:advancedXP,tenure,idle:0});
   const progress=normalXP*others+advancedXP*t;
   const exp=(normalXP>=3?others:0)+(advancedXP>=3?t:0);
   const promoted=Math.min(a.count,a.promoted);
   log(a,'promoted',promoted);log(a,'trained',t);
   for(const v of [h,d]){
    v.employed+=a.count;v.experienced+=exp;v.promoted+=promoted;v.trained+=t;
    v.payroll+=a.count*a.payout;v.basePayroll+=a.count*a.baseWage;v.premium+=a.count*(a.payout-a.baseWage);
   }
   h.experienceMonths+=progress;xp+=progress;
   d.roles[a.role]+=a.count;
  }
  d.workers=d.employed;
  d.meanExperience=d.employed?xp/d.employed:0;
  const expert=(d.roles.technical+d.roles.professional)/Math.max(1,d.employed);
  d.activity=activityRow(1+Math.min(.17,d.meanExperience*.009)+.028*expert-.22*d.trained/Math.max(1,d.employed));
  Object.defineProperty(work,f.id,{value:workRow(f.id,d),enumerable:true,writable:true});
 }
 // Even an empty workplace has visible wage offers and hiring gates.
 for(const [key,x] of Object.entries(labor.byWork||{}).slice(0,LIMIT.lots)){
  const k=words(key);
  if(k&&!own(work,k)){
   const r=workRow(k,{sector:x?.sector,posted:x?.wage,activity:1});
   if(r)Object.defineProperty(work,k,{value:r,enumerable:true,writable:true});
  }
 }
 function rnk(g){return GRADES.indexOf(g);}
 // Keep all remaining eligible workers, including laid-off experience. Grade
 // size is rechecked against the actual final Labor denominator.
 for(const [k,g] of session._groups){
  const active=assigned.get(k)||[],actual=Math.min(g.count,actualCount(labor.byHome?.[g.home]?.eligible?.[g.grade]));
  const initial=(next[g.home]&&Object.hasOwn(next,g.home))?next[g.home]:{};
  if(!Object.hasOwn(next,g.home))Object.defineProperty(next,g.home,{value:initial,enumerable:true,writable:true});
  const busy=active.reduce((n,v)=>n+v.count,0);
  const expected=Math.max(0,actual-busy),spare=[];
  for(const b of g.bands){
   if(!b.count)continue;
   const idle=Math.min(LIMIT.idle,b.work?1:b.idle+1),frozen=idle>=9&&idle%3===0?Math.max(0,b.experience-1):b.experience;
   spare.push({count:b.count,work:'',role:'',experience:frozen,tenure:0,idle});
  }
  let leftover=spread(spare,expected);
  const known=leftover.reduce((n,v)=>n+v.count,0);
  if(known<expected)leftover.push({count:expected-known,work:'',role:'',experience:0,tenure:0,idle:1});
  if(actual)initial[g.grade]=compact([...active,...leftover]);
 }
 let xp=0;
 for(const h of byHomeMap.values()){
  h.meanExperience=h.employed?h.experienceMonths/h.employed:0;
  xp+=h.experienceMonths;
  for(const k of qs)sum[k]+=h[k];
  Object.defineProperty(homes,h.id,{value:homeRow(h.id,h),enumerable:true,writable:true});
 }
 s.cohorts=Object.fromEntries(Object.entries(next).filter(([,v])=>Object.keys(v).length));s.lastMonth=m;
 s.last=adapt({month:m,policy:session.policy,byHome:homes,byWork:work,totals:{...sum,meanExperience:sum.employed?xp/sum.employed:0}},m,s.policy);
 s.history=[...s.history,...events].slice(-LIMIT.history);
 return report(s);
}
return {POLICIES,ROLE_LABELS,GRADE_LABELS,LIMIT,create,normalize,setPolicy,requirements,prepare,advance,tick:advance,report};
});
