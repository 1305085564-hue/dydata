"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Bell,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  UserCheck2,
  UserPlus,
  Video,
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

interface CardShellProps {
  title: string;
  icon: React.ReactNode;
  total: number;
  totalTone: "neutral" | "warning" | "danger";
  empty: string;
  hasContent: boolean;
  headerRight?: React.ReactNode;
  totalNote?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

function CardShell({
  title,
  icon,
  total,
  totalTone,
  empty,
  hasContent,
  headerRight,
  totalNote,
  className,
  children,
}: CardShellProps) {
  const totalToneClass = {
    neutral: total === 0 ? "text-zinc-300" : "text-zinc-800",
    warning: total > 0 ? "text-[#D99E55]" : "text-zinc-300",
    danger: total > 0 ? "text-[#C9604D]" : "text-zinc-300",
  }[totalTone];

  return (
    <section
      className={cn(
        "relative flex h-[320px] flex-col rounded-2xl border border-zinc-200 bg-white",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="self-center text-zinc-400">{icon}</span>
          <h3 className="text-[12px] font-medium tracking-tight text-zinc-600">{title}</h3>
          <span
            className={cn(
              "text-[18px] font-medium leading-none tabular-nums",
              totalToneClass,
            )}
          >
            {total}
          </span>
          {totalNote}
        </div>
        <div className="flex shrink-0 items-center gap-2">{headerRight}</div>
      </header>
      <div className="flex flex-1 min-h-0 flex-col border-t border-zinc-100">
        {!hasContent ? (
          <div className="flex flex-1 items-center justify-center px-3 py-6">
            <p className="text-[12px] text-zinc-400">{empty}</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 [&::-webkit-scrollbar-track]:bg-transparent">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

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

/* ── 1. 异常视频 ── */
function formatPct(pct: number | null): string {
  if (pct == null) return "";
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function PendingVideosCard({
  date,
  initialRows,
  total,
}: {
  date: string;
  initialRows: PendingVideoRow[];
  total: number;
}) {
  const { data } = useSafeFetch<{ data: PendingVideoRow[] }>(
    `/api/admin/cockpit/pending-videos?date=${date}&limit=10`,
    180_000,
    { data: initialRows },
  );
  const rows = data?.data ?? [];
  const [activeRow, setActiveRow] = useState<PendingVideoRow | null>(null);

  return (
    <>
      <CardShell
        title="异常视频"
        icon={<Video className="size-4 stroke-[1.5]" />}
        total={total}
        totalTone="warning"
        empty="今天没有暴涨或腰斩的视频"
        hasContent={rows.length > 0}
        headerRight={<ViewAllLink href="/admin/content?view=all" />}
      >
        <ul className="space-y-0.5">
          {rows.slice(0, 5).map((row) => {
            const isSurge = row.play_change_signal === "surge";
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setActiveRow(row)}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-50"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center",
                      isSurge ? "text-[#C9604D]" : "text-[#6FAA7D]",
                    )}
                  >
                    {isSurge ? (
                      <TrendingUp className="size-4 stroke-[1.75]" />
                    ) : (
                      <TrendingDown className="size-4 stroke-[1.75]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium tracking-tight text-zinc-800">
                      {row.account_name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                      {row.submitted_by_name ?? "未知成员"} · {isSurge ? "暴涨" : "腰斩"}{" "}
                      {formatPct(row.play_count_change_pct)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-[12px] font-medium tabular-nums",
                      isSurge ? "text-[#C9604D]" : "text-[#6FAA7D]",
                    )}
                  >
                    {(row.current_play_count ?? 0).toLocaleString()}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </CardShell>
      <VideoPreviewDialog
        row={activeRow}
        open={activeRow !== null}
        onOpenChange={(o) => !o && setActiveRow(null)}
      />
    </>
  );
}

/* ── 2. 待审批合并卡（催交 / 豁免 / 入团） ── */
type ReviewTab = "submissions" | "exemptions" | "joins";

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

  const { data: submissionData } = useSafeFetch<{ data: PendingSubmissionRow[] }>(
    `/api/admin/cockpit/pending-submissions?date=${date}`,
    300_000,
    { data: initialSubmissions },
  );
  const submissions = submissionData?.data ?? [];

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

  const handledCount = useMemo(
    () => Object.keys(handledMap).length,
    [handledMap],
  );

  function handleExemptionDecision(
    row: ExemptionRequestRow,
    decision: "approved" | "rejected",
  ) {
    const resultLabel = decision === "approved" ? "已批准" : "已驳回";
    setHandledMap((prev) => ({ ...prev, [row.id]: decision }));
    setExemptionBusy(true);

    toast.success(`${resultLabel} ${row.applicant_name} 的豁免申请`, {
      action: {
        label: "撤销",
        onClick: () => {
          setHandledMap((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
        },
      },
    });

    startTransition(async () => {
      const result = await reviewExemptionRequest({ requestId: row.id, decision });
      if (result.error) {
        setHandledMap((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
        feedbackToast.error(result.error);
      }
      setExemptionBusy(false);
    });
  }

  function handleJoinDecision(row: AdminRequestRow, decision: "approved" | "rejected") {
    const resultLabel = decision === "approved" ? "已批准" : "已驳回";
    setHandledMap((prev) => ({ ...prev, [row.id]: decision }));
    setJoinBusy(true);

    toast.success(`${resultLabel} ${row.applicantName || "未命名"} 的入团申请`, {
      action: {
        label: "撤销",
        onClick: () => {
          setHandledMap((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
        },
      },
    });

    startTransition(async () => {
      const action =
        decision === "approved" ? approveJoinRequestAction : rejectJoinRequestAction;
      const result = await action(row.id, null);
      if (!result.ok) {
        setHandledMap((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
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
      <section className="relative flex h-[320px] flex-col rounded-2xl border border-zinc-200 bg-white">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="self-center text-zinc-400">
              <UserCheck2 className="size-4 stroke-[1.5]" />
            </span>
            <h3 className="text-[12px] font-medium tracking-tight text-zinc-600">
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
              <span className="text-[11px] text-zinc-400">(已处理 {handledCount})</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
        </header>

        <div className="flex shrink-0 items-center gap-1 border-t border-zinc-100 px-3 pt-2 pb-1">
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
                          "group relative rounded-lg",
                          handled && "opacity-40 pointer-events-none",
                          !handled && "hover:bg-zinc-50",
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
                        {handled ? (
                          <span className="absolute top-1 right-2 text-[10px] text-zinc-400">
                            {handled === "approved" ? "已批准" : "已拒绝"}
                          </span>
                        ) : (
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
                          "group relative rounded-lg",
                          handled && "opacity-40 pointer-events-none",
                          !handled && "hover:bg-zinc-50",
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
                        {handled ? (
                          <span className="absolute top-1 right-2 text-[10px] text-zinc-400">
                            {handled === "approved" ? "已批准" : "已拒绝"}
                          </span>
                        ) : (
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

  const { data: summary } = useSafeFetch<CockpitSummary>(
    `/api/admin/cockpit/summary?date=${date}`,
    180_000,
    initialSummary,
  );

  const totals = {
    videos: summary?.pending_videos ?? 0,
    submissions: summary?.pending_submissions ?? 0,
    exemptions: summary?.pending_exemptions ?? 0,
  };

  return (
    <div className="grid items-stretch gap-3 lg:grid-cols-2">
      <PendingVideosCard
        date={date}
        initialRows={resolved.pendingVideos}
        total={totals.videos}
      />
      <ReviewBatchCard
        date={date}
        initialSubmissions={resolved.pendingSubmissions}
        initialExemptions={resolved.pendingExemptions}
        initialJoins={resolved.pendingJoinRequests}
        submissionsTotal={totals.submissions}
        exemptionsTotal={totals.exemptions}
      />
    </div>
  );
}

export function AdminCockpit({ date }: { date: string }) {
  return <AdminQueueSection date={date} />;
}
