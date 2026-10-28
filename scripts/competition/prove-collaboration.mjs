import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { createIsolatedAuthRuntime } from '../../tests/isolated-runtime.mjs';
const base='http://localhost:3012';
const output='public/evidence';
await mkdir(output+'/media',{recursive:true});
await mkdir('test-results/competition/recordings',{recursive:true});
const startedAt=new Date().toISOString(), checks=[], requests=[];
const runtime=await createIsolatedAuthRuntime(); await runtime.ready;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const contexts=[], errors=[];
async function call(path, method='GET', body, cookie) {
  const start=performance.now();
  const response=await runtime.dispatchFetch('http://jiayoubei.test'+path,{method,signal:AbortSignal.timeout(10000),headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const text=await response.text();
  requests.push({path:path.replace(/[A-Z0-9]{16,}/g,'[id]'),method,status:response.status,ms:Math.round((performance.now()-start)*10)/10});
  return {status:response.status,body:JSON.parse(text),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function check(name, action) { const start=performance.now(); await action(); checks.push({name,passed:true,ms:Math.round(performance.now()-start)});console.log('PASS '+name); }
async function context(cookie,name,width=1440){
  const ctx=await browser.newContext({viewport:{width,height:900},recordVideo:{dir:'test-results/competition/recordings',size:{width,height:900}}});contexts.push(ctx);
  const eq=cookie.indexOf('=');await ctx.addCookies([{name:cookie.slice(0,eq),value:cookie.slice(eq+1),url:base,httpOnly:true,sameSite:'Lax'}]);
  await ctx.route('**/api/**',async route=>{
    const req=route.request(), url=new URL(req.url());
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const response=await runtime.dispatchFetch('http://jiayoubei.test'+url.pathname+url.search,{method:req.method(),headers:await req.allHeaders(),body:req.postData()??undefined});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  const page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));
  return {ctx,page,name};
}
let result;
try{
  await check('未登录不能读取家庭数据',async()=>assert.equal((await call('/api/bootstrap')).status,401));
  const password='QA_'+crypto.randomUUID();
  const admin=await call('/api/auth/setup','POST',{email:'competition-admin@example.test',password,name:'小林'});assert.equal(admin.status,200);
  const state=()=>call('/api/bootstrap','GET',undefined,admin.cookie).then(r=>r.body);
  const initial=await state(), owner=initial.members[0].id;
  const member=await call('/api/members','POST',{name:'家人小陈',relation:'家人'},admin.cookie);assert.equal(member.status,201);
  const invite=await call('/api/invitations','POST',{memberId:member.body.id,email:'competition-family@example.test'},admin.cookie);assert.equal(invite.status,201);
  const joined=await call('/api/auth/invitations/accept','POST',{token:invite.body.token,email:'competition-family@example.test',password:'QA_'+crypto.randomUUID()});assert.equal(joined.status,200);
  await check('两个独立账号加入同一家庭',async()=>{const s=await call('/api/bootstrap','GET',undefined,joined.cookie);assert.equal(s.body.family.id,initial.family.id);assert.notEqual(s.body.user.id,initial.user.id)});
  // This is a declared API fixture, not a claimed live camera detection.
  const fixture={source:'video',torsoAngle:42,hipDrop:.12,ruleVersion:'torso-relative-v2',hipDropRatio:.8,lowPostureMs:700};
  await check('普通成员不能伪装为视觉管理员',async()=>assert.equal((await call('/api/cv/fall','POST',fixture,joined.cookie)).status,403));
  await check('不满足连续证据的上报被拒绝',async()=>assert.equal((await call('/api/cv/fall','POST',{...fixture,lowPostureMs:100},admin.cookie)).status,400));
  const first=await call('/api/cv/fall','POST',fixture,admin.cookie);assert.equal(first.status,200);
  const eventId=first.body.eventId;let task=(await state()).tasks.find(t=>t.sourceEventId===eventId);assert.ok(task);
  const path='/api/tasks/'+task.id;
  await check('视觉回放摘要创建事件、任务与审计',async()=>{const s=await state();assert.ok(s.events.find(e=>e.id===eventId));assert.ok(s.auditLogs.find(a=>a.target===eventId));assert.equal(s.tasks.filter(t=>t.sourceEventId===eventId).length,1)});
  await check('重复上报不会重复创建任务',async()=>{const r=await call('/api/cv/fall','POST',fixture,admin.cookie);assert.equal(r.body.eventId,eventId);assert.equal((await state()).tasks.filter(t=>t.sourceEventId===eventId).length,1)});
  await check('没有保存证据不能直接完成',async()=>assert.equal((await call(path,'PATCH',{status:'completed',version:task.version??0},admin.cookie)).status,409));
  let r=await call(path,'PATCH',{assignee:member.body.id,version:task.version??0},admin.cookie);assert.equal(r.status,200);
  const familyUI=await context(joined.cookie,'family',1280);
  const adminUI=await context(admin.cookie,'collaboration');
  await familyUI.page.goto(base+path.replace('/api',''),{waitUntil:'networkidle'});
  await familyUI.page.getByRole('button',{name:'接受任务',exact:true}).click();
  await check('家人通过页面请求帮助',async()=>{await familyUI.page.getByRole('button',{name:'请求家庭成员帮助',exact:true}).click();await familyUI.page.getByRole('button',{name:'已请求家庭帮助'}).waitFor();assert.equal((await state()).tasks.find(t=>t.id===task.id).helpRequested,true)});
  await adminUI.page.goto(base+'/notifications',{waitUntil:'networkidle'});
  const notice=adminUI.page.locator('.notification-row').filter({hasText:'记录视频回放的验证结果'}).first();await notice.click();
  await adminUI.page.getByRole('button',{name:'接手这项任务',exact:true}).waitFor();
  await adminUI.page.screenshot({path:output+'/media/collaboration-help.png'});
  await adminUI.page.waitForTimeout(1800);
  await check('已读状态按账号独立记录',async()=>{const a=await state(),n=a.notifications.find(n=>n.taskId===task.id);assert.ok(n);assert.equal(n.read,true);const b=await call('/api/bootstrap','GET',undefined,joined.cookie);assert.equal(b.body.notifications.find(x=>x.id===n.id).read,false)});
  await check('管理员从通知跳转并接手任务',async()=>{await adminUI.page.getByRole('button',{name:'接手这项任务',exact:true}).click();await adminUI.page.locator('.owner-row').filter({hasText:'小林'}).waitFor();const t=(await state()).tasks.find(t=>t.id===task.id);assert.equal(t.assignee,owner);assert.equal(t.helpRequested,false)});
  const note='比赛软件验证：已核对 URFD 实验回放。这是表演动作与接口验证记录，不代表家庭发生事故。小林接手后记录观察结果，待家人确认。';
  await adminUI.page.getByLabel('完成证据与核实结果').fill(note);
  await adminUI.page.screenshot({path:output+'/media/collaboration-record.png'});
  await adminUI.page.waitForTimeout(1800);
  await check('页面保存处理记录后进入待确认',async()=>{await adminUI.page.getByRole('button',{name:'保存处理记录',exact:true}).click();await adminUI.page.getByText('处理记录已保存，等待家庭确认',{exact:true}).waitFor();const t=(await state()).tasks.find(t=>t.id===task.id);assert.equal(t.evidence,note);assert.equal(t.status,'waiting_confirmation')});
  await check('确认完成同步关闭来源事件',async()=>{await adminUI.page.getByRole('button',{name:'确认完成',exact:true}).click();await adminUI.page.getByText('任务已完成并留痕',{exact:true}).waitFor();const s=await state();assert.equal(s.tasks.find(t=>t.id===task.id).status,'completed');assert.equal(s.events.find(e=>e.id===eventId).status,'resolved')});
  await adminUI.page.screenshot({path:output+'/media/collaboration-complete.png'});
  await adminUI.page.waitForTimeout(1500);
  await adminUI.page.goto(base+'/audit',{waitUntil:'networkidle'});
  await adminUI.page.screenshot({path:output+'/media/collaboration-audit.png'});
  await adminUI.page.waitForTimeout(1500);
  await check('刷新后记录仍在本地 D1 数据库中',async()=>{await familyUI.page.reload({waitUntil:'networkidle'});await familyUI.page.getByText('任务已完成并留痕',{exact:true}).waitFor();assert.equal((await state()).tasks.find(t=>t.id===task.id).evidence,note)});
  const extra=await call('/api/tasks','POST',{title:'并发版本验证',assignee:owner,priority:'medium'},admin.cookie);assert.equal(extra.status,201);
  await check('并发修改只允许一个版本成功',async()=>{const pair=await Promise.all([call('/api/tasks/'+extra.body.id,'PATCH',{helpRequested:true,version:0},admin.cookie),call('/api/tasks/'+extra.body.id,'PATCH',{helpRequested:true,version:0},joined.cookie)]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409])});
  await check('协作页面没有浏览器运行异常',async()=>assert.deepEqual(errors,[]));
  for(const ui of [familyUI,adminUI]){const video=ui.page.video();await ui.ctx.close();await copyFile(await video.path(),output+'/media/'+ui.name+'.webm')}
  result={schemaVersion:1,startedAt,completedAt:new Date().toISOString(),scope:'本机隔离 Miniflare / D1 + 编译后的真实 API + 两个真实登录会话。输入为明确标识的视频摘要测试夹具；不代表硬件接入、真实事故、外部消息送达或云端性能。',backendSha256:createHash('sha256').update(await readFile('dist/server/index.js')).digest('hex'),checks,summary:{passed:checks.filter(c=>c.passed).length,total:checks.length},apiRequests:requests,media:'media/collaboration.webm'};
  await writeFile(output+'/collaboration.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result.summary));
}catch(error){for(const ctx of contexts){for(const page of ctx.pages()){console.log((await page.locator('body').innerText()).slice(0,3000));await page.screenshot({path:'test-results/competition/collaboration-failure.png'})}}throw error}
finally{await browser.close();await runtime.dispose()}
