"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Activity,ArrowRight,Check,Mic,RefreshCw,Volume2,Camera,Clock3} from 'lucide-react';
import {homeApi,type HomeWorkspace} from '@/src/api/homeApi';
import type {HomeObservation} from '@/lib/multimodal/core';
import type {HomeProposal} from '@/lib/server/multimodal-service';
import {useSpeechInput} from './useSpeechInput';
import HomeTimelineCard from './HomeTimelineCard';
import {AppLink} from './navigation';
import Dialog from './Dialog';
const proposalStatus:Record<string,string>={draft:'等待家人确认',prepared:'联系计划已整理',dispatching:'执行状态待核对',simulated:'软件演练已记录',api_accepted:'设备接口已接受',failed:'执行未完成',unknown:'执行结果待核对'};
export default function MultimodalHome(){
 const [data,setData]=useState<HomeWorkspace>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[text,setText]=useState(''),[answer,setAnswer]=useState(''),[selected,setSelected]=useState<HomeObservation>(),[filter,setFilter]=useState('all'),[protocol,setProtocol]=useState<Record<string,unknown>>(),[sample,setSample]=useState(false);
 const alive=useRef(true),generation=useRef(0);
 const refresh=useCallback(async()=>{const ticket=++generation.current;try{const result=await homeApi.read();if(alive.current&&ticket===generation.current)setData(result)}catch(e){if(alive.current)setError(e instanceof Error?e.message:'读取失败')}},[]);
 useEffect(()=>{alive.current=true;void Promise.resolve().then(refresh);return()=>{alive.current=false}},[refresh]);
 const {startVoice,listening,voiceError}=useSpeechInput(setText);
 const run=async(input:Record<string,unknown>)=>{if(busy)return;setBusy(true);setError('');try{const result=await homeApi.command(input);if(!alive.current)return;
 if(result.intent?.kind==='timeline')setAnswer(result.events?.length?`最近一条动态：${result.events[0].title}。图像观察仅作线索，请结合家人的回应确认情况。`:'目前没有已接入的家庭动态，可以先同步设备或载入软件演练。');
 else if(result.intent?.kind==='unsupported')setAnswer(result.intent.title+'。'+result.intent.detail);else setAnswer(result.proposal?'':result.detail??'安排已整理。');await refresh();
 }catch(e){if(alive.current)setError(e instanceof Error?e.message:'操作失败')}finally{if(alive.current)setBusy(false)}};
 const canManage=data&&['家庭管理员','admin'].includes(data.actor.role);
 const choose=useCallback((e:HomeObservation)=>setSelected(e),[]);
 const filtered=useMemo(()=>data?.events.filter(e=>filter==='all'||(filter==='people'?e.category==='person':e.category!=='person'))??[],[data?.events,filter]);
 const newest=data?.proposals[0];

 return <div className="multimodal-home"><header className="page-header"><div><p className="eyebrow">多模态家庭协作 Agent</p><h1>看见家里，听懂家人。</h1><p className="page-description">线索在这里汇合，安排从这里开始。</p></div><div className="home-input-actions"><AppLink className="care-link" href="/experience">完整产品体验 <ArrowRight size={17}/></AppLink><button className="care-text-button" onClick={()=>void refresh()}><RefreshCw size={17}/>更新动态</button></div></header>
 {error&&<p className="care-error" role="alert">{error}</p>}
 {!data?<p role="status">正在连接家庭空间…</p>:<>
 <div className="home-hub-context"><span><Camera size={16}/>视觉时间线</span><span><Volume2 size={16}/>语音与设备</span><span><Activity size={16}/>家庭协作</span><small>{data.events.some(e=>e.evidenceCategory==='synthetic')?'软件演练 · 构造输入':data.events.length?'已接入家庭事件':'等待接入家庭事件'}</small></div>
 <div className="home-hub-grid"><section className="home-timeline-panel"><div className="home-panel-header"><div><p className="eyebrow">发生了什么</p><h2>家里的动态</h2></div><select aria-label="筛选家庭动态" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部动态</option><option value="people">人物活动</option><option value="other">其他线索</option></select></div>
 {filtered.length?<HomeTimelineCard events={filtered} onSelect={choose}/>:<div className="home-hub-empty"><Clock3 size={30}/><h3>{data.events.length?'没有符合筛选的动态':'让家庭线索，先汇合起来。'}</h3><p>公共区域事件、设备变化与家人的回应，<br/>一起构成下一步的依据。</p></div>}
 <div className="home-panel-footer">{canManage&&<><button className="care-text-button" disabled={busy} onClick={()=>void run({action:'load_demo'})}>载入软件演练</button><button className="care-text-button" disabled={busy||!data.capabilities.timelineConfigured} title={!data.capabilities.timelineConfigured?'请先配置授权的时间线连接':undefined} onClick={()=>void run({action:'sync_timeline'})}>{data.capabilities.timelineConfigured?'同步家庭动态':'设备连接待配置'}</button></>}<button className="care-text-button" onClick={()=>setSample(true)}>查看多事件示例</button></div></section>
 <section className="home-action-panel"><p className="eyebrow">想安排什么</p><h2>说一句，先想好下一步。</h2><form onSubmit={e=>{e.preventDefault();void run({action:'interpret',text})}}><textarea aria-label="告诉家有备你的家庭安排" value={text} onChange={e=>setText(e.target.value)} maxLength={240} placeholder="例如：打开客厅的灯"/><div className="home-input-actions"><button type="button" className="care-text-button" onClick={startVoice}><Mic size={19}/>{listening?'停止语音输入':'语音输入'}</button><button className="care-primary" disabled={busy||!text.trim()} type="submit">整理下一步 <ArrowRight size={18}/></button></div></form>
 {voiceError&&<p className="care-error" role="alert">{voiceError}</p>}<div className="home-command-examples">{['看看家里刚才的动态','打开客厅的灯','确认妈妈的情况'].map(q=><button key={q} onClick={()=>setText(q)}>{q}</button>)}</div>{answer&&<p className="home-agent-answer" role="status">{answer}</p>}{newest&&<ProposalCard proposal={newest} busy={busy} canManage={Boolean(canManage)} onApprove={p=>void run({action:"approve",id:p.id,version:p.version,confirmed:true})}/>}
 </section></div>
 <section className="home-history-section"><div className="home-panel-header"><h2>每次安排，都有后续。</h2><AppLink href="/care" className="care-link">关怀确认 <ArrowRight size={17}/></AppLink></div>{data.proposals.length>1?<div className="home-proposal-history">{data.proposals.slice(1,5).map(p=><ProposalCard key={p.id} proposal={p} busy={busy} canManage={Boolean(canManage)} onApprove={p=>void run({action:"approve",id:p.id,version:p.version,confirmed:true})}/>)}</div>:<p className="care-description">已确认的安排与待继续的联系，会保存在家庭空间。</p>}</section>
 <details className="care-research"><summary>连接与联调</summary><p>{data.capabilities.voiceTerminal}。协议工具只读取动态或准备安排，不能跳过家人的确认。</p><button className="care-text-button" disabled={busy} onClick={()=>{setBusy(true);void homeApi.mcp({session_id:'family-ui',type:'mcp',payload:{jsonrpc:'2.0',id:1,method:'tools/list',params:{}}}).then(r=>{if(alive.current)setProtocol(r)}).catch(()=>{if(alive.current)setError('工具接口暂不可用')}).finally(()=>{if(alive.current)setBusy(false)})}}>检查家庭工具连接</button>{protocol&&<><p className="home-tool-connected">家庭工具已连通 · 可读取动态与准备安排</p><button className="care-text-button" disabled={busy} onClick={()=>{setBusy(true);void homeApi.mcp({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"home.timeline",arguments:{}}}).then(r=>{if(alive.current){setProtocol(r);setAnswer("家庭工具已返回当前时间线，仍需结合家人的明确回应确认情况。")}}).catch(()=>{if(alive.current)setError("动态读取暂未完成")}).finally(()=>{if(alive.current)setBusy(false)})}}>通过家庭工具读取动态</button><pre className="home-protocol-record">{JSON.stringify(protocol,null,2)}</pre></>}<p>软件演练不代表已连接摄像头或语音硬件，原始图像需在授权渠道查看。</p></details>
 </>}
 {selected&&<Dialog title={selected.title} onClose={()=>setSelected(undefined)}><p className="care-description">{selected.description}</p><p className="care-subtle">{new Date(selected.start).toLocaleString('zh-CN')} · {selected.evidenceCategory==='synthetic'?'软件演练事件':'家庭区域观察'}</p>{selected.key_frame==='/brand/living-room.png'&&<figure className="home-event-image"><img src="/brand/living-room.png" alt="客厅情景配图"/><figcaption>情景配图 · 软件演练</figcaption></figure>}<button className="care-text-button" onClick={()=>{setText('确认妈妈的情况');setSelected(undefined)}}>整理一份联系安排 <ArrowRight size={17}/></button></Dialog>}
 {sample&&<Dialog title="多事件时间线示例" onClose={()=>setSample(false)}><figure className="home-event-image"><img src="/integrations/demos/timeline-light.png" alt="多事件时间线界面示例"/><figcaption>界面效果示例 · 非本家庭的实时记录</figcaption></figure></Dialog>}
 </div>;
}

export function ProposalCard({proposal:p,busy,canManage,onApprove}:{proposal:HomeProposal;busy:boolean;canManage:boolean;onApprove:(p:HomeProposal)=>void}){return <article className="home-proposal" key={p.id}><div className="home-proposal-state"><span>{proposalStatus[p.status]??p.status}</span><time>{new Date(p.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time></div><h3>{p.intent.title}</h3><p>{p.detail}</p>{p.status==='draft'&&canManage&&<button className="care-primary" disabled={busy} onClick={()=>onApprove(p)}>同意这次灯光安排 <ArrowRight size={18}/></button>}{p.caseId&&<AppLink className="care-primary" href={'/care?caseId='+encodeURIComponent(p.caseId)}>查看并确认联系计划 <ArrowRight size={18}/></AppLink>}{p.status!=='draft'&&!p.caseId&&<span className="home-proposal-result"><Check size={16}/>处理记录已保存</span>}</article>}
