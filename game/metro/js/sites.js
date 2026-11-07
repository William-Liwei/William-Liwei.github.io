'use strict';
// Campus / exhibition sites use the existing web coordinates and Canvas style.
// Only display geometry changes; population, protection and travel demand do not.
(function (CM) {
  const U = CM.U, C = CM.CFG.CELL_M;
  const complex = lm => ['campus', 'expo', 'conference'].includes(lm.kind);
  let serial = 0;
  function version(R) {
    const c = R.game.city, old = R._siteStamp;
    if (old && old.city === c && old.road === c.roadVersion && old.terrain === c.terrainVer && old.ways === c.roadWays) return old.id;
    const built = c.roadsBuilt.join('');
    const same = old && old.city === c && old.terrain === c.terrainVer && old.ways === c.roadWays && old.built === built;
    R._siteStamp = { city: c, road: c.roadVersion, terrain: c.terrainVer, ways: c.roadWays, built, id: same ? old.id : ++serial };
    return R._siteStamp.id;
  }
  // Road clearance and actual-world site bounds adapted from the standalone site planner.
  function plan(R, lm) {
    const id = version(R), cache = R._sitePlans || (R._sitePlans = new WeakMap()), old = cache.get(lm);
    if (old && old.version === id) return old;
    const city = R.game.city, angle = (lm.rot || 0) * Math.PI / 180, ca = Math.cos(angle), sa = Math.sin(angle);
    const local = (x, y) => { const dx = (x - lm.x) * C, dy = (y - lm.y) * C; return [dx * ca + dy * sa, -dx * sa + dy * ca]; };
    const world = (x, y) => [lm.x + (x * ca - y * sa) / C, lm.y + (x * sa + y * ca) / C];
    const radius = Math.hypot(lm.w, lm.d) / C / 2 + .2, roads = [];
    for (const k of CM.Geo.query(city.roadWayBk, lm.x - radius, lm.y - radius, lm.x + radius, lm.y + radius)) {
      const way = city.roadWays[k], g = city.roadGroups[way.g];
      if (!city.roadsBuilt[way.g] || (g.flags & 2)) continue;
      const margin = ((g.flags & 4) ? .04 : g.cls === 4 ? .1 : g.cls === 3 ? .075 : .05) * C + 3;
      for (let j = 0; j + 3 < way.p.length; j += 2) roads.push({ a: local(way.p[j], way.p[j + 1]), b: local(way.p[j + 2], way.p[j + 3]), margin });
    }
    const crosses = (a, b, x0, y0, x1, y1) => {
      let lo = 0, hi = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
      for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
        if (Math.abs(p) < 1e-10) { if (q < 0) return false; }
        else { const t = q / p; if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t); if (lo > hi) return false; }
      } return true;
    };
    const value = { version: id, world, parts: [], trees: [], clear(x, y, w, d, plots = []) {
      const x0 = x - w / 2, y0 = y - d / 2, x1 = x + w / 2, y1 = y + d / 2;
      if (x0 < -lm.w * .47 || x1 > lm.w * .47 || y0 < -lm.d * .47 || y1 > lm.d * .47) return false;
      if (plots.some(p => Math.abs(x - p.x) < (w + p.w) / 2 + 4 && Math.abs(y - p.y) < (d + p.d) / 2 + 4)) return false;
      const nx = Math.max(2, Math.ceil(w / 20)), ny = Math.max(2, Math.ceil(d / 20));
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) if (city.waterAt(...world(x0 + w * i / nx, y0 + d * j / ny))) return false;
      return !roads.some(r => crosses(r.a, r.b, x0 - r.margin, y0 - r.margin, x1 + r.margin, y1 + r.margin));
    } };
    const add = (x, y, w, d, h, main) => {
      for (const scale of [1, .85, .65]) for (const [dx, dy] of [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24]]) {
        const p = { x: x + dx, y: y + dy, w: w * scale, d: d * scale, h, main };
        if (value.clear(p.x, p.y, p.w, p.d, value.parts)) { value.parts.push(p); return; }
      }
    };
    const campus = lm.kind === 'campus', w = campus ? 82 : lm.kind === 'expo' ? Math.min(170, lm.w * .35) : Math.min(150, lm.w * .4), d = campus ? 38 : lm.kind === 'expo' ? Math.min(65, lm.d * .23) : Math.min(70, lm.d * .4);
    add(0, 0, w, d, campus ? 24 : lm.kind === 'expo' ? 22 : 30, true);
    const cols = Math.max(1, Math.min(7, Math.floor(lm.w / (w + 22)))), rows = Math.max(1, Math.min(7, Math.floor(lm.d / (d + 32))));
    for (let j = 0; j < rows && value.parts.length < 36; j++) for (let i = 0; i < cols && value.parts.length < 36; i++) {
      const x = (i - (cols - 1) / 2) * (w + 22), y = (j - (rows - 1) / 2) * (d + 32);
      add(x, y, w, d, campus ? 14 + (i + j) % 3 * 3 : lm.kind === 'expo' ? 22 : 24, false);
    }
    // Small sites may have a road through their centre. Search the remaining
    // actual site area before omitting its identifying building altogether.
    if (!value.parts.length) {
      const candidates = [];
      for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) candidates.push([i * lm.w / 9, j * lm.d / 9]);
      candidates.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
      outer: for (const scale of [.65, .5, .35]) for (const [x, y] of candidates) {
        if (value.clear(x, y, w * scale, d * scale)) { value.parts.push({ x, y, w: w * scale, d: d * scale, h: campus ? 24 : 22, main: true }); break outer; }
      }
    }
    for (let i = 0; i < 30; i++) {
      const x = (U.hash2(i, 61, 3) - .5) * lm.w * .88, y = (U.hash2(i, 61, 4) - .5) * lm.d * .88;
      if (value.clear(x, y, 10, 10, value.parts)) value.trees.push([x, y]);
    }
    cache.set(lm, value); return value;
  }
  CM.Sites = { complex, version, plan };
  const R = CM.Renderer.prototype;
  R.drawSiteFloor = function (ctx, lm) {
    const a = (lm.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    ctx.fillStyle = lm.kind === 'campus' ? (this.th.night ? '#293d3a' : '#d6e2cf') : (this.th.night ? '#374246' : '#e2dfd6');
    ctx.beginPath();
    for (const [i, p] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
      const u = p[0] * lm.w / 2 / C, v = p[1] * lm.d / 2 / C, x = lm.x + u * ca - v * sa, y = lm.y + u * sa + v * ca;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    } ctx.closePath(); ctx.fill();
  };
  R.drawComplexSite = function (ctx, pj, lm, scale, flat) {
    const site = plan(this, lm), night = this.th.night, campus = lm.kind === 'campus';
    const E = 2 / C * 1.6, roof = night ? '#527666' : '#729c80', wall = night ? '#58616f' : campus ? '#cdbfa9' : '#d2dee8';
    const pt = (x, y, h) => { const p = site.world(x, y); return pj(p[0], p[1], h * E); };
    const fill = (points, color) => { ctx.fillStyle = color; ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fill(); };
    const parts = site.parts.slice().sort((a, b) => { const A = site.world(a.x, a.y), B = site.world(b.x, b.y); return A[0] + A[1] - B[0] - B[1]; });
    for (const p of parts) {
      const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, y0 = p.y - p.d / 2, y1 = p.y + p.d / 2;
      if (flat) { fill([pt(x0, y0, 0), pt(x1, y0, 0), pt(x1, y1, 0), pt(x0, y1, 0)], night ? '#3a4a5c' : '#d4e1ec'); continue; }
      const a = pt(x0, y0, p.h), b = pt(x1, y0, p.h), c = pt(x1, y1, p.h), d = pt(x0, y1, p.h);
      fill([a, b, c, d], campus ? roof : night ? '#8fa6c0' : '#eef3f7');
      const face = campus && p.main && lm.id === 'sysu' ? (night ? '#724b48' : '#b85c46') : wall;
      fill([d, c, pt(x1, y1, 0), pt(x0, y1, 0)], face);
      fill([b, c, pt(x1, y1, 0), pt(x1, y0, 0)], night ? '#465262' : '#b9c7d3');
      if (campus) { const h = p.h + (p.main ? 6 : 3), mid0 = pt(x0 + p.w * .08, p.y, h), mid1 = pt(x1 - p.w * .08, p.y, h); fill([d, c, mid1, mid0], roof); fill([a, b, mid1, mid0], night ? '#426052' : '#60866d'); }
      if (campus && p.main && lm.id === 'sysu') {
        const a = pt(p.x - 5, y1 - 10, 32), b = pt(p.x + 5, y1 - 10, 32), c = pt(p.x + 5, y1, 32), d = pt(p.x - 5, y1, 32);
        fill([d, c, pt(p.x + 5, y1, 0), pt(p.x - 5, y1, 0)], face); fill([a, b, c, d], roof);
      }
      if (lm.kind === 'expo') {
        const edge = []; for (let i = 0; i <= 16; i++) edge.push(pt(x0 + p.w * i / 16, p.y, p.h + 4 * Math.abs(Math.sin(i / 16 * Math.PI * 3))));
        ctx.strokeStyle = night ? '#a6bed4' : '#ffffff'; ctx.lineWidth = Math.max(.6, scale / 65); ctx.beginPath(); edge.forEach((v, i) => i ? ctx.lineTo(...v) : ctx.moveTo(...v)); ctx.stroke();
      }
      if (scale >= 16) for (let i = 0; i < Math.min(18, Math.floor(p.w / 7)); i++) {
        const x = x0 + p.w * (i + .5) / Math.min(18, Math.floor(p.w / 7));
        for (let j = 0; j < Math.max(1, Math.floor(p.h / 5)); j++) {
          const q = pt(x, y1 + .1, 3 + j * 5); ctx.fillStyle = lm.kind === 'conference' ? ['#ce6759', '#cda757', '#5984ad', '#5b9a8b'][i % 4] : night ? '#f6ce8e' : '#829cad';
          ctx.fillRect(q[0] - .6, q[1] - .7, Math.max(1, scale / 48), Math.max(1.4, scale / 38));
        }
      }
    }
    if (!flat) for (const [x, y] of site.trees) { const q = pt(x, y, 7); ctx.fillStyle = night ? '#426154' : '#94b78b'; ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1, scale * .018), 0, Math.PI * 2); ctx.fill(); }
  };
})(window.CM);
