'use strict';
(() => {
  const S=window.CitySim,{W,H,N,GATE,water,ZONES}=S;
  const base={blank:S.blank,analyze:S.analyze,pack:S.pack,unpack:S.unpack,quote:S.quote,build:S.build};
  const adj=Array.from({length:N},(_,i)=>[i%W?i-1:-1,i%W<W-1?i+1:-1,i>=W?i-W:-1,i<N-W?i+W:-1].filter(x=>x>=0));
  const clamp=(v,l=0,h=1)=>Math.min(h,Math.max(l,v));
  const MODES={open:{name:'自由建城',cash:145000}, port:{name:'老港复兴',cash:100000,months:48,pop:500,net:2400,local:.55}, river:{name:'一座桥，三种解法',cash:145000,months:72,pop:660,east:125,traffic:68,cross:145,happiness:72},storm:{name:'雨季大考',cash:66500,months:17}};
  const rules={tax:[5,15,9],service:[60,130,100],transit:[50,150,100]};
  const normalize=p=>Object.fromEntries(Object.entries(rules).map(([k,[l,h,d]])=>[k,Number.isFinite(p?.[k])?Math.round(clamp(p[k],l,h)):d]).concat([['consolidate',p?.consolidate===true]]));
  const emergencyDefaults=()=>({reinforced:false,alternate:false,stock:[0,0],missed:[0,0],shortage:[0,0],recovered:null});
  function emergency(raw){
    const sane=(a,max)=>[0,1].map(i=>Number.isFinite(a?.[i])?clamp(+a[i],0,max):0);
    return {reinforced:raw?.reinforced===true,alternate:raw?.alternate===true,stock:sane(raw?.stock,720),missed:sane(raw?.missed,999999),shortage:sane(raw?.shortage,999999),recovered:Number.isSafeInteger(raw?.recovered)&&raw.recovered>=11&&raw.recovered<=17?raw.recovered:null};
  }
  const stormPhase=m=>m<=4?{id:'warning',label:'防汛预警',ferry:1}:m<=6?{id:'moderate',label:'水位上升',ferry:.32}:m<=9?{id:'severe',label:'强风停航',ferry:0}:m===10?{id:'inspect',label:'桥面巡检',ferry:.48}:{id:'open',label:'恢复通行',ferry:1};
  const lowBridge=i=>{const y=Math.floor(i/W);return y>=30&&y<=37;};
  const bankCenters=Array.from({length:H},(_,y)=>{let x=24;while(x<W&&!water[y*W+x])x++;let end=x;while(end<W&&water[y*W+end])end++;return x<W?(x+end-1)/2:W/2;});
  const bank=i=>i%W>bankCenters[Math.floor(i/W)]?1:0;
  const init=mode=>Object.hasOwn(MODES,mode)?mode:'open';
  const roadIndex=i=>Number.isInteger(i)&&i>=0&&i<N;
  S.blank=(mode='open')=>({...base.blank(),version:3,mode:init(mode),cash:MODES[init(mode)].cash,rules:normalize(null),lines:[],debt:0,seed:134367,result:null,resultMonth:null,ready:new Int32Array(N),storm:emergencyDefaults(),record:[]});
  S.pack=s=>({...base.pack(s),version:3,facilities:{...s.facilities},rules:{...s.rules},lines:s.lines.map(l=>({...l})),awards:[...s.awards],history:[...s.history],record:s.record.map(r=>({...r})),ready:[...s.ready],storm:emergency(s.storm),last:s.last?{...s.last}:null});
  S.unpack=raw=>{
    if(!raw||![1,2,3].includes(raw.version)||!Array.isArray(raw.road)||!Array.isArray(raw.use)||raw.road.length!==N||raw.use.length!==N)return null;
    if(raw.road.some(i=>!Number.isInteger(i)||i<0||i>(raw.version===1?2:3))||raw.use.some(i=>!Number.isFinite(i)||i<0||i>(raw.version===1?36:90)))return null;
    const old=base.unpack({...raw,version:1,road:raw.road.map(i=>Math.min(i,2)),use:raw.use.map(i=>Math.min(i,36))});
    if(!old)return null;
    const lines=raw.version===3&&Array.isArray(raw.lines)?raw.lines.slice(0,8).filter(l=>l&&['bus','ferry'].includes(l.type)&&roadIndex(l.from)&&roadIndex(l.to)&&l.from!==l.to).map(l=>({type:l.type,from:l.from,to:l.to})): [];
    const aliases={main:'open',revival:'port',green:'river'};
    return {...old,version:3,facilities:{...old.facilities},last:old.last?{...old.last}:null,road:Uint8Array.from(raw.road),use:Float32Array.from(raw.use),mode:init(aliases[raw.mode]||raw.mode),storm:emergency(raw.storm),rules:normalize(raw.rules??{tax:raw.policy?.tax,service:raw.policy?.budget,transit:raw.policy?.transit,consolidate:raw.policy?.freight}),lines,debt:[20000,40000].includes(raw.debt)?raw.debt:0,seed:Number.isInteger(raw.seed)?raw.seed>>>0:134367,resultMonth:Number.isSafeInteger(raw.resultMonth)&&raw.resultMonth>=0&&raw.resultMonth<=old.clock?raw.resultMonth:null,ready:Int32Array.from({length:N},(_,i)=>Array.isArray(raw.ready)&&raw.ready.length===N&&Number.isSafeInteger(raw.ready[i])&&raw.ready[i]>old.clock&&raw.ready[i]<=old.clock+36?raw.ready[i]:0),result:['won','late'].includes(raw.result)?raw.result:raw.scenarioResult==='success'?'won':raw.scenarioResult==='expired'?'late':null,record:Array.isArray(raw.record)?raw.record.filter(x=>x&&Number.isSafeInteger(x.clock)&&x.clock>=0&&x.clock<=old.clock&&Number.isFinite(x.net)).slice(-24).map(x=>Object.fromEntries(['clock','net','pop','traffic','cross','freight','transit','cash'].filter(k=>Number.isFinite(x[k])).map(k=>[k,x[k]]))):[],awards:old.awards.filter(x=>typeof x==='string'),history:old.history.filter(Number.isFinite).slice(-18)};
  };
  function shortest(s,connected,start,avoid=-1,rain=null) {
    const pred=new Int32Array(N).fill(-1),cost=new Int32Array(N).fill(-1),length=new Int16Array(N).fill(-1);
    const buckets=[[start]];cost[start]=0;length[start]=0;
    const weight=i=>s.road[i]===3?3:s.road[i]===2?(rain&&lowBridge(i)?rain.bridgeWeight:6):5;
    for(let k=0;k<buckets.length;k++)for(const i of buckets[k]||[]){
      if(cost[i]!==k)continue;
      for(const j of adj[i]){
        if(connected[j]<0||j===avoid)continue;
        const next=k+weight(i)+weight(j);
        if(cost[j]>=0&&cost[j]<=next)continue;
        cost[j]=next;pred[j]=i;length[j]=length[i]+1;(buckets[next]??=[]).push(j);
      }
    }
    return {pred,cost,length};
  }
  const dist=(a,b)=>Math.abs(a%W-b%W)+Math.abs(Math.floor(a/W)-Math.floor(b/W));
  const trace=(from,pred)=>{const path=[];for(let i=from;i>=0;i=pred[i])path.push(i);return path;};
  const add=(a,path,amt)=>{for(const i of path)a[i]+=amt;};
  const nearBank=(i,other)=>{
    const [x,y]=S.xy(i),[tx,ty]=S.xy(other),dx=tx-x,dy=ty-y;
    const k=Math.max(Math.abs(dx),Math.abs(dy));if(!k)return false;
    for(let j=1;j<=Math.min(4,k-1);j++)if(water[S.index(Math.round(x+dx*j/k),Math.round(y+dy*j/k))])return true;
    return false;
  };
  function lineStatus(s,connected,l,cache) {
    if(connected[l.from]<0||connected[l.to]<0)return {reason:'两端都需要对外连通的道路。'};
    const d=dist(l.from,l.to);
    if(l.type==='ferry')return d>=5&&d<=24&&nearBank(l.from,l.to)&&nearBank(l.to,l.from)
      ?{path:[l.from,l.to],length:d}:{reason:'渡轮两端必须临水、分处两岸，且距离在 5–24 格。'};
    const route=cache(l.to);
    return route.length[l.from]>=4?{path:trace(l.from,route.pred),length:route.length[l.from]}:{reason:'公交两端道路需至少相隔 4 格。'};
  }
  const scenarioCheck=(mode,a)=>{
    const m=MODES[mode];
    if(mode==='port')return [['人口',a.pop,m.pop],['月结余',a.net,m.net],['本地供货率',Math.round(100*a.local),Math.round(100*m.local)]];
    if(mode==='storm')return [['累计未服务通勤',Math.round(a.rain.cumulativeMissed),a.rain.targetMissed,true],['累计物资缺口',Math.round(a.rain.cumulativeShortage),a.rain.targetShortage,true],['期末市库',a.endingTreasury,15000],['恢复月份',a.rain.recovered??17,14,true],['雨季已过',Math.min(a.rain.month,11),11]];
    if(mode==='river')return [['人口',a.pop,m.pop],['东岸人口',a.east,m.east],['满意度',a.happiness,m.happiness],['交通压力（上限）',a.traffic,m.traffic,true],['跨河车流（上限）',a.crossTraffic,m.cross,true]];
    return [];
  };
  function shock(s){
    if(s.clock<9||s.clock%6!==0&&s.clock%6!==3)return {name:'常态经营',import:1,demand:1,power:1};
    const n=((Math.imul((s.seed^s.clock)>>>0,2654435761)>>>16)%3);
    return [{name:'夏季用电高峰',import:1,demand:1,power:1.2},{name:'滨水消费季',import:1.04,demand:1.18,power:1},{name:'外地货运涨价',import:1.35,demand:1,power:1}][n];
  }
  S.analyze=s=>{
    const a=base.analyze(s),p=normalize(s.rules),event=shock(s),{popBy,pop,jobs,connected,near,coverage}=a;
    const access=new Int32Array(N).fill(-1),loads=new Float32Array(N),freight=new Float32Array(N),publicLoad=new Float32Array(N),pressure=new Float32Array(N),land=new Float32Array(N),target=new Float32Array(N),cap=new Uint8Array(N),explain=Array(N);
    const homes=new Map(),work=new Map(),routes=new Map(),bridgeOrigins=new Map();
    let pendingProjects=0;
    const weather=s.mode==='storm'?stormPhase(s.clock):null,isSevere=weather?.id==='severe';
    const disrupted=['moderate','severe','inspect'].includes(weather?.id), storm=s.storm;
    const normalizers=disrupted?{bridgeWeight:isSevere?(storm.reinforced?10:38):storm.reinforced?8:15}:null;
    let roadQuota=disrupted?(isSevere?(storm.reinforced?169:46):storm.reinforced?210:111):Infinity;
    const find=i=>{if(!routes.has(i))routes.set(i,shortest(s,connected,i,-1,normalizers));return routes.get(i);};
    const has=i=>connected[i]>=0;
    const sector=i=>Math.floor((i%W)/8)+W*Math.floor(Math.floor(i/W)/8);
    let east=0,schools=0,clinics=0,plants=0;
    const bankPop=[0,0],bankRetail=[0,0],bankProduct=[0,0],servedByBank=[0,0];
    for(const [i,k] of Object.entries(s.facilities))if(adj[i].some(has)){schools+=+(k==='school');clinics+=+(k==='clinic');plants+=+(k==='bus');}
    for(let i=0;i<N;i++)if(s.zone[i]&&near[i]>=0){
      access[i]=adj[i].find(has)??adj[i].flatMap(j=>water[j]?[]:adj[j]).find(has)??-1;
      if(access[i]<0||!coverage.power[i]||!coverage.water[i])continue;
      const z=s.zone[i],v=s.use[i];
      if(z===1){bankPop[bank(i)]+=v;if(i%W>=55)east+=v;}
      if(z===2)bankRetail[bank(i)]+=v;
      if(z===4)bankProduct[bank(i)]+=v;
      if(v<1)continue;
      const c=z===1?homes:work,k=sector(i);
      if(!c.has(k))c.set(k,{i:access[i],weight:0,best:0,cells:[]});
      const g=c.get(k);g.weight+=v;g.cells.push(i);
      if(v>g.best){g.best=v;g.i=access[i];}
    }
    const lines=s.lines.map(l=>{
      const status=lineStatus(s,connected,l,find);
      if(l.type==='ferry'&&isSevere)return {...l,served:0,max:0,reason:'强风：所有渡轮暂停，巡检后分批复航。'};
      const ferryFactor=weather?.id==='moderate'&&storm.alternate?.84:(weather?.ferry??1);
      const busFactor=isSevere&&status.path?.some(i=>s.road[i]===2&&lowBridge(i))&&!storm.reinforced?.45:1;
      return {...l,...status,served:0,max:(l.type==='ferry'?235*ferryFactor:145*busFactor)*p.transit/100};
    });
    const candidates=[...work.values()].map(g=>({...g,left:g.weight,route:find(g.i)}));
    const employmentBy=new Float32Array(N),tripDist=new Float32Array(N),gate=find(GATE);
    let employed=0,onTransit=0,tripSum=0,crossTraffic=0,coverageLeft=plants*172*p.transit/100;
    for(const h of homes.values()){
      let left=h.weight*.56,done=0,travel=0;
      for(const w of [...candidates].sort((x,y)=>x.route.cost[h.i]-y.route.cost[h.i])){
        const length=w.route.length[h.i];
        if(length<0||w.left<.01)continue;
        const n=Math.min(left,w.left)*clamp(1.32-length/63,.30,1);
        if(n<.03)continue;
        const path=trace(h.i,w.route.pred);
        const good=lines.filter(l=>{const reach=l.type==='ferry'?10:6;return l.path&&l.served<l.max&&(dist(l.from,h.i)<=reach&&dist(l.to,w.i)<=reach||dist(l.to,h.i)<=reach&&dist(l.from,w.i)<=reach);}).sort((x,y)=>x.length-y.length)[0];
        const lowCross=disrupted&&path.some(i=>s.road[i]===2&&lowBridge(i));
        const publicTrips=good?Math.min(n*.68,good.max-good.served):coverage.bus[h.i]&&coverage.bus[w.i]?Math.min(n*.28,coverageLeft,lowCross&&isSevere?0:Infinity):0;
        const availableLow=lowCross?Math.max(0,roadQuota):Infinity;
        const actual=publicTrips+Math.min(n-publicTrips,availableLow);
        if(lowCross)roadQuota-=Math.max(0,actual-publicTrips);
        if(actual<.001)continue;
        if(good){good.served+=publicTrips;add(publicLoad,good.path,publicTrips);if(good.type==='bus')add(loads,good.path,publicTrips*.07);}
        else coverageLeft-=publicTrips;
        const roadTrips=(actual-publicTrips)*.8;
        add(loads,path,roadTrips);
        let crosses=false;
        for(const i of path)if(s.road[i]===2&&roadTrips>.01){
          crosses=true;
          if(!bridgeOrigins.has(i))bridgeOrigins.set(i,new Map());
          const m=bridgeOrigins.get(i),key=h.i*N+w.i,item=m.get(key)||{from:h.i,to:w.i,load:0};
          item.load+=roadTrips;m.set(key,item);
        }
        if(crosses)crossTraffic+=roadTrips;
        travel+=length*actual;done+=actual;left-=actual;w.left-=actual;onTransit+=publicTrips;
        if(left<.05)break;
      }
      tripSum+=travel;employed+=done;servedByBank[bank(h.i)]+=done;
      for(const i of h.cells){employmentBy[i]=done/(h.weight*.56);tripDist[i]=done?travel/done:0;}
    }
    const produced=popBy[4]*(p.consolidate?1.52:1.18),goods=popBy[2]*.85*event.demand, local=goods>0?clamp(produced/goods):0;
    let freightQuota=disrupted?(isSevere?(storm.reinforced?135:28):storm.reinforced?165:85):Infinity;
    const emergencyDetours=new Set();
    for(let i=0;i<N;i++){const z=s.zone[i];if((z===2||z===4)&&access[i]>=0&&coverage.power[i]&&coverage.water[i]&&s.use[i]>=1){
      let n=s.use[i]*(z===4?(p.consolidate?.15:.28):(.23-.14*local))*event.import;
      const path=trace(access[i],gate.pred);
      if(disrupted&&path.some(j=>s.road[j]===2&&lowBridge(j))){n=Math.min(n,freightQuota);freightQuota-=n;}
      if(path.some(j=>s.road[j]===2&&!lowBridge(j)))emergencyDetours.add(bank(i));
      add(freight,path,n);
      if(path.some(j=>s.road[j]===2))crossTraffic+=n;
    }}
    let worst=-1,peak=0,total=0,weighted=0;
    for(let i=0;i<N;i++)if(connected[i]>=0){
      const v=loads[i]+freight[i];pressure[i]=v/(s.road[i]===3?179:s.road[i]===2?84:109);
      weighted+=v*Math.min(2,pressure[i]);total+=v;
      if(pressure[i]>peak){peak=pressure[i];worst=i;}
    }
    let social=0;
    const traffic=Math.round(100*(weighted/Math.max(1,total)*.72+Math.min(peak,2)*.28)/(.85+weighted/Math.max(1,total)*.72+Math.min(peak,2)*.28));
    const utility=clamp(Math.min(a.capacity.power,a.capacity.water)*p.service/100/Math.max(1,(pop+jobs*.5)*event.power),.34,1);
    const eduCap=clamp(schools*390*p.service/100/Math.max(1,pop*.42)),clinicCap=clamp(clinics*630*p.service/100/Math.max(1,pop));
    for(let i=0;i<N;i++){
      const z=s.zone[i];if(!z)continue;const road=access[i],jam=road>=0?pressure[road]:0;
      const green=coverage.park[i]*p.service/100,edu=coverage.school[i]*eduCap,clinic=coverage.clinic[i]*clinicCap;
      const dirty=a.pollution[i]*(1-Math.min(.38,green*.24));
      land[i]=clamp(.47+green*.19+edu*.13+clinic*.13+coverage.bus[i]*.05-dirty*.19-jam*.07);
      if(z===1)social+=s.use[i]*(green*9+edu*7+clinic*8-Math.min(21,dirty*7));
      cap[i]=Math.round(ZONES[z].cap*(1+(pop>=420&&land[i]>.66?.32:0)+(pop>=1150&&land[i]>.81?.45:0)));
      if(road<0||!coverage.power[i]||!coverage.water[i]){
        explain[i]=road<0?'未连外部公路':!coverage.power[i]?'缺少供电':'缺少供水';continue;
      }
      const wait=Math.max(0,s.ready[i]-s.clock);
      if(wait){pendingProjects++;explain[i]='建设中，预计 '+wait+' 月后开放';continue;}
      const b=a.basinPop[i],j=a.basinJobs[i];
      const use=z===1?.53+land[i]*.43+Math.min(.15,j/900):z===2?.24+b/240+pop/2000+.14*local:z===3?.10+b/480+pop/2500+.25*edu+.12*coverage.bus[i]:.61+pop/2350+(p.consolidate?.08:0);
      target[i]=cap[i]*clamp(use*(z===2?event.demand:1),.06,1)*utility*clamp(1-jam*.12-tripDist[i]*.0024,.60,1)*clamp(1-(p.tax-9)*.047,.7,1.19);
      explain[i]=utility<.83?'水电余量不足':jam>.82?'接入路段拥堵':z===1&&dirty>.65?'工业污染偏高':z===2&&b<45?'附近客源不足':z===3&&edu<.3?'教育覆盖不足':land[i]>.66?'地价支持较高密度':'供应与通行正常';
    }
    const employment=pop?clamp(employed/(pop*.56)):0, ridership=employed?onTransit/employed:0;
    const happiness=pop?Math.round(clamp((66+social/pop+employment*10-traffic*.15-(p.tax-9)*1.4-(1-utility)*18)/100)*100):0;
    const imports=Math.round(Math.max(0,goods-produced)*2.5*event.import),interest=Math.ceil(s.debt*.0125);
    const expense=Math.round(a.roads*11+a.bridges*19+s.road.reduce((n,x)=>n+(x===3?15:0),0)+Object.values(s.facilities).reduce((n,k)=>n+S.FACILITIES[k].monthly*(k==='bus'?p.transit:p.service)/100,0)+lines.reduce((n,l)=>n+(l.type==='ferry'?420:280)*p.transit/100,0)+imports+interest+(p.consolidate?180:0));
    const income=Math.round((pop*7+(popBy[2]*14+popBy[3]*16+popBy[4]*11)*(.75+employment*.25))*p.tax/9);
    const rain=weather?(()=>{
      const missed=bankPop.map((n,i)=>Math.max(0,n*.56-servedByBank[i]));
      const supplyNeed=bankPop.map((n,i)=>n*.25+bankRetail[i]*.55);
      const headroom=disrupted?(isSevere?(storm.reinforced?198:42):storm.reinforced?220:98):250;
      const safeEast=emergencyDetours.has(1)||[...homes.values()].some(h=>bank(h.i)===1&&trace(h.i,gate.pred).some(j=>s.road[j]===2&&!lowBridge(j)));
      const delivered=[Math.max(supplyNeed[0],bankProduct[0]*1.05),bankProduct[1]*1.1+(safeEast?250:headroom)];
      const gap=supplyNeed.map((n,i)=>Math.max(0,n-delivered[i]));
      const stockUsed=gap.map((n,i)=>disrupted?Math.min(n,storm.stock[i]):0);
      const shortage=gap.map((n,i)=>n-stockUsed[i]);
      return {phase:weather,month:s.clock,missed,shortage,stockUsed,
        targetMissed:760,targetShortage:165,
        cumulativeMissed:storm.missed.reduce((a,b)=>a+b,0),
        cumulativeShortage:storm.shortage.reduce((a,b)=>a+b,0),
        recovered:storm.recovered};
    })():null;
    const freightTotal=freight.reduce((x,y)=>x+y,0), freightExposure=freightTotal?freight.reduce((x,y,i)=>x+(pressure[i]>1?y:0),0)/freightTotal:0;
    const demand=[0,70+(jobs-pop*.56)/13-traffic*.26-(p.tax-9)*4,27+pop*.052-popBy[2]*.13,10+pop*.035-popBy[3]*.12+eduCap*9,48+goods*.07-popBy[4]*.09].map((v,i)=>i?Math.round(clamp(v-(a.lots[i]*ZONES[i].cap-popBy[i])/27,4,100)):0);
    return Object.assign(a,{event,traffic,employment,ridership,avgTrip:employed?tripSum/employed:0,crossTraffic:Math.round(crossTraffic),rain,endingTreasury:Math.round(s.cash),bridgeOrigins,pendingProjects,freightExposure,pressure,worst,freight,loads,publicLoad,lines,cap,land,target,explain,local,imports,interest,utility,east:Math.round(east),happiness,income,expense,net:income-expense,demand});
  };
  S.tick=(s,a)=>{
    s.clock++;
    for(let i=0;i<N;i++)if(s.zone[i]){
      const t=a.target[i],v=s.use[i];
      s.use[i]=t>v?Math.min(t,v+Math.max(.9,(t-v)*(.20+a.demand[s.zone[i]]*.0015))):Math.max(t,v-2.4);
    }
    const next=S.analyze(s);s.cash+=next.net;s.last={income:next.income,expense:next.expense,net:next.net};
    s.history.push(next.net);if(s.history.length>18)s.history.shift();
    s.record.push({clock:s.clock,net:next.net,pop:next.pop,traffic:next.traffic,cross:next.crossTraffic,freight:Math.round(next.freightExposure*100),transit:Math.round(next.ridership*100),cash:Math.round(s.cash)});
    if(s.record.length>24)s.record.shift();
    if(next.rain){
      const r=next.rain;
      if(r.month>=5&&r.month<=10){
        for(let i=0;i<2;i++){
          s.storm.stock[i]=Math.max(0,s.storm.stock[i]-r.stockUsed[i]);
          s.storm.missed[i]+=r.missed[i];s.storm.shortage[i]+=r.shortage[i];
        }
      }
      if(r.month>=11&&r.missed[1]<=120&&r.shortage[1]<=35)s.storm.recovered??=r.month;
      r.recovered=s.storm.recovered;r.cumulativeMissed=s.storm.missed.reduce((a,b)=>a+b,0);
      r.cumulativeShortage=s.storm.shortage.reduce((a,b)=>a+b,0);next.endingTreasury=Math.round(s.cash);
    }
    const mode=MODES[s.mode],rows=scenarioCheck(s.mode,next);
    if(mode.months&&!s.result){
      if(rows.every(([,actual,t,atMost])=>atMost?actual<=t:actual>=t)){s.result='won';s.resultMonth=s.clock;s.cash+=25000;}
      else if(s.clock>=mode.months){s.result='late';s.resultMonth=s.clock;}
    }
    return next;
  };
  const avenue='avenue';
  S.TOOLS[avenue]={name:'主干道',icon:'road',hint:'拖过已有陆地道路，升级容量；桥不能直接加宽。',cost:'¥ 620 / 格'};
  S.TOOLS.busline={name:'公交线路',icon:'bus',hint:'选择两个相连道路端点。住宅和岗位两端都接近线路才会有人搭乘。',cost:'¥ 3,400 / 线'};
  S.TOOLS.ferry={name:'渡轮',icon:'bridge',hint:'选择相对两岸靠水的道路。渡轮能分流跨河通勤，但不载货。',cost:'¥ 5,600 / 线'};
  const qmsg=(key,message)=>({key,cells:[],cost:0,message});
  S.quote=(s,key,a,b=a,vertical=false)=>{
    if(![avenue,'busline','ferry'].includes(key))return base.quote(s,key,a,b,vertical);
    if(!roadIndex(a)||!roadIndex(b))return qmsg(key,'请选择路线端点。');
    if(key===avenue){
      const cells=[], push=i=>{if(s.road[i]===1)cells.push(i);};
      const pivot=vertical?(b-b%W+a%W):(a-a%W+b%W);
      push(a);
      for(let i=a;i!==pivot;){i+=Math.sign(pivot-i)*(vertical?W:1);push(i);}
      for(let i=pivot;i!==b;){i+=Math.sign(b-i)*(vertical?1:W);push(i);}
      const cost=cells.length*620;
      return !cells.length?qmsg(key,'请选中现有陆地道路。'):cost>s.cash?qmsg(key,'市库余额不足。'):{key,cells,cost,message:''};
    }
    if(a===b)return qmsg(key,'请选择第二个端点。');
    const type=key==='busline'?'bus':'ferry',line={type,from:a,to:b};
    if(s.lines.length>=8)return qmsg(key,'最多可运行 8 条线路。');
    if(s.lines.some(l=>l.type===type&&(l.from===a&&l.to===b||l.from===b&&l.to===a)))return qmsg(key,'这条线路已经运行。');
    const connected=new Int16Array(N).fill(-1),queue=[];
    if(s.road[GATE]){connected[GATE]=0;queue.push(GATE);}
    for(let at=0;at<queue.length;at++){const i=queue[at];for(const j of adj[i])if(s.road[j]&&connected[j]<0){connected[j]=connected[i]+1;queue.push(j);}}
    const status=lineStatus(s,connected,line,i=>shortest(s,connected,i));
    if(!status.path)return qmsg(key,status.reason);
    const cost=type==='bus'?3400:5600;
    return cost>s.cash?qmsg(key,'市库余额不足。'):{key,cells:status.path,cost,line,message:''};
  };
  S.build=(s,q)=>{
    if(q.key!==avenue&&!q.line){
      if(!base.build(s,q))return false;
      for(const i of q.cells) {
        const delay=s.zone[i]===2?3:s.zone[i]===3?6:s.zone[i]===4?4:0;
        s.ready[i]=delay?s.clock+delay:0;
      }
      return true;
    }
    if(q.message||!q.cells.length||s.cash<q.cost)return false;
    if(q.line)s.lines.push(q.line);
    else {if(q.cells.some(i=>s.road[i]!==1))return false;for(const i of q.cells)s.road[i]=3;}
    s.cash-=q.cost;return true;
  };
  const transact=(s,command)=>{
    if(!command||typeof command.type!=='string')return false;
    if(command.type==='build')return S.build(s,S.quote(s,command.tool,command.from,command.to??command.from,command.vertical===true));
    if(command.type==='emergency'&&s.mode==='storm'&&s.clock<11){
      const field=command.action, cost=field==='reinforced'?18500:field==='alternate'?6800:field==='stock'?7200:Infinity;
      if(s.cash<cost)return false;
      if(field==='stock'){
        const i=command.bank;
        if(![0,1].includes(i)||s.storm.stock[i]>360)return false;
        s.storm.stock[i]+=360;
      }else if(!['reinforced','alternate'].includes(field)||s.storm[field])return false;
      else s.storm[field]=true;
      s.cash-=cost;return true;
    }
    if(command.type==='policy'){s.rules=normalize({...s.rules,...command.value});return true;}
    if(command.type==='remove-line'&&Number.isInteger(command.index)&&command.index>=0&&command.index<s.lines.length){s.lines.splice(command.index,1);return true;}
    if(command.type==='loan'&&command.amount===20000&&s.debt<40000||command.type==='loan'&&command.amount===-20000&&s.debt>=20000&&s.cash>=20000){
      s.debt+=command.amount;s.cash+=command.amount;return true;
    }
    if(command.type==='month'){S.tick(s,S.analyze(s));return true;}
    return false;
  };
  const replay=(initial,commands)=>{const s=S.unpack(initial);if(!s)return null;for(const c of commands)if(!transact(s,c))return null;return s;};
  const forecast=(s,command)=>{const t=S.unpack(S.pack(s));if(!t||command&&!transact(t,command))return null;const a=S.analyze(t),next=S.tick(t,a);return {pop:next.pop,net:next.net,cross:next.crossTraffic,traffic:next.traffic,treasury:t.cash};};
  const startCity=mode=>{
    if(mode==='storm'){
      const s=startCity('river');s.mode='storm';s.cash=66500;
      if(!transact(s,{type:'build',tool:'ferry',from:S.index(45,33),to:S.index(51,33)}))throw new Error('Storm starter ferry');
      s.cash=66500;return s;
    }
    if(!['port','river'].includes(mode))return S.blank();
    const s=S.blank(),put=(tool,x,y,tx=x,ty=y)=>{
      const c={type:'build',tool,from:S.index(x,y),to:S.index(tx,ty)};
      if(!transact(s,c))throw new Error('Bad start: '+mode+' '+tool+' '+x+','+y);
    };
    put('road',0,33,mode==='river'?45:24,33);
    put('power',15,32);put('water',16,34);
    if(mode==='port'){
      put('industrial',3,34,11,35);put('residential',6,31,12,32);put('commercial',16,34,20,35);
    }else{
      put('residential',5,31,20,32);put('industrial',3,34,11,35);
      put('commercial',36,31,45,32);put('bridge',45,33,51,33);put('road',51,33,67,33);
      put('power',56,32);put('water',57,34);put('residential',52,34,65,35);
    }
    for(let month=0;month<(mode==='port'?5:11);month++)transact(s,{type:'month'});
    s.clock=0;s.ready.fill(0);s.mode=mode;s.cash=mode==='port'?68000:52000;s.record=[];s.history=[];s.last=null;
    return s;
  };
  Object.assign(S,{MODES,scenarioCheck,transact,replay,forecast,rules,startCity,stormPhase});
})();
