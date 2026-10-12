import assert from "node:assert/strict";
import test from "node:test";
import {
  isConversationOnly,
  knownMemberName,
  nonIncidentReply,
} from "../lib/agent-guards.ts";
import { signalState, isAlarmState } from "../lib/device-signals.ts";
import { pushInput, validPushEndpoint } from "../lib/push-input.ts";

test("courtesy messages do not hide appended danger descriptions", () => {
  for (const value of ["你好！", "谢谢", "  hello.  "])
    assert.equal(isConversationOnly(value), true);
  for (const value of [
    "你好，妈妈摔倒了",
    "谢谢，家里有烟雾",
    "晚安但爸爸没有回复",
  ])
    assert.equal(isConversationOnly(value), false);
});
test("model member references must match the current family", () => {
  const profile = { members: [{ name: "陈女士" }] };
  assert.equal(knownMemberName("陈女士", profile), "陈女士");
  for (const value of ["林秀兰", "妈妈", null])
    assert.equal(knownMemberName(value, profile), "家人（待确认）");
});
test("complete feature and prevention questions do not masquerade as incidents", () => {
  for (const value of [
    "如何预防老人摔倒？",
    "怎么使用摔倒检测",
    "视觉监测怎么用？",
    "请问如何创建家庭任务",
    "怎样转交任务",
  ])
    assert.equal(typeof nonIncidentReply(value), "string");
  for (const value of [
    "如何预防老人摔倒？妈妈刚刚摔倒了",
    "怎么使用摔倒检测，爸爸意识不清",
    "创建任务核实摔倒",
    "请打开门",
    "家里有烟雾",
    "妈妈没有摔倒但呼吸困难",
  ])
    assert.equal(nonIncidentReply(value), undefined);
});
test("inactive and negative device states cannot trigger active or alarm signals", () => {
  for (const value of ["inactive", "not_home", "unoccupied", "off", "0"])
    assert.equal(signalState(value), "inactive");
  for (const value of [
    "inactive",
    "not_detected",
    "none",
    "unknown",
    "unavailable",
  ])
    assert.equal(isAlarmState(value), false);
  for (const value of ["on", "active", "triggered"])
    assert.equal(isAlarmState(value), true);
});
test("push subscriptions accept browser key shape and reject arbitrary destinations", () => {
  const keys = {
    p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString(
      "base64url",
    ),
    auth: Buffer.alloc(16).toString("base64url"),
  };
  assert.equal(
    pushInput({
      endpoint: "https://fcm.googleapis.com/fcm/send/QA-fixture",
      keys,
    }).auth,
    keys.auth,
  );
  for (const endpoint of [
    "http://fcm.googleapis.com/test",
    "https://localhost/test",
    "https://127.0.0.1/test",
    "https://fcm.googleapis.com.evil.test/test",
    "https://user:pass@fcm.googleapis.com/test",
    "https://example.test/test",
  ])
    assert.equal(validPushEndpoint(endpoint), false);
  assert.throws(() =>
    pushInput({
      endpoint: "https://fcm.googleapis.com/test",
      keys: { ...keys, auth: "bad" },
    }),
  );
});
