"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { SummaryData } from "./types";

interface HealthBarProps {
  summary: SummaryData | null;
}

export function HealthBar({ summary }: HealthBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!summary) return null;

  const isHealthy =
    summary.unattributed === 0 && summary.neverFillMembers.length === 0;

  if (isHealthy) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-500">
        本月 <span className="font-semibold text-zinc-900">{summary.total}</span> 条
        · 已归属 <span className="font-semibold text-zinc-900">{summary.attributed}</span> 条
        · 自运营 <span className="font-semibold text-zinc-900">{summary.selfHandled}</span> 条
      </div>
    );
  }

  const neverFillCount = summary.neverFillMembers.length;
  const displayedMembers = summary.neverFillMembers.slice(0, 3).map((m) => m.name);
  const overflowCount = neverFillCount - 3;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-amber-800 shadow-2xs transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <AlertCircle className="size-4 shrink-0 text-amber-600" />
          <span>归属健康度提醒</span>
          <span className="text-[12px] font-normal text-amber-700/80">
            （本月 {summary.total} 条记录中，{summary.unattributed} 条未完整归属）
          </span>
        </div>
        {neverFillCount > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-[12px] font-medium text-amber-700 hover:text-amber-900 active:scale-95 transition-transform"
          >
            {isExpanded ? "收起明细" : "展开明细"}
            {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        )}
      </div>

      {(isExpanded || neverFillCount === 0) && (
        <div className="mt-2.5 pt-2.5 border-t border-amber-200/60 text-[12px] leading-relaxed text-amber-900/90">
          <p>
            本月共有 <strong className="font-semibold text-amber-950">{summary.unattributed}</strong> 条作品缺乏明确的文案、剪辑或运营归属。
          </p>
          {neverFillCount > 0 && (
            <p className="mt-1">
              从不填分工的成员（仅标自己）：
              <span className="font-medium text-amber-950">
                {displayedMembers.join("、")}
                {overflowCount > 0 && ` 等共 ${neverFillCount} 人`}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
