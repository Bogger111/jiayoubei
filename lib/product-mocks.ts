import type { AuditLog, Authorization, Device, Event, Family, FamilyMember, Notification, ServiceProvider, Task, User } from "./product-models";

// A fixed clock keeps server and client HTML deterministic during hydration.
const DEMO_NOW = Date.parse("2026-08-24T14:30:00.000Z");
const ago = (minutes: number) => new Date(DEMO_NOW - minutes * 60_000).toISOString();
const when = (minutes: number) => new Date(DEMO_NOW + minutes * 60_000).toISOString();

export const mockUser: User = { id: "U001", name: "奕博", role: "家庭管理员", avatar: "奕", phone: "138****4206" };
export const mockFamily: Family = { id: "F001", name: "林家", ownerId: "U001", address: "杭州市西湖区文新街道", timezone: "Asia/Shanghai", mode: "mock" };
export const mockMembers: FamilyMember[] = [
  { id: "M001", name: "林秀兰", relation: "母亲", role: "老人", avatar: "兰", online: true, location: "家中 · 粗粒度定位", currentTaskId: "T001", permissions: ["基础健康档案", "安全确认消息"], phone: "139****1802", emergencyContact: true },
  { id: "M002", name: "林建国", relation: "父亲", role: "成年成员", avatar: "国", online: false, location: "宁波 · 出差中", permissions: ["家庭动态"], phone: "137****3918", emergencyContact: true },
  { id: "M003", name: "林晓", relation: "女儿", role: "家庭管理员", avatar: "晓", online: true, location: "上海 · 粗粒度定位", currentTaskId: "T001", permissions: ["全部家庭档案", "设备控制", "授权管理"], phone: "138****4206", emergencyContact: true },
  { id: "M004", name: "林可宁", relation: "外孙女", role: "儿童", avatar: "宁", online: true, location: "学校 · 日程内", permissions: ["接送任务"], phone: "—", emergencyContact: false },
  { id: "M005", name: "王阿姨", relation: "邻居", role: "临时照护者", avatar: "王", online: true, location: "同楼 · 已授权到 22:00", permissions: ["上门安全确认"], phone: "136****7721", emergencyContact: true },
];

export const mockDevices: Device[] = [
  { id: "D001", name: "入户门磁", kind: "security", room: "玄关", state: "closed", reading: "3 小时 12 分钟无开门", online: true, riskLevel: "attention", lastSync: ago(2), source: "simulator", permission: "读取", relatedEventIds: ["E001", "E002"] },
  { id: "D002", name: "客厅存在传感器", kind: "security", room: "客厅", state: "clear", reading: "1 小时 08 分钟无活动", online: true, riskLevel: "normal", lastSync: ago(3), source: "simulator", permission: "读取", relatedEventIds: ["E001"] },
  { id: "D003", name: "厨房烟雾报警器", kind: "environment", room: "厨房", state: "normal", reading: "未检测到烟雾", online: true, riskLevel: "normal", lastSync: ago(1), source: "simulator", permission: "读取 · 硬告警", relatedEventIds: ["E003"] },
  { id: "D004", name: "燃气报警器", kind: "environment", room: "厨房", state: "normal", reading: "燃气浓度正常", online: true, riskLevel: "normal", lastSync: ago(1), source: "simulator", permission: "读取 · 硬告警", relatedEventIds: ["E003"] },
  { id: "D005", name: "入户智能门锁", kind: "lock", room: "玄关", state: "locked", reading: "已上锁", online: true, riskLevel: "warning", lastSync: ago(1), source: "local", permission: "永远需要人工确认", relatedEventIds: ["E002"] },
  { id: "D006", name: "客厅摄像头", kind: "camera", room: "客厅", state: "privacy", reading: "隐私遮罩开启", online: true, riskLevel: "normal", lastSync: ago(4), source: "local", permission: "永远需要人工确认", relatedEventIds: [] },
  { id: "D007", name: "客厅主灯", kind: "lighting", room: "客厅", state: "off", reading: "已关闭", online: true, riskLevel: "normal", lastSync: ago(12), source: "local", permission: "确认后执行", relatedEventIds: [] },
  { id: "D008", name: "老人智能药盒", kind: "health", room: "卧室", state: "confirmed", reading: "今日 08:12 已服药", online: false, riskLevel: "attention", lastSync: ago(48), source: "real", permission: "读取", relatedEventIds: [] },
];

export const mockTasks: Task[] = [
  { id: "T001", title: "联系老人确认当前状态", description: "发送低打扰确认消息；若 10 分钟无响应，再由家庭管理员电话联系。", assignee: "M003", creator: "家有备 AI", sourceEventId: "E001", priority: "high", status: "waiting_confirmation", dueAt: when(8), evidence: "已读取门磁、存在传感器，烟雾与燃气正常。" },
  { id: "T002", title: "复核厨房安全传感器", description: "确认烟雾和燃气状态，记录现场或设备证据。", assignee: "M001", creator: "家有备 AI", sourceEventId: "E003", priority: "urgent", status: "to_receive", dueAt: when(18) },
  { id: "T003", title: "确认陌生访客身份", description: "在授权边界内核实访客，不执行自动开锁。", assignee: "M003", creator: "家有备 AI", sourceEventId: "E002", priority: "high", status: "waiting_confirmation", dueAt: when(5) },
  { id: "T004", title: "补充宠物晚餐照片记录", description: "完成喂食后上传一张照片作为完成证据。", assignee: "M005", creator: "林晓", sourceEventId: "E004", priority: "medium", status: "overdue", dueAt: ago(24) },
  { id: "T005", title: "每周家庭应急联系人检查", description: "确认联系人电话和可用时段没有变化。", assignee: "M003", creator: "林晓", sourceEventId: "E005", priority: "low", status: "completed", dueAt: ago(60), evidence: "5 位联系人已完成验证。" },
];

const baseTimeline = (id: string, title: string, detail: string, actor: string, tone: "info" | "success" | "warning" | "critical", minutes: number) => ({ id, time: ago(minutes).slice(11, 16), title, detail, actor, tone });
export const mockEvents: Event[] = [
  { id: "E001", title: "老人长时间未活动", description: "林秀兰超过日常回复间隔，电话暂未接通。", riskLevel: "attention", status: "processing", source: "家庭成员报告 + 设备信号", createdAt: ago(24), updatedAt: ago(2), relatedMembers: ["M001", "M003"], relatedDevices: ["D001", "D002", "D003", "D004"], relatedTasks: ["T001"], aiAssessment: "独居成员超过平时回复间隔，但目前没有烟雾或燃气硬告警。建议低打扰确认并逐级升级。", timeline: [baseTimeline("L001", "事件被创建", "小林报告母亲超过 3 小时未回复。", "林晓", "info", 24), baseTimeline("L002", "AI 完成风险判断", "命中独居档案、门磁与存在传感器信号。", "家有备 AI", "info", 23), baseTimeline("L003", "已创建家庭任务", "向林晓请求确认，等待人工推进。", "系统规则", "warning", 21)] },
  { id: "E002", title: "陌生访客请求入户", description: "门锁收到陌生访客请求，身份信息尚未完成确认。", riskLevel: "critical", status: "pending_confirmation", source: "门锁设备", createdAt: ago(7), updatedAt: ago(1), relatedMembers: ["M003", "M005"], relatedDevices: ["D001", "D005", "D006"], relatedTasks: ["T003"], relatedAuthorizationId: "A004", aiAssessment: "AI 可以协助核对访客信息，但无权直接打开门锁；必须由家庭管理员人工确认。", timeline: [baseTimeline("L101", "门锁检测到访客请求", "入户门锁保持上锁，未执行任何动作。", "入户智能门锁", "critical", 7), baseTimeline("L102", "风险规则拦截自动开锁", "门锁属于高风险资源，强制进入授权确认。", "安全规则", "critical", 6)] },
  { id: "E003", title: "厨房烟雾异常", description: "厨房烟雾传感器曾出现短时波动，当前已恢复正常。", riskLevel: "warning", status: "resolved", source: "烟雾报警器", createdAt: ago(180), updatedAt: ago(170), relatedMembers: ["M001"], relatedDevices: ["D003", "D004"], relatedTasks: ["T002"], aiAssessment: "硬告警优先于模型判断，已请求人工复核后恢复正常。", timeline: [baseTimeline("L201", "检测到短时异常", "烟雾读数超过关注阈值。", "厨房烟雾报警器", "warning", 180), baseTimeline("L202", "人工复核完成", "林秀兰确认正在做饭，未发现持续风险。", "林秀兰", "success", 170)] },
  { id: "E004", title: "宠物喂食任务超时", description: "晚餐喂食任务超过截止时间，等待临时照护者确认。", riskLevel: "attention", status: "monitoring", source: "家庭任务超时", createdAt: ago(36), updatedAt: ago(22), relatedMembers: ["M005"], relatedDevices: [], relatedTasks: ["T004"], aiAssessment: "属于低风险生活照护任务，建议提醒并请求照片证据。", timeline: [baseTimeline("L301", "任务超过截止时间", "已向王阿姨发送一次提醒。", "系统规则", "warning", 22)] },
  { id: "E005", title: "家庭联系人检查完成", description: "本周联系人与授权规则复核完成。", riskLevel: "normal", status: "closed", source: "系统例行检查", createdAt: ago(1440), updatedAt: ago(1300), relatedMembers: ["M003"], relatedDevices: [], relatedTasks: ["T005"], aiAssessment: "联系人可用性良好。", timeline: [baseTimeline("L401", "检查已完成", "5 位联系人均已验证。", "林晓", "success", 1300)] },
];

export const mockAuthorizations: Authorization[] = [
  { id: "A001", action: "读取客厅存在传感器", resource: "D002 · 客厅", riskLevel: "normal", policy: "always_allow", requester: "家庭管理员", reason: "用于判断成员是否仍在家中，降低误报。", createdAt: ago(720), status: "active", consequence: "仅读取状态，不会改变设备。" },
  { id: "A002", action: "自动创建低风险家庭任务", resource: "家庭任务中心", riskLevel: "attention", policy: "always_allow", requester: "家庭管理员", reason: "让日常照护事项不因遗漏而中断。", createdAt: ago(720), status: "active", consequence: "会生成任务，但不会替家人执行外部操作。" },
  { id: "A003", action: "向家庭成员发送安全提醒", resource: "家庭成员", riskLevel: "attention", policy: "ask_every_time", requester: "家有备 AI", reason: "本轮事件需要联系林秀兰确认安全。", createdAt: ago(4), status: "active", eventId: "E001", consequence: "会发送一条可追溯的家庭消息。" },
  { id: "A004", action: "打开入户智能门锁", resource: "D005 · 入户门锁", riskLevel: "critical", policy: "ask_every_time", requester: "家有备 AI", reason: "陌生访客请求入户，AI 建议先核对身份。", createdAt: ago(6), status: "pending", eventId: "E002", consequence: "可能让人员进入家庭；门锁不会在确认前动作。" },
  { id: "A005", action: "读取客厅摄像头画面", resource: "D006 · 客厅摄像头", riskLevel: "critical", policy: "always_deny", requester: "家庭管理员", reason: "家庭隐私保护规则。", createdAt: ago(720), status: "active", consequence: "保持隐私遮罩，不向 AI 提供画面。" },
  { id: "A006", action: "向林秀兰发送一次安全确认", resource: "M001 · 家庭消息", riskLevel: "attention", policy: "ask_every_time", requester: "家有备 AI", reason: "上次老人未及时回复事件需要低打扰确认。", createdAt: ago(1440), status: "approved", eventId: "E001", consequence: "仅发送一次可追溯的家庭安全消息。" },
  { id: "A007", action: "临时打开入户门锁", resource: "D005 · 入户门锁", riskLevel: "critical", policy: "ask_every_time", requester: "家有备 AI", reason: "未验证访客曾请求进入家庭。", createdAt: ago(2880), status: "rejected", eventId: "E002", consequence: "若允许，访客可能进入家庭；该请求已被拒绝。" },
];

export const mockServices: ServiceProvider[] = [
  { id: "S001", name: "文新街道社区物业", category: "社区物业", verified: true, coverage: "父母常住地址 3 公里内", contact: "0571-88****21", lastUsed: "今天 14:20", trustLevel: "high", note: "已验证营业执照与值班电话" },
  { id: "S002", name: "王阿姨 · 同楼邻居", category: "临时照护", verified: true, coverage: "同一单元", contact: "136****7721", lastUsed: "本月 2 次", trustLevel: "high", note: "仅可接收上门安全确认任务" },
  { id: "S003", name: "安康家庭医生", category: "家庭医生", verified: false, coverage: "杭州市西湖区", contact: "待补充联系方式", lastUsed: "从未使用", trustLevel: "unverified", note: "未验证资源，请勿用于紧急救援" },
  { id: "S004", name: "安心跑腿照护", category: "跑腿服务", verified: true, coverage: "杭州主城区", contact: "400-***-8820", lastUsed: "上月 1 次", trustLevel: "medium", note: "支持代取药、送餐，不涉及医疗判断" },
  { id: "S005", name: "小尾巴宠物照护", category: "宠物照护", verified: false, coverage: "杭州部分社区", contact: "平台内联系", lastUsed: "从未使用", trustLevel: "unverified", note: "服务资质尚未由家庭管理员确认" },
];

export const mockNotifications: Notification[] = [
  { id: "N001", category: "urgent", title: "陌生访客请求入户", detail: "门锁操作已被拦截，等待你的人工确认。", time: "2 分钟前", read: false, eventId: "E002" },
  { id: "N002", category: "action", title: "1 项家庭任务等待处理", detail: "联系老人确认当前状态 · 截止 8 分钟后", time: "5 分钟前", read: false, eventId: "E001" },
  { id: "N003", category: "family", title: "林建国已更新位置", detail: "宁波 · 出差中，今日 07:45 已报平安。", time: "2 小时前", read: true },
  { id: "N004", category: "system", title: "模拟设备同步完成", detail: "8 台设备状态已刷新，1 台离线。", time: "今天 08:00", read: true },
];

export const mockAuditLogs: AuditLog[] = [
  { id: "AL001", actor: "家有备 AI", actorType: "ai", time: "14:41", target: "E001 老人长时间未活动", action: "完成风险分析并生成任务建议", reason: "独居档案 + 回复间隔 + 门磁状态", riskLevel: "attention", result: "success" },
  { id: "AL002", actor: "安全规则", actorType: "rule", time: "14:42", target: "D005 入户智能门锁", action: "拦截自动开锁请求", reason: "门锁属于 Critical 高风险动作", riskLevel: "critical", result: "blocked" },
  { id: "AL003", actor: "林晓", actorType: "user", time: "14:43", target: "A003 安全提醒", action: "允许本次发送家庭提醒", reason: "确认成员安全所需，范围仅限本次事件", riskLevel: "attention", result: "success" },
  { id: "AL004", actor: "厨房烟雾报警器", actorType: "device", time: "11:20", target: "E003 厨房烟雾异常", action: "上报短时异常信号", reason: "读数超过关注阈值", riskLevel: "warning", result: "success" },
  { id: "AL005", actor: "林晓", actorType: "user", time: "昨天 19:10", target: "A005 摄像头访问", action: "维持始终拒绝规则", reason: "家庭隐私设置", riskLevel: "critical", result: "success" },
];
