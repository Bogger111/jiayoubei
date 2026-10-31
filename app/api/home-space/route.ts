import {apiError,requireSession,unauthorized} from '@/lib/server/session';
import {privateJson} from '@/lib/server/json-response';
import {readObjectBody} from '@/lib/server/request-body';
import {readHomeSpace,writeHomeSpace,listHomeSpaceHistory} from '@/lib/server/home-space-service';
import {withHomeDevices} from '@/lib/server/home-control-service';
import {ProductInputError} from '@/lib/product-input';
export async function GET(request:Request){try{const session=await requireSession(request);if(!session?.user)return unauthorized();return privateJson({space:await withHomeDevices(session.user,await readHomeSpace(session.user)),history:await listHomeSpaceHistory(session.user)});}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const session=await requireSession(request);if(!session?.user)return unauthorized();const input=await readObjectBody(request);if(input.operation==='sample_device')throw new ProductInputError('请通过统一设备计划确认操作',409);return privateJson({space:await withHomeDevices(session.user,await writeHomeSpace(session.user,input))});}catch(e){return apiError(e)}}
