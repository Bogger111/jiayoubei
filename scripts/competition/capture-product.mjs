import assert from 'node:assert/strict';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
await mkdir('test-results/competition/recordings',{recursive:true});await mkdir('public/evidence/media',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[], results=[];
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const path of ['/','/ai','/events','/tasks','/members','/devices','/services','/audit','/settings','/cv']){
    await page.goto('http://localhost:3000'+path,{waitUntil:'networkidle'});await page.locator('h1').first().waitFor();
    const title=await page.locator('h1').first().textContent();assert.ok(!/不存在|404/.test(title));
    await page.screenshot({path:`public/evidence/media/ui-${path.slice(1)||'home'}.png`});
    results.push({path,title,desktopOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});
  }
  await page.goto('http://localhost:3000/',{waitUntil:'networkidle'});
  await page.keyboard.press('Control+k');await page.getByRole('dialog',{name:'搜索家庭空间'}).waitFor();
  await page.getByLabel('搜索事件、任务、家人或设备').fill('E001');
  assert.equal(await page.locator('.search-results button').count(),1);
  await page.getByLabel('搜索事件、任务、家人或设备').press('Enter');await page.waitForURL('**/events/E001');
  results.push({check:'全局搜索 ID、回车打开事件',passed:true});
  await page.keyboard.press('Control+k');await page.getByLabel('搜索事件、任务、家人或设备').fill('无匹配的文字xyz');await page.getByText('没有找到相关记录。试试家人的称呼或更短的关键词。').waitFor();await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/','/tasks','/cv','/settings','/devices','/ai']){
    await page.goto('http://localhost:3000'+path,{waitUntil:'networkidle'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    results.push({path,mobileOverflow:overflow});assert.equal(overflow,false,'Mobile overflow '+path);
    await page.screenshot({path:`public/evidence/media/mobile-${path.slice(1)||'home'}.png`});
  }
  const recording=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:'test-results/competition/recordings',size:{width:1440,height:1000}}});
  const cv=await recording.newPage();cv.on('pageerror',e=>errors.push(e.message));
  await cv.goto('http://localhost:3000/cv',{waitUntil:'networkidle'});
  await cv.getByRole('button',{name:'摔倒片段',exact:true}).click();
  await cv.waitForFunction(()=>document.querySelector('video')?.ended,undefined,{timeout:60000});
  const downloadPromise=cv.waitForEvent('download');await cv.getByRole('button',{name:'导出本次运行'}).click();
  const download=await downloadPromise;await download.saveAs('public/evidence/live-replay.json');
  const log=JSON.parse(await readFile('public/evidence/live-replay.json','utf8'));
  assert.ok(log.summary.frames>10);assert.equal(log.source,'video');
  results.push({check:'实际视频回放与本机日志导出',frames:log.summary.frames,events:log.summary.events,passed:true});
  await cv.evaluate(()=>window.scrollTo(0,0));
  await cv.screenshot({path:'public/evidence/media/cv-replay.png'});
  await cv.getByLabel('只显示骨架，隐藏原始画面').check();
  assert.equal(await cv.locator('video').evaluate(v=>getComputedStyle(v).opacity),'0');
  await cv.evaluate(()=>window.scrollTo(0,0));
  const before=await cv.locator('.vision-3d canvas').evaluate(c=>c.toDataURL());
  await cv.getByLabel('三维骨架观察方向').fill('-30');
  assert.notEqual(await cv.locator('.vision-3d canvas').evaluate(c=>c.toDataURL()),before);
  results.push({check:'只显示骨架与真实相对 3D 旋转',passed:true});
  await cv.evaluate(()=>window.scrollTo(0,0));
  await cv.screenshot({path:'public/evidence/media/cv-private.png'});
  await cv.waitForTimeout(1600);
  await cv.getByRole('button',{name:'弯腰对照',exact:true}).click();
  await cv.waitForFunction(()=>document.querySelector('video')?.ended,undefined,{timeout:30000});
  const nextDownload=cv.waitForEvent('download');await cv.getByRole('button',{name:'导出本次运行'}).click();await(await nextDownload).saveAs('public/evidence/live-adl.json');
  const adl=JSON.parse(await readFile('public/evidence/live-adl.json','utf8'));results.push({check:'实际弯腰回放',frames:adl.summary.frames,events:adl.summary.events,passed:true});
  await cv.waitForTimeout(1000);const video=cv.video();await recording.close();await copyFile(await video.path(),'public/evidence/media/vision-replay.webm');
  assert.deepEqual(errors,[]);assert.ok(results.every(r=>r.desktopOverflow!==true));
  await writeFile('public/evidence/frontend-checks.json',JSON.stringify({runAt:new Date().toISOString(),scope:'真实浏览器 UI 检查；这里的业务数据为演示模式，CV 是实际本机推理。',results,errors},null,2));
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
