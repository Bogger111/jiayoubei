import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as b0 from '../../benchmarks/care/b0-care-agent.ts';
import {createCarePlan,createEvidenceCarePlan,demoCareSignals,legacyCareEvidence,approveCarePlan,resolveCarePlan} from '../../lib/care-agent.ts';
import {defaultCareAgreement} from '../../lib/care-evidence.ts';
const now=Date.parse('2026-10-28T05:00:00Z'),id='frozen-case';
const base=()=>legacyCareEvidence(demoCareSignals('unanswered',now),now,id);
const cases=[
 {id:'rest',name:'家庭午休约定',records:base().filter(e=>e.kind!=='reply'),agreement:{...defaultCareAgreement,restWindows:[{start:'12:00',end:'14:30'}]},expected:'rest',baseline:demoCareSignals('unanswered',now)},
 {id:'door',name:'门开过，不确认本人已外出',records:base().map(e=>e.kind==='door'?{...e,value:'open'}:e),expected:'verify',baseline:demoCareSignals('away',now)},
 {id:'help-offline',name:'活动设备离线，明确求助仍优先响应',records:[...base().map(e=>e.kind==='availability'?{...e,value:'offline'}:e),{...base()[0],id:'fresh-help',sourceId:'help-button',kind:'help',value:'requested',observedAt:now,expiresAt:now+60000}],expected:'priority_response',baseline:{...demoCareSignals('offline',now),voice:'help'}},
 {id:'stale-confirmation',name:'过期确认不能结束当前判断',records:[...base(),{...base()[0],id:'old-safe',sourceId:'old-reply',kind:'reply',value:'safe_confirmed',provenance:'confirmation',observedAt:now-7200000,expiresAt:now-60000}],expected:'verify',baseline:{...demoCareSignals('safe',now),observedAt:now-7200000}},
 {id:'mixed-source',name:'门磁离线不抹去活动设备的新鲜信息',records:[...base(),{...base()[1],id:'door-offline',sourceId:'door-device',value:'offline'}],expected:'verify',baseline:demoCareSignals('offline',now)},
];
const results=[];
for(const item of cases){const plan=createEvidenceCarePlan(item.records,item.agreement??defaultCareAgreement,now,id);assert.equal(plan.assessment.disposition,item.expected,item.id);const before=b0.createCarePlan(item.baseline,now);results.push({id:item.id,name:item.name,category:'synthetic',transport:'replay',datasetId:'frozen-care-policy-v1',sampleId:item.id,expected:item.expected,baseline:{status:before.status,title:before.title,reason:before.reason},current:{status:plan.status,disposition:plan.assessment.disposition,title:plan.title,reason:plan.reason,excluded:plan.assessment.excluded},inputs:item.records,agreement:item.agreement??defaultCareAgreement,passed:true})}
const old=b0.approveCarePlan(b0.createCarePlan(b0.demoCareSignals('unanswered',now),now),'家属',now),oldClosed=b0.resolveCarePlan(old,'还没有联系到',now+1000);
const current=approveCarePlan(createCarePlan(demoCareSignals('unanswered',now),now),'家属',now),currentOpen=resolveCarePlan(current,{type:'no_answer',remark:'还没有联系到',method:'phone',actor:'家属',caseId:current.id,confirmed:false},now+1000);
assert.equal(oldClosed.status,'resolved');assert.equal(currentOpen.status,'following');
results.push({id:'negative-reply',name:'未联系到保持跟进',category:'synthetic',transport:'replay',datasetId:'frozen-care-policy-v1',sampleId:'negative-reply',baseline:{status:oldClosed.status},current:{status:currentOpen.status,resolvedAt:currentOpen.resolvedAt??null},passed:true});
const hash=async name=>createHash('sha256').update(await readFile(name)).digest('hex');
await mkdir('public/evidence',{recursive:true});await writeFile('public/evidence/care-policy-replay.json',JSON.stringify({generatedAt:new Date().toISOString(),clock:new Date(now).toISOString(),category:'synthetic',transport:'replay',scope:'同一组冻结构造输入的软件策略对照；没有真实家庭准确率或主动询问因果效果结论。',baselineCommit:'14295270d645b6b18e1aa0c9f9cdc4137afa8aa1',hashes:{baseline:await hash('benchmarks/care/b0-care-agent.ts'),current:await hash('lib/care-agent.ts'),evidencePolicy:await hash('lib/care-evidence.ts')},results},null,2));
console.log(JSON.stringify({cases:results.length,passed:results.length,report:'public/evidence/care-policy-replay.json'}));
