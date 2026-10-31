/* Real photo-to-layout request through the running app. Reuses a saved request id. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const output='test-results/memory-room-upgrade';await mkdir(output,{recursive:true});
const origin='http://localhost:3000';
const api=async(path,body)=>{const r=await fetch(origin+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const d=await r.json();assert.ok(r.ok,`${path}: ${r.status} ${JSON.stringify(d)}`);return d;};
let request;try{request=JSON.parse(await readFile(output+'/tidy-room-request.json','utf8'));}catch{}
if(!request){
 const before=(await api('/api/home-space')).space;
 const source=JSON.parse(await readFile('public/integrations/tidy-room-sample/source.json','utf8')),photoIds=[];
 for(const file of source.files){const bytes=await readFile('public/integrations/tidy-room-sample/'+file);const form=new FormData();form.append('file',new File([bytes],file,{type:'image/jpeg'}));const r=await fetch(origin+'/api/home-media',{method:'POST',body:form});assert.equal(r.status,201);photoIds.push((await r.json()).media.id);}
 request={id:'p_'+crypto.randomUUID().replaceAll('-',''),photoIds,source:'public_example',notes:'这六张照片是同一间整洁起居室的不同视角，只搭建一个房间，不要重复家具。保留温暖木地板、浅色墙面、灰色沙发、蓝绿色休闲椅、深色地毯、电视和电视柜、茶几、白色书柜与植物。保留大件家具的相对关系，地面布局舒展。不能对应的细小物件可以省略。',before:{version:before.version,rooms:before.config.rooms.length,furniture:before.config.decorations.length},startedAt:new Date().toISOString()};
 await writeFile(output+'/tidy-room-request.json',JSON.stringify(request,null,2));
}
let d;try{d=(await api('/api/scene-plans?id='+request.id)).draft;}catch{d=(await api('/api/scene-plans',{...request,operation:'create'})).draft;}
for(let i=0;!['completed','failed'].includes(d.status)&&i<80;i++){await new Promise(r=>setTimeout(r,2500));d=(await api('/api/scene-plans?id='+request.id)).draft;if(i%6===0)console.log('Generation:',d.status,d.stage);}
await writeFile(output+'/tidy-room-live-result.json',JSON.stringify({at:new Date().toISOString(),request,draft:d,method:'Fresh real vision-model inference through the application; no fixed scene fixture; new draft only'},null,2));
assert.equal(d.status,'completed',d.error??d.stage);
const home=(await api('/api/home-space')).space;assert.equal(home.version,request.before.version);assert.equal(home.config.rooms.length,request.before.rooms);
console.log(JSON.stringify({draftId:d.id,photos:d.photoIds.length,rooms:d.config.rooms.length,furniture:d.config.decorations.length,seconds:d.seconds,homeVersion:home.version}));
