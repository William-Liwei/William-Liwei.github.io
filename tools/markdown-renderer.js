(function(root,factory){
  'use strict';
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.ToolboxMarkdown=factory();
})(typeof window==='object'?window:this,function(){
  'use strict';
  function escape(value){return String(value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});}
  function escapedAt(source,index){
    var count=0;while(index>0 && source[--index]==='\\') count++;
    return count%2===1;
  }
  function delimited(source,open,close,single){
    if(!source.startsWith(open) || (single && source.startsWith('$$'))) return;
    var end=open.length;
    while((end=source.indexOf(close,end))!==-1){
      if(escapedAt(source,end) || (single && (source[end+1]==='$' || /\d/.test(source[end+1]||'')))){end+=close.length;continue;}
      var text=source.slice(open.length,end);
      if(!text.trim() || (single && (/^\s|\s$/.test(text) || text.includes('\n')))) return;
      return {raw:source.slice(0,end+close.length),text:text,display:!single && open!=='\\('};
    }
  }
  function readInline(source){
    return delimited(source,'$$','$$',false) || delimited(source,'\\(','\\)',false) || delimited(source,'\\[','\\]',false) || delimited(source,'$','$',true);
  }
  function readBlock(source){
    var leading=/^ {0,3}/.exec(source)[0], remaining=source.slice(leading.length);
    var token=delimited(remaining,'$$','$$',false) || delimited(remaining,'\\[','\\]',false);
    if(!token) return;
    var ending=/^[ \t]*(?:\n|$)/.exec(remaining.slice(token.raw.length));
    if(!ending) return;
    token.raw=leading+token.raw+ending[0];return token;
  }
  function renderMarkdown(input,dependencies,options){
    if(input.length>50000) throw new RangeError('文本超过 50,000 字符，请分段处理。');
    var settings=options||{}, math=[], errors=0;
    function placeholder(token){
      var index=math.push(token)-1;
      return '<span data-toolbox-math="'+index+'"></span>';
    }
    var renderer={
      html:function(token){return escape(token.text);},
      image:function(token){
        var raster=/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(token.href), remote=/^https?:\/\//i.test(token.href);
        if(raster || (settings.images && remote)) return '<img src="'+escape(token.href)+'" alt="'+escape(token.text)+'" referrerpolicy="no-referrer">';
        return '<span class="image-placeholder">图片：'+escape(token.text||'未命名图片')+'（'+(remote?'未加载网络图片':'请使用完整图片网址或内嵌图片')+'）</span>';
      },
      link:function(token){return '<a href="'+escape(token.href)+'" target="_blank" rel="noopener noreferrer">'+this.parser.parseInline(token.tokens)+'</a>';}
    };
    var parser=new dependencies.marked.Marked({gfm:true,breaks:false,renderer:renderer,extensions:[
      {name:'toolboxBlockMath',level:'block',start:function(source){var match=/(?:^|\n) {0,3}(?:\$\$|\\\[)/.exec(source);return match?match.index:undefined;},tokenizer:function(source){var token=readBlock(source);if(token)return Object.assign({type:'toolboxBlockMath'},token);},renderer:placeholder},
      {name:'toolboxInlineMath',level:'inline',start:function(source){return source.search(/\$|\\(?:\(|\[)/);},tokenizer:function(source){var token=readInline(source);if(token)return Object.assign({type:'toolboxInlineMath'},token);},renderer:placeholder}
    ]});
    var parsed=parser.parse(input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'));
    var html=dependencies.purify.sanitize(parsed,{
      ALLOWED_TAGS:['p','br','em','strong','del','a','img','table','thead','tbody','tfoot','tr','th','td','pre','code','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','span','input'],
      ALLOWED_ATTR:['href','title','src','alt','class','type','checked','disabled','start','align','colspan','rowspan','target','rel','referrerpolicy','data-toolbox-math'],
      RETURN_TRUSTED_TYPE:false
    });
    var macros={};
    // Insert only KaTeX's own trusted output after sanitizing the Markdown HTML.
    // User HTML remains escaped; trust:false forbids TeX URLs, images and HTML commands.
    html=html.replace(/<span data-toolbox-math="(\d+)"><\/span>/g,function(match,index){
      var token=math[Number(index)];if(!token)return '';
      if(!dependencies.katex)return '<code class="math-source">'+escape(token.raw.trim())+'</code>';
      try {
        if(Number(index)>=200 || token.text.length>4000) throw new RangeError('公式过长或数量过多');
        var result=dependencies.katex.renderToString(token.text,{displayMode:token.display,output:'htmlAndMathml',throwOnError:true,trust:false,strict:'ignore',maxSize:20,maxExpand:500,macros:macros});
        return token.display?'<span class="math-block">'+result+'</span>':result;
      }catch(error){errors++;return '<code class="math-error" title="'+escape(error.message)+'">'+escape(token.raw.trim())+'</code>';}
    });
    return {html:html,mathCount:math.length,mathErrors:errors,needsMath:math.length>0 && !dependencies.katex};
  }
  return {renderMarkdown:renderMarkdown};
});
