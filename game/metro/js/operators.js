'use strict';
// Independently financed regional rail operators. All assets use the ordinary
// network, fleet and passenger solver. Dates/capital are explicitly game rules.
(function (CM) {
  const O = CM.Operators = {}, U = CM.U, CFG = CM.CFG, M = CM.Metro;
  const DEFINITIONS = O.DEFINITIONS = [
    { id: 'sh', name: '上海轨道公司', city: '上海', year: 1995, strength: 1.5, lat: 31.230, lon: 121.473, color: '#c04b4b', neighbors: ['sz','jx','nt'] },
    { id: 'sz', name: '苏州轨道公司', city: '苏州', year: 1998, strength: 1.25, lat: 31.306, lon: 120.619, color: '#a65384', neighbors: ['wx','jx','sh'] },
    { id: 'wx', name: '无锡轨道公司', city: '无锡', year: 2004, strength: 1.1, lat: 31.576, lon: 120.296, color: '#208f9e', neighbors: ['sz','cz'] },
    { id: 'jx', name: '嘉兴轨道公司', city: '嘉兴', year: 2007, strength: .85, lat: 30.753, lon: 120.755, color: '#ac7929', neighbors: ['sz','hu','sh'] },
    { id: 'cz', name: '常州轨道公司', city: '常州', year: 2009, strength: .82, lat: 31.780, lon: 119.969, color: '#6378b1', neighbors: ['wx'] },
    { id: 'nt', name: '南通轨道公司', city: '南通', year: 2012, strength: .75, lat: 32.010, lon: 120.864, color: '#518d51', neighbors: ['sz','sh'] },
    { id: 'hu', name: '湖州轨道公司', city: '湖州', year: 2014, strength: .65, lat: 30.865, lon: 120.105, color: '#aa664d', neighbors: ['jx','sz'] }
  ];
  const IDS = new Set(DEFINITIONS.map(d => d.id)), MAX_STATIONS = O.MAX_STATIONS = 48, MAX_PROJECTS = 2;
  const KINDS = ['grant', 'fare', 'ops', 'construction', 'fleet'];
  const runtime = new WeakMap();
  const defOf = id => DEFINITIONS.find(d => d.id === id);
  const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  const moneyFields = () => ({ grant: 0, fare: 0, ops: 0, construction: 0, fleet: 0 });
  const monthFields = ym => Object.assign({ ym }, moneyFields());
  O.owner = x => x && typeof x.ownerId === 'string' && x.ownerId ? x.ownerId : 'player';
  O.isPlayer = x => O.owner(x) === 'player';
  O.playerNetwork = function (net) {
    const lines = Object.fromEntries(Object.entries(net.lines).filter(([, x]) => O.isPlayer(x)));
    return { lines, segments: Object.fromEntries(Object.entries(net.segments).filter(([, x]) => lines[x.line])), stations: Object.fromEntries(Object.entries(net.stations).filter(([, x]) => O.isPlayer(x))), nextId: net.nextId };
  };
  O.enabled = g => !!g && g.mapId === 'sh' && !g.tutorial && g.city && g.city.regions.some(r => r.cityId === 'sz');
  O.attach = function (g) { if (g && g.city) Object.defineProperty(g.city, 'operatorGame', { value: g, configurable: true, writable: true, enumerable: false }); };
  const fresh = g => ({ v: 1, since: g.ym(), lastMonth: -1, lastDay: -1, lastBuild: -1, companies: {}, log: [], indexHistory: [] });
  O.ensure = function (g) { O.attach(g); if (O.enabled(g) && !g.operators) g.operators = fresh(g); return g.operators || null; };
  O.company = (g, id) => g.operators && g.operators.companies[id] || null;
  const emit = g => { if (g.touch) g.touch(); if (g.emit) g.emit('operators'); };
  const log = function (g, id, title, desc) {
    const s = O.ensure(g); if (!s) return;
    s.log.push({ ym: g.ym(), ownerId: id, title: title.slice(0, 120), desc: (desc || '').slice(0, 500) });
    if (s.log.length > 30) s.log.shift();
    if (g.logEvent) g.logEvent({ tag: '城市公司', title, desc: desc || '' }); emit(g);
  };
  function rotate(c, ym) { if (c.cur.ym === ym) return; c.history.push(c.cur); if (c.history.length > 24) c.history.shift(); c.cur = monthFields(ym); }
  function book(g, c, kind, amount, incoming) { rotate(c, g.ym()); c.funds += incoming ? amount : -amount; c.total[kind] += amount; c.cur[kind] += amount; }
  O.spend = function (g, id, kind, amount, note) {
    const c = O.company(g, id); if (!c || !KINDS.includes(kind) || !finite(amount, 0, 1e12) || c.funds - c.projects.filter(p => p.phase === 'building').reduce((a,p) => a + p.estimate, 0) + 1e-7 < amount) return false;
    book(g, c, kind, amount, false); if (note) c.note = String(note).slice(0, 180); return true;
  };
  O.dailyAccount = (daily, compiled, year, id) => CM.Economy.dailyAccount(daily, compiled, year, id);
  O.daily = function (g, daily, dt) {
    const s = O.ensure(g); if (!s) return;
    const day = g.clock.y * 372 + (g.clock.m - 1) * 31 + g.clock.d; if (s.lastDay === day) return; s.lastDay = day;
    for (const c of Object.values(s.companies)) {
      const a = O.dailyAccount(daily, g.compiled, g.clock.y, c.id);
      book(g, c, 'fare', a.fare, true); book(g, c, 'ops', a.ops, false);
      c.lastDay = { fare: a.fare, ops: a.ops, pkm: a.pkm, dt: dt === 'we' ? 'we' : 'wd' };
    }
    O.updateSatisfaction(g);
    if (CM.OperatorControls && CM.OperatorControls.recordMonth) CM.OperatorControls.recordMonth(g);
  };
  O.playerCity = g => g.playerCity || 'sh';
  O.cityAt = function (g, cell) {
    const city = g.city; if (!integer(cell, 0, city.N - 1)) return null;
    const r = city.regions[city.region[cell]];
    if (r && r.cityId) return r.cityId;
    const k = city.lockRegion ? city.lockRegion(cell) : -1, base = city.regions[k]; return base && base.cityId || null;
  };
  O.canBuildCell = function (g, cell, id) {
    if (!g || !g.city || !integer(cell, 0, g.city.N - 1)) return false;
    if (!id || id === 'player') return !g.city.cellLocked(cell);
    const d = defOf(id); if (!d || id === O.playerCity(g) || !O.enabled(g) || g.clock.y < d.year) return false;
    if (g.city.landFrac[cell] < .1) return true; // Geography, bridge/tunnel and station checks still apply.
    const cityId = O.cityAt(g, cell); if (cityId === id) return true;
    if (g.clock.y < 2018 || !d.neighbors.includes(cityId)) return false;
    return cityId !== O.playerCity(g) || g.clock.y >= 2025 && !!(O.company(g, id) && O.company(g, id).crossPermit);
  };
  O.cityView = function (g, id) {
    O.attach(g); if (!id || id === 'player') return g.city;
    let r = runtime.get(g); if (!r) { r = { views: new Map() }; runtime.set(g, r); }
    const key = id + ':' + g.ym() + ':' + O.playerCity(g) + ':' + (O.company(g, id) && O.company(g, id).crossPermit ? 1 : 0), old = r.views.get(id);
    if (old && old.permissionKey === key) return old;
    const view = Object.create(g.city); view.operatorOwnerId = id; view.permissionKey = key;
    view.cellLocked = c => !O.canBuildCell(g, c, id); view.lockText = () => '不在该公司当前可建设的城市范围';
    r.views.set(id, view); return view;
  };
  O.developmentRegions = function (g) {
    if (!O.enabled(g)) return null;
    return g.city.regions.map(r => { const d = defOf(r.cityId); return !!d && r.cityId !== O.playerCity(g) && g.clock.y >= d.year; });
  };
  O.agreed = (g, id, stationId) => { const c = O.company(g, id); return !!c && c.agreements.includes(stationId); };
  O.agree = function (g, id, stationId) {
    const c = O.company(g, id), st = g.net.stations[stationId];
    if (!c || !st || O.owner(st) !== id) return { ok: false, error: '请选择该公司的已建车站' };
    if (g.clock.y < 2018) return { ok: false, error: '2018 年起开放跨公司换乘合作' };
    if (!c.agreements.includes(stationId)) c.agreements.push(stationId);
    emit(g); return { ok: true };
  };
  O.requestConnection = function (g, id, stationId) {
    const c = O.company(g, id), st = g.net.stations[stationId];
    if (!c || !st || !O.isPlayer(st)) return { ok: false, error: '请选择自己的已建车站' };
    const targetCity = O.cityAt(g, g.city.cellAt(st.x, st.y));
    if (g.clock.y < 2025 || !defOf(id).neighbors.includes(targetCity)) return { ok: false, error: '2025 年起可邀请相邻城市公司建设跨城接驳线' };
    if (c.projects.some(p => p.kind === 'cross')) return { ok: false, error: '该公司的跨城项目已经确定' };
    c.request = stationId; c.crossPermit = true; log(g, id, defOf(id).name + '收到接驳申请', '将评估连接「' + st.name + '」的联运换乘，建设和列车由该公司出资。'); return { ok: true };
  };
  function anchor(g, d) { const p = CM.GEO.proj; return [(d.lon - p.lon0) * p.kx, (p.lat0 - d.lat) * p.ky]; }
  function candidateSite(g, view, x, y, owner, used, homeOnly) {
    let best = null, score = -Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const px = x + dx, py = y + dy, c = g.city.cellAt(px, py);
      if (c < 0 || !O.canBuildCell(g, c, owner) || homeOnly && O.cityAt(g, c) !== owner || !M.checkSite(view, px, py, 'underground').ok) continue;
      if (CM.Property && CM.Property.find && CM.Property.find(g, c)?.owned) continue;
      if (used.some(s => U.dist(s.x, s.y, px, py) * CFG.CELL_M < Math.max(250, CFG.metro.minSpacingM))) continue;
      const val = Math.log1p(g.city.pop[c] + g.city.jobs[c]) - Math.hypot(dx, dy) * .8;
      if (val > score) { score = val; best = { x: +px.toFixed(3), y: +py.toFixed(3) }; }
    }
    return best;
  }
  function evaluatePoints(g, c, points, kind, target) {
    const view = O.cityView(g, c.id), draft = M.clone(g.net), lid = M.newLine(draft, defOf(c.id).city + (kind === 'cross' ? '联络线' : '城区线'));
    draft.lines[lid].ownerId = c.id; draft.lines[lid].color = defOf(c.id).color;
    const ids = [];
    const stops = [];
    for (const p of points) {
      if (p.stationId) { const st = draft.stations[p.stationId]; if (!st || U.dist(st.x,st.y,p.x,p.y) > .01 || O.isPlayer(st) && c.request !== st.id) return null; stops.push(st.id); continue; }
      const id = M.addStation(draft, p.x, p.y, { size: 'M', type: 'underground' }, view); draft.stations[id].ownerId = c.id; ids.push(id); stops.push(id);
    }
    for (let i = 1; i < stops.length; i++) M.addSegment(draft, lid, stops[i - 1], stops[i], [], 'underground');
    const ev = M.evaluate(draft, g.net, view, g.clock.y);
    if (ev.demolitions.some(x => CM.Property && CM.Property.find(g, x.c) && CM.Property.find(g, x.c).owned)) return null;
    if (ev.conflicts.length || !(ev.total > 0) || !Number.isFinite(ev.total)) return null;
    const C = M.compile(draft, view), quote = CM.Fleet && CM.Fleet.quoteOwned ? CM.Fleet.quoteOwned(g, C, c.id, [lid]) : null;
    if (!quote || !(quote.cost > 0) || !quote.trains.length) return null;
    return { draft, lid, ids, ev, C, quote, cost: ev.total + quote.cost, kind, target: target || null, points };
  }
  O.plan = function (g, id, kind) {
    const c = O.company(g, id), d = defOf(id); if (!c || !d) return null;
    const view = O.cityView(g, id), used = Object.values(g.net.stations), home = used.filter(s => O.owner(s) === id);
    if (kind === 'cross') {
      if (g.clock.y < 2018 || !home.length) return null;
      const targets = used.filter(s => O.owner(s) !== id && (c.request ? s.id === c.request : O.owner(s) !== 'player') && O.canBuildCell(g, g.city.cellAt(s.x, s.y), id));
      let pair = null;
      for (const a of home) for (const b of targets) { const dist = U.dist(a.x, a.y, b.x, b.y); if (dist > 12 && dist < 240 && (!pair || dist < pair.dist)) pair = { a, b, dist }; }
      if (!pair) return null;
      // Shared end stations are immutable assets of their original owner. The
      // player's end is used only following an explicit connection request.
      const points = [{ x: pair.a.x, y: pair.a.y, stationId: pair.a.id }];
      for (let i = 1; i < 3; i++) {
        const t = i / 3, x = pair.a.x * (1 - t) + pair.b.x * t, y = pair.a.y * (1 - t) + pair.b.y * t;
        const p = candidateSite(g, view, x, y, id, used.concat(points), false); if (!p) return null; points.push(p);
      }
      points.push({ x: pair.b.x, y: pair.b.y, stationId: pair.b.id });
      return evaluatePoints(g, c, points, kind, pair.b.id);
    }
    const a = anchor(g, d), candidates = [];
    for (const ang of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
      const points = []; let score = 0;
      for (const q of [-12, -4, 4, 12]) {
        const p = candidateSite(g, view, a[0] + Math.cos(ang) * q, a[1] + Math.sin(ang) * q, id, used.concat(points), true); if (!p) break;
        const k = g.city.cellAt(p.x, p.y), nearest = used.reduce((v, st) => Math.min(v, U.dist(st.x, st.y, p.x, p.y) * CFG.CELL_M), Infinity);
        score += (g.city.pop[k] + g.city.jobs[k]) * (.15 + .85 * Math.min(1, nearest / CFG.walk.maxAccessM)); points.push(p);
      }
      if (points.length !== 4) continue;
      candidates.push({ points, score });
    }
    // Site scores do not depend on the construction evaluation. Validate in score
    // order and stop at the first legal corridor instead of cloning, costing and
    // compiling the whole network for every lower-ranked alternative. Stable sort
    // keeps the original angle preference on ties, including invalid top choices.
    candidates.sort((a, b) => b.score - a.score);
    for (const candidate of candidates) {
      const result = evaluatePoints(g, c, candidate.points, 'local');
      if (result) return Object.assign(result, { score: candidate.score });
    }
    return null;
  };
  function startProject(g, c, plan) {
    const p = { id: c.id + ':' + (c.projects.length + 1), kind: plan.kind, phase: 'funding', points: plan.points, target: plan.target,
      proposed: g.ym(), start: -1, due: -1, opened: -1, estimate: plan.cost, construction: 0, fleet: 0, line: null };
    c.projects.push(p); c.note = '筹资中';
    log(g, c.id, defOf(c.id).city + (p.kind === 'cross' ? '联络线' : '城区线') + '开始筹资', '概算 ' + U.fmtMoney(p.estimate) + '，独立公司资金；时间与走廊为模拟规划。'); return p;
  }
  // Informational city score only: never books money, alters project gates,
  // valuation, grants or company survival. NPC home permissions ignore player locks.
  O.updateSatisfaction = function (g) {
    const P = CM.PlayerMetrics, E = CM.Economy, state = g.operators;
    if (!state || !P || !P.company || !E || !E.cityTarget) return;
    const ym = g.ym();
    for (const c of Object.values(state.companies)) {
      if (c.satYM === ym) continue;
      const daily = P.company(g, c.id), score = E.cityTarget(daily, g.clock.y, g.clock.m);
      if (!score) continue;
      c.sat = U.clamp((Number.isFinite(c.sat) ? c.sat : CFG.economy.startSat) * .75 + score.target * .25, 0, 100);
      c.satYM = ym;
    }
  };
  // Engineering advances share one monthly slot; overdue completions precede
  // new proposals. Live retries never rotate ledgers or issue another grant.
  function advance(g, onlyOverdue) {
    const s = g.operators, ym = g.ym(), ci = g.econ.costIndex(g.clock.y);
    if (g.draft || s.lastBuild === ym || !CM.Fleet || !CM.Fleet.quoteOwned) return;
    const count = Object.values(g.net.stations).filter(st => !O.isPlayer(st)).length;
    const entries = DEFINITIONS.map((d, index) => ({ d, index, c: s.companies[d.id] })).filter(x => x.c);
    entries.forEach(x => { x.p = x.c.projects.find(p => p.phase !== 'open'); });
    entries.sort((a, b) => { const ad = a.p && a.p.phase === 'building' && a.p.due <= ym, bd = b.p && b.p.phase === 'building' && b.p.due <= ym; return Number(bd) - Number(ad) || (ad && bd ? a.p.due - b.p.due : 0) || a.index - b.index; });
    for (const entry of entries) {
      const d = entry.d, c = entry.c; let p = entry.p;
      if (onlyOverdue && (!p || p.phase !== 'building' || p.due > ym)) continue;
      if (!p) {
        if (c.projects.length >= MAX_PROJECTS || count + 4 > MAX_STATIONS) continue;
        const kind = c.projects.length ? 'cross' : 'local';
        if (kind === 'cross' && (g.clock.y < 2018 || ym < c.projects[0].opened + 36)) continue;
        const plan = O.plan(g, c.id, kind); if (!plan) { c.note = '等待合适走廊与可建设场地'; continue; }
        p = startProject(g, c, plan); s.lastBuild = ym; return true;
      }
      if (p.phase === 'building' && ym < p.due) continue;
      const plan = evaluatePoints(g, c, p.points, p.kind, p.target);
      if (!plan) { c.note = '走廊需重新评估，暂缓施工';
        if (!onlyOverdue && ym % 6 === 0 || onlyOverdue && p.phase === 'building' && p.due < ym) {
          const alternative = O.plan(g, c.id, p.kind);
          if (alternative && c.funds >= alternative.cost) {
            p.points = alternative.points; p.target = alternative.target; p.estimate = alternative.cost;
            if (p.phase === 'building') {
              p.due = ym + 3; c.note = '调整走廊，延长三个月完成复核'; s.lastBuild = ym;
              log(g, c.id, '工程走廊调整', '保留已完成施工进度，采用重新验证的合法走廊，追加三个月完成开通复核；建设和购车款仍在实际开通时结算。');
              return true;
            }
            c.note = '调整走廊后重新筹资';
          }
        }
        continue; }
      p.estimate = plan.cost;
      if (p.phase === 'funding') {
        if (c.funds < plan.cost + 20000 * ci) { c.note = '筹资中，尚缺 ' + U.fmtMoney(Math.max(0, plan.cost + 20000 * ci - c.funds)); continue; }
        // Construction capital is reserved and paid at opening against the latest
        // validated bill, so a stale plan never charges for assets that did not open.
        p.phase = 'building'; p.start = ym; p.due = ym + (p.kind === 'cross' ? 30 : 24); c.note = '施工中';
        log(g, c.id, defOf(c.id).city + (p.kind === 'cross' ? '联络线' : '城区线') + '开工', '预计 ' + Math.floor(p.due / 12) + ' 年 ' + (p.due % 12 + 1) + ' 月开通；建设款预留在公司账内。'); s.lastBuild = ym; return true;
      }
      if (c.funds + 1e-7 < plan.cost) { c.note = '等待追加资金'; continue; }
      if (count + plan.ids.length > MAX_STATIONS) { c.note = '区域公司站点数量已达上限'; continue; }
      book(g, c, 'construction', plan.ev.total, false); book(g, c, 'fleet', plan.quote.cost, false);
      for (const dm of plan.ev.demolitions) g.city.demolish(dm.c, dm.frac);
      for (const id of plan.ids) { plan.draft.stations[id].built = [g.clock.y, g.clock.m]; plan.draft.stations[id].site = [plan.draft.stations[id].x, plan.draft.stations[id].y]; }
      for (const [id, seg] of Object.entries(plan.draft.segments)) if (!g.net.segments[id]) { seg.built = [g.clock.y, g.clock.m]; seg.paidLen = Math.round(plan.ev.paidLen[id] || 0); seg.base = null; }
      g.net = plan.draft; g.netVersion++; g.compiled = plan.C; g._compKey = null;
      CM.Fleet.applyOwned(g, plan.quote);
      g.model.cancelPredict(); if (plan.ev.demolitions.length) { g.model.buildZones(); g.model.buildDemand(); }
      g.model.fleetSource = net => CM.Fleet.plan(g, net);
      g.model.setNetwork(g.compiled);
      p.phase = 'open'; p.opened = ym; p.line = plan.lid; p.construction = plan.ev.total; p.fleet = plan.quote.cost; c.note = '运营中';
      s.lastBuild = ym; log(g, c.id, g.net.lines[plan.lid].name + '开通运营', '建设 ' + U.fmtMoney(p.construction) + '、列车 ' + U.fmtMoney(p.fleet) + '，均由本公司支付；乘客按真实线路与换乘选择出行。');
      g.emit('network'); g.emit('fleet'); g.emit('autosave', 'operators'); return true;
    }
    return false;
  }
  O.projectStatus = function (g, c, p) {
    if (!p) return { phase: null, label: '尚无工程', text: '尚无工程', reason: null, overdue: false, due: -1, monthsLate: 0 };
    const overdue = p.phase === 'building' && p.due < g.ym();
    let reason = null, label = p.phase === 'open' ? '已开通' : p.phase === 'funding' ? '筹资中' : '施工中';
    if (p.phase === 'building' && p.due === g.ym()) { label = '待开通复核'; reason = g.draft ? '等待玩家草案确认后进行开通复核' : c && /走廊|追加资金|站点数量|调整/.test(c.note) ? c.note : '等待完工复核'; }
    if (p.phase === 'building' && c && /调整走廊/.test(c.note)) reason = c.note;
    if (overdue) {
      label = '开通延期';
      if (g.draft) reason = '等待玩家草案确认后进行开通复核';
      else if (c && /走廊|追加资金|站点数量|调整/.test(c.note)) reason = c.note;
      else if (g.operators && g.operators.lastBuild === g.ym()) reason = '等待下一月工程窗口';
      else reason = '等待完工复核';
    }
    return { phase: p.phase, label, text: reason ? label + '：' + reason : label, reason, overdue, due: p.due, monthsLate: overdue ? Math.max(0, g.ym() - p.due) : 0 };
  };
  function retryKey(g) {
    const due = Object.values(g.operators.companies).flatMap(c => c.projects.filter(p => p.phase === 'building' && p.due <= g.ym()).map(p => [c.id, c.funds + 1e-7 >= p.estimate, c.crossPermit, c.request, p.id, p.phase, p.due, p.estimate, p.target, p.points]));
    return due.length ? JSON.stringify([g.ym(), g.netVersion, g.city.geoVer, g.city.terrainVer, g.city.roadVersion, g.property && g.property.rev, g.fleet && g.fleet.ver, due]) : null;
  }
  O.poll = function (g) {
    if (!O.enabled(g) || !g.operators || !g.model) return false;
    let r = runtime.get(g); if (!r) { r = { views: new Map() }; runtime.set(g, r); }
    if (g.draft) { r.poll = null; return false; }
    if (g.pending || g.jumping || !g.model.trafficReady || !g.model.trafficReady()) return false;
    const s = g.operators, ym = g.ym(); if (s.lastBuild === ym) return false;
    const key = retryKey(g); if (!key) return false;
    if (r.poll === key) return false;
    r.poll = key;
    const notes = Object.values(s.companies).map(c => c.note).join('\0');
    const progressed = advance(g, true);
    if (!progressed) r.poll = retryKey(g);
    if (progressed && CM.OperatorControls && CM.OperatorControls.recordMonth) CM.OperatorControls.recordMonth(g);
    if (progressed || notes !== Object.values(s.companies).map(c => c.note).join('\0')) emit(g);
    return !!progressed;
  };
  O.monthly = function (g) {
    const s = O.ensure(g); if (!s || s.lastMonth === g.ym()) return; s.lastMonth = g.ym();
    const ym = g.ym(), ci = g.econ.costIndex(g.clock.y);
    for (let i = 0; i < DEFINITIONS.length; i++) {
      const d = DEFINITIONS[i]; if (d.id === O.playerCity(g) || g.clock.y < d.year || ym < s.since + i * 2) continue;
      let c = s.companies[d.id];
      if (!c) { c = s.companies[d.id] = { id: d.id, founded: ym, funds: 0, total: moneyFields(), cur: monthFields(ym), history: [], projects: [], agreements: [], request: null, crossPermit: false, note: '独立筹资', lastDay: null };
        book(g, c, 'grant', 220000 * d.strength * ci, true); log(g, d.id, d.name + '开始规划', '当地资金独立建账，不受玩家建设解锁影响；初始注资 ' + U.fmtMoney(c.funds) + '。');
      }
      rotate(c, ym); book(g, c, 'grant', 12000 * d.strength * ci, true);
      if (!g.draft && CM.Fleet && CM.Fleet.maintainOwned) CM.Fleet.maintainOwned(g, c.id);
    }
    O.updateSatisfaction(g);
    if (!g.fleet && CM.Fleet) CM.Fleet.ensure(g);
    advance(g, false);
    if (CM.OperatorControls && CM.OperatorControls.recordMonth) CM.OperatorControls.recordMonth(g);
    emit(g);
  };
  O.validate = function (s, dimensions) {
    if (s == null) return;
    const fail = () => { throw new Error('存档中的城市公司、项目或财务记录无效'); };
    if (!s || s.v !== 1 || !s.companies || typeof s.companies !== 'object' || Array.isArray(s.companies) || Object.keys(s.companies).length > 6 || !Array.isArray(s.log) || s.log.length > 30) fail();
    if (s.indexHistory != null) {
      if (!Array.isArray(s.indexHistory) || s.indexHistory.length > 120) fail();
      let previous = -1;
      for (const row of s.indexHistory) {
        if (!row || !integer(row.ym, 0, 120000) || row.ym <= previous || !Array.isArray(row.values) || row.values.length > 7) fail(); previous = row.ym;
        const owners = new Set();
        for (const v of row.values) { if (!v || v.ownerId !== 'player' && !IDS.has(v.ownerId) || owners.has(v.ownerId) || !finite(v.score, 0, 1e12) || !finite(v.annualProfit, -1e15, 1e15) || !finite(v.riders, 0, 1e15) || !finite(v.service, 0, 1e6) || !finite(v.debt, 0, 1e15)) fail(); owners.add(v.ownerId); }
      }
    }
    for (const k of ['since','lastMonth','lastBuild']) if (!integer(s[k], -1, 120000)) fail(); if (!integer(s.lastDay, -1, 4000000)) fail();
    const fields = o => { if (!o || KINDS.some(k => !finite(o[k], 0, 1e15))) fail(); };
    const row = o => { fields(o); if (!integer(o.ym, 0, 120000)) fail(); };
    for (const [id, c] of Object.entries(s.companies)) {
      if (!IDS.has(id) || !c || c.id !== id || !integer(c.founded, 0, 120000) || !finite(c.funds, -1e12, 1e15) || !Array.isArray(c.projects) || c.projects.length > 2 || !Array.isArray(c.history) || c.history.length > 24 || !Array.isArray(c.agreements) || c.agreements.length > 48 || typeof c.note !== 'string' || c.note.length > 180) fail();
      if (c.sat != null && !finite(c.sat, 0, 100) || c.satYM != null && !integer(c.satYM, 0, 120000)) fail();
      fields(c.total); row(c.cur); c.history.forEach(row);
      const balance = c.total.grant + c.total.fare - c.total.ops - c.total.construction - c.total.fleet;
      if (Math.abs(balance - c.funds) > Math.max(.001, Math.abs(balance) * 1e-9)) fail();
      if (typeof c.crossPermit !== 'boolean') fail();
      if (c.request !== null && (typeof c.request !== 'string' || c.request.length > 80)) fail();
      if (c.agreements.some(x => typeof x !== 'string' || x.length > 80)) fail();
      if (c.lastDay && (!finite(c.lastDay.fare, 0, 1e12) || !finite(c.lastDay.ops, 0, 1e12) || !finite(c.lastDay.pkm, 0, 1e15) || !['wd','we'].includes(c.lastDay.dt))) fail();
      const seen = new Set();
      for (const p of c.projects) {
        if (!p || typeof p.id !== 'string' || p.id.length > 80 || seen.has(p.id) || !['local','cross'].includes(p.kind) || !['funding','building','open'].includes(p.phase) || !Array.isArray(p.points) || p.points.length !== 4 || p.points.some(q => !q || !finite(q.x,0,dimensions ? dimensions.W - 1e-8 : 10000) || !finite(q.y,0,dimensions ? dimensions.H - 1e-8 : 10000) || q.stationId != null && (typeof q.stationId !== 'string' || q.stationId.length > 80))) fail(); seen.add(p.id);
        for (const k of ['proposed','start','due','opened']) if (!integer(p[k], -1, 120000)) fail();
        for (const k of ['estimate','construction','fleet']) if (!finite(p[k], 0, 1e12)) fail();
        if (p.phase !== 'funding' && (p.start < p.proposed || p.due < p.start) || p.phase === 'open' && (p.opened < p.due || !p.line)) fail();
        for (const k of ['line','target']) if (p[k] !== null && (typeof p[k] !== 'string' || p[k].length > 80)) fail();
      }
    }
    for (const e of s.log) if (!e || !integer(e.ym,0,120000) || !IDS.has(e.ownerId) || typeof e.title !== 'string' || e.title.length > 120 || typeof e.desc !== 'string' || e.desc.length > 500) fail();
  };
  function clean(s) {
    const out = { v: 1, since: s.since, lastMonth: s.lastMonth, lastDay: s.lastDay, lastBuild: s.lastBuild, companies: {}, indexHistory: (s.indexHistory || []).map(r => ({ ym: r.ym, values: r.values.map(v => ({ownerId:v.ownerId,score:v.score,annualProfit:v.annualProfit,riders:v.riders,service:v.service,debt:v.debt})) })), log: s.log.map(e => ({ ym:e.ym,ownerId:e.ownerId,title:e.title,desc:e.desc })) };
    const fields = x => Object.fromEntries(KINDS.map(k => [k,x[k]])), row = x => Object.assign({ym:x.ym},fields(x));
    for (const [id,c] of Object.entries(s.companies)) out.companies[id] = { id, founded:c.founded, funds:c.funds, total:fields(c.total),cur:row(c.cur),history:c.history.map(row),agreements:c.agreements.slice(),request:c.request,crossPermit:c.crossPermit,note:c.note,...(c.sat == null ? {} : {sat:c.sat,satYM:c.satYM}),lastDay:c.lastDay?{fare:c.lastDay.fare,ops:c.lastDay.ops,pkm:c.lastDay.pkm,dt:c.lastDay.dt}:null,
      projects:c.projects.map(p=>({id:p.id,kind:p.kind,phase:p.phase,points:p.points.map(q=>Object.assign({x:q.x,y:q.y},q.stationId?{stationId:q.stationId}:{})),target:p.target,proposed:p.proposed,start:p.start,due:p.due,opened:p.opened,estimate:p.estimate,construction:p.construction,fleet:p.fleet,line:p.line})) };
    return out;
  }
  O.validateAssets = function (saved, net, fleet, playerCity) {
    const fail = () => { throw new Error('存档中的公司资产归属与财务登记不一致'); };
    const assetOwner = function (x) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) fail();
      const raw = x.ownerId;
      if (raw == null) return 'player';
      if (typeof raw !== 'string' || raw !== 'player' && !IDS.has(raw)) fail();
      return raw;
    };
    let n = 0;
    for (const table of [net && net.lines, net && net.stations]) for (const x of Object.values(table || {})) {
      const id = assetOwner(x); if (id === 'player') continue;
      if (!IDS.has(id) || id === (playerCity || 'sh') || !saved || !saved.companies[id]) fail();
      if (table === net.stations && ++n > MAX_STATIONS) fail();
    }
    for (const seg of Object.values(net && net.segments || {})) {
      const explicit = seg && seg.ownerId != null;
      const id = assetOwner(seg), line = net.lines && net.lines[seg.line];
      if (explicit && (!line || id !== assetOwner(line))) fail();
    }
    for (const t of fleet && fleet.trains || []) {
      const id = assetOwner(t), line = t.line && net.lines && net.lines[t.line];
      if (id !== 'player' && (!saved || !saved.companies[id] || t.line && !line) || line && assetOwner(line) !== id) fail();
    }
    for (const c of Object.values(saved && saved.companies || {})) { if (c.id === (playerCity || 'sh')) fail(); }
    for (const c of Object.values(saved && saved.companies || {})) for (const p of c.projects) if (p.phase === 'open' && (!net.lines[p.line] || O.owner(net.lines[p.line]) !== c.id)) fail();
  };
  O.serialize = function (g) { if (!g.operators) return undefined; O.validate(g.operators, g.city); return clean(g.operators); };
  O.restore = function (g, saved) { O.validate(saved, g.city); if (g.net) O.validateAssets(saved, g.net, null, g.playerCity); O.attach(g); if (saved) g.operators = clean(saved); else O.ensure(g); };
})(window.CM = window.CM || {});
