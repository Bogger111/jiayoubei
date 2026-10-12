import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (cause) => errors.push(cause.message));
try {
  await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/ai`, {
    waitUntil: "networkidle",
  });
  const input = page.getByRole("textbox", { name: "描述家庭情况" });
  await input.fill("阅读测试：" + "这是用于检查长文字显示的说明。".repeat(70));
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".message").length === 3,
  );
  await page.waitForFunction(() => {
    const stream = document.querySelector(".chat-stream");
    return (
      stream.scrollHeight > stream.clientHeight &&
      stream.scrollHeight - stream.clientHeight - stream.scrollTop < 4
    );
  });
  assert.ok(
    await page
      .locator(".chat-stream")
      .evaluate((element) => element.clientHeight <= 480),
    "long conversations remain inside a bounded reading area",
  );
  await input.fill("你好！");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.locator(".chat-stream").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByRole("button", { name: "查看最新消息" }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".message").length === 5,
  );
  assert.ok(
    await page
      .locator(".chat-stream")
      .evaluate((element) => element.scrollTop < 4),
    "a arriving reply must not pull a reader away from earlier text",
  );
  await page.getByRole("button", { name: "查看最新消息" }).click();
  await page.waitForFunction(() => {
    const stream = document.querySelector(".chat-stream");
    return stream.scrollHeight - stream.clientHeight - stream.scrollTop < 4;
  });
  await page.getByRole("button", { name: "新对话" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".message").length === 1,
  );
  assert.equal(
    await page.locator(".chat-stream").evaluate((element) => element.scrollTop),
    0,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Chat reading verified: bounded long messages, latest-reply scrolling, older-message position preserved, explicit return to latest, conversation reset and mobile width.",
  );
} finally {
  await browser.close();
}
