"use client";
import {ArrowRight,CheckCircle2,Clock3,MessageCircle,Plus,Users} from 'lucide-react';
import {useProductStore} from '@/lib/product-store';
import {useState,type FormEvent} from 'react';
import {AppLink,navigate} from './navigation';
import {useCurrentTime} from './useCurrentTime';
import HomeSpace from './HomeSpace';

export default function FamilyDashboard(){
  const state=useProductStore(),now=useCurrentTime(),[text,setText]=useState('');
  const tasks=state.tasks.filter(t=>!['completed','cancelled'].includes(t.status));
  const date=new Date(now).toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long',timeZone:state.family.timezone});
  const submit=(e:FormEvent)=>{e.preventDefault();if(!text.trim())return;const q=text.trim();navigate('/?q='+encodeURIComponent(q));};
  return <div className="family-dashboard">
    <header className="family-dashboard-heading"><div><p className="family-eyebrow">{date}</p><h1>让家，懂你的安排</h1><p>自由布置空间、连接设备，让家有备统一安排。</p></div><AppLink className="family-button" href="/members"><Users size={17}/>{state.members.length} 位家人</AppLink></header>
    <HomeSpace compact/>
    <div className="family-dashboard-lower">
      <section className="family-surface family-assistant-entry"><div className="family-section-title"><span className="family-icon-soft"><MessageCircle size={22}/></span><h2>和家有备聊聊</h2></div><p>想知道家里的情况，或为家人做个安排？</p><form onSubmit={submit}><input value={text} onChange={e=>setText(e.target.value)} placeholder="家里刚才发生了什么？" aria-label="向家有备提问"/><button type="submit" disabled={!text.trim()} aria-label="发送给家有备"><ArrowRight size={19}/></button></form><div className="family-question-chips">{['打开客厅主灯','看看今天的家庭动态'].map(q=><button key={q} onClick={()=>{navigate('/?q='+encodeURIComponent(q))}}>{q}</button>)}</div></section>
      <section className="family-surface family-today-actions"><div className="family-section-title"><h2>接下来的安排</h2><AppLink href="/tasks">全部行动 <ArrowRight size={15}/></AppLink></div>{tasks.length?tasks.slice(0,3).map(task=><AppLink className="family-action-row" key={task.id} href={'/tasks/'+task.id}><span className="family-icon-soft"><Clock3 size={20}/></span><div><strong>{task.title}</strong><span>{task.status==='in_progress'?'正在跟进':'等待家人处理'}</span></div><ArrowRight size={16}/></AppLink>):<div className="family-action-empty"><CheckCircle2 size={25}/><span>眼下没有待处理的安排</span><AppLink href="/tasks"><Plus size={16}/>为家人做个安排</AppLink></div>}{state.carePlan&&<AppLink className="family-care-shortcut" href="/care"><span>{state.carePlan.title}</span><ArrowRight size={16}/></AppLink>}</section>
    </div>
    <div className="family-dashboard-links"><AppLink href="/memory">回顾家庭记忆 <ArrowRight size={16}/></AppLink><AppLink href="/devices">查看设备状态 <ArrowRight size={16}/></AppLink></div>
  </div>;
}
