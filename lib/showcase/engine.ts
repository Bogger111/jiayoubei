import {approveCarePlan,claimCareStep,createEvidenceCarePlan,legacyCareEvidence,demoCareSignals,recordCareStep,resolveCarePlan,type CarePlan} from '../care-agent.ts';
import {defaultCareAgreement} from '../care-evidence.ts';
export type ShowcaseRole='owner'|'contact';
export type ShowcaseStage='normal'|'observing'|'proposed'|'approved'|'claimed'|'following'|'resolved';
export type ShowcaseState={schema:1;id:string;revision:number;scenario:'care'|'door';stage:ShowcaseStage;createdAt:number;plan?:CarePlan;pose?:{angle:number;drop:number;frames:number};audit:{id:number;at:number;actor:string;title:string;detail:string}[]};
export type ShowcaseAction={type:'observe'}|{type:'detected';angle:number;drop:number;frames:number}|{type:'approve'}|{type:'claim'}|{type:'no_answer'}|{type:'resolve';confirmed:boolean}|{type:'door_request'}|{type:'deny_door'};
export const roleNames={owner:'子女 · 小林',contact:'联系人 · 小陈'};
export const stageLabels:Record<ShowcaseStage,string>={normal:'家庭状态正常',observing:'正在回顾姿态',proposed:'等待家人确认',approved:'联系任务已创建',claimed:'联系人已接手',following:'继续跟进中',resolved:'本次处理已完成'};
export const workflowSteps=[{id:'perception',title:'感知',subtitle:'多源事件'},{id:'state',title:'家庭状态',subtitle:'时间与上下文'},{id:'reasoning',title:'形成安排',subtitle:'依据与行动'},{id:'authorization',title:'家人确认',subtitle:'本次批准'},{id:'action',title:'协同执行',subtitle:'设备与联系人'},{id:'feedback',title:'结果反馈',subtitle:'核实与审计'}];
export function createShowcase(now=Date.now(),scenario:ShowcaseState['scenario']='care'):ShowcaseState{return {schema:1,id:'DEMO-'+now,revision:1,scenario,stage:'normal',createdAt:now,audit:[{id:1,at:now,actor:'家庭空间',title:'演示场景已准备',detail:'本地隔离演示，不向外部设备或联系人发送请求'}]}}
export function advanceShowcase(state:ShowcaseState,action:ShowcaseAction,role:ShowcaseRole,now=Date.now()):ShowcaseState{
 if(now<state.createdAt)throw new Error('请检查演示时间');
 let next:ShowcaseState={...state,revision:state.revision+1};let title='',detail='',actor=roleNames[role];
 const checkAllowed=(condition:boolean,message:string)=>{if(!condition)throw new Error(message)};
 if(action.type==='observe'){checkAllowed(state.scenario==='care'&&state.stage==='normal','请先开始新的照护演示');next.stage='observing';title='开始端侧姿态回放';detail='读取本次本地模型运行的34帧关键点，重新运行时序判定';actor='感知模块'}
 else if(action.type==='detected'){
  checkAllowed(state.stage==='observing'&&Number.isFinite(action.angle)&&Number.isFinite(action.drop)&&action.frames>0,'姿态线索暂不完整');
  const signals={...demoCareSignals('unanswered',now),imageAuthorized:true,image:'person' as const};
  const plan=createEvidenceCarePlan(legacyCareEvidence(signals,now,state.id),defaultCareAgreement,now,state.id);
  plan.evidence=[{label:'姿态变化',value:'连续低姿态，等待人工确认'},...plan.evidence];
  next={...next,stage:'proposed',plan,pose:{angle:action.angle,drop:action.drop,frames:action.frames}};title='生成待确认的联系计划';detail='姿态线索与未回应记录汇合，整理提醒、家庭联系和条件跟进';actor='家庭 Agent';
 }else if(action.type==='approve'){
  checkAllowed(role==='owner','请切换至子女角色批准本次安排');checkAllowed(state.stage==='proposed'&&Boolean(state.plan),'本次安排已经处理');
  let p=approveCarePlan(state.plan!,actor,now);p=recordCareStep(p,'device',true,'演示适配器：提醒灯请求已模拟记录',now);p=recordCareStep(p,'family',true,'演示家庭：联系任务已创建，等待接手',now);
  next={...next,stage:'approved',plan:p};title='家人批准，任务已创建';detail='提醒灯模拟已记录；联系任务等待指定联系人接手';
 }else if(action.type==='claim'){
  checkAllowed(role==='contact','请切换至联系人角色接手');checkAllowed(state.stage==='approved'&&Boolean(state.plan),'当前没有可接手的联系任务');
  next={...next,stage:'claimed',plan:claimCareStep(state.plan!,actor,now)};title='联系人明确接手';detail='负责人、接手时间和当前事件一起保存';
 }else if(action.type==='no_answer'){
  checkAllowed(role==='contact'&&['claimed','following'].includes(state.stage)&&Boolean(state.plan),'请由已接手的联系人记录结果');
  next={...next,stage:'following',plan:resolveCarePlan(state.plan!,{type:'no_answer',remark:'演示结果：暂未联系到，保留任务与等待期限',actor,caseId:state.plan!.id,method:'phone',confirmed:false},now)};
  title='未联系到，继续跟进';detail='保留负责人和任务，不把未回应当作平安';
 }else if(action.type==='resolve'){
  checkAllowed(role==='contact'&&['claimed','following'].includes(state.stage)&&Boolean(state.plan),'请由已接手的联系人核实本次情况');checkAllowed(action.confirmed===true,'请明确确认已经核实本次情况');
  next={...next,stage:'resolved',plan:resolveCarePlan(state.plan!,{type:'safe_confirmed',remark:'演示结果：已与家人电话核实，本次情况平安',actor,caseId:state.plan!.id,method:'phone',confirmed:true},now)};
  title='明确核实，本次处理结束';detail='结果与确认人已保存；停止尚未执行的联系';
 }else if(action.type==='door_request'){
  checkAllowed(state.scenario==='door'&&state.stage==='normal','请先开始门口到访演示');next.stage='proposed';title='门口收到开门请求';detail='身份未核验；门锁请求进入屋主确认，不自动执行';actor='授权策略';
 }else if(action.type==='deny_door'){
  checkAllowed(role==='owner'&&state.scenario==='door'&&state.stage==='proposed','请由屋主核验这次请求');next.stage='resolved';title='屋主确认保持门锁关闭';detail='没有发送开锁指令；本次决定已记录';
 }
 next.audit=[...state.audit,{id:state.audit.length+1,at:now,actor,title,detail}];return next;
}
export function workflowProgress(state:ShowcaseState){return state.stage==='normal'?0:state.stage==='observing'?1:state.stage==='proposed'?3:state.stage==='approved'||state.stage==='claimed'?4:state.stage==='resolved'?6:5}
export function restoreShowcase(raw:string|null):ShowcaseState|undefined{
 try{if(!raw||raw.length>100000)return;const s=JSON.parse(raw);if(s.schema!==1||typeof s.id!=='string'||!Number.isFinite(s.createdAt)||!Number.isSafeInteger(s.revision)||!['care','door'].includes(s.scenario)||!Object.hasOwn(stageLabels,s.stage)||!Array.isArray(s.audit)||s.audit.length>150||s.audit.some((a:Record<string,unknown>)=>typeof a.title!=='string'||typeof a.detail!=='string'||!Number.isFinite(a.at)))return; if(s.scenario==='care'&&!['normal','observing'].includes(s.stage)&&(!s.plan||s.plan.id!==s.id||!Array.isArray(s.plan.steps)))return;return s as ShowcaseState}catch{return}
}
