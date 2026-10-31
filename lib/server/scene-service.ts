import {env} from 'cloudflare:workers';
import {Buffer} from 'node:buffer';
import {ProductInputError} from '@/lib/product-input';
import {normalizeScenePlan,scenePlanConfig,sceneWorkspace,type SceneDraft,type SceneProviderStatus} from '@/lib/space/scene-plan';
import {validateSpaceConfig,type SpaceWorkspace} from '@/lib/space/types';
import {isFamilyAdmin,type SessionUser} from './session';
import {callHomeEngine} from './home-engine';
import {ensureHomeSpaceSchema,persistHomeSpace,readHomeSpace} from './home-space-service';
import {readHomeMedia} from './home-media';
import {addJournal} from './home-memory-service';
const db=()=>(env as unknown as {DB:D1Database}).DB;
const admin=(user:SessionUser)=>{if(!isFamilyAdmin(user))throw new ProductInputError('请由家庭管理员操作',403);};
export async function sceneProvider(user:SessionUser):Promise<SceneProviderStatus>{try{return {available:true,...await callHomeEngine('/v1/scene-provider',{familyId:user.familyId},4000)} as SceneProviderStatus;}catch{return {available:false,configured:false,provider:'deepseek',model:'deepseek-flash'};}}
export async function configureSceneProvider(user:SessionUser,input:Record<string,unknown>,request:Request){
  admin(user);const url=new URL(request.url),origin=request.headers.get('Origin');
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||(origin&&origin!==url.origin))throw new ProductInputError('请在本机打开家有备后配置接口',403);
  if(typeof input.apiKey!=='string'||!/^[A-Za-z0-9_.-]{16,256}$/.test(input.apiKey.trim()))throw new ProductInputError('请检查 DeepSeek API 密钥');
  return {available:true,...await callHomeEngine('/v1/scene-provider/configure',{familyId:user.familyId,apiKey:input.apiKey.trim()})};
}
async function draft(user:SessionUser,id:string){await ensureHomeSpaceSchema();const row=await db().prepare('SELECT version,data_json FROM home_scene_drafts WHERE id=? AND family_id=?').bind(id,user.familyId).first<{version:number;data_json:string}>();if(!row)throw new ProductInputError('场景草稿不存在',404);return {...JSON.parse(row.data_json),version:row.version} as SceneDraft;}
async function store(user:SessionUser,data:SceneDraft){const changed=await db().prepare('UPDATE home_scene_drafts SET status=?,data_json=?,updated_at=? WHERE id=? AND family_id=? AND version=? RETURNING id').bind(data.status,JSON.stringify(data),Date.now(),data.id,user.familyId,data.version).first();return changed?data:draft(user,data.id);}
export async function listSceneDrafts(user:SessionUser){await ensureHomeSpaceSchema();const rows=await db().prepare('SELECT version,data_json FROM home_scene_drafts WHERE family_id=? ORDER BY created_at DESC LIMIT 25').bind(user.familyId).all<{version:number;data_json:string}>();return {drafts:rows.results.map(r=>({...JSON.parse(r.data_json),version:r.version}) as SceneDraft),provider:await sceneProvider(user)};}
export async function readSceneDraft(user:SessionUser,id:string){
  let item=await draft(user,id);if(['completed','failed'].includes(item.status))return item;
  let remote:Record<string,unknown>;try{remote=await callHomeEngine('/v1/scene-plan/status',{id,familyId:user.familyId},5000);}catch{if(Date.now()-item.updatedAt>180_000)return store(user,{...item,status:'failed',stage:'上次生成的状态暂未确认',error:'本地服务暂时无法确认结果，请检查连接。本次没有自动重复提交。'});return item;}
  if(remote.status==='completed'){
    try{const result=remote.result as {plan:unknown;model:string;usage?:SceneDraft['usage']};const plan=normalizeScenePlan(result.plan);const config=scenePlanConfig(plan);validateSpaceConfig(config);item={...item,status:'completed',stage:'三维家居布局已生成',plan,config,model:result.model,usage:result.usage,seconds:Number(remote.seconds??0),updatedAt:Date.now()};}
    catch(e){item={...item,status:'failed',stage:'布局需要重新整理',error:e instanceof Error?e.message:'返回布局无效',updatedAt:Date.now()};}
  }else if(remote.status==='failed')item={...item,status:'failed',stage:String(remote.stage),error:String(remote.error??'本次生成未完成'),updatedAt:Date.now()};
  else item={...item,status:remote.status==='running'?'running':'queued',stage:String(remote.stage??item.stage),updatedAt:Date.now()};
  return store(user,item);
}
export async function createSceneDraft(user:SessionUser,input:Record<string,unknown>){
  admin(user);await ensureHomeSpaceSchema();
  if(!Array.isArray(input.photoIds)||input.photoIds.length<1||input.photoIds.length>12||input.photoIds.some(x=>typeof x!=='string'))throw new ProductInputError('请选择 1 至 12 张房间照片');
  const notes=typeof input.notes==='string'?input.notes.trim():'';if(notes.length>1000)throw new ProductInputError('补充要求请控制在 1000 字以内');
  const provider=await sceneProvider(user);if(!provider.available)throw new ProductInputError('请先启动家有备本地服务',503);if(!provider.configured)throw new ProductInputError('空间生成服务暂未就绪，请稍后再试');
  const id=typeof input.id==='string'&&/^p_[a-f0-9]{32}$/.test(input.id)?input.id:'p_'+crypto.randomUUID().replaceAll('-','');
  const old=await db().prepare('SELECT id FROM home_scene_drafts WHERE id=?').bind(id).first();if(old)return readSceneDraft(user,id);
  const photoIds=input.photoIds as string[],images:string[]=[];let size=0;
  for(const photo of photoIds){const row=await db().prepare('SELECT content_type,size FROM home_media WHERE id=? AND family_id=?').bind(photo,user.familyId).first<{content_type:string;size:number}>();if(!row||!row.content_type.startsWith('image/'))throw new ProductInputError('照片不存在或不属于当前家庭');size+=row.size;if(row.size>8*1024*1024||size>12*1024*1024)throw new ProductInputError('照片较大，请压缩后再生成');const file=await readHomeMedia(user,photo);images.push(Buffer.from(await new Response(file.body).arrayBuffer()).toString('base64'));}
  const now=Date.now();let item:SceneDraft={id,version:1,status:'queued',stage:'照片已保存，等待整理',createdAt:now,updatedAt:now,photoIds,model:'deepseek-flash',source:input.source==='public_example'?'public_example':'user_photos'};
  const inserted=await db().prepare('INSERT INTO home_scene_drafts (id,family_id,status,version,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id').bind(id,user.familyId,item.status,1,JSON.stringify(item),now,now).first();
  if(!inserted)return readSceneDraft(user,id);
  try{const result=await callHomeEngine('/v1/scene-plan',{id,familyId:user.familyId,images,notes},20_000);item={...item,status:result.status==='running'?'running':'queued',stage:String(result.stage??item.stage)};}
  catch(e){item=e instanceof ProductInputError?{...item,status:'failed',stage:'本次生成尚未开始',error:e.message}:{...item,status:'queued',stage:'正在确认生成任务是否已开始'};}
  return store(user,item);
}
export async function editSceneDraft(user:SessionUser,input:Record<string,unknown>){
  admin(user);const item=await draft(user,String(input.id??''));if(item.status!=='completed')throw new ProductInputError('请等待布局完成');if(input.version!==item.version)throw new ProductInputError('草稿已更新，请重新读取',409);
  try{validateSpaceConfig(input.config)}catch{throw new ProductInputError('家具布局格式无效')}
  if(Object.keys(input.config.models??{}).length||input.config.photoScanId!==undefined)throw new ProductInputError('请在当前家具库中调整布局');
  const next={...item,config:{...input.config,side_panel:false,background:{show:false}},version:item.version+1,updatedAt:Date.now()};
  const row=await db().prepare('UPDATE home_scene_drafts SET data_json=?,version=?,updated_at=? WHERE id=? AND family_id=? AND version=? RETURNING id').bind(JSON.stringify(next),next.version,next.updatedAt,item.id,user.familyId,item.version).first();if(!row)throw new ProductInputError('草稿已更新，请重新读取',409);return next;
}
export async function applySceneDraft(user:SessionUser,input:Record<string,unknown>){
  admin(user);const item=await draft(user,String(input.id??''));if(item.status!=='completed'||!item.config)throw new ProductInputError('请先完成场景生成');if(input.draftVersion!==item.version)throw new ProductInputError('草稿已更新，请重新读取',409);
  const before=await readHomeSpace(user);if(input.spaceVersion!==before.version)throw new ProductInputError('家庭空间已被家人更新，请重新读取后再应用',409);
  const config={...item.config,sceneDraftId:item.id,sceneDraftVersion:item.version,sceneTitle:item.plan?.title??'照片里的家'};
  const next=sceneWorkspace(config);const space=await persistHomeSpace(user,before,{...next,updatedAt:Date.now()});let memoryWarning:string|undefined;
  try{await addJournal(user,{title:'更新了家的三维布局',description:`使用 ${item.photoIds.length} 张${item.source==='public_example'?'公开样例':'家庭'}照片整理房间与家具，${user.name}确认后保存了「${String(config.sceneTitle)}」。`,category:'space',room:'全屋',mediaId:item.photoIds[0]});}catch{memoryWarning='空间已保存，记忆记录暂未添加。';}
  return {space:space as SpaceWorkspace,previousVersion:before.version,memoryWarning};
}
