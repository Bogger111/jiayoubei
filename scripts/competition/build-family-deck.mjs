import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ArrowRight,ArrowLeft,CheckCircle2} from 'lucide-react';
import ts from 'typescript';
const files={logo:'public/icon-192.png',house:'public/brand/quiet-house.png',family:'public/brand/family-care.png',room:'public/brand/living-room.png',home:'public/evidence/media/care-home.jpg'};
let html=await readFile('presentations/family-agent.template.html','utf8');
for(const [key,path] of Object.entries(files)){const mime=path.endsWith('.jpg')?'image/jpeg':'image/png';html=html.replaceAll('__ASSET:'+key+'__','data:'+mime+';base64,'+(await readFile(path)).toString('base64'))}
for(const [key,Icon] of Object.entries({arrow:ArrowRight,left:ArrowLeft,check:CheckCircle2}))html=html.replaceAll('__ICON:'+key+'__',renderToStaticMarkup(createElement(Icon,{size:24,strokeWidth:1.7,'aria-hidden':true})));
const run=JSON.parse(await readFile('public/evidence/care-run.json','utf8'));
const checks=JSON.parse(await readFile('public/evidence/care-browser-checks.json','utf8'));
const engine=ts.transpileModule(await readFile('lib/care-agent.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^export /gm,'');
html=html.replace('__ENGINE__',engine).replace('__RUN_JSON__',JSON.stringify(run).replaceAll('<','\\u003c')).replace('__BROWSER_JSON__',JSON.stringify(checks).replaceAll('<','\\u003c')).replace('__RUN_COUNT__',String(run.scenarios.length)).replace('__GUARD_COUNT__',String(run.guards.length)).replace('__RUN_DATE__',run.generatedAt.slice(0,10)).replace('__VIDEO__','data:video/webm;base64,'+(await readFile('public/evidence/media/family-agent-run.webm')).toString('base64'));
if(/__(?:ASSET|ICON|RUN|VIDEO|ENGINE|BROWSER)/.test(html))throw new Error('Unresolved deck placeholder');
html=html.replace('</style>','[hidden]{display:none!important}</style>');
await mkdir('public/competition',{recursive:true});
await writeFile('public/competition/index.html',html);await writeFile('家有备-创客比赛.html',html);
await writeFile('presentations/比赛讲稿-家庭协作版.txt',[...html.matchAll(/<section class="slide[^>]*data-title="([^"]+)"[^>]*data-seconds="([^"]+)"[\s\S]*?<aside class="slide-note">([\s\S]*?)<\/aside>/g)].map((m,i)=>`${i+1}. ${m[1]}（${m[2]}秒）\n${m[3]}\n`).join('\n'));
console.log(JSON.stringify({slides:14,talkSeconds:360,demoSeconds:120,bytes:Buffer.byteLength(html),browserChecks:checks.checks.length}));
