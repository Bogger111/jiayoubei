import {readRuntimeEnv} from '@/lib/runtime-env';
import {ProductInputError} from '@/lib/product-input';
export async function callHomeEngine(path:string,body:unknown,timeout=20_000){
  const base=readRuntimeEnv('HOME_ENGINE_URL'),token=readRuntimeEnv('HOME_ENGINE_TOKEN');
  if(!base||!token)throw new ProductInputError('本地模型服务尚未连接',503);
  const response=await fetch(base.replace(/\/$/,'')+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  const data=await response.json() as Record<string,unknown>;
  if(!response.ok)throw new ProductInputError(typeof data.detail==='string'?data.detail:'本地模型暂时不可用',502);
  return data;
}
export async function homeEngineHealth(){
  const base=readRuntimeEnv('HOME_ENGINE_URL'),token=readRuntimeEnv('HOME_ENGINE_TOKEN');if(!base||!token)return {available:false};
  try{const r=await fetch(base.replace(/\/$/,'')+'/health',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(4000)});return r.ok?{available:true,...await r.json() as Record<string,unknown>}:{available:false};}catch{return {available:false};}
}
