/* Free Vercel Web Analytics: one pageview per document, production only. */
(() => {
  'use strict';

  const hosts = ['weili.space', 'www.weili.space', 'lwow.xyz', 'www.lwow.xyz'];
  if (!hosts.includes(location.hostname) || !/^\/ccf(?:\/|\/index\.html)?$/.test(location.pathname)) return;
  if (document.getElementById('ccf-web-analytics')) return;

  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  // Filters, searches and tab changes are UI state, not additional visits.
  // Keep their query strings and fragments out of the reported page URL.
  let recorded = false;
  window.va('beforeSend', (event) => {
    if (event.type !== 'pageview' || recorded) return null;
    recorded = true;
    return { ...event, url: `${location.origin}/ccf/` };
  });

  const script = document.createElement('script');
  script.id = 'ccf-web-analytics';
  script.src = '/_vercel/insights/script.js';
  script.defer = true;
  document.head.appendChild(script);
})();
