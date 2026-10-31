import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (cause) => errors.push(cause.message));
await page.addInitScript(() => {
  window.qaSpeech = { instances: [], failConstructor: false };
  class SpeechFixture {
    constructor() {
      if (window.qaSpeech.failConstructor)
        throw new Error("QA constructor blocked");
      window.qaSpeech.instances.push(this);
      this.aborts = 0;
      this.stops = 0;
    }
    start() {}
    stop() {
      this.stops += 1;
    }
    abort() {
      this.aborts += 1;
    }
  }
  window.SpeechRecognition = SpeechFixture;
});
try {
  await page.clock.install();
  await page.goto(`${baseURL}/ai`, { waitUntil: "networkidle" });
  const input = page.getByRole("textbox", { name: "描述家庭情况" });
  await input.fill("先保留我的手动说明。");
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await page.getByRole("button", { name: "停止语音输入" }).waitFor();
  await page.evaluate(() => {
    const recognition = window.qaSpeech.instances.at(-1);
    recognition.onresult({ results: [[{ transcript: "补充一段语音。" }]] });
    recognition.onend();
  });
  assert.equal(
    await input.inputValue(),
    "先保留我的手动说明。\n补充一段语音。",
  );
  await input.fill("甲".repeat(3999));
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await page.evaluate(() => {
    const recognition = window.qaSpeech.instances.at(-1);
    recognition.onresult({ results: [[{ transcript: "超过限制的补充" }]] });
    recognition.onend();
  });
  await page.getByRole("alert").filter({ hasText: "超过 4000 字" }).waitFor();
  assert.equal((await input.inputValue()).length, 3999);
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await page.evaluate(() =>
    window.qaSpeech.instances.at(-1).onerror({ error: "not-allowed" }),
  );
  await page.getByRole("alert").filter({ hasText: "麦克风权限" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "语音输入", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page.evaluate(() => window.qaSpeech.instances.at(-1).aborts),
    1,
  );
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await page.getByRole("button", { name: "停止语音输入" }).click();
  await page.clock.fastForward(800);
  assert.equal(
    await page
      .getByRole("button", { name: "语音输入", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page.evaluate(() => window.qaSpeech.instances.at(-1).aborts),
    1,
  );
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await page.clock.fastForward(26_000);
  assert.equal(
    await page
      .getByRole("button", { name: "语音输入", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page.evaluate(() => window.qaSpeech.instances.at(-1).aborts),
    1,
  );
  await page.evaluate(() => {
    window.qaSpeech.failConstructor = true;
  });
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "无法开启语音输入" })
    .waitFor();
  await page.evaluate(() => {
    window.qaSpeech.failConstructor = false;
  });
  await page.getByRole("button", { name: "语音输入", exact: true }).click();
  await page
    .getByRole("navigation", { name: "主要功能", exact: true })
    .getByRole("link", { name: "家庭", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => window.qaSpeech.instances.at(-1).aborts),
    1,
  );
  assert.equal(
    await page.evaluate(() => window.qaSpeech.instances.at(-1).onresult),
    null,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Speech browser interface verified: append existing draft, reject excess text, permission/constructor errors, stop/timeout recovery and abort on leaving. This fixture does not measure speech recognition accuracy.",
  );
} finally {
  await browser.close();
}
