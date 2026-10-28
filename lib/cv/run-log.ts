import type { FallObservation } from "./fall-detector";

export type VisionSample = {
  frame: number;
  mediaMs: number;
  state: FallObservation["state"];
  reason: string;
  angle: number | null;
  drop: number | null;
  worldAngle: number | null;
  inferenceMs: number;
  people: number;
  event: boolean;
};
export type VisionRunSummary = {
  frames: number;
  events: number;
  p50Ms: number | null;
  p95Ms: number | null;
  retainedFrames: number;
  interrupted: number;
};
const round = (value: number | null) => value === null ? null : Math.round(value * 100) / 100;
export class VisionRunLog {
  private samples: VisionSample[] = [];
  private transitions: { frame: number; mediaMs: number; text: string }[] = [];
  private total = 0;
  private events = 0;
  private interrupts = 0;
  private startedAt: string;
  private lastState = "";
  private source: "camera" | "video";
  private capacity: number;
  private model: "lite" | "full";
  constructor(source: "camera" | "video", capacity = 3600, model: "lite" | "full" = "lite") {
    this.source = source;
    this.capacity = capacity;
    this.model = model;
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Invalid log capacity");
    this.startedAt = new Date().toISOString();
  }
  add(observation: FallObservation, mediaMs: number, inferenceMs: number, people: number, worldAngle: number | null) {
    if (!Number.isFinite(mediaMs) || !Number.isFinite(inferenceMs) || mediaMs < 0 || inferenceMs < 0) return;
    this.total += 1;
    if (observation.newEvent) this.events += 1;
    const sample: VisionSample = {frame:this.total,mediaMs:Math.round(mediaMs),state:observation.state,reason:observation.reason,
      angle:round(observation.torsoAngle),drop:round(observation.hipDrop),worldAngle:round(worldAngle),inferenceMs:round(inferenceMs)!,people,event:observation.newEvent};
    this.samples.push(sample);
    if (this.samples.length > this.capacity) this.samples.shift();
    const key = observation.state + observation.reason;
    if (key !== this.lastState) {
      this.transitions.push({frame:this.total,mediaMs:Math.round(mediaMs),text:observation.reason});
      if(this.transitions.length > 120)this.transitions.shift();
      this.lastState = key;
    }
  }
  interrupt(reason: string) {
    this.interrupts += 1;
    this.lastState = "";
    this.transitions.push({frame:this.total,mediaMs:this.samples.at(-1)?.mediaMs ?? 0,text:reason});
    if(this.transitions.length > 120)this.transitions.shift();
  }
  summary(): VisionRunSummary {
    const times = this.samples.map(sample=>sample.inferenceMs).sort((a,b)=>a-b);
    const p = (q:number) => times.length ? times[Math.ceil(times.length*q)-1] : null;
    return {frames:this.total,events:this.events,p50Ms:p(.5),p95Ms:p(.95),retainedFrames:this.samples.length,interrupted:this.interrupts};
  }
  recent() { return this.transitions.slice(-5); }
  export() {
    return {schemaVersion:1,source:this.source,model:this.model,ruleVersion:"torso-relative-v2",startedAt:this.startedAt,exportedAt:new Date().toISOString(),
      scope:"本机检测运行记录；包含姿态数值与状态，不包含视频、姓名或原始关键点。推理耗时不含视频解码和网络耗时。",
      algorithm:"2D 时序规则；相对 3D 仅供观察。",summary:this.summary(),
      truncated:this.total>this.samples.length,sampleLimit:this.capacity,transitions:this.transitions,samples:this.samples};
  }
}
