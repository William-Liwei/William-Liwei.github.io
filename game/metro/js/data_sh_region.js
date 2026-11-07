'use strict';
// Shanghai–Suzhou regional scenario. Geography is OSM/WGS84; population, employment,
// facility demand, development timing and rewards below are explicit gameplay estimates.
(function(CM){
 const m=CM.MAP_LIST.find(m=>m.id==='sh'),G=CM.GEOS.sh,D=m.data,P=G.proj;
 if(!G.regionalExtent)throw new Error('Shanghai regional geography is missing');
 const ll=(lat,lon)=>[+((lon-P.lon0)*P.kx).toFixed(2),+((P.lat0-lat)*P.ky).toFixed(2)];
 const point=(name,lat,lon)=>{const candidates=G.places.filter(p=>p[0]===name||p[0]===name.replace(/站$/,''));const q=ll(lat,lon);const p=candidates.find(p=>Math.hypot(p[1]-q[0],p[2]-q[1])<12);return p?[p[1],p[2]]:q;};
 const anchor=(name,lat,lon,r=5)=>{const p=point(name,lat,lon);return {name,x:p[0],y:p[1],r};};
 const oldRegions=D.regions.map(r=>r.id).concat(D.defaultRegion.id),oldLandmarks=D.landmarks.map(l=>l.id);
 const first=Object.assign({},m.extent,{newW:152,newH:152,oldZone:4,newZone:4});
 m.extent=[first,{from:2,dx:544,dy:288,oldW:152,oldH:152,oldZone:4,newZone:20,newW:940,newH:640,oldRegionIds:oldRegions,oldLandmarkIds:oldLandmarks,note:'扩展为上海全域与苏州区域地图；原线网平移保留，交通统计改用 5 km 小区'}];
 m.mapVersion=3;m.terrainRevision=1;
 m.name='上海 · 苏州';m.title='上海 · 苏州 · 1990';
 m.sub='上海全域与苏州 · 1990 年起 · 人民币';
 m.desc='从上海中心城区走向金山、奉贤、临港、崇明，再连接昆山和苏州。真实海岸、长江口岛屿、太湖与淀山湖构成建设约束；人口、岗位和区域发展节奏为经营模型估算。';
 m.tagline='浦江、长江口与沪苏跨城网络';m.tags=['上海全域','沪苏同图','跨江跨城'];
 m.intro='保留上海中心城区的 250 米网格细节，把规划范围扩展到完整上海陆域与苏州地区。金山沿海工业、奉贤新城、松江大学城、临港产业、崇明岛内出行，以及昆山—苏州的跨城走廊，都有独立区域和真实位置的目的地。现代 OSM 地理作为底图，历史人口与需求按明确标注的模拟参数演化。';
 m.facts=[['范围','235 km × 160 km'],['起始','1990 年'],['人口','约 1960 万（区域模型估算）'],['地理','上海陆域全境及苏州地区'],['模式','经营挑战 / 自由建造']];
 m.features=[['map','完整上海陆域','金山、奉贤、松江、青浦、嘉定、崇明、长兴与横沙均在图内'],['bridge','真实水面约束','长江口、杭州湾、黄浦江、太湖和淀山湖使用 OSM 几何'],['rail','沪苏跨城走廊','昆山、苏州园区、苏州站、苏州北站与吴江产生接驳需求'],['flag','区域经营任务','为南部新城、崇明、机场、临港和沪苏走廊设计网络']];
 m.cfg.W=940;m.cfg.H=640;m.cfg.ZONE=20;
 m.cam={cx:607,cy:368,zoom:12};
 m.cfg.growth=Object.assign({},m.cfg.growth,{popCurve:[[1990,19.6e6],[2000,23.2e6],[2010,32.5e6],[2020,37.5e6],[2030,39e6],[2050,40e6],[2300,41e6]],histEnd:2020});
 m.cfg.macro=Object.assign({},m.cfg.macro,{area:'上海与苏州区域模型（估算）',gdp0:11200000});
 for(const r of D.regions)if(r.pop)r.pop*=19.6/8.3;
 D.city='上海 · 苏州';D.seaName='长江口·杭州湾·东海';D.rural={pop:260,jobs:95};
 D.taskNote+=' 区域扩展任务为现实地理上的规划挑战，目标期限与奖励是玩法设定；不表示真实线路的历史开通期限。区域人口与岗位总量为估算，交通需求按 5 km 小区聚合，车站与地形仍保留 250 m 网格。';
 const region=(id,name,district,plan='resind',open=1990)=>({id,name,district,plan,open,note:'区域按现代 OSM 行政界划分；开发节奏、人口和岗位分布为模型估算'});
 // More specific districts take precedence over the surrounding default region.
 D.regions.push(
  region('songjiang','松江 · 大学城',['松江区'],'res',1990),region('qingpu','青浦 · 朱家角',['青浦区'],'res',1990),
  region('jinshan','金山 · 石化与滨海',['金山区'],'ind',1990),region('fengxian','奉贤 · 南桥',['奉贤区'],'resind',1990),
  region('chongming','崇明 · 长兴 · 横沙',['崇明区'],'res',1990),region('baoshan_outer','宝山其他地区',['宝山区'],'resind',1990),
  region('sz_gusu','苏州古城 · 姑苏',['姑苏区','沧浪区','平江区','金阊区'],'oldmix'),
  region('sz_park','苏州工业园区',['苏州工业园区','工业园区'],'ind',1994),region('sz_wuzhong','苏州吴中',['吴中区'],'resind'),
  region('sz_huqiu','苏州高新区 · 虎丘',['虎丘区','苏州高新区'],'ind',1992),region('sz_xiangcheng','苏州相城',['相城区'],'res'),
  region('sz_wujiang','吴江 · 松陵 · 同里',['吴江区'],'resind'),region('sz_kunshan','昆山 · 花桥',['昆山市'],'resind'),
  region('sz_taicang','太仓',['太仓市'],'ind'),region('sz_changshu','常熟',['常熟市'],'resind'),region('sz_zhangjiagang','张家港',['张家港市'],'ind'));
 D.regions.find(r=>r.id==='jiading').name='嘉定 · 安亭 · 嘉定新城';
 D.defaultRegion={id:'outer',name:'沪苏周边地区',open:1990,plan:'res',note:'地图矩形内的南通、嘉兴等邻接陆域；人口与需求为区域估算'};
 // A named planning area is an approximate development envelope, not an administrative boundary.
 D.regions.unshift({id:'lingang',name:'临港 · 滴水湖',open:2003,plan:'ind',poly:[[30.98,121.81],[30.98,121.98],[30.84,121.98],[30.84,121.81]].map(p=>ll(...p)),note:'临港发展片区为近似规划范围，非行政边界；水面仍严格依照 OSM 地形'});
 // Named centres locate real towns. Gaussian density / radii are gameplay estimates.
 for(const [lat,lon,pop,jobs,r] of [
  [31.005,121.227,12500,8500,3.0],[31.150,121.117,8500,6000,2.3],[30.917,121.455,11000,7000,2.6],
  [30.917,121.648,6000,4500,1.7],[30.833,121.520,3000,1800,1.5],
  [30.747,121.334,9000,12000,2.4],[30.891,121.158,6000,5000,1.8],[31.384,121.245,9500,9000,2.5],
  [31.296,121.156,7000,12000,2.3],[31.621,121.397,8500,3500,2.2],[31.389,121.699,1800,1700,1.7],
  [31.054,121.751,6000,5000,2.0],[30.900,121.922,900,400,1.8],[31.301,120.620,24000,22000,4.5],
  [31.298,120.548,7000,6000,2.8],[31.304,120.712,2800,5500,2.8],[31.368,120.644,4500,4000,2.8],
  [31.161,120.639,9000,7000,2.5],[31.386,120.975,14000,13000,3.4],[31.285,121.094,3500,3500,1.8],
  [31.460,121.129,9000,8500,2.6],[31.654,120.750,11000,10000,3.2],[31.866,120.548,9000,10000,3.2]
 ]){const p=ll(lat,lon);D.centers.push({x:p[0],y:p[1],pop,jobs,r});}
 const facilities=[
  ['sz_station','苏州站','rail',31.3268,120.6067,1990,[[1990,2.5],[2010,5],[2020,9]]],
  ['sz_north','苏州北站','rail',31.4193,120.6431,2011,[[2011,2],[2020,5]]],
  ['sz_parkrail','苏州园区站','rail',31.3412,120.7036,2010,[[2010,1],[2020,2.5]]],
  ['sz_kunshanrail','昆山南站','rail',31.3445,120.9499,2010,[[2010,2],[2020,5]]],
  ['sh_songjiangrail','上海松江站','rail',30.9850,121.2290,2010,[[2010,1],[2025,3]]],
  ['sh_jinshanrail','金山卫站','rail',30.7276,121.3500,2012,[[2012,.7],[2020,1.5]]],
  ['sz_changshurail','常熟站','rail',31.7004,120.8220,2020,[[2020,1.5],[2030,3]]],
  ['sz_taicangrail','太仓站','rail',31.4881,121.2033,2020,[[2020,1],[2030,2.5]]]
 ];
 for(const [id,n,t,lat,lon,y0,pax] of facilities){const at=point(n,lat,lon);D.facilities.push({id,n,t,at,y0,pax,note:'真实铁路枢纽；位置优先对齐 OSM 同名点，市内接驳客流为估算'});D.landmarks.push({id,name:n,x:at[0],y:at[1],year:y0,w:300,d:120,kind:'rail'});}
 for(const [id,n,t,lat,lon,y0,w] of [
  ['sz_university','苏州大学','uni',31.300,120.641,1990,.035],['sh_songjianguni','松江大学城','uni',31.057,121.204,2001,.045],
  ['sh_fengxian','奉贤南桥商圈','shop',30.917,121.455,1990,.03],['sh_fengcheng','奉城商圈','shop',30.917,121.648,1990,.018],
  ['sh_haiwan','华东理工大学奉贤校区','uni',30.833,121.520,2007,.025],['sh_zhujing','朱泾商圈','shop',30.891,121.158,1990,.018],['sh_jinshan','金山石化产业区','cbd',30.732,121.319,1990,.04],
  ['sh_lingang','临港产业区','cbd',30.899,121.911,2003,.05],['sz_sip','苏州工业园区','cbd',31.319,120.707,1994,.06],
  ['sz_huaqiao','花桥商务区','cbd',31.285,121.094,2006,.035],['sh_chongming','崇明城桥商圈','shop',31.621,121.397,1990,.025],
  ['sh_zjj','朱家角古镇','scenic',31.111,121.049,1990,.02],['sz_tongli','同里古镇','scenic',31.160,120.719,1990,.02],
  ['sz_gardens','拙政园','scenic',31.324,120.623,1990,.025],['sz_jinji','金鸡湖东岸','shop',31.317,120.701,2004,.03],
  ['sh_necc','国家会展中心','venue',31.190,121.301,2015,.04]
 ])D.facilities.push({id,n,t,at:point(n,lat,lon),y0,w,note:'真实地点；设施吸引权重为区域经营估算'});
 const pvg=D.facilities.find(f=>f.id==='sh_pvgair');if(pvg){pvg.n='浦东国际机场';pvg.at=point('浦东国际机场',31.151,121.805);delete pvg.ext;pvg.note='浦东机场已纳入地图，1999 年启用；接驳客流为估算';}
 const hq=D.facilities.find(f=>f.id==='sh_hqair');if(hq)hq.note='1999 年浦东机场启用后国际航线逐步迁出，2010 年 T2 启用；两机场均在地图内';
 D.briefing.lead='1990 年，上海与苏州尚未拥有城市地铁。上海中心城区需要越江骨干线，苏州古城与工业城镇需要接入区域交通；松浦大桥已在上游通车，南浦大桥则要到 1991 年底。现代地形作为建设底图，人口与区域开发为模型估算。';
 D.briefing.modes.forEach(r=>{r[2]=r[2].replace('黄浦江上没有桥，过江只能','中心城区黄浦江过江主要');});
 // Full regional scope includes pre-1990 upstream crossings; do not repeat the old central-map claim.

 Object.assign(D.roadYears,{'上海长江隧道':2009,'上海长江大桥':2009,'崇启大桥':2011,'苏通长江公路大桥':2008,'沪苏通长江公铁大桥':2020,'松浦大桥':1976,'奉浦大桥':1995,'东海大桥':2005});
 const task=(id,title,year,deadline,pts,reward,desc)=>({id,title,appear:[year,1],deadline:[deadline,12],type:'connect',reward,desc:'区域规划挑战（期限、奖励为模拟）：'+desc,anchors:pts.map(p=>anchor(...p))});
 D.histTasks.push(
  task('shr_south','南部新城走廊',2000,2015,[['莘庄',31.113,121.380],['南桥',30.917,121.455],['金山卫站',30.7276,121.350]],450000,'把奉贤和金山接入上海网络，平衡长距离建设成本与人口覆盖。'),
  task('shr_airport','两机场直达网络',1999,2015,[['虹桥站',31.196,121.316],['浦东国际机场',31.151,121.805]],400000,'让两个国际门户接入同一运营网络，承担跨城接驳需求。'),
  task('shr_chongming','跨越长江口',2009,2035,[['城桥镇',31.621,121.397],['长兴岛',31.389,121.699],['外高桥',31.338,121.597]],600000,'连通崇明、长兴与浦东，跨江工程由你选择，保留岛内服务。'),
  task('shr_suzhou','沪苏跨城走廊',2010,2030,[['安亭',31.296,121.156],['花桥',31.285,121.094],['昆山南站',31.3445,120.9499],['苏州园区站',31.3412,120.7036],['苏州站',31.3268,120.6067]],700000,'连接沿线城市与铁路枢纽，不要求照搬现实线路。'),
  task('shr_lingang','面向临港的网络',2003,2030,[['龙阳路',31.203,121.557],['惠南',31.054,121.751],['滴水湖',30.907,121.929]],450000,'为浦东南部新城和产业片区建立持续服务。'),
  task('shr_lakes','淀山湖两岸',2010,2030,[['虹桥站',31.196,121.316],['青浦',31.150,121.117],['朱家角',31.111,121.049],['吴江',31.161,120.639]],500000,'连接青浦与吴江，按照真实湖岸选择绕行或跨水工程。'));
 // Earlier blanket coverage targets assumed a 38 km city core; regional objectives scale accordingly.
 for(const t of D.histTasks)if(t.id==='sh4'){t.target=.14;t.title='区域人口覆盖起步';t.desc='2007 年底前，让区域模型 14% 的人口步行 15 分钟可达地铁。';}else if(t.id==='sh8'){t.target=.3;t.title='区域骨干网络';t.desc='2016 年底前，让区域模型 30% 的人口步行 15 分钟可达地铁。';}
 const era=D.eras[D.eras.length-1];era.corridors=(era.corridors||[]).concat([{a:'sz_kunshan',b:'jiading',f:1.35},{a:'sz_park',b:'sz_gusu',f:1.3},{a:'fengxian',b:'xinzhuang',f:1.3},{a:'lingang',b:'jinqiao',f:1.25}]);
 for(const e of D.events||[])if(e.desc)e.desc=e.desc.replace('（地图范围外附近）','');
})(window.CM);
