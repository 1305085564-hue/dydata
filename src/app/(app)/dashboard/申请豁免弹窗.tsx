"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { submitExemptionRequest } from "./actions";
import { SubmissionCalendar } from "@/components/submission/submission-calendar";

interface Props {
  hasPending: boolean;
  today: string;
  submittedDates: string[];
}

function ExemptionModal({ hasPending, today, submittedDates }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    if (hasPending) return;
    setSelectedDates([]);
    setReason("");
    setOpen(true);
  }

  function toggleDate(date: string) {
    setSelectedDates(current => {
      if (current.includes(date)) {
        return current.filter(d => d !== date);
      }
      return [...current, date].sort();
    });
  }

  const { startDate, endDate } = useMemo(() => {
    if (selectedDates.length === 0) return { startDate: "", endDate: "" };
    return {
      startDate: selectedDates[0],
      endDate: selectedDates[selectedDates.length - 1]
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
        reason: reason.trim(), 
        startDate, 
        endDate 
      });
      if (result.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("申请已提交，等待管理员审批");
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={hasPending}
        onClick={handleOpen}
        title={hasPending ? "申请审批中" : undefined}
        className="h-8 px-3 text-xs font-medium border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 shadow-sm transition-all"
      >
        {hasPending ? "申请审批中" : "申请豁免"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl rounded-[1.75rem] border-none bg-white/95 p-0 shadow-[0_20px_60px_rgba(0,0,0,0.15)] backdrop-blur-xl">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">选择豁免日期</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                点击日历上的漏交、未交或未来日期，直接将其加入豁免申请区间。<br/>
                <span className="font-semibold text-[var(--color-primary)]">注：跨天选择会自动形成连续的豁免区间。</span>
              </p>
              
              <div className="relative overflow-hidden rounded-[1.5rem] bg-slate-50/50 p-1 ring-1 ring-black/5">
                <SubmissionCalendar
                  today={today}
                  submittedDates={submittedDates}
                  selectedDates={selectedDates}
                  onDateSelect={(date) => toggleDate(date)}
                  className="border-none shadow-none bg-transparent"
                  compact
                />
              </div>
            </div>

            <div className="flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    已选豁免区间
                  </p>
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
                    className="h-[120px] w-full rounded-[1rem] border border-black/10 bg-white px-4 py-3 text-sm placeholder:text-muted-foreground shadow-sm transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 resize-none"
                    maxLength={100}
                    placeholder="请简述豁免原因，如：外出拍摄、周末双休、账号限流等（最多100字）"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground text-right">{reason.length}/100</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending} className="h-11 rounded-[12px] px-6">
                  取消
                </Button>
                <Button onClick={handleSubmit} disabled={isPending} className="h-11 rounded-[12px] bg-primary px-8 text-white hover:bg-primary/90 shadow-[0_8px_16px_-6px_rgba(0,122,255,0.4)] transition-all active:scale-[0.98]">
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
