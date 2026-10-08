"use client";

import { Check, ExternalLink, FileText, Paperclip, Video, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InlineFeedbackTray } from "@/components/inline-feedback-tray";
import type { ExemptionRequest } from "@/lib/exemption-approvals";
import { formatShortDate } from "@/lib/exemption-approvals";
import { formatRelativeTime } from "@/lib/command-hub/types";
import { cn } from "@/lib/utils";

interface FulfillmentAppealCardProps {
  appeal: ExemptionRequest;
  index: number;
  isFocused: boolean;
  isProcessing: boolean;
  isRejectOpen: boolean;
  onFocus: () => void;
  onApprove: () => void;
  onToggleReject: () => void;
  onConfirmReject: (reason: string) => void;
  onCloseReject: () => void;
}

export function FulfillmentAppealCard({
  appeal,
  index,
  isProcessing,
  isRejectOpen,
  onFocus,
  onApprove,
  onToggleReject,
  onConfirmReject,
  onCloseReject,
}: FulfillmentAppealCardProps) {
  const attachmentUrls = appeal.attachment_urls ?? appeal.attachments ?? [];
  const appealType = appeal.appeal_type || "补交";
  const businessDate = appeal.business_date || appeal.start_date;
  const absenceDays = typeof appeal.absence_days === "number" ? appeal.absence_days : 0;

  return (
    <motion.div
      id={`approval-card-${index}`}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onClick={onFocus}
    >
      <Card className="group relative p-4.5 sm:p-5 transition-all duration-150 gap-0">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-normal text-[#141413] truncate">
                {appeal.applicant_name || "成员"}
              </span>
              <span className="text-[#78716C] text-[12px]">·</span>
              <span className="text-[12px] text-[#78716C] truncate">
                {appeal.account_name || "未指定账号"}
              </span>

              {/* Distinction Badge */}
              <Badge variant="secondary" className="shrink-0 before:hidden text-[12px]">
                {appealType === "视频" ? (
                  <Video className="size-3 text-[#78716C]" />
                ) : (
                  <FileText className="size-3 text-[#78716C]" />
                )}
                <span>{appealType}补交</span>
              </Badge>

              {absenceDays > 0 && (
                <>
                  <span className="text-[#78716C] text-[12px]">·</span>
                  <span className="text-[12px] font-normal text-[#78716C] tabular-nums">
                    缺勤 {absenceDays} 天
                  </span>
                </>
              )}
            </div>

            {/* Context: 业务日期 · 相对提交时间 */}
            <div className="mt-1 text-[12px] text-[#78716C] tabular-nums">
              <span>业务日期：{formatShortDate(businessDate)}</span>
              <span className="mx-1.5 text-[#E2E2DF]">·</span>
              <span>提交于 {formatRelativeTime(appeal.created_at)}</span>
            </div>

            {/* Reason */}
            {appeal.reason && (
              <div className="mt-1.5 text-[13px] text-[#1F1E1D] leading-relaxed">
                <span className="text-[#78716C]">补交事由：</span>
                <span>{appeal.reason}</span>
              </div>
            )}

            {/* Attachment URLs */}
            {attachmentUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[12px] text-[#78716C] flex items-center gap-1">
                  <Paperclip className="size-3 text-[#78716C]" />
                  <span>附件 ({attachmentUrls.length})：</span>
                </span>
                {attachmentUrls.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-md bg-[#F1F1F0] hover:bg-[#EBEBE9] px-2 py-0.5 text-[12px] text-[#1F1E1D] transition-colors"
                  >
                    <span>附件 {idx + 1}</span>
                    <ExternalLink className="size-2.5 text-[#78716C]" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - 划入卡片或激活驳回槽时亮起，纯靠留白过渡消除横割线 */}
        <div
          className={cn(
            "mt-3.5 flex items-center justify-end gap-2 transition-opacity duration-150",
            isRejectOpen
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          )}
        >
          <button
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.stopPropagation();
              onToggleReject();
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-normal transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
              isRejectOpen
                ? "bg-status-danger/10 text-status-danger"
                : "text-[#78716C] hover:text-status-danger hover:bg-status-danger/[0.06]",
            )}
          >
            <X className="size-3.5 stroke-[2]" />
            <span>{isRejectOpen ? "收起驳回" : "驳回"}</span>
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.stopPropagation();
              onApprove();
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-status-success/[0.08] hover:bg-status-success/15 px-3 text-[12px] font-normal text-status-success transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <Check className="size-3.5 stroke-[2.2]" />
            <span>同意补交</span>
          </button>
        </div>

        {/* Inline Feedback Tray */}
        <AnimatePresence>
          {isRejectOpen && (
            <InlineFeedbackTray
              initialAction="rejected"
              title={`驳回 ${appeal.applicant_name || "成员"} 的补交`}
              scopeHint="驳回原因将通过通知直接发送给成员"
              required={true}
              confirmLabel="确认驳回"
              isSubmitting={isProcessing}
              onConfirm={(_action, reason) => onConfirmReject(reason)}
              onCancel={onCloseReject}
            />
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
