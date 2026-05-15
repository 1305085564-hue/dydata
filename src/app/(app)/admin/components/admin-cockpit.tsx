"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ShieldAlert,
  UserCheck2,
  Video,
} from "lucide-react";

import { cn } from "@/lib/utils";

type CockpitSummary = {
  pending_videos: number;
  pending_violations: number;
  pending_submissions: number;
  pending_exemptions: number;
};

type PendingVideoRow = {
  id: string;
  account_name: string;
  report_date: string;
  has_tags: boolean;
  anomaly_flag: boolean;
  submitted_by_name: string | null;
};

type PendingViolationRow = {
  id: string;
  script_text: string;
  category: string | null;
  risk_level: string | null;
  created_at: string;
  submitted_by_name: string | null;
};

type PendingSubmissionRow = {
  profile_id: string;
  name: string;
  team_id: string | null;
  team_name: string | null;
  last_report_date: string | null;
};

const RISK_LABEL: Record<string, { text: string; className: string }> = {
  high: { text: "高", className: "text-[#C9604D] bg-[#C9604D]/10" },
  medium: { text: "中", className: "text-[#D99E55] bg-[#D99E55]/10" },
  low: { text: "低", className: "text-zinc-500 bg-zinc-100" },
};

function useSafeFetch<T>(url: string, intervalMs = 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    try {
      const res = await fetch(url, { credentials: "include" });
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
    void run();
    const id = setInterval(() => {
      if (active) void run();
    }, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [run, intervalMs]);

  return { data, loading, error };
}

function StatCell({ label, value, tone }: { label: string; value: number; tone: "neutral" | "warning" | "danger" }) {
  const toneClass = {
    neutral: "text-zinc-800",
    warning: value > 0 ? "text-[#D99E55]" : "text-zinc-800",
    danger: value > 0 ? "text-[#C9604D]" : "text-zinc-800",
  }[tone];
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
        {label}
      </span>
      <span className={cn("mt-1 text-[22px] font-semibold tracking-tight font-mono tabular-nums", toneClass)}>
        {value}
      </span>
    </div>
  );
}

function StatusBar({ date }: { date: string }) {
  const { data } = useSafeFetch<CockpitSummary>(`/api/admin/cockpit/summary?date=${date}`, 30_000);
  const videos = data?.pending_videos ?? 0;
  const violations = data?.pending_violations ?? 0;
  const submissions = data?.pending_submissions ?? 0;
  const exemptions = data?.pending_exemptions ?? 0;

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-y border-zinc-100 py-3 md:grid-cols-4">
      <StatCell label="待筛视频" value={videos} tone="warning" />
      <StatCell label="待审违规" value={violations} tone="danger" />
      <StatCell label="待催交成员" value={submissions} tone="warning" />
      <StatCell label="待审豁免" value={exemptions} tone="neutral" />
    </div>
  );
}

function QueueCard({
  title,
  icon,
  count,
  empty,
  viewAllHref,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: string;
  viewAllHref: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-zinc-200 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">{icon}</span>
          <h3 className="text-[13px] font-medium tracking-tight text-zinc-800">{title}</h3>
          {count > 0 && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
              {count}
            </span>
          )}
        </div>
        <Link
          href={viewAllHref}
          className="flex items-center gap-0.5 text-[12px] text-zinc-400 transition-[color] duration-150 hover:text-zinc-700"
        >
          查看全部
          <ChevronRight className="size-3 stroke-[1.5]" />
        </Link>
      </header>
      <div className="flex-1 px-5 py-2">
        {count === 0 ? (
          <p className="py-8 text-center text-[12px] text-zinc-400">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function PendingVideosQueue({ date }: { date: string }) {
  const { data } = useSafeFetch<{ data: PendingVideoRow[] }>(
    `/api/admin/cockpit/pending-videos?date=${date}&limit=10`,
    30_000,
  );
  const rows = data?.data ?? [];

  return (
    <QueueCard
      title="待筛视频"
      icon={<Video className="size-4 stroke-[1.5]" />}
      count={rows.length}
      empty="今天的视频都已打标且无异常"
      viewAllHref="/admin/videos?view=pending"
    >
      <ul className="divide-y divide-zinc-100">
        {rows.slice(0, 6).map((row) => (
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

function PendingViolationsQueue() {
  const { data } = useSafeFetch<{ data: PendingViolationRow[] }>(
    `/api/admin/cockpit/pending-violations?limit=10`,
    30_000,
  );
  const rows = data?.data ?? [];

  return (
    <QueueCard
      title="待审违规"
      icon={<ShieldAlert className="size-4 stroke-[1.5]" />}
      count={rows.length}
      empty="当前没有需要复核的违规案例"
      viewAllHref="/admin/conversion-hub?tab=violations"
    >
      <ul className="divide-y divide-zinc-100">
        {rows.slice(0, 6).map((row) => {
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

function PendingSubmissionsQueue({ date }: { date: string }) {
  const { data } = useSafeFetch<{ data: PendingSubmissionRow[] }>(
    `/api/admin/cockpit/pending-submissions?date=${date}`,
    60_000,
  );
  const rows = data?.data ?? [];

  const groupedByTeam = useMemo(() => {
    const map = new Map<string, PendingSubmissionRow[]>();
    for (const row of rows) {
      const key = row.team_name ?? "未分组";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <QueueCard
      title="待催交成员"
      icon={<UserCheck2 className="size-4 stroke-[1.5]" />}
      count={rows.length}
      empty="所有在岗成员今天都已交报"
      viewAllHref="/admin"
    >
      <ul className="space-y-3">
        {groupedByTeam.slice(0, 4).map(([team, list]) => (
          <li key={team}>
            <p className="mb-1 text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
              {team}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {list.slice(0, 12).map((row) => (
                <span
                  key={row.profile_id}
                  className="rounded-full bg-zinc-50 px-2 py-0.5 text-[12px] text-zinc-600"
                  title={row.last_report_date ? `上次提交 ${row.last_report_date}` : "尚无提交记录"}
                >
                  {row.name}
                </span>
              ))}
              {list.length > 12 && (
                <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-[12px] text-zinc-400">
                  +{list.length - 12}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </QueueCard>
  );
}

function AnomalyBanner({ date }: { date: string }) {
  const { data } = useSafeFetch<CockpitSummary>(`/api/admin/cockpit/summary?date=${date}`, 60_000);
  const exemptions = data?.pending_exemptions ?? 0;
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

export function AdminStatusSection({ date }: { date: string }) {
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

      <StatusBar date={date} />
      <AnomalyBanner date={date} />
    </div>
  );
}

export function AdminQueueSection({ date }: { date: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <PendingVideosQueue date={date} />
      <PendingViolationsQueue />
      <PendingSubmissionsQueue date={date} />
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
