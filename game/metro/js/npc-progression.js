'use strict';
// Regional operators fund their network from local demand and available capital.
// This policy only supplies bounded budgets and construction targets; Operators
// still validates every corridor and books the actual construction/fleet bill.
(function (CM) {
  const N = CM.NPCProgression = {}, store = new WeakMap();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const number = v => Number.isFinite(v) && v > 0 ? v : 0;
  const owner = x => CM.Operators.owner(x);
  const RULES = N.RULES = Object.freeze({
    peoplePerStation: 44000, minimumObservationMonths: 24, baseObservationMonths: 72,
    localMonthsMin: 4, localMonthsMax: 14, crossExtraMonths: 4,
    initialGrant: 390000, initialPerTargetLine: 70000, maxInitialGrant: 1300000,
    monthlyGrant: 30000, maxMonthlyGrant: 180000, cashReserve: 20000,
    defaultProjectCost: 320000, cashProjects: 2, maxCashReserve: 4000000,
    localsPerCross: 3
  });
  N.LIMITS = Object.freeze({ projectsPerCompany: 32, stationsPerCompany: 96, stationsTotal: 576 });
  function runtime(g) {
    let r = store.get(g);
    if (!r) { r = { counts: { snapshots: 0, networkVisits: 0, demographicVisits: 0, demographicScans: 0 } }; store.set(g, r); }
    return r;
  }
  N.diagnostics = g => Object.assign({}, runtime(g).counts);
  N.enabled = g => !!(CM.Operators && CM.Operators.enabled(g));

  function demographics(g, definitions) {
    const rt = runtime(g), city = g.city, ym = g.ym(), old = rt.demo;
    if (old && old.city === city && old.ym === ym && old.version === city.version && old.pop === city.pop && old.jobs === city.jobs && old.region === city.region && old.regions === city.regions) return old.rows;
    const rows = {}, source = g.development && g.development.cities;
    for (const d of definitions) {
      const last = source && source[d.id] && source[d.id].last;
      // The ordinary development month already aggregates the whole physical
      // city, including areas the player has not unlocked. No traffic/OD work.
      if (last && last.ym <= ym && last.ym >= ym - 1 && Number.isFinite(last.pop) && Number.isFinite(last.jobs)) rows[d.id] = { pop: number(last.pop), jobs: number(last.jobs) };
    }
    if (definitions.some(d => !rows[d.id]) && city.pop && city.jobs && city.region) {
      const totals = Object.fromEntries(definitions.map(d => [d.id, { pop: 0, jobs: 0 }]));
      const regions = city.regions.map(r => !r.outside && r.cityId || null), host = city.scenicHost;
      for (let k = 0; k < city.N; k++) {
        let id = regions[city.region[k]];
        if (!id && host && host[k] !== 255) id = regions[host[k]];
        const row = totals[id]; if (row) { row.pop += number(city.pop[k]); row.jobs += number(city.jobs[k]); }
      }
      for (const d of definitions) if (!rows[d.id]) rows[d.id] = totals[d.id];
      rt.counts.demographicVisits += city.N; rt.counts.demographicScans++;
    }
    rt.demo = { city, ym, version: city.version, pop: city.pop, jobs: city.jobs, region: city.region, regions: city.regions, rows };
    return rows;
  }
  function assets(g, definitions) {
    const rt = runtime(g), old = rt.assets, net = g.net;
    if (old && old.net === net && old.version === g.netVersion) return old.rows;
    const rows = Object.fromEntries(['player'].concat(definitions.map(d => d.id)).map(id => [id, { lines: 0, stations: 0, large: 0, firstBuilt: Infinity }]));
    const active = new Set(), used = new Set();
    for (const segment of Object.values(net.segments || {})) {
      const line = net.lines[segment.line], a = net.stations[segment.a], b = net.stations[segment.b];
      if (!line || !a || !b || segment.a === segment.b) continue;
      active.add(segment.line); used.add(segment.a); used.add(segment.b); rt.counts.networkVisits++;
    }
    for (const id of active) { const row = rows[owner(net.lines[id])]; if (row) row.lines++; }
    for (const station of Object.values(net.stations || {})) {
      const row = rows[owner(station)]; rt.counts.networkVisits++; if (!row) continue;
      // All owned stops count towards the physical cap, but an isolated player
      // marker cannot increase the competitors' development target.
      if (owner(station) === 'player' && !used.has(station.id)) continue;
      row.stations++; if (CM.Metro.sizeAtLeast(station.size, 'L')) row.large++;
      const built = station.built;
      if (built && Number.isInteger(built[0]) && Number.isInteger(built[1]) && built[1] >= 1 && built[1] <= 12) {
        const ym = built[0] * 12 + built[1] - 1;
        if (ym >= 0 && ym <= g.ym()) row.firstBuilt = Math.min(row.firstBuilt, ym);
      }
    }
    rt.assets = { net, version: g.netVersion, rows }; return rows;
  }
  N.month = function (g) {
    if (!N.enabled(g)) return null;
    const rt = runtime(g), ym = g.ym(), old = rt.month;
    if (old && old.ym === ym && old.net === g.net && old.netVersion === g.netVersion && old.city === g.city && old.cityVersion === g.city.version && old.playerCity === CM.Operators.playerCity(g)) return old.value;
    const definitions = CM.Operators.DEFINITIONS, playerId = CM.Operators.playerCity(g);
    const demo = demographics(g, definitions), network = assets(g, definitions), player = network.player;
    const startYear = CM.CFG.START && CM.CFG.START.y || 1990;
    const observedMonths = Math.max(RULES.minimumObservationMonths, ym - (Number.isFinite(player.firstBuilt) ? player.firstBuilt : Math.min(ym, startYear * 12)) + 1);
    const playerInterval = player.lines ? observedMonths / player.lines : RULES.baseObservationMonths;
    const byId = {};
    for (const d of definitions) {
      if (d.id === playerId) continue;
      const local = demo[d.id], demand = number(local?.pop) + number(local?.jobs);
      const cityScale = clamp(Math.sqrt(demand / 1200000), .55, 1.5);
      const targetStations = clamp(Math.ceil(demand / RULES.peoplePerStation), 8, N.LIMITS.stationsPerCompany);
      const targetLines = Math.ceil(targetStations / 14);
      const own = network[d.id], annualStations = clamp(Math.round(3 + 2 * cityScale), 4, 6);
      byId[d.id] = { id: d.id, strength: d.strength, cityScale, targetLines, targetStations, lines: own.lines, stations: own.stations, annualStations };
    }
    const value = { ym, player: Object.assign({ observedMonths, interval: playerInterval }, player), byId, stationsTotal: Object.values(byId).reduce((sum, p) => sum + p.stations, 0) };
    rt.counts.snapshots++; rt.month = { ym, net: g.net, netVersion: g.netVersion, city: g.city, cityVersion: g.city.version, playerCity: playerId, value }; return value;
  };
  N.profile = (g, id) => { const month = N.month(g); return month && month.byId[id] || null; };
  N.duration = function (g, company, kind, stations) {
    const profile = N.profile(g, company.id);
    const months = clamp(Math.ceil((stations || 5) / Math.max(.8, profile?.cityScale || 1)) + 1, RULES.localMonthsMin, RULES.localMonthsMax);
    return months + (kind === 'cross' ? RULES.crossExtraMonths : 0);
  };
  N.priority = function (g, company) {
    const profile = N.profile(g, company.id);
    return profile ? Math.max(0, profile.targetStations - profile.stations) / profile.targetStations : 0;
  };
  N.nextProject = function (g, company) {
    const month = N.month(g), p = month && month.byId[company.id], projects = company.projects;
    if (!p || projects.some(project => project.phase !== 'open') || projects.length >= N.LIMITS.projectsPerCompany || p.stations + 2 > N.LIMITS.stationsPerCompany || month.stationsTotal + 2 > N.LIMITS.stationsTotal) return null;
    const local = projects.filter(project => project.kind === 'local' && project.phase === 'open').length;
    const cross = projects.filter(project => project.kind === 'cross').length;
    // A missing cross-city corridor is optional: the caller falls back to local
    // work, so an unavailable neighbour never becomes a permanent project cap.
    const requested = company.request && !projects.some(project => project.kind === 'cross' && project.target === company.request);
    const firstIntercity = cross === 0 && p.stations >= 4 && projects.some(project => project.phase === 'open' && project.opened <= month.ym - 12);
    if (p.lines > 0 && (requested || g.clock.y >= 2018 && (firstIntercity || local >= (cross + 1) * RULES.localsPerCross))) return 'cross';
    return p.stations < p.targetStations ? 'local' : null;
  };
  N.grants = function (g, id, costIndex) {
    const p = N.profile(g, id); if (!p) return { initial: 0, monthly: 0 };
    const ci = Number.isFinite(costIndex) && costIndex > 0 ? costIndex : 1, company = CM.Operators.company(g, id);
    const initial = Math.min(RULES.maxInitialGrant, RULES.initialGrant * p.strength + RULES.initialPerTargetLine * Math.max(0, p.targetLines - 1) * p.cityScale) * ci;
    const projects = company && company.projects || [], pending = projects.find(project => project.phase !== 'open'), latest = projects.at(-1);
    const estimated = number(pending && pending.estimate) || number(latest && latest.estimate) || RULES.defaultProjectCost * ci;
    const funds = company ? company.funds : initial;
    const last = company && (company.cur && company.cur.ym < g.ym() ? company.cur : company.history && company.history.at(-1));
    const deficit = last ? Math.max(0, number(last.ops) - number(last.fare)) : 0;
    const reserve = RULES.cashReserve * ci, fundingGap = pending ? Math.max(0, estimated + reserve - funds) : 0;
    const base = RULES.monthlyGrant * p.strength * ci * (1 + Math.min(4, Math.max(0, p.targetLines - 1) / 4));
    const required = base + fundingGap / Math.max(3, N.duration(g, { id }, pending && pending.kind) / 2) + deficit;
    const ceiling = Math.min(RULES.maxCashReserve * ci, Math.max(initial, estimated * RULES.cashProjects + reserve + deficit * 2));
    // No balance is overwritten and no player funds are read. Operators books
    // this finite grant once in the existing monthly ledger, including catch-up.
    return { initial, monthly: Math.max(0, Math.min(required, RULES.maxMonthlyGrant * p.cityScale * ci, ceiling - funds)) };
  };
  N.service = function (g, company) {
    const month = N.month(g), p = month && month.byId[company.id];
    return { stationSize: p && p.targetStations >= 36 && g.clock.y >= 2020 ? 'L' : 'M' };
  };
})(window.CM);
