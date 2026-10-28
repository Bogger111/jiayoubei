"use client";
import { useState } from "react";
import { careOutcomeLabels, type CareOutcomeInput } from "@/lib/care-agent";
import Dialog from "./Dialog";
export type OutcomeDraft = Omit<CareOutcomeInput,"actor"|"caseId">;
export default function CareOutcomeDialog({onClose,onSave}:{onClose:()=>void;onSave:(value:OutcomeDraft)=>Promise<void>}) {
  const [type,setType]=useState<CareOutcomeInput["type"]>("needs_followup"),[remark,setRemark]=useState(""),[method,setMethod]=useState<CareOutcomeInput["method"]>("phone"),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  return <Dialog title="记录这次联系结果" onClose={onClose}><form className="care-dialog-form" onSubmit={async e=>{e.preventDefault();setSaving(true);setError("");try{await onSave({type,remark,method,confirmed});onClose()}catch(issue){setError(issue instanceof Error?issue.message:"保存失败，请核对最新记录")}finally{setSaving(false)}}}>
    <label>联系结果<select aria-label="联系结果" value={type} onChange={e=>{setType(e.target.value as typeof type);setConfirmed(false)}}>{Object.entries(careOutcomeLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>核实方式<select aria-label="核实方式" value={method} onChange={e=>setMethod(e.target.value as typeof method)}><option value="phone">电话联系</option><option value="in_person">当面核实</option><option value="message">消息确认</option><option value="button">实体回应按钮，已人工确认身份</option></select></label>
    <label>记录联系结果<textarea aria-label="记录联系结果" value={remark} onChange={e=>setRemark(e.target.value)} placeholder="记录谁回应了、确认了什么，以及还需要做什么。" minLength={type==="safe_confirmed"?4:0} maxLength={1000} rows={4} required={type==="safe_confirmed"}/></label>
    {type==="safe_confirmed"?<label className="care-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required/>我已核实当前这次情况，可以结束后续联系。</label>:<p>{type==="cancelled_unresolved"?"取消会停止尚未发出的安排，记录保留为“未核实”。":"本次仍会继续跟进，保留已约定的等待期限。"}</p>}
    {error&&<p role="alert" className="care-error">{error}</p>}<button disabled={saving} className="care-primary" type="submit">{saving?"正在保存…":type==="safe_confirmed"?"保存回应并结束跟进":type==="cancelled_unresolved"?"取消跟进并保留未核实记录":"保存结果，继续跟进"}</button>
  </form></Dialog>;
}
