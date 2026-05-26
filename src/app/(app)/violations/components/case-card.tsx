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
      dotColor: "#D97757",
      eyebrowClass: "text-zinc-500",
      label: "推荐",
      isBanned: false,
      icon: Sparkles,
    };
  }
  if (ext.usage_state === "banned") {
    return {
      dotColor: "#C9604D",
      eyebrowClass: "text-[#C9604D]",
      label: "禁用",
      isBanned: true,
      icon: ShieldAlert,
    };
  }
  if (ext.usage_state === "testing") {
    return {
      dotColor: "#D99E55",
      eyebrowClass: "text-[#D99E55]",
      label: "待测试",
      isBanned: false,
      icon: TestTube2,
    };
  }
  if (ext.usage_state === "not_recommended") {
    return {
      dotColor: "#a1a1aa",
      eyebrowClass: "text-zinc-500",
      label: "× 推荐",
      isBanned: false,
      icon: ShieldAlert,
    };
  }
  return {
    dotColor: "#6FAA7D",
    eyebrowClass: "text-zinc-500",
    label: "可用",
    isBanned: false,
    icon: null,
  };
}

export function CaseCard({ caseItem }: { caseItem: ViolationCase }) {
  const accent = resolveAccent(caseItem);
  const isBanned = accent.isBanned;

  return (
    <Link
      href={`/violations/${caseItem.id}`}
      className={`group block relative rounded-2xl p-5 transition-all ${
        isBanned
          ? "bg-zinc-50"
          : "bg-white hover:shadow-[0_4px_16px_-8px_rgba(15,23,42,0.06)] hover:-translate-y-[1px]"
      }`}
    >
      {/* 右上角 Eyebrow */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: accent.dotColor }} />
        <span className={`text-[10px] font-medium uppercase tracking-[0.25em] ${accent.eyebrowClass}`}>
          {accent.label}
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
              {caseItem.category || "其他"}
            </span>
            <PassRateBadge passCount={caseItem.pass_count} failCount={caseItem.fail_count} compact />
          </div>
          <p className={`line-clamp-3 text-sm font-semibold leading-7 ${isBanned ? "text-zinc-600" : "text-zinc-800"}`}>
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
