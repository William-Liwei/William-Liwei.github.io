'use strict';
// Independent single-city scenario. Reuse the maintained Shanghai places and
// rules, while keeping the regional map ID, coordinates and old saves intact.
(function (CM) {
  const source = CM.MAP_LIST.find(function (m) { return m.id === 'sh'; }), G = CM.GEOS['sh-city'];
  if (!source || !G) throw Error('Shanghai city geography or scenario is missing');
  const clone = function (x) { return JSON.parse(JSON.stringify(x)); }, E = G.cityExtent;
  const D = clone(source.data), cfg = clone(source.cfg), rings = G.cityBoundary.map(function (s) { return CM.Geo.dec(s, 1); });
  D.places = G.places.map(function (p) { return p.slice(); });
  const namedPlaces = new Set(D.places.map(function (p) { return p[0]; }));
  const xy = function (p) { return [+(p[0] - E.left).toFixed(4), +(p[1] - E.top).toFixed(4)]; };
  const inside = function (x, y) {
    x -= E.left; y -= E.top; let hit = false;
    for (const ring of rings) for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ax = ring[i], ay = ring[i + 1], bx = ring[j], by = ring[j + 1];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) hit = !hit;
    }
    return hit;
  };
  const shift = function (o) { const p = xy([o.x, o.y]); o.x = p[0]; o.y = p[1]; return o; };
  const shiftPoly = function (p) { return typeof p[0][0] === 'number' ? p.map(xy) : p.map(function (r) { return r.map(xy); }); };
  const tasks = function (list) {
    return (list || []).filter(function (t) { return (t.anchors || []).every(function (a) { return Array.isArray(a) ? namedPlaces.has(a[0]) : inside(a.x, a.y); }); }).map(function (t) { (t.anchors || []).forEach(function (a) { if (!Array.isArray(a)) shift(a); }); return t; });
  };
  cfg.W = E.W; cfg.H = E.H; cfg.ZONE = 16;
  cfg.growth.popCurve = [[1990, 13.3e6], [2000, 16.4e6], [2010, 23e6], [2020, 24.9e6], [2030, 26e6], [2050, 27e6], [2300, 28e6]];
  cfg.macro.area = '上海市行政范围内陆域（全市模型估算）'; cfg.macro.gdp0 = 7800000;
  D.city = '上海'; D.companyName = '上海轨道公司'; D.playerCity = 'sh';
  D.regions = D.regions.filter(function (r) { return r.cityId === 'sh'; });
  const regionIds = new Set(D.regions.map(function (r) { return r.id; }));
  for (const r of D.regions) {
    if (r.poly) r.poly = shiftPoly(r.poly);
    if (r.open <= 1990) delete r.pop;
  }
  // Every Shanghai district has an OSM administrative match. Context land at the
  // rectangular edges stays real land, but cannot generate people or be built on.
  D.defaultRegion = { id: 'outside-shanghai', name: '上海市界外', outside: true, open: null, plan: 'res', lockNote: '上海单城市地图仅在上海市行政范围内建设' };
  D.progressiveRegions = true;
  D.centers = D.centers.filter(function (c) { return inside(c.x, c.y); }).map(shift);
  D.landmarks = D.landmarks.filter(function (p) { return inside(p.x, p.y); }).map(shift);
  D.facilities = D.facilities.filter(function (f) { return !f.at || inside(f.at[0], f.at[1]); }).map(function (f) { if (f.at) f.at = xy(f.at); return f; });
  for (const k of ['histTasks', 'dynTasks', 'scenarios']) D[k] = tasks(D[k]);
  for (const er of D.eras) {
    er.goals = tasks(er.goals);
    er.corridors = (er.corridors || []).filter(function (c) { return regionIds.has(c.a) && regionIds.has(c.b); });
    for (const kind of ['grow', 'relocate']) if (er[kind]) for (const key of ['pop', 'jobs']) if (er[kind][key]) {
      er[kind][key] = Object.fromEntries(Object.entries(er[kind][key]).filter(function (p) { return regionIds.has(p[0]); }));
    }
  }
  if (D.airport) {
    if (D.airport.runway) D.airport.runway = D.airport.runway.map(xy);
    if (D.airport.runwayExt) D.airport.runwayExt = D.airport.runwayExt.map(xy);
  }
  for (const r of D.runways || []) { r.a = xy(r.a); r.b = xy(r.b); }
  D.reclaim = (D.reclaim || []).map(function (r) { r.poly = shiftPoly(r.poly); return r; });
  for (const t of D.histTasks) {
    if (t.id === 'sh4') { t.target = .2; t.title = '上海人口覆盖起步'; t.desc = '2007 年底前，让全市模型 20% 的人口步行 15 分钟可达地铁。'; }
    if (t.id === 'sh8') { t.target = .4; t.title = '上海骨干网络'; t.desc = '2016 年底前，让全市模型 40% 的人口步行 15 分钟可达地铁。'; }
    t.desc = (t.desc || '').replace('区域规划挑战', '上海规划挑战').replace('承担跨城接驳需求', '承担全市接驳需求');
  }
  D.briefing.lead = '从 1990 年的上海开始，在完整上海行政范围内经营地铁。金山、奉贤、松江、青浦、嘉定、浦东以及崇明、长兴、横沙都属于本城，片区按发展阶段开放。';
  D.briefing.modes = [['metro', '全市网络', '先服务中心城区，再连接南部新城、临港和长江口岛屿；真实线路不会自动建成。'], ['map', '上海行政范围', '使用真实水系、海岸和 16 个行政区边界；市界外仅显示地理背景，不参与人口、就业或公司经营。'], ['building', '单城市经营', '只有自己的上海轨道公司，无长三角其他公司竞争；全市人口、经济和交通独立结算。'], ['rail', '分期建设', '金山、奉贤、崇明等片区按年份或发展条件开放；自由建造可以解锁上海全域。']];
  D.taskNote = '上海全市单城市经营。地形与行政边界来自现有 OpenStreetMap 数据；人口、岗位、财政及片区开放条件为模型估算。2020 年后为模拟，规划挑战的期限与奖励为玩法设定。';
  D.dataNote = [['地图范围', 'info', '上海 16 个行政区与长江口岛屿，保留真实海岸与水系；矩形边缘的市界外陆地不参与经营。'], ['人口与经济', 'est', '全上海行政范围口径，历史人口曲线与开局 GDP 为模型估算；未来由本局经营推演。'], ['交通模型', 'est', '地形网格 250 m，交通小区 4 km，工作日与周末分别模拟；不计算地图外城市的经营与通勤。']];
  const m = Object.assign({}, source, {
    id: 'sh-city', mapType: 'city', name: '上海', title: '上海 · 全市 · 1990', sub: '完整上海行政范围 · 单城市经营',
    scenario: 'sh-city-1990', mapVersion: 1, terrainRevision: 1,
    desc: '完整上海单城市地图：中心城区、金山、奉贤、崇明与临港均可逐步建设。人口、经济和交通只计算上海市内，没有区域公司竞争。',
    intro: D.briefing.lead,
    tagline: '从中心城区走向金山、奉贤与崇明', tags: ['上海全市', '单城市', '分期开放'],
    facts: [['范围', E.W / 4 + ' km × ' + E.H / 4 + ' km（上海行政范围）'], ['起始', '1990 年'], ['人口', '约 1330 万（全市模型估算）'], ['货币', '人民币（元）'], ['模式', '经营挑战 / 自由建造']],
    features: [['map', '上海全域', '16 个行政区，包含金山、奉贤、崇明、长兴与横沙'], ['bridge', '真实江海', '黄浦江、长江口、杭州湾与真实岛屿约束建设'], ['building', '单城市经营', '独立上海人口、经济与通勤，聚焦自己的城市网络'], ['flag', '全市任务', '中心城区、南部新城、临港与崇明均有建设目标']],
    geo: G, data: D, cfg: cfg, cam: { cx: 607 - E.left, cy: 368 - E.top, zoom: 12 }
  });
  delete m.extent; delete m.regionUpgrade;
  source.mapType = 'region';
  CM.MAP_LIST.push(m);
})(window.CM);
