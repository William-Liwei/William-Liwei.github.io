'use strict';
// Shanghai's fictional future is a separate clock-driven layer, independent of rail-led development.
(function (CM) {
  const U = CM.U, F = CM.Future = {};
  const ERAS = [
    { y: 2025, name: '数字服务与弹性办公', desc: '就业逐步向多中心分布，日常消费从传统商务区向居住片区扩散。', pop: .0005, jobs: 1.01, com: 1.025 },
    { y: 2030, name: '科研与先进制造扩张', desc: '研发、大学与先进制造吸引新岗位和外来人才，也带来更多住房需求。', pop: .0015, jobs: 1.045, com: 1.025 },
    { y: 2038, name: '老龄化与生活服务转型', desc: '人口自然增长放缓，医疗、照护与近距离生活服务的重要性上升。', pop: -.002, jobs: .985, com: 1.04 },
    { y: 2046, name: '低碳产业与新城更新', desc: '产业更新增加岗位，新城进入成熟期；旧城与新城都需要持续投资。', pop: .001, jobs: 1.035, com: 1.035 },
    { y: 2060, name: '成熟都市圈', desc: '人口增长更多依赖吸引力和就业，既有设施的容量与运营质量更为重要。', pop: -.001, jobs: 1.015, com: 1.02 },
  ];
  const EVENTS = [
    { id: 'talent', title: '区域人才流入', desc: '新的教育与就业机会带来一轮迁入。', months: 18, pop: .004, jobs: 1.02, com: 1.015 },
    { id: 'cooling', title: '投资降温', desc: '企业暂缓扩张，新增岗位与消费承压。', months: 18, pop: -.004, jobs: .97, com: .94 },
    { id: 'services', title: '生活服务消费复苏', desc: '社区消费与服务业扩张，商业经营受益。', months: 12, pop: .001, jobs: 1.02, com: 1.07 },
    { id: 'energy', title: '能源转型调整期', desc: '企业更新生产方式，短期就业与消费略有回落。', months: 12, pop: -.001, jobs: .985, com: .97 },
    { id: 'industry', title: '新产业投资窗口', desc: '新一轮研发与产业投资提高就业吸引力。', months: 24, pop: .003, jobs: 1.04, com: 1.025 },
  ];
  F.enabled = g => !!g && (g.mapId === 'sh' || g.mapId === 'sh-city');
  F.era = year => ERAS.filter(e => e.y <= year).at(-1) || null;
  function episode(g, ym) {
    const start = U.ymIndex(2026, 7); if (ym < start) return null;
    const n = Math.floor((ym - start) / 36), began = start + n * 36;
    const e = EVENTS[Math.floor(U.hash2(n, 97, (g.seed || 1) + 9103) * EVENTS.length) % EVENTS.length];
    return { n: n, began: began, until: began + e.months - 1, event: e };
  }
  F.factors = function (g) {
    if (!F.enabled(g)) return { pop: 0, jobs: 1, com: 1 };
    const era = F.era(g.clock.y), ep = episode(g, g.ym()), e = ep && g.ym() <= ep.until ? ep.event : null;
    return { pop: (era ? era.pop : 0) + (e ? e.pop : 0), jobs: (era ? era.jobs : 1) * (e ? e.jobs : 1), com: (era ? era.com : 1) * (e ? e.com : 1) };
  };
  F.month = function (g, year, month) {
    if (!F.enabled(g)) return;
    const ym = U.ymIndex(year, month), s = g.future || (g.future = { v: 1, since: ym, lastYm: ym - 1, events: [] });
    if (s.lastYm >= ym) return;
    const entries = ERAS.filter(e => U.ymIndex(e.y, 1) > s.lastYm && U.ymIndex(e.y, 1) <= ym).map(e => ({ id: 'era-' + e.y, title: e.name, desc: e.desc, ym: U.ymIndex(e.y, 1) }));
    const ep = episode(g, ym);
    if (ep && ep.began > s.lastYm && ep.began <= ym) entries.push({ id: ep.event.id + '-' + ep.n, title: ep.event.title, desc: ep.event.desc + ' 影响持续 ' + ep.event.months + ' 个月。', ym: ep.began });
    for (const e of entries) { s.events.push({ id: e.id, title: e.title, ym: e.ym }); g.logEvent({ tag: '未来模拟', title: e.title, desc: e.desc + '（本局模拟事件）' }); }
    s.events = s.events.slice(-24); s.lastYm = ym;
  };
  F.validate = function (s) {
    if (s == null) return;
    if (s.v !== 1 || !Number.isInteger(s.since) || !Number.isInteger(s.lastYm) || s.lastYm < s.since - 1 || !Array.isArray(s.events) || s.events.length > 24 || s.events.some(e => !e || typeof e.id !== 'string' || e.id.length > 48 || typeof e.title !== 'string' || e.title.length > 80 || !Number.isInteger(e.ym))) throw Error('未来模拟记录无效');
  };
  F.serialize = function (g) { return g.future ? JSON.parse(JSON.stringify(g.future)) : undefined; };
  F.restore = function (g, s) { F.validate(s); g.future = F.enabled(g) && s ? JSON.parse(JSON.stringify(s)) : null; };
  F.panel = function (g) {
    const h = U.h, era = F.era(g.clock.y), ep = episode(g, g.ym()), active = ep && g.ym() <= ep.until;
    return h('section', { class: 'chart-card' }, h('h3', null, '城市群的未来模拟'),
      h('p', { class: 'note' }, '产业、生活方式与周期事件独立随时间演变；以下为游戏情景，不是未来事实。'),
      h('b', null, era ? era.name : '2025 年后逐步进入未来情景'),
      h('p', { class: 'note' }, era ? era.desc : '人口与岗位仍会受当前经营和交通影响。'),
      active ? h('div', { class: 'callout info' }, ep.event.title + ' · 至 ' + Math.floor(ep.until / 12) + '年' + (ep.until % 12 + 1) + '月') : null,
      h('div', { class: 'tiny muted' }, '周期会影响人口迁入、岗位目标与商业收益；事件可在城市纪事中回看。'));
  };
})(window.CM);
