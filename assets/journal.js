(function () {
  var list=document.getElementById('blog-results'), tools=document.querySelector('.blog-tools');
  function element(tag,cls,value) { var el=document.createElement(tag); if(cls) el.className=cls; if(value) el.textContent=value; return el; }
  if(list && tools) {
    var input=document.getElementById('blog-search'), status=document.querySelector('.search-status');
    var feedback=document.querySelector('.search-feedback'), retry=document.getElementById('retry-search');
    var pagination=document.querySelector('.journal-pagination'), featured=document.querySelector('.featured-posts');
    var original=list.innerHTML, showingOriginal=true, topic='全部', posts=[], state='idle', searchTimer;
    var filters=Array.from(tools.querySelectorAll('[data-topic]'));
    var topics=filters.map(function(btn){return btn.dataset.topic;});
    tools.hidden=false;
    function readLocation() {
      var params=new URLSearchParams(location.search);
      input.value=params.get('q')||'';
      topic=topics.includes(params.get('topic'))?params.get('topic'):'全部';
    }
    function writeLocation() {
      var url=new URL(location.href), query=input.value.trim();
      if(query) url.searchParams.set('q',query); else url.searchParams.delete('q');
      if(topic!=='全部') url.searchParams.set('topic',topic); else url.searchParams.delete('topic');
      if(url.href!==location.href) history.replaceState(history.state,'',url);
    }
    function message(value,canRetry) {
      feedback.hidden=!value; status.textContent=value; retry.hidden=!canRetry;
    }
    function restoreArticles() {
      if(!showingOriginal) { list.innerHTML=original; showingOriginal=true; }
      if(pagination) pagination.hidden=false;
      if(featured) featured.hidden=false;
    }
    function highlighted(target,value,tokens) {
      value=String(value||'');
      var escaped=tokens.filter(Boolean).slice(0,24).sort(function(a,b){return b.length-a.length;}).map(function(token){return token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');});
      if(!escaped.length) { target.textContent=value; return; }
      var expression=new RegExp(escaped.join('|'),'gi'), match, cursor=0;
      while((match=expression.exec(value))!==null) {
        target.append(document.createTextNode(value.slice(cursor,match.index)),element('mark','',match[0]));
        cursor=match.index+match[0].length;
      }
      target.append(document.createTextNode(value.slice(cursor)));
    }
    function clearSearch() {
      clearTimeout(searchTimer); input.value=''; topic='全部'; render(true); input.focus();
    }
    function render(updateLocation) {
      var query=input.value.trim();
      filters.forEach(function(btn){btn.setAttribute('aria-pressed',String(btn.dataset.topic===topic));});
      if(updateLocation) writeLocation();
      if(!query && topic==='全部') { restoreArticles(); message('',false); return; }
      if(state==='idle') { loadSearch(); return; }
      if(state!=='ready') {
        restoreArticles();
        message(state==='loading'?'正在准备搜索，文章列表仍可浏览。':'搜索暂不可用，下面仍为原文章列表。请重试加载。',state==='failed');
        return;
      }
      if(pagination) pagination.hidden=true;
      if(featured) featured.hidden=true;
      var matches=window.JournalSearch.search(posts.filter(function(p){return topic==='全部'||p.topic===topic;}),query);
      var tokens=window.JournalSearch.tokenize(query);
      var fragment=document.createDocumentFragment();
      message(matches.length?'找到 '+matches.length+' 篇文章'+(query?' · 按相关度排序':''):'没有找到匹配的文章。',false);
      matches.forEach(function(result) {
        var p=result.post, article=element('article','journal-item'), meta=element('div','post-meta'), time=element('time','',p.date);
        time.dateTime=p.date.replaceAll('.','-'); meta.append(time,element('span','',p.topic));
        if(p.pinned) meta.append(element('span','tag tag-strong','置顶'));
        var h=element('h2'), a=element('a'); a.href=p.path; highlighted(a,p.title,tokens); h.append(a); article.append(meta,h);
        if(p.summary) { var summary=element('p','post-summary'); highlighted(summary,p.summary,tokens); article.append(summary); }
        if(result.bodyMatch && result.excerpt) {
          var snippet=element('p','search-snippet'), excerpt=element('span');
          highlighted(excerpt,result.excerpt,tokens); snippet.append(element('span','search-snippet-label','正文匹配'),excerpt); article.append(snippet);
        }
        var tags=element('div','post-tags');
        p.tags.forEach(function(t){var link=element('a','tag');link.href=t.path;highlighted(link,t.name,tokens);tags.append(link);});
        article.append(tags); fragment.append(article);
      });
      if(!matches.length) {
        var empty=element('div','search-empty'), reset=element('button','','清除筛选，查看全部文章');
        reset.type='button'; reset.id='reset-empty-search'; reset.addEventListener('click',clearSearch);
        empty.append(element('p','','试试更短的关键词，或切换文章主题。'),reset); fragment.append(empty);
      }
      list.replaceChildren(fragment); showingOriginal=false;
    }
    function loadSearch() {
      if(state==='loading' || state==='ready') return;
      state='loading'; render(false);
      var controller=new AbortController(), timeout=setTimeout(function(){controller.abort();},8000);
      fetch('/blog/search.json',{signal:controller.signal}).then(function(r){if(!r.ok) throw Error(r.status); return r.json();}).then(function(data) {
        if(!window.JournalSearch || !Array.isArray(data) || !data.every(function(p){return p && typeof p.title==='string' && typeof p.path==='string' && typeof p.date==='string' && Array.isArray(p.tags);})) throw Error('search index');
        posts=data; state='ready'; render(false);
      }).catch(function(){state='failed';render(false);}).finally(function(){clearTimeout(timeout);});
    }
    input.addEventListener('focus',function(){if(state==='idle') loadSearch();});
    input.addEventListener('input',function(event){clearTimeout(searchTimer);if(!event.isComposing) searchTimer=setTimeout(function(){render(true);},100);});
    input.addEventListener('compositionend',function(){clearTimeout(searchTimer);searchTimer=setTimeout(function(){render(true);},100);});
    input.addEventListener('keydown',function(event){
      if(event.isComposing) return;
      if(event.key==='Enter') { clearTimeout(searchTimer); render(true); }
      if(event.key==='Escape' && input.value) { event.preventDefault(); clearSearch(); }
    });
    filters.forEach(function(btn){btn.addEventListener('click',function(){clearTimeout(searchTimer);topic=btn.dataset.topic;render(true);});});
    document.getElementById('clear-search').addEventListener('click',clearSearch);
    function saveBeforeNavigation(event) {
      if(event.target.closest('a[href]')) writeLocation();
    }
    list.addEventListener('click',saveBeforeNavigation);
    list.addEventListener('auxclick',saveBeforeNavigation);
    if(featured) {
      featured.addEventListener('click',saveBeforeNavigation);
      featured.addEventListener('auxclick',saveBeforeNavigation);
    }
    retry.addEventListener('click',function(){if(window.JournalSearch) loadSearch();else location.reload();});
    window.addEventListener('popstate',function(){clearTimeout(searchTimer);readLocation();render(false);});
    window.addEventListener('pageshow',function(event){if(event.persisted){clearTimeout(searchTimer);readLocation();render(false);}});
    readLocation(); render(false);
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
