/* Progressive enhancement: content and native details work without this file. */
(function () {
  'use strict';
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var running = new Set();
  var scrollLocks = new Set(), savedScrollBehavior, trackingControl;
  var duration = 240;
  var easing = 'cubic-bezier(.22, 1, .36, 1)';

  function animateHeight(element, start, end, commit, anchor, anchorTop) {
    var animation, frame, finished = false;
    var tracking = !!anchor && anchorTop > 76 && anchorTop < innerHeight - 36;
    function stopTracking() { tracking = false; }
    function keyboardScroll(event) {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(event.key)) stopTracking();
    }
    function retainPosition() {
      if (!tracking || trackingControl !== control) return;
      var delta = anchor.getBoundingClientRect().top - anchorTop;
      if (Math.abs(delta) > .25) window.scrollBy(0, delta);
    }
    function cleanup(retain) {
      cancelAnimationFrame(frame);
      element.style.removeProperty('height');
      element.style.removeProperty('overflow');
      element.classList.remove('layout-animating');
      if (retain) retainPosition();
      if (trackingControl === control) trackingControl = null;
      if (anchor) {
        window.removeEventListener('wheel', stopTracking);
        window.removeEventListener('touchmove', stopTracking);
        window.removeEventListener('keydown', keyboardScroll);
      }
      if (scrollLocks.delete(control) && !scrollLocks.size) {
        document.documentElement.style.scrollBehavior = savedScrollBehavior;
      }
      running.delete(control);
    }
    function finish() {
      if (finished) return;
      finished = true;
      if (animation) animation.cancel();
      commit();
      cleanup(true);
    }
    var control = {
      finish: finish,
      cancel: function () {
        if (finished) return;
        finished = true;
        if (animation) animation.cancel();
        cleanup();
      }
    };
    // Share the scroll lock when independent disclosures animate together.
    if (tracking) {
      trackingControl = control;
      if (!scrollLocks.size) {
        savedScrollBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
      }
      scrollLocks.add(control);
      window.addEventListener('wheel', stopTracking, {passive: true});
      window.addEventListener('touchmove', stopTracking, {passive: true});
      window.addEventListener('keydown', keyboardScroll);
    }
    if (reduced.matches || !element.animate || Math.abs(start - end) < 1) {
      finish();
      return control;
    }
    element.classList.add('layout-animating');
    element.style.overflow = 'hidden';
    element.style.height = start + 'px';
    retainPosition();
    running.add(control);
    animation = element.animate([{height: start + 'px'}, {height: end + 'px'}], {duration: duration, easing: easing, fill: 'forwards'});
    animation.onfinish = finish;
    function tick() {
      if (finished) return;
      retainPosition();
      frame = requestAnimationFrame(tick);
    }
    if (tracking) frame = requestAnimationFrame(tick);
    return control;
  }

  function expandableList(list, button, limit) {
    var extra = Array.from(list.children).slice(limit), expanded = false, active;
    function state() {
      list.classList.toggle('is-collapsed', !expanded);
      extra.forEach(function (item) { item.inert = !expanded; });
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? 'Show less' : 'Show all ' + list.children.length;
    }
    extra.forEach(function (item) { item.classList.add('extra'); });
    state();
    button.addEventListener('click', function () {
      var start = list.getBoundingClientRect().height;
      var anchorTop = button.getBoundingClientRect().top;
      if (active) active.cancel();
      expanded = !expanded;
      state();
      var end = list.getBoundingClientRect().height;
      // Keep rows rendered while the containing box changes height.
      list.classList.remove('is-collapsed');
      active = animateHeight(list, start, end, state, expanded ? null : button, anchorTop);
    });
  }

  function details(element) {
    var summary = element.querySelector(':scope > summary');
    if (!summary || !element.animate) return;
    var expanded = element.open, active;
    function state() {
      element.open = expanded;
      element.dataset.expanded = String(expanded);
    }
    element.classList.add('motion-details');
    state();
    summary.addEventListener('click', function (event) {
      event.preventDefault();
      var start = element.getBoundingClientRect().height;
      var anchorTop = summary.getBoundingClientRect().top;
      if (active) active.cancel();
      expanded = !expanded;
      state();
      var end = element.getBoundingClientRect().height;
      element.open = true;
      active = animateHeight(element, start, end, state, expanded ? null : summary, anchorTop);
    });
    // Native/programmatic changes (including printing) must remain authoritative.
    element.addEventListener('toggle', function () {
      if (element.classList.contains('layout-animating')) return;
      expanded = element.open;
      element.dataset.expanded = String(expanded);
    });
  }

  function finishAll() { Array.from(running).forEach(function (control) { control.finish(); }); }
  window.addEventListener('resize', finishAll, {passive: true});
  window.addEventListener('beforeprint', finishAll);
  reduced.addEventListener('change', function () { if (reduced.matches) finishAll(); });
  window.SiteMotion = {expandableList: expandableList};
  document.querySelectorAll('.service-more, .bib-details').forEach(details);
})();
