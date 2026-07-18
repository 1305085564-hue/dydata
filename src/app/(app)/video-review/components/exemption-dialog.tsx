"use client";

import { useState } from "react";
import { CalendarDays, Loader2, Archive } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { trackUsageEvent } from "@/lib/usage-events/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EXEMPTION_TYPES = [
  { value: "personal_leave", label: "事假" },
  { value: "sick_leave", label: "病假" },
  { value: "annual_leave", label: "年假" },
  { value: "business_trip", label: "出差" },
  { value: "other", label: "其他" },
] as const;

type ExemptionType = (typeof EXEMPTION_TYPES)[number]["value"];

interface ExemptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todayDate: string;
  onSubmitSuccess: () => void;
}

export function ExemptionDialog({
  open,
  onOpenChange,
  todayDate,
  onSubmitSuccess,
}: ExemptionDialogProps) {
  const [exemptionType, setExemptionType] = useState<ExemptionType>("personal_leave");
  const [startDate, setStartDate] = useState(todayDate);
  const [endDate, setEndDate] = useState(todayDate);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      toast.error("请填写申请原因");
      return;
    }
    if (endDate < startDate) {
      toast.error("结束日期不能早于开始日期");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/exemptions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exemption_type: exemptionType,
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim(),
        }),
      });
      const result = await res.json();

      if (res.ok) {
        trackUsageEvent({ path: "/video-review/exemption", eventType: "apply_exemption" });
        toast.success("申请已提交", {
          description: "管理员审批后将通知您结果",
        });
        setReason("");
        setExemptionType("personal_leave");
        setStartDate(todayDate);
        setEndDate(todayDate);
        onSubmitSuccess();
        onOpenChange(false);
      } else {
        toast.error("申请失败", {
          description: result.error || "服务接口出错",
        });
      }
    } catch {
      toast.error("申请失败", { description: "网络连接失败，请重试" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white p-0 rounded-2xl overflow-hidden"
        style={{ maxWidth: "520px" }}
      >
        <DialogHeader className="px-7 pt-6 pb-4 border-b border-stone-100">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-[18px] font-medium text-stone-900 flex items-center gap-2">
                <CalendarDays className="size-5 text-[#B4532F]" />
                申请产量豁免
              </DialogTitle>
              <p className="mt-1 text-[13px] text-stone-500 leading-[1.6]">
                如因请假、出差等原因无法完成当日产量，可申请豁免。审批通过后当日状态转为绿灯。
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-7 py-3 bg-amber-50 border-y border-amber-100">
          <div className="flex items-start gap-2">
            <Archive className="size-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-medium text-amber-800">本功能已归档</p>
              <p className="text-[12px] text-amber-700/80 leading-[1.6]">
                产量豁免申请已暂停受理，原有记录仍可在管理后台查看，数据不会丢失。
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="px-7 py-5 space-y-4">
          {/* 豁免类型 */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-stone-700">豁免类型</label>
            <div className="flex flex-wrap gap-2">
              {EXEMPTION_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  disabled
                  className={cn(
                    "h-8 rounded-lg border px-3 text-[12px] font-medium transition-all opacity-60 cursor-not-allowed",
                    exemptionType === type.value
                      ? "border-stone-300 bg-stone-100 text-stone-500"
                      : "border-stone-200 text-stone-400 bg-stone-50"
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* 日期区间 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-stone-700">开始日期</label>
              <input
                type="date"
                value={startDate}
                disabled
                className="w-full h-9 rounded-lg border border-stone-200 bg-stone-100 px-3 text-[13px] text-stone-500 cursor-not-allowed transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-stone-700">结束日期</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                disabled
                className="w-full h-9 rounded-lg border border-stone-200 bg-stone-100 px-3 text-[13px] text-stone-500 cursor-not-allowed transition-all"
              />
            </div>
          </div>

          {/* 申请原因 */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-stone-700">申请原因</label>
            <textarea
              value={reason}
              disabled
              rows={3}
              placeholder="本功能已归档，暂不受理新的豁免申请"
              className="w-full resize-none rounded-lg border border-stone-200 bg-stone-100 px-4 py-3 text-[13px] leading-[1.7] text-stone-500 placeholder:text-stone-400 cursor-not-allowed transition-all"
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="h-9 rounded-lg border border-stone-200 px-4 text-[13px] font-medium text-stone-500 hover:bg-stone-50 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled
              title="本功能已归档，暂不受理新的豁免申请"
              className="flex h-9 items-center gap-2 rounded-lg bg-stone-300 px-5 text-[13px] font-medium text-white cursor-not-allowed transition-all"
            >
              提交申请
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
