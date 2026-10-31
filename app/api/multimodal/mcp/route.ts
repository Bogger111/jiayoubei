import {requireSession,unauthorized,apiError} from '@/lib/server/session';
import {privateJson} from '@/lib/server/json-response';
import {readObjectBody} from '@/lib/server/request-body';
import {handleFamilyMcp} from '@/lib/server/multimodal-service';
export async function POST(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();const result=await handleFamilyMcp(s.user,await readObjectBody(request));return result===null?new Response(null,{status:204,headers:{'Cache-Control':'no-store'}}):privateJson(result)}catch(e){return apiError(e)}}
