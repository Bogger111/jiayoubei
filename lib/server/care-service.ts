import { env } from "cloudflare:workers";
import { approveCarePlan, claimCareStep, createEvidenceCarePlan, resolveCarePlan, reviseCarePlan, type CarePlan, type CareOutcomeInput } from "@/lib/care-agent";
import { defaultCareAgreement, validateAgreement, validateEvidence, type CareAgreement, type CareEvidence } from "@/lib/care-evidence";
import { ProductInputError } from "@/lib/product-input";
import { ensureProductSchema, readProductState } from "./product-repo";
import { isFamilyAdmin, type SessionUser } from "./session";
import { readRuntimeEnv } from "@/lib/runtime-env";

type CaseRow = { id: string; family_id: string; subject_id: string; version: number; data_json: string; status: string };
export type CareJob = { id: string; family_id: string; case_id: string; step: string; status: string; detail: string; updated_at: number; ha_context_id?: string; ack_at?: number };
const database = () => (env as unknown as { DB: D1Database }).DB;
const text = (value: unknown, name: string, max = 100) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ProductInputError(`请检查${name}`, 400);
  return value.trim();
};
const active = (p: CarePlan) => p.status === "pending" || p.status === "following" ? 1 : null;
async function currentEvidence(familyId:string){
  const rows=await database().prepare(`WITH ranked AS (
    SELECT data_json,row_number() OVER (
      PARTITION BY source_id,json_extract(data_json,'$.kind'),CASE WHEN json_extract(data_json,'$.kind')='activity' AND json_extract(data_json,'$.value')='active' THEN 'last-active' WHEN json_extract(data_json,'$.kind')='help' AND json_extract(data_json,'$.value')='requested' THEN 'help-request' WHEN json_extract(data_json,'$.kind')='reply' AND json_extract(data_json,'$.value')='responded_unknown_identity' THEN 'response-press' ELSE 'current' END
      ORDER BY observed_at DESC,received_at DESC,id DESC
    ) AS position FROM care_evidence WHERE family_id=?
  ) SELECT data_json FROM ranked WHERE position=1 LIMIT 250`).bind(familyId).all<{data_json:string}>();
  return rows.results.map(r=>JSON.parse(r.data_json) as CareEvidence);
}
const taskId = (id: string, step = "family") => `${id}-${step.toUpperCase()}`;
function namePlan(plan:CarePlan,name:string){plan.subjectName=name;plan.title=plan.title.replaceAll("妈妈",name);plan.assessment.title=plan.assessment.title.replaceAll("妈妈",name);plan.steps=plan.steps.map(s=>({...s,title:s.title.replaceAll("妈妈",name)}));return plan;}
async function projectDevicePhase(plan:CarePlan) {
  const job=await database().prepare("SELECT status,detail FROM care_jobs WHERE case_id=? AND step='device' ORDER BY created_at DESC LIMIT 1").bind(plan.id).first<{status:string;detail:string}>();
  if(!job)return plan;
  return {...plan,steps:plan.steps.map(s=>s.id==="device"?{...s,status:job.status==="acknowledged"?"done" as const:job.status==="unknown"?"unknown" as const:job.status==="failed"?"failed" as const:job.status==="cancelled"?"skipped" as const:job.status==="queued"?"queued" as const:"accepted" as const,detail:job.detail}:s)};
}
export async function latestCarePlan(familyId: string): Promise<CarePlan | undefined> {
  await ensureProductSchema();
  const row = await database().prepare("SELECT data_json FROM care_cases WHERE family_id=? ORDER BY CASE WHEN active_slot=1 THEN 0 ELSE 1 END,CASE WHEN json_extract(data_json,'$.priority')='urgent' THEN 0 ELSE 1 END,updated_at DESC,id DESC LIMIT 1").bind(familyId).first<{ data_json: string }>();
  return row ? projectDevicePhase(JSON.parse(row.data_json)) : undefined;
}
async function rowFor(familyId: string, id: string) {
  const row = await database().prepare("SELECT * FROM care_cases WHERE family_id=? AND id=?").bind(familyId, id).first<CaseRow>();
  if (!row) throw new ProductInputError("本家庭没有这次关怀记录", 404);
  row.data_json=JSON.stringify(await projectDevicePhase(JSON.parse(row.data_json)));
  return row;
}
async function agreementFor(familyId: string): Promise<CareAgreement> {
  const row = await database().prepare("SELECT data_json FROM care_agreements WHERE family_id=?").bind(familyId).first<{ data_json: string }>();
  return row ? JSON.parse(row.data_json) : structuredClone(defaultCareAgreement);
}
const guardSql = "EXISTS(SELECT 1 FROM care_cases WHERE id=? AND family_id=? AND last_operation=?)";
async function previousOperation(familyId: string, requestId: string, fingerprint: string) {
  const row = await database().prepare("SELECT case_id,fingerprint FROM care_operations WHERE family_id=? AND request_id=?").bind(familyId, requestId).first<{case_id:string;fingerprint:string}>();
  if (row && row.fingerprint !== fingerprint) throw new ProductInputError("请求标识已用于另一项操作", 409);
  return row ? JSON.parse((await rowFor(familyId, row.case_id)).data_json) as CarePlan : undefined;
}
async function saveMutation(user: SessionUser, old: CarePlan, next: CarePlan, requestId: string, fingerprint: string, extras: (guard: unknown[]) => D1PreparedStatement[] = () => []) {
  next={...next,history:next.history.slice(-300),records:next.records.slice(-250)};
  const db = database(), operation = crypto.randomUUID(), now = Date.now(), guard = [next.id, user.familyId, operation];
  const writes = [
    db.prepare("UPDATE care_cases SET data_json=?,version=?,status=?,active_slot=?,last_operation=?,updated_at=? WHERE id=? AND family_id=? AND version=?").bind(JSON.stringify(next), next.revision, next.status, active(next), operation, now, next.id, user.familyId, old.revision),
    db.prepare(`INSERT INTO care_operations(family_id,request_id,case_id,fingerprint,created_at) SELECT ?,?,?,?,? WHERE ${guardSql}`).bind(user.familyId, requestId, next.id, fingerprint, now, ...guard),
    db.prepare(`INSERT INTO audit_logs(id,family_id,actor,actor_type,time,target,action,reason,risk_level,result) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guardSql}`).bind(`CARE-AUDIT-${operation}`,user.familyId,user.name,user.id.startsWith("care-")?"rule":"user",new Date(now).toISOString(),next.id,next.history.at(-1)?.title??"更新关怀计划",next.history.at(-1)?.detail??"更新联系安排",next.priority==="urgent"?"critical":"normal","success",...guard),
    db.prepare(`UPDATE events SET title=?,description=?,updated_at=?,status=?,risk_level=?,timeline=? WHERE id=? AND family_id=? AND ${guardSql}`).bind(next.title, next.reason, new Date(now).toISOString(), next.status === "resolved" ? "resolved" : next.status === "cancelled" ? "closed" : next.status === "pending" ? "pending_confirmation" : "processing", next.priority==="urgent"?"critical":"attention", JSON.stringify(next.history.map((h,i)=>({id:`${next.id}-H${i}`,time:new Date(h.at).toISOString(),title:h.title,detail:h.detail,actor:h.actor,tone:"info"}))), next.id, user.familyId, ...guard),
    ...extras(guard),
  ];
  const result = await db.batch(writes);
  if (!result[0].meta.changes) {
    const previous = await previousOperation(user.familyId, requestId, fingerprint);
    if (previous) return previous;
    throw new ProductInputError("情况已更新，请核对最新计划后再操作", 409);
  }
  return next;
}
export async function readCareWorkspace(user: SessionUser, caseId?: string) {
  await ensureProductSchema();
  const state = await readProductState(user.familyId, user);
  await processCareDue(user.familyId);
  const plan = caseId ? JSON.parse((await rowFor(user.familyId,caseId)).data_json) as CarePlan : await latestCarePlan(user.familyId);
  const jobs = plan ? (await database().prepare("SELECT * FROM care_jobs WHERE family_id=? AND case_id=? ORDER BY created_at").bind(user.familyId, plan.id).all<CareJob>()).results : [];
  const raw = await database().prepare("SELECT data_json FROM care_evidence WHERE family_id=? ORDER BY received_at DESC LIMIT 250").bind(user.familyId).all<{data_json:string}>();
  return { plan, jobs, evidence: raw.results.map(r=>JSON.parse(r.data_json) as CareEvidence), agreement: await agreementFor(user.familyId), members: state.members, actor: user, capabilities: { homeAssistant: Boolean(readRuntimeEnv("HOME_ASSISTANT_URL") && readRuntimeEnv("HOME_ASSISTANT_TOKEN") && readRuntimeEnv("CARE_LIGHT_ENTITY")), physicalValidation: "待实物验证" } };
}
export async function careCommand(user: SessionUser, input: Record<string,unknown>) {
  await ensureProductSchema();
  const action = text(input.action,"操作"), requestId = text(input.requestId,"请求标识");
  const fingerprint = JSON.stringify({ ...input, requestId: undefined });
  const previous = await previousOperation(user.familyId,requestId,fingerprint);
  if (previous) return previous;
  const db=database(),now=Date.now();
  if (action === "create") {
    if (!isFamilyAdmin(user)) throw new ProductInputError("请由家庭管理员整理计划",403);
    const state = await readProductState(user.familyId,user), subjectId=text(input.subjectId,"家人");
    if (!state.members.some(m=>m.id===subjectId)) throw new ProductInputError("请选择本家庭成员",400);
    const agreement = input.agreement as CareAgreement ?? await agreementFor(user.familyId);
    validateAgreement(agreement);
    agreement.subjectId=subjectId;
    for (const id of [agreement.contact,agreement.nearbyContact].filter(Boolean)) if (!state.members.some(m=>m.id===id && m.role!=="儿童")) throw new ProductInputError("联系人必须是本家庭的成年成员",400);
    let records: CareEvidence[];
    if (input.records !== undefined) {
      if (!Array.isArray(input.records) || input.records.length>80) throw new ProductInputError("一次最多导入80条情景证据",400);
      records=input.records as CareEvidence[];
      for(const e of records){validateEvidence(e);if(e.category!=="synthetic")throw new ProductInputError("页面情景输入必须标为 synthetic",400)}
    } else records=await currentEvidence(user.familyId);
    const existing=await db.prepare("SELECT data_json FROM care_cases WHERE family_id=? AND subject_id=? AND active_slot=1").bind(user.familyId,subjectId).first<{data_json:string}>();
    if(existing)throw new ProductInputError("这位家人已有待处理的关怀计划，请先处理当前记录",409);
    const id=`CARE-${crypto.randomUUID()}`;
    const plan=namePlan(createEvidenceCarePlan(records,agreement,now,id,subjectId),state.members.find(m=>m.id===subjectId)!.name);
    const at=new Date(now).toISOString();
    plan.history.push({at:now,actor:user.name,title:"整理当前关怀计划",detail:plan.reason});
    try{await db.batch([
      db.prepare("INSERT INTO care_cases(id,family_id,subject_id,version,status,active_slot,data_json,last_operation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,user.familyId,subjectId,plan.revision,plan.status,active(plan),JSON.stringify(plan),requestId,now,now),
      db.prepare("INSERT INTO care_operations VALUES(?,?,?,?,?)").bind(user.familyId,requestId,id,fingerprint,now),
      db.prepare("INSERT INTO care_agreements VALUES(?,?,?) ON CONFLICT(family_id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at").bind(user.familyId,JSON.stringify(agreement),now),
      db.prepare("INSERT INTO events(id,family_id,title,description,risk_level,status,source,created_at,updated_at,related_members,ai_assessment) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.familyId,plan.title,plan.reason,plan.priority==="urgent"?"critical":"attention",plan.status==="pending"?"pending_confirmation":"monitoring","关怀确认 · 逐源证据",at,at,JSON.stringify([subjectId,agreement.contact]),plan.reason),
    ]);}catch(error){
      const repeated=await previousOperation(user.familyId,requestId,fingerprint);if(repeated)return repeated;
      const activeCase=await db.prepare("SELECT id FROM care_cases WHERE family_id=? AND subject_id=? AND active_slot=1").bind(user.familyId,subjectId).first();
      if(activeCase)throw new ProductInputError("这位家人已有待处理的关怀计划，请先核对当前记录",409);
      throw error;
    }
    return plan;
  }
  const id=text(input.caseId,"本次事件"),row=await rowFor(user.familyId,id),old:CarePlan=JSON.parse(row.data_json);
  if(input.expectedVersion!==old.revision)throw new ProductInputError("计划版本已变化，请先核对最新情况",409);
  const members=(await readProductState(user.familyId,user)).members;
  const linked=members.find(m=>m.userId===user.id || m.id===user.id);
  if(action==="revise") {
    if(!isFamilyAdmin(user))throw new ProductInputError("调整计划需要家庭管理员",403);
    const contact=text(input.contact,"联系人");
    if(!members.some(m=>m.id===contact&&m.role!=="儿童"))throw new ProductInputError("请选择本家庭的成年联系人",400);
    return saveMutation(user,old,reviseCarePlan(old,contact,Number(input.waitMinutes)),requestId,fingerprint);
  }
  if(action==="approve"){
    if(!isFamilyAdmin(user))throw new ProductInputError("批准计划需要家庭管理员",403);
    let next=approveCarePlan(old,user.name,now);
    next={...next,steps:next.steps.map(s=>s.id==="device"||s.id==="family"?{...s,status:"queued"}:s)};
    next.history.push({at:now,actor:"家有备",title:"联系任务已创建",detail:"等待联系人查看与接手，尚未核实结果"});
    const saved=await saveMutation(user,old,next,requestId,fingerprint,guard=>[
      db.prepare(`INSERT INTO care_jobs(id,family_id,case_id,step,status,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${guardSql}`).bind(`${id}-LIGHT`,user.familyId,id,"device","queued",now,now,...guard),
      db.prepare(`INSERT INTO tasks(id,family_id,title,description,assignee,creator,source_event_id,priority,status,due_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guardSql}`).bind(taskId(id),user.familyId,"联系家人并记录核实结果","请先接手；未联系到时继续跟进。",old.contact,user.name,id,old.priority==="urgent"?"urgent":"high","to_receive",new Date(next.nextCheckAt!).toISOString(),...guard),
      db.prepare(`UPDATE events SET related_tasks=? WHERE id=? AND family_id=? AND ${guardSql}`).bind(JSON.stringify([taskId(id)]),id,user.familyId,...guard),
      db.prepare(`INSERT INTO notifications(id,family_id,category,title,detail,time,read,event_id,task_id) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guardSql}`).bind(`${id}-CONTACT-NOTICE`,user.familyId,"family","有一份关怀联系安排","请指定联系人查看并明确接手。",new Date(now).toISOString(),0,id,taskId(id),...guard),
    ]);
    await dispatchCareJobs(user.familyId);
    return (await latestCarePlan(user.familyId))?.id===saved.id ? JSON.parse((await rowFor(user.familyId,saved.id)).data_json) as CarePlan : saved;
  }
  if(action==="seen"){
    const step=input.step==="nearby"?"nearby":"family",assignee=step==="nearby"?old.agreement.nearbyContact:old.contact;
    if(!linked||linked.id!==assignee||old.status!=="following")throw new ProductInputError("只有本次联系人可以确认看到安排",403);
    const current=old.steps.find(s=>s.id===step);if(!current||current.status!=="queued"||current.deliveredAt)return old;
    const next:CarePlan={...old,revision:old.revision+1,steps:old.steps.map(s=>s.id===step?{...s,deliveredAt:now,detail:`${user.name}已查看，等待明确接手`}:s),history:[...old.history,{at:now,actor:user.name,title:"联系人已查看安排",detail:"页面已显示任务并收到确认；尚未接手"}]};
    return saveMutation(user,old,next,requestId,fingerprint,guard=>[db.prepare(`INSERT INTO notification_reads(family_id,user_id,notification_id,read_at) SELECT ?,?,?,? WHERE ${guardSql} ON CONFLICT(family_id,user_id,notification_id) DO NOTHING`).bind(user.familyId,user.id,`${id}-${step==="family"?"CONTACT":"NEARBY"}-NOTICE`,new Date(now).toISOString(),...guard)]);
  }
  if(action==="claim"){
    const step=input.step==="nearby"?"nearby":"family",assignee=step==="nearby"?old.agreement.nearbyContact:old.contact;
    if(!linked || linked.id!==assignee)throw new ProductInputError("请由计划中的联系人使用自己的账号接手",403);
    const next=claimCareStep(old,user.name,now,step);
    return saveMutation(user,old,next,requestId,fingerprint,guard=>[db.prepare(`UPDATE tasks SET status='in_progress',version=version+1 WHERE id=? AND family_id=? AND ${guardSql}`).bind(taskId(id,step),user.familyId,...guard)]);
  }
  if(action==="outcome"){
    if(!isFamilyAdmin(user)&&linked?.id!==old.contact&&linked?.id!==old.agreement.nearbyContact)throw new ProductInputError("请由本次联系人记录核实结果",403);
    const outcome=input.outcome as Partial<CareOutcomeInput>;
    const next=resolveCarePlan(old,{...outcome,actor:user.name,caseId:id} as CareOutcomeInput,now);
    const ended=next.status==="resolved"||next.status==="cancelled";
    const completedId=next.status==="resolved"&&linked?.id===old.contact&&old.steps.find(s=>s.id==="family")?.status==="accepted"?taskId(id):next.status==="resolved"&&linked?.id===old.agreement.nearbyContact&&old.steps.find(s=>s.id==="nearby")?.status==="accepted"?taskId(id,"nearby"):"";
    const saved=await saveMutation(user,old,next,requestId,fingerprint,guard=>[
      ...(ended?[db.prepare(`UPDATE care_jobs SET status='cancelled',detail=?,updated_at=? WHERE family_id=? AND case_id=? AND status='queued' AND ${guardSql}`).bind(next.status==="resolved"?"当前事件已明确核实":"人工取消，情况未核实",now,user.familyId,id,...guard)]:[]),
      ...(ended?[db.prepare(`UPDATE notifications SET read=1 WHERE family_id=? AND event_id=? AND ${guardSql}`).bind(user.familyId,id,...guard)]:[]),
      db.prepare(`UPDATE tasks SET status=CASE WHEN id=? THEN 'completed' WHEN ?=1 THEN 'cancelled' ELSE status END,evidence=?,evidence_uploaded_at=?,family_confirmed_at=CASE WHEN id=? THEN ? ELSE NULL END,version=version+1 WHERE family_id=? AND source_event_id=? AND ${guardSql}`).bind(completedId,ended?1:0,outcome.remark??"",new Date(now).toISOString(),completedId,new Date(now).toISOString(),user.familyId,id,...guard),
    ]);
    return saved;
  }
  throw new ProductInputError("不支持的关怀操作",400);
}

export async function dispatchCareJobs(familyId?:string) {
  const db=database(),now=Date.now();
  // A crash after sending cannot prove non-delivery: preserve unknown, never resend blindly.
  await db.prepare("UPDATE care_jobs SET status='unknown',detail='执行过程曾中断，需人工核对物理效果',updated_at=? WHERE status='dispatching' AND updated_at<?").bind(now,now-120000).run();
  const jobs=(await db.prepare(`SELECT * FROM care_jobs WHERE status='queued' ${familyId?"AND family_id=?":""} LIMIT 20`).bind(...(familyId?[familyId]:[])).all<CareJob>()).results;
  for(const job of jobs){
    const claimed=await db.prepare("UPDATE care_jobs SET status='dispatching',updated_at=? WHERE id=? AND status='queued' AND EXISTS(SELECT 1 FROM care_cases WHERE id=care_jobs.case_id AND status='following')").bind(now,job.id).run();
    if(!claimed.meta.changes)continue;
    const url=readRuntimeEnv("HOME_ASSISTANT_URL"),token=readRuntimeEnv("HOME_ASSISTANT_TOKEN"),entity=readRuntimeEnv("CARE_LIGHT_ENTITY");
    let status="unknown",detail="灯光接入尚未配置，等待实物联调",contextId:string|null=null;
    if(job.family_id!==(readRuntimeEnv("HOME_ASSISTANT_FAMILY_ID")||"F001")){status="failed";detail="该设备尚未绑定当前家庭，未发出动作";}
    else if(url&&token&&/^light\.[a-z0-9_]+$/.test(entity)){
      try{
        const response=await fetch(`${url.replace(/\/$/,"")}/api/services/light/turn_on`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({entity_id:entity}),signal:AbortSignal.timeout(6000)});
        if(response.ok){status="api_accepted";detail="HA已接受灯光动作；等待设备状态回执，物理效果仍需现场核验"; const body=await response.json() as {context?:{id?:string}}[];contextId=Array.isArray(body)?body.find(s=>s.context?.id)?.context?.id??null:null;}
        else{status="failed";detail=`灯光动作被拒绝（HTTP ${response.status}）`;}
      }catch{status="unknown";detail="网络结果不确定，请核对灯光；系统不会自动重复发出";}
    }
    await db.prepare("UPDATE care_jobs SET status=?,detail=?,ha_context_id=?,updated_at=? WHERE id=? AND status='dispatching'").bind(status,detail,contextId,Date.now(),job.id).run();
    await reconcileOutputReceipts(job.family_id);
    // The job ledger is authoritative for device phases. Case completion is never inferred from it.
  }
}
export async function processCareDue(familyId?:string) {
  await ensureProductSchema();
  await evaluateCareAgreements(familyId);
  const db=database(),rows=(await db.prepare(`SELECT * FROM care_cases WHERE status='following' ${familyId?"AND family_id=?":""} LIMIT 100`).bind(...(familyId?[familyId]:[])).all<CaseRow>()).results;
  for(const row of rows){
    const old:CarePlan=JSON.parse(row.data_json),now=Date.now(),nearby=old.steps.find(s=>s.id==="nearby");
    if(now<(old.nextCheckAt??Infinity)||nearby?.status!=="pending")continue;
    const contact=old.agreement.nearbyContact;
    const known=contact?await db.prepare("SELECT id FROM family_members WHERE family_id=? AND id=? AND emergency_contact=1").bind(row.family_id,contact).first():null;
    const next:CarePlan={...old,revision:old.revision+1,steps:old.steps.map(s=>s.id==="nearby"?{...s,status:known?"queued":"failed",detail:known?"已创建附近核实任务，等待接手":"缺少已约定的附近联系人，请家人继续核实",at:now}:s),history:[...old.history,{at:now,actor:"家有备",title:"等待期限到达",detail:known?"已创建附近核实任务，尚未接手":"没有可用附近联系人，继续由家人核实"}]};
    const actor:SessionUser={id:"care-scheduler",familyId:row.family_id,name:"家有备",role:"家庭管理员",avatar:"家",phone:""};
    try{await saveMutation(actor,old,next,`due-${old.id}-${old.nextCheckAt}`,`due:${old.id}:${old.nextCheckAt}`,guard=>known?[
      db.prepare(`INSERT INTO tasks(id,family_id,title,description,assignee,creator,source_event_id,priority,status,due_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guardSql}`).bind(taskId(old.id,"nearby"),row.family_id,"请协助核实当前情况","请先接手，并记录明确核实结果。",contact,"家有备",old.id,"high","to_receive",new Date(now+600000).toISOString(),...guard),
      db.prepare(`UPDATE events SET related_tasks=json_insert(related_tasks,'$[#]',?) WHERE id=? AND family_id=? AND ${guardSql}`).bind(taskId(old.id,"nearby"),old.id,row.family_id,...guard),
      db.prepare(`INSERT INTO notifications(id,family_id,category,title,detail,time,read,event_id,task_id) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guardSql}`).bind(`${old.id}-NEARBY-NOTICE`,row.family_id,"action","请附近联系人协助核实","等待期限已到，安排已生成，等待联系人接手。",new Date(now).toISOString(),0,old.id,taskId(old.id,"nearby"),...guard),
    ]:[])}catch(error){if(!(error instanceof ProductInputError&&error.status===409))throw error;}
  }
  await dispatchCareJobs(familyId);
}
async function evaluateCareAgreements(familyId?:string){
  const db=database(),now=Date.now();
  const agreements=(await db.prepare(`SELECT family_id,data_json FROM care_agreements ${familyId?"WHERE family_id=?":""} LIMIT 100`).bind(...(familyId?[familyId]:[])).all<{family_id:string;data_json:string}>()).results;
  for(const row of agreements){
    const a:CareAgreement=JSON.parse(row.data_json);if(!a.subjectId)continue;
    const latest=await db.prepare("SELECT data_json,status FROM care_cases WHERE family_id=? AND subject_id=? ORDER BY updated_at DESC LIMIT 1").bind(row.family_id,a.subjectId).first<{data_json:string;status:string}>();
    if(latest&&["pending","following","cancelled"].includes(latest.status))continue;
    const prior:CarePlan|undefined=latest?JSON.parse(latest.data_json):undefined;
    if(prior?.resolvedAt&&now-prior.resolvedAt<a.silenceMinutes*60000)continue;
    const evidence=await currentEvidence(row.family_id);
    if(!evidence.some(e=>e.subjectId===a.subjectId&&(e.kind==="activity"||e.kind==="help")))continue;
    const subject=await db.prepare("SELECT name FROM family_members WHERE family_id=? AND id=?").bind(row.family_id,a.subjectId).first<{name:string}>();if(!subject)continue;
    const id=`CARE-${crypto.randomUUID()}`,plan=namePlan(createEvidenceCarePlan(evidence,a,now,id,a.subjectId),subject.name);
    if(plan.status!=="pending")continue;
    plan.history.push({at:now,actor:"家有备",title:"按家庭约定整理核实计划",detail:plan.reason});
    const at=new Date(now).toISOString();
    try{await db.batch([
      db.prepare("INSERT INTO care_cases VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,row.family_id,a.subjectId,plan.revision,plan.status,1,JSON.stringify(plan),`schedule-${id}`,now,now),
      db.prepare("INSERT INTO events(id,family_id,title,description,risk_level,status,source,created_at,updated_at,related_members,ai_assessment) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,row.family_id,plan.title,plan.reason,plan.priority==="urgent"?"critical":"attention","pending_confirmation","关怀约定与设备证据",at,at,JSON.stringify([a.subjectId,a.contact]),plan.reason),
    ])}catch(error){const current=await db.prepare("SELECT id FROM care_cases WHERE family_id=? AND subject_id=? AND active_slot=1").bind(row.family_id,a.subjectId).first();if(!current)throw error;}
  }
}

export async function ingestCareEvidence(familyId:string,record:CareEvidence) {
  await ensureProductSchema();validateEvidence(record);
  const db=database();
  const result=await db.prepare("INSERT INTO care_evidence(id,family_id,source_id,source_event_id,observed_at,received_at,data_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(family_id,source_id,source_event_id) DO NOTHING").bind(crypto.randomUUID(),familyId,record.sourceId,record.id,record.observedAt,record.receivedAt,JSON.stringify(record)).run();
  return {inserted:Boolean(result.meta.changes),id:record.id};
}
export async function reconcileCareEvidence(familyId:string,record:CareEvidence){
  const db=database();
  if(!record.subjectId)return;
  const row=await db.prepare("SELECT * FROM care_cases WHERE family_id=? AND subject_id=? AND active_slot=1").bind(familyId,record.subjectId).first<CaseRow>();
  const raw=await currentEvidence(familyId);
  const now=Date.now(),id=row?.id??`CARE-${crypto.randomUUID()}`,agreement=row?JSON.parse(row.data_json).agreement as CareAgreement:await agreementFor(familyId);
  const subject=await db.prepare("SELECT name FROM family_members WHERE family_id=? AND id=?").bind(familyId,record.subjectId).first<{name:string}>();if(!subject)return;
  const candidate=namePlan(createEvidenceCarePlan(raw,agreement,now,id,record.subjectId),subject.name);
  if(row){
    const old:CarePlan=JSON.parse((await rowFor(familyId,row.id)).data_json);
    if(old.priority==="urgent"&&candidate.priority!=="urgent"){candidate.priority="urgent";candidate.status="pending";candidate.title="本次求助仍待家人明确核实";candidate.reason="本次已接收的求助尚未完成核实，继续优先人工响应。";candidate.steps=old.steps.map(s=>({...s}));}
    const next:CarePlan=old.status==="pending"?{...candidate,revision:old.revision+1,history:[...old.history,{at:now,actor:"设备采集",title:"收到新的家庭线索",detail:`${record.sourceId} · ${record.kind}`}]}:{...old,records:candidate.records,evidence:candidate.evidence,signals:candidate.signals,reason:candidate.reason+" 本次已批准的联系仍待明确结果。",assessment:candidate.assessment,revision:old.revision+1,...(candidate.priority==="urgent"?{priority:"urgent" as const,title:candidate.title}:{}),history:[...old.history,{at:now,actor:"设备采集",title:"收到新的家庭线索",detail:`${record.sourceId} · ${record.kind}`}]} ;
    const actor:SessionUser={id:"care-ingest",familyId,name:"设备采集",role:"家庭管理员",avatar:"家",phone:""};
    try{await saveMutation(actor,old,next,`input-${record.sourceId}-${record.id}`,`input:${record.sourceId}:${record.id}`)}catch(e){if(!(e instanceof ProductInputError&&e.status===409))throw e}
  }else if(candidate.status==="pending"&&record.kind==="help"&&record.value==="requested"){
    const contact=await db.prepare("SELECT id FROM family_members WHERE family_id=? AND id=?").bind(familyId,agreement.contact).first();
    const subject=await db.prepare("SELECT id FROM family_members WHERE family_id=? AND id=?").bind(familyId,record.subjectId).first();
    if(!contact||!subject)return;
    candidate.history.push({at:now,actor:"设备采集",title:"明确求助形成待确认计划",detail:`来源 ${record.sourceId}，等待家人批准安排`});
    const at=new Date(now).toISOString();
    try{await db.batch([
      db.prepare("INSERT INTO care_cases VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,familyId,record.subjectId,candidate.revision,candidate.status,1,JSON.stringify(candidate),record.id,now,now),
      db.prepare("INSERT INTO events(id,family_id,title,description,risk_level,status,source,created_at,updated_at,related_members,ai_assessment) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,familyId,candidate.title,candidate.reason,"critical","pending_confirmation","关怀设备采集",at,at,JSON.stringify([record.subjectId,agreement.contact]),candidate.reason),
    ])}catch(e){const existing=await db.prepare("SELECT id FROM care_cases WHERE family_id=? AND subject_id=? AND active_slot=1").bind(familyId,record.subjectId).first();if(!existing)throw e;await reconcileCareEvidence(familyId,record);}
  }
}
export async function receiveCareOutput(familyId:string,entity:string,state:string,contextId:string,observedAt:number,eventId:string){
  await ensureProductSchema();
  const now=Date.now();
  await ingestCareEvidence(familyId,{id:eventId,sourceId:entity,kind:"availability",value:state,contextId,observedAt,receivedAt:now,expiresAt:observedAt+1800000,authorized:true,quality:"valid",provenance:"observation",category:(readRuntimeEnv("CARE_CAPTURE_CATEGORY")||"synthetic") as CareEvidence["category"],transport:"live",datasetId:readRuntimeEnv("CARE_CAPTURE_ID")||"unassigned-capture",sampleId:eventId});
  if(entity!==readRuntimeEnv("CARE_LIGHT_ENTITY")||state!=="on"||!contextId)return {recorded:false,reason:"状态未与本次动作关联，保留为未知"};
  const db=database(),job=await db.prepare("SELECT * FROM care_jobs WHERE family_id=? AND ha_context_id=? AND step='device'").bind(familyId,contextId).first<CareJob>();
  if(!job||observedAt<job.updated_at-60000||observedAt>Date.now()+60000)return {recorded:false,reason:"未找到有效的动作关联"};
  await db.prepare("UPDATE care_jobs SET status='acknowledged',detail=?,ack_at=?,updated_at=? WHERE id=? AND status IN ('api_accepted','unknown')").bind(`收到关联的 HA 灯光状态回执（${eventId}）；实际物理效果待现场核验`,observedAt,Date.now(),job.id).run();
  return {recorded:true,physicalEffectVerified:false};
}
async function reconcileOutputReceipts(familyId:string){
  const rows=(await database().prepare("SELECT data_json FROM care_evidence WHERE family_id=? AND source_id=? ORDER BY observed_at DESC LIMIT 100").bind(familyId,readRuntimeEnv("CARE_LIGHT_ENTITY")).all<{data_json:string}>()).results;
  for(const row of rows){
    const e:CareEvidence=JSON.parse(row.data_json);
    if(e.value!=="on"||!e.contextId||e.expiresAt<Date.now())continue;
    await database().prepare("UPDATE care_jobs SET status='acknowledged',detail='收到与动作关联的 HA 灯光状态；物理效果待现场核验',ack_at=?,updated_at=? WHERE family_id=? AND ha_context_id=? AND status IN ('api_accepted','unknown') AND created_at<=?").bind(e.observedAt,Date.now(),familyId,e.contextId,e.observedAt+60000).run();
  }
}
