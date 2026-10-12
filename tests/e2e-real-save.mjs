import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";

const baseURL = process.env.BASE_URL ?? "http://localhost:3012";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("This fixture check requires a local server.");
const call = async (path, body) => {
  const response = await fetch(
    `${baseURL}${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
};
const state = await call("/api/bootstrap");
const suffix = crypto.randomUUID().slice(0, 8);
const created = await call("/api/tasks", {
  title: `QA保存检查-${suffix}`,
  assignee: state.members[0].id,
});
const cleanupTasks = new Set([created.id]);
const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const files = (await readdir(directory)).filter(
  (file) => file.endsWith(".sqlite") && file !== "metadata.sqlite",
);
assert.equal(files.length, 1);
const db = new DatabaseSync(`${directory}/${files[0]}`);
db.exec("PRAGMA busy_timeout=5000");
const noticeId = `QA_NOTICE_${suffix}`;
const noticeTitle = `QA通知保存-${suffix}`;
db.prepare(
  "INSERT INTO notifications (id,family_id,category,title,detail,time,read) VALUES (?,?,'system',?,'QA fixture',?,0)",
).run(noticeId, state.family.id, noticeTitle, new Date().toISOString());
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`${baseURL}/tasks/${created.id}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: created.title, level: 1 }).waitFor();
  const record = "QA fixture：已通过电话确认本人情况，并记录联系人与处理时间。";
  const editor = page.getByRole("textbox", { name: "完成证据与核实结果" });
  await editor.fill(record);
  const endpoint = `**/api/tasks/${created.id}`;
  await page.route(endpoint, async (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "QA fixture：保存暂时失败" }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "QA fixture：保存暂时失败" })
    .waitFor();
  assert.equal(
    await editor.inputValue(),
    record,
    "a failed save must preserve the draft",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "确认完成", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    db.prepare("SELECT evidence FROM tasks WHERE id=?").get(created.id)
      .evidence,
    null,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: created.title, level: 1 }).waitFor();
  assert.equal(
    await editor.inputValue(),
    record,
    "an unsubmitted draft must survive a refresh in the same tab",
  );
  const concurrentRecord = "QA fixture：另一位家人先保存了核实结果。";
  const concurrent = await fetch(`${baseURL}/api/tasks/${created.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evidence: concurrentRecord }),
  });
  assert.equal(concurrent.status, 200);
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await page.getByRole("alert").filter({ hasText: "任务已更新" }).waitFor();
  assert.equal(await editor.inputValue(), record);
  assert.equal(
    db.prepare("SELECT evidence FROM tasks WHERE id=?").get(created.id)
      .evidence,
    concurrentRecord,
  );
  await page.getByText("查看当前已保存的记录", { exact: true }).click();
  await page.getByText(concurrentRecord, { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "保存处理记录" }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "已核对，保留我的草稿" }).click();
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await page.getByText("处理记录已保存", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("处理记录已保存", { exact: true }).waitFor();
  assert.equal(await editor.inputValue(), record);
  await page.getByRole("button", { name: "确认完成", exact: true }).click();
  await page.getByText("任务已完成并留痕", { exact: true }).waitFor();
  assert.equal(
    db.prepare("SELECT status FROM tasks WHERE id=?").get(created.id).status,
    "completed",
  );
  const shared = await call("/api/tasks", {
    title: `QA协作刷新-${suffix}`,
    assignee: state.members[0].id,
  });
  cleanupTasks.add(shared.id);
  await page.goto(`${baseURL}/tasks/${shared.id}`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: shared.title, level: 1 }).waitFor();
  const sharedEditor = page.getByRole("textbox", {
    name: "完成证据与核实结果",
  });
  await sharedEditor.fill("QA fixture：本页尚未保存的核实草稿。");
  const deadline = await fetch(`${baseURL}/api/tasks/${shared.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dueAt: new Date(Date.now() - 60_000).toISOString(),
    }),
  });
  assert.equal(deadline.status, 200);
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "QA refresh unavailable" }),
    }),
  );
  await page.getByRole("button", { name: "刷新家庭记录" }).click();
  await page
    .getByText("暂时无法获取家人的最新记录", { exact: false })
    .waitFor();
  assert.equal(
    await sharedEditor.inputValue(),
    "QA fixture：本页尚未保存的核实草稿。",
  );
  assert.equal(
    await page
      .getByRole("heading", { name: shared.title, level: 1 })
      .isVisible(),
    true,
  );
  await page.unroute("**/api/bootstrap");
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...state,
        family: { ...state.family, timezone: "invalid-timezone" },
      }),
    }),
  );
  await page.getByRole("button", { name: "刷新家庭记录" }).click();
  await page
    .getByText("暂时无法获取家人的最新记录", { exact: false })
    .waitFor();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".record-sync-button")
        ?.classList.contains("refreshing"),
  );
  assert.equal(
    await sharedEditor.inputValue(),
    "QA fixture：本页尚未保存的核实草稿。",
  );
  await page.unroute("**/api/bootstrap");
  await page.clock.install();
  const sharedPatch = await fetch(`${baseURL}/api/tasks/${shared.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evidence: concurrentRecord }),
  });
  assert.equal(sharedPatch.status, 200);
  await page.clock.fastForward(31_000);
  await page
    .getByText("任务已更新。你的草稿已保留", { exact: false })
    .waitFor();
  await page
    .locator(".mini-info")
    .getByText("已超时", { exact: false })
    .waitFor();
  assert.equal(
    await sharedEditor.inputValue(),
    "QA fixture：本页尚未保存的核实草稿。",
  );
  assert.equal(
    await page.getByRole("button", { name: "保存处理记录" }).isDisabled(),
    true,
  );
  await page.getByText("查看当前已保存的记录", { exact: true }).click();
  await page.getByRole("button", { name: "已核对，保留我的草稿" }).click();
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await page.getByText("处理记录已保存", { exact: true }).waitFor();
  await sharedEditor.fill(
    "QA fixture：补充核实结果，不需要再次核对自己的保存。",
  );
  assert.equal(
    await page.getByRole("button", { name: "保存处理记录" }).isDisabled(),
    false,
  );
  await page.goto(`${baseURL}/ai`, { waitUntil: "networkidle" });
  const composer = page.getByRole("textbox", { name: "描述家庭情况" });
  let releaseAgent;
  const delayedAgent = new Promise((resolve) => {
    releaseAgent = resolve;
  });
  await page.route("**/api/agent", async (route) => {
    await delayedAgent;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: "QA fixture: delayed reply",
        eventId: "QA_fixture_refresh",
        analysis: { mode: "rules_fallback" },
        safetyNotice: "QA fixture",
      }),
    });
  });
  await composer.fill("QA fixture：触发一次页面记录刷新");
  await page.getByRole("button", { name: "发送消息" }).click();
  await composer.fill("这是继续填写、尚未发送的草稿");
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith("/api/bootstrap"),
  );
  releaseAgent();
  await refreshed;
  await page.waitForFunction(
    () => !document.querySelector(".record-refresh-progress"),
  );
  assert.equal(
    await composer.inputValue(),
    "这是继续填写、尚未发送的草稿",
    "background hydration must preserve a new assistant draft",
  );
  await page.unroute("**/api/agent");
  await page.goto(`${baseURL}/notifications`, { waitUntil: "networkidle" });
  const row = page
    .locator(".notification-row")
    .filter({ hasText: noticeTitle });
  await row.waitFor();
  const noticeEndpoint = `**/api/notifications/${noticeId}/read`;
  await page.route(noticeEndpoint, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "QA fixture：通知未保存" }),
    }),
  );
  await row.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "QA fixture：通知未保存" })
    .waitFor();
  assert.match(await row.getAttribute("class"), /unread/);
  assert.equal(
    db.prepare("SELECT read FROM notifications WHERE id=?").get(noticeId).read,
    0,
  );
  await page.unroute(noticeEndpoint);
  const staleBootstrap = await call("/api/bootstrap");
  let releaseStale;
  const staleHold = new Promise((resolve) => {
    releaseStale = resolve;
  });
  await page.route("**/api/bootstrap", async (route) => {
    await staleHold;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(staleBootstrap),
    });
  });
  await page.getByRole("button", { name: "刷新家庭记录" }).click();
  await row.click();
  await page.waitForFunction(
    (id) =>
      !document
        .querySelector(`[data-notice-id="${id}"]`)
        ?.classList.contains("unread"),
    noticeId,
  );
  assert.equal(
    db.prepare("SELECT read FROM notifications WHERE id=?").get(noticeId).read,
    1,
  );
  releaseStale();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".record-sync-button")
        ?.classList.contains("refreshing"),
  );
  assert.equal(await row.locator(".unread").count(), 0);
  assert.doesNotMatch(
    await row.getAttribute("class"),
    /unread/,
    "a late shared refresh cannot overwrite a successful local write",
  );
  await page.unroute("**/api/bootstrap");
  assert.ok(
    await page.evaluate(() =>
      Object.keys(sessionStorage).some((key) =>
        key.startsWith("jyb-task-draft:"),
      ),
    ),
    "the unsubmitted shared task draft remains in this tab",
  );
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "QA session expired" }),
    }),
  );
  await page.getByRole("button", { name: "刷新家庭记录" }).click();
  await page
    .getByRole("heading", { name: "登录家庭空间", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        Object.keys(sessionStorage).filter((key) =>
          key.startsWith("jyb-task-draft:"),
        ).length,
    ),
    0,
    "expired sessions must clear this account's drafts",
  );
  assert.equal(await page.locator(".app-shell").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Real adapter verified: shared records refresh without losing drafts; conflicts require review, expired deadlines remain visible, and late refreshes cannot overwrite successful saves.",
  );
} finally {
  await browser.close();
  for (const id of cleanupTasks) {
    db.prepare("DELETE FROM tasks WHERE id=?").run(id);
    db.prepare("DELETE FROM audit_logs WHERE target=?").run(id);
  }
  db.prepare("DELETE FROM notifications WHERE id=?").run(noticeId);
  db.close();
}
