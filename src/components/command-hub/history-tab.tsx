"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { HistoryAppealCard } from "@/components/command-hub/history-appeal-card";
import { HistoryExemptionCard } from "@/components/command-hub/history-exemption-card";
import { resolveApprovalRequestId } from "@/lib/exemption-approvals";
import type { HistoryTabProps } from "@/lib/command-hub/types";

export function HistoryTab({
  activeTab,
  isAdmin,
  historyApprovals,
  historyError,
  fetchHistoryApprovals,
  historyLoading,
  actionProcessing,
  handleReopenAppeal,
  handleReopenReviewDecision,
}: HistoryTabProps) {
  return (
    <>
{/* 3. HISTORY TAB (已处理历史) */}
{activeTab === "history" && isAdmin && (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3 min-h-[36px] pb-2 border-b border-[#E2E2DF]/60">
      <div className="flex items-center gap-2 text-[13px] font-normal text-[#141413]">
        <span>已处理审批记录</span>
        <span className="text-[12px] text-[#78716C] font-normal">（支持查阅与随时打回待处理）</span>
      </div>
      <div className="text-[12px] text-[#78716C] tabular-nums">
        共 {historyApprovals.length} 条记录
      </div>
    </div>

    {historyError && (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-status-danger/20 bg-status-danger/[0.04] p-3 text-[12px] text-status-danger">
        <span className="inline-flex items-center gap-2">
          <TriangleAlert className="size-4 shrink-0" />
          <span>{historyError}</span>
        </span>
        <button
          type="button"
          onClick={() => void fetchHistoryApprovals()}
          className="rounded-md px-2 py-1 font-normal hover:bg-status-danger/10 transition-colors cursor-pointer"
        >
          重试
        </button>
      </div>
    )}

    {historyLoading && historyApprovals.length === 0 ? (
      <EmptyState
        variant="compact"
        title="正在加载历史记录..."
      />
    ) : historyApprovals.length === 0 ? (
      <EmptyState
        variant="compact"
        title="暂无历史审批记录"
        description="所有审阅处理后的申请记录将在此处归档，可随时回溯。"
      />
    ) : (
      <div className="space-y-3">
        {historyApprovals.map((item) => {
          const isAppeal = item.source === "fulfillment_appeal";
          const itemId = item.id || item.appeal_id || "";
          const isProcessing = Boolean(actionProcessing?.id === itemId);

          if (isAppeal) {
            return (
              <HistoryAppealCard
                key={itemId}
                appeal={item}
                isProcessing={isProcessing}
                onReopen={handleReopenAppeal}
              />
            );
          }

          const reqId = resolveApprovalRequestId(item);
          return (
            <HistoryExemptionCard
              key={reqId || item.id}
              item={item}
              isProcessing={Boolean(reqId && actionProcessing?.id === reqId)}
              onReopen={(ex) => void handleReopenReviewDecision(ex)}
            />
          );
        })}
      </div>
    )}
  </div>
)}
    </>
  );
}
