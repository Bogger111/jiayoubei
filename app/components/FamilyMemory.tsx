"use client";
import { useEffect, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { useProductStore } from "@/lib/product-store";
import { apiRequest } from "@/src/api/apiClient";
import Dialog from "./Dialog";
import { PageHeader } from "./ui";
type Memory = { id: number; member: string; content: string; type: string; source: string };
let demoMemories: Memory[] = [
  { id: 1, member: "妈妈", content: "通常午后会休息一会儿，手机有时会调成静音。", type: "habit", source: "演示家庭 · 生活习惯" },
  { id: 2, member: "家庭", content: "需要确认情况时，先语音联系，再由家人协助。附近联系人只在必要时参与。", type: "preference", source: "演示家庭 · 联系偏好" },
  { id: 3, member: "王阿姨", content: "住在同楼，可协助上门确认。联系前由家人确认本次安排。", type: "profile", source: "演示家庭 · 联系人" },
];
export default function FamilyMemory() {
  const state = useProductStore();
  const [entries, setEntries] = useState<Memory[]>(state.demoMode ? demoMemories : []);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!state.demoMode);
  useEffect(() => {
    if (state.demoMode) return;
    const controller = new AbortController();
    void apiRequest<{ memories: Memory[] }>("/api/memory", { signal: controller.signal }).then(result => { if (!controller.signal.aborted) setEntries(result.memories); }).catch(issue => { if (!controller.signal.aborted) setError(issue.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [state.demoMode, state.family.id]);
  const canEdit = state.demoMode || ["家庭管理员", "admin"].includes(state.user.role);
  const save = async () => {
    if (!draft.trim() || busy || !canEdit) return;
    setBusy(true); setError("");
    try {
      const payload = { member: "家庭", content: draft.trim(), type: "preference", source: "家庭成员补充", importance: 3 };
      const memory = state.demoMode ? { ...payload, id: Date.now() } : (await apiRequest<{ memory: Memory }>("/api/memory", { method: "POST", body: JSON.stringify(payload) })).memory;
      if (state.demoMode) demoMemories = [memory, ...demoMemories];
      setEntries(items => [memory, ...items]); setDraft(""); setOpen(false);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "暂时无法保存，请重试。"); }
    finally { setBusy(false); }
  };
  const shown = entries.filter(entry => `${entry.member}${entry.content}`.includes(query.trim()));
  return <div><PageHeader eyebrow="更懂这个家" title="家庭记忆" description="记住生活习惯与联系偏好，让每次安排更贴合家人。" action={canEdit ? <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} />补充记忆</button> : undefined} />
    <div className="memory-tools"><label className="search-box"><Search size={17} /><input aria-label="搜索家庭记忆" placeholder="搜索习惯、偏好或家人…" value={query} onChange={event => setQuery(event.target.value)} /></label><span>{shown.length} 条记忆</span></div>
    {error && !open && <p role="alert" className="care-error">{error}</p>}
    {loading ? <p role="status">正在读取家庭记忆…</p> : <div className="memory-list">{shown.map(entry => <article className="memory-item" key={entry.id}><header><strong><BookOpen size={15} style={{ display: "inline", marginRight: 8 }} />{entry.member}</strong><span>{entry.source}</span></header><p>{entry.content}</p></article>)}{shown.length === 0 && <p className="care-subtle">没有找到对应的记忆，可以添加一条家庭习惯。</p>}</div>}
    {open && <Dialog title="让家有备多了解一点" onClose={() => setOpen(false)} busy={busy}><form className="memory-create" onSubmit={event => { event.preventDefault(); void save(); }}><label htmlFor="memory-content">家里的习惯或联系偏好</label><textarea id="memory-content" value={draft} onChange={event => setDraft(event.target.value)} placeholder="例如：妈妈午后通常会休息，优先用语音留言联系。" rows={5} maxLength={4000} required />{error && <p role="alert">{error}</p>}<button className="care-primary" type="submit" disabled={busy || !draft.trim()}>{busy ? "正在保存…" : "保存这条记忆"}</button></form></Dialog>}
  </div>;
}
