import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createIsolatedAuthRuntime } from "./isolated-runtime.mjs";

const baseURL = process.env.BASE_URL ?? "http://localhost:3012";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("Local frontend required.");
const runtime = await createIsolatedAuthRuntime();
await runtime.ready;
const call = async (path, method = "GET", body, cookie) => {
  const response = await runtime.dispatchFetch(`http://jiayoubei.test${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
};
const password = `QA_${crypto.randomUUID()}`;
const admin = await call("/api/auth/setup", "POST", {
  email: "session-one@example.test",
  password,
  name: "会话一管理员",
});
assert.equal(admin.status, 200);
const firstState = await call("/api/bootstrap", "GET", undefined, admin.cookie);
const firstId = firstState.body.user.id;
const db = await runtime.getD1Database("DB");
const hash = await db
  .prepare("SELECT password_hash FROM users WHERE id=?")
  .bind(firstId)
  .first();
await db
  .prepare(
    "INSERT INTO users (id,name,role,avatar,phone,email,password_hash,family_id) VALUES ('QA_SECOND','会话二管理员','家庭管理员','二','','session-two@example.test',?,'QA_SECOND_FAMILY')",
  )
  .bind(hash.password_hash)
  .run();
const second = await call("/api/auth/login", "POST", {
  email: "session-two@example.test",
  password,
});
assert.equal(second.status, 200);
await call("/api/bootstrap", "GET", undefined, second.cookie);
await db
  .prepare(
    "INSERT INTO notifications (id,family_id,title,time) VALUES ('QA_PRIVATE_NOTICE',?,'第一家庭私有通知',?)",
  )
  .bind(firstState.body.family.id, new Date().toISOString())
  .run();
const task = await call(
  "/api/tasks",
  "POST",
  { title: "第一家庭核实任务", assignee: firstState.body.members[0].id },
  admin.cookie,
);
assert.equal(task.status, 201);
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on("pageerror", (cause) => errors.push(cause.message));
let storeModule;
page.on("response", (response) => {
  if (new URL(response.url()).pathname === "/lib/product-store.ts")
    storeModule = response.url();
});
const plans = new Map();
const requests = [];
function hold(path, status) {
  let release, start;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const entered = new Promise((resolve) => {
    start = resolve;
  });
  const plan = { wait, start, status };
  plans.set(path, [...(plans.get(path) ?? []), plan]);
  return { release, entered };
}
await context.route("**/api/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (!path.startsWith("/api/")) return route.continue();
  requests.push(path);
  const plan = plans.get(path)?.shift();
  const response = await runtime.dispatchFetch(`http://jiayoubei.test${path}`, {
    method: request.method(),
    headers: await request.allHeaders(),
    body: request.postData() ?? undefined,
  });
  const body = await response.text();
  if (plan) {
    plan.start();
    await plan.wait;
  }
  await route.fulfill(
    plan?.status
      ? {
          status: plan.status,
          contentType: "application/json",
          body: JSON.stringify({ error: "QA failed old request" }),
        }
      : {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body,
        },
  );
});
const setCookie = async (cookie) => {
  const [name, ...values] = cookie.split("=");
  await context.addCookies([
    {
      name,
      value: values.join("="),
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
};
const ready = async (id) =>
  page.waitForFunction(
    (id) =>
      window.qaStore?.getSnapshot().user.id === id &&
      window.qaStore.getSnapshot().hydrationStatus === "ready",
    id,
  );
const switchAccount = async (cookie, id) => {
  await page.evaluate(() => window.qaStore.endSession());
  await setCookie(cookie);
  await page.evaluate(() => window.qaStore.retryHydrate());
  await ready(id);
};
try {
  await setCookie(admin.cookie);
  await page.goto(`${baseURL}/tasks/${task.body.id}`, {
    waitUntil: "networkidle",
  });
  assert.ok(
    storeModule,
    "capture the same store module used by the rendered application",
  );
  await page.evaluate(async (url) => {
    window.qaStore = (await import(url)).productStore;
  }, storeModule);
  await ready(firstId);
  // A failed authenticated write clears both loaded records and this account's drafts.
  await page.getByLabel("完成证据与核实结果").fill("未提交的第一家庭核实草稿");
  const unauthorized = hold(`/api/tasks/${task.body.id}`, 401);
  await page.getByRole("button", { name: "保存处理记录" }).click();
  await unauthorized.entered;
  unauthorized.release();
  await page.getByRole("heading", { name: "登录家庭空间" }).waitFor();
  const cleared = await page.evaluate(() => ({
    state: window.qaStore.getSnapshot(),
    drafts: Object.keys(sessionStorage).filter((key) =>
      key.startsWith("jyb-task-draft:"),
    ),
  }));
  assert.equal(cleared.state.tasks.length, 0);
  assert.equal(cleared.state.members.length, 0);
  assert.equal(cleared.drafts.length, 0);
  await switchAccount(admin.cookie, firstId);
  // An old task page must not clear an error belonging to the new account.
  const oldTask = hold(`/api/tasks/${task.body.id}`);
  await page
    .getByRole("button", { name: "请求家庭成员帮助", exact: true })
    .click();
  await oldTask.entered;
  await switchAccount(second.cookie, "QA_SECOND");
  const newFailure = hold("/api/agent", 503);
  await page.evaluate(() => {
    window.qaNew = window.qaStore.sendMessage("你好！");
  });
  await newFailure.entered;
  newFailure.release();
  await page.evaluate(() => window.qaNew);
  const nextError = await page.evaluate(
    () => window.qaStore.getSnapshot().lastError,
  );
  assert.ok(nextError);
  const lateTaskResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/tasks/${task.body.id}` &&
      response.request().method() === "PATCH",
  );
  oldTask.release();
  await (await lateTaskResponse).finished();
  assert.equal(
    await page.evaluate(() => window.qaStore.getSnapshot().lastError),
    nextError,
  );
  await switchAccount(admin.cookie, firstId);
  // A late notification result cannot clear a newer account's active request.
  const notice = hold("/api/notifications/QA_PRIVATE_NOTICE/read");
  await page.evaluate(() => {
    window.qaOld = window.qaStore.markNotificationRead("QA_PRIVATE_NOTICE");
  });
  await notice.entered;
  await switchAccount(second.cookie, "QA_SECOND");
  const newAgent = hold("/api/agent");
  await page.evaluate(() => {
    window.qaNew = window.qaStore.sendMessage("你好！");
  });
  await newAgent.entered;
  notice.release();
  assert.equal(await page.evaluate(() => window.qaOld), false);
  assert.equal(
    await page.evaluate(() => window.qaStore.getSnapshot().busy),
    "agent",
  );
  assert.equal(
    await page.evaluate(
      () => window.qaStore.getSnapshot().notifications.length,
    ),
    0,
  );
  newAgent.release();
  await page.evaluate(() => window.qaNew);
  // Neither a late successful reply nor an error can repopulate the next account's conversation.
  for (const status of [undefined, 503]) {
    await switchAccount(admin.cookie, firstId);
    const oldAgent = hold("/api/agent", status);
    await page.evaluate(() => {
      window.qaOld = window.qaStore.sendMessage("你好！");
    });
    await oldAgent.entered;
    await switchAccount(second.cookie, "QA_SECOND");
    oldAgent.release();
    await page.evaluate(() => window.qaOld);
    const after = await page.evaluate(() => window.qaStore.getSnapshot());
    assert.equal(after.user.id, "QA_SECOND");
    assert.equal(after.aiMessages.length, 1);
    assert.equal(after.lastError, null);
    assert.equal(after.busy, null);
  }
  // CV metadata and resource writes may finish server-side, but never refresh a different account.
  for (const kind of ["cv", "member"]) {
    await switchAccount(admin.cookie, firstId);
    const late = hold(kind === "cv" ? "/api/cv/fall" : "/api/members");
    await page.evaluate((kind) => {
      window.qaOld = (
        kind === "cv"
          ? window.qaStore.reportVisionFall("video", 80, 0.2)
          : window.qaStore.addMember({ name: "第一家庭迟到资料" })
      ).then(
        () => "unexpected success",
        (cause) => cause.message,
      );
    }, kind);
    await late.entered;
    await switchAccount(second.cookie, "QA_SECOND");
    late.release();
    assert.match(await page.evaluate(() => window.qaOld), /会话已变更/);
    const after = await page.evaluate(() => window.qaStore.getSnapshot());
    assert.equal(after.user.id, "QA_SECOND");
    assert.equal(after.events.length, 0);
    assert.equal(after.members.length, 1);
    assert.equal(after.busy, null);
  }
  // An actual resource form cannot display old feedback in the next account.
  await switchAccount(admin.cookie, firstId);
  await page.evaluate(() => {
    history.pushState({}, "", "/members");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.getByRole("button", { name: "添加成员", exact: true }).click();
  const memberForm = page.getByRole("dialog");
  await memberForm
    .getByRole("textbox", { name: "姓名", exact: true })
    .fill("旧账号资料反馈验证");
  const oldMemberForm = hold("/api/members");
  await memberForm.getByRole("button", { name: "添加", exact: true }).click();
  await oldMemberForm.entered;
  await switchAccount(second.cookie, "QA_SECOND");
  const oldMemberResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/members" &&
      response.request().method() === "POST",
  );
  oldMemberForm.release();
  await (await oldMemberResponse).finished();
  await page.evaluate(async () => {
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  });
  assert.equal(await page.locator(".toast").count(), 0);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(
    await page.getByText("旧账号资料反馈验证", { exact: true }).count(),
    0,
  );
  // Browser subscription lookup can outlive a remote account switch.
  for (const button of ["退出登录", "关闭浏览器通知"]) {
    await switchAccount(admin.cookie, firstId);
    await page.evaluate(() => {
      history.pushState({}, "", "/settings");
      dispatchEvent(new PopStateEvent("popstate"));
      let release;
      const wait = new Promise((resolve) => {
        release = resolve;
      });
      window.qaSubscriptionLookup = false;
      window.qaReleaseSubscription = () =>
        release({
          pushManager: {
            getSubscription: async () => ({
              endpoint: "https://push.example.test/qa-session",
              unsubscribe: async () => {
                throw new Error("Unexpected unsubscribe");
              },
            }),
          },
        });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          getRegistration: () => {
            window.qaSubscriptionLookup = true;
            return wait;
          },
        },
      });
    });
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.waitForFunction(() => window.qaSubscriptionLookup);
    await switchAccount(second.cookie, "QA_SECOND");
    const before = requests.length;
    await page.evaluate(async () => {
      window.qaReleaseSubscription();
      // Drain the subscription, guard and caller continuations.
      for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    });
    assert.equal(requests.slice(before).includes("/api/auth/logout"), false);
    assert.equal(
      requests.slice(before).includes("/api/push/unsubscribe"),
      false,
    );
    assert.equal(
      await page.evaluate(() => window.qaStore.getSnapshot().user.id),
      "QA_SECOND",
    );
  }
  await context.route("**/api/push/vapid-key", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        publicKey: Buffer.alloc(65, 1).toString("base64url"),
      }),
    }),
  );
  await switchAccount(admin.cookie, firstId);
  await page.evaluate(() => {
    history.pushState({}, "", "/settings");
    dispatchEvent(new PopStateEvent("popstate"));
    let release;
    const wait = new Promise((resolve) => {
      release = resolve;
    });
    window.qaPermissionRequested = false;
    window.qaRegistrations = 0;
    window.qaReleasePermission = () => release("granted");
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        requestPermission: () => {
          window.qaPermissionRequested = true;
          return wait;
        },
      },
    });
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function () {},
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: async () => {
          window.qaRegistrations++;
          throw new Error("Unexpected service worker registration");
        },
      },
    });
  });
  await page
    .getByRole("button", { name: "开启浏览器通知", exact: true })
    .click();
  await page.waitForFunction(() => window.qaPermissionRequested);
  await switchAccount(second.cookie, "QA_SECOND");
  const beforeSubscribe = requests.length;
  await page.evaluate(async () => {
    window.qaReleasePermission();
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  });
  assert.equal(await page.evaluate(() => window.qaRegistrations), 0);
  assert.equal(
    requests.slice(beforeSubscribe).includes("/api/push/subscribe"),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Session boundaries verified using two isolated real accounts: failed writes clear records/drafts; late UI, notification, AI, CV and resource results cannot change the next account; stale browser permission/subscription waits cannot subscribe or log it out.",
  );
} finally {
  await browser.close();
  await runtime.dispose();
}
