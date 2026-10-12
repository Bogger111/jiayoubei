import assert from "node:assert/strict";
import { createIsolatedAuthRuntime } from "./isolated-runtime.mjs";
const runtime = await createIsolatedAuthRuntime();
const call = async (path, method = "GET", body, cookie) => {
  const response = await runtime.dispatchFetch(`http://jiayoubei.test${path}`, {
    method,
    signal: AbortSignal.timeout(8000),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `${method} ${path}: ${response.status} ${text.slice(0, 150)}`,
    );
  }
  return {
    status: response.status,
    body: parsed,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    cacheControl: response.headers.get("cache-control"),
    vary: response.headers.get("vary"),
  };
};
try {
  await runtime.ready;
  console.log("Isolated authentication runtime ready.");
  for (const path of [
    "/api/bootstrap",
    "/api/tasks",
    "/api/events",
    "/api/memory",
    "/api/tools",
    "/api/smart-home",
  ])
    assert.equal((await call(path)).status, 401, path);
  const password = `QA_${crypto.randomUUID()}`;
  const attempts = await Promise.all([
    call("/api/auth/setup", "POST", {
      email: "admin1@example.test",
      password,
      name: "隔离测试管理员",
    }),
    call("/api/auth/setup", "POST", {
      email: "admin2@example.test",
      password,
      name: "隔离测试管理员",
    }),
  ]);
  assert.deepEqual(
    attempts.map((result) => result.status).sort(),
    [200, 409],
    "only one first administrator may be created",
  );
  console.log("Concurrent first-account creation verified.");
  const winner = attempts.findIndex((result) => result.status === 200);
  const admin = attempts[winner];
  assert.ok(admin.cookie?.startsWith("jyb_session="));
  const bootstrap = await call(
    "/api/bootstrap",
    "GET",
    undefined,
    admin.cookie,
  );
  assert.equal(bootstrap.status, 200);
  assert.match(bootstrap.cacheControl, /private/);
  assert.match(bootstrap.cacheControl, /no-store/);
  assert.match(bootstrap.vary, /Cookie/i);
  const sessionInfo = await call(
    "/api/auth/me",
    "GET",
    undefined,
    admin.cookie,
  );
  assert.match(sessionInfo.cacheControl, /no-store/);
  assert.match((await call("/api/bootstrap")).cacheControl, /no-store/);
  assert.equal(
    bootstrap.body.members.length,
    1,
    "a real new family must not receive example people",
  );
  assert.equal(bootstrap.body.events.length, 0);
  assert.equal(
    (
      await call(
        "/api/families/current",
        "PATCH",
        { name: "隔离验证家庭", address: "QA fixture address" },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/families/current", "GET", undefined, admin.cookie)).body
      .family.name,
    "隔离验证家庭",
  );
  const greeting = await call(
    "/api/agent",
    "POST",
    { query: "你好！" },
    admin.cookie,
  );
  assert.equal(greeting.status, 200);
  assert.equal(greeting.body.analysis.riskLevel, "low");
  assert.equal(greeting.body.eventId, undefined);
  assert.deepEqual(greeting.body.taskIds, []);
  for (const query of [
    "怎么使用摔倒检测？",
    "如何预防老人摔倒？",
    "怎么创建家庭任务",
  ]) {
    const help = await call("/api/agent", "POST", { query }, admin.cookie);
    assert.equal(help.status, 200);
    assert.equal(help.body.analysis.riskLevel, "low");
    assert.equal(help.body.eventId, undefined);
    assert.deepEqual(help.body.taskIds, []);
  }
  assert.equal(
    (await call("/api/bootstrap", "GET", undefined, admin.cookie)).body.events
      .length,
    0,
    "information questions must not create incident records",
  );
  assert.equal(
    (await call("/api/memory", "GET", undefined, admin.cookie)).body.memories
      .length,
    0,
    "real mode must not seed example health records",
  );
  assert.equal(
    (
      await call("/api/auth/login", "POST", {
        email: "absent@example.test",
        password,
      })
    ).status,
    401,
  );
  const login = await call("/api/auth/login", "POST", {
    email: `admin${winner + 1}@example.test`,
    password,
  });
  assert.equal(login.status, 200);
  const db = await runtime.getD1Database("DB");
  const owner = await db
    .prepare("SELECT password_hash FROM users WHERE password_hash IS NOT NULL")
    .first();
  await db
    .prepare(
      "INSERT INTO users (id,name,role,avatar,phone,email,password_hash,family_id) VALUES ('QA_VIEWER','隔离测试成员','家庭成员','测','','viewer@example.test',?,'QA_FAMILY')",
    )
    .bind(owner.password_hash)
    .run();
  const viewer = await call("/api/auth/login", "POST", {
    email: "viewer@example.test",
    password,
  });
  assert.equal(viewer.status, 200);
  const invitedMember = await call(
    "/api/members",
    "POST",
    { name: "邀请测试成员", relation: "亲属", role: "老人" },
    admin.cookie,
  );
  assert.equal(invitedMember.status, 201);
  const invite = await call(
    "/api/invitations",
    "POST",
    { memberId: invitedMember.body.id, email: "invited@example.test" },
    admin.cookie,
  );
  assert.equal(invite.status, 201);
  assert.match(invite.body.token, /^[A-Za-z0-9_-]{43}$/);
  const inviteList = await call(
    "/api/invitations",
    "GET",
    undefined,
    admin.cookie,
  );
  assert.equal(inviteList.status, 200);
  assert.equal(inviteList.body.invitations[0].token, undefined);
  assert.equal(inviteList.body.invitations[0].tokenHash, undefined);
  assert.equal(
    (await call("/api/invitations", "GET", undefined, viewer.cookie)).status,
    403,
  );
  assert.equal(
    (
      await call("/api/auth/invitations/preview", "POST", {
        token: invite.body.token,
      })
    ).body.memberName,
    "邀请测试成员",
  );
  assert.equal(
    (
      await call("/api/auth/invitations/accept", "POST", {
        token: invite.body.token,
        email: "wrong@example.test",
        password,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/auth/invitations/accept", "POST", {
        token: invite.body.token,
        email: "invited@example.test",
        password,
        role: "admin",
      })
    ).status,
    400,
  );
  const joins = await Promise.all([
    call("/api/auth/invitations/accept", "POST", {
      token: invite.body.token,
      email: "invited@example.test",
      password,
    }),
    call("/api/auth/invitations/accept", "POST", {
      token: invite.body.token,
      email: "invited@example.test",
      password,
    }),
  ]);
  assert.equal(
    joins.filter((result) => result.status === 200).length,
    1,
    "an invitation may create exactly one account",
  );
  assert.ok(
    joins
      .filter((result) => result.status !== 200)
      .every((result) => [409, 410].includes(result.status)),
  );
  const joined = joins.find((result) => result.status === 200);
  assert.equal(joined.body.user.role, "家庭成员");
  const joinedState = await call(
    "/api/bootstrap",
    "GET",
    undefined,
    joined.cookie,
  );
  assert.equal(joinedState.status, 200);
  assert.equal(joinedState.body.family.id, bootstrap.body.family.id);
  assert.equal(
    joinedState.body.members.find(
      (member) => member.id === invitedMember.body.id,
    ).userId,
    joined.body.user.id,
  );
  assert.equal(
    (
      await call(
        "/api/invitations",
        "POST",
        { memberId: invitedMember.body.id, email: "again@example.test" },
        joined.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/members",
        "POST",
        { name: "unauthorized" },
        joined.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/auth/invitations/preview", "POST", {
        token: invite.body.token,
      })
    ).status,
    410,
  );
  const anotherMember = await call(
    "/api/members",
    "POST",
    { name: "撤销与过期测试" },
    admin.cookie,
  );
  const revoked = await call(
    "/api/invitations",
    "POST",
    { memberId: anotherMember.body.id, email: "another@example.test" },
    admin.cookie,
  );
  assert.equal(
    (
      await call(
        `/api/invitations/${revoked.body.id}`,
        "DELETE",
        undefined,
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/auth/invitations/accept", "POST", {
        token: revoked.body.token,
        email: "another@example.test",
        password,
      })
    ).status,
    410,
  );
  const expired = await call(
    "/api/invitations",
    "POST",
    { memberId: anotherMember.body.id, email: "another@example.test" },
    admin.cookie,
  );
  await db
    .prepare(
      "UPDATE family_invitations SET expires_at='2000-01-01T00:00:00Z' WHERE id=?",
    )
    .bind(expired.body.id)
    .run();
  assert.equal(
    (
      await call("/api/auth/invitations/preview", "POST", {
        token: expired.body.token,
      })
    ).status,
    410,
  );
  const rotated1 = await call(
    "/api/invitations",
    "POST",
    { memberId: anotherMember.body.id, email: "another@example.test" },
    admin.cookie,
  );
  const rotated2 = await call(
    "/api/invitations",
    "POST",
    { memberId: anotherMember.body.id, email: "another@example.test" },
    admin.cookie,
  );
  assert.equal(
    (
      await call("/api/auth/invitations/preview", "POST", {
        token: rotated1.body.token,
      })
    ).status,
    410,
  );
  assert.equal(
    (
      await call("/api/auth/invitations/preview", "POST", {
        token: rotated2.body.token,
      })
    ).status,
    200,
  );
  await db
    .prepare(
      "INSERT INTO users (id,name,role,avatar,phone,email,password_hash,family_id) VALUES ('QA_FOREIGN_ADMIN','其他家庭管理员','家庭管理员','测','','foreign-admin@example.test',?,'QA_FAMILY')",
    )
    .bind(owner.password_hash)
    .run();
  const foreignAdmin = await call("/api/auth/login", "POST", {
    email: "foreign-admin@example.test",
    password,
  });
  assert.equal(foreignAdmin.status, 200);
  assert.equal(
    (
      await call(
        "/api/invitations",
        "POST",
        { memberId: anotherMember.body.id, email: "foreign@example.test" },
        foreignAdmin.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/api/invitations/${rotated2.body.id}`,
        "DELETE",
        undefined,
        foreignAdmin.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (await call("/api/invitations", "GET", undefined, foreignAdmin.cookie)).body
      .invitations.length,
    0,
  );
  assert.equal(
    (
      await call(
        "/api/auth/invitations/accept",
        "POST",
        { token: rotated2.body.token, email: "another@example.test", password },
        admin.cookie,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/api/auth/invitations/preview", "POST", {
        token: rotated2.body.token,
      })
    ).status,
    200,
    "logged-in rejection must not consume the invitation",
  );
  const raceMember = await call(
    "/api/members",
    "POST",
    { name: "撤销加入并发验证" },
    admin.cookie,
  );
  const raceInvite = await call(
    "/api/invitations",
    "POST",
    { memberId: raceMember.body.id, email: "race@example.test" },
    admin.cookie,
  );
  const race = await Promise.all([
    call(
      `/api/invitations/${raceInvite.body.id}`,
      "DELETE",
      undefined,
      admin.cookie,
    ),
    call("/api/auth/invitations/accept", "POST", {
      token: raceInvite.body.token,
      email: "race@example.test",
      password,
    }),
  ]);
  assert.equal(
    race.filter((value) => value.status === 200).length,
    1,
    "revocation and acceptance have a single winner",
  );
  assert.ok(
    race
      .filter((value) => value.status !== 200)
      .every((value) => [409, 410].includes(value.status)),
  );
  const raceRecord = await db
    .prepare("SELECT used_at,revoked_at FROM family_invitations WHERE id=?")
    .bind(raceInvite.body.id)
    .first();
  assert.notEqual(Boolean(raceRecord.used_at), Boolean(raceRecord.revoked_at));
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM audit_logs WHERE target=? AND action IN ('成员接受邀请','撤销成员邀请')",
        )
        .bind(raceMember.body.id)
        .first()
    ).count,
    1,
  );
  const sameEmailMembers = await Promise.all(
    ["邮箱并发一", "邮箱并发二"].map((name) =>
      call("/api/members", "POST", { name }, admin.cookie),
    ),
  );
  const sameEmailInvites = await Promise.all(
    sameEmailMembers.map((value) =>
      call(
        "/api/invitations",
        "POST",
        { memberId: value.body.id, email: "shared-email@example.test" },
        admin.cookie,
      ),
    ),
  );
  assert.ok(sameEmailInvites.every((value) => value.status === 201));
  const sameEmailJoins = await Promise.all(
    sameEmailInvites.map((value) =>
      call("/api/auth/invitations/accept", "POST", {
        token: value.body.token,
        email: "shared-email@example.test",
        password,
      }),
    ),
  );
  assert.equal(
    sameEmailJoins.filter((value) => value.status === 200).length,
    1,
  );
  assert.ok(
    sameEmailJoins
      .filter((value) => value.status !== 200)
      .every((value) => value.status === 409),
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM users WHERE email='shared-email@example.test'",
        )
        .first()
    ).count,
    1,
  );
  const losingInvite =
    sameEmailInvites[sameEmailJoins.findIndex((value) => value.status !== 200)];
  assert.equal(
    (
      await call("/api/auth/invitations/preview", "POST", {
        token: losingInvite.body.token,
      })
    ).status,
    200,
    "failed account creation rolls back invitation consumption",
  );
  console.log(
    "Invitations verified: one-time join, ordinary role, family isolation, expiry, token rotation, logged-in rejection, revoke/join race and concurrent unique-email rollback.",
  );
  assert.equal(
    (
      await call(
        "/api/families/current",
        "PATCH",
        { name: "无权修改", address: "" },
        viewer.cookie,
      )
    ).status,
    403,
  );
  const pushKeys = {
    p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64)]).toString(
      "base64url",
    ),
    auth: Buffer.alloc(16).toString("base64url"),
  };
  const pushEndpoint =
    "https://fcm.googleapis.com/fcm/send/QA-isolated-fixture";
  assert.equal(
    (
      await call(
        "/api/push/subscribe",
        "POST",
        { endpoint: pushEndpoint, keys: pushKeys },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/push/subscribe",
        "POST",
        { endpoint: pushEndpoint, keys: pushKeys },
        viewer.cookie,
      )
    ).status,
    409,
  );
  await call(
    "/api/push/unsubscribe",
    "POST",
    { endpoint: pushEndpoint },
    viewer.cookie,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM push_subscriptions WHERE endpoint=?",
        )
        .bind(pushEndpoint)
        .first()
    ).count,
    1,
  );
  assert.equal(
    (await call("/api/bootstrap", "GET", undefined, viewer.cookie)).body.family
      .id,
    "QA_FAMILY",
  );
  assert.equal(
    (await call("/api/tools", "GET", undefined, viewer.cookie)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/tasks",
        "POST",
        { title: "无权创建", assignee: "QA_VIEWER" },
        viewer.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/members",
        "POST",
        { name: "must not create" },
        viewer.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/tools",
        "POST",
        { tool: "read_device_state" },
        viewer.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/cv/fall",
        "POST",
        { source: "camera", torsoAngle: 80, hipDrop: 0.2 },
        viewer.cookie,
      )
    ).status,
    403,
  );
  const linkedProfileEdit = await call(
    `/api/members/${invitedMember.body.id}`,
    "PATCH",
    { name: "改名后的家人", phone: "QA phone", role: "家庭管理员" },
    admin.cookie,
  );
  assert.equal(linkedProfileEdit.status, 200);
  const renamedState = await call(
    "/api/bootstrap",
    "GET",
    undefined,
    joined.cookie,
  );
  assert.equal(renamedState.body.user.name, "改名后的家人");
  assert.equal(
    renamedState.body.user.role,
    "家庭成员",
    "a profile role never changes account permissions",
  );
  assert.equal(
    renamedState.body.members.find(
      (member) => member.id === invitedMember.body.id,
    ).accountRole,
    "家庭成员",
  );
  const preservedTask = await call(
    "/api/tasks",
    "POST",
    {
      title: "保留协作任务",
      assignee: invitedMember.body.id,
      priority: "medium",
      dueAt: new Date(Date.now() + 3600000).toISOString(),
    },
    admin.cookie,
  );
  assert.equal(preservedTask.status, 201);
  const helpPath = `/api/tasks/${preservedTask.body.id}`;
  const requests = await Promise.all([
    call(helpPath, "PATCH", { helpRequested: true, version: 0 }, joined.cookie),
    call(helpPath, "PATCH", { helpRequested: true, version: 0 }, admin.cookie),
  ]);
  assert.deepEqual(requests.map((result) => result.status).sort(), [200, 409]);
  const helped = await call("/api/bootstrap", "GET", undefined, admin.cookie);
  const helpNotices = helped.body.notifications.filter(
    (notice) => notice.taskId === preservedTask.body.id,
  );
  assert.equal(
    helpNotices.length,
    1,
    "a concurrent help request creates only one linked notice",
  );
  assert.equal(helpNotices[0].read, false);
  assert.equal(
    (
      await call(
        `/api/notifications/${helpNotices[0].id}/read`,
        "POST",
        undefined,
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/bootstrap", "GET", undefined, admin.cookie)
    ).body.notifications.find((notice) => notice.id === helpNotices[0].id).read,
    true,
  );
  assert.equal(
    (
      await call("/api/bootstrap", "GET", undefined, joined.cookie)
    ).body.notifications.find((notice) => notice.id === helpNotices[0].id).read,
    false,
    "one family member cannot mark another member's message as read",
  );
  assert.equal(
    (
      await call(
        `/api/notifications/${helpNotices[0].id}/read`,
        "POST",
        undefined,
        foreignAdmin.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        "/api/notifications/read-all",
        "POST",
        undefined,
        joined.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/bootstrap", "GET", undefined, joined.cookie)
    ).body.notifications.find((notice) => notice.id === helpNotices[0].id).read,
    true,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM notification_reads WHERE notification_id=?",
        )
        .bind(helpNotices[0].id)
        .first()
    ).count,
    2,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT read FROM notifications WHERE id=?")
        .bind(helpNotices[0].id)
        .first()
    ).read,
    0,
  );
  const foreignNotices = await call(
    "/api/bootstrap",
    "GET",
    undefined,
    foreignAdmin.cookie,
  );
  assert.ok(
    !foreignNotices.body.notifications.some(
      (notice) => notice.taskId === preservedTask.body.id,
    ),
  );
  assert.equal(
    (
      await call(
        helpPath,
        "PATCH",
        {
          status: "in_progress",
          assignee: bootstrap.body.members[0].id,
          version: 1,
        },
        admin.cookie,
      )
    ).status,
    200,
  );
  const taken = await call("/api/bootstrap", "GET", undefined, joined.cookie);
  assert.equal(
    taken.body.tasks.find((task) => task.id === preservedTask.body.id)
      .helpRequested,
    false,
  );
  assert.equal(
    taken.body.notifications.find(
      (notice) => notice.taskId === preservedTask.body.id,
    ).read,
    true,
  );
  // Restore this unfinished task to verify that stopping an account preserves assignment/history.
  assert.equal(
    (
      await call(
        helpPath,
        "PATCH",
        {
          assignee: invitedMember.body.id,
          status: "to_receive",
          version: 2,
        },
        admin.cookie,
      )
    ).status,
    200,
  );
  console.log(
    "Task help verified: single atomic reminder, family scope, direct task link and clearing on takeover.",
  );
  const accountPath = `/api/members/${invitedMember.body.id}/account/revoke`;
  assert.equal(
    (await call(accountPath, "POST", undefined, joined.cookie)).status,
    403,
  );
  assert.equal(
    (await call(accountPath, "POST", undefined, foreignAdmin.cookie)).status,
    404,
  );
  const ownerMember = bootstrap.body.members[0];
  assert.equal(
    (
      await call(
        `/api/members/${ownerMember.id}/account/revoke`,
        "POST",
        undefined,
        admin.cookie,
      )
    ).status,
    403,
  );
  const joinedLogin = await call("/api/auth/login", "POST", {
    email: "invited@example.test",
    password,
  });
  assert.equal(joinedLogin.status, 200);
  const joinedPush = "https://fcm.googleapis.com/fcm/send/QA-joined-fixture";
  assert.equal(
    (
      await call(
        "/api/push/subscribe",
        "POST",
        { endpoint: joinedPush, keys: pushKeys },
        joined.cookie,
      )
    ).status,
    200,
  );
  const accountStops = await Promise.all([
    call(accountPath, "POST", undefined, admin.cookie),
    call(accountPath, "POST", undefined, admin.cookie),
  ]);
  assert.deepEqual(
    accountStops.map((value) => value.status).sort(),
    [200, 409],
  );
  assert.equal(
    (await call("/api/bootstrap", "GET", undefined, joined.cookie)).status,
    401,
  );
  assert.equal(
    (await call("/api/bootstrap", "GET", undefined, joinedLogin.cookie)).status,
    401,
  );
  assert.equal(
    (
      await call("/api/auth/login", "POST", {
        email: "invited@example.test",
        password,
      })
    ).status,
    401,
  );
  const afterStop = await call(
    "/api/bootstrap",
    "GET",
    undefined,
    admin.cookie,
  );
  assert.equal(
    afterStop.body.members.find((member) => member.id === invitedMember.body.id)
      .userId,
    undefined,
  );
  assert.equal(
    afterStop.body.tasks.find((task) => task.id === preservedTask.body.id)
      .assignee,
    invitedMember.body.id,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM push_subscriptions WHERE endpoint=?",
        )
        .bind(joinedPush)
        .first()
    ).count,
    0,
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM audit_logs WHERE target=? AND action='停止成员账号访问'",
        )
        .bind(invitedMember.body.id)
        .first()
    ).count,
    1,
  );
  const reInvite = await call(
    "/api/invitations",
    "POST",
    { memberId: invitedMember.body.id, email: "invited@example.test" },
    admin.cookie,
  );
  assert.equal(reInvite.status, 201);
  const reJoin = await call("/api/auth/invitations/accept", "POST", {
    token: reInvite.body.token,
    email: "invited@example.test",
    password,
  });
  assert.equal(reJoin.status, 200);
  assert.notEqual(reJoin.body.user.id, joined.body.user.id);
  assert.equal(
    (
      await call("/api/auth/login", "POST", {
        email: "INVITED@example.test",
        password,
      })
    ).body.user.id,
    reJoin.body.user.id,
  );
  assert.equal(
    (await call("/api/bootstrap", "GET", undefined, joined.cookie)).status,
    401,
  );
  console.log(
    "Member account management verified: protected administrators, atomic access revocation, retained profiles/tasks, revoked old sessions/subscriptions and rejoining with the same email.",
  );
  await db
    .prepare(
      "INSERT INTO audit_logs (id,family_id,actor,actor_type,time,target,action,reason,risk_level,result) VALUES ('QA_EXPORT_FOREIGN','QA_FAMILY','FOREIGN_MUST_NOT_EXPORT','user',?,'foreign','QA export foreign','fixture','normal','success')",
    )
    .bind(new Date().toISOString())
    .run();
  await db
    .prepare(
      "INSERT INTO audit_logs (id,family_id,actor,actor_type,time,target,action,reason,risk_level,result) VALUES ('QA_EXPORT_FORMULA',?,'QA export','user',?,'=HYPERLINK(\"QA\")','QA export formula','fixture','normal','success')",
    )
    .bind(bootstrap.body.family.id, new Date().toISOString())
    .run();
  assert.equal(
    (await call("/api/audit/exports", "POST", {}, viewer.cookie)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/audit/exports",
        "POST",
        { familyId: "QA_FAMILY" },
        admin.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call("/api/audit/exports", "POST", { risk: "unsafe" }, admin.cookie))
      .status,
    400,
  );
  assert.equal((await call("/api/audit/exports", "POST", {})).status, 401);
  const exportCount = await db
    .prepare("SELECT count(*) AS count FROM audit_logs WHERE family_id=?")
    .bind(bootstrap.body.family.id)
    .first();
  const exported = await call(
    "/api/audit/exports",
    "POST",
    { actor: "all", risk: "all", date: "all" },
    admin.cookie,
  );
  assert.equal(exported.status, 200);
  assert.equal(exported.body.count, exportCount.count);
  assert.doesNotMatch(exported.body.content, /FOREIGN_MUST_NOT_EXPORT/);
  assert.match(exported.body.content, /"'=HYPERLINK/);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM audit_logs WHERE family_id=? AND action='生成审计导出文件'",
        )
        .bind(bootstrap.body.family.id)
        .first()
    ).count,
    1,
  );
  const foreignExport = await call(
    "/api/audit/exports",
    "POST",
    { actor: "all", risk: "all", date: "all" },
    foreignAdmin.cookie,
  );
  assert.equal(foreignExport.status, 200);
  assert.match(foreignExport.body.content, /FOREIGN_MUST_NOT_EXPORT/);
  assert.doesNotMatch(foreignExport.body.content, /QA export formula/);
  console.log(
    "Audit export verified: administrator permission, family scope, valid filters, CSV formula escaping, exact export count and persisted generation record.",
  );
  await call("/api/auth/logout", "POST", undefined, login.cookie);
  assert.equal(
    (
      await db
        .prepare(
          "SELECT count(*) AS count FROM push_subscriptions WHERE endpoint=?",
        )
        .bind(pushEndpoint)
        .first()
    ).count,
    0,
    "logout revokes account push subscriptions",
  );
  assert.equal(
    (await call("/api/bootstrap", "GET", undefined, login.cookie)).status,
    401,
  );
  assert.equal(
    (await call("/api/bootstrap", "GET", undefined, admin.cookie)).status,
    401,
    "logout invalidates all older sessions for that account",
  );
  console.log(
    "Isolated real auth verified: private APIs, one administrator under concurrency, empty real-family records, login, member permissions and revoked sessions.",
  );
} finally {
  await runtime.dispose();
}
