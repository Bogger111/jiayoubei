import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('third_party/manifest.json','utf8'));let count=0;
for(const project of manifest){assert.match(project.commit,/^[a-f0-9]{40}$/);for(const file of project.files){const raw=await readFile(file.local);assert.equal(createHash('sha256').update(raw).digest('hex'),file.sha256,file.local+' no longer matches the pinned source');count++;}}
console.log(JSON.stringify({projects:manifest.length,verifiedFiles:count,modifiedUpstreamFiles:0}));
