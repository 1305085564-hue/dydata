"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AiInsight() {
  const [type, setType] = useState<"week" | "month">("week");
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setInsight(null);

    try {
      const res = await fetch("/api/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "请求失败");
      } else {
        setInsight(data.insight);
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={type === "week" ? "default" : "outline"} onClick={() => setType("week")}>
          周报分析
        </Button>
        <Button size="sm" variant={type === "month" ? "default" : "outline"} onClick={() => setType("month")}>
          月报分析
        </Button>
        <Button size="sm" onClick={generate} disabled={loading}>
          {loading ? "生成中..." : "生成分析"}
        </Button>
      </div>

      {error && (
        <div className="glass-card-static rounded-2xl p-3">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3 animate-pulse">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-5/6" />
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-4 bg-muted rounded w-4/5" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </div>
      )}

      {insight && (
        <div className="glass-card-static rounded-2xl p-4">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{insight}</p>
        </div>
      )}

      {!insight && !error && !loading && (
        <div className="glass-card-static rounded-2xl p-3">
          <p className="text-sm text-muted-foreground">点击「生成分析」获取 AI 数据洞察</p>
        </div>
      )}
    </div>
  );
}
