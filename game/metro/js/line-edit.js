'use strict';
// 线路直接编辑：拖拽接站与默认列车停站表。沿用原作建设费用、草案和真实运行交路。
(function (CM) {
  const M = CM.Metro, U = CM.U, h = U.h, E = CM.LineEdit = {};

  // 只替换拖动的线路区段；共轨的其他线路保持原路，避免一次手势意外改掉多条线。
  E.insertStation = function (net, segId, target, grab, city, size) {
    const seg = net.segments[segId];
    if (!seg) return { error: '这段轨道已不存在，请重新拖动' };
    let sid = target.station;
    if (sid) {
      if (!net.stations[sid]) return { error: '目标车站已不存在' };
      if (M.stationLines(net, sid).indexOf(seg.line) >= 0) return { error: '本站已在这条线路上，请拖到尚未接入的车站' };
    } else {
      const check = M.checkSite(city, target.x, target.y, seg.type);
      if (!check.ok) return { error: check.msg };
      sid = M.addStation(net, target.x, target.y, { size: size || 'M', type: seg.type }, city);
    }
    const ctrl = M.userControl(net, seg);
    U.distToPoly(grab.x, grab.y, ctrl);
    const split = U._i, bends = seg.pts || [], base = seg.base ? seg.base.slice() : [seg.id];
    const a = M.newId(net, 'g'), b = M.newId(net, 'g');
    // 继承已付费区段来源；由既有评估器计算净新增长度、站台升级和配车费用。
    net.segments[a] = Object.assign({}, seg, { id: a, b: sid, pts: bends.slice(0, split), base: base.slice() });
    net.segments[b] = Object.assign({}, seg, { id: b, a: sid, pts: bends.slice(split), base: base.slice() });
    delete net.segments[a].paidLen; delete net.segments[b].paidLen;
    delete net.segments[segId];
    M.setPlatform(net, sid, seg.line, seg.type);
    const tp = M.lineTopo(net, seg.line);
    if (tp.topo === 'invalid') return { error: '接入后线路形态无效，请选择另一座车站' };
    return { station: sid, segments: [a, b], line: seg.line };
  };

  const T = CM.Tools.prototype;
  T.startRouteDrag = function (e) {
    if (this.R.pickStation(e.clientX, e.clientY)) return;
    if (this.tool === 'select' && CM.Follow && CM.Follow.pick(e.clientX, e.clientY)) return;
    const id = this.R.pickSegment(e.clientX, e.clientY), seg = id && this.net().segments[id];
    if (!seg) return;
    const height = this.R.trackH(seg.type), grab = this.world(e.clientX, e.clientY, height);
    this.drag = { kind: 'reroute', seg: id, h: height, grab: grab, target: grab, touch: e.pointerType === 'touch' };
  };
  T.moveRouteDrag = function (sx, sy) {
    const d = this.drag, net = this.net(), seg = net.segments[d.seg]; if (!seg) return;
    let sid = this.R.pickStation(sx, sy), best = d.touch ? 30 : 20;
    if (!sid) for (const id in net.stations) {
      const s = net.stations[id], p = this.R.P(s.x, s.y, this.R.trackH(s.type)), dist = Math.hypot(p.x - sx, p.y - sy);
      if (dist < best) { best = dist; sid = id; }
    }
    let w = this.world(sx, sy, d.h);
    const snap = !sid && this.snapAt(w); if (snap) w = { x: snap.x, y: snap.y };
    d.target = sid ? { station: sid, x: net.stations[sid].x, y: net.stations[sid].y } : w;
    const check = sid ? { ok: M.stationLines(net, sid).indexOf(seg.line) < 0, msg: '本站已在这条线路上，请选择其他车站' } : M.checkSite(this.game().city, w.x, w.y, seg.type);
    d.error = check.ok ? null : check.msg;
    this.hint = { title: d.error || (sid ? '接入「' + net.stations[sid].name + '」' : '在这里新建车站并接入'), lines: ['松开加入建设草案 · 确认建设后生效', 'Esc 取消拖动'], bad: !!d.error };
    this.ui.setTooltip(this.hint, sx, sy); this.R.cv.style.cursor = 'var(--cur-grabbing)';
  };
  T.finishRouteDrag = function (e) {
    this.moveRouteDrag(e.clientX, e.clientY);
    const d = this.drag, g = this.game(); this.drag = null; this.snapPt = null; this.ui.setTooltip(null);
    if (d.error) { this.ui.toast(d.error, 'bad'); return; }
    const result = g.edit(function (net) { return E.insertStation(net, d.seg, d.target, d.grab, g.city, this.stationSize); }.bind(this));
    if (result.error) { this.ui.toast(result.error, 'bad'); return; }
    this.ui.select({ kind: 'station', id: result.station });
    this.ui.toast('已接入车站，确认建设后生效；可撤销或继续调整线形', 'good');
    if (CM.Sound) CM.Sound.play('place');
  };
  T.drawRouteDrag = function (ctx, R) {
    const d = this.drag, net = this.net(), seg = net.segments[d.seg]; if (!seg) return;
    const target = d.target, a = net.stations[seg.a], b = net.stations[seg.b], color = d.error ? '#d63031' : CM.Accessibility.line(net.lines[seg.line]);
    const ctrl = M.userControl(net, seg); U.distToPoly(d.grab.x, d.grab.y, ctrl); const k = U._i;
    const bends = seg.pts || [], points = [[a.x, a.y]].concat(bends.slice(0, k), [[target.x, target.y]], bends.slice(k), [[b.x, b.y]]);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([8, 5]);
    ctx.beginPath(); points.forEach(function (p, i) { const q = R.P(p[0], p[1], d.h); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = R.lineWidthPx() + 5; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = R.lineWidthPx() + 1; ctx.stroke(); ctx.setLineDash([]);
    const q = R.P(target.x, target.y, d.h); ctx.beginPath(); ctx.arc(q.x, q.y, 12, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.error ? '×' : '+', q.x, q.y);
    ctx.restore();
  };

  E.stopPlan = function (net, lid, skipped) {
    const L = net.lines[lid], tp = L && M.lineTopo(net, lid);
    if (!tp || !tp.routes.length || tp.topo === 'invalid') return { error: '线路连通后才能设置停靠站' };
    const fixed = new Set(), stations = new Set();
    for (const r of tp.routes) {
      r.st.forEach(function (sid) { stations.add(sid); });
      fixed.add(r.st[0]); if (!r.loop) fixed.add(r.st[r.st.length - 1]);
    }
    const skip = Array.from(new Set(skipped || [])).filter(function (sid) { return stations.has(sid) && !fixed.has(sid); });
    for (const r of tp.routes) if (r.st.filter(function (sid) { return skip.indexOf(sid) < 0; }).length < 2) return { error: '每个运行方向至少需要停靠两站' };
    return { skip: skip, fixed: fixed, stations: Array.from(stations), topo: tp };
  };
  E.setStops = function (g, lid, skip) {
    if (g.jumping || g.pending) return { error: '正在结算，请稍候' };
    if (g.draft && g.draft.liveSnap) return { error: '请先结束当前拖动' };
    const plan = E.stopPlan(g.net, lid, skip); if (plan.error) return plan;
    CM.ui.setLineLook(lid, { skip: plan.skip.length ? plan.skip : undefined });
    g.refreshOperations();
    g.logEvent({ tag: '运营', title: g.net.lines[lid].name + ' 调整停靠站', desc: plan.skip.length ? '默认列车通过 ' + plan.skip.length + ' 站；停靠、运行时间和可达客流已更新。' : '默认列车恢复全程站站停。' });
    return { ok: true };
  };
  CM.UI.prototype.lineStopBlock = function (lid) {
    const self = this, g = this.g(), L = g.net.lines[lid];
    if (!L) return null;
    const n = (L.skip || []).length;
    return h('div', { class: 'le-stop-summary' }, h('div', { class: 'grow' }, h('b', null, '停靠 / 通过'), h('small', null, n ? '默认列车通过 ' + n + ' 站' : '默认列车在每站停靠')),
      h('button', { class: 'btn sm', onclick: function () { self.showLineStopEditor(lid); } }, '编辑停靠站'));
  };
  CM.UI.prototype.showLineStopEditor = function (lid, focusSid) {
    const self = this, g = this.g(), L = g.net.lines[lid];
    if (!L) { this.toast('请先确认线路建设，再设置停靠站', 'info'); return; }
    const initial = E.stopPlan(g.net, lid, L.skip || []);
    if (initial.error) { this.toast(initial.error, 'bad'); return; }
    let skip = new Set(initial.skip);
    const box = h('div'), message = h('div', { class: 'note' });
    const draw = function () {
      box.replaceChildren();
      const list = h('div', { class: 'le-stops', role: 'group', 'aria-label': '默认列车停靠站' });
      for (const sid of initial.stations) {
        const s = g.net.stations[sid], fixed = initial.fixed.has(sid), stop = !skip.has(sid);
        const lines = M.stationLines(g.net, sid), other = lines.filter(function (id) { return id !== lid; });
        const button = h('button', { class: 'le-stop' + (stop ? ' on' : ' pass') + (sid === focusSid ? ' focus' : ''), 'aria-pressed': stop ? 'true' : 'false', disabled: fixed ? true : null,
          'aria-label': s.name + '，' + (fixed ? '起讫站必须停靠' : stop ? '停靠，点击改为通过' : '通过，点击改为停靠'), onclick: function () {
            const next = new Set(skip); if (next.has(sid)) next.delete(sid); else next.add(sid);
            const check = E.stopPlan(g.net, lid, Array.from(next));
            if (check.error) { self.toast(check.error, 'bad'); return; } skip = next; draw();
          } }, h('span', { class: 'le-stop-dot', 'aria-hidden': 'true' }), h('span', { class: 'grow' }, h('b', null, s.name), h('small', null, fixed ? '起讫站 · 必须停靠' : other.length ? '换乘 ' + other.map(function (id) { return g.net.lines[id].name; }).join(' / ') : '点击切换')),
          h('span', { class: 'le-stop-state' }, stop ? '停靠' : '通过不停'));
        list.appendChild(button);
      }
      message.textContent = skip.size ? '通过 ' + skip.size + ' 站：本线默认列车不在这些站上下客，换乘也需有实际停靠的交路。其他加开交路保留各自停站表。' : '默认列车全程站站停。现有配属列车直接使用这份停站表，无需另买列车。';
      box.appendChild(list); box.appendChild(message);
      box.appendChild(h('div', { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: function () { skip.clear(); draw(); } }, '全部停靠'),
        h('button', { class: 'btn', onclick: function () { self.closeScreen(); } }, '取消'),
        h('button', { class: 'btn primary', onclick: function () {
          const result = E.setStops(g, lid, Array.from(skip));
          if (result.error) { self.toast(result.error, 'bad'); return; }
          self.closeScreen(); self.markUnsaved(); self.scheduleAutosave(); self.rerenderPage(); self.toast('停站表已生效，现有列车按新方案运行', 'good');
        } }, '应用停站表')));
      if (CM.I18n) CM.I18n.localize(box);
    };
    draw();
    this.openScreen(h('div', { class: 'card wide' }, this.cardHead('metro', 'b-blue', L.name + ' · 停靠 / 通过'), h('div', { class: 'note' }, '点击车站切换停靠或通过。只改运营组织，不收费，应用后立即影响列车运行和乘客路径。'), box), function () { self.closeScreen(); });
  };
})(window.CM);
