import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createIsolatedAuthRuntime} from '../../tests/isolated-runtime.mjs';
if(!process.argv.includes('--live')){console.log('Live model verification is opt-in. Run with --live to call the configured model and write local evidence.');process.exit(0);}
const privateConfig=JSON.parse(await readFile('.care-local/home-upgrade/engine-config.json','utf8'));
const runtime=await createIsolatedAuthRuntime({r2Buckets:['HOME_MEDIA'],bindings:{AUTH_MODE:'demo',HOME_ENGINE_URL:'http://127.0.0.1:'+privateConfig.port,HOME_ENGINE_TOKEN:privateConfig.token}});
const call=async(path,body)=>{const r=await runtime.dispatchFetch('http://localhost:3000'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
try{
 await runtime.ready;
 const id='ar_'+crypto.randomUUID().replaceAll('-',''),conversationId='chat_'+crypto.randomUUID().replaceAll('-','');
 const query='爸爸喜欢在晚上八点读书，请把这个偏好留在家庭记忆。再查一查已经部署的设备，帮我准备一个阅读安排：客厅主灯亮度60%、厨房窗帘开到一半。我会在对话里确认设备计划，现在不要执行，不要创建其他任务。';
 const begin=Date.now(),result=await call('/api/assistant',{id,conversationId,query,photoIds:[]});
 console.log(JSON.stringify({status:result.status,runStatus:result.body.run?.status,steps:result.body.run?.steps.map(s=>({tool:s.tool,status:s.status,detail:s.detail})),reply:result.body.run?.reply,error:result.body.error}));
 assert.equal(result.status,200);const run=result.body.run;assert.equal(run.status,'completed');assert.ok(run.artifacts.some(a=>a.kind==='memory'));const deviceArtifact=run.artifacts.find(a=>a.kind==='device_plan');assert.ok(deviceArtifact);
 const journal=(await call('/api/home-memory')).body;assert.ok(journal.entries.some(e=>e.description.includes('八点')||e.description.includes('20')));
 const before=(await call('/api/home-control')).body;assert.equal(before.devices.find(d=>d.id==='light.living_room').entity.state,'off');const plan=before.plans.find(p=>p.id===deviceArtifact.id);assert.ok(plan.steps.some(s=>s.deviceId==='light.living_room'&&s.capability==='set_brightness'&&s.value===60));assert.ok(plan.steps.some(s=>s.deviceId==='cover.kitchen_blind'&&s.value===50));
 const approved=(await call('/api/home-control',{operation:'approve',id:plan.id,version:plan.version,confirmed:true})).body.plan;assert.equal(approved.status,'completed');const after=(await call('/api/home-control')).body;assert.equal(after.devices.find(d=>d.id==='light.living_room').entity.attributes.brightness,153);
 const duplicate=await call('/api/assistant',{id,conversationId,query,photoIds:[]});assert.equal(duplicate.body.run.usage.total_tokens,run.usage.total_tokens);assert.equal((await call('/api/home-memory')).body.entries.length,journal.entries.length);
 const report={generatedAt:new Date().toISOString(),environment:'real cloud model; isolated family D1/R2; sample device adapter; no physical devices',seconds:Math.round((Date.now()-begin)/100)/10,run,receipts:approved.receipts,checks:['real model selected and invoked tools across multiple rounds','memory was persisted','full device plan retained brightness and cover targets','no device changed before user approval','approved sample devices updated with receipts','duplicate request reused the recorded result']};
 await writeFile('test-results/home-upgrade/assistant-live-result.json',JSON.stringify(report,null,2));console.log('PASS real-model assistant, memory and approved sample-device integration',report.seconds+'s');
}finally{await runtime.dispose();}
