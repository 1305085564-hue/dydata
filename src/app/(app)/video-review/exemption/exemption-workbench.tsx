"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  FileText, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Loader2,
  CalendarDays
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ExemptionRequest {
  id: string;
  exemption_type: string;
  start_date: string;
  end_date: string | null;
  reason: string;
  request_status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
}

interface ExemptionWorkbenchProps {
  initialHistory: ExemptionRequest[];
  todayDate: string;
}

const EXEMPTION_LABELS: Record<string, string> = {
  single: "请假1天 (今天)",
  yesterday: "补昨日请假",
  "3days": "请假3天",
  "4days": "请假4天",
  "5days": "请假5天",
  range: "自定义多天范围",
  permanent: "永久豁免",
};

export function ExemptionWorkbench({
  initialHistory,
  todayDate,
}: ExemptionWorkbenchProps) {
  const router = useRouter();
  const [history, setHistory] = useState<ExemptionRequest[]>(initialHistory);

  // Form State
  const [exemptionType, setExemptionType] = useState<string>("single");
  const [startDate, setStartDate] = useState(todayDate);
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Helper to compute end date based on type and start date
  const getComputedDates = () => {
    if (exemptionType === "yesterday") {
      const yesterday = new Date(todayDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      return { start: yStr, end: yStr };
    }
    
    if (exemptionType === "single") {
      return { start: startDate, end: startDate };
    }

    if (exemptionType === "permanent") {
      return { start: startDate, end: null };
    }

    if (exemptionType === "range") {
      return { start: startDate, end: endDate || null };
    }

    // "3days", "4days", "5days"
    const days = parseInt(exemptionType.slice(0, 1), 10);
    if (isNaN(days)) return { start: startDate, end: startDate };

    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + (days - 1));
    return {
      start: startDate,
      end: end.toISOString().slice(0, 10),
    };
  };

  const { start: computedStart, end: computedEnd } = getComputedDates();

  const refreshHistory = async () => {
    try {
      const res = await fetch("/api/exemptions");
      const result = await res.json();
      if (result.data) {
        setHistory(result.data);
      }
    } catch (err) {
      console.error("Failed to refresh exemptions:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      toast.error("无法提交", {
        description: "请填写申请原因说明",
      });
      return;
    }

    if (exemptionType === "range" && !endDate) {
      toast.error("无法提交", {
        description: "自定义范围需要选择结束日期",
      });
      return;
    }

    setSubmitting(true);

    const payload = {
      exemption_type: exemptionType,
      start_date: computedStart,
      end_date: computedEnd,
      reason: reason.trim(),
    };

    try {
      const res = await fetch("/api/exemptions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (res.ok) {
        toast.success("申请提交成功", {
          description: "已提交豁免申请，等待管理员审批",
        });
        setReason("");
        setEndDate("");
        await refreshHistory();
      } else {
        toast.error("申请失败", {
          description: result.error || "服务接口出错",
        });
      }
    } catch (err) {
      toast.error("提交失败", {
        description: "网络连接失败，请重试",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* 左侧：申请表单 (U1) */}
      <div className="lg:col-span-1 rounded-2xl border border-stone-200 bg-white p-6 space-y-5 h-fit">
        <h2 className="text-[18px] font-medium text-stone-900">
          新建豁免申请
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 豁免类型 */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-stone-500">
              申请类型
            </label>
            <select
              value={exemptionType}
              onChange={(e) => setExemptionType(e.target.value)}
              className="w-full h-10 rounded-lg bg-stone-50 border border-stone-200 px-3 text-[13px] font-medium text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
            >
              {Object.entries(EXEMPTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* 开始日期 (除昨天外，其他都可以选开始日期) */}
          {exemptionType !== "yesterday" && (
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-stone-500">
                开始日期
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 rounded-lg bg-stone-50 border border-stone-200 px-4 text-[13px] text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
              />
            </div>
          )}

          {/* 自定义结束日期 */}
          {exemptionType === "range" && (
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-stone-500">
                结束日期
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 rounded-lg bg-stone-50 border border-stone-200 px-4 text-[13px] text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
              />
            </div>
          )}

          {/* 生效时间概览预览 (微反馈) */}
          <div className="rounded-lg bg-stone-50 p-3 text-[12px] text-stone-500 space-y-1">
            <div className="flex justify-between">
              <span>生效开始:</span>
              <span className="text-stone-700">{computedStart}</span>
            </div>
            <div className="flex justify-between">
              <span>生效结束:</span>
              <span className="text-stone-700">
                {computedEnd || (exemptionType === "permanent" ? "永久" : computedStart)}
              </span>
            </div>
          </div>

          {/* 申请原因说明 */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-stone-500">
              申请原因说明
            </label>
            <textarea
              id="exemption-reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请输入具体的请假、故障或限流原因，便于管理员审批..."
              rows={4}
              className="w-full rounded-lg bg-stone-50 border border-stone-200 p-4 text-[13px] text-stone-700 placeholder:text-stone-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
            />
          </div>

          {/* 提交按钮 (唯一主 CTA `#D97757`) */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 flex items-center justify-center gap-1.5 rounded-xl bg-[#D97757] text-white text-[13px] font-medium transition hover:bg-[#C96442] active:translate-y-0 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                正在提交申请...
              </>
            ) : (
              "提交申请"
            )}
          </button>
        </form>
      </div>

      {/* 右侧：申请历史列表 (U2) */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="text-[18px] font-medium text-stone-900">
            我的申请历史
          </h3>
          <span className="text-[12px] tabular-nums text-stone-500">
            共 {history.length} 条记录
          </span>
        </div>

        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-white py-12 flex flex-col items-center justify-center text-center">
            <FileText className="size-10 text-stone-500 mb-3" />
            <p className="text-[13px] text-stone-500 mb-4">暂无历史申请记录</p>
            <button
              type="button"
              onClick={() => {
                document.getElementById("exemption-reason-input")?.focus();
              }}
              className="h-9 px-4 rounded-lg bg-[#D97757] text-[13px] font-medium text-white hover:bg-[#C96442] active:scale-95 transition-all"
            >
              新建申请记录
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {history.map((req, idx) => {
              const isLast = idx === history.length - 1;
              const dateText = req.end_date && req.end_date !== req.start_date
                ? `${req.start_date} ~ ${req.end_date}`
                : req.start_date;

              return (
                <div
                  key={req.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-4 transition-colors hover:bg-stone-50/50",
                    !isLast && "border-b border-stone-100"
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-stone-700">
                        {EXEMPTION_LABELS[req.exemption_type] || req.exemption_type}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[12px] text-stone-500 ">
                        <CalendarDays className="size-3" />
                        {dateText}
                      </span>
                    </div>
                    <p className="text-[13px] text-stone-500 leading-[1.6]">
                      {req.reason}
                    </p>
                    <div className="text-[12px] text-stone-500 ">
                      申请于: {new Date(req.created_at).toLocaleString("zh-CN")}
                    </div>
                  </div>

                  {/* 状态 Badge */}
                  <div className="shrink-0 flex items-center">
                    {req.request_status === "approved" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#6FAA7D]/10 px-2.5 py-1 text-[12px] font-medium text-[#6FAA7D]">
                        <CheckCircle2 className="size-3.5" />
                        已通过
                      </span>
                    )}
                    {req.request_status === "rejected" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#C9604D]/10 px-2.5 py-1 text-[12px] font-medium text-[#C9604D]">
                        <XCircle className="size-3.5" />
                        已驳回
                      </span>
                    )}
                    {req.request_status === "pending" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#D99E55]/10 px-2.5 py-1 text-[12px] font-medium text-[#D99E55]">
                        <Clock className="size-3.5" />
                        审批中
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
