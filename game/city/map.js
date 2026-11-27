'use strict';
(() => {
  const S = window.CitySim, {W,H,index,xy,water,ZONES,FACILITIES,GATE} = S;
  const {shapes} = window.CITY_TERRAIN;
  const noise = (x,y,k = 0) => { const n = Math.sin(x * 28.171 + y * 21.327 + k * 7.7103) * 14731.7231; return n - Math.floor(n); };
  const layerColors = {power:'246,194,95',water:'50,172,224',traffic:'94,219,185'};
  function polygon(ctx, points) {
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i],points[i+1]);
    ctx.closePath();
  }
  function newMap(canvas, onScale) {
    const ctx = canvas.getContext('2d'), shell = canvas.parentElement;
    const state = { view: {x:0,y:0,zoom:1}, width:0,height:0,dpr:1, timer:0, scene: null };
    const terrain = document.createElement('canvas'), t = terrain.getContext('2d'), unit = 22;
    terrain.width = W*unit; terrain.height = H*unit;
    terrainArt(t,unit);
    const development = document.createElement('canvas'), dev = development.getContext('2d');
    development.width = terrain.width; development.height = terrain.height;
    function fit() { return Math.min(state.width / (W + 2), state.height / (H + 2)); }
    function scale() { return fit() * state.view.zoom; }
    function transform() {
      const u = scale();
      return {u, ox: (state.width-W*u)/2+state.view.x, oy: (state.height-H*u)/2+state.view.y};
    }
    function size() {
      const rect = shell.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      state.width = rect.width; state.height = rect.height;
      state.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * state.dpr); canvas.height = Math.round(rect.height * state.dpr);
      drawSoon();
    }
    function clearView() { state.view = {x:0,y:0,zoom:1}; drawSoon(); }
    function zoom(factor,x = state.width/2,y = state.height/2) {
      const old = transform();
      const fx = (x - old.ox) / old.u, fy = (y - old.oy) / old.u;
      state.view.zoom = Math.max(.72, Math.min(5,state.view.zoom * factor));
      const next = transform();
      pan(x - fx*next.u - next.ox, y - fy*next.u - next.oy);
    }
    function pan(dx,dy) {
      const u = scale(), v = state.view;
      const xLimit = Math.max(state.width*.28,W*u*.45), yLimit = Math.max(state.height*.28,H*u*.45);
      v.x = Math.max(-xLimit,Math.min(xLimit,v.x+dx));
      v.y = Math.max(-yLimit,Math.min(yLimit,v.y+dy));
      drawSoon();
    }
    const point = e => { const r = canvas.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; };
    function cell(e) { const [x,y] = point(e), {ox,oy,u} = transform(); return index(Math.floor((x-ox)/u),Math.floor((y-oy)/u)); }
    function setScene(s,m,layer) {
      state.scene = {s,m,layer};
      dev.setTransform(unit,0,0,unit,0,0);
      dev.clearRect(0,0,W,H);
      drawCity(dev,s,m,layer);
      drawSoon();
    }
    function setPointer(i,quote,anchor) { state.pointer = {i,quote,anchor}; drawSoon(); }
    function drawSoon() { if (!state.timer) state.timer = requestAnimationFrame(draw); }
    function draw() {
      state.timer = 0;
      const {dpr,width,height} = state;
      const {u,ox,oy} = transform();
      if (u <= 0) return;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const edge = ctx.createLinearGradient(0,0,width,height);
      edge.addColorStop(0,'#263a34'); edge.addColorStop(1,'#253d3c');
      ctx.fillStyle=edge; ctx.fillRect(0,0,width,height);
      ctx.save();
      ctx.translate(ox,oy); ctx.scale(u,u);
      ctx.drawImage(terrain,0,0,W,H);
      if (state.scene) ctx.drawImage(development,0,0,W,H);
      ctx.strokeStyle='#c6d7aa62'; ctx.lineWidth=.085; ctx.strokeRect(0,0,W,H);
      ctx.restore();
      mapText(ctx,'弯 湾 河',ox+42.3*u,oy+25.3*u,Math.min(18,Math.max(9,u*.9)), '#b7e5e4', 1.05);
      mapText(ctx,'西 岸',ox+23*u,oy+16*u,Math.min(13,Math.max(8,u*.72)),'#dce5be');
      mapText(ctx,'东 岸',ox+62*u,oy+38*u,Math.min(13,Math.max(8,u*.72)),'#dce5be');
      const [gx,gy] = xy(GATE);
      const entranceX = ox + (gx+.5)*u, entranceY = oy+(gy+.5)*u;
      ctx.lineWidth=1.5; ctx.strokeStyle='#e8ce8c'; ctx.beginPath(); ctx.moveTo(entranceX-20,entranceY); ctx.lineTo(entranceX,entranceY); ctx.stroke();
      ctx.beginPath(); ctx.arc(entranceX,entranceY,Math.max(3.5,u*.28),0,Math.PI*2); ctx.fillStyle='#f8d495'; ctx.fill();
      if (u>5.4) {
        const left = Math.max(5,entranceX-9);
        ctx.font='600 11px system-ui'; const label='外部公路入口', w=ctx.measureText(label).width;
        ctx.fillStyle='#26322cd9'; ctx.fillRect(left,entranceY+9,w+10,19); ctx.fillStyle='#fae4a9'; ctx.fillText(label,left+5,entranceY+22);
      }
      if (state.pointer) {
        ctx.save(); ctx.translate(ox,oy); ctx.scale(u,u);
        const {i,quote,anchor} = state.pointer;
        for (const n of quote?.cells || []) {
          const [x,y]=xy(n); ctx.fillStyle = quote.message ? '#ff9d834d' : '#d9f7c561'; ctx.fillRect(x,y,1,1);
        }
        if (i >= 0) { const [x,y] = xy(i); ctx.strokeStyle = quote?.message ? '#ffa592' : '#fff4b8'; ctx.lineWidth = .15; ctx.strokeRect(x+.06,y+.06,.88,.88); }
        if (anchor >= 0 && anchor !== i) { const [x,y] = xy(anchor); ctx.strokeStyle='#f5ce83'; ctx.lineWidth=.17; ctx.strokeRect(x+.07,y+.07,.86,.86); }
        ctx.restore();
      }
      drawCompass(ctx,width,height);
      onScale(u);
    }
    if (window.ResizeObserver) new ResizeObserver(size).observe(shell);
    window.addEventListener('resize',size);
    size();
    return {cell,point,zoom,pan,clearView,setScene,setPointer};
  }
  function terrainArt(ctx,u) {
    ctx.scale(u,u);
    const land = ctx.createLinearGradient(0,0,W,H);
    land.addColorStop(0,'#526d53'); land.addColorStop(.45,'#708665'); land.addColorStop(1,'#50694f');
    ctx.fillStyle=land; ctx.fillRect(0,0,W,H);
    for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
      const q=noise(x,y), contours = Math.sin(x*.13+y*.095)+Math.cos(x*.27-y*.14);
      ctx.fillStyle = contours>0 ? `rgba(208,210,154,${.012+q*.028})` : `rgba(41,72,53,${.02+q*.055})`;
      ctx.fillRect(x,y,1,1);
    }
    for(let j=0;j<5;j++) {
      ctx.beginPath();
      for(let x=0;x<=W;x+=.4) {
        const y=7+j*8+Math.sin(x*.124+j*.7)*2+Math.sin(x*.28+j*.4)*.8;
        if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.strokeStyle='#b7cd9e13';ctx.lineWidth=.08;ctx.stroke();
    }
    for(let n=0;n<1850;n++) {
      const x=noise(n,83)*W, y=noise(73,n)*H;
      const patch = Math.sin(x*.35)*Math.cos(y*.42)+Math.sin(x*.17+y*.22);
      if (patch < .44 && n%5) continue;
      const radius=.07+noise(n,51)*.14;
      ctx.fillStyle=n%3===0?'#9ab17e70':n%3===1?'#384f3f80':'#486548aa';
      ctx.beginPath(); ctx.ellipse(x,y,radius*1.3,radius,0,0,Math.PI*2); ctx.fill();
    }
    const blue = ctx.createLinearGradient(25,0,62,H);
    blue.addColorStop(0,'#316673'); blue.addColorStop(.45,'#2c5969'); blue.addColorStop(1,'#3c7580');
    for (const shape of shapes) {
      ctx.beginPath(); for (const ring of shape) polygon(ctx,ring);
      ctx.lineJoin='round'; ctx.lineWidth=.45; ctx.strokeStyle='#b1c79488'; ctx.stroke();
      ctx.fillStyle=blue; ctx.fill('evenodd');
      ctx.lineWidth=.12; ctx.strokeStyle='#94bfb299'; ctx.stroke();
      ctx.save(); ctx.clip('evenodd');
      for(let y=0;y<H;y+=.62) {
        ctx.beginPath(); ctx.moveTo(0,y);
        for(let x=0;x<=W;x+=1)ctx.lineTo(x,y+Math.sin(x*.25+y*.25)*.14);
        ctx.strokeStyle='#a1d4d315';ctx.lineWidth=.065;ctx.stroke();
      }
      ctx.restore();
    }
    ctx.beginPath();
    for(let x=0;x<=W;x++){ctx.moveTo(x,0);ctx.lineTo(x,H);}
    for(let y=0;y<=H;y++){ctx.moveTo(0,y);ctx.lineTo(W,y);}
    ctx.strokeStyle='#c0d5b331';ctx.lineWidth=.036;ctx.stroke();
    ctx.beginPath();
    for(let x=0;x<=W;x+=8){ctx.moveTo(x,0);ctx.lineTo(x,H);}
    for(let y=0;y<=H;y+=8){ctx.moveTo(0,y);ctx.lineTo(W,y);}
    ctx.strokeStyle='#e7efc941';ctx.lineWidth=.057;ctx.stroke();
  }
  function drawCity(ctx,s,m,layer) {
    if (layerColors[layer]) {
      ctx.fillStyle='#173c4e3b'; ctx.fillRect(0,0,W,H);
      const field = m.coverage[layer === 'traffic' ? 'bus' : layer];
      for (let i=0;i<field.length;i++) if(field[i] && !water[i]) {
        const [x,y]=xy(i);ctx.fillStyle=`rgba(${layerColors[layer]},.29)`;ctx.fillRect(x,y,1,1);
      }
    }
    for (let i=0;i<s.zone.length;i++) {
      const z=s.zone[i]; if(!z)continue;
      const [x,y]=xy(i), style=ZONES[z];
      ctx.fillStyle=style.tint;ctx.fillRect(x+.03,y+.03,.94,.94);
      if (m.near[i] < 0 || !m.coverage.power[i] || !m.coverage.water[i]) {
        ctx.strokeStyle='#dee6ad34';ctx.lineWidth=.05;ctx.beginPath();ctx.moveTo(x+.15,y+.85);ctx.lineTo(x+.85,y+.15);ctx.stroke();
      }
      if (s.use[i] < 2.3 || layer === 'zoning') {
        ctx.strokeStyle=style.color+'a0';ctx.lineWidth=.045;ctx.strokeRect(x+.1,y+.1,.8,.8);
      } else {
        building(ctx,x,y,z,s.use[i]/style.cap,noise(x,y,8));
      }
    }
    function trace() {
      ctx.beginPath();
      for (let i=0;i<s.road.length;i++) if (s.road[i]) {
        const [x,y]=xy(i);
        ctx.moveTo(x+.48,y+.50);ctx.lineTo(x+.52,y+.50);
        if(x<W-1&&s.road[i+1]){ctx.moveTo(x+.5,y+.5);ctx.lineTo(x+1.5,y+.5);}
        if(y<H-1&&s.road[i+W]){ctx.moveTo(x+.5,y+.5);ctx.lineTo(x+.5,y+1.5);}
      }
    }
    ctx.lineCap='round';ctx.lineJoin='round';trace();
    ctx.strokeStyle='#34433a';ctx.lineWidth=.77;ctx.stroke();
    ctx.strokeStyle='#d6cfac';ctx.lineWidth=.59;ctx.stroke();
    ctx.strokeStyle=layer==='traffic'&&m.traffic>55?'#ce9971':'#58605a';ctx.lineWidth=.45;ctx.stroke();
    ctx.strokeStyle='#e7d59aa1';ctx.lineWidth=.036;ctx.setLineDash([.15,.16]);ctx.stroke();ctx.setLineDash([]);
    for (let i=0;i<s.road.length;i++) if(s.road[i]===2) {
      const [x,y]=xy(i);ctx.fillStyle='#e9deb9';
      if((x>0&&s.road[i-1])||(x<W-1&&s.road[i+1])) {ctx.fillRect(x,y+.2,1,.065);ctx.fillRect(x,y+.735,1,.065);}
      if((y>0&&s.road[i-W])||(y<H-1&&s.road[i+W])) {ctx.fillRect(x+.2,y,.065,1);ctx.fillRect(x+.735,y,.065,1);}
    }
    for(const [raw,key] of Object.entries(s.facilities)) {
      const [x,y]=xy(+raw),f=FACILITIES[key];
      ctx.fillStyle='#30433a';ctx.fillRect(x+.03,y+.03,.94,.94);
      ctx.fillStyle=f.color;ctx.fillRect(x+.16,y+.16,.68,.63);
      ctx.fillStyle='#27424a';ctx.font='700 .48px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText({power:'电',water:'水',school:'学',clinic:'医',park:'绿',bus:'公交'}[key],x+.5,y+.505,.64);
    }
  }
  function building(ctx,x,y,z,fill,r) {
    const count=z===1&&fill>.3?2:1;
    const roofs = z===1?['#d9c79b','#efdbac','#c2d1a8']:z===2?['#b6d9e3','#91bed3','#dcddd2']:z===3?['#b4b5e0','#c7cbe2','#909dc5']:['#c6a679','#d39b77','#bcb198'];
    for(let j=0;j<count;j++) {
      const w=count===2?.28:.52, h=.27+.15*fill;
      const bx=x+.12+j*.40+(count===1?r*.12:0), by=y+.35+r*.12, d=.12+.12*fill;
      ctx.fillStyle='#26313355';ctx.fillRect(bx+.06,by+.09,w+.10,h+.07);
      ctx.fillStyle='#657264';ctx.fillRect(bx,by,w,h+d);
      ctx.fillStyle='#9b9c7f';ctx.fillRect(bx,by+h-d/2,w,d);
      ctx.fillStyle=roofs[Math.floor(r*3)];ctx.fillRect(bx,by-d,w,h);
      if (fill>.52) {ctx.fillStyle='#f0eed180';ctx.fillRect(bx+.06,by+h-.055,w-.12,.04);}
    }
  }
  function mapText(ctx,text,x,y,size,color,angle=0) {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.font=`600 ${size}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeStyle='#253c3ba8';ctx.lineWidth=2.3;ctx.strokeText(text,0,0);ctx.fillStyle=color;ctx.globalAlpha=.86;ctx.fillText(text,0,0);ctx.restore();
  }
  function drawCompass(ctx,w,h) {
    if(w<500||h<230)return;
    const x=w-43,y=30;ctx.save();ctx.translate(x,y);ctx.fillStyle='#e6ebd4';ctx.textAlign='center';ctx.font='700 11px system-ui';ctx.fillText('N',0,-10);
    ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(-5,10);ctx.lineTo(0,6);ctx.lineTo(5,10);ctx.closePath();ctx.fill();ctx.restore();
  }
  window.CityMap = newMap;
})();
