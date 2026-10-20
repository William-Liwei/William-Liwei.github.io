(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TextTools = factory();
})(typeof window === 'object' ? window : this, function () {
  'use strict';
  var MAX_CHARACTERS = 100000, MAX_LINES = 1000;
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
        for (j = 0; j < Math.max(deletions.length, additions.length); j++) rows.push({ before: deletions[j] || null, after: additions[j] || null });
      }
    }
    return { rows: rows, added: added, removed: removed, unchanged: unchanged, identical: left === right };
  }
  return { cleanText: cleanText, compareText: compareText, MAX_CHARACTERS: MAX_CHARACTERS, MAX_LINES: MAX_LINES };
});
