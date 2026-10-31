# 家有备：统一设备与 Agent 框架

家有备是一套可布置空间、可接入设备、可交给 Agent 统一安排的家庭协作框架。用户先建立自己的家庭空间、选择设备和访问权限，再由 Agent 根据当前状态准备完整计划。用户确认后，框架执行动作、读取状态，并保留每一步回执。

## 打开与演示

- 助手主页：<http://localhost:3000/>。大对话框为主视觉，顶部六个工作台入口始终保留；`/ai` 是同一助手的兼容入口。
- 设备工作台：<http://localhost:3000/devices>。
- 三维家庭空间：<http://localhost:3000/space>，保留四房家具样例与原生编辑器。
- 对话中可以输入“打开客厅主灯，把厨房窗帘调到50%”。
- 家庭记忆：<http://localhost:3000/memory>，既有演示动态、习惯、观察和向量缓存已经清空；重新进入页面不会自动填充。

在设备工作台点击“部署设备”，选择网关设备或样例设备。在设备设置中指定房间、关联家具和 Agent 访问权限。输入安排后查看整个计划，确认执行，再到三维空间查看同一份状态。也可以在三维设备控件中发起安排，使用相同的确认流程。

样例适配器会真实保存软件状态与回执；网关适配器调用实际 HTTP 接口并回读实体状态。两种来源在设备与回执中明确区分。

## 分层与文件

| 层 | 作用 | 主要文件 |
| --- | --- | --- |
| 产品界面 | 部署、房间与家具绑定、计划审阅、状态展示 | `app/components/HomeDeviceHub.tsx`、`HomeControlPlanDialog.tsx`、`HomeSpace.tsx` |
| 统一契约 | 设备、能力、参数范围、目标状态、执行回执、计划 | `lib/home-control.ts` |
| 家庭设备服务 | 家庭隔离、注册、权限、版本、计划、执行租约与持久化 | `lib/server/home-control-service.ts` |
| 设备适配器 | 隔离底层协议，提供发现与执行能力 | `lib/server/home-device-adapters.ts` |
| HTTP 入口 | 用户与界面的设备工作台接口 | `app/api/home-control/route.ts` |
| Agent 工具 | 读取设备与准备结构化计划 | `app/api/multimodal/mcp/route.ts`、`lib/server/multimodal-service.ts` |
| 主助手 | 真实模型多轮选择工具、读取当前状态、准备计划、核对回执 | `src/api/assistantApi.ts`、`app/api/assistant/route.ts`、`lib/server/assistant-service.ts` |

新增流程不再通过旧的 `sample_device` 布局接口修改状态。设备状态存入统一注册表，布局仍由原有空间服务负责；读取空间时合并设备与家具绑定。原有关怀业务的灯光接口继续作为兼容路径保留，新设备控制统一进入 `/api/home-control`。

## 设备能力

| 设备类型 | 统一能力 | 数值范围 |
| --- | --- | --- |
| 灯光 | 开、关、亮度 | 1–100% |
| 开关 | 开、关 | 无 |
| 窗帘 | 目标开合比例 | 0–100% |
| 温控 | 目标温度 | 16–30°C，同时受设备最小/最大温度约束 |
| 风扇 | 开、关、风速 | 0–100% |
| 加湿器 | 开、关、目标湿度 | 30–70% |
| 媒体设备 | 播放、暂停、音量 | 0–100% |
| 传感器、门锁、摄像头、安防及其他类型 | 读取状态 | 无执行能力 |

真实设备会结合 `supported_features`、`supported_color_modes` 过滤能力；只支持开关的灯不会向 Agent 暴露调光。仍需在实物联调中核验各品牌的状态和数值语义。

## 真实网关接入

首个网关适配器对接 Home Assistant REST API。原有 ESPHome、MQTT 或其他品牌设备先在 Home Assistant 中配置，再在家有备中发现并逐台选择。没有直接实现原生 MQTT、Matter 或 ESP32 固件。

在本机后台配置文件 `.dev.vars` 中维护以下变量，保留原文件的其他设置，修改后重启应用：

```dotenv
DEVICE_DRIVER=home_assistant
HOME_ASSISTANT_URL=http://你的家庭网关地址:8123
HOME_ASSISTANT_TOKEN=在本机填写网关访问令牌
HOME_ASSISTANT_FAMILY_ID=F001
```

令牌只在服务端读取，设备页没有凭据输入或显示入口。按当前家庭 ID 检查网关绑定，不连接其他家庭的网关。真实连接中断时返回离线状态，不用样例值代替。

实际调用 `GET /api/states` 发现与同步，`POST /api/services/{domain}/{service}` 执行动作，`GET /api/states/{entity_id}` 回读状态。接口依据：[Home Assistant REST API](https://contributors.home-assistant.io/core/internals/rest-api/)。HTTP 接收成功与状态回读成功分别记录为 `accepted` 和 `verified`。

## Agent 接入契约

现有 MCP JSON-RPC 入口为 `/api/multimodal/mcp`。真实模式使用当前已认证家庭会话。新工具是：

1. `home.devices`：返回当前家庭已部署设备、房间、状态、允许能力以及参数范围。
2. `home.control.prepare`：接收设备 ID、能力与目标数值组成的步骤，创建待批准计划，返回计划 ID、版本、过期时间和全部步骤。

准备请求示例：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "home.control.prepare",
    "arguments": {
      "title": "晚间客厅安排",
      "steps": [
        {"deviceId": "light.living_room", "capability": "set_brightness", "value": 60},
        {"deviceId": "cover.kitchen_blind", "capability": "set_cover_position", "value": 50}
      ]
    }
  }
}
```

模型通过 `tools/list` 发现工具。设备 ID 与能力必须来自 `home.devices` 的当前结果，不能凭空编造。批准工具不暴露给 Agent。用户在家有备界面确认后，由已认证管理员调用 `/api/home-control` 的 `approve` 操作。

主助手通过 `/api/assistant` 调用真实模型。模型先用 `devices_list` 获取当前设备及允许能力，再用 `devices_plan` 创建完整计划；结果卡使用已有批准组件，直接在对话里确认并查看回执。`devices_plan_status` 可读取既有计划的真实状态。没有向模型开放批准工具。

设备页的中文指令解析与原 `/api/agent` 兼容路径继续保留。它们是确定性入口；主助手使用新的模型工具循环，不再将前端关键词匹配当作 AI 规划。记忆、三维与家庭任务也在同一工具循环中，详见 [助手与工具实测](助手与工具实测.md)。

## 状态与执行规则

计划的生命周期为：`pending → running → completed / accepted / failed / unknown`，也可取消或过期。一次最多 12 台设备，一台设备指定一个目标；计划有效期 5 分钟。

批准时重新检查家庭、管理员身份、设备权限、设置版本、可用状态与已审阅的状态。计划通过数据库版本条件只领取一次；设备集合另有租约，避免两份计划同时控制同一台设备。执行中不能修改设备设置。过期租约可释放，失去确定结果的计划保留 `unknown`，不会自动重发。

步骤依次执行，每一步保存来源、状态、说明和时间。遇到失败或不确定结果时暂缓后续动作。实际网关返回 `accepted` 时保留等待状态，需要重新读取核对；`verified` 表示实体回读符合目标，不代表独立传感器对物理效果的测量。

## 新增协议适配器

1. 实现 `HomeDeviceAdapter` 的 `driver`、`discover()`、`execute(device, action)`。
2. 将返回状态映射为统一 `SpaceEntity`，将执行结果映射为 `HomeReceipt`。
3. 扩展 `HomeDriver` 与适配器工厂，在服务端保存连接资料，继续使用家庭绑定。
4. 沿用统一注册、能力白名单、参数校验、计划审阅与执行租约，不另开绕过批准的接口。
5. 用协议契约测试和实物测试分别核验，再放入产品入口。

## 数据与验收

D1 新表：`home_device_registry`、`home_device_settings`、`home_control_plans`、`home_control_leases`。原三维布局、历史与媒体保持独立。家庭记忆清理只影响当前家庭的 `home_journal`、`family_memories`、`home_observations`、`home_memory_vectors`，不会清除空间、设备部署或执行回执。

```powershell
npm run typecheck
npm run test:unit
npm run build
npm run test:home-control:api
npm run test:home-control:e2e
npm run test:assistant:api
npm run test:assistant:home
npm run test:space:api
npm run test:space:e2e
```

API 检查使用临时隔离 D1 与本机契约网关，覆盖真实 HTTP 路径、批准竞争、回读、掉线、家庭隔离、家具绑定、样例持久化、记忆清理。浏览器检查在隔离家庭中完成部署、设置、两设备计划、确认、刷新、三维同步和主聊天入口；同时检查 390px 手机页面。

检查记录与截图在被 Git 忽略的 `test-results/home-upgrade/`：`home-control-browser-results.json`、`control-plan-review.png`、`control-hub-desktop.png`、`control-hub-mobile.png`、`control-space-desktop.png`。真实模型多轮调用另见 `assistant-live-result.json`：模型保存记忆、读取设备并生成包含亮度及窗帘位置的计划，确认前状态不变，批准后取得样例设备逐项回执。没有已连接的实物网关或 ESP32，不把契约网关与样例适配器当作实物联调结果。
