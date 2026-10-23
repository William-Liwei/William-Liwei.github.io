(function (root, factory) {
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.ToolboxDrafts=api;api.mount(root,root.document);}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var KEY='wl-toolbox-draft-v1',ENABLED='wl-toolbox-drafts-enabled-v1',TTL=7*86400000;
  function validate(value,now) {
    if(!value||value.version!==1||!Number.isFinite(value.savedAt)||value.savedAt>now||now-value.savedAt>TTL)return null;
    var data=value.data;
    if(!data||typeof data.clean!=='string'||data.clean.length>100000||!Array.isArray(data.options)||data.options.length!==4||data.options.some(function(v){return typeof v!=='boolean';}))return null;
    if(typeof data.before!=='string'||data.before.length>100000||typeof data.after!=='string'||data.after.length>100000)return null;
    if(!data.markdown||typeof data.markdown.text!=='string'||data.markdown.text.length>50000||typeof data.markdown.fileName!=='string'||data.markdown.fileName.length>300)return null;
    return {clean:data.clean,options:data.options.slice(),before:data.before,after:data.after,markdown:{text:data.markdown.text,fileName:data.markdown.fileName}};
  }
  function createStore(storage,now) {
    now=now||Date.now;
    return {
      enabled:function(){return storage.getItem(ENABLED)==='1';},
      enable:function(){storage.setItem(ENABLED,'1');},
      read:function(){
        var raw=storage.getItem(KEY);if(!raw)return null;
        var entry;try{if(raw.length>1100000)throw Error('oversized');entry=JSON.parse(raw);}catch(error){storage.removeItem(KEY);return null;}
        var data=validate(entry,now());if(!data){storage.removeItem(KEY);return null;}
        return {data:data,savedAt:entry.savedAt};
      },
      save:function(data){
        var entry={version:1,savedAt:now(),data:data};
        if(!validate(entry,entry.savedAt))throw Error('invalid draft');
        storage.setItem(KEY,JSON.stringify(entry));
      },
      clear:function(){storage.removeItem(ENABLED);storage.removeItem(KEY);}
    };
  }
  function mount(win,doc) {
    var toggle=doc.getElementById('keep-toolbox-draft');if(!toggle)return;
    var restore=doc.getElementById('restore-toolbox-draft'),clear=doc.getElementById('clear-toolbox-draft'),message=doc.getElementById('draft-status');
    var pending=null,store,enabled=false,timer,lastSaved='';
    var optionIds=['merge-lines','trim-spaces','fix-ligatures','join-hyphens'];
    function get(id){return doc.getElementById(id);}
    function status(text,error){message.textContent=text;message.toggleAttribute('data-error',!!error);}
    function buttons(){restore.hidden=!pending;clear.hidden=!enabled&&!pending;toggle.checked=enabled;}
    function capture(){return {clean:get('clean-input').value,options:optionIds.map(function(id){return get(id).checked;}),before:get('before-text').value,after:get('after-text').value,markdown:win.ToolboxMarkdownEditor.capture()};}
    function content(data){return !!(data.clean||data.before||data.after||data.markdown.text);}
    function fail(){
      enabled=false;win.clearTimeout(timer);buttons();clear.hidden=false;
      status('本机保存失败，可能是存储已满或被禁用；请复制文本或下载 Markdown 保存。',true);
    }
    function save(){
      win.clearTimeout(timer);if(!enabled||pending)return;
      try{var data=capture(),serialized=JSON.stringify(data);if(serialized===lastSaved)return;store.save(data);lastSaved=serialized;status(content(data)?'已保存到本机；草稿保留 7 天。':'已保存空白状态，旧内容不会在刷新后恢复。');}
      catch(error){fail();}
    }
    function changed(){if(enabled&&!pending){win.clearTimeout(timer);timer=win.setTimeout(save,500);}}
    try {
      store=createStore(win.localStorage);enabled=store.enabled();
      // Ignore orphaned content if saving was never enabled or has been disabled.
      pending=enabled?store.read():null;
      status(pending?'发现本机草稿；点击恢复后继续保存。':enabled?'本机草稿已开启，编辑后自动保存到此浏览器，保留 7 天。':'默认关闭。开启后保存三个工具的输入，仅留在此浏览器，保留 7 天。');
    }catch(error){toggle.disabled=true;status('此浏览器无法使用本机草稿；仍可正常处理和导出文本。',true);}
    buttons();
    toggle.addEventListener('change',function(){
      win.clearTimeout(timer);
      if(!toggle.checked){try{store.clear();pending=null;enabled=false;lastSaved='';buttons();status('已关闭并清除本机草稿。');}catch(error){fail();}return;}
      try{store.enable();enabled=true;buttons();if(!pending)save();}catch(error){fail();}
    });
    clear.addEventListener('click',function(){
      win.clearTimeout(timer);
      try{store.clear();pending=null;enabled=false;lastSaved='';buttons();status('已关闭并清除本机草稿；当前输入仍保留。');}catch(error){fail();}
    });
    restore.addEventListener('click',function(){
      if(!pending)return;
      if(content(capture())){status('当前已有输入，请先保存或清空当前输入，再恢复旧草稿。',true);return;}
      var data=pending.data;
      optionIds.forEach(function(id,index){get(id).checked=data.options[index];});
      get('clean-input').value=data.clean;get('clean-input').dispatchEvent(new win.Event('input',{bubbles:true}));
      get('before-text').value=data.before;get('after-text').value=data.after;get('before-text').dispatchEvent(new win.Event('input',{bubbles:true}));
      win.ToolboxMarkdownEditor.restore(data.markdown);
      pending=null;buttons();save();status('已恢复三个工具的输入和 Markdown 文件名；整理及对比结果可重新生成。');
    });
    doc.addEventListener('toolbox:draft-change',changed);
    win.addEventListener('pagehide',save);
    doc.addEventListener('visibilitychange',function(){if(doc.hidden)save();});
    win.addEventListener('storage',function(event){
      if(event.key!==KEY&&event.key!==ENABLED&&event.key!==null)return;
      win.clearTimeout(timer);
      try{
        enabled=store.enabled();pending=enabled?store.read():null;buttons();
        status(pending?'检测到更新的本机草稿，当前自动保存已暂停；可先保存当前输入，再恢复。':'其他页面已关闭或清除草稿。');
      }catch(error){fail();}
    });
  }
  return {createStore:createStore,validate:validate,mount:mount,KEY:KEY,ENABLED:ENABLED};
});
