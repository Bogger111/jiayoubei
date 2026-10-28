import {readFile,writeFile,rename,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const ha=process.env.HOME_ASSISTANT_URL,token=process.env.HOME_ASSISTANT_TOKEN,app=process.env.CARE_APP_URL,secret=process.env.CARE_INGEST_SECRET;
if(!ha||!token||!app||!secret)throw new Error('请先配置 .env.care.local 中的 HA 地址、令牌、应用地址和采集密钥。');
const entities=JSON.parse(process.env.CARE_ENTITY_MAP||'{}'),ids=Object.keys(entities);
if(!ids.length)throw new Error('CARE_ENTITY_MAP 必须列出允许采集的实体。');
for(const address of [ha,app])if(!['http:','https:'].includes(new URL(address).protocol))throw new Error('只支持 HTTP(S) 地址');
const root=resolve('.care-local');await mkdir(root,{recursive:true});
const queuePath=resolve(root,'bridge-queue.json');
let queue=[];try{queue=JSON.parse(await readFile(queuePath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
let flushing=false,stopped=false,ws,reconnectTimer;
const save=async()=>{await writeFile(queuePath+'.tmp',JSON.stringify(queue));await rename(queuePath+'.tmp',queuePath)};
let persistence=Promise.resolve();
const serial=operation=>{const task=persistence.then(operation);persistence=task.catch(()=>{});return task;};
async function flush(){if(flushing||!queue.length)return;flushing=true;try{while(queue.length){const record=queue[0];const response=await fetch(new URL('/api/care/ingest',app),{method:'POST',headers:{'Content-Type':'application/json','X-Care-Ingest-Secret':secret},body:JSON.stringify(record),signal:AbortSignal.timeout(6000)});if(!response.ok)throw new Error('采集接口 HTTP '+response.status);await serial(async()=>{if(queue[0]?.eventId===record.eventId)queue.shift();await save()});}}catch(e){console.error('采集暂未送达，保留原事件稍后重试：'+(e.message?.includes('HTTP')?e.message:'网络中断'))}finally{flushing=false}}
// Serial writes preserve the queue file even when websocket and heartbeat events arrive together.
let writes=Promise.resolve();
function enqueue(entityId,state,observedAt,contextId='',heartbeat=false){
  if(stopped)return;
  const identity=[entityId,state,observedAt,contextId,heartbeat?'heartbeat':'state'].join('|');
  const eventId=createHash('sha256').update(identity).digest('hex');
  const record={eventId,entityId,state,observedAt,contextId,heartbeat,sampleId:eventId};
  writes=writes.then(()=>serial(async()=>{if(queue.some(e=>e.eventId===eventId))return;if(queue.length>=1000)throw new Error('采集队列已满，请修复连接后继续');queue.push(record);await appendFile(resolve(root,'capture.jsonl'),JSON.stringify({capturedAt:new Date().toISOString(),category:process.env.CARE_CAPTURE_CATEGORY,datasetId:process.env.CARE_CAPTURE_ID,transport:'live',...record})+'\n');await save()})).then(()=>void flush()).catch(e=>{console.error(e.message);stopped=true;ws?.close()});
}
async function poll(){
  if(stopped)return;
  for(const id of ids){
    if(entities[id].kind==='output')continue;
    try{const response=await fetch(new URL('/api/states/'+encodeURIComponent(id),ha),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('unavailable');const state=await response.json();enqueue(id,['unknown','unavailable'].includes(state.state)?'offline':'online',new Date().toISOString(),'',true);if(state.last_updated)enqueue(id,String(state.state),state.last_updated,state.context?.id??'');}
    catch{enqueue(id,'offline',new Date().toISOString(),'',true)}
  }
}
function connect(){
  if(stopped)return;
  const address=new URL('/api/websocket',ha);address.protocol=address.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(address);
  ws.addEventListener('message',event=>{let message;try{message=JSON.parse(String(event.data))}catch{return}
    if(message.type==='auth_required')ws.send(JSON.stringify({type:'auth',access_token:token}));
    if(message.type==='auth_invalid'){console.error('HA 认证失败，请核对本地令牌');stopped=true;ws.close();}
    if(message.type==='auth_ok'){ws.send(JSON.stringify({id:1,type:'subscribe_events',event_type:'state_changed'}));void poll();console.log('已连接 HA，按实体白名单采集；物理效果需现场核验。');}
    if(message.type==='event'&&message.event?.event_type==='state_changed'){
      const data=message.event.data,state=data?.new_state;
      if(state&&Object.hasOwn(entities,data.entity_id))enqueue(data.entity_id,String(state.state),state.last_updated??message.event.time_fired,state.context?.id??message.event.context?.id??'');
    }
  });
  ws.addEventListener('error',()=>console.error('HA 连接中断，准备重连'));
  ws.addEventListener('close',()=>{if(!stopped)reconnectTimer=setTimeout(connect,5000)});
}
const heartbeat=setInterval(()=>{void poll();void flush()},30000),retry=setInterval(()=>void flush(),5000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{stopped=true;clearInterval(heartbeat);clearInterval(retry);clearTimeout(reconnectTimer);ws?.close();await writes;console.log('采集已停止，未送达事件已保留。');process.exit(0)});
connect();void flush();
