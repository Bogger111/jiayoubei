/** Provider-independent contract shared by the space, device page and agent tools. */
import type {SpaceEntity} from './space/types';

export type HomeDriver = 'sample' | 'home_assistant';
export type DevicePolicy = 'confirm' | 'read_only';
export type HomeCapability = 'turn_on' | 'turn_off' | 'set_brightness' | 'set_cover_position' | 'set_temperature' | 'set_percentage' | 'set_humidity' | 'volume_set' | 'media_play' | 'media_pause';
export type HomeDevice = {
  id:string; name:string; driver:HomeDriver; roomId:string; furnitureId:string;
  policy:DevicePolicy; version:number; capabilities:HomeCapability[]; entity:SpaceEntity;
};
export type HomeAction = {deviceId:string; capability:HomeCapability; value?:number};
export type HomeReceipt = {deviceId:string; status:'simulated'|'verified'|'accepted'|'failed'|'unknown'|'skipped'; detail:string; at:number};
export type HomeControlPlan = {
  id:string; version:number; title:string; status:'pending'|'running'|'completed'|'accepted'|'failed'|'unknown'|'cancelled'|'expired';
  source:'agent'|'space'|'device'; createdAt:number; expiresAt:number; startedAt?:number;
  steps:(HomeAction&{deviceName:string;deviceVersion:number;before:SpaceEntity;driver:HomeDriver})[]; receipts:HomeReceipt[];
};
export type HomeDeviceWorkspace = {
  devices:HomeDevice[]; plans:HomeControlPlan[];
  connection:{configured:boolean;available:boolean;detail:string};
  rooms:{id:string;name:string}[]; furniture:{id:string;name:string;roomId:string}[];
};
export const capabilityLabels:Record<HomeCapability,string>={turn_on:'开启',turn_off:'关闭',set_brightness:'调整亮度',set_cover_position:'调整窗帘',set_temperature:'设置温度',set_percentage:'调整风速',set_humidity:'设置湿度',volume_set:'调整音量',media_play:'播放',media_pause:'暂停'};
export const capabilityRanges:Partial<Record<HomeCapability,{min:number;max:number;unit:string;initial:number}>>={
  set_brightness:{min:1,max:100,unit:'%',initial:65},set_cover_position:{min:0,max:100,unit:'%',initial:50},set_temperature:{min:16,max:30,unit:'°C',initial:24},set_percentage:{min:0,max:100,unit:'%',initial:50},set_humidity:{min:30,max:70,unit:'%',initial:50},volume_set:{min:0,max:100,unit:'%',initial:30},
};
export function deviceCapabilities(entityId:string):HomeCapability[]{
  const domain=entityId.split('.')[0];
  const capabilities:Record<string,HomeCapability[]>={light:['turn_on','turn_off','set_brightness'],switch:['turn_on','turn_off'],cover:['set_cover_position'],climate:['set_temperature'],fan:['turn_on','turn_off','set_percentage'],humidifier:['turn_on','turn_off','set_humidity'],media_player:['media_play','media_pause','volume_set']};
  // Locks, cameras, alarms and unknown domains are readable, never executable tools.
  return capabilities[domain]??[];
}
export function capabilitiesForEntity(entity:SpaceEntity):HomeCapability[]{
  let capabilities=deviceCapabilities(entity.entity_id);const features=entity.attributes.supported_features,domain=entity.entity_id.split('.')[0];
  if(domain==='light'&&Array.isArray(entity.attributes.supported_color_modes)&&entity.attributes.supported_color_modes.every(m=>m==='onoff'))capabilities=capabilities.filter(c=>c!=='set_brightness');
  if(typeof features==='number'){
    const required:Partial<Record<HomeCapability,number>>=domain==='cover'?{set_cover_position:4}:domain==='climate'?{set_temperature:1}:domain==='fan'?{set_percentage:1}:domain==='media_player'?{media_play:16384,media_pause:1,volume_set:4}:{};
    capabilities=capabilities.filter(c=>required[c]===undefined||Boolean(features&required[c]!));
  }
  return capabilities;
}
export function deviceStateSignature(entity:SpaceEntity){return JSON.stringify([entity.state,...['brightness','current_position','temperature','percentage','humidity','volume_level'].map(k=>entity.attributes[k]??null)]);}
export function validateHomeAction(input:unknown,device:HomeDevice):HomeAction{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('设备动作格式不正确');
  const action=input as Record<string,unknown>,capability=action.capability as HomeCapability;
  if(action.deviceId!==device.id||!device.capabilities.includes(capability)||device.policy==='read_only')throw new Error('这台设备未授权该项操作');
  if(device.entity.state==='unavailable'||device.entity.state==='unknown')throw new Error('设备暂时离线，请先刷新状态');
  const range=capabilityRanges[capability];
  if(range){if(typeof action.value!=='number'||!Number.isFinite(action.value)||action.value<range.min||action.value>range.max)throw new Error(`参数需要在 ${range.min}–${range.max} ${range.unit}之间`);}
  if(capability==='set_temperature'){const min=device.entity.attributes.min_temp,max=device.entity.attributes.max_temp;if(typeof min==='number'&&Number(action.value)<min||typeof max==='number'&&Number(action.value)>max)throw new Error('目标温度超出设备支持范围');}
  if(!range&&action.value!==undefined)throw new Error('这项操作不需要数值参数');
  return {deviceId:device.id,capability,...(range?{value:action.value as number}:{})};
}
export function desiredEntity(before:SpaceEntity,action:HomeAction):SpaceEntity{
  const next=structuredClone(before),now=new Date().toISOString();next.last_updated=now;next.last_changed=now;
  switch(action.capability){
    case 'turn_on':next.state='on';break;case 'turn_off':next.state='off';break;
    case 'set_brightness':next.state='on';next.attributes.brightness=Math.round(action.value!*255/100);break;
    case 'set_cover_position':next.attributes.current_position=action.value;next.state=action.value===0?'closed':'open';break;
    case 'set_temperature':next.attributes.temperature=action.value;break;
    case 'set_percentage':next.attributes.percentage=action.value;next.state=action.value===0?'off':'on';break;
    case 'set_humidity':next.attributes.humidity=action.value;break;
    case 'volume_set':next.attributes.volume_level=action.value!/100;break;
    case 'media_play':next.state='playing';break;case 'media_pause':next.state='paused';break;
  }
  return next;
}
export function homeService(action:HomeAction){
  const domain=action.deviceId.split('.')[0];
  const mapping:Record<HomeCapability,{service:string;parameter?:string;value?:number}>={turn_on:{service:'turn_on'},turn_off:{service:'turn_off'},set_brightness:{service:'turn_on',parameter:'brightness_pct',value:action.value},set_cover_position:{service:'set_cover_position',parameter:'position',value:action.value},set_temperature:{service:'set_temperature',parameter:'temperature',value:action.value},set_percentage:{service:'set_percentage',parameter:'percentage',value:action.value},set_humidity:{service:'set_humidity',parameter:'humidity',value:action.value},volume_set:{service:'volume_set',parameter:'volume_level',value:action.value===undefined?undefined:action.value/100},media_play:{service:'media_play'},media_pause:{service:'media_pause'}};
  const item=mapping[action.capability];if(!item||!deviceCapabilities(action.deviceId).includes(action.capability))throw new Error('设备动作不支持');
  return {domain,service:item.service,data:{entity_id:action.deviceId,...(item.parameter?{[item.parameter]:item.value}:{})}};
}
export function actionDescription(action:HomeAction,name:string){const range=capabilityRanges[action.capability];return `${name} · ${capabilityLabels[action.capability]}${range?' '+action.value+range.unit:''}`;}
export function entityMatches(actual:SpaceEntity,expected:SpaceEntity,action:HomeAction){
  const parameter:Partial<Record<HomeCapability,string>>={set_brightness:'brightness',set_cover_position:'current_position',set_temperature:'temperature',set_percentage:'percentage',set_humidity:'humidity',volume_set:'volume_level'};
  const key=parameter[action.capability];
  if(key){const a=actual.attributes[key],b=expected.attributes[key];return typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<(action.capability==='volume_set'?.02:1.1);}
  return actual.state===expected.state;
}
export function actionFromSpace(device:HomeDevice,service:string,data:Record<string,unknown>):HomeAction{
  let capability=service as HomeCapability,value:number|undefined;
  if(service==='toggle')capability=device.entity.state==='on'?'turn_off':'turn_on';
  if(service==='open_cover'||service==='close_cover'){capability='set_cover_position';value=service==='open_cover'?100:0;}
  if(service==='turn_on'&&data.brightness!==undefined){capability='set_brightness';value=Math.round(Number(data.brightness)*100/255);}
  if(service==='turn_on'&&data.brightness_pct!==undefined){capability='set_brightness';value=Number(data.brightness_pct);}
  if(service==='set_cover_position')value=Number(data.position);
  if(service==='set_temperature')value=Number(data.temperature);
  if(service==='set_percentage')value=Number(data.percentage);
  if(service==='set_humidity')value=Number(data.humidity);
  if(service==='volume_set'||service==='set_volume_level'){capability='volume_set';value=Math.round(Number(data.volume_level)*100);}
  return validateHomeAction({deviceId:device.id,capability,...(value===undefined?{}:{value})},device);
}
export const homeControlTools=[
  {name:'home.devices',description:'读取本家庭已部署设备、房间、状态、允许操作和数值范围',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'home.control.prepare',description:'准备包含多个设备的统一调控计划。返回待家人确认的计划，不执行设备。只能使用 home.devices 中授权的设备和能力。',inputSchema:{type:'object',properties:{title:{type:'string',maxLength:100},steps:{type:'array',minItems:1,maxItems:12,items:{type:'object',properties:{deviceId:{type:'string'},capability:{type:'string',enum:Object.keys(capabilityLabels)},value:{type:'number'}},required:['deviceId','capability'],additionalProperties:false}}},required:['steps'],additionalProperties:false},annotations:{readOnlyHint:false}},
];
/** Small, explicit offline grammar. Model clients use the same structured tool above. */
export function isHomeControlRequest(text:string){return !/烟雾|燃气|失联|摔倒|求救|着火|漏水|冒烟|异常/.test(text)&&/(打开|关闭|开启|关掉|调到|调成|设置|调低|调高)/.test(text)&&/(灯|窗帘|空调|恒温|风扇|加湿|音量|开关)/.test(text);}
export function interpretDeviceActions(text:string,devices:HomeDevice[]):HomeAction[]{
  if(!isHomeControlRequest(text))throw new Error('请描述要调整的设备和目标状态');
  if(/不要|不用|别|取消|如果|假如|是否|怎么|如何|能否|吗|？|\?/.test(text))throw new Error('请明确这一次要执行的设备目标状态');
  const clauses=text.split(/[，,；;。\n]|然后|并且|同时|再把|并把/).map(x=>x.trim()).filter(Boolean);const actions:HomeAction[]=[];
  for(const clause of clauses){
    let candidates=devices.filter(d=>clause.includes(d.name)||clause.includes(d.id));
    if(!candidates.length){const domain=/窗帘/.test(clause)?'cover':/空调|恒温/.test(clause)?'climate':/灯/.test(clause)?'light':/风扇/.test(clause)?'fan':/加湿/.test(clause)?'humidifier':/音量/.test(clause)?'media_player':/开关/.test(clause)?'switch':'';candidates=devices.filter(d=>d.id.startsWith(domain+'.')&&(clause.includes(d.entity.attributes.room_name as string)||!/(客厅|厨房|卧室|浴室)/.test(clause)));}
    if(candidates.length!==1)throw new Error(candidates.length?'有多个设备符合描述，请使用完整设备名称。':'没有找到已部署的对应设备，请先在智能设备中添加。');
    const device=candidates[0],number=clause.match(/(-?\d+(?:\.\d+)?)\s*(?:%|％|度|℃)?/),value=number?Number(number[1]):undefined;
    const domain=device.id.split('.')[0];let capability:HomeCapability;
    if(domain==='cover'){capability='set_cover_position';}
    else if(domain==='climate')capability='set_temperature';
    else if(value!==undefined)capability=domain==='light'?'set_brightness':domain==='fan'?'set_percentage':domain==='humidifier'?'set_humidity':'volume_set';
    else capability=/关闭|关掉/.test(clause)?'turn_off':'turn_on';
    const action=validateHomeAction({deviceId:device.id,capability,...(capabilityRanges[capability]?{value:value??(/关闭|关掉/.test(clause)?0:100)}:{})},device);
    if(actions.some(x=>x.deviceId===device.id))throw new Error('同一计划请为每台设备指定一个目标状态');actions.push(action);
  }
  return actions;
}
