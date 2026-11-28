'use strict';
(() => {
  const S = window.CitySim, {TOOLS,ZONES,FACILITIES,GOALS,index,xy,water} = S;
  const id = key => document.getElementById(key);
  const icons = {
    logo:'M2 17c4-5 7 4 11-1s6-3 9-5M6 12V7l4-2v6m3 1V4l4 1v6m3-1V7',
    cash:'M3 7h18v11H3z M7 7V5h10v2m-8 5h6m-3-2v5',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-4a4 4 0 0 1 0 8',
    case:'M3 8h18v12H3z M8 8V4h8v4m-13 5h18m-11 0v2h4v-2',smile:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM8 14c2 3 6 3 8 0m-7-5h.01m6 0h.01',save:'M4 3h13l3 3v15H4zM8 3v6h8V3m1 18v-8H7v8',menu:'M4 6h16M4 12h16M4 18h16',pin:'M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Zm-4 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',flag:'M5 22V3c4-4 9 4 15 0v11c-6 4-11-4-15 0',chevron:'m6 9 6 6 6-6',chart:'M4 20V4m0 16h17M9 16v-5m5 5V8m5 8V5',
    layers:'m12 2 10 6-10 6L2 8Zm-10 10 10 6 10-6M2 16l10 6 10-6',plus:'M12 5v14M5 12h14',minus:'M5 12h14',fit:'M9 4H4v5m11-5h5v5m0 6v5h-5m-11-5v5h5m3-11v6m-3-3h6',pause:'M9 5v14M15 5v14',play:'m8 5 12 7-12 7z',help:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM9 8c0-3 6-3 6 0 0 2-3 2-3 5m0 4h.01',close:'m6 6 12 12M18 6 6 18',cursor:'m4 3 14 11-6 1-3 6z',hand:'M6 12V8a1.4 1.4 0 0 1 3 0v3-6a1.4 1.4 0 0 1 3 0v6-5a1.4 1.4 0 0 1 3 0v5-3a1.4 1.4 0 0 1 3 0v7c0 4-2 6-6 6h-2c-2 0-3-2-4-4l-2-3c-1-2 1-3 2-2l2 2',road:'m7 3-4 18m14-18 4 18M12 3v3m0 4v4m0 4v3',bridge:'M2 15h20M5 21V7m14 14V7M2 11c4 0 4 4 10 4s6-4 10-4m-10 4v5',home:'m2 10 10-8 10 8M5 9v12h14V9m-9 12v-7h4v7',shop:'M3 9h18l-2-6H5z M4 9v11h16V9m-10 11v-6h4v6m-8-8c2 0 3-1 3-3m5 0c0 2 1 3 3 3',office:'M6 21V3h12v18M3 21h18M10 7h.01M14 7h.01M10 11h.01M14 11h.01M10 15h.01M14 15h.01M11 21v-3h2v3',factory:'M3 21V10l6 4v-4l6 4 1-10h4l1 17zm4-3h.01m5 0h.01m5 0h.01',service:'M4 7h16v14H4zm4 0V4h8v3m-4 3v8m-4-4h8',remove:'M3 7h18m-2 0-1 13H6L5 7m4 0V4h6v3m-5 4v5m4-5v5',bolt:'m13 2-8 12h6l-1 8 8-12h-6z',drop:'M12 2c3 5 7 9 7 13a7 7 0 0 1-14 0c0-4 4-8 7-13zm-3 14a3 3 0 0 0 3 3',school:'m2 9 10-6 10 6-10 6zm4 3v6c3 3 9 3 12 0v-6m4-3v7',cross:'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',tree:'m12 2 5 7h-2l5 7H4l5-7H7zm0 14v5m-4 0h8',bus:'M5 4h14l2 4v11H3V8zm-2 8h18m-15 4h1m10 0h1M6 19v2m12-2v2',
  };
  const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[key] || icons.help}"/></svg>`;
  for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML=icon(el.dataset.icon);
  const fmt = new Intl.NumberFormat('zh-CN');
  const cash = n => `${n < 0 ? '−' : ''}¥${fmt.format(Math.abs(Math.round(n)))}`;
  const signed = n => n > 0 ? `+${cash(n)}` : cash(n);
  const KEY = 'city.ancheng.v3', LEGACY_KEY = 'city.ancheng.v1';
  const canvas = id('map'), shell = id('map-shell'), dialog = id('dialog'), instruction = id('instruction');
  let slot = 'main', state = load('main') || S.blank(), metrics = S.analyze(state), tool = 'road', layer = 'none';
  let speed = 1, running = true, timer = 0, anchor = -1, cursor = -1, drag = null, vertical = false;
  const map = window.CityMap(canvas, u => { const span = id('scale'), cells = u>=7?8:16; span.style.width=`${Math.round(u*cells)}px`; span.textContent=cells===8?'1 km':'2 km'; });
  function loadCurrent(key) { try { return S.unpack(JSON.parse(localStorage.getItem(`${KEY}.${key}`))); } catch { return null; } }
  function load(key) {
    const current=loadCurrent(key);if(current)return current;
    const oldSlot=key==='port'?'revival':key==='river'?'green':key;
    try{return S.unpack(JSON.parse(localStorage.getItem(LEGACY_KEY+'.'+oldSlot)));}catch{return null;}
  }
  function store(notify = false) {
    try { localStorage.setItem(`${KEY}.${slot}`,JSON.stringify(S.pack(state))); if (notify) toast('城市进度已保存。'); }
    catch { if (notify) toast('浏览器无法写入存档。',true); }
  }
  function toast(text,bad=false) {
    const el = document.createElement('div'); el.className=`toast${bad?' bad':''}`; el.textContent=text;
    id('toasts').append(el);
    while (id('toasts').children.length>3) id('toasts').firstElementChild.remove();
    setTimeout(()=>el.remove(),4300);
  }
  const layerNames = { none:['综合地图','#a7e4c4'], zoning:['分区','#b6a1eb'], power:['供电','#f6ca79'], water:['供水','#78d5f2'], traffic:['道路负荷','#ff876b'],transit:['公交与渡轮','#76e3d3'],land:['地价与密度','#d4b6ff'],risk:['雨季风险','#8ccaff'],pollution:['工业污染','#ffac80'] };
  const keys = {inspect:'1',road:'2',bridge:'3',residential:'4',commercial:'5',office:'6',industrial:'7',services:'8',bulldoze:'9',pan:'M',avenue:'A',busline:'U',ferry:'F'};
  const groups = [['inspect','pan'],['road','bridge','avenue'],['residential','commercial','office','industrial'],['services','bulldoze'],['busline','ferry']];
  const toolButton = key => {
    const v = TOOLS[key] || { name:'设施', icon:'service' };
    const color = v.zone ? ZONES[v.zone].color : v.color || '#b0c9c1';
    return `<button type="button" class="tool" data-tool="${key}" title="${v.name} (${keys[key]})" aria-label="${v.name}" aria-pressed="false" style="--tool-color:${color}">${icon(v.icon)}<span>${v.zone?ZONES[v.zone].name:v.name.replace('地图','').replace('地块','')}</span></button>`;
  };
  id('toolbar').innerHTML = groups.map(keys => `<div class="tool-group">${keys.map(key => key === 'services' ? `<div class="service-wrap">${toolButton(key)}<div id="services" class="card service-menu" hidden><div class="section-label">公共设施</div>${Object.entries(FACILITIES).map(([k,v])=>`<button type="button" data-tool="${k}" style="--service-color:${v.color}">${icon(v.icon)}<span>${v.name}</span><span>${cash(v.cost)}</span></button>`).join('')}</div></div>` : toolButton(key)).join('')}</div>`).join('');
  id('layers').innerHTML = Object.entries(layerNames).map(([key,[name,color]])=>`<button type="button" data-layer="${key}" style="--color:${color}"><i></i>${name}</button>`).join('');
  id('demand').innerHTML = ZONES.slice(1).map((z,i)=>`<div class="demand-row"><span>${z.name}</span><div class="track" aria-hidden="true"><i style="--color:${z.color}"></i></div><output id="demand-${i+1}" aria-label="${z.name}需求"></output></div>`).join('');
  function dismissMenus() { id('services').hidden=true; id('layers').hidden=true; id('layer').setAttribute('aria-expanded','false'); }
  function choose(key) {
    if (key==='services') { const open=id('services').hidden; dismissMenus(); id('services').hidden=!open; return; }
    if (!Object.hasOwn(TOOLS,key)) return;
    tool=key; anchor=-1; drag=null;
    dismissMenus(); setButtons(); updatePointer();
  }
  function setButtons() {
    for(const button of id('toolbar').querySelectorAll('button[data-tool]')) {
      const on=button.dataset.tool===tool || button.dataset.tool==='services' && Object.hasOwn(FACILITIES,tool);
      button.classList.toggle('on',on); button.setAttribute('aria-pressed',String(on));
    }
    shell.dataset.pan=String(tool==='pan');
    for(const button of id('layers').querySelectorAll('button[data-layer]'))button.classList.toggle('on',button.dataset.layer===layer);
  }
  function updateGoals() {
    const active = GOALS.find(g=>!state.awards.includes(g.id));
    const dots = `<div class="goal-dots" aria-hidden="true">${GOALS.map(g=>`<i class="${state.awards.includes(g.id)?'complete':g===active?'current':''}"></i>`).join('')}</div>`;
    if (!active) { id('goal-content').innerHTML=`<div class="goal-top"><b>全部目标已完成</b></div><p>继续扩建，或试着让两岸居民都能便捷通勤。</p>${dots}`; return; }
    const n = Math.min(active.goal,active.measure(metrics)), money=active.id==='balance';
    id('goal-content').innerHTML=`<div class="goal-top"><b>${active.title}</b><span class="goal-reward">+${cash(active.reward)}</span></div><p>${active.detail}</p><div class="track goal-track"><i style="width:${Math.round(n/active.goal*100)}%"></i></div><div class="goal-count"><span>${money?cash(n):fmt.format(n)} / ${money?cash(active.goal):fmt.format(active.goal)}</span><span>${state.awards.length}/${GOALS.length}</span></div>${dots}${slot==='main'&&!metrics.roads?'<button type="button" class="small-link goal-demo" data-demo>看示例城</button>':''}`;
  }
  id('goal-content').addEventListener('click',e=>{if(e.target.closest('[data-demo]'))switchCity('demo');});
  function collect() {
    for (const goal of GOALS) if (!state.awards.includes(goal.id) && goal.measure(metrics)>=goal.goal) {
      state.awards.push(goal.id); state.cash+=goal.reward; toast(`${goal.title} · 拨款 ${cash(goal.reward)}`);
    }
  }
  function update() {
    id('cash').textContent=cash(state.cash);id('cash').classList.toggle('negative',state.cash<0);
    id('population').textContent=fmt.format(metrics.pop);id('jobs').textContent=fmt.format(metrics.jobs);
    id('happiness').textContent=metrics.pop ? `${metrics.happiness}%` : '—';
    const balance=id('balance'); balance.textContent=signed(metrics.net); balance.className=metrics.net>=0?'positive':'negative';
    id('date').textContent=`第 ${Math.floor(state.clock/12)+1} 年 · ${state.clock%12+1} 月`;
    for (let i=1;i<=4;i++) { const n=id(`demand-${i}`);n.textContent=metrics.demand[i];n.previousElementSibling.firstElementChild.style.width=`${metrics.demand[i]}%`; }
    const mode=S.MODES[state.mode], objective=id('scenario-progress');
    if(state.mode==='storm')id('date').textContent=state.clock?'防汛第 '+state.clock+' 月':'防汛准备期';
    id('mode-label').textContent='一河两岸 · '+(slot==='demo'?'示例城':mode.name);
    objective.hidden=!mode.months||slot==='demo';
    if(!objective.hidden){
      const status=state.result==='won'?'挑战完成'+(state.resultMonth?' · 第 '+state.resultMonth+' 月':'')+' · 拨款 ¥25,000':state.result==='late'?'已到期 · 可继续经营':'剩余 '+Math.max(0,mode.months-state.clock)+' 月';
      objective.innerHTML='<strong>'+status+'</strong>'+S.scenarioCheck(state.mode,metrics).map(([label,value,goal,cap])=>'<span>'+label+' '+fmt.format(value)+(cap?' ≤ ':' / ')+fmt.format(goal)+'</span>').join('');
    }
    if(!objective.hidden&&state.mode==='storm')objective.insertAdjacentHTML('beforeend','<button type="button" class="small-link" data-emergency>防汛预案</button>');
    id('city-pulse').textContent=metrics.rain?(metrics.rain.phase.label+' · 东岸缺勤 '+Math.round(metrics.rain.missed[1])+' · 缺货 '+Math.round(metrics.rain.shortage[1])):metrics.event.name==='常态经营'?'跨河车流 '+metrics.crossTraffic+' · 公交 '+Math.round(metrics.ridership*100)+'%'+(metrics.pendingProjects?' · 在建 '+metrics.pendingProjects+' 格':''):metrics.event.name;
    const legends={risk:'橙色：易限流桥段　青色：高位或已加固',traffic:'蓝绿：畅通　黄：繁忙　红：拥堵',transit:'青色：公交　蓝色虚线：渡轮',land:'紫色越亮，地价越高',pollution:'橙色越亮，污染越强',power:'黄色：供电',water:'蓝色：供水'};
    id('legend').textContent=legends[layer]||'';id('legend').hidden=!legends[layer];
    updateGoals();
    map.setScene(state,metrics,layer);
    updatePointer();
  }
  function nextMonth() {
    const before = state.cash, previous=state.result, event=metrics.event.name;
    metrics = S.tick(state,metrics);
    if(metrics.rain&&state.clock>=5&&[5,7,10,11].includes(state.clock))toast('防汛公告：'+metrics.rain.phase.label,metrics.rain.phase.id==='severe');
    if(previous!==state.result)toast(state.result==='won'?'挑战完成，获得 ¥25,000！':'挑战已到期，你可以继续建城。',state.result==='late');
    if(event!==metrics.event.name&&metrics.event.name!=='常态经营')toast('城市动态：'+metrics.event.name);
    collect();
    if (before>=0 && state.cash<0) toast('市库告急。可以暂停、减少高维护设施或增加税源。',true);
    update(); store();
  }
  function syncTime() {
    clearInterval(timer);
    if (running) timer=setInterval(() => { if (!document.hidden && !dialog.open) nextMonth(); }, 4400 / speed);
    const button=id('pause');button.innerHTML=icon(running?'pause':'play');button.setAttribute('aria-label',running?'暂停':'继续');button.title=running?'暂停（空格）':'继续（空格）';
    for(const b of document.querySelectorAll('[data-speed]')) {const on=running&&+b.dataset.speed===speed;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));}
  }
  function quoteAt() {
    if (cursor<0 || tool==='inspect' || tool==='pan' || drag?.pan) return null;
    const start = drag?.start ?? (anchor>=0 ? anchor : cursor);
    if (['bridge','busline','ferry'].includes(tool) && start===cursor) return null;
    return S.quote(state,tool,start,cursor,vertical);
  }
  function updatePointer() {
    const q=quoteAt();
    map.setPointer(cursor,q,drag?.start ?? anchor);
    const v=TOOLS[tool];
    const message=anchor>=0 && !q?.message ? '选择终点完成施工。' : v.hint;
    let extra = '';
    if(q?.message) extra=`<span class="price warning">${q.message}</span>`;
    else if(q?.cost)extra=`<span class="price">${q.cells.length} 格 · ${cash(q.cost)}</span>`;
    else if(v.cost)extra=`<span class="price">${typeof v.cost==='number'?cash(v.cost):v.cost}</span>`;
    const banner=`<b>${v.name}</b>${message}${extra}`;
    if(instruction.innerHTML!==banner)instruction.innerHTML=banner;
  }
  function commit(start,end) {
    const q=S.quote(state,tool,start,end,vertical);
    if(!S.build(state,q)){if(q.message)toast(q.message,true);return false;}
    metrics=S.analyze(state);collect();update();store();return true;
  }
  const stretch = () => ['road','bridge','avenue','busline','ferry'].includes(tool)||!!TOOLS[tool].zone;
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if (drag || (e.button!==0&&e.button!==1&&e.button!==2)) return;
    const [x,y]=map.point(e),start=map.cell(e),pan=tool==='pan'||e.button!==0;
    if(!pan&&start<0)return;
    dismissMenus(); canvas.setPointerCapture(e.pointerId);
    drag={pointer:e.pointerId,start,pan,x,y,ox:x,oy:y,moved:false};
    shell.dataset.drag=String(pan); cursor=start; vertical=e.shiftKey; updatePointer();
  });
  canvas.addEventListener('pointermove',e=>{
    cursor=map.cell(e);vertical=e.shiftKey;
    if(drag?.pointer===e.pointerId){
      const [x,y]=map.point(e);
      if (Math.hypot(x-drag.ox,y-drag.oy)>4) drag.moved=true;
      if(drag.pan){map.pan(x-drag.x,y-drag.y);drag.x=x;drag.y=y;cursor=-1;}
      else if(anchor>=0)drag.start=anchor;
    }
    updatePointer();
  });
  function finish(e,cancelled) {
    if(drag?.pointer!==e.pointerId)return;
    const d=drag;
    drag=null; shell.dataset.drag='false';cursor=cancelled?-1:map.cell(e);
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(cancelled||d.pan||cursor<0){updatePointer();return;}
    const start=anchor>=0?anchor:d.start;
    if(tool==='inspect')inspect(cursor);
    else if(stretch() && !d.moved && anchor<0 && ['road','bridge','avenue','busline','ferry'].includes(tool)) anchor=cursor;
    else {
      const ok=commit(stretch()?start:cursor,cursor);
      if(ok||anchor<0)anchor=-1;
    }
    updatePointer();
  }
  canvas.addEventListener('pointerup',e=>finish(e,false));
  canvas.addEventListener('pointercancel',e=>finish(e,true));
  canvas.addEventListener('pointerleave',()=>{if(!drag){cursor=-1;updatePointer();}});
  canvas.addEventListener('wheel',e=>{e.preventDefault();map.zoom(e.deltaY>0?1/1.18:1.18,...map.point(e));cursor=map.cell(e);updatePointer();},{passive:false});
  id('toolbar').addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(b)choose(b.dataset.tool);});
  id('layer').onclick=()=>{const open=id('layers').hidden;dismissMenus();id('layers').hidden=!open;id('layer').setAttribute('aria-expanded',String(open));};
  id('layers').addEventListener('click',e=>{const b=e.target.closest('[data-layer]');if(b){layer=b.dataset.layer;dismissMenus();setButtons();update();}});
  id('zoom-in').onclick=()=>map.zoom(1.3);id('zoom-out').onclick=()=>map.zoom(1/1.3);id('recenter').onclick=map.clearView;
  id('save').onclick=()=>store(true);id('pause').onclick=()=>{running=!running;syncTime();};
  for(const b of document.querySelectorAll('[data-speed]')) b.onclick=()=>{speed=+b.dataset.speed;running=true;syncTime();};
  for(const [button,content,label] of [['goals-toggle','goal-content','建设目标'],['market-toggle','market-content','城市概况']]) {
    id(button).onclick=()=>{const p=id(content);p.hidden=!p.hidden;id(button).setAttribute('aria-expanded',String(!p.hidden));id(button).setAttribute('aria-label',`${p.hidden?'展开':'收起'}${label}`);};
  }
  if (matchMedia('(max-width: 670px)').matches) id('market-toggle').click();
  function openDialog(title,content,buttons=[]) {
    dismissMenus();
    id('dialog-body').innerHTML=`<div class="dialog-head"><h2>${title}</h2><button class="square" aria-label="关闭" data-close>${icon('close')}</button></div><div class="dialog-content">${content}</div>${buttons.length?'<div class="dialog-actions"></div>':''}`;
    id('dialog-body').querySelector('[data-close]').onclick=()=>dialog.close();
    const row=id('dialog-body').querySelector('.dialog-actions');
    for(const [label,action,cls] of buttons){const button=document.createElement('button');button.textContent=label;button.className=cls||'';button.onclick=action;row.append(button);}
    if(!dialog.open)dialog.showModal();
  }
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  function showHelp() {
    openDialog('怎么开第一座城',`<ol><li>从地图西侧金色入口向内画道路。</li><li>选择「设施」，在道路旁分别建变电站和供水站。</li><li>在路边拖出一片住宅和一片商业，留些距离再划工业区。</li><li>等几个月看居民和岗位增长，再根据财政补建学校、公园或公交站场。用 A 升级主干道；用 U 或 F 选两个端点开公交或渡轮。</li><li>到「经营」看车流和商铺供货；政策可先预估下个月再应用。</li></ol><p>工具栏 1–9 切换工具。绘路时按 Shift 换转弯方向，Esc 取消。右键拖动或选「移动」可平移。</p>`,[['回到地图',()=>dialog.close()],['看示例城',()=>switchCity('demo'),'secondary']]);
  }
  function showAccounts(){
    const m=metrics,last=state.record.at(-1);
    const rows=[['税收',cash(m.income)],['支出',cash(m.expense)],['月度结余',signed(m.net)],['现有债务 / 月息',cash(state.debt)+' / '+cash(m.interest)],['跨河车流',fmt.format(m.crossTraffic)],['交通压力',m.traffic+'%'],['公交分担率',Math.round(m.ridership*100)+'%'],['本地供货',Math.round(m.local*100)+'%'],['外购成本',cash(m.imports)],['水电供给系数',Math.round(m.utility*100)+'%'],['施工中的用地',fmt.format(m.pendingProjects)+' 格'],['货运超载暴露',Math.round(m.freightExposure*100)+'%']];
    if(last)rows.push(['较上月交通压力',(m.traffic-last.traffic>0?'+':'')+(m.traffic-last.traffic)+' 个百分点']);
    const field=(k,title)=>'<label>'+title+'<span><input required type="number" name="'+k+'" min="'+S.rules[k][0]+'" max="'+S.rules[k][1]+'" value="'+state.rules[k]+'"> %</span></label>';
    const controls='<form id="policy-form" class="policy-form">'+field('tax','税率')+field('service','市政服务预算')+field('transit','公交运营预算')+'<label><span>集中配送（每月 ¥180）</span><input name="consolidate" type="checkbox" '+(state.rules.consolidate?'checked':'')+'></label><div><button type="button" id="policy-preview">预估下个月</button> <button type="submit">应用政策</button></div><p id="policy-result" aria-live="polite"></p></form>';
    const buttons=[['借款 ¥20,000',()=>change({type:'loan',amount:20000}),'secondary'],['还款 ¥20,000',()=>change({type:'loan',amount:-20000}),'secondary'],['管理线路',showLines,'secondary'],['推进一个月',()=>{nextMonth();showAccounts();},'secondary'],['经营复盘',showReview,'secondary']];
    if(m.worst>=0)buttons.push(['找最堵路段',()=>{dialog.close();layer='traffic';setButtons();map.focus(m.worst);update();},'secondary']);
    openDialog('市长办公桌','<dl>'+rows.map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join('')+'</dl><p>税收、覆盖与客流彼此影响。先预估，再决定是否应用。</p>'+controls,buttons);
    const form=id('policy-form');
    const proposed=()=>{const f=new FormData(form);return {type:'policy',value:{tax:+f.get('tax'),service:+f.get('service'),transit:+f.get('transit'),consolidate:f.has('consolidate')}};};
    id('policy-preview').onclick=()=>{if(!form.reportValidity())return;const b=S.forecast(state),n=S.forecast(state,proposed());id('policy-result').textContent='预估月结 '+signed(n.net)+'（相对现行 '+signed(n.net-b.net)+'）；跨河车流 '+n.cross+'（原 '+b.cross+'）';};
    form.onsubmit=e=>{e.preventDefault();change(proposed());};
  }
  function change(c){
    if(!S.transact(state,c)){toast('操作不可用：检查市库余额或借款上限。',true);return;}
    metrics=S.analyze(state);update();store();
    if(c.type==='remove-line')showLines();else showAccounts();
  }
  function showLines(){
    const items=metrics.lines.map((l,i)=>'<li><div><b>'+(l.type==='bus'?'公交':'渡轮')+' '+(i+1)+'</b>：'+(l.reason||Math.round(l.served)+' / '+Math.round(l.max)+' 人次')+'</div><button type="button" data-remove-line="'+i+'">停运</button></li>');
    openDialog('公交与渡轮',items.length?'<ul class="line-list">'+items.join('')+'</ul>':'<p>还没有自建线路。工具栏选择公交或渡轮，再选两个端点。</p>',[['回到市长办公桌',showAccounts,'secondary']]);
    for(const b of id('dialog-body').querySelectorAll('[data-remove-line]'))b.onclick=()=>change({type:'remove-line',index:+b.dataset.removeLine});
  }
  function showReview(){
    const history=state.record.slice(-24),current=history.at(-1),base=history[0];
    const labels=[['人口','pop'],['结余','net'],['跨河车流','cross'],['公交分担 %','transit'],['货运超载暴露 %','freight']];
    const head=state.result==='won'?'已完成挑战'+(state.resultMonth?'（第 '+state.resultMonth+' 月）':''):'对照首条和最后一条月报';
    const scope='<p>'+head+'。货运超载暴露是行经超载路段的货运载荷占比，不是实际等待时长。</p>';
    const value=(obj,key)=>Number.isFinite(obj?.[key])?(key==='net'?signed(obj[key]):fmt.format(obj[key])):'—';
    const content=!current?'<p>还没有月结。推进一个月后再回来。</p>':'<table class="review-table"><thead><tr><th scope="col">指标</th><th scope="col">第 '+base.clock+' 月</th><th scope="col">第 '+current.clock+' 月</th></tr></thead><tbody>'+labels.map(([label,k])=>'<tr><th scope="row">'+label+'</th><td>'+value(base,k)+'</td><td>'+value(current,k)+'</td></tr>').join('')+'</tbody></table>';
    openDialog('经营复盘',scope+content,[['回到市长办公桌',showAccounts,'secondary']]);
  }
  const archives=['main','port','river','storm','demo'];
  function downloadCity(){
    const data={format:'ancheng-city-save',slot,city:S.pack(state)};
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='ancheng-'+slot+'-month-'+state.clock+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1800);
  }
  function installCity(target,imported,restore=false){
    const current=target===slot?state:load(target),key=KEY+'.'+target,backup=KEY+'.rollback.'+target;
    try{
      if(current)localStorage.setItem(backup,JSON.stringify(S.pack(current)));
      localStorage.setItem(key,JSON.stringify(S.pack(imported)));
    }catch{toast('浏览器无法保存备份，未切换城市。',true);return;}
    slot=target;state=imported;metrics=S.analyze(state);
    dialog.close();map.clearView();choose('inspect');update();
    toast(restore?'已恢复上一个版本。':'已导入城市；原存档保存在回滚点。');
  }
  function showArchive(){
    openDialog('存档管理','<p>导出的是本机文件。导入不会直接覆盖存档，确认后会先保留原城市作为回滚点。</p><label>选择存档 JSON<input id="import-city" type="file" accept=".json,application/json"></label><p id="archive-status" aria-live="polite"></p>',[['导出当前城市',downloadCity,'secondary'],['恢复上个存档',restoreCity,'secondary']]);
    id('import-city').onchange=async e=>{
      const file=e.target.files?.[0];if(!file)return;
      const status=id('archive-status');
      if(file.size>5*1024*1024){status.textContent='文件过大，不是可用的城市蓝图存档。';return;}
      let raw,imported;
      try{raw=JSON.parse(await file.text());imported=S.unpack(raw.format==='ancheng-city-save'?raw.city:raw);}catch{}
      if(id('archive-status')!==status)return;
      if(!imported){status.textContent='存档格式不受支持。未改动现有城市。';return;}
      const target=raw.format==='ancheng-city-save'&&archives.includes(raw.slot)?raw.slot:imported.mode==='open'?'main':imported.mode;
      const expected=target==='demo'||target==='main'?'open':target;
      if(imported.mode!==expected){status.textContent='存档与剧本不匹配。未改动现有城市。';return;}
      const label=target==='demo'?'示例城':S.MODES[imported.mode].name;
      openDialog('确认导入存档','<p>要把第 '+imported.clock+' 月的进度导入「'+label+'」吗？原存档会保留一个回滚点。</p>',[['确认导入',()=>installCity(target,imported)],['取消',showArchive,'secondary']]);
    };
  }
  function restoreCity(){
    let old;try{old=S.unpack(JSON.parse(localStorage.getItem(KEY+'.rollback.'+slot)));}catch{}
    if(!old){id('archive-status').textContent='当前剧本没有回滚点。';return;}
    openDialog('恢复上个存档？','<p>当前城市会换回第 '+old.clock+' 月。当前进度会保留在回滚点，可再次恢复。</p>',[['确认恢复',()=>installCity(slot,old,true)],['取消',showArchive,'secondary']]);
  }
  id('scenario-progress').addEventListener('click',e=>{if(e.target.closest('[data-emergency]'))showEmergency();});
  function showEmergency(){
    if(!metrics.rain)return;
    const r=metrics.rain,e=state.storm;
    const go=(action,bank)=>{if(!S.transact(state,{type:'emergency',action,bank})){toast('行动不可用：检查市库、库存和复航进度。',true);return;}metrics=S.analyze(state);update();store();showEmergency();};
    const fmtRound=x=>fmt.format(Math.round(x));
    const labels=[['当前阶段',r.phase.label],['西岸 / 东岸本月未服务通勤',r.missed.map(fmtRound).join(' / ')],['西岸 / 东岸本月物资缺口',r.shortage.map(fmtRound).join(' / ')],['东岸库存',fmtRound(e.stock[1])],['累计未服务通勤 / 缺货',fmtRound(r.cumulativeMissed)+' / '+fmtRound(r.cumulativeShortage)],['恢复进度',r.recovered?'第 '+r.recovered+' 月恢复':'第 11 月起重新评估']];
    const rules='<p><b>第 5–6 月</b>水位上升，备选泊位可保住部分渡轮运力；<b>第 7–9 月</b>强风期间所有渡轮停航，低位桥限流；<b>第 10 月</b>巡检、部分复航；<b>第 11 月</b>起恢复。</p><p>可先加固桥头，或提前在东岸发展本地岗位和工业并储备物资。车流变少不代表居民都到得了：胜负看缺勤、缺货、恢复和市库。</p>';
    const items=[['加固低位桥头 ¥18,500',()=>go('reinforced'),'secondary'],['改用备选泊位 ¥6,800',()=>go('alternate'),'secondary'],['储备东岸物资 ¥7,200',()=>go('stock',1),'secondary'],['看雨季风险图',()=>{dialog.close();layer='risk';setButtons();update();},'secondary']];
    openDialog('防汛预案',rules+'<dl>'+labels.map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join('')+'</dl>',items);
    const buttons=id('dialog-body').querySelectorAll('.dialog-actions button');
    buttons[0].disabled=state.clock>=11||e.reinforced||state.cash<18500;buttons[1].disabled=state.clock>=11||e.alternate||state.cash<6800;
    buttons[2].disabled=state.clock>=11||e.stock[1]>360||state.cash<7200;
    if(e.reinforced)buttons[0].textContent='低位桥头已加固';
    if(e.alternate)buttons[1].textContent='备选泊位已准备';
  }
  function showScenarios(){
    openDialog('选择城市剧本','<p>当前地图「一河两岸」的自由建城与三项限时挑战各自保存。挑战到期不影响继续建设。</p><ul><li>老港复兴：用较少的启动资金，让产业与财政同时站稳。</li><li>一座桥，三种解法：接手一座已建成的双岸城市，找出桥上谁在堵。修路、开渡轮或在对岸创造岗位。</li><li>雨季大考：在强风停航前保护交通或准备东岸本地供给。</li></ul>',Object.entries(S.MODES).map(([key,m])=>[m.name,()=>switchCity(key==='open'?'main':key),'secondary']));
  }
  function demo() {
    const s=S.blank();
    s.cash=205000;
    const Q=(key,x,y,x1=x,y1=y)=>S.build(s,S.quote(s,key,index(x,y),index(x1,y1)));
    Q('road',0,33,43,33);
    for(const x of [9,18,28,37]) Q('road',x,20,x,43);
    Q('road',9,24,37,24);Q('road',9,41,37,41);
    Q('bridge',43,33,55,33);Q('road',55,33,70,33);Q('road',61,28,61,39);
    Q('power',15,32);Q('water',16,34);Q('power',32,32);Q('water',33,34);Q('water',57,34);Q('power',58,32);Q('park',20,34);Q('school',26,33);Q('clinic',28,29);Q('bus',38,32);
    Q('residential',11,25,17,31);Q('residential',19,35,25,40);Q('residential',29,35,35,40);Q('residential',57,35,64,39);
    Q('commercial',19,25,24,31);Q('office',29,25,35,31);Q('industrial',4,35,8,42);Q('commercial',62,30,67,32);
    let a=S.analyze(s);
    for(let i=0;i<13;i++){a=S.tick(s,a);for(const g of GOALS)if(!s.awards.includes(g.id)&&g.measure(a)>=g.goal){s.awards.push(g.id);s.cash+=g.reward;}}
    return s;
  }
  function switchCity(key) {
    store();slot=key;state=load(key)||(key==='demo'?demo():S.startCity(key));metrics=S.analyze(state);
    dialog.close(); map.clearView(); choose(key==='demo'?'inspect':'road');update();store();toast(key==='demo'?'已打开独立示例城。':'已打开 '+S.MODES[state.mode].name+'。');
  }
  function inspect(i) {
    const [x,y]=xy(i), f=FACILITIES[state.facilities[i]], zone=ZONES[state.zone[i]], road=state.road[i];
    const title=f?.name||zone?.name||(road===2?'桥段':road===3?'主干道':road?'道路':water[i]?'水面':'空地');
    const connected=road?metrics.connected[i]>=0:metrics.near[i]>=0;
    openDialog(`${title} · ${x+1}, ${y+1}`,`<dl><dt>外部公路</dt><dd>${connected?'已接入':'未接入'}</dd><dt>供电</dt><dd>${metrics.coverage.power[i]?'已覆盖':'未覆盖'}</dd><dt>供水</dt><dd>${metrics.coverage.water[i]?'已覆盖':'未覆盖'}</dd><dt>公交</dt><dd>${metrics.coverage.bus[i]?'已覆盖':'未覆盖'}</dd><dt>污染</dt><dd>${metrics.pollution[i]>.4?'偏高':'低'}</dd>${road?'<dt>通勤车流 / 货运</dt><dd>'+Math.round(metrics.loads[i])+' / '+Math.round(metrics.freight[i])+'</dd><dt>该段容量利用</dt><dd>'+Math.round(metrics.pressure[i]*100)+'%</dd>':''}${zone?`<dt>${state.zone[i]===1?'入住人数':'岗位数'}</dt><dd>${Math.round(state.use[i])} / ${metrics.cap[i]}</dd><dt>地价指数</dt><dd>${Math.round(metrics.land[i]*100)}/100</dd><dt>当前状态</dt><dd>${metrics.explain[i]}</dd>`:''}${f?`<dt>月维护费</dt><dd>${cash(f.monthly)}</dd>`:''}</dl>${f?`<p>${f.help}</p>`:''}`);
    if(road===2)bridgeBreakdown(i);
  }
  function bridgeBreakdown(i){
    const flows=[...(metrics.bridgeOrigins.get(i)?.values()||[])].sort((a,b)=>b.load-a.load).slice(0,3);
    const el=document.createElement('section');el.className='bridge-breakdown';
    const where=n=>{const [x,y]=xy(n);return (x>=51?'东岸 ':'西岸 ')+(x+1)+','+(y+1);};
    el.innerHTML='<h3>主要通勤流向</h3>'+(flows.length?'<ol>'+flows.map(f=>'<li>'+where(f.from)+' 至 '+where(f.to)+' · '+fmt.format(Math.round(f.load))+'<button type="button" data-map-focus="'+f.to+'">定位终点</button></li>').join('')+'</ol>':'<p>本月没有通过该段的道路通勤。</p>')+'<p>仅列道路通勤，不含货车；上方有货运总量。</p>';
    id('dialog-body').querySelector('.dialog-content').append(el);
    for(const b of el.querySelectorAll('[data-map-focus]'))b.onclick=()=>{dialog.close();map.focus(+b.dataset.mapFocus);};
  }
  id('accounts').onclick=showAccounts;id('info').onclick=showHelp;
  id('menu').onclick=()=>openDialog('城市菜单',`<p>${slot==='demo'?'正在玩示例城，进度单独保存。':'正在规划自己的城市，建设和月结会自动保存。'}</p>`,[[slot==='demo'?'回到我的城市':'打开示例城',()=>switchCity(slot==='demo'?'main':'demo')],['城市剧本',showScenarios,'secondary'],['管理公交与渡轮',showLines,'secondary'],['存档管理',showArchive,'secondary'],['操作指南',showHelp,'secondary'],['重开当前地图',()=>openDialog('重开当前地图？','<p>当前地图的建设与经营进度会清空。</p>',[['确认重开',()=>{state=slot==='demo'?demo():S.startCity(slot);metrics=S.analyze(state);dialog.close();map.clearView();choose('road');update();store();},'danger'],['取消',()=>dialog.close(),'secondary']]),'secondary']]);
  document.addEventListener('keydown',e=>{
    if(dialog.open||e.repeat||e.metaKey||e.ctrlKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
    if(e.code==='Escape'){anchor=-1;drag=null;shell.dataset.drag='false';dismissMenus();updatePointer();return;}
    if(e.code==='Space'&&!/^(BUTTON|A)$/.test(e.target.tagName)){e.preventDefault();running=!running;syncTime();return;}
    if(e.shiftKey){vertical=true;updatePointer();}
    const match=Object.entries(keys).find(([,k])=>k===e.key.toUpperCase());if(match)choose(match[0]);
    if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)){e.preventDefault();map.pan(e.key==='ArrowLeft'?55:e.key==='ArrowRight'?-55:0,e.key==='ArrowUp'?55:e.key==='ArrowDown'?-55:0);}
  });
  document.addEventListener('keyup',e=>{if(e.key==='Shift'){vertical=false;updatePointer();}});
  window.addEventListener('pagehide',()=>store());
  setButtons();update();syncTime();
})();
