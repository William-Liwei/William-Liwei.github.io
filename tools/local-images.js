(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.ToolboxImages=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var MAX_IMAGES=20,MAX_BYTES=5*1024*1024,MAX_TOTAL=20*1024*1024;
  function imageFile(file){return /\.(png|jpe?g|gif|webp|avif)$/i.test(file&&file.name||'');}
  function cleanPath(value){
    var parts=[];
    String(value||'').replace(/\\/g,'/').split('/').forEach(function(part){
      if(!part||part==='.')return;
      if(part==='..'){parts.pop();return;}
      parts.push(part.normalize('NFC'));
    });
    return parts.join('/');
  }
  function type(bytes){
    var ascii=function(start,end){return String.fromCharCode.apply(null,bytes.slice(start,end));};
    if(bytes.length>=24&&bytes[0]===137&&ascii(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
    if(/^GIF8[79]a$/.test(ascii(0,6)))return 'image/gif';
    if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
    if(ascii(4,8)==='ftyp'&&/avif|avis/.test(ascii(8,32)))return 'image/avif';
    throw new Error('图片内容无法识别，请使用 PNG、JPEG、WebP、GIF 或 AVIF 文件。');
  }
  function validate(images){
    if(images.length>MAX_IMAGES)throw new RangeError('每份文档最多添加 20 张本地图片。');
    if(images.reduce(function(sum,image){return sum+image.size;},0)>MAX_TOTAL)throw new RangeError('本地图片合计不能超过 20 MB。');
    var paths=new Set();
    images.forEach(function(image){if(paths.has(image.path))throw new Error('存在同名图片：'+image.path+'；请先区分文件名。');paths.add(image.path);});
    return images;
  }
  async function readImages(files){
    var list=Array.from(files||[]);
    validate(list.map(function(file){
      if(!imageFile(file))throw new Error('请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片。');
      if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_BYTES)throw new RangeError('每张图片需小于或等于 5 MB，且不能为空。');
      return {path:cleanPath(file.webkitRelativePath||file.name),size:file.size};
    }));
    return Promise.all(list.map(async function(file){
      var bytes=new Uint8Array(await file.arrayBuffer());
      if(bytes.length!==file.size||bytes.length>MAX_BYTES)throw new Error('图片读取不完整，请重新选择。');
      var mime=type(bytes),binary='';
      for(var offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode.apply(null,bytes.subarray(offset,offset+32768));
      return {name:file.name,path:cleanPath(file.webkitRelativePath||file.name),size:bytes.length,data:'data:'+mime+';base64,'+btoa(binary)};
    }));
  }
  function merge(previous,next){
    var incoming=new Map(next.map(function(image){return [image.path,image];}));
    return validate(previous.filter(function(image){return !incoming.has(image.path);}).concat(next));
  }
  function resolver(images,documentPath){
    var directory=cleanPath(documentPath).split('/').slice(0,-1).join('/');
    return function(href){
      if(!href||/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(href))return '';
      var path=href.split(/[?#]/)[0];
      try{path=decodeURIComponent(path);}catch{return '';}
      var relative=cleanPath(path.startsWith('/')?path:directory+'/'+path);
      path=cleanPath(path);
      var exact=images.find(function(image){return image.path===relative;})||images.find(function(image){return image.path===path;});
      if(exact)return exact.data;
      var name=path.split('/').pop(),matches=images.filter(function(image){return image.path.split('/').pop()===name;});
      return matches.length===1?matches[0].data:'';
    };
  }
  return {imageFile:imageFile,readImages:readImages,merge:merge,resolver:resolver,MAX_IMAGES:MAX_IMAGES,MAX_BYTES:MAX_BYTES,MAX_TOTAL:MAX_TOTAL};
});
