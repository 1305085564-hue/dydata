import { Sparkles, ShieldAlert, TestTube2, CheckCircle2, CircleDashed, ClockAlert, Slash } from "lucide-react";

import { cn } from "@/lib/utils";

type UsageState = "available" | "banned" | "testing" | "not_recommended" | string | null | undefined;
type ReviewStatus = "submitted" | "verified" | "rejected" | "archived" | string | null | undefined;
type RiskLevel = "high" | "medium" | "low" | string | null | undefined;
type PromotionLevel = "promoted" | "normal" | "watching" | "deprecated" | string | null | undefined;

const USAGE_META: Record<string, { label: string; dotColor: string; textClass: string }> = {
  available: { label: "可用", dotColor: "#6FAA7D", textClass: "text-stone-700" },
  banned: { label: "禁用", dotColor: "#C9604D", textClass: "text-stone-700" },
  testing: { label: "待测试", dotColor: "#D99E55", textClass: "text-stone-700" },
  not_recommended: { label: "× 推荐", dotColor: "#a1a1aa", textClass: "text-stone-500" },
};

const STATUS_META: Record<string, { label: string; dotColor?: string }> = {
  submitted: { label: "待审核", dotColor: "#D99E55" },
  verified: { label: "已审核", dotColor: "#6FAA7D" },
  rejected: { label: "已驳回", dotColor: "#C9604D" },
  archived: { label: "已归档" },
};

const RISK_META: Record<string, { label: string; dotColor: string }> = {
  high: { label: "高风险", dotColor: "#C9604D" },
  medium: { label: "中风险", dotColor: "#D99E55" },
  low: { label: "低风险", dotColor: "#6FAA7D" },
};

const PROMOTION_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  promoted: { label: "推广", icon: Sparkles },
  watching: { label: "观察", icon: ClockAlert },
  deprecated: { label: "废弃", icon: CircleDashed },
};

export function UsageStateBadge({
  usageState,
  size = "md",
}: {
  usageState: UsageState;
  size?: "sm" | "md" | "lg";
}) {
  const meta = USAGE_META[usageState ?? ""] ?? USAGE_META.available;
  const sizeClass =
    size === "lg"
      ? "h-8 px-3 text-[13px] gap-2"
      : size === "sm"
        ? "h-6 px-2 text-[11px] gap-1.5"
        : "h-7 px-2.5 text-[12px] gap-1.5";
  const dotSize = size === "lg" ? "size-2" : "size-1.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border border-stone-200 font-medium",
        meta.textClass,
        sizeClass,
      )}
    >
      <span className={cn("rounded-full", dotSize)} style={{ backgroundColor: meta.dotColor }} />
      {meta.label}
    </span>
  );
}

export function ReviewStatusChip({ status }: { status: ReviewStatus }) {
  const meta = STATUS_META[status ?? ""] ?? STATUS_META.submitted;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600">
      {meta.dotColor ? (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.dotColor }} />
      ) : null}
      {meta.label}
    </span>
  );
}

export function RiskLevelChip({ riskLevel }: { riskLevel: RiskLevel }) {
  if (!riskLevel) return null;
  const meta = RISK_META[riskLevel];
  if (!meta) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.dotColor }} />
      {meta.label}
    </span>
  );
}

export function PromotionLevelChip({ promotionLevel }: { promotionLevel: PromotionLevel }) {
  if (!promotionLevel || promotionLevel === "normal") return null;
  const meta = PROMOTION_META[promotionLevel];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600">
      <Icon className="size-3 stroke-[1.75]" />
      {meta.label}
    </span>
  );
}
