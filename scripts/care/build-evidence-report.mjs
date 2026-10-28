import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const read=async path=>{try{return JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}};
const outputIndex=process.argv.indexOf('--output'),out=outputIndex>=0?process.argv[outputIndex+1]:'public';
if(!out)throw new Error('--output 后需要目录');
const files={api:'care-p0-api.json',ha:'care-p0-ha.json',bridge:'care-p0-bridge.json',browser:'care-p0-browser.json',policy:'care-policy-replay.json'};
const software={};for(const [key,name] of Object.entries(files))software[key]=await read('public/evidence/'+name);
const inputIndex=process.argv.indexOf('--input');let observations=[],inputSha256=null;
if(inputIndex>=0){const source=process.argv[inputIndex+1];if(!source)throw new Error('--input 后需要匿名 JSONL 文件');const raw=await readFile(source,'utf8');inputSha256=createHash('sha256').update(raw).digest('hex');observations=raw.split(/\r?\n/).filter(s=>s.trim()).map((line,i)=>{try{return JSON.parse(line)}catch{throw new Error('第'+(i+1)+'行不是有效 JSON')}})}
const unique=new Map();
const booleanMetrics=new Set(['correctClosure','ruleViolationTrigger','unnecessaryInterruption']);
function effectiveDays(records){
 const groups=new Map();
 for(const r of records.filter(r=>['usage_day','usage_interval'].includes(r.eventKind))){
  const start=Date.parse(r.exposureStartAt),end=Date.parse(r.exposureEndAt);
  assert.ok(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end-start<=31*86400000,'有效暴露需要原始起止时间');
  const intervals=groups.get(r.householdId)??[];intervals.push([start,end]);groups.set(r.householdId,intervals);
 }
 let total=0;
 for(const intervals of groups.values()){
  intervals.sort((a,b)=>a[0]-b[0]);let begin,end;
  for(const [a,b] of intervals){if(begin===undefined){begin=a;end=b}else if(a<=end)end=Math.max(end,b);else{total+=end-begin;begin=a;end=b}}
  if(begin!==undefined)total+=end-begin;
 }
 return Math.round(total/86400000*1000)/1000;
}
for(const row of observations){
 for(const key of ['recordId','datasetId','sourceRecordId','sampleId','householdId','eventKind'])assert.ok(typeof row[key]==='string'&&row[key]&&!row[key].includes('REPLACE'),'缺少有效 '+key);
 assert.ok(['synthetic','bench','reenactment','field'].includes(row.category),'无效来源类别');assert.ok(['live','replay'].includes(row.transport),'无效传输方式');assert.ok(Number.isFinite(Date.parse(row.occurredAt)),'无效观测时间');
 for(const [name,value] of Object.entries(row.metrics??{})){if(value===null||value===undefined)continue;if(booleanMetrics.has(name))assert.equal(typeof value,'boolean','无效布尔指标 '+name);else assert.ok(typeof value==='number'&&Number.isFinite(value)&&value>=0,'无效指标 '+name);}
 const key=row.datasetId+'/'+row.sourceRecordId;
 if(unique.has(key)){const prior=unique.get(key);assert.equal(prior.category,row.category,'同一原始记录不能更换来源类别');continue;}
 unique.set(key,row);
}
const rows=[...unique.values()],categories={};
for(const category of ['synthetic','bench','reenactment','field']){const selected=rows.filter(r=>r.category===category);categories[category]={records:selected.length,samples:new Set(selected.map(r=>r.datasetId+'/'+r.sampleId)).size,households:new Set(selected.filter(r=>['reenactment','field'].includes(r.category)).map(r=>r.householdId)).size,householdDays:effectiveDays(selected)};}
const median=values=>values.length?values.sort((a,b)=>a-b).length%2?values[Math.floor(values.length/2)]:(values[values.length/2-1]+values[values.length/2])/2:null;
const coordination={};for(const method of ['baseline','jiayoubei']){const sessions=rows.filter(r=>r.category==='reenactment'&&r.eventKind==='session'&&r.method===method);coordination[method]={sessions:sessions.length,activeCoordinationSeconds:median(sessions.map(r=>r.metrics?.activeCoordinationSeconds).filter(Number.isFinite)),totalElapsedSeconds:median(sessions.map(r=>r.metrics?.totalElapsedSeconds).filter(Number.isFinite))};}
const labeled=rows.filter(r=>r.category==='field'&&r.label?.needsVerification===true&&typeof r.label.reviewedBy==='string'&&r.label.reviewedBy.trim()&&typeof r.label.systemFlagged==='boolean');
const report={generatedAt:new Date().toISOString(),software,collection:{categories,sourceFileSha256:inputSha256,sourceDatasetIds:[...new Set(rows.map(r=>r.datasetId))],distinctSourceRecords:rows.length,duplicateImports:observations.length-rows.length,coordination,recall:labeled.length?{numerator:labeled.filter(r=>r.label.systemFlagged).length,denominator:labeled.length,scope:'仅本次自然记录中经独立复核的事件'}:{value:null,status:'不可估计',reason:'尚无自然发生且独立复核的正例分母'}},claims:{hardware:categories.bench.samples?'已导入声明为台架的原始记录，需核验出处':'待实物验证',households:categories.field.households?'已导入匿名自然试用记录':'未开展',personalization:'B2待数据充分后时间留出验证',causalEffect:'冻结回放不能证明主动确认的因果效果'}};
await mkdir(out+'/care-evidence',{recursive:true});await mkdir(out+'/evidence',{recursive:true});await writeFile(out+'/evidence/care-p0-summary.json',JSON.stringify(report,null,2));
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const proofRows=Object.entries(software).map(([key,value])=>({key,label:{api:'认证与持久化接口',ha:'本机假HA接口契约',bridge:'HA采集桥接与断线重送',browser:'两账号浏览器操作',policy:'冻结构造输入的策略对照'}[key],count:value?(value.checks??value.results).length:null,passed:value?(value.checks??value.results).filter(x=>x.passed).length:null}));
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>家有备 · 关怀确认运行证据</title><style>body{margin:0;background:#f8fafc;color:#122031;font:16px/1.8 "Microsoft YaHei",system-ui}main{max-width:1050px;margin:0 auto;padding:70px 25px}h1{font-size:48px;line-height:1.3;letter-spacing:-1px}h2{font-size:27px;margin-top:55px}p{color:#64768c}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:16px 12px;border-bottom:1px solid #e4ebf3}th{color:#64768c;font-weight:500}button{font:inherit;background:#2675ed;color:white;border:0;border-radius:12px;padding:13px 22px;cursor:pointer}aside{border-left:3px solid #d7e5f8;padding-left:20px;color:#64768c}a{color:#2675ed}pre{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}details{margin-top:22px}@media(max-width:600px){h1{font-size:33px}td,th{padding:12px 5px;font-size:13px}main{padding-top:30px}}</style><main><p>家有备 / 关怀确认</p><h1>每项结论，都能回到记录。</h1><p>软件构造输入、硬件台架、角色演练和自然使用分别呈现。生成于 ${escape(report.generatedAt)}。</p><h2>本次实际运行的软件证据</h2><table><thead><tr><th>范围</th><th>已检查</th><th>通过</th><th>来源</th></tr></thead><tbody>${proofRows.map(r=>`<tr><td>${r.label}</td><td>${r.count??'未运行'}</td><td>${r.passed??'待运行'}</td><td>synthetic</td></tr>`).join('')}</tbody></table><aside>接口检查实际执行认证、D1 写入与受控服务重建。HA 契约使用本机假服务；没有把接口测试计为物理台架。</aside><h2>真实采集进度</h2><table><thead><tr><th>类别</th><th>去重记录组</th><th>家庭</th><th>有效家庭日</th></tr></thead><tbody>${['bench','reenactment','field'].map(k=>`<tr><td>${k}</td><td>${categories[k].samples||'待采集'}</td><td>${categories[k].households||'未开展'}</td><td>${categories[k].householdDays||'待采集'}</td></tr>`).join('')}</tbody></table><p>同一原始记录的重复导入/回放不增加记录组。有效家庭日按有效观测区间合并后计算，与独立家庭分开统计。</p><h2>家庭协作对照</h2><table><thead><tr><th>方式</th><th>演练记录</th><th>主动协调时间中位数</th><th>总经过时间中位数</th></tr></thead><tbody>${Object.entries(coordination).map(([k,v])=>`<tr><td>${k==='baseline'?'电话/家庭群＋联系人约定':'家有备'}</td><td>${v.sessions||'未开展'}</td><td>${v.activeCoordinationSeconds===null?'待采集':v.activeCoordinationSeconds+' 秒'}</td><td>${v.totalElapsedSeconds===null?'待采集':v.totalElapsedSeconds+' 秒'}</td></tr>`).join('')}</tbody></table><p>自然事件召回率：${labeled.length?report.collection.recall.numerator+' / '+labeled.length:'不可估计；缺少独立复核的自然正例分母'}。</p><h2>可核对的原始结果</h2><button id="download">导出本报告 JSON</button>${proofRows.map(r=>`<details><summary>${r.label}原始记录</summary><pre>${escape(JSON.stringify(software[r.key],null,2))}</pre></details>`).join('')}<p>采集操作包位于 docs/care-p0/，模板位于 examples/care/。</p></main><script id="data" type="application/json">${JSON.stringify(report).replaceAll('<','\\u003c')}</script><script>document.getElementById('download').onclick=()=>{const value=JSON.parse(document.getElementById('data').textContent),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='家有备-关怀证据报告.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}</script></html>`;
await writeFile(out+'/care-evidence/index.html',html);
console.log(JSON.stringify({software:proofRows,collection:report.collection.categories,report:'public/care-evidence/index.html'}));
