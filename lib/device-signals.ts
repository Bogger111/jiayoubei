const activeStates = new Set([
  "on",
  "true",
  "1",
  "active",
  "motion",
  "occupied",
  "detected",
  "alarm",
  "triggered",
  "pressed",
  "有人",
  "在家",
  "求救",
  "摔倒",
]);
const inactiveStates = new Set([
  "off",
  "false",
  "0",
  "inactive",
  "clear",
  "idle",
  "not_home",
  "unoccupied",
  "no_motion",
  "无人",
]);

export function signalState(value: string): "active" | "inactive" | "unknown" {
  const state = value.trim().toLowerCase();
  if (activeStates.has(state)) return "active";
  if (inactiveStates.has(state)) return "inactive";
  return "unknown";
}

export function isAlarmState(value: string) {
  return signalState(value) === "active";
}
