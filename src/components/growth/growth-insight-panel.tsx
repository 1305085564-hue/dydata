"use client";

import { useEffect, useState } from "react";
import { MotionCard } from "@/components/ui/motion-card";

type InsightResult = {
  diagnosis: string;
  scene: string;
  cause: string;
  rewrite: string;
};

type State =
  | { status: "loading" }
  | { status: "no_data" }
  | { status: "error"; message: string }
  | { status: "ok"; insight: InsightResult; cached: boolean };

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {["w-3/4", "w-full", "w-5/6", "w-full"].map((w, i) => (
        <div key={i} className="rounded-[12px] border border-[var(--color-border)] p-4 space-y-2">
          <div className={`h-3 rounded bg-[var(--color-border)] ${w === "w-3/4" ? "w-1/3" : "w-1/4"}`} />
          <div className={`h-3 rounded bg-[var(--color-border)] ${w}`} />
          <div className="h-3 rounded bg-[var(--color-border)] w-2/3" />
        </div>
      ))}
    </div>
  );
}

type SectionDef = {
  key: keyof InsightResult;
  title: string;
  tone: string;
  isCode?: boolean;
};

const SECTIONS: SectionDef[] = [
  {
    key: "diagnosis",
    title: "诊断",
    tone: "border-[color:var(--color-warning)]/20 bg-[color:var(--color-warning)]/10",
  },
  {
    key: "scene",
    title: "案发现场",
    tone: "border-[color:var(--color-danger)]/20 bg-[color:rgba(255,59,48,0.06)]",
  },
  {
    key: "cause",
    title: "归因",
    tone: "border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/10",
  },
  {
    key: "rewrite",
    title: "改写建议",
    tone: "border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/10",
    isCode: true,
  },
];

export function GrowthInsightPanel() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().split("T")[0];

    fetch("/api/growth/ai-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    })
      .then((res) => res.json())
      .then((data: { insight?: InsightResult | null; reason?: string; error?: string; cached?: boolean }) => {
        if (data.reason === "no_data" || data.insight === null) {
          setState({ status: "no_data" });
        } else if (data.error) {
          setState({ status: "error", message: data.error });
        } else if (data.insight) {
          setState({ status: "ok", insight: data.insight, cached: data.cached ?? false });
        } else {
          setState({ status: "no_data" });
        }
      })
      .catch((err: unknown) => {
        setState({ status: "error", message: err instanceof Error ? err.message : "请求失败" });
      });
  }, []);

  return (
    <MotionCard className="border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">昨日复盘洞察</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {state.status === "ok" && state.cached ? "已缓存结果" : "AI 自动分析昨日视频数据"}
            </p>
          </div>
        </div>

        {state.status === "loading" && <Skeleton />}

        {state.status === "no_data" && (
          <div className="rounded-[12px] border border-[var(--color-border)] p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">暂无昨日视频数据，先提交数据后再看洞察</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-[12px] border border-[color:var(--color-danger)]/20 bg-[color:rgba(255,59,48,0.06)] p-4">
            <p className="text-sm text-[var(--color-danger)]">{state.message}</p>
          </div>
        )}

        {state.status === "ok" && (
          <div className="grid gap-3">
            {SECTIONS.map(({ key, title, tone, isCode }) => (
              <div key={key} className={`rounded-[12px] border p-4 ${tone}`}>
                <div className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">{title}</div>
                {isCode ? (
                  <blockquote className="border-l-2 border-[color:var(--color-success)] pl-3 text-sm leading-6 text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
                    {state.insight[key]}
                  </blockquote>
                ) : (
                  <p className="text-sm leading-6 text-[var(--color-text-primary)] whitespace-pre-wrap break-words">
                    {state.insight[key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </MotionCard>
  );
}
