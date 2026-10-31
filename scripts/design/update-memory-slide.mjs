/* Author one replacement slide. The native assembly preserves all other pages. */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const modules='C:/Users/Bogger/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {Presentation,PresentationFile}=await import(pathToFileURL(modules+'/@oai/artifact-tool/dist/artifact_tool.mjs').href);
const p=Presentation.create({slideSize:{width:1600,height:900}}),s=p.slides.add();s.background.fill='#FAFBFA';
function text(value,x,y,w,h,size,color='#182A27',bold=false,align='left'){
 const shape=s.shapes.add({geometry:'textbox',name:'家庭记忆_'+value.slice(0,12),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 shape.text=value;shape.text.style={typeface:'Microsoft YaHei',fontSize:size,color,bold,alignment:align,verticalAlignment:'middle',insets:0,autoFit:'none',wrap:'square'};
}
text('家庭记忆',1060,44,460,28,17,'#65756D',false,'right');
text('把家庭经历，变成助手记得住的上下文',80,128,1440,92,56,'#182A27',true);
text('记住家人的习惯，也让每一条约定都能随时更新',84,237,1425,46,26,'#65756D');
s.images.add({blob:new Uint8Array(await fs.readFile('test-results/memory-room-upgrade/memory-editable-page.png')),contentType:'image/png',position:{left:82,top:323,width:1436,height:480},fit:'contain',alt:'当前家有备记忆页：习惯与约定支持编辑保存'});
text('06',1454,839,66,25,14,'#65756D',false,'right');
s.speakerNotes.text='当前家有备应用的家庭记忆界面。家庭动态与习惯约定均已支持修改原记录并保存；已通过实际页面操作验证刷新后保留，并能在后续记忆检索中读取修改后的内容。截图来自隔离演示家庭中的已录入约定。';
await (await PresentationFile.exportPptx(p)).save('.care-local/memory-room-upgrade/memory-slide.pptx');
console.log('Authored one editable memory slide using the retained deck’s visual style.');
