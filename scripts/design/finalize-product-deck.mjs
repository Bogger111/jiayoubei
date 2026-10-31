import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),skill='C:/Users/Bogger/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations';
process.env.RUNTIME_NODE_MODULES??='C:/Users/Bogger/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const source=path.resolve(process.env.JIAYOUBEI_DECK_SOURCE??'deliverables/家有备_多模态家庭助手.pptx'),finalPath=path.resolve(process.argv[2]??'deliverables/家有备_多模态家庭助手.pptx');
execFileSync('C:/Users/Bogger/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',[path.join(root,'scripts/competition/normalize-office-package.py'),path.join(root,'.care-local/visual-upgrade/ppt-candidate.pptx')],{cwd:root,stdio:'pipe'});
const result=await finalizePresentation({workspaceDir:root,candidatePath:path.join(root,'.care-local/visual-upgrade/ppt-candidate.pptx'),finalPath,
 pythonExecutable:'C:/Users/Bogger/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-bullet-geometry','--validate-heading-fit'],explicitTotalSlideCount:16,
 requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],fontPolicy:{basis:'reference',families:['Microsoft YaHei'],referencePath:source,referenceSha256:createHash('sha256').update(await fs.readFile(source)).digest('hex')},
 verifyArtifactToolImport:true,receiptPath:path.join(root,'.care-local/visual-upgrade/ppt-final-validation.json')});
await fs.copyFile(path.join(root,'.care-local/visual-upgrade/ppt-preview.pdf'),path.join(path.dirname(finalPath),'家有备_静态预览.pdf'));
console.log(JSON.stringify({finalPath,status:result.status??'validated'}));
