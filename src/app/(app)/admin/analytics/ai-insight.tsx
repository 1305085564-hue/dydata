"use client";

import { useState } from "react";
import { Sparkles, TrendingUp, TrendingDown, Target, AlertTriangle, ArrowRight, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { PeriodInsightResult } from "@/lib/ai/shared";

interface AiInsightProps {
  scopeEntityId: string;
}

export function AiInsight({ scopeEntityId }: AiInsightProps) {
  const [type, setType] = useState<"week" | "month">("week");
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<PeriodInsightResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setInsight(null);

    try {
      const res = await fetch("/api/ai/insight/period", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_type: type,
          scope_entity_id: scopeEntityId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "请求失败");
      } else {
        setInsight(data.result ?? data);
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h3 className="text-[18px] font-medium tracking-tight text-stone-900">AI 结构化洞察</h3>
          <p className="text-[13px] leading-[1.7] text-stone-500">基于业务数据自动生成的分析结论与建议行动。</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-1">
          <button
            className={cn(
              "rounded-lg px-4 py-1.5 text-[12px] font-medium transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
              type === "week" ? "bg-white text-stone-900 border border-stone-200" : "text-stone-700 hover:bg-stone-100"
            )}
            onClick={() => setType("week")}
          >
            周度分析
          </button>
          <button
            className={cn(
              "rounded-lg px-4 py-1.5 text-[12px] font-medium transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
              type === "month" ? "bg-white text-stone-900 border border-stone-200" : "text-stone-700 hover:bg-stone-100"
            )}
            onClick={() => setType("month")}
          >
            月度洞察
          </button>
          <div className="h-4 w-px bg-stone-200 mx-1" />
          <Button
            size="sm"
            className="bg-[#D97757] text-white px-5 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[#C96442] hover:-translate-y-[1px] active:translate-y-0"
            onClick={generate}
            disabled={loading}
          >
            <Sparkles className="size-3.5 mr-1.5 stroke-[1.5] text-white" />
            <span className="text-white">{loading ? "生成中" : "生成洞察"}</span>
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
          >
            <ErrorState title="生成失败" description={error} onRetry={generate} />
          </motion.div>
        )}

        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-3 rounded-xl border border-stone-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-lg" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            ))}
          </motion.div>
        )}

        {insight && !loading && (
          <motion.div
            key="insight"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* 最佳方向 */}
            {insight.best_direction && (
              <div className="rounded-xl border border-stone-200 border-l-[2px] border-l-[#6FAA7D] bg-white p-6">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-stone-50 text-[#6FAA7D]">
                    <TrendingUp className="size-6 stroke-[1.5]" />
                  </div>
                  <div className="space-y-4 flex-1">
                    <div>
                      <h4 className="mb-1 text-[12px] font-normal tracking-[0.12em] text-[#6FAA7D]">最佳验证方向</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[18px] font-medium tracking-tight text-stone-900">{insight.best_direction.tag}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
                        <p className="mb-1 text-[12px] font-normal tracking-[0.12em] text-stone-500">数据证据</p>
                        <p className="text-[13px] font-normal leading-[1.7] text-stone-700">{insight.best_direction.evidence}</p>
                      </div>

                      <div>
                        <p className="mb-1 text-[12px] font-normal tracking-[0.12em] text-stone-500">建议行动</p>
                        <p className="text-[13px] leading-[1.7] text-stone-700">{insight.best_direction.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 最差方向 */}
            {insight.worst_direction && (
              <div className="rounded-xl border border-stone-200 border-l-[2px] border-l-[#C9604D] bg-white p-6">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-stone-50 text-[#C9604D]">
                    <TrendingDown className="size-6 stroke-[1.5]" />
                  </div>
                  <div className="space-y-4 flex-1">
                    <div>
                      <h4 className="mb-1 text-[12px] font-normal tracking-[0.12em] text-[#C9604D]">需规避方向</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[18px] font-medium tracking-tight text-stone-900">{insight.worst_direction.tag}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
                        <p className="mb-1 text-[12px] font-normal tracking-[0.12em] text-stone-500">数据证据</p>
                        <p className="text-[13px] font-normal leading-[1.7] text-stone-700">{insight.worst_direction.evidence}</p>
                      </div>

                      <div>
                        <p className="mb-1 text-[12px] font-normal tracking-[0.12em] text-stone-500">建议行动</p>
                        <p className="text-[13px] leading-[1.7] text-stone-700">{insight.worst_direction.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 下期重点 */}
            {insight.next_period_focus && (
              <div className="md:col-span-2 rounded-2xl border border-stone-200 bg-white p-6 relative overflow-hidden">
                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[#D97757]/10 text-[#D97757]">
                      <Target className="size-6 stroke-[1.5]" />
                    </div>
                    <div>
                      <h4 className="mb-1 text-[12px] font-normal tracking-[0.12em] text-stone-500">下期核心战役</h4>
                      <p className="text-[18px] font-medium leading-[1.7] text-stone-900">{insight.next_period_focus}</p>
                    </div>
                  </div>

                  <Button className="shrink-0 rounded-lg bg-[#D97757] text-white hover:bg-[#C96442] px-6 py-5 group whitespace-nowrap active:translate-y-0">
                    将其设为下期目标
                    <ArrowRight className="size-4 ml-2 stroke-[1.5] transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* 验证实验和样本警告 */}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              {insight.validated_experiments && insight.validated_experiments.length > 0 && (
                <div className="rounded-xl border border-stone-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="size-4 stroke-[1.5] text-[#D99E55]" />
                    <h4 className="text-[13px] font-medium text-stone-900">已验证测试结论</h4>
                  </div>
                  <ul className="space-y-2">
                    {insight.validated_experiments.map((exp, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-[13px] leading-[1.7] text-stone-700">
                        <span className="text-[#D99E55] mt-0.5">•</span>
                        <span>{exp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insight.sample_warning && insight.sample_warning.length > 0 && (
                <div className="rounded-xl border border-stone-200 border-l-[2px] border-l-[#D99E55] bg-white p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="size-4 stroke-[1.5] text-[#D99E55]" />
                    <h4 className="text-[13px] font-medium text-stone-900">样本不足警告</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {insight.sample_warning.map((warn, idx) => (
                      <Badge key={idx} variant="warning">{warn}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {!insight && !error && !loading && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-stone-200 bg-white p-12 text-center"
          >
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-stone-100 mb-4">
              <Sparkles className="size-8 stroke-[1.5] text-stone-500" />
            </div>
            <h3 className="mb-2 text-[18px] font-medium text-stone-900">准备好挖掘数据价值了吗？</h3>
            <p className="text-[13px] text-stone-500 leading-[1.7] max-w-md mx-auto">
              基于您选择的分析周期，AI 将深度挖掘爆款特征、分析滑铁卢原因，并为您提取下期可执行的焦点策略。
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
