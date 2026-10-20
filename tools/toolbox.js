(function () {
  'use strict';
  var core = window.TextTools;
  if (!core) return;
  var get = function (id) { return document.getElementById(id); };
  var panels = Array.from(document.querySelectorAll('.tool-panel'));
  var choices = Array.from(document.querySelectorAll('[data-tool]'));
  function showTool() {
    var requested = location.hash.slice(1), selected = panels.some(function (panel) { return panel.id === requested; }) ? requested : 'clean-text';
    panels.forEach(function (panel) { panel.hidden = panel.id !== selected; });
    choices.forEach(function (link) {
      if (link.dataset.tool === selected) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    document.dispatchEvent(new Event('toolbox:change'));
  }
  choices.forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      if (location.hash !== link.hash) history.pushState(null, '', link.hash);
      showTool();
    });
  });
  window.addEventListener('hashchange', showTool);
  window.addEventListener('popstate', showTool);
  showTool();
  function count(input, label) { label.textContent = Array.from(input.value).length.toLocaleString('zh-CN') + ' 字符'; }
  function status(target, message, error) {
    target.textContent = message;
    if (error) target.setAttribute('data-error', ''); else target.removeAttribute('data-error');
  }
  var cleanInput = get('clean-input'), cleanOutput = get('clean-output'), cleanStatus = get('clean-status'), copyButton = get('copy-clean');
  function cleanCounts() { count(cleanInput, get('clean-input-count')); count(cleanOutput, get('clean-output-count')); }
  function invalidateClean() {
    var hadResult = !!cleanOutput.value;
    cleanOutput.value = ''; copyButton.disabled = true; cleanCounts();
    status(cleanStatus, hadResult ? '原文或选项已改变，请重新整理。' : '');
  }
  cleanInput.addEventListener('input', invalidateClean);
  document.querySelectorAll('.clean-options input').forEach(function (input) { input.addEventListener('change', invalidateClean); });
  function runClean() {
    if (!cleanInput.value) { status(cleanStatus, '请先粘贴需要整理的文字。', true); return; }
    try {
      cleanOutput.value = core.cleanText(cleanInput.value, {
        mergeLines: get('merge-lines').checked, trimSpaces: get('trim-spaces').checked,
        fixLigatures: get('fix-ligatures').checked, joinHyphens: get('join-hyphens').checked
      });
      copyButton.disabled = !cleanOutput.value;
      cleanCounts();
      status(cleanStatus, cleanOutput.value ? (cleanOutput.value === cleanInput.value ? '文本无需调整，结果与原文一致。' : '整理完成，请对照原文检查结果。') : '整理后没有可复制的文字。');
    } catch (error) { cleanOutput.value = ''; copyButton.disabled = true; cleanCounts(); status(cleanStatus, error.message, true); }
  }
  get('clean-form').addEventListener('submit', function (event) { event.preventDefault(); runClean(); });
  get('sample-clean').addEventListener('click', function () {
    cleanInput.value = 'Learning from temporal\ndata helps us make better\npredictions.\n\nTime series fore-\ncasting can be useful.\n\n这个段落从 PDF 复制后，\n出现了多余的换行。';
    runClean();
  });
  get('clear-clean').addEventListener('click', function () { cleanInput.value = ''; invalidateClean(); status(cleanStatus, '已清空。'); cleanInput.focus(); });
  async function copyText(value) {
    try { await navigator.clipboard.writeText(value); }
    catch (error) {
      var field = document.createElement('textarea'), previous = document.activeElement;
      field.value = value; field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.append(field); field.select();
      var copied;
      try { copied = document.execCommand('copy'); }
      finally { field.remove(); if (previous) previous.focus({ preventScroll: true }); }
      if (!copied) throw new Error('copy');
    }
  }
  copyButton.addEventListener('click', async function () {
    var text = cleanOutput.value;
    try { await copyText(text); status(cleanStatus, '结果已复制。'); }
    catch (error) { cleanOutput.focus(); cleanOutput.select(); status(cleanStatus, '自动复制不可用，已选中结果，请手动复制。', true); }
  });

  var before = get('before-text'), after = get('after-text'), comparison = get('comparison'), rows = get('diff-rows'), compareStatus = get('compare-status');
  function compareCounts() { count(before, get('before-count')); count(after, get('after-count')); }
  function invalidateComparison() {
    var hadResult = !comparison.hidden;
    comparison.hidden = true; rows.replaceChildren(); compareCounts();
    status(compareStatus, hadResult ? '文本已改变，请重新对比。' : '');
  }
  before.addEventListener('input', invalidateComparison); after.addEventListener('input', invalidateComparison);
  function diffCell(item, side) {
    var cell = document.createElement('div');
    cell.className = 'diff-cell' + (item ? ' diff-' + item.kind : ' diff-placeholder');
    cell.dataset.side = side;
    if (!item) { cell.setAttribute('aria-hidden', 'true'); return cell; }
    var number = document.createElement('span'), sign = document.createElement('span'), text = document.createElement('pre');
    number.className = 'diff-number'; number.textContent = item.line; number.setAttribute('aria-label', '第 ' + item.line + ' 行');
    sign.className = 'diff-sign'; sign.textContent = item.kind === 'added' ? '+' : item.kind === 'removed' ? '−' : ' ';
    sign.setAttribute('aria-label', item.kind === 'added' ? '新增' : item.kind === 'removed' ? '删除' : '保留');
    text.textContent = item.text === '' ? '（空行）' : item.text;
    if (item.text === '') text.className = 'diff-empty';
    cell.append(number, sign, text); return cell;
  }
  function runComparison() {
    comparison.hidden = true; rows.replaceChildren(); compareCounts();
    if (!before.value && !after.value) { status(compareStatus, '请至少填入一侧文本。', true); return; }
    try {
      var result = core.compareText(before.value, after.value), fragment = document.createDocumentFragment();
      result.rows.forEach(function (item) {
        var row = document.createElement('div'); row.className = 'diff-row'; row.setAttribute('role', 'listitem');
        row.append(diffCell(item.before, '修改前'), diffCell(item.after, '修改后')); fragment.append(row);
      });
      rows.replaceChildren(fragment);
      get('diff-summary').textContent = '新增 ' + result.added + ' 行 · 删除 ' + result.removed + ' 行 · 保留 ' + result.unchanged + ' 行';
      comparison.hidden = false;
      status(compareStatus, result.identical ? '两段文本一致（已忽略系统换行格式差异）。' : '对比完成：新增 ' + result.added + ' 行，删除 ' + result.removed + ' 行。');
    } catch (error) { status(compareStatus, error.message, true); }
  }
  get('compare-form').addEventListener('submit', function (event) { event.preventDefault(); runComparison(); });
  get('swap-text').addEventListener('click', function () { var original = before.value; before.value = after.value; after.value = original; invalidateComparison(); });
  get('sample-compare').addEventListener('click', function () {
    before.value = '个人工具箱\n整理从 PDF 复制的文字。\n所有文本在浏览器中处理。';
    after.value = '个人工具箱\n整理从 PDF 复制的文字，保留段落。\n支持对比两段文字的改动。\n所有文本在浏览器中处理。';
    runComparison();
  });
  get('clear-compare').addEventListener('click', function () { before.value = ''; after.value = ''; invalidateComparison(); status(compareStatus, '已清空。'); before.focus(); });
  cleanCounts(); compareCounts();
})();
