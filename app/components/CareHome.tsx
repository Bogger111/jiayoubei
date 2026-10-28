"use client";
import { useState, type FormEvent } from "react";
import { Activity, ArrowRight, ArrowUp, Check, ChevronRight, DoorOpen, MapPin, Mic, Phone, RefreshCw, SlidersHorizontal, Users, Camera, Lightbulb, Clock3 } from "lucide-react";
import { productStore, useProductStore } from "@/lib/product-store";
import { careScenarioLabels, type CareScenario } from "@/lib/care-agent";
import { AppLink, navigate } from "./navigation";
import { useCurrentTime } from "./useCurrentTime";
import { useSpeechInput } from "./useSpeechInput";
import Dialog from "./Dialog";
import { selectDashboardSummary } from "@/lib/product-selectors";
export default function CareHome() {
  const state = useProductStore();
  const plan = state.demoMode ? state.carePlan : undefined;
  const summary = selectDashboardSummary(state);
  const current = useCurrentTime();
  const [dialog, setDialog] = useState<"evidence" | "edit" | "reply" | "scenarios" | null>(null);
  const [contact, setContact] = useState(plan?.contact ?? "M003");
  const [wait, setWait] = useState(plan?.waitMinutes ?? 10);
  const [reply, setReply] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const { startVoice, listening, voiceError } = useSpeechInput(setText);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!text.trim() || state.busy) return; const value = text.trim(); setText(""); navigate("/ai"); await productStore.sendMessage(value); };
  const act = (operation: () => void) => { try { operation(); setError(""); setDialog(null); } catch (issue) { setError(issue instanceof Error ? issue.message : "请稍后重试"); } };
  const open = (target: typeof dialog) => { setError(""); if (target === "edit") { setContact(plan?.contact ?? "M003"); setWait(plan?.waitMinutes ?? 10); } setDialog(target); };
  const icons = [Activity, DoorOpen, Phone, Camera];
  const today = new Date(current).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: state.family.timezone });
  return <div className="care-home">
    <div className="care-date">{today}</div>
    <div className="care-columns">
      <section className="care-overview">
        <h1><span>把远方的牵挂，</span><wbr /><span>放在心上</span></h1>
        <AppLink className="care-location" href="/settings"><MapPin size={19} />{state.demoMode ? "父母家 · 杭州" : state.family.name}</AppLink>
        <div className={`care-status ${plan?.status === "resolved" || plan?.status === "monitoring" ? "is-calm" : ""}`}><i />{plan?.status === "pending" ? "有一件事需要你确认" : plan?.status === "following" ? "计划已开始，正在协同跟进" : plan?.status === "resolved" ? "家人已回应" : plan ? "持续关注家中情况" : summary.statusLabel}</div>
        <h2>{plan?.title ?? summary.priorityAction?.title ?? "家里的事，一起照顾"}</h2>
        <p className="care-description">{plan?.reply ?? plan?.reason ?? summary.description}</p>
        <div className="care-signals">{(plan?.evidence ?? state.devices.slice(0, 3).map(device => ({ label: device.name, value: device.reading }))).slice(0, 3).map((signal, index) => { const Icon = icons[index]; return <div key={signal.label}><span className="care-signal-icon"><Icon size={22} strokeWidth={1.7} /></span><strong>{signal.label}</strong><span>{signal.value}</span></div>; })}</div>
        {plan ? <button className="care-link" onClick={() => open("evidence")}>查看完整依据 <ArrowRight size={17} /></button> : <AppLink className="care-link" href="/events">查看家庭事件 <ArrowRight size={17} /></AppLink>}
      </section>
      <section className="care-plan" aria-label="家庭行动计划" aria-live="polite">
        <h2>{plan?.status === "following" ? "正在为你跟进" : plan?.status === "resolved" ? "家人已经接上了这份关心" : plan?.status === "monitoring" ? "这次，先让妈妈安心生活" : "建议这样安排"}</h2>
        <p>{plan?.status === "following" ? "设备响应、家人分工，进展在这里汇合" : plan?.status === "resolved" ? "本次跟进已结束，记录已保存" : plan?.status === "monitoring" ? "结合新的信息，调整照顾的节奏" : "确认后，由我协同跟进"}</p>
        {plan?.steps.length ? <ol className="care-steps">{plan.steps.map((step, index) => <li key={step.id} className={`step-${step.status}`}><span className="care-step-number">{step.status === "done" ? <Check size={21} /> : String(index + 1).padStart(2, "0")}</span><div><strong>{step.id === "family" ? `请${state.members.find(member => member.id === plan.contact)?.name ?? "家人"}协助联系妈妈` : step.title}</strong>{plan.status !== "pending" && <small>{step.status === "pending" ? `${plan.waitMinutes} 分钟仍无回应时再推进` : step.status === "skipped" ? "已收到回应，无需继续" : step.status === "failed" ? "设备未响应，已请家人接手" : step.id === "device" ? "本地模拟设备已返回回执" : "联系任务已创建，等待接手"}</small>}</div>{step.id === "device" ? <Lightbulb size={23} /> : step.id === "family" ? <Phone size={23} /> : <Users size={23} />}</li>)}</ol> : <div className="care-calm"><Check size={32} /><strong>{plan ? "暂不安排额外打扰" : `${state.tasks.filter(task => task.status !== "completed").length} 项家庭任务待跟进`}</strong><span>{plan ? "家有备会根据新的信息，再整理下一步。" : "查看正在进行的家庭安排，或描述新的情况。"}</span></div>}
        <div className="care-plan-actions">{plan?.status === "pending" ? <><button className="care-primary" disabled={Boolean(state.busy)} onClick={() => void productStore.approveCare().catch(issue => setError(issue.message))}>同意并开始安排 <ArrowRight size={22} /></button><button className="care-text-button" onClick={() => open("edit")} disabled={Boolean(state.busy)}>调整计划</button></> : plan?.status === "following" ? <><button className="care-primary" disabled={Boolean(state.busy)} onClick={() => open("reply")}>{state.busy ? "正在安排…" : "记录家人回应"}<ArrowRight size={22} /></button><AppLink className="care-text-button" href={`/events/${plan.id}`}>查看进度</AppLink></> : <><AppLink className="care-primary" href={plan?.status === "resolved" ? `/events/${plan.id}` : "/tasks"}>{plan?.status === "resolved" ? "查看这次记录" : "查看家庭安排"}<ArrowRight size={22} /></AppLink><AppLink className="care-text-button" href="/ai">和我聊聊</AppLink></>}</div>
        {error && !dialog && <p className="care-error" role="alert">{error}</p>}
      </section>
    </div>
    <div className="care-family">{state.members.filter(member => ["母亲", "父亲"].includes(member.relation)).map(member => <AppLink href={`/members/${member.id}`} key={member.id}><img src={member.relation === "母亲" ? "/brand/mother.png" : "/brand/father.png"} alt="" /><div><strong>{member.relation === "母亲" ? "妈妈" : "爸爸"}</strong><span className={member.relation === "母亲" && plan?.status === "pending" ? "care-amber" : ""}>{member.relation === "母亲" && plan ? plan.status === "resolved" ? "已确认情况" : plan.status === "monitoring" ? "持续关注" : "等待确认" : member.online ? "在线" : "暂时离线"}</span></div><ChevronRight size={20} /></AppLink>)}{!state.members.length && <AppLink href="/members">添加家人 <ArrowRight size={18} /></AppLink>}</div>
    <form className="care-composer" onSubmit={submit}><button type="button" className={listening ? "is-listening" : ""} onClick={startVoice} aria-label={listening ? "停止语音输入" : "语音输入"}><Mic size={25} /></button><input value={text} onChange={event => setText(event.target.value)} aria-label="告诉家有备你的安排" placeholder="告诉家有备，你想为家人安排什么…" maxLength={4000} /><button type="submit" aria-label="发送给家有备" disabled={!text.trim() || Boolean(state.busy)}><ArrowUp size={24} /></button></form>
    {voiceError && <p className="care-error" role="alert">{voiceError}</p>}
    <div className="care-below"><AppLink href="/events">家庭事件 <ChevronRight size={14} /></AppLink><AppLink href="/members">所有家人 <ChevronRight size={14} /></AppLink>{state.demoMode && <button onClick={() => open("scenarios")}><RefreshCw size={13} />场景预演</button>}</div>
    {dialog === "evidence" && plan && <Dialog title="这份计划的依据" onClose={() => setDialog(null)}><p className="care-dialog-intro">把不同来源的信息放在一起，决定下一步怎样联系家人。</p><div className="care-evidence-list">{plan.evidence.map(item => <div key={item.label}><strong>{item.label}</strong><span>{item.value}</span></div>)}</div>{plan.signals.imageAuthorized ? <figure className="care-evidence-image"><img src="/brand/living-room.png" alt="示例客厅画面，当前未见人" /><figcaption>授权图像情景 · 示例画面</figcaption></figure> : <div className="care-image-consent"><Camera size={24} /><div><strong>画面未加入本次判断</strong><p>家庭当前的摄像头权限保持关闭。此计划依据设备与回应记录生成。</p></div></div>}<p className="care-subtle">场景输入为演示数据；计划由本地编排程序生成。</p></Dialog>}
    {dialog === "edit" && plan && <Dialog title="按家里的习惯安排" onClose={() => setDialog(null)}><form className="care-dialog-form" onSubmit={event => { event.preventDefault(); act(() => productStore.reviseCare(contact, wait)); }}><label>先请谁协助联系<select value={contact} onChange={event => setContact(event.target.value)}>{state.members.filter(member => member.relation !== "母亲" && member.role !== "儿童").map(member => <option key={member.id} value={member.id}>{member.name} · {member.relation}</option>)}</select></label><label>多久仍无回应，再请附近联系人<select value={wait} onChange={event => setWait(Number(event.target.value))}><option value={5}>5 分钟</option><option value={10}>10 分钟</option><option value={15}>15 分钟</option></select></label>{error && <p role="alert">{error}</p>}<button className="care-primary" type="submit"><SlidersHorizontal size={18} />保存安排</button></form></Dialog>}
    {dialog === "reply" && <Dialog title="家人回应了什么" onClose={() => setDialog(null)}><form className="care-dialog-form" onSubmit={event => { event.preventDefault(); act(() => productStore.resolveCare(reply)); }}><label>记录联系结果<textarea value={reply} onChange={event => setReply(event.target.value)} placeholder="例如：已与妈妈通话，刚才在午睡，一切平安。" minLength={4} maxLength={1000} required rows={4} /></label><p>保存后结束本次跟进，未执行的后续联系将停止。</p>{error && <p role="alert">{error}</p>}<button className="care-primary" type="submit">保存回应并结束跟进 <Check size={20} /></button></form></Dialog>}
    {dialog === "scenarios" && <Dialog title="换一种家庭情况" onClose={() => setDialog(null)}><p className="care-dialog-intro">改变输入信息，观察家有备如何调整计划。</p><div className="care-scenarios">{Object.entries(careScenarioLabels).map(([key, label]) => <button key={key} disabled={Boolean(state.busy)} onClick={() => { productStore.prepareCareScenario(key as CareScenario); setDialog(null); }}><Clock3 size={20} /><span>{label}</span><ArrowRight size={18} /></button>)}</div></Dialog>}
  </div>;
}
