import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const assets={};
for(const name of ['ui-home','mobile-home','ui-tasks','ui-ai','ui-devices','cv-replay','cv-private','collaboration-help','collaboration-record','collaboration-complete','collaboration-audit','vision-results','fall-trace']){
  assets[name]='data:image/png;base64,'+(await readFile('public/evidence/media/'+name+'.png')).toString('base64');
}
for(const name of ['fall-06','adl-04','collaboration','vision-replay'])assets[name]='data:video/webm;base64,'+(await readFile('public/evidence/media/'+name+'.webm')).toString('base64');
assets.logo='data:image/svg+xml;base64,'+(await readFile('public/favicon.svg')).toString('base64');
const reports={};for(const name of ['development-lite','development-full','holdout-lite','holdout-full'])reports[name]=await json('public/evidence/vision-'+name+'.json');
const collaboration=await json('public/evidence/collaboration.json'),frontend=await json('public/evidence/frontend-checks.json'),live=await json('public/evidence/live-replay.json'),adl=await json('public/evidence/live-adl.json');
const traces={};for(const name of ['fall-06','adl-04']){
  const trace=await json('test-results/urfd/'+name+'/pose-trace-full.json').catch(error=>{
    if(error.code!=='ENOENT')throw error;
    return json('benchmarks/vision/pose-traces/'+name+'.json');
  });
  traces[name]={samples:reports['development-full'].clips.find(c=>c.id===name).samples,frames:trace.frames.map(f=>({ms:f.ms,points:f.landmarks[0]??[],world:f.worldLandmarks[0]??[]}))};
}
const data={reports,collaboration,frontend,live,adl,traces};
const statRows=Object.entries(reports).map(([key,r])=>{const s=r.summary;return `<tr><td>${key.startsWith('development')?'第一批 01–08':'第二批 09–16'}</td><td>${key.endsWith('lite')?'Lite':'Full'}</td><td>${s.current.tp} / 8</td><td>${s.current.fn} / 8</td><td>${s.current.fp} / 8</td><td>${s.inferenceP50Ms} / ${s.inferenceP95Ms} ms</td></tr>`}).join('');
const substitutions={data:JSON.stringify(data).replaceAll('<','\\u003c'),rows:statRows,checkCount:collaboration.summary.passed,liveFrames:live.summary.frames,liveEvents:live.summary.events,liveP50:live.summary.p50Ms,adlFrames:adl.summary.frames,adlEvents:adl.summary.events,runDate:new Date(collaboration.completedAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})};
for(const [template,folder] of [['evidence','evidence']]){
  let html=await readFile(`presentations/${template}.template.html`,'utf8');
  html=html.replace(/\{\{asset:([\w-]+)\}\}/g,(_,name)=>{if(!assets[name])throw new Error('Missing asset '+name);return assets[name]});
  html=html.replace(/\{\{(\w+)\}\}/g,(_,key)=>{if(substitutions[key]===undefined)throw new Error('Missing value '+key);return substitutions[key]});
  const file='public/'+folder+'/index.html';
  await mkdir('public/'+folder,{recursive:true});await writeFile(file,html);
  console.log(JSON.stringify({file,bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')}));
}
// Keep the historical vision report; the current competition deck uses the family Agent story.
await import('./run-care-evidence.mjs');
await import('./build-family-deck.mjs');
