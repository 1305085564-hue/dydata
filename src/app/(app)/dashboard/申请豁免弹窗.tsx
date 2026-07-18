"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, ShieldAlert } from "lucide-react";
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
  const [localHasPending, setLocalHasPending] = useState(hasPending);
  const [isPending, startTransition] = useTransition();
  const [remindCount, setRemindCount] = useState<number | null>(null);
  const [remindCountLoading, setRemindCountLoading] = useState(false);

  function handleOpen() {
    if (localHasPending) return;
    setSelectedDates(Array.from(new Set(initialSelectedDates.filter(Boolean))).sort());
    setReason("");
    setOpen(true);
  }

  // 弹窗打开时加载催交次数
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemindCount(null);
      return;
    }
    setRemindCountLoading(true);
    fetch(`/api/remind/count?date=${today}`)
      .then((res) => {
        if (!res.ok) throw new Error("加载失败");
        return res.json();
      })
      .then((data) => {
        setRemindCount(typeof data.count === "number" ? data.count : null);
      })
      .catch(() => {
        setRemindCount(null);
      })
      .finally(() => {
        setRemindCountLoading(false);
      });
  }, [open, today]);

  function toggleDate(date: string) {
    setSelectedDates((current) => {
      if (current.includes(date)) {
        return current.filter((item) => item !== date);
      }
      return [...current, date].sort();
    });
  }

  function handleSubmit() {
    if (selectedDates.length === 0) {
      feedbackToast.error("请选择需要申请豁免的日期");
      return;
    }

    if (!reason.trim()) {
      feedbackToast.error("请填写申请原因");
      return;
    }

    const submittedDates = [...selectedDates];
    const submittedReason = reason.trim();

    setLocalHasPending(true);
    setOpen(false);
    feedbackToast.success("申请已提交，等待管理员审批");

    startTransition(async () => {
      const result = await submitExemptionRequest({
        mode: "range",
        category: "waive",
        reason: submittedReason,
        dates: submittedDates,
      });

      if (result.error) {
        setLocalHasPending(false);
        setSelectedDates(submittedDates);
        setReason(submittedReason);
        setOpen(true);
        feedbackToast.error(result.error);
      }
    });
  }

  const resolvedTitle = triggerTitle ?? (localHasPending ? "申请审批中" : "申请豁免");
  const resolvedDescription =
    triggerDescription ?? (localHasPending ? "当前有申请正在等待审批" : "发起免交或请假申请");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={triggerVariant === "card" ? undefined : "sm"}
        disabled={localHasPending}
        onClick={handleOpen}
        title={localHasPending ? "申请审批中" : undefined}
        className={cn(
          triggerVariant === "card"
            ? "dashboard-top-action-button app-shell-metric dashboard-top-action-card !h-full !min-h-[5.25rem] !w-full !items-start !justify-between !whitespace-normal !px-4 !py-4"
 : "h-8 border-stone-200 px-3 text-[12px] font-medium text-stone-700 shadow-sm transition-[background-color, color, box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-stone-300 hover:bg-white active:translate-y-0",
          triggerClassName,
        )}
      >
        {triggerVariant === "card" ? (
          <>
            <div className="dashboard-top-action-card-head">
              <span className="dashboard-top-action-icon">
                <ShieldAlert className="size-4 stroke-[1.5]" />
              </span>
              <div className="dashboard-top-action-title">{resolvedTitle}</div>
            </div>
            <div className="space-y-1">
              <div className="app-shell-metric-hint">{resolvedDescription}</div>
            </div>
          </>
        ) : (
          <>
            <ShieldAlert className="size-4 stroke-[1.5]" />
            {resolvedTitle}
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-0 shadow-xl sm:max-w-4xl">
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle className="text-[18px] font-medium tracking-tight text-stone-700">
              选择豁免日期
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-[13px] leading-[1.7] text-stone-500">
                点击日历上的漏交、未交或未来日期，只会提交你点中的那些日期。
                <br />
                <span className="font-medium text-[#B4532F]">
                  注：不会再自动补成连续区间。
                </span>
              </p>

              <div className="relative overflow-hidden rounded-xl border border-stone-200 bg-stone-50 p-1">
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
                  <p className="text-[13px] font-medium text-stone-700">已选豁免日期</p>
                  {selectedDates.length > 0 ? (
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                      <div className="flex flex-wrap gap-2">
                        {selectedDates.map((date) => (
                          <span
                            key={date}
                            className="inline-flex items-center rounded-full border border-stone-200 bg-white px-3 py-1 text-[12px] font-medium tabular-nums text-stone-700"
                          >
                            {date}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50 text-[13px] text-stone-500">
                      尚未选择任何日期
                    </div>
                  )}
                </div>

                {/* 催交记录提示 */}
                {remindCount !== null && remindCount > 0 && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px]",
                      remindCount > 2
                        ? "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#8F641B]"
                        : "border-stone-200 bg-stone-50 text-stone-500",
                    )}
                  >
                    <Bell className="size-4 shrink-0 stroke-[1.5]" />
                    <span>
                      该日期前后您已被催交{" "}
                      <span className="font-medium tabular-nums">{remindCount}</span>{" "}
                      次
                    </span>
                  </div>
                )}
                {remindCountLoading && (
                  <div className="space-y-2">
                    <div className="h-10 rounded-lg bg-stone-100" />
                    <div className="h-10 rounded-lg bg-stone-100" />
                  </div>
                )}

                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-stone-700">
                    申请原因
                    <span className="inline-block h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
                  </p>
                  <textarea
                    className="h-[120px] w-full resize-none rounded-lg border border-stone-200 bg-white px-4 py-3 text-[13px] leading-[1.7] text-stone-700 shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-stone-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-900/5"
                    maxLength={100}
                    placeholder="请简述豁免原因，如：外出拍摄、周末双休、账号限流等（最多100字）"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <p className="text-right text-[12px] tabular-nums text-stone-500">{reason.length}/100</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isPending} className="h-11 px-6">
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="h-11 bg-[#B4532F] px-8 text-white shadow-sm transition-[background-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:bg-[#A84D2B] active:translate-y-0"
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
