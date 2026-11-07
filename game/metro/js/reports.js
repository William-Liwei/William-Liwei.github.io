'use strict';
// 建设报告：可选的自动展开、地铁芯中的固定入口，以及评估期间可重开的最近完成报告。
// 提示消失、关闭面板和读档都不会消费报告；自动展开只针对当前游戏中新生成的一份结果。
(function (CM) {
  const h = CM.U.h, states = new WeakMap(), Reports = CM.Reports = {};
  const current = function (ui, g) {
    let s = states.get(ui);
    if (!s || s.game !== g) { s = { game: g, seen: null, pending: null }; states.set(ui, s); }
    return s;
  };
  Reports.latest = function (g) {
    if (!g) return null;
    return CM.Game.validImpact(g.impactReport) ? g.impactReport : (CM.Game.validImpact(g.lastImpactReport) ? g.lastImpactReport : null);
  };
  Reports.evaluating = function (g) { return !!(g && g.impactReport && g.impactReport.status !== 'done'); };
  Reports.waitingText = function () {
    return CM.Settings.get('autoImpactReport') ? '正在评估本次建设的交通效果。完成后会在界面空闲时自动展开报告。' : '正在评估本次建设的交通效果。完成后可随时从地铁芯概览打开报告。';
  };
  Reports.notice = function (g, r) {
    if (Reports.evaluating(g)) return '本次建设仍在评估，以下保留最近一份已完成的报告。';
    if (r && r.previous) return '这是最近一份已完成的报告，不包含之后的建设。';
    return '';
  };
  Reports.viewed = function (ui, r) {
    const s = current(ui, ui.g());
    if (s.pending && s.pending.report === r) s.pending = null;
  };
  Reports.open = function (ui) {
    const g = ui.g(); if (!g) return;
    const go = function () { if (ui.g() === g) ui.openPage('impact', null, { root: true }); };
    if (ui.opsApp) ui.opsApp.close(go);
    else go();
  };
  Reports.ready = function (ui, g) {
    if (ui.g() !== g || !CM.Game.validImpact(g.impactReport)) return;
    const r = g.impactReport, s = current(ui, g);
    if (s.seen === r) return;
    s.seen = r; s.pending = null;
    // 教程的首线效果卡沿用自己的节奏；不叠加一次自动展开或第二条提示。
    if (CM.Tutorial && CM.Tutorial.onImpact && CM.Tutorial.onImpact()) return;
    if (ui.topIs(['impact']) && !ui.right.classList.contains('closed')) return;
    if (CM.Settings.get('autoImpactReport')) {
      s.pending = { report: r, version: g.netVersion };
      Reports.tick(ui);
      if (!s.pending) return;
    }
    ui.toast('本次建设的效果报告已生成', 'info', { label: '查看报告', fn: function () { if (ui.g() === g) Reports.open(ui); } });
  };
  Reports.tick = function (ui) {
    const s = states.get(ui); if (!s || !s.pending) return;
    const g = ui.g(), p = s.pending;
    if (g !== s.game || !CM.Settings.get('autoImpactReport') || g.impactReport !== p.report || g.netVersion !== p.version) { s.pending = null; return; }
    if (ui.topIs(['impact']) && !ui.right.classList.contains('closed')) { s.pending = null; return; }
    const a = document.activeElement, tools = ui.tools;
    if (document.hidden || ui.blocking() || g.pending || g.jumping || g.draft ||
      CM.Settings.get('immersive') || tools && (tools.drag || tools.chain) ||
      CM.Tutorial && CM.Tutorial.active && CM.Tutorial.active() ||
      ui.dropdown || ui.searchEl || ui.linePicker || ui.layerPanelOpen && ui.layerPanelOpen() ||
      a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    s.pending = null;
    Reports.open(ui);
  };
  // 复用地铁芯概览的卡片样式与手机滚动布局，不增加挡住地图的悬浮按钮。
  Reports.entry = function (ui) {
    const g = ui.g(), r = Reports.latest(g), waiting = Reports.evaluating(g);
    if (!r && !waiting) return null;
    const status = waiting ? (r ? '本次仍在评估，可先查看最近完成的报告。' : '正在评估本次建设的交通效果。') : '最近完成的报告会随进度保存，可随时重新打开。';
    return h('section', { class: 'mc-card mc-pad report-entry' },
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '10px' } },
        CM.icon('report', 20),
        h('div', { class: 'grow', style: { minWidth: 'min(180px, 100%)' } }, h('b', null, '建设效果报告'),
          h('div', { class: 'tiny muted' }, status), r ? h('div', { class: 'tiny muted' }, r.at[0] + '年' + r.at[1] + '月') : null),
        h('button', { class: 'btn sm', 'data-report-open': '1', onclick: function () { Reports.open(ui); } }, CM.icon('report', 14), r ? '查看最近报告' : '查看评估进度')));
  };
  (CM.UI.settingsExtra.game || (CM.UI.settingsExtra.game = [])).push(function () {
    const S = CM.Settings, key = 'autoImpactReport', title = '建设后自动展开报告';
    const toggle = h('button', { class: 'switch' + (S.get(key) ? ' on' : ''), role: 'switch', 'aria-label': title,
      'aria-checked': S.get(key) ? 'true' : 'false', 'data-setting': key, 'data-silent': '1', onclick: function () {
        S.set(key, !S.get(key)); toggle.classList.toggle('on', S.get(key)); toggle.setAttribute('aria-checked', String(S.get(key)));
        if (CM.Sound) CM.Sound.play('toggle');
      } }, h('i'));
    return h('div', { class: 'set-row' }, h('span', { class: 'set-ico' }, CM.icon('report')),
      h('div', { class: 'grow' }, h('div', { class: 'set-t' }, title), h('div', { class: 'set-d' }, '每次确认建设后，等评估完成且其他弹窗关闭再展开。关闭后仍可从地铁芯概览查看最近报告。')), toggle);
  });
})(window.CM);
