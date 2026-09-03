"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { formatShanghaiDateOnly, shiftDateOnly } from "@/lib/loaders/shared";

export function ExportButton() {
  // 默认日期范围取挂载时刻，避免 render 中调用 Date.now()/new Date()（React Compiler purity）
  const [initialDates] = useState(() => {
    const today = formatShanghaiDateOnly();
    const weekAgo = shiftDateOnly(new Date(), -7);
    return { today, weekAgo };
  });
  const { today, weekAgo } = initialDates;
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [dateError, setDateError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    if (from && to && from > to) {
      setDateError("开始日期不能晚于结束日期");
      return;
    }
    setDateError("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const url = `/api/export?${params.toString()}`;

      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "导出失败" }));
        if (err.error === "数据量过大" && err.message) {
          feedbackToast.error(err.message);
        } else {
          feedbackToast.error(err.error || "导出失败");
        }
        return;
      }

      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `抖音数据日报_${from}_至_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      feedbackToast.success("导出成功");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="export-from" className="text-[13px] text-[#78716C]">开始日期</Label>
          <Input
            id="export-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (dateError) setDateError("");
            }}
            className={`h-9 w-auto border-[#E5E0D6] bg-white text-[#1C1917] ${dateError ? "ring-1 ring-red-300" : ""}`}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="export-to" className="text-[13px] text-[#78716C]">结束日期</Label>
          <Input
            id="export-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              if (dateError) setDateError("");
            }}
            className={`h-9 w-auto border-[#E5E0D6] bg-white text-[#1C1917] ${dateError ? "ring-1 ring-[#C0685C]/40" : ""}`}
          />
        </div>
        <Button
          onClick={handleExport}
          disabled={loading}
          className="h-9 bg-white border border-[#E5E0D6] text-[#1C1917] hover:bg-[#FBF9F5]"
        >
          {loading ? "导出中..." : "导出 Excel"}
        </Button>
      </div>
      {dateError && <p className="text-[#C0685C] text-xs mt-1">{dateError}</p>}
    </div>
  );
}
