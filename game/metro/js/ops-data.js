'use strict';
// 地铁芯的只读派生数据与预览。缓存只存在内存，不写入存档，也不改变模拟精度。
(function (CM) {
  const D = CM.OpsData = {}, M = CM.Metro, U = CM.U;
  D.owned = function (asset) { return !!asset && (!asset.ownerId || asset.ownerId === 'player'); };
  D.home = function (g) { const P = CM.PlayerMetrics; return P && P.enabled(g) ? P.home ? P.home(g) : CM.Tasks.scopedDaily(g) : g.model.daily || {}; };
  D.history = function (g, satisfaction) {
    const P = CM.PlayerMetrics, rows = g.history || []; if (!P || !P.enabled(g)) return rows;
    const d = D.home(g), key = satisfaction ? g.econ.satScope && g.econ.satScope.scopeKey : d && d.scopeKey, home = P.homeCity(g);
    if (!key) return [];
    return rows.filter(function (r) { return satisfaction ? r.satCityId === home && r.satScopeKey === key && Number.isFinite(r.sat) : r.metricScope === 'player' && r.scopeKey === key && r.ready !== false; });
  };
  const snapshots = new WeakMap(), paths = new WeakMap(), terrain = new WeakMap();
  // Published result identities/version, readiness and fleet revision all matter: a new
  // solve, restore, service edit or purchase can change values within the same month.
  const stamp = function (g) {
    const m = g.model;
    return [g.net, g.netVersion, g.compiled, m, m.net, m.results, m.version, m.stDaily, m.stDailyWk,
      !!m.dailyStale, !!m.trafficReady(), g.fleet, g.fleet && g.fleet.ver, g.ym(), g.mapId, g.playerCity,
      g.city, g.city.geoVer, g.city.terrainVer, g.city.lockVer];
  };
  const same = function (a, b) { return a && a.length === b.length && a.every(function (v, i) { return v === b[i]; }); };
  D.memo = function (g, key, build) {
    const s = stamp(g); let hit = snapshots.get(g);
    if (!hit || !same(hit.stamp, s)) { hit = { stamp: s, values: new Map() }; snapshots.set(g, hit); }
    if (!hit.values.has(key)) hit.values.set(key, build());
    return hit.values.get(key);
  };
  D.lineInfo = function (g, lid) { return D.memo(g, 'fleet:' + lid, function () { return CM.Fleet && g.fleet ? CM.Fleet.lineInfo(g, lid) || [] : []; }); };
  D.crowd = function (g) { return D.memo(g, 'crowd', function () { return CM.Tasks ? CM.Tasks.crowdOf(g, null, true).filter(function (x) { return D.owned(g.net.lines[x.lid]); }) : []; }); };
  D.lineStats = function (g) { return D.memo(g, 'stats', function () { return CM.Tasks ? new Map(Array.from(CM.Tasks.lineStats(g, true)).filter(function (x) { return D.owned(g.net.lines[x[0]]); })) : new Map(); }); };
  D.lineRows = function (g) {
    return D.memo(g, 'lines', function () { return M.withSegIndex([g.net], function () {
      const stats = D.lineStats(g), crowd = new Map();
      for (const x of D.crowd(g)) crowd.set(x.lid, x.lf);
      const C = g.compiled;
      return M.sortIds(Object.keys(g.net.lines).filter(function (lid) { return D.owned(g.net.lines[lid]); })).map(function (lid, i) {
        const L = g.net.lines[lid], tp = C && C.topo && C.topo.get(lid) || M.lineTopo(g.net, lid), s = stats.get(lid), info = D.lineInfo(g, lid);
        let km = 0;
        for (const sg of M.lineSegs(g.net, lid)) { const cs = C && C.segs.get(sg.id); km += (cs ? cs.g : M.segGeom(g.net, sg, g.city)).lenM / 1000; }
        return { ord: i, lid: lid, L: L, tp: tp, km: km, st: (tp.stations || []).length, kmh: M.lineKmh(L), riders: s ? s.riders : 0, lf: crowd.get(lid) || 0,
          avail: info.reduce(function (a, x) { return a + x.avail; }, 0), need: info.reduce(function (a, x) { return a + x.peakNeed; }, 0), svcs: (L.svcs || []).length };
      });
    }); });
  };
  D.stationRows = function (g) {
    return D.memo(g, 'stations', function () { return M.withSegIndex([g.net], function () {
      const C = g.model.net ? g.model.net.C : g.compiled, sd = g.model.dailyStale ? null : g.model.stDailyWk || g.model.stDaily;
      return M.sortIds(Object.keys(g.net.stations).filter(function (sid) { return D.owned(g.net.stations[sid]); })).map(function (sid) {
        const s = g.net.stations[sid], k = C.sIndex.get(sid), ok = k !== undefined && sd && k < sd.peak.length;
        return { sid: sid, s: s, lines: M.stationLines(g.net, sid), live: k !== undefined && !!C.serviced[k], flow: ok ? sd.inn[k] + sd.out[k] + sd.xfer[k] : 0,
          load: ok ? sd.peak[k] / M.stationCapacity(s) : 0 };
      });
    }); });
  };
  // Reuse the exact compiled curves. A mini-map must not reconstruct every station
  // tangent and curve merely to display already-built track.
  D.paths = function (g, net) {
    const draft = g.draft && g.draft.net === net ? g.draft : null;
    const C = draft ? (draft.compVer === draft.ver ? draft.compiled : null) : (net === g.net ? g.compiled : null);
    const key = [C, g.netVersion, draft && draft.ver, g.city, g.city.geoVer, g.city.terrainVer];
    const hit = paths.get(net); if (hit && same(hit.key, key)) return hit.value;
    const value = new Map();
    M.withSegIndex([net], function () {
      for (const id in net.segments) {
        const sg = net.segments[id], cs = C && C.segs.get(id), pts = (cs ? cs.g : M.segGeom(net, sg, g.city)).pts;
        let d = ''; for (let i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1);
        value.set(sg.line, (value.get(sg.line) || '') + d);
      }
    });
    paths.set(net, { key: key, value: value }); return value;
  };
  // Run after one browser paint, with cancellation for closed/replaced views.
  D.afterPaint = function (fn) {
    let cancelled = false, frame = 0, timer = 0;
    if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(function () {
      frame = requestAnimationFrame(function () { frame = 0; if (!cancelled) timer = setTimeout(function () { if (!cancelled) fn(); }, 0); });
    });
    else timer = setTimeout(function () { if (!cancelled) fn(); }, 0);
    return function () { cancelled = true; clearTimeout(timer); if (frame) cancelAnimationFrame(frame); };
  };
  // The decorative coast raster is bounded by its displayed resolution and prepared
  // in short row batches. No toDataURL/PNG compression or large base64 SVG attributes.
  D.terrain = function (g, land, water) {
    const city = g.city, key = [city.W, city.H, city.geoVer, city.landFrac, land, water];
    const hit = terrain.get(city); if (hit && same(hit.key, key)) return hit.promise;
    const scale = Math.min(1, 640 / Math.max(city.W, city.H)), w = Math.max(1, Math.round(city.W * scale)), h = Math.max(1, Math.round(city.H * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const promise = new Promise(function (resolve) {
      const ctx = canvas.getContext('2d'); if (!ctx) { resolve(null); return; }
      const rgb = function (s) { return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; };
      const L = rgb(land), W = rgb(water), dx = city.W / w, dy = city.H / h;
      let row = 0;
      const step = function () {
        const end = Math.min(h, row + 16), im = ctx.createImageData(w, end - row);
        for (let y = row; y < end; y++) {
          const src = Math.min(city.H - 1, Math.floor((y + .5) * dy)) * city.W;
          for (let x = 0; x < w; x++) {
            const f = U.clamp(city.landFrac[src + Math.min(city.W - 1, Math.floor((x + .5) * dx))], 0, 1), k = ((y - row) * w + x) * 4;
            im.data[k] = W[0] + (L[0] - W[0]) * f; im.data[k + 1] = W[1] + (L[1] - W[1]) * f; im.data[k + 2] = W[2] + (L[2] - W[2]) * f; im.data[k + 3] = 255;
          }
        }
        ctx.putImageData(im, 0, row); row = end;
        if (row < h) setTimeout(step, 0); else resolve(canvas);
      };
      setTimeout(step, 0);
    });
    terrain.set(city, { key: key, promise: promise }); return promise;
  };
})(window.CM);
