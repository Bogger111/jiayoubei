import assert from 'node:assert/strict';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createIsolatedAuthRuntime} from '../../tests/isolated-runtime.mjs';

const base=process.env.HOME_UI_URL||'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('只允许本地演练');
await mkdir('test-results/experience/recordings',{recursive:true});
await mkdir('public/evidence/media',{recursive:true});
const runtime=await createIsolatedAuthRuntime({bindings:{AUTH_MODE:'demo'}});await runtime.ready;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const checks=[],errors=[],external=[],chapters={};
const ok=name=>{checks.push({name,passed:true});console.log('PASS '+name)};
const observe=page=>{page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!['localhost','127.0.0.1'].includes(new URL(r.url()).hostname))external.push(r.url())})};
async function attach(context,intercept){await context.route('**/api/**',async route=>{
 const request=route.request(),url=new URL(request.url());if(!url.pathname.startsWith('/api/'))return route.continue();
 if(intercept&&await intercept(route,url))return;
 const r=await runtime.dispatchFetch('http://home.test'+url.pathname+url.search,{method:request.method(),headers:await request.allHeaders(),body:request.postData()??undefined});
 await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});
})}
const context=await browser.newContext({viewport:{width:1536,height:1024},recordVideo:{dir:'test-results/experience/recordings',size:{width:1536,height:1024}}});
await attach(context);const page=await context.newPage();observe(page);const started=Date.now();
const chapter=name=>{chapters[name]=Math.max(0,(Date.now()-started)/1000)};
const pause=()=>page.waitForTimeout(1200);
const shot=async(name)=>{
 await page.evaluate(()=>scrollTo(0,0));
 const clip=await page.evaluate(()=>{const a=document.querySelector('.experience-tabs').getBoundingClientRect(),b=document.querySelector('.experience-panel').getBoundingClientRect();return {x:a.left,y:a.top+scrollY,width:b.right-a.left,height:b.bottom-a.top}});
 await page.screenshot({path:'public/evidence/media/home-experience-'+name+'.jpg',type:'jpeg',quality:90,clip});
};
try{
 await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'更多功能',exact:true}).click();await page.getByRole('link',{name:'完整产品体验',exact:true}).click();await page.getByRole('tab',{name:'家庭动态',exact:true}).waitFor();ok('首页菜单可打开完整体验，四个能力入口均可用');
 chapter('vision');await page.getByRole('button',{name:/日常照护/}).click();await page.locator('llmvision-card .event-container').first().waitFor();await page.locator('llmvision-preview-card .preview-event-image').evaluate(img=>img.decode());assert.equal(await page.locator('llmvision-card .event-container').count(),3);assert.match(await page.locator('llmvision-preview-card').textContent(),/客厅暂未见人/);await pause();await shot('vision');ok('原预览组件和时间线同时运行，同一家庭数据可见');
 await page.locator('llmvision-preview-card .preview-event-container').click();await page.getByRole('dialog',{name:'客厅暂未见人'}).waitFor();await page.getByRole('button',{name:'关闭',exact:true}).click();ok('预览与时间线共用可打开的本地详情');
 await page.getByRole('button',{name:/回家与到访/}).click();await page.getByLabel('体验动态分类').selectOption('delivery');await page.locator('llmvision-card .event-container').first().waitFor();assert.equal(await page.locator('llmvision-card .event-container').count(),1);assert.match(await page.locator('llmvision-card').textContent(),/快递/);await page.getByLabel('体验动态分类').selectOption('vehicle');assert.equal(await page.locator('llmvision-card .event-container').count(),1);
 await page.getByRole('button',{name:/宠物与日常/}).click();await page.getByLabel('体验动态分类').selectOption('animal');await page.waitForFunction(()=>document.querySelectorAll('llmvision-card .event-container').length===2);await pause();await page.getByLabel('体验动态分类').selectOption('all');ok('三个情景导入九条演练动态，快递、车辆和宠物可独立筛选');
 for(let i=0;i<4;i++){await page.locator('.experience-gallery-grid button').nth(i).click();await page.getByRole('dialog').locator('figure img').evaluate(img=>img.decode());assert.ok(await page.getByRole('dialog').locator('figure img').evaluate(img=>img.naturalWidth>0));await page.getByRole('button',{name:'关闭',exact:true}).click()}ok('四种原界面演示均完整可看，保持示例标签');
 chapter('intent');await page.getByRole('tab',{name:'一句话安排',exact:true}).click();await page.getByRole('button',{name:'把客厅主灯打开',exact:true}).click();await page.getByRole('button',{name:'整理下一步',exact:true}).click();await page.getByRole('button',{name:'同意这次灯光安排',exact:true}).waitFor();await pause();await shot('intent');await page.getByRole('button',{name:'同意这次灯光安排',exact:true}).click();await page.getByText('软件演练已记录',{exact:true}).waitFor();await pause();ok('原中文句式用例适配家庭设备，批准后产生模拟结果');
 await page.reload({waitUntil:'networkidle'});await page.getByRole('tab',{name:'一句话安排',exact:true}).click();await page.getByText('软件演练已记录',{exact:true}).waitFor();ok('体验页刷新后仍恢复同一份持久化安排');
 chapter('terminal');await page.getByRole('tab',{name:'家庭对话',exact:true}).click();await page.getByRole('button',{name:'体验这句对话',exact:true}).click();await page.locator('.experience-assistant-message').waitFor();assert.equal(await page.locator('.experience-trace [data-status=done]').count(),3);await pause();await shot('terminal');ok('对话实际运行初始化、工具发现与家庭时间线读取');
 for(const tone of ['success','popup']){await page.getByLabel('交互提示音').selectOption(tone);await page.getByRole('button',{name:'播放交互提示音',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.experience-terminal audio').currentTime>0);await pause()}ok('两种原终端提示音均在浏览器实际播放');
 await page.getByLabel('选择一句家庭对话').selectOption('light');await page.getByRole('button',{name:'体验这句对话',exact:true}).click();await page.locator('.experience-assistant-message').waitFor();await page.getByRole('button',{name:'同意这次灯光安排',exact:true}).waitFor();await pause();ok('对话调用可准备灯光安排，仍等待管理员确认');
 await page.getByLabel('选择一句家庭对话').selectOption('care');await page.getByRole('button',{name:'体验这句对话',exact:true}).click();await page.getByRole('link',{name:'查看并确认联系计划',exact:true}).waitFor();await pause();await page.getByRole('link',{name:'查看并确认联系计划',exact:true}).click();await page.getByRole('button',{name:'同意并开始安排',exact:true}).waitFor();ok('对话准备的联系计划可进入原关怀流程批准');
 await page.goto(base+'/experience',{waitUntil:'networkidle'});chapter('family');await page.getByRole('tab',{name:'家人协作',exact:true}).click();await shot('family');for(const view of ['family','admin']){await page.getByLabel('家庭协作录像').selectOption(view);await page.locator('.experience-family-grid video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('.experience-family-grid video').currentTime>0);await pause()}ok('独立测试账号的两端协作录像可切换播放');
 assert.equal(await page.locator('.home-experience').evaluate(el=>/LLM Vision|XiaoZhi|小智|Home Assistant|GitHub|valentinfrlch|开源项目/i.test(el.innerText)),false);ok('体验内容只呈现家庭能力，不展示第三方项目名称');
 await page.getByRole('tab',{name:'家庭动态',exact:true}).click();await pause();const video=page.video();await context.close();await copyFile(await video.path(),'public/evidence/media/home-experience-run.webm');

 let failTool=true,probeMarkup=true;const mobile=await browser.newContext({viewport:{width:390,height:844}});
 await attach(mobile,async(route,url)=>{
  if(failTool&&url.pathname==='/api/multimodal/mcp'){const body=route.request().postDataJSON();if((body.payload??body).method==='tools/call'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({payload:{jsonrpc:'2.0',id:3,error:{code:-32602,message:'工具暂时不可用，请稍后重试'}}})});return true}}
  if(probeMarkup&&url.pathname==='/api/multimodal'&&route.request().method()==='GET'){const r=await runtime.dispatchFetch('http://home.test/api/multimodal');const body=await r.json();body.events[0].title='<img src=x onerror=window.__experienceInjected=1>';await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});return true}return false;
 });
 const mp=await mobile.newPage();observe(mp);await mp.goto(base+'/experience',{waitUntil:'networkidle'});await mp.locator('llmvision-preview-card').waitFor();assert.equal(await mp.evaluate(()=>Boolean(window.__experienceInjected)),false);assert.equal(await mp.locator('llmvision-preview-card img[src="x"]').count(),0);probeMarkup=false;await mp.reload({waitUntil:'networkidle'});ok('预览组件也按文本显示外部标题，不执行注入标记');
 await mp.getByRole('tab',{name:'家庭对话',exact:true}).click();await mp.getByRole('button',{name:'体验这句对话',exact:true}).click();await mp.getByRole('alert').filter({hasText:'工具暂时不可用'}).waitFor();assert.equal(await mp.locator('.experience-trace [data-status=failed]').count(),1);assert.equal(await mp.locator('.experience-assistant-message').count(),0);failTool=false;await mp.getByRole('button',{name:'体验这句对话',exact:true}).click();await mp.locator('.experience-assistant-message').waitFor();assert.equal(await mp.locator('.experience-trace [data-status=done]').count(),3);ok('工具失败保留失败状态，重试真实成功后才显示回复');
 for(const width of [320,390,768]){await mp.setViewportSize({width,height:844});for(const name of ['家庭动态','一句话安排','家庭对话','家人协作']){await mp.getByRole('tab',{name,exact:true}).click();assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,width+' '+name);if(width===390){await mp.evaluate(()=>document.activeElement?.blur());await mp.screenshot({path:'test-results/experience/mobile-'+name+'.png',fullPage:true})}}}ok('320、390、768宽度的四个体验面板均无横向溢出');
 await mobile.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);ok('完整体验无脚本错误与外部数据请求');
 await writeFile('public/evidence/experience-browser.json',JSON.stringify({generatedAt:new Date().toISOString(),category:'synthetic',transport:'live',scope:'隔离D1与实际HTTP工具调用；演练情景和预置文本，不是ASR或硬件结果。',checks,chapters,video:'home-experience-run.webm',errors,external},null,2));console.log(JSON.stringify({checks:checks.length,chapters}));
}finally{await context.close().catch(()=>{});await browser.close();await runtime.dispose()}
