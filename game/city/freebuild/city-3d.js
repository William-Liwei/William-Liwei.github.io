/* City Blueprint: real depth-tested perspective renderer. World y increases south, z up. */
(function(root,factory){const out=typeof module==='object'?factory(require('./network.js')):factory(root.Network);if(typeof module==='object')module.exports=out;else root.City3D=out;})(globalThis,function(N){
'use strict';
const PI=Math.PI,TAU=PI*2,finite=Number.isFinite,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),sane=(n,d)=>finite(n)?n:d;
const xy=p=>p&&finite(p.x)&&finite(p.y),list=p=>Array.isArray(p)?p:[],vec=(x,y,z)=>[x,-y,z],xyz=(p,h)=>vec(p.x,p.y,h);
const minus=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const scale=(a,p)=>[a[0]*p,a[1]*p,a[2]*p],plus=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
function norm(a){const l=Math.hypot(...a);return l>1e-8?scale(a,1/l):[0,0,1];}
const mix=(a,b,t)=>a.map((q,i)=>q+(b[i]-q)*t),point=(x,y,z=0)=>({x,y,z}),hypot=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=(x,y,s=0)=>((Math.sin(x*127.1+y*311.7+s*53.23)*43758.5453)%1+1)%1;
const COLORS=Object.create(null);
function color(s,backup='#69816c'){
 if(Array.isArray(s)&&s.length>=3)return s;
 if(typeof s!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s))s=backup;
 if(!COLORS[s]){
  const h=s.length===4?s.slice(1).split('').map(c=>c+c).join(''):s.slice(1,7);
  COLORS[s]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);
 }
 return COLORS[s];
}
const dark=(c,f)=>c.map(v=>clamp(v*f,0,1)),ce=(s,f=1)=>dark(color(s),f);
const TYPE={
 residential:['#ded3b8','#b78573','#eeddc4','#4d7274'],
 commercial:['#68a9b7','#387283','#d4e5df','#8dd3d4'],
 industrial:['#ad917a','#645b59','#c8baac','#666b69'],
 office:['#7694b1','#345a82','#c5d9e9','#8ec0da'],
 park:['#88b475','#487854','#a4bd8b','#628657']
};
const STRUCTURE={
 fire:['#c76643',24,18,10],water:['#547e89',22,17,11],power:['#b39a60',26,19,14],police:['#547a98',25,20,11],school:['#9d7464',27,22,13],
 hospital:['#b27885',31,24,14],clinic:['#bd8190',21,16,9],airport:['#6d8c9a',45,26,14],cargoAirport:['#697885',45,27,14],cargoPort:['#6d818c',29,18,13],ferryTerminal:['#4d91a4',24,14,8],shipyard:['#638d91',24,19,10],
 metroStation:['#71689c',19,14,7],railStation:['#a3829f',26,16,10],tramStop:['#bb8c53',12,8,4],busDepot:['#5b8b80',24,19,9],
 'taxi-depot':['#ba9633',24,18,8],parking:['#838384',22,18,5],park:['#7ba55d',16,16,2]
};
const VERTEX=`
attribute vec3 a_position,a_normal,a_color;
uniform mat4 u_mat;
varying vec3 v_position,v_normal,v_color;
varying float v_depth;
void main(){
 vec4 p=u_mat*vec4(a_position,1.0);
 gl_Position=p;v_position=a_position;v_normal=a_normal;v_color=a_color;v_depth=p.w;
}`;
const FRAGMENT=`
precision mediump float;
varying vec3 v_position,v_normal,v_color;
varying float v_depth;
uniform vec3 u_eye,u_haze;
uniform float u_water,u_time;
void main(){
 vec3 sun=normalize(vec3(-.55,-.39,.83));
 vec3 n=normalize(v_normal);
 float bright=.62+.36*max(0.0,dot(n,sun))+.04*max(0.0,n.z);
 vec3 col=v_color*bright;
 if(u_water>.5){
  float wave=sin(v_position.y*.09+v_position.x*.033-u_time*1.24)*.42+sin(v_position.x*.13-v_position.y*.08+u_time*.73)*.36+sin(v_position.y*.25+u_time*.48)*.22;
  vec3 wn=normalize(vec3(wave*.13,.11*sin(v_position.x*.08-v_position.y*.07+u_time),1.0));
  vec3 v=normalize(u_eye-v_position);
  float refl=pow(1.0-max(0.0,dot(v,wn)),3.0);
  float sparkle=pow(max(0.0,dot(reflect(-sun,wn),v)),23.0);
  col=v_color+wave*.025+refl*vec3(.12,.17,.17)+sparkle*vec3(.18,.20,.13);
 }
 float fog=clamp((v_depth-820.0)/3550.0,0.0,.56);
 gl_FragColor=vec4(mix(col,u_haze,fog),1.0);
}`;
function program(gl){
 const compile=(kind,src)=>{
  const s=gl.createShader(kind);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(log);}
  return s;
 };
 const v=compile(gl.VERTEX_SHADER,VERTEX),f=compile(gl.FRAGMENT_SHADER,FRAGMENT),p=gl.createProgram();
 gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
 return {p,position:gl.getAttribLocation(p,'a_position'),normal:gl.getAttribLocation(p,'a_normal'),color:gl.getAttribLocation(p,'a_color'),
   mat:gl.getUniformLocation(p,'u_mat'),eye:gl.getUniformLocation(p,'u_eye'),haze:gl.getUniformLocation(p,'u_haze'),
   water:gl.getUniformLocation(p,'u_water'),time:gl.getUniformLocation(p,'u_time')};
}
function matrix(eye,f,s,u,aspect,tan,near=4,far=7000){
 const inv=1/tan,qa=(far+near)/(far-near),qb=-2*near*far/(far-near),a=inv/aspect,b=inv;
 return new Float32Array([a*s[0],b*u[0],qa*f[0],f[0],a*s[1],b*u[1],qa*f[1],f[1],a*s[2],b*u[2],qa*f[2],f[2],-a*dot(s,eye),-b*dot(u,eye),qb-qa*dot(f,eye),-dot(f,eye)]);
}
class Mesh{
 constructor(){this.v=[];}
 vert(p,n,c){const v=this.v;v.push(p[0],p[1],p[2],n[0],n[1],n[2],c[0],c[1],c[2]);}
 tri(a,b,c,col,aim,norms,colors){
  let n=norms?null:norm(cross(minus(b,a),minus(c,a)));
  if(n&&aim&&dot(n,aim)<0)n=scale(n,-1);
  this.vert(a,norms?.[0]||n,colors?.[0]||col);this.vert(b,norms?.[1]||n,colors?.[1]||col);this.vert(c,norms?.[2]||n,colors?.[2]||col);
 }
 quad(a,b,c,d,col,aim){this.tri(a,b,c,col,aim);this.tri(a,c,d,col,aim);}
 typed(){return new Float32Array(this.v);}
}
function corners(x,y,w,d,a=0){
 const cs=Math.cos(a),sn=Math.sin(a);
 return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>point(x+u*cs-v*sn,y+u*sn+v*cs));
}
function box(mesh,x,y,w,d,lo,hi,col,a=0,roof=col){
 if(hi<=lo||w<=0||d<=0)return;
 const pts=corners(x,y,w,d,a),center=vec(x,y,0),b=pts.map(p=>xyz(p,lo)),t=pts.map(p=>xyz(p,hi));
 mesh.quad(...t,roof,[0,0,1]);
 for(let i=0;i<4;i++){const j=(i+1)%4;mesh.quad(b[i],b[j],t[j],t[i],col,minus(scale(plus(b[i],b[j]),.5),vec(x,y,lo)));}
}
function cylinder(mesh,x,y,r,lo,hi,col,roof=col,sides=10,tip=r){
 const b=[],t=[];
 for(let i=0;i<sides;i++){const a=i/sides*TAU;b.push(vec(x+r*Math.cos(a),y+r*Math.sin(a),lo));t.push(vec(x+tip*Math.cos(a),y+tip*Math.sin(a),hi));}
 const center=vec(x,y,hi);
 for(let i=0;i<sides;i++){const j=(i+1)%sides;mesh.quad(b[i],b[j],t[j],t[i],col,minus(scale(plus(b[i],b[j]),.5),vec(x,y,lo)));if(tip>.005)mesh.tri(center,t[i],t[j],roof,[0,0,1]);}
}
function plate(mesh,pts,zAt,col){
 if(pts.length<3)return;
 const c=pts.map(p=>xyz(p,zAt(p)));
 for(let i=1;i<c.length-1;i++)mesh.tri(c[0],c[i],c[i+1],col,[0,0,1]);
}
function roof(mesh,x,y,w,d,h,rise,col,a){
 const p=corners(x,y,w,d,a),lo=p.map(q=>xyz(q,h));
 const m1=scale(plus(lo[0],lo[3]),.5),m2=scale(plus(lo[1],lo[2]),.5);m1[2]+=rise;m2[2]+=rise;
 mesh.quad(lo[0],lo[1],m2,m1,col,[0,0,1]);mesh.quad(lo[3],lo[2],m2,m1,col,[0,0,1]);
 mesh.tri(lo[0],lo[3],m1,dark(col,.81),minus(m1,m2));mesh.tri(lo[1],lo[2],m2,dark(col,.81),minus(m2,m1));
}
class City3D{
 constructor(canvas,opt={}){
  this.canvas=canvas;this.opt=opt;this.worldWidth=sane(opt.width,1200);this.worldHeight=sane(opt.height,800);this.width=0;this.height=0;this.dpr=1;this.available=false;this.gl=null;this.meshes={};this.world=null;this.haze=color(opt.haze||'#dce8e5');
  this.camera={};this.reset(opt.camera);
  if(!canvas?.getContext)return;
  this._attach=()=>this.init();
  this._lose=e=>{e.preventDefault?.();this.available=false;this.meshes={};this.baseKey=null;this.cityKey=null;this.previewKey=null;this.opt.onLoss?.(e,this);};
  canvas.addEventListener?.('webglcontextlost',this._lose);canvas.addEventListener?.('webglcontextrestored',this._attach);
  this.init();
 }
 init(){
  try{
   const opts={alpha:false,depth:true,antialias:true,stencil:false,preserveDrawingBuffer:!!this.opt.preserveDrawingBuffer,powerPreference:'default'};
   const gl=this.canvas.getContext('webgl',opts)||this.canvas.getContext('experimental-webgl',opts);if(!gl)return false;
   this.gl=gl;this.sh=program(gl);this.meshes={};this.baseKey=this.cityKey=this.previewKey=null;
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
   this.available=true;this.error=null;this.resize();return true;
  }catch(err){this.available=false;this.error=String(err?.message||err);return false;}
 }
 dispose(){
  if(this.available)for(const m of Object.values(this.meshes))if(m?.buffer)this.gl.deleteBuffer(m.buffer);
  if(this.available&&this.sh?.p)this.gl.deleteProgram(this.sh.p);
  this.canvas?.removeEventListener?.('webglcontextlost',this._lose);this.canvas?.removeEventListener?.('webglcontextrestored',this._attach);
  this.meshes={};this.available=false;
 }
 reset(q={}){
  q=q||{};
  this.camera.x=sane(q.x,this.worldWidth/2);this.camera.y=sane(q.y,this.worldHeight/2);
  this.camera.yaw=sane(q.yaw,-.31);this.camera.pitch=clamp(sane(q.pitch,.83),.14,1.50);
  this.camera.distance=clamp(sane(q.distance,Math.max(550,this.worldWidth*.80)),45,3200);
  return this.camera;
 }
 resize(){
  if(!this.canvas)return false;
  const r=this.canvas.getBoundingClientRect?.(),w=r?.width||this.canvas.clientWidth||this.width||this.canvas.width||this.worldWidth,h=r?.height||this.canvas.clientHeight||this.height||this.canvas.height||this.worldHeight;
  const d=clamp(sane(this.opt.dpr,sane(globalThis.devicePixelRatio,1)),1,2);
  if(this.width===w&&this.height===h&&this.dpr===d)return false;
  this.width=w;this.height=h;this.dpr=d;this.canvas.width=Math.max(1,Math.round(w*d));this.canvas.height=Math.max(1,Math.round(h*d));return true;
 }
 raw(p){
  const fn=this.opt.heightAt,x=clamp(p.x,0,this.worldWidth),y=clamp(p.y,0,this.worldHeight);
  // Height callbacks use the city/terrain active for the current scene, not the camera.
  return typeof fn==='function'?clamp(sane(fn({x,y},this.world),0),-150,450):0;
 }
 sea(){return sane(this.opt.waterLevel,0);}
 river(y){
  const c=this.opt.riverCenter,w=this.opt.riverWidth;
  if(typeof c!=='function'||typeof w!=='function')return null;
  const x=c(y,this.world),r=w(y,this.world);
  if(!finite(x)||!finite(r)||r<.01)return null;
  return [clamp(x-r,0,this.worldWidth),clamp(x+r,0,this.worldWidth)];
 }
 wet(p){
  if(typeof this.opt.waterAt==='function')return !!this.opt.waterAt(p,this.world);
  const b=this.river(p.y);return b&&p.x>b[0]&&p.x<b[1];
 }
 surface(p){
  if(this.wet(p))return this.sea();
  const x=clamp(p.x,0,this.worldWidth),y=clamp(p.y,0,this.worldHeight),grid=this.surfaceGrid;
  if(!grid)return this.raw(p)+.12;
  let chart=grid[0];const bands=this.river(y);
  if(bands&&grid.length===2&&x>=bands[1])chart=grid[1];
  const ny=chart.length-1,nx=chart[0].length-1,fy0=y/this.worldHeight*ny,row=Math.min(ny-1,Math.floor(fy0)),fy=fy0-row;
  const top=chart[row],bottom=chart[row+1],lerp=(a,b,t)=>a+(b-a)*t;
  const xl=lerp(top[0][0],bottom[0][0],fy),xr=lerp(top[nx][0],bottom[nx][0],fy),u=clamp((x-xl)/(xr-xl||1),0,1)*nx,index=Math.min(nx-1,Math.floor(u));
  const a=top[index],b=top[index+1],c=bottom[index+1],d=bottom[index];
  const lo=lerp(a[0],d[0],fy),split=lerp(a[0],c[0],fy),hi=lerp(b[0],c[0],fy),h=lerp(a[2],c[2],fy);
  return x<split?lerp(lerp(a[2],d[2],fy),h,clamp((x-lo)/(split-lo||1),0,1)):lerp(h,lerp(b[2],c[2],fy),clamp((x-split)/(hi-split||1),0,1));
 }
 heightOf(p){return p.absolute?sane(p.z,0):this.surface(p)+sane(p.z,0);}
 basis(q=this.camera){
  const x=sane(q?.x,this.worldWidth/2),y=sane(q?.y,this.worldHeight/2),yaw=sane(q?.yaw,this.camera.yaw);
  const pitch=clamp(sane(q?.pitch,this.camera.pitch),.14,1.50),distance=clamp(sane(q?.distance,this.camera.distance),45,3200);
  const pivot=vec(x,y,this.surface({x,y})+4),rad=distance*Math.cos(pitch);
  const eye=plus(pivot,vec(rad*Math.sin(yaw),rad*Math.cos(yaw),distance*Math.sin(pitch)));
  const f=norm(minus(pivot,eye)),s=norm(cross(f,[0,0,1])),u=cross(s,f);
  const aspect=(this.width||this.worldWidth)/(this.height||this.worldHeight),tan=Math.tan(clamp(sane(this.opt.fov,49),33,68)*PI/360);
  return {eye,f,s,u,aspect,tan};
 }
 project(p,q=this.camera){
  if(!xy(p))return {x:NaN,y:NaN,visible:false,depth:0};
  const {eye,f,s,u,aspect,tan}=this.basis(q),r=minus(xyz(p,this.heightOf(p)),eye),depth=dot(r,f);
  if(depth<=4)return {x:NaN,y:NaN,visible:false,depth};
  const nx=dot(r,s)/(depth*tan*aspect),ny=dot(r,u)/(depth*tan),w=this.width||this.worldWidth,h=this.height||this.worldHeight;
  return {x:(nx+1)*w/2,y:(1-ny)*h/2,depth,visible:Math.abs(nx)<=1&&Math.abs(ny)<=1};
 }
 worldToScreen(p,q){return this.project(p,q);}
 raycast(p,q=this.camera){
  if(!xy(p))return null;
  const {eye,f,s,u,aspect,tan}=this.basis(q),w=this.width||this.worldWidth,h=this.height||this.worldHeight;
  const dir=norm(plus(plus(f,scale(s,(p.x*2/w-1)*tan*aspect)),scale(u,(1-p.y*2/h)*tan)));
  let lo=4,hi=7000;
  for(const [o,d,min,max] of [[eye[0],dir[0],0,this.worldWidth],[eye[1],dir[1],-this.worldHeight,0]]){
   if(Math.abs(d)<1e-9){if(o<min||o>max)return null;continue;}
   const a=(min-o)/d,b=(max-o)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
  }
  if(hi<lo)return null;
  const at=t=>({x:eye[0]+dir[0]*t,y:-eye[1]-dir[1]*t});
  const height=t=>eye[2]+dir[2]*t-this.surface(at(t));let prev=lo,y=height(lo);
  if(y<-1e-4)return null;
  const step=Math.min(8,Math.max(2,(hi-lo)/160));
  if(y<=0)return {...at(lo),z:0,height:this.surface(at(lo))};
  for(let t=Math.min(hi,lo+step);;t=Math.min(hi,t+step)){
   y=height(t);
   if(y<=0){
    let a=prev,b=t;for(let i=0;i<14;i++){const c=(a+b)/2;if(height(c)>0)a=c;else b=c;}
    const p=at((a+b)/2);return {...p,z:0,height:this.surface(p),water:!!this.wet(p)};
   }
   if(t>=hi)break;prev=t;
  }
  return null;
 }
 screenToWorld(p,q){return this.raycast(p,q);}
 orbit(dx,dy){
  this.camera.yaw=(this.camera.yaw-sane(dx,0)*.008)%TAU;this.camera.pitch=clamp(this.camera.pitch+sane(dy,0)*.007,.14,1.50);return this.camera;
 }
 limit(){
  this.camera.x=clamp(this.camera.x,-160,this.worldWidth+160);this.camera.y=clamp(this.camera.y,-160,this.worldHeight+160);return this.camera;
 }
 zoom(factor,screen){
  if(!finite(factor)||factor<=0)return this.camera;
  const a=screen&&this.raycast(screen);this.camera.distance=clamp(this.camera.distance/factor,45,3200);
  const b=a&&this.raycast(screen);if(b){this.camera.x+=a.x-b.x;this.camera.y+=a.y-b.y;}
  return this.limit();
 }
 pan(dx,dy){
  if(!finite(dx)||!finite(dy))return this.camera;
  const center={x:(this.width||this.worldWidth)/2,y:(this.height||this.worldHeight)/2};
  const a=this.raycast(center),b=this.raycast({x:center.x+dx,y:center.y+dy});
  if(a&&b){this.camera.x+=a.x-b.x;this.camera.y+=a.y-b.y;}
  else{const p=this.basis(),k=2*p.tan*this.camera.distance/(this.height||this.worldHeight),t=plus(scale(p.s,-dx*k),scale(p.u,dy*k));this.camera.x+=t[0];this.camera.y-=t[1];}
  return this.limit();
 }
 upload(key,mesh,dynamic=false){
  const gl=this.gl,old=this.meshes[key],buffer=old?.buffer||gl.createBuffer(),p=mesh instanceof Float32Array?mesh:mesh.typed();
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,p,dynamic?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);
  return this.meshes[key]={buffer,count:p.length/9};
 }
 draw(buffer){
  if(!buffer?.count)return;
  const gl=this.gl,sh=this.sh;
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer.buffer);
  for(const [a,o] of [[sh.position,0],[sh.normal,12],[sh.color,24]]){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,36,o);}
  gl.drawArrays(gl.TRIANGLES,0,buffer.count);
 }
 terrain(){
  this.surfaceGrid=[];
  const ground=new Mesh(),water=new Mesh(),ww=this.worldWidth,hh=this.worldHeight,sea=this.sea(),grade=clamp(sane(this.opt.terrainStep,12),6,24),ny=Math.ceil(hh/grade);
  const palette=list(this.opt.groundColors).length>=2?this.opt.groundColors.map(c=>color(c)):['#9bac79','#b6c08a','#83976e'].map(c=>color(c));
  const seaColor=color(this.opt.waterColor||'#608e9c'),bank=color('#a5a27b'),rim=color('#76825f');
  const strips=this.river(hh*.5)!==null;
  const terrainPoint=(x,y,edge=false)=>{
   const p=point(x,y),raw=this.raw(p),isWet=!strips&&this.wet(p);
   const z=isWet?Math.min(sea-4,raw):raw+.12;
   const dy=this.raw({x,y:y+2})-this.raw({x,y:y-2}),dx=this.raw({x:x+2,y})-this.raw({x:x-2,y});
   const n=isWet?[0,0,1]:norm([-dx,dy,4]);
   let c=mix(palette[0],palette[1],clamp(.2+.55*y/hh+.15*Math.sin(x*.018)+.07*Math.sin((y+x)*.033),0,1));
   if(palette[2])c=mix(c,palette[2],clamp(Math.abs(raw)/100,0,.66));
   c=dark(c,.97+hash(x,y)*.044);
   if(edge)c=mix(c,bank,.34);
   return {p:xyz(p,z),n,c,wet:isWet};
  };
  const rows=(nx,ranges)=>{
   let prev;const table=[];this.surfaceGrid.push(table);
   for(let r=0;r<=ny;r++){
    const y=r/ny*hh,[left,right,s]=ranges(y);
    const cur=Array.from({length:nx+1},(_,i)=>terrainPoint(left+(right-left)*i/nx,y,i===s));table.push(cur.map(v=>v.p));
    if(prev)for(let i=0;i<nx;i++){
     const a=prev[i],b=prev[i+1],c=cur[i+1],d=cur[i];
     ground.tri(a.p,b.p,c.p,null,[0,0,1],[a.n,b.n,c.n],[a.c,b.c,c.c]);ground.tri(a.p,c.p,d.p,null,[0,0,1],[a.n,c.n,d.n],[a.c,c.c,d.c]);
     if(!strips&&(a.wet||b.wet||c.wet||d.wet)){
      const wetPoint=i=>[i.p[0],i.p[1],sea];water.quad(wetPoint(a),wetPoint(b),wetPoint(c),wetPoint(d),seaColor,[0,0,1]);
     }
    }
    if(prev){
     // Solid map edge underside stops the terrain appearing like a sheet when tilted.
     const border=(a,b)=>{const lo=sea-18;ground.quad(a.p,b.p,[b.p[0],b.p[1],lo],[a.p[0],a.p[1],lo],rim);};
     if(r===1)for(let i=0;i<nx;i++)border(prev[i],prev[i+1]);
     if(r===ny)for(let i=0;i<nx;i++)border(cur[i],cur[i+1]);
     if(left===0)border(prev[0],cur[0]);
     if(right===ww)border(prev[nx],cur[nx]);
    }
    prev=cur;
   }
  };
  if(strips){
   const nx=Math.ceil(ww/(grade*2));
   rows(nx,y=>[0,this.river(y)?.[0]??ww*.45,nx]);
   rows(nx,y=>[this.river(y)?.[1]??ww*.55,ww,0]);
   let prev=null;
   for(let i=0;i<=ny;i++){
    const y=i/ny*hh,r=this.river(y)||[ww*.45,ww*.55];
    const a=point(r[0],y),b=point(r[1],y);
    if(prev){
     const [c,d]=prev;
     water.quad(xyz(c,sea),xyz(d,sea),xyz(b,sea),xyz(a,sea),seaColor,[0,0,1]);
     const bankFace=(p,q)=>ground.quad(xyz(p,this.raw(p)+.12),xyz(q,this.raw(q)+.12),xyz(q,sea-12),xyz(p,sea-12),bank);
     bankFace(c,a);bankFace(d,b);
    }
    prev=[a,b];
   }
  }else rows(Math.ceil(ww/grade),()=>[0,ww,-1]);
  this.upload('ground',ground);this.upload('water',water);
 }
 road(mesh,edge,opt={}){
  const source=list(edge.pts||edge.points),width=sane(opt.width,sane(edge.width,N?.crossSection?.(edge)?.width||10));if(source.length<2||!source.every(xy))return;
  const path=[source[0]];
  // Native roads already have measured curves, but sparse imported or preview paths
  // still require tessellation for their decks to follow the terrain instead of tunneling through a hill.
  for(let i=1;i<source.length;i++){
   const a=source[i-1],b=source[i],span=hypot(a,b);
   if(span<=.04)continue;
   const steps=Math.ceil(span/5.5);
   for(let k=1;k<=steps;k++){const t=k/steps;path.push(point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,sane(a.z,0)+(sane(b.z,0)-sane(a.z,0))*t));}
  }
  if(path.length<2)return;
  const shade=color(opt.color||(edge.kind==='highway'?'#464f59':edge.kind==='ramp'?'#565a62':'#60646a'));
  const flank=dark(shade,.72),shoulder=opt.detail?color('#a0a193'):null;
  const up=[0,0,1],h=(p,dz)=>this.surface(p)+sane(p.z,0)+dz;
  const normal=(a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,k=Math.hypot(dx,dy)||1;return [-dy/k,dx/k];};
  const bearing=(p,i)=>{
   const la=i>0?normal(path[i-1],p):null,rb=i<path.length-1?normal(p,path[i+1]):null;
   if(!la||!rb)return la||rb;
   const x=la[0]+rb[0],y=la[1]+rb[1],n=Math.hypot(x,y);if(n<.04)return rb;
   const angle=Math.max(.66,(x*rb[0]+y*rb[1])/n);return [x/n/angle,y/n/angle];
  };
  const shift=(p,n,t)=>point(p.x+n[0]*t,p.y+n[1]*t,sane(p.z,0));
  let old=null,travel=0,pillarAt=0;
  const widthProfile=N?.crossSection?.(edge);
  for(let i=0;i<path.length;i++){
   const p=path[i],n=bearing(p,i),l=shift(p,n,width/2),r=shift(p,n,-width/2),dz=sane(opt.lift,.47),thick=opt.detail?(edge.kind==='highway'?1.0:.75):.17;
   const next={p,n,l:xyz(l,h(l,dz)),r:xyz(r,h(r,dz))};
   if(opt.detail){
    const strip=width/2-.70,ll=shift(p,n,strip),rr=shift(p,n,-strip);
    next.ll=xyz(ll,h(ll,dz+.06));next.rr=xyz(rr,h(rr,dz+.06));
   }
   if(old){
    const underground=sane(p.z,0)<-2&&sane(old.p.z,0)<-2;
    if(underground){old=next;continue;}
    mesh.quad(old.l,old.r,next.r,next.l,shade,up);
    for(const v of ['l','r']){
     const a=old[v],b=next[v],aa=[a[0],a[1],a[2]-thick],bb=[b[0],b[1],b[2]-thick];
     mesh.quad(aa,bb,b,a,flank,scale(vec(n[0],n[1],0),v==='l'?1:-1));
    }
    if(shoulder){
     mesh.quad(old.l,old.ll,next.ll,next.l,shoulder,up);mesh.quad(old.rr,old.r,next.r,next.rr,shoulder,up);
     const length=hypot(old.p,p);
     const start=travel;travel+=length;
     if(widthProfile&&edge.lanes>1)for(const axis of widthProfile.boundaries){
      const isDivider=!edge.oneway&&widthProfile.divider!==null&&Math.abs(axis-widthProfile.divider)<.1;
      const paint=color(isDivider?'#d9c58d':'#d5d6c8'),period=isDivider?11:13,cover=isDivider?7.2:5.1;
      for(let at=Math.floor(start/period)*period;at<travel;at+=period){
       const first=Math.max(start,at),last=Math.min(travel,at+cover);if(last-first<.14)continue;
       const ends=(t,extra)=>{
        const f=(t-start)/length,q=point(old.p.x+(p.x-old.p.x)*f,old.p.y+(p.y-old.p.y)*f,sane(old.p.z,0)+(sane(p.z,0)-sane(old.p.z,0))*f);
        const pt=shift(q,[old.n[0]+(n[0]-old.n[0])*f,old.n[1]+(n[1]-old.n[1])*f],axis+extra);
        return xyz(pt,h(pt,dz+.085));
       };
       mesh.quad(ends(first,.12),ends(first,-.12),ends(last,-.12),ends(last,.12),paint,up);
      }
     }
     if(travel>=pillarAt){
      if(sane(p.z,0)>5){
       const bot=this.wet(p)?this.sea()-5:this.surface(p),top=this.surface(p)+p.z-thick,aspect=Math.atan2(p.y-old.p.y,p.x-old.p.x);
       box(mesh,p.x,p.y,3.4,Math.min(width*.47,8),bot,top,color('#85847c'),aspect,color('#a7a292'));pillarAt=travel+32;
      }else pillarAt=travel+10;
     }
    }
   }
   old=next;
  }
 }
 baseFor(x,y,w,d,a=0){
  const h=[{x,y},...corners(x,y,w,d,a)].map(p=>this.surface(p));
  return {lo:Math.min(...h)-.12,hi:Math.max(...h)+.13};
 }
 building(mesh,b,fallbackType){
  if(!xy(b))return;
  const x=b.x,y=b.y,type=b.type||fallbackType,lv=clamp(Math.round(sane(b.level,b.height?1:0)),0,3);
  if(!lv)return;
  const w=clamp(sane(b.w,sane(b.width,12)),5,45),d=clamp(sane(b.d,sane(b.depth,11)),5,45),angle=sane(b.angle,0),palette=(TYPE[type]||TYPE.residential).map(c=>color(c));
  const h1=hash(x,y),base=this.baseFor(x,y,w,d,angle),floor=base.hi;
  const family=type==='industrial'?[6.4,10.5,16]:type==='office'?[9.5,23.5,52]:type==='commercial'?[7.2,20,38]:[6.4,15.6,31];
  const height=clamp(sane(b.height,family[lv-1]*(.82+h1*.43)*(lv===3?.92+.22*hash(y,x):1)),4,140),top=floor+height,col=dark(palette[0],.88+h1*.22);
  const size=lv===1&&type==='residential'?.84:1;
  box(mesh,x,y,w,d,base.lo,floor+.19,dark(col,.67),angle,dark(palette[2],.66));
  box(mesh,x,y,w*size,d*size,floor,top,col,angle,palette[2]);
  if(lv===1&&type==='residential'){
   const roofColor=mix(palette[1],color('#806e63'),hash(x,y,3)*.5);
   roof(mesh,x,y,w*.93,d*.94,top+.05,Math.max(2.0,d*.27),roofColor,angle);
   box(mesh,x+Math.cos(angle)*w*.19,y+Math.sin(angle)*w*.19,1.1,1.1,top+.1,top+d*.31,dark(col,.68),angle,dark(col,1.12));
   // Pair of painted low window ledges.
   const q=angle+PI/2;box(mesh,x+Math.cos(q)*d*.41,y+Math.sin(q)*d*.41,w*.55,.25,floor+height*.36,floor+height*.52,palette[3],angle);
  }else if(type==='industrial'){
   const q=w*.24,cos=Math.cos(angle),sin=Math.sin(angle);
   for(const j of [-1,1])roof(mesh,x+j*q*cos,y+j*q*sin,w*.51,d*1.01,top+.08,d*.17,palette[1],angle);
   if(lv>1){
    const r=Math.min(2.8,w*.19);
    cylinder(mesh,x+cos*w*.29,y+sin*w*.29,r,top-.1,top+height*.63,dark(col,.72),palette[2],8,r*.72);
   }
  }else{
   const bands=lv===1?2:lv===2?4:Math.min(9,Math.ceil(height/6));
   for(let f=0;f<bands;f++){
    const v=floor+height*(f+.55)/bands,hi=v+clamp(height/bands*.23,.45,1.25);
    box(mesh,x,y,w+.14,d+.14,v,hi,palette[3],angle,palette[3]);
   }
   box(mesh,x,y,w*.69,d*.67,top-.01,top+height*(lv===3?.16:.10),dark(col,.82),angle,palette[2]);
   if(lv===3&&type==='office'&&h1>.56)cylinder(mesh,x,y,.55,top+height*.14,top+height*.29,color('#b5ccd4'),color('#c8d9df'),6);
  }
 }
 tree(mesh,x,y,h){
  const z=this.surface({x,y}),vary=hash(x,y,52),c=mix(color('#4f7657'),color('#77905e'),vary);
  cylinder(mesh,x,y,h*.07,z,z+h*.55,color('#7c7359'),undefined,5);
  cylinder(mesh,x,y,h*.39,z+h*.32,z+h,c,dark(c,1.13),7,.01);
  if(vary>.49)cylinder(mesh,x,y,h*.31,z+h*.54,z+h*1.16,dark(c,1.08),undefined,6,.01);
 }
 civic(mesh,s,style){
  if(!xy(s))return;
  const {x,y}=s,type=s.type||style,extra=s.type?.startsWith('edu-')?STRUCTURE.school:s.type?.startsWith('csr-')?STRUCTURE.clinic:s.type?.startsWith('jst-')?STRUCTURE.police:s.type?.startsWith('ina-')?STRUCTURE.power:s.type?.startsWith('soc-')?STRUCTURE.hospital:null;
  const kind=STRUCTURE[type]||STRUCTURE[style]||extra||['#87879c',22,17,9],c=color(kind[0]);
  const angle=sane(s.angle,0),w=clamp(sane(s.width,kind[1]),8,60),d=clamp(sane(s.depth,kind[2]),6,46),ht=kind[3],base=this.baseFor(x,y,w,d,angle);
  box(mesh,x,y,w*1.17,d*1.14,base.lo,base.hi+.29,color('#929087'),angle,color('#b6b0a0'));
  if(type==='park'){
   plate(mesh,corners(x,y,w,d,angle),()=>base.hi+.38,color('#83a667'));
   for(const [dx,dy] of [[-5,-3],[5,0],[0,4]])this.tree(mesh,x+dx,y+dy,7+hash(x+dx,y)*3);
   return;
  }
  const z=base.hi+.25;
  box(mesh,x,y,w,d,z,z+ht,c,angle,dark(c,1.19));
  box(mesh,x,y,w*.97,d*.96,z+ht,z+ht+.63,dark(c,.70),angle,dark(c,1.27));
  if(type==='parking'){
   for(let i=1;i<5;i++)box(mesh,x-w*.48+w*i/5,y,.27,d*.62,z+ht+.63,z+ht+.72,color('#d4d3c5'),angle);
  }else if(type==='power'||type==='water'||type==='cargoPort'||type==='cargoAirport'){
   const r=w*.111;for(const q of [-1,1])cylinder(mesh,x+q*w*.26,y,r,z+ht-.01,z+ht+ht*.73,dark(c,.77),dark(c,1.3),8,r*.80);
  }else{
   const width=w*.53,depth=d*.32;
   box(mesh,x,y,Math.max(7,width),depth,z+ht+.2,z+ht+ht*.21,dark(c,.79),angle,color('#d3d1c6'));
   box(mesh,x,y,w*1.04,d*.72,z+ht*.49,z+ht*.61,dark(c,1.21),angle);
  }
 }
 staticWorld(world){
  const mesh=new Mesh(),edges=list(world.edges),zones=list(world.zones),lots=[],points=[],bins=new Map();
  const binK=(x,y)=>Math.floor(x/44)+':'+Math.floor(y/44);
  const mark=(p,r)=>{if(!xy(p))return;const id=binK(p.x,p.y),arr=bins.get(id)||[];arr.push({x:p.x,y:p.y,r});bins.set(id,arr);};
  const obstruct=(p,r)=>{const ix=Math.floor(p.x/44),iy=Math.floor(p.y/44);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if((bins.get((ix+dx)+':'+(iy+dy))||[]).some(x=>hypot(x,p)<x.r+r))return true;return false;};
  const parks=list(world.services).filter(s=>s.type==='park');
  for(const e of edges){
   const width=sane(e.width,N?.crossSection?.(e)?.width||10);
   this.road(mesh,e,{width,detail:true});
   for(const p of list(e.pts||e.points))mark(p,width/2+2.1);
  }
  // A beveled, low intersection cap fills corner gaps where roads connect at the same deck.
  const inc=new Map();
  for(const e of edges)for(const [key,p] of [[e.a,e.pts?.[0]],[e.b,e.pts?.at(-1)]]){
   if(!key||!xy(p)||sane(p.z,0)<-2)continue;
   if(!inc.has(key))inc.set(key,[]);inc.get(key).push({p,width:sane(e.width,N?.crossSection?.(e)?.width||10)});
  }
  for(const joints of inc.values())if(joints.length>1){
   const {p}=joints[0],z=this.surface(p)+sane(p.z,0)+.44,r=Math.min(10,Math.max(...joints.map(a=>a.width))*.49);
   cylinder(mesh,p.x,p.y,r,z-.40,z,color('#5d6268'),color('#62676c'),12);
  }
  for(const link of list(world.activeTravel)){
   const cp=link.type==='bike'?'#829970':link.type==='bridge'?'#b5ad86':'#a6aca3';
   const fallback=rootSpec('ActiveTravel','TYPES',link.type)?.width;
   this.road(mesh,link,{width:sane(link.width,sane(fallback,3.2)),color:cp,lift:.28});
  }
  for(const t of list(world.transit?.tracks)){
   if(t.mode==='metro')continue;
   const w=t.mode==='tram'?3.7:6.8;
   this.road(mesh,t,{width:w,color:t.mode==='tram'?'#868987':'#8c827a',lift:.28});
   const pts=list(t.points||t.pts);
   for(const sign of [-1,1]){
    const rails=pts.map((p,i)=>{
     const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],d=hypot(a,b)||1,k=sign*(t.mode==='tram'?.71:1.08);
     return {x:p.x-(b.y-a.y)*k/d,y:p.y+(b.x-a.x)*k/d,z:sane(p.z,0)};
    });
    this.road(mesh,{pts:rails},{width:.19,color:'#bfc0af',lift:.60});
   }
  }
  for(const z of zones){
   for(const b of list(z.parcels)){
    if(!xy(b))continue;
    lots.push(b);mark(b,Math.max(sane(b.w,sane(b.width,10)),sane(b.d,sane(b.depth,10)))*.54);
    if(!b.level){
     const outline=list(b.footprint).filter(xy),c=(TYPE[z.type]||TYPE.residential)[0];
     plate(mesh,outline.length>=3?outline:corners(b.x,b.y,sane(b.width,10),sane(b.depth,10),sane(b.angle,0)),p=>this.surface(p)+.085,mix(color(c),color('#8aab71'),.61));
    }
   }
   for(const b of list(z.buildings)){if(xy(b))mark(b,8);this.building(mesh,b,z.type);}
  }
  if(!zones.length)for(const b of list(world.buildings)){if(xy(b))mark(b,8);this.building(mesh,b,b.type);}
  for(const a of list(world.campus)){
   const d=rootSpec('CampusLife','ASSETS',a.type);if(!d||!xy(a))continue;
   const x=a.x,y=a.y,w=d.width,h=d.depth,base=this.baseFor(x,y,w,h,0),z=base.hi,col=color(d.color),glass=color('#7796a5'),cream=color('#e3d5ac');
   const floor=d.kind==='housing'?13:d.kind==='faculty'?9:d.kind==='research'?11:6.8;
   mark(a,Math.max(w,h)*.60);
   box(mesh,x,y,w,h,base.lo,z+.25,dark(col,.66),0,col);
   box(mesh,x,y,w*.89,h*.90,z,z+floor,dark(col,.82),0,col);
   box(mesh,x,y,w*.78,h*.63,z+floor-.4,z+floor+1.1,d.kind==='research'?glass:dark(col,1.14),0,col);
   for(const xx of [-.31,-.15,0,.15,.31]){
    for(const hh of d.kind==='housing'?[.22,.46,.69]:[.34,.62])box(mesh,x+w*xx,y-h*.455,1.9,.2,z+floor*hh,z+floor*hh+1.1,glass,0,cream);
   }
   if(d.kind==='faculty')for(const side of [-1,1])box(mesh,x+side*w*.16,y-h*.49,.78,.85,z,z+floor*.43,cream,0,col);
   if(d.kind==='research')cylinder(mesh,x+w*.22,y+h*.11,1.45,z+floor,z+floor+2.9,glass,undefined,8,.3);
  }
  for(const park of list(world.parks)){
   for(const p of list(park.paths)){const z=rootSpec('ParkLife','PATHS',p.type);if(z)this.road(mesh,{pts:p.points},{width:z.width,color:z.color,lift:.14});}
   for(const a of list(park.assets)){
    const z=rootSpec('ParkLife','ASSETS',a.type);if(!z||!xy(a))continue;mark(a,Math.max(z.width,z.depth)*.65);
    const x=a.x,y=a.y,w=z.width,d=z.depth,h=this.surface(a),c=color(z.color),ink=color('#dce7c7');
    plate(mesh,corners(x,y,w,d,0),p=>this.surface(p)+.18,c);
    if(a.type==='gate'){
     for(const s of [-1,1])box(mesh,x+s*4.3,y,1.2,1.25,h,h+4.2,dark(c,.72),0,c);
     box(mesh,x,y,10,1.0,h+3.8,h+4.9,a.open?color('#819c68'):color('#ba625b'),0,c);
    }else if(a.type==='nature'){
     for(const [dx,dy,size] of [[-8,-5,5.5],[.5,4,8],[9,-3,6],[-9,5,4],[6,6,4.8]])this.tree(mesh,x+dx,y+dy,size);
    }else if(a.type==='garden'){
     for(const i of [-1,0,1]){
      box(mesh,x+i*8,y,5.5,11,h+.22,h+.76,color(i%2?'#b56f95':'#ceb75e'),0,c);
      for(const dy of [-3,0,3])cylinder(mesh,x+i*8,y+dy,.62,h+.8,h+1.55,color(i%2?'#efadbd':'#f1de91'),undefined,7,.4);
     }
    }else if(a.type==='sports'){
     const line=(xx,yy,ww,dd)=>box(mesh,xx,yy,ww,dd,h+.2,h+.31,ink,0,ink);
     line(x,y,.22,d-3);
     for(const j of [-1,1]){
      line(x,y+j*(d/2-1.55),w-3,.20);line(x+j*(w/2-1.55),y,.20,d-3);
      box(mesh,x+j*(w/2-3),y,.27,2.3,h+.3,h+3.0,color('#a5afb3'),0,ink);
     }
    }else if(a.type==='play'){
     for(const dx of [-3,3])box(mesh,x+dx,y,.42,.6,h,h+3.7,color('#785f50'),0,ink);
     box(mesh,x,y,7.2,.85,h+3.0,h+3.8,color('#ad6a52'),0,color('#e6b780'));
     box(mesh,x+5,y-2,2.4,3.1,h+.4,h+1.7,color('#8fbec8'),-.16);
    }else if(a.type==='picnic'){
     for(const dy of [-3.5,3.5]){box(mesh,x,y+dy,7.1,2.4,h+.35,h+1.5,color('#a7835a'),.04);box(mesh,x,y+dy-1.7,7.4,.65,h+.33,h+.84,color('#887260'),.04);}
    }else{
     box(mesh,x,y,w-1,d-1,h+.19,h+3.8,dark(c,.78),0,c);box(mesh,x,y,w+.5,d+.4,h+3.7,h+4.5,a.type==='vendor'?color('#98765c'):color('#657991'),0,c);
     box(mesh,x,y-d/2+.41,w*.42,.45,h+1.3,h+2.4,color('#667c82'),0,ink);
    }
   }
  }
  for(const b of list(world.services)){mark(b,15);this.civic(mesh,b);}
  for(const b of list(world.parking)){mark(b,13);this.civic(mesh,{...b,type:'parking'});}
  for(const b of list(world.transit?.stations)){
   mark(b,16);this.civic(mesh,b);
   if(['ferryTerminal','cargoPort','shipyard'].includes(b.type)&&xy(b.wet)){
    const z=this.sea()+.62;
    this.road(mesh,{points:[{x:b.x,y:b.y,z:.13},{x:b.wet.x,y:b.wet.y,z:.36}]},{width:b.type==='cargoPort'?8:5,color:'#a89d8a',lift:.22});
    if(b.type==='cargoPort'){
     const q=b.wet,a=Math.atan2(b.wet.y-b.y,b.wet.x-b.x),tx=Math.cos(a),ty=Math.sin(a),c=color('#bd8b59');
     box(mesh,q.x,q.y,4.2,4.5,z,z+2.5,c,a);box(mesh,q.x,q.y,1.2,1.2,z+2.3,z+18,c,a);
     box(mesh,q.x+tx*4.5,q.y+ty*4.5,12.5,1.1,z+16.6,z+18,c,a,color('#cca26d'));
    }
   }else if(['airport','cargoAirport'].includes(b.type)){
    const q={x:b.x-36,y:b.y+30,z:.10},r={x:b.x+36,y:b.y+30,z:.10};
    this.road(mesh,{points:[q,r],kind:'road',lanes:2},{width:9,color:'#666c72',lift:.10,detail:true});
   }
  }
  // Deterministic scattered vegetation, never across occupied/circulation geometry.
  const density=clamp(sane(this.opt.trees,198),0,390),ww=this.worldWidth,hh=this.worldHeight;
  for(let i=0,done=0;i<density*3&&done<density;i++){
   const x=12+hash(i,17)*(ww-24),y=12+hash(i,21)*(hh-24),b=point(x,y),size=4.1+hash(i,53)*6.5;
   if(this.wet(b)||this.wet({x:x-5,y})||this.wet({x:x+5,y})||obstruct(b,5))continue;
   if(hash(i,61)<.37&&hash(Math.round(x/60),Math.round(y/60),3)<.46)continue;
   this.tree(mesh,x,y,size);mark(b,3);done++;
  }
  this.upload('city',mesh);
 }
 overlays(world,opt){
  const m=new Mesh(),sel=opt.selected||{},col=color('#ffdb75'),lift=(p,d)=>this.surface(p)+sane(p.z,0)+d;
  const outline=(points,c,r=1.05,closed=false)=>{
   if(points.length<2)return;
   this.road(m,{pts:closed?[...points,points[0]]:points},{width:r,color:c,lift:1.33});
  };
  const selected=list(world.edges).find(e=>e.id===sel.edge);
  if(selected)outline(selected.pts||selected.points,'#e0b76d',2.2);
  for(const z of list(world.zones)){
   const item=list(z.parcels).find(q=>q.id===sel.lot);
   if(item){const f=list(item.footprint);outline(f.length?f:corners(item.x,item.y,item.width||11,item.depth||10,item.angle||0),col,1.18,true);break;}
   if(z.id===sel.zone&&Array.isArray(z.poly)&&z.poly.length>2)outline(z.poly,col,1,true);
  }
  for(const s of [...list(world.services),...list(world.transit?.stations),...list(world.parking)])if(s.id===sel.station||s.id===sel.parking||s.id===sel.service||s.id===sel.care||s.id===sel.school||s.id===sel.social)if(xy(s))cylinder(m,s.x,s.y,3.3,this.surface(s),this.surface(s)+22,col,undefined,6,.12);
  for(const g of [...list(opt.batchGhosts),opt.preview].filter(Boolean)){
   const c=g.valid===false?'#e66960':'#5de2d0',points=list(g.points).filter(xy),paths=list(g.paths);
   for(const p of paths)outline(list(p.points||p).filter(xy),c,sane(g.width,2.0),false);
   if(points.length>=2)outline(points,c,clamp(sane(g.width,2.25),1,30),!!g.closed);
   if(points.length===1){const p=points[0],z=lift(p,.6);cylinder(m,p.x,p.y,2.0,z,z+4.8,color(c),undefined,9,.12);}
  }
  if(opt.overlay==='works'){
   const data=world.publicWorks||{},assets=data.assets||{},lots=data.waste?.byLot||{};
   for(const e of list(world.edges)){
    const k=assets[e.id]?.condition??100,ps=list(e.pts||e.points);
    const top=ps.filter(p=>!Number.isFinite(p.z)||p.z>-3);
    if(top.length===ps.length)outline(top,k<45?'#f28a79':k<72?'#dbbe67':'#88c9a0',1.6);
   }
   for(const z of list(world.zones))for(const p of list(z.parcels)){
    if(!(lots[p.id]?.backlog>.15))continue;
    const h=this.surface(p);cylinder(m,p.x,p.y,2.3,h+3,h+5.1,color('#85586c'),color('#dfc1a1'),7,.3);
   }
  }
  if(opt.overlay==='wellbeing'){
   const homes=new Map(list(world.zones).flatMap(z=>list(z.buildings)).map(b=>[b.id,b]));
   for(const q of list(opt.wellbeing).slice(0,3000)){
    if(!xy(q))continue;
    const home=homes.get(q.id),level=clamp(sane(home?.level,1),1,3),ground=this.surface(q);
    const top=ground+(Number.isFinite(home?.height)?home.height+5:[13,26,45][level-1]);
    cylinder(m,q.x,q.y,q.arrow?5.2:4.5,top,top+1.7,color(q.color),color('#fff3cd'),8,.4);
   }
  }
  if(opt.overlay==='elevation'){
   for(const e of list(world.edges)){
    const pts=list(e.pts);
    for(let i=1;i<pts.length;i++)if(sane(pts[i-1].z,0)<-2&&sane(pts[i].z,0)<-2){
     const a={...pts[i-1],z:0},b={...pts[i],z:0};
     const m1={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:0};
     outline(i%2?[a,m1]:[m1,b],'#ad7abb',1.55);
    }
   }
   for(const t of list(world.transit?.tracks))if(t.mode==='metro')outline(list(t.points).map(p=>({...p,z:0})),'#8580dd',1.1);
  }
  this.upload('over',m,true);
 }
 actors(agents){
  const m=new Mesh(),cap=clamp(sane(this.opt.maxAgents,285),10,550);
  for(let i=0,shown=0;i<agents.length&&shown<cap;i++){
   const a=agents[i];if(!xy(a)||a.underground||sane(a.z,0)<-2.0)continue;
   const k=a.kind||a.mode||'car',angle=sane(a.angle,0),x=a.x,y=a.y,lift=['ferry','ship'].includes(k)?.26:['walk','walker','bike'].includes(k)?.30:.66,z=this.heightOf(a)+lift;
   const c=color(a.color||(k==='bus'?'#e8c46e':k==='walk'||k==='walker'?'#e6c298':'#cbad93')),roof=dark(c,1.19),window=color('#526d79');
   shown++;
   if(['walk','walker','bike'].includes(k)){
    if(k==='bike')box(m,x,y,1.83,.37,z,z+.45,dark(c,.63),angle);
    const t=TAU*(sane(a.phase,i)*.27%1),dx=Math.cos(angle)*Math.sin(t)*.18,dy=Math.sin(angle)*Math.sin(t)*.18;
    box(m,x+dx,y+dy,.26,.43,z,z+.61,dark(c,.63),angle);
    box(m,x,y,.55,.6,z+.47,z+1.36,c,angle,roof);
    box(m,x,y,.40,.44,z+1.32,z+1.73,color('#dcb593'),angle);continue;
   }
   if(['plane','cargoPlane'].includes(k)){
    const l=k==='cargoPlane'?16:14;
    box(m,x,y,l,2.15,z,z+2.45,c,angle,roof);
    box(m,x,y,2.25,l*.98,z+.35,z+.68,c,angle+.12);
    box(m,x-Math.cos(angle)*l*.41,y-Math.sin(angle)*l*.41,1.67,l*.37,z+.50,z+1,c,angle);
    box(m,x-Math.cos(angle)*l*.41,y-Math.sin(angle)*l*.41,2.25,.42,z+1.7,z+4.0,c,angle);
    continue;
   }
   if(['ship','ferry'].includes(k)){
    const length=k==='ship'?23:15.5,width=k==='ship'?7.1:5.6,front=point(x+Math.cos(angle)*length*.62,y+Math.sin(angle)*length*.62);
    box(m,x,y,length,width,z,z+1.48,dark(c,.74),angle,roof);
    const [u,v]=[point(front.x-Math.cos(angle)*length*.15+Math.sin(angle)*width/2,front.y-Math.sin(angle)*length*.15-Math.cos(angle)*width/2),point(front.x-Math.cos(angle)*length*.15-Math.sin(angle)*width/2,front.y-Math.sin(angle)*length*.15+Math.cos(angle)*width/2)];
    plate(m,[u,v,front],()=>z+1.46,roof);
    box(m,x,y,length*.46,width*.72,z+1.43,z+3.75,c,angle,roof);
    box(m,x,y,length*.53,width*.76,z+2.25,z+2.7,window,angle);
    if(k==='ship')box(m,x-Math.cos(angle)*length*.26,y-Math.sin(angle)*length*.26,2.7,2,z+2,z+5.7,c,angle);
    continue;
   }
   const LEN={car:[4.1,1.75,1.12],taxi:[4.4,1.86,1.15],truck:[8.15,2.47,2.81],bus:[9.9,2.56,2.56],train:[15.8,2.94,3.2],metro:[11.1,2.8,2.77],tram:[8.8,2.49,2.73]},l=LEN[k]||LEN.car,mul=clamp(sane(a.size,1),.85,1.3);
   const [length,width,height]=l.map(v=>v*mul);
   box(m,x,y,length,width,z,z+height*.57,c,angle,roof);
   box(m,x-Math.cos(angle)*length*.03,y-Math.sin(angle)*length*.03,length*(height>2?.89:.61),width*.87,z+height*.52,z+height,window,angle,roof);
   if(k==='taxi')box(m,x,y,1.1,.55,z+height,z+height+.22,color('#f2d26c'),angle);
   if(k==='bus'||k==='train'||k==='tram')box(m,x,y,length*.80,width*.9,z+height*.96,z+height+.16,c,angle,roof);
  }
  this.upload('actors',m,true);
 }
 render(world={},opt={},clock=0){
  if(!this.available)return false;
  this.resize();
  this.world=world;
  const key=opt.terrainKey??world.terrain?.state??world.terrain??this.opt.heightAt??null,S=this.gl,H=this.sh;
  if(this.baseKey!==key||!this.meshes.ground){this.terrain();this.baseKey=key;this.cityKey=null;}
  if(this.cityKey!==world||!this.meshes.city){this.staticWorld(world);this.cityKey=world;this.previewKey=null;}
  if(!this.previewKey||this.previewKey.some((v,i)=>v!==[opt.preview,opt.selected,opt.batchGhosts,opt.overlay,opt.wellbeing][i])){
   this.overlays(world,opt);this.previewKey=[opt.preview,opt.selected,opt.batchGhosts,opt.overlay,opt.wellbeing];
  }
  this.actors(list(opt.agents||world.agents));
  const b=this.basis(opt.camera||this.camera),m=matrix(b.eye,b.f,b.s,b.u,b.aspect,b.tan);
  const gl=S,sh=H;gl.viewport(0,0,this.canvas.width,this.canvas.height);
  gl.clearColor(...this.haze,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(sh.p);
  gl.uniformMatrix4fv(sh.mat,false,m);gl.uniform3fv(sh.eye,b.eye);gl.uniform3fv(sh.haze,this.haze);
  gl.uniform1f(sh.time,(sane(clock,0)/1000)%600);
  gl.uniform1f(sh.water,0);this.draw(this.meshes.ground);this.draw(this.meshes.city);
  gl.uniform1f(sh.water,1);this.draw(this.meshes.water);
  gl.uniform1f(sh.water,0);this.draw(this.meshes.over);this.draw(this.meshes.actors);
  return true;
 }
 stats(){
  return {available:this.available,error:this.error||null,width:this.width,height:this.height,triangles:Object.fromEntries(Object.entries(this.meshes).map(([id,m])=>[id,Math.round(m.count/3)]))};
 }
}
function rootSpec(group,type,id){return globalThis[group]?.[type]?.[id];}
return City3D;
});
