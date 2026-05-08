import { Badge } from "@/components/ui/badge";
import type { ViolationCase } from "./types";
import { getStatusLabel } from "./format";

export function StatusBadge({ caseItem }: { caseItem: Pick<ViolationCase, "status" | "is_violation"> }) {
  const variant =
    caseItem.status === "submitted"
      ? "warning"
      : caseItem.status === "verified" && caseItem.is_violation
        ? "danger"
        : caseItem.status === "verified"
          ? "success"
          : "neutral";

  return <Badge variant={variant}>{getStatusLabel(caseItem)}</Badge>;
}

