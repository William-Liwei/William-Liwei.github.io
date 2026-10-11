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
})();
