"use client";

import { useCallback, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
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
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppealRejectionDialog } from "@/components/appeal-rejection-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  isManualFulfillmentMarkStatus,
  type ManualFulfillmentMarkStatus,
} from "@/lib/fulfillment-status";

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

interface ActionConfig {
  label: string;
  variant: "default" | "outline" | "destructive";
  colorClass?: string;
}

const ACTION_CONFIG: Record<MarkAction, ActionConfig> = {
  leave: {
    label: "标记请假",
    variant: "outline",
    colorClass:
      "border-[#E2E2DF]/60 text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] rounded-xl text-[13px] font-normal",
  },
  waived: {
    label: "标记豁免",
    variant: "outline",
    colorClass:
      "border-[#E2E2DF]/60 text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] rounded-xl text-[13px] font-normal",
  },
  absent: {
    label: "确认缺勤",
    variant: "destructive",
    colorClass: "rounded-xl text-[13px] text-status-danger bg-status-danger/[0.08] hover:bg-status-danger/15 border border-status-danger/20 font-normal",
  },
  confirmed_published: {
    label: "确认已发",
    variant: "default",
    colorClass: "rounded-xl text-[13px] font-normal",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "success" | "accent" | "danger" | "warning" | "neutral" }> = {
    published: { label: "已发布", variant: "success" },
    confirmed_published: { label: "已确认", variant: "success" },
    leave: { label: "请假", variant: "accent" },
    waived: { label: "豁免", variant: "accent" },
    exempted: { label: "豁免期", variant: "neutral" },
    absent: { label: "缺勤", variant: "danger" },
    unconfirmed: { label: "待确认", variant: "warning" },
  };
  const c = config[status] ?? config.unconfirmed;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

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
          toast.error(err.error || "操作失败");
          return;
        }

        toast.success(decision === "approve" ? "已同意补交" : "已驳回补交");
        onActionComplete();
      } catch {
        toast.error("处理补交发生网络错误");
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

  // 考核天数算式
  const assessedDays = member
    ? member.requiredCount + member.leaveDays + member.waivedDays
    : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-lg overflow-y-auto"
        aria-label="成员履约月历与考勤档案"
      >
        <SheetHeader className="border-b border-[#E2E2DF]/60 pb-3">
          <SheetTitle className="text-[18px] font-medium text-[#141413]">
            {member?.userName || "成员"} · 履约档案
          </SheetTitle>
          <SheetDescription className="text-[12px] text-[#78716C]">
            {member?.teamName || "所属团队"} · 全月考勤明细与打卡轨迹
          </SheetDescription>
        </SheetHeader>

        {!member ? (
          <SheetBody>
            <EmptyState title="未选择成员" />
          </SheetBody>
        ) : (
          <SheetBody className="space-y-4 pt-3">
            {/* 全月考勤核心总览 */}
            <Card className="p-4 bg-[#FAF9F7]/60 border border-[#E2E2DF]/60 shadow-card-ring">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E2DF]/60">
                <span className="text-[12px] uppercase font-normal text-[#78716C]">
                  全月考勤考核明细
                </span>
                <Badge
                  variant={
                    member.fulfillmentRate >= 80
                      ? "success"
                      : member.fulfillmentRate >= 60
                        ? "warning"
                        : "danger"
                  }
                  className="tabular-nums"
                >
                  达成率 {member.fulfillmentRate}%
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[12px] text-[#78716C] block">实发作品</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-[20px] font-medium text-[#141413] tabular-nums">
                      {member.publishedCount}
                    </span>
                    <span className="text-[12px] text-[#78716C]">/ {member.requiredCount} 条应发</span>
                  </div>
                </div>

                <div>
                  <span className="text-[12px] text-[#78716C] block">考核扣减算式</span>
                  <div className="mt-1 text-[12px] text-[#141413] font-normal tabular-nums leading-relaxed">
                    {member.leaveDays > 0 || member.waivedDays > 0 ? (
                      <span>
                        考核{assessedDays}天 - 假{member.leaveDays}天
                        {member.waivedDays > 0 && ` - 免${member.waivedDays}天`}
                        {" = "}{member.requiredCount}条应发
                      </span>
                    ) : (
                      <span className="text-status-success">
                        考核 {assessedDays} 天全勤无缺
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-[#E2E2DF]/60 flex items-center justify-between text-[12px] text-[#78716C]">
                <span>请假 <strong className="font-normal text-[#1F1E1D] tabular-nums">{member.leaveDays}</strong> 天</span>
                <span>豁免 <strong className="font-normal text-[#1F1E1D] tabular-nums">{member.waivedDays}</strong> 天</span>
                <span>缺勤 <strong className={`font-normal tabular-nums ${member.absentDays > 0 ? "text-status-danger" : "text-[#1F1E1D]"}`}>{member.absentDays}</strong> 天</span>
                <span>剩余差额 <strong className="font-normal text-[#D97757] tabular-nums">{member.remainingCount}</strong> 条</span>
              </div>
            </Card>

            {/* 连续未发警示 */}
            {member.consecutiveMissing > 0 && (
              <div className="rounded-xl border border-status-danger/20 bg-status-danger/[0.05] p-3 flex items-center justify-between">
                <span className="text-[13px] text-status-danger font-medium flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-status-danger" />
                  已连续未发布 {member.consecutiveMissing} 天
                </span>
                <span className="text-[12px] text-[#78716C]">建议负责人跟进关注</span>
              </div>
            )}

            {/* 历史记录时间轴 */}
            <div className="space-y-2">
              <span className="text-[13px] font-medium text-[#141413] block">
                全月打卡足迹时间轴
              </span>
              <Card className="max-h-[200px] overflow-y-auto p-0 gap-0 border border-[#E2E2DF]/60">
                {historyDates.length === 0 ? (
                  <EmptyState variant="compact" title="无打卡记录" />
                ) : (
                  <div className="divide-y divide-[#E2E2DF]/50">
                    {historyDates.map((d) => {
                      const record = member.days[d];
                      const isSelected = d === effectiveDate;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleDateSelect(d)}
                          className={`flex w-full items-center justify-between px-3.5 py-2 text-left text-[12px] transition-colors ${
                            isSelected ? "bg-[#F1F1F0] font-medium" : "hover:bg-[#F7F7F6]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums text-[#78716C]">{d}</span>
                            <StatusBadge status={record.status} />
                          </div>
                          <div className="flex items-center gap-2">
                            {record.publishedCount > 0 && (
                              <span className="text-[12px] text-status-success tabular-nums">
                                发 {record.publishedCount} 条
                              </span>
                            )}
                            {record.reason && (
                              <span className="text-[12px] text-[#A8A29E] max-w-[120px] truncate">
                                {record.reason}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* 选中日期单日详情与操作 */}
            {effectiveDate && (
              <div className="rounded-xl border border-[#E2E2DF]/60 p-3.5 space-y-3 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[13px] font-medium text-[#141413]">
                      {effectiveDate}
                    </span>
                    <span className="ml-2 text-[12px] text-[#78716C]">
                      {isToday ? "（今天）" : ""}
                    </span>
                  </div>
                  {currentRecord && <StatusBadge status={currentRecord.status} />}
                </div>

                {/* 补交处理 */}
                {dateAppeal && (
                  <div className="rounded-md border border-status-warning/20 bg-status-warning/5 p-2.5 text-[12px]">
                    <div className="flex items-center justify-between text-status-warning font-medium">
                      <span>补交事由</span>
                      <span>{dateAppeal.status === "pending" ? "待审核" : "已处理"}</span>
                    </div>
                    <p className="mt-1 text-[#1F1E1D]">{dateAppeal.reason}</p>
                    {!readOnly && dateAppeal.status === "pending" && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={isSubmittingAppeal}
                          onClick={() => handleHandleAppeal(dateAppeal.id, "approve")}
                          className="h-6 text-[12px] text-status-success hover:bg-status-success/10 font-normal"
                        >
                          同意补交
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={isSubmittingAppeal}
                          onClick={() => setRejectingAppeal(dateAppeal)}
                          className="h-6 text-[12px] text-status-danger hover:bg-status-danger/10 font-normal"
                        >
                          驳回补交
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* 改判动作按钮 */}
                {!readOnly && <div className="pt-1">
                  <p className="text-[12px] text-[#78716C] mb-1.5">改判此日状态：</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(ACTION_CONFIG) as MarkAction[]).map((action) => (
                      <Button
                        key={action}
                        variant="outline"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={() => handleActionClick(action)}
                        className={`text-[12px] h-8 ${ACTION_CONFIG[action].colorClass}`}
                      >
                        {ACTION_CONFIG[action].label}
                      </Button>
                    ))}
                  </div>
                </div>}

                {/* 如果已有人工标记，提供清除入口 */}
                {!readOnly && isManuallyMarked && (
                  <div className="pt-1 text-right">
                    <button
                      type="button"
                      onClick={() => setRemoveConfirmOpen(true)}
                      className="text-[12px] text-status-danger hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 className="size-3" />
                      清除人工标记，恢复系统自动判定
                    </button>
                  </div>
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
                <DialogTitle className="text-[18px] font-medium text-[#141413]">
                  确认改判为「{ACTION_CONFIG[activeAction].label}」
                </DialogTitle>
                <DialogDescription className="text-[13px] text-[#78716C]">
                  正在为 {member?.userName} 的 {effectiveDate} 记录标记为「
                  {ACTION_CONFIG[activeAction].label}」。
                </DialogDescription>
              </DialogHeader>

              <div className="py-2">
                <label className="text-[12px] text-[#78716C] block mb-1">
                  标记原因（选填）：
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例如：调休 / 系统审核延迟"
                  className="w-full rounded-md border border-[#E2E2DF] px-3 py-1.5 text-[13px] outline-none focus:border-[#141413]"
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
                  {isSubmitting ? "正在保存..." : "确认改判"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {!readOnly && rejectingAppeal && (
          <AppealRejectionDialog
            open={true}
            onOpenChange={(open) => {
              if (!open && !isSubmittingAppeal) {
                setRejectingAppeal(null);
              }
            }}
            isSubmitting={isSubmittingAppeal}
            onConfirm={async (reason) => {
              await handleHandleAppeal(rejectingAppeal.id, "reject", reason);
              setRejectingAppeal(null);
            }}
          />
        )}

        {/* 清除标记确认弹窗 */}
        {!readOnly && <ConfirmDialog
          open={removeConfirmOpen}
          onOpenChange={setRemoveConfirmOpen}
          title="确认清除人工标记？"
          description={`将清除 ${member?.userName} 在 ${effectiveDate} 的人工改判状态，系统将按实际作品数据自动恢复。`}
          confirmText={isRemoving ? "正在清除..." : "确认清除"}
          onConfirm={handleConfirmRemove}
          destructive={true}
        />}
      </SheetContent>
    </Sheet>
  );
}
