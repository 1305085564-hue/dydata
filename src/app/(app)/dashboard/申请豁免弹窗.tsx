"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
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
  pendingDates?: string[];
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
  pendingDates = [],
  triggerClassName,
  triggerVariant = "button",
  triggerTitle,
  triggerDescription,
  initialSelectedDates = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [category, setCategory] = useState<"leave" | "waive">("leave");
  const [reason, setReason] = useState("");
  const [localHasPending, setLocalHasPending] = useState(hasPending);
  const [extraPendingDates, setExtraPendingDates] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [remindCount, setRemindCount] = useState<number | null>(null);
  const [remindCountLoading, setRemindCountLoading] = useState(false);

  const [dateError, setDateError] = useState("");
  const [reasonError, setReasonError] = useState("");

  // 已在审批中的日期由日历锁定；不影响再次打开申请其他日期
  const resolvedPendingDates = Array.from(
    new Set([...pendingDates, ...extraPendingDates]),
  ).sort();

  function handleOpen() {
    setSelectedDates(
      Array.from(new Set(initialSelectedDates.filter(Boolean))).sort(),
    );
    setCategory("leave");
    setReason("");
    setDateError("");
    setReasonError("");
    setOpen(true);
  }

  // 快捷一键勾选近 7 天所有漏交/未交日期
  function handleSelectAllUnsubmitted() {
    const dates: string[] = [];
    const todayDate = new Date(`${today}T00:00:00`);
    for (let index = 0; index < 7; index += 1) {
      const dateObj = new Date(todayDate);
      dateObj.setDate(dateObj.getDate() - index);
      const year = dateObj.getFullYear();
      const month = `${dateObj.getMonth() + 1}`.padStart(2, "0");
      const day = `${dateObj.getDate()}`.padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;

      if (
        !submittedDates.includes(dateStr) &&
        !waiveDates.includes(dateStr) &&
        !leaveDates.includes(dateStr) &&
        !resolvedPendingDates.includes(dateStr)
      ) {
        dates.push(dateStr);
      }
    }
    const newSelected = Array.from(
      new Set([...selectedDates, ...dates]),
    ).sort();
    setSelectedDates(newSelected);
    if (dateError && newSelected.length > 0) setDateError("");
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
      let next: string[];
      if (current.includes(date)) {
        next = current.filter((item) => item !== date);
      } else {
        next = [...current, date].sort();
      }
      if (dateError && next.length > 0) setDateError("");
      return next;
    });
  }

  function handleSubmit() {
    let hasError = false;
    if (selectedDates.length === 0) {
      setDateError("选一个日期");
      hasError = true;
    } else {
      setDateError("");
    }

    if (!reason.trim()) {
      setReasonError("写一下豁免原因");
      hasError = true;
    } else {
      setReasonError("");
    }

    if (hasError) return;

    const submittedDates = [...selectedDates];
    const submittedReason = reason.trim();
    const submittedCategory = category;

    startTransition(async () => {
      const result = await submitExemptionRequest({
        mode: "range",
        category: submittedCategory,
        reason: submittedReason,
        dates: submittedDates,
      });

      if (result.error) {
        feedbackToast.error(result.error);
      } else {
        setLocalHasPending(true);
        setExtraPendingDates((current) =>
          Array.from(
            new Set([...current, ...(result.submittedDates ?? [])]),
          ).sort(),
        );
        setOpen(false);
      }
    });
  }

  const resolvedTitle =
    triggerTitle ?? (localHasPending ? "申请审批中" : "申请豁免/请假");
  const resolvedDescription =
    triggerDescription ??
    (localHasPending ? "当前有申请正在等待审批" : "发起免交或请假申请");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={triggerVariant === "card" ? undefined : "sm"}
        onClick={handleOpen}
        title={localHasPending ? "有申请审批中，其他日期仍可申请" : undefined}
        className={cn(
          triggerVariant === "card"
            ? "dashboard-top-action-button app-shell-metric dashboard-top-action-card !h-full !min-h-[5.25rem] !w-full !items-start !justify-between !whitespace-normal !px-4 !py-4"
            : "h-8 border-[#E5E0D6] px-3 text-[12px] font-medium text-[#292524] shadow-xs transition-colors duration-100 ease-out hover:border-[#E5E0D6] hover:bg-white active:scale-[0.99] active:duration-120",
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
        <DialogContent className="flex flex-col overflow-hidden rounded-2xl border border-[#E5E0D6] bg-white/98 p-0 shadow-claude-dialog sm:max-w-4xl max-sm:max-w-none max-sm:w-full max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none">
          <DialogHeader className="shrink-0 px-6 pb-2 pt-6">
        <DialogTitle className="text-lg font-medium text-[#1C1917]">
              停笔调养 · 申请请假或豁免
            </DialogTitle>
          </DialogHeader>

          <DialogBody className="grid grid-cols-1 gap-6 px-6 pb-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] leading-[1.7] text-[#78716C]">
                  点击日历点选离散日期（不自动补区间）
                </p>
                <button
                  type="button"
                  onClick={handleSelectAllUnsubmitted}
                  className="group inline-flex items-center gap-1 rounded-md border border-transparent bg-[#D97757]/10 px-2 py-1 text-[11.5px] font-medium text-[#D97757] shadow-2xs transition-colors duration-100 hover:bg-[#F5F3EE] hover:text-[#1C1917] active:scale-[0.99] active:duration-120 cursor-pointer shrink-0"
                >
                  <Zap className="size-3 stroke-[2] text-[#D97757] transition-transform group-hover:scale-110" />
                  一键全选（七日）
                </button>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-[#E5E0D6] bg-white p-3.5 shadow-2xs">
                <SubmissionCalendar
                  today={today}
                  submittedDates={submittedDates}
                  waiveDates={waiveDates}
                  leaveDates={leaveDates}
                  pendingDates={resolvedPendingDates}
                  selectedDates={selectedDates}
                  onDateSelect={(date) => toggleDate(date)}
                  showLegend={true}
                  className="border-none bg-transparent shadow-none"
                />
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-3.5">
                {/* 申请类型单行微型分段切换 (Compact Category Segmented Control) */}
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#292524]">
                    申请类型
                    <span className="inline-block h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
                  </p>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#F5F3EE] p-1 select-none">
                    <button
                      type="button"
                      onClick={() => setCategory("leave")}
                      title="病假/事假/外勤（计入考核天数）"
                      className={cn(
                        "flex h-7 items-center justify-center rounded-md text-xs font-medium transition-colors duration-100 ease-out cursor-pointer",
                        category === "leave"
                          ? "bg-white text-[#1C1917] shadow-sm font-semibold"
                          : "text-[#78716C] hover:text-[#1C1917]",
                      )}
                    >
                      请假（该交不交）
                    </button>
                    <button
                      type="button"
                      onClick={() => setCategory("waive")}
                      title="账号限流/停用/放假（剔除考核分母）"
                      className={cn(
                        "flex h-7 items-center justify-center rounded-md text-xs font-medium transition-colors duration-100 ease-out cursor-pointer",
                        category === "waive"
                          ? "bg-white text-[#1C1917] shadow-sm font-semibold"
                          : "text-[#78716C] hover:text-[#1C1917]",
                      )}
                    >
                      豁免（不该交不交）
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[13px] font-medium text-[#292524]">
                    已选日期
                  </p>
                  {selectedDates.length > 0 ? (
                    <div className="rounded-xl border border-[#E5E0D6] bg-[#FBF9F5] p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {selectedDates.map((date) => (
                          <span
                            key={date}
                            className="inline-flex items-center rounded-full border border-[#E5E0D6] bg-white px-2.5 py-0.5 text-[12px] font-medium tabular-nums text-[#292524] shadow-2xs"
                          >
                            {date}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={cn("flex h-16 items-center justify-center rounded-xl border border-dashed border-[#E5E0D6] bg-[#FBF9F5] text-[12.5px] text-[#78716C]", dateError && "border-[#C0685C]/40 ring-1 ring-[#C0685C]/40")}>
                      尚未选择任何日期
                    </div>
                  )}
                  {dateError && <p className="text-[#C0685C] text-xs mt-1">{dateError}</p>}
                </div>

                {/* 催交记录提示 */}
                {remindCount !== null && remindCount > 0 && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-4 py-3 text-[13px]",
                      remindCount > 2
                        ? "border-[#D99E55]/30 bg-[#D99E55]/5 text-[#D99E55]"
                        : "border-[#E5E0D6] bg-[#FBF9F5] text-[#78716C]",
                    )}
                  >
                    <Bell className="size-4 shrink-0 stroke-[1.5]" />
                    <span>
                      该日期前后您已被催交{" "}
                      <span className="font-medium tabular-nums">
                        {remindCount}
                      </span>{" "}
                      次
                    </span>
                  </div>
                )}
                {remindCountLoading && (
                  <div className="space-y-2">
                    <div className="h-10 rounded-lg bg-[#F5F3EE]" />
                    <div className="h-10 rounded-lg bg-[#F5F3EE]" />
                  </div>
                )}

                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#292524]">
                    申请原因
                    <span className="inline-block h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
                  </p>
                  <textarea
                    className={cn(
                      "h-[100px] w-full resize-none rounded-xl border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3.5 py-2.5 text-[13px] leading-[1.7] text-[#292524] shadow-2xs transition-colors duration-150 ease-out placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0",
                      reasonError && "ring-1 ring-[#C0685C]/40 border-[#C0685C]/40",
                    )}
                    maxLength={100}
                    placeholder={
                      category === "leave"
                        ? "简述请假原因，如：病假、事假、外出拍摄等（最多100字）"
                        : "简述免交原因，如：休假、调休、出差等（最多100字）"
                    }
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      if (reasonError) setReasonError("");
                    }}
                  />
                  {reasonError && <p className="text-[#C0685C] text-xs mt-1">{reasonError}</p>}
                  <p className="text-right text-[12px] tabular-nums text-[#78716C]">
                    {reason.length}/100
                  </p>
                </div>
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="flex-row items-center justify-end gap-3 border-t border-[#ECE7DE]/80 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              size="l"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="h-10 px-5 text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917]"
            >
              取消
            </Button>
            <Button
              type="button"
              size="l"
              onClick={handleSubmit}
              disabled={isPending}
              className="h-10 bg-[#D97757] px-6 font-medium text-white shadow-sm transition-colors duration-100 ease-out hover:bg-[#C46A4D] hover:shadow-md active:scale-[0.99] active:duration-120"
            >
              {isPending ? "提交中..." : "提交申请"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { ExemptionModal as 申请豁免弹窗 };
