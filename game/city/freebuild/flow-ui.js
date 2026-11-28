/* Traffic Lab uses the simulation engine without spending money or changing the live city. */
(function(root){
'use strict';
const Study=root.FlowStudy, $=x=>document.getElementById(x), round=Math.round;
const fmt=new Intl.NumberFormat('zh-CN');
function attach({onOpen}={}){
 const dialog=$('flow-lab'), canvas=$('flow-canvas'), ctx=canvas.getContext('2d');
 let runner=null,key='high',ew=33,parking=false,simTime=0,last=0,frame=0,playing=true,values=Object.create(null),schedule=0;
 function setting(chosen){
  if(chosen==='custom')return {mode:'high',ew:ew/100,park:parking,lot:parking&&$('flow-preset').dataset.lot==='true'};
  return Study.pick(chosen);
 }
 function spawn(chosen){
  const {network,descriptors,settings}=Study.corridor(setting(chosen));
  return {network,sim:Traffic.create(network,descriptors,settings)};
 }
 function select(chosen){
  key=chosen;
  if(key!=='custom'){
   const picked=Study.pick(key);ew=round(picked.ew*100);parking=Boolean(picked.park);
   $('flow-preset').dataset.lot=String(Boolean(picked.lot));
  }
  $('flow-preset').value=key;$('flow-ew').value=ew;
  $('flow-ew-value').textContent=ew+'%';
  runner=spawn(key);runner.sim.step(.16);simTime=0;
  $('flow-overview').textContent=parking?'停车实验保持需求及初始配时相同。蓝线代表车在目的地等车位，满位之后会往上游排。':key==='low'?'住宅通勤入口以低峰流量放行，比较支路仍保持原需求。':'住宅通勤入口以高峰流量放行，支路保持相同需求。查看短连接段队列是否倒灌。';
  draw();audit();
 }
 function audit(){
  const baseline=parking?'parkingBase':key==='low'?'low':'high', before=values[baseline]??=(Study.measure(spawn(baseline).sim));
  const cache=key==='custom'?'custom-'+ew+'-'+parking+'-'+$('flow-preset').dataset.lot:key;
  const after=values[cache]??=(Study.measure(spawn(key).sim));
  const names=ids=>ids.map(id=>Study.observations[id]||id).join('、')||'无';
  const rows=[
   ['到达需求',before.offered,after.offered],['完成驶出',before.completed,after.completed],
   ['主路通过',before.flow['主路']||0,after.flow['主路']||0],
   ['支路通过',before.flow['支路']||0,after.flow['支路']||0],
   ['总等候（车·秒）',before.delay,after.delay],
   ['回堵至上游',names(before.spill),names(after.spill)],
   ['出口最大队列',before.peaks.out||0,after.peaks.out||0],
   ['支路入口最大队列',before.peaks.sideIn||0,after.peaks.sideIn||0]
  ];
  if(after.parking&&before.parking)rows.push(
   ['终点停车位',before.parking.localCapacity,after.parking.localCapacity],
   ['成功停车',before.parking.parked,after.parking.parked],
   ['停车等候（车·秒）',before.parking.waiting,after.parking.waiting]);
  $('flow-score').innerHTML='<caption>相同需求对比 · 先预热 50 秒，再计 140 秒</caption><thead><tr><th scope="col">指标</th><th scope="col">'+(baseline==='low'?'低峰':parking?'仅路侧位':'原配时')+'</th><th scope="col">当前方案</th></tr></thead><tbody>'+rows.map(([name,a,b])=>'<tr><th scope="row">'+name+'</th><td>'+ (typeof a==='number'?fmt.format(a):a)+'</td><td>'+(typeof b==='number'?fmt.format(b):b)+'</td></tr>').join('')+'</tbody>';
  const benefit=before.delay-after.delay;
  let note=baseline==='low'?'低峰用来建立基线，切到高峰观察短连接段的回堵。':key==='high'?'高峰道路与低峰相同；上游回堵来自下游没有足够的物理空间。试着增加主路绿灯配额。':benefit>0?'相比原配时少等 '+fmt.format(benefit)+' 车·秒，还需检查支路与出口有没有变差。':'总等待未改善。红灯的时间重新分配并不会消除总需求。';
  if((after.flow['支路']||0)<(before.flow['支路']||0))note+=' 支路通过量下降，不能只看主路。';
  if(parking)note='只有抵达同一节点的汽车才可使用该处车位；车位离开后重新开放，不会把车辆挪到别的道路节点。';
  $('flow-verdict').textContent=note;
  $('flow-quick').textContent=parking?'终点容量 '+before.parking.localCapacity+' → '+after.parking.localCapacity+' 位 · 停车 '+before.parking.parked+' → '+after.parking.parked+' 辆':baseline==='low'?'低峰驶出 '+after.completed+' 辆 · '+names(after.spill)+'回堵':
   '同需求：驶出 '+before.completed+' → '+after.completed+' 辆 · 支路 '+(before.flow['支路']||0)+' → '+(after.flow['支路']||0)+' 辆';
 }
 function line(x,y,a,b,color,width){
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
 }
 function draw(){
  if(!runner)return;
  const b=canvas.getBoundingClientRect(), d=Math.min(2,window.devicePixelRatio||1);
  if(b.width<1)return;
  const w=round(b.width*d),h=round(b.height*d);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.setTransform(w/480,0,0,h/310,0,0);
  ctx.fillStyle='#171f2a';ctx.fillRect(0,0,480,310);
  const s=runner.sim.stats();
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const e of runner.network.edges){
    const [a,b]=e.pts;
    line(a.x,a.y,b.x,b.y,'#2e4658',17);line(a.x,a.y,b.x,b.y,'#526878',12);
    const stats=s.directions[e.id]?.[0],ratio=Math.min(1,(stats?.tail||0)/e.len);
    if(stats?.queued){
      line(b.x,b.y,b.x+(a.x-b.x)*ratio,b.y+(a.y-b.y)*ratio,stats.spill?'#e296ff':stats.causes?.parking?'#76c9f0':'#f8b364',10);
      if(stats.spill){ctx.fillStyle='#e296ff';ctx.fillRect(a.x-4,a.y-4,8,8);}
    }
  }
  for(const a of runner.sim.agents()){
    ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.heading??a.angle??0);
    ctx.fillStyle=a.queued?'#ff7267':'#ccfbdf';ctx.fillRect(-4,-2,8,4);ctx.restore();
  }
  const phase=runner.sim.signals()[0]?.phase||'none';
  for(const [x,y,c] of [[263,152,phase==='east-west'?'#81ffc1':'#f4747c'],[292,154,phase==='north-south'?'#81ffc1':'#f4747c']]){
    ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();
  }
  const label=(text,x,y,bold=false)=>{ctx.font=(bold?'600 ':'')+'12px system-ui,sans-serif';ctx.fillStyle='#dfedf1';ctx.fillText(text,x,y);};
  label('住宅入口',42,145,true);label('短连接段',220,194);label('主路出口',375,145,true);
  label('支路入口',293,51,true);label('支路出口',293,277);label('上游路口',144,194);
  if(s.parking){
   const local=Object.values(s.parking.sites).filter(x=>x.node==='e'),capacity=local.reduce((n,x)=>n+x.capacity,0),occupied=local.reduce((n,x)=>n+x.occupied,0);
   ctx.fillStyle=occupied>=capacity?'#b66a71':'#4782a7';ctx.fillRect(385,183,66,22);
   label('P '+occupied+'/'+capacity,392,198,true);
  }
  $('flow-live').textContent='第 '+Math.floor(simTime)+' 秒 · 路上 '+s.vehicles+' 辆 · 等候放行 '+s.queued+' 辆 · 入口候车 '+s.backlog+' 辆 · 回堵 '+s.spillback+' 处';
 }
 function animate(now){
  if(!dialog.open){frame=0;last=0;return;}
  const delta=last?Math.min(.10,(now-last)/1000):0;last=now;
  // Playback starts 2× for an obvious effect, can freeze or skip ahead.
  if(playing&&runner){simTime+=delta*2;runner.sim.step(delta*2);}
  // Paint at 20 FPS in the lab; the city background is paused.
  if(playing&&now>=schedule){schedule=now+50;draw();}
  frame=requestAnimationFrame(animate);
 }
 const open=()=>{
  if(dialog.open)return;
  onOpen?.();dialog.showModal();playing=!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  $('flow-play').textContent=playing?'暂停回放':'播放回放';
  select('high');if(!frame)frame=requestAnimationFrame(animate);
 };
 $('flow-lab-open').onclick=open;
 $('flow-close').onclick=()=>dialog.close();
 $('flow-preset').onchange=e=>select(e.target.value);
 $('flow-ew').oninput=e=>{$('flow-ew-value').textContent=e.target.value+'%';};
 $('flow-ew').onchange=e=>{ew=+e.target.value;select('custom');};
 $('flow-replay').onclick=()=>select(key);
 $('flow-play').onclick=()=>{playing=!playing;$('flow-play').textContent=playing?'暂停回放':'播放回放';};
 $('flow-skip').onclick=()=>{if(runner){for(let i=0;i<30;i++)runner.sim.step(1);simTime+=30;draw();}};
 dialog.addEventListener('close',()=>{if(frame)cancelAnimationFrame(frame);frame=0;last=0;});
 return {open,select};
}
root.FlowUI={attach};
})(globalThis);
