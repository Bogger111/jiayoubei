import {env} from 'cloudflare:workers';
import sampleHome from '@/lib/space/demo-home.json';
import {validateSpaceConfig,type SpaceWorkspace} from '@/lib/space/types';
import {ProductInputError} from '@/lib/product-input';
import {isFamilyAdmin,type SessionUser} from './session';

const database=()=>(env as unknown as {DB:D1Database}).DB;
export async function ensureHomeSpaceSchema(){
  await database().batch([
    database().prepare('CREATE TABLE IF NOT EXISTS home_spaces (family_id TEXT PRIMARY KEY,version INTEGER NOT NULL,data_json TEXT NOT NULL,updated_at INTEGER NOT NULL)'),
    database().prepare('CREATE TABLE IF NOT EXISTS home_media (id TEXT PRIMARY KEY,family_id TEXT NOT NULL,object_key TEXT NOT NULL,content_type TEXT NOT NULL,size INTEGER NOT NULL,created_at INTEGER NOT NULL)'),
    database().prepare('CREATE INDEX IF NOT EXISTS home_media_family ON home_media(family_id,created_at)'),
    database().prepare('CREATE TABLE IF NOT EXISTS home_reconstructions (id TEXT PRIMARY KEY,family_id TEXT NOT NULL,status TEXT NOT NULL,data_json TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)'),
    database().prepare('CREATE TABLE IF NOT EXISTS home_scene_drafts (id TEXT PRIMARY KEY,family_id TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL,data_json TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)'),
    database().prepare('CREATE TABLE IF NOT EXISTS home_space_history (family_id TEXT NOT NULL,version INTEGER NOT NULL,data_json TEXT NOT NULL,saved_at INTEGER NOT NULL,PRIMARY KEY(family_id,version))'),
  ]);
}
export function sampleSpace():SpaceWorkspace{
  const data=structuredClone(sampleHome) as unknown as Pick<SpaceWorkspace,'config'|'states'|'areas'|'entities'>;
  data.config.background={show:false};
  return {...data,sample:true,version:0,updatedAt:null};
}
export async function readHomeSpace(user:SessionUser):Promise<SpaceWorkspace>{
  await ensureHomeSpaceSchema();
  const row=await database().prepare('SELECT version,data_json,updated_at FROM home_spaces WHERE family_id=?').bind(user.familyId).first<{version:number;data_json:string;updated_at:number}>();
  if(row)return {...JSON.parse(row.data_json),version:row.version,updatedAt:row.updated_at};
  const demo=(env as unknown as {AUTH_MODE?:string}).AUTH_MODE!=='real';
  return demo?sampleSpace():{version:0,updatedAt:null,config:{type:'custom:diorama-card',rooms:[],background:{show:false},side_panel:true},states:{},areas:{},entities:{},sample:false};
}
export async function writeHomeSpace(user:SessionUser,input:Record<string,unknown>){
  if(!isFamilyAdmin(user))throw new ProductInputError('编辑家庭空间需要管理员权限',403);
  const before=await readHomeSpace(user);
  if(!Number.isInteger(input.version)||input.version!==before.version)throw new ProductInputError('空间已被其他家人更新，请重新读取后再保存',409);
  let next=before;
  if(input.operation==='load_sample')next=sampleSpace();
  else if(input.operation==='restore'){
    if(!Number.isInteger(input.restoreVersion)||Number(input.restoreVersion)<0)throw new ProductInputError('历史版本无效');
    const row=await database().prepare('SELECT data_json FROM home_space_history WHERE family_id=? AND version=?').bind(user.familyId,Number(input.restoreVersion)).first<{data_json:string}>();
    if(!row)throw new ProductInputError('历史布局不存在',404);next=JSON.parse(row.data_json) as SpaceWorkspace;
  }
  else if(input.operation==='save'){
    try{validateSpaceConfig(input.config)}catch(e){throw new ProductInputError(e instanceof Error?e.message:'布局无效')}
    if(input.config.photoScanId!==undefined){if(typeof input.config.photoScanId!=='string')throw new ProductInputError('扫描标识无效');const scan=await database().prepare("SELECT id FROM home_reconstructions WHERE id=? AND family_id=? AND status='completed'").bind(input.config.photoScanId,user.familyId).first();if(!scan)throw new ProductInputError('请使用当前家庭已经完成的扫描');}
    next={...before,config:{...input.config,background:{show:false}}};
  }else throw new ProductInputError('不支持的空间操作');
  return persistHomeSpace(user,before,next);
}
export async function listHomeSpaceHistory(user:SessionUser){await ensureHomeSpaceSchema();const rows=await database().prepare('SELECT version,saved_at,data_json FROM home_space_history WHERE family_id=? ORDER BY version DESC LIMIT 15').bind(user.familyId).all<{version:number;saved_at:number;data_json:string}>();return rows.results.map(r=>{const space=JSON.parse(r.data_json) as SpaceWorkspace;return {version:r.version,savedAt:r.saved_at,title:String(space.config.sceneTitle??(space.sample?'示例家庭空间':'家庭布局')),rooms:space.config.rooms.length};});}
export async function persistHomeSpace(user:SessionUser,before:SpaceWorkspace,next:SpaceWorkspace){
  await database().prepare('INSERT OR IGNORE INTO home_space_history (family_id,version,data_json,saved_at) VALUES (?,?,?,?)').bind(user.familyId,before.version,JSON.stringify(before),Date.now()).run();
  const now=Date.now(),version=before.version+1;
  const result=await database().prepare('INSERT INTO home_spaces (family_id,version,data_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(family_id) DO UPDATE SET version=excluded.version,data_json=excluded.data_json,updated_at=excluded.updated_at WHERE home_spaces.version=? RETURNING version').bind(user.familyId,version,JSON.stringify({...next,version,updatedAt:now}),now,before.version).first();
  if(!result)throw new ProductInputError('空间已更新，请重新读取',409);
  return {...next,version,updatedAt:now};
}
