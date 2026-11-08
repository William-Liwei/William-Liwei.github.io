'use strict';
// Metro Core delegation executes one bounded change at a time. Published alerts,
// ordinary fleet/build APIs and the shared monthly ledger remain authoritative.
(function (CM) {
  const D = CM.AutoAlerts = {}, M = CM.Metro, U = CM.U, EPS = 1e-7;
  const runtime = new WeakMap();
  const rt = function (g) { let r = runtime.get(g); if (!r) { r = { wait: null, stamp: '' }; runtime.set(g, r); } return r; };
  const owner = function (asset) { return !!asset && (!asset.ownerId || asset.ownerId === 'player'); };
  const note = function (g, text) { CM.Automation.noteInvestment(g, 'alerts', text); };
  const advanced = function (g, wait) { return g.model.version > wait.version || (g.model.cycles || 0) > wait.cycles; };
  const checkpoint = function (g) { return { version: g.model.version, cycles: g.model.cycles || 0 }; };
  const visible = function (el) { return !!el && !el.hidden && !(el.classList && el.classList.contains('hidden')); };
  const blocked = function (g) {
    const m = g && g.model;
    if (!g || g.preview || !g.econ || g.econ.failed) return '当前游戏不可执行托管';
    if (g.draft) return '等待玩家完成或取消当前草案';
    if (g.pending || g.jumping) return '等待时间推进完成';
    if (g._impactPlan || !m || m.predJob) return '等待当前建设效果评估完成';
    const focus = typeof document === 'undefined' ? null : document.activeElement;
    if (focus && (/^(INPUT|TEXTAREA|SELECT)$/.test(focus.tagName) || focus.isContentEditable)) return '等待输入完成';
    const ui = CM.ui, R = CM.R;
    if (R && (!R.game || R.game === g) && R.interacting) return '等待地图操作结束';
    if (ui && ui.g && ui.g() === g) {
      // blocking() includes Metro Core itself, which must remain usable while
      // watching delegation. Other modal screens and map edits still pause it.
      if (visible(ui.screen) || visible(ui.statsEl) || ui.voApp ||
          ui.propertyPick || ui.dropdown || ui.searchEl || ui.linePicker || ui.dialog || ui.modal || ui.keyCapture ||
          CM.NetMap && CM.NetMap.isOpen && CM.NetMap.isOpen()) return '等待当前编辑或对话框结束';
      const t = ui.tools;
      if (t && (t.ptr || t.drag || t.pinch || t.chain || t.touches && t.touches.size || t.tool && t.tool !== 'select')) return '等待地图操作结束';
      if (typeof document !== 'undefined') {
        const modal = document.querySelector('dialog[open], [aria-modal="true"]:not(.mc-app)');
        if (modal && !(ui.opsApp && ui.opsApp.el === modal)) return '等待当前对话框结束';
      }
    }
    if (!g.fleet || !m.net || m.net.C !== g.compiled || m.settled === false || m.dailyStale || !m.trafficReady || !m.trafficReady() || m.hasReviewWork && m.hasReviewWork() || CM.OpsAlerts && CM.OpsAlerts.ready && !CM.OpsAlerts.ready(g)) return '等待完整的新交通结果';
    return '';
  };
  D.ready = function (g) {
    if (blocked(g)) return false;
    const r = rt(g), waiting = g.automation && g.automation.alertWait;
    return !(waiting && (!r.wait || !advanced(g, r.wait)) || r.wait && !advanced(g, r.wait));
  };
  const finish = function (g, x, result) {
    const A = CM.Automation, r = rt(g);
    A.recordAlert(g, { cost: result.cost || 0, bought: result.bought || 0, stationIds: result.stationIds || [], key: x.key,
      title: '地铁芯托管：' + x.name, desc: result.text });
    // Fleet.applyFleet() synchronously republishes frequencies before wake(1).
    // Capture AFTER the action, then wait for the complete background solve.
    r.wait = checkpoint(g); r.stamp = '';
    if (CM.OpsAlerts.markPending) CM.OpsAlerts.markPending(g, x.key);
    note(g, result.text + '；等待新客流复评后继续处理');
    return 1;
  };
  const station = function (g, sid) {
    const A = CM.Automation, s = g.automation, p = A.policy(g), original = g.net.stations[sid];
    if (!p.stations) return { reason: '自动扩站已关闭' };
    if (s.lastStation === g.ym()) return { reason: '已完成本月 1 座车站扩容，等待下月' };
    if (!owner(original)) return { reason: '该车站由所属公司独立管理' };
    let size = { S: 'M', M: 'L' }[original.size], hub = null, label;
    if (size) label = original.size + ' → ' + size;
    else if (p.hubs && M.hubLevel(original) < M.HUBS.length - 1 && !M.hubEligibility(g.net, sid, M.hubLevel(original) + 1)) {
      hub = M.hubLevel(original) + 1; label = M.HUBS[hub].name;
    } else return { reason: !p.hubs ? '车站已达大型规模；可允许枢纽扩建或手动分流' : '车站暂不满足进一步扩建条件；需要手动分流' };
    const next = M.clone(g.net), st = next.stations[sid];
    if (size) st.size = size; else M.setHub(next, sid, hub);
    // Never merge into, publish or leave behind a player draft. Its actual
    // evaluation includes mixed platform levels and existing station facilities.
    const draft = { net: next, automation: 'station', undo: [JSON.stringify(g.net)], redo: [], ver: 1, evalVer: -1, eval: null, compiled: null, compVer: -1, pred: { state: 'idle' } };
    let cost, result;
    g.draft = draft;
    try {
      const ev = g.draftEval(); cost = ev.total;
      if (ev.demolitions.length || ev.changes.del.length || ev.conflicts.length) return { reason: '车站改建校验未通过，已保留原站' };
      if (!Number.isFinite(cost) || cost < 0 || cost > A.allowance(g) + EPS || !g.econ.canAffordBuild(cost)) return { reason: '扩容需要 ' + U.fmtMoney(cost) + '，超出本月余款或资金保留线' };
      result = g.confirmDraft();
    } finally { if (g.draft === draft) g.draft = null; }
    if (!result || !result.ok) return { reason: result && (result.reason || result.error) || '车站改建暂不可执行' };
    return { cost: cost, stationIds: [sid], text: '扩容 ' + original.name + '（' + label + '），实际支出 ' + U.fmtMoney(cost) };
  };
  const line = function (g, x) {
    const F = CM.Fleet, A = CM.Automation, p = A.policy(g), lid = x.id;
    if (!owner(g.net.lines[lid])) return { reason: '该线路由所属公司独立管理' };
    if (g.fleet.ops[lid] && g.fleet.ops[lid].mode === 'manual') {
      // alerts is the explicit, separately labelled permission to delegate this
      // persistently overloaded line. Unrelated manual routes are never touched.
      F.setMode(g, lid, 'auto'); return { text: '将持续拥挤的 ' + x.name + ' 切换为智能调度' };
    }
    const info = (CM.OpsData ? CM.OpsData.lineInfo(g, lid) : F.lineInfo(g, lid)) || [];
    const needs = info.filter(function (s) { return s.short > 0; }).sort(function (a, b) { return b.short / Math.max(1, b.peakNeed) - a.short / Math.max(1, a.peakNeed) || a.id.localeCompare(b.id); });
    for (const s of needs) {
      const idle = g.fleet.trains.filter(function (t) { return owner(t) && !t.line && (F.compatible ? F.compatible(t, s.rt) : t.cars <= s.rt.cars && (s.rt.kmh <= 80 || F.model(t.model).kmh >= s.rt.kmh)); });
      idle.sort(function (a, b) { return F.capOf(b) - F.capOf(a) || a.id.localeCompare(b.id); });
      if (idle.length && F.move(g, [idle[0].id], lid, s.id) === 1) return { text: '向 ' + x.name + ' 调入 1 列兼容的闲置列车' };
    }
    if (needs.length) {
      if (!p.buy) return { reason: '仍缺列车；自动购车已关闭' };
      if (g.automation.bought >= p.buyLimit) return { reason: '已达到本月自动购车数量上限' };
      for (const s of needs) {
        const model = F.recommend(F.cityId(g), g.clock.y, s.rt.kmh, s.rt.railSystem);
        if (!model) return { reason: '当前年代没有兼容车型；可等待新车型或手动降低运行速度' };
        const cars = Math.min(s.rt.cars, model.max), cost = F.price(g, model, cars, g.clock.y);
        if (!Number.isFinite(cost) || cost < 0 || cost > A.allowance(g) + EPS || !g.econ.canAffordBuild(cost)) continue;
        const result = F.buy(g, lid, s.id, model.id, cars, 1);
        if (result.ok) return { cost: result.cost, bought: 1, text: '为 ' + x.name + ' 购入 1 列 ' + F.shortOf(model) + '（' + cars + ' 节），实际支出 ' + U.fmtMoney(result.cost) };
        return { reason: result.error || '列车暂不可购买' };
      }
      return { reason: '购车超出本月余款或资金保留线' };
    }
    // Full-frequency lines may need longer platforms. Upgrade only one player
    // station, never the old plan's entire batch or another company's station.
    const routes = g.compiled.routes.filter(function (r) { return r.lineId === lid && !r.svc; });
    const max = CM.RailSystems ? CM.RailSystems.get(g.net.lines[lid]).cars : 8;
    const min = routes.reduce(function (v, r) { return Math.min(v, r.cars); }, max), ids = new Set();
    for (const r of routes) if (r.cars === min && min < max) for (const sid of r.stIds) {
      const st = g.net.stations[sid]; if (owner(st) && CM.CFG.metro.carsBySize[st.size] === min) ids.add(sid);
    }
    let reason = '发车频率和编组已到上限，需要手动分流';
    for (const sid of ids) { const result = station(g, sid); if (!result.reason) return result; reason = result.reason; }
    return { reason: reason };
  };
  D.poll = function (g) {
    const A = CM.Automation;
    if (!A || !A.enabled(g) || !A.policy(g).alerts || !CM.OpsAlerts || !A.recordAlert) return 0;
    A.prepareBudget(g);
    const reason = blocked(g); if (reason) { note(g, reason); return 0; }
    const r = rt(g), s = g.automation, m = g.model;
    if (s.alertWait && !r.wait) {
      // A save may contain the just-adjusted, still-old demand snapshot. Ask for
      // one ordinary asynchronous observation after reload; never solve inline.
      r.wait = checkpoint(g);
      if (m.wake) m.wake(1);
      note(g, '正在重新评估上次处理结果'); return 0;
    }
    if (r.wait) {
      if (!advanced(g, r.wait)) { note(g, '等待上次处理后的完整新客流'); return 0; }
      r.wait = null;
      if (s.alertWait) { s.alertWait = false; g.touch(); g.emit('autosave', 'automation'); }
    }
    // In a settled frame with unchanged policy/wallet there is no new work to
    // plan. Keep only small scalar stamps, not obsolete city or result objects.
    const p = A.policy(g), n = g.opsNote || {};
    const stamp = [m.version, m.cycles, m.epoch, g.netVersion, g.fleet.ver, g.rev, g.ym(), n.ym, s.spent, s.bought, s.lastStation,
      g.econ.funds, g.econ.capex, p.buy, p.stations, p.hubs, p.reserve, p.monthlyLimit, p.buyLimit].join('|');
    if (r.stamp === stamp) return 0;
    r.stamp = stamp;
    const list = CM.OpsAlerts.active(g);
    let wait = '';
    for (const x of list) {
      if (x.pending || !(x.value >= 1.1) || !n.streak || !(n.streak[x.key] >= 2) || n.snooze && n.snooze[x.key] > g.ym()) continue;
      const asset = x.kind === 'station' ? g.net.stations[x.id] : x.kind === 'line' ? g.net.lines[x.id] : null;
      if (!owner(asset)) continue;
      let result;
      try { result = x.kind === 'station' ? station(g, x.id) : line(g, x); }
      catch (error) { result = { reason: error && error.message || '当前项目暂不可执行' }; }
      if (!result.reason) return finish(g, x, result);
      if (!wait) wait = x.name + '：' + result.reason;
    }
    note(g, wait || (list.some(function (x) { return x.pending; }) ? '等待已处理项目的新客流复评' : '暂无可处理的持续过载提醒'));
    return 0;
  };
})(window.CM);
