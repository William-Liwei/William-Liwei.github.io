'use strict';
// Statistics share the published regional passenger assignment. Geography,
// demography, traffic and commute demand have separate invalidation boundaries;
// opening the HUD never walks the OD matrix or rebuilds all cell weights.
(function (CM) {
  const R = CM.RegionalMetrics = {}, U = CM.U, cache = new WeakMap();
  const FIELDS = ['pop', 'jobs', 'covered', 'trips', 'metro', 'metroPkm', 'crowdPkm', 'commTrips', 'commTime', 'congNum', 'congDen', 'amNum', 'amDen', 'crossOut', 'crossIn'];
  const runtime = g => { let r = cache.get(g); if (!r) { r = { counts: { geography: 0, demography: 0, coverage: 0, roadGeometry: 0, railGeometry: 0, traffic: 0, commute: 0, cellVisits: 0, arcVisits: 0, railVisits: 0, railPointVisits: 0, odVisits: 0 } }; cache.set(g, r); } return r; };
  R.enabled = g => !!g && !!g.city && g.mapId === 'sh' && !g.tutorial;
  const definitions = () => CM.Operators.DEFINITIONS;
  const cityId = (g, c) => { const id = CM.Operators.cityAt(g, c); return definitions().some(d => d.id === id) ? id : 'other'; };
  R.cityOf = function (g, c) {
    const rt = runtime(g), geo = rt.geo, city = g.city;
    if (geo && geo.city === city && geo.region === city.region && geo.regions === city.regions && geo.host === city.scenicHost && c >= 0 && c < city.N) return geo.ids[geo.cells[c]];
    return cityId(g, c);
  };
  const row = (id, name) => ({ id, name, pop: 0, jobs: 0, covered: 0, trips: 0, metro: 0, metroPkm: 0, crowdPkm: 0, commTrips: 0, commTime: 0, congNum: 0, congDen: 0, amNum: 0, amDen: 0, crossOut: 0, crossIn: 0 });
  const finish = r => { r.coverage = r.pop > 0 ? r.covered / r.pop : 0; r.metroShare = r.trips > 0 ? r.metro / r.trips : 0; r.crowdShare = r.metroPkm > 0 ? U.clamp(r.crowdPkm / r.metroPkm, 0, 1) : 0; r.commute = r.commTrips > 0 ? r.commTime / r.commTrips : 0; r.cong = r.congDen > 0 ? r.congNum / r.congDen : 1; r.congAM = r.amDen > 0 ? r.amNum / r.amDen : 1; return r; };
  R.combine = function (rows, id, name) { const out = row(id || 'all', name || '区域全图'); for (const r of rows) for (const k of FIELDS) out[k] += r[k] || 0; return finish(out); };
  R.diagnostics = g => Object.assign({}, runtime(g).counts);
  function geography(g) {
    const rt = runtime(g), c = g.city, old = rt.geo;
    if (old && old.city === c && old.region === c.region && old.regions === c.regions && old.host === c.scenicHost) return old;
    const defs = definitions(), ids = defs.map(d => d.id).concat('other'), names = defs.map(d => d.city).concat('其他覆盖地区');
    const ix = Object.fromEntries(ids.map((id, i) => [id, i])), other = ids.length - 1;
    const regions = Uint8Array.from(c.regions, r => ix[r.cityId] == null ? other : ix[r.cityId]), cells = new Uint8Array(c.N);
    for (let k = 0; k < c.N; k++) {
      let region = c.region[k];
      if (!c.regions[region].cityId && c.scenicHost && c.scenicHost[k] !== 255) region = c.scenicHost[k];
      cells[k] = regions[region] == null ? other : regions[region];
    }
    rt.counts.geography++; rt.counts.cellVisits += c.N;
    return rt.geo = { city: c, region: c.region, regions: c.regions, host: c.scenicHost, cells, ids, names, ix };
  }
  function demography(g, geo) {
    const rt = runtime(g), c = g.city, m = g.model, old = rt.demography;
    if (old && old.geo === geo && old.version === c.version && old.pop === c.pop && old.jobs === c.jobs && old.Z === m.Z && old.zoneCells === m.zoneCells) return old;
    const n = geo.ids.length, Z = m.Z, rows = geo.ids.map((id, i) => row(id, geo.names[i]));
    const zp = new Float64Array(Z * n), zj = new Float64Array(Z * n);
    for (let k = 0; k < c.N; k++) {
      const i = geo.cells[k], r = rows[i], p = c.pop[k], j = c.jobs[k], z = c.zoneOf(k);
      r.pop += p; r.jobs += j;
      if (z >= 0 && z < Z) { zp[z * n + i] += p; zj[z * n + i] += j; }
    }
    const shares = values => Array.from({ length: Z }, (_, z) => {
      let total = 0; for (let i = 0; i < n; i++) total += values[z * n + i];
      if (!total) { const cells = m.zoneCells[z], k = cells && cells[0]; return [[k == null ? n - 1 : geo.cells[k], 1]]; }
      const out = []; for (let i = 0; i < n; i++) if (values[z * n + i] > 0) out.push([i, values[z * n + i] / total]);
      return out;
    });
    rt.counts.demography++; rt.counts.cellVisits += c.N;
    return rt.demography = { geo, version: c.version, pop: c.pop, jobs: c.jobs, Z, zoneCells: m.zoneCells, rows, origins: shares(zp), destinations: shares(zj) };
  }
  function coverage(g, demo) {
    const rt = runtime(g), walk = g.model.net && g.model.net.acc && g.model.net.acc.cellWalk, limit = CM.CFG.walk.maxAccessM, old = rt.coverage;
    if (old && old.demo === demo && old.walk === walk && old.limit === limit) return old;
    const c = g.city, values = new Float64Array(demo.rows.length);
    if (walk) for (let k = 0; k < c.N; k++) if (walk[k] <= limit) values[demo.geo.cells[k]] += c.pop[k];
    rt.counts.coverage++; if (walk) rt.counts.cellVisits += c.N;
    return rt.coverage = { demo, walk, limit, values };
  }
  // Split cross-boundary links using each short geometric segment, retaining
  // their length shares. This topology work runs only when the roads change.
  function roads(g, geo) {
    const rt = runtime(g), road = g.model.road, c = g.city, old = rt.roads;
    if (old && old.road === road && old.geo === geo && old.vx === c.vx && old.vy === c.vy) return old.parts;
    const parts = [], other = geo.ids.length - 1;
    for (const link of road && road.links || []) {
      const sum = new Map(); let total = 0;
      const points = link.verts && c.vx && c.vy ? link.verts.map(v => [c.vx[v], c.vy[v]]) : link.pts || [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], k = c.cellAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), id = k >= 0 ? geo.cells[k] : other;
        const len = Math.hypot(a[0] - b[0], a[1] - b[1]); sum.set(id, (sum.get(id) || 0) + len); total += len;
      }
      parts[link.id == null ? parts.length : link.id] = total ? Array.from(sum, ([id, len]) => [id, len / total]) : [[other, 1]];
    }
    rt.counts.roadGeometry++; rt.roads = { road, geo, vx: c.vx, vy: c.vy, parts }; return parts;
  }
  // Ride edges follow each service's real polyline, including express legs that
  // pass multiple stations. Split at raster boundaries, then cache length shares
  // per leg; a new traffic publication never revisits these geographic points.
  function rails(g, geo) {
    const rt = runtime(g), compiled = g.compiled, old = rt.rails, c = g.city, other = geo.ids.length - 1;
    if (old && old.compiled === compiled && old.geo === geo) return old.parts;
    const parts = (compiled.routes || []).map(function (route) {
      const points = route.pts || [], stops = route.stopPt || [];
      return (route.legLenM || []).map(function (_length, leg) {
        const sum = new Map(); let total = 0;
        for (let j = stops[leg] + 1; j <= stops[leg + 1] && j < points.length; j++) {
          const a = points[j - 1], b = points[j], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
          rt.counts.railPointVisits++; if (!(length > 0)) continue;
          const cuts = [0, 1];
          if (dx) for (let x = Math.floor(Math.min(a[0], b[0])) + 1; x < Math.max(a[0], b[0]); x++) cuts.push((x - a[0]) / dx);
          if (dy) for (let y = Math.floor(Math.min(a[1], b[1])) + 1; y < Math.max(a[1], b[1]); y++) cuts.push((y - a[1]) / dy);
          cuts.sort(function (a, b) { return a - b; });
          for (let k = 1; k < cuts.length; k++) {
            const share = cuts[k] - cuts[k - 1]; if (!(share > 0)) continue;
            const t = (cuts[k] + cuts[k - 1]) / 2, cell = c.cellAt(a[0] + dx * t, a[1] + dy * t), id = cell >= 0 ? geo.cells[cell] : other;
            const distance = length * share; sum.set(id, (sum.get(id) || 0) + distance); total += distance;
          }
        }
        return total ? Array.from(sum, ([id, length]) => [id, length / total]) : [[other, 1]];
      });
    });
    rt.counts.railGeometry++; rt.rails = { compiled, geo, parts }; return parts;
  }
  function isReady(g) {
    const m = g.model;
    return !!(m.results && !m.dailyStale && !m.refreshing && !m.solving && m.net && m.net.C === g.compiled && (!m.trafficReady || m.trafficReady()));
  }
  function traffic(g, demo, ready) {
    const rt = runtime(g), m = g.model, results = m.results, road = m.road, net = m.net, fleet = g.fleet, fleetVer = fleet && fleet.ver, weights = CM.CFG.trips.weekWeights, old = rt.traffic;
    if (old && old.demo === demo && old.results === results && old.road === road && old.net === net && old.fleet === fleet && old.fleetVer === fleetVer && old.hours === m.pHours && old.weights === weights && old.ready === ready && old.compiled === g.compiled) return old;
    const rows = demo.rows.map(r => row(r.id, r.name)), parts = roads(g, demo.geo), railParts = rails(g, demo.geo), n = rows.length, fallback = [[n - 1, 1]], Z = m.Z;
    const routes = g.compiled.routes || [], fleetPlan = m.fleetOf ? m.fleetOf(net) : null;
    const capacities = routes.map(function (route, i) { return fleetPlan && fleetPlan[i] ? fleetPlan[i].cap : route.cap; });
    if (results) for (const dt of ['wd', 'we']) for (let p = 0; p < results[dt].per.length; p++) {
      const P = results[dt].per[p], hour = m.pHours[p], w = weights[dt] * hour, metroW = w * (p === 3 ? .9 : 1);
      for (let z = 0; z < Z; z++) for (const [i, share] of demo.origins[z]) {
        const r = rows[i]; r.trips += (P.zTrips && P.zTrips[z] || 0) * w * share; r.metro += (P.zMetro && P.zMetro[z] || 0) * metroW * share;
        if (dt === 'wd') { r.commTrips += (P.zCW && P.zCW[z] || 0) * hour * share; r.commTime += (P.zCT && P.zCT[z] || 0) * hour * share; }
      }
      for (let a = 0; road && a < road.nA; a++) {
        const vol = P.arcVol && P.arcVol[a] || 0; if (!(vol > 0) || !(road.arcT0[a] > 0)) continue;
        const den = vol * road.arcLen[a], num = den * (P.arcTime && P.arcTime[a] || road.arcT0[a]) / road.arcT0[a];
        for (const [i, share] of parts[a >> 1] || fallback) { rows[i].congNum += num * w * share; rows[i].congDen += den * w * share; if (dt === 'wd' && p === 0) { rows[i].amNum += num * share; rows[i].amDen += den * share; } }
      }
      for (let r = 0; r < routes.length; r++) {
        const edges = net && net.rideEdge && net.rideEdge[r] || [];
        for (let q = 0; q < edges.length; q++) {
          const e = edges[q], load = P.load && P.load[e] || 0, pkm = load * (net.eKm[e] || 0) * metroW;
          if (!(pkm > 0)) continue;
          const frequency = CM.Model.dirFreq(P, net, r, q) || 0, crowded = load > Math.max(1, frequency * capacities[r]);
          for (const [i, share] of railParts[r] && railParts[r][q >> 1] || fallback) { rows[i].metroPkm += pkm * share; if (crowded) rows[i].crowdPkm += pkm * share; }
        }
        rt.counts.railVisits += edges.length;
      }
      rt.counts.arcVisits += road ? road.nA : 0;
    }
    rt.counts.traffic++;
    return rt.traffic = { demo, results, road, net, fleet, fleetVer, hours: m.pHours, weights, ready, compiled: g.compiled, rows };
  }
  // Most frames stop here: no cell iteration, road geometry or OD iteration.
  function basic(g) {
    const rt = runtime(g), geo = geography(g), demo = demography(g, geo), cov = coverage(g, demo), ready = isReady(g), t = traffic(g, demo, ready), old = rt.basic;
    if (old && old.demo === demo && old.cov === cov && old.traffic === t) return old.snapshot;
    const rows = demo.rows.map((r, i) => { const out = Object.assign({}, t.rows[i], { pop: r.pop, jobs: r.jobs, covered: cov.values[i], ready }); return finish(out); });
    const all = R.combine(rows); all.ready = ready;
    const snapshot = { rows, byId: Object.fromEntries(rows.map(r => [r.id, r])), all, corridors: [], ready };
    rt.basic = { demo, cov, traffic: t, snapshot }; return snapshot;
  }
  function commute(g, demo) {
    const rt = runtime(g), m = g.model, od = m.od, host = m.fn && m.fn.hostZ, old = rt.commute;
    if (old && old.demo === demo && old.od === od && old.host === host) return old;
    const geo = demo.geo, n = geo.ids.length, matrix = Array.from({ length: n }, () => new Float64Array(n));
    if (od && od.t && od.t[0] && host) for (let z = 0; z < m.Z; z++) for (let k = od.start[z]; k < od.start[z + 1]; k++) {
      const amount = od.t[0][k] || 0; if (!(amount > 0)) continue;
      const dest = host[od.dest[k]];
      for (const [i, a] of demo.origins[z]) for (const [j, b] of demo.destinations[dest] || [[n - 1, 1]]) matrix[i][j] += amount * a * b;
    }
    const inbound = new Float64Array(n), outbound = new Float64Array(n), corridors = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) {
      const flow = matrix[i][j]; outbound[i] += flow; inbound[j] += flow;
      if (i < j && flow + matrix[j][i] > 1) corridors.push({ a: geo.ids[i], b: geo.ids[j], from: geo.names[i], to: geo.names[j], out: flow, back: matrix[j][i], total: flow + matrix[j][i] });
    }
    corridors.sort((a, b) => b.total - a.total); rt.counts.commute++; rt.counts.odVisits += od && od.dest ? od.dest.length : 0;
    return rt.commute = { demo, od, host, matrix, inbound, outbound, corridors };
  }
  R.snapshot = function (g) {
    if (!R.enabled(g)) return null;
    const rt = runtime(g), s = basic(g), flow = commute(g, rt.demography);
    if (s.flow !== flow) {
      for (let i = 0; i < s.rows.length; i++) { s.rows[i].crossOut = flow.outbound[i]; s.rows[i].crossIn = flow.inbound[i]; }
      s.all.crossOut = flow.outbound.reduce((a, v) => a + v, 0); s.all.crossIn = flow.inbound.reduce((a, v) => a + v, 0);
      s.corridors = flow.corridors; Object.defineProperty(s, 'flow', { value: flow, configurable: true });
    }
    return s;
  };
  R.openCities = function (g) {
    const rt = runtime(g), c = g.city, player = CM.Operators.playerCity(g), unlocked = !!(g.unlockAll || c.unlockAll), old = rt.open;
    if (old && old.city === c && old.version === c.lockVer && old.terrain === c.terrainVer && old.regions === c.regions && old.regionOpen === c.regionOpen && old.player === player && old.unlocked === unlocked) return old.ids;
    const ids = new Set([player]), state = c.lockState(), geo = geography(g);
    c.regions.forEach((r, k) => { if (r.cityId && (unlocked || state.info[k] && state.info[k].b)) ids.add(geo.ix[r.cityId] == null ? 'other' : r.cityId); });
    rt.open = { city: c, version: c.lockVer, terrain: c.terrainVer, regions: c.regions, regionOpen: c.regionOpen, player, unlocked, ids }; return ids;
  };
  R.scope = function (g, value) { const rt = runtime(g); if (value !== undefined) rt.scope = value; return rt.scope || CM.Operators.playerCity(g); };
  R.current = function (g) {
    if (!R.enabled(g)) return null;
    const s = basic(g), scope = R.scope(g), P = CM.PlayerMetrics;
    if (P && P.enabled(g) && (scope === 'home-open' || scope === 'player-open')) {
      const d = scope === 'home-open' ? P.home(g) : P.snapshot(g);
      return Object.assign({}, d, { id: scope, name: scope === 'home-open' ? d.cityName + '已开放范围' : '已开放经营范围合计' });
    }
    if (scope === 'all') return s.all;
    if (scope !== 'open') return s.byId[scope] || s.byId[CM.Operators.playerCity(g)] || s.all;
    const rt = runtime(g), open = R.openCities(g), old = rt.current;
    if (old && old.snapshot === s && old.open === open && old.flow === s.flow) return old.row;
    const current = R.combine(s.rows.filter(r => open.has(r.id)), 'open', '已进入城市合计'); current.ready = s.ready;
    rt.current = { snapshot: s, open, flow: s.flow, row: current }; return current;
  };
  R.panel = function (ui, g, rerender) {
    if (!R.enabled(g)) return null;
    if (!runtime(g).scope && CM.PlayerMetrics && CM.PlayerMetrics.enabled(g)) R.scope(g, 'home-open');
    const h = U.h, s = R.snapshot(g), cur = R.current(g), open = R.openCities(g), el = h('section', { class: 'chart-card', 'aria-label': '城市与区域' });
    el.appendChild(h('h3', null, '城市与区域'));
    el.appendChild(h('p', { class: 'note' }, '本公司只考核主城已开放范围。全市和全图数据用于规划参考，切换此表不会改变满意度或任务的考核范围。'));
    const select = h('select', { 'aria-label': '统计范围', onchange: function () { R.scope(g, select.value); ui._popShown = null; ui._congT = 0; if (ui.updateTop) ui.updateTop(); if (rerender) rerender(); else if (ui.rerenderPage) ui.rerenderPage(); } });
    if (CM.PlayerMetrics && CM.PlayerMetrics.enabled(g)) select.appendChild(h('option', { value: 'home-open', selected: R.scope(g) === 'home-open' ? true : null }, '主城已开放范围'));
    for (const r of s.rows) if (r.pop > 0 || r.jobs > 0) select.appendChild(h('option', { value: r.id, selected: R.scope(g) === r.id ? true : null }, r.name + '（全市参考）' + (open.has(r.id) ? '' : '（未开放建设）')));
    for (const r of [{ id: 'player-open', name: '已开放经营范围合计' }, {id: 'all', name: '全图参考'}]) select.appendChild(h('option', { value: r.id, selected: R.scope(g) === r.id ? true : null }, r.name));
    el.appendChild(h('label', { class: 'field' }, '统计范围', select));
    const fmt = v => U.fmtPeople(v), pct = v => U.fmtPct(v), num = v => v.toFixed(2);
    const table = h('table', { class: 'tbl' }, h('tr', null, ...['城市', '人口', '岗位', '地铁分担', '拥堵', '车内拥挤'].map(t => h('th', null, t))));
    for (const r of (cur.id === 'home-open' || cur.id === 'player-open' ? [cur] : []).concat(s.rows.filter(r => r.pop > 0 || r.jobs > 0), s.all)) table.appendChild(h('tr', { class: r.id === cur.id ? 'on' : '' }, h('th', null, r.name), h('td', null, fmt(r.pop)), h('td', null, fmt(r.jobs)), h('td', null, r.ready ? pct(r.metroShare) : '更新中'), h('td', null, r.ready ? num(r.cong) : '更新中'), h('td', null, r.ready ? pct(r.crowdShare) : '更新中')));
    el.appendChild(h('div', { style: { overflowX: 'auto' } }, table));
    if (g.macro && CM.Macro) { const mv = CM.Macro.view(g), total = mv.last ? mv.last.nom : mv.fc.nom, estimate = s.all.jobs > 0 ? total * cur.jobs / s.all.jobs : 0; el.appendChild(h('p', { class: 'note' }, cur.name + '经济规模（岗位占比估算）：' + CM.UI.fmtBig(estimate) + '。区域经济总量按当前各市岗位占比分配，各市估算之和等于区域总量；不代表各市独立 GDP 统计。')); }
    el.appendChild(h('p', { class: 'note' }, '人口、岗位按街区归属分别汇总；跨界小区的出行按居民权重拆分，拥堵按本市道路车公里加权。车内拥挤为本市轨道上满载率超过 100% 的人公里占比，跨城线路按实际区间长度分摊。未开放城市仍由当地公司发展。公司票款按实际承运分账，与城市地理统计分开。'));
    const top = s.corridors.filter(x => cur.id === 'all' || cur.id === 'player-open' && (open.has(x.a) || open.has(x.b)) || x.a === (cur.id === 'home-open' ? CM.Operators.playerCity(g) : cur.id) || x.b === (cur.id === 'home-open' ? CM.Operators.playerCity(g) : cur.id)).slice(0, 6);
    el.appendChild(h('h4', null, '跨城通勤走廊'));
    for (const x of top) el.appendChild(h('div', { class: 'note' }, x.from + ' ↔ ' + x.to + '：' + fmt(x.total) + ' 人次居住→工作需求/日'));
    if (!top.length) el.appendChild(h('p', { class: 'note' }, '等待城市间形成通勤需求。'));
    el.appendChild(h('p', { class: 'tiny muted' }, '通勤走廊按居住→工作单程基础需求汇总，不含返程；尚未扣除汽车或其他方式，不等于已乘坐地铁的人数。跨界小区的居住端按人口、工作端按岗位权重拆分。当前矩形地图只统计图内覆盖部分。'));
    return el;
  };
})(window.CM);
