(function () {
  var root = document.documentElement;
  var system = matchMedia('(prefers-color-scheme: dark)'), saved, timer;
  try { saved = localStorage.getItem('wl-theme'); } catch (e) {}
  var explicit = saved === 'dark' || saved === 'light';
  root.dataset.theme = explicit ? saved : system.matches ? 'dark' : 'light';
  function label() {
    var button = document.getElementById('theme-toggle');
    if (!button) return;
    var text = root.dataset.theme === 'dark' ? '切换浅色模式' : '切换深色模式';
    button.setAttribute('aria-label', text);
    button.title = text;
  }
  function apply(theme) {
    clearTimeout(timer);
    root.classList.add('theme-changing');
    root.dataset.theme = theme;
    label();
    timer = setTimeout(function () { root.classList.remove('theme-changing'); }, 240);
  }
  document.addEventListener('DOMContentLoaded', function () {
    label();
    document.getElementById('theme-toggle').addEventListener('click', function () {
      explicit = true;
      apply(root.dataset.theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem('wl-theme', root.dataset.theme); } catch (e) {}
    });
  });
  if (system.addEventListener) system.addEventListener('change', function (e) {
    if (!explicit) apply(e.matches ? 'dark' : 'light');
  });
  window.addEventListener('storage', function (e) {
    if (e.key !== 'wl-theme' && e.key !== null) return;
    explicit = e.newValue === 'dark' || e.newValue === 'light';
    apply(explicit ? e.newValue : system.matches ? 'dark' : 'light');
  });
})();
