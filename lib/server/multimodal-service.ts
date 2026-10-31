import { env } from 'cloudflare:workers';
import { demoHomeTimeline,familyTools,interpretHomeRequest,normalizeTimelineEvent,type HomeObservation,type AgentIntent } from '@/lib/multimodal/core';
import { readRuntimeEnv } from '@/lib/runtime-env';
import { ProductInputError } from '@/lib/product-input';
import { readProductState,ensureProductSchema,appendAudit } from './product-repo';
import { isFamilyAdmin,type SessionUser } from './session';
import { controlFamilyDevice } from './device-control';
import { careCommand,readCareWorkspace } from './care-service';
import { ingestCareEvidence } from './care-service';
const db=()=>(env as unknown as {DB:D1Database}).DB;
export type HomeProposal={id:string;version:number;intent:AgentIntent;status:'draft'|'dispatching'|'api_accepted'|'simulated'|'failed'|'unknown'|'prepared';createdAt:number;expiresAt:number;detail:string;dispatchAt?:number;caseId?:string};
const value=(x:unknown,max=240)=>{if(typeof x!=='string'||!x.trim()||x.length>max)throw new ProductInputError('请检查请求内容',400);return x.trim()};
async function observations(user:SessionUser){const rows=await db().prepare('SELECT data_json FROM home_observations WHERE family_id=? ORDER BY observed_at DESC LIMIT 100').bind(user.familyId).all<{data_json:string}>();return rows.results.map(x=>JSON.parse(x.data_json) as HomeObservation)}
export async function readHomeWorkspace(user:SessionUser){
 await ensureProductSchema();const state=await readProductState(user.familyId,user);
 const rows=await db().prepare('SELECT data_json FROM home_proposals WHERE family_id=? ORDER BY created_at DESC LIMIT 10').bind(user.familyId).all<{data_json:string}>();
 const proposals=rows.results.map(x=>JSON.parse(x.data_json) as HomeProposal);
 for(const p of proposals){if(p.status==='dispatching'&&Date.now()-(p.dispatchAt??p.createdAt)>30000){p.status='unknown';p.detail='执行过程未获得确定结果，请人工核对；不会自动重发。';await db().prepare("UPDATE home_proposals SET status='unknown',data_json=?,updated_at=? WHERE id=? AND family_id=? AND status='dispatching' AND version=?").bind(JSON.stringify(p),Date.now(),p.id,user.familyId,p.version).run();}}
 return {events:await observations(user),proposals,members:state.members,devices:state.devices,actor:user,capabilities:{timelineConfigured:Boolean(readRuntimeEnv('HOME_ASSISTANT_URL')&&readRuntimeEnv('HOME_ASSISTANT_TOKEN')&&readRuntimeEnv('HOME_TIMELINE_CAMERAS')),voiceTerminal:'协议适配已接入，终端待联调'}};
}
async function putEvents(user:SessionUser,events:HomeObservation[]){
 if(!events.length)return;
 await db().batch(events.map(e=>db().prepare('INSERT INTO home_observations(family_id,uid,source,data_json,observed_at) VALUES(?,?,?,?,?) ON CONFLICT(family_id,source,uid) DO UPDATE SET data_json=excluded.data_json,observed_at=excluded.observed_at').bind(user.familyId,e.uid,e.origin,JSON.stringify(e),Date.parse(e.start))));
}
async function saveProposal(user:SessionUser,p:HomeProposal){await db().prepare('INSERT INTO home_proposals(id,family_id,actor_id,version,status,data_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(p.id,user.familyId,user.id,p.version,p.status,JSON.stringify(p),p.createdAt,Date.now()).run();return p}
async function prepare(user:SessionUser,intent:AgentIntent){
 const now=Date.now(),p:HomeProposal={id:'HOME-'+crypto.randomUUID(),version:1,intent,status:'draft',createdAt:now,expiresAt:now+5*60000,detail:intent.detail};
 if(intent.kind==='care'){
  if(!isFamilyAdmin(user))throw new ProductInputError('请由家庭管理员整理联系计划',403);
  const state=await readProductState(user.familyId,user),subject=state.members.find(m=>m.id===intent.subjectId);if(!subject)throw new ProductInputError('请选择本家庭成员',400);
  const active=await db().prepare('SELECT id FROM care_cases WHERE family_id=? AND subject_id=? AND active_slot=1').bind(user.familyId,subject.id).first<{id:string}>();
  if(active){p.caseId=active.id;p.status='prepared';p.detail='这位家人已有正在跟进的安排，请核对当前计划。';return saveProposal(user,p)}
  const workspace=await readCareWorkspace(user),contact=state.members.find(m=>m.id===workspace.agreement.contact&&m.id!==subject.id)??state.members.find(m=>m.id!==subject.id&&m.role!=='儿童');
  if(!contact)throw new ProductInputError('请先添加一位成年联系人，再整理联系计划',400);
  const recent=(await observations(user)).filter(e=>Date.now()-Date.parse(e.start)<30*60000&&Date.parse(e.start)<=Date.now());
  for(const e of recent)await ingestCareEvidence(user.familyId,{id:'timeline-'+e.uid,sourceId:e.camera_name,kind:'image',value:e.category==='person'?'person':'unknown',observedAt:Date.parse(e.start),receivedAt:now,expiresAt:Date.parse(e.start)+30*60000,authorized:true,quality:'valid',provenance:'inference',category:e.evidenceCategory,transport:e.transport,datasetId:e.origin==='demo'?'home-hub-demo-v1':'ha-timeline',sampleId:e.uid});
  const plan=await careCommand(user,{action:'create',requestId:p.id,subjectId:subject.id,agreement:{...workspace.agreement,contact:contact.id,nearbyContact:state.members.some(m=>m.id===workspace.agreement.nearbyContact)?workspace.agreement.nearbyContact:undefined}});
  p.status='prepared';p.caseId=plan.id;p.detail='联系安排已保存，家人确认后开始执行。';
 }
 return saveProposal(user,p);
}
export async function homeCommand(user:SessionUser,input:Record<string,unknown>){
 await ensureProductSchema();const action=value(input.action,40);
 if(action==='load_demo'){
  if(!isFamilyAdmin(user))throw new ProductInputError('需要家庭管理员权限',403);
  const events=demoHomeTimeline();await putEvents(user,events);return {events,detail:'已载入软件演练事件，未使用家庭摄像头。'};
 }
 if(action==='sync_timeline'){
  if(!isFamilyAdmin(user))throw new ProductInputError('需要家庭管理员权限',403);
  if(readRuntimeEnv('HOME_ASSISTANT_FAMILY_ID')!==user.familyId)throw new ProductInputError('请配置当前家庭的时间线绑定',409);
  const base=readRuntimeEnv('HOME_ASSISTANT_URL'),token=readRuntimeEnv('HOME_ASSISTANT_TOKEN'),allowed=readRuntimeEnv('HOME_TIMELINE_CAMERAS').split(',').map(s=>s.trim()).filter(s=>/^camera\.[a-z0-9_]+$/.test(s));
  const category=readRuntimeEnv('CARE_CAPTURE_CATEGORY');if(!base||!token||!allowed.length||!['synthetic','bench','reenactment','field'].includes(category))throw new ProductInputError('请先配置授权摄像头、时间线与采集类别',409);
  const response=await fetch(new URL('/api/llmvision/timeline/events?limit=100&days=1',base),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});if(!response.ok)throw new ProductInputError('时间线暂不可用，请检查连接',409);
  const raw=await response.text();if(raw.length>1000000)throw new ProductInputError('时间线返回内容过大',409);const data=JSON.parse(raw);if(!Array.isArray(data.events))throw new ProductInputError('时间线返回格式无效',409);
  const events=data.events.slice(0,100).filter((e:Record<string,unknown>)=>allowed.includes(String(e.camera_name))).map((e:unknown)=>normalizeTimelineEvent(e,category as HomeObservation['evidenceCategory']));await putEvents(user,events);return {events,detail:'已同步授权公共区域的时间线。'};
 }
 if(action==='interpret'){
  const state=await readProductState(user.familyId,user);const intent=interpretHomeRequest(value(input.text),state.devices,state.members);
  if(intent.kind==='timeline')return {intent,events:await observations(user)};
  if(intent.kind==='unsupported')return {intent};return {intent,proposal:await prepare(user,intent)};
 }
 if(action==='approve'){
  if(!isFamilyAdmin(user))throw new ProductInputError('设备安排需要家庭管理员确认',403);
  const id=value(input.id,100),row=await db().prepare('SELECT data_json FROM home_proposals WHERE family_id=? AND id=?').bind(user.familyId,id).first<{data_json:string}>();if(!row)throw new ProductInputError('当前家庭没有这份安排',404);let p=JSON.parse(row.data_json) as HomeProposal;
  if(p.status!=='draft'||p.version!==input.version)throw new ProductInputError('安排已处理，请查看最新进度',409);
  if(input.confirmed!==true||Date.now()>p.expiresAt||p.intent.kind!=='light_on')throw new ProductInputError('请核对本次灯光安排',400);
  p={...p,status:'dispatching',version:p.version+1,dispatchAt:Date.now(),detail:'本次请求已登记，等待执行结果'};
  const result=await db().prepare("UPDATE home_proposals SET status='dispatching',version=?,data_json=?,updated_at=? WHERE id=? AND family_id=? AND status='draft' AND version=?").bind(p.version,JSON.stringify(p),Date.now(),p.id,user.familyId,input.version).run();if(!result.meta.changes)throw new ProductInputError('本次安排已由其他请求处理',409);
  try{
   if(readRuntimeEnv('DEVICE_DRIVER')==='home_assistant'&&readRuntimeEnv('HOME_ASSISTANT_FAMILY_ID')!==user.familyId)throw new Error('设备连接尚未绑定当前家庭');
   const outcome=await controlFamilyDevice(user,p.intent.deviceId!,{action:'light_on',confirmed:true});
   p.status=outcome.status==='success'?outcome.driver==='simulator'?'simulated':'api_accepted':'failed';p.detail=p.status==='simulated'?'本地灯光模拟已记录，未操作实物':p.status==='api_accepted'?'设备接口已接受，物理效果仍需核验':outcome.status==='success'?'操作已记录':outcome.reason;
  }catch{p.status='unknown';p.detail='未获得确定的执行结果，请人工核对；系统不会自动重发。'}
  await db().prepare("UPDATE home_proposals SET status=?,data_json=?,updated_at=? WHERE id=? AND family_id=? AND status='dispatching'").bind(p.status,JSON.stringify(p),Date.now(),p.id,user.familyId).run();return {proposal:p};
 }
 throw new ProductInputError('不支持的家庭助手操作',400);
}
export async function handleFamilyMcp(user:SessionUser,input:Record<string,unknown>){
 await ensureProductSchema();
 const envelope=input.type==='mcp';const rpc=(envelope?input.payload:input) as Record<string,unknown>;const id=rpc?.id??null;
 if(rpc?.jsonrpc==='2.0'&&rpc.id===undefined&&typeof rpc.method==='string'&&rpc.method.startsWith('notifications/'))return null;
 const wrap=(r:Record<string,unknown>)=>envelope?{session_id:typeof input.session_id==='string'?input.session_id.slice(0,100):'home',type:'mcp',payload:r}:r;
 try{
  if(!rpc||rpc.jsonrpc!=='2.0'||!['string','number'].includes(typeof rpc.id))throw new ProductInputError('JSON-RPC 请求无效',400);
  let result:unknown;
  if(rpc.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'jiayoubei-family',version:'1.0'}};
  else if(rpc.method==='tools/list')result={tools:familyTools};
  else if(rpc.method==='tools/call'){
   const params=rpc.params as {name?:string;arguments?:Record<string,unknown>};if(!params||!familyTools.some(t=>t.name===params.name))throw new ProductInputError('不支持的家庭工具',400);
   const state=await readProductState(user.familyId,user);let content:unknown;
   if(params.name==='home.timeline')content={events:await observations(user)};
   else if(params.name==='home.light.prepare'){const device=state.devices.find(d=>d.id===params.arguments?.deviceId&&d.kind==='lighting');if(!device)throw new ProductInputError('请选择本家庭的灯光设备',400);content=await prepare(user,{kind:'light_on',deviceId:device.id,title:'开启'+device.name,detail:'需要家人在页面确认本次安排后发送。'});}
   else content=await prepare(user,{kind:'care',subjectId:value(params.arguments?.subjectId,100),title:'确认家人的情况',detail:'整理家庭联系安排。'});
   result={content:[{type:'text',text:JSON.stringify(content)}],isError:false};
  }else return wrap({jsonrpc:'2.0',id,error:{code:-32601,message:'不支持的方法'}});
  await appendAudit(user.familyId,{actor:user.name,actorType:'rule',time:new Date().toISOString(),target:'home-agent',action:'家庭工具 '+rpc.method,reason:'协议请求按当前家庭权限处理',riskLevel:'normal',result:'success'});
  return wrap({jsonrpc:'2.0',id,result});
 }catch(e){return wrap({jsonrpc:'2.0',id,error:{code:-32602,message:e instanceof ProductInputError?e.message:'家庭工具暂时不可用'}})}
}
