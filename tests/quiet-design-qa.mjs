import {chromium} from 'playwright-core';
import {readFile,mkdir} from 'node:fs/promises';
const root='test-results/quiet';
await mkdir(root,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1536,height:552},deviceScaleFactor:1});
  const files=['design-previews/liquid-glass-v2/01-首页.png',root+'/home-final.png'];
  const data=await Promise.all(files.map(async file=>'data:image/png;base64,'+(await readFile(file)).toString('base64')));
  await page.setContent('<style>body{margin:0;display:grid;grid-template-columns:1fr 1fr;background:#edf1f6;gap:8px}figure{margin:0}img{display:block;width:100%;height:auto}figcaption{font:14px system-ui;padding:12px;color:#42576c}</style>'+data.map((src,i)=>'<figure><figcaption>'+(i?'Actual browser · 1536 × 1024':'Approved direction, restrained revision · 1536 × 1024')+'</figcaption><img src="'+src+'"></figure>').join(''));
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await page.screenshot({path:root+'/home-reference-comparison.png',fullPage:true});
  await page.setViewportSize({width:1592,height:690});
  await page.setContent('<style>body{margin:0;display:flex;background:#edf1f6}figure{margin:0;width:796px}figcaption{font:16px system-ui;padding:10px;color:#42576c}.crop{width:796px;height:640px;overflow:hidden;position:relative}img{position:absolute;width:1536px;max-width:none;left:-740px;top:-200px}</style>'+data.map((src,i)=>'<figure><figcaption>'+(i?'Actual plan':'Reference plan')+'</figcaption><div class="crop"><img src="'+src+'"></div></figure>').join(''));
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await page.screenshot({path:root+'/plan-reference-comparison.png'});
  const slides=[['02-PPT封面.png','01'],['03-产品价值.png','03'],['04-核心演示.png','13']];
  const comparisons=[];
  for(const [source,slide] of slides){
    for(const [file,mime,label] of [['design-previews/liquid-glass-v2/'+source,'png','Reference · '+source],[root+'/deck/slide-'+slide+'.jpg','jpeg','Actual · slide '+slide]]){
      comparisons.push('<figure><figcaption>'+label+'</figcaption><img src="data:image/'+mime+';base64,'+(await readFile(file)).toString('base64')+'"></figure>');
    }
  }
  await page.setViewportSize({width:1600,height:1480});
  await page.setContent('<style>body{margin:0;display:grid;grid-template-columns:1fr 1fr;background:#edf1f6;gap:8px}figure{margin:0}figcaption{font:14px system-ui;padding:10px;color:#42576c}img{display:block;width:100%;height:auto}</style>'+comparisons.join(''));
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await page.screenshot({path:root+'/deck-reference-comparison.png',fullPage:true});
  for(const width of [768,320]){
    await page.setViewportSize({width,height:1024});
    await page.goto('http://localhost:3000/',{waitUntil:'networkidle'});
    await page.screenshot({path:root+'/home-'+width+'.png',fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    console.log(JSON.stringify({width,overflow}));
    if(overflow)throw new Error('Responsive overflow at '+width);
  }
}finally{await browser.close()}
