"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,Box,Camera,Check,Download,Expand,History,ImagePlus,LayoutGrid,LoaderCircle,Pencil,Save,X} from 'lucide-react';
import type {SpaceConfig,SpaceWorkspace} from '@/lib/space/types';
import {useProductStore} from '@/lib/product-store';
import DioramaView from './DioramaView';
import ScanViewer from './ScanViewer';
import type {ScanJob} from '@/lib/space/reconstruction';
import {AppLink} from './navigation';
import Dialog from './Dialog';
import type {HomeControlPlan} from '@/lib/home-control';
import {homeControlRequest,announceDeviceChange} from '@/src/api/homeControlApi';

export async function spaceRequest(input?:Record<string,unknown>,signal?:AbortSignal):Promise<SpaceWorkspace>{
  const response=await fetch('/api/home-space',{method:input?'POST':'GET',headers:input?{'Content-Type':'application/json'}:undefined,body:input?JSON.stringify(input):undefined,signal});
  const data=await response.json() as {space?:SpaceWorkspace;error?:string;message?:string};
  if(!response.ok||!data.space)throw new Error(data.error??data.message??'暂时无法读取家庭空间');
  return data.space;
}
export default function HomeSpace({compact=false}:{compact?:boolean}){
  const state=useProductStore(),[space,setSpace]=useState<SpaceWorkspace>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(false),[saved,setSaved]=useState(false);
  const draft=useRef<SpaceConfig|undefined>(undefined),latest=useRef<SpaceWorkspace|undefined>(space);useLayoutEffect(()=>{latest.current=space;},[space]);
  const active=useRef(true);
  const [history,setHistory]=useState<{version:number;savedAt:number;title:string;rooms:number}[]>(),[restoring,setRestoring]=useState(false);
  const showHistory=async()=>{try{const r=await fetch('/api/home-space');const d=await r.json() as {history:{version:number;savedAt:number;title:string;rooms:number}[]};if(active.current)setHistory(d.history);}catch{setError('暂时无法读取布局历史');}};
  const restore=async(version:number)=>{if(!space||restoring)return;setRestoring(true);try{const restored=await spaceRequest({operation:'restore',version:space.version,restoreVersion:version});if(active.current){setSpace(restored);setHistory(undefined);}}catch(e){setError(e instanceof Error?e.message:'布局暂时无法恢复');}finally{if(active.current)setRestoring(false);}};
  const [loadedScan,setScan]=useState<ScanJob>();
  const [inspected,setInspected]=useState<string>(),[controlNotice,setControlNotice]=useState('');
  const controlQueue=useRef(new Map<string,Promise<void>>());
  useEffect(()=>{const c=new AbortController();const update=()=>void spaceRequest(undefined,c.signal).then(s=>{if(!c.signal.aborted)setSpace(s)}).catch(()=>{});window.addEventListener('family-devices-changed',update);return()=>{c.abort();window.removeEventListener('family-devices-changed',update);};},[]);
  const inspectedDevice=inspected?space?.states[inspected]:undefined;
  const scan=loadedScan?.id===space?.config.photoScanId?loadedScan:undefined;
  useEffect(()=>{const id=space?.config.photoScanId;if(typeof id!=='string')return;const c=new AbortController();void fetch('/api/reconstruction?id='+encodeURIComponent(id),{signal:c.signal}).then(async r=>{const d=await r.json() as {job?:ScanJob};if(!c.signal.aborted&&d.job)setScan(d.job);}).catch(()=>{});return()=>c.abort();},[space?.config.photoScanId]);
  useEffect(()=>{active.current=true;const controller=new AbortController();void spaceRequest(undefined,controller.signal).then(s=>{if(!controller.signal.aborted)setSpace(s)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>{active.current=false;controller.abort()};},[state.family.id,state.user.id]);
  const save=async(config:SpaceConfig)=>{const current=latest.current;if(!current)return;setBusy(true);setError('');try{const result=await spaceRequest({operation:'save',version:current.version,config});if(active.current){setSpace(result);setEditing(false);setSaved(true);setTimeout(()=>setSaved(false),3000);}}catch(e){if(active.current)setError(e instanceof Error?e.message:'布局保存失败');throw e;}finally{if(active.current)setBusy(false)}};
  const action=async(entityId:string,service:string,data:Record<string,unknown>)=>{
    const previous=controlQueue.current.get(entityId)??Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      if(active.current){setError('');setControlNotice('正在调整设备…');}
      try{
        const {plan}=await homeControlRequest<{plan:HomeControlPlan}>({operation:'space_action',entityId,service,data});
        announceDeviceChange();
        const receipt=plan.receipts.find(item=>item.deviceId===entityId);
        if(!receipt||!['completed','accepted'].includes(plan.status))throw new Error(receipt?.detail??'设备状态暂未确认，请核对后再试');
        if(active.current)setControlNotice(plan.status==='accepted'?'指令已发送，等待设备状态更新':receipt?.status==='simulated'?'示例设备状态已更新':'设备状态已更新');
      }catch(error){
        const message=error instanceof TypeError?'指令状态暂未确认，请核对设备状态':error instanceof Error?error.message:'设备操作暂未确认';
        if(active.current){setControlNotice('');setError(message);}
        throw new Error(message);
      }
    });
    controlQueue.current.set(entityId,next);
    try{await next;}finally{if(controlQueue.current.get(entityId)===next)controlQueue.current.delete(entityId);}
  };
  const exportPlan=()=>{if(!space)return;const url=URL.createObjectURL(new Blob([JSON.stringify(space.config,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='家有备-家庭空间.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <section className={'home-space-page'+(compact?' home-space-compact':'')}>
    {!compact&&<header className="family-page-heading"><div><p className="family-eyebrow">属于这个家的空间</p><h1>家的全貌</h1><p>走进每个房间，让家具、设备和日常发生联系。</p></div><AppLink className="family-button" href="/create-space"><Camera size={18}/>从照片搭建</AppLink></header>}
    <div className="space-stage" aria-label="可交互三维家庭空间">
      <div className="space-stage-toolbar"><span><Box size={18}/>{scan?(scan.source==='public_example'?'公开房间样例扫描':'家庭照片扫描'):space?.config.sceneTitle?String(space.config.sceneTitle):space?.sample?'示例家庭空间':state.family.name}</span><div>{saved&&<span className="space-saved"><Check size={15}/>已保存</span>}{compact&&<AppLink href="/space" title="打开完整空间"><Expand size={18}/></AppLink>}{scan?<AppLink href={'/reconstruct?id='+scan.id}><Pencil size={16}/><span>微调家具</span></AppLink>:<button disabled={!space||busy} onClick={()=>{draft.current=space?.config;setEditing(true)}}><Pencil size={16}/><span>编辑空间</span></button>}{!compact&&<button onClick={()=>void showHistory()} aria-label="查看布局历史"><History size={17}/></button>}{!compact&&<button onClick={exportPlan} disabled={!space} aria-label="导出空间布局"><Download size={17}/></button>}</div></div>
      {scan?.status==='completed'&&scan.result&&scan.modelUrl?<ScanViewer url={scan.modelUrl} manifest={scan.result} edits={scan.edits??{version:0,objects:{},metersPerUnit:1}} readOnly/>:space?<DioramaView space={space} onAction={action} onError={setError} onInspect={setInspected}/>:<div className="space-loading" role="status"><span className="space-loader"/>正在读取家庭空间</div>}
      <div className="space-stage-footer"><span>{scan?'拖动旋转视角 · 滚动缩放 · 进入微调调整家具':'点击房间进入 · 拖动旋转 · 滚动缩放'}</span><span>{scan?`${scan.result?.photos??0} 张照片 · ${scan.result?.objects.filter(o=>o.editable).length??0} 件家具候选`:`${space?.config.rooms.length??0} 个房间 · ${space?.config.decorations?.length??0} 件家具`}</span></div>
    </div>
    {controlNotice&&<p className="space-action-status" role="status">{controlNotice}</p>}
    {error&&<p className="family-inline-error" role="alert">{error}<button onClick={()=>setError('')} aria-label="关闭提示"><X size={16}/></button></p>}
    {!compact&&<div className="space-information"><div><LayoutGrid size={21}/><div><h3>家具可以慢慢调整</h3><p>编辑家具的位置、角度与材质，再在设备页将灯光、窗帘等绑定到对应位置。</p></div></div><div><ImagePlus size={21}/><div><h3>从真实照片开始</h3><p>上传几张家的照片，让 AI 选择家具、整理摆放，再调整成你熟悉的样子。</p></div></div></div>}
    {!compact&&scan&&space&&<button className="family-button" onClick={()=>{const config={...space.config};delete config.photoScanId;void save(config).catch(()=>{})}}>切换到户型模型</button>}
    {editing&&space&&<div className="space-editor-overlay" role="dialog" aria-modal="true" aria-label="编辑家庭空间"><div className="space-editor-top"><button className="family-button" onClick={()=>setEditing(false)} disabled={busy}><ArrowLeft size={18}/>返回空间</button><div><strong>编辑家庭空间</strong><span>调整家具和房间，保存后家人共同查看</span></div><button className="family-button primary" disabled={busy} onClick={()=>void save(draft.current??space.config).catch(()=>{})}>{busy?<LoaderCircle className="spin" size={17}/>:<Save size={17}/>}保存布局</button></div>{error&&<p className="family-inline-error" role="alert">{error}</p>}<DioramaView space={space} editing onChange={c=>{draft.current=c}} onSave={save} onAction={action} onError={setError} onInspect={setInspected}/></div>}
    {inspectedDevice&&<Dialog title={String(inspectedDevice.attributes.friendly_name??'空间设备')} onClose={()=>setInspected(undefined)}><div className="space-device-details"><span className="memory-source-label">{space?.sample?'示例设备':'家庭空间设备'}</span><h3>{({on:'已开启',off:'已关闭',open:'已打开',closed:'已关闭',locked:'已上锁',unavailable:'暂未连接'} as Record<string,string>)[inspectedDevice.state]??inspectedDevice.state}</h3><dl>{Object.entries(inspectedDevice.attributes).filter(([k,v])=>k!=='friendly_name'&&['string','number','boolean'].includes(typeof v)).slice(0,10).map(([k,v])=><div key={k}><dt>{({temperature:'温度',current_temperature:'当前温度',humidity:'湿度',battery_level:'电量',brightness:'亮度',current_position:'开合比例',volume_level:'音量'} as Record<string,string>)[k]??k}</dt><dd>{String(v)}</dd></div>)}</dl><AppLink className="family-button" href="/devices" onClick={()=>setInspected(undefined)}>查看家庭设备</AppLink></div></Dialog>}
    {history&&<Dialog title="布局历史" onClose={()=>{if(!restoring)setHistory(undefined);}} busy={restoring}><div className="space-history-list">{history.length?history.map(h=><article key={h.version}><div><strong>{h.title}</strong><span>{h.rooms} 个房间 · {new Date(h.savedAt).toLocaleString('zh-CN',{timeZone:state.family.timezone})}</span></div><button className="family-button" disabled={restoring} onClick={()=>void restore(h.version)}>恢复此布局</button></article>):<p>保存布局后，之前的版本会留在这里。</p>}</div></Dialog>}
  </section>;
}
