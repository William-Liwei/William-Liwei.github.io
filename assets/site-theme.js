(function () {
  var root = document.documentElement;
  var saved;
  try { saved = localStorage.getItem('wl-theme'); } catch (e) {}
  root.dataset.theme = saved === 'dark' || saved === 'light' ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('theme-toggle');
    if (!button) return;
    function label() { button.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); }
    label();
    button.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('wl-theme', root.dataset.theme); } catch (e) {}
      label();
    });
  });
})();
