import {readRuntimeEnv} from '@/lib/runtime-env';
import {desiredEntity,homeService,entityMatches,type HomeDevice,type HomeAction,type HomeReceipt,type HomeDriver} from '@/lib/home-control';
import type {SpaceEntity} from '@/lib/space/types';

export interface HomeDeviceAdapter {
  readonly driver:HomeDriver;
  discover():Promise<SpaceEntity[]>;
  execute(device:HomeDevice,action:HomeAction):Promise<{entity?:SpaceEntity;receipt:HomeReceipt}>;
}
export function haConfigured(familyId:string){return readRuntimeEnv('DEVICE_DRIVER')==='home_assistant'&&readRuntimeEnv('HOME_ASSISTANT_FAMILY_ID')===familyId&&Boolean(readRuntimeEnv('HOME_ASSISTANT_URL')&&readRuntimeEnv('HOME_ASSISTANT_TOKEN'));}
export function homeAssistantAdapter(familyId:string):HomeDeviceAdapter{
  const request=async(path:string,body?:unknown)=>{
    if(!haConfigured(familyId))throw new Error('家庭设备网关尚未连接');
    const base=new URL(readRuntimeEnv('HOME_ASSISTANT_URL'));if(!['http:','https:'].includes(base.protocol))throw new Error('设备网关地址无效');
    const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+readRuntimeEnv('HOME_ASSISTANT_TOKEN'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error('设备网关暂时不可用');const text=await r.text();if(text.length>4_000_000)throw new Error('设备网关返回内容过大');return JSON.parse(text);
  };
  return {driver:'home_assistant',async discover(){const rows=await request('/api/states');if(!Array.isArray(rows))throw new Error('设备网关状态格式无效');return rows.filter(e=>e&&/^[a-z_]+\.[a-z0-9_]+$/.test(e.entity_id)&&typeof e.state==='string'&&e.attributes&&typeof e.attributes==='object').slice(0,2000) as SpaceEntity[];},async execute(device,action){
    const command=homeService(action),expected=desiredEntity(device.entity,action),at=Date.now();
    try{await request(`/api/services/${command.domain}/${command.service}`,command.data);}catch{return {receipt:{deviceId:device.id,status:'unknown',detail:'未获得确定回执，请核对设备状态。',at}};}
    try{const entity=await request('/api/states/'+encodeURIComponent(device.id)) as SpaceEntity;if(entity.entity_id!==device.id||typeof entity.state!=='string'||!entity.attributes)throw new Error('状态无效');const verified=entityMatches(entity,expected,action);return {entity,receipt:{deviceId:device.id,status:verified?'verified':'accepted',detail:verified?'已从设备接口回读到目标状态':'设备接口已接收，等待状态更新',at}};}catch{return {receipt:{deviceId:device.id,status:'accepted',detail:'设备接口已接收，稍后刷新状态',at}};}
  }};
}
export function sampleDeviceAdapter():HomeDeviceAdapter{return {driver:'sample',async discover(){return [];},async execute(device,action){return {entity:desiredEntity(device.entity,action),receipt:{deviceId:device.id,status:'simulated',detail:'样例设备状态已更新',at:Date.now()}};}};}
export function adapterFor(driver:HomeDriver,familyId:string){return driver==='home_assistant'?homeAssistantAdapter(familyId):sampleDeviceAdapter();}
