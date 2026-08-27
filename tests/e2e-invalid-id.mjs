import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  for (const route of ["/events/DOES_NOT_EXIST", "/tasks/DOES_NOT_EXIST", "/members/DOES_NOT_EXIST", "/devices/DOES_NOT_EXIST"]) {
    const response = await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
    assert.equal(response?.ok(), true, `${route} should render the app-level not-found state`);
    await page.getByRole("heading", { name: "内容不存在" }).waitFor();
    assert.equal(await page.getByRole("button", { name: /推进下一步|确认完成|申请一次操作/ }).count(), 0, `${route} must not expose actions for another record`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
