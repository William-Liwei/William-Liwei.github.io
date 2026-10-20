(function () {
  'use strict';
  var body = document.querySelector('.post-body'), heading = document.querySelector('.post-heading');
  if (!body || !heading) return;
  var key = 'wl-reading-v1', path = location.pathname, ttl = 30 * 86400000;
  var storage, saved = {}, pending = false, saveTimer, engaged = false;
  try {
    storage = localStorage;
    var stored = JSON.parse(storage.getItem(key) || '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      Object.keys(stored).forEach(function (url) {
        var entry = stored[url];
        if (url.startsWith('/') && entry && Number.isFinite(entry.at) && Date.now() - entry.at < ttl && entry.at <= Date.now() && Number.isFinite(entry.progress) && entry.progress >= .03 && entry.progress <= .95) saved[url] = entry;
      });
    }
  } catch (e) {}
  function persist() {
    var entries = Object.keys(saved).sort(function (a,b) { return saved[b].at - saved[a].at; }).slice(0,30);
    var limited = {};
    entries.forEach(function (url) { limited[url] = saved[url]; });
    saved = limited;
    try { if (storage) storage.setItem(key, JSON.stringify(saved)); } catch (e) {}
  }
  function measure() {
    var rect = body.getBoundingClientRect(), top = scrollY + rect.top;
    var range = Math.max(1, rect.height - innerHeight + 100);
    return {top:top, range:range, long:rect.height > innerHeight * 2,
      progress:Math.max(0,Math.min(1,(scrollY - top + 100) / range))};
  }
  var bar = document.createElement('div'), fill = document.createElement('span');
  bar.className = 'reading-progress'; bar.setAttribute('aria-hidden','true'); bar.append(fill); document.body.append(bar);
  function update() {
    pending = false;
    var m = measure();
    bar.hidden = !m.long;
    fill.style.transform = 'scaleX(' + m.progress + ')';
  }
  function save() {
    if (!storage || !engaged) return;
    var m = measure();
    if (!m.long || m.progress < .03) return;
    if (m.progress > .95) delete saved[path];
    else saved[path] = {at:Date.now(), progress:m.progress};
    persist();
  }
  var candidate = saved[path];
  if (candidate && !location.hash && measure().long) {
    var prompt = document.createElement('div'), resume = document.createElement('button'), dismiss = document.createElement('button');
    prompt.className = 'reading-resume';
    resume.type = dismiss.type = 'button'; dismiss.className = 'resume-dismiss';
    resume.textContent = '继续上次阅读 · ' + Math.round(candidate.progress * 100) + '%';
    dismiss.textContent = '忽略'; dismiss.setAttribute('aria-label','忽略上次阅读位置');
    prompt.append(resume,dismiss); heading.append(prompt);
    resume.addEventListener('click', function () {
      prompt.remove();
      var m = measure();
      window.scrollTo({top:m.top - 100 + candidate.progress * m.range, behavior:'instant'});
      engaged = true;
      body.setAttribute('tabindex','-1'); body.focus({preventScroll:true});
    });
    dismiss.addEventListener('click', function () { delete saved[path]; persist(); prompt.remove(); });
    // Let the browser restore history navigation without an extra prompt.
    requestAnimationFrame(function () { if (scrollY > heading.offsetTop + heading.offsetHeight) prompt.remove(); });
  }
  window.addEventListener('scroll', function () {
    engaged = true;
    if (!pending) { pending = true; requestAnimationFrame(update); }
    if (!saveTimer) saveTimer = setTimeout(function () { saveTimer = null; save(); }, 1500);
  }, {passive:true});
  window.addEventListener('resize', update);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
  window.addEventListener('load', update);
  if ('ResizeObserver' in window) new ResizeObserver(update).observe(body);
  update();
})();
