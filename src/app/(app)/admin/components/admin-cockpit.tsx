"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  ChevronRight,
  ShieldAlert,
  Tag,
  UserCheck2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { SopMemberStatus, SopCheckpoint } from "@/types";
import type { ExemptionRequestRow } from "../豁免申请列表";
import { reviewExemptionRequest } from "../actions";
import type {
  CockpitSummary,
  PendingSubmissionRow,
  PendingVideoRow,
  PendingViolationRow,
} from "./admin-first-screen-loader";
import { RemindLogDialog } from "./remind-log-dialog";

const RISK_LABEL: Record<string, { text: string; className: string }> = {
  high: { text: "高", className: "text-[#C9604D] bg-[#C9604D]/10" },
  medium: { text: "中", className: "text-[#D99E55] bg-[#D99E55]/10" },
  low: { text: "低", className: "text-zinc-500 bg-zinc-100" },
};

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

function useSafeFetch<T>(url: string, intervalMs = 60_000, initialData: T | null = null) {
  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(initialData === null);
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
    } finally {
      setLoading(false);
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

  return { data, loading, error };
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
      let count = 0;
      for (const member of members) {
        for (const cp of checkpoints) {
          if (member.statuses[cp] === "OVERDUE") {
            count++;
          }
        }
      }
      return count;
    },
    [members],
  );

  return { counts };
}

function OverdueBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C9604D] px-1 text-[10px] font-semibold text-white shadow-sm">
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface QueueCardShellProps {
  title: string;
  icon: React.ReactNode;
  total: number;
  totalTone: "neutral" | "warning" | "danger";
  empty: string;
  viewAllHref: string;
  viewAllSlot?: React.ReactNode;
  overdueCount?: number;
  hasContent: boolean;
  children: React.ReactNode;
}

function QueueCardShell({
  title,
  icon,
  total,
  totalTone,
  empty,
  viewAllHref,
  viewAllSlot,
  overdueCount,
  hasContent,
  children,
}: QueueCardShellProps) {
  const totalToneClass = {
    neutral: total === 0 ? "text-zinc-400" : "text-zinc-800",
    warning: total > 0 ? "text-[#D99E55]" : "text-zinc-400",
    danger: total > 0 ? "text-[#C9604D]" : "text-zinc-400",
  }[totalTone];

  return (
    <section className="relative flex h-full min-h-[340px] flex-col rounded-2xl border border-zinc-200 bg-white">
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">{icon}</span>
            <h3 className="text-[12px] font-medium tracking-tight text-zinc-700">{title}</h3>
            <OverdueBadge count={overdueCount ?? 0} />
          </div>
          <span
            className={cn(
              "block font-mono text-[26px] font-semibold leading-none tracking-tight tabular-nums",
              totalToneClass,
            )}
          >
            {total}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {viewAllSlot}
          <Link
            href={viewAllHref}
            className="flex items-center gap-0.5 text-[11px] text-zinc-400 transition-colors hover:text-zinc-700"
          >
            查看全部
            <ChevronRight className="size-3 stroke-[1.5]" />
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col border-t border-zinc-100 px-2 py-1">
        {!hasContent ? (
          <div className="flex flex-1 items-center justify-center px-3 py-8">
            <p className="text-[12px] text-zinc-400">{empty}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function RowAction({
  label,
  tone = "neutral",
  loading,
  onClick,
}: {
  label: string;
  tone?: "neutral" | "primary" | "danger";
  loading?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const toneClass = {
    neutral: "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100",
    primary: "text-[#C9604D] hover:text-[#A04A38] hover:bg-[#C9604D]/10",
    danger: "text-zinc-500 hover:text-[#C9604D] hover:bg-[#C9604D]/8",
  }[tone];

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      disabled={loading}
      className={cn(
        "inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        toneClass,
      )}
    >
      {label}
    </button>
  );
}

/* ── 1. 待筛视频 ── */
function PendingVideosQueue({
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

  return (
    <QueueCardShell
      title="待筛视频"
      icon={<Video className="size-4 stroke-[1.5]" />}
      total={total}
      totalTone="warning"
      empty="今天的视频都已打标且无异常"
      viewAllHref="/admin/videos?view=pending"
      overdueCount={overdueCount}
      hasContent={rows.length > 0}
    >
      <ul className="space-y-0.5">
        {rows.slice(0, 5).map((row) => (
          <li key={row.id} className="group">
            <Link
              href={`/admin/videos?focus=${row.id}`}
              className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-zinc-50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium tracking-tight text-zinc-800">
                  {row.account_name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                  {row.submitted_by_name ?? "未知成员"} · {row.report_date}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {row.anomaly_flag && (
                  <span className="rounded-[10px] bg-[#C9604D]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#C9604D]">
                    异常
                  </span>
                )}
                {!row.has_tags && (
                  <span className="rounded-[10px] bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                    未打标
                  </span>
                )}
                <span className="ml-1 hidden items-center gap-1 text-[11px] font-medium text-zinc-500 transition-colors group-hover:flex group-hover:text-zinc-800">
                  <Tag className="size-3 stroke-[1.5]" />
                  打标
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </QueueCardShell>
  );
}

/* ── 2. 待审违规 ── */
function PendingViolationsQueue({
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
  const [busy, setBusy] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const visible = rows.filter((r) => !removed.has(r.id));

  async function handleReview(row: PendingViolationRow, status: "verified" | "rejected") {
    setBusy(row.id);
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
      feedbackToast.success(status === "verified" ? "已确认违规" : "已驳回");
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <QueueCardShell
      title="待审违规"
      icon={<ShieldAlert className="size-4 stroke-[1.5]" />}
      total={total}
      totalTone="danger"
      empty="当前没有需要复核的违规案例"
      viewAllHref="/admin/conversion-hub?tab=violations"
      overdueCount={overdueCount}
      hasContent={visible.length > 0}
    >
      <ul className="space-y-0.5">
        {visible.slice(0, 5).map((row) => {
          const risk = RISK_LABEL[row.risk_level ?? ""] ?? null;
          return (
            <li key={row.id} className="group">
              <Link
                href={`/admin/conversion-hub?tab=violations&focus=${row.id}`}
                className="flex items-start gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-zinc-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-[13px] tracking-tight text-zinc-700">
                      {row.script_text}
                    </p>
                    {risk && (
                      <span
                        className={cn(
                          "shrink-0 rounded-[10px] px-1.5 py-0.5 text-[10px] font-medium",
                          risk.className,
                        )}
                      >
                        风险 {risk.text}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-zinc-400">
                    {row.submitted_by_name ?? "未知成员"}
                    {row.category ? ` · ${row.category}` : ""}
                  </p>
                </div>
                <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <RowAction
                    label="通过"
                    tone="primary"
                    loading={busy === row.id}
                    onClick={() => void handleReview(row, "verified")}
                  />
                  <RowAction
                    label="驳回"
                    tone="danger"
                    loading={busy === row.id}
                    onClick={() => void handleReview(row, "rejected")}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </QueueCardShell>
  );
}

/* ── 3. 待催交成员 ── */
function PendingSubmissionsQueue({
  date,
  initialRows,
  overdueCount,
  total,
}: {
  date: string;
  initialRows: PendingSubmissionRow[];
  overdueCount: number;
  total: number;
}) {
  const { data } = useSafeFetch<{ data: PendingSubmissionRow[] }>(
    `/api/admin/cockpit/pending-submissions?date=${date}`,
    60_000,
    { data: initialRows },
  );
  const rows = data?.data ?? [];
  const [remindLogOpen, setRemindLogOpen] = useState(false);

  return (
    <>
      <QueueCardShell
        title="待催交成员"
        icon={<UserCheck2 className="size-4 stroke-[1.5]" />}
        total={total}
        totalTone="neutral"
        empty="所有在岗成员今天都已交报"
        viewAllHref="/admin"
        overdueCount={overdueCount}
        hasContent={rows.length > 0}
        viewAllSlot={
          <button
            type="button"
            onClick={() => setRemindLogOpen(true)}
            className="inline-flex items-center gap-0.5 text-[11px] text-zinc-400 transition-colors hover:text-zinc-700"
            aria-label="查看催交历史"
          >
            <Bell className="size-3 stroke-[1.5]" />
            历史
          </button>
        }
      >
        <ul className="w-full space-y-0.5">
          {rows.slice(0, 6).map((row) => (
            <li key={row.profile_id} className="group">
              <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-zinc-50">
                <span className="truncate text-[11px] text-zinc-400">
                  {row.team_name ?? "未分组"}
                </span>
                <span className="truncate text-[13px] text-zinc-700">{row.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                  {row.last_report_date ?? "—"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </QueueCardShell>
      <RemindLogDialog date={date} open={remindLogOpen} onOpenChange={setRemindLogOpen} />
    </>
  );
}

/* ── 4. 待审豁免 ── */
function PendingExemptionsQueue({
  initialRows,
  total,
}: {
  initialRows: ExemptionRequestRow[];
  total: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  function handleDecision(row: ExemptionRequestRow, decision: "approved" | "rejected") {
    setBusy(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    feedbackToast.success(
      decision === "approved"
        ? `已同意 ${row.applicant_name} 的豁免申请`
        : `已驳回 ${row.applicant_name} 的豁免申请`,
    );

    startTransition(async () => {
      const result = await reviewExemptionRequest({ requestId: row.id, decision });
      if (result.error) {
        setRows((prev) =>
          prev.some((r) => r.id === row.id)
            ? prev
            : [...prev, row].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              ),
        );
        feedbackToast.error(result.error);
      }
      setBusy(null);
    });
  }

  return (
    <QueueCardShell
      title="待审豁免"
      icon={<UserCheck2 className="size-4 stroke-[1.5]" />}
      total={total}
      totalTone="warning"
      empty="暂无待审批申请"
      viewAllHref="/admin/modules?focus=exemption"
      hasContent={rows.length > 0}
    >
      <ul className="space-y-0.5">
        {rows.slice(0, 5).map((row) => {
          const typeLabel = EXEMPTION_TYPE_LABELS[row.exemption_type] ?? row.exemption_type;
          return (
            <li key={row.id} className="group">
              <div className="flex items-start gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-zinc-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium tracking-tight text-zinc-800">
                    {row.applicant_name}
                    <span className="ml-1.5 rounded-[10px] bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                      {typeLabel}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-zinc-400">
                    {row.reason ?? "未填写原因"}
                  </p>
                </div>
                <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <RowAction
                    label="同意"
                    tone="primary"
                    loading={busy === row.id}
                    onClick={() => handleDecision(row, "approved")}
                  />
                  <RowAction
                    label="驳回"
                    tone="danger"
                    loading={busy === row.id}
                    onClick={() => handleDecision(row, "rejected")}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </QueueCardShell>
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
  };
}) {
  const resolvedInitialData = initialData ?? {
    pendingVideos: [],
    pendingViolations: [],
    pendingSubmissions: [],
    pendingExemptions: [],
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
        <h1 className="text-[20px] font-semibold tracking-tight text-zinc-800">
          管理员中控台
        </h1>
        <span className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
          Operating Cockpit
        </span>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <PendingVideosQueue
          date={date}
          initialRows={resolvedInitialData.pendingVideos}
          overdueCount={counts(SOP_CHECKPOINT_MAP["待筛视频"])}
          total={totals.videos}
        />
        <PendingViolationsQueue
          initialRows={resolvedInitialData.pendingViolations}
          overdueCount={counts(SOP_CHECKPOINT_MAP["待审违规"])}
          total={totals.violations}
        />
        <PendingSubmissionsQueue
          date={date}
          initialRows={resolvedInitialData.pendingSubmissions}
          overdueCount={counts(SOP_CHECKPOINT_MAP["待催交成员"])}
          total={totals.submissions}
        />
        <PendingExemptionsQueue
          initialRows={resolvedInitialData.pendingExemptions}
          total={totals.exemptions}
        />
      </div>
    </div>
  );
}

export function AdminCockpit({ date }: { date: string }) {
  return <AdminQueueSection date={date} />;
}
