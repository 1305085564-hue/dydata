"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import {
  formatShortDate,
  resolveApprovalRequestId,
  type ExemptionRequest,
} from "@/lib/exemption-approvals";
import { getAdminExemptionCategoryLabel, toExemptionCategory } from "@/lib/exemption-category";
import { getAppealExecutionLabel, getAppealId, isPostSubmitAppeal } from "@/lib/command-hub/domain/workbench-rules";
import { formatShanghaiDateTime } from "@/lib/command-hub/types";
import { LoadError } from "./load-error";

export const REOPEN_EXEMPTION_NOTICE =
  "打回后会撤销这几天已生效的请假/免交，发布考核按未批重新计算；申请回到「等你批」，成员重新等待审批。";
export const REOPEN_APPEAL_NOTICE = "打回后原审批通知作废，申请回到「等你批」，并重新提醒管理员。";
export const REOPEN_POST_SUBMIT_NOTICE =
  "打回后会恢复该作品原有效结算状态，原核查通知作废，核查单回到「等你批」，并重新提醒管理员。";

function describeHistory(item: ExemptionRequest) {
  if (item.source === "fulfillment_appeal") {
    return {
      kind: isPostSubmitAppeal(item) ? "事后核查" : `${item.appeal_type || ""}补交`,
      when: formatShortDate(item.business_date || item.start_date),
      sub: item.account_name || null,
    };
  }
  const category = toExemptionCategory(item.exemption_category);
  const kind = getAdminExemptionCategoryLabel(category);
  const when = item.exemption_type === "permanent"
    ? "长期"
    : item.end_date && item.end_date !== item.start_date
      ? `${formatShortDate(item.start_date)} 至 ${formatShortDate(item.end_date)}`
      : formatShortDate(item.start_date);
  return { kind, when, sub: item.team_name || "未分组" };
}

export function HistoryList({
  items,
  loading,
  error,
  reopeningId,
  onRetry,
  onReopen,
}: {
  items: ExemptionRequest[];
  loading: boolean;
  error: string | null;
  reopeningId: string | null;
  onRetry: () => void;
  onReopen: (item: ExemptionRequest) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (error) return <LoadError message={error} onRetry={onRetry} />;
  if (loading && items.length === 0) return <p className="py-12 text-center text-[14px] text-[#78716C]">正在加载…</p>;
  if (items.length === 0) {
    return <EmptyState variant="compact" title="还没有处理过的申请" description="批过的请假、免交和补交都会留在这里。" />;
  }

  return (
    <div className="space-y-1">
      <p className="px-4 pb-1 text-[12px] text-[#78716C]">最近 {items.length} 条</p>
      {items.map((item) => {
        const isAppeal = item.source === "fulfillment_appeal";
        const isPostSubmit = isAppeal && isPostSubmitAppeal(item);
        const id = (isAppeal ? getAppealId(item) : resolveApprovalRequestId(item)) || item.id;
        const approved = item.request_status === "approved";
        const { kind, when, sub } = describeHistory(item);
        const execution = isAppeal && !isPostSubmit && approved ? getAppealExecutionLabel(item.resumePending ?? false) : null;
        const rejection = !approved ? item.rejection_reason || item.feedback : null;
        const reopening = reopeningId === id;
        const confirming = confirmingId === id;
        const statusLabel = isPostSubmit
          ? (approved ? "已确认正常" : "已标为无效（不计优结算）")
          : (approved ? "已同意" : "已拒绝");

        return (
          <div key={id} className="flex gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-[#F7F7F6]">
            <InitialAvatar name={item.applicant_name} size="xs" className="-mt-0.5" />
            <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[14px] leading-[1.4] text-[#141413]">{item.applicant_name || "成员"}</span>
                {sub && <span className="text-[12px] text-[#78716C]">{sub}</span>}
                <span className="text-[#A8A29E]">·</span>
                <span className="text-[12px] text-[#78716C]">{kind}</span>
                <span className="text-[#A8A29E]">·</span>
                <span className="text-[12px] tabular-nums text-[#78716C]">{when}</span>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-[#1F1E1D]">
                <span className={cn("size-1.5 rounded-full", approved ? "bg-status-success" : "bg-status-danger")} />
                {statusLabel}
                {execution && <span className="text-[#78716C]">· {execution}</span>}
              </span>
            </div>

            {isPostSubmit && item.video_title && (
              <p className="mt-1 break-words text-[14px] leading-[1.5] text-[#141413]">{item.video_title}</p>
            )}
            {item.reason && <p className="mt-1 break-words text-[14px] leading-[1.6] text-[#1F1E1D]">{item.reason}</p>}
            {rejection && <p className="mt-1 text-[12px] text-[#78716C]">{isPostSubmit ? "无效原因：" : "拒绝原因："}{rejection}</p>}

            {confirming ? (
              <div className="mt-2 space-y-2">
                <p className="text-[12px] leading-[1.5] text-[#1F1E1D]">
                  {isPostSubmit ? REOPEN_POST_SUBMIT_NOTICE : isAppeal ? REOPEN_APPEAL_NOTICE : REOPEN_EXEMPTION_NOTICE}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="h-7 cursor-pointer rounded-md px-3 text-[14px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingId(null);
                      onReopen(item);
                    }}
                    className="h-7 cursor-pointer rounded-md border border-[#E2E2DF] bg-white px-3 text-[14px] text-[#1F1E1D] shadow-input transition-colors hover:bg-[#EBEBE9]"
                  >
                    确认打回
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-1 flex items-center justify-between gap-3 text-[12px] text-[#78716C]">
                <span className="tabular-nums">
                  {[item.reviewed_by_name, item.reviewed_at ? formatShanghaiDateTime(item.reviewed_at) : null].filter(Boolean).join(" · ")}
                </span>
                <button
                  type="button"
                  disabled={reopening || !id}
                  onClick={() => setConfirmingId(id)}
                  className="h-6 shrink-0 cursor-pointer rounded-md px-2 text-[12px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] disabled:cursor-wait disabled:text-[#A8A29E]"
                >
                  {reopening ? "打回中…" : "打回重审"}
                </button>
              </div>
            )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
