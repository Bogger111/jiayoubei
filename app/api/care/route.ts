import { requireSession, unauthorized, apiError } from "@/lib/server/session";
import { privateJson } from "@/lib/server/json-response";
import { readObjectBody } from "@/lib/server/request-body";
import { careCommand, readCareWorkspace } from "@/lib/server/care-service";
import { ProductInputError } from "@/lib/product-input";
export async function GET(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();const caseId=new URL(request.url).searchParams.get("caseId")??undefined;if(caseId&&caseId.length>100)throw new ProductInputError("事件编号无效");return privateJson(await readCareWorkspace(s.user,caseId));}catch(e){return apiError(e)}}
export async function POST(request:Request){try{const s=await requireSession(request);if(!s?.user)return unauthorized();const input=await readObjectBody(request);try{return privateJson(await careCommand(s.user,input))}catch(e){if(e instanceof ProductInputError)throw e;if(e instanceof Error && !/D1|SQL|constraint|fetch/i.test(e.message))throw new ProductInputError(e.message,400);throw e}}catch(e){return apiError(e)}}
