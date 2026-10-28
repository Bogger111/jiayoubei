/** Conservative pose trajectory rules; not validated medical measurements. */
export type PosePoint = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};
export type FallObservation = {
  state:
    | "no_person"
    | "calibrating"
    | "tracking"
    | "possible_fall"
    | "suspected_fall";
  reason: string;
  torsoAngle: number | null;
  hipDrop: number | null;
  calibrationProgress: number;
  newEvent: boolean;
  hipDropRatio?: number | null;
  lowPostureMs?: number;
};
// Ankles often become occluded on the floor. Only the visible torso is needed
// after calibration; a stable vertical seated torso is also a valid baseline.
const REQUIRED = [11, 12, 23, 24] as const;
export const FALL_RULES = { version: "torso-relative-v2", holdMs: 600, calibrationMs: 800, dropRatio: 0.6, tiltDegrees: 55 } as const;
const HOLD_MS = FALL_RULES.holdMs;
const CALIBRATION_MS = 800;
const MAX_TRANSITION_MS = 2200;
const MAX_FRAME_GAP_MS = 500;
const midpoint = (a: PosePoint, b: PosePoint) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
const visible = (point: PosePoint | undefined) =>
  point &&
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  point.x >= 0 &&
  point.x <= 1 &&
  point.y >= 0 &&
  point.y <= 1 &&
  Number.isFinite(point.visibility ?? 1) &&
  (point.visibility ?? 1) >= 0.5;
export class FallDetector {
  private uprightHipY: number | null = null;
  private uprightShoulderY: number | null = null;
  private torsoScale: number | null = null;
  private uprightAt = -Infinity;
  private uprightStartedAt: number | null = null;
  private calibrationReady = false;
  private candidateAt: number | null = null;
  private lastFrameAt = -Infinity;
  private latched = false;
  private aspectRatio: number | null = null;
  reset() {
    this.clearTrajectory();
    this.lastFrameAt = -Infinity;
    this.latched = false;
    this.aspectRatio = null;
  }
  private clearTrajectory() {
    this.uprightHipY = null;
    this.uprightShoulderY = null;
    this.torsoScale = null;
    this.uprightAt = -Infinity;
    this.uprightStartedAt = null;
    this.calibrationReady = false;
    this.candidateAt = null;
  }
  update(
    points: PosePoint[] | undefined,
    timestampMs: number,
    aspectRatio = 1,
  ): FallObservation {
    const observation = (
      state: FallObservation["state"],
      reason: string,
      torsoAngle: number | null = null,
      hipDrop: number | null = null,
      newEvent = false,
      progress = this.calibrationReady ? 1 : 0,
    ): FallObservation => ({
      state,
      reason,
      torsoAngle,
      hipDrop,
      calibrationProgress: progress,
      newEvent,
      hipDropRatio: hipDrop !== null && this.torsoScale ? hipDrop / this.torsoScale : null,
      lowPostureMs: this.candidateAt === null ? 0 : Math.min(HOLD_MS, Math.max(0, timestampMs - this.candidateAt)),
    });
    if (!Number.isFinite(timestampMs) || timestampMs <= this.lastFrameAt)
      return observation("no_person", "等待新的有效视频帧");
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0)
      return observation("no_person", "画面尺寸无效");
    if (
      timestampMs - this.lastFrameAt > MAX_FRAME_GAP_MS ||
      (this.aspectRatio !== null &&
        Math.abs(this.aspectRatio - aspectRatio) > 0.01)
    )
      this.clearTrajectory();
    this.lastFrameAt = timestampMs;
    this.aspectRatio = aspectRatio;
    if (!points || REQUIRED.some((index) => !visible(points[index]))) {
      this.clearTrajectory();
      return observation("no_person", "肩髋关键点不完整，需要重新建立姿态基准");
    }
    const shoulders = midpoint(points[11], points[12]);
    const hips = midpoint(points[23], points[24]);
    // x/y are normalized by different dimensions; convert to the same scale.
    const torsoAngle =
      (Math.atan2(
        Math.abs(shoulders.x - hips.x) * aspectRatio,
        Math.abs(shoulders.y - hips.y),
      ) *
        180) /
      Math.PI;
    const torsoLength = Math.hypot((shoulders.x - hips.x) * aspectRatio, shoulders.y - hips.y);
    const hipDropBeforeUpdate = this.uprightHipY === null ? 0 : hips.y - this.uprightHipY;
    const upright =
      torsoAngle < 35 && hips.y - shoulders.y > 0.08 &&
      (!this.calibrationReady || hipDropBeforeUpdate < (this.torsoScale ?? torsoLength) * 0.35);
    if (upright) {
      if (this.uprightStartedAt === null) this.uprightStartedAt = timestampMs;
      this.uprightHipY =
        this.uprightHipY === null
          ? hips.y
          : this.uprightHipY * 0.85 + hips.y * 0.15;
      this.uprightShoulderY = this.uprightShoulderY === null ? shoulders.y : this.uprightShoulderY * 0.85 + shoulders.y * 0.15;
      this.torsoScale = this.torsoScale === null ? torsoLength : this.torsoScale * 0.85 + torsoLength * 0.15;
      this.candidateAt = null;
      const progress = Math.min(
        1,
        (timestampMs - this.uprightStartedAt) / CALIBRATION_MS,
      );
      if (progress < 1)
        return observation(
          "calibrating",
          "请站立或坐直，正在建立姿态基准",
          torsoAngle,
          0,
          false,
          progress,
        );
      this.calibrationReady = true;
      this.uprightAt = timestampMs;
      this.latched = false;
      return observation(
        "tracking",
        "姿态基准已建立，正在观察连续姿态",
        torsoAngle,
        0,
      );
    }
    this.uprightStartedAt = null;
    const hipDrop =
      this.calibrationReady && this.uprightHipY !== null
        ? hips.y - this.uprightHipY
        : null;
    const recentUpright = timestampMs - this.uprightAt <= MAX_TRANSITION_MS;
    const low = hipDrop !== null && this.torsoScale !== null && this.uprightShoulderY !== null &&
      hipDrop >= this.torsoScale * FALL_RULES.dropRatio &&
      shoulders.y - this.uprightShoulderY >= this.torsoScale * 0.5;
    if (
      !this.calibrationReady ||
      !low ||
      (this.candidateAt === null && torsoAngle < FALL_RULES.tiltDegrees) ||
      (!recentUpright && this.candidateAt === null)
    ) {
      this.candidateAt = null;
      return observation(
        "tracking",
        this.calibrationReady
          ? "未出现连续的快速倒地轨迹"
          : "需要先观察稳定的站立或坐直姿态，尚未开始摔倒判断",
        torsoAngle,
        hipDrop,
      );
    }
    if (this.candidateAt === null) this.candidateAt = timestampMs;
    if (timestampMs - this.candidateAt < HOLD_MS)
      return observation(
        "possible_fall",
        "姿态快速降低，正在持续复核",
        torsoAngle,
        hipDrop,
      );
    const newEvent = !this.latched;
    this.latched = true;
    return observation(
      "suspected_fall",
      "姿态快速降低并持续低位，请由家人核实",
      torsoAngle,
      hipDrop,
      newEvent,
    );
  }
}
