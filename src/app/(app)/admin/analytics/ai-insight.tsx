"use client";

import { useState } from "react";
import { Loader2, Sparkles, TrendingUp, TrendingDown, Target, AlertTriangle, ArrowRight, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
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
        // Handle both raw format and payload format
        setInsight(data.result ?? data);
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">AI 结构化洞察</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">基于业务数据自动生成的分析结论与建议行动。</p>
        </div>
        
        <div className="flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/60 p-1 shadow-sm backdrop-blur-md">
          <button
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
              type === "week" ? "bg-slate-800 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
            )}
            onClick={() => setType("week")}
          >
            周度分析
          </button>
          <button
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
              type === "month" ? "bg-slate-800 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"
            )}
            onClick={() => setType("month")}
          >
            月度洞察
          </button>
          <div className="h-4 w-px bg-slate-200 mx-1"></div>
          <Button
            size="sm"
            className="rounded-full bg-[linear-gradient(135deg,var(--color-primary)_0%,#3b82f6_100%)] px-5 transition-all hover:opacity-90 shadow-sm shadow-blue-500/20"
            onClick={generate}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin text-white" />
            ) : (
              <>
                <Sparkles className="size-3.5 mr-1.5 text-white" />
                <span className="text-white">生成洞察</span>
              </>
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-600 shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              <p className="font-medium">{error}</p>
            </div>
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
              <div key={i} className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.7),rgba(248,250,252,0.5))] p-6 shadow-sm backdrop-blur-sm animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="size-10 rounded-xl bg-slate-200/80" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 rounded-full bg-slate-200/80" />
                    <div className="h-3 w-32 rounded-full bg-slate-200/60" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-full rounded-full bg-slate-200/60" />
                  <div className="h-4 w-5/6 rounded-full bg-slate-200/60" />
                  <div className="h-4 w-4/6 rounded-full bg-slate-200/60" />
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {insight && !loading && (
          <motion.div
            key="insight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {/* 最佳方向 */}
            {insight.best_direction && (
              <div className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-6 shadow-sm backdrop-blur-xl">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-inner">
                    <TrendingUp className="size-6" />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 mb-1">最佳验证方向</h4>
                      <div className="flex items-center gap-2">
                         <span className="text-xl font-bold text-slate-800">{insight.best_direction.tag}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">数据证据</p>
                        <p className="text-sm font-medium text-slate-700">{insight.best_direction.evidence}</p>
                      </div>
                      
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">建议行动</p>
                        <p className="text-sm text-slate-600">{insight.best_direction.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 最差方向 */}
            {insight.worst_direction && (
              <div className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-6 shadow-sm backdrop-blur-xl">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-inner">
                    <TrendingDown className="size-6" />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-rose-600 mb-1">需规避方向</h4>
                      <div className="flex items-center gap-2">
                         <span className="text-xl font-bold text-slate-800">{insight.worst_direction.tag}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                        <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">数据证据</p>
                        <p className="text-sm font-medium text-slate-700">{insight.worst_direction.evidence}</p>
                      </div>
                      
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">建议行动</p>
                        <p className="text-sm text-slate-600">{insight.worst_direction.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 下期重点 */}
            {insight.next_period_focus && (
              <div className="md:col-span-2 rounded-[24px] border border-transparent bg-[linear-gradient(135deg,var(--color-primary)_0%,#3b82f6_100%)] p-6 shadow-md relative overflow-hidden">
                <div className="absolute -right-12 -top-12 size-48 rounded-full bg-white opacity-10 blur-2xl"></div>
                
                <div className="relative flex flex-col md:flex-row gap-6 items-start md:items-center justify-between z-10">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-md shadow-inner border border-white/20">
                      <Target className="size-6" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-widest text-blue-100 mb-1">下期核心战役</h4>
                      <p className="text-lg font-bold text-white leading-relaxed">{insight.next_period_focus}</p>
                    </div>
                  </div>
                  
                  <Button className="shrink-0 rounded-full bg-white text-blue-600 hover:bg-slate-50 px-6 py-5 shadow-lg border-0 group whitespace-nowrap">
                    将其设为下期目标
                    <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
              </div>
            )}

            {/* 验证实验和样本警告 */}
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
               {insight.validated_experiments && insight.validated_experiments.length > 0 && (
                 <div className="rounded-[20px] border border-slate-200/60 bg-white/80 p-5 shadow-sm backdrop-blur-md">
                   <div className="flex items-center gap-2 mb-3">
                     <Lightbulb className="size-4 text-amber-500" />
                     <h4 className="text-sm font-bold text-slate-800">已验证测试结论</h4>
                   </div>
                   <ul className="space-y-2">
                     {insight.validated_experiments.map((exp, idx) => (
                       <li key={idx} className="text-sm text-slate-600 flex items-start gap-2">
                         <span className="text-amber-500 mt-0.5 font-bold">•</span>
                         <span className="leading-relaxed">{exp}</span>
                       </li>
                     ))}
                   </ul>
                 </div>
               )}

               {insight.sample_warning && insight.sample_warning.length > 0 && (
                 <div className="rounded-[20px] border border-amber-200/60 bg-amber-50/50 p-5 shadow-sm backdrop-blur-md">
                   <div className="flex items-center gap-2 mb-3">
                     <AlertTriangle className="size-4 text-amber-600" />
                     <h4 className="text-sm font-bold text-slate-800">样本不足警告</h4>
                   </div>
                   <div className="flex flex-wrap gap-2">
                     {insight.sample_warning.map((warn, idx) => (
                       <Badge key={idx} variant="outline" className="bg-white/60 border-amber-200 text-amber-700">
                         {warn}
                       </Badge>
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
            className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.7),rgba(248,250,252,0.5))] p-12 text-center shadow-sm backdrop-blur-xl"
          >
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-slate-100 mb-4 shadow-inner">
              <Sparkles className="size-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">准备好挖掘数据价值了吗？</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              基于您选择的分析周期，AI 将深度挖掘爆款特征、分析滑铁卢原因，并为您提取下期可执行的焦点策略。
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
