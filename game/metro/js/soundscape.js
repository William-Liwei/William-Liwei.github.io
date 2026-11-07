'use strict';
// 动态城市与地铁声音（v2.0；v2.2 按区域细分）：全部用 Web Audio 实时合成，没有音频文件。
// 固定数量的声部：环境 11 层（道路车流、城市远景底噪、商业人声、街市低语、水面、风吹树叶、山风、机场喷气两层、工业机械、写字楼空调）+ 列车 3 个声部，
// 音频解锁后一次性创建，之后约每秒 8 次按镜头位置与缩放、视野内的用地与交通、时刻、暂停状态和列车状态
// 平滑调整音量、滤波与声像；不逐帧创建节点。偶发短音（鸟鸣、虫鸣、喇叭、自行车铃、船笛、车门提示、进站制动、发车）
// 有频率上限，同时最多 CFG.perf.maxOneShots 个。声音只读取模拟与画面状态，不影响模拟。
(function (CM) {
  const U = CM.U, CFG = CM.CFG;
  let S = null;                         // 音频节点（解锁后创建）
  let acc = 0, envAcc = 9, env = null;
  const seen = new Map();               // 列车 id → 上次的运行状态（触发车门、进站、发车短音）
  const last = {};                      // 短音的上次播放时间
  let owner = null, wasRunning = false, shotGeneration = 0;
  const ACT = [0.25, 0.18, 0.14, 0.13, 0.16, 0.3, 0.6, 0.9, 1, 0.9, 0.85, 0.88, 0.92, 0.88, 0.86, 0.88, 0.92, 1, 1, 0.9, 0.78, 0.62, 0.45, 0.33];
  const BEDS = ['traffic', 'hum', 'crowd', 'babble', 'water', 'leaves', 'wind', 'jet', 'jetHi', 'machine', 'hvac'];

  function build(ac) {
    const Snd = CM.Sound, amb = Snd.bus('amb'), trn = Snd.bus('train'), nb = Snd.noiseBuffer();
    const noiseSrc = function () { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; s.start(0, Math.random() * 1.8); return s; };
    const panner = function (dest) { if (!ac.createStereoPanner) return { node: dest, pan: null }; const p = ac.createStereoPanner(); p.connect(dest); return { node: p, pan: p.pan }; };
    // 环境层：噪声 → 滤波 →（可选缓慢起伏）→ 音量 → 声像 → 环境总线
    const layer = function (type, f, q, lfoHz, depth) {
      const s = noiseSrc(), fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ac.createGain(); g.gain.value = 0;
      const pn = panner(amb);
      s.connect(fl);
      if (lfoHz) {
        const m = ac.createGain(); m.gain.value = 1 - depth;
        const o = ac.createOscillator(); o.frequency.value = lfoHz; const og = ac.createGain(); og.gain.value = depth;
        o.connect(og); og.connect(m.gain); o.start();
        fl.connect(m); m.connect(g);
      } else fl.connect(g);
      g.connect(pn.node);
      return { f: fl, g: g, pan: pn.pan };
    };
    // 持续的嗡鸣（若干振荡器 → 低通 →（节奏起伏）→ 音量 → 声像）
    const drone = function (freqs, type, lp, lfoHz, depth) {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; fl.Q.value = 0.7;
      for (const f of freqs) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.01); const og = ac.createGain(); og.gain.value = 1 / freqs.length; o.connect(og); og.connect(fl); o.start(); }
      const m = ac.createGain(); m.gain.value = 1 - depth;
      const lo = ac.createOscillator(); lo.frequency.value = lfoHz; const lg = ac.createGain(); lg.gain.value = depth; lo.connect(lg); lg.connect(m.gain); lo.start();
      const g = ac.createGain(); g.gain.value = 0; fl.connect(m); m.connect(g);
      const pn = panner(amb); g.connect(pn.node);
      return { f: fl, g: g, pan: pn.pan };
    };
    // 列车声部：滚动噪声（低通）+ 电机声（锯齿波）→ 轮轨节奏调制 → 隧道闷声低通 → 音量 → 声像 → 列车总线
    const voice = function () {
      const s = noiseSrc(), rf = ac.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 200; rf.Q.value = 0.8;
      const rumble = ac.createGain(); rumble.gain.value = 0; s.connect(rf); rf.connect(rumble);
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 90; const of = ac.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 650;
      const whine = ac.createGain(); whine.gain.value = 0; o.connect(of); of.connect(whine); o.start();
      const mod = ac.createGain(); mod.gain.value = 1;
      const clk = ac.createOscillator(); clk.type = 'square'; clk.frequency.value = 1; const clkG = ac.createGain(); clkG.gain.value = 0; clk.connect(clkG); clkG.connect(mod.gain); clk.start();
      rumble.connect(mod); whine.connect(mod);
      const muff = ac.createBiquadFilter(); muff.type = 'lowpass'; muff.frequency.value = 5000; mod.connect(muff);
      const out = ac.createGain(); out.gain.value = 0; muff.connect(out);
      const pn = panner(trn); out.connect(pn.node);
      return { rf: rf, rumble: rumble, osc: o, whine: whine, clk: clk, clkG: clkG, muff: muff, out: out, pan: pn.pan, id: null };
    };
    S = {
      ac: ac,
      traffic: layer('lowpass', 420, 0.7, 0.09, 0.25),
      hum: layer('bandpass', 150, 0.6, 0, 0),
      crowd: layer('bandpass', 1150, 0.9, 0.32, 0.35),
      water: layer('lowpass', 480, 0.5, 0.16, 0.55),
      leaves: layer('bandpass', 3400, 0.5, 0.11, 0.6),
      babble: layer('bandpass', 480, 0.7, 0.55, 0.5),   // 街市与车站大厅的低语（与 crowd 不同频段、起伏更快，叠起来更像人群）
      wind: layer('lowpass', 520, 0.6, 0.06, 0.7),       // 景区的山风（缓慢阵风）
      jet: layer('lowpass', 95, 0.8, 0.05, 0.5),         // 机场：发动机与地面设备的低频轰鸣
      jetHi: layer('bandpass', 2600, 1.2, 0.08, 0.6),    // 机场：涡轮的高频嘶声
      machine: drone([55, 110, 165], 'sawtooth', 320, 1.7, 0.4),   // 工业：电机与泵的嗡鸣（有节奏地起伏）
      hvac: drone([60, 120], 'sine', 260, 0.03, 0.15),          // 办公：写字楼空调与设备的低嗡
      voices: [], shots: 0,
    };
    for (let k = 0; k < (CFG.perf.trainVoices || 3); k++) S.voices.push(voice());
  }
  function set(param, v, tau) { if (param && isFinite(v)) param.setTargetAtTime(v, S.ac.currentTime, tau || 0.25); }

  // 视野采样（约每 0.5 秒）：用地构成、开发强度、商业、绿地与水面的比例和它们在画面中的左右位置；道路交通量与拥堵
  function sample(g, R) {
    const city = g.city, v = R.view, W = city.W, H = city.H, LU = CM.LU, tmp = {};
    const nx = 9, ny = 7, x0 = Math.max(0, v.x0), x1 = Math.min(W - 0.01, v.x1), y0 = Math.max(0, v.y0), y1 = Math.min(H - 0.01, v.y1);
    // v2.2 分区：居住（res）、商业街市（shop）、办公（office）、工业（ind）、景区（scenic）按用地采样；机场（air）、火车站（rail）按设施离画面中心的远近
    const e = { urban: 0, com: 0, comX: 0, water: 0, waterX: 0, green: 0, greenX: 0, traffic: 0, trafficX: 0, cong: 1, res: 0, resX: 0, shop: 0, shopX: 0, office: 0, officeX: 0, ind: 0, indX: 0, scenic: 0, scenicX: 0, air: 0, airX: 0, rail: 0, railX: 0 };
    let n = 0;
    if (x1 > x0 && y1 > y0) for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) {
      const x = x0 + (a + 0.5) / nx * (x1 - x0), y = y0 + (b + 0.5) / ny * (y1 - y0), c = city.cellAt(x, y);
      if (c < 0) continue;
      n++;
      const L = city.lu[c], px = U.clamp((R.P(x, y, 0, tmp).x - R.w / 2) / (R.w / 2), -1, 1), rg = city.regions[city.region[c]];
      const dens = U.clamp((city.pop[c] + city.jobs[c]) / 3000, 0, 1.5);
      if (city.street[c]) e.urban += dens;
      if (L === LU.COM || L === LU.MIX) {
        const k = U.clamp(city.jobs[c] / 2500, 0, 1.5) * (L === LU.COM ? 1 : 0.5); e.com += k; e.comX += k * px;
        // 高楼林立、岗位密集的商业格算办公区，其余为商铺街市
        if (L === LU.COM && (city.bh[c] >= 60 || city.jobs[c] > 4000)) { e.office += k; e.officeX += k * px; } else { e.shop += k; e.shopX += k * px; }
      }
      if (L === LU.RES || L === LU.MIX) { const k = U.clamp(city.pop[c] / 2500, 0, 1.2) * (L === LU.RES ? 1 : 0.5); e.res += k; e.resX += k * px; }
      if (L === LU.IND) { const k = U.clamp(0.4 + city.jobs[c] / 2000, 0, 1.2); e.ind += k; e.indX += k * px; }
      if (L === LU.AIRPORT) { e.air += 1; e.airX += px; }
      if (L === LU.HILL || (rg && rg.scenic)) { e.scenic += 1; e.scenicX += px; }
      if (L === LU.WATER || city.waterAt(x, y)) { e.water += 1; e.waterX += px; }
      if (L === LU.PARK || L === LU.HILL || city.wood[c] > 0.5) { e.green += 1; e.greenX += px; }
    }
    const avg = function (k) { e[k + 'X'] = e[k] > 0 ? e[k + 'X'] / e[k] : 0; e[k] /= n; };
    if (n) { e.urban /= n; for (const k of ['com', 'water', 'green', 'res', 'shop', 'office', 'ind', 'scenic', 'air']) avg(k); }
    // 机场与火车站：运营中的枢纽设施离画面中心越近越响（半个视野宽度内）；景区、商圈、商务区设施分别加强景区、街市与办公声
    const Fac = CM.Fac, yr = g.year ? g.year() : g.clock.y, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.max(1.5, (x1 - x0) * 0.55);
    if (Fac) for (const f of Fac.list(city)) {
      const key = { air: 'air', rail: 'rail', scenic: 'scenic', shop: 'shop', cbd: 'office' }[f.t];
      if (f.ext || !key) continue;
      const d = U.dist(f.x, f.y, cx, cy) / rad; if (d >= 1 || !Fac.active(f, yr, city)) continue;
      const w = (1 - d) * (1 - d) * (key === 'shop' || key === 'office' ? 0.8 : 1), px = U.clamp((R.P(f.x, f.y, 0, tmp).x - R.w / 2) / (R.w / 2), -1, 1);
      if (w > e[key] * 0.8) { e[key + 'X'] = px; }
      e[key] = Math.min(1, Math.max(e[key], w) + (key === 'air' || key === 'rail' ? w * 0.3 : 0));   // 商圈、商务区设施让街市 / 办公声更明确
    }
    // 道路交通：视野内主要道路的当前流量（交通模型的路段流量，画面上的车辆也按它生成）
    const A = CM.agents, model = g.model, Wt = A && A.W;
    if (A && A.visibleRoads && A.roadRef === model.road && Wt) {
      const ids = A.visibleRoads.ids, road = model.road, step = Math.max(1, Math.floor(ids.length / 80));
      let sv = 0, sx = 0, sr = 0, m = 0;
      for (let q = 0; q < ids.length; q += step) {
        const L = road.links[ids[q]]; if (L.cls < 2 || !L.real) continue;
        const vol = model.arcVolAt(2 * L.id, Wt) + model.arcVolAt(2 * L.id + 1, Wt);
        const p = L.pts[L.pts.length >> 1], px = U.clamp((R.P(p[0], p[1], 0, tmp).x - R.w / 2) / (R.w / 2), -1, 1);
        sv += vol; sx += vol * px; sr += vol * Math.max(model.arcRatioAt(2 * L.id, Wt), model.arcRatioAt(2 * L.id + 1, Wt)); m++;
      }
      if (m) { e.traffic = U.clamp(sv / m / 1400, 0, 1) * U.clamp(m / 12, 0.3, 1); e.trafficX = sv > 0 ? sx / sv : 0; e.cong = sv > 0 ? sr / sv : 1; }
    } else e.traffic = U.clamp(e.urban * 0.6, 0, 1);
    return e;
  }

  function oneShot(name, bus, pan, minGap) {
    const now = performance.now();
    if (last[name] && now - last[name] < minGap * 1000) return;
    if (S.shots >= (CFG.perf.maxOneShots || 6)) return;
    const state = S, generation = shotGeneration;
    if (!CM.Sound.cue(name, bus, pan, function () {
      if (S === state && generation === shotGeneration) state.shots = Math.max(0, state.shots - 1);
    })) return;
    last[name] = now; S.shots++;
  }

  // 列车声：从本帧画出的列车（与正在跟随的列车）中挑出最响的几列，分配给固定的声部；跟随时始终占用第一个声部
  function trains(g, R, prox, running, under, z) {
    const A = CM.agents, W = R.w, H = R.h, diag = Math.hypot(W, H) / 2, cand = [], audible = new Set();
    const ph = {}, closeLead = CM.Agents.DOOR.closeLead;
    for (const t of A.trains) {
      if (!t.g || t.dying) continue;
      const fol = R.follow === t;
      if (!fol && (t.drawn !== R.frame || !isFinite(t.sx))) continue;
      const sp = A.trainSpeed(t), d = Math.hypot(t.sx - W / 2, t.sy - H / 2) / diag;
      const buried = (t.hh || 0) < -0.01, hear = buried && !fol && under < 0.5 ? 0.3 : 1;
      const loud = fol ? 1 : (0.55 + 0.45 * Math.min(1, sp / 18)) * Math.exp(-d * 2.4) * prox * hear;
      if (loud < 0.03 && !fol) continue;
      cand.push({ t: t, sp: sp, loud: loud, fol: fol, buried: buried, pan: fol ? 0 : U.clamp((t.sx - W / 2) / (W / 2), -1, 1) * 0.7 });
      // 车门、进站与发车短音：跟随的列车，或近景中最响的列车（只在 1×、3× 速度下）
      if ((fol || (z >= 26 && loud > 0.22)) && running && g.speed <= 2) {
        audible.add(t.id);A.phase(t, ph);
        const was = seen.get(t.id);
        if (was) {
          if (was.state === 'run' && ph.state !== 'run') oneShot('brake', 'train', cand[cand.length - 1].pan, 1.2);
          if (was.door <= 0 && ph.door > 0) oneShot('doorOpen', 'train', cand[cand.length - 1].pan, 1.2);
          if (was.until > closeLead && ph.until <= closeLead && ph.state !== 'run') oneShot('doorClose', 'train', cand[cand.length - 1].pan, 1.2);
          if (was.state !== 'run' && ph.state === 'run') oneShot('depart', 'train', cand[cand.length - 1].pan, 2);
        }
        seen.set(t.id, { state: ph.state, door: ph.door, until: ph.until });
      }
    }
    // Retain phases for currently audible trains, without dropping all transitions
    // when a complex network has more than 64 nearby trains.
    for(const id of seen.keys())if(!audible.has(id))seen.delete(id);
    cand.sort(function (a, b) { return (b.fol - a.fol) || (b.loud - a.loud); });
    const top = cand.slice(0, S.voices.length), used = new Set();
    // 保持同一列车占用同一声部，避免声像与音色跳变
    for (const v of S.voices) { const c = top.find(function (x) { return x.t.id === v.id; }); if (c) { used.add(c); v.c = c; } else v.c = null; }
    for (const c of top) if (!used.has(c)) { const v = S.voices.find(function (x) { return !x.c; }); if (v) { v.c = c; v.id = c.t.id; } }
    for (const v of S.voices) {
      const c = v.c;
      if (!c || !running) { set(v.out.gain, 0, 0.3); if (!c) v.id = null; continue; }
      const sp = c.sp, spF = Math.min(1, sp / 20), type = c.t.segType;
      const open = type !== 'underground' || !c.buried;
      set(v.out.gain, c.loud, 0.15);
      set(v.rumble.gain, 0.35 * (0.15 + 0.85 * spF), 0.15);
      set(v.rf.frequency, 110 + sp * 22 + (type === 'elevated' ? 120 : 0), 0.2);
      set(v.whine.gain, 0.05 * spF * (sp > 2 ? 1 : 0), 0.2);
      set(v.osc.frequency, 70 + sp * 13, 0.2);
      set(v.clk.frequency, Math.max(0.2, sp / 12.5), 0.2);
      set(v.clkG.gain, sp > 1 ? (open ? 0.35 : 0.18) : 0, 0.2);
      set(v.muff.frequency, c.buried && !c.fol && under < 0.5 ? 380 : (c.buried ? 1600 : (type === 'elevated' ? 5200 : 3600)), 0.3);
      set(v.pan, c.pan, 0.2);
    }
  }

  const Soundscape = {
    reset: function () {
      env = null; envAcc = 1; acc = 0; owner = null; wasRunning = false; shotGeneration++;
      seen.clear(); for (const k of Object.keys(last)) delete last[k];
      if (CM.Sound) CM.Sound.stopCues();
      if (S && S.ac.state !== 'closed') {
        S.shots = 0;
        for (const k of BEDS) set(S[k].g.gain, 0, 0.15);
        for (const v of S.voices) { set(v.out.gain, 0, 0.1); v.id = null; v.c = null; }
      }
    },
    // 诊断：当前各声部的目标音量（未解锁音频时为 null）
    levels: function () {
      if (!S) return null;
      const o = { shots: S.shots, env: env };
      for (const k of BEDS) o[k] = +S[k].g.gain.value.toFixed(4);
      o.voices = S.voices.map(function (v) { return { id: v.id, gain: +v.out.gain.value.toFixed(3), f: Math.round(v.rf.frequency.value) }; });
      return o;
    },
    tick: function (dt) {
      const g = CM.game, R = CM.R;
      if (owner !== g) { Soundscape.reset(); owner = g; }
      const ac = CM.Sound && CM.Sound.ctx();
      if (!ac) return;
      if (!S || S.ac !== ac) build(ac);
      acc += dt; envAcc += dt;
      if (acc < 0.12) return;
      const step = acc; acc = 0;
      const screen = CM.ui && CM.ui.screen;
      const loading = screen && !screen.classList.contains('hidden') && screen.querySelector('.loading');
      if (!g || !R || !R.view || loading) {
        // 开始界面与读取中：环境声与列车声淡出
        if (wasRunning) { CM.Sound.stopCues(); seen.clear(); wasRunning = false; }
        for (const k of BEDS) set(S[k].g.gain, 0, 0.5);
        for (const v of S.voices) set(v.out.gain, 0, 0.3);
        return;
      }
      if (envAcc > 0.5 || !env) { env = sample(g, R); envAcc = 0; }
      const z = R.z, prox = U.clamp((Math.log(z) - Math.log(8)) / (Math.log(56) - Math.log(8)), 0, 1);
      const minute = g.clock.minute, hr = Math.floor(minute / 60) % 24, night = hr < 6 || hr >= 22, act = ACT[hr];
      const we = CM.Model && CM.Model.dayType ? CM.Model.dayType(g.clock.y, g.clock.m, g.clock.d) === 'we' : false;
      const running = g.speed > 0 && !g.jumping && !g.pending;
      if (wasRunning && !running) { CM.Sound.stopCues(); seen.clear(); }
      wasRunning = running;
      const under = U.smooth(R.cam.under), fol = !!R.follow;
      // 暂停时城市声音减弱，结算与跳月 / 跳年时几乎静音；地下视图变闷；跟随列车时环境让位给列车声
      let k = running ? 1 : (g.jumping || g.pending ? 0.2 : 0.55);
      k *= (1 - 0.4 * under) * (fol ? 0.5 : 1) * (R.layerFade > 0.5 ? 0.7 : 1);
      CM.Sound.setAmbFilter(under > 0.5 ? 520 : 16000);
      const e = env, work = !we && hr >= 8 && hr < 19, quiet = 1 - 0.55 * U.clamp(e.scenic + 0.5 * e.res - e.office - e.shop, 0, 1);   // 景区、居住区的道路声更轻
      set(S.traffic.g.gain, 0.16 * e.traffic * (0.3 + 0.7 * prox) * act * quiet * (1 + 0.3 * e.office) * k);
      set(S.traffic.f.frequency, 240 + 760 * prox * (0.6 + 0.4 * e.traffic));
      set(S.traffic.pan, e.trafficX * 0.6 * prox);
      set(S.hum.g.gain, (0.012 + 0.07 * e.urban * (1 - 0.65 * prox)) * (0.55 + 0.45 * act) * k);
      // 商铺街市：人声更密、周末更热闹；火车站大厅：人声加回响般的低语
      const people = e.shop + 0.4 * e.office + 0.8 * e.rail;
      set(S.crowd.g.gain, 0.09 * people * Math.pow(prox, 1.3) * act * (we ? 1.35 : 1) * (night ? 0.5 : 1) * k);
      set(S.crowd.pan, (e.shop * e.shopX + e.rail * e.railX) / (e.shop + e.rail || 1) * 0.6);
      set(S.babble.g.gain, 0.06 * (e.shop + e.rail) * Math.pow(prox, 1.2) * act * (we ? 1.3 : 1) * (night ? 0.4 : 1) * k);
      set(S.babble.pan, (e.shop * e.shopX + e.rail * e.railX) / (e.shop + e.rail || 1) * 0.6);
      set(S.water.g.gain, 0.09 * e.water * (0.35 + 0.65 * prox) * k);
      set(S.water.pan, e.waterX * 0.6);
      set(S.leaves.g.gain, 0.035 * (e.green + 0.5 * e.res) * prox * (night ? 0.5 : 1) * k);
      set(S.leaves.pan, e.greenX * 0.6);
      set(S.wind.g.gain, 0.05 * e.scenic * (0.5 + 0.5 * prox) * k);
      set(S.wind.pan, e.scenicX * 0.5);
      // 机场：低频轰鸣与涡轮嘶声（深夜航班少）；工业：工作时段的机械嗡鸣；办公：写字楼空调低嗡
      set(S.jet.g.gain, 0.12 * e.air * (0.4 + 0.6 * prox) * (night ? 0.35 : 1) * k);
      set(S.jet.pan, e.airX * 0.6);
      set(S.jetHi.g.gain, 0.025 * e.air * prox * (night ? 0.3 : 1) * k);
      set(S.jetHi.pan, e.airX * 0.6);
      set(S.machine.g.gain, 0.05 * e.ind * prox * (work ? 1 : 0.3) * k);
      set(S.machine.pan, e.indX * 0.6);
      set(S.hvac.g.gain, 0.04 * e.office * prox * (0.6 + 0.4 * act) * k);
      set(S.hvac.pan, e.officeX * 0.6);
      trains(g, R, prox, running, under, z);
      // 偶发短音：只在运行中、近景、非地下视图时出现，概率按每秒计算
      if (running && under < 0.5) {
        const r = function (perSec) { return Math.random() < perSec * step; }, pan = function () { return (Math.random() - 0.5) * 1.2; };
        const m = g.clock.m, rk = CM.curMap && CM.curMap().region;
        if (!night && hr >= 5 && hr < 19 && r(0.5 * e.green * prox)) oneShot('bird', 'amb', e.greenX * 0.6 + pan() * 0.4, 0.6);
        if (night && m >= 6 && m <= 9 && r(0.6 * (e.green + 0.2 * (1 - e.urban)) * prox)) oneShot('insect', 'amb', pan(), 0.5);
        if (!night && e.cong > 1.5 && prox > 0.45 && r(0.1 * Math.min(3, e.cong - 1.4))) oneShot('horn', 'amb', e.trafficX * 0.5 + pan() * 0.5, 3.5);
        if (rk === '中国内地' && g.clock.y < 2005 && !night && prox > 0.55 && r(0.08 * e.traffic)) oneShot('bikeBell', 'amb', pan(), 4);
        if (e.water > 0.25 && r(0.012 * e.water)) oneShot('ship', 'amb', e.waterX * 0.7, 30);
        // 分区短音（v2.2）
        const P = function (x) { return U.clamp(x * 0.7 + pan() * 0.3, -1, 1); };
        if (e.air > 0.15 && r(0.05 * e.air * (night ? 0.2 : 1))) oneShot('jetPass', 'amb', P(e.airX), 14);
        if (e.air > 0.3 && prox > 0.4 && r(0.04 * e.air)) oneShot('paChime', 'amb', P(e.airX), 20);
        if (e.rail > 0.3 && prox > 0.35 && !night && r(0.05 * e.rail)) oneShot('stationChime', 'amb', P(e.railX), 16);
        if (e.rail > 0.2 && r(0.03 * e.rail)) oneShot('trainHorn', 'amb', P(e.railX), 22);
        if (e.scenic > 0.2 && hr >= 6 && hr < 19 && r(0.025 * e.scenic)) oneShot(CM.mapId === 'pa' ? 'churchBell' : 'templeBell', 'amb', P(e.scenicX), 40);
        if (e.res > 0.25 && prox > 0.5 && r(0.03 * e.res * (night ? 0.5 : 1))) oneShot('dog', 'amb', P(e.resX), 18);
        if (e.shop > 0.2 && prox > 0.55 && !night && r(0.06 * e.shop)) oneShot('shopChime', 'amb', P(e.shopX), 8);
        if (rk === '中国台湾' && e.traffic > 0.2 && prox > 0.5 && !night && r(0.08 * e.traffic)) oneShot('scooter', 'amb', pan(), 5);
        if ((e.office > 0.15 || e.traffic > 0.35) && prox > 0.5 && r(0.06 * Math.max(e.office, e.traffic * 0.6))) oneShot('carPass', 'amb', P(e.officeX || e.trafficX), 4);
        if (e.ind > 0.2 && prox > 0.45 && work && r(0.08 * e.ind)) oneShot('clank', 'amb', P(e.indX), 3);
        if (e.ind > 0.25 && prox > 0.55 && work && r(0.02 * e.ind)) oneShot('reverseBeep', 'amb', P(e.indX), 15);
      }
    },
  };
  CM.Soundscape = Soundscape;
})(window.CM);
