"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  FulfillmentAppeal,
  FulfillmentMemberSummary,
} from "@/types/fulfillment";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineFeedbackTray } from "@/components/inline-feedback-tray";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatShanghaiDateOnly } from "@/lib/business-time";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  isManualFulfillmentMarkStatus,
  type ManualFulfillmentMarkStatus,
} from "@/lib/fulfillment-status";
import { cn } from "@/lib/utils";
import { rowSelectionClass } from "@/components/ui/selection";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { formatMonthDay, isMissingStreak } from "../fulfillment-page-view";

type Source = "queue" | "matrix";

type MarkAction = ManualFulfillmentMarkStatus;

interface FulfillmentMemberSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: FulfillmentMemberSummary | null;
  date: string | null;
  source?: Source;
  onActionComplete: () => void;
  appeals?: FulfillmentAppeal[];
  readOnly?: boolean;
}

const ACTION_LABELS: Record<MarkAction, string> = {
  confirmed_published: "标为已发",
  leave: "标为请假",
  waived: "标为豁免",
  absent: "标为缺勤",
};
const ACTION_ORDER: MarkAction[] = ["confirmed_published", "leave", "waived", "absent"];

const STATUS_LABELS: Record<string, string> = {
  published: "已发",
  confirmed_published: "已发（人工确认）",
  leave: "请假",
  waived: "豁免",
  exempted: "豁免期",
  absent: "缺勤",
  unconfirmed: "未确认",
};

function statusText(status: string) {
  return STATUS_LABELS[status] ?? STATUS_LABELS.unconfirmed;
}

function statusTone(status: string) {
  if (status === "absent") return "text-status-danger";
  if (status === "unconfirmed") return "text-[#78716C]";
  return "text-[#1F1E1D]";
}

const QUIET_ACTION =
  "h-8 rounded-md border border-[#E2E2DF] bg-white text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413]";

export function FulfillmentMemberSheet({
  open,
  onOpenChange,
  member,
  date,
  onActionComplete,
  appeals = [],
  readOnly = false,
}: FulfillmentMemberSheetProps) {
  const [activeAction, setActiveAction] = useState<MarkAction | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(date);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [rejectingAppeal, setRejectingAppeal] = useState<FulfillmentAppeal | null>(null);

  const effectiveDate = selectedDate ?? date;

  const currentRecord = useMemo(() => {
    if (!member || !effectiveDate) return null;
    return member.days[effectiveDate] ?? null;
  }, [member, effectiveDate]);

  const historyDates = useMemo(() => {
    if (!member) return [];
    return Object.keys(member.days).sort().reverse();
  }, [member]);

  const dateAppeal = useMemo(() => {
    if (!member || !effectiveDate || !appeals.length) return null;
    return (
      appeals.find(
        (a) => a.user_id === member.userId && a.record_date === effectiveDate,
      ) ?? null
    );
  }, [member, effectiveDate, appeals]);

  const handleActionClick = (action: MarkAction) => {
    setActiveAction(action);
    setReason("");
  };

  const handleDateSelect = (d: string) => {
    setSelectedDate(d);
    setActiveAction(null);
    setReason("");
  };

  const handleConfirmAction = useCallback(async () => {
    if (!member || !effectiveDate || !activeAction) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/fulfillment/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.userId,
          recordDate: effectiveDate,
          status: activeAction,
          reason: reason.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const error = (await res.json()) as { error?: string };
        throw new Error(error.error || "标记失败");
      }

      trackUsageEvent({
        path: "/admin/fulfillment",
        eventType: "mark_fulfillment_status",
      });

      toast.success("已更新履约状态");
      setActiveAction(null);
      setReason("");
      onActionComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "标记失败");
    } finally {
      setIsSubmitting(false);
    }
  }, [member, effectiveDate, activeAction, reason, onActionComplete]);

  const handleConfirmRemove = useCallback(async () => {
    if (!member || !effectiveDate) return;

    setIsRemoving(true);
    try {
      const res = await fetch("/api/admin/fulfillment/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.userId,
          recordDate: effectiveDate,
        }),
      });

      if (!res.ok) {
        const error = (await res.json()) as { error?: string };
        throw new Error(error.error || "清除标记失败");
      }

      toast.success("已清除人工标记，恢复系统状态");
      setRemoveConfirmOpen(false);
      onActionComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "清除标记失败");
    } finally {
      setIsRemoving(false);
    }
  }, [member, effectiveDate, onActionComplete]);

  const handleHandleAppeal = useCallback(
    async (appealId: string, decision: "approve" | "reject", appealReason?: string) => {
      setIsSubmittingAppeal(true);
      try {
        const res = await fetch("/api/admin/fulfillment/appeal/handle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appealId, decision, ...(appealReason ? { reason: appealReason } : {}) }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          toast.error(err.error || "没能完成，稍后重试");
          return;
        }

        toast.success(decision === "approve" ? "已同意补交" : "已驳回补交");
        onActionComplete();
      } catch {
        toast.error("处理补交时出了点问题，稍后重试");
      } finally {
        setIsSubmittingAppeal(false);
      }
    },
    [onActionComplete],
  );

  const isToday = effectiveDate === formatShanghaiDateOnly();

  const isManuallyMarked = Boolean(
    currentRecord && isManualFulfillmentMarkStatus(currentRecord.status),
  );

  const assessedDays = member
    ? member.requiredCount + member.leaveDays + member.waivedDays
    : 0;
  const monthLabel = effectiveDate ? `${Number(effectiveDate.slice(5, 7))}月` : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-lg overflow-y-auto"
        aria-label="成员这个月的发布记录"
      >
        <SheetHeader className="flex-row items-start justify-start gap-3 border-b border-[#E2E2DF]/60 pb-3">
          <InitialAvatar name={member?.userName} size="lg" />
          <div className="min-w-0">
            <SheetTitle className="text-[20px] text-[#141413]">
              {member?.userName || "成员"}{monthLabel ? ` · ${monthLabel}` : ""}
            </SheetTitle>
            {member?.teamName && (
              <SheetDescription className="text-[12px] text-[#78716C]">{member.teamName}</SheetDescription>
            )}
          </div>
        </SheetHeader>

        {!member ? (
          <SheetBody>
            <EmptyState title="选一位成员查看这个月的记录" />
          </SheetBody>
        ) : (
          <SheetBody className="space-y-5 pt-3">
            {/* 这个月：一句话 + 一行明细（算式悬停可见） */}
            <div className="space-y-1">
              <p className="text-[14px] text-[#141413] tabular-nums">
                已发 {member.publishedCount} / {member.requiredCount} 条 · {member.fulfillmentRate}%
                {member.remainingCount > 0 ? ` · 还差 ${member.remainingCount} 条` : " · 已达标"}
                {isMissingStreak(member) && (
                  <span className="ml-2 text-status-danger">断 {member.consecutiveMissing} 天</span>
                )}
              </p>
              <p
                className="text-[12px] text-[#78716C] tabular-nums"
                title={`考核 ${assessedDays} 天，请假和豁免的天不算应发，应发 ${member.requiredCount} 条`}
              >
                考核 {assessedDays} 天 · 请假 {member.leaveDays} · 豁免 {member.waivedDays} · 缺勤{" "}
                <span className={member.absentDays > 0 ? "text-status-danger" : undefined}>{member.absentDays}</span>
              </p>
            </div>

            {/* 每天一行，点一天在下面看与改 */}
            <div className="space-y-1">
              <p className="text-[12px] text-[#78716C]">每天</p>
              {historyDates.length === 0 ? (
                <EmptyState variant="compact" title="这个月还没有记录" />
              ) : (
                <ul className="max-h-[240px] overflow-y-auto rounded-xl border border-[#E2E2DF]">
                  {historyDates.map((d) => {
                    const record = member.days[d];
                    const isSelected = d === effectiveDate;
                    return (
                      <li key={d}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => handleDateSelect(d)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left text-[14px] transition-colors",
                            rowSelectionClass(isSelected),
                          )}
                        >
                          <span className="w-16 shrink-0 tabular-nums text-[#78716C]">{formatMonthDay(d)}</span>
                          <span className={statusTone(record.status)}>{statusText(record.status)}</span>
                          {record.publishedCount > 0 && (
                            <span className="text-[12px] tabular-nums text-[#78716C]">发 {record.publishedCount} 条</span>
                          )}
                          {record.reason && (
                            <span className="ml-auto max-w-[140px] truncate text-[12px] text-[#78716C]" title={record.reason}>
                              {record.reason}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 选中的这一天 */}
            {effectiveDate && (
              <div className="space-y-3 border-t border-[#E2E2DF]/60 pt-4">
                <p className="text-[14px] text-[#141413]">
                  {formatMonthDay(effectiveDate)}{isToday ? "（今天）" : ""}
                  {currentRecord && (
                    <span className={cn("ml-2", statusTone(currentRecord.status))}>{statusText(currentRecord.status)}</span>
                  )}
                </p>

                {dateAppeal && (
                  <div className="space-y-2 text-[14px]">
                    <p className="text-[#1F1E1D]">
                      <span className="text-[12px] text-[#78716C]">
                        补交{dateAppeal.status === "pending" ? "待审" : "已处理"}：
                      </span>
                      {dateAppeal.reason}
                    </p>
                    {!readOnly && dateAppeal.status === "pending" && (
                      <>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={isSubmittingAppeal}
                            onClick={() => handleHandleAppeal(dateAppeal.id, "approve")}
                            className="h-7 px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                          >
                            同意补交
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={isSubmittingAppeal}
                            onClick={() => setRejectingAppeal((prev) => (prev?.id === dateAppeal.id ? null : dateAppeal))}
                            className="h-7 px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                          >
                            {rejectingAppeal?.id === dateAppeal.id ? "收起" : "驳回"}
                          </Button>
                        </div>
                        {rejectingAppeal?.id === dateAppeal.id && (
                          <InlineFeedbackTray
                            initialAction="rejected"
                            title={`驳回 ${member?.userName || "成员"} 的补交`}
                            scopeHint="驳回原因会通过通知发给本人"
                            required
                            confirmLabel="确认驳回"
                            isSubmitting={isSubmittingAppeal}
                            onConfirm={async (_action, reasonText) => {
                              await handleHandleAppeal(dateAppeal.id, "reject", reasonText);
                              setRejectingAppeal(null);
                            }}
                            onCancel={() => setRejectingAppeal(null)}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}

                {!readOnly && (
                  <div className="grid grid-cols-2 gap-2">
                    {ACTION_ORDER.map((action) => (
                      <Button
                        key={action}
                        variant="outline"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={() => handleActionClick(action)}
                        className={QUIET_ACTION}
                      >
                        {ACTION_LABELS[action]}
                      </Button>
                    ))}
                  </div>
                )}

                {!readOnly && isManuallyMarked && (
                  <button
                    type="button"
                    onClick={() => setRemoveConfirmOpen(true)}
                    className="text-[12px] text-[#78716C] underline-offset-2 hover:text-[#141413] hover:underline"
                  >
                    这一天是人工标的 · 撤掉，按系统判定
                  </button>
                )}
              </div>
            )}
          </SheetBody>
        )}

        {/* 改判确认弹窗 */}
        {!readOnly && activeAction && (
          <Dialog open={true} onOpenChange={(open) => !open && setActiveAction(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  把 {member?.userName} {effectiveDate ? formatMonthDay(effectiveDate) : ""}{ACTION_LABELS[activeAction]}
                </DialogTitle>
                <DialogDescription className="text-[14px] text-[#78716C]">
                  只改这一天，之后可以撤掉，按系统判定。
                </DialogDescription>
              </DialogHeader>

              <div className="py-2">
                <label className="text-[12px] text-[#78716C] block mb-1">
                  备注（选填）
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例如：调休"
                  className="w-full rounded-md border border-[#E2E2DF] px-3 py-1.5 text-[14px] outline-none focus:border-[#141413]"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveAction(null)}
                  disabled={isSubmitting}
                >
                  取消
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleConfirmAction}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "正在保存…" : "确认"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* 清除标记确认弹窗 */}
        {!readOnly && <ConfirmDialog
          open={removeConfirmOpen}
          onOpenChange={setRemoveConfirmOpen}
          title="撤掉人工标记？"
          description={`${member?.userName} ${effectiveDate ? formatMonthDay(effectiveDate) : ""}会改回按实际作品自动判定。`}
          confirmText={isRemoving ? "正在撤掉…" : "撤掉"}
          onConfirm={handleConfirmRemove}
          destructive={true}
        />}
      </SheetContent>
    </Sheet>
  );
}
