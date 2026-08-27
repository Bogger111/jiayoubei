import assert from "node:assert/strict";
import test from "node:test";
import { selectDashboardSummary } from "../lib/product-selectors.ts";

const state = {
  members: [{ id: "M1" }, { id: "M2" }, { id: "M3" }, { id: "M4" }, { id: "M5" }],
  events: [
    { id: "E1", title: "普通提醒", riskLevel: "attention", status: "processing", createdAt: "2026-08-24T20:00:00" },
    { id: "E2", title: "陌生访客请求入户", riskLevel: "critical", status: "pending_confirmation", createdAt: "2026-08-24T21:00:00" },
  ],
  tasks: [{ status: "waiting_confirmation" }, { status: "completed" }],
  authorizations: [{ status: "pending", riskLevel: "critical" }, { status: "active", riskLevel: "normal" }],
  devices: [{ online: true }, { online: false }],
};

test("critical pending event drives the household headline", () => {
  const summary = selectDashboardSummary(state);
  assert.equal(summary.riskLevel, "critical");
  assert.equal(summary.headline, "紧急：陌生访客请求入户");
  assert.equal(summary.topEvent?.id, "E2");
});

test("dashboard counts are derived from live state", () => {
  const summary = selectDashboardSummary(state);
  assert.equal(summary.memberCount, 5);
  assert.equal(summary.pendingTaskCount, 1);
  assert.equal(summary.pendingAuthorizationCount, 1);
  assert.equal(summary.criticalAuthorizationCount, 1);
  assert.equal(summary.offlineDeviceCount, 1);
});

test("empty active state reports normal", () => {
  const summary = selectDashboardSummary({ ...state, events: [], tasks: [], authorizations: [], devices: [{ online: true }] });
  assert.equal(summary.riskLevel, "normal");
  assert.equal(summary.headline, "当前家庭状态正常");
});
