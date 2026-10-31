/* A single new slide, assembled into the retained source using native PowerPoint. */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const modules='C:/Users/Bogger/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {Presentation,PresentationFile}=await import(pathToFileURL(modules+'/@oai/artifact-tool/dist/artifact_tool.mjs').href);
const evidence=JSON.parse(await fs.readFile('test-results/room-video-upgrade/recording-evidence.json','utf8'));
const p=Presentation.create({slideSize:{width:1600,height:900}}),s=p.slides.add();s.background.fill='#FAFBFA';
function text(value,x,y,w,h,size=26,color='#182A27',bold=false,align='left'){
 const shape=s.shapes.add({geometry:'textbox',name:'照片搭建_'+value.slice(0,12),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});shape.text=value;shape.text.style={typeface:'Microsoft YaHei',fontSize:size,color,bold,alignment:align,verticalAlignment:'middle',insets:0,autoFit:'none',wrap:'square'};
}
async function picture(file,x,y,w,h,name,fit='contain'){s.images.add({blob:new Uint8Array(await fs.readFile(file)),contentType:/\.jpe?g$/i.test(file)?'image/jpeg':'image/png',name,alt:name,position:{left:x,top:y,width:w,height:h},fit,geometry:'roundRect',borderRadius:16});}
text('照片搭建实录',1060,44,460,28,17,'#65756D',false,'right');
text('几张照片，\n搭出一个家',80,153,480,185,58,'#182A27',true);
text('照片生成三维布局，\n家具微调后保存。',85,385,455,95,29,'#65756D');
text('本次输入 · 6 张房间照片',85,523,455,32,20,'#32665C');
await picture('public/integrations/tidy-room-sample/01.jpg',85,570,212,145,'同一房间的照片视角一','cover');
await picture('public/integrations/tidy-room-sample/04.jpg',315,570,212,145,'同一房间的照片视角二','cover');
text(`${evidence.initial.config.rooms.length} 个房间 · ${evidence.initial.config.decorations.length} 件家具`,85,748,455,38,24,'#32665C');
await picture('test-results/room-video-upgrade/saved-room-canvas.png',590,176,930,581.25,'JYB_REAL_ROOM_VIDEO');
text('点击播放：照片生成 → 微调家具 → 保存与回看',590,791,930,30,19,'#65756D',false,'right');
text('07',1454,839,66,25,14,'#65756D',false,'right');
s.speakerNotes.text=`本段录屏使用当前家有备前端和实际后台，在独立演示家庭中重新发起真实识图请求。6 张同一房间照片生成 ${evidence.initial.config.rooms.length} 个房间、${evidence.initial.config.decorations.length} 件家具，生成服务用时 ${evidence.initial.seconds} 秒。随后在原生编辑器新增办公椅，将宽度调到 0.75 米、角度调到 45 度，保存为 ${evidence.edited.config.decorations.length} 件家具的家庭空间，并刷新确认保存。片尾从这次已保存的同一布局查看完整空间。`;
await(await PresentationFile.exportPptx(p)).save('.care-local/room-video-upgrade/room-slide.pptx');
console.log('Created the room demonstration slide using the current deck style and actual recording results.');
