'use strict';
// Player assessments use published traffic within actual construction permissions.
// City/company views share geography and world zone denominators; they never
// alter the world solver, OD demand, asset ownership or financial settlement.
(function (CM) {
  const P = CM.PlayerMetrics = {}, U = CM.U, store = new WeakMap();
  const ZONE_FIELDS = ['zTrips', 'zMetro', 'zCW', 'zCT', 'zFare', 'zTime'];
  const SUM_FIELDS = ['trips', 'metro', 'car', 'timeSum', 'fare', 'commTrips', 'commTime'];
  function rt(g) {
    let r = store.get(g);
    if (!r) { r = { views: new Map(), counts: { masks: 0, cells: 0, demographics: 0, roadGeometry: 0, railGeometry: 0, publications: 0 } }; store.set(g, r); }
    return r;
  }
  const regional = g => g.mapId === 'sh';
  const view = (g, id) => { const r = rt(g); if (!r.views.has(id)) r.views.set(id, {}); return r.views.get(id); };
  const hashAdd = (h, value) => { h.a = Math.imul(h.a ^ value, 16777619); h.b = Math.imul(h.b, 33) ^ value; };
  const hashNew = () => ({ a: 2166136261, b: 5381 });
  const hashText = h => (h.a >>> 0).toString(36) + ':' + (h.b >>> 0).toString(36);
  P.enabled = g => !!(g && !g.tutorial && g.mapId !== 'tutorial' && g.city && typeof g.city.lockState === 'function' && g.model && g.model.zoneCells && Number.isInteger(g.model.Z));
  P.diagnostics = g => Object.assign({}, rt(g).counts);
  P.homeCity = g => regional(g) ? g.playerCity || 'sh' : g.mapId;
  function cityName(g, id) {
    if (regional(g)) { const d = CM.Operators && CM.Operators.DEFINITIONS.find(d => d.id === id); return d ? d.city : '其他覆盖地区'; }
    return CM.MAPS && CM.MAPS[g.mapId] && CM.MAPS[g.mapId].name || CM.DATA && CM.DATA.city || id;
  }
  function scope(g) {
    const r = rt(g), c = g.city, state = c.lockState(), old = r.scope;
    if (old && old.city === c && old.map === g.mapId && old.source === state.mask && old.regions === c.regions && old.region === c.region) return old;
    const mask = new Uint8Array(c.N), hash = hashNew(); let count = 0;
    for (let k = 0; k < c.N; k++) { const region = c.regions[c.region[k]], locked = !!state.mask[k] || !!(region && region.outside); mask[k] = locked ? 1 : 0; if (!locked) count++; hashAdd(hash, mask[k]); }
    const key = 'open-v1:' + g.mapId + ':' + c.N + ':' + count + ':' + hashText(hash);
    r.counts.masks++; r.counts.cells += c.N;
    return r.scope = { id: 'all', city: c, map: g.mapId, source: state.mask, regions: c.regions, region: c.region, mask, count, key };
  }
  P.scopeMask = g => scope(g).mask;
  P.scopeKey = g => scope(g).key;
  function openAt(s, k) { return k >= 0 && k < s.city.N && (!s.geo || s.geo.codes[k] === s.cityIndex) && (s.allow ? s.allow[k] === 1 : !s.mask[k]); }
  P.contains = (g, cell) => Number.isInteger(cell) && openAt(scope(g), cell);

  // Resolve physical city ownership once. Lists let each city visit only its own
  // cells; an unlock in another city does not change this city's scope key.
  function geography(g) {
    const r = rt(g), c = g.city, old = r.geo;
    if (old && old.city === c && old.region === c.region && old.regions === c.regions && old.host === c.scenicHost) return old;
    const ids = (CM.Operators ? CM.Operators.DEFINITIONS.map(d => d.id) : [P.homeCity(g)]).concat('other');
    const index = new Map(ids.map((id, i) => [id, i])), codes = new Uint8Array(c.N), cells = ids.map(() => []);
    for (let k = 0; k < c.N; k++) {
      const id = CM.RegionalMetrics && CM.RegionalMetrics.cityOf ? CM.RegionalMetrics.cityOf(g, k) : CM.Operators && CM.Operators.cityAt ? CM.Operators.cityAt(g, k) : (c.regions[c.region[k]] || {}).cityId;
      const code = index.has(id) ? index.get(id) : ids.length - 1; codes[k] = code; cells[code].push(k);
    }
    r.counts.cells += c.N;
    return r.geo = { city: c, region: c.region, regions: c.regions, host: c.scenicHost, ids, index, codes, cells: cells.map(x => Uint32Array.from(x)) };
  }
  function cityScope(g, id) {
    const base = scope(g), geo = geography(g), index = geo.index.get(id); if (index == null) return null;
    const context = view(g, 'city:' + id), old = context.scope;
    if (context.base === base && old && old.geo === geo) return old;
    const hash = hashNew(), cells = geo.cells[index]; let count = 0;
    for (const k of cells) { hashAdd(hash, k); hashAdd(hash, base.mask[k]); if (!base.mask[k]) count++; }
    const key = 'open-city-v1:' + g.mapId + ':' + id + ':' + count + ':' + hashText(hash);
    context.base = base; rt(g).counts.masks++; rt(g).counts.cells += cells.length;
    if (old && old.geo === geo && old.key === key) return old;
    return context.scope = { id: 'city:' + id, cityId: id, cityName: cityName(g, id), city: g.city, geo, cityIndex: index, cells, mask: base.mask, count, key };
  }
  function companyScope(g, id) {
    const O = CM.Operators, company = O && O.company(g, id); if (!company || !regional(g)) return null;
    const definition = O.DEFINITIONS.find(d => d.id === id); if (!definition || !g.clock || g.clock.y < definition.year) return null;
    const geo = geography(g), index = geo.index.get(id); if (index == null) return null;
    const context = view(g, 'company:' + id), old = context.scope, c = g.city;
    const permission = [g.clock && g.clock.y, P.homeCity(g), c.terrainVer, company.crossPermit ? 1 : 0].join('|');
    if (old && old.geo === geo && context.company === company && context.permission === permission) return old;
    const allow = new Uint8Array(c.N), cells = geo.cells[index], hash = hashNew(); let count = 0;
    for (const k of cells) { const region = c.regions[c.region[k]], yes = !(region && region.outside) && O.canBuildCell(g, k, id); allow[k] = yes ? 1 : 0; count += allow[k]; hashAdd(hash, k); hashAdd(hash, allow[k]); }
    const key = 'company-city-v1:' + g.mapId + ':' + id + ':' + count + ':' + hashText(hash);
    context.company = company; context.permission = permission; rt(g).counts.masks++; rt(g).counts.cells += cells.length;
    if (old && old.geo === geo && old.key === key) return old;
    return context.scope = { id: 'company:' + id, cityId: id, cityName: cityName(g, id), companyId: id, city: c, geo, cityIndex: index, cells, allow, count, key };
  }
  function worldDemo(g) {
    const r = rt(g), c = g.city, m = g.model, old = r.world;
    if (old && old.city === c && old.version === c.version && old.popSource === c.pop && old.jobSource === c.jobs && old.zones === m.zoneCells && old.Z === m.Z) return old;
    const allPop = new Float64Array(m.Z), allJobs = new Float64Array(m.Z), cells = new Uint32Array(m.Z);
    for (let k = 0; k < c.N; k++) { const z = c.zoneOf(k); if (z >= 0 && z < m.Z) { cells[z]++; allPop[z] += c.pop[k]; allJobs[z] += c.jobs[k]; } }
    r.counts.cells += c.N;
    return r.world = { city: c, version: c.version, popSource: c.pop, jobSource: c.jobs, zones: m.zoneCells, Z: m.Z, allPop, allJobs, cells };
  }
  function demo(g, s) {
    const context = view(g, s.id), c = g.city, m = g.model, base = worldDemo(g), old = context.demo;
    if (old && old.scope === s && old.world === base) return old;
    const pop = new Float64Array(m.Z), jobs = new Float64Array(m.Z), open = new Uint32Array(m.Z); let totalPop = 0, totalJobs = 0;
    const visit = k => { if (!openAt(s, k)) return; const z = c.zoneOf(k); if (z < 0 || z >= m.Z) return; open[z]++; pop[z] += c.pop[k]; jobs[z] += c.jobs[k]; totalPop += c.pop[k]; totalJobs += c.jobs[k]; };
    if (s.cells) for (const k of s.cells) visit(k); else for (let k = 0; k < c.N; k++) visit(k);
    const weights = new Float64Array(m.Z), popWeights = new Float64Array(m.Z), jobWeights = new Float64Array(m.Z), active = [];
    for (let z = 0; z < m.Z; z++) { const cw = base.cells[z] ? open[z] / base.cells[z] : 0; popWeights[z] = base.allPop[z] ? pop[z] / base.allPop[z] : cw; jobWeights[z] = base.allJobs[z] ? jobs[z] / base.allJobs[z] : cw; weights[z] = base.allPop[z] ? popWeights[z] : base.allJobs[z] ? jobWeights[z] : cw; if (weights[z] > 0) active.push(z); }
    rt(g).counts.demographics++; rt(g).counts.cells += s.cells ? s.cells.length : c.N;
    return context.demo = { scope: s, world: base, pop, jobs, cells: base.cells, open, weights, popWeights, jobWeights, active: Uint32Array.from(active), totalPop, totalJobs };
  }

  // Clip geometry once into cell-length shares. All city/company masks reuse
  // these pieces; changing permission or traffic does not rebuild polylines.
  function pieces(g, points) {
    const c = g.city, cells = new Map(); let total = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy); if (!(length > 0)) continue;
      const cuts = [0, 1];
      if (dx) for (let x = Math.floor(Math.min(a[0], b[0])) + 1; x < Math.max(a[0], b[0]); x++) cuts.push((x - a[0]) / dx);
      if (dy) for (let y = Math.floor(Math.min(a[1], b[1])) + 1; y < Math.max(a[1], b[1]); y++) cuts.push((y - a[1]) / dy);
      cuts.sort((a, b) => a - b);
      for (let j = 1; j < cuts.length; j++) {
        const span = cuts[j] - cuts[j - 1]; if (!(span > 0)) continue;
        const t = (cuts[j] + cuts[j - 1]) / 2, x = a[0] + dx * t, y = a[1] + dy * t, k = c.cellAt(x, y), part = span * length; total += part;
        let row = cells.get(k); if (!row) { row = { cell: k, share: 0, x: 0, y: 0 }; cells.set(k, row); }
        row.share += part; row.x += x * part; row.y += y * part;
      }
    }
    return total ? Array.from(cells.values(), row => ({ cell: row.cell, share: row.share / total, x: row.x / row.share, y: row.y / row.share })) : [];
  }
  const fraction = (parts, s) => { let sum = 0; for (const part of parts || []) if (openAt(s, part.cell)) sum += part.share; return U.clamp(sum, 0, 1); };
  function roadGeometry(g) {
    const r = rt(g), road = g.model.road, c = g.city, old = r.roadGeometry;
    if (old && old.road === road && old.city === c && old.vx === c.vx && old.vy === c.vy && old.width === c.W && old.height === c.H) return old;
    const parts = new Array(Math.max(road && road.links ? road.links.length : 0, Math.ceil((road && road.nA || 0) / 2)));
    for (let i = 0; road && road.links && i < road.links.length; i++) { const link = road.links[i], points = link.verts && c.vx && c.vy ? link.verts.map(k => [c.vx[k], c.vy[k]]) : link.pts || []; parts[link.id == null ? i : link.id] = pieces(g, points); }
    r.counts.roadGeometry++;
    return r.roadGeometry = { road, city: c, vx: c.vx, vy: c.vy, width: c.W, height: c.H, parts };
  }
  function roadWeights(g, s) {
    const context = view(g, s.id), geometry = roadGeometry(g), old = context.roads;
    if (old && old.scope === s && old.geometry === geometry) return old.weights;
    const weights = Float64Array.from(geometry.parts, parts => fraction(parts, s)), active = [], nA = g.model.road && g.model.road.nA || 0;
    for (let i = 0; i < weights.length; i++) if (weights[i] > 0) { if (i * 2 < nA) active.push(i * 2); if (i * 2 + 1 < nA) active.push(i * 2 + 1); }
    context.roads = { scope: s, geometry, weights, active: Uint32Array.from(active) }; return weights;
  }
  const EMPTY_ROADS = new Float64Array(0);
  function localScope(g, id) { return regional(g) ? cityScope(g, id) : id === P.homeCity(g) ? scope(g) : null; }
  P.roadWeights = function (g, id) { const s = id == null ? scope(g) : localScope(g, id); return s ? roadWeights(g, s) : EMPTY_ROADS; };
  P.roadShare = (g, link, id) => P.roadWeights(g, id)[typeof link === 'number' ? link : link && link.id] || 0;
  P.roadPoint = function (g, link) {
    const s = scope(g), parts = roadGeometry(g).parts[typeof link === 'number' ? link : link && link.id]; let best = null;
    for (const part of parts || []) if (openAt(s, part.cell) && (!best || part.share > best.share)) best = part;
    return best ? [best.x, best.y] : null;
  };
  function railGeometry(g, net) {
    const r = rt(g), C = net && net.C; if (!C) return null;
    if (!r.railGeometry || r.railGeometry.city !== g.city) r.railGeometry = { city: g.city, values: new WeakMap() };
    let parts = r.railGeometry.values.get(C); if (parts) return parts;
    parts = (C.routes || []).map(route => (route.legLenM || []).map((_, leg) => {
      const a = route.stopPt && route.stopPt[leg], b = route.stopPt && route.stopPt[leg + 1];
      if (a != null && b != null && route.pts) return pieces(g, route.pts.slice(a, b + 1));
      const st = route.stIdx && route.stIdx[leg], station = st != null && C.stations[st];
      return station ? [{ cell: g.city.cellAt(station.x, station.y), share: 1, x: station.x, y: station.y }] : [];
    }));
    r.counts.railGeometry++; r.railGeometry.values.set(C, parts); return parts;
  }
  function railWeights(g, net, s) {
    const geometry = railGeometry(g, net); if (!geometry) return [];
    const context = view(g, s.id);
    if (!context.rails || context.rails.scope !== s) context.rails = { scope: s, values: new WeakMap() };
    let weights = context.rails.values.get(geometry);
    if (!weights) { weights = geometry.map(route => route.map(parts => fraction(parts, s))); context.rails.values.set(geometry, weights); }
    return weights;
  }
  const blank = () => ({ trips: 0, metro: 0, car: 0, timeSum: 0, fare: 0, commTrips: 0, commTime: 0, congNum: 0, congDen: 0, amNum: 0, amDen: 0, metroPkm: 0, crowdPkm: 0, vkt: 0, ready: true });
  function finish(d, coverage) { d.metroShare = d.trips > 0 ? d.metro / d.trips : 0; d.commute = d.commTrips > 0 ? d.commTime / d.commTrips : 0; d.avgTime = d.trips > 0 ? d.timeSum / d.trips : 0; d.avgFare = d.metro > 0 ? d.fare / d.metro : 0; d.cong = d.congDen > 0 ? d.congNum / d.congDen : 1; d.congAM = d.amDen > 0 ? d.amNum / d.amDen : d.cong; d.crowdShare = d.metroPkm > 0 ? U.clamp(d.crowdPkm / d.metroPkm, 0, 1) : 0; d.coverage = coverage; return d; }
  function access(g, d, net) {
    const context = view(g, d.scope.id), walk = net && net.acc && net.acc.cellWalk, old = context.access;
    if (old && old.demo === d && old.walk === walk) return old;
    const zones = new Float64Array(g.model.Z); let covered = 0;
    const visit = k => { if (!openAt(d.scope, k) || walk[k] > CM.CFG.walk.maxAccessM) return; const z = g.city.zoneOf(k), n = g.city.pop[k]; covered += n; if (z >= 0 && z < zones.length) zones[z] += n; };
    if (walk) { if (d.scope.cells) for (const k of d.scope.cells) visit(k); else for (let k = 0; k < g.city.N; k++) visit(k); rt(g).counts.cells += d.scope.cells ? d.scope.cells.length : g.city.N; }
    return context.access = { demo: d, walk, zones, covered, coverage: d.totalPop > 0 ? covered / d.totalPop : 0 };
  }
  function periodReady(period, m, net, road) {
    if (!period || ZONE_FIELDS.some(k => !period[k] || period[k].length !== m.Z)) return false;
    if (road && road.nA && (!period.arcVol || period.arcVol.length !== road.nA || !period.arcTime || period.arcTime.length !== road.nA)) return false;
    if (net && net.R) {
      if (!period.freq || period.freq.length !== net.R || !period.load) return false;
      if (net.nE != null && period.load.length !== net.nE) return false;
      for (const edges of net.rideEdge || []) for (const edge of edges) if (edge >= period.load.length) return false;
    }
    return true;
  }
  function aggregate(g, net, perWd, perWe, complete, s) {
    s = s || scope(g);
    const m = g.model, d = demo(g, s), cov = access(g, d, net), road = m.road, roads = roadWeights(g, s), rails = railWeights(g, net, s), days = {}, zoneDays = {};
    const walkReady = !!(cov.walk && cov.walk.length === g.city.N), activeArcs = view(g, s.id).roads.active;
    for (const dt of ['wd', 'we']) {
      const out = days[dt] = blank(), empty = finish(blank(), 0), zones = zoneDays[dt] = new Array(m.Z).fill(empty), per = dt === 'wd' ? perWd : perWe;
      for (const z of d.active) zones[z] = blank();
      out.ready = !!complete && walkReady && !!per && per.length === m.pHours.length;
      for (let p = 0; per && p < per.length; p++) {
        const period = per[p], hours = m.pHours[p], hm = hours * (p === 3 ? .9 : 1);
        if (!periodReady(period, m, net, road) || !Number.isFinite(hours)) { out.ready = false; continue; }
        for (const z of d.active) {
          const w = d.weights[z], q = zones[z];
          if (ZONE_FIELDS.some(k => !Number.isFinite(period[k][z]) || period[k][z] < 0)) { out.ready = false; continue; }
          q.trips += period.zTrips[z] * hours * w; q.metro += period.zMetro[z] * hm * w; q.car += Math.max(0, period.zTrips[z] - period.zMetro[z]) * hours * w; q.timeSum += period.zTime[z] * hours * w; q.fare += period.zFare[z] * hm * w; q.commTrips += period.zCW[z] * hours * w; q.commTime += period.zCT[z] * hours * w;
        }
        for (const a of activeArcs) {
          const w = roads[a >> 1];
          const volume = period.arcVol[a], time = period.arcTime[a], t0 = road.arcT0[a], length = road.arcLen[a];
          if (!Number.isFinite(volume) || !Number.isFinite(time) || !Number.isFinite(t0) || !Number.isFinite(length) || volume < 0 || !(time > 0) || !(t0 > 0) || length < 0) { out.ready = false; continue; }
          const den = volume * length * w, num = den * time / t0; out.congNum += num * hours; out.congDen += den * hours; if (p === 0) { out.amNum += num; out.amDen += den; }
        }
        for (let ri = 0; net && ri < net.R; ri++) {
          const route = net.C.routes[ri], cap = m.capOf(ri, net), edges = net.rideEdge[ri] || [];
          for (let q = 0; q < edges.length; q++) {
            const edge = edges[q], leg = q >> 1, w = rails[ri][leg] || 0; if (!(w > 0)) continue;
            const load = period.load[edge], km = net.eKm && net.eKm[edge] || (route.legLenM[leg] || 0) / 1000, frequency = CM.Model.dirFreq(period, net, ri, q);
            if (!Number.isFinite(load) || !Number.isFinite(km) || !Number.isFinite(cap) || !Number.isFinite(frequency) || load < 0 || km < 0 || cap < 0 || frequency < 0) { out.ready = false; continue; }
            const amount = load * km * w * hm; out.metroPkm += amount; if (load > Math.max(1, cap * frequency)) out.crowdPkm += amount;
          }
        }
      }
      for (const z of d.active) { const q = zones[z]; for (const k of SUM_FIELDS) out[k] += q[k]; q.ready = out.ready; finish(q, d.pop[z] ? cov.zones[z] / d.pop[z] : 0); }
      empty.ready = out.ready; Object.freeze(empty);
      out.vkt = out.congDen / 1000; finish(out, cov.coverage);
    }
    const avg = blank(), weights = CM.CFG.trips.weekWeights;
    for (const k of Object.keys(avg)) if (typeof avg[k] === 'number') avg[k] = days.wd[k] * weights.wd + days.we[k] * weights.we;
    avg.ready = !!(days.wd.ready && days.we.ready); finish(avg, cov.coverage); avg.congAM = days.wd.congAM;
    const id = s.cityId || (!regional(g) ? P.homeCity(g) : null), name = id ? cityName(g, id) : null;
    Object.assign(avg, { pop: d.totalPop, jobs: d.totalJobs, hasPopulation: d.totalPop > 0, scopeKey: s.key, scopeLabel: id ? name + (s.companyId ? '公司经营区域' : '已解锁经营区域') : '已解锁经营区域', metricScope: 'player-open-v1' });
    if (id) Object.assign(avg, { cityId: id, cityName: name });
    if (s.companyId) avg.companyId = s.companyId;
    return Object.assign({}, avg, { daily: Object.assign({}, avg), dailyWk: days.wd, dailyWe: days.we, _zones: zoneDays, _demo: d, _access: cov });
  }
  function published(g, s) {
    const context = view(g, s.id), m = g.model, d = demo(g, s), ready = !!m.results && !!m.net && m.net.C === g.compiled && !m.dailyStale && !!(m.trafficReady && m.trafficReady()), walk = m.net && m.net.acc && m.net.acc.cellWalk, old = context.snapshot;
    if (old && old.demo === d && old.results === m.results && old.net === m.net && old.compiled === g.compiled && old.walk === walk && old.road === m.road && old.vx === g.city.vx && old.vy === g.city.vy && old.ready === ready && old.fleet === g.fleet && old.fleetVer === (g.fleet && g.fleet.ver)) return old.value;
    const value = aggregate(g, m.net, m.results && m.results.wd && m.results.wd.per, m.results && m.results.we && m.results.we.per, ready, s); rt(g).counts.publications++;
    context.snapshot = { demo: d, results: m.results, net: m.net, compiled: g.compiled, walk, road: m.road, vx: g.city.vx, vy: g.city.vy, ready, fleet: g.fleet, fleetVer: g.fleet && g.fleet.ver, value }; return value;
  }
  P.snapshot = g => P.enabled(g) ? published(g, scope(g)) : null;
  P.fromPeriods = (g, net, wd, we) => aggregate(g, net, wd, we, true);
  P.city = function (g, id) {
    if (!P.enabled(g)) return null;
    id = id || P.homeCity(g);
    if (!regional(g)) return id === P.homeCity(g) ? P.snapshot(g) : null;
    const s = cityScope(g, id); return s ? published(g, s) : null;
  };
  P.home = g => P.city(g, P.homeCity(g));
  P.cityMask = function (g, id) {
    if (!P.enabled(g)) return null;
    const s = localScope(g, id || P.homeCity(g)); if (!s) return null;
    if (!s.cells) return s.mask;
    if (!s.fullMask) { s.fullMask = new Uint8Array(g.city.N).fill(1); for (const k of s.cells) if (openAt(s, k)) s.fullMask[k] = 0; }
    return s.fullMask;
  };
  P.cityIds = function (g) {
    if (!P.enabled(g)) return [];
    const s = scope(g), r = rt(g), world = worldDemo(g), geo = regional(g) ? geography(g) : null, old = r.cityList;
    if (old && old.scope === s && old.world === world && old.geo === geo) return old.ids;
    const ids = geo ? geo.ids.filter(id => demo(g, cityScope(g, id)).totalPop > 0) : demo(g, s).totalPop > 0 ? [P.homeCity(g)] : [];
    r.cityList = { scope: s, world, geo, ids }; return ids;
  };
  P.company = function (g, id) {
    if (!P.enabled(g)) return null;
    if (!id || id === 'player' || id === P.homeCity(g)) return P.city(g, P.homeCity(g));
    const s = companyScope(g, id); return s ? published(g, s) : null;
  };
  // Month settlement already runs cooperatively. Prepare one city's published
  // view per yield so the unchanged synchronous scoring APIs read warm caches.
  // This never scores a city, solves traffic or publishes partial assessments.
  P.warmGen = function* (g) {
    if (!P.enabled(g)) return;
    const home = P.homeCity(g);
    P.home(g); yield;
    if (!regional(g)) return;
    for (const id of geography(g).ids) {
      if (id === home) continue;
      const s = cityScope(g, id);
      if (s && demo(g, s).totalPop > 0) published(g, s);
      yield;
    }
    const O = CM.Operators;
    for (const definition of O && O.DEFINITIONS || []) {
      if (definition.id === home) continue;
      const s = companyScope(g, definition.id);
      if (s) { published(g, s); yield; }
    }
  };
  function zone(g, s, z) {
    if (!s || !Number.isInteger(z) || z < 0 || z >= g.model.Z) return null;
    const d = s._demo, a = s._zones.wd[z], b = s._zones.we[z], w = CM.CFG.trips.weekWeights, trips = a.trips * w.wd + b.trips * w.we, metro = a.metro * w.wd + b.metro * w.we;
    return { openFraction: d.cells[z] ? d.open[z] / d.cells[z] : 0, populationFraction: d.popWeights[z], jobFraction: d.jobWeights[z], pop: d.pop[z], jobs: d.jobs[z], coverage: d.pop[z] ? s._access.zones[z] / d.pop[z] : 0, trips, metro, metroShare: trips ? metro / trips : 0, carShare: a.trips ? a.car / a.trips : 0, commute: a.commute, ready: s.ready };
  }
  P.zone = (g, z) => zone(g, P.snapshot(g), z);
  P.cityZone = (g, id, z) => zone(g, P.city(g, id), z);
})(window.CM);
