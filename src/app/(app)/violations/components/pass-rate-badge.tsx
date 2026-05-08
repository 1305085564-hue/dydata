import { Badge } from "@/components/ui/badge";
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
    return <Badge variant="outline">暂无测试</Badge>;
  }

  return (
    <Badge variant={rate >= 80 ? "success" : rate >= 50 ? "warning" : "danger"}>
      {compact ? `${rate}%` : `通过率 ${rate}% · ${getConfidenceLabel(total)}`}
    </Badge>
  );
}

