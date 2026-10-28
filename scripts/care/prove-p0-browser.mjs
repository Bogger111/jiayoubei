import assert from 'node:assert/strict';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createIsolatedAuthRuntime} from '../../tests/isolated-runtime.mjs';
import {demoCareSignals,legacyCareEvidence} from '../../lib/care-agent.ts';
const base=process.env.CARE_UI_URL||'http://localhost:3012';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('只允许本地软件证明环境');
const readyUntil=Date.now()+35000;
while(true){try{const response=await fetch(base,{signal:AbortSignal.timeout(3000)});if(response.ok)break;}catch{}if(Date.now()>readyUntil)throw new Error('前端服务尚未就绪：'+base);await new Promise(r=>setTimeout(r,500));}
await mkdir('public/evidence/media',{recursive:true});await mkdir('test-results/quiet/p0-recordings',{recursive:true});
const runtime=await createIsolatedAuthRuntime();await runtime.ready;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const contexts=[],errors=[],checks=[];
const call=async(path,body,cookie)=>{const response=await runtime.dispatchFetch('http://care.test'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json();assert.ok(response.ok,path+' '+response.status+' '+JSON.stringify(data));return {body:data,cookie:response.headers.get('set-cookie')?.split(';')[0]}};
async function view(cookie,name){
 const ctx=await browser.newContext({viewport:{width:1536,height:1024},recordVideo:{dir:'test-results/quiet/p0-recordings',size:{width:1536,height:1024}}});contexts.push(ctx);
 const eq=cookie.indexOf('=');await ctx.addCookies([{name:cookie.slice(0,eq),value:cookie.slice(eq+1),url:base,httpOnly:true,sameSite:'Lax'}]);
 await ctx.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(!url.pathname.startsWith('/api/'))return route.continue();const response=await runtime.dispatchFetch('http://care.test'+url.pathname+url.search,{method:req.method(),headers:await req.allHeaders(),body:req.postData()??undefined});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()})});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return {ctx,page,name};
}
const check=name=>{checks.push({name,passed:true});console.log('PASS '+name)};
try{
 const admin=await call('/api/auth/setup',{email:'care-browser-admin@example.test',password:'QA_'+crypto.randomUUID(),name:'小林'});
 const initial=(await call('/api/bootstrap',undefined,admin.cookie)).body;
 const contact=await call('/api/members',{name:'家人小陈',relation:'家人'},admin.cookie);
 const invite=await call('/api/invitations',{memberId:contact.body.id,email:'care-browser-family@example.test'},admin.cookie);
 const family=await call('/api/auth/invitations/accept',{token:invite.body.token,email:'care-browser-family@example.test',password:'QA_'+crypto.randomUUID()});
 await call('/api/care',{action:'create',requestId:crypto.randomUUID(),subjectId:initial.members[0].id,agreement:{contact:contact.body.id,waitMinutes:5,silenceMinutes:90,timezone:'Asia/Shanghai',restWindows:[]},records:legacyCareEvidence(demoCareSignals(),Date.now(),'browser-fixture').map(e=>({...e,caseId:undefined,subjectId:initial.members[0].id}))},admin.cookie);
 const a=await view(admin.cookie,'admin');await a.page.goto(base+'/care',{waitUntil:'networkidle'});
 await a.page.getByRole('button',{name:'同意并开始安排',exact:true}).waitFor();await a.page.screenshot({path:'public/evidence/media/care-p0-pending.jpg',quality:90});await a.page.waitForTimeout(1500);
 await a.page.getByRole('button',{name:'同意并开始安排',exact:true}).click();await a.page.getByText('执行结果未知，请核对',{exact:true}).waitFor();await a.page.waitForTimeout(1500);check('管理员页面批准计划，未配置设备显示未知');
 const f=await view(family.cookie,'family');await f.page.goto(base+'/care',{waitUntil:'networkidle'});
 await f.page.getByRole('button',{name:'我来接手联系',exact:true}).waitFor();await f.page.getByText('联系人已查看安排',{exact:true}).waitFor();await f.page.waitForTimeout(1200);check('另一终端实际查看安排并返回页面接收确认');
 await f.page.getByRole('button',{name:'我来接手联系',exact:true}).click();await f.page.getByText('家人已接手',{exact:true}).waitFor();await f.page.waitForTimeout(1500);check('联系人使用独立账号从页面明确接手');
 await f.page.getByRole('button',{name:'记录联系结果',exact:true}).click();await f.page.getByLabel('联系结果',{exact:true}).selectOption('no_answer');await f.page.getByLabel('记录联系结果',{exact:true}).fill('还没有联系到，请继续跟进。');await f.page.waitForTimeout(1500);await f.page.getByRole('button',{name:'保存结果，继续跟进',exact:true}).click();await f.page.getByRole('heading',{name:'还需要继续确认家人情况',exact:true}).waitFor();await f.page.screenshot({path:'public/evidence/media/care-p0-no-answer.jpg',quality:90});check('输入未联系到后，页面仍保留跟进和任务');
 await f.page.waitForTimeout(1500);await f.page.getByRole('button',{name:'记录联系结果',exact:true}).click();await f.page.getByLabel('联系结果',{exact:true}).selectOption('safe_confirmed');await f.page.getByLabel('记录联系结果',{exact:true}).fill('已与本人电话联系，确认本次情况平安。');await f.page.getByRole('checkbox',{name:'我已核实当前这次情况，可以结束后续联系。'}).check();await f.page.waitForTimeout(1500);await f.page.getByRole('button',{name:'保存回应并结束跟进',exact:true}).click();await f.page.getByRole('heading',{name:'已明确核实当前情况',exact:true}).waitFor();await f.page.screenshot({path:'public/evidence/media/care-p0-resolved.jpg',quality:90});assert.equal(await f.page.getByText('还需要确认',{exact:true}).isVisible(),false);await f.page.getByText('已与本人电话联系，确认本次情况平安。',{exact:true}).first().waitFor();await f.page.getByRole('heading',{name:'形成计划时的线索',exact:true}).waitFor();check('明确结果与人工确认后才结束本次跟进');
 await f.page.waitForTimeout(1500);await f.page.reload({waitUntil:'networkidle'});await f.page.getByRole('heading',{name:'已明确核实当前情况',exact:true}).waitFor();check('刷新页面后仍能恢复结果与过程记录');
 await a.page.reload({waitUntil:'networkidle'});await a.page.getByRole('heading',{name:'已明确核实当前情况',exact:true}).waitFor();assert.equal(await a.page.getByLabel('多久没有活动，再整理联系计划').inputValue(),'90');assert.equal(await a.page.getByLabel('等待时间',{exact:true}).inputValue(),'5');const clip=f.page.video(),adminClip=a.page.video();await f.ctx.close();await a.ctx.close();await copyFile(await clip.path(),'public/evidence/media/care-p0-family.webm');await copyFile(await adminClip.path(),'public/evidence/media/care-p0-admin.webm');
 const mobile=await view(family.cookie,'mobile');await mobile.page.setViewportSize({width:390,height:844});await mobile.page.goto(base+'/care',{waitUntil:'networkidle'});assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await mobile.page.screenshot({path:'test-results/quiet/care-p0-mobile.png',fullPage:true});await mobile.ctx.close();check('390px 两端协作页面没有横向溢出');
 assert.deepEqual(errors,[]);check('实际浏览器无脚本错误');
 await writeFile('public/evidence/care-p0-browser.json',JSON.stringify({generatedAt:new Date().toISOString(),category:'synthetic',transport:'live',scope:'两个独立真实认证测试账号访问本地隔离D1；业务输入构造，未接物理设备。',checks,errors,videos:['care-p0-admin.webm','care-p0-family.webm']},null,2));
 console.log(JSON.stringify({checks:checks.length,errors}));
}catch(error){for(const ctx of contexts){for(const page of ctx.pages()){console.log('BROWSER FAILURE '+(await page.locator('body').innerText()).slice(0,2500));console.log(JSON.stringify({errors}));await page.screenshot({path:'test-results/quiet/care-p0-failure.png',fullPage:true})}}throw error}finally{for(const ctx of contexts)await ctx.close().catch(()=>{});await browser.close();await runtime.dispose()}
