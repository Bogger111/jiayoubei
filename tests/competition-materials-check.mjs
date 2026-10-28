// Preserve the previous entry point while checking the current family Agent deck.
await import('./family-deck-check.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:962}});
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve('public/evidence/index.html')).href,{waitUntil:'load'});
  assert.equal(await page.locator('#clip-rows tr').count(),16);
  await page.locator('#run').selectOption('holdout-lite');
  assert.equal(await page.locator('#clip-rows').getByText('漏检',{exact:true}).count(),5);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出所选原始结果 JSON'}).click();
  const file=await download,saved=resolve('test-results/quiet/vision-report-download.json');
  await file.saveAs(saved);
  assert.equal(JSON.parse(await readFile(saved,'utf8')).summary.current.tp,3);
  console.log('Historical vision report offline rows, filter and JSON export: PASS');
}finally{await browser.close()}
