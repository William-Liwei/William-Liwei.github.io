// Shared by the compact top controls and the full bottom pagination.
export function validPage(value,pages) {
  const page=Number(value);
  return Number.isSafeInteger(page)&&page>=1&&page<=pages?page:null;
}
export function paginationHTML(page,pages,compact=false) {
  if(pages<=1)return '';
  const previous=`<button type="button" data-step="previous" data-page="${page-1}"${page===1?' disabled':''} aria-label="上一页">${compact?'上一页':'‹'}</button>`;
  const next=`<button type="button" data-step="next" data-page="${page+1}"${page===pages?' disabled':''} aria-label="下一页">${compact?'下一页':'›'}</button>`;
  if(compact)return `${previous}<span class="page-counter" aria-hidden="true">${page} / ${pages}</span>${next}`;
  const shown=[...new Set([1,page-2,page-1,page,page+1,page+2,pages])].filter(value=>value>=1&&value<=pages).sort((a,b)=>a-b);
  return previous+shown.map((value,index)=>(index&&value-shown[index-1]>1?'<span class="gap">…</span>':'')+`<button type="button" data-page="${value}"${value===page?' aria-current="page"':''}>${value}</button>`).join('')+next;
}
