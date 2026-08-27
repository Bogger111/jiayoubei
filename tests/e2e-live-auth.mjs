import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const url = "https://jiayoubei-family-emergency-agent.jiayoubei.workers.dev";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--proxy-server=http://127.0.0.1:7897"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  // 登录前的 /api/bootstrap 401 是预期行为（未登录保护），不计为错误
  if (message.type() === "error" && !message.text().includes("401")) errors.push(message.text());
});

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByText("登录家庭空间").waitFor({ timeout: 45000 });
  await page.getByLabel("邮箱").fill("admin@jiayoubei.demo");
  await page.getByLabel("密码").fill(process.env.JYB_DEMO_PASSWORD || "demo-password-placeholder");
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByText("晚上好，奕博").waitFor({ timeout: 45000 });
  await page.getByText("陌生访客请求入户").first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: "test-results/live-login-dashboard.png", fullPage: false });
  console.log("LIVE-LOGIN-FLOW: OK");
  console.log("console-errors:", errors.length);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
