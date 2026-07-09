import { getConfidenceLabel, getPassRate } from "./format";

export function PassRateBadge({
  passCount,
  failCount,
  compact = false,
}: {
  passCount?: number | null;
  failCount?: number | null;
  compact?: boolean;
}) {
  const pass = passCount ?? 0;
  const fail = failCount ?? 0;
  const total = pass + fail;
  const rate = getPassRate({ pass_count: pass, fail_count: fail });

  if (rate === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-500">
        <span className="size-1.5 rounded-full bg-stone-300" />
        暂无测试
      </span>
    );
  }

  const dotColor = rate >= 80 ? "#6FAA7D" : rate >= 50 ? "#D99E55" : "#C9604D";

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
      {compact ? `${rate}%` : `通过率 ${rate}% · ${getConfidenceLabel(total)}`}
    </span>
  );
}
