/* Record a fresh model request and real persistent edits, using an isolated demo family. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {createIsolatedAuthRuntime} from '../../tests/isolated-runtime.mjs';
const output='test-results/room-video-upgrade';await mkdir(output,{recursive:true});
const engine=JSON.parse(await readFile('.care-local/home-upgrade/engine-config.json','utf8'));
const runtime=await createIsolatedAuthRuntime({r2Buckets:['HOME_MEDIA'],bindings:{AUTH_MODE:'demo',HOME_ENGINE_URL:'http://127.0.0.1:'+engine.port,HOME_ENGINE_TOKEN:engine.token}});await runtime.ready;
const call=async(path)=>{const r=await runtime.dispatchFetch('http://localhost:3000'+path);const data=await r.json();assert.ok(r.ok,`${path}: ${r.status}`);return data;};
const provider=(await call('/api/scene-plans')).provider;assert.equal(provider.configured,true,'Existing local vision provider must be configured');
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),errors=[];
async function context(record){
 const c=await b.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',...(record?{recordVideo:{dir:output+'/raw-video',size:{width:1600,height:1000}}}:{})});
 await c.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url());if(!url.pathname.startsWith('/api/'))return route.continue();const headers=await req.allHeaders();if(headers['content-type']?.startsWith('multipart/form-data'))headers.origin=(await runtime.ready).origin;const r=await runtime.dispatchFetch('http://localhost:3000'+url.pathname+url.search,{method:req.method(),headers,body:req.postDataBuffer()??undefined});await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer())});});
 if(record)await c.addInitScript(()=>{addEventListener('DOMContentLoaded',()=>{const cursor=document.createElement('div');cursor.setAttribute('aria-hidden','true');cursor.style.cssText='position:fixed;left:-30px;top:-30px;width:14px;height:14px;border:2px solid #fff;box-shadow:0 0 0 1px #17372d88,0 2px 5px #0005;background:#214d43;border-radius:50%;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%)';document.body.append(cursor);addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px'});addEventListener('mousedown',()=>{cursor.style.scale='1.35'});addEventListener('mouseup',()=>{cursor.style.scale='1'});});});
 const p=await c.newPage();p.setDefaultTimeout(35000);p.on('pageerror',e=>errors.push(e.message));return {c,p};
}
const voice=await context(false);
try{
 await voice.p.goto('http://localhost:3000/',{waitUntil:'networkidle'});await voice.p.getByLabel('描述家庭情况',{exact:true}).fill('帮我安排今晚的家庭事务，先给我完整计划。');await voice.p.waitForTimeout(350);await voice.p.locator('.assistant-dialogue').screenshot({path:output+'/voice-interface.png'});await voice.p.screenshot({path:output+'/voice-page.png'});await voice.c.close();
 const {c,p}=await context(true);const startedAt=new Date().toISOString();
 try{
  await p.goto('http://localhost:3000/create-space',{waitUntil:'networkidle'});await p.locator('canvas').first().waitFor();await p.waitForTimeout(800);
  const click=async locator=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();await p.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:16});await p.waitForTimeout(220);await locator.click();};
  await click(p.getByRole('button',{name:'试用样例照片',exact:true}));await p.waitForFunction(()=>document.querySelectorAll('.scene-photo-grid img').length===6);
  await p.locator('.photo-home-notes textarea').fill('六张照片是同一间起居室的不同视角，只搭一个房间。保留木地板、灰色沙发、蓝绿色休闲椅、深色地毯、电视柜、茶几、白色书柜、钢琴与植物。家具不要重复，地面布局舒展。');await p.waitForTimeout(900);await p.screenshot({path:output+'/photos-input.png'});
  await click(p.getByRole('button',{name:'生成三维家居',exact:true}));console.log('Fresh vision-model generation submitted through the real UI.');
  await p.getByRole('button',{name:'微调家具',exact:true}).waitFor({timeout:180000});await p.locator('.photo-home-scene canvas').waitFor();await p.waitForTimeout(1100);
  const initial=(await call('/api/scene-plans')).drafts[0];assert.equal(initial.status,'completed');assert.equal(initial.photoIds.length,6);assert.ok(initial.config.decorations.length>0);await writeFile(output+'/fresh-generated-draft.json',JSON.stringify(initial,null,2));await p.locator('.photo-home-output').screenshot({path:output+'/generated-layout.png'});console.log('Actual model result:',initial.config.rooms.length,'room(s),',initial.config.decorations.length,'furniture,',initial.seconds,'seconds.');
  const canvas=p.locator('.photo-home-scene canvas'),box=await canvas.boundingBox();await p.mouse.move(box.x+box.width*.4,box.y+box.height*.45,{steps:15});await p.mouse.down();await p.mouse.move(box.x+box.width*.52,box.y+box.height*.48,{steps:45});await p.mouse.up();await p.waitForTimeout(800);
  await click(p.getByRole('button',{name:'微调家具',exact:true}));await click(p.getByRole('button',{name:'Add 办公椅',exact:true}));await p.locator('input[type=range]').nth(3).waitFor();
  const width=p.locator('input[type=range]').nth(0),angle=p.locator('input[type=range]').nth(3);await width.focus();await p.waitForTimeout(250);await width.press('ArrowRight');await width.press('ArrowRight');await angle.focus();for(let i=0;i<9;i++){await angle.press('ArrowRight');await p.waitForTimeout(70);}assert.equal(await angle.inputValue(),'45');await p.waitForTimeout(1100);await p.screenshot({path:output+'/furniture-editor.png'});
  await click(p.getByRole('button',{name:'保存并返回',exact:true}));await p.locator('dialog[open]').waitFor({state:'detached'});const edited=(await call('/api/scene-plans?id='+initial.id)).draft;assert.equal(edited.version,initial.version+1);assert.equal(edited.config.decorations.length,initial.config.decorations.length+1);await p.waitForTimeout(800);
  await click(p.getByRole('button',{name:'保存为家庭空间',exact:true}));await p.waitForURL('**/space');await p.locator('diorama-card canvas').waitFor();await p.waitForTimeout(1000);const saved=(await call('/api/home-space')).space;assert.equal(saved.config.sceneDraftId,initial.id);
  await p.reload({waitUntil:'networkidle'});await p.locator('diorama-card canvas').waitFor();const refreshed=(await call('/api/home-space')).space;assert.deepEqual(refreshed.config,saved.config);await p.waitForTimeout(1000);await p.screenshot({path:output+'/saved-home.png'});await p.locator('.space-stage').count().then(async n=>{if(n)await p.locator('.space-stage').screenshot({path:output+'/saved-home-detail.png'})});await p.waitForTimeout(1500);
  const evidence={at:new Date().toISOString(),startedAt,method:'fresh real vision inference; actual frontend and backend in isolated D1/R2; six public photos selected; native office chair addition, width and angle edits; draft save; apply as family space; full page reload; no fixed model output or simulated success',initial,edited,savedSpace:refreshed,errors};await writeFile(output+'/recording-evidence.json',JSON.stringify(evidence,null,2));assert.deepEqual(errors,[]);
  const video=p.video();await c.close();await video.saveAs(output+'/room-real-flow.webm');console.log('Recorded actual photo generation, furniture width/rotation edits, family-space save and reload.');
 }catch(e){await p.screenshot({path:output+'/recording-failure.png',fullPage:true});console.log((await p.locator('body').innerText()).slice(-1800));await c.close();throw e;}
}finally{await b.close();await runtime.dispose();}
