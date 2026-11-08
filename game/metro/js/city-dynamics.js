'use strict';
// Observe real monthly land-use outcomes. This module never creates demand,
// moves a facility, changes a population cell or invokes the traffic solver.
(function (CM) {
  const D = CM.CityDynamics = {}, U = CM.U, CFG = CM.CFG, cache = new WeakMap();
  const SLICE_MS = 4;
  const workClock = () => ({ at: performance.now() });
  const due = work => performance.now() - work.at >= SLICE_MS;
  const drain = gen => { let step; do { step = gen.next(); } while (!step.done); return step.value; };
  const month = g => g.clock.y * 12 + g.clock.m - 1;
  const runtime = g => {
    let r = cache.get(g);
    if (!r) { r = { counts: { geography: 0, demography: 0, cellVisits: 0, facilities: 0, snapshots: 0 } }; cache.set(g, r); }
    return r;
  };
  D.diagnostics = g => Object.assign({}, runtime(g).counts);
  // TOD4/5 add genuinely stronger destination potential, but the same realised
  // demand, dispatch, four-year maturity and station crowding apply to every tier.
  D.pullStrength = function (s) {
    if (!s || !(s.flow > 0)) return 0;
    const G = CFG.metroLed, tier = U.clamp(s.tier || 0, 0, 5);
    const tod = tier < 4 ? (G.tod[tier] || 0) : tier === 4 ? 1.2 : 1.75;
    const support = U.clamp(s.flow / G.flowFull, 0, 1), presence = U.clamp(s.flow / 1000, 0, 1);
    return (G.base + G.xfer * Math.max(0, s.lines - 1) + G.flow * support +
      (tod + s.hub * (s.size === 'L' ? 0.16 : 0.10)) * (0.35 + 0.65 * support)) *
      s.maturity * U.clamp(s.frequency / 8, 0, 1) * presence * s.comfort;
  };
  function* geographyGen(g, work) {
    const r = runtime(g), c = g.city, old = r.geo, side = Math.max(2, Math.round(1000 / CFG.CELL_M));
    if (old && old.city === c && old.regions === c.regions && old.region === c.region && old.side === side) return old;
    const cells = new Uint32Array(c.N), blocks = [], ids = new Map(), bw = Math.ceil(c.W / side), tiles = bw * Math.ceil(c.H / side);
    for (let k = 0; k < c.N; k++) {
      const x = k % c.W, y = Math.floor(k / c.W), region = c.region[k], bx = Math.floor(x / side), by = Math.floor(y / side);
      const key = region * tiles + by * bw + bx;
      let id = ids.get(key);
      if (id === undefined) {
        id = blocks.length; ids.set(key, id);
        const rg = c.regions[region] || {}, regional = CM.RegionalMetrics && CM.RegionalMetrics.enabled(g);
        const cityId = rg.cityId || (regional ? CM.RegionalMetrics.cityOf(g, k) : g.mapId === 'sh-city' ? 'sh' : g.mapId);
        blocks.push({ id: region + ':' + bx + ':' + by, region: region, cityId: cityId, name: rg.name || '地块', cell: k,
          x: Math.min(c.W - 0.5, (bx + 0.5) * side), y: Math.min(c.H - 0.5, (by + 0.5) * side) });
      }
      cells[k] = id;
      if ((k & 2047) === 2047 && due(work)) { yield; work.at = performance.now(); }
    }
    r.counts.geography++; r.counts.cellVisits += c.N;
    return r.geo = { city: c, region: c.region, regions: c.regions, side: side, blocks: blocks, cells: cells };
  }
  function* demographyGen(g, work) {
    const r = runtime(g), c = g.city, geo = yield* geographyGen(g, work), old = r.demo;
    if (old && old.geo === geo && old.version === c.version && old.popRef === c.pop && old.jobsRef === c.jobs) return old;
    const pop = new Float64Array(geo.blocks.length), jobs = new Float64Array(pop.length), peak = new Float64Array(pop.length);
    const at = Uint32Array.from(geo.blocks, b => b.cell), regionPop = new Float64Array(c.regions.length);
    for (let k = 0; k < c.N; k++) {
      const b = geo.cells[k], p = c.pop[k] || 0, j = c.jobs[k] || 0;
      pop[b] += p; jobs[b] += j; regionPop[c.region[k]] += p;
      if (p + j > peak[b]) { peak[b] = p + j; at[b] = k; }
      if ((k & 4095) === 4095 && due(work)) { yield; work.at = performance.now(); }
    }
    // Reuse the same totals for generated-facility activation. Fac.active does
    // not perform a second city scan after this monthly observation.
    c._regPop = { v: c.version, region: c.region, popRef: c.pop, pop: regionPop };
    r.counts.demography++; r.counts.cellVisits += c.N;
    return r.demo = { geo: geo, version: c.version, popRef: c.pop, jobsRef: c.jobs, pop: pop, jobs: jobs, at: at };
  }
  const demography = g => drain(demographyGen(g, workClock()));
  // A stable merge sort lets the large-map ranking share the same frame budget
  // as the raster reduction. Native sorting is kept for short facility lists.
  function* sortedGen(values, compare, work) {
    if (values.length < 512) return values.sort(compare);
    let from = values, to = new Array(values.length), ops = 0;
    for (let size = 1; size < values.length; size *= 2) {
      for (let left = 0; left < values.length; left += size * 2) {
        const mid = Math.min(values.length, left + size), end = Math.min(values.length, mid + size);
        let a = left, b = mid;
        for (let k = left; k < end; k++) {
          to[k] = b >= end || a < mid && compare(from[a], from[b]) <= 0 ? from[a++] : from[b++];
          if ((++ops & 2047) === 0 && due(work)) { yield; work.at = performance.now(); }
        }
      }
      const swap = from; from = to; to = swap;
    }
    return from;
  }
  function facilities(g, demo) {
    const r = runtime(g), c = g.city, yr = g.clock.y + (g.clock.m - 1) / 12;
    const list = CM.Fac ? CM.Fac.list(c) : [], old = r.facilities;
    if (old && old.demo === demo && old.year === yr && old.list === list) return old;
    const active = [];
    for (const f of list) {
      if (!CM.Fac.active(f, yr, c)) continue;
      const k = c.cellAt(f.x, f.y), b = k >= 0 ? demo.geo.blocks[demo.geo.cells[k]] : null;
      active.push({ id: f.id, name: f.name, type: f.T && f.T.name || '', x: f.x, y: f.y, r: f.r,
        generated: !!f.gen, cityId: b && b.cityId, facility: f });
    }
    r.counts.facilities++;
    return r.facilities = { demo: demo, year: yr, list: list, active: active, ids: new Set(active.map(f => f.id)) };
  }
  const publish = (r, record) => { if (r.snapshot !== record) { r.counts.snapshots++; r.snapshot = record; } return record.value; };
  D.primeGen = function* (g) {
    if (!g || !g.city) return;
    cache.delete(g);
    const r = runtime(g), work = workClock(); r.observing = true;
    try {
      const demo = yield* demographyGen(g, work), active = facilities(g, demo);
      const record = yield* snapshotRecordGen(g, demo, active, null, work);
      r.initial = demo; r.lastActive = active; r.lastMonth = month(g); r.month = null;
      publish(r, record);
    } finally { r.observing = false; }
  };
  D.prime = g => drain(D.primeGen(g));
  D.beforeMonthGen = function* (g) {
    if (!runtime(g).initial) yield* D.primeGen(g);
    const r = runtime(g); r.observing = true;
    try { r.before = yield* demographyGen(g, workClock()); r.beforeYm = month(g); }
    finally { r.observing = false; }
  };
  D.beforeMonth = g => drain(D.beforeMonthGen(g));
  D.afterMonthGen = function* (g) {
    const r = runtime(g);
    if (r.month && r.month.ym === month(g) && !r.before) return D.snapshot(g);
    // A panel opened after loading is a baseline, never invented historical growth.
    if (!r.initial || !r.before) { yield* D.primeGen(g); return D.snapshot(g); }
    const work = workClock(); r.observing = true;
    try {
      const demo = yield* demographyGen(g, work), ym = month(g), active = facilities(g, demo), prior = r.lastActive || active;
      const monthly = { ym: ym, before: r.before, after: demo, opened: new Set(active.active.filter(f => !prior.ids.has(f.id)).map(f => f.id)) };
      const record = yield* snapshotRecordGen(g, demo, active, monthly, work);
      // The month and its complete ranking become visible together. Readers
      // during any yield above keep the previous complete snapshot.
      r.month = monthly; r.lastActive = active; r.lastMonth = ym; r.before = null;
      const out = publish(r, record);
      // One meaningful centre per month; saved IDs prevent repeats after reload.
      if (CM.Milestones && CM.Milestones.register) for (let i = 0; i < out.hotspots.length; i++) {
        if ((i & 255) === 255 && due(work)) { yield; work.at = performance.now(); }
        const h = out.hotspots[i];
        if (!h.service || h.service.station.ownerId && h.service.station.ownerId !== 'player' ||
            h.service.tier !== 5 || h.service.hub !== 2 || h.service.size !== 'L' || h.service.maturity < 0.75 ||
            h.service.flow < 150000 || h.dJobs < 100 || h.dPop + h.dJobs <= 0) continue;
        const s = h.service.station;
        const hit = CM.Milestones.register(g, 'city-tod-anchor-' + s.id, { cat: 'city', icon: 'building', big: true,
          title: '站城新中心形成', desc: s.name + '周边本月新增 ' + U.fmtPeople(h.dJobs) + ' 个岗位；成熟的综合枢纽与最高级 TOD 正在吸引城市增长。' });
        if (hit) break;
      }
      return out;
    } finally { r.observing = false; }
  };
  D.afterMonth = g => drain(D.afterMonthGen(g));
  D.snapshot = function (g) {
    const pending = runtime(g);
    if (pending.observing) {
      if (pending.snapshot) return pending.snapshot.value;
      return { hotspots: [], centers: [], facilities: [], measured: false, updating: true, ym: month(g), side: Math.max(2, Math.round(1000 / CFG.CELL_M)) };
    }
    if (!pending.initial) D.prime(g);
    const r = runtime(g), demo = demography(g), fac = facilities(g, demo);
    return publish(r, drain(snapshotRecordGen(g, demo, fac, r.month, workClock())));
  };
  function* snapshotRecordGen(g, demo, fac, monthly, work) {
    const r = runtime(g), m = g.model, C = g.compiled;
    const services = [], strengths = [], sig = [month(g), m && m.dailyStale ? 1 : 0];
    for (let i = 0; C && i < C.stations.length; i++) {
      const s = CM.Property.stationService(g, i), k = D.pullStrength(s);
      services[i] = s; strengths[i] = k;
      sig.push(C.stations[i].id, C.stations[i].name, k, s && s.tier, s && s.hub, s && s.flow);
      if ((i & 127) === 127 && due(work)) { yield; work.at = performance.now(); }
    }
    const stamp = sig.join(':'), acc = m && m.net && m.net.acc, old = r.snapshot;
    if (old && old.demo === demo && old.fac === fac && old.month === monthly && old.stamp === stamp && old.acc === acc) return old;
    const prev = monthly && monthly.before.geo === demo.geo ? monthly.before : null, rows = [], rising = [];
    for (let b = 0; b < demo.geo.blocks.length; b++) {
      if ((b & 255) === 255 && due(work)) { yield; work.at = performance.now(); }
      if (demo.pop[b] + demo.jobs[b] < 1) continue;
      const block = demo.geo.blocks[b], c = demo.at[b], k = acc && acc.cellStation && acc.cellStation[c];
      const service = Number.isInteger(k) && k >= 0 && acc.cellWalk && acc.cellWalk[c] <= CFG.walk.maxAccessM ? services[k] : null;
      const dPop = prev ? demo.pop[b] - prev.pop[b] : 0, dJobs = prev ? demo.jobs[b] - prev.jobs[b] : 0;
      const attraction = service ? strengths[k] : 0;
      const row = Object.assign({}, block, { cell: c, x: c % g.city.W + 0.5, y: Math.floor(c / g.city.W) + 0.5,
        pop: demo.pop[b], jobs: demo.jobs[b], dPop: dPop, dJobs: dJobs, service: service, attraction: attraction,
        gain: (Math.max(0, dPop) + Math.max(0, dJobs) * 1.5) * (1 + Math.min(0.35, attraction * 0.07)) });
      rows.push(row); if (dPop + dJobs > 1) rising.push(row);
    }
    const hotspots = yield* sortedGen(rising, (a, b) => b.gain - a.gain || a.id.localeCompare(b.id), work);
    const centers = yield* sortedGen(rows, (a, b) => b.pop + b.jobs - a.pop - a.jobs, work);
    const active = fac.active.map(f => Object.assign({}, f, { opened: !!(monthly && monthly.opened.has(f.id)) }));
    active.sort((a, b) => Number(b.opened) - Number(a.opened) || Number(b.generated) - Number(a.generated) || a.name.localeCompare(b.name));
    const value = { hotspots: hotspots, centers: centers, facilities: active, measured: !!prev,
      ym: monthly ? monthly.ym : month(g), side: demo.geo.side };
    return { demo: demo, fac: fac, month: monthly, stamp: stamp, acc: acc, value: value };
  }
  D.panel = function (ui, g) {
    const h = U.h, data = D.snapshot(g), regional = CM.RegionalMetrics && CM.RegionalMetrics.enabled(g);
    const scope = regional ? CM.RegionalMetrics.scope(g) : 'all', open = regional && scope === 'open' ? CM.RegionalMetrics.openCities(g) : null;
    const visible = x => scope === 'all' || scope === 'open' && open.has(x.cityId) || x.cityId === scope;
    const hotspots = data.hotspots.filter(visible).slice(0, 6), centers = data.centers.filter(visible).slice(0, 6), active = data.facilities.filter(visible);
    const el = h('section', { class: 'chart-card city-dynamics', 'aria-label': '城市热点与设施' });
    el.appendChild(h('h3', null, '城市热点与设施'));
    el.appendChild(h('p', { class: 'note' }, '热点来自实际人口与岗位变化。地铁与 TOD 改变增长的位置；设施沿用既有启用年份和片区人口门槛。'));
    el.appendChild(h('h4', null, hotspots.length ? '本月崛起热点' : '当前人口与岗位集中区'));
    if (!data.measured) el.appendChild(h('p', { class: 'note' }, '下一次月结后显示真实增长；新建与读档不会产生虚假的初始涨幅。'));
    else el.appendChild(h('p', { class: 'tiny muted' }, Math.floor(data.ym / 12) + '年' + (data.ym % 12 + 1) + '月 · ' + '实际月度变化'));
    const locate = item => h('button', { class: 'btn sm ghost', onclick: function () {
      if (ui.closePanel) ui.closePanel(); if (ui.locatePoint) ui.locatePoint(item.x, item.y, item.name, item.r || data.side / 2);
    } }, '定位');
    const table = h('table', { class: 'tbl' }, h('tr', null, ...['片区热点', '人口变化', '岗位变化', '站城吸引', '定位'].map(t => h('th', null, t))));
    const signed = v => (v >= 0 ? '+' : '−') + U.fmtPeople(Math.abs(v));
    for (const row of hotspots.length ? hotspots : centers) {
      const label = row.name + ' · ' + (Math.floor(row.x) + 1) + ',' + (Math.floor(row.y) + 1);
      const svc = row.service;
      table.appendChild(h('tr', null, h('th', null, label, h('div', { class: 'tiny muted' }, '人口 ' + U.fmtPeople(row.pop) + ' · 岗位 ' + U.fmtPeople(row.jobs))),
        h('td', null, data.measured ? signed(row.dPop) : '—'), h('td', null, data.measured ? signed(row.dJobs) : '—'),
        h('td', null, svc && row.attraction > 0 ? svc.station.name + ' · TOD ' + svc.tier : '—'), h('td', null, locate(Object.assign({}, row, { name: label })))));
    }
    el.appendChild(h('div', { style: { overflowX: 'auto' } }, table));
    el.appendChild(h('h4', null, '已启用设施', ' · ' + active.length));
    for (const f of active.slice(0, 8)) el.appendChild(h('div', { class: 'row between note' }, h('span', null, f.name + ' · ' + f.type,
      f.opened ? h('span', { class: 'tag' }, '本月启用') : null), locate(f)));
    if (!active.length) el.appendChild(h('p', { class: 'note' }, '当前范围尚无已启用的重点设施。'));
    el.appendChild(h('p', { class: 'tiny muted' }, '设施与热点的位置可直接定位；列表不额外增加人口或出行需求。'));
    return el;
  };
})(window.CM);
