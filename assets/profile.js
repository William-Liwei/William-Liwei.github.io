(function () {
  var $$ = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };
  $$('[data-show]').forEach(function (list, index) {
    var limit = Number(list.dataset.show), items = $$(':scope > li, :scope > article', list);
    if (!limit || items.length <= limit) return;
    if (!list.id) list.id = 'expandable-' + index;
    var button = document.createElement('button');
    button.type = 'button'; button.className = 'toggle-btn';
    button.setAttribute('aria-controls', list.id);
    // Keep all content visible if the motion enhancement did not load.
    if (!window.SiteMotion) return;
    list.insertAdjacentElement('afterend', button);
    SiteMotion.expandableList(list, button, limit);
  });

  var menu = document.querySelector('.section-menu'), mobile = matchMedia('(max-width: 720px)');
  if (menu) {
    function sizeMenu() { menu.open = !mobile.matches; }
    sizeMenu(); mobile.addEventListener('change', sizeMenu);
    menu.addEventListener('click', function (e) { if (mobile.matches && e.target.closest('a')) menu.open = false; });
  }
  var navLinks = $$('.section-links a');
  if (navLinks.length && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) { if(link.hash === '#' + entry.target.id) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current'); });
      });
    }, {rootMargin:'-15% 0px -60% 0px'});
    navLinks.forEach(function(link) { var section = document.getElementById(link.hash.slice(1)); if(section) observer.observe(section); });
  }
  $$('.copy-bib').forEach(function (btn) {
    btn.hidden = false;
    btn.addEventListener('click', async function () {
      var target = document.getElementById(btn.dataset.copy), status = btn.parentElement.querySelector('.copy-status');
      try {
        await navigator.clipboard.writeText(target.textContent);
        btn.textContent = 'Copied'; status.textContent = 'BibTeX copied.';
        setTimeout(function () { btn.textContent = 'Copy'; status.textContent = ''; }, 1800);
      } catch (e) {
        var range = document.createRange(); range.selectNodeContents(target);
        var selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        status.textContent = 'Copy unavailable. Text selected; use Ctrl+C or your device’s copy menu.';
      }
    });
  });
  var lightbox = document.getElementById('lightbox');
  if (lightbox) {
    var img=lightbox.querySelector('img'), closeBtn=lightbox.querySelector('button'), lastFocus;
    function close() { lightbox.hidden=true; document.body.style.overflow=''; img.removeAttribute('src'); if(lastFocus) lastFocus.focus(); }
    $$('.pub-thumb').forEach(function(btn) { btn.addEventListener('click',function() {
      lastFocus=btn; img.src=btn.dataset.full; img.alt=btn.querySelector('img').alt;
      lightbox.hidden=false; document.body.style.overflow='hidden'; closeBtn.focus();
    }); });
    closeBtn.addEventListener('click',close);
    lightbox.addEventListener('click',function(e) { if(e.target===lightbox) close(); });
    document.addEventListener('keydown',function(e) {
      if(lightbox.hidden) return;
      if(e.key==='Escape') close();
      if(e.key==='Tab') { e.preventDefault(); closeBtn.focus(); }
    });
  }
})();
