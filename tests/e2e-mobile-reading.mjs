import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
const errors = [];
page.on("pageerror", (cause) => errors.push(cause.message));
await page.addInitScript(() =>
  localStorage.setItem(
    "jyb-appearance-v1",
    JSON.stringify({ largeText: true, reduceMotion: true }),
  ),
);
async function check(label) {
  const result = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    smallFields: [
      ...document.querySelectorAll('input:not([type="file"]),textarea,select'),
    ]
      .filter(
        (element) =>
          element.getClientRects().length &&
          parseFloat(getComputedStyle(element).fontSize) < 16,
      )
      .map((element) => element.outerHTML.slice(0, 140)),
  }));
  assert.equal(result.overflow, false, `${label} overflows`);
  assert.deepEqual(result.smallFields, [], `${label} input text is too small`);
}
try {
  for (const path of [
    "/",
    "/tasks",
    "/tasks/T002",
    "/ai",
    "/members/M003",
    "/devices/D005",
    "/authorizations",
    "/settings",
    "/notifications",
    "/join",
  ]) {
    await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.documentElement.dataset.largeText === "true",
    );
    await check(path);
  }
  await page.goto(`${baseURL}/tasks`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务标题").fill("需要家人核实的长标题".repeat(20));
  await dialog
    .getByLabel("处理说明")
    .fill("请记录确认时间、实际联系情况和后续安排。".repeat(150));
  await check("long task form");
  await page.setViewportSize({ width: 320, height: 340 });
  await dialog.getByLabel("处理说明").focus();
  await dialog.getByLabel("处理说明").scrollIntoViewIfNeeded();
  const field = await dialog.getByLabel("处理说明").boundingBox();
  await mkdir("test-results/ui-mobile-reading", { recursive: true });
  await page.screenshot({
    path: "test-results/ui-mobile-reading/constrained-dialog-320.png",
    fullPage: true,
  });
  assert.ok(
    field && field.y >= 0 && field.y + field.height <= 340,
    "the task field remains scrollable in a short viewport",
  );
  await check("short viewport form");
  await page.setViewportSize({ width: 320, height: 700 });
  await dialog.getByRole("button", { name: "创建任务", exact: true }).click();
  await page.getByRole("heading", { name: /需要家人核实的长标题/ }).waitFor();
  await check("long task detail");
  const descriptionDetails = page
    .locator(".header-text-details")
    .filter({ hasText: "查看完整说明" });
  assert.equal(await descriptionDetails.getAttribute("open"), null);
  await descriptionDetails.locator("summary").click();
  assert.equal(
    (await descriptionDetails.locator("p").innerText()).length,
    "请记录确认时间、实际联系情况和后续安排。".repeat(150).length,
  );
  await descriptionDetails.locator("summary").click();
  await mkdir("test-results/ui-mobile-reading", { recursive: true });
  await page.screenshot({
    path: "test-results/ui-mobile-reading/long-task-320.png",
    fullPage: true,
  });
  await page.goto(`${baseURL}/join`, { waitUntil: "networkidle" });
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.largeText),
    "true",
  );
  await page.screenshot({
    path: "test-results/ui-mobile-reading/join-320.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Mobile reading verified at 320px with larger text: ten routes, 16px form fields, long task content, constrained-height dialog scrolling and invitation-page preference retention. This does not replace testing an actual phone keyboard.",
  );
} finally {
  await browser.close();
}
