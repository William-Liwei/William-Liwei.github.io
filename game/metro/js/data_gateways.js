'use strict';
// Gateways use the ordinary facility-demand model. Coordinates are approximate;
// demand and opening schedules are scenario parameters, not passenger forecasts.
(function (CM) {
  const m = CM.MAP_LIST.find(x => x.id === 'sh'), D = m.data, G = CM.GEOS.sh, P = G.proj;
  const list = [
    ['wx_main', '无锡站', 'rail', 31.590, 120.306, 1990, 3.2, 8],
    ['wx_east', '无锡东站', 'rail', 31.598, 120.461, 2011, 1.5, 5],
    ['cz_main', '常州站', 'rail', 31.786, 119.975, 1990, 2.6, 6],
    ['cz_north', '常州北站', 'rail', 31.855, 119.954, 2011, 1.2, 4],
    ['nt_main', '南通站', 'rail', 32.074, 120.866, 2004, 1.2, 4],
    ['nt_west', '南通西站', 'rail', 32.066, 120.774, 2020, 1.2, 3.5],
    ['jx_main', '嘉兴站', 'rail', 30.767, 120.764, 1990, 1.8, 4],
    ['jx_south', '嘉兴南站', 'rail', 30.692, 120.797, 2010, 1.8, 5],
    ['hu_main', '湖州站', 'rail', 30.864, 120.032, 2013, 1.2, 4],
    ['wx_air', '苏南硕放机场', 'air', 31.494, 120.430, 2004, .5, 2.5],
    ['nt_air', '南通兴东机场', 'air', 32.071, 120.979, 1993, .2, 1.8],
    ['sh_coach', '上海长途汽车客运总站', 'coach', 31.254, 121.451, 2005, 2.5, 1.8],
    ['sz_coach', '苏州汽车北站', 'coach', 31.330, 120.618, 1990, 1.8, 1.2],
    ['jx_coach', '嘉兴汽车北站', 'coach', 30.790, 120.744, 1990, 1.2, .9],
    ['sh_wusong', '吴淞口国际邮轮港', 'port', 31.405, 121.497, 2011, .6, 1.8],
    ['sh_baoyang', '宝杨路客运码头', 'port', 31.408, 121.498, 1990, 1.2, .5],
    ['sh_nanmen', '崇明南门客运码头', 'port', 31.618, 121.396, 1990, .9, .6],
    ['sh_logistics', '外高桥港区员工接驳', 'freight', 31.356, 121.600, 1990, 1, 2.8],
    ['sz_port_workers', '太仓港区员工接驳', 'freight', 31.628, 121.183, 1990, .5, 1.8]
  ];
  const added = [];
  for (const [id, n, t, lat, lon, y0, early, late] of list) {
    const at = [(lon - P.lon0) * P.kx, (P.lat0 - lat) * P.ky];
    if (at[0] < 0 || at[1] < 0 || at[0] >= m.cfg.W || at[1] >= m.cfg.H || D.facilities.some(f => f.id === id)) continue;
    const f = { id, n, t, at, y0, pax: [[y0, early], [Math.max(y0 + 5, 2030), late]], gateway: true,
      note: t === 'freight' ? '只计港区员工接驳需求，不将货物吞吐量换算成乘客。位置、启用时间和规模为区域玩法近似参数。' : '外部交通由背景系统运营；这里只模拟市内接驳需求。位置、启用时间和客流规模为游戏近似参数，不代表真实班次与统计。' };
    D.facilities.push(f); added.push(id);
  }
  D.gatewaySources = [
    'https://www.nantong.gov.cn/ntsrmzf/xwfbh/content/5512a4ef-0ec1-4950-acc9-79ede337e7f1.html',
    'https://www.shanghai.gov.cn/nw17239/20260113/be65867570ca4d8489f76b71e1e44180.html',
    'https://www.meet-in-shanghai.net/cn/traffic/international-ferry-terminal-703950/',
    'https://www.csair.com/csvideo/2018/20180424_17/wuxilvyougonglue20180424.pdf'
  ];
  CM.GATEWAY_ADDITIONS = added;
})(window.CM);
