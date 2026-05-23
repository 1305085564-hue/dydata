import Link from "next/link";
import { ArrowRight, Sparkles, ShieldAlert, TestTube2 } from "lucide-react";

import { PassRateBadge } from "./pass-rate-badge";
import { formatDateTime } from "./format";
import type { ViolationCase } from "./types";

type StaffCaseExtras = {
  usage_state?: string | null;
  promotion_level?: string | null;
};

function resolveAccent(item: ViolationCase) {
  const ext = item as ViolationCase & StaffCaseExtras;
  if (ext.promotion_level === "promoted") {
    return {
      border: "border-l-[#6FAA7D]",
      label: "推荐",
      labelClass: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
      icon: Sparkles,
    };
  }
  if (ext.usage_state === "banned") {
    return {
      border: "border-l-[#C9604D]",
      label: "禁用",
      labelClass: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
      icon: ShieldAlert,
    };
  }
  if (ext.usage_state === "testing") {
    return {
      border: "border-l-[#D97757]",
      label: "待测试",
      labelClass: "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
      icon: TestTube2,
    };
  }
  if (ext.usage_state === "not_recommended") {
    return {
      border: "border-l-zinc-400",
      label: "× 推荐",
      labelClass: "bg-zinc-100 text-zinc-500",
      icon: ShieldAlert,
    };
  }
  return {
    border: "border-l-[#5C8AB8]",
    label: "可用",
    labelClass: "bg-[#5C8AB8]/10 text-[#3F668F]",
    icon: null,
  };
}

export function CaseCard({ caseItem }: { caseItem: ViolationCase }) {
  const accent = resolveAccent(caseItem);
  const Icon = accent.icon;

  return (
    <Link
      href={`/violations/${caseItem.id}`}
      className={`group block rounded-2xl border border-zinc-200 border-l-[2px] ${accent.border} bg-white p-5 transition-colors hover:border-zinc-300`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${accent.labelClass}`}>
              {Icon ? <Icon className="size-3 stroke-[1.75]" /> : null}
              {accent.label}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
              {caseItem.category || "其他"}
            </span>
            <PassRateBadge passCount={caseItem.pass_count} failCount={caseItem.fail_count} compact />
          </div>
          <p className="line-clamp-3 text-sm font-semibold leading-7 text-zinc-800">
            {caseItem.script_text}
          </p>
          {caseItem.admin_conclusion ? (
            <p className="line-clamp-2 text-[12px] leading-6 text-zinc-500">{caseItem.admin_conclusion}</p>
          ) : null}
          <p className="text-[11px] text-zinc-400">{formatDateTime(caseItem.reviewed_at ?? caseItem.created_at)}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-800" />
      </div>
    </Link>
  );
}
