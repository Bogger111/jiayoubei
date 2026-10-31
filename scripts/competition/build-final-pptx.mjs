import pptxgen from 'file:///C:/Users/Bogger/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pptxgenjs/dist/pptxgen.es.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {execFileSync} from 'node:child_process';
const out=path.resolve('deliverables'),shots=path.join(out,'demo_screenshots');await mkdir(out,{recursive:true});
const pptx=new pptxgen();pptx.layout='LAYOUT_WIDE';pptx.author='家有备项目组';pptx.subject='创客竞赛 · 产品与技术展示';pptx.title='家有备，让每一次守护都有回应。';pptx.company='家有备';pptx.lang='zh-CN';pptx.theme={headFontFace:'Microsoft YaHei',bodyFontFace:'Microsoft YaHei',lang:'zh-CN'};
const C={navy:'071624',panel:'112A3C',ice:'ABE4EE',blue:'2B709F',ink:'132C41',muted:'6B8194',light:'F5F8FC',line:'DCE6EE',white:'FFFFFF',green:'83BEA9',amber:'EDC08A'};
const W=13.333333,H=7.5,S=pptx.ShapeType;let n=0;const notes=[],layout=[];
const text=(s,t,x,y,w,h,size=22,color=C.ink,extra={})=>{s.addText(t,{x,y,w,h,fontFace:'Microsoft YaHei',fontSize:size,color,margin:0,breakLine:false,paraSpaceAfterPt:0,valign:'mid',fit:'resize',...extra});layout.push({slide:n,type:'text',text:typeof t==='string'?t:'runs',x,y,w,h})};
const rect=(s,x,y,w,h,fill,line=fill,r=0)=>s.addShape(r?S.roundRect:S.rect,{x,y,w,h,rectRadius:r,fill:{color:fill},line:{color:line,width:.6},radius:r});
const line=(s,x,y,w,color=C.line,width=1)=>s.addShape(S.line,{x,y,w,h:0,line:{color,width}});
const arrow=(s,x,y,w,color=C.blue)=>s.addShape(S.line,{x,y,w,h:0,line:{color,width:1.5,beginArrowType:'none',endArrowType:'triangle'}});
const circle=(s,x,y,d,fill,lineColor=fill,transparency=0)=>s.addShape(S.ellipse,{x,y,w:d,h:d,fill:{color:fill,transparency},line:{color:lineColor,width:1}});
const photo=async(s,file,x,y,w,h)=>{const f=path.isAbsolute(file)?file:path.join(shots,file);const bytes=await readFile(f),ratio=bytes.readUInt32BE(16)/bytes.readUInt32BE(20);const iw=Math.min(w,h*ratio),ih=iw/ratio;s.addImage({path:f,x:x+(w-iw)/2,y:y+(h-ih)/2,w:iw,h:ih});layout.push({slide:n,type:'image',x,y,w,h})};
function base(section,dark=false){const s=pptx.addSlide();n++;s.background={color:dark?C.navy:C.light};const ink=dark?C.ice:C.blue;circle(s,.55,.34,.16,ink);text(s,'家有备',.82,.29,1.4,.28,14,dark?C.white:C.ink,{bold:true});text(s,section,9.5,.32,3.22,.23,10,dark?'779BAF':C.muted,{align:'right'});line(s,.58,7.05,12.17,dark?'203D51':C.line,.6);text(s,'JiaYouBei · Intelligent Home Safety & Coordination Agent',.6,7.12,10,.16,8,dark?'5D8299':'8CA0B1');text(s,String(n).padStart(2,'0'),12.3,7.1,.43,.18,9,dark?'759BB0':C.muted,{align:'right'});return s}
function title(s,t,sub='',dark=false){text(s,t,.65,1.02,12,0.75,32,dark?C.white:C.ink,{bold:true,charSpacing:-.7});if(sub)text(s,sub,.68,1.85,11.8,.46,17,dark?'8CAABD':C.muted)}
function note(s,t,seconds){s.addNotes(t);notes.push({number:n,title:s._slideNum?String(n):'',seconds,text:t})}

// 01: a single visual promise.
{
 const s=base('2026 创客竞赛 · 11 月 1 日',true);text(s,'家有备',.72,1.72,5.3,1.18,64,C.white,{bold:true,charSpacing:-2});text(s,'让守护，\n从感知走向行动。',.75,3.11,6,1.35,32,C.ice,{breakLine:false,bold:false,paraSpaceAfterPt:8});text(s,'AI 驱动的家庭安全感知与智能协作系统',.79,4.86,6.1,.52,17,'92B1C4');
 circle(s,7.1,1.08,5.1,C.panel,'24465A');circle(s,7.61,1.59,4.08,C.navy,'35596D');
 const hx=8.42,hy=2.42;const paths=[[hx,hy+.9,1.6,0],[hx,hy+.9,0,1.7],[hx+1.6,hy+.9,0,1.7],[hx,hy+2.6,1.6,0],[hx,hy+.9,.8,-.9],[hx+.8,hy, .8,.9],[hx+1.6,hy+.9,.8,-.25],[hx+2.4,hy+.65,0,1.7],[hx+1.6,hy+2.6,.8,-.25],[hx+.8,hy,.8,-.25],[hx+1.6,hy-.25,.8,.9]];
 for(const[x,y,w,h]of paths)s.addShape(S.line,{x,y:h<0?y+h:y,w,h:Math.abs(h),flipV:h<0,line:{color:C.ice,width:1.7,transparency:10}});
 rect(s,hx+.58,hy+1.65,.5,.95,'143B50','7DB7CA');circle(s,hx+.9,hy+1.3,.12,C.amber);text(s,'感知',7.17,2.11,1,.35,14,'A9D4E1');text(s,'判断',11.35,3.03,1,.35,14,'A9D4E1');text(s,'协作',8.02,5.63,1.4,.35,14,'A9D4E1');
 note(s,'大家好，我们的项目是家有备。我们希望让异地家庭在发现异常之后，不只多收到一条提醒，还能把下一步安排给合适的人，并跟到明确的回应。',15);
}
// 02: an understandable first thirty seconds.
{
 const s=base('为什么需要家有备');text(s,'消息发出去了，\n下一步呢？',.72,1.48,7,1.7,43,C.ink,{bold:true,paraSpaceAfterPt:10});text(s,'妈妈独自在家。\n你，在另一座城市。',.77,3.62,6,1.05,24,C.muted,{paraSpaceAfterPt:10});
 rect(s,8,1.42,4.5,4.5,C.white,C.line,.2);text(s,'14:30',8.35,1.78,3,.5,29,C.blue);text(s,'妈妈',8.37,2.43,3,.35,19,C.ink,{bold:true});line(s,8.37,3,3.7);rect(s,8.5,3.33,3.15,.65,'EAF2FB');text(s,'妈，午饭吃了吗？',8.7,3.47,2.8,.28,16,C.blue);rect(s,8.5,4.2,3.15,.65,'F0F4F8');text(s,'再打一个电话？谁去看看？',8.69,4.35,2.9,.27,14,C.muted);text(s,'信息分散 · 分工临时 · 跟进没有着落',.8,5.72,10.7,.48,19,C.blue);
 note(s,'从一个常见的家庭场景开始。子女发了消息，父母没有回应。可能只是午休，也可能需要关心。此时设备信息分散在各处，谁先联系、联系不到怎么办、最后是否核实，往往需要家人临时协调。',25);
}
// 03: the promise becomes a chain.
{
 const s=base('产品价值',true);title(s,'从发现异常，到家人共同完成处理。','让一次提醒，接上完整的家庭响应。',true);
 const items=[['感知异常','视觉与设备线索'],['理解情况','汇合时间与上下文'],['协作响应','家人确认后分工'],['明确结果','核实、停止与留痕']];
 items.forEach(([a,b],i)=>{const x=.8+i*3.15;circle(s,x,3.2,.62,i===3?'87C7B1':C.ice);text(s,String(i+1).padStart(2,'0'),x+.11,3.33,.4,.24,15,C.navy,{bold:true});text(s,a,x,4.04,2.6,.5,25,C.white,{bold:true});text(s,b,x,4.76,2.7,.4,16,'86A8BD');if(i<3)arrow(s,x+.9,3.52,1.8,'4F7F97')});
 text(s,'家人有决定权，系统有执行与跟进能力。',.85,6.15,11.7,.45,22,C.ice);
 note(s,'家有备把这件事接成四步：看见异常，结合家庭状态理解情况，经家人确认后协作响应，最后用明确结果结束跟进。产品价值是让关心落到人、落到动作，而不是让家庭多维护几个信息入口。',20);
}
// 04: actual product showcase.
{
 const s=base('产品全景',true);text(s,'一个家的状态，一条共同响应。',.7,1.03,12,.75,34,C.white,{bold:true});await photo(s,'15-全景核心区域.png',.74,2.12,11.85,4.53);text(s,'最终运行界面 · 家庭 / 感知 / 计划 / 进度',.78,6.72,11,.2,10,'77A5BD');
 note(s,'这是最终运行的家庭总览。左侧是姿态与时序线索，右侧是家庭行动，底部显示完整处理工作流。成员、环境、设备和任务处在同一个家庭上下文中，事件变化会同步到计划和流程节点。',20);
}
// 05: editable system architecture.
{
 const s=base('技术核心');title(s,'家庭状态，是所有行动的共同上下文。','Perception → World State → Intelligence → Authorization → Execution');
 const rows=[['01','环境感知','端侧姿态 · 活动与门磁 · 家人回应'],['02','家庭状态','事件时间 · 来源质量 · 成员与设备状态'],['03','理解与规划','结构化证据 · 条件编排 · 建议行动'],['04','授权判断','当前事件 · 批准版本 · 家人角色'],['05','执行与反馈','设备适配 · 联系任务 · 结果与审计']];
 rows.forEach(([num,a,b],i)=>{const y=2.55+i*.68;rect(s,.82,y,11.65,.54,i===1?'E3EFF8':C.white);text(s,num,1.04,y+.13,.5,.25,13,C.blue);text(s,a,1.8,y+.09,2.7,.34,19,C.ink,{bold:i===1});text(s,b,5.08,y+.12,6.8,.28,16,C.muted)});
 text(s,'结果回流到家庭状态，决定继续、调整或结束。',.9,6.35,11.7,.4,19,C.blue);
 note(s,'技术核心是统一家庭状态。感知层提供线索，状态层保留来源、时间和对象，规划层整理行动，授权层检查本次批准与角色，执行层记录设备和家庭任务的结果。我们把模型的感知能力与可检查的规则编排组合起来，关键决策始终可核对。',30);
}
// 06: actual local pose output with a large image.
{
 const s=base('创新一 · 端侧视觉',true);text(s,'看见变化，\n主动安排核实。',.7,1.4,4.8,1.4,32,C.white,{bold:true});await photo(s,'10-端侧姿态.png',5.33,1.5,7.3,5.04);
 text(s,'34',.78,3.44,3,1.05,52,C.ice);text(s,'帧本地模型关键点',.84,4.49,5.5,.4,20,'A1BDCE');text(s,'骨架可视化 · 姿态时序\n异常线索自动进入协作流程',.84,5.25,4.45,.8,16,'84A9BF');text(s,'公开动作样例 · 本地推理输出回放',.84,6.32,5.5,.3,10,'678DA5');
 note(s,'左侧数字来自本次本地姿态模型实际输出的三十四帧。右侧展示关键点、躯干倾角和时序变化。为了稳定复现，现场回放模型输出，并重新运行同一套时序规则。姿态线索触发的是人工核实流程，不把单帧姿态当作最终情况。',25);
}
// 07: workflow, with native editable sequence.
{
 const s=base('创新二 · 事件驱动',true);title(s,'每一步为什么发生，都看得见。','一条事件驱动的工作流，连接证据、计划和反馈。',true);
 await photo(s,'11-Agent工作流.png',.72,2.66,11.9,1.35);
 const boxes=[['事件','姿态异常线索进入'],['依据','回应与设备状态汇合'],['行动','生成待批准联系计划']];boxes.forEach(([a,b],i)=>{const x=.9+i*4.15;text(s,a,x,4.58,2.7,.4,23,C.ice,{bold:true});text(s,b,x,5.26,3.8,.45,17,'8BAEC3');if(i<2)arrow(s,x+3.28,4.83,.45,'507D95')});
 text(s,'流程节点随真实操作更新，结果决定下一步。',.92,6.27,11.5,.42,18,'A5C4D5');
 note(s,'这条工作流随实际状态变化点亮。感知事件进入后，系统合并回应和设备上下文，形成待批准计划；批准、接手和结果返回会继续更新节点。这里展示的是可复核的处理依据和结构化步骤，不是隐藏思考过程的表演。',25);
}
// 08: authorization and collaboration.
{
 const s=base('创新三 · 人机协作');title(s,'你来确认，家有备把安排接下去。','批准、接手和核实，是三个分别记录的动作。');
 await photo(s,'13-协作任务.png',8.2,2.35,4.25,4.3);
 const steps=[['家人批准','确认这次安排，绑定当前事件'],['联系人接手','谁负责、何时接手，家人都知道'],['明确核实','未联系到继续，收到结果才结束']];steps.forEach(([a,b],i)=>{const y=2.62+i*1.16;text(s,String(i+1).padStart(2,'0'),.9,y,.6,.35,14,C.blue);text(s,a,1.75,y-.03,5.7,.45,24,C.ink,{bold:true});text(s,b,1.76,y+.56,5.9,.4,17,C.muted);if(i<2)line(s,1.76,y+1.02,5.2)});
 note(s,'人机协作分清三件事。批准表示家人同意这次安排，创建任务还不表示有人接手。联系人用自己的身份接下任务，仍要继续核实。未联系到时保留跟进；只有明确核实的结果才停止后续联系。备用门口场景也会展示同样的授权原则。',30);
}
// 09: embedded real recording, plus relative links to runnable offline files.
{
 const s=base('现场 Demo',true);text(s,'现在，看一次完整响应。',.68,.92,12,.68,35,C.white,{bold:true});text(s,'发现线索 → 家人批准 → 联系人接手 → 明确核实 → 全程留痕',.73,1.73,11.8,.4,17,'8CB2C7');
 const cover='data:image/png;base64,'+(await readFile(path.join(shots,'03-Agent形成计划.png'))).toString('base64');
 s.addMedia({type:'video',path:path.join(out,'demo.mp4'),cover,x:3.54,y:2.18,w:7.08,h:4.78});
 text(s,'播放内嵌录像',.77,2.72,2.06,.48,19,C.ice,{bold:true});text(s,'约 60 秒\n软件演示场景',.8,3.35,2.05,.8,15,'79A5BD',{breakLine:false});
 text(s,'打开离线 Demo ↗',.8,5.27,2.05,.4,14,C.ice,{hyperlink:{url:'demo/index.html'},underline:true});text(s,'单独播放视频 ↗',.8,5.85,2.05,.4,14,C.ice,{hyperlink:{url:'demo.mp4'},underline:true});
 note(s,'现场演示控制在九十秒。可以直接点击内嵌视频，或者打开本地离线演示。先看正常家庭状态，再由姿态回放触发计划，子女批准，切换联系人接手；先记录未联系到，再明确核实，最后看审计时间线。录像包含相同的真实界面操作和角色边界检查。',90);
}
// 10: capabilities, not a feature dump.
{
 const s=base('产品能力');title(s,'一个家庭空间，连接六类关键能力。','从异地照护出发，覆盖家庭协作需要的核心环节。');
 const capabilities=[['感知','姿态 · 活动 · 区域事件'],['理解','家庭上下文 · 时序依据'],['表达','中文意图 · 家庭工具'],['协作','联系计划 · 接手与结果'],['授权','本次确认 · 角色边界'],['留痕','事件时间线 · 处理记录']];
 capabilities.forEach(([a,b],i)=>{const x=.9+(i%3)*4.15,y=2.74+Math.floor(i/3)*1.77;line(s,x,y-.15,3.5);text(s,String(i+1).padStart(2,'0'),x,y+.12,.55,.3,12,C.blue);text(s,a,x+.85,y+.05,2.65,.5,28,C.ink,{bold:true});text(s,b,x+.04,y+.91,3.8,.4,17,C.muted)});
 note(s,'完整产品保留六类能力：感知、理解、表达、协作、授权和留痕。它们都围绕同一个家庭事件组织。已有的动态、中文安排与工具对话也能在产品体验页操作，核心路演则聚焦一条连续的照护流程。',20);
}
// 11: a precise comparison of workflow deliverables.
{
 const s=base('差异化');title(s,'把分散能力，接成家庭协作闭环。','我们的产品交付，是一件家庭事件的持续处理。');
 const rows=[['事件报警','发现某个异常','一条告警或事件记录'],['设备自动化','条件触发设备','一次设备动作'],['对话问答','理解用户表达','一段答案或工具结果'],['家有备','围绕同一家庭事件','依据 → 批准 → 分工 → 核实 → 留痕']];
 const table=[[{text:'工作方式'},{text:'主要关注'},{text:'典型交付'}],...rows.map((r,i)=>r.map(t=>({text:t,options:{bold:i===3,color:i===3?C.blue:C.ink,fill:i===3?'E7F1FA':C.white}})))];
 s.addTable(table,{x:.82,y:2.6,w:11.7,h:3.35,colW:[2.1,3.05,6.55],rowH:.65,fontFace:'Microsoft YaHei',fontSize:17,color:C.ink,border:{type:'solid',color:C.line,pt:.6},margin:[.13,.18,.13,.18],fill:C.white,autoPage:false,bold:false});
 text(s,'把关心落到负责人，把处理跟到明确结果。',.94,6.33,11.5,.4,21,C.blue);
 note(s,'这张表比较的是几种工作方式的典型交付，不是断言所有摄像头或平台都缺少某个能力。家有备选择把同一家庭事件作为产品单位，将依据、批准、分工、核实和记录连起来。这个持续处理过程，是我们希望做深的差异。',25);
}
// 12: evidence that can be traced back to files.
{
 const s=base('实践验证');title(s,'展示背后，有程序运行记录。','从模型输出，到处理结果，都能回到实际文件。');
 const record=JSON.parse(await readFile('public/evidence/showcase-checks.json','utf8'));const values=[['34','帧本地姿态输出'],[String(record.checks.length),'项核心演示检查'],['22','项持久化协作接口检查']];
 values.forEach(([a,b],i)=>{const x=.85+i*4.15;text(s,a,x,2.68,3.4,1.1,58,C.blue);text(s,b,x+.03,3.95,3.7,.45,18,C.muted)});
 line(s,.9,4.78,11.55);text(s,'断网完整演示',.95,5.15,3.5,.5,23,C.ink,{bold:true});text(s,'状态恢复与角色约束',4.97,5.15,3.8,.5,23,C.ink,{bold:true});text(s,'事件结果可复核',9.1,5.15,3.6,.5,23,C.ink,{bold:true});text(s,'独立 HTML 与内嵌视频',.98,5.96,3.5,.38,16,C.muted);text(s,'刷新恢复 · 误操作拦截',5,5.96,3.8,.38,16,C.muted);text(s,'本次事件记录与审计',9.13,5.96,3.6,.38,16,C.muted);
 note(s,'这页展示真实软件成果。三十四帧是本次本地模型输出，核心演示检查来自断网浏览器回归，二十二项是既有认证与持久化协作接口检查。它们证明软件路径和约束可复现，不是家庭样本数或识别准确率。模型输出、完整录像、处理记录和截图都随交付保留。',25);
}
// 13: commercial path and grounded roadmap.
{
 const s=base('商业路径与成长空间');title(s,'先服务好，需要共同照顾的家庭。','子女为父母购买家庭订阅，优先接入已有设备。');
 const roadmap=[['现在','可重复的\n家庭照护体验','感知线索＋可解释安排＋家庭协作'],['下一步','验证真实家庭\n的使用价值','访谈与小范围试用，观察协调负担'],['长期','全方位的\n家庭协作 Agent','连接更多设备、日程与社区联系人']];
 roadmap.forEach(([a,b,c],i)=>{const x=.94+i*4.13;circle(s,x,2.9,.28,i===0?C.blue:'C6D7E5');if(i<2)line(s,x+.5,3.04,3.3,'B9CEDF');text(s,a,x,3.55,3.5,.4,16,C.blue);text(s,b,x,4.23,3.5,.9,24,C.ink,{bold:true});text(s,c,x,5.61,3.65,.7,16,C.muted)});
 note(s,'首批用户聚焦异地照护家庭，商业方向是子女为父母购买家庭订阅，优先连接已有设备。下一步通过真实访谈和小范围试用验证协调负担是否降低，再确定定价与渠道。长期从照护延伸到日常家庭安排和社区协作。这是商业验证路径，目前不把计划说成已有用户或订单。',25);
}
// 14: the product promise, with no report-style conclusion.
{
 const s=base('谢谢 · 欢迎交流',true);text(s,'家有备，',.84,1.6,11.7,1,58,C.white,{bold:true});text(s,'让每一次守护\n都有回应。',.84,2.83,11.6,2.1,53,C.ice,{bold:true,paraSpaceAfterPt:10});text(s,'从感知，到行动；从一个人牵挂，到一家人协作。',.91,5.73,11.65,.55,22,'85B0C6');
 note(s,'家有备，让每一次守护都有回应。谢谢大家。',10);
}
await pptx.writeFile({fileName:path.join(out,'家有备_创客大赛_终版.pptx')});
execFileSync('python',['scripts/competition/normalize-office-package.py',path.join(out,'家有备_创客大赛_终版.pptx')],{stdio:'inherit'});
await writeFile('test-results/final-sprint/ppt-layout.json',JSON.stringify({slides:n,size:[W,H],font:'Microsoft YaHei',objects:layout},null,2));
await writeFile('test-results/final-sprint/speaker-notes.json',JSON.stringify(notes,null,2));
console.log(JSON.stringify({slides:n,talkSeconds:notes.reduce((s,x)=>s+x.seconds,0),editable:true,videoEmbedded:true,file:path.join(out,'家有备_创客大赛_终版.pptx')}));
