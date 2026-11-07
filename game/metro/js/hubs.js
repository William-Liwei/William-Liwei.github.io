'use strict';
// Shanghai web edition: buildable interchange halls, using the original draft/budget system.
(function (CM) {
  const M = CM.Metro, U = CM.U, h = U.h;
  CM.UI.prototype.hubBuild = function (sid) {
    const self = this, g = this.g(), net = g.draft ? g.draft.net : g.net, s = net.stations[sid];
    if (!s) return h('div');
    const current = M.hubLevel(s), original = M.hubLevel(g.net.stations[sid]), box = h('div', { class: 'field' });
    box.appendChild(h('label', null, '换乘枢纽建设'));
    box.appendChild(h('div', { class: 'note' }, '扩建站厅、换乘通道和出入口可提高吞吐、缩短换乘成本；列车运力仍取决于编组与发车。建设进入草案，确认后扣费。'));
    const cards = h('div', { class: 'size-cards' });
    for (let level = 0; level < M.HUBS.length; level++) {
      const spec = M.HUBS[level], error = level > current ? M.hubEligibility(net, sid, level) : null;
      const size = ['S', 'M', 'L'].indexOf(s.size) < ['S', 'M', 'L'].indexOf(spec.size) ? spec.size : s.size;
      const cap = M.stationCapacity({ size: size, hub: level });
      const cost = Math.max(0, M.hubCost(level, g.clock.y) - M.hubCost(original, g.clock.y));
      cards.appendChild(h('button', { class: 'size-card' + (current === level ? ' on' : ''), 'aria-pressed': current === level ? 'true' : 'false', disabled: error ? true : null, 'data-tip': error,
        onclick: function () {
          if (current === level) return;
          const r = g.edit(function (n) { return M.setHub(n, sid, level); });
          if (r && r.error) self.toast(r.error, 'bad');
        } },
        h('div', { class: 'sc-h' }, h('b', null, spec.name), original === level ? h('span', { class: 'sc-tag' }, '已建') : null),
        h('div', { class: 'sc-v' }, U.fmtInt(cap), h('small', null, ' 人次/时')),
        h('div', { class: 'sc-k' }, level ? '换乘成本 −' + Math.round((1 - spec.transfer) * 100) + '% · 垂直通道更快' : '标准换乘通道'),
        h('div', { class: 'sc-k' }, level ? '大厅维护 +' + U.fmtMoney(spec.daily * g.econ.opsIndex(g.clock.y)) + '/日' : '无额外大厅维护费'),
        h('div', { class: 'sc-k' }, level ? '需 ' + spec.lines + ' 条线路 · ' + CM.CFG.metro.sizeName[spec.size] + '及以上站台' : '关闭大厅不退款'),
        h('div', { class: 'sc-cost' }, error || (cost ? '大厅建设 ' + U.fmtMoney(cost) : current === level ? '当前方案' : '不收大厅建设费'))));
    }
    box.appendChild(cards);
    box.appendChild(h('div', { class: 'tiny muted' }, '选择枢纽会自动补足站台规模，站台扩容另计费，以草案总价为准。拆除线路后大厅仍保留并收取维护费，可在此关闭。'));
    if (current) box.appendChild(h('div', { class: 'callout info' }, M.hubSpec(s).name + ' · 实际容量 ' + U.fmtInt(M.stationCapacity(s)) + ' 人次/时 · ' + M.stationLines(net, sid).length + ' 条线路汇集'));
    return box;
  };
})(window.CM);
