import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('http://localhost:3000/',{waitUntil:'networkidle'});
  await page.keyboard.press('Control+k');await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByLabel('搜索事件、任务、家人或设备').evaluate(e=>e===document.activeElement),true);
  await page.keyboard.type('T002');await page.keyboard.press('Enter');await page.waitForURL('**/tasks/T002');await page.getByRole('heading',{name:'复核厨房安全传感器'}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'更多功能',exact:true}).click();
  const popup=page.waitForEvent('popup');await page.getByRole('dialog').getByRole('link',{name:'比赛演示',exact:true}).click();
  const deck=await popup;await deck.waitForLoadState();assert.equal(await deck.title(),'家有备 · 创客比赛');assert.equal(await deck.locator('.slide').count(),14);await deck.close();
  await page.goto('http://localhost:3000/cv',{waitUntil:'networkidle'});
  const reportPopup=page.waitForEvent('popup');await page.getByRole('link',{name:'实测记录',exact:true}).click();const report=await reportPopup;await report.waitForLoadState();assert.equal(await report.locator('#clip-rows tr').count(),16);await report.close();
  console.log('Search keyboard focus and task navigation; mobile competition link; CV evidence link: PASS');
}finally{await browser.close()}
