"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
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
import { formatRelativeTime, formatShanghaiDateTime } from "@/lib/command-hub/types";

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
  const [showConfirm, setShowConfirm] = useState(false);
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
  const formatMonthDay = (date: string | null | undefined) => {
    const match = /^(?:\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(date?.trim() ?? "");
    return match ? `${Number(match[1])}.${String(Number(match[2])).padStart(2, "0")}` : date ?? "";
  };
  const effectiveStart = formatMonthDay(item.start_date);
  const effectiveEnd = formatMonthDay(item.end_date || item.start_date);

  return (
    <Card
      key={reqId || item.id}
      className="group p-4 sm:p-4.5 space-y-2 transition-all gap-0"
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
      {isApproved && effectiveStart && (
        <div className="text-[12px] text-[#78716C]">生效：{effectiveStart}{effectiveEnd !== effectiveStart ? `–${effectiveEnd}` : ""}</div>
      )}

      {item.reason && (
        <div className="text-[13px] text-[#1F1E1D] leading-relaxed">
          <span className="text-[#78716C]">事由：</span>
          <span>{item.reason}</span>
        </div>
      )}

      {/* Footer: 纯留白过渡，消除卡片内横切线 */}
      <div className="mt-2.5 flex items-center justify-between text-[12px]">
        <span className="text-[#78716C]">
          {item.reviewed_by_name ? `由 ${item.reviewed_by_name} 审阅` : ""}
          {item.reviewed_at ? ` · ${formatShanghaiDateTime(item.reviewed_at)}` : ""}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isProcessing || !reqId}
            onClick={() => setShowConfirm(true)}
            className="rounded-md px-2 py-1 font-normal text-[#78716C] hover:bg-status-danger/10 hover:text-status-danger transition-colors cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? "打回中…" : showConfirm ? "确认打回" : "打回待处理"}
          </button>
        </div>
      </div>
      {showConfirm && (
        <div className="pt-2 border-t border-[#E2E2DF]/60 text-[12px] space-y-1.5">
          <p className="flex items-center gap-1 font-normal text-[#1F1E1D]">
            <AlertCircle className="size-3.5" />
            <span>确认打回此豁免申请？</span>
          </p>
          <p className="text-[#78716C] leading-relaxed">
            打回后，这段时间的请假/免交生效将被撤销，对应日期的发布履约会按未审批状态重新计算；成员需要重新等待审批，该申请会重新回到「待审批」列表。
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={isProcessing}
              className="rounded-md px-2.5 py-1 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors cursor-pointer disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled={isProcessing || !reqId}
              onClick={() => {
                setShowConfirm(false);
                onReopen(item);
              }}
              className="rounded-md px-2.5 py-1 text-[12px] text-status-danger hover:bg-status-danger/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              确认打回
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
