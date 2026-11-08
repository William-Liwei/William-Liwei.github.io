'use strict';
// Browser presentation and lifecycle; browser chrome, shortcuts and small-screen layout stay in ui.js.
(function (CM) {
  const UI = CM.UI, U = CM.U, CFG = CM.CFG, D = CM.DATA, h = U.h, ic = CM.icon;
  UI.ERA_COLORS = ['#2f9e8f', '#3a7bd5', '#c2410c', '#7c4dff', '#d6336c', '#0f8a5f', '#b7791f', '#5b6b8c'];
  const snd = name => { if (CM.Sound) CM.Sound.play(name); };
  UI.prototype.updateEraChip = function (g) {
    const E = CM.Eras, chip = this.eraChip;
    if (!E || !E.enabled()) { chip.classList.add('gone'); return; }
    const t = g.year(), k = E.index(t), e = E.list()[k];
    const to = E.endOf(k) || e.from + 15, frac = U.clamp((t - e.from) / Math.max(0.5, to - e.from), 0, 1);
    if (chip._k !== k) {
      chip._k = k;
      chip.classList.remove('gone');
      chip.style.setProperty('--ec', UI.ERA_COLORS[k % UI.ERA_COLORS.length]);
      chip.querySelector('.v').textContent = e.name;
      chip.querySelector('.k').textContent = e.from + (E.endOf(k) ? '–' + E.endOf(k) : ' 年起');
      chip.setAttribute('data-tip', '发展阶段：' + e.name + ' · 点击查看本阶段的城市变化');
      if (CM.I18n) CM.I18n.localize(chip);
    }
    const w = Math.round(frac * 1000) / 10;
    if (chip._w !== w) { chip._w = w; chip.querySelector('.ec-prog i').style.width = w + '%'; }
    chip.classList.toggle('on', !!this.topIs(['era']) && !this.right.classList.contains('closed'));
  };

  // Loading uses the same scalable mark as the start screen; progress remains live.
  UI.prototype.showLoading = function (text, kind, mapId) {
    const self = this;
    const stops = kind === 'load' ? [[0.3, '城市'], [0.42, '交通'], [0.95, '出行']] : kind === 'pre' ? [[0.2, '城市'], [0.83, '推演'], [0.96, '出行']] : [[0.2, '城市'], [0.3, '交通'], [0.92, '出行']];
    this._loadNote = h('div', { class: 'ld-note' }, text);
    const fill = h('i', { class: 'ld-fill' }), head = h('span', { class: 'ld-head' }), pct = h('b', { class: 'ld-pct' }, '0%'), stage = h('span', { class: 'ld-stage' }, '准备');
    const track = h('div', { class: 'ld-track' }, h('i', { class: 'ld-rail' }), fill,
      stops.map(function (s) { return h('span', { class: 'ld-stop', style: { left: (s[0] * 100) + '%' } }, h('i'), h('em', null, s[1])); }), head);
    const logo = h('div', { class: 'ld-logo' }, h('img', { class: 'logo-ink', src: 'img/rail-epoch-mark.svg', alt: '', width: '132', height: '132', draggable: 'false' }));
    const dark = document.documentElement.dataset.theme === 'dark', bgOn = !!(this._stageBg && this._stageBg.classList.contains('on')), mp = mapId && CM.MAPS[mapId];
    const again = /\bld-screen\b/.test(this.screen.className) && this.screen.className.indexOf('hidden') < 0;   // 读档的第二段载入：原地更新，不再播放入场
    this.openScreen(h('div', { class: 'card ld-card' }, logo, this._loadNote, track, h('div', { class: 'ld-row' }, stage, pct)), null, mp ? 'ld-screen' + (again ? ' noanim' : '') : '', mp && !again ? (bgOn ? 'zoom' : 'fade') : null);
    if (mp && !bgOn) this.stageBg(CM.mapThumb(mapId, dark ? 'dark' : 'light'));
    const L = this._ld = { goal: 0.02, disp: 0, cap: 0.08, done: false, t: performance.now(), t0: performance.now(), fill: fill, head: head, pct: pct, stage: stage, stops: track.querySelectorAll('.ld-stop'), at: stops };
    const tick = function (now) {
      if (self._ld !== L || !fill.isConnected) return;
      const dt = Math.min(0.1, (now - L.t) / 1000); L.t = now;
      // 先较快追上报告的进度，之后向下一个上限缓慢前移；完成时补满
      if (L.disp < L.goal) L.disp += (L.goal - L.disp) * (1 - Math.exp(-dt * (L.done ? 9 : 5))) + dt * 0.01;
      else L.disp += (L.cap - L.disp) * (1 - Math.exp(-dt * 0.3));
      L.disp = Math.min(L.disp, L.done ? 1 : 0.99);
      const p = L.disp;
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')'; head.style.left = (p * 100).toFixed(2) + '%';
      pct.textContent = Math.floor(p * 100 + (L.done && p > 0.995 ? 0.5 : 0)) + '%';
      for (let i = 0; i < L.stops.length; i++) L.stops[i].classList.toggle('on', p >= L.at[i][0] - 0.002);

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  UI.prototype.loadProgress = function (p, label) {
    const L = this._ld; if (!L || !L.fill.isConnected) return;
    L.goal = Math.max(L.goal, U.clamp(p, 0, 1)); L.cap = Math.min(0.99, L.goal + 0.08);
    if (label && L.stage.textContent !== label) { L.stage.textContent = label; if (CM.I18n) CM.I18n.localize(L.stage); }
    if (p >= 1) L.done = true;
  };

  UI.prototype.finishLoading = function (cb) {
    const L = this._ld;
    if (!L || !L.fill.isConnected || CM.Settings.reducedMotion()) { cb(); return; }
    this.loadProgress(1, '准备就绪');
    const self = this;
    setTimeout(function () { if (self._ld === L) { L.pct.textContent = '100%'; L.fill.style.transform = 'scaleX(1)'; L.head.style.left = '100%'; setTimeout(function () { if (self._ld === L) { self._ld = null; cb(); } }, 32); } }, 360);   // 期间又开始了新的载入时放弃这一次
  };


  UI.prototype.showJump = function () {
    const g = this.g(), j = g.jumping, self = this, from = j.from, to = j.target;
    const n = Math.max(1, (to[0] - from[0]) * 12 + (to[1] - from[1]));
    const yv = h('span', { class: 'jp-y' }, ''), mv = h('span', { class: 'jp-m' }, '');
    const fill = h('i', { class: 'jp-fill' }), train = h('span', { class: 'jp-train' }, h('i'));
    const stops = [];
    for (let k = 1; k <= n; k++) {
      const ym = from[0] * 12 + (from[1] - 1) + k, y = Math.floor(ym / 12), m = ym % 12 + 1;
      stops.push(h('span', { class: 'jp-stop', style: { left: (k / n * 100) + '%' } }, h('i'), h('em', null, m === 1 || n <= 3 ? y + '.' + m : String(m))));
    }
    const pct = h('b', { class: 'jp-pct' }, '0%'), ev = h('div', { class: 'jp-ev' }), pop = h('b', null, '—'), share = h('b', null, '—');
    this.openScreen(h('div', { class: 'card jp-card' },
      h('div', { class: 'jp-kick' }, ic('calYear', 15), h('span', null, '时间推进 · ' + (n === 12 ? '1 年' : n + ' 个月'))),
      h('div', { class: 'jp-date' }, yv, mv),
      h('div', { class: 'jp-line' }, h('span', { class: 'jp-origin' }), h('i', { class: 'jp-rail' }), fill, stops, train),
      h('div', { class: 'jp-stats' }, h('span', null, '人口 ', pop), h('span', null, '地铁分担率 ', share), pct),
      ev,
      h('div', { class: 'jp-foot' }, '逐日结算票款与运营费用，按月处理拨款、城市发展、区域开放与任务')), null);
    const J = this._jp = { p: 0, disp: 0, t: performance.now(), ym: -1, evN: g.events.length };
    const tick = function (now) {
      if (self._jp !== J || !fill.isConnected) return;
      const dt = Math.min(0.1, (now - J.t) / 1000); J.t = now;
      J.disp += (J.p - J.disp) * (1 - Math.exp(-dt * 7));
      const p = J.disp;
      fill.style.transform = 'scaleX(' + p.toFixed(4) + ')'; train.style.left = (p * 100).toFixed(2) + '%';
      pct.textContent = Math.floor(p * 100) + '%';
      for (let i = 0; i < n; i++) stops[i].classList.toggle('on', p >= (i + 1) / n - 0.004);
      const c = g.clock, ym = c.y * 12 + c.m;
      if (ym !== J.ym) {
        const first = J.ym < 0; J.ym = ym;
        const en = CM.I18n && CM.I18n.get() === 'en';
        yv.textContent = en ? String(c.y) : c.y + ' 年'; mv.textContent = en ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][c.m - 1] : c.m + ' 月';
        if (!first) { mv.classList.remove('flip'); void mv.offsetWidth; mv.classList.add('flip'); }
        pop.textContent = U.fmtPeople(g.city.totals().pop); share.textContent = U.fmtPct((g.model.daily && g.model.daily.metroShare) || 0);
        if (g.events.length > J.evN) {
          const e = g.events[g.events.length - 1]; J.evN = g.events.length;
          ev.textContent = e.y + '.' + e.m + ' · ' + e.title; if (CM.I18n) CM.I18n.localize(ev);
          ev.classList.remove('flash'); void ev.offsetWidth; ev.classList.add('flash');
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  UI.prototype.updateJump = function (p) { if (this._jp) this._jp.p = U.clamp(p, 0, 1); };



  UI.LAYERS.push({ id: 'dev', group: 'city', name: '城市发展', icon: 'chart', color: '#0f8a5f', desc: '本阶段以来人口、岗位与新开发用地的变化' });
  const chrome = UI.prototype.buildChrome;
  UI.prototype.buildChrome = function () {
    chrome.apply(this, arguments);
    const self = this;
    this.eraChip = h('button', { class: 'pill erachip gone', 'data-tip': '发展阶段', onclick: () => self.openTop('era') },
      h('span', { class: 'ec-dot' }), h('span', { class: 'tx' }, h('span', { class: 'k' }, '发展阶段'), h('span', { class: 'v' }, '')), h('span', { class: 'ec-prog' }, h('i')));
    this.pills.date.el.insertAdjacentElement('afterend', this.eraChip);
    this.histHost = h('div', { id: 'histHost' }); this.feed.appendChild(this.histHost); this.clearHist();
    // 阶段背景先整段翻译再分行；切语言时重新构造，避免逐行翻译遗留混排。
    if (CM.I18n) CM.I18n.on(() => { if (this.topIs(['era'])) this.rerenderPage(); });
  };
  const attach = UI.prototype.attachGame;
  UI.prototype.attachGame = function (g) {
    this.clearHist(); attach.call(this, g); this.eraChip._k = null;
    g.on('era', er => { this._phaseQ.push(er); this.flushHist(); });
    g.on('histEvent', ev => { this._histQ.push(ev); this.flushHist(); });
    this.updateEraChip(g);
  };
  const clear = UI.prototype.clearCelebrations;
  UI.prototype.clearCelebrations = function () { clear.call(this); this.clearHist(); };
  const tick = UI.prototype.tick;
  UI.prototype.tick = function () { tick.apply(this, arguments); if (this.g()) { this.updateEraChip(this.g()); this.flushHist(); } };
  const openTop = UI.prototype.openTop;
  UI.prototype.openTop = function (key) {
    if (key !== 'era') return openTop.apply(this, arguments);
    if (this.topIs(['era']) && !this.right.classList.contains('closed')) this.closePanel(true);
    else this.openPage('era', null, { root: true });
  };
  const datePage = UI.prototype.page_date;
  UI.prototype.page_date = function () {
    const page = datePage.call(this), self = this, e = CM.Eras.current(this.g().year());
    page.el.prepend(h('button', { class: 'btn', onclick: () => self.openPage('era', null, { root: true }) }, '发展阶段 · ' + (e ? e.name : '')));
    return page;
  };
  UI.settingsExtra.display.push(function () {
    const S=CM.Settings, b=h('button',{class:'switch'+(S.get('lighting')?' on':''),role:'switch','aria-label':'统一光照','aria-checked':String(S.get('lighting')!==false),onclick:function(){const on=S.get('lighting')===false;S.set('lighting',on);b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));}},h('i'));
    return h('div',{class:'set-row'},h('span',{class:'set-ico'},ic('sun')),h('div',{class:'grow'},h('div',{class:'set-t'},'统一光照'),h('div',{class:'set-d'},'山体与建筑使用同一光向，白天与夜晚随主题切换')),b);
  });
  UI.settingsExtra.display.push(function () {
    const S=CM.Settings, b=h('button',{class:'switch'+(S.get('stationModels')?' on':''),role:'switch','aria-label':'车站模型','aria-checked':String(S.get('stationModels')!==false),onclick:function(){const on=S.get('stationModels')===false;S.set('stationModels',on);b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));}},h('i'));
    return h('div',{class:'set-row'},h('span',{class:'set-ico'},ic('station')),h('div',{class:'grow'},h('div',{class:'set-t'},'车站模型'),h('div',{class:'set-d'},'在 2.5D 近景显示站台、出入口与车站装修')),b);
  });
})(window.CM);
