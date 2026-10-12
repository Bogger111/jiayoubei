import assert from "node:assert/strict";
import test from "node:test";
import { canCompleteTask, isAuthorizationPolicyAllowed } from "../lib/product-policy.ts";

const criticalCamera = {
  riskLevel: "critical",
  resource: "D006 · 客厅摄像头",
  action: "读取客厅摄像头画面",
};

test("critical devices can never use always_allow", () => {
  assert.equal(isAuthorizationPolicyAllowed(criticalCamera, "always_allow"), false);
});

test("critical devices still allow ask_every_time and always_deny", () => {
  assert.equal(isAuthorizationPolicyAllowed(criticalCamera, "ask_every_time"), true);
  assert.equal(isAuthorizationPolicyAllowed(criticalCamera, "always_deny"), true);
});

test("low-risk reminder rules may use always_allow", () => {
  assert.equal(isAuthorizationPolicyAllowed({ riskLevel: "attention", resource: "家庭成员", action: "发送提醒" }, "always_allow"), true);
});

test("task completion requires evidence", () => {
  assert.equal(canCompleteTask({ evidence: undefined }), false);
  assert.equal(canCompleteTask({ evidence: "已上传现场照片" }), true);
});
