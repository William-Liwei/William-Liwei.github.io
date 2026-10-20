(function () {
  'use strict';
  var input=document.getElementById('markdown-input'), panel=document.getElementById('markdown');
  if(!input || !panel) return;
  var frame=document.getElementById('markdown-preview'), message=document.getElementById('markdown-status');
  var renderState=document.getElementById('markdown-render-state'), images=document.getElementById('markdown-images');
  var pdf=document.getElementById('export-markdown-pdf'), copy=document.getElementById('copy-markdown-html'), download=document.getElementById('download-markdown');
  var retry=document.getElementById('retry-markdown'), timer, libraries, mathLibrary, lastHTML='', ready=false, renderVersion=0, lastRender={};
  var sample='# 一份简单的 Markdown 文档\n\n在左侧编辑，右侧会**实时更新**。\n\n## 今天要做的事\n\n- 整理一段文字\n- 对比修改前后的内容\n- 把笔记保存为 PDF\n\n## 一张表格\n\n| 工具 | 用途 |\n| --- | --- |\n| 文本整理 | 清理 PDF 复制的断行 |\n| 文本对比 | 查看新增和删除 |\n\n## 一段代码\n\n```python\ndef hello(name):\n    return f"你好，{name}！"\n```\n\n> 小工具，也可以解决日常的小问题。\n';
  sample+='\n## 数学公式\n\n行内公式：$E=mc^2$，以及 $\\alpha+\\beta=\\gamma$。\n\n$$\n\\mathcal{L}=\\frac{1}{N}\\sum_{i=1}^{N}(y_i-\\hat{y}_i)^2\n$$\n\n$$\nA=\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}\n$$\n';
  function escape(value) { return String(value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];}); }
  function status(text,error) { message.textContent=text;if(error)message.setAttribute('data-error','');else message.removeAttribute('data-error'); }
  function load(src,available) {
    if(available()) return Promise.resolve();
    return new Promise(function(resolve,reject){
      var script=document.createElement('script'), timeout;
      script.src=src;
      function fail(){clearTimeout(timeout);script.remove();reject(new Error('load'));}
      script.onload=function(){clearTimeout(timeout);if(available())resolve();else fail();};
      script.onerror=fail;timeout=setTimeout(fail,12000);document.head.append(script);
    });
  }
  function ensureLibraries() {
    if(!libraries) libraries=Promise.all([
      load('/tools/vendor/marked.umd.js',function(){return !!window.marked;}),
      load('/tools/vendor/purify.min.js',function(){return !!window.DOMPurify;})
    ]).catch(function(error){libraries=null;throw error;});
    return libraries;
  }
  function ensureMath() {
    if(!mathLibrary) mathLibrary=load('/tools/vendor/katex/katex.min.js',function(){return !!window.katex;}).catch(function(error){mathLibrary=null;throw error;});
    return mathLibrary;
  }
  function updateButtons() {
    var hasText=!!input.value.trim();
    pdf.disabled=!ready || !hasText;copy.disabled=!ready || !hasText;download.disabled=!hasText;
  }
  async function render() {
    clearTimeout(timer);
    if(!window.marked || !window.DOMPurify || !window.ToolboxMarkdown) return;
    var version=++renderVersion;
    ready=false;updateButtons();
    if(input.value.length>50000){status('文本超过 50,000 字符，请分段处理。',true);renderState.textContent='文本过长';return;}
    try {
      var dependencies={marked:window.marked,purify:window.DOMPurify,katex:window.katex};
      var result=window.ToolboxMarkdown.renderMarkdown(input.value,dependencies,{images:images.checked});
      if(result.needsMath){
        renderState.textContent='正在准备公式…';
        try {
          await ensureMath();if(version!==renderVersion)return;
          dependencies.katex=window.katex;
          result=window.ToolboxMarkdown.renderMarkdown(input.value,dependencies,{images:images.checked});
        }catch(error){if(version!==renderVersion)return;result.mathUnavailable=true;retry.hidden=false;}
      }
      if(version!==renderVersion)return;
      lastHTML=result.html;lastRender=result;
      var theme=document.documentElement.dataset.theme==='dark'?'dark':'light';
      var imagePolicy=images.checked?'https: http: data:':'data:';
      var policy="default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src "+imagePolicy+"; base-uri 'none'; form-action 'none'";
      var mathCSS=result.mathCount?'<link rel="stylesheet" href="'+escape(location.origin+'/tools/vendor/katex/katex.min.css')+'">':'';
      frame.srcdoc='<!doctype html><html lang="zh-CN" data-theme="'+theme+'" data-preview-version="'+version+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="'+escape(policy)+'"><title>Markdown 文档</title>'+mathCSS+'<link rel="stylesheet" href="'+escape(location.origin+'/tools/markdown-preview.css')+'"></head><body>'+(lastHTML||'<p class="empty-preview">在左侧输入 Markdown，这里会显示排版效果。</p>')+'</body></html>';
      renderState.textContent='正在更新…';status('');
    } catch(error){lastHTML='';ready=false;updateButtons();renderState.textContent='预览失败';status('无法渲染这段内容，请检查文本后重试。',true);}
  }
  frame.addEventListener('load',function(){
    var doc=frame.contentDocument;if(!doc || !doc.documentElement)return;
    var version=Number(doc.documentElement.dataset.previewVersion);
    if(version!==renderVersion)return;
    Promise.resolve(doc.fonts?doc.fonts.ready:null).then(function(){
      if(version!==renderVersion || frame.contentDocument!==doc)return;
      ready=true;renderState.textContent='预览已更新';updateButtons();
      if(lastRender.mathUnavailable)status('公式组件未能加载，公式暂以源码显示；可点击重试。',true);
      else if(lastRender.mathErrors)status(lastRender.mathErrors+' 处公式无法解析或超过限制，已保留源码供检查。',true);
    });
  });
  function counts(){document.getElementById('markdown-count').textContent=Array.from(input.value).length.toLocaleString('zh-CN')+' 字符';download.disabled=!input.value.trim();}
  function selected(){
    if(panel.hidden) return;
    renderState.textContent='正在准备…';retry.hidden=true;
    ensureLibraries().then(function(){counts();render();}).catch(function(){renderState.textContent='加载失败';status('预览组件暂时未能加载，请点击重试。',true);retry.hidden=false;});
  }
  document.addEventListener('toolbox:change',selected);
  retry.addEventListener('click',selected);
  input.addEventListener('input',function(){renderVersion++;counts();ready=false;updateButtons();renderState.textContent='等待更新…';clearTimeout(timer);timer=setTimeout(render,250);});
  images.addEventListener('change',render);
  document.getElementById('sample-markdown').addEventListener('click',function(){input.value=sample;counts();ensureLibraries().then(render).catch(function(){status('组件加载失败，请点击重试。',true);retry.hidden=false;});});
  document.getElementById('clear-markdown').addEventListener('click',function(){input.value='';counts();render();input.focus();});
  copy.addEventListener('click',async function(){
    try {var html=(lastRender.mathCount?'<link rel="stylesheet" href="'+escape(location.origin+'/tools/vendor/katex/katex.min.css')+'">\n':'')+lastHTML;await navigator.clipboard.writeText(html);status('HTML 已复制。');}
    catch(error){status('浏览器未允许自动复制；你仍可以下载 Markdown 原文。',true);}
  });
  download.addEventListener('click',function(){
    var url=URL.createObjectURL(new Blob([input.value],{type:'text/markdown;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download='document.md';document.body.append(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},10000);
  });
  pdf.addEventListener('click',function(){
    if(!ready) return;
    var pending=Array.from(frame.contentDocument.images).some(function(image){return !image.complete;});
    if(pending){status('图片仍在加载，请稍候再导出；也可以关闭网络图片后导出。');return;}
    try {frame.contentWindow.focus();frame.contentWindow.print();status('请在打印窗口中选择“另存为 PDF”。');}
    catch(error){status('浏览器未能打开打印窗口，请允许打印后重试。',true);}
  });
  new MutationObserver(function(){
    if(frame.contentDocument && frame.contentDocument.documentElement) frame.contentDocument.documentElement.dataset.theme=document.documentElement.dataset.theme;
  }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  counts();selected();
})();
