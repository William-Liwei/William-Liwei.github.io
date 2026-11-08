'use strict';
// Shanghai: history sets the background growth rate, not a population ceiling.
(function (CM) {
  const U = CM.U, D = CM.Development = {};
  D.enabled = g => !!g && (g.mapId === 'sh' || g.mapId === 'sh-city');
  const append = function (state, record) {
    state.last = record;
    if (state.history.at(-1)?.ym === record.ym) state.history[state.history.length - 1] = record;
    else state.history.push(record);
    state.history = state.history.slice(-120);
  };
  D.month = function (g, year) {
    if (!D.enabled(g)) return null;
    const ym = g.ym(), state = g.development || (g.development = { v: 1, since: ym, history: [] });
    const R = CM.RegionalMetrics, regional = R && R.enabled(g) && R.snapshot(g);
    const tot = regional ? null : g.city.totals(), day = g.model.dailyWk || g.model.daily || {};
    const ready = !!day.ready && !g.model.dailyStale && day.trips > 0;
    const next = U.interp(CM.CFG.growth.popCurve, year + 1 / 12), now = U.interp(CM.CFG.growth.popCurve, year);
    const background = year <= CM.CFG.growth.histEnd ? U.clamp(Math.log(Math.max(1, next) / Math.max(1, now)) * 12, -.012, .04) : .0015;
    const econ = g.macro && CM.Macro ? CM.Macro.cityFactors(g) : null;
    const future = CM.Future ? CM.Future.factors(g) : { pop: 0, jobs: 1 };
    const fiscal = !g.econ.isFree() && (g.econ.funds < 0 || g.econ.overdue > 0) ? .004 : 0;
    const market = (econ ? econ.dev : 0) * .025;
    const ratio = U.interp(CM.CFG.growth.jobsRatio, year + 1 / 12) * (econ ? econ.jobs : 1);
    const calculate = function (local, observed, regional) {
      const coverage = observed ? U.clamp(local.coverage || 0, 0, 1) : 0;
      const share = observed ? U.clamp(local.metroShare || 0, 0, 1) : 0;
      const crowd = observed ? U.clamp(local.crowdShare || 0, 0, 1) : 0;
      const service = Math.sqrt(U.clamp(coverage / .65, 0, 1) * U.clamp(share / .45, 0, 1)) * (1 - .65 * crowd);
      const commute = observed ? U.clamp(((local.commute || 35) - 55) / 90, 0, 1) : 0;
      const congestion = observed ? U.clamp(((local.cong || 1) - 1.4) / 2, 0, 1) : 0;
      const employment = regional && local.pop > 0 ? U.clamp((ratio - local.jobs / local.pop) / Math.max(.1, ratio), 0, 1) : 0;
      const rail = .022 * service * (1 - .7 * commute), strain = .006 * congestion + .004 * commute + .004 * employment + fiscal;
      const annual = U.clamp(background + rail + market + future.pop - strain, -.018, .055);
      const dPop = local.pop * Math.expm1(annual / 12), targetJobs = (local.pop + dPop) * ratio;
      const dJobs = U.clamp((targetJobs - local.jobs) * .04 + Math.max(0, dPop) * ratio * .5, -.003 * local.jobs, .006 * local.jobs + 2000);
      return { dPop, dJobs, record: { ym, pop: local.pop, jobs: local.jobs, annual, rail, background, strain, future: future.pop, market, service } };
    };
    if (regional) {
      const byCity = {}, rows = regional.rows.filter(r => r.pop > 0 || r.jobs > 0), cities = state.cities || (state.cities = {});
      let dPop = 0, dJobs = 0;
      const record = { ym, pop: 0, jobs: 0, annual: 0, rail: 0, background, strain: 0, future: future.pop, market, service: 0 };
      for (const row of rows) {
        const result = calculate(row, regional.ready && row.trips > 0, true);
        byCity[row.id] = Object.assign({ id: row.id, name: row.name }, result);
        const cityState = cities[row.id] || (cities[row.id] = { since: ym, history: [] });
        append(cityState, result.record); dPop += result.dPop; dJobs += result.dJobs;
        record.pop += row.pop; record.jobs += row.jobs;
        for (const k of ['rail', 'strain', 'service']) record[k] += result.record[k] * row.pop;
      }
      for (const k of ['rail', 'strain', 'service']) record[k] /= Math.max(1, record.pop);
      record.service = U.clamp(record.service, 0, 1);
      record.annual = record.pop > 0 ? Math.log1p(dPop / record.pop) * 12 : 0;
      append(state, record);
      return { dPop, dJobs, record, byCity, cityOf: cell => R.cityOf(g, cell) };
    }
    const result = calculate(Object.assign({}, day, { pop: tot.pop, jobs: tot.jobs }), ready, false);
    // Keep ordinary one-city growth identical, including old Shanghai saves.
    append(state, result.record); return result;
  };
  D.validate = function (s) {
    if (s == null) return;
    const valid = r => r && Number.isInteger(r.ym) && ['pop', 'jobs', 'annual', 'rail', 'background', 'strain', 'future', 'market', 'service'].every(k => Number.isFinite(r[k])) && r.pop >= 0 && r.jobs >= 0 && Math.abs(r.annual) < .1 && r.service >= 0 && r.service <= 1;
    const history = x => x && Number.isInteger(x.since) && Array.isArray(x.history) && x.history.length <= 120 && x.history.every(valid) && (!x.last || valid(x.last));
    if (s.v !== 1 || !history(s) || s.cities !== undefined && (!s.cities || typeof s.cities !== 'object' || Array.isArray(s.cities) || Object.keys(s.cities).length > 32 || Object.entries(s.cities).some(([id, x]) => !/^[a-z][a-z0-9-]{0,23}$/.test(id) || !history(x)))) throw Error('城市发展记录无效');
  };
  D.serialize = function (g) { return g.development ? JSON.parse(JSON.stringify(g.development)) : undefined; };
  D.restore = function (g, s) { D.validate(s); g.development = D.enabled(g) && s ? JSON.parse(JSON.stringify(s)) : null; };
  D.panel = function (g) {
    const h = U.h, panel = h('div'); if (!D.enabled(g)) return panel;
    const r = g.development && g.development.last, pct = n => (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';
    panel.appendChild(h('section', { class: 'chart-card' }, h('h3', null, '地铁与城市发展'),
      h('p', { class: 'note' }, '人口总量可偏离历史曲线。有效服务吸引新人口与岗位；站点周边的集聚由另一套用地分配处理。增长仍受住房容量、可开发土地、就业和拥堵约束。'),
      r ? h('div', { class: 'callout info' }, '本月人口增长意愿（年化） ' + pct(r.annual) + ' · 地铁吸引贡献 ' + pct(r.rail)) : h('div', { class: 'note' }, '首次月结算后显示发展分解；人口与岗位趋势沿用本局实际记录。'),
      r ? h('p', { class: 'tiny muted' }, '背景 ' + pct(r.background) + ' · 经济 ' + pct(r.market) + ' · 未来情景 ' + pct(r.future) + ' · 拥堵与财政压力 −' + (r.strain * 100).toFixed(2) + '%。这是增长需求，土地容量不足时实际增量会更低。') : null));
    if (CM.RegionalMetrics && CM.RegionalMetrics.enabled(g) && g.development && g.development.cities) {
      const data = CM.RegionalMetrics.snapshot(g), table = h('table', { class: 'tbl' }, h('tr', null, ...['城市', '人口增长意愿', '地铁吸引贡献'].map(x => h('th', null, x))));
      for (const row of data.rows) { const s = g.development.cities[row.id], last = s && s.last; if (last) table.appendChild(h('tr', null, h('th', null, row.name), h('td', null, pct(last.annual)), h('td', null, pct(last.rail)))); }
      panel.appendChild(h('section', { class: 'chart-card' }, h('h3', null, '各市发展'), table, h('p', { class: 'note' }, '各市分别按本市地铁服务、拥堵、通勤和就业计算增长，并只在本市有容量的街区落地；未使用全区域平均值替代当地情况。')));
    }
    if (CM.Future) panel.appendChild(CM.Future.panel(g));
    return panel;
  };
})(window.CM);
