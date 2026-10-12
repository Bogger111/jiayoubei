import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createIsolatedAuthRuntime } from "./isolated-runtime.mjs";
const baseURL = process.env.BASE_URL ?? "http://localhost:3012";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("Local frontend required.");
const runtime = await createIsolatedAuthRuntime();
await runtime.ready;
const call = async (path, body, cookie) => {
  const response = await runtime.dispatchFetch(`http://jiayoubei.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return {
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
};
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
let release;
const hold = new Promise((resolve) => {
  release = resolve;
});
let started;
const entered = new Promise((resolve) => {
  started = resolve;
});
let finished;
const delivered = new Promise((resolve) => {
  finished = resolve;
});
const errors = [];
try {
  const password = `QA_${crypto.randomUUID()}`;
  const admin = await call("/api/auth/setup", {
    email: "navigation-admin@example.test",
    name: "导航验证管理员",
    password,
  });
  const initialized = await runtime.dispatchFetch(
    "http://jiayoubei.test/api/bootstrap",
    { headers: { Cookie: admin.cookie } },
  );
  assert.equal(initialized.status, 200);
  await initialized.text();
  const member = await call(
    "/api/members",
    { name: "导航验证家人" },
    admin.cookie,
  );
  const invitation = await call(
    "/api/invitations",
    { memberId: member.body.id, email: "navigation-family@example.test" },
    admin.cookie,
  );
  const context = await browser.newContext();
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    const response = await runtime.dispatchFetch(
      `http://jiayoubei.test${path}`,
      {
        method: request.method(),
        headers: await request.allHeaders(),
        body: request.postData() ?? undefined,
      },
    );
    const body = await response.text();
    if (path === "/api/auth/invitations/accept") {
      assert.equal(response.status, 200);
      started();
      await hold;
    }
    try {
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body,
      });
    } catch (cause) {
      if (!request.failure()) throw cause;
    } finally {
      if (path === "/api/auth/invitations/accept") finished();
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (cause) => errors.push(cause.message));
  await page.goto(`${baseURL}/join#invite=${invitation.body.token}`, {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("textbox", { name: "邀请时指定的邮箱" })
    .fill("navigation-family@example.test");
  await page.getByLabel("设置登录密码").fill(password);
  await page.getByLabel("再次输入密码").fill(password);
  const aborted = page.waitForEvent(
    "requestfailed",
    (request) =>
      new URL(request.url()).pathname === "/api/auth/invitations/accept",
  );
  await page.getByRole("button", { name: "创建账号并加入家庭" }).click();
  await entered;
  await page.evaluate(() => {
    history.pushState({}, "", "/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByRole("heading", { name: "登录家庭空间" }).waitFor();
  assert.match((await aborted).failure().errorText, /ABORTED/);
  release();
  await delivered;
  assert.equal(
    new URL(page.url()).pathname,
    "/settings",
    "a late invitation response must not redirect the page",
  );
  assert.equal(
    await page.getByRole("heading", { name: "登录家庭空间" }).count(),
    1,
  );
  // The authorized server operation can already have finished; verify recovery by normal login.
  await page
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill("navigation-family@example.test");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("heading", { name: "设置", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/settings");
  await page.getByText("导航验证家人 · 家庭成员", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Invitation navigation verified: leaving aborts the browser request, a late response cannot redirect, and an already-created account can recover through normal login.",
  );
} finally {
  release();
  await browser.close();
  await runtime.dispose();
}
