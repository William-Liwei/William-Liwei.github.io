import {formatInZone,parseTimezone,pickDeadline,nextConferenceDeadline} from './lib.js';

const BEIJING={zone:'Asia/Shanghai'};
const fields={AI:'人工智能',CG:'计算机图形学与多媒体',CT:'计算机科学理论',DB:'数据库/数据挖掘/内容检索',DS:'计算机体系结构/并行与分布计算/存储系统',HI:'人机交互与普适计算',MX:'交叉/综合/新兴',NW:'计算机网络',SC:'网络与信息安全',SE:'软件工程/系统软件/程序设计语言'};
const date=(time,zone)=>Number.isFinite(time)&&Number.isFinite(new Date(time).getTime())?formatInZone(time,zone):'';
const yes=value=>value?'是':'';
function cell(value){
  let text=value==null?'':String(value);
  // CSV is opened in spreadsheet applications; source text stays inert.
  if(/^[\s\uFEFF]*[=+@-]/u.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function buildResultsCSV(tab,rows,{versions={},conferenceIndex,now=Date.now(),timezone='bj'}={}){
  let headers,values;
  const jcr=versions.jcrVersion||'',cas=versions.casVersion||'',xr=versions.xrVersion||'';
  if(tab==='conf'){
    headers=['会议简称','会议全称','年份','CCF 等级','领域','会议时间','地点','全文截稿','摘要截稿','显示时区','会议原时区','录用率','录用率年份','各轮时间','官网'];
    values=rows.map(row=>{
      const d=pickDeadline(row.timeline,now),zone=timezone==='orig'?parseTimezone(row.timezone):timezone==='local'?null:BEIJING;
      const zoneName=timezone==='orig'?row.timezone:timezone==='local'?Intl.DateTimeFormat().resolvedOptions().timeZone:'Asia/Shanghai';
      const rounds=(row.timeline||[]).map((round,i)=>`第 ${i+1} 轮：摘要 ${date(round.abstract,zone)||'未提供'}；全文 ${date(round.deadline,zone)||'待公布'}${round.comment?' · '+round.comment:''}`).join('\n');
      return [row.title,row.description,row.year,row.rank==='N'?'非 CCF':row.rank,fields[row.sub]||row.sub,row.date,row.place,date(d?.deadline,zone),date(d?.abstract,zone),zoneName,row.timezone,
        Number.isFinite(row.acceptance?.rate)?(row.acceptance.rate*100).toFixed(1)+'%':'',row.acceptance?.year,rounds,row.link];
    });
  }else if(tab==='ccf'){
    headers=['简称','全称','CCF 等级','类型','领域','出版社',`影响因子（JCR ${jcr}）`,`JCR 最佳分区（${jcr}）`,`中科院分区（${cas}）`,'中科院 Top',`新锐分区（${xr}）`,'新锐 Top','新锐预警','下次全文截稿（北京时间）','会议年份','链接'];
    values=rows.map(row=>{
      const next=row.type==='会议'?nextConferenceDeadline(conferenceIndex,row,now):null;
      return [row.name,row.full,row.level,row.type,row.category,row.publisher,row.jif,row.quartile,row.cas,yes(row.casTop),row.xr,yes(row.xrTop),yes(row.xrWarn),date(next?.deadline,BEIJING),next?.year,row.url];
    });
  }else if(tab==='jcr'){
    headers=['期刊','ISSN','eISSN','JCR 学科',`影响因子（JCR ${jcr}）`,`JCR 最佳分区（${jcr}）`,'最佳分区对应学科排名',`中科院分区（${cas}）`,'中科院 Top',`新锐分区（${xr}）`,'新锐 Top','新锐预警','CCF 等级'];
    values=rows.map(row=>[row.name,row.issn,row.eissn,(row.categories||[]).join('；'),row.jif,row.quartile,row.rank,row.cas,yes(row.casTop),row.xr,yes(row.xrTop),yes(row.xrWarn),row.ccf]);
  }else throw new Error('未知的结果类型');
  return {text:'\uFEFF'+[headers,...values].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n',count:rows.length};
}
