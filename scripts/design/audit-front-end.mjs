import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const output='test-results/visual-upgrade',base='http://localhost:3000';
await mkdir(output,{recursive:true});
const routes=[['assistant','/'],['family','/dashboard'],['space','/space'],['actions','/tasks'],['devices','/devices'],['memory','/memory'],['photos','/create-space'],['scan','/reconstruct'],['events','/events'],['members','/members'],['services','/services'],['settings','/settings'],['audit','/audit'],['notifications','/notifications'],['permissions','/authorizations'],['care','/care'],['vision','/cv']];
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),results=[];
try{
 for(const width of [1536,768,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),p=await context.newPage();
  for(const [name,path]of routes){
   const errors=[];const onError=e=>errors.push(e.message);p.on('pageerror',onError);
   const response=await p.goto(base+path,{waitUntil:'networkidle'});await p.waitForTimeout(name==='space'||name==='family'?450:100);
   const review=await p.evaluate(()=>{
    const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
    const color=value=>{const m=value.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):[255,255,255];};
    const luminance=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
    const contrast=[];
    for(const e of document.querySelectorAll('main p,main span,main label,main button,main a,main h1,main h2,main h3,main small,main strong')){
     if(!visible(e)||e.closest('.diorama-view,.space-stage,.scan-viewer,.scan-stage')||!Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim())||e.closest('button:disabled,[aria-disabled=true]'))continue;
     const s=getComputedStyle(e);if(Number(s.opacity)<.9)continue;let parent=e,bg='';
     while(parent){const value=getComputedStyle(parent).backgroundColor;if(value!=='transparent'&&value!=='rgba(0, 0, 0, 0)'){bg=value;break;}parent=parent.parentElement;}
     const a=luminance(color(s.color)),b=luminance(color(bg||'rgb(247,248,245)')),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),threshold=parseFloat(s.fontSize)>=24||parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700?3:4.5;
     if(ratio+.05<threshold)contrast.push({text:e.textContent.trim().slice(0,50),className:e.className,ratio:Number(ratio.toFixed(2)),color:s.color,background:bg,fontSize:s.fontSize});
    }
    return {title:document.querySelector('main h1')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth+1,offenders:Array.from(document.querySelectorAll('main *')).filter(e=>{if(!visible(e))return false;const r=e.getBoundingClientRect();return r.right>innerWidth+2||r.left< -2;}).slice(0,8).map(e=>({tag:e.tagName,className:String(e.className),width:e.getBoundingClientRect().width})),contrast:contrast.slice(0,20),navLinks:document.querySelectorAll('nav[aria-label="主要功能"] a').length};
   });
   if(width!==768)await p.screenshot({path:`${output}/${name}-${width}.png`});
   results.push({width,path,status:response.status(),...review,errors});p.off('pageerror',onError);
   console.log(JSON.stringify({width,path,overflow:review.overflow,lowContrast:review.contrast.length,errors:errors.length}));
  }
  await context.close();
 }
 await writeFile(output+'/page-review.json',JSON.stringify({at:new Date().toISOString(),method:'actual local app; read-only navigation, no model calls or hardware actions',results},null,2));
 console.log('Reviewed',results.length,'page/viewport combinations.');
 if(results.some(r=>r.status!==200||r.overflow||r.errors.length))process.exitCode=1;
}finally{await browser.close();}
