(function(){
  'use strict';
  var input=document.getElementById('site-query');if(!input)return;
  var params=new URLSearchParams(location.search),lang=params.get('lang');
  if(!['en','zh'].includes(lang)){try{lang=localStorage.getItem('wl-language');}catch{}lang=lang==='en'?'en':'zh';}
  var en=lang==='en',kind=params.get('kind')||'all',limit=20,entries,pending,timer,version=0;
  var kinds=['all','paper','post','page'];if(!kinds.includes(kind))kind='all';
  var words=en?{all:'All',paper:'Papers',post:'Articles',page:'Pages & tools',search:'Search',loading:'Loading search…',error:'Search could not load. Please retry.',empty:'No results. Try another keyword.',initial:'Enter a keyword to find papers, articles and tools.',more:'Show more',retry:'Retry'}:{all:'全部',paper:'论文',post:'文章',page:'页面与工具',search:'搜索',loading:'正在准备搜索…',error:'搜索暂时未能加载，请重试。',empty:'没有找到匹配内容，试试其他关键词。',initial:'输入关键词，查找论文、文章或工具。',more:'显示更多',retry:'重试加载'};
  var results=document.getElementById('site-results'),status=document.getElementById('site-search-status'),more=document.getElementById('site-search-more'),retry=document.getElementById('site-search-retry');
  document.getElementById('search-lang').value=lang;
  if(en){document.documentElement.lang='en';document.getElementById('search-title').firstChild.textContent='Search';document.getElementById('search-intro').textContent='Find papers, articles and everyday tools.';document.getElementById('search-label').textContent='Search this site';input.placeholder='Try UniFlow, Markdown, forecasting…';}
  document.getElementById('site-search-submit').textContent=words.search;more.textContent=words.more;retry.textContent=words.retry;
  var buttons=Array.from(document.querySelectorAll('[data-kind]'));
  buttons.forEach(function(button){button.textContent=words[button.dataset.kind];});
  function safePath(value){return typeof value==='string'&&/^\/(?!\/)/.test(value)&&!/[\\\u0000-\u0020]/.test(value);}
  function load(){
    if(entries)return Promise.resolve(entries);
    if(!pending){var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},12000);
      pending=fetch('/search/index.json',{signal:controller.signal,credentials:'same-origin'}).then(function(response){if(!response.ok)throw Error('load');return response.json();}).then(function(data){
        if(data.version!==1||!Array.isArray(data.entries))throw Error('format');
        entries=data.entries.filter(function(item){return item&&typeof item.title==='string'&&safePath(item.path)&&['paper','post','page'].includes(item.kind);});return entries;
      }).catch(function(error){pending=null;throw error;}).finally(function(){clearTimeout(timeout);});
    }return pending;
  }
  function url(){var next=new URL(location.href);next.searchParams.set('lang',lang);var q=input.value.trim();if(q)next.searchParams.set('q',q);else next.searchParams.delete('q');if(kind!=='all')next.searchParams.set('kind',kind);else next.searchParams.delete('kind');history.replaceState(null,'',next.href);}
  async function render(){
    var revision=++version,q=input.value.trim();buttons.forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.kind===kind));});
    more.hidden=true;retry.hidden=true;results.replaceChildren();
    if(!q){status.textContent=words.initial;return;}
    status.textContent=words.loading;
    try{
      var data=await load();if(revision!==version)return;
      var matches=window.JournalSearch.search(data,q).filter(function(result){return kind==='all'||result.post.kind===kind;});
      status.textContent=matches.length?(en?matches.length+' results': '找到 '+matches.length+' 项结果'):words.empty;
      matches.slice(0,limit).forEach(function(result){
        var item=result.post,article=document.createElement('article'),tag=document.createElement('p'),heading=document.createElement('h2'),link=document.createElement('a'),excerpt=document.createElement('p');
        article.className='site-search-result';tag.className='site-search-kind';tag.textContent=words[item.kind];
        link.href=!en&&safePath(item.zhPath)?item.zhPath:item.path;link.textContent=item.title;heading.append(link);
        excerpt.textContent=result.excerpt||item.summary||'';article.append(tag,heading,excerpt);results.append(article);
      });more.hidden=matches.length<=limit;
    }catch(error){if(revision!==version)return;status.textContent=words.error;retry.hidden=false;}
  }
  input.value=(params.get('q')||'').slice(0,200);
  function changed(event){version++;limit=20;clearTimeout(timer);if(event&&event.isComposing)return;url();timer=setTimeout(render,180);}
  input.addEventListener('input',changed);input.addEventListener('compositionend',changed);
  document.getElementById('site-search-form').addEventListener('submit',function(event){event.preventDefault();limit=20;clearTimeout(timer);url();render();});
  buttons.forEach(function(button){button.addEventListener('click',function(){kind=button.dataset.kind;limit=20;url();render();});});
  more.addEventListener('click',function(){limit+=20;render();});retry.addEventListener('click',render);
  window.addEventListener('popstate',function(){var query=new URLSearchParams(location.search);input.value=(query.get('q')||'').slice(0,200);kind=kinds.includes(query.get('kind'))?query.get('kind'):'all';limit=20;clearTimeout(timer);render();});
  render();
})();
