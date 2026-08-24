"use client";

import { useState } from "react";
import { X, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExemptionCalendar } from "@/lib/dashboard-logic/use-exemption-calendar";
import { getDateStatus } from "@/lib/dashboard-logic/submission-status";

interface ExemptionDialogV2Props {
  isOpen: boolean;
  onClose: () => void;
  today: string;
  submittedDates: string[];
  waiveDates?: string[];
  leaveDates?: string[];
  onSubmit: (dates: string[], type: "waive" | "leave", reason: string) => Promise<void>;
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
  waiveDates = [],
  leaveDates = [],
  onSubmit,
}: ExemptionDialogV2Props) {
  const calendar = useExemptionCalendar({
    today,
    submittedDates,
    waiveDates,
    leaveDates,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 当前月份
  const todayDate = new Date(today);
  const year = todayDate.getFullYear();
  const month = todayDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // 生成日期网格
  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const formatDate = (day: number) => {
    const m = (month + 1).toString().padStart(2, "0");
    const d = day.toString().padStart(2, "0");
    return `${year}-${m}-${d}`;
  };

  const handleSubmit = async () => {
    if (!calendar.isValid) return;

    setIsSubmitting(true);
    try {
      await onSubmit(calendar.selectedDates, calendar.exemptionType, calendar.reason);
      calendar.reset();
      onClose();
    } catch (error) {
      console.error("申请失败", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗 - 左右分栏 */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in-95 duration-150">
        <div
          className="rounded-2xl border border-[#E5E0D6] bg-white"
          style={{
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.02), 0 12px 32px -4px rgba(28,25,23,0.06)",
          }}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-[#ECE7DE]/80 px-6 py-4">
            <h3 className="text-lg font-semibold text-[#1C1917]">
              申请请假或豁免
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#78716C] transition-colors hover:bg-[#F5F3EE] hover:text-[#1C1917]"
            >
              <X size={18} />
            </button>
          </div>

          {/* 左右分栏内容 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* 左侧：日历 */}
            <div className="space-y-4">
              {/* 选择日期标题 */}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[#292524]">选择日期</h4>
                <button
                  type="button"
                  onClick={calendar.selectRecentSevenDays}
                  className="text-sm text-[#D97757] hover:underline"
                >
                  一键全选（七日）
                </button>
              </div>

              {/* 月份标题 */}
              <div className="text-center">
                <p className="text-sm font-medium text-[#1C1917]">
                  {year}年{month + 1}月
                </p>
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
                    submittedDates,
                    waiveDates,
                    leaveDates,
                  });
                  const isSelected = calendar.selectedDates.includes(date);
                  const isAvailable = calendar.availableDates.includes(date);

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => isAvailable && calendar.toggleDate(date)}
                      disabled={!isAvailable}
                      className={cn(
                        "relative h-10 rounded-lg text-[13px] font-medium transition-all duration-150",
                        isSelected &&
                          "bg-[#D97757] text-white ring-2 ring-[#D97757]/20 ring-offset-2",
                        !isSelected && isAvailable &&
                          "bg-[#F5F3EE] text-[#292524] hover:bg-[#E5E0D6]",
                        !isSelected && !isAvailable &&
                          status.status === "submitted" &&
                          "bg-[#6FAA7D]/10 text-[#6FAA7D] cursor-not-allowed",
                        !isSelected && !isAvailable &&
                          status.status === "waived" &&
                          "bg-[#B98A54]/10 text-[#B98A54] cursor-not-allowed",
                        !isSelected && !isAvailable &&
                          status.status === "on_leave" &&
                          "bg-[#43718E]/10 text-[#43718E] cursor-not-allowed",
                        !isSelected && !isAvailable &&
                          status.status === "future" &&
                          "bg-[#F5F3EE] text-[#A8A29E] cursor-not-allowed"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* 图例 */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-[#78716C]">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-[#6FAA7D]" />
                  <span>已交</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-[#B98A54]" />
                  <span>豁免</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-[#43718E]" />
                  <span>请假</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-[#E5E0D6]" />
                  <span>未交</span>
                </div>
              </div>
            </div>

            {/* 右侧：表单 */}
            <div className="space-y-4">
              {/* 申请类型 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#292524]">
                  申请类型 <span className="text-[#C0685C]">●</span>
                </label>
                <div className="inline-flex rounded-lg bg-[#F5F3EE] p-1">
                  <button
                    type="button"
                    onClick={() => calendar.setExemptionType("leave")}
                    className={cn(
                      "rounded-md px-4 py-2 text-sm font-medium transition-all duration-150",
                      calendar.exemptionType === "leave"
                        ? "bg-white text-[#1C1917] shadow-sm"
                        : "text-[#78716C] hover:text-[#292524]"
                    )}
                  >
                    请假（该交不交）
                  </button>
                  <button
                    type="button"
                    onClick={() => calendar.setExemptionType("waive")}
                    className={cn(
                      "rounded-md px-4 py-2 text-sm font-medium transition-all duration-150",
                      calendar.exemptionType === "waive"
                        ? "bg-white text-[#1C1917] shadow-sm"
                        : "text-[#78716C] hover:text-[#292524]"
                    )}
                  >
                    豁免（不该交不交）
                  </button>
                </div>
              </div>

              {/* 已选日期 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#292524]">
                  已选日期
                </label>
                {calendar.selectedDates.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-[#E5E0D6] bg-[#F5F3EE]/30 px-4 py-8 text-center">
                    <p className="text-sm text-[#A8A29E]">
                      点击日历选择需要申请的日期
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {calendar.selectedDates.map((date) => (
                      <div
                        key={date}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#D97757]/10 px-3 py-1.5 text-sm text-[#D97757]"
                      >
                        <span className="tabular-nums">{date}</span>
                        <button
                          type="button"
                          onClick={() => calendar.toggleDate(date)}
                          className="rounded hover:bg-[#D97757]/20"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 申请原因 */}
              <div className="space-y-2">
                <label
                  htmlFor="exemption-reason"
                  className="block text-sm font-medium text-[#292524]"
                >
                  申请原因 <span className="text-[#C0685C]">●</span>
                </label>
                <textarea
                  id="exemption-reason"
                  value={calendar.reason}
                  onChange={(e) => calendar.setReason(e.target.value)}
                  rows={4}
                  maxLength={100}
                  className="w-full resize-none rounded-xl border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-sm text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                  placeholder="简述请假原因，如：病假、事假、外出拍摄等（最多100字）"
                />
                <div className="flex justify-end">
                  <span className="text-[12px] tabular-nums text-[#A8A29E]">
                    {calendar.reason.length}/100
                  </span>
                </div>
              </div>

              {/* 按钮 */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-[#78716C] transition-colors hover:bg-[#F5F3EE] disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !calendar.isValid}
                  className="rounded-lg bg-[#D97757] px-6 py-2 text-sm font-medium text-white transition-all hover:bg-[#C46A4D] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "提交中..." : "提交申请"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
