import {apiError,requireSession,unauthorized} from '@/lib/server/session';
import {privateJson} from '@/lib/server/json-response';
import {storeHomeMedia} from '@/lib/server/home-media';
import {ProductInputError} from '@/lib/product-input';
export async function POST(request:Request){try{const session=await requireSession(request);if(!session?.user)return unauthorized();if(Number(request.headers.get('content-length')??0)>25*1024*1024)throw new ProductInputError('上传文件过大');const form=await request.formData();const file=form.get('file');if(!(file instanceof File))throw new ProductInputError('请选择文件');return privateJson({media:await storeHomeMedia(session.user,file)},{status:201});}catch(e){return apiError(e)}}
