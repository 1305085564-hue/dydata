"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Bell,
  ChevronRight,
  UserCheck2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { AdminRequestRow } from "@/lib/team-join/service";
import type { ExemptionRequestRow } from "../豁免申请列表";
import { reviewExemptionRequest } from "../actions";
import {
  approveJoinRequestAction,
  rejectJoinRequestAction,
} from "../join-request-actions";
import type {
  CockpitSummary,
  PendingSubmissionRow,
  PendingVideoRow,
} from "./admin-first-screen-loader";
import { RemindLogDialog } from "./remind-log-dialog";
import { VideoPreviewDialog } from "./queue-quick-preview";

const EXEMPTION_TYPE_LABELS: Record<string, string> = {
  yesterday: "昨日",
  range: "多日",
  permanent: "永久",
  single: "昨日",
  "3days": "多日",
  "4days": "多日",
  "5days": "多日",
};

function useSafeFetch<T>(url: string, intervalMs = 60_000, initialData: T | null = null) {
  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const res = await fetchWithTimeout(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, [url]);

  useEffect(() => {
    let active = true;
    if (initialData === null) void run();
    const id = setInterval(() => {
      if (active) void run();
    }, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [run, intervalMs, initialData]);

  return { data, error };
}

// CardShell 已删除，新版用 AnomalyTimeline 替代 PendingVideosCard

function ViewAllLink({ href, label = "查看全部" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-0.5 text-[11px] text-zinc-400 transition-colors hover:text-zinc-700"
    >
      {label}
      <ChevronRight className="size-3 stroke-[1.5]" />
    </a>
  );
}

function formatPct(pct: number | null): string {
  if (pct == null) return "";
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/* ── 待审批合并卡（催交 / 豁免 / 入团） ── */
type ReviewTab = "submissions" | "exemptions" | "joins";
type QueueMetricSummary = {
  newVideosToday: number;
  weeklySubmissionRate: number;
  weeklyReviewedCount: number;
  caseLibraryPendingCount: number;
};

type QueueOverviewPayload = {
  summary: CockpitSummary | null;
  pendingVideos: PendingVideoRow[];
  pendingSubmissions: PendingSubmissionRow[];
  pendingExemptions: ExemptionRequestRow[];
  pendingJoinRequests: AdminRequestRow[];
  metrics: QueueMetricSummary;
};

function HoverActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute right-2 top-1/2 flex -translate-y-1/2 translate-x-2 items-center gap-1 opacity-0 pointer-events-none transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-hover:pointer-events-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ApproveButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={busy}
      className="inline-flex h-7 items-center rounded-lg bg-[#D97757] px-2.5 text-[12px] text-white transition-colors hover:bg-[#C96442] active:translate-y-0 disabled:opacity-50"
    >
      批准
    </button>
  );
}

function RejectButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={busy}
      className="inline-flex h-7 items-center rounded-lg border border-zinc-200 bg-white px-2.5 text-[12px] text-zinc-700 transition-colors hover:border-zinc-300 active:translate-y-0 disabled:opacity-50"
    >
      拒绝
    </button>
  );
}

function ReviewBatchCard({
  date,
  initialSubmissions,
  initialExemptions,
  initialJoins,
  submissionsTotal,
  exemptionsTotal,
}: {
  date: string;
  initialSubmissions: PendingSubmissionRow[];
  initialExemptions: ExemptionRequestRow[];
  initialJoins: AdminRequestRow[];
  submissionsTotal: number;
  exemptionsTotal: number;
}) {
  const [activeTab, setActiveTab] = useState<ReviewTab>(() => {
    if (initialJoins.length > 0) return "joins";
    if (initialExemptions.length > 0) return "exemptions";
    return "submissions";
  });

  const [submissions, setSubmissions] = useState(initialSubmissions);
  useEffect(() => {
    setSubmissions(initialSubmissions);
  }, [initialSubmissions]);

  const [exemptions, setExemptions] = useState(initialExemptions);
  useEffect(() => {
    setExemptions(initialExemptions);
  }, [initialExemptions]);

  const [joins, setJoins] = useState(initialJoins);
  useEffect(() => {
    setJoins(initialJoins);
  }, [initialJoins]);

  const [, startTransition] = useTransition();
  const [exemptionBusy, setExemptionBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [remindLogOpen, setRemindLogOpen] = useState(false);
  const [handledMap, setHandledMap] = useState<Record<string, "approved" | "rejected">>({});

  // 流转与撤销共存：点击瞬间标记(淡出+下一条顶上)，移除延迟到撤销窗口结束。按 id 独立计时，支持批量。
  const SETTLE_MS = 5000;
  const settleTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timers = settleTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const handledCount = useMemo(
    () => Object.keys(handledMap).length,
    [handledMap],
  );

  function clearSettle(id: string) {
    const t = settleTimers.current[id];
    if (t) {
      clearTimeout(t);
      delete settleTimers.current[id];
    }
  }

  function unmark(id: string) {
    clearSettle(id);
    setHandledMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleExemptionDecision(
    row: ExemptionRequestRow,
    decision: "approved" | "rejected",
  ) {
    const resultLabel = decision === "approved" ? "已批准" : "已驳回";
    setHandledMap((prev) => ({ ...prev, [row.id]: decision }));
    setExemptionBusy(true);

    settleTimers.current[row.id] = setTimeout(() => {
      setExemptions((prev) => prev.filter((r) => r.id !== row.id));
      delete settleTimers.current[row.id];
    }, SETTLE_MS);

    toast.success(`${resultLabel} ${row.applicant_name} 的豁免申请`, {
      duration: SETTLE_MS,
      action: { label: "撤销", onClick: () => unmark(row.id) },
    });

    startTransition(async () => {
      const result = await reviewExemptionRequest({ requestId: row.id, decision });
      if (result.error) {
        unmark(row.id);
        feedbackToast.error(result.error);
      }
      setExemptionBusy(false);
    });
  }

  function handleJoinDecision(row: AdminRequestRow, decision: "approved" | "rejected") {
    const resultLabel = decision === "approved" ? "已批准" : "已驳回";
    setHandledMap((prev) => ({ ...prev, [row.id]: decision }));
    setJoinBusy(true);

    settleTimers.current[row.id] = setTimeout(() => {
      setJoins((prev) => prev.filter((r) => r.id !== row.id));
      delete settleTimers.current[row.id];
    }, SETTLE_MS);

    toast.success(`${resultLabel} ${row.applicantName || "未命名"} 的入团申请`, {
      duration: SETTLE_MS,
      action: { label: "撤销", onClick: () => unmark(row.id) },
    });

    startTransition(async () => {
      const action =
        decision === "approved" ? approveJoinRequestAction : rejectJoinRequestAction;
      const result = await action(row.id, null);
      if (!result.ok) {
        unmark(row.id);
        feedbackToast.error(result.error);
      }
      setJoinBusy(false);
    });
  }

  const totalsByTab: Record<ReviewTab, number> = {
    submissions: submissionsTotal,
    exemptions: exemptionsTotal,
    joins: joins.length,
  };
  const totalAll = totalsByTab.submissions + totalsByTab.exemptions + totalsByTab.joins;

  const tabs: { key: ReviewTab; label: string; count: number }[] = [
    { key: "submissions", label: "待催交", count: totalsByTab.submissions },
    { key: "exemptions", label: "豁免申请", count: totalsByTab.exemptions },
    { key: "joins", label: "入团申请", count: totalsByTab.joins },
  ];

  const headerActions = (
    <>
      {activeTab === "submissions" ? (
        <button
          type="button"
          onClick={() => setRemindLogOpen(true)}
          className="inline-flex items-center gap-0.5 text-[11px] text-zinc-400 transition-colors hover:text-zinc-700"
        >
          <Bell className="size-3 stroke-[1.5]" />
          催交历史
        </button>
      ) : null}
      <ViewAllLink
        href={
          activeTab === "submissions"
            ? "/admin"
            : activeTab === "exemptions"
              ? "/admin/modules?focus=exemption"
              : "/admin/modules?focus=team"
        }
      />
    </>
  );

  return (
    <>
      <section className="relative flex h-[480px] flex-col rounded-2xl border border-zinc-200 bg-white">
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="self-center text-zinc-400">
              <UserCheck2 className="size-4 stroke-[1.5]" />
            </span>
            <h3 className="text-[16px] font-semibold tracking-tight text-zinc-800">
              待审批
            </h3>
            <span
              className={cn(
                "text-[18px] font-medium leading-none tabular-nums",
                totalAll === 0 ? "text-zinc-300" : "text-zinc-800",
              )}
            >
              {totalAll}
            </span>
            {handledCount > 0 ? (
              <span className="text-[11px] text-zinc-400">已处理 {handledCount}</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        </header>

        <div className="flex shrink-0 items-center gap-1 border-t border-zinc-100 px-4 pt-2 pb-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "group inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition",
                activeTab === t.key
                  ? "bg-zinc-100 font-medium text-zinc-800"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700",
              )}
            >
              {t.label}
              {t.count > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums",
                    activeTab === t.key
                      ? "bg-zinc-700 text-white"
                      : "bg-zinc-200 text-zinc-600",
                  )}
                >
                  {t.count > 99 ? "99+" : t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex flex-1 min-h-0 flex-col">
          {activeTab === "submissions" ? (
            submissions.length === 0 ? (
              <EmptyState text="所有在岗成员今天都已交报" />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 [&::-webkit-scrollbar-track]:bg-transparent">
                <ul className="space-y-0.5">
                  {submissions.map((row) => {
                    const handled = handledMap[row.profile_id];
                    return (
                      <li
                        key={row.profile_id}
                        className={cn(
                          "group relative rounded-lg",
                          handled && "opacity-40 pointer-events-none",
                          !handled && "hover:bg-zinc-50",
                        )}
                      >
                        <div className="grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5">
                          <span className="truncate text-[11px] text-zinc-400">
                            {row.team_name ?? "未分组"}
                          </span>
                          <span className="truncate text-[13px] text-zinc-700">{row.name}</span>
                          <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                            {row.last_report_date ?? "—"}
                          </span>
                        </div>
                        {handled ? (
                          <span className="absolute top-1 right-2 text-[10px] text-zinc-400">
                            {handled === "approved" ? "已催" : "已忽略"}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : null}

          {activeTab === "exemptions" ? (
            exemptions.length === 0 ? (
              <EmptyState text="暂无待审豁免申请" />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 [&::-webkit-scrollbar-track]:bg-transparent">
                <ul className="space-y-0.5">
                  {exemptions.map((row) => {
                    const typeLabel =
                      EXEMPTION_TYPE_LABELS[row.exemption_type] ?? row.exemption_type;
                    const handled = handledMap[row.id];
                    return (
                      <li
                        key={row.id}
                        className={cn(
                          "group relative rounded-lg transition-all duration-300",
                          handled
                            ? "max-h-0 opacity-0 overflow-hidden pointer-events-none"
                            : "hover:bg-zinc-50",
                        )}
                      >
                        <div className="flex w-full items-start gap-2.5 px-3 py-1.5 pr-[120px]">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D99E55]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] tracking-tight text-zinc-700">
                              {row.applicant_name}
                              <span className="ml-1.5 text-[11px] text-zinc-400">
                                {typeLabel}
                              </span>
                            </p>
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400">
                              {row.reason ?? "未填写原因"}
                            </p>
                          </div>
                        </div>
                        {handled ? null : (
                          <HoverActions>
                            <RejectButton
                              onClick={() => handleExemptionDecision(row, "rejected")}
                              busy={exemptionBusy}
                            />
                            <ApproveButton
                              onClick={() => handleExemptionDecision(row, "approved")}
                              busy={exemptionBusy}
                            />
                          </HoverActions>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : null}

          {activeTab === "joins" ? (
            joins.length === 0 ? (
              <EmptyState text="暂无入团申请" />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 [&::-webkit-scrollbar-track]:bg-transparent">
                <ul className="space-y-0.5">
                  {joins.map((row) => {
                    const handled = handledMap[row.id];
                    return (
                      <li
                        key={row.id}
                        className={cn(
                          "group relative rounded-lg transition-all duration-300",
                          handled
                            ? "max-h-0 opacity-0 overflow-hidden pointer-events-none"
                            : "hover:bg-zinc-50",
                        )}
                      >
                        <div className="flex w-full items-start gap-2 px-3 py-1.5 pr-[120px]">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] tracking-tight text-zinc-700">
                              {row.applicantName || "未命名"}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                              <UserPlus className="mr-0.5 inline size-3 stroke-[1.5]" />
                              申请加入「{row.targetTeamName || "未知团队"}」
                            </p>
                          </div>
                        </div>
                        {handled ? null : (
                          <HoverActions>
                            <RejectButton
                              onClick={() => handleJoinDecision(row, "rejected")}
                              busy={joinBusy}
                            />
                            <ApproveButton
                              onClick={() => handleJoinDecision(row, "approved")}
                              busy={joinBusy}
                            />
                          </HoverActions>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : null}
        </div>
      </section>

      <RemindLogDialog date={date} open={remindLogOpen} onOpenChange={setRemindLogOpen} />
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-3 py-8">
      <p className="text-[12px] text-zinc-400">{text}</p>
    </div>
  );
}

/* ── Today Hero：今日待办大数字（每屏唯一 Display） ── */
function TodayHero({ date, totalPending }: { date: string; totalPending: number }) {
  const dateLabel = useMemo(() => {
    try {
      const d = new Date(date);
      return d.toLocaleDateString("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "short",
      });
    } catch {
      return date;
    }
  }, [date]);

  return (
    <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
          Today · {dateLabel}
        </p>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-zinc-950">
            {totalPending}
          </span>
          <span className="text-[14px] font-medium text-zinc-500">件 待你处理</span>
        </div>
        <p className="mt-2 max-w-xl text-[13px] leading-[1.7] text-zinc-500">
          下方主区是必须当天拍板的事，处理完会自动推进到下一条；底部的数字是其他模块的入口。
        </p>
      </div>
    </section>
  );
}

/* ── Anomaly Timeline：异常线索横向带（复盘提示，非主动作） ── */
function AnomalyTimeline({
  rows,
  total,
}: {
  rows: PendingVideoRow[];
  total: number;
}) {
  const [activeRow, setActiveRow] = useState<PendingVideoRow | null>(null);

  return (
    <>
      <section>
        <header className="flex items-baseline justify-between gap-3 px-1">
          <div className="flex items-baseline gap-2.5">
            <h3 className="text-[13px] font-medium tracking-tight text-zinc-700">
              异常线索
            </h3>
            <span className="text-[12px] tabular-nums text-zinc-400">
              {total} 条
            </span>
          </div>
          <a
            href="/admin/content?view=all"
            className="inline-flex items-center gap-0.5 text-[12px] text-zinc-400 transition-colors hover:text-zinc-700"
          >
            去批改台
            <ChevronRight className="size-3 stroke-[1.5]" />
          </a>
        </header>

        {rows.length === 0 ? (
          <div className="mt-3 rounded-xl bg-zinc-50/60 px-4 py-6 text-center">
            <p className="text-[12px] text-zinc-400">今天没有暴涨或腰斩的视频</p>
          </div>
        ) : (
          <ul className="mt-3 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {rows.map((row) => {
              const isSurge = row.play_change_signal === "surge";
              return (
                <li key={row.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveRow(row)}
                    className="active:translate-y-0 group flex h-[88px] w-[200px] flex-col justify-between rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-left transition-[border-color,background-color] duration-150 hover:border-zinc-300 hover:bg-zinc-50/60"
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate text-[13px] font-medium text-zinc-800">
                        {row.account_name}
                      </span>
                      <span
                        className={cn(
                          "ml-2 inline-flex size-1.5 shrink-0 rounded-full",
                          isSurge ? "bg-[#C9604D]" : "bg-[#6FAA7D]",
                        )}
                      />
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] text-zinc-400">
                        {isSurge ? "暴涨" : "腰斩"} {formatPct(row.play_count_change_pct)}
                      </span>
                      <span className="text-[14px] font-medium tabular-nums text-zinc-700">
                        {(row.current_play_count ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <VideoPreviewDialog
        row={activeRow}
        open={activeRow !== null}
        onOpenChange={(o) => !o && setActiveRow(null)}
      />
    </>
  );
}

/* ── Metric Links：底部数据钩子，把其他模块的核心数字拉到首页 ── */
function MetricLinks({ metrics }: { metrics: QueueMetricSummary }) {
  const items = [
    { label: "新增视频", value: String(metrics.newVideosToday), hint: "今日入库", href: "/admin/videos" },
    { label: "提交率", value: `${metrics.weeklySubmissionRate}%`, hint: "本周累计", href: "/admin/analytics" },
    { label: "复盘完成", value: String(metrics.weeklyReviewedCount), hint: "本周", href: "/admin/content" },
    { label: "案例沉淀", value: String(metrics.caseLibraryPendingCount), hint: "待整理", href: "/violations" },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <a
          key={it.label}
          href={it.href}
          className="active:translate-y-0 group flex flex-col rounded-xl border border-zinc-200 bg-white px-4 py-3.5 transition-[border-color,background-color] duration-150 hover:border-zinc-300 hover:bg-zinc-50/40"
        >
          <span className="text-[11px] text-zinc-400">{it.hint}</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[18px] font-semibold tabular-nums text-zinc-800">
              {it.value}
            </span>
            <span className="text-[12px] text-zinc-500">{it.label}</span>
          </div>
          <span className="mt-2 inline-flex items-center gap-0.5 text-[11px] text-zinc-400 transition-colors group-hover:text-zinc-700">
            打开
            <ChevronRight className="size-3 stroke-[1.5]" />
          </span>
        </a>
      ))}
    </section>
  );
}

export function AdminQueueSection({
  date,
  initialSummary = null,
  initialData,
}: {
  date: string;
  initialSummary?: CockpitSummary | null;
  initialData?: {
    pendingVideos: PendingVideoRow[];
    pendingSubmissions: PendingSubmissionRow[];
    pendingExemptions: ExemptionRequestRow[];
    pendingJoinRequests: AdminRequestRow[];
  };
}) {
  const resolved = initialData ?? {
    pendingVideos: [],
    pendingSubmissions: [],
    pendingExemptions: [],
    pendingJoinRequests: [],
  };

  const initialOverview: QueueOverviewPayload | null =
    initialSummary && initialData
      ? {
          summary: initialSummary,
          pendingVideos: initialData.pendingVideos,
          pendingSubmissions: initialData.pendingSubmissions,
          pendingExemptions: initialData.pendingExemptions,
          pendingJoinRequests: initialData.pendingJoinRequests,
          metrics: {
            newVideosToday: initialData.pendingVideos.length,
            weeklySubmissionRate: 0,
            weeklyReviewedCount: 0,
            caseLibraryPendingCount: 0,
          },
        }
      : null;

  const { data: overview, error } = useSafeFetch<QueueOverviewPayload>(
    `/api/admin/cockpit/queue-overview?date=${date}`,
    180_000,
    initialOverview,
  );

  const summary = overview?.summary ?? initialSummary;
  const pendingVideos = overview?.pendingVideos ?? resolved.pendingVideos;
  const pendingSubmissions = overview?.pendingSubmissions ?? resolved.pendingSubmissions;
  const pendingExemptions = overview?.pendingExemptions ?? resolved.pendingExemptions;
  const pendingJoinRequests = overview?.pendingJoinRequests ?? resolved.pendingJoinRequests;
  const metrics = overview?.metrics ?? {
    newVideosToday: pendingVideos.length,
    weeklySubmissionRate: 0,
    weeklyReviewedCount: 0,
    caseLibraryPendingCount: 0,
  };

  const totals = {
    videos: summary?.pending_videos ?? 0,
    submissions: summary?.pending_submissions ?? 0,
    exemptions: summary?.pending_exemptions ?? 0,
  };

  const totalPending =
    totals.submissions + totals.exemptions + pendingJoinRequests.length;

  const isInitialLoading =
    overview == null && initialSummary == null && initialData == null && error == null;

  return (
    <div className="space-y-8">
      <TodayHero date={date} totalPending={totalPending} />

      {isInitialLoading ? (
        <section className="flex h-[480px] items-center justify-center rounded-2xl border border-zinc-200 bg-white">
          <p className="text-[12px] text-zinc-400">正在加载待办数据…</p>
        </section>
      ) : (
        <ReviewBatchCard
          date={date}
          initialSubmissions={pendingSubmissions}
          initialExemptions={pendingExemptions}
          initialJoins={pendingJoinRequests}
          submissionsTotal={totals.submissions}
          exemptionsTotal={totals.exemptions}
        />
      )}

      <AnomalyTimeline rows={pendingVideos} total={totals.videos} />

      <MetricLinks metrics={metrics} />
    </div>
  );
}

export function AdminCockpit({ date }: { date: string }) {
  return <AdminQueueSection date={date} />;
}
