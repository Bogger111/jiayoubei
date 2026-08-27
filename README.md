# 家有备｜家庭安全协同 AI Agent

家有备不是普通聊天机器人或智能家居面板，而是一套可演示的家庭安全任务编排与协同前端：

> 事件识别 → 情况理解 → 任务拆解 → 家庭协同 → 权限判断 → 人工确认 → 状态回传 → 审计留痕

核心边界：**AI 负责理解与规划，规则负责边界，人工负责关键确认。**

## 技术栈

仓库原有技术栈为 Next.js 16 + React 19 + TypeScript + vinext/Vite，因此本次保留并扩展现有架构，没有迁移到 Vue，也没有破坏原有 Cloudflare D1、Agent、工具注册中心和 Home Assistant 适配代码。

- Next.js 16 / React 19 / TypeScript
- vinext + Vite 8
- Lucide React
- 集中式 `useSyncExternalStore` 产品状态
- Mock / Real API Adapter
- Playwright Core + 本机 Chrome 端到端自测

## 启动

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000/`。

质量检查：

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e   # 先保持 npm run dev 正在运行
npm run build
npm run test:production
```

生产本地运行使用 Cloudflare Workers 运行时，而不是 Node 直接加载 Worker 特殊模块：

```bash
npm run build
npm run start -- --port 3000
```

`npm run test:e2e` 还会验证 Critical 授权规则、任务证据与家庭确认、非法详情 ID、Dialog 键盘焦点以及 SSR 深层路由首屏。

## Mock / Real API 切换

复制 `.env.example` 为 `.env`：

```dotenv
VITE_USE_MOCK=true
VITE_API_BASE_URL=http://localhost:8000
```

- `VITE_USE_MOCK=true`：完整演示模式，不需要真实 FastAPI、模型或设备。
- `VITE_USE_MOCK=false`：启动时请求 `VITE_API_BASE_URL/api/bootstrap`；各领域 API 位于 `src/api/`。
- 页面只依赖产品 Store；切换后端不需要修改页面组件。
- 真实 API 不可用时，界面显示可恢复的错误状态，不会执行外部动作。

领域 Adapter：

- `src/api/apiClient.ts`
- `src/api/familyApi.ts`
- `src/api/eventApi.ts`
- `src/api/taskApi.ts`
- `src/api/deviceApi.ts`
- `src/api/agentApi.ts`

## 路由

- `/welcome` 启动页
- `/onboarding` 新手引导
- `/` 或 `/dashboard` 家庭总览
- `/ai` AI 助手
- `/events`、`/events/:id` 事件中心与详情
- `/tasks`、`/tasks/:id` 家庭任务与详情
- `/authorizations` 授权中心与高风险确认
- `/members`、`/members/:id` 家庭成员与详情
- `/devices`、`/devices/:id` 智能设备与详情
- `/services` 服务资源
- `/audit` 安全与审计
- `/notifications` 通知中心
- `/settings` 设置
- `/demo` Demo 控制台

`app/[...slug]/page.tsx` 提供深层路由回退，直接刷新任意前端路由不会白屏。

## 核心 Demo

### 老人长时间未活动

1. 打开 `/demo`。
2. 触发“老人长时间未活动”。
3. 自动进入 `E001` 事件详情。
4. 连续点击“推进下一步”，观察消息确认、超时升级、邻居确认和事件解决。
5. 点击关联任务，确认任务已完成并写入证据。
6. 打开安全与审计，查看完整留痕。

### 陌生人请求开门

1. 打开 `/demo`，触发“陌生人请求开门”。
2. 系统先由安全规则拦截门锁，进入授权确认弹窗。
3. 查看 AI 意图、原因、设备和可能后果。
4. 选择“拒绝”。门锁不执行，通知消失，事件时间线增加“操作已拦截”。
5. `/audit` 中记录拒绝原因和 `blocked` 结果。

## 数据与状态

统一模型位于 `lib/product-models.ts`，Mock 数据位于 `lib/product-mocks.ts`，所有对象使用真实 ID 交叉关联，例如：

- `E001 → T001 → M003 → D001/D002`
- `E002 → T003 → A004 → D005`

跨页联动由 `lib/product-store.ts` 完成：授权、事件 Timeline、任务、通知和审计日志会在同一状态链中更新。

## 当前未接入真实后端的领域

完整的产品前端与 Mock 闭环已经可用；以下领域仍需要后续 FastAPI 实现对应 Adapter：

- `/api/bootstrap` 产品全量初始化接口
- 事件、任务、授权、成员、通知和服务资源持久化
- 真实图片/语音上传
- 第三方消息、物业、医生、跑腿与宠物服务
- 真实门锁/摄像头执行（仍必须保留人工确认）

原有 Agent、D1 记忆、工具注册中心和 Home Assistant 代码继续保留在 `lib/`、`db/` 与现有 `/api/*` 中。
