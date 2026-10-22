(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TextTools = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  var MAX_CHARACTERS = 100000, MAX_LINES = 1000;
  var MAX_INLINE_CHARACTERS = 6000, MAX_INLINE_TOKENS = 2000, MAX_INLINE_CELLS = 160000, MAX_INLINE_WORK = 1000000;
  var graphemeSegmenter = typeof Intl === 'object' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  function normalize(text) { return String(text).replace(/\r\n?/g, '\n'); }
  function checkLength(text) {
    if (text.length > MAX_CHARACTERS) throw new RangeError('文本超过 100,000 字符，请分段处理。');
  }
  function joinLines(left, right) {
    if (!left || !right || /\s$/.test(left) || /^\s/.test(right)) return left + right;
    // Preserve genuine hyphens unless the user explicitly requests dehyphenation.
    if (/[-\u2010]$/.test(left) && /^[A-Za-z]/.test(right)) return left + right;
    var cjk = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
    if (cjk.test(left.slice(-1)) && cjk.test(right.charAt(0))) return left + right;
    if (/^[,.;:!?%)\]，。；：！？、）】]/.test(right) || /[(\[（【]$/.test(left)) return left + right;
    return left + ' ' + right;
  }
  function cleanText(input, options) {
    checkLength(input);
    var settings = Object.assign({ mergeLines: true, trimSpaces: true, fixLigatures: true, joinHyphens: false }, options);
    var value = normalize(input);
    if (settings.trimSpaces) value = value.split('\n').map(function (line) { return line.trim(); }).join('\n').trim();
    if (settings.fixLigatures) {
      var ligatures = { '\ufb00': 'ff', '\ufb01': 'fi', '\ufb02': 'fl', '\ufb03': 'ffi', '\ufb04': 'ffl', '\ufb05': 'st', '\ufb06': 'st' };
      value = value.replace(/[\ufb00-\ufb06]/g, function (char) { return ligatures[char]; });
    }
    if (settings.joinHyphens) value = value.replace(/([A-Za-z])[-\u2010\u00ad][ \t]*\n[ \t]*([A-Za-z])/g, '$1$2').replace(/\u00ad/g, '');
    if (settings.mergeLines) {
      value = value.split(/\n[ \t]*\n+/).map(function (paragraph) {
        var lines = paragraph.split('\n');
        // Keep list line breaks; prose, tables and equations should still be reviewed.
        if (lines.some(function (line) { return /^\s*(?:[-*•▪‣]\s|\d+[.)、]\s|[一二三四五六七八九十]+、)/.test(line); })) return paragraph;
        return lines.reduce(joinLines, '');
      }).join('\n\n');
    }
    return value;
  }
  function inlineTokens(text) {
    var graphemes = graphemeSegmenter ? Array.from(graphemeSegmenter.segment(text), function (part) { return part.segment; }) : Array.from(text);
    // A conservative fallback keeps combining marks and joined emoji intact.
    if (!graphemeSegmenter) {
      graphemes = graphemes.reduce(function (parts, char) {
        var previous = parts[parts.length - 1];
        var joinsPrevious = /[\p{Mark}\uFE0E\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]/u.test(char) || (previous && previous.endsWith('\u200D'));
        var flagPair = /\p{Regional_Indicator}/u.test(char) && previous && /^\p{Regional_Indicator}$/u.test(previous);
        if (previous && (joinsPrevious || flagPair)) parts[parts.length - 1] += char;
        else parts.push(char);
        return parts;
      }, []);
    }
    var tokens = [], previousKind = '';
    graphemes.forEach(function (char) {
      var kind = /^[\p{Script=Latin}\p{Number}_\p{Mark}]+$/u.test(char) ? 'word' : /^[ \t]+$/.test(char) ? 'space' : '';
      if (kind && kind === previousKind) tokens[tokens.length - 1] += char;
      else tokens.push(char);
      previousKind = kind;
    });
    return tokens;
  }
  function pushSegment(segments, text, changed) {
    if (!text) return;
    var previous = segments[segments.length - 1];
    if (previous && previous.changed === changed) previous.text += text;
    else segments.push({ text: text, changed: changed });
  }
  function inlineDifference(before, after, budget) {
    if (before.length > MAX_INLINE_CHARACTERS || after.length > MAX_INLINE_CHARACTERS) { budget.limited++; return null; }
    var a = inlineTokens(before), b = inlineTokens(after);
    if (a.length > MAX_INLINE_TOKENS || b.length > MAX_INLINE_TOKENS) { budget.limited++; return null; }
    var start = 0, endA = a.length, endB = b.length, i, j;
    while (start < endA && start < endB && a[start] === b[start]) start++;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    // Trim shared context first: a one-word edit in a long paragraph stays cheap.
    var countA = endA - start, countB = endB - start;
    var cells = (countA + 1) * (countB + 1);
    if (cells > MAX_INLINE_CELLS || cells > budget.remaining) { budget.limited++; return null; }
    budget.remaining -= cells;
    var table = Array.from({ length: countA + 1 }, function () { return new Uint16Array(countB + 1); });
    for (i = countA - 1; i >= 0; i--) {
      for (j = countB - 1; j >= 0; j--) table[i][j] = a[start + i] === b[start + j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
    var left = [], right = [], shared = a.slice(0, start).concat(a.slice(endA)).join('');
    pushSegment(left, a.slice(0, start).join(''), false); pushSegment(right, b.slice(0, start).join(''), false);
    i = 0; j = 0;
    while (i < countA || j < countB) {
      if (i < countA && j < countB && a[start + i] === b[start + j]) {
        var same = a[start + i++]; j++; shared += same;
        pushSegment(left, same, false); pushSegment(right, same, false);
      } else if (i < countA && (j === countB || table[i + 1][j] >= table[i][j + 1])) pushSegment(left, a[start + i++], true);
      else pushSegment(right, b[start + j++], true);
    }
    pushSegment(left, a.slice(endA).join(''), false); pushSegment(right, b.slice(endB).join(''), false);
    function weight(text) { return (text.match(/[\p{Letter}\p{Number}\p{Extended_Pictographic}\p{Regional_Indicator}]/gu) || []).length; }
    var total = weight(before) + weight(after), common = weight(shared);
    if (!total) { total = before.replace(/\s/g, '').length + after.replace(/\s/g, '').length; common = shared.replace(/\s/g, '').length; }
    // Positional row pairing is not a semantic match. Only refine visibly similar
    // text; sharing whitespace alone must not pair otherwise unrelated lines.
    if (!common || common * 2 / total < 0.35) return null;
    budget.highlighted++;
    return { before: left, after: right };
  }
  function compareText(before, after) {
    checkLength(before); checkLength(after);
    var left = normalize(before), right = normalize(after);
    var a = left === '' ? [] : left.split('\n'), b = right === '' ? [] : right.split('\n');
    if (a.length > MAX_LINES || b.length > MAX_LINES) throw new RangeError('单侧文本超过 1,000 行，请分段比较。');
    var operations = [], i, j;
    if (left === right) operations = a.map(function (text) { return { type: 'same', text: text }; });
    else {
      // Bounded LCS: at most 1,002,001 Uint16 cells (about 2 MB).
      var table = Array.from({ length: a.length + 1 }, function () { return new Uint16Array(b.length + 1); });
      for (i = a.length - 1; i >= 0; i--) {
        for (j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
      i = 0; j = 0;
      while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) { operations.push({ type: 'same', text: a[i++] }); j++; }
        else if (i < a.length && (j === b.length || table[i + 1][j] >= table[i][j + 1])) operations.push({ type: 'removed', text: a[i++] });
        else operations.push({ type: 'added', text: b[j++] });
      }
    }
    var rows = [], oldLine = 1, newLine = 1, added = 0, removed = 0, unchanged = 0;
    var inline = { remaining: MAX_INLINE_WORK, highlighted: 0, limited: 0 };
    for (i = 0; i < operations.length;) {
      var operation = operations[i];
      if (operation.type === 'same') {
        rows.push({ before: { text: operation.text, line: oldLine++, kind: 'same' }, after: { text: operation.text, line: newLine++, kind: 'same' } });
        unchanged++; i++;
      } else {
        var deletions = [], additions = [];
        while (i < operations.length && operations[i].type !== 'same') {
          operation = operations[i++];
          if (operation.type === 'removed') { deletions.push({ text: operation.text, line: oldLine++, kind: 'removed' }); removed++; }
          else { additions.push({ text: operation.text, line: newLine++, kind: 'added' }); added++; }
        }
        for (j = 0; j < Math.max(deletions.length, additions.length); j++) {
          var row = { before: deletions[j] || null, after: additions[j] || null };
          if (row.before && row.after) {
            var segments = inlineDifference(row.before.text, row.after.text, inline);
            if (segments) { row.before.segments = segments.before; row.after.segments = segments.after; }
          }
          rows.push(row);
        }
      }
    }
    return { rows: rows, added: added, removed: removed, unchanged: unchanged, identical: left === right, inline: { highlighted: inline.highlighted, limited: inline.limited } };
  }
  return { cleanText: cleanText, compareText: compareText, MAX_CHARACTERS: MAX_CHARACTERS, MAX_LINES: MAX_LINES };
});
