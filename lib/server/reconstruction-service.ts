import {env} from 'cloudflare:workers';
import {Buffer} from 'node:buffer';
import {readRuntimeEnv} from '@/lib/runtime-env';
import {ProductInputError} from '@/lib/product-input';
import {validateScanEdits,type ScanJob,type ScanEdits} from '@/lib/space/reconstruction';
import {callHomeEngine,homeEngineHealth} from './home-engine';
import {readHomeMedia,storeHomeMedia} from './home-media';
import {ensureHomeSpaceSchema} from './home-space-service';
import {isFamilyAdmin,type SessionUser} from './session';
const db=()=>(env as unknown as {DB:D1Database}).DB;
async function setup(){await ensureHomeSpaceSchema();await db().prepare('CREATE TABLE IF NOT EXISTS home_scan_edits (id TEXT NOT NULL,family_id TEXT NOT NULL,version INTEGER NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(id,family_id))').run();}
async function edits(user:SessionUser,id:string):Promise<ScanEdits>{const r=await db().prepare('SELECT version,data_json FROM home_scan_edits WHERE id=? AND family_id=?').bind(id,user.familyId).first<{version:number;data_json:string}>();return r?{...JSON.parse(r.data_json),version:r.version}:{version:0,objects:{},metersPerUnit:1};}
async function row(user:SessionUser,id:string){const r=await db().prepare('SELECT data_json,status,updated_at FROM home_reconstructions WHERE id=? AND family_id=?').bind(id,user.familyId).first<{data_json:string;status:string;updated_at:number}>();if(!r)throw new ProductInputError('扫描不存在',404);return r;}
export async function readScan(user:SessionUser,id:string):Promise<ScanJob>{
  await setup();const saved=await row(user,id);let job=JSON.parse(saved.data_json) as ScanJob;
  if(job.status==='completed'||job.status==='failed')return {...job,edits:await edits(user,id)};
  let remote:Record<string,unknown>;try{remote=await callHomeEngine('/v1/reconstruction-status',{id,familyId:user.familyId},5000);}catch{return {...job,stage:job.status==='preparing'?'正在连接本地重建服务':'正在等待本地重建进展'};}
  if(remote.status==='completed'){
    const lease=await db().prepare("UPDATE home_reconstructions SET status='saving',updated_at=? WHERE id=? AND family_id=? AND (status NOT IN ('saving','completed') OR (status='saving' AND updated_at<?)) RETURNING id").bind(Date.now(),id,user.familyId,Date.now()-90_000).first();
    if(!lease)return {...job,status:'saving',stage:'正在保存家庭扫描',progress:95};
    try{
      const base=readRuntimeEnv('HOME_ENGINE_URL')!,token=readRuntimeEnv('HOME_ENGINE_TOKEN')!;
      const response=await fetch(base.replace(/\/$/,'')+'/v1/artifacts/'+id+'/scene.glb?family='+encodeURIComponent(user.familyId),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30_000)});
      if(!response.ok)throw new Error('模型文件尚未就绪');
      const bytes=await response.arrayBuffer();const media=await storeHomeMedia(user,new File([bytes],'scene.glb',{type:'model/gltf-binary'}));
      const previewResponse=await fetch(base.replace(/\/$/,'')+'/v1/artifacts/'+id+'/preview.jpg?family='+encodeURIComponent(user.familyId),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10_000)});
      let preview:Awaited<ReturnType<typeof storeHomeMedia>>|undefined;
      if(previewResponse.ok)preview=await storeHomeMedia(user,new File([await previewResponse.arrayBuffer()],'preview.jpg',{type:'image/jpeg'}));
      job={...job,status:'completed',stage:'家庭扫描已生成',progress:100,result:remote.result as ScanJob['result'],modelUrl:media.url,previewUrl:preview?.url,previewMediaId:preview?.id,updatedAt:Date.now()};
    }catch(e){await db().prepare("UPDATE home_reconstructions SET status='running',updated_at=? WHERE id=? AND family_id=?").bind(Date.now(),id,user.familyId).run();throw new ProductInputError(e instanceof Error?e.message:'模型保存失败',503);}
  }else job={...job,status:remote.status as ScanJob['status'],progress:Number(remote.progress??0),stage:String(remote.stage??job.stage),error:typeof remote.error==='string'?remote.error:undefined,updatedAt:Date.now()};
  await db().prepare('UPDATE home_reconstructions SET status=?,data_json=?,updated_at=? WHERE id=? AND family_id=?').bind(job.status,JSON.stringify(job),job.updatedAt,id,user.familyId).run();
  return {...job,edits:await edits(user,id)};
}
export async function listScans(user:SessionUser){await setup();const r=await db().prepare('SELECT data_json FROM home_reconstructions WHERE family_id=? ORDER BY created_at DESC LIMIT 30').bind(user.familyId).all<{data_json:string}>();return {jobs:r.results.map(x=>JSON.parse(x.data_json) as ScanJob),engine:await homeEngineHealth()};}
export async function startScan(user:SessionUser,input:Record<string,unknown>){
  if(!isFamilyAdmin(user))throw new ProductInputError('创建家庭扫描需要管理员权限',403);
  await setup();if(!Array.isArray(input.photoIds)||input.photoIds.length<2||input.photoIds.length>32||input.photoIds.some(x=>typeof x!=='string'))throw new ProductInputError('请选择 2 至 32 张相互重叠的照片');
  const id=typeof input.id==='string'&&/^r_[a-f0-9]{32}$/.test(input.id)?input.id:'r_'+crypto.randomUUID().replaceAll('-','');
  const old=await db().prepare('SELECT id FROM home_reconstructions WHERE id=?').bind(id).first();if(old)return readScan(user,id);
  const photos=input.photoIds as string[],images:string[]=[];let total=0;
  for(const photo of photos){const media=await db().prepare("SELECT id,content_type,size FROM home_media WHERE id=? AND family_id=?").bind(photo,user.familyId).first<{id:string;content_type:string;size:number}>();if(!media||!media.content_type.startsWith('image/'))throw new ProductInputError('照片不存在或不属于当前家庭');if(media.size>12*1024*1024)throw new ProductInputError('单张重建照片请控制在 12 MB 以内');total+=media.size;if(total>20*1024*1024)throw new ProductInputError('这组照片过大，请分成两次重建');const file=await readHomeMedia(user,photo);images.push(Buffer.from(await new Response(file.body).arrayBuffer()).toString('base64'));}
  const now=Date.now();let job:ScanJob={id,status:'preparing',stage:'照片已保存，正在准备重建',progress:0,createdAt:now,updatedAt:now,photoIds:photos,source:input.source==='public_example'?'public_example':'user_photos'};
  await db().prepare('INSERT INTO home_reconstructions (id,family_id,status,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id,user.familyId,job.status,JSON.stringify(job),now,now).run();
  try{const result=await callHomeEngine('/v1/reconstruct',{id,familyId:user.familyId,images},30_000);job={...job,status:result.status as ScanJob['status'],stage:String(result.stage),progress:Number(result.progress)};}catch(e){job={...job,status:'failed',stage:'本次重建尚未开始',error:e instanceof Error?e.message:'本地服务未连接'};}
  await db().prepare('UPDATE home_reconstructions SET status=?,data_json=? WHERE id=? AND family_id=?').bind(job.status,JSON.stringify(job),id,user.familyId).run();return job;
}
export async function saveScanEdits(user:SessionUser,id:string,input:unknown){
  if(!isFamilyAdmin(user))throw new ProductInputError('编辑家庭扫描需要管理员权限',403);
  await setup();const saved=JSON.parse((await row(user,id)).data_json) as ScanJob;if(saved.status!=='completed'||!saved.result)throw new ProductInputError('请等待扫描完成');
  try{validateScanEdits(input,saved.result)}catch(e){throw new ProductInputError(e instanceof Error?e.message:'家具调整无效')}
  const current=await edits(user,id);if(input.version!==current.version)throw new ProductInputError('家具调整已被其他家人更新，请重新读取',409);
  const version=current.version+1;const changed=await db().prepare('INSERT INTO home_scan_edits (id,family_id,version,data_json) VALUES (?,?,?,?) ON CONFLICT(id,family_id) DO UPDATE SET version=excluded.version,data_json=excluded.data_json WHERE home_scan_edits.version=? RETURNING version').bind(id,user.familyId,version,JSON.stringify({...input,version}),current.version).first();if(!changed)throw new ProductInputError('家具调整已更新，请重新读取',409);return {...input,version};
}
