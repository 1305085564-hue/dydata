"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Shield, TrendingDown } from "lucide-react";

type CaseSummary = {
  id: string;
  script_text: string;
  pass_count: number;
  fail_count: number;
  pass_rate: number | null;
};

type RecentViolation = {
  id: string;
  script_text: string;
  created_at: string;
  risk_level: string | null;
  submitter_name: string;
};

type DashboardData = {
  dangerousTop3: CaseSummary[];
  safeTop3: CaseSummary[];
  weeklyStats: { newViolations: number; newCases: number };
  recentViolations: RecentViolation[];
};

export function RiskSummaryStrip() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/violations/dashboard-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (payload?.data) setData(payload.data);
      })
      .catch(() => {});
  }, []);

  if (!data) return null;

  const hasContent =
    data.dangerousTop3.length > 0 ||
    data.recentViolations.length > 0 ||
    data.weeklyStats.newViolations > 0;

  if (!hasContent) return null;

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between rounded-xl bg-stone-50 px-4 py-2.5 text-left transition-colors hover:bg-stone-100"
      >
        <span className="flex items-center gap-2 text-[13px] font-medium text-stone-700">
          <AlertTriangle className="size-4 stroke-[1.5] text-[#B24E3E]" />
          风险速览
        </span>
        <span className="text-[12px] text-stone-500">
          {collapsed ? "展开" : "收起"}
        </span>
      </button>

      {!collapsed && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* 本周统计 */}
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-[12px] tracking-[0.12em] text-stone-500">
              本周
            </p>
            <div className="mt-2 flex items-baseline gap-4">
              <div>
                <span className="text-[18px] font-medium tabular-nums text-[#B24E3E]">
                  {data.weeklyStats.newViolations}
                </span>
                <span className="ml-1 text-[12px] text-stone-500">条违规</span>
              </div>
              <div>
                <span className="text-[18px] font-medium tabular-nums text-stone-700">
                  {data.weeklyStats.newCases}
                </span>
                <span className="ml-1 text-[12px] text-stone-500">条新案例</span>
              </div>
            </div>
          </div>

          {/* 最危险 */}
          {data.dangerousTop3.length > 0 && (
            <div className="rounded-xl border border-stone-200 border-l-[2px] border-l-[#C9604D] bg-white p-4">
              <p className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.12em] text-[#B24E3E]">
                <TrendingDown className="size-3" />
                最危险
              </p>
              <ul className="mt-2 space-y-1.5">
                {data.dangerousTop3.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/violations/${c.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[12px] transition-colors hover:bg-stone-100"
                    >
                      <span className="truncate text-stone-700">{c.script_text}</span>
                      <span className="shrink-0 font-medium tabular-nums text-[#B24E3E]">
                        {c.pass_rate ?? 0}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 最安全 */}
          {data.safeTop3.length > 0 && (
            <div className="rounded-xl border border-stone-200 border-l-[2px] border-l-[#6FAA7D] bg-white p-4">
              <p className="flex items-center gap-1.5 text-[12px] font-medium tracking-[0.12em] text-[#3F7A4E]">
                <Shield className="size-3" />
                最安全
              </p>
              <ul className="mt-2 space-y-1.5">
                {data.safeTop3.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/violations/${c.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[12px] transition-colors hover:bg-stone-100"
                    >
                      <span className="truncate text-stone-700">{c.script_text}</span>
                      <span className="shrink-0 font-medium tabular-nums text-[#3F7A4E]">
                        {c.pass_rate}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
