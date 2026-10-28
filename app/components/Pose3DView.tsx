"use client";
import { useEffect, useRef, useState } from "react";
import type { PosePoint } from "@/lib/cv/fall-detector";
const edges = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];

export default function Pose3DView({points}:{points:PosePoint[]}) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [yaw,setYaw]=useState(35);
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    canvas.width=640;canvas.height=440;
    ctx.clearRect(0,0,640,440);
    const visible=(p:PosePoint|undefined)=>p && [p.x,p.y,p.z].every(Number.isFinite) && (p.visibility??1)>=.5;
    const angle=yaw*Math.PI/180;
    const project=(p:PosePoint)=>[320+(p.x*Math.cos(angle)+(p.z??0)*Math.sin(angle))*220,235+p.y*220];
    ctx.strokeStyle="#dbe5dd";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(100,235);ctx.lineTo(540,235);ctx.moveTo(320,45);ctx.lineTo(320,420);ctx.stroke();
    ctx.fillStyle="#60766d";ctx.font="18px Microsoft YaHei, sans-serif";ctx.fillText("髋部原点",330,257);
    for(const [a,b] of edges){
      if(!visible(points[a]) || !visible(points[b]))continue;
      const [x,y]=project(points[a]),[x2,y2]=project(points[b]);
      ctx.strokeStyle=a<23?"#227567":"#a2804c";ctx.lineWidth=5;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();
    }
    for(const index of new Set(edges.flat())){
      if(!visible(points[index]))continue;
      const [x,y]=project(points[index]);ctx.fillStyle="#193e36";
      ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();
    }
    if(!points.length){ctx.fillStyle="#60766d";ctx.textAlign="center";ctx.fillText("检测开始后显示实际 3D 关键点",320,170);}
  },[points,yaw]);
  return <section className="vision-3d" aria-label="相对三维姿态观察">
    <div className="vision-section-title"><strong>相对 3D 姿态</strong><span>实际模型输出</span></div>
    <canvas ref={canvasRef} role="img" aria-label="以髋部为原点的三维人体骨架投影" />
    <label>观察方向 <input aria-label="三维骨架观察方向" type="range" min="-90" max="90" step="5" value={yaw} onChange={e=>setYaw(Number(e.target.value))} /><span>{yaw}°</span></label>
    <p>拖动查看身体姿态。坐标随人体移动，不代表房间位置，也不参与当前告警判断。</p>
  </section>;
}
