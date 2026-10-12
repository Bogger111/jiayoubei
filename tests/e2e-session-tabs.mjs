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
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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
const errors = [];
try {
  const password = `QA_${crypto.randomUUID()}`;
  const admin = await call("/api/auth/setup", {
    email: "tabs-first@example.test",
    name: "同步一管理员",
    password,
  });
  const first = await call("/api/bootstrap", undefined, admin.cookie);
  const db = await runtime.getD1Database("DB");
  const owner = await db
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .bind(first.body.user.id)
    .first();
  await db
    .prepare(
      "INSERT INTO users (id,name,role,email,password_hash,family_id) VALUES ('QA_TABS_SECOND','同步二管理员','家庭管理员','tabs-second@example.test',?,'QA_TABS_SECOND_FAMILY')",
    )
    .bind(owner.password_hash)
    .run();
  const second = await call("/api/auth/login", {
    email: "tabs-second@example.test",
    password,
  });
  await call("/api/bootstrap", undefined, second.cookie);
  const task = await call(
    "/api/tasks",
    { title: "第一家庭标签页私有任务", assignee: first.body.members[0].id },
    admin.cookie,
  );
  for (const fallback of ["storage", "channel", "both"]) {
    const context = await browser.newContext();
    await context.addInitScript((fallback) => {
      if (fallback === "storage") window.BroadcastChannel = undefined;
      else if (fallback === "channel") {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "jyb-session-change-v1")
            throw new DOMException("QA restricted storage", "SecurityError");
          return original.call(this, key, value);
        };
      }
    }, fallback);
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
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    const login = await call("/api/auth/login", {
      email: "tabs-first@example.test",
      password,
    });
    await context.addCookies([
      {
        name: "jyb_session",
        value: login.cookie.slice("jyb_session=".length),
        url: baseURL,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const [page, sibling] = await Promise.all([
      context.newPage(),
      context.newPage(),
    ]);
    for (const target of [page, sibling])
      target.on("pageerror", (cause) => errors.push(cause.message));
    await Promise.all([
      page.goto(`${baseURL}/settings`, { waitUntil: "networkidle" }),
      sibling.goto(`${baseURL}/tasks/${task.body.id}`, {
        waitUntil: "networkidle",
      }),
    ]);
    await sibling
      .getByRole("textbox", { name: "完成证据与核实结果" })
      .fill("属于第一账号的未提交草稿");
    assert.equal(
      await sibling.evaluate(() =>
        Object.keys(sessionStorage).some((key) =>
          key.startsWith("jyb-task-draft:"),
        ),
      ),
      true,
    );
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await sibling
      .getByRole("heading", { name: "登录家庭空间", exact: true })
      .waitFor();
    assert.equal(
      await sibling
        .getByText("第一家庭标签页私有任务", { exact: true })
        .count(),
      0,
    );
    assert.equal(
      await sibling.evaluate(() =>
        Object.keys(sessionStorage).some((key) =>
          key.startsWith("jyb-task-draft:"),
        ),
      ),
      false,
    );
    await page
      .getByRole("textbox", { name: "邮箱", exact: true })
      .fill("tabs-second@example.test");
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await sibling
      .getByRole("heading", { name: "内容不存在", exact: true })
      .waitFor();
    await sibling
      .getByText("同步二管理员的家庭", { exact: true })
      .first()
      .waitFor();
    assert.equal(
      await sibling.getByText("同步一管理员的家庭", { exact: true }).count(),
      0,
    );
    const marker = await page.evaluate(() =>
      localStorage.getItem("jyb-session-change-v1"),
    );
    if (marker)
      assert.deepEqual(Object.keys(JSON.parse(marker)).sort(), [
        "revision",
        "source",
      ]);
    // Validate restoration handling with the browser's persisted-pageshow interface.
    const restoredRequest = sibling.waitForRequest(
      (request) => new URL(request.url()).pathname === "/api/bootstrap",
    );
    await sibling.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    await restoredRequest;
    await sibling
      .getByText("同步二管理员的家庭", { exact: true })
      .first()
      .waitFor();
    await context.close();
    console.log(
      `Session tab sync verified using ${fallback} fallback: logout clears the other tab/draft, login switches family, and restored pages recheck identity.`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await runtime.dispose();
}
