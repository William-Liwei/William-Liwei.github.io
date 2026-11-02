(function () {
  'use strict';
  var key='wl-language',saved;
  try { saved=localStorage.getItem(key); } catch (error) {}
  // Only the gateway follows a saved preference. Shared deep links keep their language.
  if(location.pathname==='/' && saved==='zh') {
    location.replace('/zh/'+location.search+location.hash);
    return;
  }
  document.addEventListener('DOMContentLoaded',function () {
    var links=document.querySelectorAll('[data-language]');
    function keepAnchor() { links.forEach(function (link) { link.hash=location.hash; }); }
    keepAnchor();
    window.addEventListener('hashchange',keepAnchor);
    links.forEach(function (link) {
      link.addEventListener('click',function () {
        link.hash=location.hash;
        var value=link.getAttribute('data-language');
        if(value!=='en' && value!=='zh')return;
        try { localStorage.setItem(key,value); } catch (error) {}
      });
    });
  });
})();
