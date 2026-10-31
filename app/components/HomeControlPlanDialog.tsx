"use client";
import {useState} from 'react';
import {ArrowRight,Check,LoaderCircle,Workflow} from 'lucide-react';
import {actionDescription,type HomeControlPlan} from '@/lib/home-control';
import {homeControlRequest,announceDeviceChange} from '@/src/api/homeControlApi';
import Dialog from './Dialog';
import {useCurrentTime} from './useCurrentTime';
export const planStatusLabel:Record<HomeControlPlan['status'],string>={pending:'等待确认',running:'执行中',completed:'已完成',accepted:'已发送，等待设备更新',failed:'需要检查',unknown:'等待核对',cancelled:'已取消',expired:'已过期'};
export default function HomeControlPlanDialog({plan:initial,onClose,onDone}:{plan:HomeControlPlan;onClose:()=>void;onDone?:(p:HomeControlPlan)=>void}){
  const [plan,setPlan]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dispatch=async(operation:'approve'|'cancel')=>{if(busy)return;setBusy(true);setError('');try{const d=await homeControlRequest<{plan:HomeControlPlan}>({operation,id:plan.id,version:plan.version,confirmed:true});setPlan(d.plan);announceDeviceChange();onDone?.(d.plan);}catch(e){setError(e instanceof Error?e.message:'暂时无法执行，请刷新后核对');}finally{setBusy(false);}};
  const now=useCurrentTime();
  const pending=plan.status==='pending'&&plan.expiresAt>now;
  return <Dialog title={plan.title} onClose={onClose} busy={busy}><div className="home-plan-review"><div className="home-plan-review-head"><span className="family-icon-soft"><Workflow size={24}/></span><div><strong>{plan.status==='pending'&&!pending?'已过期':planStatusLabel[plan.status]}</strong><p>{plan.steps.length} 台设备 · {plan.source==='agent'?'Agent 整理':plan.source==='space'?'来自家庭空间':'来自设备控制'}</p></div></div><div className="home-plan-steps">{plan.steps.map((step,i)=>{const receipt=plan.receipts.find(r=>r.deviceId===step.deviceId);return <article key={step.deviceId}><span>{i+1}</span><div><strong>{actionDescription(step,step.deviceName)}</strong><p>{receipt?.detail??(step.driver==='sample'?'样例设备':'家庭设备网关')}</p></div>{receipt?<span className={'home-receipt '+receipt.status}>{receipt.status==='simulated'||receipt.status==='verified'?<Check size={17}/>:receipt.status==='skipped'?'暂缓':'已记录'}</span>:<ArrowRight size={16}/>}</article>;})}</div>{pending&&<p className="home-plan-hint">确认后按顺序执行，结果会同步到家庭空间。</p>}{error&&<p className="family-inline-error" role="alert">{error}</p>}<div className="home-plan-buttons">{pending?<><button className="family-button" disabled={busy} onClick={()=>void dispatch('cancel')}>取消计划</button><button className="family-button primary" disabled={busy} onClick={()=>void dispatch('approve')}>{busy?<LoaderCircle size={17} className="spin"/>:<Check size={17}/>}确认并执行</button></>:<button className="family-button primary" onClick={onClose}>完成</button>}</div></div></Dialog>;
}
