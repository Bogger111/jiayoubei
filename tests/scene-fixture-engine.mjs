import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';
export async function createSceneFixtureEngine(){
 const plan=JSON.parse(await readFile('tests/fixtures/scene-provider.json','utf8')),configured=new Set(),jobs=new Map(),calls=[];
 const server=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.headers.authorization!=='Bearer scene-fixture-token'){res.writeHead(401);res.end('{}');return;}let raw='';for await(const data of req)raw+=data;const body=raw?JSON.parse(raw):{};calls.push({path:req.url,familyId:body.familyId});
  const status=()=>({provider:'deepseek',model:'fixture-contract',configured:configured.has(body.familyId)});
  if(req.url==='/v1/scene-provider'){res.end(JSON.stringify(status()));return;}
  if(req.url==='/v1/scene-provider/configure'){configured.add(body.familyId);res.end(JSON.stringify(status()));return;}
  if(req.url==='/v1/scene-plan'){jobs.set(body.id,{familyId:body.familyId,polls:0});res.end(JSON.stringify({id:body.id,status:'queued',stage:'接口测试正在整理'}));return;}
  if(req.url==='/v1/scene-plan/status'){const job=jobs.get(body.id);if(!job||job.familyId!==body.familyId){res.writeHead(404);res.end(JSON.stringify({detail:'不存在'}));return;}job.polls++;res.end(JSON.stringify(job.polls<2?{status:'running',stage:'接口测试正在生成布局'}:{status:'completed',stage:'接口测试布局已就绪',seconds:1,result:{plan,model:'fixture-contract',usage:{total_tokens:100}}}));return;}
  res.writeHead(404);res.end('{}');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));return {url:`http://127.0.0.1:${server.address().port}`,calls,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
