/* One forecastable danger instead of random indiscriminate damage. */
(function (root,factory) {
  if (typeof module==='object'&&module.exports) module.exports=factory();
  else root.CityEvents=factory();
})(typeof globalThis==='object'?globalThis:this,function () {
  'use strict';
  const PERIOD=15, FORECAST=3, DURATION=2, SAFE_DECK=24;
  const river=y=>globalThis.CityMaps?.center(y)??(600+45*Math.sin(y/115));
  const offset=p=>p.x-river(p.y);
  const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.z==null||Number.isFinite(p.z));
  const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:(a.z||0)+((b.z||0)-(a.z||0))*t});
  function clearance(edge) {
    const path=edge?.pts||edge?.points;
    if(!Array.isArray(path)||path.length<2||path.some(p=>!finitePoint(p)))return null;
    let candidate=null;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i];
      // Drawn roads usually contain points every 8 m. Sampling here also
      // handles imported two-point paths and the river's curving midline.
      const steps=Math.max(1,Math.min(256,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/5)));
      let prev=a,left=offset(a);
      for(let j=1;j<=steps;j++){
        const cur=mix(a,b,j/steps),right=offset(cur);
        if(left*right<=0&&Math.abs(left-right)>.0001){
          const cross=mix(prev,cur,left/(left-right));
          if(cross.z>=9.999&&cross.z<SAFE_DECK&&(candidate===null||cross.z<candidate))candidate=cross.z;
        }
        prev=cur;left=right;
      }
    }
    return candidate;
  }
  function older(a,b){
    const tail=x=>/^e([0-9]+)$/.test(x)?Number(x.slice(1)):Infinity;
    const x=tail(String(a.edge.id)),y=tail(String(b.edge.id));
    return x!==y?x-y:String(a.edge.id)<String(b.edge.id)?-1:String(a.edge.id)>String(b.edge.id)?1:0;
  }
  function targetAt(edges) {
    let target=null;
    for(const edge of edges){
      if(edge?.id===undefined||edge.id===null)continue;
      const deck=clearance(edge);
      if(deck!==null){
        const candidate={edge,deck};
        if(!target||older(candidate,target)<0)target=candidate;
      }
    }
    return target;
  }
  function status(city){
    const month=Number.isSafeInteger(city?.month)&&city.month>=1?city.month:1;
    const mod=month%PERIOD;
    const ordinary={phase:'normal',name:'汛情平稳',detail:'汛期每 15 个月可能封闭一座较低的跨河桥。高桥（跨河段至少 +24 m）和隧道可作长期备用。',closed:[]};
    const forecast=mod>=PERIOD-FORECAST,active=month>=PERIOD&&mod<DURATION,recovery=month>=PERIOD&&mod===DURATION;
    if(!(forecast||active||recovery))return ordinary;
    const edges=Array.isArray(city?.network?.edges)?city.network.edges:[];
    const candidate=targetAt(edges);
    if(!candidate)return {...ordinary,phase:forecast?'forecast':recovery?'recovery':'normal',name:forecast?'汛期预报':recovery?'汛期结束':'水位上涨，无低桥受影响',
      detail:'路网没有需要封闭的低桥。高桥和隧道照常开放。',startsIn:forecast?PERIOD-mod:undefined};
    const target=candidate.edge.id;
    if(forecast){
      const startsIn=PERIOD-mod;
      return {phase:'forecast',name:'汛期预报 · 低桥将封闭',detail:'还有 '+startsIn+' 个月。低桥 '+target+' 预计停用两个月；提前建设高桥或隧道，也可在居住区同岸补岗位。',closed:[],target,startsIn};
    }
    if(active){
      const monthsLeft=DURATION-mod;
      return {phase:'active',name:'河水上涨 · 低桥停用',detail:'低桥 '+target+' 还有 '+monthsLeft+' 个月恢复，不能驾车、步行或搭公交通过。请用其他跨河通道，或把岗位布置在居民同岸。',closed:[target],target,monthsLeft};
    }
    return {phase:'recovery',name:'汛期结束 · 道路恢复',detail:'低桥重新开放，跨河通勤和公交按当前路网恢复运营。',closed:[],target};
  }
  return {status};
});
