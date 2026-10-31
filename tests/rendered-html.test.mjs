import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("ships the complete 家有备 collaborative safety application", async () => {
  const [page, catchAll, layout, app, models, mocks, store, apiClient, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/[...slug]/page.tsx"),
    read("app/layout.tsx"),
    read("app/JiaYouBeiApp.tsx"),
    read("lib/product-models.ts"),
    read("lib/product-mocks.ts"),
    read("lib/product-store.ts"),
    read("src/api/apiClient.ts"),
    read("package.json"),
  ]);

  assert.match(page, /JiaYouBeiApp/);
  assert.match(catchAll, /JiaYouBeiApp/);
  assert.match(layout, /家有备/);
  assert.match(app, /家庭安全协同 AI Agent/);
  assert.match(app, /事件中心/);
  assert.match(app, /授权中心/);
  assert.match(app, /Demo 控制台/);
  assert.match(models, /type ProductState/);
  assert.match(models, /EventStatus/);
  assert.match(mocks, /E001/);
  assert.match(mocks, /A004/);
  assert.match(store, /confirmAuthorization/);
  assert.match(store, /门锁属于 Critical 高风险动作/);
  assert.match(apiClient, /VITE_USE_MOCK/);
  assert.match(apiClient, /VITE_API_BASE_URL/);
  assert.match(packageJson, /lucide-react/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("keeps event, task, device and authorization IDs cross-linked", async () => {
  const mocks = await read("lib/product-mocks.ts");
  assert.match(mocks, /relatedTasks: \["T001"\]/);
  assert.match(mocks, /relatedAuthorizationId: "A004"/);
  assert.match(mocks, /sourceEventId: "E002"/);
  assert.match(mocks, /id: "D005"/);
  assert.match(mocks, /eventId: "E002"/);
});

test("covers deep detail, history, risk filters and voice interaction", async () => {
  const [app, models, mocks] = await Promise.all([
    read("app/JiaYouBeiApp.tsx"),
    read("lib/product-models.ts"),
    read("lib/product-mocks.ts"),
  ]);
  assert.match(models, /AuditLog[\s\S]*riskLevel: RiskLevel/);
  assert.match(mocks, /status: "rejected"/);
  assert.match(app, /历史授权/);
  assert.match(app, /可访问设备/);
  assert.match(await read("app/components/DeviceDetail.tsx"), /自动化规则/);
  assert.match(app, /风险级别/);
  assert.match(app, /语音输入/);
});

test("routes state-changing actions through replaceable API adapters", async () => {
  const [store, app] = await Promise.all([
    read("lib/product-store.ts"),
    read("app/JiaYouBeiApp.tsx"),
  ]);
  assert.match(store, /authorizationApi\.decide/);
  assert.match(store, /eventApi\.update/);
  assert.match(store, /taskApi\.update/);
  assert.match(store, /notificationApi\.markRead/);
  assert.match(store, /resetConversation\(\)/);
  assert.match(app, /productStore\.resetConversation\(\)/);
});

test("routes assistant messages through the agent adapter with a safe fallback", async () => {
  const store = await read("lib/product-store.ts");
  assert.match(store, /agentApi\.analyze/);
  assert.match(store, /未执行任何外部动作/);
});

test("shows member and device status directly on the dashboard", async () => {
  const dashboard = await read("app/components/CareHome.tsx");
  assert.match(dashboard, /care-family/);
  assert.match(dashboard, /state\.members/);
  assert.match(dashboard, /care-signals/);
  assert.match(dashboard, /state\.devices/);
});

test("attributes user actions to the current account", async () => {
  const store = await read("lib/product-store.ts");
  assert.match(store, /const actor = this\.state\.user\.name/);
  assert.doesNotMatch(store, /this\.audit\("林晓"/);
  assert.match(await read("app/components/QuietShell.tsx"), /state\.user\.avatar/);
});

test("ships the approved offline competition deck with an identical standalone copy", async () => {
  const deck = await read("public/competition/index.html");
  const slides = deck.match(/<section class="slide/g) ?? [];
  assert.equal(slides.length, 14);
  assert.match(deck, /多模态家庭协作 Agent/);
  assert.match(deck, /data-title="家庭订阅"/);
  assert.match(deck, /data:video\/webm;base64,/);
  assert.equal(deck, await read("家有备-创客比赛.html"));
});

test("retains the model, memory, tool and smart-home safety boundaries", async () => {
  const [agent, memory, tools, smartHome] = await Promise.all([
    read("lib/agent-engine.ts"),
    read("lib/memory-store.ts"),
    read("lib/tool-registry.ts"),
    read("lib/smart-home.ts"),
  ]);

  assert.match(agent, /规则模式/);
  assert.match(agent, /create_task,set_timeout,update_event_status/);
  assert.match(memory, /family_memories/);
  assert.match(tools, /write_audit_log/);
  assert.match(smartHome, /Home Assistant/);
  assert.match(smartHome, /门锁与第三方入户属于高风险动作/);
});
