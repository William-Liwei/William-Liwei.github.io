'use strict';
// 全图雷达：有界采样底图 + 只在网络变化时更新的线网，平时只重画视野框。
(function (CM) {
  const W = 204, H = 140, PAD = 3, GAP = 8;
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const tr = function (s) { return CM.I18n ? CM.I18n.text(s) : s; };
  const localize = function (el) { if (CM.I18n) CM.I18n.localize(el); };
  const canvas = function () { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v9l6 6M3 12h4M12 17v4M17 12h4"/><circle cx="8.5" cy="9" r="1" fill="currentColor"/></svg>';

  function frame(city) {
    const s = Math.min((W - 2 * PAD) / city.W, (H - 2 * PAD) / city.H);
    return { x: (W - city.W * s) / 2, y: (H - city.H * s) / 2, w: city.W * s, h: city.H * s, s: s };
  }
  function viewport(R) {
    return [[0, 0], [R.w, 0], [R.w, R.h], [0, R.h]].map(function (p) { return R.unproject(p[0], p[1]); });
  }
  function isVisible(el) {
    return !!(el && !el.hidden && !el.classList.contains('hidden') && !el.classList.contains('closed') && el.getClientRects().length);
  }
  function intersects(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }

  function Radar(ui) {
    this.ui = ui; this.R = ui.R; this.game = null; this.nextDraw = 0; this.drawKey = ''; this.terrainKey = ''; this.baseKey = '';
    this.stats = { terrainBuilds: 0, networkBuilds: 0, draws: 0, samples: 0 };
    this.root = document.createElement('section'); this.root.id = 'minimap'; this.root.className = 'hud glass hidden';
    this.root.setAttribute('aria-label', '全图雷达');
    this.toggle = document.createElement('button'); this.toggle.type = 'button'; this.toggle.className = 'minimap-toggle';
    this.toggle.innerHTML = icon + '<span>全图雷达</span><span class="minimap-chevron" aria-hidden="true">⌃</span>';
    this.toggle.setAttribute('aria-controls', 'minimap-body');
    this.body = document.createElement('div'); this.body.id = 'minimap-body'; this.body.className = 'minimap-body';
    this.cv = canvas(); this.cv.className = 'minimap-canvas'; this.cv.tabIndex = 0;
    this.cv.setAttribute('role', 'application'); this.cv.setAttribute('aria-label', '全图雷达，点击或拖动移动视野，方向键微调，Home 回到地图中心');
    this.hint = document.createElement('small'); this.hint.className = 'minimap-hint'; this.hint.textContent = '点击 / 拖动定位';
    this.body.append(this.cv, this.hint); this.root.append(this.toggle, this.body);
    (document.getElementById('app') || document.body).appendChild(this.root);
    this.ctx = this.cv.getContext('2d'); this.terrain = canvas(); this.base = canvas();
    this.hudOn = !ui.top || !ui.top.classList.contains('hidden');
    this.bind(); this.sync(); localize(this.root);
  }
  Radar.prototype.bind = function () {
    const s = this;
    this.toggle.addEventListener('click', function (e) {
      e.stopPropagation(); CM.Settings.set('minimapOpen', !s.expanded); s.sync(); s.layout(); s.tick(true);
    });
    // 吞掉整个组件的地图手势。窗口上的 Tools 监听器不会拿到雷达拖动或键盘操作。
    for (const type of ['click', 'dblclick', 'contextmenu', 'wheel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      this.root.addEventListener(type, function (e) { e.stopPropagation(); if (type === 'wheel' || type === 'contextmenu') e.preventDefault(); }, { passive: false });
    }
    this.cv.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.button !== undefined) return;
      e.preventDefault(); e.stopPropagation();
      if (s.pointer != null) return;
      s.pointer = e.pointerId; s.cv.focus({ preventScroll: true });
      if (s.cv.setPointerCapture) { try { s.cv.setPointerCapture(e.pointerId); } catch (err) { /* 指针已结束 */ } }
      s.point(e);
    });
    this.root.addEventListener('focusin', function () { if (s.ui.tools && s.ui.tools.keys) s.ui.tools.keys.clear(); });
    this.cv.addEventListener('pointermove', function (e) { if (s.pointer === e.pointerId) { e.preventDefault(); s.point(e); } });
    const end = function (e) { if (s.pointer === e.pointerId) { s.pointer = null; if (s.cv.releasePointerCapture) { try { s.cv.releasePointerCapture(e.pointerId); } catch (err) {} } } };
    this.cv.addEventListener('pointerup', end); this.cv.addEventListener('pointercancel', end); this.cv.addEventListener('lostpointercapture', end);
    this.root.addEventListener('keydown', function (e) {
      // Escape continues to close an existing game panel; other keys stay inside the control.
      if (e.key !== 'Escape') e.stopPropagation();
      if (e.target !== s.cv || !s.game) return;
      const c = s.R.cam, step = Math.min(s.game.city.W, s.game.city.H) * (e.shiftKey ? .05 : .015);
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) { e.preventDefault(); s.jump(c.cx + d[0], c.cy + d[1]); }
      else if (e.key === 'Home') { e.preventDefault(); s.jump(s.game.city.W / 2, s.game.city.H / 2); }
    });
    window.addEventListener('blur', function () { s.pointer = null; });
    document.addEventListener('visibilitychange', function () { if (document.hidden) s.pointer = null; });
    if (CM.Settings.on) CM.Settings.on(function (key) {
      if (!key || key === 'minimapOpen' || key === 'uiScale' || key === 'language') { s.sync(); s.layout(); s.tick(true); }
    });
  };
  Radar.prototype.sync = function () {
    const value = CM.Settings.get('minimapOpen');
    this.wantOpen = value === true || (value !== false && !(this.ui.compact ? this.ui.compact() : window.innerWidth <= 760));
    const active = !!(this.hudOn && this.game && !this.game.preview);
    this.root.classList.toggle('hidden', !active); this.root.inert = !active; this.root.setAttribute('aria-hidden', active ? 'false' : 'true');
    if (!active) { this.pointer = null; if (this.root.contains(document.activeElement)) document.activeElement.blur(); }
    this.setExpanded(this.wantOpen);
  };
  Radar.prototype.setExpanded = function (on) {
    this.expanded = on; this.root.classList.toggle('collapsed', !on); this.body.hidden = !on;
    this.toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
    this.toggle.setAttribute('aria-label', tr(on ? '收起全图雷达' : '展开全图雷达'));
    if (!on && document.activeElement === this.cv) this.toggle.focus({ preventScroll: true });
  };
  Radar.prototype.layout = function () {
    if (this.root.classList.contains('hidden')) return;
    const ui = this.ui, z = CM.Settings.get('uiScale') || 1;
    const v = ui.viewport ? ui.viewport() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const compact = ui.compact ? ui.compact() : window.innerWidth <= 760;
    const gap = GAP * z, top = isVisible(ui.top) ? Math.max(v.top + gap, ui.top.getBoundingClientRect().bottom + gap) : v.top + gap;
    let right = v.right - gap, bottom = v.bottom - gap;
    const panel = isVisible(ui.right) ? ui.right.getBoundingClientRect() : null;
    if (panel) {
      if (!compact || window.innerWidth > window.innerHeight) right = Math.min(right, panel.left - gap);
      else bottom = Math.min(bottom, panel.top - gap);
    }
    const obstacles = [ui.toolbar, ui.bstack, ui.brDock, ui.scaleBar, ui.newsHost, ui.legendCard, ui.dock, ui.layerPanel,
      document.getElementById('followCard'), document.querySelector('.ops-pop')].filter(isVisible).map(function (el) { return el.getBoundingClientRect(); }).filter(function (r) { return r.width > 0 && r.height > 0; });
    const place = function (open) {
      const width = (open ? W + 16 : 126) * z, height = (open ? H + (compact ? 74 : 66) : compact ? 44 : 36) * z;
      const edge = Math.max(v.left + gap + width, right), box = { left: edge - width, right: edge, top: bottom - height, bottom: bottom };
      for (let pass = 0; pass <= obstacles.length; pass++) {
        let moved = false;
        for (const o of obstacles) if (intersects(box, o)) { box.bottom = o.top - gap; box.top = box.bottom - height; moved = true; }
        if (!moved) break;
      }
      return box;
    };
    let open = this.wantOpen, box = place(open);
    if (open && (box.top < top || box.right > v.right - gap)) { open = false; box = place(false); }
    this.setExpanded(open);
    // A short screen may have only a button-sized strip of map above its drawer.
    const safeTop = Math.max(top, box.top);
    this.root.style.left = (Math.max(v.left + gap, box.left) / z) + 'px';
    this.root.style.top = (safeTop / z) + 'px';
    this.root.classList.toggle('minimap-tight', !open && this.wantOpen);
  };
  Radar.prototype.point = function (e) {
    if (!this.game) return;
    const r = this.cv.getBoundingClientRect(); if (!r.width || !r.height) return;
    const f = frame(this.game.city), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    this.jump((x - f.x) / f.s, (y - f.y) / f.s);
  };
  Radar.prototype.jump = function (x, y) {
    if (!this.game || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const R = this.R, c = R.cam, city = this.game.city;
    if (CM.Follow && CM.Follow.active()) CM.Follow.stop();
    c.fly = null; c.anchor = null; c.cx = clamp(x, 0, city.W); c.cy = clamp(y, 0, city.H);
    // A pending zoom must not later pull the camera back to its former anchor.
    R.computeTransform();
    this.drawKey = ''; this.tick(true);
  };
  Radar.prototype.buildTerrain = function (city, dark) {
    const x = this.terrain.getContext('2d'), im = x.createImageData(W, H), f = frame(city);
    const pal = dark ? { bg: [17, 28, 43], land: [34, 57, 70], water: [20, 42, 65], hill: [49, 79, 77], urban: [55, 75, 91] }
      : { bg: [220, 234, 244], land: [217, 232, 228], water: [155, 195, 220], hill: [163, 193, 180], urban: [191, 210, 217] };
    let sampled = 0;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const wx = (px + .5 - f.x) / f.s, wy = (py + .5 - f.y) / f.s;
      let color = pal.bg;
      if (wx >= 0 && wy >= 0 && wx < city.W && wy < city.H) {
        const k = Math.floor(wy) * city.W + Math.floor(wx), lu = city.lu ? city.lu[k] : 0;
        const water = city.wmask && city.FS ? city.wmask[Math.floor(wy * city.FS) * city.FW + Math.floor(wx * city.FS)] : lu === 7;
        color = water ? pal.water : lu === 8 || lu === 5 ? pal.hill : lu > 0 && lu < 5 ? pal.urban : pal.land; sampled++;
      }
      const k = 4 * (py * W + px); im.data[k] = color[0]; im.data[k + 1] = color[1]; im.data[k + 2] = color[2]; im.data[k + 3] = 255;
    }
    x.putImageData(im, 0, 0); this.stats.terrainBuilds++; this.stats.samples += sampled;
  };
  Radar.prototype.buildBase = function (g, dark) {
    const x = this.base.getContext('2d'), f = frame(g.city), net = g.draft && g.draft.net || g.net;
    const compiled = g.draft && g.draft.compiled && g.draft.compVer === g.draft.ver ? g.draft.compiled : !g.draft ? g.compiled : null;
    x.clearRect(0, 0, W, H); x.drawImage(this.terrain, 0, 0); x.save(); x.beginPath(); x.rect(f.x, f.y, f.w, f.h); x.clip();
    x.strokeStyle = dark ? 'rgba(143,198,227,.13)' : 'rgba(44,102,143,.12)'; x.lineWidth = .5; x.beginPath();
    for (let i = 1; i < 5; i++) { x.moveTo(f.x + f.w * i / 5, f.y); x.lineTo(f.x + f.w * i / 5, f.y + f.h); x.moveTo(f.x, f.y + f.h * i / 5); x.lineTo(f.x + f.w, f.y + f.h * i / 5); } x.stroke();
    x.lineCap = 'round'; x.lineJoin = 'round';
    if (net) {
      // Keep player and partner assets. Geometry is reused if already compiled;
      // building the radar must never compile or solve a second network.
      for (const id in net.segments) {
        const seg = net.segments[id], a = net.stations[seg.a], b = net.stations[seg.b], line = net.lines[seg.line]; if (!a || !b) continue;
        const cs = compiled && compiled.segs && compiled.segs.get(id), pts = cs && cs.g && cs.g.pts;
        const owned = !CM.Metro || CM.Metro.ownerId(seg, net) === 'player';
        x.strokeStyle = CM.Accessibility && line ? CM.Accessibility.line(line) : line && line.color || '#3489bf'; x.globalAlpha = owned ? .95 : .66; x.lineWidth = owned ? 1.8 : 1.25; x.beginPath();
        if (pts && pts.length >= 2) {
          const step = Math.max(1, Math.ceil(pts.length / 96)); x.moveTo(f.x + pts[0][0] * f.s, f.y + pts[0][1] * f.s);
          for (let i = step; i < pts.length; i += step) x.lineTo(f.x + pts[i][0] * f.s, f.y + pts[i][1] * f.s);
          const last = pts[pts.length - 1]; x.lineTo(f.x + last[0] * f.s, f.y + last[1] * f.s);
        } else {
          x.moveTo(f.x + a.x * f.s, f.y + a.y * f.s);
          for (const p of seg.pts || []) x.lineTo(f.x + p[0] * f.s, f.y + p[1] * f.s);
          x.lineTo(f.x + b.x * f.s, f.y + b.y * f.s);
        }
        x.stroke();
      }
      // At this scale several stations share one pixel; retain one mark per
      // 2 px bin and owner, rather than painting hundreds of identical dots.
      const bins = new Set();
      for (const id in net.stations) {
        const s = net.stations[id], px = f.x + s.x * f.s, py = f.y + s.y * f.s, owner = CM.Metro ? CM.Metro.ownerId(s, net) : 'player';
        const key = (px / 2 | 0) + ':' + (py / 2 | 0) + ':' + owner; if (bins.has(key)) continue; bins.add(key);
        x.globalAlpha = owner === 'player' ? .95 : .65; x.fillStyle = dark ? '#e5f5ff' : '#fff'; x.beginPath(); x.arc(px, py, owner === 'player' ? 1 : .7, 0, Math.PI * 2); x.fill();
      }
    }
    x.globalAlpha = 1; x.restore();
    const labels = g.mapId === 'sh' && CM.CompanyRoles ? CM.CompanyRoles.list().map(function (r) { return Object.assign({ name: r.name, mine: r.id === (g.playerCity || 'sh') }, CM.CompanyRoles.camera(r.id)); })
      : [{ name: (CM.DATA.city || '').split(' · ')[0], cx: g.city.W / 2, cy: g.city.H / 2, mine: true }];
    x.font = '500 9px "PingFang SC","Microsoft YaHei",sans-serif'; x.textBaseline = 'middle'; x.lineWidth = 3; x.lineJoin = 'round';
    for (const label of labels) {
      if (!label.name || label.cx < 0 || label.cy < 0 || label.cx > g.city.W || label.cy > g.city.H) continue;
      const name = tr(label.name), tw = x.measureText(name).width, px = clamp(f.x + label.cx * f.s + 4, 3, W - tw - 3), py = clamp(f.y + label.cy * f.s - 5, 7, H - 7);
      x.strokeStyle = dark ? 'rgba(15,32,48,.95)' : 'rgba(235,246,250,.94)'; x.strokeText(name, px, py);
      x.fillStyle = label.mine ? dark ? '#ffffff' : '#114a79' : dark ? '#b5d5e8' : '#466c83'; x.fillText(name, px, py);
      if (label.mine) { x.strokeStyle = dark ? '#7bc8ff' : '#1479b8'; x.lineWidth = 1; x.beginPath(); x.arc(f.x + label.cx * f.s, f.y + label.cy * f.s, 3, 0, Math.PI * 2); x.stroke(); x.lineWidth = 3; }
    }
    x.font = '600 8px sans-serif'; x.fillStyle = dark ? '#b6dbef' : '#34617b'; x.fillText('N ↑', 7, 9);
    this.stats.networkBuilds++;
  };
  Radar.prototype.tick = function (force) {
    const g = this.ui.g ? this.ui.g() : CM.game;
    if (this.game !== g) { this.game = g; this.terrainKey = ''; this.baseKey = ''; this.drawKey = ''; this.sync(); this.layout(); }
    if (!g || !this.expanded || this.root.classList.contains('hidden') || document.hidden || document.body.classList.contains('cinema') || document.body.classList.contains('ops-open') || document.documentElement.classList.contains('panel-editing')) return;
    const now = performance.now(); if (!force && now < this.nextDraw) return; this.nextDraw = now + 80;
    const R = this.R, city = g.city, dark = R.themeName === 'dark';
    const tk = [city.uid, city.W, city.H, city.terrainVer, city.geoVer, city.version, dark].join('|');
    const bk = [tk, g.netVersion, g.draft ? g.draft.ver : '-', g.playerCity, CM.Accessibility && CM.Accessibility.flag ? CM.Accessibility.flag() : '', CM.I18n ? CM.I18n.get() : ''].join('|');
    if (tk !== this.terrainKey) { this.buildTerrain(city, dark); this.terrainKey = tk; }
    if (bk !== this.baseKey || this.net !== g.net || this.draft !== g.draft) { this.buildBase(g, dark); this.baseKey = bk; this.net = g.net; this.draft = g.draft; this.drawKey = ''; }
    const key = [R.cam.cx, R.cam.cy, R.cam.zoom, R.cam.t, R.w, R.h].join('|'); if (!force && this.drawKey === key) return;
    this.drawKey = key; const x = this.ctx, f = frame(city), corners = viewport(R); this.lastViewport = corners;
    x.clearRect(0, 0, W, H); x.drawImage(this.base, 0, 0); x.save(); x.beginPath(); x.rect(f.x, f.y, f.w, f.h); x.clip();
    x.beginPath(); corners.forEach(function (p, i) { x[i ? 'lineTo' : 'moveTo'](f.x + p.x * f.s, f.y + p.y * f.s); }); x.closePath();
    x.fillStyle = dark ? 'rgba(103,202,255,.17)' : 'rgba(50,145,216,.16)'; x.fill(); x.strokeStyle = dark ? '#8edaff' : '#1076bd'; x.lineWidth = 1.4; x.stroke();
    const px = f.x + R.cam.cx * f.s, py = f.y + R.cam.cy * f.s; x.strokeStyle = dark ? '#e0f6ff' : '#07558e'; x.lineWidth = 1; x.beginPath(); x.moveTo(px - 3, py); x.lineTo(px + 3, py); x.moveTo(px, py - 3); x.lineTo(px, py + 3); x.stroke();
    x.restore(); this.stats.draws++;
  };

  const Minimap = CM.Minimap = {
    attach: function (ui) { return ui.minimap || (ui.minimap = new Radar(ui)); },
    tick: function (ui, force) { const s = Minimap.attach(ui); s.tick(force); return s; },
    sync: function (ui) { const s = Minimap.attach(ui); s.sync(); s.layout(); return s; },
    frame: frame, viewport: viewport,
  };
  // This late-loaded module owns its lifecycle, preserving all earlier UI hooks.
  if (CM.UI && !CM.UI.prototype._minimapInstalled) {
    const p = CM.UI.prototype; p._minimapInstalled = true;
    const attach = p.attachGame; p.attachGame = function () { const r = attach.apply(this, arguments); Minimap.tick(this, true); return r; };
    const tick = p.tick; p.tick = function () { const r = tick.apply(this, arguments); Minimap.tick(this, !!arguments[1]); return r; };
    const hud = p.showHUD; p.showHUD = function (on) { const r = hud.apply(this, arguments); const s = Minimap.attach(this); s.hudOn = on; s.sync(); s.layout(); s.tick(true); return r; };
    const layout = p.measureLayout; if (layout) p.measureLayout = function () { const r = layout.apply(this, arguments); if (this.minimap) { this.minimap.sync(); this.minimap.layout(); } return r; };
  }
})(window.CM);
