/* City Blueprint visual renderer. Does not mutate simulation state. */
(function (root, factory) {
  const CityView = factory();
  if (typeof module === 'object' && module.exports) module.exports = CityView;
  else root.CityView = CityView;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const Road=typeof module==='object'?require('./network.js'):globalThis.Network;
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
    sewage: ['#548388', '污'], waste: ['#a08363', '垃'], library: ['#765c9e', '阅'],
    plaza: ['#579b86', '广'], logistics: ['#ab7d49', '运']
  };
  const VEHICLES=['#f6edd0','#fcfaf1','#e69e5f','#789ea4','#a4b381','#d78576','#89afbc'];
  const valid = x => typeof x === 'number' && Number.isFinite(x);
  const cl = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  const array = v => Array.isArray(v) ? v : v instanceof Map ? [...v.values()] : v && typeof v === 'object' ? Object.values(v) : [];
  const tierRise = (tier,type) => tier===1?0:tier*(type==='office'?2:1);
  const riverX = y => globalThis.CityMaps?.center(y)??(600 + 45*Math.sin(y/115));
  const riverW = y => globalThis.CityMaps?.width(y)??35;
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
  function arrow(ctx,p,angle,color,size=4.5) {
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);
    shape(ctx,[{x:size,y:0},{x:-size*.64,y:-size*.64},{x:-size*.24,y:0},{x:-size*.64,y:size*.64}],color);
    ctx.restore();
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
      const colors=globalThis.CityMaps?.current().color||['#a8bb97','#bfd0a8','#adbf9b'];ground.addColorStop(0,colors[0]);ground.addColorStop(.45,colors[1]);ground.addColorStop(1,colors[2]);
      ctx.fillStyle=ground;ctx.fillRect(0,0,w,h);
      // Fields, contours and individual crowns are fixed by world coordinates.
      for(let i=0;i<34;i++){
        const x=hash(i,1)*w,y=hash(i,2)*h;
        const clear=86+hash(i,3)*130;
        if (Math.abs(x-riverX(y))<riverW(y)+37) continue;
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
        if(dx<riverW(ty)+13)continue;
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
        for(let y=-12;y<=h+12;y+=5){const x=riverX(y);a.push({x:x-left-riverW(y)+35,y});b.push({x:x+right+riverW(y)-35,y});}
        return a.concat(b.reverse());
      };
      shape(ctx,shore(46,46),'#cbd2ab');
      shape(ctx,shore(39,39),'#e2d9ac');
      const water=ctx.createLinearGradient(500,0,700,h);
      water.addColorStop(0,'#377e8a');water.addColorStop(.46,'#5497a4');water.addColorStop(1,'#33798a');
      shape(ctx,shore(35,35),water);
      for (const side of [-1,1]){
        for(let off=0;off<3;off++){
          const pts=[];for(let y=0;y<=h;y+=5)pts.push({x:riverX(y)+(riverW(y)-2-off*3)*side,y});
          line(ctx,pts,off===0?'#b1d3c4a6':'#b3d5c345',off===0?1.8:1);
        }
      }
      for(let i=0;i<420;i++){
        const y=hash(i,25)*h,x=riverX(y)+(hash(i,26)-.5)*(riverW(y)*1.6), len=2+hash(i,27)*6;
        line(ctx,[{x,y},{x:x+len*.3,y:y+len}],'#d0e5db42',.7);
      }
      const ridge=globalThis.CityMaps?.current().ridge;
      if(ridge){for(let y=0;y<h;y+=8)for(let x=0;x<w;x+=8){const z=ridge({x,y});if(z>.24){ctx.fillStyle=z>.64?'#535e48a0':z>.43?'#72835b65':'#8b956841';ctx.fillRect(x,y,8,8);}}label(ctx,'青岭保护山脊',150,176,12,'#edf5d7');label(ctx,'南岭保护山脊',1050,610,12,'#edf5d7');}
      // Fine coordinate grid, useful while tracing parcels and curves.
      for(let x=0;x<w;x+=80) line(ctx,[{x,y:0},{x,y:h}],'#30483b11',.65,[2,4]);
      for(let y=0;y<h;y+=80) line(ctx,[{x:0,y},{x:w,y}],'#30483b11',.65,[2,4]);
      ctx.save();ctx.translate(riverX(657)-1,655);ctx.rotate(1.43);
      label(ctx,globalThis.CityMaps?.current().nameWater||'弯湾河',0,0,9,'#f1faf0b9',700);ctx.restore();
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
    roadMesh(roads,nodes) {
      const groups=new Map(), links=new Map(), tunnels=[],junctions=new Map();
      const group=n=>{
        if(!groups.has(n))groups.set(n,{level:n,spans:[],marks:[],aprons:[]});
        return groups.get(n);
      };
      const connect=(job,side,key)=>{
        const n=nodes[key], end=side?job.pts.at(-1):job.pts[0];
        if(!n||end.z<-3||Math.abs(end.z-n.z)>1.45||Math.hypot(end.x-n.x,end.y-n.y)>1.55)return;
        const endpoint={job,side,node:key,peer:null,trim:0};
        if(!links.has(key))links.set(key,[]);
        links.get(key).push(endpoint);job.links[side]=endpoint;
        // SplitAt may leave roundoff at the shared endpoint. Snap only this draw copy.
        job.draw[side?job.draw.length-1:0]=p3(n);
      };
      for(const [i,e,pts,bb] of roads){
        if(pts.length<2)continue;
        const highway=e.kind==='highway',ramp=e.kind==='ramp';
        const cross=Road.crossSection(e),width=cross.width;
        let start=0;
        for(let end=1;end<pts.length;end++){
          const buried=Math.min(pts[end-1].z,pts[end].z)<-3;
          const last=end===pts.length-1;
          if(!last&&buried===(Math.min(pts[end].z,pts[end+1].z)<-3))continue;
          const run=pts.slice(start,end+1),a=start;start=end;
          if(buried){tunnels.push({e,run,bb,entrances:[...(a?[run[0]]:[]),...(!last?[run.at(-1)]:[])]});continue;}
          const high=Math.max(...run.map(p=>p.z));
          const layer=high>4?Math.max(1,Math.floor((high+2)/5)):0;
          const bridge=layer>0||run.some(p=>Math.abs(p.x-riverX(p.y))<riverW(p.y)-1);
          const draw=run.map(p3), l=draw.reduce((n,p,k)=>k?n+Math.hypot(p.x-draw[k-1].x,p.y-draw[k-1].y):n,0);
          if(l<.1)continue;
          const job={i,e,cross,bb,pts:run,draw,length:l,width,links:[],layer,bridge,highway,
            mark:width>=10.6?(highway?'highway':'surface'):'none'};
          if(a===0)connect(job,0,e.a);
          if(last)connect(job,1,e.b);
          group(layer).spans.push(job);
        }
      }
      function direction(ep) {
        const a=ep.side?ep.job.draw.at(-1):ep.job.draw[0];
        const seq=ep.side?[...ep.job.draw].reverse():ep.job.draw;
        for(const b of seq){
          const dist=Math.hypot(b.x-a.x,b.y-a.y);
          if(dist>.5)return [(b.x-a.x)/dist,(b.y-a.y)/dist];
        }
        return [0,0];
      }
      for(const [key, ends] of links){
        if(ends.length<2)continue;
        const widest=Math.max(...ends.map(end=>end.job.width));
        const layer=Math.max(...ends.map(end=>end.job.layer));
        if(ends.some(end=>end.job.layer!==layer)){
          const apron={p:p3(nodes[key]),radius:widest*.67+2,spans:ends.map(e=>e.job)};
          group(layer).aprons.push(apron);
        }
        if(ends.length===2){
          const [a,b]=ends, da=direction(a),db=direction(b);
          const sameGrade=a.job.layer===b.job.layer;
          if(sameGrade&&a.job.mark===b.job.mark&&a.job.e.bus===b.job.e.bus&&a.job.e.lanes===b.job.e.lanes&&a.job.e.oneway===b.job.e.oneway&&a.side!==b.side&&da[0]*db[0]+da[1]*db[1]<-.22){a.peer=b;b.peer=a;continue;}
          for(const v of ends)v.trim=widest*.26;
        }else{
          junctions.set(key,{p:p3(nodes[key]),ends,layer});
          for(const v of ends)v.trim=widest*.50+1.2;
        }
      }
      function trim(points,head=0,tail=0){
        if(head<=0&&tail<=0)return points;
        const seg=[];let length=0;
        for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.hypot(b.x-a.x,b.y-a.y);seg.push({a,b,from:length,to:length+n,n});length+=n;}
        const right=length-tail;
        if(right-head<.55)return [];
        const p=[];
        for(const k of seg){
          const from=Math.max(k.from,head),to=Math.min(k.to,right);
          if(k.n<.01||to<=from)continue;
          const at=t=>({x:k.a.x+(k.b.x-k.a.x)*(t-k.from)/k.n,y:k.a.y+(k.b.y-k.a.y)*(t-k.from)/k.n});
          if(!p.length)p.push(at(from));
          p.push(at(to));
        }
        return p;
      }
      for(const g of groups.values()){
        const seen=new Set(), candidates=g.spans.filter(j=>j.mark!=='none'||j.e.bus);
        // Start chains at a real endpoint, then consume remaining closed rings.
        const ordered=[...candidates.filter(j=>!j.links[0]?.peer||!j.links[1]?.peer),...candidates];
        for(const tile of ordered){
          if(seen.has(tile))continue;
          let pts=[],vis=[],j=tile,side=tile.links[0]?.peer&&!tile.links[1]?.peer?1:0;
          const beginTrim=j.links[side]?.trim||0;let finishTrim=0;
          while(j&&!seen.has(j)){
            seen.add(j);vis.push(j.bb);
            const samples=side?[...j.draw].reverse():j.draw;
            pts.push(...(pts.length?samples.slice(1):samples));
            const exit=j.links[1-side];finishTrim=exit?.trim||0;
            const next=exit?.peer;
            j=next?.job;side=next?.side;
          }
          pts=trim(pts,beginTrim,finishTrim);
          if(pts.length>1){
            const s=tile.links[0]?.peer&&!tile.links[1]?.peer?-1:1;
            const {divider,boundaries,busOffsets,lane}=tile.cross;
            const rail=off=>off===0?pts:pts.map((p,i)=>{
              const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
              const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
              return {x:p.x-dy/d*off,y:p.y+dx/d*off};
            });
            g.marks.push({vis,hi:tile.highway,lane,divider:divider===null?null:rail(s*divider),
              separators:boundaries.filter(off=>divider===null||Math.abs(divider-off)>.02).map(off=>rail(s*off)),
              busLanes:busOffsets.map(off=>rail(s*off))});
          }
        }
      }
      return {groups:[...groups.values()].sort((a,b)=>a.level-b.level),tunnels,junctions};
    }
    paintRoadMesh(c,mesh,overlay,load,queue,selected,visible) {
      const isSelected=e=>selected.edge===e.id||selected.type==='edge'&&selected.id===e.id;
      const tint=s=>{
        const {i,e,highway,bridge}=s;
        if(overlay==='elevation')return bridge?'#257e9b':'#69786d';
        if(overlay!=='traffic'&&overlay!=='parking')return highway?'#454e54':'#585f60';
        const value=(load instanceof Map?load.get(e.id):typeof load==='number'?load:load[e.id]??load[i])??e.traffic??e.load??0;
        const measured=queue?.[e.id];
        const ratio=typeof measured==='number'?measured:(+((value?.ratio??value?.congestion??value))||0);
        return catRGB(mix([72,149,112],[209,91,68],cl(ratio>1?ratio/100:ratio,0,1)));
      };
      for(const t of mesh.tunnels)if(visible(t.bb)){
        if(overlay!=='elevation'&&!isSelected(t.e)){for(const p of t.entrances)circle(c,p.x,p.y,3.6,'#43514e','#d3cfc0',.9);continue;}
        const sel=isSelected(t.e);
        line(c,t.run,sel?'#ffffdacc':overlay==='elevation'?'#aa73d8':'#c6d2cc65',sel?7:5.5,[5,4]);
        line(c,t.run,'#364d578c',sel?2.8:1.9,[4,4]);
        for(const p of t.entrances)if(Math.abs(p.x-riverX(p.y))>riverW(p.y)+1)circle(c,p.x,p.y,3.2,'#4d5f5b','#dae3cd',.85);
      }
      const pavement=spans=>{
        // Paint a complete casing/curb/surface pass for each matching deck.
        // A second road's cap can no longer cut across its neighbour's pavement.
        for(const s of spans)if(isSelected(s.e))line(c,s.draw,'#fbffe3',s.width+8);
        for(const s of spans)line(c,s.draw,'#62705d',s.width+3.7);
        for(const s of spans)line(c,s.draw,s.bridge?'#d1d9d0':'#c8c4b5',s.width+2.1);
        for(const s of spans)line(c,s.draw,tint(s),s.width);
      };
      for(const g of mesh.groups){
        const visibleSpans=g.spans.filter(s=>visible(s.bb));
        for(const s of visibleSpans)if(s.bridge){
          line(c,s.draw.map((v,i)=>({x:v.x+2,y:s.pts[i].y+2})),'#25404366',s.width+5);
          for(let k=.14;k<.95;k+=.18){
            const p=sample(s.pts,k);if(p.z<3&&Math.abs(p.x-riverX(p.y))>riverW(p.y)-4)continue;
            const deck=p3(p);
            line(c,[{x:p.x,y:p.y+2},{x:deck.x,y:deck.y}],'#617f76',Math.max(2.5,s.width*.23));
            circle(c,p.x,p.y+2,Math.max(1.7,s.width*.11),'#576d62');
          }
        }
        pavement(visibleSpans);
        for(const a of g.aprons)if(a.spans.some(s=>visible(s.bb))){
          c.save();c.beginPath();c.arc(a.p.x,a.p.y,a.radius,0,TAU);c.clip();
          pavement(a.spans);
          c.restore();
        }
        for(const m of g.marks)if(m.vis.some(visible)){
          if(this.camera.zoom>=.83)for(const ps of m.separators)line(c,ps,'#ecece295',.39,[3.6,5.8]);
          if(m.divider)line(c,m.divider,m.hi?'#f1d899db':'#eddca5be',m.hi?.92:.58,m.hi?[]:[4,3.5]);
          for(const ps of m.busLanes)line(c,ps,'#89c8ae8c',Math.max(1,m.lane*.67),[6,3]);
        }
        for(const {p,ends,layer} of mesh.junctions.values())if(layer===g.level&&this.camera.zoom>=1.12&&ends.some(x=>visible(x.job.bb))){
          for(const {job,side} of ends){
            if(job.highway||job.e.kind==='ramp'||job.length<14||job.pts.some(v=>v.z>4))continue;
            const q=sample(job.pts,side?1-Math.min(.43,(job.width*.58+1)/job.length):Math.min(.43,(job.width*.58+1)/job.length));
            const at=p3(q), nx=-Math.sin(q.angle),ny=Math.cos(q.angle);
            const range=Math.min(job.width*.41,9.6);
            for(let m=-range;m<=range;m+=2.45){
              const x=at.x+m*nx,y=at.y+m*ny,dx=Math.cos(q.angle)*1.25,dy=Math.sin(q.angle)*1.25;
              line(c,[{x:x-dx,y:y-dy},{x:x+dx,y:y+dy}],'#f0ecdbb0',.85);
            }
          }
        }
        for(const s of visibleSpans)if(s.e.oneway&&s.length>25){
          const p=sample(s.pts,.69),v=p3(p);
          c.save();c.translate(v.x,v.y);c.rotate(p.angle||0);
          shape(c,[{x:4,y:0},{x:-3,y:-2},{x:-1.5,y:0},{x:-3,y:2}],'#fffee1');c.restore();
        }
      }
    }
    paintBuilding(c,b,z,overlay,zoom=1) {
      if(overlay==='zones')return;
      const x=+b.x,y=+b.y;
      if(!valid(x)||!valid(y))return;
      const type=kind(z.type), pal=COLORS[type]||COLORS.residential;
      const w=cl(+(b.w??b.width)||9,3,80), d=cl(+(b.d??b.depth)||8,3,80);
      const level=cl(Math.round(b.level==null?1:+b.level||0),0,18), tier=Math.min(3,level);
      const screenSize=Math.max(w,d)*zoom, phi=+b.angle||0, cs=Math.cos(phi), sn=Math.sin(phi);
      const variety=Math.floor(hash(Math.round(x),Math.round(y),17)*4);
      const depth=+b.z||0, project=(u,v,h=0)=>({x:x+u*cs-v*sn-h*.30,y:y+u*sn+v*cs-h*.67-depth*.76});
      const outline=(a,e,f,g,h=0)=>[project(a,e,h),project(f,e,h),project(f,g,h),project(a,g,h)];
      if(!level){if(screenSize>=5)shape(c,outline(-w*.40,-d*.40,w*.40,d*.40),pal[0]+'6a',pal[1]+'90',.55);return;}
      if(screenSize<5.5){
        c.fillStyle=pal[2]; c.fillRect(x-w*.34,y-d*.29-tierRise(tier,type),w*.68,d*.58+tierRise(tier,type));
        c.fillStyle=pal[0]; c.fillRect(x-w*.30,y-d*.29-tierRise(tier,type),w*.60,d*.40);
        return;
      }

      // The light points toward the rear-left. Only the two viewer-facing sides are painted.
      const axes=[sn*.41-cs*.91,cs*.41+sn*.91,-sn*.41+cs*.91,-cs*.41-sn*.91];
      const faces=[0,1,2,3].sort((a,b)=>axes[b]-axes[a]).slice(0,2);
      const facing=faces[0], close=screenSize>=12.5&&zoom>=.72, fine=screenSize>=22&&zoom>=1.3;
      const left=-w*.46,right=w*.46,back=-d*.45,front=d*.45;
      const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
      const edge=(poly,i,t)=>lerp(poly[i],poly[(i+1)&3],t);

      function solid(a,e,f,g,base,h,sun,shade,roof,trim) {
        const ground=outline(a,e,f,g,base), top=outline(a,e,f,g,h);
        for(const i of faces){
          const j=(i+1)&3;
          shape(c,[ground[i],ground[j],top[j],top[i]],i===facing?shade:sun);
        }
        if(roof)shape(c,top,roof,trim,screenSize<10?.44:.62);
        return {ground,top};
      }
      function bands(box,col,count,first=.18,last=.83,face=facing) {
        c.beginPath();
        for(let i=0;i<count;i++){
          const t=count===1?.53:first+(last-first)*i/(count-1);
          const a=lerp(edge(box.ground,face,.12),edge(box.top,face,.12),t);
          const b=lerp(edge(box.ground,face,.87),edge(box.top,face,.87),t);
          c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);
        }
        c.strokeStyle=col;c.lineWidth=.66;c.stroke();
      }
      function facade(box,t,lower,upper,col,face=facing) {
        const [a,b]=t, g=box.ground, u=box.top;
        shape(c,[lerp(edge(g,face,a),edge(u,face,a),lower),lerp(edge(g,face,b),edge(u,face,b),lower),
          lerp(edge(g,face,b),edge(u,face,b),upper),lerp(edge(g,face,a),edge(u,face,a),upper)],col);
      }
      function gable(roof,a,e,f,g,h,rise,colA,colB,trim,axis=0) {
        const mid=axis===0?(e+g)*.5:(a+f)*.5, top=roof.top;
        const r0=axis===0?project(a,mid,h+rise):project(mid,e,h+rise);
        const r1=axis===0?project(f,mid,h+rise):project(mid,g,h+rise);
        const faces2=axis===0?[[top[0],top[1],r1,r0],[r0,r1,top[2],top[3]]]:[[top[0],r0,r1,top[3]],[r0,top[1],top[2],r1]];
        const ends=axis===0?[[top[0],top[3],r0],[top[1],top[2],r1]]:[[top[0],top[1],r0],[top[3],top[2],r1]];
        const eaves=axis===0?[0,2]:[3,1];
        const lit=axes[eaves[0]]>axes[eaves[1]]?0:1;
        shape(c,ends[0],trim);shape(c,ends[1],trim);
        shape(c,faces2[1-lit],colA,trim,.45);shape(c,faces2[lit],colB,trim,.45);
        if(close)line(c,[r0,r1],'#fff6e5a1',.53);
      }
      function silo(u,v,rx,h,tint='#cbd2c6') {
        const ground=project(u,v), p=project(u,v,h);
        const rx2=Math.max(.64,rx), ry=Math.max(.6,rx*.72);
        const barrel=cl(h,0,10);
        if(barrel>0)shape(c,[{x:ground.x-rx2,y:ground.y},{x:ground.x+rx2,y:ground.y},
          {x:p.x+rx2,y:p.y},{x:p.x-rx2,y:p.y}],'#7b8d8b');
        c.beginPath();c.ellipse(p.x,p.y,rx2,ry,0,0,TAU);c.fillStyle=tint;c.fill();c.strokeStyle='#667875';c.lineWidth=.46;c.stroke();
        if(fine)circle(c,p.x-.38,p.y-.35,.44,'#f5f1d6');
      }
      const cap=type==='office'?[0,15,29,60]:type==='industrial'?[0,7,12,17]:
        type==='commercial'?[0,6.5,13,27]:[0,5.4,14,32];
      const height=cl((valid(b.height)?b.height:(cap[tier]+variety*.8+Math.max(0,level-3)*1.9)),3,85);
      const drop=height*.29;
      if(screenSize>=8){
        shape(c,outline(left,back,right,front).map(v=>({x:v.x+drop+.65,y:v.y+drop*.52+1})),'#2c473c32');
      }
      if(type==='residential'||type==='mixed') {
        if(tier===1){
          const roofs=[['#ce9076','#a65e4b'],['#7c9a88','#526f64'],['#bcac83','#918061'],['#8c9fa5','#5d7984']][variety];
          const walls=['#f4e4c7','#e6e1c5','#e3d9bc','#e4e7db'];
          const box=solid(left,back,right,front,0,height,walls[variety],'#b9af99',null);
          gable(box,left,back,right,front,height,cl(Math.min(w,d)*.28,1.8,5.2),roofs[0],roofs[1],'#765f51',variety%3===0?1:0);
          if(close){facade(box,[.12,.33],.30,.62,'#58767a');facade(box,[.61,.83],.23,.63,'#7a8581');}
          if(fine)solid(-w*.12,-d*.06,-w*.01,d*.04,height+2,height+5,'#ac856e','#80645a','#d6b5a0');
        }else{
          const baseH=Math.min(7,height*.42);
          const podium=solid(left,back,right,front,0,baseH,'#dadcbf','#b3b69d','#c4d0af','#798c77');
          const inset=tier===3?.31:.37, step=variety%2?.04:0;
          const tower=solid(-w*inset,-d*(inset+step),w*inset,d*inset,baseH,height,'#e2e4cf','#abbda7','#bdccad','#809883');
          if(close){
            bands(tower,'#598277a9',tier===3?(fine?6:4):2);
            if(fine){bands(tower,'#77968aaa',tier===3?4:2,.22,.76,faces[1]);facade(podium,[.36,.61],0,.60,'#719183');}
          }
          if(tier===3)solid(-w*.15,-d*.16,w*.11,d*.12,height,height+2.7,'#b2b7a5','#879d89','#dfcaaf','#a39989');
          if(close)circle(c,x+w*.33,y+d*.40,Math.min(1.6,w*.13),'#75966b','#a8bc8c',.45);
        }
      }else if(type==='commercial') {
        const trims=['#d08a68','#e4b56e','#6eb0b7','#90ab79'];
        const a=left,e=back*.74,f=right,g=front*.81, shop=solid(a,e,f,g,0,Math.min(8,height),'#a9c4bd','#78968f','#e2d3ad','#7b8e81');
        const face=(faces.includes(2)?2:facing);
        facade(shop,[.07,.93],.10,.69,'#426f76',face);
        facade(shop,[.04,.96],.65,.84,trims[variety],face);
        if(fine){
          for(const i of [0,1,2])facade(shop,[.12+i*.26,.26+i*.26],.20,.56,'#b1ccbd',face);
        }
        if(tier>1) {
          const order=variety%2?[-w*.33,-d*.32,w*.23,d*.24]:[-w*.27,-d*.32,w*.33,d*.23];
          const building=solid(...order,Math.min(8,height),height,'#c6d5c3','#93afa2','#e7d5b1','#8c9e8c');
          if(close)bands(building,'#527d81a1',tier===3?3:2);
          if(close||tier===3)solid(-w*.12,-d*.09,w*.14,d*.07,height,height+2.1,'#a1afb0','#728890','#d0dbcf','#8b9c91');
        }else if(close){
          solid(w*.13,-d*.18,w*.31,-d*.02,height,height+1.3,'#b0bcb0','#83958e','#edf0de');
        }
      }else if(type==='office') {
        const baseH=tier===1?4:7;
        const podium=solid(left,back,right,front,0,baseH,'#a8b7b7','#819696','#b3c7c1','#688382');
        const glass=[['#94b9bb','#548a96'],['#9eb6c9','#556f90'],['#aabbbf','#638394'],['#a4b0c2','#6d7a93']][variety];
        const inset=tier===3?.27:.34, shoulder=tier===3?height*.63:height;
        const block=solid(-w*inset,-d*.34,w*inset,d*.32,baseH,shoulder,glass[0],glass[1],'#c2d8d2','#5c8790');
        if(close)bands(block,'#ecf8e4a2',tier===3?(fine?8:4):tier===2?4:2);
        if(tier===3){
          const shift=variety%2?.07:-.06;
          const sky=solid(w*(-.20+shift),-d*.26,w*(.19+shift),d*.24,shoulder,height,glass[0],glass[1],'#cbdcda','#668b95');
          if(close)bands(sky,'#f0f8e4b5',fine?5:3);
          if(fine){bands(sky,'#dbf2e799',4,.18,.82,faces[1]);line(c,[project(w*shift,-d*.04,height),project(w*shift,-d*.04,height+7)],'#617d85',.56);}
        }else if(fine)facade(podium,[.24,.74],.06,.63,'#65858b');
      }else if(type==='industrial'){
        const wall=variety%2?'#be9677':'#c9aa87';
        const a=left,e=back*.80,f=variety%2?right*.54:right*.84,g=front*.80;
        const base=solid(a,e,f,g,0,height,wall,'#937a66','#b0aba0','#7b776b');
        // Profiled sawtooth roof: each bay has a long deck and a glazed upright return.
        const teeth=tier===1?2:3, stride=(g-e)/teeth;
        for(let i=0;i<teeth;i++){
          const s=e+i*stride, t=s+stride, ridge=s+stride*.70, peak=height+cl(stride*.65,1.6,3.8);
          shape(c,[project(a,s,height),project(f,s,height),project(f,ridge,peak),project(a,ridge,peak)],i%2?'#b3b4a9':'#c8c6b8','#858478',.45);
          shape(c,[project(a,ridge,peak),project(f,ridge,peak),project(f,t,height),project(a,t,height)],'#76928e');
        }
        facade(base,[.09,.90],.02,.20,'#6e736b');
        if(close){
          for(const i of [0,1,2])facade(base,[.10+i*.27,.24+i*.27],.21,.59,'#636f6d');
        }
        if(tier>1||variety%2===1){silo(w*.34,d*.19,Math.min(2.7,w*.17),3.6);if(tier===3&&close)silo(w*.35,-d*.23,Math.min(2.1,w*.14),3);}
        if(tier===3){silo(-w*.28,-d*.18,Math.min(1.35,w*.095),height+4,'#e9bda2');}
        else if(fine)solid(-w*.30,-d*.16,-w*.19,-d*.07,height,height+2.5,'#a7a597','#767d75','#e1d8be');
      }else{
        solid(left,back,right,front,0,height,pal[1],pal[2],pal[0],pal[2]);
      }
    }
    paintBuildings(c,buildings,camera,overlay) {
      if(camera.zoom<=.20||overlay==='zones'||!buildings.length)return;
      const d=this.dpr,w=this.width,h=this.height;
      const bw=Math.round(w*d),bh=Math.round(h*d);
      const margin=85, hw=w/camera.zoom/2+margin, hh=h/camera.zoom/2+margin;
      const draw=dest=>{
        for(const [b,z] of buildings)if(Math.abs(b.x-camera.x)<hw&&Math.abs(b.y-camera.y)<hh)this.paintBuilding(dest,b,z,overlay,camera.zoom);
      };
      // Terrain is world-cached; this transparent layer is viewport-cached so
      // cars, route markers and cursor movement never repaint static façades.
      if(bw*bh>8500000){this.buildingLayer=null;this.buildingFrame=null;draw(c);return;}
      const key=[w,h,d,camera.x,camera.y,camera.zoom].join('/');
      if(this.buildingFrame?.buildings!==buildings||this.buildingFrame?.key!==key){
        let layer=this.buildingLayer;
        if(!layer||layer.width!==bw||layer.height!==bh)layer=this.buildingLayer=offscreen(this.canvas,bw,bh);
        const ctx=layer?.getContext('2d');
        if(!ctx){draw(c);return;}
        ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
        ctx.save();ctx.translate(w/2,h/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);
        ctx.lineCap='round';ctx.lineJoin='round';draw(ctx);ctx.restore();
        this.buildingFrame={buildings,key};
      }
      c.save();c.setTransform(d,0,0,d,0,0);c.drawImage(this.buildingLayer,0,0,w,h);c.restore();
    }
    paintService(c,s,overlay,selected,zoom=1) {
      const edu=s.type?.startsWith('edu-')&&globalThis.Education?.TYPES[s.type.slice(4)];
      const civic=s.type?.startsWith('jst-')&&globalThis.Justice?.TYPES[s.type.slice(4)];
      const spec=edu||civic;
      const [col,sign]=spec?[spec.color,spec.icon]:(SERVICE[s.type]||['#64796b','·']);
      const x=+s.x,y=+s.y;
      if(!valid(x)||!valid(y))return;
      const projected=12*zoom, model=projected>=9&&overlay!=='zones', close=projected>=18;
      if(overlay==='services')circle(c,x,y,+s.radius||65,col+'22',col+'87',1.1);
      let badgeY=y,badgeX=x;
      if(model){
        const pt=(u,v,z=0)=>({x:x+u-z*.30,y:y+v-z*.65});
        const deck=(a,b,e,f,h)=>[pt(a,b,h),pt(e,b,h),pt(e,f,h),pt(a,f,h)];
        const block=(a,b,e,f,h,roof=col,wall='#cfceba',dark='#a6aa9b',base=0)=>{
          const g=deck(a,b,e,f,base), t=deck(a,b,e,f,h);
          shape(c,[g[1],g[2],t[2],t[1]],wall);
          shape(c,[g[2],g[3],t[3],t[2]],dark);
          shape(c,t,roof,'#60726b',.56);
          return t;
        };
        const panel=(a,e,h,h2,f='#5d7775',base=4.3)=>shape(c,[pt(a,base,h),pt(e,base,h),pt(e,base,h2),pt(a,base,h2)],f);
        const stripe=(a,e,v,col='#e8e8cc')=>line(c,[pt(a,v),pt(e,v)],col,.9);
        const tank=(u,v,r,h,cap='#e3ecdf')=>{
          const a=pt(u,v), b=pt(u,v,h);
          shape(c,[{x:a.x-r,y:a.y},{x:a.x+r,y:a.y},{x:b.x+r,y:b.y},{x:b.x-r,y:b.y}],'#829696');
          c.beginPath();c.ellipse(b.x,b.y,r,r*.70,0,0,TAU);c.fillStyle=cap;c.fill();c.strokeStyle=col;c.lineWidth=.61;c.stroke();
        };
        const tree=(u,v,r=2)=>{
          const a=pt(u,v), b=pt(u,v,1.8);
          circle(c,a.x+.45,a.y+.55,r,'#4058483b');
          circle(c,b.x,b.y,r,'#8db776','#66896b',.56);
          if(close)circle(c,b.x-.39,b.y-.45,r* .49,'#b2ca8c');
        };
        shape(c,deck(-10,-7.5,11,8,0),'#d0d5b6','#8a9c80',.68);
        switch(s.type){
          case 'power':
            block(-7,-4,5,4.3,5.2,'#d8bb78','#d8cfad','#a6a482');
            for(const u of [-5,-.5,4])block(u,-3,u+1.45,-1,8,'#e7d3a1','#a7aa8d','#858b77',5.2);
            line(c,[pt(-5,-2.1,8),pt(4.9,-2.1,8)],'#626f65',.62);
            block(6,-3,9,4,3,'#aeb6a3');
            break;
          case 'water':
          case 'sewage':
            tank(-3.9,-.6,3.05,4.6,s.type==='water'?'#a4d3dd':'#a4b9ac');
            tank(3.5,-1.5,3.10,5.7,s.type==='water'?'#a4d3dd':'#a4b9ac');
            block(-3,3.8,6.4,6.6,3,'#71959a');
            if(close)stripe(-8,7,6.9);
            break;
          case 'fire':
            block(-8,-4.8,8,4.3,5.7,'#b76d63','#d4bb9d','#b09887');
            for(const u of [-6.8,-2.3,2.2])panel(u,u+3.45,.35,4,'#405b5a');
            block(4,-4.9,7.6,-1.8,11,'#d38a79','#c5b39b','#9c8b7b',5.7);
            break;
          case 'police':
            block(-7.4,-5,6.8,4.3,7.1,'#839bb5','#b9c7bf','#83978f');
            block(-3.2,-2.6,4,2.2,9.3,'#c0c9c6','#a3bbb7','#79918c',7.1);
            panel(-4,4,2.5,4.9,'#596f84');
            if(close)stripe(-7.5,7.5,6.3,'#f1edd4');
            break;
          case 'jst-police':
            block(-9,-6,8,4.4,7.6,col,'#dae8ea','#859ea7');
            block(-4,-2.8,4,2,9.2,'#b3ccd5');panel(-6,5,1.9,4.2,'#4f788a');break;
          case 'jst-court':
            block(-12,-7.4,12,4.6,9.6,col,'#e3dbde','#a79aa9');
            block(-10,3.7,10,8.8,2,'#b7b4ad');for(const a of [-8,-4,0,4,8])block(a-0.55,4.7,a+0.55,5.8,8.7,'#e2e2e1');break;
          case 'jst-jail':
            shape(c,deck(-15,-10.5,15,10.5,0),'#9fa4a0','#606e68',1);
            block(-13,-8.1,11,1.6,9.8,col,'#c4c7c6','#828e91');
            block(-13,4.5,-10,8.5,7,'#a8a8a7');block(10,4.5,13,8.5,7,'#a8a8a7');
            stripe(-10,10,6.4,'#707c75');break;
          case 'jst-hall':
            block(-14,-7,14,6,8.5,col,'#e5debe','#a3a48d');
            block(-5,-4,5,3,13.5,'#ddd3a9','#d4d5b8','#929b89',8.5);
            tree(-11,8,1.7);tree(11,8,1.7);break;
          case 'edu-primary':
            shape(c,deck(-10.5,-7.5,10.5,7.5,0),'#aebd8f','#788b70',.8);
            block(-8.5,-6.2,4.4,1.9,5.2,col,'#ebd8b5','#a5987e');tree(7,5.1,1.8);
            stripe(-7,-.6,4.5,'#eee3c8');break;
          case 'edu-secondary':
            block(-12,-8.5,11.5,-.8,8.2,col,'#d2e3e1','#879fa5');
            block(3,-.5,11.4,8.2,5.1,'#9abac4');panel(-10,-3,2.3,5.7,'#506f82',-.75);
            stripe(-10,0,5.1,'#f0efe0');break;
          case 'edu-vocational':
            shape(c,deck(-13.5,-10.5,13.5,10.5,0),'#a9ad9d','#809384',.8);
            block(-12,-8,2,6.5,8.3,col,'#d5daca','#849486');
            block(4,-8,12.5,5.1,5,'#b6c1a8');panel(-10,-5,1,6.2,'#47635c',6.55);break;
          case 'edu-university':
            shape(c,deck(-17.5,-12,17.5,12,0),'#afb58f','#7b8b77',.8);
            block(-15,-10,14,-4,13,col,'#ddd2e2','#a4a1b5');
            block(-15,-4,-7.6,10,8.2,'#d3bbda');
            block(7.6,-4,15,10,9.8,'#b7a9d4');tree(-2,6,2);tree(3,6,2.1);break;
          case 'school':
            block(-8,-5.4,8,2.8,6.1,'#bd9baa','#d9c9ac','#a59a88');
            block(3,-2.8,8,5.6,7.1,'#a28aa9');
            if(close)line(c,[pt(-6.4,5.1),pt(1.5,5.1)],'#fff7d8',.78,[2,1.4]);
            tree(-7,5);
            break;
          case 'clinic':
          case 'hospital': {
            block(-8,-5,7,4.3,s.type==='hospital'?10:6.8,'#e2e1d2','#cbd4cb','#a0afa3');
            const h=s.type==='hospital'?10:6.8;
            line(c,[pt(-2.6,-.7,h),pt(3.2,-.7,h)],'#be6572',1.6);
            line(c,[pt(.30,-3.1,h),pt(.30,2.0,h)],'#be6572',1.6);
            panel(-4,4,1.7,4,'#87a8a6');
            break;
          }
          case 'park':
          case 'plaza': {
            const park=s.type==='park';
            shape(c,deck(-8.8,-6.3,9.7,6.9,0),park?'#a8ba89':'#d6cbbb','#a8af90',.74);
            line(c,[pt(-8,-4),pt(-2,0),pt(1,.2),pt(8,5)],'#ece2be',1.75);
            for(const [u,v] of [[-5,-3.8],[6,-3.8],[-6,4.1],[7,4]])tree(u,v,park?2.15:1.4);
            if(!park||close)tank(.3,.1,2.4,.65,'#a9d0d2');
            break;
          }
          case 'library':
            block(-8,-3.9,8,4.3,6.8,'#a6a0bb','#d7d0bc','#ada592');
            block(-3.9,-2.8,3.9,1.6,8.9,'#d5d0cf','#c0bab6','#9fa2aa',6.8);
            for(const u of [-5.8,-2.8,.2,3.2])panel(u,u+1.7,1.3,4.5,'#60818c');
            break;
          case 'waste':
            block(-8,-4.5,3.9,4.3,6.0,'#a59d7d','#b5ad90','#8d8f78');
            block(5,1,8.6,5,2.1,'#74918a');
            if(close)block(5,-4.4,8.9,-.2,2.3,'#9b997c');
            panel(-4.7,1.6,.30,3.8,'#707c70');
            break;
          case 'logistics':
            block(-9,-5.3,8.9,3.3,6.2,'#b9a07d','#c8b69a','#9d9b85');
            for(const u of [-7.5,-2.4,2.7]){
              panel(u,u+3.9,.25,3.5,'#68857f',3.3);
              if(close)stripe(u,u+3.9,5.8,'#f6f0d3');
            }
            break;
          default:
            block(-7,-5,7,4.3,5.8);
        }
        badgeY=y-10.1;badgeX=x+8.2;
      }
      const rad=model?(selected?5.4:4.45):selected?9.0:7.7;
      circle(c,badgeX+.8,badgeY+1.3,rad+.2,'#24403744');
      circle(c,badgeX,badgeY,rad,col,selected?'#fffde8':'#edf0d7',selected?1.55:.85);
      label(c,sign,badgeX,badgeY,model?5.7:9.3,'#fff9e6',800);
    }
    paintAgent(c, a) {
      if(!valid(a.x)||!valid(a.y)||((a.z||0)<-3&&!a.underground))return;
      const specialized=['train','metro','tram','ferry','ship','plane','cargoPlane','truck'].includes(a.kind);
      if(specialized){
        if(a.underground&&this.activeOverlay!=='routes'&&this.activeOverlay!=='elevation')return;
        const p=p3({...a,z:a.underground?0:a.z});c.save();c.translate(p.x,p.y);c.rotate(a.angle||0);
        const col=a.color||({train:'#8952b3',metro:'#7765d4',tram:'#ecab49',ferry:'#e8e8dc',ship:'#4f6a9d',plane:'#e5efe8',cargoPlane:'#e2af72',truck:'#b96849'})[a.kind];
        c.fillStyle=col;c.strokeStyle='#2a3f46';c.lineWidth=.55;
        if(a.kind==='plane'||a.kind==='cargoPlane'){
          shape(c,[{x:-12,y:-1},{x:-4,y:-1.6},{x:-6,y:-8},{x:-3,y:-8},{x:3,y:-1.5},{x:10,y:-1.2},{x:13,y:0},{x:10,y:1.2},{x:3,y:1.5},{x:-3,y:8},{x:-6,y:8},{x:-4,y:1.6},{x:-12,y:1}],col,'#455965',.8);
        }else if(a.kind==='ferry'||a.kind==='ship'){
          const n=a.kind==='ship'?13:8;line(c,[{x:-n-11,y:-4},{x:-n,y:-2}],'#eeeecb78',.7);line(c,[{x:-n-11,y:4},{x:-n,y:2}],'#eeeecb78',.7);
          shape(c,[{x:-n,y:-3.6},{x:n-3,y:-3.2},{x:n,y:0},{x:n-3,y:3.2},{x:-n,y:3.6}],col,'#354958',.7);
          for(let x=-n+2;x<n-3;x+=4){c.fillStyle=a.kind==='ship'?(x%3?'#d29376':'#aecaAD'):'#40838a';c.fillRect(x,-2,3,4);}
        }else {
          const n=a.kind==='train'?13:a.kind==='truck'?6.5:8;
          c.fillStyle='#162b2f55';c.fillRect(-n,-1.5,n*2+1,4);
          c.fillStyle=col;c.fillRect(-n,-2.25,n*2,4.5);
          c.fillStyle='#355562';c.fillRect(n-3,-1.7,2.1,3.4);
          for(let x=-n+3;x<n-4;x+=4){c.fillStyle='#bbcacf';c.fillRect(x,-1.2,2,2.4);}
        }
        c.restore();return;
      }
      if(a.kind==='bike'){
        const p=p3(a);c.save();c.translate(p.x,p.y);c.rotate(a.angle||0);
        for(const x of [-1.3,1.3])circle(c,x,0,.72,'#263e43','#c3eada',.2);
        line(c,[{x:-1.3,y:0},{x:0,y:-.58},{x:1.3,y:0}],'#e4d761',.45);
        circle(c,-.15,-.70,.53,a.color||'#eac16c');c.restore();return;
      }
      const p=p3(a), style=a.kind??a.type, bus=style==='bus', walking=['walk','pedestrian','walker'].includes(style);
      if(walking) {
        c.save();if(valid(a.opacity))c.globalAlpha*=cl(a.opacity,0,1);
        const angle=valid(a.angle)?a.angle:0, dx=Math.cos(angle),dy=Math.sin(angle),nx=-dy,ny=dx;
        const phase=valid(a.phase)?a.phase:(this.frameTime||0)*.009+(a.x+a.y)%7;
        const swing=Math.sin(phase)*1.4, bounce=(1-Math.abs(Math.sin(phase)))*.25;
        const close=this.camera.zoom>=1.16, dark='#314946',skin='#f0c6a0',coat=a.color||'#e9b176';
        const pnt=(u,v,h)=>({x:p.x+u*dx+v*nx-h*.13,y:p.y+u*dy+v*ny-h*.93});
        const shadow=pnt(.26,.45,-.13);
        circle(c,shadow.x,shadow.y,close?1.55:1.23,'#253e3a3f');
        const hip=pnt(0,0,1.76+bounce),chest=pnt(.15,0,2.95+bounce),head=pnt(.24,0,4.03+bounce);
        c.lineCap='round';c.lineJoin='round';
        for(const side of [-1,1]){
          const foot=pnt(side*swing,side*.44,Math.max(0,side*Math.sin(phase))*.30);
          const knee=pnt(side*swing*.48,side*.32,.74+bounce*.39);
          line(c,[hip,knee,foot],dark,close?.66:.80);
          if(close)line(c,[foot,pnt(side*swing+.39,side*.44,Math.max(0,side*Math.sin(phase))*.30)],'#273c3b',.49);
        }
        if(close)for(const side of [-1,1]){
          const arm=pnt(.08,side*.57,2.73+bounce),hand=pnt(-side*swing*.61,side*.72,1.59+bounce);
          line(c,[chest,arm,hand],dark,.72);
          circle(c,hand.x,hand.y,.29,skin);
        }
        line(c,[hip,chest,head],dark,close?1.58:1.53);
        line(c,[hip,chest],coat,close?1.19:1.20);
        circle(c,head.x,head.y,close?.74:.69,skin,dark,.37);
        c.restore();
      } else {
        c.save();c.translate(p.x,p.y);c.rotate(+a.angle||0);
        const w=bus?10.1:4.5,h=bus?2.65:1.86,body=a.color||(bus?'#eeb663':'#edf1c8');
        const rounded=(x,y,w,h,r,color,stroke)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.32;c.stroke();}};
        rounded(-w*.48+.42,-h*.5+.46,w,h,.54,'#23303463');
        rounded(-w*.5,-h*.5,w,h,bus?.48:.67,body,'#293b41');
        rounded(w*.16,-h*.40,w*.14,h*.80,.21,'#26434d');
        rounded(-w*.32,-h*.39,w*.13,h*.78,.18,'#344c51');
        if(bus){c.fillStyle='#34656a';for(let x=-w*.12;x<w*.14;x+=1.04){c.fillRect(x,-h*.48,.71,.30);c.fillRect(x,h*.17,.71,.30);}}
        c.fillStyle='#fff5bd';c.fillRect(w*.42,-h*.36,.37,.37);c.fillRect(w*.42,h*.16,.37,.37);
        c.fillStyle=a.queued?'#ff6659':'#a95650';c.fillRect(-w*.49,-h*.34,.32,.36);c.fillRect(-w*.49,h*.14,.32,.36);
        c.restore();
      }
    }
    paintVehicles(c, edges, busLines, ids, explicit, time, traffic) {
      if(Array.isArray(explicit)){
        const z=this.camera.zoom,left=this.camera.x-this.width/2/z-45,right=this.camera.x+this.width/2/z+45;
        const top=this.camera.y-this.height/2/z-45,bottom=this.camera.y+this.height/2/z+45;
        for(const a of explicit){
          const y=p3(a).y;if(a.x<left||a.x>right||y<top||y>bottom)continue;
          this.paintAgent(c,a);
        }
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
      const t=this.frameTime=valid(timeMs)?Math.max(0,timeMs):typeof performance==='object'?performance.now():Date.now();
      const overlay=this.activeOverlay=opts.overlay??'none', metrics=opts.metrics??city.metrics??{}, selected=opts.selected||{};
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
      const roadMesh=this.roadMesh(roads,nodes);
      const buildings=zones.flatMap(z=>array(z.buildings).map(b=>[b,z])).sort((a,b)=>a[0].y-b[0].y);
      const restricted=[...new Set(array(city.turns).map(r=>r.node))].map(id=>nodes[id]).filter(Boolean);
      this.cachedScene={nodes,zones,sr,busLines,edges,ids,roads,buildings,roadMesh,restricted};this.latestCity=city;
      }
      const {nodes,zones,sr,busLines,edges,ids,roads,buildings,roadMesh,restricted}=this.cachedScene;
      c.setTransform(d,0,0,d,0,0);c.fillStyle='#9cb290';c.fillRect(0,0,this.width,this.height);
      c.save();c.translate(this.width/2,this.height/2);c.scale(camera.zoom,camera.zoom);c.translate(-camera.x,-camera.y);
      if(this.terrain)c.drawImage(this.terrain,0,0);else this.paintGround(c,w,h);
      c.save();c.beginPath();c.rect(0,0,w,h);c.clip();
      const districtList=array(city.districts), transit=city.transit||{};
      if(districtList.length)for(const d of districtList){
        const item=globalThis.Districts?.TYPES[d.type],active=overlay==='districts'||overlay==='resources'||selected.district===d.id;
        if(item)shape(c,d.points,item.color+(active?'7a':'38'),item.color+(active?'ff':'a6'),active?1.8:.8);
      }
      this.paintZones(c,zones,overlay,selected);
      const field=metrics.coverageGrid;
      if(field?.key===overlay){
        const shade=overlay==='resources'?'#bc8642':SERVICE[overlay]?.[0]||'#2d97b1';
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
      const visible=bb=>bb.maxX>=left&&bb.minX<=right&&bb.maxY>=top&&bb.minY<=bottom;
      this.paintRoadMesh(c,roadMesh,overlay,load,metrics.queue?.edgeTraffic,selected,visible);
      for(const link of array(city.activeTravel)){
        const spec=globalThis.ActiveTravel?.TYPES?.[link.type];if(!spec)continue;
        const ps=link.points.map(p3),sel=selected.active===link.id,a=overlay==='active',width=spec.width;
        if(!a&&!sel&&this.camera.zoom<.8&&link.type!=='bridge')continue;
        if(link.type==='bridge')line(c,link.points.map(pt=>({x:pt.x+1.5,y:pt.y+1.6})),'#172d4060',width+2.8);
        line(c,ps,sel?'#ffe0a4':'#254355b0',width+1.2);
        line(c,ps,spec.color,width);
        if(link.type==='bike')line(c,ps,'#e4ffe8a0',.45,[3,4]);
      }

      if(['traffic','parking'].includes(overlay)&&metrics.queue?.directions){
        for(const [,e,pts,bb] of roads){
          const pair=metrics.queue.directions[e.id];
          if(!pair||!visible(bb)||pts.length<2||bb.top<0)continue;
          const length=Number(e.len)||sample(pts,1)?.length||1;
          for(let i=0;i<pair.length;i++){
            const d=pair[i];
            if(!d.queued||d.tail<=0)continue;
            const f=Math.min(1,d.tail/length);
            const geo=[],steps=Math.min(14,Math.max(2,Math.ceil(d.tail/9)));
            const spread=Math.max(2.3,Math.min(6,(e.lanes||2)*1.15));
            for(let k=0;k<=steps;k++){
              const sampleAt=sample(pts,i?f*(1-k/steps):1-f+f*k/steps);
              if(sampleAt.z<-.5)continue;
              const q=p3(sampleAt),theta=sampleAt.angle+(i?Math.PI:0);
              geo.push({x:q.x-Math.sin(theta)*spread,y:q.y+Math.cos(theta)*spread,theta});
            }
            if(geo.length<2)continue;
            const color=d.spill?'#e6a4fd':d.causes?.parking?'#8fd2ff':'#ffc27a';
            line(c,geo,'#25223bc0',4.8);
            line(c,geo,color,2.4,d.blockedBy&&!d.spill?[3,2]:[]);
            const arrowPoint=geo.at(-1);arrow(c,arrowPoint,arrowPoint.theta,color,3.5);
            if(d.spill){const origin=geo[0];circle(c,origin.x,origin.y,3.3,'#9457b5','#fff6ff',.85);}
          }
        }
      }
      if(metrics.closed?.length){
        const closed=new Set(metrics.closed);
        for(const [,e,pts,bb] of roads)if(pts.length>1&&closed.has(e.id)&&visible(bb)){
          line(c,pts.map(p3),'#ee9571',2.5,[5,4]);const q=p3(sample(pts,.5));circle(c,q.x,q.y,5,'#9b452e','#ffd7ba',1.2);label(c,'×',q.x,q.y+.1,7,'#fff0db',850);
        }
      }
      if(overlay==='water'||overlay==='power'){
        const color=overlay==='water'?'#2682ca':'#edb33f';
        for(const u of array(city.utilities).filter(l=>l.type===overlay)){
          const d=metrics.utilityMetrics?.lines?.[u.id];line(c,u.points,'#2b444390',5);line(c,u.points,d?.connected?color:'#9b6968',selected.utility===u.id?4:2.4,d?.connected?[]:[4,3]);
        }
      }
      const routeLayer=overlay==='routes'||overlay==='connections'||overlay==='elevation';
      for(const q of array(transit.tracks)){const mode=globalThis.Transit?.MODES[q.mode];if(!mode||q.mode==='metro'&&!routeLayer)continue;const ps=q.mode==='metro'?q.points:q.points.map(p3);
        line(c,ps,'#f1ebefd0',5);line(c,ps,mode.color,2,q.mode==='metro'?[4,3]:[]);
      }
      if(routeLayer)for(const v of Object.values(metrics.transitMetrics?.lines||{}))if(v.valid){
        let points=v.mode==='metro'?v.path:v.path.map(p3);line(c,points,v.color||'#7659a1',2.5,v.mode==='plane'||v.mode==='cargoPlane'?[11,7]:[6,5]);
      }
      if(overlay==='traffic'||opts.tool==='junction')for(const n of restricted){
        const p=p3(n);circle(c,p.x-5,p.y-5,2.8,'#e99872','#562f28',.65);
        line(c,[{x:p.x-6.2,y:p.y-5},{x:p.x-3.8,y:p.y-5}],'#fff2dc',.66);
      }
      if(overlay==='traffic'||overlay==='routes'){
        for(const f of metrics.signals||[]){const n=nodes[f.node];if(!n)continue;const p=p3(n);circle(c,p.x+3,p.y-3,1.9,f.phase==='all-red'?'#f3987f':f.phase==='east-west'?'#90ed80':'#9bd5ff','#355c4c',.5);}
      }
      if(overlay==='connections'||opts.tool==='road'||opts.tool==='track'||opts.tool==='line'){
        const all=overlay==='connections'?[...(city.roadGates||[]),...(city.transitGates||[])]:opts.tool==='road'?city.roadGates||[]:city.transitGates||[];
        for(const g of all){const x=cl(g.x,10,w-10),y=cl(g.y,10,h-10);circle(c,x,y,5.3,'#efeac3','#426177',1.3);label(c,'↗',x,y,7,'#2c566a',850);if(overlay==='connections'||camera.zoom>1.25)label(c,g.name||g.id,cl(x,75,w-75),y+13,9,'#294652',780);}
      }
      if(overlay==='traffic' || overlay==='routes' || overlay==='transit'){
        for(const bus of busLines)for(const step of array(bus.path)){
          const route=ids.get(String(step?.edge?.id??step?.edge??step?.id??step));
          if (route?.length>1)line(c,route.map(p3),'#c4f7de',1.35,[6,3]);
        }
      }
      this.paintBuildings(c,buildings,camera,overlay);
      if(overlay==='traffic'||overlay==='routes'||overlay==='transit'||opts.tool==='bus'){
        for(const bus of busLines)for(const id of array(bus.stops)){
          const node=nodes[id?.node??id?.id??id];if(!node)continue;
          const p=p3(node);circle(c,p.x,p.y,3.8,'#f0fcde','#348478',1.55);
        }
      }
      for(const s of sr)if(!field||field.key!==overlay||s.type===overlay)this.paintService(c,s,overlay==='zones'?'zones':'none',selected.justice===s.id||selected.school===s.id||selected.service===s.id||selected.type==='service'&&selected.id===s.id,camera.zoom);
      for(const s of array(transit.stations)){
        const f=globalThis.Transit?.FACILITIES[s.type];if(!f)continue;
        if(s.x<left||s.x>right||s.y<top||s.y>bottom)continue;
        const x=s.x,y=s.y,r=cl(f.radius*.44,4,19),sel=selected.station===s.id;
        if(f.runway){
         shape(c,[{x:x-34,y:y-4},{x:x+34,y:y-4},{x:x+34,y:y+3},{x:x-34,y:y+3}],'#60656d','#f3edd9',.9);
         line(c,[{x:x-33,y},{x:x+33,y}],'#fff6e4',.85,[5,3]);
        }else if(f.shore){
         shape(c,[{x:x-8,y:y+2},{x:x+24,y:y+2},{x:x+24,y:y+6},{x:x-8,y:y+6}],'#aa8f72','#ead1ae',.8);
        }
        const sy=y-(f.runway?10:0);
        shape(c,[{x:x-r,y:sy+r*.55},{x:x+r,y:sy+r*.55},{x:x+r,y:sy+r*.24},{x:x-r,y:sy+r*.24}],'#525f63');
        shape(c,[{x:x-r,y:sy+r*.24},{x:x+r,y:sy+r*.24},{x:x+r,y:sy-r*.68},{x:x-r,y:sy-r*.68}],f.color,sel?'#ffffcf':'#e9efdc',sel?2:1);
        line(c,[{x:x-r*.77,y:sy-r*.08},{x:x+r*.77,y:sy-r*.08}],'#f0efe2',.8,[2,2]);
        if(routeLayer||sel)label(c,f.name,x,sy-r-7,8,'#304d5b',800);
      }
      const parking=metrics.queue?.parking?.sites||{};
      const drawParking=overlay==='parking'||overlay==='traffic';
      for(const lot of array(city.parking)){
        if(lot.x<left||lot.x>right||lot.y<top||lot.y>bottom)continue;
        const spec=globalThis.Parking?.LOTS?.[lot.type];if(!spec)continue;
        const {x,y}=lot,r=parking[lot.id],full=r&&r.occupied>=r.capacity,col=!r?'#617081':full?'#b66a71':'#4782a7';
        const w=spec.w/2,h=spec.h/2,sel=selected.parking===lot.id;
        shape(c,[{x:x-w,y:y-h},{x:x+w,y:y-h},{x:x+w,y:y+h},{x:x-w,y:y+h}],col,sel?'#fff2b8':'#c3e1ec',sel?1.8:.8);
        if(lot.type==='garage'){
          shape(c,[{x:x-w,y:y-h-6},{x:x+w,y:y-h-6},{x:x+w,y:y-h},{x:x-w,y:y-h}],'#7493a7');
          line(c,[{x:x-w+2,y:y-h-2.8},{x:x+w-2,y:y-h-2.8}],'#c6dce5',.8);
        }
        if(lot.type==='underground'){
          shape(c,[{x:x-w+1,y:y-h+1},{x:x+w-1,y:y-h+1},{x:x+w-3,y:y+h-1},{x:x-w+3,y:y+h-1}],'#283449','#abc4dc',.65);
          for(let i=0;i<3;i++)line(c,[{x:x-w+3+i*.6,y:y+h-2-i*1.3},{x:x+w-3-i*.6,y:y+h-2-i*1.3}],'#789bb9',.55);
          label(c,'P↓',x,y-1,8.5,'#f4f8ff',850);
        }else{
          for(let v=-w+2;v<=w-1;v+=4)line(c,[{x:x+v,y:y-h+1},{x:x+v,y:y-h+4}],'#e1edf2',.6);
          label(c,'P',x,y+1,8.8,'#f4f8f8',850);
        }
        if(drawParking||sel)label(c,r?r.occupied+'/'+r.capacity:'未接通',x,y+h+6,7.9,'#253d4e',800);
      }
      if(overlay==='parking'&&camera.zoom>=.65){
        for(const p of Object.values(parking)){
          if(p.type!=='curb'||p.x<left||p.x>right||p.y<top||p.y>bottom)continue;
          const x=p.x+5,y=p.y-5,full=p.occupied>=p.capacity;
          circle(c,x,y,3.8,full?'#ce757c':'#60aed5','#eaffff',.75);
          if(camera.zoom>.95)label(c,p.occupied+'/'+p.capacity,x+5,y-5,6.5,'#183952',800,'left');
        }
      }
      this.paintVehicles(c,edges,busLines,ids,opts.agents??city.agents,t,load);
      for(const [i, g] of array(opts.batchGhosts).entries()){
        const p=array(g.points).map(point).map(p3);
        if(!p.length)continue;
        if(g.closed&&p.length>2)shape(c,p,'#71baf52c','#aadbff',1.25);
        else if(p.length>1)line(c,p,'#aadcffc9',Math.max(1.2,(g.width||8)*.19),[4,3]);
        const q=p[Math.floor((p.length-1)/2)];
        circle(c,q.x,q.y,3.6,'#265179','#d3eeff',.8);label(c,String(i+1),q.x,q.y,4.9,'#fff',850);
      }
      if(overlay==='justice'&&opts.justice){
        const styles={investigation:'#7dcfff',court:'#c69bff',transfer:'#ffae6f'};
        for(const q of array(opts.justice.cases)){
          if(!styles[q.stage]||q.x<left||q.x>right||q.y<top||q.y>bottom)continue;
          circle(c,q.x,q.y,4.8,styles[q.stage],'#242539',.85);
        }
      }
      if(overlay==='schoolAccess'&&opts.education){
        for(const q of Object.values(opts.education.byLot)){
          if(!q.students.demand||q.x<left||q.x>right||q.y<top||q.y>bottom)continue;
          const col=q.waiting?(q.enrolled?'#ffe378':'#ff8e7c'):'#89f5b3';
          circle(c,q.x,q.y,4.4,col,'#183c36',.9);
        }
        for(const s of opts.education.sites){
          if(s.x<left||s.x>right||s.y<top||s.y>bottom)continue;
          const y=s.y+10,z=s.enrolled+'/'+s.capacity;
          circle(c,s.x,y,Math.max(5,z.length*1.55),'#193c36','#cce5c6',.85);
          label(c,z,s.x,y,5.1,'#eaf5e2',750);
        }
      }
      if(overlay==='incidents'){
        const risk=opts.eventRisk?.risks||[];
        for(const q of risk){
          if(q.x<left||q.x>right||q.y<top||q.y>bottom)continue;
          const strength=opts.civicFilter&&opts.civicFilter!=='all'?(q.risks?.[opts.civicFilter]||0):Math.max(0,...Object.values(q.risks||{}));
          if(strength>.17)circle(c,q.x,q.y,6+strength*7,'#e99b5c3b');
        }
        for(const e of array(opts.civicEvents)){
          if(opts.civicFilter&&opts.civicFilter!=='all'&&opts.civicFilter!==e.type||!Number.isFinite(e.x)||!Number.isFinite(e.y)||e.x<left||e.x>right||e.y<top||e.y>bottom)continue;
          const spec=globalThis.CivicIncidents?.TYPES[e.type];if(!spec)continue;
          circle(c,e.x,e.y,7,e.priority?'#6e3e4e':'#334454',spec.color,1.3);
          label(c,spec.icon||'!',e.x,e.y-.3,8.4,'#f6f2e5',850);
        }
      }
      const preview=opts.preview;
      const proposed=array(preview?.points??preview?.pts??preview?.poly??(Array.isArray(preview)?preview:null)).map(point).map(p3);
      if(preview?.detour?.length>1){
        const ps=preview.detour.map(p3);
        line(c,ps,'#092a46a6',4.8);line(c,ps,'#91ccef',1.8,[5,3]);
        for(const q of [ps[0],ps.at(-1)])circle(c,q.x,q.y,3.3,'#d6edff','#416f9a',1);
      }
      if(preview?.movement){
        const {entry,at,exits}=preview.movement,a=p3(entry),n=p3(at);
        const inbound=Math.atan2(n.y-a.y,n.x-a.x);
        line(c,[a,n],'#142731bd',5.6);line(c,[a,n],'#98daff',2.15);
        arrow(c,{x:a.x*.53+n.x*.47,y:a.y*.53+n.y*.47},inbound,'#98daff',4.1);
        for(const next of exits){
          const b=p3(next.point),col=next.blocked?'#ffab98':'#aff2b4';
          let ps=[n,b],angle=Math.atan2(b.y-n.y,b.x-n.x);
          if(next.uturn){
            const nx=-Math.sin(angle)*4,ny=Math.cos(angle)*4;
            const mid={x:(n.x+b.x)/2+nx,y:(n.y+b.y)/2+ny};
            const endpoint={x:b.x+nx,y:b.y+ny};ps=[n,mid,endpoint];angle=Math.atan2(endpoint.y-mid.y,endpoint.x-mid.x);
          }
          const end=ps.at(-1);
          line(c,ps,'#203336b4',4.0);
          line(c,ps,col,1.9,next.blocked?[3,2]:[]);
          if(next.blocked){circle(c,end.x,end.y,3.0,'#aa4c41','#ffe9d5',.75);line(c,[{x:end.x-1.4,y:end.y},{x:end.x+1.4,y:end.y}],'#fff1de',.8);}
          else arrow(c,end,angle,col,3.7);
        }
        circle(c,n.x,n.y,3.3,'#ecfaf2','#304d51',1);
      }else if(proposed.length){
        const ok=preview?.valid!==false, col=ok?'#e0fff0':'#fff2e1', accent=ok?'#26745d':'#b84949';
        if(preview.closed||preview.poly||preview.kind==='zone')shape(c,proposed,ok?'#b5edd778':'#ed9c8d80',accent,1.3);
        else if(proposed.length>1){
          if(preview.width){
            line(c,proposed,ok?'#92e2c58c':'#f481738f',preview.width);
            line(c,proposed,col,1.8,[5,3]);line(c,proposed,accent,.8,[5,3]);
          }else{line(c,proposed,col,8.2);line(c,proposed,accent,4,[6,4]);}
        }
        for(const p of [proposed[0],proposed.at(-1)])circle(c,p.x,p.y,3.9,col,accent,1.3);
        if(preview.snapped){const p=proposed.at(-1);circle(c,p.x,p.y,7.4,null,accent,1.3);}
        for(const point of array(preview.junctions)){const p=p3(point);circle(c,p.x,p.y,4.5,'#f9ffe9',accent,1.35);}
        for(const {p:raw} of array(preview.overpasses)){const p=p3(raw);circle(c,p.x,p.y,4.5,'#dfedfc','#366a9a',1.35);
          line(c,[{x:p.x-2.1,y:p.y-.85},{x:p.x+2.1,y:p.y-.85}],'#366a9a',.75);
          line(c,[{x:p.x-2.1,y:p.y+.85},{x:p.x+2.1,y:p.y+.85}],'#366a9a',.75);
        }
        if(preview.arrow&&proposed.length>1){
          const k=Math.floor(proposed.length*.55),a=proposed[k-1],b=proposed[k];arrow(c,b,Math.atan2(b.y-a.y,b.x-a.x),col,5.2);
        }
        if(preview.control){
          const k=p3(preview.control);line(c,[proposed[0],k,proposed.at(-1)],'#35585885',.8,[3,3]);circle(c,k.x,k.y,3.2,col,accent,1.1);
        }
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
