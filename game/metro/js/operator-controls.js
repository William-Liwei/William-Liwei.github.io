'use strict';
// Company information and player-facing permissions. Passenger/network data remain
// shared, while every editable asset and every wallet has one explicit owner.
(function (CM) {
  const X = CM.OperatorControls = {}, U = CM.U, M = CM.Metro, F = CM.Fleet, h = U.h, UI = CM.UI;
  const owner = function (x) { return x && x.ownerId || 'player'; };
  const netOf = function (g) { return g.draft ? g.draft.net : g.net; };
  const mine = function (x) { return owner(x) === 'player'; };
  const enabled = function (g) { return !!(CM.Operators && CM.Operators.enabled(g)); };
  const defOf = function (g, id) { return CM.Operators.DEFINITIONS.find(function (d) { return d.id === (id === 'player' ? g.playerCity || 'sh' : id); }); };
  const nameOf = function (g, id) { const d = defOf(g, id); return d ? d.name : '区域轨道公司'; };
  const when = function (ym) { return Math.floor(ym / 12) + '年' + (ym % 12 + 1) + '月'; };
  const action = function (label, fn, cls) { return h('button', { class: 'btn sm ' + (cls || ''), onclick: fn }, label); };
  const companyLink = function (ui, id) { return action('查看公司', function () { ui.openPage('operators', id); }, 'ghost'); };
  const locked = function (ui, g, id) { return h('div', { class: 'callout info' }, h('b', null, nameOf(g, id)), h('p', null, '资产由该公司独立经营。可查看客流、列车和合作进度。'), companyLink(ui, id)); };
  const refuse = function (ui) { const error = '这是其他公司的资产，只能查看运营情况'; if (ui && ui.toast) ui.toast(error, 'info'); return { error: error }; };

  const operating = function (g) {
    const build = function () {
      const C = g.compiled, daily = g.model.stDaily, fresh = !!(daily && !g.model.dailyStale && g.model.net && g.model.net.C === C), rows = new Map();
      const row = function (id) {
        if (!rows.has(id)) rows.set(id, { lines: [], stations: [], trains: [], km: 0, riders: 0, available: 0, needed: 0, fresh: fresh });
        return rows.get(id);
      };
      for (const d of CM.Operators.DEFINITIONS) row(d.id === (g.playerCity || 'sh') ? 'player' : d.id);
      for (const l of Object.values(g.net.lines)) {
        const r = row(owner(l)); r.lines.push(l);
        const info = CM.OpsData && g.fleet ? CM.OpsData.lineInfo(g, l.id) : F.lineInfo(g, l.id) || [];
        for (const s of info) { r.available += s.avail; r.needed += Math.max(s.floor || 0, s.peakNeed || 0); }
      }
      for (const s of Object.values(g.net.stations)) row(owner(s)).stations.push(s);
      for (const t of g.fleet && g.fleet.trains || []) row(owner(t)).trains.push(t);
      if (C) C.segs.forEach(function (cs) { row(owner(g.net.lines[cs.seg.line])).km += cs.g.lenM / 1000; });
      if (fresh) C.routes.forEach(function (r, i) { row(owner(r.line)).riders += daily.routeBoard && daily.routeBoard[i] || 0; });
      return rows;
    };
    return CM.OpsData ? CM.OpsData.memo(g, 'company-operating', build) : build();
  };
  const snapshot = function (g, id, metrics) {
    const d = defOf(g, id), c = id === 'player' ? null : CM.Operators.company(g, id);
    const r = metrics.get(id) || { lines: [], stations: [], trains: [], km: 0, riders: 0, available: 0, needed: 0, fresh: false };
    const lines = r.lines, stations = r.stations, trains = r.trains, km = r.km, riders = r.riders, available = r.available, needed = r.needed, fresh = r.fresh;
    // Only published operating data is cached. Cash, debt, company state and the
    // latest ledger entry are read live, including changes within the same day.
    const history = id === 'player' ? g.econ.ledger || [] : c && c.history || [];
    const last = history.length ? history[history.length - 1] : null;
    const annualProfit = last ? ((last.fare || 0) - (last.ops || 0)) * 12 : 0;
    const debt = id === 'player' ? g.econ.debtTotal() : 0, service = needed ? Math.min(1, available / needed) : 0;
    // Game index, not a security, share price or estimate of a real-world company.
    const score = Math.max(0, 100 + annualProfit / 10000 * 5 + riders / 10000 * 2 + service * 20 - debt / 10000 * 3);
    return { id: id, def: d, company: c, name: d ? d.name : id, active: id === 'player' || !!c, lines: lines, stations: stations, trains: trains, km: km, riders: riders, fresh: !!fresh,
      sat: id === 'player' ? g.econ.sat : c && Number.isFinite(c.sat) ? c.sat : null, annualProfit: annualProfit, monthProfit: annualProfit / 12, last: last, debt: debt, service: service, available: available, needed: needed, score: score,
      funds: id === 'player' ? g.econ.funds : c ? c.funds : 0, fare: last && last.fare || 0, ops: last && last.ops || 0 };
  };
  X.snapshot = function (g, id) { return snapshot(g, id, operating(g)); };
  X.rows = function (g) {
    const selected = g.playerCity || 'sh', metrics = operating(g);
    return CM.Operators.DEFINITIONS.map(function (d) { return snapshot(g, d.id === selected ? 'player' : d.id, metrics); });
  };
  X.recordMonth = function (g) {
    if (!enabled(g) || !g.operators || !g.model || g.model.dailyStale || !g.model.stDaily || !g.model.net || g.model.net.C !== g.compiled || !g.model.trafficReady()) return false;
    const history = g.operators.indexHistory || (g.operators.indexHistory = []), ym = g.ym();
    if (history.some(function (r) { return r.ym === ym; })) return false;
    const values = X.rows(g).filter(function (r) { return r.active && r.fresh; }).map(function (r) { return { ownerId: r.id, score: r.score, annualProfit: r.annualProfit, riders: r.riders, service: r.service, debt: r.debt }; });
    if (!values.length) return false;
    history.push({ ym: ym, values: values }); if (history.length > 120) history.splice(0, history.length - 120);
    if (g.touch) g.touch(); return true;
  };
  X.trend = function (g, id) {
    const box = h('section', { class: 'op-trend' }, h('div', { class: 'fl-h' }, '模拟估值 / 经营指数趋势'));
    const points = (g.operators && g.operators.indexHistory || []).map(function (r) { const v = r.values.find(function (x) { return x.ownerId === id; }); return v ? { ym: r.ym, score: v.score } : null; }).filter(Boolean);
    if (!points.length) { box.appendChild(h('p', { class: 'note' }, '尚无月度观测。启用后，每月第一个完整客流结果会记录一次指数；不补造此前的公司历史。')); return box; }
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 360 150'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', nameOf(g, id) + '经营指数，从' + when(points[0].ym) + '的' + U.fmtNum(points[0].score, 1) + '到' + when(points[points.length - 1].ym) + '的' + U.fmtNum(points[points.length - 1].score, 1));
    const values = points.map(function (p) { return p.score; }), low = Math.max(0, Math.min.apply(null, values) - 5), high = Math.max(low + 10, Math.max.apply(null, values) + 5), first = points[0].ym, last = points[points.length - 1].ym;
    const px = function (p) { return 40 + (last === first ? 0.5 : (p.ym - first) / (last - first)) * 306; }, py = function (p) { return 118 - (p.score - low) / (high - low) * 98; };
    const add = function (tag, attrs, text) { const e = document.createElementNS(ns, tag); for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k])); if (text != null) e.textContent = text; svg.appendChild(e); return e; };
    add('path', { d: 'M40 20V118H346', fill: 'none', stroke: 'currentColor', opacity: '.3' });
    add('text', { x: 34, y: 25, 'text-anchor': 'end', 'font-size': 10, fill: 'currentColor' }, U.fmtNum(high, 0));
    add('text', { x: 34, y: 118, 'text-anchor': 'end', 'font-size': 10, fill: 'currentColor' }, U.fmtNum(low, 0));
    const color = defOf(g, id).color;
    add('polyline', { points: points.map(function (p) { return px(p).toFixed(2) + ',' + py(p).toFixed(2); }).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const end = points[points.length - 1]; add('circle', { cx: px(end), cy: py(end), r: 3.5, fill: color });
    add('text', { x: 40, y: 141, 'font-size': 10, fill: 'currentColor' }, when(first));
    add('text', { x: 346, y: 141, 'text-anchor': 'end', 'font-size': 10, fill: 'currentColor' }, when(last));
    box.append(svg, h('p', { class: 'note' }, '本公司真实月度观测 · 最新 ' + U.fmtNum(end.score, 1) + ' · 保留最近 120 次。该指数是游戏内经营比较值，不是股票价格。'));
    return box;
  };

  function fleetReadOnly(ui, g, lid) {
    const box = h('div'), rows = CM.OpsData ? CM.OpsData.lineInfo(g, lid) : F.lineInfo(g, lid) || [], trains = F.trainsOf(g, lid);
    box.appendChild(locked(ui, g, owner(g.net.lines[lid])));
    const table = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '交路'), h('th', null, '可用列车'), h('th', null, '高峰需要')));
    for (const r of rows) table.appendChild(h('tr', null, h('td', null, r.name), h('td', null, r.avail + ' 列'), h('td', null, r.peakNeed + ' 列')));
    box.appendChild(h('div', { class: 'tbl-wrap' }, table));
    const list = h('details', null, h('summary', null, '配属列车 · ' + trains.length + ' 列'));
    for (const t of trains) list.appendChild(h('div', { class: 'op-train' }, h('span', { class: 'fo-pic', html: F.sideSVG(F.model(t.model), g.net.lines[lid].color, 76) }), h('div', null, h('b', null, t.id + ' · ' + F.shortOf(F.model(t.model))), h('small', null, t.cars + ' 节 · 车龄 ' + U.fmtNum(F.age(g, t), 1) + ' 年 · ' + nameOf(g, owner(t))))));
    box.appendChild(list); return box;
  }
  const lineOps = UI.prototype.lineOpsTab;
  UI.prototype.lineOpsTab = function (el, lid) { const g = this.g(); if (g && g.net.lines[lid] && !mine(g.net.lines[lid])) { el.appendChild(fleetReadOnly(this, g, lid)); return; } return lineOps.apply(this, arguments); };

  const stationPage = UI.prototype.page_station;
  UI.prototype.page_station = function (id) {
    const g = this.g(), s = netOf(g).stations[id]; if (!s || mine(s)) return stationPage.apply(this, arguments);
    const self = this, el = h('div'), C = g.compiled, k = C.sIndex.get(id), sd = g.model.stDaily, fresh = sd && !g.model.dailyStale;
    el.append(locked(this, g, owner(s)), this.kv([['车站规模', CM.CFG.metro.sizeName[s.size]], ['建设形式', CM.CFG.metro.typeName[s.type]], ['日进站', fresh && k != null ? U.fmtPeople(sd.inn[k]) + ' 人次' : '等待客流更新'], ['日换乘', fresh && k != null ? U.fmtPeople(sd.xfer[k]) + ' 人次' : '等待客流更新']]));
    for (const lid of M.stationLines(g.net, id)) { const l = g.net.lines[lid]; el.appendChild(action(l.name + ' · ' + nameOf(g, owner(l)), function () { self.openPage('line', lid); }, 'ghost')); }
    const c = CM.Operators.company(g, owner(s)), agreed = c && CM.Operators.agreed(g, owner(s), id);
    el.appendChild(h('div', { class: 'op-cooperate' }, h('b', null, '换乘接入'), h('p', { class: 'note' }, agreed ? '已签订本站接入协议。可把本公司线路接到现有站台；车站产权和原公司线路保持独立。' : '2018 年起可签订接入协议。跨区轨道仍需满足本公司的地区建设权限。'), action(agreed ? '接入协议已签订' : '签订本站接入协议', function () { if (agreed) return; const r = CM.Operators.agree(g, owner(s), id); self.toast(r.error || '接入协议已生效', r.error ? 'warn' : 'good'); if (r.ok) { self.markUnsaved(); self.scheduleAutosave(); self.rerenderPage(); } }, 'ghost')));
    el.appendChild(action('定位车站', function () { self.flyTo(s.x, s.y, 30); }));
    return { title: s.name + ' 站', el: el };
  };
  const linePage = UI.prototype.page_line;
  UI.prototype.page_line = function (key) {
    const g = this.g(), lid = String(key).split('|')[0], l = netOf(g).lines[lid]; if (!l || mine(l)) return linePage.apply(this, arguments);
    const self = this, el = h('div'), tp = M.lineTopo(g.net, lid);
    el.appendChild(fleetReadOnly(this, g, lid));
    el.appendChild(this.kv([['线路形态', M.TOPO_NAME[tp.topo]], ['运行速度', M.lineKmh(l) + ' km/h'], ['车站', tp.stations.length + ' 座']]));
    const stops = h('div', { class: 'op-stops' });
    for (const sid of tp.stations) { const s = g.net.stations[sid]; stops.appendChild(action(s.name, function () { self.openPage('station', sid); self.flyTo(s.x, s.y); }, 'ghost')); }
    el.appendChild(stops); return { title: l.name, el: el, highlightLine: lid };
  };

  // Direct modal entry points are guarded too, including those reached from the
  // management app, a shortcut or an already-open menu.
  for (const method of ['showTrainShop', 'showTrainTransfer', 'showServiceEditor', 'showLineStopEditor']) {
    const original = UI.prototype[method]; if (!original) continue;
    UI.prototype[method] = function (lid) { const g = this.g(); if (lid && g && netOf(g).lines[lid] && !mine(netOf(g).lines[lid])) return refuse(this); return original.apply(this, arguments); };
  }
  const stopBlock = UI.prototype.lineStopBlock;
  if (stopBlock) UI.prototype.lineStopBlock = function (lid) { const g = this.g(); return g.net.lines[lid] && !mine(g.net.lines[lid]) ? h('div', { class: 'note' }, '停靠方案由线路所属公司管理。') : stopBlock.apply(this, arguments); };
  if (CM.LineEdit) { const setStops = CM.LineEdit.setStops; CM.LineEdit.setStops = function (g, lid) { return g.net.lines[lid] && !mine(g.net.lines[lid]) ? { error: '不能修改其他公司的停靠方案' } : setStops.apply(this, arguments); }; }
  if (CM.Tools && CM.Tools.prototype.startRouteDrag) { const drag = CM.Tools.prototype.startRouteDrag; CM.Tools.prototype.startRouteDrag = function (e) { const id = this.R.pickSegment(e.clientX, e.clientY), n = this.net(), s = id && n.segments[id]; if (s && M.ownerId(s, n) !== 'player') return; return drag.apply(this, arguments); }; }
  if (CM.Tools && CM.Tools.prototype.endLines) { const ends = CM.Tools.prototype.endLines; CM.Tools.prototype.endLines = function () { const net = this.net(); return ends.apply(this, arguments).filter(function (lid) { return mine(net.lines[lid]); }); }; }

  UI.prototype.page_operators = function (selected) {
    const g = this.g(), self = this, el = h('div', { class: 'operators-page' });
    if (!enabled(g)) return { title: '城市轨道公司', el: h('div', { class: 'note' }, '城市公司协作在长三角地图中开放。') };
    const all = X.rows(g), row = all.find(function (r) { return r.id === selected; });
    const go = function (id) { self.openPage('operators', id, { replaceTop: true }); };
    if (!row) {
      el.appendChild(h('p', { class: 'note' }, '上海、苏州、无锡、常州、南通、嘉兴、湖州各有一家轨道公司。每家公司独立筹资、购车和经营；地图边缘的其他辖区只展示当前覆盖范围。'));
      const ranking = all.slice().sort(function (a, b) { return Number(b.active) - Number(a.active) || b.score - a.score; });
      const table = h('table', { class: 'tbl op-ranking' }, h('tr', null, h('th', null, '公司'), h('th', null, '模拟估值指数'), h('th', null, '日上车人次'), h('th', null, '主城满意度'), h('th', null, '线网')));
      ranking.forEach(function (r, i) { table.appendChild(h('tr', null, h('td', null, action((r.active ? i + 1 + '. ' : '') + r.name + (r.id === 'player' ? '（你）' : ''), function () { go(r.id); }, 'ghost')), h('td', null, r.active ? U.fmtNum(r.score, 1) : '筹备前'), h('td', null, r.fresh ? U.fmtPeople(r.riders) : '更新中'), h('td', null, r.sat == null ? '更新中' : Math.round(r.sat) + ' / 100'), h('td', null, U.fmtNum(r.km, 1) + ' km'))); });
      el.appendChild(h('div', { class: 'tbl-wrap' }, table));
      el.appendChild(h('p', { class: 'note' }, '各公司满意度只统计本公司主城；NPC 满意度仅供参考，不影响资金、建设或存续。'));
      const trendPicker = h('select', { 'aria-label': '选择公司查看经营指数趋势' }, all.map(function (r) { return h('option', { value: r.id }, r.name + (r.id === 'player' ? '（你）' : '')); })), trendHost = h('div');
      trendPicker.value = 'player'; const showTrend = function () { trendHost.replaceChildren(X.trend(g, trendPicker.value)); }; trendPicker.addEventListener('change', showTrend); showTrend(); el.append(trendPicker, trendHost);
      el.appendChild(h('div', { class: 'op-score-note note' }, '经营指数只用于本局比较，不提供股票交易。指数 = max(0, 100 + 年化运营结余〔亿元〕×5 + 日上车人次〔万人〕×2 + 运力充足率×20 − 债务〔亿元〕×3)。运营结余按最近完整月票款减运营费，再乘 12；换乘上车可重复计数，运力充足率最高为 100%。没有完整月账时结余按 0。'));
      const log = g.operators && g.operators.log || [];
      if (log.length) { const events = h('details', null, h('summary', null, '区域公司动态')); for (const x of log.slice(-12).reverse()) events.appendChild(h('p', { class: 'note' }, h('b', null, when(x.ym) + ' · ' + x.title), h('br'), x.desc)); el.appendChild(events); }
      return { title: '城市轨道公司', el: el };
    }
    const c = row.company, d = row.def;
    const activeProject = c && c.projects.find(function (p) { return p.phase !== 'open'; });
    const projectStatus = activeProject && CM.Operators.projectStatus && CM.Operators.projectStatus(g, c, activeProject);
    const companyStatus = projectStatus && (projectStatus.overdue || activeProject.phase === 'building' && activeProject.due === g.ym()) ? projectStatus.label : c && c.note;
    el.append(action('← 全部公司与排行', function () { go(null); }, 'ghost'), h('div', { class: 'op-company-head' }, h('span', { class: 'swatch', style: { background: d.color } }), h('b', null, row.name), h('span', { class: 'tag' }, row.id === 'player' ? '你的公司' : c ? companyStatus : d.year + ' 年起筹备')));
    el.appendChild(this.kv([['所属城市', d.city], ['主城满意度', row.sat == null ? '更新中' : Math.round(row.sat) + ' / 100'], ['线网 / 自有车站 / 列车', U.fmtNum(row.km, 1) + ' km / ' + row.stations.length + ' 站 / ' + row.trains.length + ' 列'], ['公司资金', U.fmtMoney(row.funds)], ['公司债务', U.fmtMoney(row.debt)], ['上月票款 / 运营费', row.last ? U.fmtMoney(row.fare) + ' / ' + U.fmtMoney(row.ops) : '尚无完整月账'], ['上月运营结余', row.last ? U.fmtMoney(row.monthProfit) : '尚无完整月账'], ['日上车人次', row.fresh ? U.fmtPeople(row.riders) : '等待客流更新'], ['高峰运力充足率', U.fmtPct(row.service, 0) + '（可用 ' + row.available + ' / 需要 ' + row.needed + ' 列）'], ['经营指数', U.fmtNum(row.score, 1) + ' · 游戏比较指标']]));
    el.appendChild(h('p', { class: 'note' }, '筹建年份、资本强度与工程进度为游戏规则；不代表现实公司的财务或历史线路。城市经济阶段不同，资金与当地需求决定实际开工。'));
    el.appendChild(X.trend(g, row.id));
    if (row.id === 'player') { el.append(action('本公司车队与运营托管', function () { self.openPage('fleet'); }), action('本公司财务', function () { self.openPage('finance'); })); }
    if (row.lines.length) { el.appendChild(h('div', { class: 'fl-h' }, '运营线路')); for (const l of row.lines) el.appendChild(action(l.name, function () { self.openPage('line', l.id); }, 'ghost')); }
    if (c) {
      el.appendChild(h('div', { class: 'fl-h' }, '工程进度'));
      if (!c.projects.length) el.appendChild(h('p', { class: 'note' }, c.note));
      for (const p of c.projects) {
        const status = CM.Operators.projectStatus ? CM.Operators.projectStatus(g, c, p) : null;
        const phase = status ? status.label : { funding: '筹资', building: '施工', open: '运营' }[p.phase] || p.phase;
        const late = p.phase === 'building' && g.ym() > p.due;
        const timing = p.phase === 'building' ? (late ? ' · 原预计 ' + when(p.due) + ' 开通，已延期 ' + (g.ym() - p.due) + ' 个月' : ' · 预计 ' + when(p.due) + ' 开通') : ' · 资金齐备后开工';
        const card = h('div', { class: 'op-project' }, h('b', null, (p.kind === 'cross' ? '跨城联络线' : '本城城区线') + ' · ' + phase), h('small', null, p.phase === 'open' ? when(p.opened) + ' 开通 · 建设与购车实际支出 ' + U.fmtMoney(p.construction + p.fleet) : '概算 ' + U.fmtMoney(p.estimate) + timing));
        if (status && status.text && p.phase !== 'open') card.appendChild(h('p', { class: 'note' + (late ? ' warn' : '') }, status.text));
        el.appendChild(card);
      }
      const ownStations = Object.values(g.net.stations).filter(function (s) { return mine(s) && g.compiled.serviced[g.compiled.sIndex.get(s.id)]; });
      const target = h('select', { 'aria-label': '合作接驳的本公司车站' }, ownStations.map(function (s) { return h('option', { value: s.id }, s.name); }));
      const invite = action(c.crossPermit ? '更新接驳目标' : '授权进入本城并申请接驳', function () { const r = CM.Operators.requestConnection(g, row.id, target.value); self.toast(r.error || '接驳申请已提交，工程由该公司独立出资', r.error ? 'warn' : 'good'); if (r.ok) { self.markUnsaved(); self.scheduleAutosave(); self.rerenderPage(); } });
      invite.disabled = g.clock.y < 2025 || !ownStations.length || !d.neighbors.includes(g.playerCity || 'sh') || c.projects.some(function (p) { return p.kind === 'cross'; });
      el.appendChild(h('section', { class: 'op-cooperate' }, h('b', null, '跨城合作'), h('p', { class: 'note' }, '2025 年起可邀请相邻公司接入你的运营站。点击授权后，该公司才可进入本城，按自己的资金和工程安排建设；你的车站、线路与列车继续归你。' + (c.crossPermit ? ' 已给予该公司本城接入许可。' : ' 尚未给予本城接入许可。')), target, invite));
      const history = h('details', null, h('summary', null, '公司独立月账 · 最近 ' + c.history.length + ' 月'));
      if (!c.history.length) history.appendChild(h('p', { class: 'note' }, '第一个完整结算月后展示。'));
      for (const x of c.history.slice().reverse()) history.appendChild(h('p', { class: 'note' }, h('b', null, when(x.ym)), h('br'), '注资 ' + U.fmtMoney(x.grant) + ' · 票款 ' + U.fmtMoney(x.fare) + ' · 运营费 ' + U.fmtMoney(x.ops) + ' · 建设与购车 ' + U.fmtMoney(x.construction + x.fleet)));
      el.appendChild(history);
    }
    return { title: row.name, el: el };
  };

  const chrome = UI.prototype.buildChrome;
  UI.prototype.buildChrome = function () {
    chrome.apply(this, arguments); const self = this;
    this.operatorDock = h('button', { class: 'dockbtn plain hidden', 'data-tip': '城市轨道公司：经营、工程与跨城合作', 'aria-label': '城市轨道公司', onclick: function () { self.openPage('operators', null, { root: true }); } }, CM.icon('building'), h('span', { class: 'lb' }, '公司'));
    this.dock.insertBefore(this.operatorDock, this.zoomCtl);
  };
  const attach = UI.prototype.attachGame;
  UI.prototype.attachGame = function (g) {
    const result = attach.apply(this, arguments), self = this; let refresh = 0;
    if (this.operatorDock) this.operatorDock.classList.toggle('hidden', !enabled(g));
    g.on('operators', function () {
      const top = self.stack[self.stack.length - 1]; if (refresh || !top || top.kind !== 'operators') return;
      // A monthly decision can publish several company log/fleet/project changes.
      // Draw their final state once, and ignore pending work after a game switch.
      refresh = requestAnimationFrame(function () {
        refresh = 0; const current = self.stack[self.stack.length - 1];
        if (self.g() === g && current && current.kind === 'operators') self.rerenderPage();
      });
    });
    return result;
  };
  const fleetPage = UI.prototype.page_fleet;
  UI.prototype.page_fleet = function () { const p = fleetPage.apply(this, arguments), self = this; if (p && enabled(this.g())) p.el.prepend(h('div', { class: 'callout info' }, '这里管理本公司的列车。其他公司独立购买和调度自己的车队。', action('区域公司与车队', function () { self.openPage('operators'); }, 'ghost'))); return p; };
  const financePage = UI.prototype.page_finance;
  UI.prototype.page_finance = function () { const p = financePage.apply(this, arguments); if (p && enabled(this.g())) p.el.prepend(h('div', { class: 'callout info' }, h('b', null, '区域联运票价'), h('p', null, '调整票价会应用于整个区域联运网络。换乘不重复收取起步价，票款按各公司实际承运里程分账；本页账目为本公司收支。'))); return p; };
})(window.CM);
