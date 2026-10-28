import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
await mkdir('test-results/quiet/deck',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],external=[],results=[];
try{
 const context=await browser.newContext({viewport:{width:1600,height:1000},offline:true});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url())});
 await p.goto(pathToFileURL(path.resolve('家有备-创客比赛.html')).href,{waitUntil:'load'});
 assert.equal(await p.locator('.slide').count(),14);
 assert.equal(await p.evaluate(()=>[...document.querySelectorAll('.slide')].slice(0,12).reduce((s,e)=>s+Number(e.dataset.seconds),0)),360);
 for(let i=0;i<14;i++){
  await p.evaluate(n=>show(n),i);
  await p.locator('.slide.active img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  const check=await p.evaluate(()=>{const slide=document.querySelector('.slide.active'),r=slide.getBoundingClientRect();return {title:slide.dataset.title,overflow:slide.scrollHeight>slide.clientHeight+2,escaped:[...slide.querySelectorAll('h1,h2,h3,p,li,td,button,img,select')].filter(e=>{const s=getComputedStyle(e);if(s.display==='none'||!e.getClientRects().length)return false;const b=e.getBoundingClientRect();return b.right>r.right+2||b.bottom>r.bottom+2||b.left<r.left-2}).map(e=>e.textContent.slice(0,80)||e.tagName)}});
  results.push(check);await p.locator('#stage').screenshot({path:`test-results/quiet/deck/slide-${String(i+1).padStart(2,'0')}.jpg`,type:'jpeg',quality:85});
 }
 await p.evaluate(()=>show(12));await p.getByRole('button',{name:'同意并开始安排',exact:true}).click();assert.equal(await p.getByRole('button',{name:'同意并开始安排',exact:true}).isVisible(),false);
 await p.getByRole('button',{name:'联系人接手',exact:true}).click();assert.equal(await p.evaluate(()=>demoPlan.steps.find(s=>s.id==='family').status),'accepted');
 const deadline=await p.evaluate(()=>demoPlan.nextCheckAt);
 await p.getByRole('button',{name:'还没有联系到',exact:true}).click();assert.equal(await p.evaluate(()=>demoPlan.status),'following');assert.equal(await p.evaluate(()=>demoPlan.nextCheckAt),deadline);
 await p.locator('#stage').screenshot({path:'test-results/quiet/deck/slide-13-following.jpg',type:'jpeg',quality:90});
 assert.equal(await p.evaluate(()=>document.querySelector('.demo-plan').getBoundingClientRect().bottom<=document.querySelector('.demo-control').getBoundingClientRect().top-8),true,'following card must leave footer space');
 await p.getByRole('button',{name:'收到平安回应',exact:true}).click();assert.match(await p.locator('#demo-heading').textContent(),/有了回应/);assert.equal(await p.getByRole('button',{name:'推进至等待结束',exact:true}).isVisible(),false);
 await p.getByRole('button',{name:'重新开始',exact:true}).click();await p.getByRole('button',{name:'同意并开始安排',exact:true}).click();await p.getByRole('button',{name:'推进至等待结束',exact:true}).click();assert.match(await p.locator('#demo-steps').textContent(),/附近联系人核实任务/);
 await p.getByLabel('切换家庭情况').selectOption('away');assert.equal(await p.getByRole('button',{name:'同意并开始安排',exact:true}).isVisible(),false);assert.match(await p.locator('#demo-heading').textContent(),/外出/);
 await p.getByLabel('切换家庭情况').selectOption('unanswered');assert.equal(await p.locator('#demo-photo').isVisible(),false);
 await p.getByRole('button',{name:'播放实际操作录屏',exact:true}).click();await p.locator('#run-video').evaluate(async video=>{await video.play()});await p.waitForFunction(()=>document.querySelector('#run-video').currentTime>0);await p.locator('#video-modal [data-close]').click();
 await p.getByRole('button',{name:'播放实际操作录屏',exact:true}).click();await p.getByLabel('查看终端',{exact:true}).selectOption('admin');await p.locator('#run-video').evaluate(video=>video.play());await p.waitForFunction(()=>document.querySelector('#run-video').currentTime>0);await p.locator('#video-modal [data-close]').click();
 await p.getByRole('button',{name:'目录',exact:true}).click();await p.getByRole('dialog',{name:'演示目录'}).locator('button').filter({hasText:'来源与运行记录'}).click();assert.equal(await p.locator('.slide.active').getAttribute('data-title'),'来源与运行记录');
 const download=p.waitForEvent('download');await p.getByRole('button',{name:'导出运行记录',exact:true}).click();const artifact=await download;assert.match(artifact.suggestedFilename(),/运行记录/);
 await p.getByRole('button',{name:'讲稿',exact:true}).click();assert.ok((await p.locator('#notes-text').textContent()).length>10);await p.locator('#notes-modal [data-close]').click();
 await p.setViewportSize({width:1366,height:768});await p.evaluate(()=>show(0));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(results.every(r=>!r.overflow&&r.escaped.length===0),JSON.stringify(results.filter(r=>r.overflow||r.escaped.length)));
 await writeFile('test-results/quiet/deck-checks.json',JSON.stringify({at:new Date().toISOString(),slides:results,errors,external,offline:true,interactive:true},null,2));
 // Browser composition keeps the source and capture in one inspection image without modifying either asset.
 const grid=await context.newPage({viewport:{width:1600,height:1800}});await grid.setContent('<style>body{margin:0;background:#e8edf3;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px;box-sizing:border-box}figure{margin:0}img{display:block;width:100%}figcaption{padding:5px;font:13px Arial;color:#456}</style>'+results.map((r,i)=>'<figure><img src="data:image/jpeg;base64,'+Buffer.from([]).toString('base64')+'" id="s'+i+'"><figcaption>'+(i+1)+' · '+r.title+'</figcaption></figure>').join(''));
 for(let i=0;i<14;i++){const bytes=await readFile(`test-results/quiet/deck/slide-${String(i+1).padStart(2,'0')}.jpg`);await grid.locator('#s'+i).evaluate((img,src)=>img.src=src,'data:image/jpeg;base64,'+bytes.toString('base64'))}
 await grid.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));await grid.screenshot({path:'test-results/quiet/deck-contact-sheet.png',fullPage:true});
 console.log(JSON.stringify({slides:14,offline:true,externalRequests:0,errors,interactions:'approval, reply, conditional escalation, branches, video, outline, notes, export'}));await context.close();
}finally{await browser.close()}
