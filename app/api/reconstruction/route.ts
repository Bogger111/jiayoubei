import {apiError,requireSession,unauthorized} from '@/lib/server/session';
import {privateJson} from '@/lib/server/json-response';
import {readObjectBody} from '@/lib/server/request-body';
import {listScans,readScan,startScan,saveScanEdits} from '@/lib/server/reconstruction-service';
import {ProductInputError} from '@/lib/product-input';
export async function GET(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();const id=new URL(request.url).searchParams.get('id');return privateJson(id?{job:await readScan(s.user,id)}:await listScans(s.user));}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();const input=await readObjectBody(request);if(input.operation==='create')return privateJson({job:await startScan(s.user,input)},{status:202});if(input.operation==='save_edits')return privateJson({edits:await saveScanEdits(s.user,String(input.id??''),input.edits)});throw new ProductInputError('不支持的扫描操作');}catch(e){return apiError(e)}}
