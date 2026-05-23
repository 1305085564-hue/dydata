"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Bell,
  ChevronRight,
  ShieldAlert,
  UserCheck2,
  UserPlus,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { SopMemberStatus, SopCheckpoint } from "@/types";
import type { AdminRequestRow } from "@/lib/team-join/service";
import type { ExemptionRequestRow } from "../豁免申请列表";
import { reviewExemptionRequest } from "../actions";
import {
  approveJoinRequestAction,
  rejectJoinRequestAction,
} from "../join-request-actions";
import {
  ExemptionPreviewDialog,
  JoinPreviewDialog,
  SubmissionPreviewDialog,
  ViolationPreviewDialog,
  VideoPreviewDialog,
} from "./queue-quick-preview";
import type {
  CockpitSummary,
  PendingSubmissionRow,
  PendingVideoRow,
  PendingViolationRow,
} from "./admin-first-screen-loader";
import { RemindLogDialog } from "./remind-log-dialog";

const SOP_CHECKPOINT_MAP: Record<string, SopCheckpoint[]> = {
  "待筛视频": ["VIDEO"],
  "待审违规": ["SCRIPT", "TOPIC"],
  "待催交成员": ["DATA_REPORT", "MORNING_REVIEW"],
};

const EXEMPTION_TYPE_LABELS: Record<string, string> = {
  yesterday: "昨日",
  range: "多日",
  permanent: "永久",
  single: "昨日",
  "3days": "多日",
  "4days": "多日",
  "5days": "多日",
};

const RISK_RAIL: Record<string, string> = {
  high: "border-l-[#C9604D]",
  medium: "border-l-[#D99E55]",
  low: "border-l-zinc-200",
};

function useSafeFetch<T>(url: string, intervalMs = 60_000, initialData: T | null = null) {
  const [data, setData] = useState<T | null>(initialData);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
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

function useSopOverdueCount(date: string) {
  const { data } = useSafeFetch<{ ok: boolean; members: SopMemberStatus[] }>(
    `/api/sop/status?date=${date}`,
    60_000,
    null,
  );
  const members = data?.ok ? data.members : [];
  const counts = useCallback(
    (checkpoints: SopCheckpoint[]) => {
      let n = 0;
      for (const m of members) {
        for (const cp of checkpoints) {
          if (m.statuses[cp] === "OVERDUE") n++;
        }
      }
      return n;
    },
    [members],
  );
  return { counts };
}

function OverdueBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#C9604D] px-1 text-[12px] font-medium tabular-nums text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface CardShellProps {
  title: string;
  icon: React.ReactNode;
  total: number;
  totalTone: "neutral" | "warning" | "danger";
  empty: string;
  hasContent: boolean;
  overdueCount?: number;
  headerRight?: React.ReactNode;
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
  overdueCount,
  headerRight,
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
              "text-[24px] font-semibold leading-none tracking-tight tabular-nums",
              totalToneClass,
            )}
          >
            {total}
          </span>
          <OverdueBadge count={overdueCount ?? 0} />
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
      className="flex items-center gap-0.5 text-[12px] text-zinc-400 transition-colors hover:text-zinc-700"
    >
      {label}
      <ChevronRight className="size-3 stroke-[1.5]" />
    </a>
  );
}

/* ── 1. 待筛视频 ── */
function PendingVideosCard({
  date,
  initialRows,
  overdueCount,
  total,
}: {
  date: string;
  initialRows: PendingVideoRow[];
  overdueCount: number;
  total: number;
}) {
  const { data } = useSafeFetch<{ data: PendingVideoRow[] }>(
    `/api/admin/cockpit/pending-videos?date=${date}&limit=10`,
    30_000,
    { data: initialRows },
  );
  const rows = data?.data ?? [];
  const [activeRow, setActiveRow] = useState<PendingVideoRow | null>(null);

  return (
    <>
      <CardShell
        title="待筛视频"
        icon={<Video className="size-4 stroke-[1.5]" />}
        total={total}
        totalTone="warning"
        empty="今天的视频都已打标且无异常"
        hasContent={rows.length > 0}
        overdueCount={overdueCount}
        headerRight={<ViewAllLink href="/admin/videos?view=pending" />}
      >
        <ul className="space-y-0.5">
          {rows.slice(0, 5).map((row) => {
            const stateDot = row.anomaly_flag
              ? "bg-[#C9604D]"
              : !row.has_tags
                ? "bg-zinc-300"
                : "bg-[#6FAA7D]";
            const stateText = row.anomaly_flag
              ? "异常"
              : !row.has_tags
                ? "未打标"
                : "已打标";
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setActiveRow(row)}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-50"
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", stateDot)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium tracking-tight text-zinc-800">
                      {row.account_name}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-zinc-400">
                      {row.submitted_by_name ?? "未知成员"} · {row.report_date} · {stateText}
                    </p>
                  </div>
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

/* ── 2. 待审违规 ── */
function PendingViolationsCard({
  initialRows,
  overdueCount,
  total,
}: {
  initialRows: PendingViolationRow[];
  overdueCount: number;
  total: number;
}) {
  const { data } = useSafeFetch<{ data: PendingViolationRow[] }>(
    `/api/admin/cockpit/pending-violations?limit=10`,
    30_000,
    { data: initialRows },
  );
  const rows = data?.data ?? [];
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [activeRow, setActiveRow] = useState<PendingViolationRow | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const visible = useMemo(() => rows.filter((r) => !removed.has(r.id)), [rows, removed]);

  async function handleReview(row: PendingViolationRow, status: "verified" | "rejected") {
    setReviewing(true);
    try {
      const res = await fetch(`/api/violations/${row.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          risk_level: row.risk_level ?? null,
          admin_conclusion: null,
          suggested_action: null,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("操作失败");
      setRemoved((prev) => new Set(prev).add(row.id));
      feedbackToast.success(status === "verified" ? "已确认风险" : "已驳回");
      setActiveRow(null);
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setReviewing(false);
    }
  }

  return (
    <>
      <CardShell
        title="待复核"
        icon={<ShieldAlert className="size-4 stroke-[1.5]" />}
        total={total}
        totalTone="danger"
        empty="当前没有需要复核的案例"
        hasContent={visible.length > 0}
        overdueCount={overdueCount}
        headerRight={<ViewAllLink href="/violations?perspective=review" />}
      >
        <ul className="space-y-0.5">
          {visible.slice(0, 5).map((row) => {
            const railClass = RISK_RAIL[row.risk_level ?? ""] ?? "border-l-zinc-200";
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setActiveRow(row)}
                  className={cn(
                    "group flex w-full items-start gap-2 border-l-[2px] pl-3 pr-2 py-1.5 text-left transition-colors hover:bg-zinc-50",
                    railClass,
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] leading-[1.55] tracking-tight text-zinc-700">
                      {row.script_text}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-zinc-400">
                      {row.submitted_by_name ?? "未知成员"}
                      {row.category ? ` · ${row.category}` : ""}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </CardShell>
      <ViolationPreviewDialog
        row={activeRow}
        open={activeRow !== null}
        onOpenChange={(o) => !o && setActiveRow(null)}
        onReview={handleReview}
        reviewing={reviewing}
      />
    </>
  );
}

/* ── 3. 待审批合并卡（催交 / 豁免 / 入团） ── */
type ReviewTab = "submissions" | "exemptions" | "joins";

function ReviewBatchCard({
  date,
  initialSubmissions,
  initialExemptions,
  initialJoins,
  submissionsTotal,
  exemptionsTotal,
  submissionsOverdue,
}: {
  date: string;
  initialSubmissions: PendingSubmissionRow[];
  initialExemptions: ExemptionRequestRow[];
  initialJoins: AdminRequestRow[];
  submissionsTotal: number;
  exemptionsTotal: number;
  submissionsOverdue: number;
}) {
  const [activeTab, setActiveTab] = useState<ReviewTab>(() => {
    if (initialJoins.length > 0) return "joins";
    if (initialExemptions.length > 0) return "exemptions";
    return "submissions";
  });

  const { data: submissionData } = useSafeFetch<{ data: PendingSubmissionRow[] }>(
    `/api/admin/cockpit/pending-submissions?date=${date}`,
    60_000,
    { data: initialSubmissions },
  );
  const submissions = submissionData?.data ?? [];

  const [exemptions, setExemptions] = useState(initialExemptions);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setExemptions(initialExemptions), [initialExemptions]);

  const [joins, setJoins] = useState(initialJoins);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setJoins(initialJoins), [initialJoins]);

  const [, startTransition] = useTransition();
  const [exemptionBusy, setExemptionBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [activeSubmission, setActiveSubmission] = useState<PendingSubmissionRow | null>(null);
  const [activeExemption, setActiveExemption] = useState<ExemptionRequestRow | null>(null);
  const [activeJoin, setActiveJoin] = useState<AdminRequestRow | null>(null);
  const [remindLogOpen, setRemindLogOpen] = useState(false);

  function handleExemptionDecision(
    row: ExemptionRequestRow,
    decision: "approved" | "rejected",
  ) {
    setExemptionBusy(true);
    setExemptions((prev) => prev.filter((r) => r.id !== row.id));
    setActiveExemption(null);
    feedbackToast.success(
      decision === "approved"
        ? `已同意 ${row.applicant_name} 的豁免申请`
        : `已驳回 ${row.applicant_name} 的豁免申请`,
    );
    startTransition(async () => {
      const result = await reviewExemptionRequest({ requestId: row.id, decision });
      if (result.error) {
        setExemptions((prev) =>
          prev.some((r) => r.id === row.id)
            ? prev
            : [...prev, row].sort(
                (a, b) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              ),
        );
        feedbackToast.error(result.error);
      }
      setExemptionBusy(false);
    });
  }

  function handleJoinDecision(row: AdminRequestRow, decision: "approved" | "rejected") {
    setJoinBusy(true);
    setJoins((prev) => prev.filter((r) => r.id !== row.id));
    setActiveJoin(null);
    feedbackToast.success(
      decision === "approved"
        ? `已同意 ${row.applicantName || "未命名"} 的入团申请`
        : `已驳回 ${row.applicantName || "未命名"} 的入团申请`,
    );
    startTransition(async () => {
      const action =
        decision === "approved" ? approveJoinRequestAction : rejectJoinRequestAction;
      const result = await action(row.id, null);
      if (!result.ok) {
        setJoins((prev) =>
          prev.some((r) => r.id === row.id)
            ? prev
            : [...prev, row].sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              ),
        );
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
          className="inline-flex items-center gap-0.5 text-[12px] text-zinc-400 transition-colors hover:text-zinc-700"
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
                "text-[24px] font-semibold leading-none tracking-tight tabular-nums",
                totalAll === 0 ? "text-zinc-300" : "text-zinc-800",
              )}
            >
              {totalAll}
            </span>
            <OverdueBadge count={submissionsOverdue} />
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
                    "inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[12px] font-medium tabular-nums",
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
                  {submissions.map((row) => (
                    <li key={row.profile_id}>
                      <button
                        type="button"
                        onClick={() => setActiveSubmission(row)}
                        className="grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-zinc-50"
                      >
                        <span className="truncate text-[12px] text-zinc-400">
                          {row.team_name ?? "未分组"}
                        </span>
                        <span className="truncate text-[13px] text-zinc-700">{row.name}</span>
                        <span className="shrink-0 text-[12px] tabular-nums text-zinc-400">
                          {row.last_report_date ?? "—"}
                        </span>
                      </button>
                    </li>
                  ))}
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
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => setActiveExemption(row)}
                          className="flex w-full items-start gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-zinc-50"
                        >
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D99E55]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] tracking-tight text-zinc-700">
                              {row.applicant_name}
                              <span className="ml-1.5 text-[12px] text-zinc-400">
                                {typeLabel}
                              </span>
                            </p>
                            <p className="mt-0.5 line-clamp-1 text-[12px] text-zinc-400">
                              {row.reason ?? "未填写原因"}
                            </p>
                          </div>
                        </button>
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
                  {joins.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setActiveJoin(row)}
                        className="flex w-full items-start gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-zinc-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] tracking-tight text-zinc-700">
                            {row.applicantName || "未命名"}
                          </p>
                          <p className="mt-0.5 truncate text-[12px] text-zinc-400">
                            <UserPlus className="mr-0.5 inline size-3 stroke-[1.5]" />
                            申请加入「{row.targetTeamName || "未知团队"}」
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ) : null}
        </div>
      </section>

      <SubmissionPreviewDialog
        row={activeSubmission}
        date={date}
        open={activeSubmission !== null}
        onOpenChange={(o) => !o && setActiveSubmission(null)}
        onOpenRemindLog={() => setRemindLogOpen(true)}
      />
      <ExemptionPreviewDialog
        row={activeExemption}
        open={activeExemption !== null}
        onOpenChange={(o) => !o && setActiveExemption(null)}
        onDecision={handleExemptionDecision}
        reviewing={exemptionBusy}
      />
      <JoinPreviewDialog
        row={activeJoin}
        open={activeJoin !== null}
        onOpenChange={(o) => !o && setActiveJoin(null)}
        onDecision={handleJoinDecision}
        reviewing={joinBusy}
      />
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
    pendingViolations: PendingViolationRow[];
    pendingSubmissions: PendingSubmissionRow[];
    pendingExemptions: ExemptionRequestRow[];
    pendingJoinRequests: AdminRequestRow[];
  };
}) {
  const resolved = initialData ?? {
    pendingVideos: [],
    pendingViolations: [],
    pendingSubmissions: [],
    pendingExemptions: [],
    pendingJoinRequests: [],
  };

  const { data: summary } = useSafeFetch<CockpitSummary>(
    `/api/admin/cockpit/summary?date=${date}`,
    30_000,
    initialSummary,
  );
  const { counts } = useSopOverdueCount(date);

  const totals = {
    videos: summary?.pending_videos ?? 0,
    violations: summary?.pending_violations ?? 0,
    submissions: summary?.pending_submissions ?? 0,
    exemptions: summary?.pending_exemptions ?? 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[24px] font-semibold tracking-tight text-zinc-800">
          团队管理
        </h1>
        <span className="text-[12px] uppercase tracking-[0.25em] font-medium text-zinc-400">
          今天该处理谁
        </span>
      </div>

      <div className="grid items-stretch gap-1 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr]">
        <PendingVideosCard
          date={date}
          initialRows={resolved.pendingVideos}
          overdueCount={counts(SOP_CHECKPOINT_MAP["待筛视频"])}
          total={totals.videos}
        />
        <PendingViolationsCard
          initialRows={resolved.pendingViolations}
          overdueCount={counts(SOP_CHECKPOINT_MAP["待审违规"])}
          total={totals.violations}
        />
        <div className="lg:col-span-2 xl:col-span-1">
          <ReviewBatchCard
            date={date}
            initialSubmissions={resolved.pendingSubmissions}
            initialExemptions={resolved.pendingExemptions}
            initialJoins={resolved.pendingJoinRequests}
            submissionsTotal={totals.submissions}
            exemptionsTotal={totals.exemptions}
            submissionsOverdue={counts(SOP_CHECKPOINT_MAP["待催交成员"])}
          />
        </div>
      </div>
    </div>
  );
}

export function AdminCockpit({ date }: { date: string }) {
  return <AdminQueueSection date={date} />;
}
