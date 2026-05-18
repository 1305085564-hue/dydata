"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  ShieldAlert,
  UserCheck2,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import type { SopMemberStatus, SopCheckpoint } from "@/types";
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

/* ── SOP 检查点 → 队列卡片映射 ── */
const SOP_CHECKPOINT_MAP: Record<string, SopCheckpoint[]> = {
  "待筛视频": ["VIDEO"],
  "待审违规": ["SCRIPT", "TOPIC"],
  "待催交成员": ["DATA_REPORT", "MORNING_REVIEW"],
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

function StatCell({ label, value, tone }: { label: string; value: number; tone: "neutral" | "warning" | "danger" }) {
  const toneClass = {
    neutral: value === 0 ? "text-zinc-400" : "text-zinc-800",
    warning: value > 0 ? "text-[#D99E55]" : "text-zinc-400",
    danger: value > 0 ? "text-[#C9604D]" : "text-zinc-400",
  }[tone];
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
        {label}
      </span>
      <span className={cn("mt-1 text-[18px] font-semibold tracking-tight font-mono tabular-nums", toneClass)}>
        {value}
      </span>
    </div>
  );
}

function StatusBar({ summary }: { summary: CockpitSummary | null }) {
  const videos = summary?.pending_videos ?? 0;
  const violations = summary?.pending_violations ?? 0;
  const submissions = summary?.pending_submissions ?? 0;
  const exemptions = summary?.pending_exemptions ?? 0;

  return (
    <div className="grid grid-cols-1 gap-x-12 gap-y-3 border-y border-zinc-100 py-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCell label="待筛视频" value={videos} tone="warning" />
      <StatCell label="待审违规" value={violations} tone="danger" />
      <StatCell label="待催交成员" value={submissions} tone="neutral" />
      <StatCell label="待审豁免" value={exemptions} tone="neutral" />
    </div>
  );
}

function OverdueBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C9604D] px-1 text-[10px] font-semibold text-white shadow-sm">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function QueueCard({
  title,
  icon,
  count,
  empty,
  viewAllHref,
  overdueCount,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: string;
  viewAllHref: string;
  overdueCount?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="relative flex flex-col rounded-2xl border border-zinc-200 bg-white min-h-[200px]">
      <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <div className="relative flex items-center gap-2">
          <span className="text-zinc-500">{icon}</span>
          <h3 className="text-[13px] font-medium tracking-tight text-zinc-800">{title}</h3>
          {count > 0 && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 font-mono tabular-nums">
              {count}
            </span>
          )}
          <OverdueBadge count={overdueCount ?? 0} />
        </div>
        <Link
          href={viewAllHref}
          className="flex items-center gap-0.5 text-[12px] text-zinc-400 transition-[color] duration-150 hover:text-zinc-700"
        >
          查看全部
          <ChevronRight className="size-3 stroke-[1.5]" />
        </Link>
      </header>
      <div className="flex flex-1 px-5 py-2">
        {count === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6">
            <p className="text-[12px] text-zinc-400">{empty}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function PendingVideosQueue({
  date,
  initialRows,
  overdueCount,
}: {
  date: string;
  initialRows: PendingVideoRow[];
  overdueCount: number;
}) {
  const { data } = useSafeFetch<{ data: PendingVideoRow[] }>(
    `/api/admin/cockpit/pending-videos?date=${date}&limit=10`,
    30_000,
    { data: initialRows },
  );
  const rows = data?.data ?? [];

  return (
    <QueueCard
      title="待筛视频"
      icon={<Video className="size-4 stroke-[1.5]" />}
      count={rows.length}
      empty="今天的视频都已打标且无异常"
      viewAllHref="/admin/videos?view=pending"
      overdueCount={overdueCount}
    >
      <ul className="divide-y divide-zinc-100">
        {rows.slice(0, 5).map((row) =>(
          <li key={row.id}>
            <Link
              href={`/admin/videos?focus=${row.id}`}
              className="group flex items-start justify-between gap-3 py-2 transition-[color] duration-150 hover:text-zinc-900"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium tracking-tight text-zinc-800">
                  {row.account_name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                  {row.submitted_by_name ?? "未知成员"} · {row.report_date}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
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
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </QueueCard>
  );
}

function PendingViolationsQueue({
  initialRows,
  overdueCount,
}: {
  initialRows: PendingViolationRow[];
  overdueCount: number;
}) {
  const { data } = useSafeFetch<{ data: PendingViolationRow[] }>(
    `/api/admin/cockpit/pending-violations?limit=10`,
    30_000,
    { data: initialRows },
  );
  const rows = data?.data ?? [];

  return (
    <QueueCard
      title="待审违规"
      icon={<ShieldAlert className="size-4 stroke-[1.5]" />}
      count={rows.length}
      empty="当前没有需要复核的违规案例"
      viewAllHref="/admin/conversion-hub?tab=violations"
      overdueCount={overdueCount}
    >
      <ul className="divide-y divide-zinc-100">
        {rows.slice(0, 5).map((row) => {
          const risk = RISK_LABEL[row.risk_level ?? ""] ?? null;
          return (
            <li key={row.id}>
              <Link
                href={`/admin/conversion-hub?tab=violations&focus=${row.id}`}
                className="group block py-2 transition-[color] duration-150 hover:text-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
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
                <p className="mt-1 text-[11px] text-zinc-400">
                  {row.submitted_by_name ?? "未知成员"}
                  {row.category ? ` · ${row.category}` : ""}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </QueueCard>
  );
}

function PendingSubmissionsQueue({
  date,
  initialRows,
  overdueCount,
}: {
  date: string;
  initialRows: PendingSubmissionRow[];
  overdueCount: number;
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
      <QueueCard
        title="待催交成员"
        icon={<UserCheck2 className="size-4 stroke-[1.5]" />}
        count={rows.length}
        empty="所有在岗成员今天都已交报"
        viewAllHref="/admin"
        overdueCount={overdueCount}
      >
        <ul className="w-full divide-y divide-zinc-100">
          {rows.slice(0, 8).map((row) => (
            <li key={row.profile_id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-[60px] truncate text-[11px] text-zinc-400">
                {row.team_name ?? "未分组"}
              </span>
              <span className="text-zinc-300">·</span>
              <span className="flex-1 truncate text-[13px] text-zinc-700">{row.name}</span>
              {row.last_report_date ? (
                <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
                  {row.last_report_date}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-end border-t border-zinc-100 pt-2">
          <button
            type="button"
            onClick={() => setRemindLogOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-700"
          >
            <Bell className="size-3 stroke-[1.5]" />
            查看历史
          </button>
        </div>
      </QueueCard>
      <RemindLogDialog date={date} open={remindLogOpen} onOpenChange={setRemindLogOpen} />
    </>
  );
}

function AnomalyBanner({ summary }: { summary: CockpitSummary | null }) {
  const exemptions = summary?.pending_exemptions ?? 0;
  if (exemptions === 0) return null;
  return (
    <Link
      href="/admin/modules?focus=exemption"
      className="flex items-center justify-between gap-3 border-l-2 border-[#D99E55] bg-[#D99E55]/5 px-5 py-3 transition-[background-color] duration-150 hover:bg-[#D99E55]/10"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-4 stroke-[1.5] text-[#D99E55]" />
        <p className="text-[13px] tracking-tight text-zinc-700">
          有 <span className="font-semibold text-[#D99E55]">{exemptions}</span> 条豁免申请待你审批
        </p>
      </div>
      <ChevronRight className="size-4 stroke-[1.5] text-zinc-400" />
    </Link>
  );
}

export function AdminStatusSection({ date, initialSummary = null }: { date: string; initialSummary?: CockpitSummary | null }) {
  const { data: summary } = useSafeFetch<CockpitSummary>(
    `/api/admin/cockpit/summary?date=${date}`,
    30_000,
    initialSummary,
  );

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

      <StatusBar summary={summary} />
      <AnomalyBanner summary={summary} />
    </div>
  );
}

export function AdminQueueSection({
  date,
  initialData,
}: {
  date: string;
  initialData?: {
    pendingVideos: PendingVideoRow[];
    pendingViolations: PendingViolationRow[];
    pendingSubmissions: PendingSubmissionRow[];
  };
}) {
  const resolvedInitialData = initialData ?? {
    pendingVideos: [],
    pendingViolations: [],
    pendingSubmissions: [],
  };

  const { counts } = useSopOverdueCount(date);

  return (
    <div className="grid gap-4 lg:grid-cols-3 items-stretch">
      <PendingVideosQueue
        date={date}
        initialRows={resolvedInitialData.pendingVideos}
        overdueCount={counts(SOP_CHECKPOINT_MAP["待筛视频"])}
      />
      <PendingViolationsQueue
        initialRows={resolvedInitialData.pendingViolations}
        overdueCount={counts(SOP_CHECKPOINT_MAP["待审违规"])}
      />
      <PendingSubmissionsQueue
        date={date}
        initialRows={resolvedInitialData.pendingSubmissions}
        overdueCount={counts(SOP_CHECKPOINT_MAP["待催交成员"])}
      />
    </div>
  );
}

export function AdminCockpit({ date }: { date: string }) {
  return (
    <div className="space-y-5">
      <AdminStatusSection date={date} />
      <AdminQueueSection date={date} />
    </div>
  );
}
