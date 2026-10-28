"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, RefreshCw, FileDown } from "lucide-react";
import { careApi, type CareWorkspace as WorkspaceData } from "@/src/api/careApi";
import { defaultCareAgreement } from "@/lib/care-evidence";
import { demoCareSignals, legacyCareEvidence } from "@/lib/care-agent";
import CareOutcomeDialog from "./CareOutcomeDialog";
import { AppLink } from "./navigation";
const phaseLabels:Record<string,string>={queued:"等待发出",dispatching:"正在发出",api_accepted:"接口已接受，等待设备回执",acknowledged:"已观察到关联设备状态",unknown:"执行结果未知，请核对",failed:"执行失败",cancelled:"已取消尚未发出的动作"};
export default function CareWorkspace(){
  const [data,setData]=useState<WorkspaceData>(),[error,setError]=useState(""),[saving,setSaving]=useState(false),[outcome,setOutcome]=useState(false),[subject,setSubject]=useState(""),[contact,setContact]=useState(""),[wait,setWait]=useState<number>(),[silence,setSilence]=useState<number>(),[rest,setRest]=useState<boolean>();
  const generation=useRef(0),alive=useRef(true),outcomeSnapshot=useRef<{id:string;revision:number}>(undefined);
  const refresh=useCallback(async()=>{const ticket=++generation.current;try{const next=await careApi.read(new URLSearchParams(window.location.search).get("caseId")??undefined);if(alive.current&&ticket===generation.current){setData(next);setError("")}}catch(e){if(alive.current&&ticket===generation.current)setError(e instanceof Error?e.message:"加载失败")}},[]);
  useEffect(()=>{alive.current=true;void Promise.resolve().then(refresh);const timer=setInterval(()=>void refresh(),5000);return()=>{alive.current=false;clearInterval(timer)}},[refresh]);
  const plan=data?.plan;
  const canManage=Boolean(data&&["家庭管理员","admin"].includes(data.actor.role));
  const linkedMember=data?.members.find(m=>m.userId===data.actor.id);
  const contactStep=plan?.contact===linkedMember?.id?"family":plan?.agreement.nearbyContact===linkedMember?.id?"nearby":undefined;
  const deliveryRequested=useRef("");
  useEffect(()=>{
    const step=plan?.steps.find(s=>s.id===contactStep);
    if(!plan||plan.status!=="following"||!contactStep||step?.status!=="queued"||step.deliveredAt||saving||outcome)return;
    const key=plan.id+"/"+contactStep+"/"+plan.revision;if(deliveryRequested.current===key)return;
    const timer=setTimeout(()=>{deliveryRequested.current=key;void careApi.command({action:"seen",caseId:plan.id,expectedVersion:plan.revision,step:contactStep}).then(next=>{if(alive.current)setData(current=>current&&current.plan?.id===next.id?{...current,plan:next}:current)}).catch(()=>void refresh());},300);
    return()=>clearTimeout(timer);
  },[plan,contactStep,saving,outcome,refresh]);
  const command=async(action:string,extra:Record<string,unknown>={})=>{generation.current++;setSaving(true);setError("");try{const result=await careApi.command({action,...(plan?{caseId:plan.id,expectedVersion:plan.revision}:{}),...extra});if(action==="create")history.replaceState(null,"","/care?caseId="+encodeURIComponent(result.id));await refresh()}catch(e){setError(e instanceof Error?e.message:"操作失败");throw e}finally{setSaving(false)}};
  const run=(action:string,extra:Record<string,unknown>={})=>void command(action,extra).catch(()=>{});
  const person=subject||data?.members.find(m=>m.relation==="母亲")?.id||data?.members[0]?.id||"";
  const selectedContact=contact||(data?.members.some(m=>m.id===data.agreement.contact)?data.agreement.contact:undefined)||data?.members.find(m=>m.id!==person)?.id||data?.members[0]?.id||"";
  const create=(synthetic:boolean)=>{
    const agreement={...(data?.agreement??defaultCareAgreement),contact:selectedContact,nearbyContact:data?.members.find(m=>m.emergencyContact&&m.relation==="邻居")?.id,waitMinutes:wait??data?.agreement.waitMinutes??10,silenceMinutes:silence??data?.agreement.silenceMinutes??90,restWindows:rest===undefined?(data?.agreement.restWindows??[]):rest?[{start:"12:00",end:"14:30"}]:[]};
    run("create",{subjectId:person,agreement,...(synthetic?{records:legacyCareEvidence(demoCareSignals(),Date.now(),"synthetic-workspace").map(e=>({...e,caseId:undefined,subjectId:person}))}:{})});
  };
  return <div className="care-workspace"><header className="page-header"><div><p className="eyebrow">关怀确认</p><h1>让这次联系，有人接住。</h1><p className="page-description">计划、设备进展与家人的回应，在这里一起跟进。</p></div><button className="care-text-button" onClick={()=>void refresh()}><RefreshCw size={17}/>更新记录</button></header>
    {error&&<p role="alert" className="care-error">{error}</p>}
    {!data?<p role="status">正在读取家庭记录…</p>:<>
    <div className="care-workspace-context"><span>服务端持久化记录</span><span>{plan?.records.length?Array.from(new Set(plan.records.map(e=>({synthetic:"软件演练",bench:"硬件台架",reenactment:"知情角色演练",field:"自然家庭使用"})[e.category]))).join(" / "):"等待采集线索"}</span><span>{plan?.records.some(e=>e.transport==="replay")?"包含回放输入":"实时接收"}</span><span>{data.capabilities.homeAssistant?"HA 接入已配置，物理效果需核验":"HA 待配置 · 实物待验证"}</span></div>
    <div className="care-columns"><section className="care-overview"><h2>{plan?.title??"先约定，怎样关心家人。"}</h2><p className="care-description">{plan?.reply||plan?.reason||"选择被关怀的家人和联系人，再整理下一步。"}</p>
      {(!plan||["resolved","cancelled","monitoring"].includes(plan.status))&&canManage?<div className="care-dialog-form care-start-form"><label>关心哪位家人<select aria-label="关心哪位家人" value={person} onChange={e=>setSubject(e.target.value)}>{data.members.map(m=><option key={m.id} value={m.id}>{m.name} · {m.relation}</option>)}</select></label><label>先联系谁<select aria-label="先联系谁" value={selectedContact} onChange={e=>setContact(e.target.value)}>{data.members.filter(m=>m.role!=="儿童").map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>多久没有活动，再整理联系计划<select aria-label="多久没有活动，再整理联系计划" value={silence??data.agreement.silenceMinutes} onChange={e=>setSilence(Number(e.target.value))}>{[15,30,60,90,120,180,360,720].map(n=><option key={n} value={n}>{n} 分钟</option>)}</select></label><label>等待时间<select aria-label="等待时间" value={wait??data.agreement.waitMinutes} onChange={e=>setWait(Number(e.target.value))}>{[5,10,15].map(n=><option key={n} value={n}>{n} 分钟</option>)}</select></label><label className="care-check"><input type="checkbox" checked={rest??data.agreement.restWindows.length>0} onChange={e=>setRest(e.target.checked)}/>家里约定 12:00–14:30 午休</label><button className="care-primary" disabled={saving} onClick={()=>create(false)}>依据已接入线索整理计划 <ArrowRight size={18}/></button><button className="care-text-button" disabled={saving} onClick={()=>create(true)}>软件演练：导入未回应情景</button></div>:plan?<><h3>{plan.outcome?"形成计划时的线索":"本次判断的依据"}</h3><dl className="care-context-list">{plan.evidence.map(e=><div key={e.label}><dt>{e.label}</dt><dd>{e.value}</dd></div>)}</dl><details><summary>查看来源与有效期</summary><div className="care-evidence-list">{plan.assessment.used.map(e=><div key={`${e.sourceId}-${e.id}`}><strong>{e.sourceId}</strong><span>{e.kind} · {e.value}</span><small>{new Date(e.observedAt).toLocaleString("zh-CN")} · {e.provenance}</small></div>)}</div></details>{!["resolved","cancelled"].includes(plan.status)&&plan.assessment.missing.length>0&&<div className="care-missing"><h3>还需要确认</h3>{plan.assessment.missing.map(t=><p key={t}>{t}</p>)}</div>}{plan.assessment.excluded.length>0&&<details><summary>{plan.assessment.excluded.length} 条信息未用于本次判断</summary>{plan.assessment.excluded.map((e,i)=><p key={i}>{e.id}：{e.reason}</p>)}</details>}</>:<p className="care-description">等待家庭管理员整理联系计划。</p>}
    </section><section className="care-plan" aria-live="polite"><h2>{plan?.status==="resolved"?"已明确核实当前情况":plan?.status==="cancelled"?"已取消，情况未核实":"一起把下一步安排好"}</h2><p>{plan?.status==="following"?"任务创建、成员接手和联系结果分别记录":plan?.status==="resolved"?"本次跟进已结束，记录已保存":plan?.status==="cancelled"?"取消记录已保存，当前情况仍待核实":plan?.status==="monitoring"?"当前线索与家庭约定已记录":"家人批准后开始执行"}</p>
      {plan&&<ol className="care-steps">{plan.steps.map((s,i)=><li key={s.id}><span className="care-step-number">{s.status==="done"?<Check size={20}/>:i+1}</span><div><strong>{s.title}</strong><small>{s.detail??(s.status==="queued"?"已创建，等待发出或接手":s.status==="accepted"?"已接手，等待核实结果":s.status==="pending"&&plan.status==="following"?`${plan.waitMinutes} 分钟仍无回应时再核实`:"等待家人确认")}</small></div></li>)}</ol>}
      {plan?.status==="pending"&&canManage&&<button className="care-primary" disabled={saving} onClick={()=>run("approve")}>同意并开始安排 <ArrowRight size={18}/></button>}
      {plan?.status==="following"&&<div className="care-workspace-actions">{contactStep&&plan.steps.find(s=>s.id===contactStep)?.status==="queued"&&<button className="care-primary" disabled={saving} onClick={()=>run("claim",{step:contactStep})}>我来接手联系</button>}{(canManage||(contactStep&&plan.steps.find(s=>s.id===contactStep)?.status!=="queued"))&&<button className="care-primary" disabled={saving} onClick={()=>{outcomeSnapshot.current=plan?{id:plan.id,revision:plan.revision}:undefined;setOutcome(true)}}>记录联系结果</button>}</div>}
      {data.jobs.length>0&&<div className="care-device-progress"><h3>设备执行进展</h3>{data.jobs.map(job=><p key={job.id}><strong>{phaseLabels[job.status]??job.status}</strong><span>{job.detail}</span></p>)}</div>}
      {plan&&<AppLink className="care-link" href={`/events/${plan.id}`}>查看家庭事件 <ArrowRight size={17}/></AppLink>}
    </section></div>
    {plan&&<section className="care-history"><h2>这次联系的进展</h2>{plan.history.map((h,i)=><article key={i}><time>{new Date(h.at).toLocaleTimeString("zh-CN")}</time><div><strong>{h.title}</strong><p>{h.actor} · {h.detail}</p></div></article>)}</section>}
    <details className="care-research"><summary>采集与联调记录</summary><p>这里区分数据来源与传输方式，供联调和评估使用。</p><button className="care-text-button" onClick={()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),...data},null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="家有备-关怀采集记录.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}><FileDown size={18}/>导出当前记录</button><p>硬件台架、家庭演练、自然使用尚需团队实际采集；多次回放不会增加样本量。</p></details>
    </>}
    {outcome&&plan&&<CareOutcomeDialog onClose={()=>setOutcome(false)} onSave={async value=>{await command("outcome",{outcome:value,caseId:outcomeSnapshot.current?.id,expectedVersion:outcomeSnapshot.current?.revision})}}/>}
  </div>;
}
