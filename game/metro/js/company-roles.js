'use strict';
// Playable companies share the existing regional geography. Company permits,
// budgets, local events and missions are game scenarios, never historical claims.
(function (CM) {
  const clone = function (v) {
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') { const out = {}; for (const k of Object.keys(v)) out[k] = clone(v[k]); return out; }
    return v;
  };
  const ROLES = [
    { id: 'sh', name: '上海', company: '上海轨道公司', color: '#d62849', funds: 450000, grant: 1,
      center: [31.2304, 121.4737], core: ['huangpu', 'jingan', 'xuhui', 'changning', 'hongkou'],
      startArea: '浦西中心城区', summary: '从浦西客流走廊起步，承担黄浦江两岸通勤，再向上海郊区与沪苏走廊扩展。',
      progression: '浦西中心 → 浦东与近郊 → 沪苏跨城',
      firstTask: '南北主轴', timeline: [[1990, '浦西中心起步'], [1993, '浦东与越江经营'], [2003, '昆山走廊开放'], [2010, '区域骨干网络']] },
    { id: 'sz', name: '苏州', company: '苏州轨道公司', color: '#008f77', funds: 300000, grant: .68,
      center: [31.305, 120.619], core: ['sz_gusu', 'sz_wuzhong'], startArea: '姑苏与吴中',
      summary: '先连接古城、铁路枢纽与吴中居民区，再服务高新区和园区，最终向昆山与上海延伸。',
      progression: '古城与吴中 → 高新区、园区 → 昆山、沪苏走廊', firstTask: '古城南北联系',
      open: { sz_gusu: 1990, sz_wuzhong: 1990, sz_huqiu: 1992, sz_park: 1994, sz_xiangcheng: 1996, sz_wujiang: 1998, sz_kunshan: 2000, sz_taicang: 2004, sz_changshu: 2006, sz_zhangjiagang: 2008 },
      partners: { sh: 2010, wx: 2005, cz: 2015, nt: 2015, jx: 2012, hu: 2015 },
      timeline: [[1990, '古城与吴中起步'], [1994, '园区经营阶段'], [2000, '昆山经营范围开放'], [2010, '沪苏网络协作']],
      routes: [
        ['古城南北联系', 1990, 1997, 160000, [['苏州站', 31.3268, 120.6067], ['观前街', 31.310, 120.622], ['吴中城区', 31.263, 120.632]]],
        ['园区与古城通勤', 1994, 2004, 210000, [['观前街', 31.310, 120.622], ['苏州大学', 31.300, 120.641], ['苏州工业园区', 31.319, 120.707]]],
        ['走向昆山', 2000, 2018, 350000, [['苏州工业园区', 31.319, 120.707], ['昆山城区', 31.386, 120.975], ['花桥', 31.285, 121.094]]]
      ] },
    { id: 'wx', name: '无锡', company: '无锡轨道公司', color: '#1e88ba', funds: 260000, grant: .60,
      center: [31.575, 120.300], core: ['wx_core'], startArea: '无锡城区',
      summary: '围绕梁溪老城、铁路枢纽和太湖沿岸建设紧凑线网，随后承担江阴产业通勤与苏锡联系。',
      progression: '无锡城区 → 江阴 → 苏锡常协作', firstTask: '梁溪城市骨架',
      open: { wx_core: 1990, wx_jiangyin: 1998 }, partners: { sh: 2015, sz: 2005, cz: 2008, nt: 2018, jx: 2018, hu: 2015 },
      timeline: [[1990, '梁溪城区起步'], [1995, '太湖沿岸服务'], [1998, '江阴开放'], [2008, '苏锡常协作']],
      routes: [
        ['梁溪城市骨架', 1990, 1997, 150000, [['无锡站', 31.591, 120.301], ['三阳广场', 31.576, 120.299], ['清名桥', 31.553, 120.313]]],
        ['太湖与产业通勤', 1995, 2006, 210000, [['三阳广场', 31.576, 120.299], ['蠡园片区', 31.520, 120.276], ['无锡新区', 31.500, 120.365]]],
        ['江阴南北联系', 1998, 2016, 330000, [['无锡站', 31.591, 120.301], ['惠山城区', 31.680, 120.298], ['江阴城区', 31.911, 120.277]]]
      ] },
    { id: 'cz', name: '常州', company: '常州轨道公司', color: '#7e62be', funds: 240000, grant: .55,
      center: [31.778, 119.974], core: ['cz_core'], startArea: '常州图内城区',
      summary: '在地图西缘的常州城区组织南北通勤，平衡旧城、武进与新北，再沿东部走廊连接无锡。',
      progression: '常州城区 → 武进、新北服务 → 无锡走廊', firstTask: '常州南北通勤',
      open: { cz_core: 1990 }, partners: { sh: 2018, sz: 2010, wx: 2000, nt: 2020, jx: 2020, hu: 2018 },
      timeline: [[1990, '常州城区起步'], [1996, '南北服务加密'], [2000, '向无锡扩展'], [2010, '苏锡常协作']],
      routes: [
        ['常州南北通勤', 1990, 1997, 145000, [['常州站', 31.787, 119.970], ['文化宫', 31.776, 119.962], ['湖塘', 31.720, 119.942]]],
        ['新北与旧城', 1996, 2006, 180000, [['新北城区', 31.823, 119.973], ['常州站', 31.787, 119.970], ['文化宫', 31.776, 119.962]]],
        ['向东连接无锡', 2000, 2020, 400000, [['常州站', 31.787, 119.970], ['横林', 31.702, 120.095], ['无锡站', 31.591, 120.301]]]
      ] },
    { id: 'nt', name: '南通', company: '南通轨道公司', color: '#dd8b24', funds: 240000, grant: .55,
      center: [32.015, 120.865], core: ['nt_core'], startArea: '南通图内城区',
      summary: '先覆盖濠河周边、崇川和开发区，再服务图内如皋地区；跨长江工程是后期选择。',
      progression: '崇川城区 → 开发区与如皋 → 长江两岸协作', firstTask: '濠河与崇川',
      open: { nt_core: 1990, nt_rugao: 2000 }, partners: { sh: 2018, sz: 2010, wx: 2015, cz: 2020, jx: 2020, hu: 2020 },
      timeline: [[1990, '崇川城区起步'], [1996, '开发区联系'], [2000, '如皋图内片区开放'], [2010, '跨江经营阶段']],
      routes: [
        ['濠河与崇川', 1990, 1997, 145000, [['南大街', 32.014, 120.860], ['崇川城区', 31.988, 120.886], ['狼山片区', 31.956, 120.896]]],
        ['开发区通勤骨架', 1996, 2006, 190000, [['崇川城区', 31.988, 120.886], ['南通开发区', 31.925, 120.944], ['竹行', 31.896, 120.990]]],
        ['江北向南联系', 2010, 2030, 480000, [['南通开发区', 31.925, 120.944], ['苏通北岸', 31.823, 121.012], ['常熟城区', 31.654, 120.750]]]
      ] },
    { id: 'jx', name: '嘉兴', company: '嘉兴轨道公司', color: '#c25984', funds: 220000, grant: .50,
      center: [30.762, 120.753], core: ['jx_core'], startArea: '南湖与秀洲',
      summary: '从南湖与秀洲的生活圈起步，逐步连接嘉善、平湖和桐乡，建设嘉兴多中心网络。',
      progression: '南湖、秀洲 → 嘉善、平湖 → 桐乡与沪嘉联系', firstTask: '南湖城市联系',
      open: { jx_core: 1990, jx_jiashan: 1996, jx_pinghu: 1998, jx_tongxiang: 2000, jx_haiyan: 2004 },
      partners: { sh: 2010, sz: 2008, wx: 2018, cz: 2020, nt: 2020, hu: 2008 },
      timeline: [[1990, '南湖与秀洲起步'], [1996, '嘉善开放'], [2000, '桐乡开放'], [2010, '沪嘉网络协作']],
      routes: [
        ['南湖城市联系', 1990, 1997, 140000, [['嘉兴站', 30.768, 120.756], ['南湖城区', 30.747, 120.756], ['秀洲城区', 30.764, 120.708]]],
        ['嘉善与平湖', 1998, 2010, 260000, [['嘉兴站', 30.768, 120.756], ['嘉善城区', 30.842, 120.925], ['平湖城区', 30.700, 121.015]]],
        ['桐乡多中心联系', 2000, 2016, 250000, [['嘉兴站', 30.768, 120.756], ['濮院', 30.682, 120.628], ['桐乡城区', 30.631, 120.564]]]
      ] },
    { id: 'hu', name: '湖州', company: '湖州轨道公司', color: '#658c41', funds: 220000, grant: .50,
      center: [30.862, 120.098], core: ['hu_core'], startArea: '吴兴与南浔',
      summary: '先连接湖州中心、织里和南浔，在太湖南岸组织东西向出行，随后扩展到长兴及图内周边。',
      progression: '吴兴、南浔 → 长兴 → 太湖南岸协作', firstTask: '湖州城区骨架',
      open: { hu_core: 1990, hu_changxing: 1998, hu_deqing: 2002, hu_anji: 2006 },
      partners: { sh: 2015, sz: 2010, wx: 2012, cz: 2018, nt: 2020, jx: 2005 },
      timeline: [[1990, '吴兴与南浔起步'], [1995, '织里、南浔联系'], [1998, '长兴开放'], [2005, '湖嘉协作']],
      routes: [
        ['湖州城区骨架', 1990, 1997, 140000, [['湖州老城', 30.861, 120.101], ['凤凰片区', 30.884, 120.088], ['仁皇山片区', 30.894, 120.088]]],
        ['织里与南浔', 1995, 2008, 270000, [['湖州老城', 30.861, 120.101], ['织里', 30.866, 120.263], ['南浔城区', 30.872, 120.417]]],
        ['太湖南岸联系', 1998, 2016, 280000, [['湖州老城', 30.861, 120.101], ['太湖南岸', 30.950, 120.095], ['长兴城区', 31.026, 119.910]]]
      ] }
  ];
  const byId = Object.fromEntries(ROLES.map(r => [r.id, r]));
  const Roles = CM.CompanyRoles = {};
  Roles.list = function () { return ROLES.map(clone); };
  Roles.get = function (id) { return clone(byId[id] || byId.sh); };
  const xy = function (lat, lon) { const p = CM.MAPS.sh.geo.proj; return { x: +((lon - p.lon0) * p.kx).toFixed(2), y: +((p.lat0 - lat) * p.ky).toFixed(2) }; };
  Roles.camera = function (id) { const p = xy(...(byId[id] || byId.sh).center); return { cx: p.x, cy: p.y, zoom: 14 }; };
  const anchor = function (p) { return Object.assign({ name: p[0], r: 5 }, xy(p[1], p[2])); };
  const missions = function (r) { return (r.routes || []).map(function (q, i) {
    return { id: 'company-' + r.id + '-' + (i + 1), title: '经营任务 · ' + q[0], type: 'connect',
      appear: [q[1], 1], deadline: [q[2], 12], reward: q[3], anchors: q[4].map(anchor),
      desc: '公司经营模拟：连接' + q[4].map(p => p[0]).join('、') + '。期限、奖励和建设顺序均为玩法设定，不代表真实线路或通车计划。' };
  }); };
  Roles.configure = function (mapId, id) {
    if (mapId !== 'sh') return null;
    const m = CM.MAPS.sh, r = byId[id] || byId.sh, D = clone(m.data);
    // Every switch begins with the registered map data, never the previous role.
    // Keep region and landmark order stable so saved cell indices retain meaning.
    for (const k of Object.keys(m.cfg)) CM.CFG[k] = clone(m.cfg[k]);
    D.playerCity = r.id; D.companyName = r.company;
    if (r.id !== 'sh') {
      D.city = r.name + ' · 长三角';
      for (const reg of D.regions.concat(D.defaultRegion)) {
        if (reg.scenic || reg.lockNote || reg.open == null) continue;
        if (Object.prototype.hasOwnProperty.call(r.open, reg.id)) reg.open = r.open[reg.id];
        else {
          const other = byId[reg.cityId], localYear = other && other.open && other.open[reg.id];
          reg.open = Math.max(localYear == null ? reg.open : localYear, r.partners[reg.cityId] || 2025);
        }
        if (reg.open <= 1990) delete reg.pop;
        reg.note = (reg.note ? reg.note + '；' : '') + '本局公司建设权限按模拟经营阶段开放，不代表城市现实开发年份';
      }
      const E = CM.CFG.economy;
      E.startFunds = r.funds; E.grantBase = E.grantBase.map(p => [p[0], Math.round(p[1] * r.grant)]);
      E.debtLimit = -Math.round(300000 * r.grant);
      // National/global macro events remain common. Shanghai-specific local
      // shocks are not relabelled as historical events in another city.
      if (CM.CFG.macro && typeof CM.CFG.macro === 'object') {
        CM.CFG.macro.events = CM.CFG.macro.events.filter(e => !['pudong1990', 'expo2010'].includes(e.id));
        for (const e of CM.CFG.macro.events) if (e.id === 'gfc2008') delete e.desc;
        CM.CFG.macro.area = '长三角图内区域经济（估算）；' + r.name + '公司财政独立核算';
      }
      const localRegions = Object.keys(r.open);
      D.eras = [
        { id: r.id + '-company-1', from: 1990, name: r.name + ' · 核心起步', tag: '模拟', summary: '公司经营模拟：' + r.summary + '所有城市在同一地图独立发展；本公司的建设权限按阶段开放。',
          grow: { pop: Object.fromEntries(r.core.map(k => [k, 1.2])), jobs: Object.fromEntries(r.core.map(k => [k, 1.3])) }, demand: { decayHW: .9 } },
        { id: r.id + '-company-2', from: 1996, name: r.name + ' · 多中心联系', tag: '模拟', summary: '公司经营模拟：完善' + r.progression + '的联系，先改善本地通勤，再延伸到新开放片区。',
          grow: { pop: Object.fromEntries(localRegions.map(k => [k, 1.2])), jobs: Object.fromEntries(localRegions.map(k => [k, 1.25])) }, demand: { decayHW: 1.05 } },
        { id: r.id + '-company-3', from: 2010, name: r.name + ' · 跨城协作', tag: '模拟', summary: '公司经营模拟：在已开放地区连接其他城市的交通网络，平衡跨城服务、运营成本与本地覆盖。', demand: { decayHW: 1.15, hub: 1.1 } },
        { id: r.id + '-company-4', from: 2021, name: r.name + ' · 模拟未来', tag: '模拟', summary: '人口、岗位、网络与公司经营继续按模型演化，不代表现实规划或历史。', demand: { decayHW: 1.2 } }
      ];
      D.stages = [[1996, '核心起步'], [2010, '多中心联系'], [2021, '跨城协作']]; D.stageLast = '模拟未来';
      D.histTasks = missions(r); D.dynTasks = []; D.scenarios = [];
      const commonEvents = D.events.filter(e => e.y === 2020 && /疫情/.test(e.title));
      D.events = r.timeline.map(function (p, i) {
        return { y: p[0], m: 1, tag: '模拟经营', title: r.name + ' · ' + p[1],
          desc: '公司经营模拟：' + (i === 0 ? r.summary : r.progression + '。根据已开放区域安排下一阶段建设。') + '开放时间、客流倾向与任务期限为玩法设定。',
          fx: i === 1 ? { grow: { region: localRegions, jobs: 1.15, years: 4 } } : undefined };
      }).concat(commonEvents, [{ y: 2021, m: 1, tag: '模拟', title: r.name + '进入模拟未来', desc: '后续发展为游戏推演，不代表现实轨道建设规划。' }]).sort((a, b) => a.y - b.y || a.m - b.m);
      D.briefing = { lead: '你经营' + r.company + '，从 1990 年的' + r.startArea + '起步。' + r.summary + '这是现实地理上的公司经营模拟，资金、任务与开放节奏为玩法设定。', modes: [
        ['metro', '本地骨干', '首批目标：' + r.firstTask + '。先建设能够持续运营的本地线路。'],
        ['map', '区域权限', r.progression + '。未开放地区继续演化，到达条件后才可由你建设。'],
        ['building', '其他城市公司', '其余城市拥有独立资产、车队和收支，可在本地自主建设；不使用你的建设资金。'],
        ['rail', '真实地理', '地图范围保持 235 × 160 km，仅图内陆域参与。水面、保护地与设施建设约束继续适用。']
      ] };
      D.taskNote = r.company + '专属经营模拟：本地任务、资金、权限日期与增长倾向均为玩法设定；不代表真实公司、历史地铁路线或政府建设计划。全国与全球经济事件沿用共同历史背景。';
    }
    if (r.id === 'sh') D.briefing.lead = '你经营' + r.company + '。' + D.briefing.lead;
    D.dataNote = (D.dataNote || []).concat([['公司角色', 'sim', '本局经营' + r.company + '。公司、建设权限、财务与专属任务为模拟；其他城市自主运营，地图范围不变。']]);
    for (const k of Object.keys(CM.DATA)) delete CM.DATA[k];
    Object.assign(CM.DATA, D);
    if (CM.Metro && CM.Metro.clearCaches) CM.Metro.clearCaches();
    return Roles.get(r.id);
  };
})(window.CM);
