"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type AdviceRow = {
  id: string;
  case_id: string;
  script_text: string;
  category: string | null;
  risk_level: string | null;
  admin_conclusion: string | null;
  suggested_action: string | null;
  reviewed_at: string | null;
  submitted_by_name: string | null;
};

const RISK_LABEL: Record<string, { text: string; className: string }> = {
  high: { text: "高风险", className: "bg-[#C9604D]/10 text-[#C9604D]" },
  medium: { text: "中风险", className: "bg-[#D99E55]/10 text-[#D99E55]" },
  low: { text: "低风险", className: "bg-zinc-100 text-zinc-500" },
};

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdviceTab() {
  const [rows, setRows] = useState<AdviceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/conversion-hub/advice?limit=50", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: AdviceRow[] };
      setRows(json.data ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
        <Loader2 className="size-5 animate-spin stroke-[1.5] text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-zinc-50 p-6 text-[13px] text-[#C9604D]">
        建议动作队列读取失败：{error}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
        <p className="text-[14px] font-medium text-zinc-800">暂无待执行的建议动作</p>
        <p className="mt-1 text-[12px] text-zinc-500">
          复核确认后填写「建议动作」，这里会出现可跟进的条目
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center border-l-2 border-[#D97757] pl-3">
          <h2 className="text-[15px] font-medium tracking-tight text-zinc-800">建议动作队列</h2>
        </div>
        <Link
          href="/admin/advice"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#D97757] transition-[color] duration-150 hover:text-[#C46A49]"
        >
          进入完整工作台
          <ArrowRight className="size-3 stroke-[1.5]" />
        </Link>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const risk = row.risk_level ? RISK_LABEL[row.risk_level] ?? null : null;
          return (
            <li key={row.id}>
              <Link
                href={`/violations/${row.case_id}`}
                className="group block rounded-2xl border border-zinc-200 bg-white px-4 py-4 transition-[background-color,border-color] duration-150 hover:border-zinc-300 hover:bg-zinc-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] leading-snug text-zinc-700">
                      {row.script_text}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {row.submitted_by_name ?? "未知成员"}
                      {row.category ? ` · ${row.category}` : ""}
                      {row.reviewed_at ? ` · 复核于 ${formatDate(row.reviewed_at)}` : ""}
                    </p>
                  </div>
                  {risk && (
                    <span
                      className={cn(
                        "shrink-0 rounded-[10px] px-2 py-0.5 text-[10px] font-medium",
                        risk.className,
                      )}
                    >
                      {risk.text}
                    </span>
                  )}
                </div>
                {row.admin_conclusion ? (
                  <p className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-[12px] leading-6 text-zinc-600">
                    <span className="font-medium text-zinc-700">结论：</span>
                    {row.admin_conclusion}
                  </p>
                ) : null}
                {row.suggested_action ? (
                  <p className="mt-2 rounded-xl bg-[#D97757]/5 px-3 py-2 text-[12px] leading-6 text-zinc-700">
                    <span className="font-medium text-[#D97757]">建议动作：</span>
                    {row.suggested_action}
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
