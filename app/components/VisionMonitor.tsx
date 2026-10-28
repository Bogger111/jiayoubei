"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Camera,
  CheckCircle2,
  FileVideo,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  Square,
  TriangleAlert,
} from "lucide-react";
import {
  FallDetector,
  type FallObservation,
  type PosePoint,
} from "@/lib/cv/fall-detector";
import { createPoseEngine, type PoseEngine } from "@/lib/cv/pose-engine";
import { VisionRunLog, type VisionRunSummary } from "@/lib/cv/run-log";
import type { VisionRuleEvidence } from "@/lib/cv/report-input";
import VisionEvidence from "./VisionEvidence";
import Pose3DView from "./Pose3DView";
import { productStore } from "@/lib/product-store";
import { AppLink } from "./navigation";
import { PageHeader } from "./ui";

type Source = "camera" | "video";
type Phase = "idle" | "loading" | "running" | "paused" | "ended";
const initialObservation: FallObservation = {
  state: "no_person",
  reason: "选择一种视频输入后开始。",
  torsoAngle: null,
  hipDrop: null,
  calibrationProgress: 0,
  newEvent: false,
};
const status: Record<FallObservation["state"], string> = {
  no_person: "等待清晰的人体姿态",
  calibrating: "正在建立姿态基准",
  tracking: "正在观察姿态",
  possible_fall: "正在复核姿态变化",
  suspected_fall: "疑似摔倒，请人工核实",
};
const segments = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
];
const remainingFrameDelay = (started: number) => Math.max(0, 100 - (performance.now() - started));

function relativeWorldAngle(points: PosePoint[] | undefined) {
  if (
    !points ||
    [11, 12, 23, 24].some(
      (i) =>
        !points[i] ||
        !Number.isFinite(points[i].visibility ?? 1) ||
        (points[i].visibility ?? 1) < 0.5 ||
        !Number.isFinite(points[i].x) ||
        !Number.isFinite(points[i].y) ||
        !Number.isFinite(points[i].z),
    )
  )
    return null;
  const shoulders = {
    x: (points[11].x + points[12].x) / 2,
    y: (points[11].y + points[12].y) / 2,
    z: ((points[11].z ?? 0) + (points[12].z ?? 0)) / 2,
  };
  const hips = {
    x: (points[23].x + points[24].x) / 2,
    y: (points[23].y + points[24].y) / 2,
    z: ((points[23].z ?? 0) + (points[24].z ?? 0)) / 2,
  };
  return Math.round(
    (Math.atan2(
      Math.hypot(shoulders.x - hips.x, shoulders.z - hips.z),
      Math.abs(shoulders.y - hips.y),
    ) *
      180) /
      Math.PI,
  );
}

export default function VisionMonitor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<PoseEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const trajectoryRef = useRef(0);
  const detectorRef = useRef(new FallDetector());
  const runLogRef = useRef<VisionRunLog | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const postingRef = useRef(false);
  const pendingReportsRef = useRef<
    { source: Source; angle: number; drop: number; evidence: VisionRuleEvidence }[]
  >([]);
  const mountedRef = useRef(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [engineMode, setEngineMode] = useState("");
  const [observation, setObservation] = useState(initialObservation);
  const [worldAngle, setWorldAngle] = useState<number | null>(null);
  const [inferenceMs, setInferenceMs] = useState<number | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  const [savedSource, setSavedSource] = useState<Source | null>(null);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [skeletonOnly, setSkeletonOnly] = useState(false);
  const [worldPoints, setWorldPoints] = useState<PosePoint[]>([]);
  const [model, setModel] = useState<"full" | "lite">("lite");
  const [sampleBusy, setSampleBusy] = useState(false);
  const [runSummary, setRunSummary] = useState<VisionRunSummary | null>(null);
  const [runHistory, setRunHistory] = useState<ReturnType<VisionRunLog["recent"]>>([]);
  const updateRunSummary = () => {
    setRunSummary(runLogRef.current?.summary() ?? null);
    setRunHistory(runLogRef.current?.recent() ?? []);
  };
  const exportRun = () => {
    if (!runLogRef.current) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(runLogRef.current.export(), null, 2)], {type:"application/json"}));
    const link = document.createElement("a");
    link.href = url; link.download = "家有备-本机视觉运行记录.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const release = useCallback(() => {
    generationRef.current += 1;
    trajectoryRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    engineRef.current?.dispose();
    engineRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    detectorRef.current.reset();
    lastVideoTimeRef.current = -1;
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      release();
    };
  }, [release]);
  const resetTrajectory = () => {
    runLogRef.current?.interrupt("播放中断或重新校准，连续证据重新计时");
    updateRunSummary();
    trajectoryRef.current += 1;
    detectorRef.current.reset();
    lastVideoTimeRef.current = -1;
    setObservation({
      ...initialObservation,
      reason: "请站立或坐直，重新建立姿态基准。",
    });
    setWorldAngle(null);
    setWorldPoints([]);
  };
  useEffect(() => {
    const visibility = () => {
      runLogRef.current?.interrupt("页面可见性改变，连续证据重新计时");
      trajectoryRef.current += 1;
      detectorRef.current.reset();
      lastVideoTimeRef.current = -1;
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  const stop = () => {
    runLogRef.current?.interrupt("检测已停止，输入资源已释放");
    updateRunSummary();
    release();
    setPhase("idle");
    setObservation(initialObservation);
    setWorldAngle(null);
    setInferenceMs(null);
    setSource(null);
    setEngineMode("");
    setWorldPoints([]);
  };

  const draw = (points: PosePoint[] | undefined) => {
    const video = videoRef.current,
      canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (
      canvas.width !== video.videoWidth ||
      canvas.height !== video.videoHeight
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!points) return;
    context.lineWidth = Math.max(2, canvas.width / 220);
    context.strokeStyle = "#89dfbc";
    context.fillStyle = "#fff";
    const drawable = (point?: PosePoint) =>
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= 0 &&
      point.x <= 1 &&
      point.y >= 0 &&
      point.y <= 1 &&
      Number.isFinite(point.visibility ?? 1) &&
      (point.visibility ?? 1) >= 0.5;
    for (const [a, b] of segments) {
      if (!drawable(points[a]) || !drawable(points[b])) continue;
      context.beginPath();
      context.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
      context.lineTo(points[b].x * canvas.width, points[b].y * canvas.height);
      context.stroke();
    }
    for (const index of [11, 12, 23, 24, 25, 26, 27, 28]) {
      const point = points[index];
      if (!point || !drawable(point)) continue;
      context.beginPath();
      context.arc(
        point.x * canvas.width,
        point.y * canvas.height,
        3,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  };
  const submitReport = async () => {
    if (postingRef.current || !pendingReportsRef.current.length) return;
    postingRef.current = true;
    if (mountedRef.current) setReportError("");
    try {
      while (mountedRef.current && pendingReportsRef.current.length) {
        const pending = pendingReportsRef.current[0];
        const id = await productStore.reportVisionFall(
          pending.source,
          pending.angle,
          pending.drop,
          pending.evidence,
        );
        pendingReportsRef.current.shift();
        if (mountedRef.current) {
          setEventId(id);
          setSavedSource(pending.source);
        }
      }
    } catch {
      if (mountedRef.current)
        setReportError(
          "检测结果尚未保存，请检查连接后重试。切换输入不会丢弃待保存的摘要。",
        );
    } finally {
      postingRef.current = false;
    }
  };
  const loop = async (
    runId: number,
    activeSource: Source,
    timestamp: number,
  ) => {
    if (runId !== generationRef.current) return;
    const video = videoRef.current,
      engine = engineRef.current;
    if (
      video &&
      engine &&
      !document.hidden &&
      !video.paused &&
      !video.seeking &&
      video.readyState >= 2 &&
      video.currentTime !== lastVideoTimeRef.current
    ) {
      const trajectory = trajectoryRef.current;
      const mediaTime = video.currentTime;
      lastVideoTimeRef.current = mediaTime;
      try {
        const frame = await engine.analyze(video, timestamp);
        if (runId !== generationRef.current) return;
        if (
          trajectory === trajectoryRef.current &&
          !video.paused &&
          !video.seeking &&
          !document.hidden
        ) {
          let next: FallObservation;
          if (frame.landmarks.length > 1) {
            detectorRef.current.reset();
            next = {
              ...initialObservation,
              reason: "画面中有多人，请让一人完整进入画面。",
            };
            draw(undefined);
          } else {
            draw(frame.landmarks[0]);
            next = detectorRef.current.update(
              frame.landmarks[0],
              mediaTime * 1000,
              video.videoWidth / video.videoHeight,
            );
          }
          setObservation(next);
          const relativeAngle = frame.landmarks.length === 1 ? relativeWorldAngle(frame.worldLandmarks[0]) : null;
          setWorldAngle(relativeAngle);
          setWorldPoints(frame.landmarks.length === 1 ? frame.worldLandmarks[0] ?? [] : []);
          setInferenceMs(Math.round(frame.inferenceMs));
          runLogRef.current?.add(next, mediaTime * 1000, frame.inferenceMs, frame.landmarks.length, relativeAngle);
          updateRunSummary();
          if (next.newEvent) {
            pendingReportsRef.current.push({
              source: activeSource,
              angle: next.torsoAngle ?? 55,
              drop: next.hipDrop ?? 0.15,
              evidence: { ruleVersion: "torso-relative-v2", hipDropRatio: next.hipDropRatio ?? 0, lowPostureMs: next.lowPostureMs ?? 0 },
            });
            void submitReport();
          }
        }
      } catch (cause) {
        if (runId !== generationRef.current) return;
        stop();
        setError(
          cause instanceof Error ? cause.message : "姿态分析未完成，请重试。",
        );
        return;
      }
    }
    if (runId === generationRef.current)
      timerRef.current = setTimeout(
        () => void loop(runId, activeSource, performance.now()),
        remainingFrameDelay(timestamp),
      );
  };
  const begin = async (nextSource: Source, file?: File) => {
    release();
    const runId = generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    if (!pendingReportsRef.current.length) {
      setReportError("");
      setEventId(null);
      setSavedSource(null);
    }
    setSource(nextSource);
    setSourceName(file?.name ?? "本机摄像头");
    setPhase("loading");
    setObservation(initialObservation);
    setWorldPoints([]);
    runLogRef.current = new VisionRunLog(nextSource, 3600, model);
    updateRunSummary();
    try {
      const video = videoRef.current;
      if (!video) throw new Error("视频画面尚未就绪，请重试。");
      if (nextSource === "camera") {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("摄像头需要在 localhost 或 HTTPS 页面使用。");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (runId !== generationRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        video.controls = false;
        stream.getVideoTracks()[0]?.addEventListener(
          "ended",
          () => {
            if (runId === generationRef.current) {
              stop();
              setError("摄像头已断开，请重新连接后再试。");
            }
          },
          { once: true },
        );
      } else {
        if (
          !file ||
          !(
            file.type.startsWith("video/") ||
            /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)
          )
        )
          throw new Error("请选择浏览器可播放的视频文件。");
        objectUrlRef.current = URL.createObjectURL(file);
        video.src = objectUrlRef.current;
        video.controls = true;
      }
      const engine = await createPoseEngine(controller.signal, model);
      if (runId !== generationRef.current) {
        engine.dispose();
        return;
      }
      engineRef.current = engine;
      setEngineMode(engine.mode);
      await video.play();
      if (runId !== generationRef.current) return;
      setPhase("running");
      void loop(runId, nextSource, performance.now());
    } catch (cause) {
      if (runId !== generationRef.current) return;
      stop();
      const name = cause instanceof DOMException ? cause.name : "";
      setError(
        name === "NotAllowedError"
          ? "没有获得摄像头权限，请允许访问或选择本地视频。"
          : name === "NotFoundError"
            ? "没有找到可用摄像头，可以选择本地视频。"
            : name === "NotReadableError"
              ? "摄像头可能正在被其他应用使用。"
              : cause instanceof Error
                ? cause.message
                : "无法开始检测，请重试。",
      );
    }
  };
  const resultTitle =
    phase === "idle"
      ? "准备开始检测"
      : phase === "loading"
        ? "正在准备检测"
        : phase === "paused"
          ? "视频已暂停"
          : phase === "ended"
            ? "视频分析已结束"
            : status[observation.state];
  const loadSample = async (name: "fall-06" | "adl-04") => {
    if (sampleBusy) return;
    setSampleBusy(true);
    const runId = generationRef.current;
    try {
      const response = await fetch(`/evidence/media/${name}.webm`);
      if (!response.ok) throw new Error("演示素材暂不可用，请选择本地视频。");
      const blob = await response.blob();
      if (!mountedRef.current || runId !== generationRef.current) return;
      await begin("video", new File([blob], `URFD-${name}-学术回放.webm`, {type:"video/webm"}));
    } catch (cause) { if(mountedRef.current && runId === generationRef.current)setError(cause instanceof Error ? cause.message : "素材加载失败"); }
    finally { if(mountedRef.current)setSampleBusy(false); }
  };
  return (
    <div className="cv-page" data-page="jiayoubei-cv" data-engine={engineMode}>
      <PageHeader
        eyebrow="本机视觉监测"
        title="疑似摔倒检测"
        description="在本机观察姿态变化，让需要核实的情况有人跟进。"
      />
      <div className="cv-layout">
        <div className="vision-main-column"><section className="panel cv-main">
          <div className="cv-toolbar">
            <button
              className="btn primary"
              onClick={() => void begin("camera")}
              disabled={phase === "loading"}
            >
              <Camera size={16} />
              开启本机摄像头
            </button>
            <button
              className="btn secondary"
              onClick={() => inputRef.current?.click()}
              disabled={phase === "loading"}
            >
              <FileVideo size={16} />
              选择本地视频
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="video/*,.mp4,.webm,.mov,.m4v"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void begin("video", file);
                event.target.value = "";
              }}
            />
            {phase !== "idle" && (
              <button className="btn quiet" onClick={stop}>
                <Square size={14} />
                停止检测
              </button>
            )}
          </div>
          <label className="vision-privacy-toggle"><input type="checkbox" checked={skeletonOnly} onChange={e=>setSkeletonOnly(e.target.checked)} /><EyeOff size={16}/>只显示骨架，隐藏原始画面</label>
          <div className="vision-input-options"><label>检测模式 <select aria-label="检测模式" value={model} disabled={phase!=="idle"} onChange={e=>setModel(e.target.value as "full"|"lite")}><option value="lite">Lite · 轻量默认</option><option value="full">Full · 模型对照</option></select></label><div><button disabled={sampleBusy||phase==="loading"} onClick={()=>void loadSample("fall-06")}>摔倒片段</button><button disabled={sampleBusy||phase==="loading"} onClick={()=>void loadSample("adl-04")}>弯腰对照</button></div></div>
          <p className="vision-sample-note">示例取自 URFD 学术数据集，属于实验者表演的动作；来源与许可见<a href="/evidence/" target="_blank" rel="noreferrer">实测记录</a>。</p>
          <div className={`cv-stage ${skeletonOnly ? "skeleton-only" : ""}`}>
            <video
              ref={videoRef}
              playsInline
              muted
              aria-label="待分析的视频画面"
              onSeeking={resetTrajectory}
              onPause={() => {
                if (engineRef.current && !videoRef.current?.ended) {
                  resetTrajectory();
                  setPhase("paused");
                }
              }}
              onPlaying={() => {
                if (engineRef.current) setPhase("running");
              }}
              onEnded={() => {
                trajectoryRef.current += 1;
                detectorRef.current.reset();
                lastVideoTimeRef.current = -1;
                setPhase("ended");
              }}
              onError={() => {
                if (abortRef.current && !abortRef.current.signal.aborted) {
                  stop();
                  setError("视频无法解码，请选择另一段视频。");
                }
              }}
            />
            <canvas ref={canvasRef} aria-hidden="true" />
            {phase === "idle" && (
              <div className="cv-placeholder">
                <span className="cv-placeholder-icon">
                  <Activity size={32} strokeWidth={1.5} />
                </span>
                <strong>等待视频输入</strong>
                <span>让一人的肩、髋清晰入镜，尽量保留全身</span>
                <small>镜头保持固定 · 先站立或坐直片刻</small>
              </div>
            )}
            {phase === "loading" && (
              <div className="cv-placeholder">
                <span className="cv-loading-ring" />
                <strong>正在加载真实姿态模型…</strong>
                <span>资源在本机加载，你可以随时停止。</span>
              </div>
            )}
          </div>
          {source && (
            <div className="cv-source">
              <span className={`source-pill ${source}`}>
                <i />
                {source === "camera" ? "本机实时摄像头" : "本地视频回放"}
              </span>
              <span title={sourceName}>{sourceName}</span>
              {phase !== "loading" && (
                <button onClick={resetTrajectory}>
                  <RefreshCw size={13} />
                  重新校准
                </button>
              )}
            </div>
          )}
          <p className="cv-privacy">
            <ShieldCheck size={15} />
            画面与关键点在浏览器内分析，不保存或上传视频。只把触发时的数值写入待核实记录。
          </p>
        </section>{phase === "ended" && <p className="vision-sample-note">回放已结束。保留最后一次已分析姿态与运行记录，供复核；重新播放会重新建立基准。</p>}<VisionEvidence observation={observation} summary={runSummary} history={runHistory} onExport={exportRun} active={phase === "running" || phase === "ended"}/></div>
        <aside className="cv-side">
          <section className={`panel cv-result cv-${observation.state}`}>
            <span className="eyebrow">
              {source === "video" ? "回放检测结果" : "当前检测状态"}
            </span>
            <h2>{resultTitle}</h2>
            <p>
              {phase === "running"
                ? observation.reason
                : phase === "paused"
                  ? "暂停期间不计入连续姿态判断，继续播放后重新建立基准。"
                  : phase === "ended"
                    ? "可以拖回开头重新播放，或选择另一段视频。"
                    : "选择输入后先建立姿态基准，再观察连续变化。"}
            </p>
            <div className="cv-calibration">
              <span>姿态基准</span>
              <strong>
                {observation.calibrationProgress >= 1 ? "已建立" : "等待校准"}
              </strong>
              <div
                role="progressbar"
                aria-label="姿态校准进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(
                  observation.calibrationProgress * 100,
                )}
              >
                <i
                  style={{ width: `${observation.calibrationProgress * 100}%` }}
                />
              </div>
            </div>
            <div className="cv-metric">
              <span>画面躯干倾斜</span>
              <strong>
                {observation.torsoAngle === null
                  ? "—"
                  : `${Math.round(observation.torsoAngle)}°`}
              </strong>
            </div>
            <div className="cv-metric">
              <span>髋部画面下降</span>
              <strong>
                {observation.hipDrop === null
                  ? "—"
                  : `${Math.round(observation.hipDrop * 100)}%`}
              </strong>
            </div>
            <div className="cv-metric">
              <span>相对 3D 躯干角度</span>
              <strong>{worldAngle === null ? "—" : `${worldAngle}°`}</strong>
            </div>
            <small>
              3D 角度辅助观察姿态，不能测量离地高度。
              {inferenceMs !== null && `当前每帧分析约 ${inferenceMs} ms。`}
            </small>
          </section>
          <Pose3DView points={worldPoints}/>
          {eventId && (
            <section className="panel cv-event" role="status">
              <CheckCircle2 size={21} />
              <h2>
                {savedSource === "video"
                  ? "已保存回放验证记录"
                  : "已创建待确认事件"}
              </h2>
              <p>请在关联任务中填写核实结果，再由家庭成员确认完成。</p>
              <AppLink className="btn primary" href={`/events/${eventId}`}>
                查看事件
              </AppLink>
            </section>
          )}
          {reportError && (
            <section className="panel cv-error" role="alert">
              <TriangleAlert size={18} />
              <div>
                {reportError}
                <button
                  className="btn secondary"
                  onClick={() => void submitReport()}
                >
                  重试保存记录
                </button>
              </div>
            </section>
          )}
          {error && (
            <section className="panel cv-error" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
            </section>
          )}
          <section className="panel cv-boundary">
            <h2>怎样使用更清楚</h2>
            <ol>
              <li>固定镜头，让一人全身入镜。</li>
              <li>先站立或坐直片刻，等待基准建立。</li>
              <li>观察连续姿态变化，出现提示后联系本人核实。</li>
            </ol>
            <p>请使用已有许可的视频进行回放验证，不需要现场模拟危险动作。</p>
            <details>
              <summary>了解判断条件与局限</summary>
              <p>
                稳定姿态持续至少 0.8 秒；髋部下降按基准躯干长度归一化，结合快速倾斜与肩部下降，并持续低位至少 0.6 秒后触发人工核实。
              </p>
              <p>
                已进行公开实验视频检查，仍存在明显漏检。遮挡、多人、镜头移动和不同跌倒方向会影响结果，不能作为独立生命安全报警器。
              </p>
            </details>
          </section>
        </aside>
      </div>
    </div>
  );
}
