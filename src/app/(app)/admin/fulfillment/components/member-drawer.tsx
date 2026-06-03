"use client";

import { useCallback, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import type { FulfillmentMemberSummary, FulfillmentStatus } from "@/types/fulfillment";
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

type Source = "queue" | "matrix";

type MarkAction = Extract<FulfillmentStatus, "leave" | "waived" | "absent" | "confirmed_published">;

interface MemberDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: FulfillmentMemberSummary | null;
  date: string | null;
  source: Source;
  onActionComplete: () => void;
}

interface ActionConfig {
  label: string;
  variant: "default" | "outline" | "destructive";
  colorClass?: string;
}

const ACTION_CONFIG: Record<MarkAction, ActionConfig> = {
  leave: { label: "标记请假", variant: "outline", colorClass: "text-[#8AA8C7] border-[#8AA8C7]/30 hover:bg-[#8AA8C7]/5" },
  waived: { label: "标记豁免", variant: "outline", colorClass: "text-[#8AA8C7] border-[#8AA8C7]/30 hover:bg-[#8AA8C7]/5" },
  absent: { label: "确认缺勤", variant: "destructive" },
  confirmed_published: { label: "确认已发", variant: "default" },
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; dot: string; border: string; bg: string }> = {
    published: { label: "已发布", dot: "bg-[#6FAA7D]", border: "border-[#6FAA7D]/20", bg: "bg-[#6FAA7D]/[0.04]" },
    confirmed_published: { label: "已确认", dot: "bg-[#6FAA7D]", border: "border-[#6FAA7D]/20", bg: "bg-[#6FAA7D]/[0.04]" },
    leave: { label: "请假", dot: "bg-[#8AA8C7]", border: "border-[#8AA8C7]/20", bg: "bg-[#8AA8C7]/[0.04]" },
    waived: { label: "豁免", dot: "bg-[#8AA8C7]", border: "border-[#8AA8C7]/20", bg: "bg-[#8AA8C7]/[0.04]" },
    exempted: { label: "豁免期", dot: "bg-[#8AA8C7]/50", border: "border-[#8AA8C7]/15", bg: "bg-[#8AA8C7]/[0.03]" },
    absent: { label: "缺勤", dot: "bg-[#C9604D]", border: "border-[#C9604D]/20", bg: "bg-[#C9604D]/[0.04]" },
    unconfirmed: { label: "待确认", dot: "bg-zinc-300", border: "border-zinc-200", bg: "bg-zinc-100" },
  };
  const c = config[status] ?? config.unconfirmed;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] font-medium ${c.border} ${c.bg} text-zinc-700`}>
      <span className={`size-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function MemberDrawer({ open, onOpenChange, member, date, onActionComplete }: MemberDrawerProps) {
  const [activeAction, setActiveAction] = useState<MarkAction | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(date);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // 同步外部 date 到内部 selectedDate
  const effectiveDate = selectedDate ?? date;

  const dayRecord = member && effectiveDate ? member.days[effectiveDate] : null;

  // 历史时间线：按日期倒序
  const historyDates = useMemo(() => {
    if (!member) return [];
    return Object.keys(member.days).sort().reverse();
  }, [member]);

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
        alert(err.error || "标记失败");
        return;
      }
      setActiveAction(null);
      setReason("");
      onOpenChange(false);
      onActionComplete();
    } finally {
      setIsSubmitting(false);
    }
  }, [member, effectiveDate, activeAction, reason, onOpenChange, onActionComplete]);

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
        alert(err.error || "删除标记失败");
        return;
      }
      setRemoveConfirmOpen(false);
      onOpenChange(false);
      onActionComplete();
    } finally {
      setIsRemoving(false);
    }
  }, [member, effectiveDate, onOpenChange, onActionComplete]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setActiveAction(null);
        setReason("");
        setSelectedDate(null);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  const handleDateSelect = useCallback((d: string) => {
    setSelectedDate(d);
    setActiveAction(null);
    setReason("");
  }, []);

  if (!member) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-[480px]">
          <SheetHeader>
            <SheetTitle>成员详情</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <p className="text-[13px] text-zinc-500">未选择成员</p>
          </SheetBody>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-[480px]">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <SheetTitle>{member.userName}</SheetTitle>
              {dayRecord ? <StatusBadge status={dayRecord.status} /> : null}
            </div>
            <SheetDescription>
              {member.teamName ?? "无团队"}
              {member.groupName ? ` · ${member.groupName}` : ""}
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-6">
            {/* 当前时间段统计 */}
            <section>
              <h3 className="mb-3 text-[12px] font-medium uppercase tracking-[0.15em] text-zinc-400">
                当前统计
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
                  <p className="text-[12px] text-zinc-400">应发天数</p>
                  <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-zinc-800">
                    {member.totalDays}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
                  <p className="text-[12px] text-zinc-400">实发天数</p>
                  <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#6FAA7D]">
                    {member.publishedDays}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
                  <p className="text-[12px] text-zinc-400">发布率</p>
                  <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-zinc-800">
                    {member.fulfillmentRate}%
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
                  <p className="text-[12px] text-zinc-400">请假</p>
                  <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#8AA8C7]">
                    {member.leaveDays}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
                  <p className="text-[12px] text-zinc-400">豁免</p>
                  <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#8AA8C7]">
                    {member.waivedDays}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
                  <p className="text-[12px] text-zinc-400">缺勤</p>
                  <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-[#C9604D]">
                    {member.absentDays}
                  </p>
                </div>
              </div>
            </section>

            {/* 连续未发 */}
            {member.consecutiveMissing > 0 && (
              <section className="rounded-xl border border-[#C9604D]/15 bg-[#C9604D]/[0.03] p-3">
                <div className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-[#C9604D]" />
                  <span className="text-[13px] font-medium text-zinc-700">
                    连续未发 {member.consecutiveMissing} 天
                  </span>
                </div>
              </section>
            )}

            {/* 历史时间线 */}
            <section>
              <h3 className="mb-3 text-[12px] font-medium uppercase tracking-[0.15em] text-zinc-400">
                历史记录
              </h3>
              <div className="max-h-[280px] overflow-y-auto rounded-xl border border-zinc-200">
                {historyDates.length === 0 ? (
                  <p className="p-4 text-[13px] text-zinc-400">暂无历史记录</p>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {historyDates.map((d) => {
                      const record = member.days[d];
                      const isSelected = d === effectiveDate;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleDateSelect(d)}
                          className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors duration-150 ${
                            isSelected ? "bg-zinc-50" : "hover:bg-zinc-50/50"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`font-mono text-[12px] tabular-nums ${isSelected ? "font-medium text-zinc-800" : "text-zinc-500"}`}>
                              {d.slice(5)}
                            </span>
                            <StatusBadge status={record.status} />
                          </div>
                          <div className="flex items-center gap-2">
                            {record.reason ? (
                              <span className="max-w-[120px] truncate text-[11px] text-zinc-400" title={record.reason}>
                                {record.reason}
                              </span>
                            ) : null}
                            {record.markedByName ? (
                              <span className="text-[11px] text-zinc-400">
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

            {/* 当日/选中日状态 */}
            <section>
              <h3 className="mb-3 text-[12px] font-medium uppercase tracking-[0.15em] text-zinc-400">
                {effectiveDate === date ? "当日状态" : `${effectiveDate?.slice(5)} 状态`}
              </h3>
              <div className="space-y-2">
                {dayRecord ? (
                  <>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-zinc-500">发布数量</span>
                      <span className="font-mono tabular-nums font-medium text-zinc-800">
                        {dayRecord.publishedCount} 条
                      </span>
                    </div>
                    {dayRecord.reason ? (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
                        <p className="text-[12px] text-zinc-400">原因</p>
                        <p className="mt-1 text-[13px] text-zinc-700">{dayRecord.reason}</p>
                      </div>
                    ) : null}
                    {dayRecord.markedByName ? (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-zinc-500">标记人</span>
                        <span className="text-zinc-700">{dayRecord.markedByName}</span>
                      </div>
                    ) : null}
                    {dayRecord.markedAt ? (
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="text-zinc-500">标记时间</span>
                        <span className="text-zinc-700">{dayRecord.markedAt}</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-[13px] text-zinc-500">当日无记录</p>
                )}
              </div>
            </section>

            {/* 操作区 */}
            <section>
              <h3 className="mb-3 text-[12px] font-medium uppercase tracking-[0.15em] text-zinc-400">
                操作
              </h3>
              {activeAction ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
                    <label className="mb-1.5 block text-[12px] font-medium text-zinc-500">
                      {ACTION_CONFIG[activeAction].label}原因（可选）
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="请输入原因..."
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-950/5"
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
                    {(Object.entries(ACTION_CONFIG) as [MarkAction, (typeof ACTION_CONFIG)[MarkAction]][]).map(
                      ([action, config]) => (
                        <Button
                          key={action}
                          variant={config.variant}
                          className={config.colorClass}
                          onClick={() => handleActionClick(action)}
                          disabled={dayRecord?.status === action}
                        >
                          {config.label}
                        </Button>
                      ),
                    )}
                  </div>
                  {dayRecord && dayRecord.status !== "published" && dayRecord.status !== "exempted" && dayRecord.status !== "unconfirmed" && (
                    <Button
                      variant="outline"
                      className="w-full text-[#C9604D] border-[#C9604D]/30 hover:bg-[#C9604D]/5"
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
