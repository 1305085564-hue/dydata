"use client";

import { useMemo, useState, useTransition } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { SubmissionCalendar } from "@/components/submission/submission-calendar";
import { cn } from "@/lib/utils";
import { submitExemptionRequest } from "./actions";

interface Props {
  hasPending: boolean;
  today: string;
  submittedDates: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  triggerClassName?: string;
  triggerVariant?: "button" | "card";
  triggerTitle?: string;
  triggerDescription?: string;
  initialSelectedDates?: string[];
}

function ExemptionModal({
  hasPending,
  today,
  submittedDates,
  waiveDates = [],
  leaveDates = [],
  triggerClassName,
  triggerVariant = "button",
  triggerTitle,
  triggerDescription,
  initialSelectedDates = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    if (hasPending) return;
    setSelectedDates(
      Array.from(new Set(initialSelectedDates.filter(Boolean))).sort(),
    );
    setReason("");
    setOpen(true);
  }

  function toggleDate(date: string) {
    setSelectedDates((current) => {
      if (current.includes(date)) {
        return current.filter((item) => item !== date);
      }
      return [...current, date].sort();
    });
  }

  const { startDate, endDate } = useMemo(() => {
    if (selectedDates.length === 0) return { startDate: "", endDate: "" };
    return {
      startDate: selectedDates[0],
      endDate: selectedDates[selectedDates.length - 1],
    };
  }, [selectedDates]);

  function handleSubmit() {
    if (selectedDates.length === 0) {
      feedbackToast.error("请在日历上点击选择需要豁免的日期");
      return;
    }

    if (!reason.trim()) {
      feedbackToast.error("请填写申请原因");
      return;
    }

    startTransition(async () => {
      const result = await submitExemptionRequest({
        mode: "range",
        category: "waive",
        reason: reason.trim(),
        startDate,
        endDate,
      });

      if (result.error) {
        feedbackToast.error(result.error);
        return;
      }

      feedbackToast.success("申请已提交，等待管理员审批");
      setOpen(false);
    });
  }

  const resolvedTitle = triggerTitle ?? (hasPending ? "申请审批中" : "申请豁免");
  const resolvedDescription =
    triggerDescription ?? (hasPending ? "当前有申请正在等待审批" : "发起免交或请假申请");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={triggerVariant === "card" ? undefined : "sm"}
        disabled={hasPending}
        onClick={handleOpen}
        title={hasPending ? "申请审批中" : undefined}
        className={cn(
          triggerVariant === "card"
            ? "dashboard-top-action-button app-shell-metric dashboard-top-action-card !h-full !min-h-[5.25rem] !w-full !items-start !justify-between !whitespace-normal !px-4 !py-4"
            : "h-8 border-primary/20 px-3 text-xs font-medium text-primary shadow-sm transition-all hover:border-primary/40 hover:bg-primary/5",
          triggerClassName,
        )}
      >
        {triggerVariant === "card" ? (
          <>
            <div className="dashboard-top-action-card-head">
              <span className="dashboard-top-action-icon">
                <ShieldAlert className="size-4" />
              </span>
              <div className="dashboard-top-action-title">{resolvedTitle}</div>
            </div>
            <div className="space-y-1">
              <div className="app-shell-metric-hint">{resolvedDescription}</div>
            </div>
          </>
        ) : (
          <>
            <ShieldAlert className="size-4" />
            {resolvedTitle}
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[1.75rem] border-none bg-white/95 p-0 shadow-[0_20px_60px_rgba(0,0,0,0.15)] backdrop-blur-xl sm:max-w-4xl">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">
              选择豁免日期
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                点击日历上的漏交、未交或未来日期，直接将其加入豁免申请区间。
                <br />
                <span className="font-semibold text-[var(--color-primary)]">
                  注：跨天选择会自动形成连续的豁免区间。
                </span>
              </p>

              <div className="relative overflow-hidden rounded-[1.5rem] bg-slate-50/50 p-1 ring-1 ring-black/5">
                <SubmissionCalendar
                  today={today}
                  submittedDates={submittedDates}
                  waiveDates={waiveDates}
                  leaveDates={leaveDates}
                  selectedDates={selectedDates}
                  onDateSelect={(date) => toggleDate(date)}
                  className="border-none bg-transparent shadow-none"
                  compact
                />
              </div>
            </div>

            <div className="flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">已选豁免区间</p>
                  {selectedDates.length > 0 ? (
                    <div className="flex flex-col gap-2 rounded-[1rem] bg-primary/5 p-4 ring-1 ring-primary/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-primary">开始日期</span>
                        <span className="text-sm font-bold text-primary">{startDate}</span>
                      </div>
                      <div className="h-px bg-primary/10" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-primary">结束日期</span>
                        <span className="text-sm font-bold text-primary">{endDate}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-[1rem] border border-dashed border-black/10 bg-slate-50 text-sm text-[var(--color-text-secondary)]">
                      尚未选择任何日期
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    申请原因 <span className="text-rose-500">*</span>
                  </p>
                  <textarea
                    className="h-[120px] w-full resize-none rounded-[1rem] border border-black/10 bg-white px-4 py-3 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10"
                    maxLength={100}
                    placeholder="请简述豁免原因，如：外出拍摄、周末双休、账号限流等（最多100字）"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <p className="text-right text-xs text-muted-foreground">{reason.length}/100</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending} className="h-11 rounded-[12px] px-6">
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="h-11 rounded-[12px] bg-primary px-8 text-white shadow-[0_8px_16px_-6px_rgba(0,122,255,0.4)] transition-all hover:bg-primary/90 active:scale-[0.98]"
                >
                  {isPending ? "提交中..." : "提交申请"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { ExemptionModal as 申请豁免弹窗 };
