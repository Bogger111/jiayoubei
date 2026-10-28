import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { FallDetector } from '../../lib/cv/fall-detector.ts';
import { FallDetector as BaselineDetector } from '../../benchmarks/baselines/fall-detector-v1.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dataset = process.env.PILOT_DATASET ?? 'urfd';
if (!['urfd','urfd-holdout'].includes(dataset)) throw new Error('Unknown dataset');
const model = process.env.POSE_MODEL === 'full' ? 'full' : 'lite';
const raw = resolve(root, 'test-results', dataset);
const out = resolve(root, 'public/evidence');
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(raw, 'manifest.json'), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceHash = sha(await readFile(resolve(root, 'lib/cv/fall-detector.ts')));
const frozen = {
  ...manifest.protocol, detectorSha256: sourceHash,
  comparator: 'Single-frame 2D torso tilt >=55 degrees with visible shoulders and hips; a deliberately simple reference, not a deployed detector.',
  model,modelSha256: sha(await readFile(resolve(root, `public/cv/pose_landmarker_${model}.task`))),
  workerSha256: sha(await readFile(resolve(root, 'public/cv/pose-worker.js'))),
};
await writeFile(resolve(raw, 'frozen-run-protocol.json'), JSON.stringify(frozen, null, 2));
await writeFile(resolve(raw, 'fall-detector-frozen.ts'), await readFile(resolve(root, 'lib/cv/fall-detector.ts')));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const base = process.env.BASE_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local application required.');
const percentile = (values, fraction) => {
  const sorted = values.toSorted((a,b)=>a-b);
  return sorted.length ? Number(sorted[Math.ceil(sorted.length*fraction)-1].toFixed(2)) : null;
};
const valid = p => p && [p.x,p.y].every(Number.isFinite) && (p.visibility ?? 1)>=0.5;
const angle = (points, world=false) => {
  if (!points || [11,12,23,24].some(i=>!valid(points[i]) || (world && !Number.isFinite(points[i].z)))) return null;
  const delta = key => (points[11][key]+points[12][key]-points[23][key]-points[24][key])/2;
  return Math.atan2(world ? Math.hypot(delta('x'),delta('z')) : Math.abs(delta('x'))*4/3, Math.abs(delta('y')))*180/Math.PI;
};
const clips = [];
const runStart = new Date().toISOString();
try {
  await page.route('**/__pilot/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const match = /^\/__pilot\/(fall|adl)-(\d{2})\/(\d{5})\.jpg$/.exec(pathname);
    if (!match || !manifest.clips.some(c=>c.id===`${match[1]}-${match[2]}`)) return route.fulfill({status:404,body:'Not found'});
    await route.fulfill({contentType:'image/jpeg',body:await readFile(resolve(raw,`${match[1]}-${match[2]}`,`${match[3]}.jpg`))});
  });
  await page.goto(base+'/cv', {waitUntil:'networkidle'});
  for (const clip of manifest.clips) {
    const trace = await page.evaluate(async clip => {
      const worker = new Worker('/cv/pose-worker.js');
      let seq=0;
      const pending = new Map();
      worker.onmessage = ({data}) => {
        const p=pending.get(data.id); if(!p)return;
        clearTimeout(p.timer);pending.delete(data.id);
        if(data.type==='error')p.reject(new Error(data.message));else p.resolve(data);
      };
      const send=(data,transfer=[])=>new Promise((resolve,reject)=>{
        const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Inference timeout'))},45000);
        pending.set(id,{resolve,reject,timer});worker.postMessage({...data,id},transfer);
      });
      const started=performance.now();
      const frames=[];
      try{
        await send({type:'init',model:clip.model});
        const initMs=performance.now()-started;
        for (const frame of clip.frames) {
          const response=await fetch(`/__pilot/${clip.id}/${frame.image}`);
          if(!response.ok)throw new Error('Missing decoded input');
          const image=await createImageBitmap(await response.blob());
          const result=await send({type:'frame',image,timestamp:frame.ms+1},[image]);
          frames.push({ms:frame.ms,index:frame.index,landmarks:result.landmarks,worldLandmarks:result.worldLandmarks,inferenceMs:result.inferenceMs});
        }
        return {initMs,frames};
      } finally {worker.terminate();for(const p of pending.values())clearTimeout(p.timer);}
    }, {...clip,model});
    const detector = new FallDetector();
    const baseline = new BaselineDetector();
    const baselineAlarms=[];
    const transitions=[];
    const states={};
    const samples=trace.frames.map(frame=>{
      if(frame.landmarks.length>1){detector.reset();baseline.reset();}
      if(baseline.update(frame.landmarks.length===1?frame.landmarks[0]:undefined,frame.ms,clip.width/clip.height).newEvent)baselineAlarms.push(frame.ms);
      const observation=detector.update(frame.landmarks.length===1?frame.landmarks[0]:undefined,frame.ms,clip.width/clip.height);
      states[observation.state]=(states[observation.state]??0)+1;
      if(!transitions.length || transitions.at(-1).state!==observation.state)transitions.push({ms:frame.ms,state:observation.state,reason:observation.reason});
      return {ms:frame.ms,people:frame.landmarks.length,state:observation.state,reason:observation.reason,
        angle:observation.torsoAngle,drop:observation.hipDrop,dropRatio:observation.hipDropRatio,calibrated:observation.calibrationProgress===1,newEvent:observation.newEvent,
        rawAngle:frame.landmarks.length===1?angle(frame.landmarks[0]):null,
        worldAngle:frame.landmarks.length===1?angle(frame.worldLandmarks[0],true):null,
        inferenceMs:Number(frame.inferenceMs.toFixed(2))};
    });
    await writeFile(resolve(raw, clip.id, `pose-trace-${model}.json`),JSON.stringify(trace));
    const times=trace.frames.map(f=>f.inferenceMs);
    const alarms=samples.filter(f=>f.newEvent).map(f=>f.ms);
    const result={id:clip.id,label:clip.label,url:clip.url,sha256:clip.sha256,durationMs:clip.durationMs,
      sampledFrames:samples.length,calibrated:samples.some(f=>f.calibrated),detected:alarms.length>0,alarms,
      baselineDetected:baselineAlarms.length>0,baselineAlarms,
      singleFrameDetected:samples.some(f=>f.rawAngle!==null && f.rawAngle>=55),
      visibleFrames:samples.filter(f=>f.angle!==null).length,states,transitions,
      inference:{p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),initMs:Number(trace.initMs.toFixed(2))},samples};
    clips.push(result);
    console.log(JSON.stringify({id:clip.id,calibrated:result.calibrated,detected:result.detected,tilt:result.singleFrameDetected,visible:result.visibleFrames,frames:result.sampledFrames,p50:result.inference.p50Ms}));
  }
  const confusion = key => ({
    tp:clips.filter(c=>c.label==='fall'&&c[key]).length,fn:clips.filter(c=>c.label==='fall'&&!c[key]).length,
    fp:clips.filter(c=>c.label==='adl'&&c[key]).length,tn:clips.filter(c=>c.label==='adl'&&!c[key]).length,
  });
  const allTimes=clips.flatMap(c=>c.samples.map(f=>f.inferenceMs));
  const result={schemaVersion:1,runStart,runEnd:new Date().toISOString(),protocol:frozen,
    environment:{platform:os.platform(),cpu:os.cpus()[0]?.model,browser:browser.version(),node:process.version,engine:`Web Worker / CPU / ${model}`,view:'320×240 RGB',samplingHz:10},
    summary:{clips:clips.length,fallClips:8,adlClips:8,sampledFrames:allTimes.length,videoSeconds:Number((clips.reduce((s,c)=>s+c.durationMs,0)/1000).toFixed(2)),
      calibratedClips:clips.filter(c=>c.calibrated).length,inferenceP50Ms:percentile(allTimes,.5),inferenceP95Ms:percentile(allTimes,.95),
      current:confusion('detected'),baseline:confusion('baselineDetected'),singleFrame:confusion('singleFrameDetected')},clips};
  if(sha(await readFile(resolve(root,'lib/cv/fall-detector.ts')))!==sourceHash)throw new Error('Detector changed during run');
  await writeFile(resolve(out,`vision-${dataset==='urfd'?'development':'holdout'}-${model}.json`),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result.summary));
} finally {await browser.close();}
