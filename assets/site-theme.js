(function () {
  var root = document.documentElement, system = window.matchMedia('(prefers-color-scheme: dark)'), saved, transitionTimer;
  try { saved = localStorage.getItem('wl-theme'); } catch (e) {}
  var explicit = saved === 'dark' || saved === 'light';
  root.dataset.theme = explicit ? saved : system.matches ? 'dark' : 'light';
  function label() {
    var button = document.getElementById('theme-toggle');
    if (button) button.setAttribute('aria-label', root.lang.toLowerCase().startsWith('zh') ? (root.dataset.theme === 'dark' ? '切换浅色主题' : '切换深色主题') : (root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'));
  }
  function apply(theme) {
    window.clearTimeout(transitionTimer);
    root.classList.add('theme-changing');
    root.dataset.theme = theme;
    label();
    transitionTimer = window.setTimeout(function () { root.classList.remove('theme-changing'); }, 240);
  }
  document.addEventListener('DOMContentLoaded', function () {
    label();
    var button = document.getElementById('theme-toggle');
    if (button) button.addEventListener('click', function () {
      explicit = true;
      apply(root.dataset.theme === 'dark' ? 'light' : 'dark');
      try { localStorage.setItem('wl-theme', root.dataset.theme); } catch (e) {}
    });
  });
  if (system.addEventListener) system.addEventListener('change', function (e) { if (!explicit) apply(e.matches ? 'dark' : 'light'); });
  window.addEventListener('storage', function (e) {
    if (e.key !== 'wl-theme') return;
    explicit = e.newValue === 'dark' || e.newValue === 'light';
    apply(explicit ? e.newValue : system.matches ? 'dark' : 'light');
  });
})();
