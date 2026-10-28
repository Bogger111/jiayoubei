import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
const base='http://localhost:3000';
await mkdir('test-results/quiet/recordings',{recursive:true});await mkdir('public/evidence/media',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],checks=[];
try{
  const context=await browser.newContext({viewport:{width:1536,height:1024},recordVideo:{dir:'test-results/quiet/recordings',size:{width:1536,height:1024}}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'同意并开始安排',exact:true}).waitFor();
  // Deliberate reading pauses apply only to the recorded walkthrough, not readiness checks.
  const readMoment=()=>page.waitForTimeout(1600);
  await readMoment();
  await page.screenshot({path:'public/evidence/media/care-home.jpg',quality:90});
  await page.screenshot({path:'test-results/quiet/home-final.png'});
  assert.equal(await page.evaluate(()=>document.querySelector('.care-composer').getBoundingClientRect().bottom<=innerHeight),true,'composer visible at reference viewport');
  await page.getByRole('button',{name:'调整计划',exact:true}).click();
  await page.getByRole('dialog').getByLabel('先请谁协助联系').selectOption('M002');
  await readMoment();
  await page.getByRole('button',{name:'保存安排',exact:true}).click();
  await page.getByText('请林建国协助联系妈妈',{exact:true}).waitFor();checks.push({name:'编辑整份计划并应用联系人',passed:true});
  await page.getByRole('button',{name:'查看完整依据',exact:true}).click();await page.getByText('画面未加入本次判断',{exact:true}).waitFor();await readMoment();await page.getByRole('button',{name:'关闭',exact:true}).click();checks.push({name:'未授权画面不加入判断',passed:true});
  await readMoment();
  await page.getByRole('button',{name:'同意并开始安排',exact:true}).click();
  await page.getByRole('button',{name:'记录家人回应',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'记录家人回应',exact:true}).isEnabled(),true);
  await readMoment();
  await page.screenshot({path:'public/evidence/media/care-following.jpg',quality:90});checks.push({name:'一键批准后写入模拟回执与家庭任务',passed:true});
  await page.getByRole('button',{name:'记录家人回应',exact:true}).click();
  await page.getByLabel('记录联系结果').fill('已与妈妈通话，刚才在午睡，一切平安。');
  await readMoment();
  await page.getByRole('button',{name:'保存回应并结束跟进',exact:true}).click();
  await page.getByRole('heading',{name:'这次牵挂，有了回应',exact:true}).waitFor();
  await readMoment();
  await page.screenshot({path:'public/evidence/media/care-resolved.jpg',quality:90});checks.push({name:'真实记录回应后停止后续联系',passed:true});
  await page.getByRole('link',{name:'查看这次记录',exact:true}).click();
  await page.getByText('家人已确认情况',{exact:true}).waitFor();checks.push({name:'事件时间线保存回应',passed:true});
  await readMoment();
  const video=page.video();await context.close();await copyFile(await video.path(),'public/evidence/media/family-agent-run.webm');
  const qa=await browser.newContext({viewport:{width:1536,height:1024}});const q=await qa.newPage();q.on('pageerror',e=>errors.push(e.message));
  for(const [label,heading] of [['妈妈已外出','妈妈可能正在外出'],['语音报平安','妈妈已经回应平安'],['传感器离线','先确认家中的连接'],['加入授权图像场景','妈妈还没有回应']]){
    await q.goto(base,{waitUntil:'networkidle'});await q.getByRole('button',{name:'场景预演',exact:true}).click();await q.getByRole('button',{name:label,exact:true}).click();await q.getByRole('heading',{name:heading,exact:true}).waitFor();checks.push({name:`情景分支：${label}`,passed:true});
  }
  await q.getByRole('button',{name:'查看完整依据',exact:true}).click();await q.getByText('授权图像情景 · 示例画面',{exact:true}).waitFor();await q.getByRole('button',{name:'关闭',exact:true}).click();
  for(const path of ['/','/tasks','/devices','/memory','/events','/ai','/members','/services','/authorizations','/audit','/settings','/notifications','/cv']){
    await q.goto(base+path,{waitUntil:'networkidle'});assert.ok(await q.locator('h1').count(),`heading ${path}`);assert.equal(await q.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow ${path}`);checks.push({name:`桌面入口 ${path}`,passed:true});
  }
  await q.goto(base+'/memory',{waitUntil:'networkidle'});await q.getByRole('button',{name:'补充记忆',exact:true}).click();await q.getByLabel('家里的习惯或联系偏好').fill('妈妈午后喜欢休息，优先留言再联系。');await q.getByRole('button',{name:'保存这条记忆',exact:true}).click();await q.getByLabel('搜索家庭记忆').fill('喜欢休息');assert.equal(await q.locator('.memory-item').count(),1);checks.push({name:'家庭记忆新增与搜索',passed:true});
  await q.goto(base,{waitUntil:'networkidle'});await q.getByLabel('告诉家有备你的安排').fill('请安排家人给妈妈打电话确认情况');await q.getByRole('button',{name:'发送给家有备',exact:true}).click();await q.waitForURL('**/ai');await q.getByText('请安排家人给妈妈打电话确认情况',{exact:true}).waitFor();checks.push({name:'首页输入进入助手并发送消息',passed:true});
  await q.setViewportSize({width:390,height:844});
  for(const path of ['/','/tasks','/devices','/memory','/members','/settings']){await q.goto(base+path,{waitUntil:'networkidle'});assert.equal(await q.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`mobile overflow ${path}`);checks.push({name:`手机入口 ${path}`,passed:true});if(path==='/')await q.screenshot({path:'test-results/quiet/home-mobile.png',fullPage:true})}
  await q.getByRole('button',{name:'更多功能',exact:true}).click();await q.getByRole('dialog').getByRole('link',{name:'家庭事件',exact:true}).click();await q.waitForURL('**/events');checks.push({name:'手机更多菜单导航',passed:true});
  await q.goto(base,{waitUntil:'networkidle'});await q.keyboard.press('Control+k');await q.getByRole('dialog').waitFor();await q.getByLabel('搜索事件、任务、家人或设备').fill('T002');await q.keyboard.press('Enter');await q.waitForURL('**/tasks/T002');checks.push({name:'全局搜索快捷键与任务入口',passed:true});
  assert.deepEqual(errors,[]);await qa.close();
  await writeFile('public/evidence/care-browser-checks.json',JSON.stringify({runAt:new Date().toISOString(),scope:'真实 Chromium 操作与录屏；业务数据是演示家庭，外部硬件与通讯为本地模拟。',checks,errors},null,2));
  console.log(JSON.stringify({checks:checks.length,errors,video:'public/evidence/media/family-agent-run.webm'}));
}finally{await browser.close()}
