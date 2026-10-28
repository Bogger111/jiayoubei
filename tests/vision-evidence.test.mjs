import test from 'node:test';
import assert from 'node:assert/strict';
import {VisionRunLog} from '../lib/cv/run-log.ts';
import {validVisionReport} from '../lib/cv/report-input.ts';
test('new calibrated evidence accepts smaller screen descent and rejects missing or invalid evidence',()=>{
  const report={source:'video',torsoAngle:40,hipDrop:.1,ruleVersion:'torso-relative-v2',hipDropRatio:.7,lowPostureMs:600};
  assert.equal(validVisionReport(report),true);
  for(const patch of [{hipDropRatio:.5},{hipDropRatio:Infinity},{lowPostureMs:500},{lowPostureMs:NaN},{ruleVersion:'unknown'},{hipDrop:0},{torsoAngle:91}])assert.equal(validVisionReport({...report,...patch}),false);
  assert.equal(validVisionReport({source:'camera',torsoAngle:60,hipDrop:.2}),true);
  assert.equal(validVisionReport({source:'video',torsoAngle:40,hipDrop:.1}),false);
});
test('run logs bound memory, keep total event count and omit raw points and media',()=>{
  const log=new VisionRunLog('video',3);
  const obs={state:'tracking',reason:'observed',torsoAngle:10,hipDrop:0,calibrationProgress:1,newEvent:false};
  for(let i=0;i<5;i++)log.add({...obs,newEvent:i===0},i*100,10+i,1,12);
  log.interrupt('seek');const data=log.export();
  assert.equal(data.summary.frames,5);assert.equal(data.samples.length,3);assert.equal(data.summary.events,1);assert.equal(data.truncated,true);assert.equal(data.summary.interrupted,1);
  assert.equal(data.summary.p50Ms,13);assert.equal(data.summary.p95Ms,14);
  assert.equal('landmarks' in data,false);assert.equal('video' in data,false);
  log.add(obs,NaN,1,1,null);assert.equal(log.summary().frames,5);
});
