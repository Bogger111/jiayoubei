import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
test('report separates replay from independent samples and never invents a zero-denominator recall',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jiayoubei-care-report-'));
 try{
  const original={recordId:'r1',datasetId:'d1',sourceRecordId:'source1',sampleId:'sequence1',householdId:'ANON1',category:'bench',transport:'live',occurredAt:'2026-10-28T06:00:00Z',eventKind:'sequence',metrics:{}};
  const replay={...original,recordId:'r2',transport:'replay'};
  const input=join(root,'input.jsonl');await writeFile(input,[original,replay].map(r=>JSON.stringify(r)).join('\n'));
  execFileSync(process.execPath,['scripts/care/build-evidence-report.mjs','--input',input,'--output',root],{encoding:'utf-8',stdio:'pipe'});
  const report=JSON.parse(await readFile(join(root,'evidence/care-p0-summary.json'),'utf8'));
  assert.equal(report.collection.categories.bench.samples,1);assert.equal(report.collection.duplicateImports,1);assert.equal(report.collection.categories.field.households,0);assert.equal(report.collection.recall.value,null);assert.equal(report.collection.recall.status,'不可估计');
  assert.equal(report.collection.coordination.baseline.activeCoordinationSeconds,null);assert.equal(report.collection.coordination.jiayoubei.totalElapsedSeconds,null);
  const exposure={...original,category:'field',eventKind:'usage_interval',exposureStartAt:'2026-10-28T00:00:00Z',exposureEndAt:'2026-10-28T12:00:00Z'};
  await writeFile(input,[exposure,{...exposure,sourceRecordId:'other-overlapping',recordId:'other'}].map(r=>JSON.stringify(r)).join('\n'));
  execFileSync(process.execPath,['scripts/care/build-evidence-report.mjs','--input',input,'--output',root],{stdio:'pipe'});
  const measured=JSON.parse(await readFile(join(root,'evidence/care-p0-summary.json'),'utf8'));assert.equal(measured.collection.categories.field.householdDays,.5);assert.equal(measured.collection.categories.field.households,1);
  await writeFile(input,[original,{...replay,category:'field'}].map(r=>JSON.stringify(r)).join('\n'));
  assert.throws(()=>execFileSync(process.execPath,['scripts/care/build-evidence-report.mjs','--input',input,'--output',root],{stdio:'pipe'}));
 }finally{if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith('jiayoubei-care-report-'))throw new Error('Unexpected cleanup path');await rm(root,{recursive:true,force:true})}
});
