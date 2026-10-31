import {env} from 'cloudflare:workers';
import {listMemories} from '@/lib/memory-store';
import {ensureProductSchema as ensureMemorySchema} from '@/lib/memory-store';
import {MULTIMODAL_DDL} from './multimodal-schema';
import {ProductInputError} from '@/lib/product-input';
import {isFamilyAdmin,type SessionUser} from './session';
import {callHomeEngine} from './home-engine';
import {extractiveMemoryAnswer,rankMemoryDocuments,type JournalEntry,type MemoryDocument,type MemorySearchResult} from '@/lib/home-memory';

const db=()=>(env as unknown as {DB:D1Database}).DB;
export async function ensureJournalSchema(){await db().batch([
  db().prepare('CREATE TABLE IF NOT EXISTS home_journal (id TEXT PRIMARY KEY,family_id TEXT NOT NULL,data_json TEXT NOT NULL,occurred_at INTEGER NOT NULL,created_at INTEGER NOT NULL)'),
  db().prepare('CREATE INDEX IF NOT EXISTS home_journal_family ON home_journal(family_id,occurred_at)'),
  db().prepare('CREATE TABLE IF NOT EXISTS home_memory_vectors (family_id TEXT NOT NULL,document_id TEXT NOT NULL,content_hash TEXT NOT NULL,model TEXT NOT NULL,vector_json TEXT NOT NULL,PRIMARY KEY(family_id,document_id))'),
  ...MULTIMODAL_DDL.map(sql=>db().prepare(sql)),
]);}
export async function listJournal(user:SessionUser){
  await ensureJournalSchema();
  const result=await db().prepare('SELECT data_json FROM home_journal WHERE family_id=? ORDER BY occurred_at DESC LIMIT 300').bind(user.familyId).all<{data_json:string}>();
  return result.results.map(x=>JSON.parse(x.data_json) as JournalEntry);
}
export async function clearHomeMemory(user:SessionUser,confirmed:unknown){
  if(!isFamilyAdmin(user))throw new ProductInputError('清空家庭记忆需要管理员权限',403);
  if(confirmed!==true)throw new ProductInputError('请确认清空当前家庭记忆');
  await ensureJournalSchema();await ensureMemorySchema();
  // Layouts, device registrations, media and execution receipts have separate lifecycles.
  await db().batch(['home_journal','home_memory_vectors','family_memories','home_observations'].map(table=>db().prepare(`DELETE FROM ${table} WHERE family_id=?`).bind(user.familyId)));
  return {cleared:true};
}
export async function seedJournal(user:SessionUser){
  if(!isFamilyAdmin(user))throw new ProductInputError('请由家庭管理员添加示例',403);
  const rows=await listJournal(user);const now=Date.now();
  const samples:Omit<JournalEntry,'id'|'createdAt'>[]=[
    {title:'厨房里的一次提醒',description:'厨房记录示例：空气炸锅提示音响起，家中的助手提醒留意食物。',category:'activity',room:'厨房',occurredAt:now-25*60_000,mediaUrl:'/integrations/demo-media/airfryer.png',source:'示例记录',confirmed:false,sample:true},
    {title:'猫咪来到门廊',description:'门廊记录示例：摄像头画面里有猫咪停留，可以回看这段家庭动态。',category:'pet',room:'门廊',occurredAt:now-95*60_000,mediaUrl:'/integrations/demo-media/backyard.gif',source:'示例记录',confirmed:false,sample:true},
    {title:'保存了家庭空间',description:'空间档案示例：客厅、厨房、卧室和浴室的布局已整理为可交互的家庭模型。',category:'space',room:'全屋',occurredAt:now-25*60*60_000,mediaUrl:'/integrations/demo-media/space.png',source:'示例记录',confirmed:true,sample:true},
  ];
  for(let i=0;i<samples.length;i++){const id='sample_'+user.familyId+'_'+i;if(rows.some(r=>r.id===id))continue;const entry={...samples[i],id,createdAt:now};await db().prepare('INSERT OR IGNORE INTO home_journal (id,family_id,data_json,occurred_at,created_at) VALUES (?,?,?,?,?)').bind(id,user.familyId,JSON.stringify(entry),entry.occurredAt,now).run();}
  return listJournal(user);
}
export async function addJournal(user:SessionUser,input:Record<string,unknown>){
  await ensureJournalSchema();
  const str=(key:string,max:number,optional=false)=>{const v=input[key];if(optional&&(v===undefined||v===''))return '';if(typeof v!=='string'||!v.trim()||v.length>max)throw new ProductInputError('请检查'+({title:'标题',description:'内容',room:'房间',mediaId:'图片'}[key]??key));return v.trim();};
  const title=str('title',160),description=str('description',4000),room=str('room',80,true),mediaId=str('mediaId',100,true);
  const category=['activity','delivery','pet','device','care','note','space'].includes(String(input.category))?input.category as JournalEntry['category']:'note';
  let mediaUrl='';if(mediaId){const row=await db().prepare('SELECT id,content_type FROM home_media WHERE id=? AND family_id=?').bind(mediaId,user.familyId).first<{id:string;content_type:string}>();if(!row||!row.content_type.startsWith('image/'))throw new ProductInputError('图片不存在或不属于当前家庭');mediaUrl='/api/home-media/'+mediaId;}
  const now=Date.now(),occurredAt=typeof input.occurredAt==='number'?input.occurredAt:now;
  if(!Number.isFinite(occurredAt)||occurredAt<0||occurredAt>now+5*60_000)throw new ProductInputError('记录时间无效');
  const entry:JournalEntry={id:'j_'+crypto.randomUUID().replaceAll('-',''),title,description,category,room,mediaUrl,occurredAt,createdAt:now,source:user.name+'补充',confirmed:true,sample:false,version:1};
  await db().prepare('INSERT INTO home_journal (id,family_id,data_json,occurred_at,created_at) VALUES (?,?,?,?,?)').bind(entry.id,user.familyId,JSON.stringify(entry),occurredAt,now).run();return entry;
}
export async function removeJournal(user:SessionUser,id:string){if(!isFamilyAdmin(user))throw new ProductInputError('删除家庭记忆需要管理员权限',403);await ensureJournalSchema();const result=await db().prepare('DELETE FROM home_journal WHERE id=? AND family_id=? RETURNING id').bind(id,user.familyId).first();if(!result)throw new ProductInputError('记忆不存在',404);await db().prepare('DELETE FROM home_memory_vectors WHERE family_id=? AND document_id=?').bind(user.familyId,'journal:'+id).run();}
export async function updateJournal(user:SessionUser,input:Record<string,unknown>){
  if(!isFamilyAdmin(user))throw new ProductInputError('修改家庭记忆需要管理员权限',403);
  await ensureJournalSchema();
  const row=await db().prepare('SELECT data_json FROM home_journal WHERE id=? AND family_id=?').bind(String(input.id??''),user.familyId).first<{data_json:string}>();
  if(!row)throw new ProductInputError('记忆不存在',404);
  const previous=JSON.parse(row.data_json) as JournalEntry;
  if(!Number.isInteger(input.version)||input.version!==(previous.version??0))throw new ProductInputError('这段记忆已有更新，请关闭后刷新页面再编辑',409);
  const field=(key:string,max:number,optional=false)=>{const value=input[key];if(optional&&value==='')return '';if(typeof value!=='string'||!value.trim()||value.length>max)throw new ProductInputError('请检查记忆的标题、内容和位置');return value.trim();};
  const title=field('title',160),description=field('description',4000),room=field('room',80,true);
  let mediaUrl=previous.mediaUrl;
  if(input.mediaId!==undefined){
    if(typeof input.mediaId!=='string'||input.mediaId.length>100)throw new ProductInputError('图片无效');
    const media=await db().prepare('SELECT id,content_type FROM home_media WHERE id=? AND family_id=?').bind(input.mediaId,user.familyId).first<{id:string;content_type:string}>();
    if(!media||!media.content_type.startsWith('image/'))throw new ProductInputError('图片不存在或不属于当前家庭');
    mediaUrl='/api/home-media/'+media.id;
  }
  const entry:JournalEntry={...previous,title,description,room,mediaUrl,updatedAt:Date.now(),version:(previous.version??0)+1};
  const saved=await db().prepare('UPDATE home_journal SET data_json=? WHERE id=? AND family_id=? AND data_json=? RETURNING id').bind(JSON.stringify(entry),entry.id,user.familyId,row.data_json).first();
  if(!saved)throw new ProductInputError('这段记忆已有更新，请关闭后刷新页面再编辑',409);
  await db().prepare('DELETE FROM home_memory_vectors WHERE family_id=? AND document_id=?').bind(user.familyId,'journal:'+entry.id).run();
  return entry;
}
export async function memoryDocuments(user:SessionUser):Promise<MemoryDocument[]>{
  const journal=await listJournal(user),profiles=await listMemories(user.familyId);
  const observations=await db().prepare('SELECT data_json FROM home_observations WHERE family_id=? ORDER BY observed_at DESC LIMIT 150').bind(user.familyId).all<{data_json:string}>();
  return [
    ...journal.map(e=>({id:'journal:'+e.id,title:e.title,content:e.description,source:e.source+(e.room?' · '+e.room:''),occurredAt:e.occurredAt,kind:'journal' as const,mediaUrl:e.mediaUrl})),
    ...profiles.map(e=>({id:'profile:'+e.id,title:e.member+'的'+({habit:'生活习惯',profile:'家庭资料',preference:'联系偏好',event:'记录'}[e.type]??'记忆'),content:e.content,source:e.source,occurredAt:Date.parse(e.createdAt)||0,kind:'profile' as const})),
    ...observations.results.map(row=>{const e=JSON.parse(row.data_json);return {id:'observation:'+e.uid,title:String(e.title),content:String(e.description),source:e.evidenceCategory==='synthetic'?'示例动态':String(e.camera_name),occurredAt:Date.parse(e.start)||0,kind:'observation' as const};}),
  ];
}
export async function queryHomeMemory(user:SessionUser,query:string):Promise<MemorySearchResult>{
  if(!query.trim()||query.length>600)throw new ProductInputError('请输入 600 字以内的问题');
  const docs=await memoryDocuments(user);let vectors:{query:number[];documents:Record<string,number[]>}|undefined;let model='';
  if(docs.length){try{
    const existing=await db().prepare('SELECT document_id,content_hash,model,vector_json FROM home_memory_vectors WHERE family_id=?').bind(user.familyId).all<{document_id:string;content_hash:string;model:string;vector_json:string}>();
    const cache=new Map(existing.results.map(e=>[e.document_id,e]));
    const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const hashes=await Promise.all(docs.map(d=>hash(d.title+'\n'+d.content)));
    // Resolve the current revision first so an upgraded local embedding model
    // refreshes unchanged documents as well as newly added memories.
    const queryVector=await callHomeEngine('/v1/embeddings',{texts:[query],query:true},60_000) as {vectors:number[][];model:string};
    const pending=docs.filter((d,i)=>cache.get(d.id)?.content_hash!==hashes[i]||cache.get(d.id)?.model!==queryVector.model);
    const embedded=pending.length?await callHomeEngine('/v1/embeddings',{texts:pending.map(d=>(d.title+'\n'+d.content).slice(0,1600)),query:false},60_000) as {vectors:number[][];model:string}:{vectors:[],model:queryVector.model};
    const result={vectors:[queryVector.vectors[0],...embedded.vectors],model:embedded.model};
    if(!Array.isArray(result.vectors)||result.vectors.length!==pending.length+1)throw new Error('向量返回无效');
    model=result.model;
    const map:Record<string,number[]>={};for(const d of docs){const c=cache.get(d.id);if(c&&c.content_hash===hashes[docs.indexOf(d)]&&c.model===model)map[d.id]=JSON.parse(c.vector_json);}
    for(let i=0;i<pending.length;i++){const d=pending[i],v=result.vectors[i+1];map[d.id]=v;await db().prepare('INSERT INTO home_memory_vectors (family_id,document_id,content_hash,model,vector_json) VALUES (?,?,?,?,?) ON CONFLICT(family_id,document_id) DO UPDATE SET content_hash=excluded.content_hash,model=excluded.model,vector_json=excluded.vector_json').bind(user.familyId,d.id,hashes[docs.indexOf(d)],model,JSON.stringify(v)).run();}
    vectors={query:result.vectors[0],documents:map};
  }catch{vectors=undefined;}}
  const citations=rankMemoryDocuments(query,docs,vectors,6);
  let answer=extractiveMemoryAnswer(citations),generation:MemorySearchResult['generation']='extractive';
  if(citations.length){try{const result=await callHomeEngine('/v1/memory-answer',{query,contexts:citations.map((d,i)=>({number:i+1,title:d.title,content:d.content,source:d.source}))},90_000);if(typeof result.answer==='string'&&result.answer.trim()){answer=result.answer;generation=result.generation==='extractive'?'extractive':'local_model';}}catch{}}
  return {answer,citations,mode:vectors?'hybrid':'lexical',generation,...(model?{model}:{})};
}
