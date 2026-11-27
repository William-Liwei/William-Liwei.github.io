'use strict';
// Original sandbox terrain. Points are in map cells, with north at the top.
(() => {
  const river = [
    [62,-3,5], [62,2,5], [58,7,5.5], [51,11,5], [44,15,5.5], [40,20,6],
    [40,24,6.5], [44,29,6], [49,34,5.5], [49,39,5], [45,44,5.5],
    [37,49,6], [30,54,6.5], [28,59,7],
  ];
  function bank(sign) {
    const points = [];
    const catmull = (a,b,c,d,t) => .5 * (2*b + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t*t*t);
    for (let i = 0; i < river.length - 1; i++) {
      const a = river[Math.max(0,i-1)], b = river[i], c = river[i+1], d = river[Math.min(river.length-1,i+2)];
      for (let j = 0; j < 8; j++) {
        const t = j / 8;
        const x = catmull(a[0],b[0],c[0],d[0],t), y = catmull(a[1],b[1],c[1],d[1],t);
        const w = catmull(a[2],b[2],c[2],d[2],t);
        points.push([x + w*sign/2 + Math.sin(y*1.1)*.12, y]);
      }
    }
    const [x,y,w] = river.at(-1);
    points.push([x+w*sign/2,y]);
    return points;
  }
  const pond = [11,10, 13,8.5, 17,8.5, 20,10, 21,12, 19,14, 15,14.5, 12,13];
  window.CITY_TERRAIN = {W:80,H:56,shapes:[[bank(-1).concat(bank(1).reverse()).flat()],[pond]]};
})();
