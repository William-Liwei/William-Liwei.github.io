'use strict';
// Independently financed regional rail operators. All assets use the ordinary
// network, fleet and passenger solver. Dates/capital are explicitly game rules.
(function (CM) {
  const O = CM.Operators = {}, U = CM.U, CFG = CM.CFG, M = CM.Metro;
  const DEFINITIONS = O.DEFINITIONS = [
    { id: 'sh', name: '上海轨道公司', city: '上海', year: 1995, strength: 1.5, lat: 31.230, lon: 121.473, color: '#c04b4b', neighbors: ['sz','jx','nt'] },
    { id: 'sz', name: '苏州轨道公司', city: '苏州', year: 1998, strength: 1.25, lat: 31.306, lon: 120.619, color: '#a65384', neighbors: ['wx','jx','sh'] },
    { id: 'wx', name: '无锡轨道公司', city: '无锡', year: 2004, strength: 1.1, lat: 31.576, lon: 120.296, color: '#208f9e', neighbors: ['sz','cz'] },
    { id: 'jx', name: '嘉兴轨道公司', city: '嘉兴', year: 2007, strength: .85, lat: 30.753, lon: 120.755, color: '#ac7929', neighbors: ['sz','hu','sh'] },
    { id: 'cz', name: '常州轨道公司', city: '常州', year: 2009, strength: .82, lat: 31.780, lon: 119.969, color: '#6378b1', neighbors: ['wx'] },
    { id: 'nt', name: '南通轨道公司', city: '南通', year: 2012, strength: .75, lat: 32.010, lon: 120.864, color: '#518d51', neighbors: ['sz','sh'] },
    { id: 'hu', name: '湖州轨道公司', city: '湖州', year: 2014, strength: .65, lat: 30.865, lon: 120.105, color: '#aa664d', neighbors: ['jx','sz'] }
  ];
  const limits = CM.NPCProgression && CM.NPCProgression.LIMITS;
  const IDS = new Set(DEFINITIONS.map(d => d.id)), MAX_STATIONS = O.MAX_STATIONS = limits ? limits.stationsTotal : 48, MAX_PROJECTS = limits ? limits.projectsPerCompany : 2;
  const MAX_STOPS = 32, MONTHLY_ACTIONS = 4, DEMAND_GRID = 8, NEW_LINE_GROWTH = 0.12, COOPERATION_PAUSE = 6;
  O.MAX_COMPANY_STATIONS = limits ? limits.stationsPerCompany : MAX_STATIONS;
  const KINDS = ['grant', 'fare', 'ops', 'construction', 'fleet'];
  const runtime = new WeakMap();
  const defOf = id => DEFINITIONS.find(d => d.id === id);
  const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  const moneyFields = () => ({ grant: 0, fare: 0, ops: 0, construction: 0, fleet: 0 });
  const monthFields = ym => Object.assign({ ym }, moneyFields());
  O.owner = x => x && typeof x.ownerId === 'string' && x.ownerId ? x.ownerId : 'player';
  O.isPlayer = x => O.owner(x) === 'player';
  O.playerNetwork = function (net) {
    const lines = Object.fromEntries(Object.entries(net.lines).filter(([, x]) => O.isPlayer(x)));
    return { lines, segments: Object.fromEntries(Object.entries(net.segments).filter(([, x]) => lines[x.line])), stations: Object.fromEntries(Object.entries(net.stations).filter(([, x]) => O.isPlayer(x))), nextId: net.nextId };
  };
  O.enabled = g => !!g && g.mapId === 'sh' && !g.tutorial && g.city && g.city.regions.some(r => r.cityId === 'sz');
  O.attach = function (g) { if (g && g.city) Object.defineProperty(g.city, 'operatorGame', { value: g, configurable: true, writable: true, enumerable: false }); };
  const fresh = g => ({ v: 1, since: g.ym(), lastMonth: -1, lastDay: -1, lastBuild: -1, companies: {}, log: [], indexHistory: [] });
  O.ensure = function (g) { O.attach(g); if (O.enabled(g) && !g.operators) g.operators = fresh(g); return g.operators || null; };
  O.company = (g, id) => g.operators && g.operators.companies[id] || null;
  const emit = g => { if (g.touch) g.touch(); if (g.emit) g.emit('operators'); };
  const log = function (g, id, title, desc) {
    const s = O.ensure(g); if (!s) return;
    s.log.push({ ym: g.ym(), ownerId: id, title: title.slice(0, 120), desc: (desc || '').slice(0, 500) });
    if (s.log.length > 30) s.log.shift();
    if (g.logEvent) g.logEvent({ tag: '城市公司', title, desc: desc || '' }); emit(g);
  };
  function rotate(c, ym) { if (c.cur.ym === ym) return; c.history.push(c.cur); if (c.history.length > 24) c.history.shift(); c.cur = monthFields(ym); }
  function book(g, c, kind, amount, incoming) { rotate(c, g.ym()); c.funds += incoming ? amount : -amount; c.total[kind] += amount; c.cur[kind] += amount; }
  O.spend = function (g, id, kind, amount, note) {
    const c = O.company(g, id); if (!c || !KINDS.includes(kind) || !finite(amount, 0, 1e12) || c.funds - c.projects.filter(p => p.phase === 'building').reduce((a,p) => a + p.estimate, 0) + 1e-7 < amount) return false;
    book(g, c, kind, amount, false); if (note) c.note = String(note).slice(0, 180); return true;
  };
  O.dailyAccount = (daily, compiled, year, id) => CM.Economy.dailyAccount(daily, compiled, year, id);
  O.daily = function (g, daily, dt) {
    const s = O.ensure(g); if (!s) return;
    const day = g.clock.y * 372 + (g.clock.m - 1) * 31 + g.clock.d; if (s.lastDay === day) return; s.lastDay = day;
    for (const c of Object.values(s.companies)) {
      const a = O.dailyAccount(daily, g.compiled, g.clock.y, c.id);
      book(g, c, 'fare', a.fare, true); book(g, c, 'ops', a.ops, false);
      c.lastDay = { fare: a.fare, ops: a.ops, pkm: a.pkm, dt: dt === 'we' ? 'we' : 'wd' };
    }
    O.updateSatisfaction(g);
    if (CM.OperatorControls && CM.OperatorControls.recordMonth) CM.OperatorControls.recordMonth(g);
  };
  O.playerCity = g => g.playerCity || 'sh';
  O.cityAt = function (g, cell) {
    const city = g.city; if (!integer(cell, 0, city.N - 1)) return null;
    const r = city.regions[city.region[cell]];
    if (r && r.cityId) return r.cityId;
    const k = city.lockRegion ? city.lockRegion(cell) : -1, base = city.regions[k]; return base && base.cityId || null;
  };
  O.canBuildCell = function (g, cell, id, previewPermit = false) {
    if (!g || !g.city || !integer(cell, 0, g.city.N - 1)) return false;
    if (!id || id === 'player') return !g.city.cellLocked(cell);
    const d = defOf(id); if (!d || id === O.playerCity(g) || !O.enabled(g) || g.clock.y < d.year) return false;
    if (g.city.landFrac[cell] < .1) return true; // Geography, bridge/tunnel and station checks still apply.
    const cityId = O.cityAt(g, cell); if (cityId === id) return true;
    if (g.clock.y < 2018 || !d.neighbors.includes(cityId)) return false;
    return cityId !== O.playerCity(g) || g.clock.y >= 2025 && (previewPermit || !!O.company(g, id)?.crossPermit);
  };
  O.cityView = function (g, id, previewPermit = false) {
    O.attach(g); if (!id || id === 'player') return g.city;
    let r = runtime.get(g); if (!r) { r = { views: new Map() }; runtime.set(g, r); }
    const key = id + ':' + g.ym() + ':' + O.playerCity(g) + ':' + (previewPermit || O.company(g, id)?.crossPermit ? 1 : 0), old = r.views.get(id);
    if (old && old.permissionKey === key) return old;
    const view = Object.create(g.city); view.operatorOwnerId = id; view.permissionKey = key;
    view.cellLocked = c => !O.canBuildCell(g, c, id, previewPermit); view.lockText = () => '不在该公司当前可建设的城市范围';
    r.views.set(id, view); return view;
  };
  O.developmentRegions = function (g) {
    if (!O.enabled(g)) return null;
    return g.city.regions.map(r => { const d = defOf(r.cityId); return !!d && r.cityId !== O.playerCity(g) && g.clock.y >= d.year; });
  };
  O.agreed = (g, id, stationId) => { const c = O.company(g, id); return !!c && c.agreements.includes(stationId); };
  O.accessStatus = function (g, id, stationId) {
    const c = O.company(g, id), st = g.net.stations[stationId];
    if (!c || !st || O.owner(st) !== id) return { ok: false, error: '请选择该公司的已建车站' };
    const cell = g.city.cellAt(st.x, st.y);
    if (cell < 0 || g.city.cellLocked(cell)) return { ok: false, error: '车站所在区域尚未向玩家开放建设' };
    if (!Object.values(g.net.segments).some(s => (s.a === stationId || s.b === stationId) && O.owner(g.net.lines[s.line]) === id)) return { ok: false, error: '请等待该公司车站接入线路并开通' };
    return { ok: true };
  };
  O.agree = function (g, id, stationId) {
    const status = O.accessStatus(g, id, stationId); if (!status.ok) return status;
    const c = O.company(g, id);
    if (!c.agreements.includes(stationId)) c.agreements.push(stationId);
    emit(g); return { ok: true };
  };
  O.connectionStatus = function (g, id, stationId, playerStops) {
    const c = O.company(g, id), st = g.net.stations[stationId];
    if (!c || !st || !O.isPlayer(st)) return { ok: false, error: '请选择自己的已建车站' };
    const connected = playerStops ? playerStops.has(stationId) : Object.values(g.net.segments).some(s => (s.a === stationId || s.b === stationId) && O.isPlayer(g.net.lines[s.line]));
    if (!connected) return { ok: false, error: '请选择已接入本公司线路的运营车站' };
    const targetCity = O.cityAt(g, g.city.cellAt(st.x, st.y)), d = defOf(id);
    const allowedYear = targetCity === id ? d?.year : targetCity === O.playerCity(g) ? 2025 : 2018;
    if (!d || targetCity !== id && !d.neighbors.includes(targetCity)) return { ok: false, error: '请选择该公司所在城市或相邻城市内的已建车站', targetCity, allowedYear };
    if (g.clock.y < allowedYear) return { ok: false, error: allowedYear + ' 年起可邀请该公司建设接驳线', targetCity, allowedYear };
    if (c.projects.some(p => p.kind === 'cross' && p.phase !== 'open')) return { ok: false, error: '该公司的接驳工程已在推进，请等待当前工程开通', targetCity, allowedYear };
    if (c.projects.some(p => p.kind === 'cross' && p.phase === 'open' && p.target === stationId)) return { ok: false, error: '该公司已经开通通往这座车站的接驳线', targetCity, allowedYear };
    return { ok: true, targetCity, allowedYear };
  };
  O.requestConnection = function (g, id, stationId) {
    const status = O.connectionStatus(g, id, stationId); if (!status.ok) return status;
    const c = O.company(g, id), st = g.net.stations[stationId];
    c.request = stationId; c.offer = null; delete c.deferred;
    if (status.targetCity === O.playerCity(g)) c.crossPermit = true;
    log(g, id, defOf(id).name + '收到接驳申请', '将评估连接「' + st.name + '」的联运换乘，建设和列车由该公司出资。'); return { ok: true };
  };
  O.deferred = (g, c) => c.deferred?.until > g.ym() ? c.deferred : null;
  O.deferConnection = function (g, id) {
    const c = O.company(g, id), station = c?.offer;
    if (!station || !O.connectionStatus(g, id, station).ok) return { ok: false, error: '该接驳提案已失效' };
    c.offer = null;
    c.deferred = { station, until: g.ym() + COOPERATION_PAUSE };
    log(g, id, defOf(id).name + '继续自主建设', '暂缓联运合作六个月，对方可继续争取这一带的客流。');
    return { ok: true };
  };
  const noWorks = [];
  // Both the map preview and the geometry checks use the booked alignment.
  O.constructionWorks = function (g) {
    if (!g.operators || !O.enabled(g)) return noWorks;
    const r = runtime.get(g) || { views: new Map() };
    runtime.set(g, r);
    if (!r.works) {
      r.works = [];
      for (const c of Object.values(g.operators.companies)) for (const p of c.projects) {
        if (p.phase !== 'building') continue;
        // Older saves stored the station alignment only.
        const tracks = p.tracks || p.points.slice(1).map((end, i) => [[p.points[i].x, p.points[i].y], [end.x, end.y]]);
        r.works.push({ project: p, name: defOf(c.id).name, color: defOf(c.id).color, points: p.points, tracks, bounds: tracks.map(pathBox), trackType: p.trackType || 'underground' });
      }
    }
    return r.works;
  };
  function invalidateWorks(g) { const r = runtime.get(g); if (r) r.works = null; }
  O.fundingPreview = function (g, id, projectId) {
    const project = O.company(g, id)?.projects.find(p => p.id === projectId && p.phase === 'funding');
    if (!project) return null;
    const tracks = project.points.slice(1).map((p, i) => [[project.points[i].x, project.points[i].y], [p.x, p.y]]);
    return { color: defOf(id).color, points: project.points, tracks, bounds: tracks.map(pathBox), trackType: project.trackType || 'underground' };
  };
  const pathBoxes = new WeakMap();
  function pathBox(path) {
    let box = pathBoxes.get(path);
    if (box) return box;
    box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of path) {
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
    }
    pathBoxes.set(path, box); return box;
  }
  function nearBox(a, b, clearance) {
    return a[0] <= b[2] + clearance && a[2] >= b[0] - clearance && a[1] <= b[3] + clearance && a[3] >= b[1] - clearance;
  }
  function nearEdge(a, b, c, d, clearance) {
    if (Math.max(a[0], b[0]) + clearance < Math.min(c[0], d[0]) || Math.min(a[0], b[0]) - clearance > Math.max(c[0], d[0]) ||
      Math.max(a[1], b[1]) + clearance < Math.min(c[1], d[1]) || Math.min(a[1], b[1]) - clearance > Math.max(c[1], d[1])) return false;
    return U.segIntersect(...a, ...b, ...c, ...d) || U.distToSeg(...a, ...c, ...d) < clearance || U.distToSeg(...b, ...c, ...d) < clearance ||
      U.distToSeg(...c, ...a, ...b) < clearance || U.distToSeg(...d, ...a, ...b) < clearance;
  }
  function trackHit(points, work, a, b) {
    const clearance = 60 / CFG.CELL_M, sharedRadius = Math.max(CFG.metro.platformHalfM * 2, 150) / CFG.CELL_M;
    const shared = work.points.filter(p => p.stationId && (p.stationId === a || p.stationId === b));
    for (const track of work.tracks) {
      if (!nearBox(pathBox(points), pathBox(track), clearance)) continue;
      for (let i = 1; i < points.length; i++) for (let j = 1; j < track.length; j++) {
        const p = points[i - 1], q = points[i], s = track[j - 1], t = track[j];
        if (!nearEdge(p, q, s, t, clearance)) continue;
        if (shared.some(st => [p, q, s, t].every(pt => U.dist(st.x, st.y, ...pt) < sharedRadius))) continue;
        return points[i];
      }
    }
    return null;
  }
  O.constructionConflict = function (g, draft, baseline, excluded, works = O.constructionWorks(g)) {
    if (!works.length) return null;
    const stationClearance = Math.max(CFG.metro.minSpacingM, 250) / CFG.CELL_M;
    const conflict = (work, kind, ref, x, y) => ({ type: 'constructionReservation', kind, ref, x, y,
      msg: '与' + work.name + '的施工预留冲突', how: '请错开施工站位或改走不同层的轨道。地图上的虚线标出了预留线路。' });
    return M.withSegIndex([draft, baseline], function () {
      for (const work of works) {
        if (excluded && work.project === excluded) continue;
        const trackType = work.trackType || 'underground';
        for (const [id, station] of Object.entries(draft.stations)) {
          if (station.v) continue;
          const old = baseline.stations[id], moved = !old || old.x !== station.x || old.y !== station.y;
          if (!moved && old.type === station.type) continue;
          const { x, y } = station;
          const shared = work.points.find(p => p.stationId === id);
          if (shared && !old) continue;
          if (shared || work.points.some(p => U.dist(x, y, p.x, p.y) < stationClearance) ||
            station.type === trackType && work.tracks.some(path => U.distToPoly(x, y, path) < 100 / CFG.CELL_M)) return conflict(work, 'station', id, x, y);
        }
        for (const point of work.points) if (point.stationId && baseline.stations[point.stationId] && !draft.stations[point.stationId]) {
          return conflict(work, 'station', null, point.x, point.y);
        }
        for (const segment of Object.values(draft.segments)) {
          if (segment.type !== trackType) continue;
          const old = baseline.segments[segment.id], a = draft.stations[segment.a], b = draft.stations[segment.b];
          const compiled = g.compiled?.net === g.net ? g.compiled.segs : null;
          const geometry = (draft === g.net && compiled?.get(segment.id)?.g) || M.segGeom(draft, segment, g.city);
          const previous = old && old.type === segment.type && ((baseline === g.net && compiled?.get(old.id)?.g) || M.segGeom(baseline, old, g.city));
          if (previous && geometry.pts === previous.pts) continue;
          const box = pathBox(geometry.pts), stationRadius = 100 / CFG.CELL_M;
          if (work.points.some(p => p.stationId !== a.id && p.stationId !== b.id && nearBox(box, [p.x, p.y, p.x, p.y], stationRadius) && U.distToPoly(p.x, p.y, geometry.pts) < stationRadius)) {
            return conflict(work, 'seg', segment.id, a.x, a.y);
          }
          const hit = trackHit(geometry.pts, work, segment.a, segment.b);
          if (hit) return conflict(work, 'seg', segment.id, ...hit);
        }
      }
      return null;
    });
  };
  const emptyNetwork = { stations: {}, segments: {}, lines: {} };
  function candidateSite(g, view, x, y, owner, used, homeOnly) {
    let best = null, score = -Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const px = x + dx, py = y + dy, c = g.city.cellAt(px, py);
      if (c < 0 || view.cellLocked(c) || homeOnly && O.cityAt(g, c) !== owner || !M.checkSite(view, px, py, 'underground').ok) continue;
      if (CM.Property && CM.Property.find && CM.Property.find(g, c)?.owned) continue;
      if (used.some(s => U.dist(s.x, s.y, px, py) * CFG.CELL_M < Math.max(250, CFG.metro.minSpacingM))) continue;
      const val = Math.log1p(g.city.pop[c] + g.city.jobs[c]) - Math.hypot(dx, dy) * .8;
      if (val > score) { score = val; best = { x: +px.toFixed(3), y: +py.toFixed(3) }; }
    }
    return best;
  }
  function evaluatePoints(g, c, points, kind, target, extension, project, trackType = 'underground', previewView = null) {
    const view = previewView || O.cityView(g, c.id), draft = M.clone(g.net);
    if (extension && (!draft.lines[extension] || O.owner(draft.lines[extension]) !== c.id)) return null;
    const lid = extension || M.newLine(draft, defOf(c.id).city + (kind === 'cross' ? '联络线' : '城区线'));
    if (!extension) { draft.lines[lid].ownerId = c.id; draft.lines[lid].color = defOf(c.id).color; }
    if (extension) {
      const terminal = points[0].stationId;
      const adjacent = Object.values(g.net.segments).find(s => s.line === extension && (s.a === terminal || s.b === terminal));
      if (!adjacent || M.platformDir(g.net, terminal, extension) == null) {
        if (!adjacent) return null;
        const [dx, dy] = M.stationTangent(g.net, adjacent, terminal);
        M.setPlatformDir(draft, terminal, extension, Math.atan2(dy, dx));
      }
    }
    const service = CM.NPCProgression && CM.NPCProgression.service ? CM.NPCProgression.service(g, c) : null;
    const size = service && service.stationSize === 'L' ? 'L' : 'M';
    const ids = [];
    const stops = [], segments = [];
    for (const p of points) {
      if (p.stationId) { const st = draft.stations[p.stationId]; if (!st || U.dist(st.x,st.y,p.x,p.y) > .01 || view.cellLocked(g.city.cellAt(p.x,p.y)) || kind !== 'cross' && O.owner(st) !== c.id || O.isPlayer(st) && (previewView ? target : c.request) !== st.id) return null; stops.push(st.id); continue; }
      const id = M.addStation(draft, p.x, p.y, { size, type: trackType }, view); draft.stations[id].ownerId = c.id; ids.push(id); stops.push(id);
    }
    for (let i = 1; i < stops.length; i++) {
      const added = M.addSegment(draft, lid, stops[i - 1], stops[i], [], trackType);
      if (!added.id) return null;
      segments.push(added.id);
    }
    // A shared station gains a paid platform if needed for
    // this line. Its original company keeps the station and all other platforms.
    for (const point of points) if (point.stationId && M.platType(draft.stations[point.stationId], lid) !== trackType) {
      const station = draft.stations[point.stationId]; station.lv = Object.assign({}, station.lv, { [lid]: trackType });
    }
    const ev = M.evaluate(draft, g.net, view, g.clock.y);
    // The evaluator also reports existing lines made incompatible by later
    // landmarks, permits or rules. They must not veto an unrelated new company
    // corridor. Keep every check touching this project's new or shared assets,
    // including spacing against an existing player station and endpoint works.
    const projectRefs = new Set([lid, ...stops]);
    for (const [sid, seg] of Object.entries(draft.segments)) if (!g.net.segments[sid]) projectRefs.add(sid);
    ev.conflicts = ev.conflicts.filter(x => !x.ref || projectRefs.has(x.ref) || projectRefs.has(x.ref2));
    if (ev.demolitions.some(x => CM.Property && CM.Property.find(g, x.c) && CM.Property.find(g, x.c).owned)) return null;
    if (ev.conflicts.length || !(ev.total > 0) || !Number.isFinite(ev.total)) return null;
    if (O.constructionConflict(g, draft, g.net, project)) return null;
    const tracks = M.withSegIndex([draft], () => segments.map(id => M.segGeom(draft, draft.segments[id], view).pts));
    const works = [{ name: defOf(c.id).name, points, tracks, trackType }];
    if (O.constructionConflict(g, g.net, emptyNetwork, null, works) ||
      g.draft && O.constructionConflict(g, g.draft.net, g.net, null, works)) return null;
    const C = M.compile(draft, view), quote = CM.Fleet && CM.Fleet.quoteOwned ? CM.Fleet.quoteOwned(g, C, c.id, [lid]) : null;
    if (!quote || !C.routes.some(route => route.lineId === lid) || (!extension && !quote.trains.length)) return null;
    return { draft, lid, ids, ev, C, quote, cost: ev.total + quote.cost, kind, target: target || null, points, tracks, trackType, extension: extension || null };
  }
  // Read the real demand grid once per city revision. Every tile contributes a
  // potential station in its strongest cell and the surrounding catchment mass.
  function demandTiles(g) {
    const r = runtime.get(g) || { views: new Map() }, city = g.city, old = r.demand;
    runtime.set(g, r);
    if (old && old.city === city && old.version === city.version && old.pop === city.pop && old.jobs === city.jobs) return old.byCity;
    const byCity = Object.fromEntries(DEFINITIONS.map(d => [d.id, new Map()]));
    const across = Math.ceil(city.W / DEMAND_GRID);
    for (let y = 0; y < city.H; y++) for (let x = 0; x < city.W; x++) {
      const cell = y * city.W + x, region = city.regions[city.region[cell]], table = byCity[region?.cityId];
      const demand = (city.pop[cell] || 0) + (city.jobs[cell] || 0);
      if (!table || region.outside || demand <= 0 || city.landFrac[cell] < 0.5) continue;
      const key = Math.floor(y / DEMAND_GRID) * across + Math.floor(x / DEMAND_GRID);
      let tile = table.get(key);
      if (!tile) { tile = { x: x + .5, y: y + .5, mass: 0, peak: 0 }; table.set(key, tile); }
      tile.mass += demand;
      if (demand > tile.peak) { tile.peak = demand; tile.x = x + .5; tile.y = y + .5; }
    }
    r.demand = { city, version: city.version, pop: city.pop, jobs: city.jobs, byCity };
    return byCity;
  }
  function localDemand(g, id, used) {
    const catchment = Math.max(1000, CFG.walk.maxAccessM) / CFG.CELL_M;
    const sites = [];
    for (const tile of demandTiles(g)[id].values()) {
      let own = Infinity, rival = Infinity;
      for (const st of used) {
        if (st.v) continue;
        const distance = U.dist(tile.x, tile.y, st.x, st.y);
        if (O.owner(st) === id) own = Math.min(own, distance);
        else rival = Math.min(rival, distance);
      }
      // Favor underserved settlements. A well-served rival district is still
      // worth reaching if its catchment has sufficient demand for two services.
      const demand = tile.mass * Math.min(1, own / catchment) * (rival < catchment ? .72 : 1);
      if (own >= catchment * .7) sites.push({ x: tile.x, y: tile.y, demand });
    }
    return sites.sort((a, b) => b.demand - a.demand);
  }
  function proposeConnections(g) {
    const stations = Object.values(g.net.stations).filter(s => !s.v);
    if (!stations.some(O.isPlayer) || !stations.some(s => !O.isPlayer(s))) return;
    const playerStops = new Set();
    for (const seg of Object.values(g.net.segments)) if (O.isPlayer(g.net.lines[seg.line])) { playerStops.add(seg.a); playerStops.add(seg.b); }
    if (!playerStops.size) return;
    const tiles = demandTiles(g);
    for (const c of Object.values(g.operators.companies)) {
      if (c.request || O.deferred(g, c) || c.projects.some(p => p.kind === 'cross' && p.phase !== 'open')) continue;
      const home = stations.filter(s => O.owner(s) === c.id);
      let best = null, score = 0;
      if (home.length) for (const station of stations) {
        if (!O.isPlayer(station)) continue;
        const status = O.connectionStatus(g, c.id, station.id, playerStops);
        if (!status.ok) continue;
        const distance = home.reduce((d, s) => { const sep = U.dist(s.x, s.y, station.x, station.y); return sep >= 3 ? Math.min(d, sep) : d; }, Infinity);
        if (distance > 120) continue;
        let demand = 0;
        for (const tile of tiles[status.targetCity]?.values() || []) if (U.dist(tile.x, tile.y, station.x, station.y) < 12) demand += tile.mass;
        const merit = demand / (12 + distance);
        if (merit > score) { score = merit; best = station; }
      }
      if (best && best.id !== c.offer) log(g, c.id, defOf(c.id).name + '有意接入「' + best.name + '」', '可在公司页面同意接驳，由对方筹资和施工。');
      c.offer = best?.id || null;
    }
  }
  function localTerminals(g, id) {
    const out = [];
    for (const line of Object.values(g.net.lines)) {
      if (O.owner(line) !== id) continue;
      const topo = g.compiled?.topo?.get(line.id) || M.lineTopo(g.net, line.id);
      if (topo.topo !== 'path' && topo.topo !== 'branch') continue;
      for (const stationId of topo.leaves || []) {
        const st = g.net.stations[stationId];
        const adjacent = topo.adj?.get(stationId)?.[0]?.seg;
        if (!st || !adjacent || O.cityAt(g, g.city.cellAt(st.x, st.y)) !== id) continue;
        const [x, y] = M.adjCtrl(g.net, adjacent, stationId);
        out.push({ x: st.x, y: st.y, stationId, line: line.id, approach: { x, y }, trackType: adjacent.type });
      }
    }
    return out;
  }
  // Greedily connect the preselected stations with a single trunk. Try several
  // starting points; reject big jumps or reversals before the full rail check.
  function connectSites(first, sites, limit, next) {
    const route = next ? [first, next] : [first];
    let score = (first.demand || 0) + (next?.demand || 0) * 12 / (6 + (next ? U.dist(first.x, first.y, next.x, next.y) : 0));
    while (route.length < limit) {
      const a = route[route.length - 1], prev = route[route.length - 2] || first.approach;
      let best, merit = 0;
      for (const b of sites) {
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        if (len < 3 || len > 27 || route.some(p => U.dist(p.x, p.y, b.x, b.y) < 3)) continue;
        if (prev && (dx * (a.x - prev.x) + dy * (a.y - prev.y)) < 0) continue;
        const value = b.demand / (6 + len);
        if (value > merit) { best = b; merit = value; }
      }
      if (!best) break;
      route.push(best);
      score += merit * 12;
    }
    return { points: route.map(({ x, y, stationId }) => ({ x, y, ...(stationId ? { stationId } : {}) })), score, extension: first.line || null, trackType: first.trackType };
  }
  function extendSites(terminal, sites, limit) {
    const result = [];
    const { x, y, approach } = terminal;
    for (const next of sites.filter(p => {
      const distance = U.dist(x, y, p.x, p.y);
      return distance >= 3 && distance <= 33 && (p.x - x) * (x - approach.x) + (p.y - y) * (y - approach.y) >= 0;
    }).slice(0, 5)) {
      const connected = connectSites(terminal, sites, limit, next);
      result.push(connected);
      if (connected.points.length > 2) result.push({ ...connected, points: connected.points.slice(0, 2), score: next.demand });
    }
    return result;
  }
  function planLocal(g, c, view, used, excluded) {
    const local = c.projects.filter(p => p.kind === 'local' && p.phase === 'open');
    const lastNewLine = local.filter(p => !p.extension).at(-1);
    const recent = local.filter(p => p.opened > g.ym() - 12).reduce((sum, p) => sum + p.points.filter(q => !q.stationId).length, 0);
    const profile = CM.NPCProgression?.profile(g, c.id), annual = profile?.annualStations || 6;
    const capacity = Math.min(O.MAX_COMPANY_STATIONS - (profile?.stations || 0), MAX_STATIONS - (CM.NPCProgression?.month(g)?.stationsTotal || 0));
    const limit = Math.min(MAX_STOPS, capacity, local.length ? annual - recent : Math.max(8, annual));
    if (limit < 1) return null;
    const sites = localDemand(g, c.id, used);
    const unmet = sites.reduce((sum, s) => sum + s.demand, 0);
    const rival = g.net.stations[O.deferred(g, c)?.station];
    if (rival) {
      // Compete for the nearby catchment with the company's ordinary budget
      // and legal sites. Keep the underlying demand baseline for growth.
      for (const site of sites) site.demand *= 1 + .35 * Math.max(0, 1 - U.dist(rival.x, rival.y, site.x, site.y) / 32);
      sites.sort((a, b) => b.demand - a.demand);
    }
    const planned = [];
    const occupied = used.concat(O.constructionWorks(g).filter(w => w.project !== excluded).flatMap(w => w.points));
    for (const site of sites.slice(0, 64)) {
      if (planned.some(p => U.dist(p.x, p.y, site.x, site.y) < 3)) continue;
      const position = candidateSite(g, view, site.x, site.y, c.id, occupied.concat(planned), true);
      if (position) planned.push({ ...position, demand: site.demand });
      if (planned.length >= MAX_STOPS) break;
    }
    const evaluate = (candidates, fallbackType) => {
      candidates.sort((a, b) => b.points.length - a.points.length || b.score - a.score);
      for (const cnd of candidates.slice(0, 10)) {
        const result = evaluatePoints(g, c, cnd.points, 'local', null, cnd.extension, excluded, cnd.trackType || fallbackType);
        if (result) return Object.assign(result, { score: cnd.score, unmet });
      }
      return null;
    };
    const extensions = localTerminals(g, c.id).flatMap(t => extendSites(t, planned, Math.min(MAX_STOPS, limit + 1)));
    const extension = evaluate(extensions);
    const growthReached = lastNewLine?.demandAfter > 0 && unmet >= lastNewLine.demandAfter * (1 + NEW_LINE_GROWTH);
    if (limit < 4 || extension && !growthReached || lastNewLine?.demandAfter > 0 && !growthReached) return extension;
    const routes = [];
    for (const first of planned.slice(0, 12)) {
      const options = planned.map(next => ({ next, distance: U.dist(first.x, first.y, next.x, next.y) }))
        .filter(s => s.distance >= 3 && s.distance <= 27)
        .sort((a, b) => b.next.demand / (6 + b.distance) - a.next.demand / (6 + a.distance));
      for (const { next } of options.slice(0, 3)) {
        const route = connectSites(first, planned, limit, next);
        if (route.points.length >= 3) routes.push(route);
      }
    }
    // If the full route cannot fit, preserve a connected section. Three stops
    // can seed a new trunk that is extended as other sites become available.
    const shorter = routes.filter(r => r.points.length > 3).map(r => ({ ...r, points: r.points.slice(0, 3) }));
    const newLine = evaluate(routes) || evaluate(shorter) || evaluate(routes, 'elevated') || evaluate(shorter, 'elevated');
    if (extension && (!newLine || newLine.score < extension.score * 1.4)) return extension;
    return newLine;
  }
  function planThroughStation(g, c, view, target, used, reserved, excluded, preview) {
    const stop = { x: target.x, y: target.y, stationId: target.id };
    const terminals = localTerminals(g, c.id).filter(t => {
      const distance = U.dist(t.x, t.y, stop.x, stop.y);
      return distance >= 3 && distance <= 27 &&
        (stop.x - t.x) * (t.x - t.approach.x) + (stop.y - t.y) * (t.y - t.approach.y) > 0;
    });
    if (!terminals.length) return null;
    const sites = localDemand(g, c.id, used).filter(s => U.dist(s.x, s.y, stop.x, stop.y) <= 30);
    const candidates = [];
    const occupied = used.concat(reserved);
    for (const site of sites.slice(0, 12)) {
      const next = candidateSite(g, view, site.x, site.y, c.id, occupied, true);
      if (!next) continue;
      const onward = U.dist(stop.x, stop.y, next.x, next.y);
      if (onward < 3 || onward > 27) continue;
      for (const terminal of terminals) {
        const approach = U.dist(terminal.x, terminal.y, stop.x, stop.y);
        const dot = (stop.x - terminal.x) * (next.x - stop.x) + (stop.y - terminal.y) * (next.y - stop.y);
        if (dot < .5 * approach * onward) continue;
        candidates.push({ terminal, next, score: site.demand / (6 + approach + onward) });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const attempted = new Set();
    for (const { terminal, next } of candidates) {
      const key = `${terminal.line}:${terminal.stationId}:${next.x}:${next.y}`;
      if (attempted.has(key)) continue;
      if (attempted.size >= 6) break;
      attempted.add(key);
      const first = { x: terminal.x, y: terminal.y, stationId: terminal.stationId };
      const plan = evaluatePoints(g, c, [first, stop, next], 'cross', stop.stationId, terminal.line, excluded, terminal.trackType, preview ? view : null);
      if (plan) return plan;
    }
    return null;
  }
  function planCross(g, c, view, used, excluded, previewStation) {
    const id = c.id, requested = previewStation || c.request;
    const home = used.filter(s => O.owner(s) === id && !s.v);
    if ((!requested && g.clock.y < 2018) || !home.length) return null;
    const targets = used.filter(s => !s.v && O.owner(s) !== id && (requested ? s.id === requested : O.owner(s) !== 'player') &&
      !view.cellLocked(g.city.cellAt(s.x, s.y)) && (!O.isPlayer(s) || previewStation || O.connectionStatus(g, id, s.id).ok || excluded?.target === s.id) &&
      !c.projects.some(p => p !== excluded && p.phase === 'open' && p.target === s.id));
    const reserved = O.constructionWorks(g).filter(w => w.project !== excluded).flatMap(w => w.points);
    if (requested && targets.length) {
      const through = planThroughStation(g, c, view, targets[0], used, reserved, excluded, previewStation);
      if (through) return through;
    }
    const districts = demandTiles(g);
    const market = st => {
      const owner = O.isPlayer(st) ? O.cityAt(g, g.city.cellAt(st.x, st.y)) : O.owner(st);
      let need = 0;
      for (const tile of districts[owner]?.values() || []) if (U.dist(st.x, st.y, tile.x, tile.y) < DEMAND_GRID * 1.5) need += tile.mass;
      return need;
    };
    const pairs = [];
    for (const b of targets) {
      const demand = market(b);
      for (const a of home) {
        const dist = U.dist(a.x, a.y, b.x, b.y);
        if (dist > 4 && dist < 240) pairs.push({ a, b, dist, score: Math.log1p(demand) / (10 + dist) });
      }
    }
    pairs.sort((a, b) => b.score - a.score || a.dist - b.dist);
    for (const pair of pairs.slice(0, 16)) {
      const preferred = Math.max(3, Math.min(10, Math.round(pair.dist / 12) + 1));
      for (const stopCount of new Set([preferred, Math.min(preferred, 4), 3, 2])) {
        const points = [{ x: pair.a.x, y: pair.a.y, stationId: pair.a.id }];
        for (let i = 1; i < stopCount - 1; i++) {
          const t = i / (stopCount - 1), x = U.lerp(pair.a.x, pair.b.x, t), y = U.lerp(pair.a.y, pair.b.y, t);
          const p = candidateSite(g, view, x, y, id, used.concat(reserved, points), false); if (!p) break;
          points.push(p);
        }
        if (points.length !== stopCount - 1) continue;
        points.push({ x: pair.b.x, y: pair.b.y, stationId: pair.b.id });
        const result = evaluatePoints(g, c, points, 'cross', pair.b.id, null, excluded, 'underground', previewStation ? view : null);
        if (result) return result;
      }
    }
    return null;
  }
  O.plan = function (g, id, kind, excluded) {
    const c = O.company(g, id); if (!c || !defOf(id)) return null;
    const view = O.cityView(g, id), used = Object.values(g.net.stations);
    return kind === 'cross' ? planCross(g, c, view, used, excluded) : planLocal(g, c, view, used, excluded);
  };
  O.previewConnection = function (g, id, stationId) {
    const status = O.connectionStatus(g, id, stationId);
    if (!status.ok) return status;
    const c = O.company(g, id), view = O.cityView(g, id, status.targetCity === O.playerCity(g));
    const plan = planCross(g, c, view, Object.values(g.net.stations), null, stationId);
    if (!plan) return { ok: false, error: '目前没有通过建设校验的接驳走廊。' };
    return { ok: true, stationId, color: defOf(id).color, points: plan.points, tracks: plan.tracks,
      bounds: plan.tracks.map(pathBox), trackType: plan.trackType, extension: plan.extension, estimate: plan.cost,
      months: CM.NPCProgression?.duration(g, c, 'cross', plan.ids.length) || 30 };
  };
  function startProject(g, c, plan) {
    const p = { id: c.id + ':' + (c.projects.length + 1), kind: plan.kind, phase: 'funding', points: plan.points, target: plan.target,
      proposed: g.ym(), start: -1, due: -1, opened: -1, estimate: plan.cost, construction: 0, fleet: 0, line: null, extension: plan.extension || null, trackType: plan.trackType };
    c.projects.push(p); c.note = '筹资中';
    log(g, c.id, defOf(c.id).city + (p.kind === 'cross' ? '联络线' : '城区线') + '开始筹资', '概算 ' + U.fmtMoney(p.estimate) + '，独立公司资金；时间与走廊为模拟规划。'); return p;
  }
  // Informational city score only: never books money, alters project gates,
  // valuation, grants or company survival. NPC home permissions ignore player locks.
  O.updateSatisfaction = function (g) {
    const P = CM.PlayerMetrics, E = CM.Economy, state = g.operators;
    if (!state || !P || !P.company || !E || !E.cityTarget) return;
    const ym = g.ym();
    for (const c of Object.values(state.companies)) {
      if (c.satYM === ym) continue;
      const daily = P.company(g, c.id), score = E.cityTarget(daily, g.clock.y, g.clock.m);
      if (!score) continue;
      c.sat = U.clamp((Number.isFinite(c.sat) ? c.sat : CFG.economy.startSat) * .75 + score.target * .25, 0, 100);
      c.satYM = ym;
    }
  };
  // Process companies in sequence so every plan sees earlier work.
  function advanceOne(g, onlyOverdue, acted) {
    const s = g.operators, ym = g.ym(), ci = g.econ.costIndex(g.clock.y), policy = CM.NPCProgression;
    if (!CM.Fleet || !CM.Fleet.quoteOwned) return;
    const count = Object.values(g.net.stations).filter(st => !O.isPlayer(st)).length;
    const entries = DEFINITIONS.map((d, index) => ({ d, index, c: s.companies[d.id] })).filter(x => x.c);
    entries.forEach(x => { x.p = x.c.projects.find(p => p.phase !== 'open'); });
    entries.sort((a, b) => { const ad = a.p && a.p.phase === 'building' && a.p.due <= ym, bd = b.p && b.p.phase === 'building' && b.p.due <= ym; return Number(bd) - Number(ad) || (ad && bd ? a.p.due - b.p.due : 0) || (policy && policy.priority ? policy.priority(g, b.c) - policy.priority(g, a.c) : 0) || a.index - b.index; });
    for (const entry of entries) {
      const d = entry.d, c = entry.c; let p = entry.p;
      if (acted.has(c.id)) continue;
      if (onlyOverdue && (!p || p.phase !== 'building' || p.due > ym)) continue;
      if (!p) {
        if (c.projects.length >= MAX_PROJECTS || count + 4 > MAX_STATIONS) continue;
        const kind = policy && policy.nextProject ? policy.nextProject(g, c) : c.projects.length ? 'cross' : 'local';
        const localFirst = kind !== 'local' && !c.request && !!O.deferred(g, c);
        if (!kind && !localFirst) continue;
        const canCross = kind !== 'cross' || (g.clock.y >= 2018 || c.request) && (policy || ym >= c.projects[0].opened + 36);
        const plan = (localFirst && O.plan(g, c.id, 'local')) || (kind && canCross && O.plan(g, c.id, kind)) ||
          (policy && kind === 'cross' && !localFirst ? O.plan(g, c.id, 'local') : null);
        if (!plan) { c.note = '等待合适走廊与可建设场地'; continue; }
        startProject(g, c, plan); return c.id;
      }
      if (p.phase === 'building' && (ym < p.due || g.draft)) continue;
      const plan = evaluatePoints(g, c, p.points, p.kind, p.target, p.extension, p, p.trackType);
      if (!plan) { c.note = '走廊需重新评估，暂缓施工';
        if (!onlyOverdue && ym % 6 === 0 || onlyOverdue && p.phase === 'building' && p.due < ym) {
          const alternative = O.plan(g, c.id, p.kind, p);
          if (alternative) {
            p.points = alternative.points; p.target = alternative.target; p.estimate = alternative.cost; p.extension = alternative.extension || null; p.trackType = alternative.trackType;
            if (p.phase === 'building') {
              p.tracks = alternative.tracks; invalidateWorks(g);
              p.due = ym + 3; c.note = '调整走廊，延长三个月完成复核';
              log(g, c.id, '工程走廊调整', '保留已完成施工进度，采用重新验证的合法走廊，追加三个月完成开通复核；建设和购车款仍在实际开通时结算。');
              return c.id;
            }
            c.note = '调整走廊后重新筹资';
          }
        }
        continue; }
      p.estimate = plan.cost;
      if (p.phase === 'funding') {
        if (c.funds < plan.cost + 20000 * ci) { c.note = '筹资中，尚缺 ' + U.fmtMoney(Math.max(0, plan.cost + 20000 * ci - c.funds)); continue; }
        // Construction capital is reserved and paid at opening against the latest
        // validated bill, so a stale plan never charges for assets that did not open.
        p.phase = 'building'; p.start = ym; p.due = ym + (policy?.duration ? policy.duration(g, c, p.kind, plan.ids.length) : p.kind === 'cross' ? 30 : 24); c.note = '施工中';
        p.tracks = plan.tracks; invalidateWorks(g);
        log(g, c.id, defOf(c.id).city + (p.kind === 'cross' ? '联络线' : '城区线') + '开工', '预计 ' + Math.floor(p.due / 12) + ' 年 ' + (p.due % 12 + 1) + ' 月开通；虚线标出施工预留。'); return c.id;
      }
      if (c.funds + 1e-7 < plan.cost) { c.note = '等待追加资金'; continue; }
      if (count + plan.ids.length > MAX_STATIONS) { c.note = '区域公司站点数量已达上限'; continue; }
      if (policy && policy.profile && policy.profile(g, c.id)?.stations + plan.ids.length > policy.LIMITS.stationsPerCompany) { c.note = '本公司站点数量已达上限'; continue; }
      book(g, c, 'construction', plan.ev.total, false); book(g, c, 'fleet', plan.quote.cost, false);
      for (const dm of plan.ev.demolitions) g.city.demolish(dm.c, dm.frac);
      for (const id of plan.ids) { plan.draft.stations[id].built = [g.clock.y, g.clock.m]; plan.draft.stations[id].site = [plan.draft.stations[id].x, plan.draft.stations[id].y]; }
      for (const [id, seg] of Object.entries(plan.draft.segments)) if (!g.net.segments[id]) { seg.built = [g.clock.y, g.clock.m]; seg.paidLen = Math.round(plan.ev.paidLen[id] || 0); seg.base = null; }
      g.net = plan.draft; g.netVersion++; g.compiled = plan.C; g._compKey = null;
      CM.Fleet.applyOwned(g, plan.quote);
      g.model.cancelPredict(); if (plan.ev.demolitions.length) { g.model.buildZones(); g.model.buildDemand(); }
      g.model.fleetSource = net => CM.Fleet.plan(g, net);
      g.model.setNetwork(g.compiled);
      p.phase = 'open'; p.opened = ym; p.line = plan.lid; p.construction = plan.ev.total; p.fleet = plan.quote.cost; c.note = '运营中';
      if (p.kind === 'cross' && c.request === p.target) c.request = null;
      delete p.tracks; invalidateWorks(g);
      if (p.kind === 'local' && !p.extension) p.demandAfter = localDemand(g, c.id, Object.values(g.net.stations)).reduce((sum, tile) => sum + tile.demand, 0);
      log(g, c.id, g.net.lines[plan.lid].name + '开通运营', '建设 ' + U.fmtMoney(p.construction) + '、列车 ' + U.fmtMoney(p.fleet) + '，均由本公司支付；乘客按真实线路与换乘选择出行。');
      g.emit('network'); g.emit('fleet'); g.emit('autosave', 'operators'); return c.id;
    }
    return false;
  }
  function advance(g, onlyOverdue) {
    const s = g.operators, ym = g.ym(), acted = new Set();
    let count = s.lastBuild === ym ? (s.buildActions ?? 1) : 0;
    while (count < MONTHLY_ACTIONS) {
      const id = advanceOne(g, onlyOverdue, acted);
      if (!id) break;
      acted.add(id);
      s.lastBuild = ym;
      s.buildActions = ++count;
    }
    return acted.size > 0;
  }
  O.projectStatus = function (g, c, p) {
    if (!p) return { phase: null, label: '尚无工程', text: '尚无工程', reason: null, overdue: false, due: -1, monthsLate: 0 };
    const overdue = p.phase === 'building' && p.due < g.ym();
    let reason = null, label = p.phase === 'open' ? '已开通' : p.phase === 'funding' ? '筹资中' : '施工中';
    if (p.phase === 'building' && p.due === g.ym()) { label = '待开通复核'; reason = g.draft ? '等待玩家草案确认后进行开通复核' : c && /走廊|追加资金|站点数量|调整/.test(c.note) ? c.note : '等待完工复核'; }
    if (p.phase === 'building' && c && /调整走廊/.test(c.note)) reason = c.note;
    if (overdue) {
      label = '开通延期';
      if (g.draft) reason = '等待玩家草案确认后进行开通复核';
      else if (c && /走廊|追加资金|站点数量|调整/.test(c.note)) reason = c.note;
      else if (g.operators && g.operators.lastBuild === g.ym() && (g.operators.buildActions || 1) >= MONTHLY_ACTIONS) reason = '等待下一月工程窗口';
      else reason = '等待完工复核';
    }
    return { phase: p.phase, label, text: reason ? label + '：' + reason : label, reason, overdue, due: p.due, monthsLate: overdue ? Math.max(0, g.ym() - p.due) : 0 };
  };
  function retryKey(g) {
    const due = Object.values(g.operators.companies).flatMap(c => c.projects.filter(p => p.phase === 'building' && p.due <= g.ym()).map(p => [c.id, c.funds + 1e-7 >= p.estimate, c.crossPermit, c.request, p.id, p.phase, p.due, p.estimate, p.target, p.points]));
    return due.length ? JSON.stringify([g.ym(), g.operators.lastBuild, g.operators.buildActions, g.netVersion, g.city.geoVer, g.city.terrainVer, g.city.lockVer, g.city.roadVersion, g.property && g.property.rev, g.fleet && g.fleet.ver, due]) : null;
  }
  O.poll = function (g) {
    if (!O.enabled(g) || !g.operators || !g.model) return false;
    let r = runtime.get(g); if (!r) { r = { views: new Map() }; runtime.set(g, r); }
    if (g.draft) { r.poll = null; return false; }
    if (g.pending || g.jumping || !g.model.trafficReady || !g.model.trafficReady()) return false;
    const s = g.operators, ym = g.ym(); if (s.lastBuild === ym && (s.buildActions || 1) >= MONTHLY_ACTIONS) return false;
    const key = retryKey(g); if (!key) return false;
    if (r.poll === key) return false;
    r.poll = key;
    const notes = Object.values(s.companies).map(c => c.note).join('\0');
    const progressed = advance(g, true);
    if (!progressed) r.poll = retryKey(g);
    if (progressed && CM.OperatorControls && CM.OperatorControls.recordMonth) CM.OperatorControls.recordMonth(g);
    if (progressed || notes !== Object.values(s.companies).map(c => c.note).join('\0')) emit(g);
    return !!progressed;
  };
  O.monthly = function (g) {
    const s = O.ensure(g); if (!s || s.lastMonth === g.ym()) return; s.lastMonth = g.ym();
    const ym = g.ym(), ci = g.econ.costIndex(g.clock.y), policy = CM.NPCProgression;
    if (policy && policy.month) policy.month(g);
    for (let i = 0; i < DEFINITIONS.length; i++) {
      const d = DEFINITIONS[i]; if (d.id === O.playerCity(g) || g.clock.y < d.year || ym < s.since + i * 2) continue;
      let c = s.companies[d.id];
      const grants = policy && policy.grants ? policy.grants(g, d.id, ci) : { initial: 220000 * d.strength * ci, monthly: 12000 * d.strength * ci };
      if (!c) { c = s.companies[d.id] = { id: d.id, founded: ym, funds: 0, total: moneyFields(), cur: monthFields(ym), history: [], projects: [], agreements: [], request: null, crossPermit: false, note: '独立筹资', lastDay: null };
        book(g, c, 'grant', grants.initial, true); log(g, d.id, d.name + '开始规划', '当地资金独立建账，不受玩家建设解锁影响；初始注资 ' + U.fmtMoney(c.funds) + '。');
      }
      rotate(c, ym); book(g, c, 'grant', grants.monthly, true);
      if (!g.draft && CM.Fleet && CM.Fleet.maintainOwned) CM.Fleet.maintainOwned(g, c.id);
    }
    O.updateSatisfaction(g);
    if (!g.fleet && CM.Fleet) CM.Fleet.ensure(g);
    advance(g, false);
    proposeConnections(g);
    if (CM.OperatorControls && CM.OperatorControls.recordMonth) CM.OperatorControls.recordMonth(g);
    emit(g);
  };
  O.validate = function (s, dimensions) {
    if (s == null) return;
    const fail = () => { throw new Error('存档中的城市公司、项目或财务记录无效'); };
    if (!s || s.v !== 1 || !s.companies || typeof s.companies !== 'object' || Array.isArray(s.companies) || Object.keys(s.companies).length > 6 || !Array.isArray(s.log) || s.log.length > 30) fail();
    if (s.indexHistory != null) {
      if (!Array.isArray(s.indexHistory) || s.indexHistory.length > 120) fail();
      let previous = -1;
      for (const row of s.indexHistory) {
        if (!row || !integer(row.ym, 0, 120000) || row.ym <= previous || !Array.isArray(row.values) || row.values.length > 7) fail(); previous = row.ym;
        const owners = new Set();
        for (const v of row.values) { if (!v || v.ownerId !== 'player' && !IDS.has(v.ownerId) || owners.has(v.ownerId) || !finite(v.score, 0, 1e12) || !finite(v.annualProfit, -1e15, 1e15) || !finite(v.riders, 0, 1e15) || !finite(v.service, 0, 1e6) || !finite(v.debt, 0, 1e15)) fail(); owners.add(v.ownerId); }
      }
    }
    for (const k of ['since','lastMonth','lastBuild']) if (!integer(s[k], -1, 120000)) fail(); if (!integer(s.lastDay, -1, 4000000)) fail();
    if (s.buildActions != null && !integer(s.buildActions, 1, MONTHLY_ACTIONS)) fail();
    const fields = o => { if (!o || KINDS.some(k => !finite(o[k], 0, 1e15))) fail(); };
    const row = o => { fields(o); if (!integer(o.ym, 0, 120000)) fail(); };
    for (const [id, c] of Object.entries(s.companies)) {
      if (!IDS.has(id) || !c || c.id !== id || !integer(c.founded, 0, 120000) || !finite(c.funds, -1e12, 1e15) || !Array.isArray(c.projects) || c.projects.length > MAX_PROJECTS || !Array.isArray(c.history) || c.history.length > 24 || !Array.isArray(c.agreements) || c.agreements.length > MAX_STATIONS || typeof c.note !== 'string' || c.note.length > 180) fail();
      if (c.sat != null && !finite(c.sat, 0, 100) || c.satYM != null && !integer(c.satYM, 0, 120000)) fail();
      fields(c.total); row(c.cur); c.history.forEach(row);
      const balance = c.total.grant + c.total.fare - c.total.ops - c.total.construction - c.total.fleet;
      if (Math.abs(balance - c.funds) > Math.max(.001, Math.abs(balance) * 1e-9)) fail();
      if (typeof c.crossPermit !== 'boolean') fail();
      if (c.offer != null && (typeof c.offer !== 'string' || c.offer.length > 80)) fail();
      if (c.deferred != null && (typeof c.deferred.station !== 'string' || c.deferred.station.length > 80 || !integer(c.deferred.until, 0, 120000))) fail();
      if (c.request !== null && (typeof c.request !== 'string' || c.request.length > 80)) fail();
      if (c.agreements.some(x => typeof x !== 'string' || x.length > 80)) fail();
      if (c.lastDay && (!finite(c.lastDay.fare, 0, 1e12) || !finite(c.lastDay.ops, 0, 1e12) || !finite(c.lastDay.pkm, 0, 1e15) || !['wd','we'].includes(c.lastDay.dt))) fail();
      const seen = new Set();
      if (c.projects.filter(p => p && p.phase !== 'open').length > 1) fail();
      for (const p of c.projects) {
        if (!p || typeof p.id !== 'string' || p.id.length > 80 || seen.has(p.id) || !['local','cross'].includes(p.kind) || !['funding','building','open'].includes(p.phase) || !Array.isArray(p.points) || p.points.length < (p.extension || p.kind === 'cross' ? 2 : 3) || p.points.length > MAX_STOPS || p.points.some(q => !q || !finite(q.x,0,dimensions ? dimensions.W - 1e-8 : 10000) || !finite(q.y,0,dimensions ? dimensions.H - 1e-8 : 10000) || q.stationId != null && (typeof q.stationId !== 'string' || q.stationId.length > 80))) fail(); seen.add(p.id);
        for (const k of ['proposed','start','due','opened']) if (!integer(p[k], -1, 120000)) fail();
        for (const k of ['estimate','construction','fleet']) if (!finite(p[k], 0, 1e12)) fail();
        if (p.phase !== 'funding' && (p.start < p.proposed || p.due < p.start) || p.phase === 'open' && (p.opened < p.due || !p.line)) fail();
        if (p.extension != null && (typeof p.extension !== 'string' || p.extension.length > 80) || p.demandAfter != null && !finite(p.demandAfter, 0, 1e12)) fail();
        if (p.trackType != null && !['underground', 'elevated', 'surface'].includes(p.trackType)) fail();
        if (p.tracks != null && (p.phase !== 'building' || !Array.isArray(p.tracks) || p.tracks.length !== p.points.length - 1 ||
          p.tracks.some(track => !Array.isArray(track) || track.length < 2 || track.length > 8192 || track.some(pt => !Array.isArray(pt) || pt.length !== 2 || !pt.every(x => finite(x, -2, 5000)))))) fail();
        for (const k of ['line','target']) if (p[k] !== null && (typeof p[k] !== 'string' || p[k].length > 80)) fail();
      }
    }
    for (const e of s.log) if (!e || !integer(e.ym,0,120000) || !IDS.has(e.ownerId) || typeof e.title !== 'string' || e.title.length > 120 || typeof e.desc !== 'string' || e.desc.length > 500) fail();
  };
  function clean(s) {
    const out = { v: 1, since: s.since, lastMonth: s.lastMonth, lastDay: s.lastDay, lastBuild: s.lastBuild, buildActions: s.buildActions || 1, companies: {}, indexHistory: (s.indexHistory || []).map(r => ({ ym: r.ym, values: r.values.map(v => ({ownerId:v.ownerId,score:v.score,annualProfit:v.annualProfit,riders:v.riders,service:v.service,debt:v.debt})) })), log: s.log.map(e => ({ ym:e.ym,ownerId:e.ownerId,title:e.title,desc:e.desc })) };
    const fields = x => Object.fromEntries(KINDS.map(k => [k,x[k]])), row = x => Object.assign({ym:x.ym},fields(x));
    for (const [id,c] of Object.entries(s.companies)) out.companies[id] = { id, founded:c.founded, funds:c.funds, total:fields(c.total),cur:row(c.cur),history:c.history.map(row),agreements:c.agreements.slice(),request:c.request,offer:c.offer || null,...(c.deferred ? {deferred:{station:c.deferred.station,until:c.deferred.until}} : {}),crossPermit:c.crossPermit,note:c.note,...(c.sat == null ? {} : {sat:c.sat,satYM:c.satYM}),lastDay:c.lastDay?{fare:c.lastDay.fare,ops:c.lastDay.ops,pkm:c.lastDay.pkm,dt:c.lastDay.dt}:null,
      projects:c.projects.map(p=>({id:p.id,kind:p.kind,phase:p.phase,points:p.points.map(q=>Object.assign({x:q.x,y:q.y},q.stationId?{stationId:q.stationId}:{})),target:p.target,proposed:p.proposed,start:p.start,due:p.due,opened:p.opened,estimate:p.estimate,construction:p.construction,fleet:p.fleet,line:p.line,extension:p.extension || null,
        ...(p.demandAfter == null ? {} : { demandAfter:p.demandAfter }), ...(p.tracks ? { tracks:p.tracks.map(track => track.map(pt => pt.slice())) } : {}), trackType:p.trackType || 'underground'})) };
    return out;
  }
  O.validateAssets = function (saved, net, fleet, playerCity) {
    const fail = () => { throw new Error('存档中的公司资产归属与财务登记不一致'); };
    const assetOwner = function (x) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) fail();
      const raw = x.ownerId;
      if (raw == null) return 'player';
      if (typeof raw !== 'string' || raw !== 'player' && !IDS.has(raw)) fail();
      return raw;
    };
    let n = 0; const stationCounts = new Map();
    for (const table of [net && net.lines, net && net.stations]) for (const x of Object.values(table || {})) {
      const id = assetOwner(x); if (id === 'player') continue;
      if (!IDS.has(id) || id === (playerCity || 'sh') || !saved || !saved.companies[id]) fail();
      if (table === net.stations) {
        stationCounts.set(id, (stationCounts.get(id) || 0) + 1);
        if (++n > MAX_STATIONS || stationCounts.get(id) > O.MAX_COMPANY_STATIONS) fail();
      }
    }
    for (const seg of Object.values(net && net.segments || {})) {
      const explicit = seg && seg.ownerId != null;
      const id = assetOwner(seg), line = net.lines && net.lines[seg.line];
      if (explicit && (!line || id !== assetOwner(line))) fail();
    }
    for (const t of fleet && fleet.trains || []) {
      const id = assetOwner(t), line = t.line && net.lines && net.lines[t.line];
      if (id !== 'player' && (!saved || !saved.companies[id] || t.line && !line) || line && assetOwner(line) !== id) fail();
    }
    for (const c of Object.values(saved && saved.companies || {})) { if (c.id === (playerCity || 'sh')) fail(); }
    for (const c of Object.values(saved && saved.companies || {})) for (const p of c.projects) if (p.phase === 'open' && (!net.lines[p.line] || O.owner(net.lines[p.line]) !== c.id)) fail();
  };
  O.serialize = function (g) { if (!g.operators) return undefined; O.validate(g.operators, g.city); return clean(g.operators); };
  O.restore = function (g, saved) { O.validate(saved, g.city); if (g.net) O.validateAssets(saved, g.net, null, g.playerCity); runtime.delete(g); O.attach(g); if (saved) g.operators = clean(saved); else O.ensure(g); };
})(window.CM = window.CM || {});
