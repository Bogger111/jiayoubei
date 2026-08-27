import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const project = "C:/Users/Bogger/OneDrive/Desktop/创客/家有备应用";
const baseURL = "http://localhost:3000";

// 1) 重置本地 D1 状态（杀掉占用进程）
const listeners = spawnSync("netstat.exe", ["-ano"], { encoding: "utf8" }).stdout;
for (const line of listeners.split("\n")) {
  if (/:3000\s.*LISTENING/.test(line)) {
    const pid = line.trim().split(/\s+/).pop();
    spawnSync("taskkill.exe", ["/F", "/PID", pid, "/T"], { stdio: "ignore" });
  }
}
spawnSync("bash", ["-c", "rm -rf .wrangler/state/v3/d1"], { cwd: project, stdio: "ignore" });

// 2) 启动 dev（真实模式：项目 .env 已设 VITE_USE_MOCK=false）
const server = spawn("npm run dev", { cwd: project, stdio: "ignore", shell: true, windowsHide: true });
let ready = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const res = await fetch(`${baseURL}/api/bootstrap`);
    if (res.ok) { ready = true; break; }
  } catch { /* not up yet */ }
}
assert.equal(ready, true, "dev server should be ready");

// 3) 浏览器全流程验证
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  await page.getByText("晚上好，奕博").waitFor({ timeout: 15000 });
  await page.getByText("陌生访客请求入户").first().waitFor();
  await page.getByText("设备状态").first().waitFor({ timeout: 15000 });

  await page.goto(`${baseURL}/authorizations`, { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "拒绝" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 15000 });

  await page.goto(`${baseURL}/audit`, { waitUntil: "networkidle" });
  await page.getByText("拒绝高风险操作").first().waitFor({ timeout: 15000 });

  const state = await (await fetch(`${baseURL}/api/bootstrap`)).json();
  const a004 = state.authorizations.find((a) => a.id === "A004");
  assert.equal(a004?.status, "rejected", "A004 should be rejected in D1");

  console.log("real-mode-full-flow: OK");
  console.log("console-errors:", errors.length);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.kill();
}
