/** Fixed tool-call responses for contract checks, never evidence of real AI reasoning. */
import {createServer} from 'node:http';
import {createSceneFixtureEngine} from './scene-fixture-engine.mjs';
export async function createAssistantFixtureEngine(){
 const scene=await createSceneFixtureEngine(),calls=[];
 const server=createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;
  if(req.url!=='/v1/assistant-turn'){const r=await fetch(scene.url+req.url,{method:req.method,headers:req.headers,body:raw||undefined});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());return;}
  if(req.headers.authorization!=='Bearer scene-fixture-token'){res.writeHead(401).end('{}');return;}
  const payload=JSON.parse(raw),messages=payload.messages;calls.push({path:req.url,familyId:payload.familyId});
  const query=messages.filter(m=>m.role==='user').at(-1).content.split('\n本轮已上传照片ID：')[0];
  if(query.includes('模型不可用')){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({detail:'助手服务暂时不可用'}));return;}
  const used=messages.flatMap(m=>m.tool_calls??[]),names=used.map(c=>c.function.name);
  const result=name=>{const call=used.find(c=>c.function.name===name);const tool=messages.find(m=>m.role==='tool'&&m.tool_call_id===call?.id);return tool?JSON.parse(tool.content):undefined;};
  const invoke=(name,args)=>({role:'assistant',content:'',tool_calls:[{id:'call_'+crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]});
  const reply=content=>({role:'assistant',content});let message;
  if(query.includes('保存约定并安排阅读')){
   if(!names.includes('devices_list'))message=invoke('devices_list',{});
   else if(!names.includes('memory_save'))message=invoke('memory_save',{title:'爸爸阅读约定',content:'爸爸喜欢晚上八点在客厅阅读。'});
   else if(!names.includes('devices_plan'))message=invoke('devices_plan',{title:'晚间阅读安排',steps:[{deviceId:result('devices_list').devices.find(d=>d.name==='客厅主灯').id,capability:'set_brightness',value:60},{deviceId:result('devices_list').devices.find(d=>d.id.startsWith('cover.')).id,capability:'set_cover_position',value:50}]});
   else message=reply('阅读约定已经保存。设备调控计划已准备，请在下方确认后执行。');
  }else if(query.includes('搭建'))message=names.includes('space_build')?reply('照片已经提交，生成进度会在对话中更新。'):invoke('space_build',{notes:'按照片保留主要家具与颜色。'});
  else if(query.includes('调整沙发')){
   if(!names.includes('space_read'))message=invoke('space_read',{});else if(!names.includes('space_update')){const space=result('space_read'),sofa=space.furniture.find(f=>f.kind==='sofa');message=invoke('space_update',{version:space.version,changes:[{id:sofa.id,position:[sofa.position[0]+.1,sofa.position[1]],rotation:30}]});}else message=reply('沙发的位置与角度已保存。');
  }else if(query.includes('越权'))message=used.length?reply('这项请求没有可用工具，未执行。'):invoke('execute_shell',{command:'not permitted'});
  else if(query.includes('制造参数错误'))message=used.length?reply('参数不完整，未保存记忆。'):invoke('memory_save',{title:'should not save',content:'wrong',unsupported:true});
  else if(query.includes('家庭任务')){
   if(!names.includes('family_context'))message=invoke('family_context',{});else if(!names.includes('family_task'))message=invoke('family_task',{title:'整理家庭药箱',description:'核对存量与有效期。',assignee:result('family_context').members[0].id});else message=reply('已创建家庭任务，等待家人认领。');
  }else if(query.includes('记得'))message=names.includes('memory_search')?reply(result('memory_search').answer):invoke('memory_search',{query:'爸爸阅读约定'});
  else message=reply('我可以结合家庭信息，帮助你整理接下来的安排。');
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({message,usage:{total_tokens:50}}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${server.address().port}`,calls,async close(){await new Promise(r=>server.close(r));await scene.close();}};
}
