import assert from "node:assert/strict";
import test from "node:test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

for (const [route, marker] of [["/events/E001", "事件 E001"], ["/tasks/T002", "任务 T002"], ["/devices/D005", "设备详情"]]) {
  test(`SSR renders ${route} without dashboard fallback`, async () => {
    const response = await fetch(`${baseURL}${route}`);
    assert.equal(response.ok, true);
    const html = await response.text();
    assert.match(html, new RegExp(marker));
  });
}

test("SSR renders app-level not-found for invalid detail IDs", async () => {
  const response = await fetch(`${baseURL}/tasks/DOES_NOT_EXIST`);
  const html = await response.text();
  assert.match(html, /内容不存在/);
  assert.doesNotMatch(html, /任务 T001/);
});
