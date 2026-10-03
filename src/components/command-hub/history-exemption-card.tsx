"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ExemptionRequest } from "@/lib/exemption-approvals";
import {
  formatShortDate,
  resolveApprovalRequestId,
} from "@/lib/exemption-approvals";
import {
  getExemptionCategoryLabel,
  normalizeExemptionCategoryForDisplay,
  toExemptionCategory,
} from "@/lib/exemption-category";
import { formatRelativeTime } from "./types";

interface HistoryExemptionCardProps {
  item: ExemptionRequest;
  isProcessing: boolean;
  onReopen: (item: ExemptionRequest) => void;
}

export function HistoryExemptionCard({
  item,
  isProcessing,
  onReopen,
}: HistoryExemptionCardProps) {
  const reqId = resolveApprovalRequestId(item);
  const isApproved = item.request_status === "approved";
  const isPermanent = item.exemption_type === "permanent";
  const exemptionCategory = toExemptionCategory(item.exemption_category);
  const nature = normalizeExemptionCategoryForDisplay(exemptionCategory);
  const categoryLabel = getExemptionCategoryLabel(exemptionCategory);
  const dateText = isPermanent
    ? "永久生效"
    : item.end_date && item.end_date !== item.start_date
      ? `${formatShortDate(item.start_date)} 至 ${formatShortDate(item.end_date)}`
      : formatShortDate(item.start_date);

  return (
    <Card
      key={reqId || item.id}
      className="p-4 sm:p-4.5 space-y-2 transition-all gap-0"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] font-normal text-[#141413]">
            {item.applicant_name || "成员"}
          </span>
          <Badge variant={isApproved ? "success" : "danger"}>
            {isApproved ? "已同意" : "已拒绝"}
          </Badge>
          <span className="text-[12px] text-[#78716C]">
            {nature === "leave" ? "请假" : categoryLabel}
          </span>
        </div>
        <span className="text-[12px] text-[#78716C] tabular-nums">
          {item.reviewed_at ? formatRelativeTime(item.reviewed_at) : formatRelativeTime(item.created_at)}
        </span>
      </div>

      <div className="text-[12px] text-[#78716C] tabular-nums">
        {item.team_name || "未分组"} · {dateText}
      </div>

      {item.reason && (
        <div className="text-[13px] text-[#1F1E1D] leading-relaxed">
          <span className="text-[#78716C]">事由：</span>
          <span>{item.reason}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-[#E2E2DF]/60 text-[12px]">
        <span className="text-[#78716C]">
          {item.reviewed_by_name ? `由 ${item.reviewed_by_name} 审阅` : ""}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isProcessing || !reqId}
            onClick={() => onReopen(item)}
            className="rounded-md px-2 py-1 font-normal text-[#78716C] hover:bg-status-danger/10 hover:text-status-danger transition-colors cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? "打回中…" : "打回待处理"}
          </button>
        </div>
      </div>
    </Card>
  );
}
