import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/cv`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "疑似摔倒检测" }).waitFor();
  await page.getByRole("button", { name: "开启本机摄像头" }).click();
  await page.getByText("正在加载真实姿态模型…").waitFor();
  await page
    .getByText("正在加载真实姿态模型…")
    .waitFor({ state: "hidden", timeout: 60000 });
  await page.getByRole("button", { name: "停止检测" }).waitFor();
  await page.waitForFunction(
    () => document.querySelector("video")?.videoWidth > 0,
  );
  assert.equal(
    await page.locator(".cv-page").getAttribute("data-engine"),
    "worker",
    "Chrome should run pose inference in the background worker",
  );
  await page.waitForFunction(() =>
    document.querySelector(".cv-result small")?.textContent?.includes("ms"),
  );
  await page.evaluate(() => {
    window.cvTestTrack = document
      .querySelector("video")
      .srcObject.getVideoTracks()[0];
  });
  assert.equal(
    await page.getByRole("alert").count(),
    0,
    "model or WASM failed to initialize",
  );
  await page.getByRole("button", { name: "停止检测" }).click();
  await page.getByText("等待视频输入").waitFor();
  assert.equal(
    await page.evaluate(() => window.cvTestTrack.readyState),
    "ended",
    "stopping must release the camera",
  );
  await page.getByRole("button", { name: "开启本机摄像头" }).click();
  await page.getByRole("button", { name: "停止检测" }).click();
  await page.getByText("等待视频输入").waitFor();
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() => document.querySelector("video").srcObject),
    null,
    "cancelling initialization must not resurrect the camera",
  );
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    layout.scrollWidth <= layout.width + 1,
    `CV page overflows on mobile: ${JSON.stringify(layout)}`,
  );
  const fallbackPage = await browser.newPage();
  await fallbackPage.route("**/cv/pose-worker.js", (route) =>
    route.fulfill({
      status: 404,
      body: "Worker intentionally unavailable in this check",
    }),
  );
  await fallbackPage.goto(
    `${process.env.BASE_URL ?? "http://localhost:3000"}/cv`,
    { waitUntil: "networkidle" },
  );
  await fallbackPage.getByRole("button", { name: "开启本机摄像头" }).click();
  await fallbackPage.waitForFunction(
    () => document.querySelector(".cv-page")?.dataset.engine === "main",
    undefined,
    { timeout: 60000 },
  );
  await fallbackPage.waitForFunction(() =>
    document.querySelector(".cv-result small")?.textContent?.includes("ms"),
  );
  await fallbackPage.getByRole("button", { name: "停止检测" }).click();
  await fallbackPage.getByText("等待视频输入").waitFor();
  assert.equal(
    await fallbackPage.evaluate(
      () => document.querySelector("video").srcObject,
    ),
    null,
  );
  await fallbackPage.close();
} finally {
  await browser.close();
}
