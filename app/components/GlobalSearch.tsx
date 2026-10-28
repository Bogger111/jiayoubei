"use client";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useProductStore } from "@/lib/product-store";
import Dialog from "./Dialog";
import { navigate } from "./navigation";

export default function GlobalSearch({onClose}:{onClose:()=>void}) {
  const state=useProductStore();
  const [query,setQuery]=useState("");
  const entries=[
    ...state.events.map(item=>({id:item.id,title:item.title,detail:item.description,kind:"事件",path:`/events/${item.id}`})),
    ...state.tasks.map(item=>({id:item.id,title:item.title,detail:item.description,kind:"任务",path:`/tasks/${item.id}`})),
    ...state.members.map(item=>({id:item.id,title:item.name,detail:`${item.role} ${item.relation}`,kind:"家人",path:`/members/${item.id}`})),
    ...state.devices.map(item=>({id:item.id,title:item.name,detail:`${item.room} ${item.reading}`,kind:"设备",path:`/devices/${item.id}`})),
  ];
  const term=query.trim().toLocaleLowerCase();
  const matches=entries.filter(item=>!term||`${item.title} ${item.detail} ${item.id}`.toLocaleLowerCase().includes(term)).slice(0,10);
  const select=(path:string)=>{onClose();navigate(path);};
  return <Dialog title="搜索家庭空间" onClose={onClose}>
    <form onSubmit={event=>{event.preventDefault();if(matches[0])select(matches[0].path)}}>
      <label className="global-search-input"><Search size={20}/><input data-dialog-autofocus autoComplete="off" aria-label="搜索事件、任务、家人或设备" placeholder="找一件事、一位家人、一台设备…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    </form>
    <p className="search-caption">{term?`匹配的家庭记录（最多显示 10 项）`:"从当前家庭的记录开始"}</p>
    <div className="search-results">{matches.map(item=><button key={item.path} onClick={()=>select(item.path)}><span className="search-kind">{item.kind}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16}/></button>)}</div>
    {!matches.length&&<p className="search-empty">没有找到相关记录。试试家人的称呼或更短的关键词。</p>}
  </Dialog>;
}
