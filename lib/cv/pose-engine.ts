import type { PosePoint } from "./fall-detector";

export type PoseFrame = {
  landmarks: PosePoint[][];
  worldLandmarks: PosePoint[][];
  inferenceMs: number;
};
export type PoseEngine = {
  mode: "worker" | "main";
  analyze: (video: HTMLVideoElement, timestamp: number) => Promise<PoseFrame>;
  dispose: () => void;
};

function waitForResource<T>(
  resource: Promise<T>,
  signal: AbortSignal,
  deadline: number,
  closeLate?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (cause?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (cause) reject(cause);
    };
    const abort = () => finish(new DOMException("检测已停止", "AbortError"));
    const timer = setTimeout(
      () => finish(new Error("姿态模型加载超时，请停止后重试")),
      Math.max(1, deadline - Date.now()),
    );
    signal.addEventListener("abort", abort, { once: true });
    resource.then(
      (value) => {
        if (settled) {
          closeLate?.(value);
          return;
        }
        finish();
        resolve(value);
      },
      (cause) =>
        finish(cause instanceof Error ? cause : new Error("姿态资源加载失败")),
    );
    if (signal.aborted) abort();
  });
}

async function createWorkerEngine(signal: AbortSignal): Promise<PoseEngine> {
  const worker = new Worker("/cv/pose-worker.js");
  let sequence = 0;
  let disposed = false;
  const pending = new Map<
    number,
    {
      resolve: (result: PoseFrame) => void;
      reject: (cause: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    worker.terminate();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new DOMException("检测已停止", "AbortError"));
    }
    pending.clear();
    signal.removeEventListener("abort", dispose);
  };
  signal.addEventListener("abort", dispose, { once: true });
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(data.id);
    if (data.type === "error") request.reject(new Error(data.message));
    else request.resolve(data);
  };
  worker.onerror = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("无法加载姿态检测资源"));
    }
    pending.clear();
  };
  const request = (
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
    timeout = 8000,
  ) =>
    new Promise<PoseFrame>((resolve, reject) => {
      if (disposed || signal.aborted) {
        reject(new DOMException("检测已停止", "AbortError"));
        return;
      }
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("姿态检测响应超时，请停止后重试"));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      try {
        worker.postMessage({ ...message, id }, transfer);
      } catch (cause) {
        clearTimeout(timer);
        pending.delete(id);
        reject(cause);
      }
    });
  try {
    await request({ type: "init" }, [], 45_000);
    return {
      mode: "worker",
      dispose,
      analyze: async (video, timestamp) => {
        const image = await createImageBitmap(video);
        if (disposed || signal.aborted) {
          image.close();
          throw new DOMException("检测已停止", "AbortError");
        }
        try {
          return await request({ type: "frame", image, timestamp }, [image]);
        } catch (cause) {
          image.close();
          throw cause;
        }
      },
    };
  } catch (cause) {
    dispose();
    throw cause;
  }
}

export async function createPoseEngine(
  signal: AbortSignal,
): Promise<PoseEngine> {
  const deadline = Date.now() + 45_000;
  if (
    typeof Worker !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  ) {
    try {
      return await createWorkerEngine(signal);
    } catch (cause) {
      if (signal.aborted) throw cause;
    }
  }
  const { FilesetResolver, PoseLandmarker } = await waitForResource(
    import("@mediapipe/tasks-vision"),
    signal,
    deadline,
  );
  const fileset = await waitForResource(
    FilesetResolver.forVisionTasks("/cv/wasm"),
    signal,
    deadline,
  );
  const landmarker = await waitForResource(
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/cv/pose_landmarker_lite.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    }),
    signal,
    deadline,
    (late) => late.close(),
  );
  if (signal.aborted) {
    landmarker.close();
    throw new DOMException("检测已停止", "AbortError");
  }
  let disposed = false;
  const dispose = () => {
    if (!disposed) {
      disposed = true;
      landmarker.close();
      signal.removeEventListener("abort", dispose);
    }
  };
  signal.addEventListener("abort", dispose, { once: true });
  return {
    mode: "main",
    dispose,
    analyze: async (video, timestamp) => {
      if (disposed) throw new DOMException("检测已停止", "AbortError");
      const start = performance.now();
      const result = landmarker.detectForVideo(video, timestamp);
      return {
        landmarks: result.landmarks,
        worldLandmarks: result.worldLandmarks,
        inferenceMs: performance.now() - start,
      };
    },
  };
}
