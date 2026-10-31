import {requireSession,unauthorized,apiError} from '@/lib/server/session';
import {privateJson} from '@/lib/server/json-response';
import {readObjectBody} from '@/lib/server/request-body';
import {ProductInputError} from '@/lib/product-input';
import {listSceneDrafts,readSceneDraft,createSceneDraft,editSceneDraft,applySceneDraft,configureSceneProvider} from '@/lib/server/scene-service';
export async function GET(request:Request){try{const session=await requireSession(request);if(!session?.user)return unauthorized();const id=new URL(request.url).searchParams.get('id');return privateJson(id?{draft:await readSceneDraft(session.user,id)}:await listSceneDrafts(session.user));}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const session=await requireSession(request);if(!session?.user)return unauthorized();const input=await readObjectBody(request);switch(input.operation){case 'configure':return privateJson({provider:await configureSceneProvider(session.user,input,request)});case 'create':return privateJson({draft:await createSceneDraft(session.user,input)},{status:202});case 'edit':return privateJson({draft:await editSceneDraft(session.user,input)});case 'apply':return privateJson(await applySceneDraft(session.user,input));default:throw new ProductInputError('不支持的空间操作')}}catch(e){return apiError(e)}}
