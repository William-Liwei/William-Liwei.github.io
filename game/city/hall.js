'use strict';
(()=>{
const $=id=>document.getElementById(id), pref='city.blueprint.settings.1';
function get(key){try{return JSON.parse(localStorage.getItem(key))||null}catch{return null}}
function show(){const allowed=['play','saves','settings','updates'], k=location.hash.slice(1), page=allowed.includes(k)?k:'play';document.querySelectorAll('[data-page]').forEach(el=>el.hidden=el.dataset.page!==page);document.querySelectorAll('#nav a').forEach(el=>{if(el.hash==='#'+page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});}
const M=CityMaps;let id='river';try{id=localStorage.getItem('city.blueprint.map.1')||'river'}catch{};if(!M.valid(id))id='river';let sandbox=get('city.blueprint.settings.1')?.mode==='sandbox';try{sandbox=localStorage.getItem('city.blueprint.mode.1')==='sandbox'}catch{}
let difficulty='standard';try{if(localStorage.getItem('city.blueprint.difficulty.1')==='challenge')difficulty='challenge';}catch{}$('start-difficulty').value=difficulty;
$('start-difficulty').onchange=()=>{difficulty=$('start-difficulty').value;try{localStorage.setItem('city.blueprint.difficulty.1',difficulty)}catch{}update();};
function current(){const s=get(M.storage(id,sandbox));return s?.version===1&&Number.isInteger(s.month)&&Array.isArray(s.network?.edges)?s:null;}
function update(){const m=M.defs[id],s=current();$('mode-career').setAttribute('aria-pressed',String(!sandbox));$('mode-sandbox').setAttribute('aria-pressed',String(sandbox));$('map-title').textContent=m.name;$('map-tag').textContent='自由建设 · '+m.tag;$('map-desc').textContent=m.description;
 $('play-button').href='freebuild/index.html?map='+id+'&mode='+(sandbox?'sandbox':'career')+(!sandbox&&!s?'&difficulty='+difficulty:'');$('difficulty-wrap').hidden=sandbox||!!s;$('play-button').textContent=s?'继续建城':'开始建城';$('download').disabled=!s;
 $('manage-saves').href='freebuild/index.html?map='+id+'&mode='+(sandbox?'sandbox':'career')+'&menu=saves';
 $('save-summary').textContent=s?m.name+' · 第 '+s.month+' 月 · '+s.network.edges.length+' 段道路':m.name+' · 当前浏览器还没有这一地图的自由建设存档。';$('download').dataset.map=id;
 $('map-cards').replaceChildren(...Object.values(M.defs).map((z,i)=>{const art=document.createElement('article'),btn=document.createElement('button');btn.textContent=z.name;btn.setAttribute('aria-pressed',String(z.id===id));btn.onclick=()=>{id=z.id;try{localStorage.setItem('city.blueprint.map.1',id)}catch{}update();};const para=document.createElement('p');para.textContent=z.tag+' · '+(get(M.storage(z.id,sandbox))?'有存档':'新城');art.append(btn,para);return art;}));
}
function savePrefs(){try{localStorage.setItem(pref,JSON.stringify({motion:$('motion').checked,overlay:$('overlay').value}));$('settings-status').textContent='设置已保存，下次进入游戏时生效。';}catch{$('settings-status').textContent='浏览器未开放本地存储。';}}
const settings=get(pref)||{};$('motion').checked=(typeof settings.motion==='boolean'?settings.motion:!matchMedia('(prefers-reduced-motion: reduce)').matches);
if([...$('overlay').options].some(o=>o.value===settings.overlay))$('overlay').value=settings.overlay;
$('motion').onchange=savePrefs;$('overlay').onchange=savePrefs;
$('download').onclick=()=>{const s=current();if(!s)return;const url=URL.createObjectURL(new Blob([JSON.stringify(s)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='city-blueprint-'+id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
for(const k of ['career','sandbox'])$('mode-'+k).onclick=()=>{sandbox=k==='sandbox';try{localStorage.setItem('city.blueprint.mode.1',k)}catch{}update();};window.addEventListener('hashchange',show);window.addEventListener('pageshow',update);show();update();
})();
