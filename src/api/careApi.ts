import { apiRequest } from "./apiClient";
import type { CarePlan } from "@/lib/care-agent";
import type { CareAgreement, CareEvidence } from "@/lib/care-evidence";
import type { FamilyMember, User } from "@/lib/product-models";
export type CareWorkspace = { plan?:CarePlan; jobs:{id:string;step:string;status:string;detail:string}[]; evidence:CareEvidence[]; agreement:CareAgreement; members:FamilyMember[]; actor:User; capabilities:{homeAssistant:boolean;physicalValidation:string} };
export const careApi = {
  read:(caseId?:string)=>apiRequest<CareWorkspace>("/api/care"+(caseId?"?caseId="+encodeURIComponent(caseId):"")),
  command:(input:Record<string,unknown>)=>apiRequest<CarePlan>("/api/care",{method:"POST",body:JSON.stringify({...input,requestId:crypto.randomUUID()})}),
};
