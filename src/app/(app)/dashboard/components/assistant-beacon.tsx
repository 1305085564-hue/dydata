"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Bell, Bot, Check, ChevronRight, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { groupDashboardAlerts } from "../alert-groups";
import { severityDot, severityTone } from "./status-theme";

interface AssistantBeaconProps {
  groups: ReturnType<typeof groupDashboardAlerts>;
  onDismissAlert: (id: string) => void;
  onOpenAssistant?: () => void;
}

const HOVER_OPEN_DELAY = 200;
const HOVER_CLOSE_DELAY = 500;

/**
 * 助手光点 · 全局通知 + 未来机器人入口
 * absolute 锚 max-w-6xl 主体右上角，跟随主内容不跟随视口
 * hover 200ms 展开 / 离开 1s 收拢；click 预留机器人面板（暂 no-op）
 * 美学法典 V1.2：呼吸光晕（A.7）、信号载体允许饱和色（B.4）、softened ease
 */
export function AssistantBeacon({ groups, onDismissAlert, onOpenAssistant }: AssistantBeaconProps) {
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

  const handleTriggerClick = () => {
    if (onOpenAssistant) {
      onOpenAssistant();
      return;
    }
    setOpen((prev) => !prev);
  };

  const countColor = hasCritical ? "text-[#C9604D]" : "text-[#D99E55]";

  return (
    <div
      className="relative flex justify-end"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={hasAnyAlert ? `助手：${alertCount} 项新消息` : "助手"}
        onClick={handleTriggerClick}
        className={cn(
          "group relative flex h-10 w-10 items-center justify-center rounded-[12px] border border-zinc-200 bg-white shadow-sm transition-[background-color,border-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:shadow-md active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5",
          open && "border-zinc-300 shadow-md",
        )}
      >
        {/* 呼吸光晕：仅在有新消息时出现，放在机器人底部留给肩膀呼吸感 */}
        {hasAnyAlert && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-1 rounded-[9px] opacity-25 animate-ping",
              hasCritical ? "bg-[#C9604D]" : "bg-[#D99E55]",
            )}
            style={{ animationDuration: "2.4s" }}
          />
        )}
        {/* 机器人图标主体 */}
        <Bot
          aria-hidden="true"
          size={20}
          className={cn(
            "relative stroke-[1.6] transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-[1.06]",
            hasAnyAlert
              ? hasCritical
                ? "text-[#C9604D]"
                : "text-[#D99E55]"
              : "text-zinc-500",
          )}
        />
        {/* 说话小气泡：右上尖角对向机器人头 */}
        {hasAnyAlert && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-[8px] rounded-bl-[2px] bg-white px-1 text-[10px] font-semibold tabular-nums shadow-sm ring-1 ring-zinc-200",
              countColor,
            )}
          >
            {alertCount > 9 ? "9+" : alertCount}
          </span>
        )}
      </button>

      <div
        role="region"
        aria-label="助手消息"
        aria-hidden={!open}
        className={cn(
          "absolute right-0 top-[calc(100%+10px)] w-[360px] origin-top-right overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)] transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-3 scale-[0.96] opacity-0",
        )}
      >
        {hasCritical && (
          <span
            aria-hidden="true"
            className="absolute inset-y-[5%] left-0 w-[2px] bg-[#C9604D]"
          />
        )}

        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <div className="flex items-center gap-2">
            {hasAnyAlert ? (
              <AlertCircle
                size={14}
                className={cn("stroke-[1.5]", hasCritical ? "text-[#C9604D]" : "text-[#D99E55]")}
              />
            ) : (
              <Sparkles size={14} className="stroke-[1.5] text-zinc-400" />
            )}
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
              {hasAnyAlert ? "新消息" : "助手"}
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

        {!hasAnyAlert ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-50">
              <Bell size={14} className="stroke-[1.5] text-zinc-400" />
            </div>
            <p className="text-[13px] leading-[1.7] text-zinc-400">
              一切平稳。暂无新消息。
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {groups.map((group) => {
              const userExpanded = expandedUsers.has(group.userKey);
              const isExemptionOnly = group.alerts.every(
                (a) => a.sourceType === "exemption_approved" || a.sourceType === "exemption_rejected",
              );
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
                        {group.warningCount > 0 && !isExemptionOnly && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-[#D99E55]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55] ring-1 ring-white" />
                            提醒 {group.warningCount}
                          </span>
                        )}
                        {isExemptionOnly && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-[#6FAA7D]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
                            豁免回执
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
                      {group.alerts.map((alert) => {
                        const isApproved = alert.sourceType === "exemption_approved";
                        const isRejected = alert.sourceType === "exemption_rejected";
                        const isExemption = isApproved || isRejected;
                        const accentClass = isApproved
                          ? "text-[#6FAA7D]"
                          : isRejected
                            ? "text-[#C9604D]"
                            : severityTone(alert.severity);
                        const dotClass = isApproved
                          ? "bg-[#6FAA7D]"
                          : isRejected
                            ? "bg-[#C9604D]"
                            : severityDot(alert.severity);
                        return (
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
                                      accentClass,
                                    )}
                                  >
                                    {isApproved ? (
                                      <Check size={10} className="stroke-[1.5]" />
                                    ) : (
                                      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
                                    )}
                                    {alert.checkpointLabel}
                                  </span>
                                )}
                                <span className="text-[12px] font-medium leading-[1.5] text-zinc-700">
                                  {alert.message}
                                </span>
                              </div>
                              {isExemption && (
                                <p className="mt-1 text-[11px] leading-[1.6] text-zinc-500">
                                  {isApproved ? "可继续按当前状态完成今日填报。" : "请按驳回理由调整后重新申请。"}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => onDismissAlert(alert.id)}
                              className="shrink-0 rounded-md p-0.5 text-zinc-300 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                              aria-label="关闭这条消息"
                            >
                              <X size={12} className="stroke-[1.5]" />
                            </button>
                          </div>
                        );
                      })}
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
