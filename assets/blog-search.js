(function (root) {
  'use strict';

  function text(value) {
    return value == null || value === false ? '' : String(value);
  }

  function normalize(value) {
    return text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function tokenize(query) {
    return Array.from(new Set(normalize(query).split(' ').filter(Boolean)));
  }

  function excerpt(body, terms) {
    const source = text(body).normalize('NFKC').replace(/\s+/g, ' ').trim();
    const lowered = source.toLowerCase();
    const matches = terms.map(term => lowered.indexOf(term)).filter(index => index >= 0);
    if (!matches.length) return '';

    // Map a lowercased match back to the original text. Some Unicode characters
    // expand on case conversion; preserving this map keeps the context aligned.
    const match = Math.min.apply(null, matches);
    let original = 0;
    let normalized = 0;
    for (const character of source) {
      if (normalized >= match) break;
      normalized += character.toLowerCase().length;
      original += character.length;
    }
    let start = Math.max(0, original - 56);
    let end = Math.min(source.length, start + 180);
    // Keep UTF-16 surrogate pairs intact at the excerpt boundaries.
    if (start > 0 && /[\uDC00-\uDFFF]/.test(source[start])) start--;
    if (end < source.length && /[\uDC00-\uDFFF]/.test(source[end])) end++;
    return (start ? '…' : '') + source.slice(start, end) + (end < source.length ? '…' : '');
  }

  function search(posts, query) {
    const terms = tokenize(query);
    const weight = terms.length + 1;
    return (Array.isArray(posts) ? posts : []).map((post, index) => {
      if (!post || typeof post !== 'object') return null;
      if (!terms.length) return { post, score: 0, excerpt: '', bodyMatch: false, index };
      const fields = [
        normalize(post.title),
        normalize((Array.isArray(post.tags) ? post.tags : []).map(tag => typeof tag === 'string' ? tag : tag && tag.name).filter(Boolean).join(' ')),
        normalize(post.summary),
        normalize(post.body)
      ];
      let score = 0;
      const bodyTerms = [];
      for (const term of terms) {
        const field = fields.findIndex(value => value.includes(term));
        if (field < 0) return null;
        // One match in a stronger field outranks all matches in weaker fields.
        score += Math.pow(weight, 3 - field);
        if (field === 3) bodyTerms.push(term);
      }
      return { post, score, excerpt: bodyTerms.length ? excerpt(post.body, bodyTerms) : '', bodyMatch: bodyTerms.length > 0, index };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index).map(({ index, ...result }) => result);
  }

  root.JournalSearch = { normalize, tokenize, search };
})(typeof window === 'object' ? window : globalThis);
