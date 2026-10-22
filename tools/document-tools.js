(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ToolboxDocuments = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var MAX_CHARACTERS = 50000, MAX_FILE_BYTES = 256 * 1024;
  function names(fileName) {
    var leaf = String(fileName || '').split(/[\\/]/).pop();
    var stem = leaf.replace(/\.(?:md|markdown|txt)$/i, '').normalize('NFC')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-').replace(/[. ]+$/g, '').trim();
    stem = Array.from(stem).slice(0, 70).join('');
    if (!stem || /^\.+$/.test(stem)) return { title: 'Markdown 文档', download: 'document.md' };
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = '_' + stem;
    return { title: stem, download: stem + '.md' };
  }
  function validateFile(file) {
    if (!file || !/\.(?:md|markdown|txt)$/i.test(String(file.name || ''))) throw new Error('请选择 .md、.markdown 或 .txt 文件。');
    if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) throw new RangeError('文件不能超过 256 KB；文本最多 50,000 字符。');
  }
  function validateText(text) {
    text = String(text).replace(/^\uFEFF/, '');
    if (text.length > MAX_CHARACTERS) throw new RangeError('文本超过 50,000 字符，原文已保留；请分段处理。');
    if (text.includes('\u0000')) throw new Error('文件包含非文本内容，请选择 UTF-8 编码的文本文件。');
    return text;
  }
  async function readDocument(file) {
    validateFile(file);
    var buffer;
    try { buffer = await file.arrayBuffer(); }
    catch (error) { throw new Error('无法读取文件，请重新选择。'); }
    if (buffer.byteLength > MAX_FILE_BYTES) throw new RangeError('文件不能超过 256 KB；文本最多 50,000 字符。');
    var text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch (error) { throw new Error('无法按 UTF-8 解码，请将文件保存为 UTF-8 后重试。'); }
    return { text: validateText(text), fileName: String(file.name) };
  }
  // One replacement snapshot, held in memory only. Typing uses the editor's
  // own undo history; no document text is written to browser storage.
  function createUndo() {
    var previous = null;
    return {
      remember: function (snapshot) { previous = Object.assign({}, snapshot); },
      available: function () { return previous !== null; },
      clear: function () { previous = null; },
      restore: function () { var result = previous; previous = null; return result; }
    };
  }
  return { names: names, readDocument: readDocument, validateText: validateText, createUndo: createUndo,
    MAX_CHARACTERS: MAX_CHARACTERS, MAX_FILE_BYTES: MAX_FILE_BYTES };
});
