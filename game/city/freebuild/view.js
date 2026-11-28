/* City Blueprint visual renderer. Does not mutate simulation state. */
(function (root, factory) {
  const CityView = factory();
  if (typeof module === 'object' && module.exports) module.exports = CityView;
  else root.CityView = CityView;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const COLORS = {
    residential: ['#bde4ad', '#429673', '#36785b', '#a4ae7a', '#f1f8da'],
    commercial: ['#a6dcf1', '#3893a9', '#306a87', '#80b5c7', '#f3fdff'],
    industrial: ['#edd5af', '#bf8b50', '#875c3a', '#b9a182', '#fff0d7'],
    office: ['#d0c5ef', '#877ab4', '#5f5d8f', '#a193c1', '#f6edff'],
    park: ['#a7d690', '#62a46d', '#4f7859', '#9cc077', '#f5fee5'],
    mixed: ['#fabdc0', '#be7d8c', '#8e555d', '#c49d9a', '#fff6e9'],
  };
  const SERVICE = {
    power: ['#d78e30', 'ϟ'], water: ['#438eac', '~'], school: ['#796cab', '学'],
    clinic: ['#c36572', '+'], park: ['#649d67', '•'], bus: ['#278c7a', 'B'],
    fire: ['#d77859', 'F'], hospital: ['#c36572', '+'], police: ['#6378ab', 'P'],
    sewage: ['#548388', 'S'], waste: ['#a08363', 'W']
  };
  const VEHICLES=['#f6edd0','#fcfaf1','#e69e5f','#789ea4','#a4b381','#d78576','#89afbc'];
  const valid = x => typeof x === 'number' && Number.isFinite(x);
  const cl = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const array = v => Array.isArray(v) ? v : v instanceof Map ? [...v.values()] : v && typeof v === 'object' ? Object.values(v) : [];
  const riverX = y => 600 + 45*Math.sin(y/115);
  const point = p => Array.isArray(p) ? {x:+p[0]||0,y:+p[1]||0,z:+p[2]||0} : {x:+p.x||0,y:+p.y||0,z:+p.z||0};
  const p3 = p => ({x:p.x,y:p.y-(p.z||0)*0.76});
  const kind = z => ({r:'residential',c:'commercial',i:'industrial',o:'office',R:'residential',C:'commercial',I:'industrial',O:'office',housing:'residential',industry:'industrial'}[z]||z||'residential');
  const hash = (x,y,s=0) => { const v=Math.sin(x*127.1+y*311.7+s*75.1)*43758.5453; return v-Math.floor(v); };
  function trace(ctx, pts, close = false) {
    if (!pts.length) return;
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
    if (close) ctx.closePath();
  }
  function shape(ctx, pts, fill, stroke, line=1) {
    trace(ctx,pts,true);
    if (fill) { ctx.fillStyle=fill;ctx.fill(); }
    if (stroke) { ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke(); }
  }
  function line(ctx,pts,color,width,dash=[]) {
    trace(ctx,pts); ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);
  }
  function circle(ctx,x,y,r,fill,stroke,w=1) {
    ctx.beginPath();ctx.arc(x,y,Math.max(.01,r),0,TAU);
    if (fill) {ctx.fillStyle=fill;ctx.fill();}
    if (stroke) {ctx.strokeStyle=stroke;ctx.lineWidth=w;ctx.stroke();}
  }
  function label(ctx,text,x,y,size,color,weight=650,align='center') {
    ctx.font=weight+' '+size+'px "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif';
    ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,x,y);
  }
  function mix(a,b,t) { return a.map((v,i)=>Math.round(v+(b[i]-v)*t)); }
  function catRGB(xs, alpha=1) {return 'rgba('+xs.join(',')+','+alpha+')';}
  function sample(points, f) {
    if (!points || points.length<2) return points?.[0] || {x:0,y:0,z:0};
    f=cl(f,0,.9999999);
    const sizes=[];let total=0;
    for (let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i], l=Math.hypot(b.x-a.x,b.y-a.y,(b.z||0)-(a.z||0));
      sizes.push(l);total+=l;
    }
    let delta=total*f,index=0;
    while (index<sizes.length-1 && delta>sizes[index]) { delta-=sizes[index];index++; }
    const a=points[index],b=points[index+1], u=sizes[index]?delta/sizes[index]:0;
    return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:(a.z||0)+((b.z||0)-(a.z||0))*u,angle:Math.atan2(p3(b).y-p3(a).y,b.x-a.x),length:total};
  }
  function offscreen(canvas, width, height) {
    const owner=canvas.ownerDocument || (typeof document!=='undefined'?document:null);
    const c=owner?.createElement?.('canvas')||(typeof OffscreenCanvas==='function'?new OffscreenCanvas(width,height):null);
    if (c) {c.width=width;c.height=height;}
    return c;
  }
  class CityView {
    constructor(canvas, opt={}) {
      this.canvas=canvas; this.ctx=canvas.getContext('2d',{alpha:false}); this.worldWidth=opt.width||1200;this.worldHeight=opt.height||800;
      this.width=0;this.height=0;this.dpr=1;
      this.camera={x:this.worldWidth/2,y:this.worldHeight/2,zoom:1};
      this.terrain=offscreen(canvas,this.worldWidth,this.worldHeight);
      if(this.terrain) this.paintGround(this.terrain.getContext('2d'),this.worldWidth,this.worldHeight);
      this.resize();
    }
    resize() {
      const rect=this.canvas.getBoundingClientRect?.();
      const w=rect?.width||this.canvas.clientWidth||this.canvas.width||this.worldWidth;
      const h=rect?.height||this.canvas.clientHeight||this.canvas.height||this.worldHeight;
      const d=cl(typeof devicePixelRatio==='number'?devicePixelRatio:1,1,2);
      if (this.width===w&&this.height===h&&this.dpr===d) return false;
      this.width=w;this.height=h;this.dpr=d;
      this.canvas.width=Math.round(w*d);this.canvas.height=Math.round(h*d);
      return true;
    }
    worldToScreen(input,camera=this.camera) {
      const p=p3(point(input)), z=camera.zoom||1;
      return {x:(p.x-(camera.x??this.worldWidth/2))*z+this.width/2,y:(p.y-(camera.y??this.worldHeight/2))*z+this.height/2};
    }
    screenToWorld(p,camera=this.camera,elevation=0) {
      const z=camera.zoom||1;
      return {x:(p.x-this.width/2)/z+(camera.x??this.worldWidth/2),y:(p.y-this.height/2)/z+(camera.y??this.worldHeight/2)+.76*elevation};
    }
    paintGround(ctx,w,h) {
      if(!ctx) return;
      const ground=ctx.createLinearGradient(0,0,w,h);
      ground.addColorStop(0,'#a8bb97');ground.addColorStop(.45,'#bfd0a8');ground.addColorStop(1,'#adbf9b');
      ctx.fillStyle=ground;ctx.fillRect(0,0,w,h);
      // Fields, contours and individual crowns are fixed by world coordinates.
      for(let i=0;i<34;i++){
        const x=hash(i,1)*w,y=hash(i,2)*h;
        const clear=86+hash(i,3)*130;
        if (Math.abs(x-riverX(y))<72) continue;
        ctx.save();ctx.translate(x,y);ctx.rotate((hash(i,4)-.5)*1.2);
        const g=ctx.createRadialGradient(0,0,0,0,0,clear);
        g.addColorStop(0,i%3?'#647e5724':'#e8e2ae40');g.addColorStop(1,'#ffffff00');
        ctx.fillStyle=g;ctx.fillRect(-clear,-clear,clear*2,clear*2);ctx.restore();
      }
      for(let y=12;y<h;y+=14){
        const pts=[];
        for(let x=0;x<=w;x+=10)pts.push({x,y:y+3*Math.sin(x/110+y/45)+3*Math.cos(x/145-y/25)});
        line(ctx,pts,'#66806616',.6);
      }
      for(let y=0;y<h;y+=11)for(let x=0;x<w;x+=11){
        const tx=x+5*hash(x,y,1),ty=y+8*hash(x,y,2),dx=Math.abs(tx-riverX(ty));
        if(dx<48)continue;
        const wood=(Math.sin(x/97+y/63)+Math.cos(x/60-y/98))*.35+.52;
        const p=hash(x,y,3);
        if(p<wood*.22&&(x<205||x>930||y<110||y>690||p<.027)){
          const r=1.9+hash(x,y,4)*3.2;
          circle(ctx,tx+r*.7,ty+r*.38,r,'#47594b22');
          circle(ctx,tx,ty,r,p<.05?'#6b8b61':'#789569');
          circle(ctx,tx-r*.19,ty-r*.22,r*.63,'#a4ba7c55');
        } else if(p<.7) {
          ctx.fillStyle=p<.30?'#f4edd12e':'#5b775c26';ctx.fillRect(tx,ty,1.4,1.4);
        }
      }
      const shore=(left, right) => {
        const a=[],b=[];
        for(let y=-12;y<=h+12;y+=5){const x=riverX(y);a.push({x:x-left,y});b.push({x:x+right,y});}
        return a.concat(b.reverse());
      };
      shape(ctx,shore(46,46),'#cbd2ab');
      shape(ctx,shore(39,39),'#e2d9ac');
      const water=ctx.createLinearGradient(500,0,700,h);
      water.addColorStop(0,'#377e8a');water.addColorStop(.46,'#5497a4');water.addColorStop(1,'#33798a');
      shape(ctx,shore(35,35),water);
      for (const side of [-1,1]){
        for(let off=0;off<3;off++){
          const pts=[];for(let y=0;y<=h;y+=5)pts.push({x:riverX(y)+(33-off*3)*side,y});
          line(ctx,pts,off===0?'#b1d3c4a6':'#b3d5c345',off===0?1.8:1);
        }
      }
      for(let i=0;i<420;i++){
        const y=hash(i,25)*h,x=riverX(y)+(hash(i,26)-.5)*56, len=2+hash(i,27)*6;
        line(ctx,[{x,y},{x:x+len*.3,y:y+len}],'#d0e5db42',.7);
      }
      // Fine coordinate grid, useful while tracing parcels and curves.
      for(let x=0;x<w;x+=80) line(ctx,[{x,y:0},{x,y:h}],'#30483b11',.65,[2,4]);
      for(let y=0;y<h;y+=80) line(ctx,[{x:0,y},{x:w,y}],'#30483b11',.65,[2,4]);
      ctx.save();ctx.translate(riverX(657)-1,655);ctx.rotate(1.43);
      label(ctx,'Y U N  R I V E R',0,0,9,'#f1faf0b9',700);ctx.restore();
      label(ctx,'西岸  /  WEST BANK',153,125,9,'#526c56b8',700);
      label(ctx,'东岸  /  EAST BANK',1010,677,9,'#526c56b8',700);
      line(ctx,[{x:0,y:h-1},{x:w,y:h-1},{x:w,y:1},{x:0,y:1},{x:0,y:h-1}],'#f6f5d357',1.4);
    }
    paintZones(c,zones,overlay,sel) {
      for (const z of zones) {
        const land=Number(z.landValue??z.value??0), pts=array(z.poly??z.polygon??z.points).map(point);
        if(pts.length<2)continue;
        const colors=COLORS[kind(z.type)]||COLORS.residential;
        const focus=sel?.zone===z.id||sel?.type==='zone'&&sel.id===z.id;
        const fill=overlay==='land'&&Number.isFinite(land)&&land>0?catRGB(mix([183,125,100],[89,179,119],cl(land>1?land/100:land,0,1)),.63):colors[0]+(overlay==='zones'?'c4':'7d');
        if(z.frontage){
          line(c,pts,colors[0]+'75',12);
          line(c,pts,focus?'#f7ffe5':colors[1]+'a0',1.35,[4,5]);
        }else if(pts.length>2)shape(c,pts,fill,focus?'#f7ffe5':colors[1]+(overlay==='zones'?'d9':'8c'),focus?2.4:1.1);
        if(overlay==='zones'){
          const x=pts.reduce((n,p)=>n+p.x,0)/pts.length,y=pts.reduce((n,p)=>n+p.y,0)/pts.length;
          label(c,{residential:'住',commercial:'商',industrial:'工',office:'办',park:'绿',mixed:'混'}[kind(z.type)]||'·',x,y,11,colors[2],800);
        }
      }
    }
    paintRoad(c, e, pts, overlay, value, selected) {
      if (pts.length<2) return;
      if(pts.some(p=>(p.z||0)<-3)){
        // Tunnel sections are a guide at grade, never a painted surface road.
        let start=0;
        for(let i=1;i<pts.length;i++){
          const buried=Math.min(pts[i-1].z||0,pts[i].z||0)<-3;
          const changed=i===pts.length-1||buried!==(Math.min(pts[i].z||0,pts[i+1]?.z||0)<-3);
          if(!changed)continue;
          const run=pts.slice(start,i+1);start=i;
          if(buried){
            line(c,run,selected?'#ffffdacc':overlay==='elevation'?'#aa73d8':'#c6d2cc65',selected?7:5.5,[5,4]);
            line(c,run,'#364d578c',selected?2.8:1.9,[4,4]);
            for(const p of [run[0],run.at(-1)])if(!pts.every(p=>(p.z||0)<-3)&&Math.abs(p.x-riverX(p.y))>36)circle(c,p.x,p.y,3.2,'#4d5f5b','#dae3cd',.85);
          }else this.paintRoad(c,e,run,overlay,value,selected);
        }
        return;
      }
      const draw=pts.map(p3);
      const highway=e.kind==='highway', ramp=e.kind==='ramp';
      const width=cl(+e.lanes||2,1,8)*(highway?3.8:3.35)+(highway?5.8:ramp?2.5:4.5);
      const bridge=pts.some(p=>(p.z||0)>4)||pts.some(p=>Math.abs(p.x-riverX(p.y))<34);
      if (bridge) {
        line(c,draw.map((v,i)=>({x:v.x+2,y:pts[i].y+2})),'#25404366',width+5);
        // Piers are anchored to the ground while the deck uses its real height.
        for(let k=.14;k<.95;k+=.18){
          const p=sample(pts,k);if((p.z||0)<3&&Math.abs(p.x-riverX(p.y))>31)continue;
          const deck=p3(p);
          line(c,[{x:p.x,y:p.y+2},{x:deck.x,y:deck.y}],'#617f76',Math.max(2.5,width*.23));
          circle(c,p.x,p.y+2,Math.max(1.7,width*.11),'#576d62');
        }
      }
      if(selected) line(c,draw,'#fbffe3',width+8);
      line(c,draw,'#62705d',width+3.7);
      line(c,draw,bridge?'#ddded0':'#e0ddbe',width+1.6);
      const norm=+value>1?+value/100:+value||0;
      const street=overlay==='elevation'?(bridge?'#257e9b':'#69786d'):overlay==='traffic'?catRGB(mix([72,149,112],[209,91,68],cl(norm,0,1))):highway?'#505f5a':'#67756a';
      line(c,draw,street,width);
      if(width>=11)line(c,draw,highway?'#d6c69c95':'#e8e5d2b6',highway?1.3:.67,highway?[5,4]:[3.6,4.7]);
      if(e.bus)line(c,draw,'#a9e0cbb0',1.2,[7,5]);
      if(e.oneway){
        const p=sample(pts,.7),v=p3(p);c.save();c.translate(v.x,v.y);c.rotate(p.angle||0);
        shape(c,[{x:4,y:0},{x:-3,y:-2},{x:-1.5,y:0},{x:-3,y:2}],'#fffee1');c.restore();
      }
    }
    paintBuilding(c,b,z,overlay) {
      const p=point(b), color=COLORS[kind(z.type)]||COLORS.residential;
      if(overlay==='zones')return;
      const w=cl(+(b.w??b.width)||9,3,80), d=cl(+(b.d??b.depth)||8,3,80);
      const level=cl(b.level==null?1:+b.level,0,18), phi=+b.angle||0;
      const high=cl((b.height??(4+level*(kind(z.type)==='office'?8.5:5)+(level===3?(kind(z.type)==='office'?31:15):0))),0,85);
      const cs=Math.cos(phi),sn=Math.sin(phi);
      const flat=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:p.x+x*w*.5*cs-y*d*.5*sn,y:p.y+x*w*.5*sn+y*d*.5*cs}));
      if(!level){shape(c,flat,color[0]+'6a',color[1]+'90',.65);return;}
      const top=flat.map(v=>({x:v.x-high*.22,y:v.y-high*.64}));
      shape(c,flat.map(v=>({x:v.x+high*.46,y:v.y+high*.25})),'#2e4b3e29');
      const sides=[0,1,2,3].sort((a,b)=>(flat[a].y+flat[(a+1)%4].y)-(flat[b].y+flat[(b+1)%4].y));
      for(const i of sides){
        const j=(i+1)%4;
        shape(c,[flat[i],flat[j],top[j],top[i]],i===sides[3]?color[2]:color[1]);
      }
      shape(c,top,color[0],color[2],.72);
      if (w>7&&level>1){
        const center=top.reduce((v,p)=>({x:v.x+p.x/4,y:v.y+p.y/4}),{x:0,y:0});
        const inset=top.map(a=>({x:center.x+(a.x-center.x)*.63,y:center.y+(a.y-center.y)*.63}));
        shape(c,inset,color[3]+'b2',color[4]+'ad',.54);
      }
      if(level>2&&d>7){
        const i=sides[3],j=(i+1)%4;
        for(let f=.26;f<.82;f+=.23){
          const a={x:flat[i].x+(top[i].x-flat[i].x)*f,y:flat[i].y+(top[i].y-flat[i].y)*f};
          const b={x:flat[j].x+(top[j].x-flat[j].x)*f,y:flat[j].y+(top[j].y-flat[j].y)*f};
          line(c,[a,b],color[4]+'72',.65,[1.6,1.6]);
        }
      }
    }
    paintService(c,s, overlay, selected) {
      const [col,sign]=SERVICE[s.type]||['#64796b','·'];
      if(overlay==='services') circle(c,s.x,s.y,+s.radius||65,col+'22',col+'87',1.1);
      circle(c,s.x+1.2,s.y+2.6,8.2,'#24403733');
      circle(c,s.x,s.y,selected?9.5:8,col,selected?'#fffde8':'#edf0d7',selected?2:1.2);
      label(c,sign,s.x,s.y,10,'#fff9e6',800);
    }
    paintAgent(c, a) {
      if(!valid(a.x)||!valid(a.y)||(a.z||0)<-3)return;
      const p=p3(a), style=a.kind??a.type, bus=style==='bus', walking=['walk','pedestrian','walker'].includes(style);
      if(walking) {
        const f=Number.isFinite(a.phase)?Math.sin(a.phase):0;
        circle(c,p.x+.65,p.y+1,1.9,'#2a45384c');
        circle(c,p.x,p.y,1.65,a.color||'#fff1bb','#536b54',.55);
        line(c,[{x:p.x-.7,y:p.y+1},{x:p.x+.6+f,y:p.y+2.5}],'#4b604d',.62);
      } else {
        c.save();c.translate(p.x,p.y);c.rotate(+a.angle||0);
        const w=bus?8.8:4.2,h=bus?2.7:1.9;
        c.fillStyle='#233c4190';c.fillRect(-w*.57,-h*.5,w*1.14,h*1.4);
        c.fillStyle=a.color||(bus?'#eeb663':'#edf1c8');c.fillRect(-w*.5,-h*.5,w,h);
        c.fillStyle=bus?'#186b69':'#324849';c.fillRect(w*.20,-h*.42,w*.16,h*.84);
        c.fillStyle='#fffad9';c.fillRect(w*.44,-h*.42,.6,.46);c.fillRect(w*.44,h*.25,.6,.46);
        if(bus){c.fillStyle='#176e6f';c.fillRect(-w*.36,-h*.41,w*.27,h*.82);}
        c.restore();
      }
    }
    paintVehicles(c, edges, busLines, ids, explicit, time, traffic) {
      if(Array.isArray(explicit)){
        for(const a of explicit)this.paintAgent(c,a);
      } else {
        // Ambient traffic only when the caller has not supplied live simulation agents.
        for(const [idx,e,pts] of edges){
          if (pts.length<2)continue;
          const length=sample(pts,0).length||1;
          const n=cl(Math.ceil(length/100),1,4);
          for(let k=0;k<n;k++){
            if((idx*13+k*3)%5<1)continue;
            const t=(time*(Math.min(2.2,e.kind==='highway'?1.9:1))*.015/length+hash(idx,k,2)+k/n)%1;
            const forward=e.oneway||((idx+k)&1)===0;
            const p=sample(pts,forward?t:1-t), angle=(p.angle||0)+(forward?0:Math.PI);
            p.x-=Math.sin(angle)*1.7;p.y+=Math.cos(angle)*1.7;
            this.paintAgent(c,{...p,angle,color:VEHICLES[(idx+k)%VEHICLES.length]});
            if(!e.oneway&&e.kind!=='highway'&&(idx+k)%3===0){
              const q=sample(pts,(hash(idx,k,5)+time*.004/length)%1), i=q.angle||0;
              q.x-=Math.sin(i)*6.5;q.y+=Math.cos(i)*6.5;
              if(Math.abs(q.x-riverX(q.y))>36)this.paintAgent(c,{...q,kind:'walk',phase:time/90});
            }
          }
        }
      }
      if(Array.isArray(explicit)&&explicit.some(a=>(a.kind||a.type)==='bus'))return;
      for(const [index,bus] of busLines.entries()){
        const path=array(bus.path);
        const route=path.map(step=>{
          const data=ids.get(String(step?.edge?.id??step?.edge??step?.id??step));
          if(!data)return null;
          const pts=step.reverse?[...data].reverse():data;
          return {pts,len:sample(pts,0).length||0};
        }).filter(x=>x?.len>0);
        const len=route.reduce((n,s)=>n+s.len,0);
        if(!len)continue;
        let offset=(time*.028+index*97)%len;
        for(const s of route){
          if(offset<=s.len){const p=sample(s.pts,offset/s.len), a=p.angle||0;
            this.paintAgent(c,{...p,kind:'bus',x:p.x-Math.sin(a)*1.12,y:p.y+Math.cos(a)*1.12,color:bus.color});
            break;
          }
          offset-=s.len;
        }
      }
    }
    render(city={}, opts={}, timeMs) {
      if(!this.ctx)return;
      const c=this.ctx; if(!this.width||!this.height)this.resize();
      const d=this.dpr,w=this.worldWidth,h=this.worldHeight;
      const camera=this.camera={x:opts.camera?.x??w/2,y:opts.camera?.y??h/2,zoom:cl(opts.camera?.zoom??1,.15,8)};
      const t=valid(timeMs)?Math.max(0,timeMs):typeof performance==='object'?performance.now():Date.now();
      const overlay=opts.overlay??'none', metrics=opts.metrics??city.metrics??{}, selected=opts.selected||{};
      if(this.latestCity!==city){
      const civic=city.civic??city;
      const nodes=Object.fromEntries(array(city.nodes).map(p=>[String(p.id),point(p)]));
      const lots=Object.create(null);
      for(const lot of array(city.lots??civic.lots))(lots[lot.zoneId]??=[]).push(lot);
      const zones=array(city.zones??civic.zones).map(z=>{
        const buildings=z.buildings??lots[z.id]??[];
        const fields=metrics.lots??metrics.civic?.lots;
        const land=fields&&buildings.length?buildings.reduce((a,b)=>a+(+fields[b.id]?.quality||0),0)/buildings.length:0;
        return {...z,buildings,landValue:z.landValue??land};
      });
      const sr=array(city.services??civic.services), busLines=array(city.buses);
      const edges=array(city.edges).map((e,i)=>{
        const pts=array(e.pts??e.points).map(point);
        if(pts.length<2&&nodes[e.a]&&nodes[e.b])pts.push(nodes[e.a],nodes[e.b]);
        const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
        const minY=Math.min(...pts.map(p=>p.y-(p.z||0)*.76)),maxY=Math.max(...pts.map(p=>p.y));
        return [i,e,pts,{minX,maxX,minY,maxY,top:Math.max(0,...pts.map(p=>p.z))}];
      });
      const ids=new Map(edges.map(([,e,pts])=>[String(e.id),pts]));
      const roads=edges.slice().sort((a,b)=>a[3].top-b[3].top);
      this.cachedScene={nodes,zones,sr,busLines,edges,ids,roads};this.latestCity=city;
      }
      const {nodes,zones,sr,busLines,edges,ids,roads}=this.cachedScene;
      c.setTransform(d,0,0,d,0,0);c.fillStyle='#9cb290';c.fillRect(0,0,this.width,this.height);
      c.save();c.translate(this.width/2,this.height/2);c.scale(camera.zoom,camera.zoom);c.translate(-camera.x,-camera.y);
      if(this.terrain)c.drawImage(this.terrain,0,0);else this.paintGround(c,w,h);
      c.save();c.beginPath();c.rect(0,0,w,h);c.clip();
      this.paintZones(c,zones,overlay,selected);
      const field=metrics.coverageGrid;
      if(field?.key===overlay){
        const shade=SERVICE[overlay]?.[0]||'#2d97b1';
        c.save();c.fillStyle=shade;
        for(const v of field.cells){c.globalAlpha=.09+v.strength*.52;c.fillRect(v.x-6,v.y-6,12,12)}
        c.restore();
      }
      if (overlay==='services')for(const s of sr){const [color]=SERVICE[s.type]||['#64796b'];circle(c,s.x,s.y,+s.radius||65,color+'25',color+'77',1);}
      c.lineCap='round';c.lineJoin='round';
      const load=metrics.edgeTraffic??metrics.trafficByEdge??metrics.edgeLoad??metrics.congestionByEdge??metrics.traffic??{};
      // Sort by deck height so overlapped bridges read as elevated.
      const left=camera.x-this.width/2/camera.zoom-44,right=camera.x+this.width/2/camera.zoom+44;
      const top=camera.y-this.height/2/camera.zoom-44,bottom=camera.y+this.height/2/camera.zoom+44;
      for(const [i,e,pts,bb] of roads){
        if(bb.maxX<left||bb.minX>right||bb.maxY<top||bb.minY>bottom)continue;
        const v=(load instanceof Map ? load.get(e.id) : typeof load==='number'?load:load[e.id]??load[i])??e.traffic??e.load??0;
        this.paintRoad(c,e,pts,overlay,v?.ratio??v?.congestion??v,selected.edge===e.id||selected.type==='edge'&&selected.id===e.id);
      }
      if(overlay==='traffic' || overlay==='routes' || overlay==='transit'){
        for(const bus of busLines)for(const step of array(bus.path)){
          const route=ids.get(String(step?.edge?.id??step?.edge??step?.id??step));
          if (route?.length>1)line(c,route.map(p3),'#c4f7de',1.35,[6,3]);
        }
      }
      if(camera.zoom>.20){
        const margin=75, hw=this.width/camera.zoom/2+margin, hh=this.height/camera.zoom/2+margin;
        const inView=b=>Math.abs(b.x-camera.x)<hw&&Math.abs(b.y-camera.y)<hh;
        const buildings=zones.flatMap(z=>array(z.buildings).filter(inView).map(b=>[b,z])).sort((a,b)=>a[0].y-b[0].y);
        for(const [b,z] of buildings)this.paintBuilding(c,b,z,overlay);
      }
      if(overlay==='traffic'||overlay==='routes'||overlay==='transit'||opts.tool==='bus'){
        for(const bus of busLines)for(const id of array(bus.stops)){
          const node=nodes[id?.node??id?.id??id];if(!node)continue;
          const p=p3(node);circle(c,p.x,p.y,3.8,'#f0fcde','#348478',1.55);
        }
      }
      for(const s of sr)if(!field||field.key!==overlay||s.type===overlay)this.paintService(c,s,'none',selected.service===s.id||selected.type==='service'&&selected.id===s.id);
      this.paintVehicles(c,edges,busLines,ids,opts.agents??city.agents,t,load);
      const preview=opts.preview;
      const proposed=array(preview?.points??preview?.pts??preview?.poly??(Array.isArray(preview)?preview:null)).map(point).map(p3);
      if(proposed.length){
        const ok=preview?.valid!==false, col=ok?'#e0fff0':'#fff2e1', accent=ok?'#26745d':'#b84949';
        if(preview.closed||preview.poly||preview.kind==='zone')shape(c,proposed,ok?'#b5edd778':'#ed9c8d80',accent,1.3);
        else if(proposed.length>1){line(c,proposed,col,8.2);line(c,proposed,accent,4,[6,4]);}
        for(const p of [proposed[0],proposed.at(-1)])circle(c,p.x,p.y,3.9,col,accent,1.3);
      }
      c.restore();c.restore();
      if(opts.compass!==false&&this.width>390){
        c.save();
        const x=this.width-31,y=33;
        circle(c,x,y,16,'#f1f4dfdb','#5e76647e',1);
        shape(c,[{x,y:y-8},{x:x-4,y:y+4},{x,y:y+1},{x:x+4,y:y+4}],'#3b6658');
        label(c,'N',x,y+9,5.5,'#3b6658',800);
        c.restore();
      }
    }
  }
  CityView.create=(canvas,opt)=>new CityView(canvas,opt);
  CityView.riverX=riverX;
  return CityView;
});
