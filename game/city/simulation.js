'use strict';
(() => {
  const { W, H, shapes } = window.CITY_TERRAIN;
  const N = W * H, GATE = 33 * W, START = 145000;
  const ZONES = [null,
    { name: '住宅', color: '#aacf64', tint: '#597a41', cost: 100, cap: 28 },
    { name: '商业', color: '#62bbeb', tint: '#397388', cost: 120, cap: 22 },
    { name: '办公', color: '#b49af4', tint: '#655b91', cost: 150, cap: 36 },
    { name: '工业', color: '#f2be66', tint: '#8d6d3d', cost: 100, cap: 32 },
  ];
  const FACILITIES = {
    power: { name: '变电站', icon: 'bolt', cost: 8200, monthly: 520, range: 27, capacity: 2300, color: '#f6ca79', help: '通过相连道路供电，服务约 2,300 人口与岗位。' },
    water: { name: '供水站', icon: 'drop', cost: 7600, monthly: 450, range: 27, capacity: 2200, color: '#78d5f2', help: '通过相连道路供水，服务约 2,200 人口与岗位。' },
    school: { name: '学校', icon: 'school', cost: 11400, monthly: 740, range: 17, color: '#d0b4ef', help: '提升周围住宅吸引力，也让办公区更容易成长。' },
    clinic: { name: '诊所', icon: 'cross', cost: 9800, monthly: 650, range: 16, color: '#ffac99', help: '提高居民满意度，让供水供电充足的社区增长更稳。' },
    park: { name: '公园', icon: 'tree', cost: 3900, monthly: 180, range: 8, color: '#b4dd86', help: '提升邻近住宅吸引力，并减轻工业污染。' },
    bus: { name: '公交站场', icon: 'bus', cost: 10500, monthly: 620, range: 21, color: '#76e3d3', help: '覆盖相连道路，缓解拥堵，扩大通勤范围。' },
  };
  const TOOLS = {
    inspect: { name: '查看地块', icon: 'cursor', hint: '点选地块，查看用地、接路和公共服务。' },
    pan: { name: '移动地图', icon: 'hand', hint: '拖动地图移动视角，滚轮或右上角按钮缩放。' },
    road: { name: '道路', icon: 'road', hint: '拖动或分两次点击绘制道路。与西侧对外入口相连才可开发。', cost: '¥ 360 / 格' },
    bridge: { name: '桥梁', icon: 'bridge', hint: '选择两处陆地，直线跨越水面。两端可继续接入公路。', cost: '¥ 1,250 / 格' },
    residential: { name: '住宅区', icon: 'home', zone: 1, hint: '拖出住宅用地。路边有供电供水，居民才会搬来。' },
    commercial: { name: '商业区', icon: 'shop', zone: 2, hint: '靠近住宅布置商业区，让商铺获得客流。' },
    office: { name: '办公区', icon: 'office', zone: 3, hint: '办公区依赖人口、通勤和学校覆盖。' },
    industrial: { name: '工业区', icon: 'factory', zone: 4, hint: '工业区起步快，但会污染附近住宅。' },
    bulldoze: { name: '拆除', icon: 'remove', hint: '点选拆除道路、设施或整块分区，拆除费用 ¥100。' },
  };
  for (const [key, v] of Object.entries(FACILITIES)) TOOLS[key] = { ...v, hint: v.help };
  const index = (x, y) => x >= 0 && x < W && y >= 0 && y < H ? y * W + x : -1;
  const xy = i => [i % W, Math.floor(i / W)];
  const around = Array.from({ length: N }, (_, i) => {
    const [x,y] = xy(i);
    return [index(x-1,y),index(x+1,y),index(x,y-1),index(x,y+1)].filter(n => n >= 0);
  });
  function contains(p, x, y) {
    let hit = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if ((p[i+1] > y) !== (p[j+1] > y) && x < (p[j] - p[i]) * (y - p[i+1]) / (p[j+1] - p[i+1]) + p[i]) hit = !hit;
    }
    return hit;
  }
  const water = Uint8Array.from({ length: N }, (_, i) => {
    const [x,y] = xy(i);
    return Number(shapes.some(([outline, ...holes]) => contains(outline,x+.5,y+.5) && !holes.some(p => contains(p,x+.5,y+.5))));
  });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const blank = () => ({ version: 1, city: '岸城', clock: 0, cash: START,
    road: new Uint8Array(N), zone: new Uint8Array(N), use: new Float32Array(N), facilities: {}, awards: [], history: [], last: null });
  function distances(seeds, allowed, radius) {
    const d = new Int16Array(N).fill(-1), q = new Int32Array(N);
    let tail = 0;
    for (const i of seeds) if (i >= 0 && d[i] === -1 && allowed(i)) { d[i] = 0; q[tail++] = i; }
    for (let head = 0; head < tail; head++) {
      const c = q[head];
      if (d[c] >= radius) continue;
      for (const n of around[c]) if (d[n] < 0 && allowed(n)) { d[n] = d[c] + 1; q[tail++] = n; }
    }
    return d;
  }
  function analyze(s) {
    const connected = distances([GATE], i => s.road[i] > 0, N);
    const near = distances(Array.from(s.road.keys()).filter(i => connected[i] >= 0), i => !water[i] || s.road[i] > 0, 2);
    const coverage = {}, capacity = { power: 0, water: 0 }, popBy = [0,0,0,0,0], lots = [0,0,0,0,0];
    for (const key of Object.keys(FACILITIES)) coverage[key] = new Uint8Array(N);
    for (const [raw, key] of Object.entries(s.facilities)) {
      const i = +raw, f = FACILITIES[key];
      const served = distances(around[i], n => connected[n] >= 0, f.range);
      if (!around[i].some(n => connected[n] >= 0)) continue;
      if (f.capacity) capacity[key] += f.capacity;
      const source = Array.from(served.keys()).filter(n => served[n] >= 0);
      const field = distances(source, n => !water[n] || s.road[n] > 0, key === 'park' ? 3 : 2);
      for (let n = 0; n < N; n++) if (field[n] >= 0) coverage[key][n] = 1;
    }
    const pollution = new Float32Array(N), basinPop = new Float32Array(N), basinJobs = new Float32Array(N);
    let roads = 0, bridges = 0, connectedLots = 0, utilityLots = 0, social = 0, affected = 0, busUsers = 0;
    for (let i = 0; i < N; i++) {
      roads += Number(s.road[i] > 0);
      bridges += Number(s.road[i] === 2 && water[i]);
      if (!s.zone[i]) continue;
      const z = s.zone[i], occupants = s.use[i];
      lots[z]++; popBy[z] += occupants;
      if (near[i] >= 0) connectedLots++;
      if (coverage.power[i] && coverage.water[i]) utilityLots++;
      if (z === 1) { social += occupants * (coverage.park[i] * 10 + coverage.school[i] * 7 + coverage.clinic[i] * 8); busUsers += occupants * coverage.bus[i]; }
      if (occupants < 1) continue;
      const [x,y] = xy(i), r = z === 4 ? 6 : 9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const dist = Math.abs(dx) + Math.abs(dy), q = index(x+dx,y+dy);
        if (dist > r || q < 0 || !s.zone[q]) continue;
        if (z === 4) pollution[q] += occupants / 32 * (1 - dist / (r+1));
        if (z === 1) basinPop[q] += occupants * (1 - dist / (r+2));
        else basinJobs[q] += occupants * (1 - dist / (r+2));
      }
    }
    const pop = Math.round(popBy[1]), jobs = Math.round(popBy[2] + popBy[3] + popBy[4]);
    const labor = pop * .56, busShare = busUsers / Math.max(1,pop);
    const traffic = clamp(Math.round((pop + jobs) / Math.max(50, roads * 13) * (1 - busShare * .3) * 50), 0, 100);
    for (let i = 0; i < N; i++) if (s.zone[i] === 1) affected += Math.min(20, pollution[i] * 7) * s.use[i];
    const happiness = pop ? clamp(Math.round(66 + (social - affected) / pop + Math.min(9, jobs / Math.max(1,labor) * 9) - traffic * .17), 0, 100) : 0;
    const demand = [0, clamp(78 + (jobs - labor) / 9 - traffic * .23, 12, 100), clamp(26 + (pop * .26 - popBy[2]) / 5, 8, 100), clamp(8 + (pop * .22 - popBy[3]) / 4, 5, 100), clamp(55 + (labor - popBy[4]) / 9, 10, 100)].map(Math.round);
    const income = Math.round(pop * 7 + popBy[2] * 14 + popBy[3] * 16 + popBy[4] * 11);
    const expense = roads * 11 + bridges * 19 + Object.values(s.facilities).reduce((sum,k) => sum + FACILITIES[k].monthly, 0);
    return { connected, near, coverage, capacity, pollution, basinPop, basinJobs, pop, jobs, roads, bridges, lots, popBy, connectedLots, utilityLots, traffic, happiness, demand, income, expense, net: income - expense };
  }
  const GOALS = [
    { id: 'roads', title: '接入外部公路', detail: '从西侧入口铺设至少 8 格相连道路', goal: 8, reward: 4000, measure: a => a.connected.reduce((n,v) => n + (v >= 0),0) },
    { id: 'utility', title: '点亮第一条街', detail: '让 8 格用地同时获得供电和供水', goal: 8, reward: 10000, measure: a => a.utilityLots },
    { id: 'settle', title: '迎接首批居民', detail: '让 300 人入住', goal: 300, reward: 18000, measure: a => a.pop },
    { id: 'balance', title: '稳定市政账本', detail: '把月度结余提高到 ¥3,000', goal: 3000, reward: 22000, measure: a => Math.max(0,a.net) },
    { id: 'city', title: '一座真正的城', detail: '迎来 1,000 位居民', goal: 1000, reward: 35000, measure: a => a.pop },
  ];
  function tick(s, a) {
    s.clock++;
    const load = a.pop + a.jobs;
    const capacityFactor = clamp(Math.min(a.capacity.power, a.capacity.water) / Math.max(1,load), .38, 1);
    for (let i = 0; i < N; i++) {
      const z = s.zone[i];
      if (!z) continue;
      let target = 0;
      if (a.near[i] >= 0 && a.coverage.power[i] && a.coverage.water[i]) {
        const use = a.coverage, p = a.basinPop[i], j = a.basinJobs[i];
        const weight = z === 1 ? clamp(.66 + j / 230 + use.park[i] * .15 + use.school[i] * .1 + use.clinic[i] * .07 - a.pollution[i] * .15, .16, 1)
          : z === 2 ? clamp(.22 + p / 160 + a.pop / 1550, .16, 1)
          : z === 3 ? clamp(.04 + p / 340 + a.pop / 2800 + use.school[i] * .24 + use.bus[i] * .17, .04, 1)
          : clamp(.56 + p / 330 + a.pop / 1850, .35, 1);
        target = ZONES[z].cap * weight * capacityFactor * (1 - a.traffic * .002);
      }
      const before = s.use[i];
      s.use[i] = target > before ? Math.min(target, before + Math.max(1.2,(target-before) * .28)) : Math.max(target,before - 2.4);
    }
    const next = analyze(s);
    s.cash += next.net;
    s.last = { income: next.income, expense: next.expense, net: next.net };
    s.history.push(next.net);
    if (s.history.length > 18) s.history.shift();
    return next;
  }
  function line(a,b,vertical) {
    const [x,y] = xy(a), [x1,y1] = xy(b);
    const points = [];
    let px = x, py = y;
    const walk = (dx,dy) => { px += dx; py += dy; points.push(index(px,py)); };
    points.push(a);
    if (vertical) while (py !== y1) walk(0,Math.sign(y1-py));
    while (px !== x1) walk(Math.sign(x1-px),0);
    while (py !== y1) walk(0,Math.sign(y1-py));
    return points;
  }
  function quote(s,key,a,b=a,vertical=false) {
    const tool = TOOLS[key];
    const result = { key, cells: [], cost: 0, message: '' };
    if (!tool || a < 0 || b < 0 || a >= N || b >= N) return result;
    const deny = message => ({ ...result, message });
    if (key === 'road' || key === 'bridge') {
      const positions = line(a,b,vertical);
      const isBridge = key === 'bridge';
      if (isBridge && (!positions.some(i => water[i]) || water[a] || water[b] || (a % W !== b % W && Math.floor(a/W) !== Math.floor(b/W)))) return deny('桥梁需要在两处陆地之间直线跨水。');
      if (!isBridge && positions.some(i => water[i] && s.road[i] !== 2)) return deny('普通道路无法过水，请使用桥梁。');
      if (positions.some(i => s.facilities[i])) return deny('路线经过公共设施，请绕行。');
      result.cells = positions.filter(i => !s.road[i]);
      result.cost = result.cells.length * (isBridge ? 1250 : 360);
    } else if (tool.zone) {
      const [ax,ay] = xy(a), [bx,by] = xy(b);
      for (let y = Math.min(ay,by); y <= Math.max(ay,by); y++) for (let x = Math.min(ax,bx); x <= Math.max(ax,bx); x++) {
        const i = index(x,y);
        if (!water[i] && !s.road[i] && !s.facilities[i] && s.zone[i] !== tool.zone) result.cells.push(i);
      }
      result.cost = result.cells.length * ZONES[tool.zone].cost;
    } else if (FACILITIES[key]) {
      if (water[a] || s.road[a] || s.facilities[a]) return deny('请选择空地或可重新划拨的分区。');
      if (!around[a].some(i => s.road[i])) return deny('公共设施需要紧邻道路。');
      result.cells = [a]; result.cost = tool.cost;
    } else if (key === 'bulldoze' && (s.road[a] || s.zone[a] || s.facilities[a])) {
      result.cells = [a]; result.cost = 100;
    }
    if (!result.cells.length) return deny('这里没有可施工的地块。');
    if (result.cost > s.cash && key !== 'bulldoze') return deny('市库余额不足。');
    return result;
  }
  function build(s,q) {
    if (!q.cells.length || q.message) return false;
    const {key,cells,cost} = q;
    for (const i of cells) {
      s.use[i] = 0;
      s.zone[i] = TOOLS[key].zone || 0;
      if (key === 'road' || key === 'bridge') s.road[i] = water[i] ? 2 : 1;
      if (FACILITIES[key]) s.facilities[i] = key;
      if (key === 'bulldoze') { s.road[i] = 0; delete s.facilities[i]; }
    }
    s.cash -= cost;
    return true;
  }
  function pack(s) { return { ...s, road: [...s.road], zone: [...s.zone], use: [...s.use] }; }
  function unpack(s) {
    if (s?.version !== 1 || !Number.isFinite(s.cash) || !Number.isSafeInteger(s.clock) || s.clock < 0 || typeof s.city !== 'string' || !Array.isArray(s.awards) || !Array.isArray(s.history) || !s.facilities || typeof s.facilities !== 'object') return null;
    if (![s.road,s.zone,s.use].every(a => Array.isArray(a) && a.length === N)) return null;
    const type = (arr,max) => arr.every(v => Number.isInteger(v) && v >= 0 && v <= max);
    if (!type(s.road,2) || !type(s.zone,4) || !s.use.every(v => Number.isFinite(v) && v >= 0 && v <= 36)) return null;
    if (Object.entries(s.facilities).some(([i,k]) => !/^\d+$/.test(i) || +i >= N || !Object.hasOwn(FACILITIES,k))) return null;
    return { ...s, road: Uint8Array.from(s.road), zone: Uint8Array.from(s.zone), use: Float32Array.from(s.use) };
  }
  window.CitySim = { W,H,N,GATE,ZONES,FACILITIES,TOOLS,GOALS,index,xy,water,blank,analyze,tick,quote,build,pack,unpack };
})();
