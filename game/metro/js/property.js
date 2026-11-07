'use strict';
// 自选地块经营。独立于车站 TOD 和政府合同；只有正式线网的可步行运营服务会带来收益。
(function (CM) {
  const U = CM.U, CFG = CM.CFG;
  const P = CM.Property = { VERSION: 1, MAX_OWNED: 32, MAX_RECORDS: 256, ACQUISITION_SHARE: 0.6 };
  const BUY_SPREAD = 0.08, SELL_FEE = 0.06, HOLD_RATE = 0.012, EPS = 1e-7;
  const finite = function (v, lo, hi) { return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi; };
  const dayKey = function (g) { return g.clock.y * 372 + (g.clock.m - 1) * 31 + g.clock.d; };
  const date = function (g) { return { y: g.clock.y, m: g.clock.m, d: g.clock.d }; };
  const state = function (g) { return g.property || (g.property = { v: 1, rev: 0, lastDay: -1, records: [] }); };
  const records = function (g) { return g.property ? g.property.records : []; };
  const find = function (g, c) { return records(g).find(function (p) { return p.c === c; }); };
  const owned = function (g) { return records(g).filter(function (p) { return p.owned; }); };
  const changed = function (g) {
    state(g).rev++;
    if (g.draft) g.draft.evalVer = -1;
    if (g.touch) g.touch();
    if (g.emit) g.emit('finance');
  };
  P.find = find;
  P.owned = owned;
  P.name = function (g, c) {
    const rg = g.city.regions[g.city.region[c]], x = c % g.city.W, y = Math.floor(c / g.city.W);
    return (rg ? rg.name : '地块') + ' · ' + (x + 1) + ',' + (y + 1);
  };
  P.unavailable = function (g, c, allowExhausted) {
    const city = g.city, LU = CM.LU;
    if (!Number.isInteger(c) || c < 0 || c >= city.N) return '请选择地图内的地块';
    if (city.landFrac[c] < 0.8 || city.lu[c] === LU.WATER) return '水域与临水碎地不可购买';
    if (city.cellLocked(c)) return '该区域尚未开放';
    const rg = city.regions[city.region[c]];
    if (!rg || rg.scenic || city.protectedId && city.protectedId[c] > 0 || city.heritage && city.heritage[c] === 2 ||
        [LU.PARK, LU.INST, LU.HILL, LU.AIRPORT, LU.LANDMARK].indexOf(city.lu[c]) >= 0) return '公共设施、景区与保护用地不可购买';
    const p = find(g, c), used = Math.max(p ? p.used : 0, city.taken[c] || 0);
    if (!allowExhausted && used >= 0.98) return '地块已用于公共建设，没有可交易面积';
    return '';
  };

  // 按道路步行接驳、真正停靠的交路、已求解的发车频率和客流估值。
  // 不读草案，也不以直线距离跨河估值；过站不停、零配车和拆线都不能提供服务。
  P.service = function (g, c) {
    const out = { score: 0, metres: Infinity, station: null, flow: 0 }, m = g.model, C = g.compiled;
    const K = m && m.net, acc = K && K.acc;
    if (!C || !K || K.C !== C || !acc || !acc.cellWalk || !acc.cellStation) return out;
    const k = acc.cellStation[c], dist = acc.cellWalk[c], maxM = CFG.walk.maxAccessM;
    if (!Number.isInteger(k) || k < 0 || !C.stations[k] || !C.serviced[k] || !Number.isFinite(dist) || dist > maxM) return out;
    const st = C.stations[k];
    if (!g.net.stations[st.id] || !g.net.stations[st.id].built) return out;
    const per = m.ctxs && m.ctxs.wd ? m.ctxs.wd.per : m.live && m.live.per;
    if (!per || !per[0] || !per[0].freq) return out;
    let frequency = 0;
    for (const ri of C.stationRoutes[k] || []) frequency += Math.max(0, per[0].freq[ri] || 0);
    if (frequency <= EPS) return out;
    const sd = m.stDailyWk || m.stDaily;
    const flow = sd && k < sd.inn.length ? Math.max(0, (sd.inn[k] || 0) + (sd.out[k] || 0)) : 0;
    const walk = U.clamp(1 - dist / (maxM * 1.15), 0, 1), freq = U.clamp(frequency / 8, 0, 1);
    const demand = 0.35 + 0.65 * U.clamp(flow / 10000, 0, 1);
    const lines = C.stationLines[k] ? C.stationLines[k].size : 1;
    out.score = U.clamp(walk * freq * demand * (1 + Math.min(0.2, Math.max(0, lines - 1) * 0.1)), 0, 1);
    out.metres = dist; out.station = st.name; out.flow = flow;
    return out;
  };
  P.baseValue = function (g, c) {
    const city = g.city, free = Math.max(0.05, 1 - (city.taken[c] || 0));
    const density = U.clamp((city.pop[c] + city.jobs[c]) / (2500 * free), 0.15, 1.6);
    const heritage = city.heritage && city.heritage[c] && CFG.cost.heritage ? CFG.cost.heritage.demolish : 1;
    return CFG.cost.demolishPerCell * density * heritage * CM.Metro.costIndex(g.clock.y);
  };
  P.quote = function (g, c) {
    if (!Number.isInteger(c) || c < 0 || c >= g.city.N) return null;
    const p = find(g, c), service = P.service(g, c), used = Math.max(p ? p.used : 0, g.city.taken[c] || 0);
    const area = Math.max(0, 1 - used), base = P.baseValue(g, c), access = p && p.owned ? Math.min(p.access, service.score) : service.score;
    const land = base * area * (1 + 0.8 * access);
    const devScale = p && p.devArea > EPS ? Math.min(1, area / p.devArea) : 0;
    const dev = p ? p.devCost * devScale : 0;
    const age = p && p.devAt >= 0 ? Math.max(0, dayKey(g) - p.devAt) / 372 : 0;
    const building = dev * Math.max(0.25, 1 - age * 0.025) * (0.5 + access * 0.5) * 0.7;
    const hold = base * area * HOLD_RATE / 365, upkeep = dev * 0.03 / 365;
    // 空地不产租。已开发物业只从实际可达服务取得收入，低客流时净租金可以为负。
    const rent = dev > 0 ? base * area * 0.14 * access / 365 : 0;
    return { c: c, p: p, service: service, area: area, base: base, access: access, land: land, building: building,
      buy: land * (1 + BUY_SPREAD), sell: (land + building) * (1 - SELL_FEE), develop: base * area * 0.65,
      rent: rent, hold: hold, upkeep: upkeep, net: rent - hold - upkeep };
  };
  const busy = function (g) { return g.pending || g.jumping || g.econ.failed ? '正在结算或本局已结束，请稍候' : ''; };
  const book = function (g, kind, amount, note, incoming) {
    if (incoming) g.econ.income(kind, amount); else g.econ.spend(kind, amount);
    g.econ.log(kind, incoming ? amount : -amount, 'gen', note, date(g));
  };
  P.buy = function (g, c) {
    const reason = busy(g) || P.unavailable(g, c);
    if (reason) return { ok: false, reason: reason };
    const q = P.quote(g, c), old = q.p;
    if (old && old.owned) return { ok: false, reason: '你已持有这块地' };
    if (owned(g).length >= P.MAX_OWNED) return { ok: false, reason: '最多同时持有 ' + P.MAX_OWNED + ' 块地' };
    if (!old && records(g).length >= P.MAX_RECORDS) return { ok: false, reason: '本局地块记录已满；仍可交易此前记录的地块' };
    if (!g.econ.canAfford(q.buy)) return { ok: false, reason: '一般资金不足：需要 ' + U.fmtMoney(q.buy) };
    const p = old || { c: c, owned: false, used: 1 - q.area, paid: 0, bought: 0, access: 0, devCost: 0, devArea: 0, devAt: -1, rent: 0, cost: 0, saved: 0 };
    if (!old) state(g).records.push(p);
    p.owned = true; p.used = 1 - q.area; p.paid = q.buy; p.bought = dayKey(g); p.access = q.service.score;
    p.devCost = 0; p.devArea = 0; p.devAt = -1;
    book(g, 'landBuy', q.buy, '购入地块：' + P.name(g, c), false);
    changed(g);
    return { ok: true, amount: q.buy };
  };
  P.sell = function (g, c) {
    const reason = busy(g), p = find(g, c);
    if (reason || !p || !p.owned) return { ok: false, reason: reason || '你没有持有这块地' };
    const q = P.quote(g, c);
    book(g, 'landSale', q.sell, '出售剩余地块与物业：' + P.name(g, c), true);
    // 保留已消耗土地的记录；重新购入只能买回剩余面积，不能再次抵扣已用掉的建设用地。
    p.owned = false; p.used = 1 - q.area; p.devCost = 0; p.devArea = 0; p.devAt = -1;
    changed(g);
    return { ok: true, amount: q.sell };
  };
  P.develop = function (g, c) {
    const reason = busy(g) || P.unavailable(g, c), p = find(g, c);
    if (reason || !p || !p.owned || p.devCost > 0) return { ok: false, reason: reason || '请先持有尚未开发的地块' };
    const q = P.quote(g, c);
    if (q.area < 0.15) return { ok: false, reason: '剩余面积不足 15%，不适合开发' };
    if (!g.econ.canAfford(q.develop)) return { ok: false, reason: '一般资金不足：需要 ' + U.fmtMoney(q.develop) };
    p.devCost = q.develop; p.devArea = q.area; p.devAt = dayKey(g);
    book(g, 'landDevelop', q.develop, '开发沿线出租物业：' + P.name(g, c), false);
    changed(g);
    return { ok: true, amount: q.develop };
  };

  P.daily = function (g) {
    if (!g.property) return;
    const s = g.property, day = dayKey(g);
    if (day <= s.lastDay) return;
    s.lastDay = day;
    let rent = 0, hold = 0, upkeep = 0;
    for (const p of owned(g)) {
      const service = P.service(g, p.c);
      // 新开通的溢价一年内逐步形成；停运、失去步行接驳时立即按较低服务估值。
      p.access = service.score < p.access ? service.score : p.access + (service.score - p.access) / 365;
      const q = P.quote(g, p.c);
      rent += q.rent; hold += q.hold; upkeep += q.upkeep;
      p.rent += q.rent; p.cost += q.hold + q.upkeep;
    }
    if (rent > 0) g.econ.income('landRent', rent);
    if (hold > 0) g.econ.spend('landHold', hold);
    if (upkeep > 0) g.econ.spend('landMaintain', upkeep);
  };

  // Metro 提供原始拆迁项目中逐格的征地部分。只在建设报价中扣减该项，不发放现金。
  P.applyEstimate = function (g, ev) {
    if (!g.property || ev.property || !ev.landAcquisitions) return;
    const consumed = new Map(), uses = [], byBill = new Map();
    for (const a of ev.landAcquisitions) {
      const p = find(g, a.c);
      if (!p || !p.owned || !(a.frac > 0) || !(a.fee > 0) || !a.bill || a.bill.kind !== 'demolition') continue;
      const available = Math.max(0, 1 - Math.max(p.used, g.city.taken[a.c] || 0) - (consumed.get(a.c) || 0));
      const frac = Math.min(available, a.frac);
      if (frac <= EPS) continue;
      const credit = Math.min(a.fee * frac / a.frac, Math.max(0, a.bill.amount - (byBill.get(a.bill) || 0)));
      if (credit <= EPS) continue;
      consumed.set(a.c, (consumed.get(a.c) || 0) + frac);
      byBill.set(a.bill, (byBill.get(a.bill) || 0) + credit);
      uses.push({ c: a.c, frac: frac, credit: credit });
    }
    let saving = 0;
    byBill.forEach(function (credit, bill) { bill.amount -= credit; saving += credit; bill.label += '（自有地减免 ' + U.fmtMoney(credit) + '）'; });
    ev.total -= saving; ev.byKind.demolition -= saving;
    ev.property = { rev: g.property.rev, uses: uses, saving: saving };
    if (saving > EPS) ev.notes.push('自有土地减免征地费用 ' + U.fmtMoney(saving) + '；对应面积永久划入地铁用地，土建与拆除费用照付。');
  };
  P.commit = function (g, ev) {
    const e = ev.property;
    if (!e || !e.uses.length) return { ok: true };
    if (e.committed || !g.property || e.rev !== g.property.rev) return { ok: false, reason: '土地持有情况已变化，请刷新建设报价' };
    const totals = new Map();
    for (const u of e.uses) totals.set(u.c, (totals.get(u.c) || 0) + u.frac);
    for (const [c, frac] of totals) { const p = find(g, c); if (!p || !p.owned || frac > 1 - Math.max(p.used, g.city.taken[c] || 0) + EPS) return { ok: false, reason: '土地可用面积已变化，请刷新建设报价' }; }
    for (const u of e.uses) { const p = find(g, u.c); p.used = Math.min(1, Math.max(p.used, g.city.taken[u.c] || 0) + u.frac); p.saved += u.credit; }
    e.committed = true; changed(g);
    return { ok: true };
  };

  // 拒绝损坏的财产数据，不替玩家补钱或默默重置土地消耗记录。旧档没有字段时保持未启用。
  P.validate = function (s, cells) {
    if (s == null) return true;
    const fail = function () { throw new Error('存档中的土地与物业数据无效，原存档未改动'); };
    if (!s || Array.isArray(s) || s.v !== P.VERSION || !Number.isSafeInteger(s.rev) || s.rev < 0 ||
        !Number.isSafeInteger(s.lastDay) || s.lastDay < -1 || s.lastDay > 4000000 || !Array.isArray(s.records) || s.records.length > P.MAX_RECORDS) fail();
    if (Object.keys(s).some(function (k) { return ['v', 'rev', 'lastDay', 'records'].indexOf(k) < 0; })) fail();
    const fields = ['c', 'owned', 'used', 'paid', 'bought', 'access', 'devCost', 'devArea', 'devAt', 'rent', 'cost', 'saved'];
    const seen = new Set(); let count = 0;
    for (const p of s.records) {
      if (!p || Array.isArray(p) || !Number.isInteger(p.c) || p.c < 0 || p.c >= cells || seen.has(p.c) || typeof p.owned !== 'boolean' ||
          !finite(p.used, 0, 1) || !finite(p.access, 0, 1) || !Number.isInteger(p.bought) || p.bought < 0 || p.bought > 4000000 ||
          !Number.isInteger(p.devAt) || p.devAt < -1 || p.devAt > 4000000 || !finite(p.devArea, 0, 1) ||
          ['paid', 'devCost', 'rent', 'cost', 'saved'].some(function (k) { return !finite(p[k], 0, 1e14); }) ||
          (p.devCost > 0 && (!p.owned || p.devArea <= 0 || p.devAt < 0)) || (p.devCost === 0 && (p.devArea !== 0 || p.devAt !== -1))) fail();
      if (Object.keys(p).some(function (k) { return fields.indexOf(k) < 0; })) fail();
      seen.add(p.c); if (p.owned) count++;
    }
    if (count > P.MAX_OWNED) fail();
    return true;
  };
  P.serialize = function (g) { if (!g.property) return undefined; P.validate(g.property, g.city.N); return JSON.parse(JSON.stringify(g.property)); };
  P.restore = function (g, s) {
    P.validate(s, g.city.N);
    if (s && (s.lastDay > dayKey(g) || s.records.some(function (p) { return p.bought > dayKey(g) || p.devAt > dayKey(g); }))) throw new Error('存档中的土地交易日期无效');
    if (s && s.records.some(function (p) { return p.owned && P.unavailable(g, p.c, true); })) throw new Error('存档中的土地位于不可交易的水域、未开放区或保护用地');
    if (s) g.property = JSON.parse(JSON.stringify(s));
  };

  // 复用地图详情与财政页。只在主动点“选地块”时拦截地图选择，不改变建站/绘线工具。
  P.pick = function (ui, w) {
    if (!ui.propertyPick) return false;
    if (ui.propertyPick !== ui.g().id) { ui.propertyPick = false; return false; }
    const g = ui.g(), c = g.city.cellAt(w.x, w.y);
    if (c < 0) { ui.toast('请选择地图内的地块', 'info'); return true; }
    ui.propertyPick = false;
    ui.select({ kind: 'zone', id: g.city.zoneOf(c), cell: c });
    return true;
  };
  P.startPick = function (ui) {
    ui.propertyPick = ui.g().id;
    ui.tools.setTool('select');
    if (ui.closePanel) ui.closePanel();
    ui.toast('点击地图选择一块地，查看价格后购买', 'info');
  };
  const action = function (ui, fn, text) {
    const r = fn(); ui.toast(r.ok ? text : r.reason, r.ok ? 'good' : 'bad');
    if (r.ok) { ui.markUnsaved(); ui.rerenderPage(); }
  };
  P.cellPanel = function (ui, c) {
    const h = U.h, g = ui.g(), q = P.quote(g, c), el = h('div', { class: 'property-card' });
    if (!q) return el;
    const p = q.p, isOwned = p && p.owned, reason = P.unavailable(g, c);
    el.appendChild(h('div', { class: 'row between property-heading' }, h('b', null, isOwned ? '自有地块' : '地块交易'),
      h('span', { class: 'tag' }, isOwned ? (p.devCost > 0 ? '出租物业' : '土地储备') : '可选购地')));
    el.appendChild(h('div', { class: 'tiny muted' }, P.name(g, c)));
    el.appendChild(ui.kv([
      ['可交易面积', U.fmtNum(q.area * CFG.CELL_M * CFG.CELL_M / 10000, 2) + ' 公顷（剩余 ' + U.fmtPct(q.area, 0) + '）'],
      ['运营服务', q.service.station ? q.service.station + ' · 步行 ' + Math.round(q.service.metres) + ' 米' : '暂无可步行到达的运营服务'],
      ['地铁带来的地价溢价', '+' + U.fmtPct(0.8 * q.access, 1)],
      [isOwned ? '出售净到手' : '购入总价（含 8% 交易溢价）', U.fmtMoney(isOwned ? q.sell : q.buy)],
      ['每月持有及维护成本', U.fmtMoney((q.hold + q.upkeep) * 30.4)],
      isOwned && p.devCost > 0 ? ['每月租金 / 净收入', U.fmtMoney(q.rent * 30.4) + ' / ' + U.fmtMoney(q.net * 30.4)] : null,
      isOwned && p.saved > 0 ? ['已减免征地费用', U.fmtMoney(p.saved)] : null,
    ]));
    const buttons = h('div', { class: 'property-actions' });
    if (isOwned) {
      if (!p.devCost && q.area >= 0.15 && !reason) buttons.appendChild(h('button', { class: 'btn sm primary', disabled: !g.econ.canAfford(q.develop), onclick: function () { action(ui, function () { return P.develop(g, c); }, '物业已开发；租金与维护成本逐日结算'); } }, '开发出租 · ' + U.fmtMoney(q.develop)));
      buttons.appendChild(h('button', { class: 'btn sm ghost', onclick: function () { action(ui, function () { return P.sell(g, c); }, '剩余地块已出售，款项已入一般资金'); } }, '出售 · ' + U.fmtMoney(q.sell)));
    } else if (!reason) buttons.appendChild(h('button', { class: 'btn sm primary', disabled: !g.econ.canAfford(q.buy) || owned(g).length >= P.MAX_OWNED, onclick: function () { action(ui, function () { return P.buy(g, c); }, '已购入地块，开始计收持有成本'); } }, '购买地块 · ' + U.fmtMoney(q.buy)));
    buttons.appendChild(h('button', { class: 'btn sm ghost', onclick: function () { P.startPick(ui); } }, '另选地块'));
    el.appendChild(buttons);
    if (reason) el.appendChild(h('div', { class: 'note' }, reason));
    el.appendChild(h('div', { class: 'note property-note' }, isOwned ? '卖价已扣 6% 交易费；已划入地铁建设的面积不再出售。开发前可继续持有，空地没有租金。' : '地块为游戏经营单位。可提前储地；以后车站或地面、高架线路用到自有土地时，减免对应征地费。'));
    return el;
  };
  P.portfolioPanel = function (ui) {
    const h = U.h, g = ui.g(), list = owned(g), el = h('div', { class: 'property-portfolio' });
    const total = { value: 0, net: 0, saved: 0, buy: 0 };
    for (const p of list) { const q = P.quote(g, p.c); total.value += q.sell; total.net += q.net * 30.4; total.buy += p.paid; }
    for (const p of records(g)) total.saved += p.saved;
    el.appendChild(h('div', { class: 'property-intro' }, h('h3', null, '沿线土地与物业'), h('p', { class: 'muted' }, '提前选地，修通地铁，再选择出售或开发出租。只有正式运营且能步行到站的地块会获得地铁溢价；溢价随服务逐步形成，停运后回落。')));
    el.appendChild(ui.kv([['已持有地块', list.length + ' / ' + P.MAX_OWNED], ['全部出售净到手', U.fmtMoney(total.value)], ['每月租金减持有与维护', U.fmtMoney(total.net)], ['累计减免征地费用', U.fmtMoney(total.saved)]]));
    el.appendChild(h('div', { class: 'property-actions' }, h('button', { class: 'btn primary', onclick: function () { P.startPick(ui); } }, '到地图选地块')));
    el.appendChild(h('div', { class: 'note property-note' }, '购地和开发只用一般资金；空地每年按基础地价收取 1.2% 持有费，出租物业另有维护费。建设报价只减免拆迁费用中的征地部分（60%），不减免土建、隧道、轨道或实际拆除费用。' + (g.econ.isFree() ? ' 自由建造模式下，所有金额仅作经营参考。' : '')));
    if (!list.length) el.appendChild(h('div', { class: 'property-empty' }, '还没有地块。点击“到地图选地块”，从线路将来经过的街区开始。'));
    for (const p of list) {
      const q = P.quote(g, p.c), row = h('div', { class: 'property-row' });
      row.appendChild(h('div', { class: 'row between' }, h('b', null, P.name(g, p.c)), h('span', { class: 'tag' }, p.devCost > 0 ? '出租物业' : '储备用地')));
      row.appendChild(h('div', { class: 'small muted' }, '出售净值 ' + U.fmtMoney(q.sell) + ' · 剩余 ' + U.fmtPct(q.area, 0) + ' · 月净额 ' + U.fmtMoney(q.net * 30.4)));
      row.appendChild(h('button', { class: 'btn sm ghost', onclick: function () { const x = p.c % g.city.W + 0.5, y = Math.floor(p.c / g.city.W) + 0.5; ui.locatePoint(x, y, P.name(g, p.c), 0.5, 3); ui.select({ kind: 'zone', id: g.city.zoneOf(p.c), cell: p.c }); } }, '定位与经营'));
      el.appendChild(row);
    }
    return el;
  };
})(window.CM);
