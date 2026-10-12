import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createIsolatedAuthRuntime } from "./isolated-runtime.mjs";
const baseURL = process.env.BASE_URL ?? "http://localhost:3012";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error(
    "Use the local real-adapter frontend for this isolated check.",
  );
const runtime = await createIsolatedAuthRuntime();
await runtime.ready;
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const errors = [];
let latestPage;
async function context(width = 1280, failures = {}) {
  const value = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
  });
  await value.route("**/api/**", async (route) => {
    const request = route.request();
    if (!new URL(request.url()).pathname.startsWith("/api/"))
      return route.continue();
    const path = new URL(request.url()).pathname;
    if (
      (path === "/api/invitations" &&
        request.method() === "GET" &&
        failures.list) ||
      (path === "/api/auth/invitations/preview" && failures.preview)
    ) {
      failures.list = false;
      failures.preview = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "测试网络暂时不可用" }),
      });
    }
    const response = await runtime.dispatchFetch(
      `http://jiayoubei.test${new URL(request.url()).pathname}`,
      {
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postData() ?? undefined,
      },
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  const page = await value.newPage();
  latestPage = page;
  page.on("pageerror", (cause) => errors.push(cause.message));
  return { value, page };
}
try {
  const adminFailures = { list: true };
  const admin = await context(1280, adminFailures);
  await admin.page.goto(baseURL, { waitUntil: "networkidle" });
  await admin.page
    .getByRole("heading", { name: "创建你的家庭管理员账号" })
    .waitFor();
  const password = `QA_${crypto.randomUUID()}`;
  await admin.page
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill("ui-admin@example.test");
  await admin.page
    .getByRole("textbox", { name: "称呼", exact: true })
    .fill("邀请验证管理员");
  await admin.page.getByLabel("密码", { exact: true }).fill(password);
  await admin.page.getByRole("button", { name: "创建账号并进入" }).click();
  await admin.page
    .getByRole("heading", { name: /邀请验证管理员，家里的事一起照顾/ })
    .waitFor();
  await admin.page
    .getByRole("link", { name: "家庭成员", exact: true })
    .first()
    .click();
  await admin.page
    .getByRole("button", { name: "添加成员", exact: true })
    .click();
  const memberDialog = admin.page.getByRole("dialog");
  await memberDialog
    .getByRole("textbox", { name: "姓名", exact: true })
    .fill("邀请验证家人");
  await memberDialog.getByRole("button", { name: "添加", exact: true }).click();
  await admin.page
    .locator(".member-card")
    .filter({ hasText: "邀请验证家人" })
    .click();
  await admin.page.getByRole("button", { name: "邀请这位家人" }).click();
  const dialog = admin.page.getByRole("dialog");
  await dialog.getByRole("button", { name: "重新读取邀请" }).click();
  await dialog
    .getByRole("textbox", { name: "这位家人的邮箱" })
    .fill("ui-family@example.test");
  await dialog
    .getByRole("button", { name: "生成邀请链接", exact: true })
    .click();
  const link = await dialog
    .getByRole("textbox", { name: "邀请链接", exact: true })
    .inputValue();
  assert.match(link, /\/join#invite=/);
  await mkdir("test-results/ui-invitation", { recursive: true });
  await admin.page.screenshot({
    path: "test-results/ui-invitation/admin-dialog-1280.png",
  });
  const recipient = await context(390, { preview: true });
  await recipient.page.goto(link, { waitUntil: "networkidle" });
  await recipient.page.getByRole("button", { name: "重新检查邀请" }).click();
  await recipient.page
    .getByRole("heading", { name: /加入邀请验证管理员的家庭/ })
    .waitFor();
  assert.equal(
    await recipient.page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await recipient.page.screenshot({
    path: "test-results/ui-invitation/join-390.png",
    fullPage: true,
  });
  await recipient.page
    .getByRole("textbox", { name: "邀请时指定的邮箱" })
    .fill("ui-family@example.test");
  await recipient.page.getByLabel("设置登录密码").fill(password);
  await recipient.page.getByLabel("再次输入密码").fill(password);
  await recipient.page
    .getByRole("button", { name: "创建账号并加入家庭" })
    .click();
  await recipient.page
    .getByRole("heading", { name: /邀请验证家人，家里的事一起照顾/ })
    .waitFor();
  assert.equal(new URL(recipient.page.url()).hash, "");
  await recipient.page.screenshot({
    path: "test-results/ui-invitation/joined-390.png",
    fullPage: true,
  });
  await admin.page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await admin.page.getByRole("button", { name: "刷新家庭记录" }).click();
  await admin.page.getByText("已关联登录账号", { exact: true }).waitFor();
  await recipient.page.getByRole("button", { name: "更多功能" }).click();
  await recipient.page
    .getByRole("dialog")
    .getByRole("link", { name: "家庭成员", exact: true })
    .click();
  await recipient.page
    .locator(".member-card")
    .filter({ hasText: "邀请验证家人" })
    .click();
  assert.equal(
    await recipient.page
      .getByRole("button", { name: "编辑成员资料" })
      .isDisabled(),
    true,
  );
  assert.equal(
    await recipient.page.getByRole("button", { name: "邀请这位家人" }).count(),
    0,
  );
  const memberURL = admin.page.url();
  latestPage = admin.page;
  await admin.page.goto(`${baseURL}/tasks`, { waitUntil: "networkidle" });
  await admin.page
    .getByRole("button", { name: "新建任务", exact: true })
    .click();
  const taskDialog = admin.page.getByRole("dialog");
  await taskDialog
    .getByRole("textbox", { name: "任务标题" })
    .fill("求助协作验证任务");
  await taskDialog
    .getByRole("combobox", { name: /负责人/ })
    .selectOption({ label: "邀请验证家人" });
  await taskDialog
    .getByRole("button", { name: "创建任务", exact: true })
    .click();
  await admin.page
    .getByRole("heading", { name: "求助协作验证任务", exact: true })
    .waitFor();
  const taskURL = admin.page.url();
  await admin.page.goto(`${baseURL}/settings`, { waitUntil: "networkidle" });
  await admin.page
    .getByRole("button", { name: "修改登录密码", exact: true })
    .click();
  const passwordDialog = admin.page.getByRole("dialog");
  const updatedPassword = `QA_NEW_${crypto.randomUUID()}`;
  await passwordDialog
    .getByLabel("当前密码", { exact: true })
    .fill("wrong-password");
  await passwordDialog
    .getByLabel("新密码", { exact: true })
    .fill(updatedPassword);
  await passwordDialog
    .getByLabel("再次输入新密码", { exact: true })
    .fill(updatedPassword);
  await passwordDialog
    .getByRole("button", { name: "更新密码", exact: true })
    .click();
  await passwordDialog
    .getByRole("alert")
    .filter({ hasText: "当前密码不正确" })
    .waitFor();
  await passwordDialog.getByLabel("当前密码", { exact: true }).fill(password);
  await mkdir("test-results/ui-password", { recursive: true });
  await admin.page.screenshot({
    path: "test-results/ui-password/dialog-1280.png",
  });
  await admin.page.setViewportSize({ width: 390, height: 700 });
  const mobilePassword = await passwordDialog.evaluate((dialog) => ({
    width: dialog.getBoundingClientRect().width,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    fieldSizes: [...dialog.querySelectorAll("input")].map((input) =>
      parseFloat(getComputedStyle(input).fontSize),
    ),
  }));
  assert.equal(mobilePassword.overflow, false);
  assert.ok(mobilePassword.width <= 390);
  assert.ok(mobilePassword.fieldSizes.every((size) => size >= 16));
  await admin.page.screenshot({
    path: "test-results/ui-password/dialog-390.png",
  });
  await admin.page.setViewportSize({ width: 1280, height: 900 });
  await passwordDialog
    .getByRole("button", { name: "更新密码", exact: true })
    .click();
  await admin.page
    .getByText("登录密码已更新。其他设备需使用新密码登录。", { exact: true })
    .waitFor();
  await admin.page.reload({ waitUntil: "networkidle" });
  await admin.page
    .getByRole("heading", { name: "设置", exact: true })
    .waitFor();
  await admin.page.screenshot({
    path: "test-results/ui-password/settings-1280.png",
    fullPage: true,
  });
  await admin.page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await admin.page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await admin.page.screenshot({
    path: "test-results/ui-password/settings-390.png",
    fullPage: true,
  });
  await admin.page.setViewportSize({ width: 1280, height: 900 });
  await admin.page.goto(taskURL, { waitUntil: "networkidle" });
  await recipient.page.goto(taskURL, { waitUntil: "networkidle" });
  await recipient.page
    .getByRole("button", { name: "接受任务", exact: true })
    .click();
  await recipient.page
    .getByRole("button", { name: "请求家庭成员帮助", exact: true })
    .click();
  await recipient.page
    .getByRole("button", { name: "已请求家庭帮助" })
    .waitFor();
  await admin.page.goto(`${baseURL}/notifications`, {
    waitUntil: "networkidle",
  });
  const helpNotice = admin.page
    .locator(".notification-row")
    .filter({ hasText: "求助协作验证任务" });
  await helpNotice.click();
  await admin.page
    .getByRole("heading", { name: "求助协作验证任务", exact: true })
    .waitFor();
  await recipient.page.goto(`${baseURL}/notifications`, {
    waitUntil: "networkidle",
  });
  const recipientNotice = recipient.page
    .locator(".notification-row")
    .filter({ hasText: "求助协作验证任务" });
  assert.match(await recipientNotice.getAttribute("class"), /unread/);
  await recipient.page
    .getByRole("button", { name: "未读", exact: true })
    .click();
  await recipientNotice.waitFor();
  await recipientNotice.click();
  await recipient.page
    .getByRole("heading", { name: "求助协作验证任务", exact: true })
    .waitFor();
  await mkdir("test-results/ui-task-help", { recursive: true });
  await admin.page.screenshot({
    path: "test-results/ui-task-help/pending-1280.png",
    fullPage: true,
  });
  await admin.page
    .getByRole("button", { name: "接手这项任务", exact: true })
    .click();
  await admin.page
    .locator(".owner-row")
    .filter({ hasText: "邀请验证管理员" })
    .waitFor();
  assert.equal(
    await admin.page
      .getByText("家人正在请求协助，接手前请核对任务情况。", { exact: true })
      .count(),
    0,
  );
  await recipient.page.getByRole("button", { name: "刷新家庭记录" }).click();
  await recipient.page
    .locator(".owner-row")
    .filter({ hasText: "邀请验证管理员" })
    .waitFor();
  await recipient.page.screenshot({
    path: "test-results/ui-task-help/taken-390.png",
    fullPage: true,
  });
  await admin.page.goto(memberURL, { waitUntil: "networkidle" });
  await admin.page
    .getByRole("button", { name: "停止账号访问", exact: true })
    .click();
  const stopDialog = admin.page.getByRole("dialog");
  await admin.page.screenshot({
    path: "test-results/ui-invitation/revoke-dialog-1280.png",
  });
  await stopDialog.getByRole("button", { name: "确认停止访问" }).click();
  await admin.page.getByRole("button", { name: "邀请这位家人" }).waitFor();
  await recipient.page.getByRole("button", { name: "刷新家庭记录" }).click();
  await recipient.page.getByRole("heading", { name: "登录家庭空间" }).waitFor();
  await admin.page
    .getByRole("link", { name: "安全与审计", exact: true })
    .first()
    .click();
  const downloadPromise = admin.page.waitForEvent("download");
  await admin.page
    .getByRole("button", { name: "导出记录", exact: true })
    .click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /家有备审计记录.*\.csv$/);
  assert.equal(await download.failure(), null);
  await admin.page.getByText("生成审计导出文件", { exact: true }).waitFor();
  const taskLink = admin.page.getByRole("link", {
    name: "求助协作验证任务",
    exact: true,
  });
  assert.ok(
    (await taskLink.count()) > 0,
    "audit records should show the task's name and link",
  );
  await taskLink.first().click();
  await admin.page
    .getByRole("heading", { name: "求助协作验证任务", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Family account UI verified using isolated real APIs: invite read/preview retries, separate phone-sized join, ordinary member permissions, confirmed access revocation and old browser session returns to login.",
  );
} catch (cause) {
  console.error("Page errors:", errors);
  if (latestPage && !latestPage.isClosed()) {
    console.error(
      (await latestPage.locator("body").innerText()).slice(0, 2000),
    );
    await mkdir("test-results/ui-invitation", { recursive: true });
    await latestPage.screenshot({
      path: "test-results/ui-invitation/failure.png",
      fullPage: true,
    });
  }
  throw cause;
} finally {
  await browser.close();
  await runtime.dispose();
}
