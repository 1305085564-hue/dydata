import { Sparkles, ShieldAlert, TestTube2, CheckCircle2, CircleDashed, ClockAlert, Slash } from "lucide-react";

import { cn } from "@/lib/utils";

type UsageState = "available" | "banned" | "testing" | "not_recommended" | string | null | undefined;
type ReviewStatus = "submitted" | "verified" | "rejected" | "archived" | string | null | undefined;
type RiskLevel = "high" | "medium" | "low" | string | null | undefined;
type PromotionLevel = "promoted" | "normal" | "watching" | "deprecated" | string | null | undefined;

const USAGE_META: Record<string, { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
  available: { label: "可用", tone: "bg-[#5C8AB8]/10 text-[#3F668F] border-[#5C8AB8]/30", icon: CheckCircle2 },
  banned: { label: "禁用", tone: "bg-[#C9604D]/10 text-[#C9604D] border-[#C9604D]/30", icon: ShieldAlert },
  testing: { label: "待测试", tone: "bg-[#D97757]/10 text-[#D97757] border-[#D97757]/30", icon: TestTube2 },
  not_recommended: { label: "× 推荐", tone: "bg-zinc-100 text-zinc-500 border-zinc-200", icon: Slash },
};

const STATUS_META: Record<string, { label: string; tone: string }> = {
  submitted: { label: "待审核", tone: "bg-[#D99E55]/10 text-[#D99E55]" },
  verified: { label: "已审核", tone: "bg-[#6FAA7D]/10 text-[#6FAA7D]" },
  rejected: { label: "已驳回", tone: "bg-zinc-100 text-zinc-500" },
  archived: { label: "已归档", tone: "bg-zinc-100 text-zinc-400" },
};

const RISK_META: Record<string, { label: string; tone: string }> = {
  high: { label: "高风险", tone: "bg-[#C9604D]/10 text-[#C9604D]" },
  medium: { label: "中风险", tone: "bg-[#D99E55]/10 text-[#D99E55]" },
  low: { label: "低风险", tone: "bg-[#6FAA7D]/10 text-[#6FAA7D]" },
};

const PROMOTION_META: Record<string, { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
  promoted: { label: "推广", tone: "bg-[#6FAA7D]/10 text-[#6FAA7D]", icon: Sparkles },
  watching: { label: "观察", tone: "bg-[#D97757]/10 text-[#D97757]", icon: ClockAlert },
  deprecated: { label: "废弃", tone: "bg-zinc-100 text-zinc-500", icon: CircleDashed },
};

export function UsageStateBadge({
  usageState,
  size = "md",
}: {
  usageState: UsageState;
  size?: "sm" | "md" | "lg";
}) {
  const meta = USAGE_META[usageState ?? ""] ?? USAGE_META.available;
  const Icon = meta.icon;
  const sizeClass =
    size === "lg"
      ? "h-8 px-3 text-[13px]"
      : size === "sm"
        ? "h-6 px-2 text-[11px]"
        : "h-7 px-2.5 text-[12px]";
  const iconSize = size === "lg" ? "size-4" : "size-3.5";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border font-semibold", meta.tone, sizeClass)}>
      <Icon className={cn(iconSize, "stroke-[1.75]")} />
      {meta.label}
    </span>
  );
}

export function ReviewStatusChip({ status }: { status: ReviewStatus }) {
  const meta = STATUS_META[status ?? ""] ?? STATUS_META.submitted;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", meta.tone)}>
      {meta.label}
    </span>
  );
}

export function RiskLevelChip({ riskLevel }: { riskLevel: RiskLevel }) {
  if (!riskLevel) return null;
  const meta = RISK_META[riskLevel];
  if (!meta) return null;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", meta.tone)}>
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
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", meta.tone)}>
      <Icon className="size-3 stroke-[1.75]" />
      {meta.label}
    </span>
  );
}
