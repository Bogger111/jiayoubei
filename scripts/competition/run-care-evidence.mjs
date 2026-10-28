import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCarePlan,demoCareSignals,approveCarePlan,recordCareStep,resolveCarePlan,careScenarioLabels} from '../../lib/care-agent.ts';
const now=Date.now(), scenarios=[];
for(const scenario of Object.keys(careScenarioLabels)) {
  const inputs=demoCareSignals(scenario,now),start=performance.now(),plan=createCarePlan(inputs,now);
  const expected=['away','safe'].includes(scenario)?'monitoring':'pending';
  assert.equal(plan.status,expected);
  const decision=plan.steps.length ? plan.steps.slice(0,2).map(step=>step.title).join('；') : '保持关注，暂不安排额外打扰';
  scenarios.push({scenario,label:careScenarioLabels[scenario],inputs,title:plan.title,decision,status:plan.status,steps:plan.steps.length,evidence:plan.evidence,elapsedMs:Number((performance.now()-start).toFixed(3)),passed:true});
}
let plan=createCarePlan(demoCareSignals('authorized',now),now);
const trace=[{stage:'综合输入',at:now,plan:structuredClone(plan)}];
const guards=[];
for(const [name,fn] of [
  ['未批准不执行',()=>recordCareStep(plan,'device',true,'invalid',now)],
  ['过期计划需重新评估',()=>approveCarePlan(plan,'家人',now+21*60000)],
]){assert.throws(fn);guards.push({name,passed:true})}
plan=approveCarePlan(plan,'演示家庭管理员',now+1000);trace.push({stage:'家人批准',at:now+1000,plan:structuredClone(plan)});
assert.throws(()=>approveCarePlan(plan,'家人',now+1100));guards.push({name:'重复批准不重放',passed:true});
plan=recordCareStep(plan,'device',true,'本地设备模拟器：客厅灯与语音询问回执',now+1500);
plan=recordCareStep(plan,'family',true,'家庭任务与站内通知写入',now+2000);
trace.push({stage:'协同执行',at:now+2000,plan:structuredClone(plan)});
assert.throws(()=>recordCareStep(plan,'nearby',true,'too early',now+3000));guards.push({name:'条件未到不联系邻居',passed:true});
plan=resolveCarePlan(plan,'已与妈妈通话，刚才在午睡，一切平安。',now+5000);trace.push({stage:'回应闭环',at:now+5000,plan:structuredClone(plan)});
assert.equal(plan.steps.at(-1).status,'skipped');guards.push({name:'确认平安后停止后续联系',passed:true});
const code=await readFile('lib/care-agent.ts');
const result={generatedAt:new Date().toISOString(),runtime:process.version,engine:'lib/care-agent.ts',sourceSha256:createHash('sha256').update(code).digest('hex'),scope:'真实执行本地确定性编排程序；输入为构造情景，图像为已授权语义观察值，设备与通讯为模拟适配器。不是模型识别准确率、真实家庭试用或ESP32实测。',scenarios,guards,trace};
await mkdir('public/evidence',{recursive:true});await writeFile('public/evidence/care-run.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({scenarios:scenarios.length,guards:guards.length,trace:trace.map(item=>item.stage),sourceSha256:result.sourceSha256}));
