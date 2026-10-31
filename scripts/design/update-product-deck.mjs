/* Update only the product/evidence slides in the retained 16-slide presentation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const modules=process.env.RUNTIME_NODE_MODULES??'C:/Users/Bogger/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {PresentationFile,FileBlob}=await import(pathToFileURL(path.join(modules,'@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const root=process.cwd(),output=path.join(root,'.care-local/visual-upgrade'),assets=path.join(root,'test-results/visual-upgrade/product');
const source=path.resolve(process.env.JIAYOUBEI_DECK_SOURCE??'deliverables/家有备_多模态家庭助手.pptx');
const p=await PresentationFile.importPptx(await FileBlob.load(source));
const C={bg:'#FAFBFA',ink:'#182A27',green:'#32665C',muted:'#65756D'};
const frame=(x,y,w,h)=>({left:x,top:y,width:w,height:h});
function text(slide,value,x,y,w,h,size=30,color=C.ink,bold=false,align='left'){
 const s=slide.shapes.add({geometry:'textbox',name:'家有备_当前产品_'+value.slice(0,10),position:frame(x,y,w,h),fill:'none',line:{fill:'none',width:0}});
 s.text=value;s.text.style={typeface:'Microsoft YaHei',fontSize:size,color,bold,alignment:align,verticalAlignment:'middle',insets:0,autoFit:'none',wrap:'square'};return s;
}
async function picture(slide,file,x,y,w,h,alt,fit='contain'){
 const sourcePath=path.isAbsolute(file)?file:path.join(assets,file);
 return slide.images.add({blob:new Uint8Array(await fs.readFile(sourcePath)),contentType:/\.jpe?g$/i.test(file)?'image/jpeg':'image/png',position:frame(x,y,w,h),fit,alt,geometry:'roundRect',borderRadius:18});
}
function reset(number,section){
 const slide=p.slides.items[number-1];for(const s of [...slide.shapes.items])slide.shapes.deleteById(s.id);for(const i of [...slide.images.items])slide.images.deleteById(i.id);
 slide.background.fill=C.bg;text(slide,section,1060,44,460,28,17,C.muted,false,'right');text(slide,String(number).padStart(2,'0'),1454,839,66,25,14,C.muted,false,'right');return slide;
}
{
 const s=reset(4,'家庭空间');
 text(s,'把家，\n放进一个\n可交互的空间',82,171,485,247,52,C.ink,true);
 text(s,'房间、家具和设备\n在同一空间里协作',85,488,485,92,27,C.muted);
 text(s,'浏览房间，也能微调每一件家具',88,677,465,70,22,C.green);
 await picture(s,'space-current.png',639,184,863,565,'JYB_VIDEO_SPACE');
 text(s,'点击画面播放空间浏览与家具编辑',800,778,702,31,18,C.muted,false,'right');
 s.speakerNotes.text='这是当前家有备应用的实际空间页面。四个房间、家具和设备控件共用同一份家庭布局。点击右侧可播放本次录制的空间浏览与原生家具编辑。';
}
{
 const s=reset(6,'家庭记忆');
 text(s,'把家庭经历，变成助手记得住的上下文',80,128,1440,92,56,C.ink,true);
 text(s,'从对话保存习惯，沿着时间线回看，也能带着问题找到原始记录',84,237,1425,46,26,C.muted);
 await picture(s,'memory-journal-detail.png',82,318,1436,486,'当前家有备家庭记忆时间线与照片来源');
 s.speakerNotes.text='家庭记忆已经接入应用。这里是隔离演示家庭中实际保存的阅读习惯和照片建模记录。用户可以回看时间线，也可以用自然语言检索相关记录和来源。';
}
{
 const s=reset(8,'家庭助手');
 text(s,'一句话，\n形成完整安排',82,173,520,178,58,C.ink,true);
 text(s,'记住阅读习惯，\n读取设备状态，\n准备灯光与窗帘。',88,409,485,151,29,C.muted);
 text(s,'你看完整计划，再一次确认',88,680,478,61,24,C.green);
 await picture(s,'assistant-tools-detail.png',650,203,870,545,'当前助手实际保存记忆与准备设备计划');
 s.speakerNotes.text='主入口现在是同一个家庭助手。真实模型根据用户的阅读安排，自行调用记忆保存、设备读取和计划工具。右侧是当前应用中的实际结果，确认动作保留在这段对话里。';
}
{
 const s=reset(9,'设备调控');
 text(s,'确认之后，每台设备都有回执',80,128,1440,92,58,C.ink,true);
 text(s,'灯光、窗帘一起安排，执行结果回到同一段对话',84,237,1425,46,26,C.muted);
 await picture(s,'device-receipts-detail.png',84,325,555,473,'当前应用中的逐项设备执行回执');
 await picture(s,'assistant-completed.png',720,328,800,480,'JYB_VIDEO_ASSISTANT');
 text(s,'点击播放：从完整计划到逐项回执',720,292,800,28,18,C.muted,false,'right');
 s.speakerNotes.text='同一个计划可以包含多台设备。确认后，应用逐项执行并回读状态，界面记录成功或失败。画面为本次应用录制，设备来源在实际回执中保留为样例设备。';
}
{
 const s=reset(15,'照片搭建实测');
 text(s,'照片里的家，已经可以编辑',80,128,1440,92,58,C.ink,true);
 text(s,'8 张房间照片生成 1 个房间、15 件家具，随后在对话里微调并保存',84,237,1425,46,26,C.muted);
 const manifest=JSON.parse(await fs.readFile(path.join(root,'public/integrations/room-sample/source.json'),'utf8'));
 text(s,'输入照片',88,316,410,35,21,C.green);
 await picture(s,path.join(root,'public/integrations/room-sample',manifest.files[0]),88,365,420,208,'本次公开房间照片输入之一');
 await picture(s,path.join(root,'public/integrations/room-sample',manifest.files[4]),88,597,420,208,'同一房间的另一视角输入');
 await picture(s,'photo-model-detail.png',580,338,940,460,'JYB_VIDEO_PHOTO');
 text(s,'点击播放：预览、微调家具与保存',650,300,870,28,18,C.muted,false,'right');
 s.speakerNotes.text='照片建模已完成真实模型调用。8 张公开房间照片生成一个房间、15 件家具的布局，生成服务用时 8.35 秒，随后在原生编辑器新增一把办公椅，保存为 16 件家具。右侧播放当前版本应用中的预览、编辑与保存操作。后续将通过家庭试用继续验证产品价值。';
}
await (await PresentationFile.exportPptx(p)).save(path.join(output,'ppt-draft.pptx'));
await fs.writeFile(path.join(output,'ppt-edit-scope.json'),JSON.stringify({source,updatedSlides:[4,6,8,9,15],slides:p.slides.items.length,method:'import retained deck; edit only product/evidence slides; preserve other slides and theme',media:[{slide:4,alt:'JYB_VIDEO_SPACE',file:'space-current.mp4',poster:'space-current.png'},{slide:9,alt:'JYB_VIDEO_ASSISTANT',file:'assistant-current.mp4',poster:'assistant-completed.png'},{slide:15,alt:'JYB_VIDEO_PHOTO',file:'photo-model-current.mp4',poster:'photo-model-detail.png'}]},null,2));
console.log('Updated five product/evidence slides in the retained 16-slide deck.');
