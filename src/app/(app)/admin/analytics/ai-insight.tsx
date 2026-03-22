"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { MotionCard } from "@/components/ui/motion-card";
import { Button } from "@/components/ui/button";
import { useTypewriter } from "@/lib/animations";

export function AiInsight() {
  const [type, setType] = useState<"week" | "month">("week");
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { displayText, isComplete } = useTypewriter(insight ?? "", 24);

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
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={type === "week" ? "default" : "outline"}
          className="transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.97]"
          onClick={() => setType("week")}
        >
          周报分析
        </Button>
        <Button
          size="sm"
          variant={type === "month" ? "default" : "outline"}
          className="transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.97]"
          onClick={() => setType("month")}
        >
          月报分析
        </Button>
        <Button
          size="sm"
          className="transition-transform duration-[var(--duration-micro)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.97]"
          onClick={generate}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              生成中...
            </>
          ) : (
            "生成分析"
          )}
        </Button>
      </div>

      {error && (
        <MotionCard hover={false} className="border-[var(--color-danger)]/20 bg-white/80">
          <div className="p-4">
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          </div>
        </MotionCard>
      )}

      {loading && (
        <MotionCard hover={false} className="bg-white/80">
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
          </div>
        </MotionCard>
      )}

      {insight && !loading && (
        <MotionCard hover={false} className="bg-white/80">
          <div className="p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-primary)]">
              {displayText}
              {!isComplete && <span className="ml-0.5 inline-block animate-pulse text-[var(--color-primary)]">|</span>}
            </p>
          </div>
        </MotionCard>
      )}

      {!insight && !error && !loading && (
        <MotionCard hover={false} className="bg-white/75">
          <div className="p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">点击「生成分析」获取 AI 数据洞察</p>
          </div>
        </MotionCard>
      )}
    </div>
  );
}
