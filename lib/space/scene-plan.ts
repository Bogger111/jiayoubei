import catalog from './furniture-catalog.json' with {type:'json'};
import type {SpaceConfig,SpaceWorkspace} from './types';

export type SceneRoom={id:string;name:string;x:number;y:number;width:number;depth:number;floorMaterial:string;floorColor?:string};
export type SceneFurniture={id:string;kind:string;name:string;roomId:string;x:number;y:number;rotation:number;params:Record<string,number>;colors:Record<string,string>;variant?:string;on?:string};
export type ScenePlan={title:string;summary:string;rooms:SceneRoom[];furniture:SceneFurniture[];notes:string[]};
export type SceneDraft={id:string;version:number;status:'queued'|'running'|'completed'|'failed';stage:string;createdAt:number;updatedAt:number;photoIds:string[];model:string;source:'user_photos'|'public_example';plan?:ScenePlan;config?:SpaceConfig;error?:string;usage?:{prompt_tokens?:number;completion_tokens?:number;total_tokens?:number};seconds?:number};
export type SceneProviderStatus={available:boolean;configured:boolean;model:string;provider:'deepseek';verifiedAt?:number};
const kinds=new Map(catalog.map(k=>[k.id,k]));
const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:undefined;
const number=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
const name=(v:unknown,fallback:string,max=80)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):fallback;
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const identifier=(v:unknown,fallback:string)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,60}$/.test(v)?v:fallback;

export function normalizeScenePlan(value:unknown):ScenePlan{
  const input=object(value);if(!Array.isArray(input.rooms)||!input.rooms.length||input.rooms.length>12)throw new Error('请生成 1 至 12 个房间的布局');
  const rooms:SceneRoom[]=[],ids=new Set<string>();
  for(const [i,raw]of input.rooms.entries()){
    const r=object(raw),id=identifier(r.id,'room_'+(i+1));if(ids.has(id))throw new Error('房间标识重复');ids.add(id);
    const material=r.floorMaterial==='tile'?'tiles':r.floorMaterial;
    rooms.push({id,name:name(r.name,'房间 '+(i+1)),x:number(r.x,i*5,-50,50),y:number(r.y,0,-50,50),width:number(r.width,4,1.5,15),depth:number(r.depth,3.5,1.5,15),floorMaterial:['wood','tiles','terracotta','concrete','carpet'].includes(String(material))?String(material):'wood',...(color(r.floorColor)?{floorColor:color(r.floorColor)}:{})});
  }
  if(!Array.isArray(input.furniture)||input.furniture.length>240)throw new Error('家具清单格式不正确');
  const furniture:SceneFurniture[]=[],objectIds=new Set<string>();
  for(const [i,raw]of input.furniture.entries()){
    const item=object(raw),kind=kinds.get(String(item.kind));if(!kind||!ids.has(String(item.roomId)))continue;
    const room=rooms.find(r=>r.id===item.roomId)!;let id=identifier(item.id,'piece_'+(i+1));if(objectIds.has(id))id='piece_'+(i+1);if(objectIds.has(id))throw new Error('家具标识重复');objectIds.add(id);
    const params:Record<string,number>={},given=object(item.params);for(const p of kind.params)if(typeof given[p.id]==='number'&&Number.isFinite(given[p.id]))params[p.id]=number(given[p.id],p.default,p.min,p.max);
    const colors:Record<string,string>={};for(const [slot,v]of Object.entries(object(item.colors)))if(slot in kind.colors&&color(v))colors[slot]=v as string;
    const variant=kind.variants.find(v=>v.id===item.variant)?.id;
    furniture.push({id,kind:kind.id,name:name(item.name,kind.name,60),roomId:room.id,x:number(item.x,room.width/2,0,room.width),y:number(item.y,room.depth/2,0,room.depth),rotation:number(item.rotation,0,-36000,36000)%360,params,colors,...(variant?{variant}:{}),...(typeof item.on==='string'?{on:item.on}:{})});
  }
  if(input.furniture.length&&furniture.length<input.furniture.length*.5)throw new Error('家具库匹配不足，请重新整理布局');
  // A supported item must be in the same room and cannot form a support cycle.
  for(const item of furniture){let current=item;const seen=new Set([item.id]);while(current.on){const support=furniture.find(p=>p.id===current.on&&p.roomId===item.roomId);if(!support||seen.has(support.id)){delete item.on;break;}seen.add(support.id);current=support;}}
  return {title:name(input.title,'照片里的家'),summary:name(input.summary,'根据照片整理的房间与家具布局，可继续调整。',500),rooms,furniture,notes:Array.isArray(input.notes)?input.notes.filter((v):v is string=>typeof v==='string').slice(0,6).map(v=>v.slice(0,240)):[]};
}

export function scenePlanConfig(plan:ScenePlan):SpaceConfig{
  return {type:'custom:diorama-card',side_panel:false,first_click:'room',background:{show:false},aspect_ratio:'16:10',sun_direction:145,
    rooms:plan.rooms.map(r=>({id:r.id,name:r.name,area_id:r.id,points:[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.depth],[r.x,r.y+r.depth]],floor:{material:r.floorMaterial,...(r.floorColor?{color:r.floorColor}:{})}})),
    decorations:plan.furniture.map(f=>{const r=plan.rooms.find(r=>r.id===f.roomId)!;return {id:f.id,kind:f.kind,name:f.name,room:f.roomId,position:[r.x+f.x,r.y+f.y],rotation:f.rotation,params:f.params,colors:f.colors,...(f.variant?{variant:f.variant}:{}),...(f.on?{on:f.on}:{})}}),devices:[]};
}

export function sceneWorkspace(config:SpaceConfig,version=0):SpaceWorkspace{
  const now=new Date().toISOString();
  // The upstream default camera frames its demo flat. Generated rooms have their own bounds.
  const points=config.rooms.flatMap(r=>r.points);
  if(!config.camera&&points.length){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=-(Math.min(...ys)+Math.max(...ys))/2,span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),2.5);config={...config,camera:{position:[x+span*.72,span*1.1,z+span*1.03],target:[x,.55,z]}};}
  return {config,version,updatedAt:null,sample:false,states:{'sun.sun':{entity_id:'sun.sun',state:'above_horizon',attributes:{elevation:40,azimuth:145},last_changed:now,last_updated:now}},entities:{},areas:Object.fromEntries(config.rooms.map(r=>[r.id,{area_id:r.id,name:r.name??r.id}]))};
}
