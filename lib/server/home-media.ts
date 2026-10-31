import {env} from 'cloudflare:workers';
import {ProductInputError} from '@/lib/product-input';
import {ensureHomeSpaceSchema} from './home-space-service';
import type {SessionUser} from './session';

const database=()=>(env as unknown as {DB:D1Database}).DB;
function bucket(){const b=(env as unknown as {HOME_MEDIA?:R2Bucket}).HOME_MEDIA;if(!b)throw new ProductInputError('照片存储尚未连接，请检查家庭媒体配置',503);return b;}
export async function storeHomeMedia(user:SessionUser,file:File){
  if(!file.size||file.size>24*1024*1024)throw new ProductInputError('请选择小于 24 MB 的图片或 GLB 文件');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let type='';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)type='image/jpeg';
  else if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)type='image/png';
  else if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')type='image/webp';
  else if(new TextDecoder().decode(bytes.slice(4,8))==='ftyp'&&['heic','heix','hevc','hevx','mif1','msf1'].includes(new TextDecoder().decode(bytes.slice(8,12))))type='image/heic';
  else if(new TextDecoder().decode(bytes.slice(0,4))==='glTF'){
    if(bytes.length<20)throw new ProductInputError('GLB 文件不完整');
    const view=new DataView(bytes.buffer);if(view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.length)throw new ProductInputError('GLB 文件头无效');
    const jsonLength=view.getUint32(12,true);if(jsonLength>2*1024*1024||jsonLength+20>bytes.length)throw new ProductInputError('GLB 内容无效');
    let json:{buffers?:{uri?:string}[];images?:{uri?:string}[]};
    try{json=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+jsonLength)))}catch{throw new ProductInputError('GLB 内容无法读取')}
    if([...(json.buffers??[]),...(json.images??[])].some(x=>x.uri&&!x.uri.startsWith('data:')))throw new ProductInputError('请上传已嵌入资源的 GLB 文件');
    type='model/gltf-binary';
  }
  if(!type)throw new ProductInputError('支持 JPG、PNG、WebP 或 GLB 文件');
  const id='m_'+crypto.randomUUID().replaceAll('-',''),key=encodeURIComponent(user.familyId)+'/'+id;
  await ensureHomeSpaceSchema();
  await bucket().put(key,bytes,{httpMetadata:{contentType:type}});
  try{await database().prepare('INSERT INTO home_media (id,family_id,object_key,content_type,size,created_at) VALUES (?,?,?,?,?,?)').bind(id,user.familyId,key,type,bytes.length,Date.now()).run();}catch(e){await bucket().delete(key);throw e;}
  return {id,url:'/api/home-media/'+id,contentType:type,size:bytes.length};
}
export async function readHomeMedia(user:SessionUser,id:string){
  await ensureHomeSpaceSchema();
  const row=await database().prepare('SELECT object_key,content_type FROM home_media WHERE id=? AND family_id=?').bind(id,user.familyId).first<{object_key:string;content_type:string}>();
  if(!row)throw new ProductInputError('文件不存在',404);
  const object=await bucket().get(row.object_key);if(!object)throw new ProductInputError('文件暂时不可用',404);
  return {body:object.body,contentType:row.content_type};
}
