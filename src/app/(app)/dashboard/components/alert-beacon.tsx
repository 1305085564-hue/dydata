"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Bell, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { groupDashboardAlerts } from "../alert-groups";
import { severityDot, severityTone } from "./status-theme";

interface AlertBeaconProps {
  groups: ReturnType<typeof groupDashboardAlerts>;
  onDismissAlert: (id: string) => void;
}

const HOVER_OPEN_DELAY = 300;
const HOVER_CLOSE_DELAY = 1000;

/**
 * 浮动光点 · 全局通知锚点
 * 右上角固定位置。hover 300ms 展开、离开 1s 收拢
 * 无异常 → 灰静态点；有异常 → 暖橙呼吸光点（严重时升为 #C9604D）
 * 美学法典：呼吸光晕是"一次一处的克制惊喜"（A.7），信号载体允许小面积饱和色（B.4）
 */
export function AlertBeacon({ groups, onDismissAlert }: AlertBeaconProps) {
  const alertCount = groups.reduce((sum, group) => sum + group.count, 0);
  const criticalUserCount = groups.filter((g) => g.criticalCount > 0).length;
  const hasCritical = criticalUserCount > 0;
  const hasAnyAlert = alertCount > 0;

  const [open, setOpen] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => () => clearTimers(), []);

  const handleMouseEnter = () => {
    clearTimers();
    if (open) return;
    openTimerRef.current = setTimeout(() => {
      setOpen(true);
      openTimerRef.current = null;
    }, HOVER_OPEN_DELAY);
  };

  const handleMouseLeave = () => {
    clearTimers();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY);
  };

  const handleFocus = () => {
    clearTimers();
    setOpen(true);
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    // 容器内部仍有焦点时不收
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    clearTimers();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY);
  };

  const toggleUser = (key: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 光点颜色：严重 #C9604D / 一般 #D99E55 / 无 zinc-300
  const dotColor = !hasAnyAlert
    ? "bg-zinc-300"
    : hasCritical
      ? "bg-[#C9604D]"
      : "bg-[#D99E55]";

  const countColor = hasCritical ? "text-[#C9604D]" : "text-[#D99E55]";

  return (
    <div
      className="fixed right-6 top-20 z-40 flex justify-end"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
    >
      {/* 光点 · Trigger */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={hasAnyAlert ? `全局通知：${alertCount} 项异常` : "全局通知"}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "group relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition-[background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5",
          open && "border-zinc-300",
        )}
      >
        {/* 呼吸光晕（仅有异常时） */}
        {hasAnyAlert && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-[6px] rounded-full opacity-40",
              hasCritical ? "bg-[#C9604D]" : "bg-[#D99E55]",
              "animate-ping",
            )}
            style={{ animationDuration: "2.4s" }}
          />
        )}
        {/* 光点内核 */}
        <span
          aria-hidden="true"
          className={cn(
            "relative h-2 w-2 rounded-full ring-1 ring-white transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-110",
            dotColor,
          )}
        />
        {/* 右上角数字角标 */}
        {hasAnyAlert && (
          <span
            className={cn(
              "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold tabular-nums shadow-sm ring-1 ring-zinc-200",
              countColor,
            )}
          >
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        )}
      </button>

      {/* 展开面板 */}
      <div
        role="region"
        aria-label="通知列表"
        aria-hidden={!open}
        className={cn(
          "absolute right-0 top-[calc(100%+8px)] w-[360px] origin-top-right overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)] transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        {/* 左 2px 导轨（有严重异常时） */}
        {hasCritical && (
          <span
            aria-hidden="true"
            className="absolute inset-y-[5%] left-0 w-[2px] bg-[#C9604D]"
          />
        )}

        {/* 面板头 */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <div className="flex items-center gap-2">
            {hasAnyAlert ? (
              <AlertCircle
                size={14}
                className={cn("stroke-[1.5]", hasCritical ? "text-[#C9604D]" : "text-[#D99E55]")}
              />
            ) : (
              <Bell size={14} className="stroke-[1.5] text-zinc-400" />
            )}
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
              {hasAnyAlert ? "异常告警" : "通知中心"}
            </span>
          </div>
          {hasAnyAlert && (
            <div className="flex items-center gap-1.5">
              <span className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-700">
                {groups.length} 人
              </span>
              <span className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-700">
                {alertCount} 项
              </span>
            </div>
          )}
        </div>

        {/* 面板内容 */}
        {!hasAnyAlert ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-50">
              <Bell size={14} className="stroke-[1.5] text-zinc-400" />
            </div>
            <p className="text-[13px] leading-[1.7] text-zinc-400">
              一切平稳。没有新的异常通知。
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {groups.map((group) => {
              const userExpanded = expandedUsers.has(group.userKey);
              return (
                <div key={group.userKey} className="border-b border-zinc-100 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleUser(group.userKey)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                    style={{ transitionDelay: "50ms" }}
                    aria-expanded={userExpanded}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-zinc-800">
                        {group.userName}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {group.criticalCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-[#C9604D]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#C9604D] ring-1 ring-white" />
                            严重 {group.criticalCount}
                          </span>
                        )}
                        {group.warningCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-[#D99E55]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55] ring-1 ring-white" />
                            提醒 {group.warningCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-zinc-700">
                        {group.count}
                      </span>
                      <ChevronRight
                        size={14}
                        className={cn(
                          "stroke-[1.5] text-zinc-400 transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                          userExpanded && "rotate-90",
                        )}
                      />
                    </div>
                  </button>

                  {userExpanded && (
                    <div className="space-y-1.5 bg-zinc-50/50 px-4 pb-3 pt-1">
                      {group.alerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-start justify-between gap-2 rounded-[10px] border border-zinc-200 bg-white px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1">
                              {alert.checkpointLabel && (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium",
                                    severityTone(alert.severity),
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 rounded-full",
                                      severityDot(alert.severity),
                                    )}
                                  />
                                  {alert.checkpointLabel}
                                </span>
                              )}
                              <span className="text-[12px] font-medium leading-[1.5] text-zinc-700">
                                {alert.message}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onDismissAlert(alert.id)}
                            className="shrink-0 rounded-md p-0.5 text-zinc-300 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                            aria-label="关闭这条告警"
                          >
                            <X size={12} className="stroke-[1.5]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
