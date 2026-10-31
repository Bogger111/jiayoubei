import {requireSession,unauthorized,apiError} from '@/lib/server/session';
import {privateJson} from '@/lib/server/json-response';
import {readObjectBody} from '@/lib/server/request-body';
import {readHomeWorkspace,homeCommand} from '@/lib/server/multimodal-service';
export async function GET(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();return privateJson(await readHomeWorkspace(s.user))}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();return privateJson(await homeCommand(s.user,await readObjectBody(request)))}catch(e){return apiError(e)}}
