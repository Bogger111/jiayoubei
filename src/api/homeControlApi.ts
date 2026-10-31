import type {HomeDeviceWorkspace,HomeControlPlan,HomeAction} from '@/lib/home-control';
export async function homeControlRequest<T=HomeDeviceWorkspace>(input?:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
  const r=await fetch('/api/home-control',{method:input?'POST':'GET',headers:input?{'Content-Type':'application/json'}:undefined,body:input?JSON.stringify(input):undefined,signal});
  const d=await r.json() as T&{error?:string};if(!r.ok)throw new Error(d.error??'暂时无法读取家庭设备');return d;
}
export async function prepareDevicePlan(steps:HomeAction[],source:'space'|'device'|'agent',title='家庭设备调控'){return (await homeControlRequest<{plan:HomeControlPlan}>({operation:'prepare',steps,source,title})).plan;}
export const announceDeviceChange=()=>window.dispatchEvent(new Event('family-devices-changed'));
