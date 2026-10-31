"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Check,Eye,MessageCircle,Mic,Play,RefreshCw,Users,Volume2} from 'lucide-react';
import {homeApi,type HomeWorkspace} from '@/src/api/homeApi';
import {homeScenarios,type HomeObservation} from '@/lib/multimodal/core';
import {experienceGallery,householdPhrases} from '@/lib/multimodal/experience';
import HomeTimelineCard from './HomeTimelineCard';
import {ProposalCard} from './MultimodalHome';
import {AppLink} from './navigation';
import {useSpeechInput} from './useSpeechInput';
import Dialog from './Dialog';

const tabs=[{id:'vision',label:'家庭动态',Icon:Eye},{id:'intent',label:'一句话安排',Icon:MessageCircle},{id:'terminal',label:'家庭对话',Icon:Volume2},{id:'family',label:'家人协作',Icon:Users}] as const;
type Tab=typeof tabs[number]['id'];
type Trace={label:string;status:'waiting'|'done'|'failed'};
const initialTrace=():Trace[]=>[{label:'连接家庭助手',status:'waiting'},{label:'读取家庭工具',status:'waiting'},{label:'整理本次回复',status:'waiting'}];
const terminalOptions=[{id:'timeline',text:'看看家里刚才的动态'},{id:'light',text:'帮我打开客厅的灯'},{id:'care',text:'帮我确认妈妈的情况'}];
const record=(x:unknown):Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};

export default function MultimodalExperience(){
  const [data,setData]=useState<HomeWorkspace>(),[tab,setTab]=useState<Tab>('vision'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [text,setText]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState<HomeObservation>(),[gallery,setGallery]=useState<typeof experienceGallery[number]>();
  const [utterance,setUtterance]=useState('timeline'),[said,setSaid]=useState(''),[reply,setReply]=useState(''),[trace,setTrace]=useState<Trace[]>(initialTrace),[tonePlaying,setTonePlaying]=useState(false);
  const [recording,setRecording]=useState('family'),[tone,setTone]=useState('success');
  const alive=useRef(true),locked=useRef(false),generation=useRef(0),rpcId=useRef(0),audio=useRef<HTMLAudioElement>(null);
  const refresh=useCallback(async()=>{const ticket=++generation.current;const next=await homeApi.read();if(alive.current&&ticket===generation.current)setData(next);return next},[]);
  useEffect(()=>{alive.current=true;void Promise.resolve().then(refresh).catch(()=>{if(alive.current)setError('家庭空间暂未连接，请更新后重试。')});return()=>{alive.current=false}},[refresh]);
  const chooseEvent=useCallback((e:HomeObservation)=>setSelected(e),[]);
  const events=useMemo(()=>data?.events.filter(e=>filter==='all'||e.category===filter)??[],[data?.events,filter]);
  const newest=useMemo(()=>data?.events.slice(0,1)??[],[data?.events]);
  const device=data?.devices.find(d=>d.kind==='lighting');
  const subject=data?.members.find(m=>m.relation==='母亲')??data?.members.find(m=>m.relation==='父亲');
  const canManage=Boolean(data&&['家庭管理员','admin'].includes(data.actor.role));
  const phrases=useMemo(()=>householdPhrases(device?.name??'客厅主灯'),[device?.name]);
  const {startVoice,listening,voiceError}=useSpeechInput(setText);
  const run=async(input:Record<string,unknown>)=>{
    if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');
    try{
      const result=await homeApi.command(input);if(!alive.current)return;
      if(input.action==='load_demo'||result.proposal)setNotice('');
      else if(result.intent?.kind==='unsupported')setNotice(result.intent.title+'。'+result.intent.detail);
      else if(result.intent?.kind==='timeline')setNotice(result.events?.length?'最近动态：'+result.events[0].title:'还没有家庭动态，请先载入演练或接入设备。');
      else setNotice(result.detail??'安排已保存。');
      await refresh();
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'本次操作暂未完成')}
    finally{locked.current=false;if(alive.current)setBusy(false)}
  };
  const terminal=async()=>{
    if(locked.current||!data)return;locked.current=true;setBusy(true);setError('');setReply('');setTrace(initialTrace());
    setSaid(utterance==='light'?`帮我打开${device?.name??'客厅的灯'}`:utterance==='care'?`帮我确认${subject?.name??'妈妈'}的情况`:terminalOptions[0].text);
    let stage=0;
    const done=(index:number)=>{if(alive.current)setTrace(previous=>previous.map((s,i)=>i===index?{...s,status:'done'}:s))};
    const call=async(method:string,params:Record<string,unknown>)=>{
      const response=await homeApi.mcp({session_id:'family-experience',type:'mcp',payload:{jsonrpc:'2.0',id:++rpcId.current,method,params}});
      const payload=record(response.payload??response);if(payload.error)throw new Error(String(record(payload.error).message??'家庭工具暂不可用'));return record(payload.result);
    };
    try{
      await call('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'family-experience',version:'1.0'}});done(0);stage=1;
      const tools=await call('tools/list',{});if(!Array.isArray(tools.tools)||tools.tools.length<3)throw new Error('家庭工具尚未准备好');done(1);stage=2;
      if(utterance==='light'&&!device)throw new Error('请先添加本家庭的灯光设备');
      if(utterance==='care'&&!subject)throw new Error('请先在成员页设置需要照护的父母');
      const tool=utterance==='light'?'home.light.prepare':utterance==='care'?'home.care.prepare':'home.timeline';
      const result=await call('tools/call',{name:tool,arguments:utterance==='light'?{deviceId:device!.id}:utterance==='care'?{subjectId:subject!.id}:{}});
      const content=Array.isArray(result.content)?record(result.content[0]):{};
      const body=record(JSON.parse(typeof content.text==='string'?content.text:'{}'));
      if(result.isError===true)throw new Error('本次家庭安排暂未完成');
      if(alive.current){setReply(utterance==='timeline'?(Array.isArray(body.events)&&body.events.length?'最近一条动态是“'+String(record(body.events[0]).title)+'”。需要联系家人时，我可以继续整理安排。':'目前还没有已接入的家庭动态。'):utterance==='light'?'这次灯光安排已整理，等家人确认后再发送。':'联系计划已整理，家人可以核对并确认下一步。')}
      done(2);await refresh();
    }catch(e){if(alive.current){setError(e instanceof Error?e.message:'家庭对话暂未完成');setTrace(previous=>previous.map((s,i)=>i===stage?{...s,status:'failed'}:s))}}
    finally{locked.current=false;if(alive.current)setBusy(false)}
  };
  const approve=(p:NonNullable<HomeWorkspace['proposals']>[number])=>void run({action:'approve',id:p.id,version:p.version,confirmed:true});

  return <div className="home-experience">
    <header className="experience-header"><div><p className="eyebrow">家有备 · 产品体验</p><h1>一个家的事，<span>一起安排好。</span></h1><p>看见变化，听懂表达，让设备与家人接上下一步。</p></div><AppLink className="care-link" href="/home-agent">我的家庭空间 <ArrowRight size={17}/></AppLink></header>
    <nav className="experience-tabs" role="tablist" aria-label="产品体验能力">{tabs.map(({id,label,Icon},i)=><button type="button" key={id} role="tab" id={'experience-tab-'+id} aria-controls={'experience-panel-'+id} aria-selected={tab===id} tabIndex={tab===id?0:-1} onClick={()=>setTab(id)} onKeyDown={e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[n].id);document.getElementById('experience-tab-'+tabs[n].id)?.focus()}}><Icon size={18}/>{label}</button>)}</nav>
    {error&&<p className="care-error" role="alert">{error}</p>}
    {notice&&<p className="experience-notice" role="status">{notice}</p>}
    {!data?<div className="experience-loading"><p>正在打开家庭空间…</p><button className="care-text-button" onClick={()=>void refresh().catch(()=>setError('家庭空间暂不可用'))}><RefreshCw size={16}/>重新连接</button></div>:<section role="tabpanel" id={'experience-panel-'+tab} aria-labelledby={'experience-tab-'+tab} className="experience-panel">
      {tab==='vision'&&<>
        <div className="experience-section-heading"><div><p className="eyebrow">看见家里的变化</p><h2>最近发生了什么，<br/>一眼就有线索。</h2></div><label className="experience-filter">查看动态<select value={filter} aria-label="体验动态分类" onChange={e=>setFilter(e.target.value)}><option value="all">全部动态</option><option value="person">人物活动</option><option value="delivery">到访快递</option><option value="vehicle">车辆变化</option><option value="animal">宠物活动</option></select></label></div>
        <div className="experience-vision-grid"><div className="experience-preview"><span className="experience-source">最近一刻 · {newest[0]?.evidenceCategory==='synthetic'?'软件演练':'家庭动态'}</span>{newest.length?<HomeTimelineCard variant="preview" events={newest} onSelect={chooseEvent}/>:<div className="experience-empty"><Eye size={38}/><p>载入一个情景，开始体验。</p></div>}<p className="experience-preview-caption">点击预览，查看这条动态的完整描述。</p></div><div className="experience-timeline">{events.length?<HomeTimelineCard events={events} onSelect={chooseEvent}/>:<div className="experience-empty"><p>{data.events.length?'这个分类暂时没有动态。':'家庭动态会按时间在这里汇合。'}</p></div>}</div></div>
        <div className="experience-scenarios">{homeScenarios.map((s,i)=><button key={s.id} disabled={busy||!canManage} onClick={()=>{setFilter('all');void run({action:'load_demo',scenario:s.id})}}><span>0{i+1}</span><div><strong>{s.title}</strong><small>{s.detail}</small></div><ArrowRight size={18}/></button>)}</div>
      </>}
      {tab==='intent'&&<div className="experience-command-grid"><section><p className="eyebrow">自然表达</p><h2>同一件事，<br/>用习惯的说法。</h2><p className="experience-copy">说清对象与安排，家有备先整理好，再交给家人确认。</p><form onSubmit={e=>{e.preventDefault();void run({action:'interpret',text})}}><textarea aria-label="体验家庭指令" maxLength={240} value={text} onChange={e=>setText(e.target.value)} placeholder="例如：打开客厅的灯"/><div className="home-input-actions"><button className="care-text-button" type="button" onClick={startVoice}><Mic size={17}/>{listening?'停止输入':'语音输入'}</button><button className="care-primary" disabled={busy||!text.trim()}>整理下一步 <ArrowRight size={17}/></button></div></form>{voiceError&&<p role="alert" className="care-error">{voiceError}</p>}<div className="experience-phrases">{[...phrases,'看看家里刚才的动态','确认妈妈的情况'].map(q=><button key={q} onClick={()=>setText(q)}>{q}</button>)}</div></section><section className="experience-plan"><span className="eyebrow">家人的决定，在行动之前</span>{data.proposals[0]?<ProposalCard proposal={data.proposals[0]} busy={busy} canManage={canManage} onApprove={approve}/>:<div className="experience-empty"><Check size={35}/><h3>下一步，会先出现在这里。</h3><p>先核对对象与动作，再确认这一次安排。</p></div>}<div className="experience-plan-foot"><span>01 理解对象</span><span>02 整理安排</span><span>03 等你确认</span></div></section></div>}
      {tab==='terminal'&&<div className="experience-terminal-grid"><section className="experience-terminal"><p className="eyebrow">家庭对话 · 预置语句演练</p><div className={'experience-orb'+(busy||tonePlaying?' active':'')} aria-hidden="true"><span/><span/><span/><span/><span/></div><h2>听懂之后，<br/>还会准备下一步。</h2><p className="experience-copy">家庭动态与行动工具，接在同一段对话里。</p><div className="experience-trace" aria-label="家庭工具进展">{trace.map(s=><span key={s.label} data-status={s.status}>{s.status==='done'?<Check size={14}/>:<i/>}{s.label}</span>)}</div><audio key={tone} ref={audio} preload="none" src={'/integrations/demos/terminal-'+tone+'.ogg'} onPlay={()=>setTonePlaying(true)} onEnded={()=>setTonePlaying(false)} onPause={()=>setTonePlaying(false)}/><label className="experience-tone-choice">交互提示<select aria-label="交互提示音" value={tone} onChange={e=>{setTone(e.target.value);setTonePlaying(false)}}><option value="success">完成提示</option><option value="popup">开始提示</option></select></label><button className="care-text-button" onClick={()=>{void audio.current?.play().catch(()=>setError('请再点击一次播放提示音'))}}><Volume2 size={16}/>播放交互提示音</button></section><section className="experience-dialogue"><div className="experience-chat-header"><span className="experience-available"/>家有备家庭助手<small>按当前家庭权限处理</small></div><label htmlFor="terminal-utterance">选择一句家庭对话</label><select id="terminal-utterance" value={utterance} disabled={busy} onChange={e=>{setUtterance(e.target.value);setSaid('');setReply('');setTrace(initialTrace())}}>{terminalOptions.map(o=><option key={o.id} value={o.id}>{o.id==='light'?`帮我打开${device?.name??'客厅的灯'}`:o.id==='care'?`帮我确认${subject?.name??'妈妈'}的情况`:o.text}</option>)}</select><button className="care-primary" disabled={busy} onClick={()=>void terminal()}><Play size={16}/>{busy?'正在整理…':'体验这句对话'}</button><div className="experience-chat" aria-live="polite">{said?<><p className="experience-user-message">{said}</p>{reply&&<p className="experience-assistant-message">{reply}</p>}</>:<p className="experience-chat-empty">从“家里刚才发生了什么”开始。</p>}</div>{reply&&utterance!=='timeline'&&data.proposals[0]&&<ProposalCard proposal={data.proposals[0]} busy={busy} canManage={canManage} onApprove={approve}/>}</section></div>}
      {tab==='family'&&<div className="experience-family-grid"><section><div className="experience-recording-bar"><span>实际软件操作 · 独立测试账号</span><select aria-label="家庭协作录像" value={recording} onChange={e=>setRecording(e.target.value)}><option value="family">联系人端</option><option value="admin">管理员端</option></select></div><video key={recording} controls playsInline preload="none" poster="/evidence/media/care-p0-resolved.jpg" src={'/evidence/media/care-p0-'+recording+'.webm'} aria-label="家庭协作实际操作录像"/></section><section><p className="eyebrow">让关心真正落到人</p><h2>有人接手，<br/>也有人跟进。</h2><ol className="experience-family-steps"><li><span>01</span><div><strong>家人先确认</strong><p>同意本次联系计划，保留完整安排。</p></div></li><li><span>02</span><div><strong>联系人明确接手</strong><p>用自己的账号接下任务，其他家人能看到进度。</p></div></li><li><span>03</span><div><strong>跟到明确结果</strong><p>未联系到继续跟进，明确核实后结束。</p></div></li></ol><AppLink className="care-primary" href="/care">进入关怀确认 <ArrowRight size={17}/></AppLink></section></div>}
    </section>}
    <section className="experience-gallery"><div className="home-panel-header"><div><p className="eyebrow">更多界面效果</p><h2>从一条动态，到家的全貌。</h2></div><span>界面示例</span></div><div className="experience-gallery-grid">{experienceGallery.map(item=><button key={item.id} onClick={()=>setGallery(item)}><img src={item.path} alt={item.title+'界面示例'}/><strong>{item.title}</strong><span>{item.description}</span></button>)}</div></section>
    <p className="experience-scope">演练情景使用构造输入；界面示例不是本家庭实时记录。实际设备与语音终端可在完成接入后使用。</p>
    {selected&&<Dialog title={selected.title} onClose={()=>setSelected(undefined)}><p className="experience-copy">{selected.description}</p><p className="care-subtle">{new Date(selected.start).toLocaleString('zh-CN')} · {selected.evidenceCategory==='synthetic'?'软件演练事件':'家庭区域观察'}</p>{selected.key_frame==='/brand/living-room.png'&&<figure className="home-event-image"><img src="/brand/living-room.png" alt="客厅情景配图"/><figcaption>软件演练情景配图</figcaption></figure>}<button className="care-primary" onClick={()=>{setSelected(undefined);setTab('intent');setText('确认妈妈的情况')}}>整理联系安排 <ArrowRight size={17}/></button></Dialog>}
    {gallery&&<Dialog title={gallery.title+'示例'} onClose={()=>setGallery(undefined)}><div className="experience-gallery-switch">{experienceGallery.map(item=><button key={item.id} aria-pressed={gallery.id===item.id} onClick={()=>setGallery(item)}>{item.title}</button>)}</div><figure className="home-event-image"><img src={gallery.path} alt={gallery.title+'界面效果示例'}/><figcaption>界面效果示例 · 非本家庭实时事件</figcaption></figure></Dialog>}
  </div>;
}
