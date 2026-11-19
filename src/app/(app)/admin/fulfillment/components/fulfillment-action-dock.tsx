"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarX, FileClock, Plane } from "lucide-react";
import { InitialAvatar } from "@/components/ui/initial-avatar";

import type { FulfillmentAppeal, FulfillmentMemberSummary } from "@/types/fulfillment";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineFeedbackTray } from "@/components/inline-feedback-tray";
import type { ManualFulfillmentMarkStatus } from "@/lib/fulfillment-status";
import {
  formatMonthDay,
  isMissingStreak,
  pendingAppealsOf,
  type PendingLeaveItem,
} from "../fulfillment-page-view";

export type MarkAction = ManualFulfillmentMarkStatus;

export interface FulfillmentActionDockProps {
  /** 今天还没发、也没人标记过的成员 */
  members: FulfillmentMemberSummary[];
  selectedIds: Set<string>;
  onSelectToggle: (userId: string) => void;
  onSelectAll: (selected: boolean, visibleIds?: string[]) => void;
  onQuickMark: (userId: string, status: MarkAction) => Promise<void>;
  onBatchMark: (userIds: string[], status: MarkAction, reason: string) => Promise<void>;
  onMemberClick: (member: FulfillmentMemberSummary) => void;
  appeals?: FulfillmentAppeal[];
  onHandleAppeal?: (appealId: string, decision: "approve" | "reject", reason?: string) => Promise<void>;
  pendingLeaves?: PendingLeaveItem[];
  onReviewPendingExemption?: (requestId: string, action: "approved" | "rejected") => Promise<void>;
}

const ACTION_LABELS: Record<MarkAction, string> = {
  leave: "请假",
  waived: "豁免",
  absent: "未发",
  confirmed_published: "已发",
};

/** 今天名单上能一键标的三种；「缺勤」只在大表格子里单日改判 */
const QUICK_ACTIONS: MarkAction[] = ["confirmed_published", "leave", "waived"];

export function requiresQuickMarkConfirmation(action: MarkAction) {
  return action === "absent";
}

const ROW = "flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[14px]";
const SECTION_LABEL = "flex items-center gap-2 px-3 pt-3 pb-1 text-[12px] text-[#78716C]";
const ROW_ACTION = "h-7 px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9]";

/**
 * 今天待处理：页头下那一行「今天还有 3 人没发 · 2 条补交待审 · 处理」点开后的名单。
 * 只有字和一排动作，没有卡片头、图标、计数徽标——数字已经在页头那一行说过了。
 * 从上到下：今天还没发 → 补交待审 → 请假待批。
 */
export function FulfillmentActionDock({
  members,
  selectedIds,
  onSelectToggle,
  onSelectAll,
  onQuickMark,
  onBatchMark,
  onMemberClick,
  appeals = [],
  onHandleAppeal,
  pendingLeaves = [],
  onReviewPendingExemption,
}: FulfillmentActionDockProps) {
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [handlingAppealId, setHandlingAppealId] = useState<string | null>(null);
  const [reviewingLeaveId, setReviewingLeaveId] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<MarkAction | null>(null);
  const [batchReason, setBatchReason] = useState("");
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [rejectingAppeal, setRejectingAppeal] = useState<FulfillmentAppeal | null>(null);
  const [isSubmittingRejection, setIsSubmittingRejection] = useState(false);

  const pendingAppeals = useMemo(() => pendingAppealsOf(appeals), [appeals]);
  const visibleIds = members.map((m) => m.userId);
  const selectedCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = members.length > 0 && selectedCount === members.length;

  const handleConfirmBatch = async () => {
    if (!batchAction || selectedCount === 0) return;
    setIsSubmittingBatch(true);
    try {
      await onBatchMark(visibleIds.filter((id) => selectedIds.has(id)), batchAction, batchReason);
      setBatchAction(null);
      setBatchReason("");
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const handleReviewLeave = async (requestId: string, action: "approved" | "rejected") => {
    if (!onReviewPendingExemption) return;
    setReviewingLeaveId(requestId);
    try {
      await onReviewPendingExemption(requestId, action);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "没能保存审批结果，稍后重试");
    } finally {
      setReviewingLeaveId(null);
    }
  };

  return (
    <section
      id="fulfillment-today-panel"
      aria-label="今天待处理"
      className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white pb-1"
    >
      {members.length > 0 && (
        <div>
          <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => onSelectAll(Boolean(checked), visibleIds)}
              aria-label="全选今天还没发的人"
            />
            {selectedCount > 0 ? (
              <>
                <span className="text-[12px] text-[#78716C]">
                  已选 <span className="tabular-nums text-[#141413]">{selectedCount}</span> 人，都标为
                </span>
                {QUICK_ACTIONS.map((action) => (
                  <Button key={action} variant="ghost" size="xs" className={ROW_ACTION} onClick={() => setBatchAction(action)}>
                    {ACTION_LABELS[action]}
                  </Button>
                ))}
              </>
            ) : (
              <span className="flex items-center gap-2 text-[12px] text-[#78716C]">
                <CalendarX className="size-3.5" aria-hidden="true" />
                今天还没发
              </span>
            )}
          </div>
          <ul>
            {members.map((member) => {
              const isBusy = markingId === member.userId;
              const streak = isMissingStreak(member);
              return (
                <li key={member.userId} className={ROW}>
                  <Checkbox
                    checked={selectedIds.has(member.userId)}
                    onCheckedChange={() => onSelectToggle(member.userId)}
                    aria-label={`选择 ${member.userName}`}
                  />
                  <InitialAvatar name={member.userName} />
                  <button
                    type="button"
                    onClick={() => onMemberClick(member)}
                    className="text-left text-[#141413] hover:underline underline-offset-2"
                  >
                    {member.userName}
                  </button>
                  {member.teamName && <span className="text-[12px] text-[#78716C]">{member.teamName}</span>}
                  {streak && (
                    <span className="text-[12px] tabular-nums text-status-danger">断 {member.consecutiveMissing} 天</span>
                  )}
                  <span className="ml-auto flex items-center gap-0.5">
                    {QUICK_ACTIONS.map((action) => (
                      <Button
                        key={action}
                        variant="ghost"
                        size="xs"
                        disabled={isBusy}
                        className={ROW_ACTION}
                        onClick={async () => {
                          setMarkingId(member.userId);
                          try {
                            await onQuickMark(member.userId, action);
                          } finally {
                            setMarkingId(null);
                          }
                        }}
                      >
                        {ACTION_LABELS[action]}
                      </Button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pendingAppeals.length > 0 && (
        <div>
          <div className={SECTION_LABEL}>
            <FileClock className="size-3.5" aria-hidden="true" />
            补交待审
          </div>
          <ul>
            {pendingAppeals.map((appeal) => (
              <li key={appeal.id} className={ROW}>
                <InitialAvatar name={appeal.user_name} />
                <span className="text-[#141413]">{appeal.user_name || "未知成员"}</span>
                <span className="text-[12px] tabular-nums text-[#78716C]">补 {formatMonthDay(appeal.record_date)}</span>
                <span className="min-w-0 flex-1 truncate text-[#1F1E1D]" title={appeal.reason}>
                  {appeal.reason}
                </span>
                {onHandleAppeal && (
                  <span className="ml-auto flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={handlingAppealId === appeal.id}
                      className={ROW_ACTION}
                      onClick={async () => {
                        setHandlingAppealId(appeal.id);
                        try {
                          await onHandleAppeal(appeal.id, "approve");
                        } finally {
                          setHandlingAppealId(null);
                        }
                      }}
                    >
                      同意补交
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={handlingAppealId === appeal.id}
                      className={ROW_ACTION}
                      onClick={() => setRejectingAppeal((prev) => (prev?.id === appeal.id ? null : appeal))}
                    >
                      {rejectingAppeal?.id === appeal.id ? "收起" : "驳回"}
                    </Button>
                  </span>
                )}
                {rejectingAppeal?.id === appeal.id && (
                  <div className="w-full">
                    <InlineFeedbackTray
                      initialAction="rejected"
                      title={`驳回 ${appeal.user_name || "成员"} 的补交`}
                      scopeHint="驳回原因会通过通知发给本人"
                      required
                      confirmLabel="确认驳回"
                      isSubmitting={isSubmittingRejection}
                      onConfirm={async (_action, reason) => {
                        if (!onHandleAppeal) return;
                        setIsSubmittingRejection(true);
                        try {
                          await onHandleAppeal(appeal.id, "reject", reason);
                          setRejectingAppeal(null);
                        } finally {
                          setIsSubmittingRejection(false);
                        }
                      }}
                      onCancel={() => setRejectingAppeal(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingLeaves.length > 0 && (
        <div>
          <div className={SECTION_LABEL}>
            <Plane className="size-3.5" aria-hidden="true" />
            请假待批
          </div>
          <ul>
            {pendingLeaves.map(({ request, member }) => {
              const busy = reviewingLeaveId === request.id;
              const span =
                request.end_date && request.end_date !== request.start_date
                  ? `${formatMonthDay(request.start_date)}–${formatMonthDay(request.end_date)}`
                  : formatMonthDay(request.start_date);
              return (
                <li key={request.id} className={ROW}>
                  <InitialAvatar name={member.userName} />
                  <span className="text-[#141413]">{member.userName}</span>
                  <span className="text-[12px] tabular-nums text-[#78716C]">
                    {request.exemption_type === "leave" ? "请假" : "免交"} {span}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[#1F1E1D]" title={request.reason ?? undefined}>
                    {request.reason || ""}
                  </span>
                  {onReviewPendingExemption && (
                    <span className="ml-auto flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        className={ROW_ACTION}
                        onClick={() => void handleReviewLeave(request.id, "approved")}
                      >
                        批准
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy}
                        className={ROW_ACTION}
                        onClick={() => void handleReviewLeave(request.id, "rejected")}
                      >
                        驳回
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {batchAction && (
        <Dialog open={true} onOpenChange={(open) => !open && setBatchAction(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                把 {selectedCount} 人今天标为「{ACTION_LABELS[batchAction]}」
              </DialogTitle>
              <DialogDescription className="text-[14px] text-[#78716C]">
                只改今天这一天，之后可以在大表格子里逐个改回。
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-1 py-2">
              <span className="block text-[12px] text-[#78716C]">备注（选填）</span>
              <input
                type="text"
                value={batchReason}
                onChange={(e) => setBatchReason(e.target.value)}
                placeholder="例如：团建休假"
                className="w-full rounded-md border border-[#E2E2DF] px-3 py-1.5 text-[14px] outline-none focus:border-[#141413]"
              />
            </label>
            <DialogFooter className="gap-2">
              <Button variant="ghost" size="sm" onClick={() => setBatchAction(null)} disabled={isSubmittingBatch}>
                取消
              </Button>
              <Button variant="default" size="sm" onClick={handleConfirmBatch} disabled={isSubmittingBatch}>
                {isSubmittingBatch ? "正在保存…" : "确认"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
