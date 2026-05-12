"use client";

import { useRef, type ReactNode } from "react";
import {
  Activity,
  CalendarDays,
  Eye,
  FileText,
  History,
  LayoutDashboard,
  Target,
  TrendingUp,
  Trophy,
  Video,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickExemptionButton } from "./quick-exemption-button";
import type { SopCheckpoint } from "@/types";
import type { WorkspaceTab } from "./status-theme";

interface DashboardWorkspaceHeaderProps {
  today: string;
  activeBizDate: string;
  onDateChange: (date: string) => void;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onDashboardAction: (key: string) => void;
  hasPendingExemption: boolean;
  submittedDates: string[];
  userRole: "member" | "admin" | "owner";
  alertCount: number;
  reviewRequestCount?: number;
  activeCheckpoint: SopCheckpoint;
  onCheckpointChange: (checkpoint: SopCheckpoint) => void;
  checkpointStatuses: Record<SopCheckpoint, string>;
  assistantSlot?: ReactNode;
}

// 工序条（去掉早会复盘，保留 4 档）
const WORKFLOW_STAGES: Array<{
  id: SopCheckpoint;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "DATA_REPORT", label: "数据报表", icon: LayoutDashboard },
  { id: "TOPIC", label: "选题策划", icon: Target },
  { id: "SCRIPT", label: "脚本创作", icon: FileText },
  { id: "VIDEO", label: "成片审核", icon: Video },
];

/**
 * 仪表盘工作区顶栏
 * 结构：首行（标题 + 5 入口 + 日期） / 次行（工序 4 + Tab）
 * 美学法典 V1.2：弱按钮感、hover 去色、hover 延迟、-translate-y 物理位移
 */
export function DashboardWorkspaceHeader({
  today,
  activeBizDate,
  onDateChange,
  activeTab,
  onTabChange,
  onDashboardAction,
  hasPendingExemption,
  submittedDates,
  userRole,
  alertCount,
  reviewRequestCount = 0,
  activeCheckpoint,
  onCheckpointChange,
  checkpointStatuses,
  assistantSlot,
}: DashboardWorkspaceHeaderProps) {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const reviewBadgeCount = alertCount + reviewRequestCount;
  const utilityActions = [
    { key: "data-view", label: "数据查看", icon: Eye },
    { key: "trend-view", label: "趋势查看", icon: TrendingUp },
    { key: "leaderboard", label: "排行榜", icon: Trophy },
    { key: "history", label: "历史记录", icon: History },
  ];

  const tabs: Array<{ key: WorkspaceTab; label: string }> = [
    { key: "FLOW", label: "今日流程" },
    ...(userRole !== "member"
      ? [{ key: "REVIEW" as WorkspaceTab, label: "审核中心" }]
      : []),
    ...(userRole !== "member"
      ? [{ key: "MATRIX" as WorkspaceTab, label: "全域矩阵" }]
      : []),
  ];

  function openDatePicker() {
    if (dateInputRef.current?.showPicker) {
      dateInputRef.current.showPicker();
      return;
    }
    dateInputRef.current?.focus();
  }

  return (
    <div className="mx-auto mb-6 max-w-6xl space-y-4">
      {/* 首行：eyebrow + 标题 + 5 弱入口 + 日期 */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            <Activity size={14} className="text-zinc-800" /> Live Workflow
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <h2 className="text-[20px] font-semibold tracking-tight text-zinc-800">
              今日生产流程
            </h2>
            {/* 5 弱按钮入口：纯文字 + 小图标，hover 才有底色 */}
            <nav
              className="flex flex-wrap items-center gap-x-1 gap-y-0.5"
              aria-label="数据快捷入口"
            >
              {utilityActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => onDashboardAction(action.key)}
                    className="group inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[12px] font-medium text-zinc-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-800 focus-visible:bg-zinc-100 focus-visible:text-zinc-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                    style={{ transitionDelay: "50ms" }}
                  >
                    <Icon
                      size={13}
                      className="stroke-[1.5] text-zinc-400 transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:text-zinc-700"
                    />
                    {action.label}
                  </button>
                );
              })}
              <QuickExemptionButton
                hasPending={hasPendingExemption}
                today={today}
                submittedDates={submittedDates}
                initialSelectedDates={[today]}
                variant="subtle"
              />
            </nav>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start lg:items-end">
          <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
            Today
          </span>
          <button
            type="button"
            onClick={openDatePicker}
            className="group inline-flex items-center gap-1.5 rounded-[10px] py-1 text-[20px] font-semibold font-mono tabular-nums text-zinc-800 transition-[color,opacity] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:opacity-80 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
            aria-label="选择填报日期"
          >
            <span>{activeBizDate}</span>
            <CalendarDays className="size-3.5 text-zinc-400 transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:-translate-y-[1px]" />
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={activeBizDate}
            max={today}
            onChange={(event) => {
              if (event.target.value) onDateChange(event.target.value);
            }}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
      </div>

      {userRole !== "member" && reviewRequestCount > 0 && (
        <div className="flex items-center justify-between rounded-[10px] border border-zinc-200 bg-white px-3.5 py-2 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C9604D] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#C9604D]" />
            </span>
            <span className="text-[12px] font-medium text-zinc-700">
              待审批
              <span className="mx-1 font-semibold tabular-nums text-[#C9604D]">
                {reviewRequestCount}
              </span>
              条
            </span>
          </div>
          <button
            type="button"
            onClick={() => onTabChange("REVIEW")}
            className="text-[11px] font-medium text-[#D97757] transition-colors hover:text-[#C9604D]"
          >
            去审核 →
          </button>
        </div>
      )}

      {/* 次行：工序 + Tab 融合为一张灰底卡 */}
      <div className="relative grid grid-cols-12 items-stretch gap-0 rounded-2xl border border-zinc-200 bg-zinc-50 p-1.5 shadow-sm">
        {assistantSlot ? (
          <div className="pointer-events-none absolute -right-2 -top-5 z-30">
            <div className="pointer-events-auto">{assistantSlot}</div>
          </div>
        ) : null}
        <div className="col-span-12 lg:col-span-7 min-w-0">
          <WorkflowStepper
            stages={WORKFLOW_STAGES}
            active={activeCheckpoint}
            onChange={onCheckpointChange}
            statuses={checkpointStatuses}
          />
        </div>

        <nav
          className="col-span-12 flex gap-1 overflow-x-auto rounded-[10px] lg:col-span-5 lg:justify-end"
          aria-label="工作区切换"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "relative inline-flex min-w-24 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-4 py-1.5 text-[12px] font-medium transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:ring-1 focus-visible:ring-zinc-950/5",
                activeTab === tab.key
                  ? "bg-white text-zinc-800 shadow-sm"
                  : "text-zinc-500 hover:bg-white/60 hover:text-zinc-800",
              )}
            >
              <span>{tab.label}</span>
              {tab.key === "REVIEW" && reviewBadgeCount > 0 && (
                <span className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#C9604D]/10 px-1 text-[10px] font-semibold tabular-nums text-[#C9604D]">
                  {reviewBadgeCount > 9 ? "9+" : reviewBadgeCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

/**
 * 紧凑工序条（横向）：icon + label + 连线
 * 激活态：图标方块 bg-zinc-900；完成：bg-[#6FAA7D]；驳回：描边 #C9604D
 */
function WorkflowStepper({
  stages,
  active,
  onChange,
  statuses,
}: {
  stages: Array<{ id: SopCheckpoint; label: string; icon: LucideIcon }>;
  active: SopCheckpoint;
  onChange: (id: SopCheckpoint) => void;
  statuses: Record<SopCheckpoint, string>;
}) {
  return (
    <div className="relative flex items-center gap-2 rounded-[10px] px-2 py-1">
      {stages.map((stage, idx) => {
        const Icon = stage.icon;
        const status = statuses[stage.id];
        const isActive = active === stage.id;
        const isDone = status === "APPROVED";
        const isRejected = status === "REJECTED";
        return (
          <div key={stage.id} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => onChange(stage.id)}
              className="group flex flex-1 items-center gap-2 rounded-[8px] px-2 py-1 text-left transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100/70 focus-visible:bg-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5"
              style={{ transitionDelay: "50ms" }}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border transition-[background-color,color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  isActive && "border-zinc-900/80 bg-white text-zinc-900 ring-2 ring-zinc-900/10",
                  !isActive && isDone && "border-[#6FAA7D] bg-[#6FAA7D] text-white",
                  !isActive && !isDone && isRejected && "border-[#C9604D] text-[#C9604D]",
                  !isActive && !isDone && !isRejected && "border-zinc-200 text-zinc-400 group-hover:border-zinc-300 group-hover:text-zinc-700",
                )}
              >
                <Icon size={14} className="stroke-[1.5]" />
              </span>
              <span
                className={cn(
                  "truncate text-[12px] font-medium transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  isActive ? "text-zinc-800" : "text-zinc-500 group-hover:text-zinc-800",
                )}
              >
                {stage.label}
              </span>
            </button>
            {idx < stages.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-1 h-[2px] w-4 shrink-0 rounded-full transition-colors duration-150",
                  statuses[stage.id] === "APPROVED" ? "bg-[#6FAA7D]/40" : "bg-zinc-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
