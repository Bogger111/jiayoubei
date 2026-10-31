import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
await mkdir('test-results/quiet/deck',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],external=[],results=[],responsive=[];
async function checkCanvas(page){
 const check=await page.evaluate(()=>{
  const canvas=document.getElementById('stage'),slide=document.querySelector('.slide.active'),controls=document.querySelector('.deck-controls');
  const c=canvas.getBoundingClientRect(),r=slide.getBoundingClientRect(),nav=controls.getBoundingClientRect();
  const escaped=[...slide.querySelectorAll('h1,h2,h3,p,li,td,th,button,img,select')].filter(el=>{if(!el.getClientRects().length)return false;const b=el.getBoundingClientRect();return b.left<c.left-2||b.top<c.top-2||b.right>c.right+2||b.bottom>c.bottom+2}).map(el=>el.textContent.slice(0,70)||el.tagName);
  return {title:slide.dataset.title,viewport:[innerWidth,innerHeight],fixedSize:slide.clientWidth===1600&&slide.clientHeight===900,sameCanvas:slide.parentElement===canvas&&['left','top','width','height'].every(key=>Math.abs(r[key]-c[key])<1),canvasInView:c.left>=-1&&c.top>=-1&&c.right<=innerWidth+1&&c.bottom<=innerHeight+1,clearOfControls:c.bottom<=nav.top+1,escaped};
 });
 assert.ok(check.fixedSize&&check.sameCanvas&&check.canvasInView&&check.clearOfControls&&!check.escaped.length,JSON.stringify(check));
 return check;
}
try{
 const context=await browser.newContext({viewport:{width:1600,height:1000},offline:true});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url())});
 await p.goto(pathToFileURL(path.resolve('家有备-创客比赛.html')).href,{waitUntil:'load'});
 assert.equal(await p.locator('.slide').count(),14);
 assert.equal(await p.locator('#stage > .slide').count(),14,'Every slide must remain a direct child of the fixed presentation canvas');
 assert.equal(await p.locator('#stage > :not(.slide)').count(),0,'No leftover content may appear between slides');
 await p.evaluate(()=>document.fonts.ready);
 assert.equal(await p.evaluate(()=>[...document.querySelectorAll('.slide')].slice(0,12).reduce((s,e)=>s+Number(e.dataset.seconds),0)),360);
 await p.getByRole('button',{name:'下一页',exact:true}).click();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('.slide.active').getAttribute('data-title'),'产品价值','Arrow navigation works after a control button has focus');await p.evaluate(()=>show(0));
 await p.evaluate(()=>show(10));await p.getByRole('button',{name:'查看情景与运行记录',exact:false}).click();await p.getByRole('dialog',{name:'情景运行记录'}).waitFor();assert.equal(await p.locator('#evidence-rows tr').count(),5);await p.screenshot({path:'test-results/quiet/deck/results-dialog.png'});await p.keyboard.press('Escape');assert.equal(await p.locator('#results-modal').isVisible(),false);await p.evaluate(()=>show(0));
 assert.equal(await p.locator('#proof-approved').textContent(),'任务已创建，等待联系人查看。');assert.equal(await p.locator('#proof-following').textContent(),'保留任务与等待期限。');assert.equal(await p.locator('#proof-resolved').textContent(),'结果已保存，停止后续未执行联系。');
 for(let i=0;i<14;i++){
  await p.evaluate(n=>show(n),i);
  await p.locator('.slide.active img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
  const check=await p.evaluate(()=>{const slide=document.querySelector('.slide.active'),r=slide.getBoundingClientRect();return {title:slide.dataset.title,overflow:slide.scrollHeight>slide.clientHeight+2,escaped:[...slide.querySelectorAll('h1,h2,h3,p,li,td,button,img,select')].filter(e=>{const s=getComputedStyle(e);if(s.display==='none'||!e.getClientRects().length)return false;const b=e.getBoundingClientRect();return b.right>r.right+2||b.bottom>r.bottom+2||b.left<r.left-2}).map(e=>e.textContent.slice(0,80)||e.tagName)}});
  await checkCanvas(p);results.push(check);await p.locator('#stage').screenshot({path:`test-results/quiet/deck/slide-${String(i+1).padStart(2,'0')}.jpg`,type:'jpeg',quality:85});
 }
 await p.evaluate(()=>show(12));await p.getByRole('button',{name:'同意并开始安排',exact:true}).click();assert.equal(await p.getByRole('button',{name:'同意并开始安排',exact:true}).isVisible(),false);
 await p.getByRole('button',{name:'联系人接手',exact:true}).click();assert.equal(await p.evaluate(()=>demoPlan.steps.find(s=>s.id==='family').status),'accepted');
 const deadline=await p.evaluate(()=>demoPlan.nextCheckAt);
 await p.getByRole('button',{name:'还没有联系到',exact:true}).click();assert.equal(await p.evaluate(()=>demoPlan.status),'following');assert.equal(await p.evaluate(()=>demoPlan.nextCheckAt),deadline);
 await checkCanvas(p);await p.locator('#stage').screenshot({path:'test-results/quiet/deck/slide-13-following.jpg',type:'jpeg',quality:90});
 assert.equal(await p.evaluate(()=>document.querySelector('.demo-plan').getBoundingClientRect().bottom<=document.querySelector('.demo-control').getBoundingClientRect().top-8),true,'following card must leave footer space');
 await p.getByRole('button',{name:'收到平安回应',exact:true}).click();assert.match(await p.locator('#demo-heading').textContent(),/有了回应/);assert.equal(await p.getByRole('button',{name:'推进至等待结束',exact:true}).isVisible(),false);
 await p.getByRole('button',{name:'重新开始',exact:true}).click();await p.getByRole('button',{name:'同意并开始安排',exact:true}).click();await p.getByRole('button',{name:'推进至等待结束',exact:true}).click();assert.match(await p.locator('#demo-steps').textContent(),/附近联系人核实任务/);
 await p.getByLabel('切换家庭情况').selectOption('away');assert.equal(await p.getByRole('button',{name:'同意并开始安排',exact:true}).isVisible(),false);assert.match(await p.locator('#demo-heading').textContent(),/外出/);
 await p.getByLabel('切换家庭情况').selectOption('unanswered');assert.equal(await p.locator('#demo-photo').isVisible(),false);
 await p.getByRole('button',{name:'播放实际操作录屏',exact:true}).click();await p.locator('#run-video').evaluate(async video=>{await video.play()});await p.waitForFunction(()=>document.querySelector('#run-video').currentTime>0);await p.locator('#video-modal [data-close]').click();
 await p.getByRole('button',{name:'播放实际操作录屏',exact:true}).click();await p.getByLabel('查看终端',{exact:true}).selectOption('admin');await p.locator('#run-video').evaluate(video=>video.play());await p.waitForFunction(()=>document.querySelector('#run-video').currentTime>0);await p.locator('#video-modal [data-close]').click();
 await p.evaluate(()=>show(5));await p.getByRole('button',{name:'播放多模态演示',exact:false}).click();assert.equal(await p.getByLabel('查看终端',{exact:true}).inputValue(),'hub');await p.locator('#run-video').evaluate(video=>video.play());await p.waitForFunction(()=>document.querySelector('#run-video').currentTime>0);await p.locator('#video-modal [data-close]').click();
 await p.evaluate(()=>show(13));await p.getByRole('button',{name:/多事件时间线示例/}).click();await p.locator('#timeline-preview').evaluate(img=>img.decode());await p.getByRole('button',{name:'事件详情',exact:true}).click();await p.locator('#timeline-preview').evaluate(img=>img.decode());assert.ok(await p.locator('#timeline-preview').evaluate(img=>img.naturalWidth>0));await p.locator('#timeline-modal [data-close]').click();
 assert.equal(await p.locator('.slide').evaluateAll(slides=>slides.some(s=>/ElliQ|CarePredict|LLM Vision|github\.com|https?:\/\//i.test(s.innerText+' '+s.querySelector('.slide-note').textContent))),false,'Project citations must remain in appendix.md rather than the deck');
 await p.getByRole('button',{name:'目录',exact:true}).click();await p.getByRole('dialog',{name:'演示目录'}).locator('button').filter({hasText:'演示与运行记录'}).click();assert.equal(await p.locator('.slide.active').getAttribute('data-title'),'演示与运行记录');
 const download=p.waitForEvent('download');await p.getByRole('button',{name:'导出运行记录',exact:true}).click();const artifact=await download;assert.match(artifact.suggestedFilename(),/运行记录/);
 await p.getByRole('button',{name:'讲稿',exact:true}).click();assert.ok((await p.locator('#notes-text').textContent()).length>10);await p.locator('#notes-modal [data-close]').click();
 for(const [width,height] of [[1366,768],[1280,720],[1024,768],[1920,1080],[900,700]]){
  await p.setViewportSize({width,height});await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await p.evaluate(()=>{show(12);document.getElementById('scenario').value='authorized';resetDemo()});
  for(let n=0;n<14;n++){await p.evaluate(n=>show(n),n);responsive.push(await checkCanvas(p));if(width===1366&&n>=9)await p.screenshot({path:`test-results/quiet/deck/projector-${n+1}.png`});}
  await p.evaluate(()=>show(12));await p.getByRole('button',{name:'重新开始',exact:true}).click();await p.getByLabel('切换家庭情况').selectOption('authorized');await p.getByRole('button',{name:'同意并开始安排',exact:true}).click();responsive.push(await checkCanvas(p));
  assert.equal(await p.evaluate(()=>document.querySelector('.demo-plan').getBoundingClientRect().bottom<=document.querySelector('.demo-control').getBoundingClientRect().top-8),true,'approved demo must leave footer space');
  await p.getByRole('button',{name:'联系人接手',exact:true}).click();await p.getByRole('button',{name:'还没有联系到',exact:true}).click();responsive.push(await checkCanvas(p));if(width===1366)await p.screenshot({path:'test-results/quiet/deck/projector-13-following.png'});
  await p.getByRole('button',{name:'推进至等待结束',exact:true}).click();responsive.push(await checkCanvas(p));
  await p.getByRole('button',{name:'收到平安回应',exact:true}).click();responsive.push(await checkCanvas(p));
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await p.emulateMedia({media:'print'});
 assert.equal(await p.locator('#stage > .slide:visible').count(),14);
 assert.equal(await p.locator('#stage > .slide').evaluateAll(slides=>slides.every(s=>s.clientWidth===1600&&s.clientHeight===900)),true);
 await p.emulateMedia({media:'screen'});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(results.every(r=>!r.overflow&&r.escaped.length===0),JSON.stringify(results.filter(r=>r.overflow||r.escaped.length)));
 await writeFile('test-results/quiet/deck-checks.json',JSON.stringify({at:new Date().toISOString(),slides:results,responsive,errors,external,offline:true,interactive:true},null,2));
 // Browser composition keeps the source and capture in one inspection image without modifying either asset.
 const grid=await context.newPage({viewport:{width:1600,height:1800}});await grid.setContent('<style>body{margin:0;background:#e8edf3;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px;box-sizing:border-box}figure{margin:0}img{display:block;width:100%}figcaption{padding:5px;font:13px Arial;color:#456}</style>'+results.map((r,i)=>'<figure><img src="data:image/jpeg;base64,'+Buffer.from([]).toString('base64')+'" id="s'+i+'"><figcaption>'+(i+1)+' · '+r.title+'</figcaption></figure>').join(''));
 for(let i=0;i<14;i++){const bytes=await readFile(`test-results/quiet/deck/slide-${String(i+1).padStart(2,'0')}.jpg`);await grid.locator('#s'+i).evaluate((img,src)=>img.src=src,'data:image/jpeg;base64,'+bytes.toString('base64'))}
 await grid.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));await grid.screenshot({path:'test-results/quiet/deck-contact-sheet.png',fullPage:true});
 console.log(JSON.stringify({slides:14,canvasChildren:14,responsiveChecks:responsive.length,offline:true,externalRequests:0,errors,interactions:'approval, reply, conditional escalation, branches, video, outline, notes, export'}));await context.close();
}finally{await browser.close()}
