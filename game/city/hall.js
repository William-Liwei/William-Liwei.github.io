'use strict';
(()=>{
const $=id=>document.getElementById(id), saved='city.blueprint.freebuild.1', pref='city.blueprint.settings.1';
function get(key){try{return JSON.parse(localStorage.getItem(key))||null}catch{return null}}
function show(){const allowed=['play','saves','settings','updates'], k=location.hash.slice(1), page=allowed.includes(k)?k:'play';document.querySelectorAll('[data-page]').forEach(el=>el.hidden=el.dataset.page!==page);document.querySelectorAll('#nav a').forEach(el=>{if(el.hash==='#'+page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});}
function current(){const s=get(saved);return s?.version===1&&Number.isInteger(s.month)&&Array.isArray(s.network?.edges)?s:null;}
function update(){const s=current();$('play-button').textContent=s?'继续建城':'开始建城';$('download').disabled=!s;$('save-summary').textContent=s?'一河两岸 · 第 '+s.month+' 月 · '+s.network.edges.length+' 段道路':'当前浏览器还没有自由建设存档。';}
function savePrefs(){try{localStorage.setItem(pref,JSON.stringify({motion:$('motion').checked,overlay:$('overlay').value}));$('settings-status').textContent='设置已保存，下次进入游戏时生效。';}catch{$('settings-status').textContent='浏览器未开放本地存储。';}}
const settings=get(pref)||{};$('motion').checked=settings.motion!==false;
if([...$('overlay').options].some(o=>o.value===settings.overlay))$('overlay').value=settings.overlay;
$('motion').onchange=savePrefs;$('overlay').onchange=savePrefs;
$('download').onclick=()=>{const s=current();if(!s)return;const url=URL.createObjectURL(new Blob([JSON.stringify(s)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='city-blueprint-freebuild.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
window.addEventListener('hashchange',show);window.addEventListener('pageshow',update);show();update();
})();
