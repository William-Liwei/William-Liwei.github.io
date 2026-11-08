'use strict';
// 可选的鼠标边缘移动：只读指针位置，只改变相机，不触发任何建设操作。
(function (CM) {
  const BAND = 24, DWELL = 0.2, SPEED = 600;
  let tools = null, ui = null, game = null, pointer = null, direction = '', dwell = 0, vx = 0, vy = 0;
  const listeners = [];
  function reset() { pointer = null; direction = ''; dwell = 0; vx = vy = 0; }
  function listen(target, name, fn, options) {
    target.addEventListener(name, fn, options);
    listeners.push(function () { target.removeEventListener(name, fn, options); });
  }
  function typing(el) { return el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable); }
  function blocked(g) {
    if (!g || g.preview || g.pending || g.jumping || document.hidden || (CM.isLoading && CM.isLoading())) return true;
    if (tools.ptr || tools.drag || tools.pinch || (tools.touches && tools.touches.size) || (g.draft && g.draft.liveSnap)) return true;
    if (ui.blocking() || ui.opsApp || ui.voApp || ui.dropdown || ui.searchEl || ui.linePicker || ui._keyCap || ui.propertyPick || typing(document.activeElement)) return true;
    if (CM.Quick && CM.Quick.busy && CM.Quick.busy()) return true;
    if (ui.layerPanelOpen && ui.layerPanelOpen()) return true;
    if (ui.mMore && !ui.mMore.classList.contains('off')) return true;
    if (ui.timeOptions && Object.keys(ui.timeOptions).some(function (k) { const menu = ui.timeOptions[k].menu; return menu && !menu.classList.contains('off'); })) return true;
    if (CM.Keys && tools.keys && ['cam.up', 'cam.down', 'cam.left', 'cam.right', 'cam.zoomIn', 'cam.zoomOut'].some(function (k) { return CM.Keys.held(k, tools.keys, tools.keyMods); })) return true;
    return false;
  }
  function init(nextTools, nextUI) {
    if (tools === nextTools && ui === nextUI) return;
    while (listeners.length) listeners.pop()();
    tools = nextTools; ui = nextUI; game = tools.game(); reset();
    const canvas = tools.R.cv;
    listen(window, 'pointermove', function (e) {
      if (!CM.Settings.get('edgePan') || e.pointerType !== 'mouse' || e.isPrimary === false || e.buttons || e.target !== canvas) { reset(); return; }
      pointer = { x: e.clientX, y: e.clientY, mod: e.shiftKey || e.altKey };
    }, true);
    // 按下即停止，松开后须再次移动鼠标；小地图和滑杆的指针捕获也不会泄漏到这里。
    for (const name of ['pointerdown', 'pointerup', 'pointercancel', 'wheel', 'keydown', 'blur', 'resize']) listen(window, name, reset, true);
    listen(canvas, 'pointerleave', reset);
    listen(window, 'pointerout', function (e) { if (!e.relatedTarget) reset(); }, true);
    listen(document, 'visibilitychange', reset);
    listen(document, 'focusin', function (e) { if (typing(e.target)) reset(); }, true);
  }
  function tick(nextTools, nextUI, dt) {
    init(nextTools, nextUI);
    const g = tools.game();
    if (g !== game) { game = g; reset(); }
    if (!CM.Settings.get('edgePan') || blocked(g)) { reset(); return false; }
    if (!pointer) return false;
    // 以实际可见的画布边缘为准，浏览器外、界面控件上方及遮住画布的浮层均不移动。
    const R = tools.R, rect = R.cv.getBoundingClientRect();
    const left = Math.max(0, rect.left), top = Math.max(0, rect.top), right = Math.min(window.innerWidth, rect.right), bottom = Math.min(window.innerHeight, rect.bottom);
    const p = pointer;
    if (right <= left || bottom <= top || p.x < left || p.x >= right || p.y < top || p.y >= bottom) { reset(); return false; }
    const band = Math.min(BAND, (right - left) / 4, (bottom - top) / 4);
    let x = p.x - left < band ? -(1 - (p.x - left) / band) : right - p.x < band ? 1 - (right - p.x) / band : 0;
    let y = p.y - top < band ? -(1 - (p.y - top) / band) : bottom - p.y < band ? 1 - (bottom - p.y) / band : 0;
    // Interior hover cannot start edge movement without another pointer event.
    // Release it so stationary planning frames skip layout and DOM hit-testing.
    if (!x && !y) { reset(); return false; }
    if (!document.elementFromPoint || document.elementFromPoint(p.x, p.y) !== R.cv) { reset(); return false; }
    const nextDirection = Math.sign(x) + ',' + Math.sign(y);
    if (direction !== nextDirection) { direction = nextDirection; dwell = 0; vx = vy = 0; }
    // 长帧、后台恢复不补走一大段；停靠满 0.2 秒后才平滑起步，离开边缘立即停下。
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
    if (!dt) return false;
    const before = dwell; dwell += dt;
    if (dwell <= DWELL) return false;
    const movingDt = Math.min(dt, dwell - Math.max(before, DWELL));
    const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length; }
    const speed = SPEED * CM.Settings.get('edgePanSpeed'), ease = 1 - Math.exp(-movingDt * 10);
    vx += (x * speed - vx) * ease; vy += (y * speed - vy) * ease;
    if (CM.Follow && CM.Follow.active()) CM.Follow.stop();
    const oldX = R.cam.cx, oldY = R.cam.cy;
    R.panBy(-vx * movingDt, -vy * movingDt);
    const moved = R.cam.cx !== oldX || R.cam.cy !== oldY;
    // 允许绘线链中松开鼠标后移动；随相机重新计算预览，不沿用移动前的落点。
    if (moved && tools.updateHover) tools.updateHover(p.x, p.y, p.mod);
    return moved;
  }
  CM.EdgePan = { init: init, tick: tick, reset: reset };
  CM.Settings.on(function (key) { if (key === 'edgePan' || key === 'edgePanSpeed') reset(); });

  // 复用设置页现有布局和本地偏好存储。
  (CM.UI.settingsExtra.game || (CM.UI.settingsExtra.game = [])).push(function () {
    const h = CM.U.h, S = CM.Settings, title = '鼠标移到边缘时移动地图', speedTitle = '边缘移动速度';
    const opts = [[0.6, '慢'], [1, '标准'], [1.6, '快']], speedButtons = [];
    const update = function () {
      const on = S.get('edgePan');
      toggle.classList.toggle('on', on); toggle.setAttribute('aria-checked', String(on));
      speedButtons.forEach(function (b, i) { b.disabled = !on; b.classList.toggle('on', S.get('edgePanSpeed') === opts[i][0]); b.setAttribute('aria-pressed', String(S.get('edgePanSpeed') === opts[i][0])); });
    };
    const toggle = h('button', { class: 'switch', role: 'switch', 'aria-label': title, 'data-setting': 'edgePan', 'data-silent': '1', onclick: function () { S.set('edgePan', !S.get('edgePan')); update(); if (CM.Sound) CM.Sound.play('toggle'); } }, h('i'));
    const speed = h('div', { class: 'seg-ctl', role: 'group', 'aria-label': speedTitle }, opts.map(function (o) {
      const button = h('button', { 'data-edge-speed': o[0], 'data-silent': '1', onclick: function () { S.set('edgePanSpeed', o[0]); update(); if (CM.Sound) CM.Sound.play('soft'); } }, o[1]);
      speedButtons.push(button); return button;
    }));
    update();
    return h('div', { 'data-settings-edge-pan': '1' },
      h('div', { class: 'set-row' }, h('span', { class: 'set-ico' }, CM.icon('expand')), h('div', { class: 'grow' }, h('div', { class: 'set-t' }, title), h('div', { class: 'set-d' }, '将鼠标停在画面边缘片刻即可移动地图；拖动、操作界面和触屏时不会启用。')), toggle),
      h('div', { class: 'set-row' }, h('span', { class: 'set-ico' }, CM.icon('expand')), h('div', { class: 'grow set-t' }, speedTitle), speed));
  });
})(window.CM);
