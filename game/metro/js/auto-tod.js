'use strict';
// Optional station commerce: published passenger counts, incremental net return,
// ordinary paid development. No topology edits, traffic solves or whole-map work.
(function (CM) {
  const D = CM.AutoTOD = {}, EPS = 1e-7, MAX_PAYBACK = 10;
  D.MAX_PAYBACK_YEARS = MAX_PAYBACK;
  const idle = function (g) {
    const m = g && g.model;
    if (!g || g.preview || !g.econ || g.econ.failed || g.draft || g.pending || g.jumping || g._impactPlan || !m || m.dailyStale || m.predJob) return false;
    if (!m.net || m.net.C !== g.compiled || !m.trafficReady || !m.trafficReady() || m.hasReviewWork && m.hasReviewWork()) return false;
    const focus = typeof document === 'undefined' ? null : document.activeElement;
    if (focus && (/^(INPUT|TEXTAREA|SELECT)$/.test(focus.tagName) || focus.isContentEditable)) return false;
    const R = CM.R, ui = CM.ui;
    if (R && (!R.game || R.game === g) && R.interacting) return false;
    if (ui && ui.g && ui.g() === g && ((ui.blocking && ui.blocking()) || ui.propertyPick || ui.dropdown || ui.searchEl ||
        ui.tools && (ui.tools.ptr || ui.tools.drag || ui.tools.tool && ui.tools.tool !== 'select'))) return false;
    return true;
  };
  D.ready = idle;
  const flow = function (sd, k) {
    if (!sd || !sd.inn || !sd.out || !sd.xfer || k >= sd.inn.length || k >= sd.out.length || k >= sd.xfer.length) return null;
    const value = sd.inn[k] + sd.out[k] + sd.xfer[k];
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const operated = function (m, C, k) {
    if (!C.serviced[k] || !C.stationRoutes || !C.stationRoutes[k]) return false;
    return ['wd', 'we'].some(function (dt) {
      const context = m.ctxs && m.ctxs[dt];
      return context && context.per && context.per.some(function (p) {
        return p.freq && C.stationRoutes[k].some(function (ri) { return p.freq[ri] > EPS; });
      });
    });
  };
  const completed = function (g, sid) {
    const s = g.automation;
    return !!(s && s.budgetYM === g.ym() && s.todStations && s.todStations.indexOf(sid) >= 0);
  };
  const quote = function (g, sid) {
    const T = CM.TOD, C = g.compiled, s = g.net.stations[sid], k = C.sIndex.get(sid);
    if (!s || !s.built || (CM.Metro.ownerId ? CM.Metro.ownerId(s, g.net) : s.ownerId || 'player') !== 'player' || k === undefined || !operated(g.model, C, k) || completed(g, sid)) return null;
    const from = s.tod || 0, to = from + 1;
    if (!Number.isInteger(from) || from < 0 || to >= T.LEVELS.length) return null;
    const weekday = flow(g.model.stDailyWk, k), weekend = flow(g.model.stDailyWe, k);
    if (weekday === null || weekend === null) return null;
    const hub = !!(C.stationLines[k] && C.stationLines[k].size >= 2), year = g.clock.y;
    const net = function (level) {
      return (T.stationDaily(level, weekday, hub, year, g) * 5 + T.stationDaily(level, weekend, hub, year, g) * 2) / 7 - T.stationCost(level, year, s.size, hub);
    };
    const cost = T.cost(to, year, s.size, hub) - T.cost(from, year, s.size, hub), dailyNet = net(to), dailyGain = dailyNet - net(from);
    const paybackYears = cost / (dailyGain * 365);
    if (!Number.isFinite(cost) || cost <= EPS || !Number.isFinite(dailyNet) || dailyNet <= EPS || !Number.isFinite(dailyGain) || dailyGain <= EPS ||
        !Number.isFinite(paybackYears) || paybackYears > MAX_PAYBACK) return null;
    return { sid: sid, name: s.name, from: from, to: to, cost: cost, dailyNet: dailyNet, dailyGain: dailyGain,
      monthlyNet: dailyNet * 30.4, monthlyGain: dailyGain * 30.4, paybackYears: paybackYears, weekday: weekday, weekend: weekend };
  };
  D.plan = function (g) {
    if (!CM.TOD || !idle(g)) return [];
    const out = [];
    // Iterate the existing station inventory, never the regional land raster.
    for (const sid of Object.keys(g.net.stations)) { const q = quote(g, sid); if (q) out.push(q); }
    return out.sort(function (a, b) { return a.paybackYears - b.paybackYears || b.dailyGain - a.dailyGain || a.sid.localeCompare(b.sid); });
  };
  D.run = function (g) {
    const A = CM.Automation;
    if (!A || !A.recordInvestment || !idle(g)) return 0;
    const policy = A.policy(g);
    if (!policy.enabled || !policy.tod) return 0;
    if (A.prepareBudget) A.prepareBudget(g);
    const count = function () { return A.count ? A.count(g, 'tod') : g.automation.budgetYM === g.ym() ? g.automation.todCount || 0 : 0; };
    const limit = Math.max(0, Math.min(8, policy.todLimit == null ? 2 : policy.todLimit));
    const note = function (s) { if (A.noteInvestment) A.noteInvestment(g, 'tod', s); };
    if (count() >= limit) { note('已达本月商业开发数量上限'); return 0; }
    const candidates = D.plan(g);
    if (!candidates.length) { note('当前没有净收益为正且预计 10 年内回本的运营车站商业项目'); return 0; }
    let actions = 0;
    for (const candidate of candidates) {
      if (count() >= limit || !idle(g)) break;
      // Recheck the current level, published service and price immediately before
      // spending. A saved plan is not a second source of financial truth.
      const q = quote(g, candidate.sid);
      if (!q || q.from !== candidate.from || q.cost > A.allowance(g) + EPS || !g.econ.canAffordBuild(q.cost)) continue;
      const station = g.net.stations[q.sid], T = CM.TOD;
      const title = '托管商业开发：' + station.name;
      const paid = g.econ.spendBuild({ construction: q.cost }, '车站商业开发：' + station.name + ' → ' + T.LEVELS[q.to].name,
        { y: g.clock.y, m: g.clock.m, d: g.clock.d }, true);
      station.tod = q.to;
      if (CM.R && (!CM.R.game || CM.R.game === g)) { CM.R._smC = null; CM.R._todL = null; }
      A.recordInvestment(g, 'tod', paid && Number.isFinite(paid.total) ? paid.total : q.cost, title,
        '升级至' + T.LEVELS[q.to].name + '；投入 ' + CM.U.fmtMoney(q.cost) + '，按当前工作日与周末客流预计每月净增 ' + CM.U.fmtMoney(q.monthlyGain) +
        '，约 ' + CM.U.fmtNum(q.paybackYears, 1) + ' 年回本。实际收入随客流与经济周期变化。', q.sid);
      actions++;
    }
    note(actions ? '本月已自动开发 ' + count() + ' 座车站商业；费用与收益预估见托管记录' : '合适的商业项目超出本月余款或一般资金底线');
    return actions;
  };
})(window.CM);
