"use client";

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { productStore, useProductStore } from "@/lib/product-store";
import { taskStatusLabel } from "@/lib/product-models";
import { formatTime } from "@/lib/format-time";
import { AppLink, navigate } from "./navigation";
import {
  Avatar,
  Button,
  EmptyState,
  PageHeader,
  Panel,
  RiskBadge,
  SectionTitle,
  StatusBadge,
} from "./ui";

export default function EventDetail({ id }: { id: string }) {
  const state = useProductStore();
  const event = state.events.find((item) => item.id === id);
  if (!event)
    return (
      <div className="not-found">
        <h1>内容不存在</h1>
        <p>未找到事件 {id}。</p>
        <Button onClick={() => navigate("/events")}>返回事件中心</Button>
      </div>
    );
  const tasks = state.tasks.filter(
    (task) =>
      event.relatedTasks.includes(task.id) || task.sourceEventId === event.id,
  );
  const owner =
    state.members.find(
      (member) =>
        member.id ===
        tasks.find((task) => task.status !== "completed")?.assignee,
    ) ?? state.members.find((member) => member.id === tasks[0]?.assignee);
  const authorization = state.authorizations.find(
    (item) => item.id === event.relatedAuthorizationId,
  );
  const devices = state.devices.filter((device) =>
    event.relatedDevices.includes(device.id),
  );
  const relatedTargets = [
    event.id,
    ...tasks.map((task) => task.id),
    ...devices.map((device) => device.id),
  ];
  const logs = state.auditLogs
    .filter((log) =>
      relatedTargets.some(
        (target) =>
          log.target === target || log.target.startsWith(`${target} `),
      ),
    )
    .slice(0, 5);
  const replay =
    event.source === "browser_cv_video" || event.source === "视频回放验证";
  const vision =
    replay || event.source === "browser_cv" || event.source === "本机视觉检测";
  const terminal = event.status === "resolved" || event.status === "closed";
  return (
    <>
      <AppLink className="back-button" href="/events">
        <ArrowLeft size={15} />
        返回事件中心
      </AppLink>
      <PageHeader
        eyebrow="事件跟进"
        title={event.title}
        description={event.description}
        action={
          <>
            <RiskBadge level={event.riskLevel} />
            <StatusBadge status={event.status} />
          </>
        }
      />
      {replay && (
        <div className="replay-notice">
          <Activity size={16} />
          这是本地视频回放验证记录，请记录观察结果。
        </div>
      )}
      <div className="detail-layout">
        <div>
          <Panel className="event-detail-banner">
            <div className="detail-icon">
              <Activity size={22} />
            </div>
            <div>
              <span>判断依据</span>
              <h2>{event.aiAssessment || "等待补充判断依据。"}</h2>
              <p>
                来源：
                {vision
                  ? replay
                    ? "本地视频回放"
                    : "本机视觉检测"
                  : event.source}{" "}
                · 更新于{" "}
                {new Date(event.updatedAt).toLocaleString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </Panel>
          <Panel>
            <SectionTitle title="事件时间线" detail="从发现信号，到家人回应" />
            <div className="timeline">
              {event.timeline.map((item, index) => (
                <div className="timeline-item" key={item.id}>
                  <div className={`timeline-marker ${item.tone}`}>
                    {item.tone === "success" ? <Check size={13} /> : index + 1}
                  </div>
                  <div>
                    <time>{formatTime(item.time)}</time>
                    <h4>{item.title}</h4>
                    <p>{item.detail}</p>
                    <small>{item.actor}</small>
                  </div>
                </div>
              ))}
              {event.timeline.length === 0 && (
                <EmptyState
                  title="尚无处理记录"
                  detail="事件的后续回应会显示在这里。"
                />
              )}
            </div>
          </Panel>
          {devices.length > 0 && (
            <Panel>
              <SectionTitle title="设备状态" detail="本次判断关联的设备信号" />
              <div className="event-device-grid">
                {devices.map((device) => (
                  <AppLink key={device.id} href={`/devices/${device.id}`}>
                    <span className={`device-icon ${device.kind}`}>
                      <Wifi size={16} />
                    </span>
                    <span>
                      <strong>{device.name}</strong>
                      <small>
                        {device.room} · {device.reading}
                      </small>
                    </span>
                    <RiskBadge level={device.riskLevel} />
                    <ChevronRight size={15} />
                  </AppLink>
                ))}
              </div>
            </Panel>
          )}
          <Panel>
            <SectionTitle
              title="操作日志"
              detail="相关任务、设备和人工操作有迹可循"
            />
            {logs.length ? (
              <div className="activity-list">
                {logs.map((log) => (
                  <div className="activity-row" key={log.id}>
                    <span className={`activity-dot ${log.result}`} />
                    <div>
                      <strong>{log.action}</strong>
                      <p>
                        {log.actor} · {log.reason}
                      </p>
                    </div>
                    <time>{formatTime(log.time)}</time>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="暂无额外操作日志"
                detail="后续处理会保留相应记录。"
              />
            )}
          </Panel>
        </div>
        <aside className="detail-aside">
          <Panel>
            <SectionTitle title="当前责任人" />
            <div className="owner-row">
              <Avatar member={owner} size="lg" />
              <div>
                <strong>{owner?.name ?? "待分配"}</strong>
                <p>
                  {owner
                    ? `${owner.role} · ${owner.location}`
                    : "通过关联任务分配负责人"}
                </p>
              </div>
              {owner && (
                <AppLink
                  className="icon-plain"
                  aria-label="查看负责人资料"
                  href={`/members/${owner.id}`}
                >
                  <ChevronRight size={17} />
                </AppLink>
              )}
            </div>
            <div className="mini-info">
              <span>涉及成员</span>
              <strong>
                {event.relatedMembers
                  .map(
                    (memberId) =>
                      state.members.find((member) => member.id === memberId)
                        ?.name,
                  )
                  .filter(Boolean)
                  .join("、") || "尚未指定"}
              </strong>
            </div>
            <div className="mini-info">
              <span>关联设备</span>
              <strong>{devices.length} 台设备</strong>
            </div>
          </Panel>
          <Panel>
            <SectionTitle title="关联任务" />
            {tasks.map((task) => (
              <AppLink
                className="linked-row"
                key={task.id}
                href={`/tasks/${task.id}`}
              >
                <span className="mini-icon">
                  <Check size={15} />
                </span>
                <span>
                  <strong>{task.title}</strong>
                  <small>{taskStatusLabel[task.status]}</small>
                </span>
                <ChevronRight size={16} />
              </AppLink>
            ))}
            {tasks.length === 0 && <p className="muted">尚未创建关联任务。</p>}
            {authorization && (
              <AppLink className="linked-row" href="/authorizations">
                <span className="mini-icon amber">
                  <ShieldCheck size={15} />
                </span>
                <span>
                  <strong>授权确认</strong>
                  <small>
                    {authorization.status === "pending"
                      ? "等待人工确认"
                      : authorization.status === "approved"
                        ? "已允许本次操作"
                        : "已拒绝"}
                  </small>
                </span>
                <ChevronRight size={16} />
              </AppLink>
            )}
          </Panel>
          <Panel className="event-next-step">
            <SectionTitle title="下一步行动" />
            {terminal ? (
              <div className="success-block">
                <Check size={18} />
                {event.status === "closed" ? "事件已关闭" : "事件已解决"}
              </div>
            ) : authorization?.status === "pending" ? (
              <Button onClick={() => navigate("/authorizations")}>
                前往人工授权
                <ArrowRight size={15} />
              </Button>
            ) : state.demoMode && event.id === "E001" ? (
              <>
                <p className="action-hint">
                  模拟展示：逐步查看预设的协同过程。
                </p>
                <Button onClick={() => productStore.advanceEvent(event.id)}>
                  推进下一步
                  <ArrowRight size={15} />
                </Button>
              </>
            ) : (
              <>
                <p className="action-hint">
                  {replay
                    ? "填写回放观察结果，再核对并确认记录。"
                    : vision
                      ? "请先联系本人核实，再填写处理记录。"
                      : "通过关联任务安排处理，并记录核实结果。"}
                </p>
                {tasks.find((task) => task.status !== "completed") && (
                  <AppLink
                    className="btn primary"
                    href={`/tasks/${tasks.find((task) => task.status !== "completed")?.id}`}
                  >
                    处理关联任务
                    <ArrowRight size={15} />
                  </AppLink>
                )}
              </>
            )}
          </Panel>
          <Panel className="boundary-note">
            <ShieldCheck size={18} />
            <div>
              <strong>由家人做重要决定</strong>
              <p>疑似信号需要核实。门锁、摄像头等高风险操作需要人工确认。</p>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
