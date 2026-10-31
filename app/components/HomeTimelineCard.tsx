"use client";
import {useEffect,useRef,useState} from 'react';
import type {HomeObservation} from '@/lib/multimodal/core';
type TimelineElement=HTMLElement&{setConfig:(x:Record<string,unknown>)=>void;hass:unknown;showPopup:(x:{eventId:string})=>void;formatDateLabel:(d:Date)=>string;resolveKeyFrame:(_h:unknown,key:string)=>Promise<string>;_lastFetch:number;_lastEventHash:string|null;};
const escapeText=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let runtime:Promise<unknown>|undefined;
async function loadCard(){
 if(typeof window==='undefined')return;
 if(!customElements.get('ha-icon'))customElements.define('ha-icon',class extends HTMLElement{connectedCallback(){this.setAttribute('aria-hidden','true');this.style.cssText+='display:inline-grid;place-items:center;width:22px;height:22px';const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','20');svg.setAttribute('height','20');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');const path=document.createElementNS(ns,'path');path.setAttribute('d',this.getAttribute('icon')?.includes('walk')?'M20 21v-2a6 6 0 0 0-12 0v2M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8':'M2 12h4l3-8 6 16 3-8h4');svg.appendChild(path);this.replaceChildren(svg)}});
 if(customElements.get('llmvision-card'))return;
 runtime??=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.type='module';script.src='/integrations/vendor/timeline/llmvision-card.js';script.onload=()=>resolve();script.onerror=()=>{script.remove();runtime=undefined;reject(new Error('时间线模块加载失败'))};document.head.appendChild(script)});await runtime;
}
export default function HomeTimelineCard({events,onSelect}:{events:HomeObservation[];onSelect:(e:HomeObservation)=>void}){
 const root=useRef<HTMLDivElement>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;let card:TimelineElement|undefined;
 void loadCard().then(()=>{if(!active||!root.current)return;card=document.createElement('llmvision-card') as TimelineElement;
 card.setConfig({header:'',number_of_days:30,number_of_events:100,language:'en',time_format:'24h',filter_false_positives:false});
 card.formatDateLabel=d=>d.toLocaleDateString('zh-CN',{month:'long',day:'numeric'});
 card.resolveKeyFrame=async(_h,key)=>key==='/brand/living-room.png'?key:'';
 // The upstream popup can upload feedback. Our adapter opens only the local, read-only detail dialog.
 card.showPopup=({eventId})=>{const event=events.find(e=>e.uid===eventId);if(event)onSelect(event)};
 root.current.replaceChildren(card);
 card.hass={states:Object.fromEntries(events.map(e=>[e.camera_name,{attributes:{friendly_name:e.camera_name.includes('front')?'门口':'客厅'}}])),callApi:async(method:string,path:string)=>{if(method!=='GET'||!path.startsWith('llmvision/timeline/events'))throw new Error('时间线仅允许读取');return {events:events.map(e=>({...e,title:escapeText(e.title),description:escapeText(e.description),category:e.category==='person'?'person':e.category==='animal'?'animal':'entity',label:e.category==='person'?'person':e.category==='animal'&&['dog','cat'].includes(e.label)?e.label:'sensor'}))}}};
 }).catch(()=>{if(active)setError('时间线暂时未加载，请刷新页面。')});return()=>{active=false;card?.remove()};
 },[events,onSelect]);
 return <div className="home-native-timeline"><div ref={root}/>{error&&<p role="alert">{error}</p>}</div>;
}
