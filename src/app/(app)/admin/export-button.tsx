"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { feedbackToast } from "@/components/ui/feedback-toast";

export function ExportButton() {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);

  async function handleExport() {
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="export-from" className="text-[13px] text-zinc-500">开始日期</Label>
        <Input
          id="export-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 w-auto border-zinc-200 bg-white text-zinc-800"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="export-to" className="text-[13px] text-zinc-500">结束日期</Label>
        <Input
          id="export-to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 w-auto border-zinc-200 bg-white text-zinc-800"
        />
      </div>
      <Button
        onClick={handleExport}
        disabled={loading}
        className="h-9 bg-white border border-zinc-200 text-zinc-800 hover:bg-zinc-50"
      >
        {loading ? "导出中..." : "导出 Excel"}
      </Button>
    </div>
  );
}
