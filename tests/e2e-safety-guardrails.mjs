import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
const clientNavigate = async (path) => {
  await page.evaluate((nextPath) => { history.pushState({}, "", nextPath); window.dispatchEvent(new PopStateEvent("popstate")); }, path);
};

try {
  await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "陌生访客请求入户", level: 2, exact: true }).waitFor();
  await page.locator(".overview-metric").filter({ hasText: "家庭成员" }).getByText("5", { exact: true }).waitFor();

  await page.goto(`${baseURL}/authorizations`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "修改授权规则" }).click();
  await page.getByRole("heading", { name: "我的规则" }).waitFor();
  const cameraRule = page.getByRole("combobox", { name: "读取客厅摄像头画面授权规则" });
  assert.equal(await cameraRule.locator('option[value="always_allow"]').count(), 0, "critical camera rule must not expose always_allow");
  await page.getByText("安全规则：仅支持每次询问或始终拒绝", { exact: true }).waitFor();

  await page.goto(`${baseURL}/tasks/T002`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("button", { name: "确认完成", exact: true }).isDisabled(), true);
  assert.equal(await page.getByText("任务已完成并留痕", { exact: true }).count(), 0, "task must remain open without evidence");
  await page.getByRole("textbox", { name: "完成证据与核实结果" }).fill("演示验证：已联系现场人员，核实传感器状态，记录处理结果。");
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await page.getByText("处理记录已保存", { exact: true }).waitFor();
  await page.getByRole("button", { name: "确认完成" }).click();
  await page.getByText("任务已完成并留痕", { exact: true }).waitFor();
  await clientNavigate("/events/E003");
  await page.getByText("任务完成已回传", { exact: true }).waitFor();

  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
