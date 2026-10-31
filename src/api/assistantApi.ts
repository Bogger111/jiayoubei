import type {AssistantRun} from '@/lib/assistant';
export type AssistantConversation={id:string;title:string;updatedAt:number};
export async function assistantRequest<T>(body?:Record<string,unknown>,query?:Record<string,string>,signal?:AbortSignal):Promise<T>{
  const url='/api/assistant'+(query?'?'+new URLSearchParams(query):'');
  const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal,cache:'no-store'});
  const data=await response.json() as T&{error?:string};if(!response.ok)throw new Error(data.error??'助手暂时无法连接，请稍后再试');return data;
}
export const runKey=()=> 'ar_'+crypto.randomUUID().replaceAll('-','');
export const conversationKey=()=> 'chat_'+crypto.randomUUID().replaceAll('-','');
export const isActiveRun=(run:AssistantRun)=>run.status==='planning'||run.status==='running';
