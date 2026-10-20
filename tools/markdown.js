(function () {
  'use strict';
  var input=document.getElementById('markdown-input'), panel=document.getElementById('markdown');
  if(!input || !panel) return;
  var frame=document.getElementById('markdown-preview'), message=document.getElementById('markdown-status');
  var renderState=document.getElementById('markdown-render-state'), images=document.getElementById('markdown-images');
  var pdf=document.getElementById('export-markdown-pdf'), copy=document.getElementById('copy-markdown-html'), download=document.getElementById('download-markdown');
  var retry=document.getElementById('retry-markdown'), timer, libraries, lastHTML='', ready=false;
  var sample='# 一份简单的 Markdown 文档\n\n在左侧编辑，右侧会**实时更新**。\n\n## 今天要做的事\n\n- 整理一段文字\n- 对比修改前后的内容\n- 把笔记保存为 PDF\n\n## 一张表格\n\n| 工具 | 用途 |\n| --- | --- |\n| 文本整理 | 清理 PDF 复制的断行 |\n| 文本对比 | 查看新增和删除 |\n\n## 一段代码\n\n```python\ndef hello(name):\n    return f"你好，{name}！"\n```\n\n> 小工具，也可以解决日常的小问题。\n';
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
  function updateButtons() {
    var hasText=!!input.value.trim();
    pdf.disabled=!ready || !hasText;copy.disabled=!ready || !hasText;download.disabled=!hasText;
  }
  function render() {
    clearTimeout(timer);
    if(!window.marked || !window.DOMPurify) return;
    ready=false;updateButtons();
    if(input.value.length>50000){status('文本超过 50,000 字符，请分段处理。',true);renderState.textContent='文本过长';return;}
    try {
      // Raw HTML is shown as text. Image URLs are never inserted unless allowed here.
      var renderer={
        html:function(token){return escape(token.text);},
        image:function(token){
          var raster=/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(token.href);
          var remote=/^https?:\/\//i.test(token.href);
          if(raster || (images.checked && remote)) return '<img src="'+escape(token.href)+'" alt="'+escape(token.text)+'" referrerpolicy="no-referrer">';
          return '<span class="image-placeholder">图片：'+escape(token.text||'未命名图片')+'（'+(remote?'未加载网络图片':'请使用完整图片网址或内嵌图片')+'）</span>';
        },
        link:function(token){
          return '<a href="'+escape(token.href)+'" target="_blank" rel="noopener noreferrer">'+this.parser.parseInline(token.tokens)+'</a>';
        }
      };
      var parser=new window.marked.Marked({gfm:true,breaks:false,renderer:renderer});
      var parsed=parser.parse(input.value.replace(/^\uFEFF/,''));
      lastHTML=window.DOMPurify.sanitize(parsed,{
        ALLOWED_TAGS:['p','br','em','strong','del','a','img','table','thead','tbody','tfoot','tr','th','td','pre','code','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','span','input'],
        ALLOWED_ATTR:['href','title','src','alt','class','type','checked','disabled','start','align','colspan','rowspan','target','rel','referrerpolicy'],
        RETURN_TRUSTED_TYPE:false
      });
      var theme=document.documentElement.dataset.theme==='dark'?'dark':'light';
      var imagePolicy=images.checked?'https: http: data:':'data:';
      var policy="default-src 'none'; script-src 'none'; style-src 'self'; img-src "+imagePolicy+"; base-uri 'none'; form-action 'none'";
      frame.srcdoc='<!doctype html><html lang="zh-CN" data-theme="'+theme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="'+escape(policy)+'"><title>Markdown 文档</title><link rel="stylesheet" href="'+escape(location.origin+'/tools/markdown-preview.css')+'"></head><body>'+(lastHTML||'<p class="empty-preview">在左侧输入 Markdown，这里会显示排版效果。</p>')+'</body></html>';
      renderState.textContent='正在更新…';status('');
    } catch(error){lastHTML='';ready=false;updateButtons();renderState.textContent='预览失败';status('无法渲染这段内容，请检查文本后重试。',true);}
  }
  frame.addEventListener('load',function(){
    if(!frame.hasAttribute('srcdoc')) return;
    ready=true;renderState.textContent='预览已更新';updateButtons();
  });
  function counts(){document.getElementById('markdown-count').textContent=Array.from(input.value).length.toLocaleString('zh-CN')+' 字符';download.disabled=!input.value.trim();}
  function selected(){
    if(panel.hidden) return;
    renderState.textContent='正在准备…';retry.hidden=true;
    ensureLibraries().then(function(){counts();render();}).catch(function(){renderState.textContent='加载失败';status('预览组件暂时未能加载，请点击重试。',true);retry.hidden=false;});
  }
  document.addEventListener('toolbox:change',selected);
  retry.addEventListener('click',selected);
  input.addEventListener('input',function(){counts();ready=false;updateButtons();renderState.textContent='等待更新…';clearTimeout(timer);timer=setTimeout(render,250);});
  images.addEventListener('change',render);
  document.getElementById('sample-markdown').addEventListener('click',function(){input.value=sample;counts();ensureLibraries().then(render).catch(function(){status('组件加载失败，请点击重试。',true);retry.hidden=false;});});
  document.getElementById('clear-markdown').addEventListener('click',function(){input.value='';counts();render();input.focus();});
  copy.addEventListener('click',async function(){
    try {await navigator.clipboard.writeText(lastHTML);status('HTML 已复制。');}
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
