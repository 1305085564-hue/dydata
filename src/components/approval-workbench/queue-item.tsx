"use client";

import { Check, ExternalLink, X } from "lucide-react";
import { motion } from "framer-motion";
import { listItemMotion } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { rowSelectionClass } from "@/components/ui/selection";
import { formatShortDate, type DailyApprovalDetail } from "@/lib/exemption-approvals";
import { getAppealTriggerText, getMonthContext } from "@/lib/command-hub/domain/workbench-rules";
import type { ApprovalQueueItem } from "@/lib/command-hub/types";
import { RejectReason } from "./reject-reason";

/** 正在写拒绝原因的范围：整件，或其中某一天 */
export type RejectScope = { itemId: string; dateStr?: string };

interface QueueItemProps {
  item: ApprovalQueueItem;
  index: number;
  focused: boolean;
  rejecting: RejectScope | null;
  onFocus: () => void;
  onApprove: () => void;
  onStartReject: (dateStr?: string) => void;
  onConfirmReject: (reason: string) => void;
  onCancelReject: () => void;
  onApproveDay: (daily: DailyApprovalDetail) => void;
}

const metaDot = <span className="text-[#A8A29E]">·</span>;

export function QueueItem(props: QueueItemProps) {
  const { item, index, focused, rejecting, onFocus } = props;
  const rejectingThis = rejecting?.itemId === item.id ? rejecting : null;

  return (
    <motion.div
      {...listItemMotion}
      id={`approval-row-${index}`}
      data-focused={focused || undefined}
      onPointerEnter={onFocus}
      onClick={onFocus}
      className={cn(
        "flex gap-3 rounded-xl px-4 py-3 transition-colors duration-150",
        rowSelectionClass(focused),
      )}
    >
      {/* 一列申请人：头像让眼睛先按人找到这一条（《效率美学》§0） */}
      <InitialAvatar
        name={item.kind === "exemption" ? item.group.applicant_name : item.appeal.applicant_name}
        size="xs"
        className="-mt-0.5"
      />
      <div className="min-w-0 flex-1">
        {item.kind === "exemption" ? (
          <ExemptionBody {...props} item={item} rejectingThis={rejectingThis} />
        ) : (
          <AppealBody {...props} item={item} rejectingThis={rejectingThis} />
        )}
      </div>
    </motion.div>
  );
}

function ExemptionBody({
  item,
  focused,
  rejectingThis,
  onApprove,
  onStartReject,
  onConfirmReject,
  onCancelReject,
  onApproveDay,
}: QueueItemProps & { item: Extract<ApprovalQueueItem, { kind: "exemption" }>; rejectingThis: RejectScope | null }) {
  const { group } = item;
  const kind = group.nature === "leave" ? "请假" : "免交";
  const span = group.isPermanent ? `长期${kind}` : `${kind} ${group.dayCount} 天`;
  const monthContext = getMonthContext(group);
  const multiDay = group.dailyItems.length > 1;
  const remaining = group.isPartiallyProcessed ? `剩余 ${group.pendingCount} 天` : "";
  const rejectingDay = rejectingThis?.dateStr
    ? group.dailyItems.find((d) => d.dateStr === rejectingThis.dateStr)
    : null;

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[14px] leading-[1.4] text-[#141413]">{group.applicant_name}</span>
          <span className="text-[12px] text-[#78716C]">{group.team_name || "未分组"}</span>
          {metaDot}
          <span className="text-[12px] text-[#78716C]">{span}</span>
          {!multiDay && (
            <>
              {metaDot}
              <span className="text-[12px] tabular-nums text-[#78716C]">{group.dateRangeText}</span>
            </>
          )}
        </div>
        {monthContext && <span className="shrink-0 text-[12px] text-[#78716C]">{monthContext}</span>}
      </div>

      <p className={cn("mt-1 break-words text-[14px] leading-[1.6]", group.reasons.length ? "text-[#1F1E1D]" : "text-[#A8A29E]")}>
        {group.reasons.length ? group.reasons.join("；") : "没写事由"}
      </p>

      {multiDay && (
        <div className="mt-2 flex flex-wrap gap-2">
          {group.dailyItems.map((daily) => (
            <DayChip
              key={daily.id}
              daily={daily}
              onApprove={() => onApproveDay(daily)}
              onReject={() => onStartReject(daily.dateStr)}
            />
          ))}
        </div>
      )}

      {rejectingThis ? (
        <RejectReason
          key={rejectingThis.dateStr ?? "all"}
          hint={
            rejectingDay
              ? `只拒绝 ${rejectingDay.dateDisplay}，其他日期不受影响`
              : `原因会记在这次拒绝的${remaining || "全部日期"}上`
          }
          onConfirm={onConfirmReject}
          onCancel={onCancelReject}
        />
      ) : (
        <Actions
          focused={focused}
          approveLabel={remaining ? `同意${remaining}` : "同意"}
          rejectLabel={remaining ? `拒绝${remaining}` : "拒绝"}
          onApprove={onApprove}
          onReject={() => onStartReject()}
        />
      )}
    </>
  );
}

function AppealBody({
  item,
  focused,
  rejectingThis,
  onApprove,
  onStartReject,
  onConfirmReject,
  onCancelReject,
}: QueueItemProps & { item: Extract<ApprovalQueueItem, { kind: "appeal" }>; rejectingThis: RejectScope | null }) {
  const { appeal } = item;
  const attachments = appeal.attachment_urls ?? appeal.attachments ?? [];
  const trigger = getAppealTriggerText(appeal);
  const businessDate = formatShortDate(appeal.business_date || appeal.start_date);
  const absence = typeof appeal.absence_days === "number" && appeal.absence_days > 0 ? appeal.absence_days : 0;

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[14px] leading-[1.4] text-[#141413]">{appeal.applicant_name || "成员"}</span>
          <span className="text-[12px] text-[#78716C]">{appeal.account_name || "未指定账号"}</span>
          {metaDot}
          <span className="text-[12px] text-[#78716C]">{appeal.appeal_type || ""}补交</span>
          {metaDot}
          <span className="text-[12px] tabular-nums text-[#78716C]">{businessDate}</span>
        </div>
        {absence > 0 && <span className="shrink-0 text-[12px] text-[#78716C]">已缺勤 {absence} 天</span>}
      </div>

      <p className={cn("mt-1 break-words text-[14px] leading-[1.6]", appeal.reason ? "text-[#1F1E1D]" : "text-[#A8A29E]")}>
        {appeal.reason || "没写事由"}
      </p>

      {(trigger || attachments.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#78716C]">
          {trigger && <span>{trigger}</span>}
          {attachments.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[#1F1E1D] underline decoration-[#E2E2DF] underline-offset-2 hover:decoration-[#1F1E1D]"
            >
              附件 {i + 1}
              <ExternalLink className="size-3 text-[#78716C]" />
            </a>
          ))}
        </div>
      )}

      {rejectingThis ? (
        <RejectReason
          required
          hint="原因会通知成员"
          onConfirm={onConfirmReject}
          onCancel={onCancelReject}
        />
      ) : (
        <Actions
          focused={focused}
          approveLabel="同意"
          rejectLabel="拒绝"
          onApprove={onApprove}
          onReject={() => onStartReject()}
        />
      )}
    </>
  );
}

function Actions({
  focused,
  approveLabel,
  rejectLabel,
  onApprove,
  onReject,
}: {
  focused: boolean;
  approveLabel: string;
  rejectLabel: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="mt-2 flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReject();
        }}
        className="h-7 cursor-pointer rounded-md px-3 text-[14px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413]"
      >
        {rejectLabel}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onApprove();
        }}
        className={cn(
          "h-7 cursor-pointer rounded-md px-3 text-[14px] shadow-input transition-colors",
          focused
            ? "bg-[#D97757] text-white hover:bg-[#C46A4D]"
            : "border border-[#E2E2DF] bg-white text-[#1F1E1D] hover:bg-[#EBEBE9]",
        )}
      >
        {approveLabel}
      </button>
    </div>
  );
}

function DayChip({
  daily,
  onApprove,
  onReject,
}: {
  daily: DailyApprovalDetail;
  onApprove: () => void;
  onReject: () => void;
}) {
  const label = (
    <span className="tabular-nums">
      {daily.dateDisplay} <span className="text-[#78716C]">{daily.dayOfWeek}</span>
    </span>
  );

  if (daily.status !== "pending") {
    const approved = daily.status === "approved";
    return (
      <span className="inline-flex h-7 items-center gap-2 px-2 text-[12px] text-[#78716C]">
        <span className={cn("size-1.5 rounded-full", approved ? "bg-status-success" : "bg-status-danger")} />
        {label}
        <span>{approved ? "已准" : "已拒"}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-md border border-[#E2E2DF] bg-white pl-2 pr-1 text-[12px] text-[#1F1E1D] shadow-input">
      {label}
      <button
        type="button"
        aria-label={`只同意 ${daily.dateDisplay}`}
        title={`只同意 ${daily.dateDisplay}`}
        onClick={(e) => {
          e.stopPropagation();
          onApprove();
        }}
        className="ml-1 inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-status-success-bg hover:text-status-success-text"
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label={`只拒绝 ${daily.dateDisplay}`}
        title={`只拒绝 ${daily.dateDisplay}`}
        onClick={(e) => {
          e.stopPropagation();
          onReject();
        }}
        className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-status-danger-bg hover:text-[#1F1E1D]"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
