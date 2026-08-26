"use client";

import { useCallback, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import type {
  FulfillmentAppeal,
  FulfillmentMemberSummary,
  FulfillmentStatus,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { trackUsageEvent } from "@/lib/usage-events/client";

type Source = "queue" | "matrix";

type MarkAction = Extract<
  FulfillmentStatus,
  "leave" | "waived" | "absent" | "confirmed_published"
>;

interface MemberDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: FulfillmentMemberSummary | null;
  date: string | null;
  source: Source;
  onActionComplete: () => void;
  appeals?: FulfillmentAppeal[];
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
      "border-[#E5E0D6]/80 text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] rounded-xl text-[13px] font-medium",
  },
  waived: {
    label: "标记豁免",
    variant: "outline",
    colorClass:
      "border-[#E5E0D6]/80 text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] rounded-xl text-[13px] font-medium",
  },
  absent: {
    label: "确认缺勤",
    variant: "destructive",
    colorClass: "rounded-xl text-[13px] bg-[#C9604D] hover:bg-[#B5503E] font-medium",
  },
  confirmed_published: {
    label: "确认已发",
    variant: "default",
    colorClass:
      "rounded-xl text-[13px] bg-[#D97757] hover:bg-[#C46A4D] text-white font-medium shadow-sm",
  },
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; dot: string; border: string; bg: string }
  > = {
    published: {
      label: "已发布",
      dot: "bg-[#6FAA7D]",
      border: "border-[#6FAA7D]/20",
      bg: "bg-[#6FAA7D]/[0.04]",
    },
    confirmed_published: {
      label: "已确认",
      dot: "bg-[#6FAA7D]",
      border: "border-[#6FAA7D]/20",
      bg: "bg-[#6FAA7D]/[0.04]",
    },
    leave: {
      label: "请假",
      dot: "bg-[#78716C]",
      border: "border-[#E5E0D6]",
      bg: "bg-[#F5F3EE]/60",
    },
    waived: {
      label: "豁免",
      dot: "bg-[#78716C]",
      border: "border-[#E5E0D6]",
      bg: "bg-[#F5F3EE]/60",
    },
    exempted: {
      label: "豁免期",
      dot: "bg-[#E5E0D6]",
      border: "border-[#E5E0D6]",
      bg: "bg-[#FBF9F5]",
    },
    absent: {
      label: "缺勤",
      dot: "bg-[#C9604D]",
      border: "border-[#C9604D]/20",
      bg: "bg-[#C9604D]/[0.04]",
    },
    unconfirmed: {
      label: "待确认",
      dot: "bg-[#E5E0D6]",
      border: "border-[#E5E0D6]",
      bg: "bg-[#F5F3EE]",
    },
  };
  const c = config[status] ?? config.unconfirmed;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] font-medium ${c.border} ${c.bg} text-[#292524]`}
    >
      <span className={`size-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function MemberDrawer({
  open,
  onOpenChange,
  member,
  date,
  onActionComplete,
  appeals = [],
}: MemberDrawerProps) {
  const [activeAction, setActiveAction] = useState<MarkAction | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(date);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);

  // 同步外部 date 到内部 selectedDate
  const effectiveDate = selectedDate ?? date;

  const dayRecord = member && effectiveDate ? member.days[effectiveDate] : null;

  // 历史时间线：按日期倒序
  const historyDates = useMemo(() => {
    if (!member) return [];
    return Object.keys(member.days).sort().reverse();
  }, [member]);

  // 查找选中日期对应的申诉记录
  const dateAppeal = useMemo(() => {
    if (!member || !effectiveDate || !Array.isArray(appeals)) return null;
    return appeals.find(
      (a) => a.user_id === member.userId && a.record_date === effectiveDate,
    );
  }, [member, effectiveDate, appeals]);

  const handleActionClick = useCallback((action: MarkAction) => {
    setActiveAction(action);
    setReason("");
  }, []);

  const handleCancelAction = useCallback(() => {
    setActiveAction(null);
    setReason("");
  }, []);

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
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "标记失败" }));
        toast.error(err.error || "标记失败");
        return;
      }
      trackUsageEvent({
        path: "/admin/fulfillment",
        eventType: "mark_fulfillment_status",
      });
      setActiveAction(null);
      setReason("");
      onActionComplete();
    } catch {
      toast.error("网络错误，标记失败");
    } finally {
      setIsSubmitting(false);
    }
  }, [member, effectiveDate, activeAction, reason, onActionComplete]);

  const handleRemoveMark = useCallback(async () => {
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
        const err = await res.json().catch(() => ({ error: "删除标记失败" }));
        toast.error(err.error || "删除标记失败");
        return;
      }
      setRemoveConfirmOpen(false);
      onActionComplete();
    } catch {
      toast.error("网络错误，删除标记失败");
    } finally {
      setIsRemoving(false);
    }
  }, [member, effectiveDate, onActionComplete]);

  const handleHandleAppeal = useCallback(
    async (appealId: string, decision: "approve" | "reject") => {
      setIsSubmittingAppeal(true);
      try {
        const res = await fetch("/api/admin/fulfillment/appeal/handle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appealId, decision }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "处理申诉失败" }));
          toast.error(err.error || "处理申诉失败");
          return;
        }
        onActionComplete();
      } catch {
        toast.error("网络错误，处理申诉失败");
      } finally {
        setIsSubmittingAppeal(false);
      }
    },
    [onActionComplete],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setActiveAction(null);
        setReason("");
        setSelectedDate(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const handleDateSelect = useCallback((d: string) => {
    setSelectedDate(d);
    setActiveAction(null);
    setReason("");
  }, []);

  if (!member) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full max-w-[480px]">
          <SheetHeader>
            <SheetTitle className="font-serif tracking-tight font-semibold text-[#1C1917]">成员详情</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <p className="text-[13px] text-[#78716C]">未选择成员</p>
          </SheetBody>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full max-w-[480px] bg-white">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <SheetTitle className="font-serif tracking-tight font-semibold text-[#1C1917]">{member.userName}</SheetTitle>
              {dayRecord ? <StatusBadge status={dayRecord.status} /> : null}
            </div>
            <SheetDescription>{member.teamName ?? "无团队"}</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-6">
            {/* 当前时间段统计 */}
            <section>
              <h3 className="mb-3 text-[12px] font-normal tracking-[0.12em] text-[#78716C]">
                当前统计
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#F5F3EE]/70 p-3">
                  <p className="text-[12px] text-[#78716C]">应发天数</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#1C1917]">
                    {member.totalDays}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F5F3EE]/70 p-3">
                  <p className="text-[12px] text-[#78716C]">实发天数</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#1C1917]">
                    {member.publishedDays}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F5F3EE]/70 p-3">
                  <p className="text-[12px] text-[#78716C]">发布率</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#1C1917]">
                    {member.fulfillmentRate}%
                  </p>
                </div>
                <div className="rounded-xl bg-[#F5F3EE]/70 p-3">
                  <p className="text-[12px] text-[#78716C]">请假</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#1C1917]">
                    {member.leaveDays}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F5F3EE]/70 p-3">
                  <p className="text-[12px] text-[#78716C]">豁免</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#1C1917]">
                    {member.waivedDays}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F5F3EE]/70 p-3">
                  <p className="text-[12px] text-[#78716C]">缺勤</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[#1C1917]">
                    {member.absentDays}
                  </p>
                </div>
              </div>
            </section>

            {/* 连续未发 */}
            {member.consecutiveMissing > 0 && (
              <section className="rounded-xl bg-[#C9604D]/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#C9604D]" />
                  <span className="text-[13px] font-medium text-[#292524]">
                    连续未发 {member.consecutiveMissing} 天
                  </span>
                </div>
              </section>
            )}

            {/* 历史记录时间线 */}
            <section>
              <h3 className="mb-3 text-[12px] font-normal tracking-[0.12em] text-[#78716C]">
                历史记录
              </h3>
              <div className="max-h-[200px] overflow-y-auto rounded-xl border border-[#E5E0D6]">
                {historyDates.length === 0 ? (
                  <p className="p-4 text-[13px] text-[#78716C]">还没有历史记录</p>
                ) : (
                  <div className="divide-y divide-[#ECE7DE]">
                    {historyDates.map((d) => {
                      const record = member.days[d];
                      const isSelected = d === effectiveDate;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleDateSelect(d)}
                          className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors duration-150 ${
                            isSelected ? "bg-[#FBF9F5]" : "hover:bg-[#FBF9F5]/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-[12px] tabular-nums ${isSelected ? "font-medium text-[#1C1917]" : "text-[#78716C]"}`}
                            >
                              {d.slice(5)}
                            </span>
                            <StatusBadge status={record.status} />
                          </div>
                          <div className="flex items-center gap-2">
                            {record.reason ? (
                              <span
                                className="max-w-[120px] truncate text-[12px] text-[#78716C]"
                                title={record.reason}
                              >
                                {record.reason}
                              </span>
                            ) : null}
                            {record.markedByName ? (
                              <span className="text-[12px] text-[#78716C]">
                                {record.markedByName}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* 员工申诉状态 (新集成) */}
            {dateAppeal && (
              <section className="rounded-xl bg-amber-50/40 p-4 space-y-3">
                <h4 className="flex items-center gap-1.5 text-[12px] font-normal text-[#D99E55]">
                  <span className="size-2 rounded-full bg-[#D99E55]" />
                  员工发起申诉
                </h4>
                <div className="text-[13px] text-[#292524] bg-white/90 p-2.5 rounded-lg">
                  “{dateAppeal.reason}”
                </div>
                <p className="text-[12px] text-[#292524]">
                  提交时间:{" "}
                  {new Date(dateAppeal.created_at).toLocaleString("zh-CN")}
                </p>

                {dateAppeal.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-[#E5E0D6] text-[#292524] hover:bg-[#FBF9F5] hover:text-[#1C1917] font-medium"
                      onClick={() =>
                        handleHandleAppeal(dateAppeal.id, "approve")
                      }
                      disabled={isSubmittingAppeal}
                    >
                      同意并改判
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-[#E5E0D6] text-[#292524] hover:bg-[#FBF9F5] hover:text-[#1C1917] font-medium"
                      onClick={() =>
                        handleHandleAppeal(dateAppeal.id, "reject")
                      }
                      disabled={isSubmittingAppeal}
                    >
                      驳回申诉
                    </Button>
                  </div>
                )}

                {dateAppeal.status !== "pending" && (
                  <div className="text-[12px] font-medium pt-1 text-[#292524]">
                    审批状态：
                    <span
                      className={
                        dateAppeal.status === "approved"
                          ? "text-[#6FAA7D]"
                          : "text-[#C9604D]"
                      }
                    >
                      {dateAppeal.status === "approved"
                        ? "已同意改判"
                        : "已驳回"}
                    </span>
                    {dateAppeal.handler_name && (
                      <span className="ml-1.5 text-[12px] text-[#78716C]">
                        ({dateAppeal.handler_name})
                      </span>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* 当日/选中日状态 */}
            <section>
              <h3 className="mb-3 text-[12px] font-normal tracking-[0.12em] text-[#78716C]">
                {effectiveDate === date
                  ? "当日状态"
                  : `${effectiveDate?.slice(5)} 状态`}
              </h3>
              <div className="space-y-2 bg-[#F5F3EE]/60 rounded-xl p-3.5">
                {dayRecord ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-[#78716C]">发布数量</span>
                      <span className="tabular-nums font-medium text-[#1C1917]">
                        {dayRecord.publishedCount} 条
                      </span>
                    </div>
                    {dayRecord.reason ? (
                      <div className="rounded-lg bg-white/90 p-2.5">
                        <p className="text-[12px] text-[#78716C]">
                          备注原因
                        </p>
                        <p className="mt-1 text-[13px] text-[#292524] leading-normal">
                          {dayRecord.reason}
                        </p>
                      </div>
                    ) : null}
                    {dayRecord.markedByName ? (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[#78716C]">标记人</span>
                        <span className="text-[#292524] font-medium">
                          {dayRecord.markedByName}
                        </span>
                      </div>
                    ) : null}
                    {dayRecord.markedAt ? (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-[#78716C]">标记时间</span>
                        <span className="text-[12px] text-[#292524]">
                          {new Date(dayRecord.markedAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[13px] text-[#78716C]">当日无记录</p>
                )}
              </div>
            </section>

            {/* 操作区 */}
            <section>
              <h3 className="mb-3 text-[12px] font-normal tracking-[0.12em] text-[#78716C]">
                操作
              </h3>
              {activeAction ? (
                <div className="space-y-3">
                  <div className="rounded-xl bg-[#F5F3EE]/60 p-3">
                    <label
                      htmlFor="action-reason"
                      className="mb-1.5 block text-[12px] font-normal text-[#78716C]"
                    >
                      {ACTION_CONFIG[activeAction].label}原因（可选）
                    </label>
                    <input
                      id="action-reason"
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="输入原因..."
                      className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 shadow-2xs px-3 py-2 text-[13px] text-[#292524] outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:shadow-2xs focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handleCancelAction}
                      disabled={isSubmitting}
                    >
                      取消
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleConfirmAction}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "提交中..." : "确认"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      Object.entries(ACTION_CONFIG) as [
                        MarkAction,
                        (typeof ACTION_CONFIG)[MarkAction],
                      ][]
                    ).map(([action, config]) => (
                      <Button
                        key={action}
                        variant={config.variant}
                        className={config.colorClass}
                        onClick={() => handleActionClick(action)}
                        disabled={dayRecord?.status === action}
                      >
                        {config.label}
                      </Button>
                    ))}
                  </div>
                  {dayRecord &&
                    dayRecord.status !== "published" &&
                    dayRecord.status !== "exempted" &&
                    dayRecord.status !== "unconfirmed" && (
                      <Button
                        variant="outline"
                        className="w-full border-[#E5E0D6] text-[#292524] hover:bg-[#FBF9F5] hover:text-[#1C1917]"
                        onClick={() => setRemoveConfirmOpen(true)}
                      >
                        <Trash2 className="size-3.5 mr-1" />
                        删除标记
                      </Button>
                    )}
                </div>
              )}
            </section>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        title="删除标记"
        description={`确定要删除 ${member.userName} ${effectiveDate} 的标记吗？此操作不可撤销。`}
        confirmText="删除"
        destructive
        loading={isRemoving}
        onConfirm={handleRemoveMark}
      />
    </>
  );
}
