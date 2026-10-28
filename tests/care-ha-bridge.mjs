import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocketServer} from 'ws';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'jiayoubei-care-bridge-')),token='fixture-'+crypto.randomUUID(),secret='fixture-'+crypto.randomUUID();
let accepting=false,failures=0,authenticated=0,subscribed=0,child;const delivered=[],allRequests=[],checks=[];
const observedAt=new Date().toISOString(),state={state:'on',last_updated:observedAt,context:{id:'fixture-context'}};
const server=http.createServer(async(req,res)=>{if(req.url.startsWith('/api/states/')){assert.equal(req.method,'GET');assert.equal(req.headers.authorization,'Bearer '+token);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(state));return}assert.equal(req.url,'/api/care/ingest');assert.equal(req.headers['x-care-ingest-secret'],secret);let body='';for await(const chunk of req)body+=chunk;const record=JSON.parse(body);allRequests.push(record);if(!accepting){failures++;res.writeHead(503,{'Content-Type':'application/json'});res.end('{}')}else{delivered.push(record);res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}')}});
const wss=new WebSocketServer({noServer:true});server.on('upgrade',(req,socket,head)=>wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req)));
wss.on('connection',ws=>{ws.send(JSON.stringify({type:'auth_required'}));ws.on('message',raw=>{const message=JSON.parse(String(raw));if(message.type==='auth'){assert.equal(message.access_token,token);authenticated++;ws.send(JSON.stringify({type:'auth_ok'}));}if(message.type==='subscribe_events'){assert.equal(message.event_type,'state_changed');subscribed++;ws.send(JSON.stringify({id:message.id,type:'result',success:true,result:null}));for(const entity_id of ['binary_sensor.unlisted','binary_sensor.care_motion'])ws.send(JSON.stringify({id:message.id,type:'event',event:{event_type:'state_changed',time_fired:observedAt,context:state.context,data:{entity_id,new_state:state}}}));}})});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const address='http://127.0.0.1:'+server.address().port;
const launch=()=>{const process=spawn(globalThis.process.execPath,[resolve('scripts/care/ha-bridge.mjs')],{cwd:root,env:{...globalThis.process.env,HOME_ASSISTANT_URL:address,HOME_ASSISTANT_TOKEN:token,CARE_APP_URL:address,CARE_INGEST_SECRET:secret,CARE_ENTITY_MAP:JSON.stringify({'binary_sensor.care_motion':{kind:'activity',subjectId:'fixture-subject'}}),CARE_CAPTURE_CATEGORY:'synthetic',CARE_CAPTURE_ID:'bridge-contract-v1'},windowsHide:true,stdio:['ignore','pipe','pipe']});process.stdout.resume();process.stderr.resume();return process};
const wait=async predicate=>{const end=Date.now()+12000;while(!await predicate()){if(Date.now()>end)throw new Error('桥接协议检查等待超时');await new Promise(r=>setTimeout(r,100))}};
const stop=async()=>{if(child&&child.exitCode===null){const exit=new Promise(r=>child.once('exit',r));child.kill();await exit}};
const queue=async()=>{try{return JSON.parse(await readFile(join(root,'.care-local/bridge-queue.json'),'utf8'))}catch{return null}};
try{
 child=launch();await wait(()=>authenticated&&subscribed&&failures>0);checks.push({name:'原生WebSocket完成认证与状态订阅',passed:true});
 await wait(async()=>{const q=await queue();return q?.some(r=>!r.heartbeat)});const pending=await queue();assert.ok(pending.length>0);checks.push({name:'连接失败后原始事件和标识写入本地队列',passed:true});
 await stop();accepting=true;child=launch();await wait(()=>pending.every(p=>delivered.some(d=>d.eventId===p.eventId)));
 checks.push({name:'桥接进程重建后使用相同事件标识重送',passed:true});
 assert.ok(allRequests.every(r=>r.entityId==='binary_sensor.care_motion'));assert.ok(delivered.some(r=>r.heartbeat&&r.state==='online'));checks.push({name:'实体白名单与只读状态心跳生效',passed:true});
 await wait(async()=>{const q=await queue();return q?.length===0});checks.push({name:'本次恢复后队列清空且原待送记录全部到达',passed:true});
 await mkdir('public/evidence',{recursive:true});await writeFile('public/evidence/care-p0-bridge.json',JSON.stringify({generatedAt:new Date().toISOString(),category:'synthetic',transport:'live',scope:'本机WebSocket/HTTP协议夹具运行真实Node桥接进程，验证断线重送；未连接HA实例或实物。',checks,originalPendingIds:pending.map(r=>r.eventId),deliveredIds:[...new Set(delivered.map(r=>r.eventId))]},null,2));console.log(JSON.stringify({checks:checks.length,passed:checks.length}));
}finally{await stop();for(const client of wss.clients)client.terminate();await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith('jiayoubei-care-bridge-'))throw new Error('Unexpected cleanup path');await rm(root,{recursive:true,force:true})}
