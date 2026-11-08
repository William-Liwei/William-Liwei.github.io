'use strict';
// 地图缩放：对数滑条与定位快捷键，只改变镜头，不读写玩家存档。
(function (CM) {
  const STEPS = 1000, BASE = 13;
  const percent = function (z) { return Math.round(z / BASE * 100) + '%'; };
  const Z = CM.ZoomControls = {};
  Z.toSlider = function (zoom, limits) { return Math.round(Math.log(zoom / limits.min) / Math.log(limits.max / limits.min) * STEPS); };
  Z.fromSlider = function (value, limits) { return limits.min * Math.pow(limits.max / limits.min, Math.max(0, Math.min(STEPS, +value)) / STEPS); };
  function element(tag, cls, label) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (label) el.textContent = label;
    return el;
  }
  Z.init = function (ui) {
    if (ui._zoomControls) return;
    const button = element('button', 'zoom-value');
    button.type = 'button'; button.setAttribute('aria-label', '地图缩放');
    button.setAttribute('data-tip', '拖动滑条调整地图缩放'); button.setAttribute('data-side', 'right');
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'zoomPanel');
    const panel = element('div', 'glass'); panel.id = 'zoomPanel'; panel.hidden = true; panel.inert = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '地图缩放');
    const head = element('div', 'zoom-heading'), label = element('label', '', '地图缩放'), value = element('output', 'zoom-readout');
    label.htmlFor = 'mapZoomRange'; value.htmlFor = 'mapZoomRange'; head.append(label, value);
    const range = element('input', 'zoom-range'); range.type = 'range'; range.id = 'mapZoomRange';
    range.min = '0'; range.max = String(STEPS); range.step = '1'; range.setAttribute('aria-label', '地图缩放');
    const ends = element('div', 'zoom-ends'); ends.append(element('span', '', '全域'), element('span', '', '细节'));
    const actions = element('div', 'zoom-actions');
    const fit = element('button', 'btn sm', '查看全图'), home = element('button', 'btn sm', '回到起始位置');
    fit.type = home.type = 'button'; actions.append(fit, home);
    panel.append(head, range, ends, actions);
    ui.zoomCtl.insertBefore(button, ui.compass || null);
    document.getElementById('app').appendChild(panel);
    const state = ui._zoomControls = { button: button, panel: panel, range: range, value: value, open: false };
    const toggle = function (on, focus) {
      if (!on && panel.contains(document.activeElement)) document.activeElement.blur();
      state.open = on; panel.hidden = !on; panel.inert = !on;
      button.setAttribute('aria-expanded', String(on));
      if (on) { Z.update(ui); if (focus) range.focus(); }
      else if (focus) button.focus();
    };
    state.close = function () { toggle(false, false); };
    button.addEventListener('click', function () { toggle(!state.open, true); });
    const apply = function () {
      if (!CM.game || (ui.blocking && ui.blocking())) return;
      const R = ui.R;
      R.setZoomAt(R.w / 2, R.h / 2, Z.fromSlider(range.value, R.zoomLimits()));
      Z.update(ui);
    };
    range.addEventListener('input', apply);
    range.addEventListener('keydown', function (e) {
      let n = +range.value;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n += 10;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n -= 10;
      else if (e.key === 'PageUp') n += 100;
      else if (e.key === 'PageDown') n -= 100;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = STEPS;
      else return;
      e.preventDefault(); range.value = String(n); apply();
    });
    fit.addEventListener('click', function () { ui.resetView(); toggle(false, true); });
    home.addEventListener('click', function () {
      const g = CM.game; if (!g) return;
      const mp = CM.curMap ? CM.curMap() : null;
      const camera = (g.mapId === 'sh' && CM.CompanyRoles && CM.CompanyRoles.camera(g.playerCity)) || (mp && mp.cam) || { cx: CM.CFG.W / 2, cy: CM.CFG.H / 2, zoom: BASE };
      if (CM.Follow && CM.Follow.active()) CM.Follow.stop();
      ui.R.flyTo(camera.cx, camera.cy, camera.zoom);
      toggle(false, true);
    });
    // 控件的拖动和按键不进入地图建设/游戏快捷键；Tab 仍按浏览器原生顺序移动焦点。
    for (const el of [ui.zoomCtl, panel]) {
      for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'dblclick', 'contextmenu']) el.addEventListener(event, function (e) { e.stopPropagation(); });
      el.addEventListener('wheel', function (e) { e.preventDefault(); e.stopPropagation(); }, { passive: false });
      el.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); toggle(false, true); }
      });
      // keyup 留给 Tools 清理此前按住的地图方向键，不会触发游戏快捷操作。
    }
    window.addEventListener('pointerdown', function (e) { if (state.open && !panel.contains(e.target) && !button.contains(e.target)) toggle(false, false); }, true);
    window.addEventListener('blur', state.close);
    Z.update(ui);
  };
  Z.update = function (ui) {
    const state = ui && ui._zoomControls; if (!state) return;
    const R = ui.R, zoom = R.clampZoom(R.cam.tz), label = percent(zoom), limits = R.zoomLimits();
    if (state.label !== label) {
      state.label = label; state.button.textContent = label; state.value.textContent = label;
      state.range.setAttribute('aria-valuetext', label);
      state.button.setAttribute('aria-label', '地图缩放' + ' ' + label);
    }
    const next = String(Z.toSlider(zoom, limits)); if (state.range.value !== next) state.range.value = next;
    if (!state.open) return;
    if (!CM.game || (ui.blocking && ui.blocking()) || (ui.dock && ui.dock.classList.contains('hidden')) || document.body.classList.contains('cinema') || document.documentElement.classList.contains('panel-editing')) { state.close(); return; }
    const rect = state.button.getBoundingClientRect(), panel = state.panel, viewport = window.visualViewport;
    const x0 = viewport ? viewport.offsetLeft : 0, y0 = viewport ? viewport.offsetTop : 0;
    const w = viewport ? viewport.width : window.innerWidth, h = viewport ? viewport.height : window.innerHeight;
    const scale = CM.Settings && Number(CM.Settings.get('uiScale')), z = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const px = function (key, n) { const value = n + 'px'; if (panel.style[key] !== value) panel.style[key] = value; };
    // Rects use visible CSS pixels, while the zoomed panel's layout uses its
    // own unscaled pixels. Constrain before measuring so a narrow/short visual
    // viewport leaves the slider and actions reachable through scrolling.
    px('maxWidth', Math.max(1, w - 16) / z); px('maxHeight', Math.max(1, h - 16) / z);
    const pw = (panel.offsetWidth || 244) * z, ph = (panel.offsetHeight || 150) * z;
    px('left', Math.max(x0 + 8, Math.min(x0 + w - pw - 8, rect.right + 10)) / z);
    px('top', Math.max(y0 + 8, Math.min(y0 + h - ph - 8, rect.top - ph / 2 + rect.height / 2)) / z);
  };
})(window.CM);
