import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const output = fileURLToPath(new URL("../test-results/", import.meta.url));
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const attachDiagnostics = (page, label) => {
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${label}: console ${message.text()}`);
  });
};
const clientNavigate = async (page, path) => {
  await page.evaluate((nextPath) => {
    history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForTimeout(100);
};

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  // Deterministic browser API fixture: verifies the voice UI, not speech accuracy.
  await desktop.addInitScript(() => {
    class SpeechFixture {
      start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: "我妈妈今天一直没有活动，帮我确认一下情况" }]] }); this.onend?.(); }, 80); }
      stop() { this.onend?.(); }
      abort() {}
    }
    window.SpeechRecognition = SpeechFixture;
  });
  attachDiagnostics(desktop, "desktop");
  const routes = [
    "/", "/welcome", "/onboarding", "/ai", "/events", "/events/E001", "/tasks", "/tasks/T001",
    "/authorizations", "/members", "/members/M003", "/devices", "/devices/D005", "/services",
    "/audit", "/notifications", "/settings", "/demo",
  ];
  for (const route of routes) {
    const response = await desktop.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
    assert.equal(response?.ok(), true, `${route} should return HTTP 2xx`);
    await desktop.locator("h1").first().waitFor({ state: "visible" });
    const geometry = await desktop.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(geometry.scrollWidth <= geometry.width + 1, `${route} overflows desktop viewport: ${JSON.stringify(geometry)}`);
  }
  await desktop.goto(`${baseURL}/events`, { waitUntil: "networkidle" });
  await desktop.getByRole("textbox", { name: "搜索事件标题或成员" }).fill("不存在的事件");
  await desktop.getByText("没有匹配的事件", { exact: true }).waitFor();
  await desktop.getByRole("textbox", { name: "搜索事件标题或成员" }).fill("");
  await desktop.goto(`${baseURL}/authorizations`, { waitUntil: "networkidle" });
  await desktop.getByRole("button", { name: "关闭" }).click();
  await desktop.getByRole("button", { name: /历史授权/ }).click();
  await desktop.getByText("临时打开入户门锁", { exact: true }).waitFor();
  await desktop.getByText("已拒绝", { exact: true }).first().waitFor();
  await desktop.goto(`${baseURL}/members/M003`, { waitUntil: "networkidle" });
  await desktop.getByText("可访问设备", { exact: true }).waitFor();
  await desktop.getByText("最近活动", { exact: true }).waitFor();
  await desktop.goto(`${baseURL}/devices/D005`, { waitUntil: "networkidle" });
  await desktop.getByText("自动化规则", { exact: true }).waitFor();
  await desktop.getByText("所有操作每次询问家庭管理员", { exact: true }).waitFor();
  await desktop.goto(`${baseURL}/audit`, { waitUntil: "networkidle" });
  await desktop.getByRole("combobox", { name: "风险级别" }).selectOption("critical");
  await desktop.getByRole("combobox", { name: "日期范围" }).selectOption("yesterday");
  await desktop.getByText("维持始终拒绝规则", { exact: true }).waitFor();
  await desktop.goto(`${baseURL}/ai`, { waitUntil: "networkidle" });
  await desktop.getByRole("button", { name: "语音输入" }).click();
  await desktop.getByRole("textbox", { name: "描述家庭情况" }).waitFor();
  await assert.doesNotReject(async () => desktop.waitForFunction(() => (document.querySelector('textarea[name="family-situation"]')?.value ?? "").includes("一直没有活动")));
  await desktop.goto(`${baseURL}/tasks/T001`, { waitUntil: "networkidle" });
  await desktop.getByRole("button", { name: "转交任务" }).click();
  await desktop.getByRole("dialog").getByRole("button", { name: /王阿姨/ }).click();
  await desktop.locator(".owner-row").getByText("王阿姨", { exact: true }).waitFor();
  await desktop.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  await desktop.screenshot({ path: join(output, "dashboard-1440.png"), fullPage: true });

  await desktop.goto(`${baseURL}/demo`, { waitUntil: "networkidle" });
  await desktop.locator(".demo-card").filter({ hasText: "老人长时间未活动" }).getByRole("button", { name: /触发场景/ }).click();
  await desktop.waitForURL(/\/events\/E001$/);
  await desktop.getByRole("button", { name: /推进下一步/ }).click();
  await desktop.getByRole("button", { name: /推进下一步/ }).click();
  await desktop.getByRole("button", { name: /推进下一步/ }).click();
  await desktop.getByRole("button", { name: /推进下一步/ }).click();
  await desktop.locator(".success-block").getByText("事件已解决", { exact: true }).waitFor();
  await desktop.getByRole("link", { name: /联系老人确认当前状态/ }).click();
  await desktop.getByText("任务已完成并留痕", { exact: true }).waitFor();

  await desktop.goto(`${baseURL}/demo`, { waitUntil: "networkidle" });
  await desktop.getByRole("button", { name: /重置全部状态/ }).click();
  await desktop.locator(".demo-card").filter({ hasText: "陌生人请求开门" }).getByRole("button", { name: /触发场景/ }).click();
  await desktop.waitForURL(/\/authorizations$/);
  await desktop.getByRole("button", { name: "拒绝", exact: true }).click();
  await clientNavigate(desktop, "/events/E002");
  await desktop.getByText("操作已拦截", { exact: true }).waitFor();
  await clientNavigate(desktop, "/audit");
  await desktop.getByText("拒绝高风险操作", { exact: true }).waitFor();
  await desktop.screenshot({ path: join(output, "audit-after-rejection.png"), fullPage: true });
  await clientNavigate(desktop, "/ai");
  await desktop.getByRole("button", { name: "新对话" }).click();
  await clientNavigate(desktop, "/authorizations");
  assert.equal(await desktop.getByRole("dialog").count(), 0, "new conversation must not reset authorization decisions");
  await desktop.getByRole("button", { name: /历史授权/ }).click();
  await desktop.getByText("拒绝高风险操作", { exact: false }).or(desktop.getByText("打开入户智能门锁", { exact: false })).first().waitFor();

  await desktop.goto(`${baseURL}/demo`, { waitUntil: "networkidle" });
  await desktop.locator(".demo-card").filter({ hasText: "AI 输出异常" }).getByRole("button", { name: /触发场景/ }).click();
  await desktop.locator(".loading-skeleton").waitFor({ state: "visible" });
  await desktop.waitForURL(/\/ai$/);
  await desktop.getByText("AI 服务暂时不可用", { exact: true }).waitFor();
  await desktop.getByRole("button", { name: "关闭提示", exact: true }).click();
  await desktop.getByText("AI 服务暂时不可用", { exact: true }).waitFor({ state: "hidden" });

  for (const width of [1024, 768]) {
    const responsive = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    attachDiagnostics(responsive, `${width}px`);
    for (const route of ["/", "/events", "/events/E001", "/tasks", "/authorizations", "/members/M003", "/devices", "/devices/D005", "/audit", "/demo"]) {
      await responsive.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
      await responsive.locator("h1").first().waitFor({ state: "visible" });
      const geometry = await responsive.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(geometry.scrollWidth <= geometry.width + 1, `${route} overflows ${width}px viewport: ${JSON.stringify(geometry)}`);
    }
    await responsive.close();
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  attachDiagnostics(mobile, "mobile");
  for (const route of ["/", "/ai", "/events", "/events/E001", "/tasks", "/authorizations", "/members/M003", "/devices", "/devices/D005", "/audit", "/demo"]) {
    await mobile.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
    await mobile.locator("h1").first().waitFor({ state: "visible" });
    const geometry = await mobile.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(geometry.scrollWidth <= geometry.width + 1, `${route} overflows mobile viewport: ${JSON.stringify(geometry)}`);
    await mobile.locator(".mobile-nav").waitFor({ state: "visible" });
  }
  await mobile.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  await mobile.getByRole("button", { name: "打开菜单" }).click();
  await mobile.getByText("全部功能", { exact: true }).waitFor();
  await mobile.getByRole("dialog").getByRole("link", { name: /Demo 控制台/ }).click();
  await mobile.waitForURL(/\/demo$/);
  await mobile.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: join(output, "dashboard-390.png"), fullPage: false });

  assert.deepEqual(errors, [], `Browser console/page errors:\n${errors.join("\n")}`);
  console.log(JSON.stringify({ routes: routes.length, viewports: ["1440x1000", "1024x900", "768x900", "390x844"], scenarios: ["elderly", "stranger", "ai-failure"], screenshots: ["dashboard-1440.png", "dashboard-390.png", "audit-after-rejection.png"], errors: errors.length }, null, 2));
} finally {
  await browser.close();
}
