"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {SpaceConfig,SpaceWorkspace} from '@/lib/space/types';

type SpaceElement=HTMLElement&{setConfig:(config:SpaceConfig)=>void;hass:Record<string,unknown>};
let loading:Promise<void>|undefined;
async function loadSpace(){
  // The original side panel asks Home Assistant's hui-card to host its own
  // registered widgets. This small host connects those same widgets to our
  // authenticated family adapter instead of requiring the HA dashboard shell.
  if(!customElements.get('hui-card'))customElements.define('hui-card',class extends HTMLElement{
    private card?:HTMLElement&{setConfig?:(config:Record<string,unknown>)=>void;hass:unknown};
    private value?:Record<string,unknown>;private context:unknown;preview=false;
    set config(value:Record<string,unknown>){this.value=value;if(this.isConnected)this.load()}
    get config(){return this.value??{}}
    setConfig(value:Record<string,unknown>){this.config=value}
    set hass(value:unknown){this.context=value;if(this.card)this.card.hass=value}
    get hass(){return this.context}
    connectedCallback(){this.style.display='block';this.load()}
    load(){const config=this.value;if(!config)return;const tag=String(config.type??'').replace(/^custom:/,'');if(!/^(diorama-card|dio-[a-z-]+)$/.test(tag))return;void customElements.whenDefined(tag).then(()=>{if(!this.isConnected)return;if(!this.card||this.card.localName!==tag){this.card=document.createElement(tag) as typeof this.card;this.replaceChildren(this.card!);}this.card?.setConfig?.(config);if(this.card&&this.context)this.card.hass=this.context;});}
  });
  if(customElements.get('diorama-card'))return;
  loading??=new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.type='module';s.src='/integrations/vendor/space/card.js';s.onload=()=>resolve();s.onerror=()=>{s.remove();loading=undefined;reject(new Error('空间组件未能加载，请重试'));};document.head.appendChild(s);});
  await loading;
  await customElements.whenDefined('diorama-card');
}
export default function DioramaView({space,editing=false,onChange,onSave,onAction,onError,onInspect}:{space:SpaceWorkspace;editing?:boolean;onChange?:(config:SpaceConfig)=>void;onSave?:(config:SpaceConfig)=>Promise<void>;onAction?:(entityId:string,service:string,data:Record<string,unknown>)=>Promise<void>;onError?:(message:string)=>void;onInspect?:(id:string)=>void}){
  const holder=useRef<HTMLDivElement>(null),element=useRef<SpaceElement|undefined>(undefined);
  const latest=useRef({space,onChange,onSave,onAction,onError,onInspect});useLayoutEffect(()=>{latest.current={space,onChange,onSave,onAction,onError,onInspect};},[space,onChange,onSave,onAction,onError,onInspect]);
  const [error,setError]=useState(''),[ready,setReady]=useState(false);
  useEffect(()=>{let active=true;let host:HTMLElement|undefined;
    let editorObserver:MutationObserver|undefined;
    let portalObserver:MutationObserver|undefined;
    void loadSpace().then(()=>{
      if(!active||!holder.current)return;
      const e=document.createElement(editing?'diorama-card-editor':'diorama-card') as SpaceElement;element.current=e;
      e.addEventListener('hass-more-info',event=>{event.stopPropagation();const id=(event as CustomEvent<{entityId?:string}>).detail?.entityId;if(id)latest.current.onInspect?.(id);});
      const createHass=()=>({states:latest.current.space.states,areas:latest.current.space.areas,entities:latest.current.space.entities,themes:{darkMode:true},language:'zh',locale:{language:'zh'},formatEntityState:(s:{state:string})=>({on:'已开启',off:'已关闭',open:'已打开',closed:'已关闭',unavailable:'离线',locked:'已上锁',idle:'待机'}[s.state]??s.state),callService:async(_d:string,service:string,data:Record<string,unknown>={},target:Record<string,unknown>={})=>{const id=data.entity_id??target.entity_id;if(typeof id!=='string')throw new Error('请指定一个设备');try{await latest.current.onAction?.(id,service,data);}catch(issue){const msg=issue instanceof Error?issue.message:'设备操作失败';latest.current.onError?.(msg);throw issue;}},callWS:async(message:Record<string,unknown>)=>{if(message.type==='config/entity_registry/list')return Object.values(latest.current.space.entities);if(message.type==='config/area_registry/list')return Object.values(latest.current.space.areas);if(message.type==='config/device_registry/list')return [];return [];},callApi:async()=>[]});
      if(editing){
        host=document.createElement('hui-dialog-edit-card');
        const dialog=host as HTMLElement&{_params:unknown;_cardConfig:SpaceConfig;_markDirtyStateClean:()=>void};
        dialog._cardConfig=latest.current.space.config;dialog._markDirtyStateClean=()=>{};
        dialog._params={isNew:false,saveCardConfig:async(config:SpaceConfig)=>{await latest.current.onSave?.(config)}};
        host.addEventListener('config-changed',event=>{const config=(event as CustomEvent<{config:SpaceConfig}>).detail.config;dialog._cardConfig=config;latest.current.onChange?.(config);});
        host.appendChild(e);holder.current.replaceChildren(host);
      }else holder.current.replaceChildren(e);
      e.setConfig({...latest.current.space.config,background:{show:false},...(editing?{}:{side_panel:latest.current.space.config.side_panel!==false,aspect_ratio:latest.current.space.config.aspect_ratio??'16:10'})});e.hass=createHass();
      if(editing){
        const stylePortal=()=>{for(const dialog of document.querySelectorAll('dialog[open]')){if(!(dialog instanceof HTMLDialogElement)||dialog.dataset.homeSpaceEditor)return;dialog.dataset.homeSpaceEditor='true';dialog.style.background='#242732';dialog.style.color='#eeedf4';dialog.style.colorScheme='dark';dialog.style.fontFamily='"Microsoft YaHei UI",system-ui,sans-serif';const computed=getComputedStyle(e);for(const name of computed)if(name.startsWith('--'))dialog.style.setProperty(name,computed.getPropertyValue(name));}};
        portalObserver=new MutationObserver(stylePortal);portalObserver.observe(document.body,{childList:true,subtree:false});
        const open=()=>{const button=Array.from(e.shadowRoot?.querySelectorAll('button')??[]).find(b=>/^(打开编辑器|Open editor)$/.test(b.textContent?.trim()??''));if(button){button.click();editorObserver?.disconnect();}};if(e.shadowRoot){editorObserver=new MutationObserver(open);editorObserver.observe(e.shadowRoot,{childList:true,subtree:true});open();}
      }
      setReady(true);
    }).catch(issue=>{if(active)setError(issue instanceof Error?issue.message:'空间加载失败')});
    return()=>{active=false;editorObserver?.disconnect();portalObserver?.disconnect();element.current?.remove();element.current=undefined;host?.remove();};
  },[editing]);
  useEffect(()=>{const e=element.current;if(!e)return;e.hass={...e.hass,states:space.states,areas:space.areas,entities:space.entities};if(!editing)e.setConfig({...space.config,background:{show:false},side_panel:space.config.side_panel!==false,aspect_ratio:space.config.aspect_ratio??'16:10'});},[space,editing]);
  return <div className={'diorama-view'+(editing?' diorama-editing':'')} data-ready={ready}>
    <div ref={holder} className="diorama-mount"/>
    {!ready&&!error&&<div className="space-loading" role="status"><span className="space-loader"/>正在准备家庭空间</div>}
    {error&&<div className="space-loading" role="alert"><p>{error}</p><button onClick={()=>window.location.reload()}>重新读取</button></div>}
  </div>;
}
