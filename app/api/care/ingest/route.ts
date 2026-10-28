import { readRuntimeEnv } from "@/lib/runtime-env";
import { privateJson } from "@/lib/server/json-response";
import { readObjectBody, inputText } from "@/lib/server/request-body";
import { ingestCareEvidence, receiveCareOutput, reconcileCareEvidence } from "@/lib/server/care-service";
import { apiError } from "@/lib/server/session";
import { ProductInputError } from "@/lib/product-input";
import type { CareEvidence, EvidenceKind, EvidenceCategory } from "@/lib/care-evidence";
type EntityMap = Record<string,{kind:EvidenceKind|"output";subjectId:string;ttlSeconds?:number}>;
export async function POST(request:Request){try{
  const secret=readRuntimeEnv("CARE_INGEST_SECRET");
  if(!secret)return privateJson({error:"关怀采集尚未配置"},{status:503});
  if(request.headers.get("X-Care-Ingest-Secret")!==secret)return privateJson({error:"unauthorized"},{status:401});
  const body=await readObjectBody(request),entity=inputText(body.entityId,"实体",160),eventId=inputText(body.eventId,"来源事件",160),state=inputText(body.state,"状态",80),familyId=readRuntimeEnv("HOME_ASSISTANT_FAMILY_ID")||"F001";
  let map:EntityMap;try{map=JSON.parse(readRuntimeEnv("CARE_ENTITY_MAP")||"{}")}catch{return privateJson({error:"实体白名单配置无效"},{status:503})}
  const config=Object.hasOwn(map,entity)?map[entity]:undefined;
  if(!config||!config.subjectId)return privateJson({error:"实体不在关怀采集白名单中"},{status:403});
  const observedAt=typeof body.observedAt==="string"?Date.parse(body.observedAt):NaN;
  if(!Number.isFinite(observedAt))throw new ProductInputError("需要设备来源的观测时间",400);
  const category=readRuntimeEnv("CARE_CAPTURE_CATEGORY");
  if(!["synthetic","bench","reenactment","field"].includes(category))return privateJson({error:"先配置采集来源类别"},{status:503});
  if(!readRuntimeEnv("CARE_CAPTURE_ID"))return privateJson({error:"先配置本次采集批次 ID"},{status:503});
  if(config.kind==="output")return privateJson(await receiveCareOutput(familyId,entity,state,typeof body.contextId==="string"?body.contextId:"",observedAt,eventId));
  const on=["on","true","open","1"].includes(state.toLowerCase()),offline=["unavailable","unknown","offline"].includes(state.toLowerCase());
  const kind=body.heartbeat===true?"availability":offline?"availability":config.kind;
  const value=offline?"offline":kind==="availability"?"online":kind==="activity"?on?"active":"inactive":kind==="door"?on?"open":"closed":kind==="help"?on?"requested":"clear":kind==="reply"?on?"responded_unknown_identity":"idle":state;
  const now=Date.now(),ttl=Number.isFinite(config.ttlSeconds)?Math.max(10,Math.min(config.ttlSeconds!,86400)):kind==="activity"?86400:kind==="availability"?90:600;
  const record:CareEvidence={id:eventId,sourceId:entity,subjectId:config.subjectId,kind,value,observedAt,receivedAt:now,expiresAt:observedAt+ttl*1000,authorized:true,quality:"valid",provenance:"observation",category:category as EvidenceCategory,transport:"live",datasetId:readRuntimeEnv("CARE_CAPTURE_ID")||"unassigned-capture",sampleId:inputText(body.sampleId??eventId,"采集样本",160)};
  const result=await ingestCareEvidence(familyId,record);
  if(result.inserted)await reconcileCareEvidence(familyId,record);
  return privateJson(result);
}catch(error){return apiError(error)}}
