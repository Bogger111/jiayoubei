"use client";
import {useEffect,useRef,useState} from 'react';
import {Eye} from 'lucide-react';
import type {HomeObservation} from '@/lib/multimodal/core';
type TimelineElement=HTMLElement&{setConfig:(x:Record<string,unknown>)=>void;hass:unknown;showPopup:(x:{eventId:string})=>void;formatDateLabel:(d:Date)=>string;formatTime:(d:Date|string)=>string;resolveKeyFrame:(_h:unknown,key:string)=>Promise<string>;_lastFetch:number;_lastEventHash:string|null;};
const escapeText=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let runtime:Promise<unknown>|undefined;
async function loadCard(){
 if(typeof window==='undefined')return;
 if(!customElements.get('ha-icon'))customElements.define('ha-icon',class extends HTMLElement{connectedCallback(){this.setAttribute('aria-hidden','true');this.style.cssText+='display:inline-grid;place-items:center;width:22px;height:22px';const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','20');svg.setAttribute('height','20');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');const path=document.createElementNS(ns,'path');path.setAttribute('d',this.getAttribute('icon')?.includes('walk')?'M20 21v-2a6 6 0 0 0-12 0v2M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8':this.getAttribute('icon')?.includes('package')?'M3 7l9-5 9 5v10l-9 5-9-5V7zm0 0l9 5 9-5M12 12v10M7 4l10 6':this.getAttribute('icon')?.includes('car')?'M4 11l2-6h12l2 6M3 11h18v7H3v-7zm3 7v3m12-3v3M6 14h1m10 0h1':this.getAttribute('icon')?.includes('dog')||this.getAttribute('icon')?.includes('cat')?'M8 13c-1 2-3 3-2 6 1 3 4 0 6 0s5 3 6 0c1-3-1-4-2-6-2-3-6-3-8 0M5 6v3m5-6v4m4-4v4m5-1v3':'M2 12h4l3-8 6 16 3-8h4');svg.appendChild(path);this.replaceChildren(svg)}});
 if(customElements.get('llmvision-card'))return;
 runtime??=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.type='module';script.src='/integrations/vendor/timeline/llmvision-card.js';script.onload=()=>resolve();script.onerror=()=>{script.remove();runtime=undefined;reject(new Error('时间线模块加载失败'))};document.head.appendChild(script)});await runtime;
}
export default function HomeTimelineCard({events,onSelect,variant='timeline',timezone}:{events:(HomeObservation&{roomName?:string})[];onSelect:(e:HomeObservation)=>void;variant?:'timeline'|'preview';timezone?:string}){
 const root=useRef<HTMLDivElement>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;let card:TimelineElement|undefined;
 void loadCard().then(()=>{if(!active||!root.current)return;card=document.createElement(variant==='preview'?'llmvision-preview-card':'llmvision-card') as TimelineElement;
 card.setConfig({header:'',number_of_days:30,number_of_events:100,language:'en',time_format:'24h',filter_false_positives:false});
 card.formatDateLabel=d=>{const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});const day=fmt.format(d);return day===fmt.format(new Date())?'今天':day===fmt.format(new Date(Date.now()-86400000))?'昨天':d.toLocaleDateString('zh-CN',{timeZone:timezone,month:'long',day:'numeric'});};
 card.formatTime=d=>new Date(d).toLocaleTimeString('zh-CN',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hour12:false});
 card.resolveKeyFrame=async(_h,key)=>key==='/brand/living-room.png'||/^\/api\/home-media\/[a-zA-Z0-9_-]+$/.test(key)||/^\/integrations\/demo-media\/[a-zA-Z0-9_.-]+$/.test(key)?key:'';
 // The upstream popup can upload feedback. Our adapter opens only the local, read-only detail dialog.
 card.showPopup=({eventId})=>{const event=events.find(e=>e.uid===eventId);if(event)onSelect(event)};
 root.current.replaceChildren(card);
 card.hass={
  states:Object.fromEntries(events.map(e=>[e.camera_name,{attributes:{friendly_name:e.roomName??(e.camera_name.includes('kitchen')?'厨房':e.camera_name.includes('front')?'门廊':e.camera_name.includes('garage')?'车库':'客厅')}}])),
  callApi:async(method:string,path:string)=>{
   if(method!=='GET'||!path.startsWith('llmvision/timeline/events'))throw new Error('时间线仅允许读取');
   return {events:events.map(e=>{
    const category=['person','animal','vehicle','delivery'].includes(e.category)?e.category:'entity';
    const label=category==='person'?'person':category==='delivery'?'delivery':category==='vehicle'?'car':category==='animal'&&['dog','cat'].includes(e.label)?e.label:'sensor';
    return {...e,title:escapeText(e.title),description:escapeText(e.description),category,label};
   })};
  }
 };
 }).catch(()=>{if(active)setError('时间线暂时未加载，请刷新页面。')});return()=>{active=false;card?.remove()};
 },[events,onSelect,variant,timezone]);
 const noImage=variant==='preview'&&!events[0]?.key_frame;
 return <div className={'home-native-timeline'+(variant==='preview'?' home-native-preview':'')} data-no-image={noImage}><div ref={root}/>{noImage&&<span className="home-preview-empty"><Eye size={30}/>暂无关联画面<small>点击回顾事件线索</small></span>}{error&&<p role="alert">{error}</p>}</div>;
}
