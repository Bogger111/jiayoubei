"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  LockKeyhole,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { useProductStore } from "@/src/stores/productStore";
import { eventStatusLabel } from "@/src/models";
import { formatTime } from "@/lib/format-time";
import { navigate, AppLink } from "./navigation";
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  RiskBadge,
  SectionTitle,
} from "./ui";
import Dialog from "./Dialog";

export default function DeviceDetail({ id }: { id: string }) {
  const state = useProductStore();
  const [boundaryOpen, setBoundaryOpen] = useState(false);
  const device = state.devices.find((item) => item.id === id);
  if (!device)
    return (
      <>
        <PageHeader
          eyebrow="设备详情"
          title="内容不存在"
          description="当前家庭中没有这台设备的记录。"
        />
        <Button onClick={() => navigate("/devices")}>
          <ArrowLeft size={15} /> 返回智能设备
        </Button>
      </>
    );
  const protectedDevice = device.kind === "lock" || device.kind === "camera";
  const events = state.events.filter(
    (event) =>
      device.relatedEventIds.includes(event.id) ||
      event.relatedDevices.includes(id),
  );
  const logs = state.auditLogs
    .filter(
      (log) =>
        log.target === id ||
        log.target.startsWith(`${id} `) ||
        log.target === device.name,
    )
    .slice(0, 8);
  return (
    <>
      <AppLink className="back-button" href="/devices">
        <ArrowLeft size={15} /> 返回智能设备
      </AppLink>
      <PageHeader
        eyebrow="设备详情"
        title={device.name}
        description={`${device.room} · ${device.source === "real" ? "设备接入记录" : device.source === "local" ? "本地驱动" : "模拟设备"}`}
        action={<RiskBadge level={device.riskLevel} />}
      />
      <div className="device-detail-layout">
        <div className="device-detail-main">
          <Panel className="device-status-large">
            <span className={`device-icon ${device.kind}`}>
              <Radio size={23} />
            </span>
            <div>
              <span>当前读数</span>
              <h2>
                {device.reading}
                {device.unit && !device.reading.includes(device.unit)
                  ? device.unit
                  : ""}
              </h2>
              <p>最后同步：{formatTime(device.lastSync)}</p>
            </div>
            <span className={device.online ? "online-state" : "offline-state"}>
              <i />
              {device.online ? "设备在线" : "设备离线"}
            </span>
          </Panel>
          <Panel>
            <SectionTitle
              title="事件与处理记录"
              detail={
                state.demoMode
                  ? "以下为示例家庭记录"
                  : "来自当前家庭的已保存记录"
              }
            />
            {events.length ? (
              events.map((event) => (
                <AppLink
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="linked-row"
                >
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {formatTime(event.updatedAt)} ·{" "}
                      {eventStatusLabel[event.status]}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </AppLink>
              ))
            ) : (
              <EmptyState
                title="暂无关联事件"
                detail="设备出现关联事件后，会在这里显示处理进展。"
              />
            )}
          </Panel>
          <Panel>
            <SectionTitle
              title="自动化规则"
              detail="当前已实现的设备控制边界"
            />
            <div className="automation-list">
              {(protectedDevice
                ? [
                    "所有操作每次询问家庭管理员",
                    "门锁和摄像头的直接执行接口受保护",
                    "授权决定保存到安全记录",
                  ]
                : [
                    "操作接口核对当前家庭与设备",
                    "真实设备当前仅支持已配置灯光开启",
                    "设备动作需要家庭管理员确认",
                  ]
              ).map((rule, index) => (
                <div key={rule}>
                  <span>{index + 1}</span>
                  <p>{rule}</p>
                  <strong>规则边界</strong>
                </div>
              ))}
            </div>
            <p className="setting-description">
              持续离线提醒和历史曲线需要接入真实采集数据后启用。
            </p>
          </Panel>
        </div>
        <aside className="detail-aside">
          <Panel>
            <SectionTitle title="安全控制" />
            <div className="device-boundary-card">
              <LockKeyhole size={17} />
              <div>
                <strong>{protectedDevice ? "受保护设备" : "受控设备"}</strong>
                <p>{device.permission}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setBoundaryOpen(true)}>
              <ShieldCheck size={15} /> 查看授权边界
            </Button>
          </Panel>
          <Panel>
            <SectionTitle title="操作日志" detail="当前设备的已保存记录" />
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
                title="暂无设备操作"
                detail="状态读取不会触发设备动作。"
              />
            )}
          </Panel>
        </aside>
      </div>
      {boundaryOpen && (
        <Dialog title="设备操作边界" onClose={() => setBoundaryOpen(false)}>
          <p>
            {protectedDevice
              ? "门锁和摄像头动作受保护。授权中心保存家庭成员的决定，当前系统不会据此自动开锁或开启摄像头。"
              : "当前详情页用于查看设备记录。已配置的灯光控制需由家庭管理员通过受控接口明确确认。"}
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setBoundaryOpen(false)}>
              知道了
            </Button>
            <Button
              onClick={() => {
                setBoundaryOpen(false);
                navigate("/authorizations");
              }}
            >
              前往授权中心
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
