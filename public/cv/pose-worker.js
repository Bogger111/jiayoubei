/* global importScripts, Vision */
// Classic worker is required by MediaPipe's WASM loader (importScripts).
importScripts("/cv/vision_bundle.js");
let landmarker;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const fileset = await Vision.FilesetResolver.forVisionTasks(`${self.location.origin}/cv/wasm`);
      landmarker = await Vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${self.location.origin}/cv/pose_landmarker_lite.task`, delegate: "CPU" },
        runningMode: "VIDEO", numPoses: 2, minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.5,
      });
      self.postMessage({ id: data.id, type: "ready" });
    } else if (data.type === "frame") {
      const started = performance.now();
      try {
        const result = landmarker.detectForVideo(data.image, data.timestamp);
        self.postMessage({ id: data.id, type: "result", landmarks: result.landmarks, worldLandmarks: result.worldLandmarks, inferenceMs: performance.now() - started });
      } finally { data.image.close(); }
    }
  } catch (cause) {
    self.postMessage({ id: data.id, type: "error", message: cause instanceof Error ? cause.message : "姿态分析未完成" });
  }
};
