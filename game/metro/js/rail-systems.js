'use strict';
// One data table for optional urban rail systems. These are game balance values,
// not real engineering specifications, procurement prices or railway timetables.
(function (CM) {
  const R = CM.RailSystems = {}, h = CM.U.h;
  const data = [
    { id: 'metro', name: '地铁', speed: 80, speeds: [40, 60, 80, 100, 120], from: 1900, cap: 310, cars: 8, track: 1, station: 1, ops: 1, accel: .9, dwell: 30, radius: 250, desc: '高密度城市骨干，兼容现有地铁列车。' },
    { id: 'light', name: '轻轨', speed: 60, speeds: [40, 60, 80], from: 1900, cap: 180, cars: 4, track: .65, station: .7, ops: .78, accel: 1, dwell: 25, radius: 100, desc: '较低建设费与中等运量，适合外围支线和接驳。' },
    { id: 'tram', name: '有轨电车', speed: 40, speeds: [30, 40, 60], from: 1900, cap: 100, cars: 3, track: .32, station: .42, ops: .6, accel: .75, dwell: 20, radius: 35, desc: '低成本、小编组与灵活弯道，适合短距离接驳。' },
    { id: 'commuter', name: '通勤铁路', speed: 120, speeds: [80, 100, 120, 160], from: 1900, cap: 280, cars: 8, track: 1.05, station: 1.1, ops: 1.05, accel: .65, dwell: 40, radius: 600, desc: '长站距、大编组，可使用双层通勤列车。' },
    { id: 'regional', name: '市域快线', speed: 160, speeds: [100, 120, 160, 200], from: 1990, cap: 260, cars: 8, track: 1.35, station: 1.2, ops: 1.15, accel: .75, dwell: 35, radius: 1000, desc: '连接新城与邻近城市，速度与运量兼顾。' },
    { id: 'highspeed', name: '高速特色线', speed: 250, speeds: [160, 200, 250, 300], from: 1964, cap: 110, cars: 8, track: 2.4, station: 1.55, ops: 1.5, accel: .55, dwell: 55, radius: 1800, desc: '可选的新干线风格线路；长站距更能发挥速度。' },
    { id: 'maglev', name: '磁悬浮', speed: 300, speeds: [160, 250, 300, 430], from: 2002, cap: 120, cars: 6, track: 3.1, station: 1.7, ops: 1.65, accel: 1.05, dwell: 35, radius: 2000, desc: '专用导轨与专属车辆，适合机场和远距直达。' },
  ];
  R.SYSTEMS = Object.freeze(data.map(function (s) { return Object.freeze(Object.assign({}, s, { speeds: Object.freeze(s.speeds) })); }));
  const byId = new Map(R.SYSTEMS.map(function (s) { return [s.id, s]; }));
  R.valid = function (id) { return byId.has(id); };
  R.id = function (line) { return line && byId.has(line.railSystem) ? line.railSystem : 'metro'; };
  R.get = function (line) { return byId.get(typeof line === 'string' ? line : R.id(line)) || byId.get('metro'); };
  R.speed = function (line) { return line && line.speed || R.get(line).speed; };
  R.grades = function (line) {
    const s = R.get(line); if (s.id === 'metro') return CM.CFG.metro.speedGrades;
    return s.speeds.map(function (v) { const k = v / s.speed; return { kmh: v, minR: Math.round(s.radius * k * k), warnR: Math.round(s.radius * k * k * 1.5), ops: s.ops * (1 + (k - 1) * .35), track: Math.max(0, (k - 1) * .6) }; });
  };
  R.grade = function (line) { const v = R.speed(line), a = R.grades(line); return a.find(function (x) { return x.kmh === v; }) || a.find(function (x) { return x.kmh === R.get(line).speed; }) || a[0]; };
  // Shared by line conversion and new-line controls. A valid profile speed can
  // still require a model that has not entered service in the current year.
  R.pickSpeed = function (mapId, year, system, preferred) {
    const profile = R.get(system);
    if (year < profile.from) return null;
    const available = R.grades({ railSystem: profile.id }).map(function (x) { return x.kmh; }).filter(function (v) { return !CM.Fleet || CM.Fleet.speedOpen(mapId, year, v, profile.id).ok; });
    if (available.indexOf(preferred) >= 0) return preferred;
    if (available.indexOf(profile.speed) >= 0) return profile.speed;
    const lower = available.filter(function (v) { return v <= profile.speed; });
    return lower.length ? lower[lower.length - 1] : available.length ? available[0] : null;
  };
  R.modelFits = function (model, system) { return (model.systems || ['metro']).indexOf(typeof system === 'string' ? system : R.id(system)) >= 0; };
  R.stationFactor = function (net, sid) { let value = 0; for (const lid of CM.Metro.stationLines(net, sid)) value = Math.max(value, R.get(net.lines[lid]).station); return value || 1; };
  R.control = function (ui, lid) {
    const g = ui.g(), net = g.draft ? g.draft.net : g.net, line = net.lines[lid], current = R.get(line), mapId = CM.Fleet ? CM.Fleet.cityId(g) : g.mapId;
    const select = h('select', { class: 'mc-q', 'aria-label': '轨道制式', onchange: function () {
      const target = R.get(select.value), result = g.edit(function (n) {
        const L = n.lines[lid]; if (!L) return { error: '线路不存在' };
        const speed = R.pickSpeed(mapId, g.clock.y, target.id, L.speed || current.speed);
        if (speed == null) return { error: '当前年份没有可运行于' + target.name + '的兼容车型，请等待开放' };
        if (target.id === 'metro') delete L.railSystem; else L.railSystem = target.id;
        if (speed === target.speed) delete L.speed; else L.speed = speed;
      });
      if (result.error) ui.toast(result.error, 'bad');
      else { ui.markUnsaved(); ui.scheduleAutosave(); ui.toast('制式调整已加入草案；确认时收取改造费，不兼容列车将退回车辆段', 'info'); ui.rerenderPage(); }
    } }, R.SYSTEMS.map(function (s) { const available = R.pickSpeed(mapId, g.clock.y, s.id) != null; return h('option', { value: s.id, selected: s.id === current.id ? true : null, disabled: available ? null : true }, s.name + (g.clock.y < s.from ? ' · ' + s.from + ' 年开放' : available ? '' : ' · 等待兼容车型')); }));
    return h('div', { class: 'fo-speed' }, h('div', { class: 'fo-speed-h' }, h('b', { class: 'grow' }, '轨道制式'), select),
      h('div', { class: 'tiny muted' }, current.desc + ' 轨道造价 ×' + current.track.toFixed(2) + '，车站造价 ×' + current.station.toFixed(2) + '，最长 ' + current.cars + ' 节。'),
      h('div', { class: 'tiny muted' }, '参数为游戏估算。制式与提速改造均须确认草案；不兼容列车退回车辆段，不会被出售。'));
  };
})(window.CM);
