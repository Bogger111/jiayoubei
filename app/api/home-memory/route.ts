import {apiError,requireSession,unauthorized} from '@/lib/server/session';
import {privateJson} from '@/lib/server/json-response';
import {readObjectBody} from '@/lib/server/request-body';
import {listJournal,seedJournal,addJournal,updateJournal,removeJournal,queryHomeMemory,clearHomeMemory} from '@/lib/server/home-memory-service';
import {ProductInputError} from '@/lib/product-input';
export async function GET(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();return privateJson({entries:await listJournal(s.user)});}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();const b=await readObjectBody(request);if(b.operation==='clear')return privateJson(await clearHomeMemory(s.user,b.confirmed));if(b.operation==='seed')return privateJson({entries:await seedJournal(s.user)});if(b.operation==='query')return privateJson(await queryHomeMemory(s.user,String(b.query??'')));if(b.operation==='remove'){await removeJournal(s.user,String(b.id??''));return privateJson({removed:true})}if(b.operation==='update')return privateJson({entry:await updateJournal(s.user,b)});if(b.operation==='add')return privateJson({entry:await addJournal(s.user,b)},{status:201});throw new ProductInputError('不支持的记忆操作');}catch(e){return apiError(e)}}
