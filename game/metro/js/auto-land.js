'use strict';
// Buy real land for a stable player plan. The construction estimate is reused,
// never recomputed here; purchases remain assets if the plan is later cancelled.
(function (CM) {
  const L = CM.AutoLand = {}, runtime = new WeakMap(), EPS = 1e-7;
  const QUIET_MS = 800, CHECK_MS = 1000, MAX_ROWS = 8192, MAX_QUOTES = 128;
  const rt = function (g) {
    let r = runtime.get(g);
    if (!r) { r = { draft: null, ver: -1, since: 0, next: 0, key: '', ym: -1, purchased: new Set(), message: '' }; runtime.set(g, r); }
    return r;
  };
  const note = function (g, r, message) {
    r.message = message;
    if (CM.Automation.noteInvestment) CM.Automation.noteInvestment(g, 'land', message);
    return 0;
  };
  const busy = function (g) {
    if (g.pending || g.jumping || g.preview || g.econ.failed || (CM.isLoading && CM.isLoading())) return true;
    const focus = document.activeElement;
    if (focus && (/^(INPUT|TEXTAREA|SELECT)$/.test(focus.tagName) || focus.isContentEditable)) return true;
    const d = g.draft, ui = CM.ui;
    if (d && (d.liveSnap || d.automation)) return true;
    if (CM.R && CM.R.game === g && CM.R.interacting) return true;
    if (ui && ui.g && ui.g() === g) {
      const t = ui.tools;
      if ((ui.blocking && ui.blocking()) || ui.opsApp || ui.voApp || ui.dropdown || ui.searchEl || ui.linePicker || ui.propertyPick || ui._keyCap ||
          (t && (t.drag || t.ptr || t.pinch || (t.touches && t.touches.size)))) return true;
    }
    return false;
  };
  const available = function (g, policy, estimate, A) {
    const allowance = A.allowance(g, 'general');
    if (g.econ.isFree()) return allowance;
    // Keep enough general cash for the already quoted construction, even before
    // counting the newly purchased parcel's future acquisition deduction.
    const constructionCash = Math.max(0, estimate.total - Math.max(0, g.econ.capex || 0));
    return Math.max(0, Math.min(allowance, g.econ.funds - policy.reserve - constructionCash));
  };
  const candidates = function (g, d, ev, r) {
    const M = CM.Metro, P = CM.Property, cells = new Map();
    for (const a of ev.landAcquisitions) {
      const b = a && a.bill;
      if (!b || b.kind !== 'demolition' || !Number.isInteger(a.c) || a.c < 0 || a.c >= g.city.N ||
          !Number.isFinite(a.frac) || a.frac <= 0 || !Number.isFinite(a.fee) || a.fee <= 0) continue;
      const object = d.net.stations[b.ref] || d.net.segments[b.ref];
      if (!object || M.ownerId(object, d.net) !== 'player' || r.purchased.has(a.c)) continue;
      const held = P.find(g, a.c);
      if (held && held.owned) continue;
      const entry = cells.get(a.c) || { c: a.c, fee: 0, frac: 0 };
      entry.fee += a.fee; entry.frac += a.frac; cells.set(a.c, entry);
    }
    // The bounded shortlist avoids a price calculation for every map cell or a
    // very long corridor. Only cells already present in the real estimate qualify.
    const shortlist = Array.from(cells.values()).sort(function (a, b) { return b.fee - a.fee || a.c - b.c; }).slice(0, MAX_QUOTES);
    const out = [];
    for (const row of shortlist) {
      if (P.unavailable(g, row.c)) continue;
      const q = P.quote(g, row.c);
      if (!q || !(q.area > EPS) || !Number.isFinite(q.buy) || q.buy <= 0) continue;
      out.push({ c: row.c, fee: row.fee, price: q.buy, priority: row.fee / q.buy });
    }
    return out.sort(function (a, b) { return b.priority - a.priority || b.fee - a.fee || a.c - b.c; });
  };
  L.status = function (g) { return rt(g).message; };
  L.poll = function (g, now) {
    if (!g) return 0;
    const r = rt(g), A = CM.Automation, P = CM.Property;
    if (!A || !P || typeof A.recordInvestment !== 'function') return 0;
    const p = A.policy(g);
    if (!p.enabled || !p.land) { r.draft = null; r.key = ''; return note(g, r, ''); }
    if (A.prepareBudget) A.prepareBudget(g);
    const ym = g.ym();
    if (r.ym !== ym) { r.ym = ym; r.purchased.clear(); r.key = ''; }
    const count = A.count ? A.count(g, 'land') : g.automation && g.automation.landCount || 0;
    if (count >= p.landLimit) return note(g, r, '自动购地已达本月数量上限');
    const time = Number.isFinite(now) ? now : performance.now(), d = g.draft;
    if (!d || busy(g)) { r.draft = null; r.key = ''; return note(g, r, d ? '自动购地等待拖动、输入、对话框或结算结束' : '自动购地等待建设草案'); }
    if (r.draft !== d || r.ver !== d.ver) { r.draft = d; r.ver = d.ver; r.since = time; r.key = ''; }
    if (time - r.since < QUIET_MS) return note(g, r, '自动购地等待草案稳定');
    const ev = d.eval;
    if (!ev || d.evalVer !== d.ver) return note(g, r, '自动购地等待当前草案报价完成');
    if (!ev.changed || !Number.isFinite(ev.total) || ev.total < 0 || !Array.isArray(ev.conflicts) || ev.conflicts.length ||
        !ev.changes || !Array.isArray(ev.changes.del) || ev.changes.del.length ||
        !Array.isArray(ev.landAcquisitions)) {
      return note(g, r, '自动购地等待无冲突且不含拆除的玩家建设草案');
    }
    if (ev.landAcquisitions.length > MAX_ROWS) return note(g, r, '草案征地明细过大，请缩小规划后自动购地');
    const key = [ym, d.ver, g.netVersion, g.property && g.property.rev, g.city.version, g.city.geoVer, g.city.terrainVer,
      g.model && g.model.version, g.econ.funds, g.econ.capex, p.reserve, p.monthlyLimit, p.landLimit,
      g.automation && g.automation.spent, count].join(':');
    if (r.eval === ev && key === r.key || time < r.next) return 0;
    r.key = key; r.eval = ev; r.next = time + CHECK_MS;
    if (CM.Metro.playerOwnershipError(g.net, d.net, g)) return note(g, r, '自动购地等待无冲突且不含拆除的玩家建设草案');
    if (P.owned(g).length >= P.MAX_OWNED) return note(g, r, '自动购地等待空余持有名额');
    const cash = available(g, p, ev, A), rows = candidates(g, d, ev, r);
    let reason = rows.length ? '自动购地等待月预算、一般资金底线或草案建设资金充足' : '当前草案没有可自动购入的实际征地地块';
    for (const row of rows) {
      if (row.price > cash + EPS) continue;
      const quote = P.quote(g, row.c);
      if (!quote || !Number.isFinite(quote.buy) || quote.buy > available(g, p, ev, A) + EPS || g.draft !== d || d.ver !== r.ver || d.eval !== ev || d.evalVer !== d.ver) continue;
      const bought = P.buy(g, row.c);
      if (!bought.ok) { reason = bought.reason || reason; continue; }
      r.purchased.add(row.c);
      A.recordInvestment(g, 'land', bought.amount, '托管预购地块：' + P.name(g, row.c),
        '根据当前草案的实际征地明细购入，支付 ' + CM.U.fmtMoney(bought.amount) + '。已为草案建设和一般资金底线保留资金；取消草案不会自动出售，持有费继续按日结算。');
      note(g, r, '已预购 1 块规划用地，等待更新建设报价');
      // Property.buy invalidates evalVer. Let the ordinary UI prepare the next
      // estimate before another parcel is considered; never edit the draft here.
      return 1;
    }
    return note(g, r, reason);
  };
})(window.CM);
