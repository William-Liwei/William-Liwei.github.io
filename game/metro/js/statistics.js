'use strict';
// 票务统计：真实路径分段、有限月度快照和调价前后观测。历史不反推，不运行额外交通求解。
(function (CM) {
  const U = CM.U, h = U.h, BANDS = ['≤ 5 km', '5–10 km', '10–20 km', '20–30 km', '> 30 km'];
  const MAX_MONTHS = 120, MAX_EVENTS = 20, BASIS = { avg: '周平均', wd: '工作日', we: '周末' };
  let basis = 'avg', span = 36, metric = 'trips', selected = null;
  const num = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const copyFare = f => ({ mode: f.mode === 'dist' ? 'dist' : 'flat', flat: f.flat, km0: f.km0 || 0, step: f.step || 1, inc: f.inc || 0, cap: f.cap || 0 });
  const fareKey = f => CM.Model.fareKey(f);
  const date = a => a[0] + '年' + a[1] + '月' + a[2] + '日';
  const modelDate = year => Math.floor(year) + '年' + (Math.floor((year - Math.floor(year)) * 12 + 1e-6) + 1) + '月';
  const when = g => [g.clock.y, g.clock.m, g.clock.d];
  const ym = a => a[0] * 12 + a[1] - 1;
  const total = a => a.reduce((s, v) => s + v, 0);
  const money = v => U.fmtMoney(v / 10000);
  const people = v => U.fmtPeople(v) + ' 人次';
  const fareMoney = v => CM.UI && CM.UI.fmtFare ? CM.UI.fmtFare(v) : U.cur(v).toFixed(2) + ' ' + CM.CFG.money.unit;
  const esc = s => U.esc(String(s));
  function equalTotal(a, b) { return Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 1e-7); }
  function validFare(f) { return f && ['flat', 'dist'].includes(f.mode) && ['flat', 'km0', 'step', 'inc', 'cap'].every(k => num(f[k])); }
  function bins(d) {
    if (!d || !d.ready) return null;
    const trips = [], revenue = [];
    for (let i = 0; i < 5; i++) {
      if (!num(d['distTrips' + i]) || !num(d['distFare' + i])) return null;
      trips.push(d['distTrips' + i]); revenue.push(d['distFare' + i]);
    }
    if (!equalTotal(total(trips), d.metro) || !equalTotal(total(revenue), d.fare)) return null;
    return { trips, revenue, riders: d.metro, fare: d.fare, pkm: d.metroPkm || 0 };
  }
  function ready(g) {
    const m = g && g.model;
    return !!(m && m.net && m.net.C === g.compiled && !m.dailyStale && !m.refreshing && m.trafficReady && m.trafficReady() && fareKey(m.fare) === fareKey(g.econ.fare));
  }
  function snapshot(g) {
    if (!ready(g)) return null;
    const m = g.model, days = { avg: bins(m.daily), wd: bins(m.dailyWk), we: bins(m.dailyWe) };
    if (Object.values(days).some(v => !v)) return null;
    const hourly = {};
    for (const dt of ['wd', 'we']) {
      const R = m.resultsFor(dt);
      hourly[dt] = R.per.map(P => P.stats.metro || 0);
    }
    return { at: when(g), year: m.year, net: g.netVersion, city: g.city.version || 0, road: g.city.roadVersion || 0, fleet: g.fleet ? g.fleet.ver || 0 : 0,
      fareRule: copyFare(g.econ.fare), days, hourly, verified: !!(m.trafficVerified && m.trafficVerified('avg')) };
  }
  function validDay(d) {
    return d && ['trips', 'revenue'].every(k => Array.isArray(d[k]) && d[k].length === 5 && d[k].every(num)) &&
      ['riders', 'fare', 'pkm'].every(k => num(d[k])) && equalTotal(total(d.trips), d.riders) && equalTotal(total(d.revenue), d.fare);
  }
  function validDate(a) { return Array.isArray(a) && a.length === 3 && Number.isInteger(a[0]) && a[0] > 0 && Number.isInteger(a[1]) && a[1] >= 1 && a[1] <= 12 && Number.isInteger(a[2]) && a[2] >= 1 && a[2] <= 31; }
  function cleanSnapshot(s) {
    if (!s || !validDate(s.at) || !num(s.year) || !validFare(s.fareRule) || !s.days || !Object.keys(BASIS).every(k => validDay(s.days[k]))) return null;
    const out = { at: s.at.slice(), year: s.year, fareRule: copyFare(s.fareRule), days: {}, hourly: {}, verified: s.verified === true };
    for (const k of ['net', 'city', 'road', 'fleet']) out[k] = num(s[k]) ? s[k] : 0;
    for (const k of Object.keys(BASIS)) {
      const d = s.days[k]; out.days[k] = { trips: d.trips.slice(), revenue: d.revenue.slice(), riders: d.riders, fare: d.fare, pkm: d.pkm };
    }
    for (const dt of ['wd', 'we']) out.hourly[dt] = s.hourly && Array.isArray(s.hourly[dt]) && s.hourly[dt].length === 4 && s.hourly[dt].every(num) ? s.hourly[dt].slice() : null;
    return out;
  }
  function ensure(g) {
    if (!g.statistics || g.statistics.v !== 1) g.statistics = { v: 1, months: [], events: [] };
    const s = g.statistics;
    if (!s._fare) s._fare = copyFare(g.econ.fare);
    return s;
  }
  function baseline(g) { return { fare: copyFare(g.econ.fare), sample: snapshot(g) }; }
  function beforeFareChange(g, f, source, old) {
    if (!g || !g.econ || !f) return;
    const s = ensure(g), prev = old || baseline(g), next = copyFare(f);
    if (fareKey(prev.fare) === fareKey(next)) return;
    for (const e of s.events) if (e.status === 'waiting') e.status = 'superseded';
    const last = s.events[s.events.length - 1];
    s.events.push({ id: last ? last.id + 1 : 1, at: when(g), source: source === 'manual' ? 'manual' : 'auto', from: copyFare(prev.fare), to: next, before: prev.sample, after: null, status: 'waiting' });
    s.events = s.events.slice(-MAX_EVENTS); s._fare = next; s._stamp = null;
  }
  function observe(g) {
    if (!g || !g.econ || !g.model) return;
    const s = ensure(g), m = g.model, key = fareKey(g.econ.fare);
    if (fareKey(s._fare) !== key) beforeFareChange(g, g.econ.fare, 'auto', { fare: s._fare, sample: s._latest && fareKey(s._latest.fareRule) === fareKey(s._fare) ? s._latest : null });
    // 每帧只看版本与是否完成；分段数据仅在发布新结果或跨日时读取。
    const stamp = m.version + '|' + key + '|' + g.netVersion + '|' + (g.fleet ? g.fleet.ver : 0) + '|' + g.clock.y + '-' + g.clock.m + '-' + g.clock.d;
    if (s._stamp === stamp || !ready(g)) return;
    const sample = snapshot(g); if (!sample) return;
    s._stamp = stamp; s._latest = sample;
    let changed = false;
    for (const e of s.events) if (e.status === 'waiting' && fareKey(e.to) === key) { e.after = sample; e.status = 'recorded'; changed = true; }
    if (changed && g.touch) g.touch();
  }
  function recordMonth(g) {
    const s = ensure(g); observe(g);
    const sample = snapshot(g), rec = { at: when(g), sample };
    const k = s.months.findIndex(r => ym(r.at) === ym(rec.at));
    if (k >= 0) s.months[k] = rec; else s.months.push(rec);
    s.months = s.months.slice(-MAX_MONTHS);
  }
  function restore(g, data) {
    const s = { v: 1, months: [], events: [] };
    if (data && data.v === 1) {
      const seen = new Set();
      for (const r of (Array.isArray(data.months) ? data.months : []).slice(-MAX_MONTHS)) {
        if (!r || !validDate(r.at) || seen.has(ym(r.at))) continue;
        seen.add(ym(r.at)); s.months.push({ at: r.at.slice(), sample: cleanSnapshot(r.sample) });
      }
      s.months.sort((a, b) => ym(a.at) - ym(b.at));
      for (const e of (Array.isArray(data.events) ? data.events : []).slice(-MAX_EVENTS)) {
        if (!e || !Number.isSafeInteger(e.id) || e.id < 1 || !validDate(e.at) || !validFare(e.from) || !validFare(e.to)) continue;
        const after = cleanSnapshot(e.after);
        s.events.push({ id: e.id, at: e.at.slice(), source: e.source === 'manual' ? 'manual' : 'auto', from: copyFare(e.from), to: copyFare(e.to), before: cleanSnapshot(e.before), after,
          status: after ? 'recorded' : e.status === 'superseded' ? 'superseded' : 'waiting' });
      }
    }
    g.statistics = s; s._fare = copyFare(g.econ.fare);
    const recent = s.months.slice().reverse().find(r => r.sample); s._latest = recent ? recent.sample : null;
    return s;
  }
  function serialize(g) {
    const s = ensure(g);
    return { v: 1, months: s.months.slice(-MAX_MONTHS), events: s.events.slice(-MAX_EVENTS) };
  }

  function card(title, sub, wide) {
    return h('section', { class: 'chart-card ticket-card' + (wide ? ' wide' : '') }, h('div', { class: 'ch-head' }, h('h3', { class: 'ch-title' }, title)), h('p', { class: 'ch-sub' }, sub));
  }
  function empty(el, text) { el.appendChild(h('div', { class: 'empty-chart' }, text)); return el; }
  function svg(markup, label, width, height) {
    return h('div', { class: 'ticket-svg', html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(label) + '"><title>' + esc(label) + '</title>' + markup + '</svg>' });
  }
  function detailTable(head, rows, caption) {
    return h('details', { class: 'ticket-data' }, h('summary', null, caption || '查看数据表'), h('div', { class: 'ticket-table-wrap', tabindex: '0', role: 'region', 'aria-label': caption || '图表数据' },
      h('table', null, h('thead', null, h('tr', null, head.map(x => h('th', { scope: 'col' }, x)))), h('tbody', null, rows.map(r => h('tr', null, r.map((x, i) => h(i ? 'td' : 'th', i ? null : { scope: 'row' }, x))))))));
  }
  function control(items, value, change, label) {
    return h('div', { class: 'seg-ctl ticket-control', role: 'group', 'aria-label': label }, items.map(it => h('button', { class: it[0] === value ? 'on' : '', 'aria-pressed': it[0] === value ? 'true' : 'false', onclick: () => change(it[0]) }, it[1])));
  }
  function kpi(label, value, note) { return h('div', { class: 'kpi' }, h('div', { class: 'top' }, label), h('div', { class: 'val' }, value), h('div', { class: 'tiny muted' }, note)); }
  function bars(title, sub, labels, values, colors, fmt) {
    const el = card(title, sub), max = Math.max(1, ...values);
    const box = h('div', { class: 'ticket-bars' });
    values.forEach((v, i) => box.appendChild(h('div', { class: 'ticket-bar' }, h('div', { class: 'ticket-bar-heading' }, h('span', null, labels[i]), h('b', null, fmt(v))),
      h('div', { class: 'ticket-track', 'aria-hidden': 'true' }, h('div', { style: { width: v / max * 100 + '%', background: colors[i % colors.length] } })))));
    el.appendChild(box); return el;
  }
  function donut(d, P) {
    const el = card('谁贡献了票款？', '同一乘距区间的票量占比与票款占比，可以看出短途、长途的收入贡献。');
    if (!(d.fare > 0)) return empty(el, d.riders > 0 ? '目前票价为零，已有客流但暂无票款。' : '开通线路并吸引乘客后显示。');
    let out = '<circle cx="90" cy="90" r="64" fill="none" stroke="var(--line)" stroke-width="24"/>', offset = 0;
    d.revenue.forEach((v, i) => { const ratio = v / d.fare; if (ratio > 0) out += '<circle cx="90" cy="90" r="64" fill="none" stroke="' + P[i] + '" stroke-width="24" pathLength="100" stroke-dasharray="' + ratio * 100 + ' ' + (100 - ratio * 100) + '" stroke-dashoffset="' + -offset + '" transform="rotate(-90 90 90)"><title>' + esc(BANDS[i] + '：' + money(v)) + '</title></circle>'; offset += ratio * 100; });
    out += '<text x="90" y="86" text-anchor="middle" fill="var(--muted)" font-size="12">日票款</text><text x="90" y="108" text-anchor="middle" fill="var(--text)" font-size="15" font-weight="700">' + esc(money(d.fare)) + '</text>';
    const legend = h('div', { class: 'ticket-legend' });
    BANDS.forEach((label, i) => legend.appendChild(h('div', null, h('i', { 'aria-hidden': 'true', style: { background: P[i] } }), h('span', null, label), h('b', null, U.fmtPct(d.revenue[i] / d.fare, 1)), h('small', { class: 'muted' }, '票量 ' + U.fmtPct(d.riders > 0 ? d.trips[i] / d.riders : 0, 1)))));
    el.appendChild(h('div', { class: 'ticket-donut' }, svg(out, '各乘距区间的票款占比，详细数值见旁边图例', 180, 180), legend));
    return el;
  }
  function trend(records, events, key, title, P) {
    const fmt = key === 'fare' ? money : people, el = card(title, '月度快照 · ' + BASIS[basis] + '典型日 · 非月累计；虚线标注调价所在月份。');
    if (!records.some(r => r.sample)) return empty(el, '从启用票务统计后开始记录，不回填旧月份。');
    const W = 520, H = 205, left = 68, right = 12, top = 24, bottom = 34;
    const vals = records.map(r => r.sample ? r.sample.days[basis][key] : null), max = Math.max(1, ...vals.filter(num)) * 1.1;
    const first = ym(records[0].at), last = ym(records[records.length - 1].at), width = W - left - right;
    const x = a => left + (last > first ? (ym(a) - first) / (last - first) : 0.5) * width, y = v => H - bottom - v / max * (H - top - bottom);
    let out = '';
    for (let i = 0; i <= 3; i++) { const v = max * i / 3, yy = y(v); out += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line)"/><text x="' + (left - 7) + '" y="' + (yy + 4) + '" text-anchor="end" fill="var(--muted)" font-size="11">' + esc(key === 'fare' ? money(v) : U.fmtPeople(v)) + '</text>'; }
    const grouped = new Map();
    for (const e of events) if (ym(e.at) >= first && ym(e.at) <= last) { const k = ym(e.at); if (!grouped.has(k)) grouped.set(k, []); grouped.get(k).push(e); }
    let lastLabel = -Infinity;
    for (const evs of grouped.values()) {
      const xx = x(evs[0].at), label = evs.length > 1 ? evs.length + ' 次调价' : '调价';
      out += '<line x1="' + xx + '" x2="' + xx + '" y1="' + top + '" y2="' + (H - bottom) + '" stroke="var(--muted)" stroke-dasharray="3 4"><title>' + esc(date(evs[0].at) + ' · ' + label) + '</title></line>';
      if (xx - lastLabel >= 44) { out += '<text x="' + xx + '" y="14" text-anchor="middle" fill="var(--muted)" font-size="11">' + label + '</text>'; lastLabel = xx; }
    }
    let path = '', pen = false;
    records.forEach((r, i) => { const v = vals[i]; if (v == null) { pen = false; return; } const xx = x(r.at), yy = y(v); path += (pen ? 'L' : 'M') + xx + ' ' + yy; pen = true;
      out += '<circle cx="' + xx + '" cy="' + yy + '" r="3" fill="' + P[0] + '"><title>' + esc(date(r.at) + '：' + fmt(v)) + '</title></circle>'; });
    out += '<path d="' + path + '" fill="none" stroke="' + P[0] + '" stroke-width="2.5"/>';
    const ticks = [...new Set([0, Math.floor((records.length - 1) / 2), records.length - 1])];
    for (const i of ticks) { const r = records[i]; out += '<text x="' + x(r.at) + '" y="' + (H - 10) + '" text-anchor="' + (i === 0 && records.length > 1 ? 'start' : i === records.length - 1 && records.length > 1 ? 'end' : 'middle') + '" fill="var(--muted)" font-size="11">' + r.at[0] + '.' + r.at[1] + '</text>'; }
    el.append(svg(out, title + '，从' + date(records[0].at) + '到' + date(records[records.length - 1].at), W, H), detailTable(['快照日期', BASIS[basis] + '日' + (key === 'fare' ? '票款' : '票量')], records.map((r, i) => [date(r.at), vals[i] == null ? '当时没有完整结果' : fmt(vals[i])])));
    return el;
  }
  function compareValue(label, a, b, fmt) {
    const delta = a > 0 ? (b - a) / a : null, diff = b - a;
    return h('div', { class: 'ticket-comparison' }, h('div', { class: 'muted' }, label), h('div', null, h('span', null, fmt(a)), h('span', { class: 'muted', 'aria-hidden': 'true' }, ' → '), h('b', null, fmt(b))),
      h('small', { class: diff > 0 ? 'ticket-up' : diff < 0 ? 'ticket-down' : 'muted' }, (diff > 0 ? '增加 ' : diff < 0 ? '减少 ' : '持平 ') + (diff ? fmt(Math.abs(diff)) : '') + (delta == null ? '（原值为零，不计算增幅）' : '（' + (delta > 0 ? '+' : '') + (delta * 100).toFixed(1) + '%）')));
  }
  function fareEvents(g, s, refresh, P) {
    const el = card('涨价、降价之后发生了什么？', '同日型的前后实测模拟结果；同时发生的建设、城市增长、运力与时间变化也会影响结果，不代表票价单独造成的变化。', true);
    if (!s.events.length) return empty(el, '还没有调价记录。应用一次新票价后，这里会记录调整前与重新计算后的票量、票款。');
    const e = s.events.find(e => e.id === selected) || s.events[s.events.length - 1]; selected = e.id;
    const picker = h('select', { 'aria-label': '选择调价记录', onchange: ev => { selected = +ev.target.value; refresh(); } }, s.events.slice().reverse().map(x => h('option', { value: x.id, selected: x.id === e.id }, date(x.at) + ' · ' + (x.source === 'manual' ? '手动调价' : '自动调价') + ' #' + x.id)));
    const desc = f => CM.UI.fareText(f, true);
    el.append(h('div', { class: 'ticket-event-tools' }, picker), h('p', { class: 'ticket-fare-rule' }, h('span', { class: 'muted' }, '调整前：'), desc(e.from), h('br'), h('span', { class: 'muted' }, '调整后：'), desc(e.to)));
    if (!e.before) el.appendChild(h('p', { class: 'ticket-status warn' }, '调整前没有与旧票价匹配的完整客流结果，无法计算前后增减。'));
    if (!e.after) el.appendChild(h('p', { class: 'ticket-status' }, e.status === 'superseded' ? '此方案尚未完成重算就再次调价，没有补造调整后数据。' : '等待新票价下的首个完整交通结果。保持游戏运行，计算完成后自动显示。'));
    if (e.before && e.after) {
      const a = e.before.days[basis], b = e.after.days[basis];
      el.appendChild(h('p', { class: 'tiny muted' }, BASIS[basis] + '对比：' + date(e.before.at) + ' → ' + date(e.after.at) + ' · 调价后首次完整重算' + (e.after.verified ? '（已完成收敛校核）' : '（尚未完成收敛校核）')));
      const changes = [];
      if (e.before.net !== e.after.net) changes.push('线网'); if (e.before.fleet !== e.after.fleet) changes.push('车队');
      if (e.before.city !== e.after.city || e.before.road !== e.after.road || e.before.year !== e.after.year) changes.push('城市或交通需求');
      if (changes.length) el.appendChild(h('p', { class: 'ticket-status warn' }, '两次结果之间还改变了：' + changes.join('、') + '。'));
      el.appendChild(h('div', { class: 'ticket-compare-grid' }, compareValue('日票量', a.riders, b.riders, people), compareValue('日票款', a.fare, b.fare, money), compareValue('每次乘车平均票价', a.riders ? a.fare / a.riders : 0, b.riders ? b.fare / b.riders : 0, fareMoney)));
      const max = Math.max(1, ...a.trips, ...b.trips), chart = h('div', { class: 'ticket-change-bars' });
      BANDS.forEach((label, i) => chart.appendChild(h('div', { class: 'ticket-change-row' }, h('b', null, label), h('div', null,
        h('div', { class: 'ticket-pair' }, h('span', null, '前'), h('div', { class: 'ticket-track', 'aria-hidden': 'true' }, h('div', { style: { width: a.trips[i] / max * 100 + '%', background: P[1] } })), h('span', null, people(a.trips[i]))),
        h('div', { class: 'ticket-pair' }, h('span', null, '后'), h('div', { class: 'ticket-track', 'aria-hidden': 'true' }, h('div', { style: { width: b.trips[i] / max * 100 + '%', background: P[0] } })), h('span', null, people(b.trips[i])))))));
      el.append(chart, detailTable(['乘距', '调整前票量', '调整后票量', '调整前票款', '调整后票款'], BANDS.map((label, i) => [label, people(a.trips[i]), people(b.trips[i]), money(a.revenue[i]), money(b.revenue[i])]), '查看调价前后分段数据'));
    }
    return el;
  }
  function render(g, el, options) {
    observe(g);
    const s = ensure(g), current = snapshot(g), sample = current || s._latest, P = options.palette, refresh = options.refresh;
    el.classList.add('ticket-page');
    el.appendChild(h('div', { class: 'ticket-toolbar' }, control(Object.entries(BASIS), basis, v => { basis = v; refresh(); }, '统计日类型'),
      options.ui ? h('button', { class: 'btn sm', onclick: () => { CM.Stats.close(); options.ui.openPage('finance'); } }, CM.icon('ticket', 14), '调整票价') : null));
    const context = sample ? date(sample.at) + ' · ' + BASIS[basis] + ' · 交通需求基准 ' + modelDate(sample.year) : '';
    el.appendChild(h('p', { class: 'ticket-status' + (!current ? ' warn' : '') }, current ? '实际出行分配结果 · ' + context + (current.verified ? ' · 已完成收敛校核' : ' · 本轮结果，后续重算仍可能变化') : sample ? '当前线网或票价仍在重算，以下为上次完整结果：' + context : '暂无完整的乘距统计。线路与票价计算完成后显示；旧存档不反推历史分布。'));
    el.appendChild(h('p', { class: 'tiny muted ticket-definition' }, '票量 = 完整地铁行程的人次；一次行程中的换乘不重复计票。按实际路径乘车里程分段（不含进出站步行），区间左开右闭。数值为本局模拟结果，非独立人数。周平均按 5 个工作日 + 2 个周末加权。'));
    if (sample) {
      const d = sample.days[basis];
      el.appendChild(h('div', { class: 'kpi-grid ticket-kpis' }, kpi('典型日票量', U.fmtPeople(d.riders), '人次 / 日'), kpi('典型日票款', money(d.fare), g.econ.isFree() ? '自由建造下的模拟票款' : '日结算使用同口径票款'), kpi('平均乘距', d.riders ? (d.pkm / d.riders).toFixed(1) + ' km' : '—', '实际地铁乘车距离'), kpi('平均每次票价', d.riders ? fareMoney(d.fare / d.riders) : '—', '总票款 ÷ 完整行程数')));
      const grid = h('div', { class: 'chart-grid ticket-grid' });
      const distribution = bars(metric === 'trips' ? '大家坐了多远？' : '各乘距区间的票款', BASIS[basis] + '典型日 · 从实际选中的路径逐条累计', BANDS, metric === 'trips' ? d.trips : d.revenue, P, metric === 'trips' ? people : money);
      distribution.insertBefore(control([['trips', '票量'], ['revenue', '票款']], metric, v => { metric = v; refresh(); }, '乘距图指标'), distribution.querySelector('.ticket-bars'));
      distribution.appendChild(detailTable(['乘距', '票量 / 日', '票款 / 日', '平均每次票价'], BANDS.map((label, i) => [label, people(d.trips[i]), money(d.revenue[i]), d.trips[i] ? fareMoney(d.revenue[i] / d.trips[i]) : '—'])));
      grid.append(distribution, donut(d, P));
      const hourly = basis === 'avg' ? (sample.hourly.wd && sample.hourly.we ? sample.hourly.wd.map((v, i) => v * CM.CFG.trips.weekWeights.wd + sample.hourly.we[i] * CM.CFG.trips.weekWeights.we) : null) : sample.hourly[basis];
      if (hourly) grid.appendChild(bars('乘客集中在哪些时段？', BASIS[basis] + ' · 模型时段平均每小时人次；夜间日汇总另按营业时长折算', CM.CFG.periods.map(p => p.name), hourly, [P[0]], v => U.fmtPeople(v) + ' 人次/时'));
      const insight = card('读懂这座城市的乘客', '用客流结构观察网络变化');
      if (d.riders > 0) {
        const top = d.trips.indexOf(Math.max(...d.trips)), long = d.trips[3] + d.trips[4], longFare = d.revenue[3] + d.revenue[4];
        insight.append(h('p', { class: 'ticket-insight' }, h('b', null, BANDS[top]), ' 是票量最多的乘距区间，占 ', h('b', null, U.fmtPct(d.trips[top] / d.riders, 1)), '。'),
          h('p', null, '超过 20 km 的长途行程占票量 ', h('b', null, U.fmtPct(long / d.riders, 1)), '，贡献票款 ', h('b', null, d.fare ? U.fmtPct(longFare / d.fare, 1) : '0%'), '。'),
          h('p', { class: 'tiny muted' }, '延线、换乘与票价都会改变乘距结构。可先记下分布，调整后在下方同日型记录中比较。'));
      } else empty(insight, '有乘客后会总结当前的短途、长途结构。');
      grid.appendChild(insight); el.appendChild(grid);
    }
    el.appendChild(h('div', { class: 'ticket-section-heading' }, h('h3', null, '票量与票款的变化'), control([[12, '近 12 月'], [36, '近 36 月'], [120, '近 10 年']], span, v => { span = v; refresh(); }, '月度快照时间范围')));
    const cutoff = ym(when(g)) - span + 1, records = s.months.filter(r => ym(r.at) >= cutoff);
    const trends = h('div', { class: 'chart-grid ticket-grid' });
    trends.append(trend(records, s.events, 'riders', '日票量趋势', P), trend(records, s.events, 'fare', '日票款趋势', P)); el.appendChild(trends);
    el.appendChild(fareEvents(g, s, refresh, P));
    el.appendChild(h('p', { class: 'tiny muted ticket-definition' }, '月度快照最多保留 120 个月，调价最多保留 20 次；只记录启用此功能后的结果。图表中的票款以当前货币单位显示，历史内部记账金额不改写。'));
  }
  CM.Statistics = { bins, snapshot, ready, observe, fareBaseline: baseline, beforeFareChange, recordMonth, serialize, restore, render, BANDS, MAX_MONTHS, MAX_EVENTS };
})(window.CM);
