(function(root,factory){const v=factory();if(typeof module==='object')module.exports=v;else root.Contracts=v})(globalThis,()=>{
const all=[
 {id:'access',title:'让居民到得了岗',reward:24000,checks:[['常住人口',m=>m.population,650],['通勤可达率',m=>m.access,90,'%']]},
 {id:'bus',title:'公交优先走廊',reward:30000,checks:[['运行线路',m=>m.buses,2],['公交通勤人次',m=>m.busRiders,36]]},
 {id:'safety',title:'安全街区',reward:28000,checks:[['已开发地块',m=>m.developed,90],['消防覆盖',m=>m.fire,55,'%'],['警务覆盖',m=>m.police,55,'%']]}
];
const report=(completed,m)=>all.map(d=>({...d,done:Object.hasOwn(completed||{},d.id),checks:d.checks.map(([name,read,target,unit=''])=>({name,current:Math.max(0,Math.round(read(m)||0)),target,unit}))}));
function settle(city,m){if(!city.contracts)city.contracts={};let paid=[];for(let d of report(city.contracts,m)){if(!d.done&&d.checks.every(v=>v.current>=v.target)){city.contracts[d.id]=city.month;city.network.cash+=d.reward;paid.push({title:d.title,reward:d.reward});}}return paid}
return {report,settle};
});
