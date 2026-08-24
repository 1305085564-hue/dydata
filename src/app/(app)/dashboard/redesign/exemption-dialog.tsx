"use client";

import { useState } from "react";
import { X, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExemptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  today: string;
  submittedDates: string[];
  onSubmit: (dates: string[], reason: string) => Promise<void>;
}

/**
 * 豁免申请弹窗
 * 支持多选日期、填写理由
 */
export function ExemptionDialog({
  isOpen,
  onClose,
  today,
  submittedDates,
  onSubmit,
}: ExemptionDialogProps) {
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 生成可选日期（本月未提交的日期）
  const availableDates = (() => {
    const dates: string[] = [];
    const todayDate = new Date(today);
    const year = todayDate.getFullYear();
    const month = todayDate.getMonth();

    for (let day = 1; day <= todayDate.getDate(); day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split("T")[0];
      if (!submittedDates.includes(dateStr)) {
        dates.push(dateStr);
      }
    }
    return dates;
  })();

  const toggleDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDates.length === 0 || !reason.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(selectedDates, reason);
      setSelectedDates([]);
      setReason("");
      onClose();
    } catch (error) {
      console.error("豁免申请失败", error);
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

      {/* 弹窗 */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in-95 duration-150">
        <div
          className="rounded-2xl border border-[#E5E0D6] bg-white p-6"
          style={{
            boxShadow:
              "0 1px 3px rgba(0,0,0,0.02), 0 12px 32px -4px rgba(28,25,23,0.06)",
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 头部 */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1C1917]">
                申请豁免
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-[#78716C] transition-colors hover:bg-[#F5F3EE] hover:text-[#1C1917]"
              >
                <X size={18} />
              </button>
            </div>

            {/* 日期选择 */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-[#292524]">
                选择豁免日期
              </label>
              <div className="grid grid-cols-7 gap-2">
                {availableDates.map((date) => {
                  const day = new Date(date).getDate();
                  const isSelected = selectedDates.includes(date);
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => toggleDate(date)}
                      className={cn(
                        "rounded-lg py-2 text-sm font-medium transition-all",
                        isSelected
                          ? "bg-[#D97757] text-white"
                          : "bg-[#F5F3EE] text-[#78716C] hover:bg-[#E5E0D6]"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {availableDates.length === 0 && (
                <p className="text-sm text-[#78716C]">本月所有日期已提交</p>
              )}
            </div>

            {/* 理由输入 */}
            <div className="space-y-2">
              <label
                htmlFor="exemption-reason"
                className="block text-sm font-medium text-[#292524]"
              >
                豁免理由
              </label>
              <textarea
                id="exemption-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl border border-[#E5E0D6] bg-white px-3.5 py-2.5 text-sm text-[#292524] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                placeholder="请说明豁免原因（如：休假、设备故障等）"
                required
              />
            </div>

            {/* 按钮 */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-[#78716C] transition-colors hover:bg-[#F5F3EE]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  selectedDates.length === 0 ||
                  !reason.trim()
                }
                className="rounded-lg bg-[#D97757] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#C46A4D] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "提交中..." : "提交申请"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
