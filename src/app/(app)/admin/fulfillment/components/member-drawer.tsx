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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ItemHeading } from "@/components/ui/item-heading";
import { Metric } from "@/components/ui/metric";
import { cn } from "@/lib/utils";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  isManualFulfillmentMarkStatus,
  type ManualFulfillmentMarkStatus,
} from "@/lib/fulfillment-status";

type Source = "queue" | "matrix";

type MarkAction = ManualFulfillmentMarkStatus;

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

  // 主 CTA 文案跟随实际作用日期，避免选中历史日时误标"今日"
  const markDateLabel = effectiveDate
    ? effectiveDate === formatShanghaiDateOnly()
      ? "今日"
      : `${effectiveDate.slice(5)} 当日`
    : "今日";

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
            <SheetTitle className="font-medium text-[#141413]">成员详情</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <EmptyState variant="compact" title="未找到成员数据" />
          </SheetBody>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full max-w-[480px] bg-[#FCFCFB] border-l border-[#E2E2DF]">
          <SheetHeader className="border-b border-[#E2E2DF]/60 pb-4">
            <div className="flex items-center gap-2">
              <SheetTitle>{member.userName}</SheetTitle>
              {dayRecord ? <StatusBadge status={dayRecord.status} /> : null}
            </div>
            <SheetDescription className="text-[13px] text-[#78716C]">{member.teamName ?? "无团队归属"}</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-6 pt-4 pb-[calc(2rem+var(--app-bottom-nav-height,0px)+env(safe-area-inset-bottom,0px))] md:pb-6">
            {/* 当前时间段统计：去实体框 · 极简发丝线出版物排版 */}
            <Card className=" p-4 gap-0">
              <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-2.5">
                <span className="text-[12px] font-normal uppercase tracking-wider text-[#78716C]">
                  履约作品统计
                </span>
                <span className="text-[12px] tabular-nums font-normal text-[#1F1E1D]">
                  {member.fulfillmentRate}% 达成率
                </span>
              </div>
              <div className="grid grid-cols-3 gap-y-4 pt-3 text-center">
                <div className="border-r border-[#E2E2DF]/60 last:border-r-0">
                  <p className="text-[12px] text-[#78716C]">应发作品</p>
                  <Metric value={member.requiredCount} className="mt-1" />
                </div>
                <div className="border-r border-[#E2E2DF]/60 last:border-r-0">
                  <p className="text-[12px] text-[#78716C]">实发作品</p>
                  <Metric value={member.publishedCount} className="mt-1" />
                </div>
                <div>
                  <p className="text-[12px] text-[#78716C]">
                    {member.remainingCount <= 0 ? "目标状态" : "尚需提交"}
                  </p>
                  <Metric
                    value={member.remainingCount <= 0 ? "已达标" : member.remainingCount}
                    tone={member.remainingCount <= 0 ? "success" : "accent"}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* 次级考勤事实微印记 */}
              <div className="mt-4 flex items-center justify-around border-t border-[#E2E2DF]/60 pt-2.5 text-[12px] text-[#78716C]">
                <span>请假 <strong className="font-normal text-[#1F1E1D] tabular-nums">{member.leaveDays}</strong> 天</span>
                <span className="text-[#E2E2DF]">·</span>
                <span>豁免 <strong className="font-normal text-[#1F1E1D] tabular-nums">{member.waivedDays}</strong> 天</span>
                <span className="text-[#E2E2DF]">·</span>
                <span>缺勤 <strong className={`font-normal tabular-nums ${member.absentDays > 0 ? "text-status-danger" : "text-[#1F1E1D]"}`}>{member.absentDays}</strong> 天</span>
              </div>
            </Card>

            {/* 连续未发警示 */}
            {member.consecutiveMissing > 0 && (
              <section className="rounded-xl border-l-2 border-status-danger bg-status-danger/[0.08] px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-current text-status-danger" />
                  <span className="text-[13px] font-normal text-[#141413]">
                    已连续未发布 {member.consecutiveMissing} 天
                  </span>
                </div>
                <span className="text-[12px] text-[#78716C]">建议及时沟通</span>
              </section>
            )}

            {/* 历史记录时间线 */}
            <section className="space-y-2">
              <ItemHeading as="h3">
                履约时间轴
              </ItemHeading>
              <Card className="max-h-[220px] overflow-y-auto p-0 gap-0 border border-[#E2E2DF]/60">
                {historyDates.length === 0 ? (
                  <EmptyState variant="compact" title="还没有历史记录" />
                ) : (
                  <div className="divide-y divide-[#E2E2DF]/60">
                    {historyDates.map((d) => {
                      const record = member.days[d];
                      const isSelected = d === effectiveDate;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleDateSelect(d)}
                          className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left transition-colors duration-150 cursor-pointer ${
                            isSelected ? "bg-[#F1F1F0] font-medium" : "hover:bg-[#F7F7F6]"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[12px] tabular-nums ${isSelected ? "text-[#141413]" : "text-[#78716C]"}`}
                            >
                              {d.slice(5)}
                            </span>
                            {record.pendingExemption ? (
                              <Badge variant="warning">
                                请假待审
                              </Badge>
                            ) : (
                              <StatusBadge status={record.status} />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {record.pendingExemption?.reason || record.reason ? (
                              <span
                                className="max-w-[130px] truncate text-[12px] text-[#78716C]"
                                title={record.pendingExemption?.reason ?? record.reason}
                              >
                                {record.pendingExemption?.reason ?? record.reason}
                              </span>
                            ) : null}
                            {record.markedByName ? (
                              <span className="text-[12px] text-[#78716C]/80">
                                {record.markedByName}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            </section>

            {/* 员工申诉状态 (卷首寄语风格 · 优雅引述) */}
            {dateAppeal && (
              <section className="rounded-xl border-l-2 border-[#D97757] bg-gradient-to-r from-[#F1F1F0] to-transparent pl-3.5 pr-3 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <ItemHeading as="h4" className="flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-current text-status-warning" />
                    <span className="text-status-warning">
                      伙伴申诉复核 ({dateAppeal.status === "pending" ? "待处理" : dateAppeal.status === "approved" ? "已同意" : "已驳回"})
                    </span>
                  </ItemHeading>
                  <span className="text-[12px] text-[#78716C] tabular-nums">
                    {new Date(dateAppeal.created_at).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <div className="text-[13px] leading-relaxed text-[#1F1E1D]">
                  “{dateAppeal.reason}”
                </div>

                {dateAppeal.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 text-[12px]"
                      onClick={() =>
                        handleHandleAppeal(dateAppeal.id, "approve")
                      }
                      disabled={isSubmittingAppeal}
                    >
                      同意并改判 →
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-[#E2E2DF] bg-white text-[#78716C] hover:bg-status-danger/10 hover:text-status-danger font-normal text-[12px] active:scale-[0.99] active:duration-120"
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
                  <div className="text-[12px] font-normal pt-1 text-[#78716C]">
                    处理结论：
                    <span
                      className={
                        dateAppeal.status === "approved"
                          ? "text-status-success font-normal"
                          : "text-status-danger font-normal"
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
            <section className="space-y-2">
              <ItemHeading as="h3">
                {effectiveDate === date
                  ? "选定日事实"
                  : `${effectiveDate?.slice(5)} 记录事实`}
              </ItemHeading>
              <Card className="space-y-2 p-3.5 border border-[#E2E2DF]/60 gap-0">
                {dayRecord ? (
                  <div className="space-y-2 text-[13px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#78716C]">作品发布条数</span>
                      <span className="tabular-nums font-normal text-[#141413]">
                        {dayRecord.publishedCount} 条
                      </span>
                    </div>
                    {dayRecord.reason ? (
                      <div className="rounded-xl bg-[#F1F1F0]/60 p-2.5 border border-[#E2E2DF]/60">
                        <p className="text-[12px] font-normal text-[#78716C]">
                          备注原因
                        </p>
                        <p className="mt-0.5 text-[13px] text-[#1F1E1D] leading-relaxed">
                          {dayRecord.reason}
                        </p>
                      </div>
                    ) : null}
                    {dayRecord.markedByName ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[#78716C]">标记人</span>
                        <span className="text-[#1F1E1D] font-normal">
                          {dayRecord.markedByName}
                        </span>
                      </div>
                    ) : null}
                    {dayRecord.markedAt ? (
                      <div className="flex items-center justify-between text-[12px] text-[#78716C]">
                        <span>标记时间</span>
                        <span className="tabular-nums">
                          {new Date(dayRecord.markedAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[13px] text-[#78716C]">该日无填报或打卡记录</p>
                )}
              </Card>
            </section>

            {/* 操作区：落实双星行动法则（1个主CTA + 浅砂微气垫） */}
            <section className="space-y-2 pt-1">
              <ItemHeading as="h3">
                签发与标定
              </ItemHeading>
              {activeAction ? (
                <div className="space-y-3 rounded-xl bg-[#F1F1F0]/80 p-3.5 border border-[#E2E2DF]/60">
                  <div>
                    <label
                      htmlFor="action-reason"
                      className="mb-1.5 block text-[12px] font-normal text-[#1F1E1D]"
                    >
                      {ACTION_CONFIG[activeAction].label}原因（可选说明）
                    </label>
                    <input
                      id="action-reason"
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="简短填写原因或沟通事实..."
                      className="w-full rounded-md border border-[#E2E2DF] bg-white shadow-input px-3 py-2 text-[13px] text-[#1F1E1D] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1 bg-white hover:bg-[#EBEBE9] text-[#1F1E1D] text-[13px]"
                      onClick={handleCancelAction}
                      disabled={isSubmitting}
                    >
                      取消
                    </Button>
                    <Button
                      className="flex-1 text-[13px]"
                      onClick={handleConfirmAction}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "保存中..." : "确定记录"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* 主行动：确认已发 */}
                  <Button
                    variant="default"
                    className="w-full h-9 rounded-xl text-[13px]"
                    onClick={() => handleActionClick("confirmed_published")}
                    disabled={dayRecord?.status === "confirmed_published"}
                  >
                    确认{markDateLabel}已发作品 →
                  </Button>

                  {/* 辅助双星行动 */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="secondary"
                      className="h-7 rounded-md bg-white border border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] text-[12px] font-normal shadow-input active:scale-[0.99]"
                      onClick={() => handleActionClick("leave")}
                      disabled={dayRecord?.status === "leave"}
                    >
                      登记请假
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-7 rounded-md bg-white border border-[#E2E2DF] text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] text-[12px] font-normal shadow-input active:scale-[0.99]"
                      onClick={() => handleActionClick("waived")}
                      disabled={dayRecord?.status === "waived"}
                    >
                      特殊豁免
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-7 rounded-md bg-white border border-[#E2E2DF] text-status-danger hover:bg-status-danger/10 text-[12px] font-normal shadow-input active:scale-[0.99]"
                      onClick={() => handleActionClick("absent")}
                      disabled={dayRecord?.status === "absent"}
                    >
                      确认缺勤
                    </Button>
                  </div>

                  {dayRecord && isManualFulfillmentMarkStatus(dayRecord.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-[12px] text-[#78716C] hover:text-status-danger hover:bg-status-danger/10 mt-1"
                      onClick={() => setRemoveConfirmOpen(true)}
                    >
                      <Trash2 className="size-3 mr-1" />
                      清除已标定状态
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
