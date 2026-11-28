(function(root,factory){const m=factory();if(typeof module==='object')module.exports=m;else root.CityMaps=m})(globalThis,()=>{
'use strict';
const bell=(x,y,cx,cy,wx,wy)=>Math.exp(-(((x-cx)/wx)**2+((y-cy)/wy)**2));
const defs={
 river:{id:'river',name:'一河两岸',tag:'跨河通勤',description:'老城在西、产业在东；汛期会封低桥。适合练习多通道和本地就业。',nameWater:'弯湾河',river:y=>600+45*Math.sin(y/115),width:y=>35,color:['#a8bb97','#bfd0a8','#adbf9b'],cash:155000,grant:3500,port:1,air:1,freight:1,rain:true},
 coast:{id:'coast',name:'海门湾',tag:'港口与物流',description:'南侧是宽阔河口。港口有更多货源，但跨湾桥更长、更贵。',nameWater:'海门湾',river:y=>632+26*Math.sin(y/154)-Math.max(0,y-490)*.13,width:y=>36+Math.max(0,y-335)*.38,color:['#b3bd96','#d0d3a4','#9bbd9c'],cash:165000,grant:3200,port:1.5,air:.82,freight:1.15,rain:true},
 hills:{id:'hills',name:'青岭走廊',tag:'山地与铁路',description:'两侧山麓限制建设带。适合在河谷铺设铁路、引进区域客货，不适合摊大饼。',nameWater:'青岭溪',river:y=>560+89*Math.sin(y/133),width:y=>17+3*Math.sin(y/190),color:['#7f9d83','#c4cc9f','#829781'],cash:145000,grant:3900,port:.55,air:1.22,freight:1.65,rain:false,
 ridge:p=>Math.max(0,1-Math.min(Math.hypot((p.x-155)/180,(p.y-195)/175),Math.hypot((p.x-1050)/170,(p.y-610)/190)))},
 alpine:{id:'alpine',name:'叠峰谷地',tag:'盘山路与梯田',description:'断续平台、支脉和深谷。平路适合布置市镇；山坡先整地，陡路要绕行或通过隧道。',nameWater:'白石溪',river:y=>615+29*Math.sin(y/103),width:y=>23+4*Math.sin(y/230),
 color:['#879a79','#b6bc90','#93a683'],cash:175000,grant:4600,port:.50,air:.98,freight:1.32,rain:false,
 ridge:p=>Math.max(bell(p.x,p.y,143,205,92,105),bell(p.x,p.y,1050,202,102,135),bell(p.x,p.y,995,630,98,115)),
 elevation({x,y}){
  const xRiver=615+29*Math.sin(y/103),d=Math.abs(x-xRiver);
  const riverFade=Math.min(1,Math.max(0,(d-40)/90));const peaks=72*bell(x,y,143,205,128,160)+78*bell(x,y,1050,202,145,190)+69*bell(x,y,995,630,132,154);
  const shelf=24*bell(x,y,305,236,111,133)+18*bell(x,y,798,575,135,157);
  return riverFade*(2+peaks+shelf);
 }}

};
const bank=(id,p)=>{const m=defs[id]||defs.river;return p.x<m.river(p.y)?'西岸':'东岸'};
let active=defs.river;
function select(id){active=defs[id]||defs.river;return active}
const valid=id=>Object.hasOwn(defs,id), center=y=>active.river(y), w=y=>active.width(y);
const water=p=>Math.abs(p.x-center(p.y))<w(p.y);
const land=p=>p.x>1&&p.x<1199&&p.y>1&&p.y<799&&!water(p)&&(!active.ridge||active.ridge(p)<.64);
const storage=(id,sandbox=false)=>(id==='river'?'city.blueprint.freebuild.1':'city.blueprint.freebuild.1.'+id)+(sandbox?'.sandbox':'');
function gates(id){const m=defs[id]||defs.river;return [{id:'west',x:8,y:id==='alpine'?470:id==='hills'?421:275,z:0,name:'西部公路口'},{id:'east',x:1192,y:id==='alpine'?437:id==='hills'?330:275,z:0,name:'东部公路口'},{id:'south',x:id==='coast'?235:880,y:792,z:0,name:'南部公路口'}];}
return {defs,select,valid,center,width:w,water,land,storage,gates,bank,current:()=>active};
});
