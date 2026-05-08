"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Eye, Lightbulb, PencilLine } from "lucide-react";


import type { AdviceSections } from "@/lib/growth-page";

type InsightResult = {
  diagnosis: string;
  scene: string;
  cause: string;
  rewrite: string;
};

type InsightState =
  | { status: "loading" }
  | { status: "no_data" }
  | { status: "error"; message: string }
  | { status: "ok"; insight: InsightResult; cached: boolean };

type ActionPlanBlock = {
  key: string;
  title: string;
  content: string;
  toneClass: string;
  badge?: string;
  icon: typeof CheckCircle2;
};

const DEMO_CONTENT = {
  conclusion: "示例内容：这条视频最大的问题不是信息少，而是前 3 秒没人愿意继续看。",
  evidence: "示范数据：2秒跳出率 38%，5秒完播率 28%，说明问题发生在开头，不在中段。",
  reference: "示例内容：同题材高表现账号会先抛结果，再补过程，用户能更快知道为什么要继续看。",
  rewrite: "示例内容：把开头改成“同样讲方法，为什么别人能涨粉，你却没人看？”再接 1 个对比数据。",
  action: "示例内容：下一批先只改开头钩子，连发 3 条，看 2 秒跳出率和 5 秒完播率有没有一起改善。",
};

function buildBlocks({ insightState, advice, noData }: { insightState: InsightState; advice: AdviceSections; noData: boolean }): ActionPlanBlock[] {
  const insight = insightState.status === "ok" ? insightState.insight : null;
  const showDemoOnly = noData || (insightState.status === "no_data" && advice.source === "error");

  if (showDemoOnly) {
    return [
      {
        key: "conclusion",
        title: "一句话结论",
        content: DEMO_CONTENT.conclusion,
        toneClass: "border-[color:var(--color-warning)]/20 bg-[color:var(--color-warning)]/10",
        badge: "示例内容",
        icon: Lightbulb,
      },
      {
        key: "evidence",
        title: "问题证据",
        content: DEMO_CONTENT.evidence,
        toneClass: "border-[color:var(--color-danger)]/20 bg-[color:rgba(255,59,48,0.06)]",
        badge: "示范数据",
        icon: Eye,
      },
      {
        key: "reference",
        title: "参考示例",
        content: DEMO_CONTENT.reference,
        toneClass: "border-zinc-200 bg-zinc-50",
        badge: "示例内容",
        icon: ClipboardList,
      },
      {
        key: "rewrite",
        title: "改写建议",
        content: DEMO_CONTENT.rewrite,
        toneClass: "border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/10",
        badge: "示例内容",
        icon: PencilLine,
      },
      {
        key: "action",
        title: "下一步动作",
        content: DEMO_CONTENT.action,
        toneClass: "border-zinc-200 bg-white",
        badge: "示例内容",
        icon: CheckCircle2,
      },
    ];
  }

  const conclusion = insight?.diagnosis || advice.diagnosis;
  const evidence = insight
    ? `${insight.scene}${insight.cause ? `\n可能原因：${insight.cause}` : ""}`
    : advice.source === "error"
      ? "单条视频复盘暂时不可用，先按下面的参考和动作执行。"
      : `规则判断：${advice.diagnosis}`;
  const reference = advice.source === "error" ? DEMO_CONTENT.reference : advice.reference;
  const rewrite = insight?.rewrite || DEMO_CONTENT.rewrite;
  const action = advice.source === "error" ? DEMO_CONTENT.action : advice.action;

  return [
    {
      key: "conclusion",
      title: "一句话结论",
      content: conclusion,
      toneClass: "border-[color:var(--color-warning)]/20 bg-[color:var(--color-warning)]/10",
      icon: Lightbulb,
    },
    {
      key: "evidence",
      title: "问题证据",
      content: evidence,
      toneClass: "border-[color:var(--color-danger)]/20 bg-[color:rgba(255,59,48,0.06)]",
      badge: insight ? undefined : "规则判断",
      icon: Eye,
    },
    {
      key: "reference",
      title: "参考示例",
      content: reference,
      toneClass: "border-zinc-200 bg-zinc-50",
      badge: advice.source === "error" ? "示例内容" : undefined,
      icon: ClipboardList,
    },
    {
      key: "rewrite",
      title: "改写建议",
      content: rewrite,
      toneClass: "border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/10",
      badge: insight ? undefined : "示例内容",
      icon: PencilLine,
    },
    {
      key: "action",
      title: "下一步动作",
      content: action,
      toneClass: "border-zinc-200 bg-white",
      badge: advice.source === "error" ? "示例内容" : undefined,
      icon: CheckCircle2,
    },
  ];
}

function Skeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-xl border border-zinc-200 bg-white p-4">
          <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
          <div className="mt-3 h-3 w-full rounded bg-[var(--color-border)]" />
          <div className="mt-2 h-3 w-4/5 rounded bg-[var(--color-border)]" />
        </div>
      ))}
    </div>
  );
}

export function GrowthActionPlanPanelBody({ insightState, advice, noData }: { insightState: InsightState; advice: AdviceSections; noData: boolean }) {
  const blocks = buildBlocks({ insightState, advice, noData });

  return (
    <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">Action Plan</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">下一轮先怎么改</h2>
          <p className="text-sm leading-6 text-zinc-500">
            {noData
              ? "当前没有真实数据，先看一次完整示例，知道这里以后会给你什么。"
              : insightState.status === "ok" && insightState.cached
                ? "已合并昨日复盘结果和规则建议。"
                : "把 AI 洞察和规则建议收成一套行动方案。"}
          </p>
        </div>

        {insightState.status === "loading" && !noData ? <Skeleton /> : null}

        {!(insightState.status === "loading" && !noData) ? (
          <div className="grid gap-3">
            {blocks.map((block) => {
              const Icon = block.icon;
              return (
                <div key={block.key} className={`rounded-xl border p-4 ${block.toneClass} ${block.key === "action" ? "border-l-4 border-l-[#D97757] rounded-l-none" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                      <Icon className="size-4" />
                      {block.title}
                    </div>
                    {block.badge ? (
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-500">
                        {block.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-950">{block.content}</p>
                </div>
              );
            })}
          </div>
        ) : null}

        {insightState.status === "error" && !noData ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
            单条视频复盘请求失败：{insightState.message}
          </div>
        ) : null}
      </div>
  );
}

export function GrowthActionPlanPanel({ advice, noData = false }: { advice: AdviceSections; noData?: boolean }) {
  const [insightState, setInsightState] = useState<InsightState>(noData ? { status: "no_data" } : { status: "loading" });

  useEffect(() => {
    if (noData) {
      setInsightState({ status: "no_data" });
      return;
    }

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
          setInsightState({ status: "no_data" });
        } else if (data.error) {
          setInsightState({ status: "error", message: data.error });
        } else if (data.insight) {
          setInsightState({ status: "ok", insight: data.insight, cached: data.cached ?? false });
        } else {
          setInsightState({ status: "no_data" });
        }
      })
      .catch((error: unknown) => {
        setInsightState({ status: "error", message: error instanceof Error ? error.message : "请求失败" });
      });
  }, [noData]);

  return <GrowthActionPlanPanelBody insightState={insightState} advice={advice} noData={noData} />;
}
