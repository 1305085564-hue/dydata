"use client";

import { useEffect, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatShanghaiDateOnlyParts,
  getShanghaiDaysInMonth,
  getShanghaiWeekday,
  mergeSubmittedDates,
  parseShanghaiDateOnly,
  useExemptionCalendar,
} from "@/lib/dashboard-logic/use-exemption-calendar";
import { getDateStatus } from "@/lib/dashboard-logic/submission-status";
import {
  buildExemptionRequestInput,
  type ExemptionDialogSubmit,
  type ExemptionRequestInput,
  type ExemptionRequestResult,
  type LegacyExemptionSubmit,
} from "./exemption-dialog-v2.logic";

interface ExemptionDialogV2Props {
  isOpen: boolean;
  onClose: () => void;
  today: string;
  submittedDates: string[];
  activitySubmittedDates?: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  pendingDates?: string[];
  /** First-batch compatibility bridge; second batch should use onSubmitRequest. */
  onSubmit?: LegacyExemptionSubmit;
  onSubmitRequest?: ExemptionDialogSubmit;
}

/**
 * 豁免申请弹窗 v2 - 对标 Antigravity 设计
 * 左右分栏：左侧日历 + 右侧表单
 */
export function ExemptionDialogV2({
  isOpen,
  onClose,
  today,
  submittedDates,
  activitySubmittedDates = [],
  waiveDates = [],
  leaveDates = [],
  pendingDates = [],
  onSubmit,
  onSubmitRequest,
}: ExemptionDialogV2Props) {
  const allSubmittedDates = mergeSubmittedDates(submittedDates, activitySubmittedDates);
  const calendar = useExemptionCalendar({
    today,
    submittedDates,
    additionalSubmittedDates: activitySubmittedDates,
    waiveDates,
    leaveDates,
    pendingDates,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [remindCount, setRemindCount] = useState<number | null>(null);

  // 当前视图月份（支持翻阅上月）
  const { year: todayYear, month: todayMonthNumber } = parseShanghaiDateOnly(today);
  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonthNumber);

  const canGoNext =
    viewYear < todayYear || (viewYear === todayYear && viewMonth < todayMonthNumber);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const daysInMonth = getShanghaiDaysInMonth(viewYear, viewMonth);
  const firstDayOfMonth = getShanghaiWeekday(viewYear, viewMonth, 1);

  // 生成日期网格
  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const formatDate = (day: number) => {
    return formatShanghaiDateOnlyParts(viewYear, viewMonth, day);
  };

  // 弹窗打开时加载催交次数（业务闭环）
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemindCount(null);
      return;
    }
    fetch(`/api/remind/count?date=${today}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.count === "number") {
          setRemindCount(data.count);
        }
      })
      .catch(() => {
        setRemindCount(null);
      });
  }, [isOpen, today]);

  const handleSubmit = async () => {
    if (!calendar.isValid) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const effectiveReason =
        calendar.exemptionType === "leave"
          ? calendar.reason
          : calendar.selectedDates.length === 1
            ? calendar.dateReasons[calendar.selectedDates[0]] || calendar.reason
            : calendar.dateReasons[calendar.selectedDates[0]] || "特殊豁免申请";

      const request = buildExemptionRequestInput({
        dates: calendar.selectedDates,
        type: calendar.exemptionType,
        reason: effectiveReason,
        dateReasons: calendar.dateReasons,
      });

      // 保留第一批与旧 V2 面板的三参数兼容；第二批接线后直接传 Server Action。
      const result = await invokeExemptionSubmit(onSubmitRequest, onSubmit, request);
      if (result?.error) {
        setSubmitError(result.error);
        return;
      }

      calendar.reset();
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "提交申请失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentMonthPrefix = `${viewYear}-${String(viewMonth).padStart(2, "0")}`;

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="flex flex-col overflow-hidden p-0 sm:max-w-[800px] max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none">
        <DialogHeader className="border-b border-[#ECE7DE]/80 px-6 py-4 pr-12">
          <DialogTitle className="text-lg font-medium text-[#1C1917]">
            停笔调养 · 申请请假或特殊豁免
          </DialogTitle>
        </DialogHeader>

        {/* 左右分栏内容 */}
        <DialogBody className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
          {/* 左侧：日历 */}
          <div className="space-y-4">
            {/* 选择日期标题 */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-[#292524]">选择日期</h4>
              <button
                type="button"
                onClick={calendar.selectRecentSevenDays}
                className="group inline-flex items-center gap-1 rounded-md bg-[#D97757]/10 px-2 py-1 text-[11.5px] font-medium text-[#D97757] transition-colors hover:bg-[#D97757]/20 active:scale-[0.99] active:duration-120 cursor-pointer"
              >
                一键全选（七日）
              </button>
            </div>

            {/* 月份导航切换：直接紧密靠拢年月 */}
            <div className="flex items-center justify-center gap-1.5 py-0.5">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="flex size-7 items-center justify-center rounded-lg text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] active:scale-[0.99] active:duration-120 transition-all cursor-pointer"
                title="上个月"
                aria-label="上个月"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center gap-1.5 px-1">
                <span className="text-sm font-semibold text-[#1C1917] tabular-nums">
                  {viewYear}年{viewMonth}月
                </span>
              </div>

              <button
                type="button"
                disabled={!canGoNext}
                onClick={handleNextMonth}
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg transition-all",
                  canGoNext
                    ? "text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] active:scale-[0.99] active:duration-120 cursor-pointer"
                    : "text-[#D6D3D1] opacity-30 cursor-not-allowed",
                )}
                title="下个月"
                aria-label="下个月"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* 星期标题 */}
            <div className="grid grid-cols-7 gap-1">
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <div
                  key={day}
                  className="py-1 text-center text-[11px] font-medium text-[#78716C]"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* 日期网格 */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} />;
                }

                const date = formatDate(day);
                const status = getDateStatus({
                  date,
                  today,
                  submittedDates: allSubmittedDates,
                  waiveDates,
                  leaveDates,
                  pendingDates,
                });
                const isSelected = calendar.selectedDates.includes(date);
                const isAvailable = calendar.isAvailable
                  ? calendar.isAvailable(date)
                  : calendar.availableDates.includes(date);
                const isToday = date === today;

                const titleText = isSelected
                  ? "已选择此日期"
                  : !isAvailable
                    ? status.status === "pending"
                      ? "申请审批中"
                      : status.status === "submitted"
                        ? "当天已提交数据"
                        : status.status === "waived"
                          ? "当天已豁免"
                          : status.status === "on_leave"
                            ? "当天已请假"
                            : status.status === "future"
                              ? "未来日期"
                              : undefined
                    : isToday
                      ? "今日未提交"
                      : "未提交，可申请豁免或请假";

                return (
                  <button
                    key={day}
                    type="button"
                    title={titleText}
                    onClick={() => isAvailable && calendar.toggleDate(date)}
                    disabled={!isAvailable}
                    className={cn(
                      "relative flex h-10 flex-col items-center justify-center rounded-lg text-[13px] font-medium tabular-nums transition-all duration-150 select-none",
                      // 选中态
                      isSelected &&
                        "bg-[#D97757] text-white ring-2 ring-[#D97757]/20 ring-offset-2 z-10 font-semibold shadow-2xs active:scale-[0.98]",
                      // 今日且可选 (未选态)
                      !isSelected &&
                        isAvailable &&
                        isToday &&
                        "border border-[#D97757]/80 bg-white text-[#D97757] font-semibold hover:bg-[#FAF8F4] active:scale-[0.98] cursor-pointer",
                      // 常规可选未交 (未选态)
                      !isSelected &&
                        isAvailable &&
                        !isToday &&
                        "bg-[#F5F3EE] text-[#292524] hover:bg-[#E5E0D6] active:scale-[0.98] cursor-pointer",
                      // 审批中 (未选态 - 浅灰虚线锁定)
                      !isSelected &&
                        !isAvailable &&
                        status.status === "pending" &&
                        "border border-dashed border-[#E5E0D6] bg-[#FAF8F4] text-[#78716C] font-medium cursor-not-allowed",
                      // 已交 (未选态 - 草木绿，加深色阶与边框)
                      !isSelected &&
                        !isAvailable &&
                        status.status === "submitted" &&
                        "bg-[#6FAA7D]/22 text-[#1E562E] font-semibold border border-[#6FAA7D]/35 cursor-not-allowed",
                      // 已特殊豁免 (未选态 - 金石琥珀，加深色阶与边框，彻底拉开与未交的色差)
                      !isSelected &&
                        !isAvailable &&
                        status.status === "waived" &&
                        "bg-[#B98A54]/22 text-[#7C4A10] font-semibold border border-[#B98A54]/40 cursor-not-allowed",
                      // 请假 (未选态 - 晴岚灰蓝，加深色阶与边框)
                      !isSelected &&
                        !isAvailable &&
                        status.status === "on_leave" &&
                        "bg-[#43718E]/22 text-[#1E4B66] font-semibold border border-[#43718E]/35 cursor-not-allowed",
                      // 未来 (未选态)
                      !isSelected &&
                        !isAvailable &&
                        status.status === "future" &&
                        "bg-[#F5F3EE]/60 text-[#A8A29E] opacity-50 cursor-not-allowed",
                    )}
                  >
                    <span className="leading-none">{day}</span>
                    {isToday && !isSelected && (
                      <span className="absolute bottom-1 size-1 rounded-full bg-[#D97757]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 图例 - 居中排布 */}
            <div className="mt-3.5 flex items-center justify-center gap-4 sm:gap-6 border-t border-[#ECE7DE]/80 pt-3 text-[11.5px] text-[#78716C]">
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-[#5A9B69]" />
                <span>已交</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-[#B98A54]" />
                <span>特殊豁免</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-[#43718E]" />
                <span>请假</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-[#A8A29E]" />
                <span>未交</span>
              </div>
            </div>
          </div>

          {/* 右侧：表单 */}
          <div className="space-y-4">
            {/* 申请类型 */}
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-[13px] font-medium text-[#292524]">
                申请类型
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D97757]" />
              </label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#F5F3EE] p-1 select-none">
                <button
                  type="button"
                  onClick={() => calendar.setExemptionType("leave")}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-xs font-medium transition-all duration-150 cursor-pointer",
                    calendar.exemptionType === "leave"
                      ? "bg-white text-[#1C1917] shadow-sm font-semibold"
                      : "text-[#78716C] hover:text-[#292524]",
                  )}
                >
                  请假（该交不交）
                </button>
                <button
                  type="button"
                  onClick={() => calendar.setExemptionType("waive")}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-xs font-medium transition-all duration-150 cursor-pointer",
                    calendar.exemptionType === "waive"
                      ? "bg-white text-[#1C1917] shadow-sm font-semibold"
                      : "text-[#78716C] hover:text-[#292524]",
                  )}
                >
                  特殊豁免（不该交不交）
                </button>
              </div>
            </div>

            {/* 催交记录提示（发丝边温和 Banner） */}
            {remindCount !== null && remindCount > 0 && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px]",
                  remindCount > 2
                    ? "border-[#D99E55]/30 bg-[#D99E55]/8 text-[#A86F28]"
                    : "border-[#ECE7DE] bg-[#FAF8F4] text-[#78716C]",
                )}
              >
                <Bell className="size-4 shrink-0 stroke-[1.5] text-[#D99E55]" />
                <span>
                  该周期前后您已被催交{" "}
                  <span className="font-semibold tabular-nums text-[#1C1917]">
                    {remindCount}
                  </span>{" "}
                  次
                </span>
              </div>
            )}

            {/* 模式 A：请假 或 单日特殊豁免（保留已选日期胶囊 + 通用原因输入框） */}
            {calendar.exemptionType === "leave" || calendar.selectedDates.length <= 1 ? (
              <>
                {/* 已选日期 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[13px] font-medium text-[#292524]">
                      已选日期
                      {calendar.selectedDates.length > 0 && (
                        <span className="text-[12px] font-normal text-[#78716C]">
                          （共 {calendar.selectedDates.length} 天）
                        </span>
                      )}
                    </label>
                    {calendar.selectedDates.length > 0 && (
                      <button
                        type="button"
                        onClick={calendar.clearSelection}
                        className="text-[12px] text-[#78716C] hover:text-[#C0685C] transition-colors cursor-pointer"
                      >
                        清空全部
                      </button>
                    )}
                  </div>

                  {calendar.selectedDates.length === 0 ? (
                    <p className="text-[12.5px] text-[#A8A29E] py-1">
                      点击左侧日历勾选需要申请的日期
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 py-0.5 max-h-[90px] overflow-y-auto">
                      {calendar.selectedDates.map((date) => {
                        const isCurrentMonth = date.startsWith(currentMonthPrefix);
                        return (
                          <div
                            key={date}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] transition-colors border",
                              isCurrentMonth
                                ? "bg-white border-[#E5E0D6] text-[#D97757] font-medium shadow-2xs"
                                : "bg-[#F5F3EE] border-[#ECE7DE] text-[#78716C] hover:text-[#292524]",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                const parts = parseShanghaiDateOnly(date);
                                setViewYear(parts.year);
                                setViewMonth(parts.month);
                              }}
                              title="在左侧日历中定位该月份"
                              className="tabular-nums hover:underline cursor-pointer"
                            >
                              {date}
                            </button>
                            <button
                              type="button"
                              onClick={() => calendar.toggleDate(date)}
                              className="rounded p-0.5 text-[#A8A29E] hover:bg-[#F5F3EE] hover:text-[#1C1917] cursor-pointer"
                              aria-label={`移除 ${date}`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 申请原因 */}
                <div className="space-y-2">
                  <label
                    htmlFor="exemption-reason"
                    className="flex items-center gap-1.5 text-[13px] font-medium text-[#292524]"
                  >
                    {calendar.exemptionType === "leave" ? "请假原因" : "特殊豁免原因"}
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D97757]" />
                  </label>
                  <textarea
                    id="exemption-reason"
                    value={
                      calendar.exemptionType === "waive" && calendar.selectedDates.length === 1
                        ? calendar.dateReasons[calendar.selectedDates[0]] ?? calendar.reason
                        : calendar.reason
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      calendar.setReason(val);
                      if (calendar.exemptionType === "waive" && calendar.selectedDates.length === 1) {
                        calendar.setDateReason(calendar.selectedDates[0], val);
                      }
                    }}
                    rows={3}
                    maxLength={100}
                    className="w-full resize-none rounded-xl border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-[#292524] shadow-2xs transition-all duration-150 placeholder:text-[#A8A29E] focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                    placeholder={
                      calendar.exemptionType === "leave"
                        ? "简述请假原因，如：病假、事假、外出拍摄等（最多100字）"
                        : "简述特殊豁免原因，如：账号限流、平台维护、排班调休等（最多100字）"
                    }
                  />
                  <div className="flex justify-end">
                    <span className="text-[11.5px] tabular-nums text-[#A8A29E]">
                      {(
                        calendar.exemptionType === "waive" && calendar.selectedDates.length === 1
                          ? calendar.dateReasons[calendar.selectedDates[0]] ?? calendar.reason
                          : calendar.reason
                      ).length}
                      /100
                    </span>
                  </div>
                </div>
              </>
            ) : (
              // 模式 B：特殊豁免多天逐日录入（纸内纯排版 · 零套盒 · 零重复标签）
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[13px] font-medium text-[#292524]">
                    特殊豁免逐日原因
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D97757]" />
                    <span className="text-[12px] font-normal text-[#78716C]">
                      （共 {calendar.selectedDates.length} 天）
                    </span>
                  </label>
                  <div className="flex items-center gap-2.5">
                    {calendar.dateReasons[calendar.selectedDates[0]]?.trim() && (
                      <button
                        type="button"
                        onClick={calendar.copyFirstDateReasonToAll}
                        className="text-[11.5px] text-[#D97757] hover:underline cursor-pointer font-medium"
                        title="将首日填写的豁免原因快速填充到所有已选天（可分别微调）"
                      >
                        一键同首日
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={calendar.clearSelection}
                      className="text-[11.5px] text-[#78716C] hover:text-[#C0685C] transition-colors cursor-pointer"
                    >
                      清空全部
                    </button>
                  </div>
                </div>

                <div className="max-h-[260px] overflow-y-auto space-y-2 pr-0.5">
                  {calendar.selectedDates.map((dateStr) => {
                    const currentReason = calendar.dateReasons[dateStr] || "";
                    const isCurrentMonth = dateStr.startsWith(currentMonthPrefix);
                    return (
                      <div
                        key={dateStr}
                        className="flex items-center gap-2.5 py-1 border-b border-[#ECE7DE]/50 last:border-none"
                      >
                        <div className="flex items-center gap-1.5 shrink-0 w-[108px]">
                          <button
                            type="button"
                            onClick={() => {
                              const parts = parseShanghaiDateOnly(dateStr);
                              setViewYear(parts.year);
                              setViewMonth(parts.month);
                            }}
                            title="在左侧日历中定位该月份"
                            className={cn(
                              "text-xs font-semibold tabular-nums hover:underline cursor-pointer",
                              isCurrentMonth ? "text-[#1C1917]" : "text-[#78716C]",
                            )}
                          >
                            {dateStr}
                          </button>
                          <button
                            type="button"
                            onClick={() => calendar.toggleDate(dateStr)}
                            className="rounded p-0.5 text-[#A8A29E] hover:bg-[#F5F3EE] hover:text-[#C0685C] transition-colors cursor-pointer"
                            aria-label={`移除 ${dateStr}`}
                            title="移除此日"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <input
                          type="text"
                          maxLength={100}
                          value={currentReason}
                          onChange={(e) =>
                            calendar.setDateReason(dateStr, e.target.value)
                          }
                          placeholder={`简述 ${dateStr} 的特殊豁免具体原因`}
                          className="w-full h-7 rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-2 text-xs text-[#292524] shadow-2xs transition-all duration-150 placeholder:text-[#A8A29E] focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {submitError ? (
              <p role="alert" className="text-xs text-[#C0685C]">
                {submitError}
              </p>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter className="flex-row items-center justify-end gap-2.5 border-t border-[#ECE7DE]/80 px-6 py-3.5">
          <Button
            type="button"
            variant="secondary"
            size="m"
            onClick={onClose}
            disabled={isSubmitting}
            className="cursor-pointer"
          >
            取消
          </Button>
          <Button
            type="button"
            size="m"
            onClick={handleSubmit}
            disabled={isSubmitting || !calendar.isValid}
            className="cursor-pointer"
          >
            {isSubmitting ? "提交中..." : "提交申请"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function invokeExemptionSubmit(
  onSubmitRequest: ExemptionDialogSubmit | undefined,
  onSubmit: LegacyExemptionSubmit | undefined,
  request: ExemptionRequestInput,
): Promise<ExemptionRequestResult | void> {
  if (onSubmitRequest) {
    return onSubmitRequest(request);
  }

  if (onSubmit) {
    return (onSubmit as LegacyExemptionSubmit)(
      request.dates,
      request.category,
      request.reason,
    );
  }

  return { error: "提交入口未接入，请稍后重试" };
}
