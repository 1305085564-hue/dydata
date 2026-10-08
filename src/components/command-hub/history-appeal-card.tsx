"use client";

import { useState } from "react";
import { AlertCircle, FileText, Loader2, RotateCcw, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ExemptionRequest } from "@/lib/exemption-approvals";
import { formatShortDate } from "@/lib/exemption-approvals";
import { formatRelativeTime } from "@/lib/command-hub/types";

interface HistoryAppealCardProps {
  appeal: ExemptionRequest;
  isProcessing: boolean;
  onReopen: (appealId: string) => Promise<void>;
}

export function HistoryAppealCard({
  appeal,
  isProcessing,
  onReopen,
}: HistoryAppealCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const isApproved = appeal.request_status === "approved";
  const appealType = appeal.appeal_type || "补交";
  const businessDate = appeal.business_date || appeal.start_date;
  const rejectionReason = appeal.rejection_reason || appeal.feedback;

  const handleConfirmReopen = async () => {
    setShowConfirm(false);
    const appealId = appeal.id || appeal.appeal_id;
    if (appealId) {
      await onReopen(appealId);
    }
  };

  return (
    <Card className="group p-4 sm:p-4.5 space-y-2.5 transition-all gap-0">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-[14px] font-normal text-[#141413]">
            {appeal.applicant_name || "成员"}
          </span>
          <Badge variant={isApproved ? "success" : "danger"}>
            {isApproved ? "已同意" : "已驳回"}
          </Badge>
          <Badge variant="secondary" className="shrink-0 before:hidden text-[12px]">
            {appealType === "视频" ? (
              <Video className="size-3 text-[#78716C]" />
            ) : (
              <FileText className="size-3 text-[#78716C]" />
            )}
            <span>{appealType}补交</span>
          </Badge>
        </div>
        <span className="text-[12px] text-[#78716C] tabular-nums shrink-0">
          {appeal.reviewed_at ? formatRelativeTime(appeal.reviewed_at) : formatRelativeTime(appeal.created_at)}
        </span>
      </div>

      {/* Account & Date Context */}
      <div className="text-[12px] text-[#78716C] tabular-nums">
        <span>{appeal.account_name || "未指定账号"}</span>
        <span className="mx-1.5 text-[#E2E2DF]">·</span>
        <span>业务日期：{formatShortDate(businessDate)}</span>
      </div>

      {/* Reason */}
      {appeal.reason && (
        <div className="text-[13px] text-[#1F1E1D] leading-relaxed">
          <span className="text-[#78716C]">补交事由：</span>
          <span>{appeal.reason}</span>
        </div>
      )}

      {/* Rejection Reason Display */}
      {!isApproved && rejectionReason && (
        <div className="rounded-md border border-status-danger/15 bg-status-danger/[0.04] p-2.5 text-[12px] text-status-danger leading-relaxed">
          <div className="flex items-center gap-1 font-normal mb-0.5">
            <AlertCircle className="size-3.5 shrink-0" />
            <span>驳回原因</span>
          </div>
          <p className="text-[#141413]">{rejectionReason}</p>
        </div>
      )}

      {/* Confirmation Slot: 纸面发丝线分隔，消除带框黄色子卡片嵌套，按钮回归中性深墨 */}
      {showConfirm && (
        <div className="pt-2 border-t border-[#E2E2DF]/60 text-[12px] space-y-1.5">
          <p className="font-normal text-[#1F1E1D]">
            确认打回此补交申请？
          </p>
          <p className="text-[#78716C] leading-relaxed">
            打回后原审批结果通知将作废，该申请将重新回到「待审批」列表并向全体管理员重发待办。
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={isProcessing}
              className="rounded-md px-2.5 py-1 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleConfirmReopen}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#141413] hover:bg-[#1F1E1D] text-white px-3 text-[12px] font-normal transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40"
            >
              {isProcessing && <Loader2 className="size-3 animate-spin" />}
              <span>{isProcessing ? "打回中…" : "确认打回"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[#E2E2DF]/60 text-[12px]">
        <span className="text-[#78716C]">
          {appeal.reviewed_by_name ? `由 ${appeal.reviewed_by_name} 审阅` : "已完成审阅"}
          {appeal.reviewed_at && ` · ${formatShortDate(appeal.reviewed_at)}`}
        </span>
        {!showConfirm && (
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setShowConfirm(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-normal text-[#78716C] hover:bg-status-danger/10 hover:text-status-danger transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="size-3" />
              <span>{isProcessing ? "打回中…" : "打回待处理"}</span>
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
