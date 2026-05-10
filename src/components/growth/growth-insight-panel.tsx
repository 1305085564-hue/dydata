"use client";

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

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

function InsightSkeleton() {
  return (
    <div className="space-y-3">
      {["w-3/4", "w-full", "w-5/6", "w-full"].map((w, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-zinc-200 p-4">
          <Skeleton className={`h-3 ${w === "w-3/4" ? "w-1/3" : "w-1/4"}`} />
          <Skeleton className={`h-3 ${w}`} />
          <Skeleton className="h-3 w-2/3" />
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
    tone: "border-zinc-200 bg-zinc-50 border-l-2 border-l-[#D99E55]",
  },
  {
    key: "scene",
    title: "案发现场",
    tone: "border-zinc-200 bg-zinc-50 border-l-2 border-l-[#C9604D]",
  },
  {
    key: "cause",
    title: "归因",
    tone: "border-zinc-200 bg-zinc-50",
  },
  {
    key: "rewrite",
    title: "改写建议",
    tone: "border-zinc-200 bg-zinc-50 border-l-2 border-l-[#6FAA7D]",
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">AI Review</p>
            <h2 className="text-[20px] font-semibold tracking-tight text-zinc-800">昨日复盘洞察</h2>
            <p className="text-[13px] leading-[1.7] text-zinc-500">
              {state.status === "ok" && state.cached ? "已缓存结果" : "AI 自动分析昨日视频数据"}
            </p>
          </div>
        </div>

        {state.status === "loading" && <InsightSkeleton />}

        {state.status === "no_data" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-3">
              <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-400">暂无昨日视频数据，以下为示范参考</span>
            </div>
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 border-l-2 border-l-[#D99E55] p-4">
              <div className="mb-2 text-[13px] font-semibold text-zinc-800">诊断 <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">示范数据</span></div>
              <p className="text-[13px] leading-[1.7] text-zinc-800">昨日视频《如何3天涨粉1000》2s跳出率偏高（38%），说明开头钩子吸引力不足，用户在前2秒未被留住。</p>
            </div>
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 border-l-2 border-l-[#C9604D] p-4">
              <div className="mb-2 text-[13px] font-semibold text-zinc-800">案发现场 <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">示范数据</span></div>
              <p className="text-[13px] leading-[1.7] text-zinc-800">播放12.5万，完播率41%，中段完播稳定，但转粉率0.3%低于团队均值（0.8%）。</p>
            </div>
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-4">
              <div className="mb-2 text-[13px] font-semibold text-zinc-800">归因 <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">示范数据</span></div>
              <p className="text-[13px] leading-[1.7] text-zinc-800">开头3秒直接进入内容讲解，缺少悬念或冲突设置，导致跳出率高；结尾无明确CTA，转粉路径不清晰。</p>
            </div>
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 border-l-2 border-l-[#6FAA7D] p-4">
              <div className="mb-2 text-[13px] font-semibold text-zinc-800">改写建议 <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">示范数据</span></div>
              <blockquote className="border-l-2 border-[#6FAA7D] pl-3 text-[13px] leading-[1.7] text-zinc-800">
                开头改为：「你知道为什么大多数人涨粉失败吗？」（悬念问句）{"\n"}
                结尾加：「点击主页，看完整涨粉方法论」（明确CTA）
              </blockquote>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <ErrorState title="AI 分析失败" description={state.message} />
        )}

        {state.status === "ok" && (
          <div className="grid gap-3">
            {SECTIONS.map(({ key, title, tone, isCode }) => (
              <div key={key} className={`rounded-xl border p-4 ${tone}`}>
                <div className="mb-2 text-[13px] font-semibold text-zinc-800">{title}</div>
                {isCode ? (
                  <blockquote className="border-l-2 border-[#6FAA7D] pl-3 text-[13px] leading-[1.7] text-zinc-800 whitespace-pre-wrap break-words">
                    {state.insight[key]}
                  </blockquote>
                ) : (
                  <p className="text-[13px] leading-[1.7] text-zinc-800 whitespace-pre-wrap break-words">
                    {state.insight[key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
