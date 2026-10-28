"use client";
import { Download, Check, Minus } from "lucide-react";
import type { FallObservation } from "@/lib/cv/fall-detector";
import type { VisionRunSummary } from "@/lib/cv/run-log";

export default function VisionEvidence({observation,summary,history,onExport,active}:{observation:FallObservation;summary:VisionRunSummary|null;history:{frame:number;mediaMs:number;text:string}[];onExport:()=>void;active:boolean}){
  const gates=[
    ["姿态基准", "站立或坐直 ≥ 0.8 秒",active && observation.calibrationProgress>=1],
    ["起始倾斜", "转变开始时画面倾角 ≥ 55°",active && ((observation.torsoAngle!==null && observation.torsoAngle>=55)||observation.state==='possible_fall'||observation.state==='suspected_fall')],
    ["姿态下降", "髋部下降 ≥ 基准躯干的 0.6 倍",active && (observation.hipDropRatio ?? 0)>=.6],
    ["持续复核", "快速转变后低位保持 ≥ 0.6 秒",active && observation.state==='suspected_fall'],
  ] as const;
  return <section className="panel vision-evidence">
    <div className="vision-section-title"><h2>为什么出现提示</h2><span>连续证据，共同判断</span></div>
    <div className="vision-gates">{gates.map(([title,description,met])=><div key={title} className={met?'met':''}>
      {met?<Check size={16}/>:<Minus size={16}/>}<strong>{title}</strong><small>{description}</small><span>{met?'已满足':'等待证据'}</span>
    </div>)}</div>
    {summary && summary.frames>0 && <>
      <div className="vision-run-summary"><span><strong>{summary.frames}</strong> 已分析帧</span><span><strong>{summary.events}</strong> 次规则触发</span><span><strong>{summary.p50Ms?.toFixed(0)} ms</strong> 推理中位耗时</span><button className="btn secondary" onClick={onExport}><Download size={15}/>导出本次运行</button></div>
      <ol className="vision-history">{history.map((item,index)=><li key={`${item.frame}-${index}`}><time>{(item.mediaMs/1000).toFixed(1)}s</time><span>{item.text}</span></li>)}</ol>
      <p className="vision-run-note">时间对应输入视频。导出仅包含数值与状态，不含视频和原始关键点；最多保留最近 3,600 帧，耗时统计基于保留帧。规则触发次数不等于真实事故数。</p>
    </>}
  </section>;
}
