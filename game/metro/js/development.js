'use strict';
// Shanghai: history sets the background growth rate, not a population ceiling.
(function (CM) {
  const U = CM.U, D = CM.Development = {};
  D.enabled = g => !!g && g.mapId === 'sh';
  D.month = function (g, year) {
    if (!D.enabled(g)) return null;
    const ym = g.ym(), state = g.development || (g.development = { v: 1, since: ym, history: [] });
    const tot = g.city.totals(), day = g.model.dailyWk || g.model.daily || {};
    const ready = !!day.ready && !g.model.dailyStale && day.trips > 0;
    const coverage = ready ? U.clamp(day.coverage || 0, 0, 1) : 0;
    const share = ready ? U.clamp(day.metroShare || 0, 0, 1) : 0;
    const crowd = ready ? U.clamp(day.crowdShare || 0, 0, 1) : 0;
    const service = Math.sqrt(U.clamp(coverage / .65, 0, 1) * U.clamp(share / .45, 0, 1)) * (1 - .65 * crowd);
    const commute = ready ? U.clamp(((day.commute || 35) - 55) / 90, 0, 1) : 0;
    const congestion = ready ? U.clamp(((day.cong || 1) - 1.4) / 2, 0, 1) : 0;
    const next = U.interp(CM.CFG.growth.popCurve, year + 1 / 12), now = U.interp(CM.CFG.growth.popCurve, year);
    const background = year <= CM.CFG.growth.histEnd ? U.clamp(Math.log(Math.max(1, next) / Math.max(1, now)) * 12, -.012, .04) : .0015;
    const econ = g.macro && CM.Macro ? CM.Macro.cityFactors(g) : null;
    const future = CM.Future ? CM.Future.factors(g) : { pop: 0, jobs: 1 };
    const fiscal = !g.econ.isFree() && (g.econ.funds < 0 || g.econ.overdue > 0) ? .004 : 0;
    // Useful, actually used services attract new residents. Congestion and poor access to jobs can reverse it.
    const rail = .022 * service * (1 - .7 * commute);
    const market = (econ ? econ.dev : 0) * .025;
    const strain = .006 * congestion + .004 * commute + fiscal;
    const annual = U.clamp(background + rail + market + future.pop - strain, -.018, .055);
    const dPop = tot.pop * Math.expm1(annual / 12);
    const ratio = U.interp(CM.CFG.growth.jobsRatio, year + 1 / 12) * (econ ? econ.jobs : 1);
    const targetJobs = (tot.pop + dPop) * ratio;
    const dJobs = U.clamp((targetJobs - tot.jobs) * .04 + Math.max(0, dPop) * ratio * .5, -.003 * tot.jobs, .006 * tot.jobs + 2000);
    const record = { ym: ym, pop: tot.pop, jobs: tot.jobs, annual: annual, rail: rail, background: background, strain: strain, future: future.pop, market: market, service: service };
    state.last = record;
    // Re-entering the same month replaces the observation, without duplicating history.
    if (state.history.at(-1)?.ym === ym) state.history[state.history.length - 1] = record;
    else state.history.push(record);
    state.history = state.history.slice(-120);
    return { dPop: dPop, dJobs: dJobs, record: record };
  };
  D.validate = function (s) {
    if (s == null) return;
    const valid = r => r && Number.isInteger(r.ym) && ['pop', 'jobs', 'annual', 'rail', 'background', 'strain', 'future', 'market', 'service'].every(k => Number.isFinite(r[k])) && r.pop >= 0 && r.jobs >= 0 && Math.abs(r.annual) < .1 && r.service >= 0 && r.service <= 1;
    if (s.v !== 1 || !Number.isInteger(s.since) || !Array.isArray(s.history) || s.history.length > 120 || s.history.some(r => !valid(r)) || s.last && !valid(s.last)) throw Error('城市发展记录无效');
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
    if (CM.Future) panel.appendChild(CM.Future.panel(g));
    return panel;
  };
})(window.CM);
