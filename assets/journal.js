(function () {
  var list=document.getElementById('blog-results'), tools=document.querySelector('.blog-tools');
  function element(tag,cls,value) { var el=document.createElement(tag); if(cls) el.className=cls; if(value) el.textContent=value; return el; }
  if(list && tools) {
    var input=document.getElementById('blog-search'), status=document.querySelector('.search-status');
    var pagination=document.querySelector('.journal-pagination'), original=list.innerHTML, topic='全部', posts=[];
    var controller=new AbortController(), timeout=setTimeout(function(){controller.abort();},8000);
    fetch('/blog/search.json',{signal:controller.signal}).then(function(r){if(!r.ok) throw Error(r.status); return r.json();}).then(function(data) {
      posts=data; tools.hidden=false;
      var params=new URLSearchParams(location.search);
      input.value=params.get('q')||'';
      if(['科研','技术实践','经验分享','随笔'].includes(params.get('topic'))) topic=params.get('topic');
      function render() {
        var query=input.value.trim().toLocaleLowerCase();
        var featured=document.querySelector('.featured-posts');
        if(featured) featured.hidden=Boolean(query || topic!=='全部');
        document.querySelectorAll('[data-topic]').forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.topic===topic));});
        var url=new URL(location.href);
        if(query) url.searchParams.set('q',input.value.trim()); else url.searchParams.delete('q');
        if(topic!=='全部') url.searchParams.set('topic',topic); else url.searchParams.delete('topic');
        history.replaceState(null,'',url);
        if(!query && topic==='全部') { list.innerHTML=original; status.hidden=true; if(pagination) pagination.hidden=false; return; }
        if(pagination) pagination.hidden=true;
        var matches=posts.filter(function(p){return (topic==='全部'||p.topic===topic) && (!query || (p.title+' '+p.summary+' '+p.tags.map(function(t){return t.name;}).join(' ')).toLocaleLowerCase().includes(query));});
        list.replaceChildren();
        status.hidden=false; status.textContent=matches.length?'找到 '+matches.length+' 篇文章':'没有匹配的文章，试试其他关键词或清除筛选。';
        matches.forEach(function(p) {
          var article=element('article','journal-item'), meta=element('div','post-meta'), time=element('time','',p.date);
          time.dateTime=p.date.replaceAll('.','-'); meta.append(time,element('span','',p.topic));
          if(p.pinned) meta.append(element('span','tag tag-strong','置顶'));
          var h=element('h2'), a=element('a','',p.title); a.href=p.path; h.append(a); article.append(meta,h);
          if(p.summary) article.append(element('p','post-summary',p.summary));
          var tags=element('div','post-tags');
          p.tags.forEach(function(t){var link=element('a','tag',t.name);link.href=t.path;tags.append(link);});
          article.append(tags); list.append(article);
        });
      }
      var timer;
      input.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(render,100);});
      document.querySelectorAll('[data-topic]').forEach(function(btn){btn.addEventListener('click',function(){topic=btn.dataset.topic;render();});});
      document.getElementById('clear-search').addEventListener('click',function(){input.value='';topic='全部';render();input.focus();});
      render();
    }).catch(function(){status.hidden=false;status.textContent='搜索暂不可用，仍可浏览文章和归档。';}).finally(function(){clearTimeout(timeout);});
  }
  var toc=document.querySelector('.post-toc');
  if(toc) {
    var wide=matchMedia('(min-width: 1280px)');
    function sync(){toc.open=wide.matches;}
    sync(); wide.addEventListener('change',sync);
    var links=Array.from(toc.querySelectorAll('a'));
    var headings=links.map(function(a){try{return document.getElementById(decodeURIComponent(a.hash.slice(1)));}catch(e){return null;}}).filter(Boolean);
    if('IntersectionObserver' in window) {
      var observer=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(!entry.isIntersecting) return;
          links.forEach(function(a){if(decodeURIComponent(a.hash.slice(1))===entry.target.id) a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
        });
      },{rootMargin:'-15% 0px -65% 0px'});
      headings.forEach(function(h){observer.observe(h);});
    }
  }
  var body=document.querySelector('.post-body');
  if(body) {
    var toast=element('div','journal-toast'), timer;
    toast.setAttribute('role','status'); toast.hidden=true; document.body.append(toast);
    function notify(message) { toast.textContent=message;toast.hidden=false;clearTimeout(timer);timer=setTimeout(function(){toast.hidden=true;},2000); }
    async function copy(value) {
      try { await navigator.clipboard.writeText(value); }
      catch(e) {
        var area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';
        var active=document.activeElement;document.body.append(area);area.select();
        var ok=document.execCommand('copy');area.remove();if(active) active.focus({preventScroll:true});
        if(!ok) throw Error('copy');
      }
    }
    body.querySelectorAll('.highlight, pre').forEach(function(block){
      if(block.tagName==='PRE' && block.closest('.highlight')) return;
      var source=block.querySelector('.code pre') || block.querySelector('code') || block;
      var value=source.textContent, button=element('button','copy-code','复制代码');button.type='button';
      button.addEventListener('click',async function(){try{await copy(value);notify('代码已复制');}catch(e){notify('复制失败，请选择代码后复制');}});
      block.classList.add('copy-ready');block.append(button);
    });
    body.querySelectorAll('h2[id],h3[id],h4[id]').forEach(function(heading){
      var button=element('button','heading-link','¶');button.type='button';button.setAttribute('aria-label','复制本节链接');
      button.addEventListener('click',async function(){var url=new URL(location.href);url.hash=heading.id;try{await copy(url.href);notify('本节链接已复制');}catch(e){notify('复制失败，请手动复制地址');}});
      heading.append(button);
    });
    var dialog=document.createElement('dialog');dialog.className='article-lightbox';dialog.setAttribute('aria-label','查看原图');
    if(typeof dialog.showModal==='function') {
      var close=element('button','','×'), large=document.createElement('img'), lastFocus, previousOverflow;
      close.type='button';close.setAttribute('aria-label','关闭原图');dialog.append(close,large);document.body.append(dialog);
      close.addEventListener('click',function(){dialog.close();});
      dialog.addEventListener('click',function(e){if(e.target===dialog) {var r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
      dialog.addEventListener('close',function(){document.body.style.overflow=previousOverflow;large.removeAttribute('src');if(lastFocus)lastFocus.focus({preventScroll:true});});
      body.querySelectorAll('img').forEach(function(img){
        if(img.closest('a,button') || img.classList.contains('emoji')) return;
        var button=element('button','article-image');button.type='button';button.setAttribute('aria-label','查看原图'+(img.alt?'：'+img.alt:''));
        img.replaceWith(button);button.append(img);
        button.addEventListener('click',function(){lastFocus=button;large.src=img.dataset.full||img.currentSrc||img.src;large.alt=img.alt;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();});
      });
    }
  }
})();
