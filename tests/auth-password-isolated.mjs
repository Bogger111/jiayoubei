import assert from "node:assert/strict";
import { createIsolatedAuthRuntime } from "./isolated-runtime.mjs";
const runtime = await createIsolatedAuthRuntime();
const call = async (path, body, cookie) => {
  const response = await runtime.dispatchFetch(`http://jiayoubei.test${path}`, {
    method: body ? "POST" : "GET",
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
try {
  await runtime.ready;
  const password = `QA_${crypto.randomUUID()}`;
  const admin = await call("/api/auth/setup", {
    email: "password-admin@example.test",
    name: "密码验证管理员",
    password,
  });
  assert.equal(admin.status, 200);
  const state = await call("/api/bootstrap", undefined, admin.cookie);
  const secondLogin = await call("/api/auth/login", {
    email: "password-admin@example.test",
    password,
  });
  const db = await runtime.getD1Database("DB");
  const user = await db
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .bind(state.body.user.id)
    .first();
  await db
    .prepare(
      "INSERT INTO users (id,name,role,email,password_hash,family_id) VALUES ('QA_PASSWORD_OTHER','其他家人','家庭成员','password-other@example.test',?,?)",
    )
    .bind(user.password_hash, state.body.family.id)
    .run();
  const other = await call("/api/auth/login", {
    email: "password-other@example.test",
    password,
  });
  for (const [id, userId] of [
    ["QA_PW_PUSH_SELF", state.body.user.id],
    ["QA_PW_PUSH_OTHER", "QA_PASSWORD_OTHER"],
  ])
    await db
      .prepare(
        "INSERT INTO push_subscriptions (id,family_id,user_id,endpoint,p256dh,auth) VALUES (?,?,?,?,'QA key','QA auth')",
      )
      .bind(
        id,
        state.body.family.id,
        userId,
        `https://fcm.googleapis.com/fcm/send/${id}`,
      )
      .run();
  assert.equal(
    (
      await call("/api/auth/password", {
        currentPassword: password,
        newPassword: "new-password",
      })
    ).status,
    401,
  );
  for (const body of [
    { currentPassword: "wrong-password", newPassword: "new-password" },
    { currentPassword: password, newPassword: "short" },
    { currentPassword: password, newPassword: password },
    {
      currentPassword: password,
      newPassword: "new-password",
      userId: "QA_PASSWORD_OTHER",
    },
  ])
    assert.equal(
      (await call("/api/auth/password", body, admin.cookie)).status,
      400,
    );
  const candidates = [
    `QA_NEW_${crypto.randomUUID()}`,
    `QA_NEW_${crypto.randomUUID()}`,
  ];
  const changes = await Promise.all(
    candidates.map((newPassword) =>
      call(
        "/api/auth/password",
        { currentPassword: password, newPassword },
        admin.cookie,
      ),
    ),
  );
  assert.equal(changes.filter((result) => result.status === 200).length, 1);
  assert.ok(
    changes
      .filter((result) => result.status !== 200)
      .every((result) => [401, 409].includes(result.status)),
  );
  const winner = changes.findIndex((result) => result.status === 200);
  assert.equal(
    (await call("/api/bootstrap", undefined, changes[winner].cookie)).status,
    200,
  );
  for (const cookie of [admin.cookie, secondLogin.cookie])
    assert.equal((await call("/api/bootstrap", undefined, cookie)).status, 401);
  assert.equal(
    (
      await call("/api/auth/login", {
        email: "password-admin@example.test",
        password,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/api/auth/login", {
        email: "password-admin@example.test",
        password: candidates[winner],
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/bootstrap", undefined, other.cookie)).status,
    200,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM audit_logs WHERE action='更新登录密码'",
        )
        .first()
    ).count,
    1,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM push_subscriptions WHERE user_id=?",
        )
        .bind(state.body.user.id)
        .first()
    ).count,
    0,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM push_subscriptions WHERE user_id='QA_PASSWORD_OTHER'",
        )
        .first()
    ).count,
    1,
  );
  console.log(
    "Password update verified: current-password check, valid input, one concurrent winner/audit, fresh current cookie, invalid old passwords/sessions/subscriptions, and other members preserved.",
  );
} finally {
  await runtime.dispose();
}
