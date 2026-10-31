import patterns from './intent-patterns.json' with {type:'json'};
export type HomeObservation = { uid:string; title:string; description:string; start:string; end:string; camera_name:string; category:string; label:string; key_frame:string; evidenceCategory:'synthetic'|'bench'|'reenactment'|'field'; transport:'live'|'replay'; origin:'timeline'|'demo'; };
export type AgentIntent = { kind:'timeline'|'care'|'light_on'|'unsupported'; title:string; detail:string; deviceId?:string; subjectId?:string; };
const literal=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Supported subset of the upstream sentence grammar: optional parts, alternatives, expansions and named slots.
export function sentenceRegex(template:string,slots:Record<string,string[]>,depth=0):string {
 if(depth>12||template.length>1000)throw new Error('语句模板过深');
 let out='',i=0;
 while(i<template.length){const c=template[i++];
  if(c==='['||c==='('){const close=c==='['?']':')';let nesting=1;const start=i;while(i<template.length&&nesting){if(template[i]===c)nesting++;if(template[i]===close)nesting--;i++;}if(nesting)throw new Error('语句模板不完整');out+='(?:'+sentenceRegex(template.slice(start,i-1),slots,depth+1)+')'+(c==='['?'?':'');}
  else if(c==='<'){const j=template.indexOf('>',i);if(j<0)throw new Error('缺少展开规则');const name=template.slice(i,j);const value=(patterns.rules as Record<string,string>)[name];if(!value)throw new Error('不支持的展开规则');out+='(?:'+sentenceRegex(value,slots,depth+1)+')';i=j+1;}
  else if(c==='{'){const j=template.indexOf('}',i);if(j<0)throw new Error('缺少对象');const values=slots[template.slice(i,j)];if(!values?.length)throw new Error('需要明确对象');out+='(?:'+values.map(literal).join('|')+')';i=j+1;}
  else out+=c==='|'?'|':literal(c);
 }
 return out;
}
export function interpretHomeRequest(text:string,devices:{id:string;name:string;room:string;kind:string}[],members:{id:string;name:string;relation:string}[]):AgentIntent {
 const value=text.trim().replace(/[\s，,。！!？?]/g,'').replace(/^(请|麻烦你|帮我)/,'');
 if(!value||value.length>240)return {kind:'unsupported',title:'请描述一件具体的家庭安排',detail:'可以查看家庭动态、联系家人或开启指定灯光。'};
 if(/开锁|解锁|门锁|密码|燃气|摄像头|所有|全部/.test(value))return {kind:'unsupported',title:'请先在设备页核对这项操作',detail:'当前入口只整理单盏灯光与家庭联系安排。'};
 if(/^(看看|看一下|查看|查一下|回顾)(家里|家庭|客厅|今天)(刚才|最近|今天)?(的)?(动态|情况|发生了什么|活动|记录|时间线)$/.test(value))return {kind:'timeline',title:'最近的家庭动态',detail:'按事件时间整理线索，图像观察不能确认具体家人的身份与平安。'};
 const matches=members.filter(m=>[m.name,m.relation==='母亲'?'妈妈':m.relation==='父亲'?'爸爸':''].filter(Boolean).some(n=>new RegExp('^(?:(?:联系|确认|核实)'+literal(n)+'(?:的)?(?:情况|状态|回应)?|'+literal(n)+'(?:回应|报平安))$').test(value)));
 if(matches.length===1)return {kind:'care',subjectId:matches[0].id,title:`确认${matches[0].name}的情况`,detail:'结合家庭线索整理联系计划，家人批准后继续安排。'};
 const candidates=devices.filter(d=>d.kind==='lighting'&&/灯/.test(value)).filter(d=>patterns.sentences.some(p=>new RegExp('^'+sentenceRegex(p,{name:[d.name,`${d.room}灯`,'主灯',d.room],area:[d.room]})+'$').test(value)));
 if(candidates.length===1)return {kind:'light_on',deviceId:candidates[0].id,title:`开启${candidates[0].name}`,detail:'已整理这一次灯光安排，家人确认后发出。'};
 return {kind:'unsupported',title:candidates.length>1?'有多盏灯符合描述，请说清房间':'还需要更明确的安排',detail:'例如“打开客厅灯”“看看家里刚才的动态”或“确认妈妈的情况”。'};
}
export function normalizeTimelineEvent(input:unknown,category:HomeObservation['evidenceCategory'],transport:HomeObservation['transport']='live'):HomeObservation {
 if(!input||typeof input!=='object')throw new Error('时间线事件无效');const e=input as Record<string,unknown>;
 const text=(key:string,max:number,fallback='')=>{const value=e[key]??fallback;if(typeof value!=='string'||value.length>max)throw new Error('时间线字段无效：'+key);return value;};
 const uid=text('uid',100),start=text('start',60),end=text('end',60,start),camera=text('camera_name',120);if(!uid||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(start)||!/^camera\.[a-z0-9_]+$/.test(camera))throw new Error('时间线标识或时间无效');
 return {uid,title:text('title',240),description:text('description',2000),start,end,camera_name:camera,category:text('category',40),label:text('label',40),key_frame:'',evidenceCategory:category,transport,origin:category==='synthetic'?'demo':'timeline'};
}
export function demoHomeTimeline(now=Date.now()):HomeObservation[]{return [
 {uid:'family-room',title:'客厅出现活动',description:'公共区域观察到有人活动，不能据此确认具体家人的身份。',camera_name:'camera.living_room',category:'person',label:'person',key_frame:'',start:new Date(now-55*60000).toISOString(),end:new Date(now-54*60000).toISOString()},
 {uid:'door-visit',title:'门口有短暂停留',description:'门口出现一段停留记录，是否与家庭成员有关仍待确认。',camera_name:'camera.front_door',category:'person',label:'person',key_frame:'',start:new Date(now-35*60000).toISOString(),end:new Date(now-34*60000).toISOString()},
 {uid:'living-quiet',title:'客厅暂未见人',description:'本次示例画面为空，不能推断家人已经外出或发生危险。',camera_name:'camera.living_room',category:'activity',label:'none',key_frame:'/brand/living-room.png',start:new Date(now-5*60000).toISOString(),end:new Date(now-4*60000).toISOString()}
 ].map(e=>({...e,evidenceCategory:'synthetic' as const,transport:'replay' as const,origin:'demo' as const}));}
export const familyTools=[
 {name:'home.timeline',description:'读取本家庭的事件时间线',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'home.light.prepare',description:'准备指定灯光的待批准操作',inputSchema:{type:'object',properties:{deviceId:{type:'string'}},required:['deviceId'],additionalProperties:false},annotations:{readOnlyHint:false}},
 {name:'home.care.prepare',description:'为本家庭成员整理待确认的联系计划',inputSchema:{type:'object',properties:{subjectId:{type:'string'}},required:['subjectId'],additionalProperties:false},annotations:{readOnlyHint:false}}
];
