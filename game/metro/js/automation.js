'use strict';
// Optional network management. Only published demand can trigger a monthly decision;
// the ordinary fleet, construction evaluation and accounting remain authoritative.
(function (CM) {
  const A = CM.Automation = {}, M = CM.Metro, U = CM.U, CFG = CM.CFG, h = U.h;
  const DEFAULTS = A.DEFAULTS = Object.freeze({ enabled: false, alerts: false, buy: false, stations: false, hubs: false, tod: false, land: false, reserve: 100000, monthlyLimit: 50000, buyLimit: 4, sparePct: 10, todLimit: 2, landLimit: 2 });
  const runtime = new WeakMap(), MAX_LOG = 24, CROWD = 1.1;
  A.MAX_TRANSFERS = 64;
  const rt = function (g) { let r = runtime.get(g); if (!r) { r = { due: -1, notices: new Set(), status: '托管已关闭' }; runtime.set(g, r); } return r; };
  const freshState = function () { return { v: 1, policy: Object.assign({}, DEFAULTS), alertWait: false, lastRun: -1, lastStation: -1, budgetYM: -1, spent: 0, bought: 0, todCount: 0, landCount: 0, todStations: [], sample: '', fleetSample: '', crowd: {}, log: [] }; };
  const state = function (g) { return g.automation || (g.automation = freshState()); };
  A.enabled = function (g) { return !!(g.automation && g.automation.policy.enabled); };
  A.policy = function (g) { return g.automation ? g.automation.policy : DEFAULTS; };
  const integer = function (v, lo, hi) { return Number.isSafeInteger(v) && v >= lo && v <= hi; };
  const text = function (v, n) { return typeof v === 'string' && v.length <= n; };
  A.validate = function (s) {
    if (s == null) return;
    const fail = function () { throw new Error('存档中的运营托管设置或记录无效'); };
    if (!s || typeof s !== 'object' || s.v !== 1 || !s.policy || !s.crowd || Array.isArray(s.crowd) || !Array.isArray(s.log) || s.log.length > MAX_LOG) fail();
    const p = s.policy;
    for (const k of ['enabled', 'buy', 'stations', 'hubs']) if (typeof p[k] !== 'boolean') fail();
    for (const k of ['tod', 'land', 'alerts']) if (Object.prototype.hasOwnProperty.call(p, k) && typeof p[k] !== 'boolean') fail();
    if (s.alertWait !== undefined && typeof s.alertWait !== 'boolean') fail();
    for (const k of ['todLimit', 'landLimit']) if (Object.prototype.hasOwnProperty.call(p, k) && !integer(p[k], 0, 8)) fail();
    if (!integer(p.reserve, 0, 100000000) || !integer(p.monthlyLimit, 0, 100000000) || !integer(p.buyLimit, 0, 24) || !integer(p.sparePct, 0, 50)) fail();
    for (const k of ['lastRun', 'lastStation', 'budgetYM']) if (!integer(s[k], -1, 120000)) fail();
    if (!Number.isFinite(s.spent) || s.spent < 0 || s.spent > 100000000 || !integer(s.bought, 0, 24) || !text(s.sample, 80) || !text(s.fleetSample, 80)) fail();
    for (const k of ['todCount', 'landCount']) if (s[k] !== undefined && !integer(s[k], 0, 8)) fail();
    if (s.todStations !== undefined && (!Array.isArray(s.todStations) || s.todStations.length > 8 || s.todStations.some(function (id) { return !text(id, 80) || !id; }) || new Set(s.todStations).size !== s.todStations.length)) fail();
    if ((s.todCount || 0) !== (s.todStations || []).length) fail();
    if (Object.keys(s.crowd).length > 10000) fail();
    for (const id of Object.keys(s.crowd)) {
      const c = s.crowd[id];
      if (!text(id, 80) || !c || !integer(c.ym, 0, 120000) || !integer(c.n, 1, 2) || !['S', 'M', 'L'].includes(c.size) || !integer(c.hub, 0, 2)) fail();
    }
    for (const e of s.log) if (!e || !integer(e.ym, 0, 120000) || !text(e.kind, 20) || !text(e.title, 160) || !text(e.desc, 1600) || !Number.isFinite(e.cost) || e.cost < 0 || e.cost > 100000000) fail();
  };
  const clean = function (s) {
    const out = freshState();
    for (const k of Object.keys(DEFAULTS)) if (Object.prototype.hasOwnProperty.call(s.policy, k)) out.policy[k] = s.policy[k];
    for (const k of ['lastRun', 'lastStation', 'budgetYM', 'spent', 'bought', 'sample', 'fleetSample']) out[k] = s[k];
    out.todCount = s.todCount || 0; out.landCount = s.landCount || 0; out.todStations = (s.todStations || []).slice();
    out.alertWait = s.alertWait || false;
    // Explicit fields keep imported extensions small and discard unknown data.
    for (const id of Object.keys(s.crowd)) { const c = s.crowd[id]; Object.defineProperty(out.crowd, id, { value: { ym: c.ym, n: c.n, size: c.size, hub: c.hub }, enumerable: true, writable: true, configurable: true }); }
    out.log = s.log.map(function (e) { return { ym: e.ym, kind: e.kind, title: e.title, desc: e.desc, cost: e.cost }; });
    return out;
  };
  A.serialize = function (g) { if (!g.automation) return undefined; A.validate(g.automation); return clean(g.automation); };
  A.restore = function (g, saved) { A.validate(saved); if (saved) { g.automation = clean(saved); if (A.enabled(g)) rt(g).due = g.ym(); } };
  const log = function (g, kind, title, desc, cost) {
    const s = state(g), e = { ym: g.ym(), kind: kind, title: title.slice(0, 160), desc: (desc || '').slice(0, 1600), cost: cost || 0 };
    s.log.push(e); if (s.log.length > MAX_LOG) s.log.shift();
    g.logEvent({ tag: '托管', title: e.title, desc: e.desc }); g.touch();
  };
  const status = function (g, message, record) {
    const r = rt(g); r.status = message;
    if (record) {
      const key = g.ym() + ':' + message;
      if (!r.notices.has(key)) { r.notices.add(key); log(g, 'wait', '运营托管等待', message); }
    }
  };
  A.setPolicy = function (g, patch) {
    const s = state(g), next = clean(s);
    for (const k of Object.keys(DEFAULTS)) if (Object.prototype.hasOwnProperty.call(patch, k)) next.policy[k] = patch[k];
    A.validate(next);
    if (Object.keys(DEFAULTS).every(function (k) { return s.policy[k] === next.policy[k]; })) return;
    s.policy = next.policy;
    const r = rt(g); r.due = s.policy.enabled ? g.ym() : -1; r.stationCandidates = null;
    status(g, s.policy.enabled ? '交通结果完整且无玩家草稿时检查调度和商业；提前购地单独按有效草案检查' : '托管已关闭');
    log(g, 'policy', s.policy.enabled ? '已更新运营托管规则' : '已关闭运营托管', '自动调车' + (s.policy.enabled ? '已开启' : '已关闭') + '；自动购车' + (s.policy.buy ? '允许' : '关闭') + '；自动扩站' + (s.policy.stations ? '允许' : '关闭') + '；自动车站商业' + (s.policy.tod ? '允许' : '关闭') + '；规划地块预购' + (s.policy.land ? '允许' : '关闭') + '。月支出上限 ' + U.fmtMoney(s.policy.monthlyLimit) + '，一般资金保留 ' + U.fmtMoney(s.policy.reserve) + '。');
    // Policy controls refresh their own page once. A fleet event would make the
    // UI redraw the same page a second time despite no train being changed.
    g.emit('autosave', 'automation');
  };
  const resetBudget = function (g) { const s = state(g); if (s.budgetYM !== g.ym()) { s.budgetYM = g.ym(); s.spent = 0; s.bought = 0; s.todCount = 0; s.landCount = 0; s.todStations = []; } };
  A.prepareBudget = resetBudget;
  A.count = function (g, kind) { const s = g.automation; return s && s.budgetYM === g.ym() ? s[kind === 'tod' ? 'todCount' : 'landCount'] || 0 : 0; };
  A.allowance = function (g, kind) {
    const s = state(g), p = s.policy, used = s.budgetYM === g.ym() ? s.spent : 0;
    const available = g.econ.isFree() ? Infinity : (g.econ.funds >= p.reserve ? Math.max(0, g.econ.funds - p.reserve) + (kind === 'general' ? 0 : Math.max(0, g.econ.capex || 0)) : 0);
    return Math.max(0, Math.min(p.monthlyLimit - used, available));
  };
  A.noteInvestment = function (g, kind, message) { rt(g)[kind + 'Status'] = String(message || '').slice(0, 400); };
  A.recordInvestment = function (g, kind, cost, title, desc, sid) {
    resetBudget(g); const s = state(g);
    if (!['tod', 'land'].includes(kind) || !Number.isFinite(cost) || cost < 0 || cost > 100000000) throw Error('无效的托管投资记录');
    if (kind === 'tod' && (!text(sid, 80) || !sid || s.todStations.includes(sid) || s.todCount >= s.policy.todLimit) || kind === 'land' && s.landCount >= s.policy.landLimit) throw Error('已达到本月托管投资数量上限');
    s.spent += cost;
    if (kind === 'tod') { s.todCount++; s.todStations.push(sid); } else s.landCount++;
    A.noteInvestment(g, kind, title); log(g, kind, title, desc, cost); g.emit('finance'); g.emit('autosave', 'automation');
  };
  // Alert handling shares the same ledger as ordinary monthly management. The
  // saved wait bit prevents a reload from treating pre-action demand as fresh.
  A.recordAlert = function (g, detail) {
    resetBudget(g); const s = state(g), d = detail || {}, cost = d.cost || 0, bought = d.bought || 0;
    if (!Number.isFinite(cost) || cost < 0 || cost > 100000000 || !integer(bought, 0, 24) || !text(d.title, 160) || !text(d.desc || '', 1600)) throw Error('无效的待办托管记录');
    s.spent += cost; s.bought += bought; s.alertWait = true;
    if (d.stationIds && d.stationIds.length) { s.lastStation = g.ym(); for (const sid of d.stationIds) delete s.crowd[sid]; }
    A.noteInvestment(g, 'alerts', d.title); log(g, 'alerts', d.title, d.desc, cost); g.emit('finance'); g.emit('autosave', 'automation');
  };
  const manual = function (g, lid) { return !!(g.fleet.ops[lid] && g.fleet.ops[lid].mode === 'manual'); };
  const ready = function (g) { const m = g.model; return !!(g.fleet && m && m.net && m.net.C === g.compiled && m.trafficReady() && !m.dailyStale && !m.predJob && !m.hasReviewWork()); };
  // Frequencies change immediately after a fleet edit; demand does not. Hash only
  // published demand and the model year so that such an edit cannot masquerade as
  // another observation, including after a save/reload. Work is cached per publication.
  const sample = function (g) {
    const r = rt(g), m = g.model;
    if (r.result === m.results && r.year === m.year && r.station === m.stDailyWk) return r.hash;
    let hash = 2166136261;
    const add = function (v) { const str = String(v); for (let j = 0; j < str.length; j++) hash = Math.imul(hash ^ str.charCodeAt(j), 16777619); };
    add(m.year);
    for (const dt of ['wd', 'we']) for (const P of m.resultsFor(dt).per) for (const key of ['needDir', 'load']) if (P[key]) for (const x of P[key]) add(Math.round(x * 100));
    for (const sd of [m.stDailyWk, m.stDailyWe]) if (sd) for (const x of sd.peak) add(Math.round(x * 100));
    r.result = m.results; r.year = m.year; r.station = m.stDailyWk; r.hash = (hash >>> 0).toString(36);
    return r.hash;
  };
  const fit = function (t, x) { return CM.Fleet.compatible ? CM.Fleet.compatible(t, x.rt) : t.cars <= x.rt.cars && (x.rt.kmh <= 80 || CM.Fleet.model(t.model).kmh >= x.rt.kmh); };
  // A route's average carriage capacity is shared by its loop directions. These
  // groups live only for one plan: stock changes by array replacement or append,
  // while the capacities of existing trains do not change during allocation.
  const routeCapacity = new WeakMap();
  const need = function (x, units) {
    const group = x.group;
    let cap;
    if (group) {
      let cached = routeCapacity.get(group);
      if (!cached || group.some(function (v, i) { const list = v === x ? units : v.units; return cached.lists[i] !== list || cached.lengths[i] !== list.length; })) {
        const lists = group.map(function (v) { return v === x ? units : v.units; });
        let total = 0, count = 0;
        // Preserve the previous flattened traversal order and floating arithmetic.
        for (const list of lists) for (const t of list) { total += CM.Fleet.capOf(t); count++; }
        cached = { lists: lists, lengths: lists.map(function (list) { return list.length; }), count: count, total: total };
        routeCapacity.set(group, cached);
      }
      cap = cached.count ? cached.total / cached.count : x.rt.cap;
    } else cap = units.length ? units.reduce(function (a, t) { return a + CM.Fleet.capOf(t); }, 0) / units.length : x.rt.cap;
    const freq = Math.min(CFG.metro.fMax, Math.max(x.floorFreq, x.load / Math.max(1, cap * CFG.metro.targetLF)));
    return Math.max(1, Math.ceil(freq * x.rt.cycleSec / 3600 - 1e-6));
  };
  // Pure plan: depot stock is used first, then surplus from managed services. A donor
  // keeps its own peak requirement plus the chosen reserve, recalculated after removal.
  A.fleetPlan = function (g) {
    const F = CM.Fleet, services = [], byId = new Map(g.fleet.trains.map(function (t) { return [t.id, t]; }));
    for (const lid of M.sortIds(Object.keys(g.net.lines))) {
      if (F.isPlayer && !F.isPlayer(g.net.lines[lid])) continue;
      if (manual(g, lid)) continue;
      for (const s of F.lineInfo(g, lid) || []) {
        if (!s.avail && (s.svc || !s.peakNeed)) continue; // Do not activate deliberately unused stop patterns.
        const x = { lid: lid, svc: s.id, name: s.name, r: s.r, rt: s.rt, units: s.units.map(function (t) { return byId.get(t.id); }).filter(Boolean), load: 0, floorFreq: 0 };
        const edges = g.model.net.rideEdge[s.r];
        for (const dt of ['wd', 'we']) g.model.resultsFor(dt).per.forEach(function (P, p) {
          x.floorFreq = Math.max(x.floorFreq, CM.Model.serviceFloor(s.rt, p));
          for (let q = 0; q < edges.length; q++) if (!s.rt.loop || (q & 1) === s.d) x.load = Math.max(x.load, P.load[edges[q]] || 0);
        });
        x.initial = x.units.length; services.push(x);
      }
    }
    const groups = new Map();
    for (const x of services) { if (!groups.has(x.r)) groups.set(x.r, []); groups.get(x.r).push(x); }
    for (const x of services) x.group = groups.get(x.r);
    const reserve = A.policy(g).sparePct / 100, spare = [];
    for (const x of services) for (const t of x.units) spare.push({ t: t, from: x });
    const canDonate = function (p, target) {
      if (p.from === target) return false;
      const donor = p.from, old = donor.units, targetOld = target.units, sameRoute = donor.group === target.group;
      donor.units = old.filter(function (t) { return t !== p.t; });
      if (sameRoute) target.units = targetOld.concat([p.t]);
      const safe = donor.group.every(function (x) { if (x === target) return true; const n = need(x, x.units); return x.units.length >= n + Math.ceil(n * reserve); });
      donor.units = old; target.units = targetOld; return safe;
    };
    const idle = g.fleet.trains.filter(function (t) { return !t.line && (!F.isPlayer || F.isPlayer(t)); }).map(function (t) { return { t: t, from: null }; });
    const sort = function (a, b) { return F.capOf(b.t) - F.capOf(a.t) || a.t.id.localeCompare(b.t.id); };
    idle.sort(sort); spare.sort(sort);
    const moves = [], blocked = new Set();
    const next = function () {
      let best = null, ratio = 0;
      for (const x of services) {
        if (blocked.has(x)) continue;
        const n = need(x, x.units);
        if (!(x.units.length < n)) continue;
        const missing = (n - x.units.length) / n;
        if (!best || missing > ratio || missing === ratio && x.lid.localeCompare(best.lid) < 0) { best = x; ratio = missing; }
      }
      return best;
    };
    for (let x = next(); x && moves.length < A.MAX_TRANSFERS; x = next()) {
      let pool = idle, at = pool.findIndex(function (p) { return fit(p.t, x); });
      if (at < 0) { pool = spare; at = pool.findIndex(function (p) { return fit(p.t, x) && canDonate(p, x); }); }
      if (at < 0) { blocked.add(x); continue; }
      const p = pool.splice(at, 1)[0]; if (p.from) p.from.units = p.from.units.filter(function (t) { return t !== p.t; });
      x.units.push(p.t); moves.push({ id: p.t.id, lid: x.lid, svc: x.svc, name: x.name, from: p.from ? p.from.name : '车辆段' });
    }
    return { services: services, moves: moves, unmet: services.reduce(function (n, x) { return n + Math.max(0, need(x, x.units) - x.units.length); }, 0) };
  };
  const dispatch = function (g) {
    const s = state(g), p = s.policy, F = CM.Fleet, plan = A.fleetPlan(g);
    let bought = 0, cost = 0;
    if (plan.moves.length) {
      const rows = new Map();
      for (const m of plan.moves) { const key = m.lid + ':' + m.svc; if (!rows.has(key)) rows.set(key, { lid: m.lid, svc: m.svc, name: m.name, ids: [] }); rows.get(key).ids.push(m.id); }
      F.applyAlloc(g, { needs: Array.from(rows.values()) });
    }
    if (p.buy && plan.moves.length < A.MAX_TRANSFERS) {
      // Purchase at most the configured number of real, available trains. Sorting by
      // capital cost per seat avoids buying an expensive brand merely because it is new.
      const ordered = plan.services.slice().sort(function (a, b) { return (need(b, b.units) - b.units.length) - (need(a, a.units) - a.units.length); });
      for (const x of ordered) {
        const models = F.available(F.cityId ? F.cityId(g) : g.mapId, g.clock.y, x.rt.railSystem).filter(function (m) { const t = { model: m.id, cars: Math.min(m.max, x.rt.cars) }; return F.compatible ? F.compatible(t, x.rt) : x.rt.kmh <= 80 || m.kmh >= x.rt.kmh; }).map(function (m) { const cars = Math.min(m.max, x.rt.cars); return { m: m, cars: cars, price: F.price(g, m, cars) }; }).sort(function (a, b) { return a.price / (a.m.cap * a.cars) - b.price / (b.m.cap * b.cars) || a.price - b.price; });
        const choice = models[0]; if (!choice) continue;
        while (x.units.length < need(x, x.units) && s.bought < p.buyLimit && choice.price <= A.allowance(g) + 1e-7) {
          const result = F.buy(g, x.lid, x.svc, choice.m.id, choice.cars, 1); if (!result.ok) break;
          s.spent += result.cost; s.bought++; bought++; cost += result.cost;
          x.units.push(g.fleet.trains[g.fleet.trains.length - 1]);
        }
      }
    }
    const missing = plan.services.reduce(function (n, x) { return n + Math.max(0, need(x, x.units) - x.units.length); }, 0);
    const moves = plan.moves.map(function (m) { return m.from + ' → ' + m.name + '（' + m.id + '）'; });
    let desc = moves.slice(0, 10).join('；') + (moves.length > 10 ? '；另 ' + (moves.length - 10) + ' 次调拨' : '');
    if (bought) desc += (desc ? '。' : '') + '购置 ' + bought + ' 列，实际支出 ' + U.fmtMoney(cost);
    desc += (desc ? '。' : '') + (missing ? '仍有约 ' + missing + ' 列高峰缺口；' + (plan.moves.length >= A.MAX_TRANSFERS ? '已达本月调拨数量上限' : !p.buy ? '自动购车未开启' : s.bought >= p.buyLimit ? '已达本月购车数量上限' : '当前预算、资金底线或车型条件限制') + '。' : '现有车型的高峰车数需求已满足；达到线路最高发车频率后仍拥挤的线路需另行增容。');
    log(g, 'fleet', '托管调车 ' + plan.moves.length + ' 列 · 购车 ' + bought + ' 列', desc, cost);
    if (plan.moves.length || bought) s.fleetSample = sample(g);
    return plan.moves.length + bought;
  };
  const stationLoad = function (g, sid) {
    const C = g.compiled, k = C.sIndex.get(sid), s = g.net.stations[sid], sd = g.model.stDailyWk, we = g.model.stDailyWe;
    if (k == null || !C.serviced[k] || !sd || !s) return 0;
    return Math.max(sd.peak[k] || 0, we && we.peak[k] || 0) / M.stationCapacity(s);
  };
  const sampleStations = function (g) {
    const s = state(g), next = {};
    if (s.policy.stations) M.withSegIndex([g.net], function () { for (const sid of Object.keys(g.net.stations)) {
      const st = g.net.stations[sid], lines = M.stationLines(g.net, sid);
      if (CM.Fleet.isPlayer && !CM.Fleet.isPlayer(st)) continue;
      if (lines.some(function (lid) { return manual(g, lid); }) || stationLoad(g, sid) < CROWD) continue;
      const old = s.crowd[sid], same = old && old.size === st.size && old.hub === M.hubLevel(st);
      next[sid] = { ym: g.ym(), n: same && old.ym < g.ym() ? Math.min(2, old.n + 1) : same ? old.n : 1, size: st.size, hub: M.hubLevel(st) };
    } });
    s.crowd = next;
  };
  const idleForBuild = function (g) {
    if (g.draft) return '等待玩家完成或取消当前草稿';
    if (g.pending || g.jumping) return '等待本次时间推进完成后扩站';
    if (g._impactPlan || g.model.predJob) return '等待当前建设效果评估完成后扩站';
    if (CM.R && CM.R.interacting) return '等待地图操作结束后扩站';
    const ui = CM.ui;
    if (ui && ui.g && ui.g() === g && ((ui.blocking && ui.blocking()) || (ui.tools && (ui.tools.drag || (ui.tools.tool && ui.tools.tool !== 'select'))))) return '等待当前编辑或对话框结束后扩站';
    return null;
  };
  const station = function (g, fingerprint) {
    const s = state(g); if (!s.policy.stations || s.lastStation === g.ym()) return true;
    if (s.fleetSample && s.fleetSample === fingerprint) { status(g, '调车已完成，等待新客流结果再评估车站'); return false; }
    const r = rt(g), m = g.model, fleet = g.fleet;
    let cached = r.stationCandidates;
    if (!cached || cached.net !== g.net || cached.compiled !== g.compiled || cached.netVersion !== g.netVersion || cached.fleet !== fleet || cached.fleetVer !== (fleet && fleet.ver) || cached.crowd !== s.crowd || cached.fingerprint !== fingerprint || cached.modelVersion !== m.version || cached.weekday !== m.stDailyWk || cached.weekend !== m.stDailyWe) {
      const rows = M.withSegIndex([g.net], function () {
        const out = [];
        for (const sid of Object.keys(s.crowd)) {
          const c = s.crowd[sid], st = g.net.stations[sid];
          if (!st || CM.Fleet.isPlayer && !CM.Fleet.isPlayer(st) || c.n < 2 || c.size !== st.size || c.hub !== M.hubLevel(st)) continue;
          const load = stationLoad(g, sid);
          if (load >= CROWD && !M.stationLines(g.net, sid).some(function (lid) { return manual(g, lid); })) out.push({ sid: sid, load: load });
        }
        return out;
      });
      rows.sort(function (a, b) { return b.load - a.load; });
      cached = { net: g.net, compiled: g.compiled, netVersion: g.netVersion, fleet: fleet, fleetVer: fleet && fleet.ver,
        crowd: s.crowd, fingerprint: fingerprint, modelVersion: m.version, weekday: m.stDailyWk, weekend: m.stDailyWe, rows: rows };
      r.stationCandidates = cached;
    }
    const candidates = cached.rows;
    if (!candidates.length) { status(g, '本月检查完成；车站需两次不同月份的新客流观测持续超 110% 才扩容'); return true; }
    const wait = idleForBuild(g); if (wait) { status(g, wait, true); return false; }
    let reason = '拥挤车站已达大站规模；可手动调整路网或另行允许枢纽扩建';
    for (const candidate of candidates) {
      const sid = candidate.sid;
      const original = g.net.stations[sid], next = M.clone(g.net), st = next.stations[sid], sizes = ['S', 'M', 'L'];
      let label;
      if (st.size !== 'L') { st.size = sizes[sizes.indexOf(st.size) + 1]; label = original.size + ' → ' + st.size; }
      else if (s.policy.hubs && M.hubLevel(st) < M.HUBS.length - 1 && !M.hubEligibility(next, sid, M.hubLevel(st) + 1)) { M.setHub(next, sid, M.hubLevel(st) + 1); label = M.hubSpec(st).name; }
      else continue;
      const beforeLoad = candidate.load;
      // A private, one-change draft, with an ordinary undo point. It is never merged
      // into a player's draft. No draft notification is sent until the build commits.
      const draft = { net: next, automation: 'station', undo: [JSON.stringify(g.net)], redo: [], ver: 1, evalVer: -1, eval: null, compiled: null, compVer: -1, pred: { state: 'idle' } };
      g.draft = draft;
      let result, cost;
      try {
        const ev = g.draftEval(); cost = ev.total;
        if (ev.demolitions.length || ev.changes.del.length || ev.conflicts.length) { reason = '车站改建校验未通过，已保留原站：' + original.name; continue; }
        if (!Number.isFinite(cost) || cost < 0 || cost > A.allowance(g) + 1e-7) { reason = '车站 ' + original.name + ' 扩容需要 ' + U.fmtMoney(cost) + '，超出本月余款或一般资金底线'; continue; }
        result = g.confirmDraft();
      } finally { if (g.draft === draft) g.draft = null; }
      if (!result || !result.ok) { reason = result && result.reason || '车站改建暂不可执行'; continue; }
      s.spent += cost; s.lastStation = g.ym(); delete s.crowd[sid];
      log(g, 'station', '托管扩容：' + original.name + ' · ' + label, '两次月度新观测持续拥挤，改建前高峰负荷 ' + U.fmtPct(beforeLoad, 0) + '；通过建设校验并支付 ' + U.fmtMoney(cost) + '。保留原有站位、线路、站台层位与已建设施。', cost);
      status(g, '已完成本月 1 座车站扩容，等待新客流'); g.emit('autosave', 'automation');
      return true;
    }
    status(g, reason, true); return true;
  };
  const run = function (g, settlement) {
    if (!A.enabled(g) || rt(g).due !== g.ym() || g.econ.failed) return;
    const s = state(g);
    if (g.draft) { status(g, '等待玩家完成或取消当前草稿', true); return; }
    if (!settlement && (g.pending || g.jumping)) return;
    if (!ready(g)) { status(g, '等待完整的新交通结果'); return; }
    const fingerprint = sample(g); resetBudget(g);
    if (s.lastRun !== g.ym()) {
      if (s.sample === fingerprint || s.fleetSample === fingerprint) { status(g, '沿用的旧客流不触发新调车或消费，等待下一次交通刷新'); return; }
      s.lastRun = g.ym(); s.sample = fingerprint;
      sampleStations(g); dispatch(g); g.touch(); g.emit('autosave', 'automation');
      status(g, '本月调度检查完成；实际调拨、购车与剩余缺口见托管记录');
    }
    // Monthly settlement may dispatch trains, but construction waits until the
    // settlement generator and the player's editing operation have both finished.
    if (!station(g, sample(g))) return;
    if (s.policy.tod && CM.AutoTOD) {
      const wait = idleForBuild(g);
      if (wait || !ready(g) || CM.AutoTOD.ready && !CM.AutoTOD.ready(g)) {
        A.noteInvestment(g, 'tod', wait || '等待当前编辑结束或完整运营结果后检查商业');
        return;
      }
      CM.AutoTOD.run(g);
    }
    rt(g).due = -1; rt(g).stationCandidates = null;
  };
  A.monthly = function (g) { if (!A.enabled(g)) return; const r = rt(g); r.due = g.ym(); r.notices.clear(); if (!A.policy(g).alerts) run(g, true); };
  A.poll = function (g) {
    if (!A.enabled(g)) return;
    resetBudget(g);
    if (A.policy(g).alerts && CM.AutoAlerts) {
      if (CM.AutoAlerts.poll(g)) return;
      if (!CM.AutoAlerts.ready(g)) {
        if (CM.AutoLand && A.policy(g).land) CM.AutoLand.poll(g);
        return;
      }
    }
    // Land acquisition uses the player's stable quote without altering their
    // draft. Other managed work keeps waiting until the draft is finished.
    if (CM.AutoLand && A.policy(g).land) CM.AutoLand.poll(g);
    run(g, false);
  };
  A.status = function (g) { return A.enabled(g) ? rt(g).status : '托管已关闭'; };

  // Uses existing fleet-page components; a saved policy is changed only by explicit
  // controls. There is no "run again" button that could bypass the monthly limits.
  A.panel = function (ui, g) {
    const p = A.policy(g), s = g.automation, box = h('section', { class: 'fo-managed', style: { marginTop: '16px' }, 'aria-label': '运营托管' });
    box.appendChild(h('div', { class: 'fl-h' }, '运营托管'));
    const toggle = function (key, label, hint, disabled) {
      box.appendChild(h('div', { class: 'fo-auto' }, h('span', { class: 'grow' }, h('b', null, label), h('small', null, hint)), h('button', { class: 'switch' + (p[key] ? ' on' : ''), role: 'switch', 'aria-checked': String(p[key]), 'aria-label': label, disabled: disabled ? true : null, onclick: function () { A.setPolicy(g, { [key]: !p[key] }); ui.markUnsaved(); ui.scheduleAutosave(); ui.rerenderPage(); } }, h('i'))));
    };
    toggle('enabled', '启用运营与投资托管', '统一启用自动调车和下方授权项目。调车先用车辆段，再调其他智能交路的富余车，每月最多调拨 64 列；手动线路保留原计划。');
    toggle('alerts', '自动处理待办', '按现有预算自动调车、购车和扩站；拥挤的手动线路会切换为智能调度。每次处理后等待新客流，保留其他待办。', !p.enabled);
    toggle('buy', '允许自动购车', '没有合适余车时，在本月限额内实际购车并扣费；不会出售列车或借债。', !p.enabled);
    toggle('stations', '允许自动扩站并支付建设费', '两次不同月份的新观测持续超 110% 时按 S→M→L 扩容；每月最多一站，涉及手动线路的站点不扩建。', !p.enabled);
    toggle('hubs', '允许大站继续扩建换乘大厅', '仅在大站仍拥挤、汇集线路数量达标时升级一级大厅，继续受共享月预算约束。', !p.enabled || !p.stations);
    toggle('tod', '允许自动开发车站商业（TOD）', '只开发已运营的自有车站；按工作日与周末客流估算增量净收益，优先选择预计 10 年内回本的项目，每站每月最多升级一级。', !p.enabled);
    toggle('land', '允许提前购买规划用地', '按稳定有效草案中的实际征地需求选地；购地只用一般资金，并给草案施工留够资金。地下隧道沿线不会盲目购地，取消草案后保留已购地块。', !p.enabled);
    const fields = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '8px' } });
    const number = function (key, label, max, step) {
      const input = h('input', { type: 'number', min: '0', max: String(max), step: String(step || 1), value: String(p[key]), disabled: !p.enabled ? true : null, style: { width: '100%', boxSizing: 'border-box' }, 'aria-label': label, onchange: function () { const raw = input.value.trim(), value = Number(raw); if (!raw || !integer(value, 0, max)) { input.value = String(p[key]); ui.toast('请输入范围内的整数', 'warn'); return; } if (value === p[key]) return; A.setPolicy(g, { [key]: value }); ui.markUnsaved(); ui.scheduleAutosave(); ui.rerenderPage(); } });
      fields.appendChild(h('label', { class: 'field' }, h('span', null, label), input));
    };
    number('monthlyLimit', '每月总支出上限（万元）', 100000000, 1000); number('reserve', '一般资金保留（万元）', 100000000, 1000); number('buyLimit', '每月最多购车（列）', 24); number('sparePct', '调出线路备用比例（%）', 50);
    number('todLimit', '每月最多商业开发（站）', 8); number('landLimit', '每月最多购地（块）', 8);
    box.appendChild(fields);
    box.appendChild(h('div', { class: 'note' }, '购车、扩站、车站商业与购地共用月支出上限；购地只用一般资金，其他建设优先用专项资金。新功能默认关闭，自由建造也保留月额度限制。'));
    const live = function (fn) { return ui.liveText ? ui.liveText(fn) : h('span', null, fn()); };
    box.appendChild(h('div', { class: 'callout info', role: 'status' }, live(function () { return A.status(g); }),
      p.alerts ? h('div', { class: 'tiny' }, live(function () { return A.enabled(g) ? rt(g).alertsStatus || '等待完整运营数据后逐项处理待办' : '托管已关闭'; })) : null,
      p.tod ? h('div', { class: 'tiny' }, live(function () { return A.enabled(g) ? rt(g).todStatus || '商业开发将在本月调度与扩站检查完成后进行' : '托管已关闭'; })) : null,
      p.land ? h('div', { class: 'tiny' }, live(function () { return !A.enabled(g) ? '托管已关闭' : (CM.AutoLand && CM.AutoLand.status && CM.AutoLand.status(g)) || rt(g).landStatus || '等待稳定有效的建设草案后预购地块'; })) : null,
      s ? h('div', { class: 'tiny' }, live(function () { return '本月已支出 ' + U.fmtMoney(s.budgetYM === g.ym() ? s.spent : 0) + ' · 购车 ' + (s.budgetYM === g.ym() ? s.bought : 0) + ' 列 · 商业 ' + A.count(g, 'tod') + ' 站 · 购地 ' + A.count(g, 'land') + ' 块'; })) : null));
    const details = h('details', null, h('summary', null, '最近托管记录' + (s && s.log.length ? '（' + s.log.length + '）' : '')));
    if (!s || !s.log.length) details.appendChild(h('p', { class: 'note' }, '尚未启用。所有调拨、实际支出及等待原因会保存在本局进度中。'));
    else for (const e of s.log.slice().reverse()) details.appendChild(h('div', { class: 'note', style: { borderBottom: '1px solid var(--line)', padding: '8px 0' } }, h('b', null, h('span', null, Math.floor(e.ym / 12) + '年' + (e.ym % 12 + 1) + '月'), ' · ', h('span', null, e.title)), h('div', null, e.desc)));
    box.appendChild(details); return box;
  };
})(window.CM);
