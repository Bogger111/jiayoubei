import {apiError,requireSession,unauthorized} from '@/lib/server/session';
import {privateJson} from '@/lib/server/json-response';
import {readObjectBody} from '@/lib/server/request-body';
import {homeControlCommand,readHomeDevices,readHomeControlPlan} from '@/lib/server/home-control-service';
export async function GET(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();const id=new URL(request.url).searchParams.get('id');return privateJson(id?{plan:await readHomeControlPlan(s.user,id)}:await readHomeDevices(s.user));}catch(e){return apiError(e);}}
export async function POST(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();return privateJson(await homeControlCommand(s.user,await readObjectBody(request)));}catch(e){return apiError(e);}}
