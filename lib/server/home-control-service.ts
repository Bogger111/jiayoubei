import {env} from 'cloudflare:workers';
import {ProductInputError} from '@/lib/product-input';
import furnitureCatalog from '@/lib/space/furniture-catalog.json';
import {readRuntimeEnv} from '@/lib/runtime-env';
import {actionDescription,deviceCapabilities,capabilitiesForEntity,deviceStateSignature,interpretDeviceActions,validateHomeAction,type HomeAction,type HomeControlPlan,type HomeDevice,type HomeDeviceWorkspace,type HomeReceipt} from '@/lib/home-control';
import type {SpaceEntity,SpaceWorkspace} from '@/lib/space/types';
import {readHomeSpace} from './home-space-service';
import {adapterFor,haConfigured,homeAssistantAdapter} from './home-device-adapters';
import {isFamilyAdmin,type SessionUser} from './session';

const db=()=>(env as unknown as {DB:D1Database}).DB;
const admin=(user:SessionUser)=>{if(!isFamilyAdmin(user))throw new ProductInputError('请由家庭管理员管理设备和确认计划',403);};
const text=(value:unknown,max=120)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new ProductInputError('请检查设备资料');return value.trim();};
const parse=<T>(row:{data_json:string})=>JSON.parse(row.data_json) as T;
export async function ensureHomeControlSchema(){await db().batch([
  db().prepare('CREATE TABLE IF NOT EXISTS home_device_registry (family_id TEXT NOT NULL,entity_id TEXT NOT NULL,version INTEGER NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(family_id,entity_id))'),
  db().prepare('CREATE TABLE IF NOT EXISTS home_device_settings (family_id TEXT PRIMARY KEY,initialized_at INTEGER NOT NULL)'),
  db().prepare('CREATE TABLE IF NOT EXISTS home_control_plans (id TEXT PRIMARY KEY,family_id TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL,data_json TEXT NOT NULL,created_at INTEGER NOT NULL)'),
  db().prepare('CREATE INDEX IF NOT EXISTS home_control_plans_family ON home_control_plans(family_id,created_at)'),
  db().prepare('CREATE TABLE IF NOT EXISTS home_control_leases (family_id TEXT NOT NULL,entity_id TEXT NOT NULL,plan_id TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(family_id,entity_id))'),
]);}
export async function readHomeControlPlan(user:SessionUser,id:string){await ensureHomeControlSchema();const row=await db().prepare('SELECT data_json FROM home_control_plans WHERE family_id=? AND id=?').bind(user.familyId,id).first<{data_json:string}>();if(!row)throw new ProductInputError('这份设备计划不存在',404);return parse<HomeControlPlan>(row);}
async function registry(user:SessionUser){await ensureHomeControlSchema();const r=await db().prepare('SELECT data_json FROM home_device_registry WHERE family_id=? ORDER BY entity_id').bind(user.familyId).all<{data_json:string}>();return r.results.map(parse<HomeDevice>).filter(d=>!d.id.startsWith('sun.')&&!d.id.startsWith('weather.'));}
async function initializeDevices(user:SessionUser,space:SpaceWorkspace){
  await ensureHomeControlSchema();const ready=await db().prepare('SELECT family_id FROM home_device_settings WHERE family_id=?').bind(user.familyId).first();if(ready)return;
  const devices:HomeDevice[]=[];
  if(readRuntimeEnv('AUTH_MODE')!=='real'&&space.sample){for(const entity of Object.values(space.states)){
    const place=space.config.devices?.find(d=>d.entity_id===entity.entity_id),area=space.entities[entity.entity_id] as {area_id?:string}|undefined;
    const room=space.config.rooms.find(r=>r.id===place?.room||r.area_id===area?.area_id),capabilities=deviceCapabilities(entity.entity_id);
    devices.push({id:entity.entity_id,name:String(entity.attributes.friendly_name??entity.entity_id),driver:'sample',roomId:room?.id??'',furnitureId:Array.isArray(place?.decorations)?String(place.decorations[0]??''):'',policy:capabilities.length?'confirm':'read_only',version:1,capabilities,entity:{...entity,attributes:{...entity.attributes,room_name:room?.name??''}}});
  }}
  await db().batch([...devices.map(d=>db().prepare('INSERT OR IGNORE INTO home_device_registry(family_id,entity_id,version,data_json) VALUES(?,?,?,?)').bind(user.familyId,d.id,d.version,JSON.stringify(d))),db().prepare('INSERT OR IGNORE INTO home_device_settings(family_id,initialized_at) VALUES(?,?)').bind(user.familyId,Date.now())]);
}
async function plans(user:SessionUser){const rows=await db().prepare('SELECT data_json FROM home_control_plans WHERE family_id=? ORDER BY created_at DESC LIMIT 25').bind(user.familyId).all<{data_json:string}>();const result=rows.results.map(parse<HomeControlPlan>);
  for(const p of result){if(p.status==='pending'&&p.expiresAt<Date.now()||p.status==='running'&&Date.now()-(p.startedAt??p.createdAt)>300_000){const old=p.status;p.status=old==='pending'?'expired':'unknown';p.version++;await db().prepare('UPDATE home_control_plans SET status=?,version=?,data_json=? WHERE id=? AND family_id=? AND status=? AND version=?').bind(p.status,p.version,JSON.stringify(p),p.id,user.familyId,old,p.version-1).run();}}
  return result;
}
export async function readHomeDevices(user:SessionUser):Promise<HomeDeviceWorkspace>{
  const space=await readHomeSpace(user);await initializeDevices(user,space);const devices=await registry(user);
  const configured=haConfigured(user.familyId);let available=false,detail=configured?'设备网关待同步':'连接设备网关后，即可发现家中的设备';
  let states:SpaceEntity[]=[];
  if(configured){try{states=await homeAssistantAdapter(user.familyId).discover();available=true;detail='设备网关已连接';}catch{detail='设备网关暂时离线';}}
  const byId=new Map(states.map(s=>[s.entity_id,s]));
  for(const d of devices){if(d.driver==='home_assistant')d.entity=byId.get(d.id)??{...d.entity,state:'unavailable'};const room=space.config.rooms.find(r=>r.id===d.roomId);d.entity={...d.entity,attributes:{...d.entity.attributes,friendly_name:d.name,room_name:room?.name??'未分配房间'}};d.capabilities=d.driver==='home_assistant'?capabilitiesForEntity(d.entity):deviceCapabilities(d.id);}
  return {devices,plans:await plans(user),connection:{configured,available,detail},rooms:space.config.rooms.map(r=>({id:r.id,name:r.name??r.id})),furniture:(space.config.decorations??[]).map(d=>({id:d.id,name:String(d.name??d.label??furnitureCatalog.find(f=>f.id===d.kind)?.name??d.kind),roomId:d.room}))};
}
export async function discoverHomeDevices(user:SessionUser){admin(user);if(!haConfigured(user.familyId))throw new ProductInputError('请先在本机后台连接家庭设备网关',409);let entities:SpaceEntity[];try{entities=await homeAssistantAdapter(user.familyId).discover();}catch{throw new ProductInputError('暂时无法连接设备网关',502);}return entities.filter(e=>/^(light|switch|cover|climate|fan|humidifier|media_player|sensor|binary_sensor|lock|camera|alarm_control_panel)\./.test(e.entity_id)).map(entity=>({id:entity.entity_id,name:String(entity.attributes.friendly_name??entity.entity_id),capabilities:capabilitiesForEntity(entity),entity}));}
export async function registerHomeDevice(user:SessionUser,input:Record<string,unknown>){
  admin(user);const workspace=await readHomeDevices(user);let device:HomeDevice;
  if(input.driver==='home_assistant'){const candidates=await discoverHomeDevices(user),candidate=candidates.find(d=>d.id===input.deviceId);if(!candidate)throw new ProductInputError('请选择网关中已发现的设备');device={...candidate,driver:'home_assistant',roomId:'',furnitureId:'',policy:candidate.capabilities.length?'confirm':'read_only',version:1};}
  else if(input.driver==='sample'){
    const kinds=['light','switch','cover','climate','fan','humidifier','sensor'];if(!kinds.includes(String(input.kind)))throw new ProductInputError('请选择设备类型');
    const name=text(input.name,80),id=String(input.kind)+'.jyb_'+crypto.randomUUID().replaceAll('-','').slice(0,12),now=new Date().toISOString();
    const entity:SpaceEntity={entity_id:id,state:input.kind==='sensor'?'22':input.kind==='cover'?'closed':input.kind==='climate'?'heat':'off',attributes:{friendly_name:name,...(input.kind==='climate'?{temperature:24,current_temperature:25,min_temp:16,max_temp:30}:input.kind==='cover'?{current_position:0}:input.kind==='sensor'?{unit_of_measurement:'°C'}:{})},last_updated:now,last_changed:now};
    device={id,name,driver:'sample',roomId:'',furnitureId:'',policy:input.kind==='sensor'?'read_only':'confirm',version:1,entity,capabilities:deviceCapabilities(id)};
  }else throw new ProductInputError('请选择设备接入方式');
  if(workspace.devices.length>=200)throw new ProductInputError('当前家庭设备数量已达上限');
  if(typeof input.roomId==='string'&&input.roomId){if(!workspace.rooms.some(r=>r.id===input.roomId))throw new ProductInputError('房间不存在');device.roomId=input.roomId;}
  const inserted=await db().prepare('INSERT OR IGNORE INTO home_device_registry(family_id,entity_id,version,data_json) VALUES(?,?,?,?) RETURNING entity_id').bind(user.familyId,device.id,device.version,JSON.stringify(device)).first();if(!inserted)throw new ProductInputError('设备已经部署，请编辑已有设备',409);return device;
}
export async function updateHomeDevice(user:SessionUser,input:Record<string,unknown>){admin(user);const w=await readHomeDevices(user),device=w.devices.find(d=>d.id===input.deviceId);if(!device)throw new ProductInputError('当前家庭没有这台设备',404);if(input.version!==device.version)throw new ProductInputError('设备设置已更新，请刷新',409);
  const roomId=typeof input.roomId==='string'?input.roomId:device.roomId,furnitureId=typeof input.furnitureId==='string'?input.furnitureId:device.furnitureId;
  if(roomId&&!w.rooms.some(r=>r.id===roomId))throw new ProductInputError('请选择已有房间');if(furnitureId&&!w.furniture.some(f=>f.id===furnitureId&&f.roomId===roomId))throw new ProductInputError('请选择这个房间中的家具');
  const policy=input.policy??device.policy;if(policy!=='confirm'&&policy!=='read_only')throw new ProductInputError('访问权限无效');
  const next={...device,name:input.name===undefined?device.name:text(input.name,80),roomId,furnitureId,policy,version:device.version+1};
  const r=await db().prepare('UPDATE home_device_registry SET version=?,data_json=? WHERE family_id=? AND entity_id=? AND version=? AND NOT EXISTS(SELECT 1 FROM home_control_leases WHERE family_id=? AND entity_id=? AND expires_at>?)').bind(next.version,JSON.stringify(next),user.familyId,device.id,device.version,user.familyId,device.id,Date.now()).run();if(!r.meta.changes)throw new ProductInputError('设备设置已更新，请刷新',409);return next;
}
export async function prepareHomeControl(user:SessionUser,input:Record<string,unknown>){admin(user);const workspace=await readHomeDevices(user);
  let raw=input.steps;if(input.text!==undefined){try{raw=interpretDeviceActions(text(input.text,1000),workspace.devices);}catch(e){throw new ProductInputError(e instanceof Error?e.message:'请明确要调控的设备');}}
  if(!Array.isArray(raw)||!raw.length||raw.length>12)throw new ProductInputError('一次计划请安排 1–12 台设备');
  const seen=new Set<string>();const steps=raw.map(item=>{const id=item&&typeof item==='object'?(item as Record<string,unknown>).deviceId:undefined,device=workspace.devices.find(d=>d.id===id);if(!device)throw new ProductInputError('设备不存在或不属于当前家庭',404);if(seen.has(device.id))throw new ProductInputError('同一计划每台设备只指定一个目标状态');seen.add(device.id);let action:HomeAction;try{action=validateHomeAction(item,device);}catch(e){throw new ProductInputError(e instanceof Error?e.message:'动作无效');}return {...action,deviceName:device.name,deviceVersion:device.version,before:device.entity,driver:device.driver};});
  const now=Date.now(),source=['space','device','agent'].includes(String(input.source))?input.source as HomeControlPlan['source']:'agent';
  const plan:HomeControlPlan={id:'hc_'+crypto.randomUUID().replaceAll('-',''),version:1,title:typeof input.title==='string'?text(input.title,100):'家庭设备调控',status:'pending',source,createdAt:now,expiresAt:now+5*60_000,steps,receipts:[]};
  await db().prepare('INSERT INTO home_control_plans(id,family_id,version,status,data_json,created_at) VALUES(?,?,?,?,?,?)').bind(plan.id,user.familyId,plan.version,plan.status,JSON.stringify(plan),now).run();return plan;
}
export async function approveHomeControl(user:SessionUser,input:Record<string,unknown>){
  admin(user);await ensureHomeControlSchema();const row=await db().prepare('SELECT data_json FROM home_control_plans WHERE family_id=? AND id=?').bind(user.familyId,text(input.id)).first<{data_json:string}>();if(!row)throw new ProductInputError('这份设备计划不存在',404);const plan=parse<HomeControlPlan>(row);
  if(plan.status!=='pending'||input.version!==plan.version)throw new ProductInputError('这份计划已处理，请查看最新记录',409);
  if(input.operation==='cancel'){
    plan.status='cancelled';plan.version++;const r=await db().prepare("UPDATE home_control_plans SET status='cancelled',version=?,data_json=? WHERE id=? AND family_id=? AND status='pending' AND version=?").bind(plan.version,JSON.stringify(plan),plan.id,user.familyId,input.version).run();if(!r.meta.changes)throw new ProductInputError('计划已更新',409);return plan;
  }
  if(input.confirmed!==true)throw new ProductInputError('请确认本次完整设备计划');if(plan.expiresAt<Date.now())throw new ProductInputError('计划已过期，请重新整理',409);
  const workspace=await readHomeDevices(user);for(const step of plan.steps){const device=workspace.devices.find(d=>d.id===step.deviceId);if(!device||device.version!==step.deviceVersion)throw new ProductInputError('设备设置发生变化，请重新整理计划',409);try{validateHomeAction(step,device);}catch(e){throw new ProductInputError(e instanceof Error?e.message:'设备暂不可用',409);}if(deviceStateSignature(device.entity)!==deviceStateSignature(step.before))throw new ProductInputError('设备状态已经变化，请重新整理计划',409);}
  // Lease the whole set before dispatch, so distinct plans cannot race on a device.
  const leasedAt=Date.now(),leaseOwner=plan.id+':'+crypto.randomUUID();
  const leases=await db().batch(plan.steps.map(step=>db().prepare('INSERT INTO home_control_leases(family_id,entity_id,plan_id,expires_at) VALUES(?,?,?,?) ON CONFLICT(family_id,entity_id) DO UPDATE SET plan_id=excluded.plan_id,expires_at=excluded.expires_at WHERE home_control_leases.expires_at<? RETURNING entity_id').bind(user.familyId,step.deviceId,leaseOwner,leasedAt+300_000,leasedAt)));
  if(leases.some(r=>!r.results.length)){
    await db().prepare('DELETE FROM home_control_leases WHERE family_id=? AND plan_id=?').bind(user.familyId,leaseOwner).run();
    throw new ProductInputError('有设备正在执行另一份计划，请稍后核对',409);
  }
  try {
  const currentDevices=await registry(user);for(const step of plan.steps){if(currentDevices.find(d=>d.id===step.deviceId)?.version!==step.deviceVersion)throw new ProductInputError('设备设置已更新，请重新整理计划',409);}
  plan.status='running';plan.version++;plan.startedAt=Date.now();
  const claimed=await db().prepare("UPDATE home_control_plans SET status='running',version=?,data_json=? WHERE id=? AND family_id=? AND status='pending' AND version=?").bind(plan.version,JSON.stringify(plan),plan.id,user.familyId,input.version).run();if(!claimed.meta.changes)throw new ProductInputError('这份计划已经开始处理',409);
  let halted=false;
  for(const step of plan.steps){let receipt:HomeReceipt;const device=workspace.devices.find(d=>d.id===step.deviceId)!;
    if(halted)receipt={deviceId:step.deviceId,status:'skipped',detail:'前一步需要核对，后续动作暂未执行',at:Date.now()};
    else{try{const outcome=await adapterFor(device.driver,user.familyId).execute(device,step);receipt=outcome.receipt;if(outcome.entity&&device.driver==='sample'){
      const updated={...device,entity:outcome.entity};await db().prepare('UPDATE home_device_registry SET data_json=? WHERE family_id=? AND entity_id=? AND version=?').bind(JSON.stringify(updated),user.familyId,device.id,device.version).run();
    }}catch{receipt={deviceId:step.deviceId,status:'unknown',detail:'未获得确定回执，请核对设备状态',at:Date.now()};}halted=['unknown','failed'].includes(receipt.status);}
    plan.receipts.push(receipt);await db().prepare("UPDATE home_control_plans SET data_json=? WHERE id=? AND family_id=? AND status='running'").bind(JSON.stringify(plan),plan.id,user.familyId).run();
  }
  plan.status=plan.receipts.some(r=>r.status==='unknown')?'unknown':plan.receipts.some(r=>r.status==='failed')?'failed':plan.receipts.some(r=>r.status==='accepted')?'accepted':'completed';
  plan.version++;await db().prepare("UPDATE home_control_plans SET status=?,version=?,data_json=? WHERE id=? AND family_id=? AND status='running'").bind(plan.status,plan.version,JSON.stringify(plan),plan.id,user.familyId).run();return plan;
  } finally {await db().prepare('DELETE FROM home_control_leases WHERE family_id=? AND plan_id=?').bind(user.familyId,leaseOwner).run();}
}
export async function withHomeDevices(user:SessionUser,space:SpaceWorkspace):Promise<SpaceWorkspace>{
  const w=await readHomeDevices(user),states={...space.states},entities={...space.entities};let devices=[...(space.config.devices??[])];
  for(const d of w.devices){states[d.id]=d.entity;const assignedRoom=space.config.rooms.find(r=>r.id===d.roomId);entities[d.id]={entity_id:d.id,area_id:assignedRoom?.area_id??d.roomId};const furniture=space.config.decorations?.find(f=>f.id===d.furnitureId&&f.room===d.roomId);const previous=devices.find(x=>x.entity_id===d.id);devices=devices.filter(x=>x.entity_id!==d.id);
    if(d.roomId){const room=space.config.rooms.find(r=>r.id===d.roomId);if(room){const position=furniture?.position??previous?.position??[room.points.reduce((s,p)=>s+p[0],0)/room.points.length,room.points.reduce((s,p)=>s+p[1],0)/room.points.length] as [number,number];devices.push({...previous,entity_id:d.id,room:d.roomId,position,decorations:furniture?(Array.isArray(previous?.decorations)&&previous.decorations[0]===furniture.id?previous.decorations:[furniture.id]):[]});}}
  }
  const areas={...space.areas};for(const room of space.config.rooms)areas[room.id]={area_id:room.id,name:room.name??room.id};
  return {...space,states,entities,areas,config:{...space.config,devices}};
}
export async function homeControlCommand(user:SessionUser,input:Record<string,unknown>){
  if(input.operation==='discover')return {candidates:await discoverHomeDevices(user)};
  if(input.operation==='register')return {device:await registerHomeDevice(user,input)};
  if(input.operation==='update')return {device:await updateHomeDevice(user,input)};
  if(input.operation==='prepare')return {plan:await prepareHomeControl(user,input)};
  if(input.operation==='approve'||input.operation==='cancel')return {plan:await approveHomeControl(user,input)};
  throw new ProductInputError('不支持的设备操作');
}
export {actionDescription};
