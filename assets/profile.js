// Small enhancements for /about/ and /about/publications/. The content itself
// is pre-rendered at build time (scripts/prerender-profile.js).
(function () {
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // Theme toggle, shared with the homepage via localStorage "wl-theme".
  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var root = document.documentElement;
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('wl-theme', next); } catch (e) { /* storage unavailable */ }
    });
  }

  // "Show more": lists with data-show="N" keep the first N items visible.
  $$('[data-show]').forEach(function (list) {
    var limit = Number(list.getAttribute('data-show'));
    var items = $$(':scope > li, :scope > article', list);
    if (items.length <= limit) return;
    items.slice(limit).forEach(function (el) { el.classList.add('extra'); });
    list.classList.add('is-collapsed');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle-btn';
    btn.setAttribute('aria-expanded', 'false');
    var label = function () { return list.classList.contains('is-collapsed') ? 'Show all ' + items.length : 'Show less'; };
    btn.textContent = label();
    btn.addEventListener('click', function () {
      var collapsed = list.classList.toggle('is-collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.textContent = label();
      if (collapsed) list.scrollIntoView({ block: 'nearest' });
    });
    list.insertAdjacentElement('afterend', btn);
  });

  // Highlight the nav link of the section in view.
  var navLinks = $$('.nav-links a[href^="#"]');
  if (navLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || !byId[entry.target.id]) return;
        navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
        byId[entry.target.id].setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  // BibTeX toggles.
  $$('.bib-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.getAttribute('aria-controls'));
      if (!target) return;
      target.hidden = !target.hidden;
      btn.setAttribute('aria-expanded', String(!target.hidden));
    });
  });

  // Figure lightbox (full-resolution original).
  var lightbox = document.getElementById('lightbox');
  if (lightbox) {
    var img = lightbox.querySelector('img');
    var closeBtn = lightbox.querySelector('.lightbox-close');
    var lastFocus = null;
    var close = function () {
      lightbox.hidden = true;
      img.removeAttribute('src');
      if (lastFocus) lastFocus.focus();
    };
    $$('.pub-thumb').forEach(function (btn) {
      btn.addEventListener('click', function () {
        lastFocus = btn;
        img.src = btn.getAttribute('data-full');
        img.alt = btn.querySelector('img') ? btn.querySelector('img').alt : '';
        lightbox.hidden = false;
        closeBtn.focus();
      });
    });
    closeBtn.addEventListener('click', close);
    lightbox.addEventListener('click', function (e) { if (e.target === lightbox) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lightbox.hidden) close(); });
  }
})();
