import assert from "node:assert/strict";
import test from "node:test";
import { mockEvents, mockTasks, mockDevices } from "../lib/product-mocks.ts";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

for (const [route, marker] of [
  ["/events/E001", mockEvents.find((event) => event.id === "E001").title],
  ["/tasks/T002", mockTasks.find((task) => task.id === "T002").title],
  ["/devices/D005", mockDevices.find((device) => device.id === "D005").name],
]) {
  test(`SSR renders ${route} without dashboard fallback`, async () => {
    const response = await fetch(`${baseURL}${route}`);
    assert.equal(response.ok, true);
    const html = await response.text();
    const heading = html.match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/)?.[1];
    assert.equal(
      heading,
      marker,
      "the requested record should be rendered in the initial response",
    );
  });
}

test("SSR renders app-level not-found for invalid detail IDs", async () => {
  const response = await fetch(`${baseURL}/tasks/DOES_NOT_EXIST`);
  const html = await response.text();
  assert.match(html, /内容不存在/);
  assert.doesNotMatch(html, /<h1[^>]*>[^<]*核实家庭情况/);
});
