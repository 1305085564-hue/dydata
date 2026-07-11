"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Sparkles,
  Target,
  Info,
  ChevronDown,
  ChevronUp,
  Award,
  BookOpen,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Users,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from "recharts";
import { 六维雷达面板 } from "@/components/growth/六维雷达面板";
import { AppShell } from "@/components/app-shell";
import { CHART_COLORS, CHART_AXIS_TICK, CHART_GRID_PROPS } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import type { GrowthPageContract } from "@/lib/growth-page";

// ─── 白话指标口径解释 ───────────────────────────────────────────
const METRIC_EXPLANATIONS: Record<string, string> = {
  发布数: "这 30 天内，你一共提交了多少份视频日报数据。",
  总播放: "所有已发视频的总播放次数，体现选题与流量的基准盘。",
  总涨粉: "视频吸引到的新关注人数。转化好说明观众不仅看了还想要续集。",
  平均点赞率: "点赞数占总播放的比例（点赞/播放 × 100%）。越高代表观众认可度越高。",
  平均完播率: "完整看完视频的人数占播放人数的比例均值。越高说明内容越能留住观众。",
};

// ─── 脚本分段类型配置 ───────────────────────────────────────────
const SEGMENT_METAS = {
  hook: { label: "开头钩子", tone: "bg-stone-50 text-stone-700 border-stone-200", desc: "视频前 3 秒留人的黄金钩子，决定观众是否划走。" },
  background: { label: "背景铺垫", tone: "bg-stone-50 text-stone-700 border-stone-200", desc: "交代背景和痛点，引导出后续的核心干货。" },
  core_point: { label: "核心观点", tone: "bg-stone-50 text-stone-700 border-stone-200", desc: "视频的核心观点、干货或干脆利落的金句。" },
  action_cta: { label: "互动引导", tone: "bg-stone-50 text-stone-700 border-stone-200", desc: "引导点赞、收藏或评论，触发社交互动指数。" },
  closing: { label: "结尾收束", tone: "bg-stone-100 text-stone-700 border-stone-200", desc: "简短利落的收尾，防止观众在结尾前提前流失。" }
};

// ─── 指标数值格式化工具 ───────────────────────────────────────────
function formatMetricValue(dimension: string, value: number): string {
  if (dimension === "话题爆点") {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万次`;
    }
    return `${value}次`;
  }
  if (dimension === "增长转化" || dimension === "互动吸引") {
    return `${value.toFixed(1)}%`;
  }
  return `${value.toFixed(1)}%`; // 留人率、完播率等均是百分比
}

interface GrowthClientProps {
  contract: GrowthPageContract;
}

export function GrowthClient({ contract }: GrowthClientProps) {
  // 展开折页控制
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    benchmark: true,
    script: true,
    trend: true
  });

  // 指标口径解释
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

  // 趋势图指标切换
  const [trendMetric, setTrendMetric] = useState<"completionRate" | "completionRate5s" | "playCount" | "followerGain">("completionRate");

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // 1. 空数据状态
  if (contract.emptyState?.isEmpty) {
    return (
      <AppShell width="wide" className="pb-12 pt-8">
        <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-50 border border-stone-200 text-stone-500 mb-5">
            <Sparkles className="h-8 w-8 text-[#D97757]" />
          </div>
          <h2 className="text-[18px] font-medium text-stone-900 leading-[1.4]">
            开启内容成长体检
          </h2>
          <p className="mt-3 text-[13px] text-stone-500 leading-[1.6]">
            {contract.emptyState.reason || "还没有你的数据。去提交今天的日报，就能解锁你的内容能力雷达与深度改法建议。"}
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#D97757] px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#c56545] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/30"
          >
            去提交日报
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </AppShell>
    );
  }

  const { identity, credibility, verdict, radar, metricsOverview, benchmark, scriptBreakdown, trend } = contract;

  return (
    <AppShell width="wide" className="pb-16 space-y-6">
      {/* 顶部身份栏与全局可信度 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-5">
        <div>
          <h1 className="text-[24px] font-medium tracking-tight text-stone-900 leading-none">
            内容成长体检台
          </h1>
          <p className="mt-2 text-[13px] text-stone-500">
            分析主体：<span className="font-medium text-stone-900">{identity.profileName}</span> ·
            关联账号 {identity.accountCount} 个 ·
            近30天体检窗口内累计 {identity.reportCount} 份真实日报
          </p>
        </div>

        {/* 全局可信度标签 */}
        <div className="flex items-center">
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              credibility.level === "low" && "bg-amber-50 text-amber-800 border-amber-200",
              credibility.level === "mid" && "bg-stone-50 text-stone-700 border-stone-200",
              credibility.level === "high" && "bg-emerald-50 text-emerald-800 border-emerald-200"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                credibility.level === "low" && "bg-amber-500",
                credibility.level === "mid" && "bg-stone-500",
                credibility.level === "high" && "bg-emerald-500"
              )}
            />
            {credibility.label} (样本 {credibility.sampleCount} 条)
          </div>
        </div>
      </div>

      {/* P0: 核心体检结论大卡 */}
      {verdict && (
        <section className="overflow-hidden rounded-2xl border border-[#D97757]/30 bg-white p-6">
          <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-4">
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-stone-500 uppercase tracking-widest">
                VERDICT · 首屏体检焦点
              </span>
              <h2 className="text-[24px] font-medium text-stone-900 leading-[1.4]">
                你现在最该补的是「<span className="text-[#D97757]">{verdict.weakestDimension}</span>」
              </h2>
            </div>

            {/* 来源标记 */}
            <span className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] font-medium select-none",
              verdict.source === "ai"
                ? "bg-stone-50 text-stone-700 border-stone-200"
                : "bg-stone-100 text-stone-700 border-stone-200"
            )}>
              {verdict.source === "ai" ? "AI 深度诊断" : "规则分析"}
            </span>
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            {/* 一句话诊断 (根因) */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500">
                <Target className="h-4 w-4 text-[#D97757]" />
                诊断依据
              </div>
              <p className="text-[13px] font-medium text-stone-700 leading-[1.6]">
                {verdict.diagnosis}
              </p>
            </div>

            {/* 一句话改法 (行动方针) */}
            <div className="space-y-2 border-t border-stone-100 pt-4 md:border-t-0 md:pt-0 md:border-l md:border-stone-200 md:pl-6">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500">
                <Award className="h-4 w-4 text-[#6FAA7D]" />
                下一条视频改法（药方）
              </div>
              <p className="text-[13px] font-medium text-stone-900 leading-[1.6] bg-stone-50/70 p-2.5 rounded-lg border border-stone-100">
                {verdict.prescription}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* P1: 能力雷达 + 核心指标概览 */}
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* 六维雷达卡片 */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="mb-4">
            <h3 className="text-[18px] font-medium text-stone-900 leading-tight">能力画像</h3>
            <p className="mt-1 text-[12px] text-stone-500">看清六维能力相较于团队的相对表现。</p>
          </div>
          <六维雷达面板 radar={radar} weakestDimension={verdict?.weakestDimension} />
        </div>

        {/* 指标卡片网格 */}
        <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
          <div>
            <h3 className="text-[18px] font-medium text-stone-900 leading-tight">核心指标概览</h3>
            <p className="mt-1 text-[12px] text-stone-500">近30天的体征数据。鼠标悬停或键盘聚焦查看白话指标口径。</p>
          </div>

          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
            {metricsOverview.map((metric: { label: string; value: number; trend: number | null; unit: string }, index: number) => {
              const explanation = METRIC_EXPLANATIONS[metric.label] || "无相关解释";
              const isHovered = hoveredMetric === metric.label;
              const hasTrend = metric.trend !== null;

              return (
                <div
                  key={metric.label}
                  tabIndex={0}
                  aria-describedby={`metric-help-${index}`}
                  className="relative flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50 p-4 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/30"
                  onMouseEnter={() => setHoveredMetric(metric.label)}
                  onMouseLeave={() => setHoveredMetric(null)}
                  onFocus={() => setHoveredMetric(metric.label)}
                  onBlur={() => setHoveredMetric(null)}
                >
                  <div className="flex items-center justify-between text-stone-500">
                    <span className="text-[12px] font-medium">{metric.label}</span>
                    <Info className="h-3.5 w-3.5 text-stone-500" aria-hidden />
                  </div>

                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-[24px] font-medium text-stone-900">
                      {metric.label.includes("率") ? `${metric.value.toFixed(1)}` : metric.value.toLocaleString("zh-CN")}
                    </span>
                    <span className="text-[12px] text-stone-500 font-medium">{metric.unit}</span>
                  </div>

                  {/* 变化趋势 */}
                  {hasTrend && (
                    <div className="mt-2 flex items-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] font-medium",
                          metric.trend! > 0 && "bg-emerald-50 text-emerald-700",
                          metric.trend! < 0 && "bg-rose-50 text-rose-700",
                          metric.trend! === 0 && "bg-stone-100 text-stone-700"
                        )}
                      >
                        {metric.trend! > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : metric.trend! < 0 ? (
                          <TrendingDown className="h-3 w-3" />
                        ) : null}
                        {metric.trend! > 0 ? "+" : ""}
                        {metric.label.includes("率") || metric.label === "发布数" ? metric.trend!.toFixed(1) : `${metric.trend!.toFixed(0)}`}
                        {metric.label === "发布数" ? "" : "%"}
                      </span>
                    </div>
                  )}

                  {/* 白话口径浮窗 */}
                  {isHovered && (
                    <div id={`metric-help-${index}`} role="tooltip" className="absolute bottom-full left-0 right-0 z-10 mb-2 rounded-lg border border-stone-200 bg-stone-950 p-2.5 text-[12px] leading-[1.6] text-stone-100 shadow-lg">
                      <p className="font-medium border-b border-stone-800 pb-1 mb-1">{metric.label} 是什么？</p>
                      <p>{explanation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* P2: 折叠/展开层 */}

      {/* 1. 该学谁 - 同事对标 */}
      {benchmark.state !== "none" && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <button
            type="button"
            aria-expanded={openSections.benchmark}
            onClick={() => toggleSection("benchmark")}
            className="flex w-full items-center justify-between p-5 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400/30"
          >
            <div className="flex items-center gap-2.5">
              <Users className="h-5 w-5 text-[#8AA8C7]" />
              <div className="text-left">
                <h4 className="text-[18px] font-medium text-stone-900">该学谁 · 团队对标</h4>
                <p className="text-[12px] text-stone-500">对比同题材高表现同事，吸收可直接复制的实操经验。</p>
              </div>
            </div>
            {openSections.benchmark ? (
              <ChevronUp className="h-5 w-5 text-stone-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-stone-500" />
            )}
          </button>

          {openSections.benchmark && (
            <div className="border-t border-stone-100 p-5 space-y-4">
              {benchmark.state === "ok" && benchmark.peer ? (
                <div className="space-y-4">
                  <div className="flex items-baseline gap-2 text-[13px] text-stone-700">
                    <span>对标同事：</span>
                    <span className="font-medium text-stone-900">{benchmark.peer.name}</span>
                    <span className="text-stone-300">|</span>
                    <span>在该维度指标：</span>
                    <span className="font-medium text-[#D97757]">
                      {verdict ? formatMetricValue(verdict.weakestDimension, benchmark.peer.dimensionValue) : benchmark.peer.dimensionValue}
                    </span>
                  </div>

                  {benchmark.peer.scriptSnippet ? (
                    <div className="space-y-2">
                      <span className="text-[12px] font-medium text-stone-500">高表现文案片段（拆解参考）：</span>
                      <blockquote className="relative rounded-lg border border-stone-200 border-l-4 border-l-[#D97757] bg-stone-50/50 p-4 text-[13px] text-stone-700 italic leading-[1.7] whitespace-pre-wrap">
                        “{benchmark.peer.scriptSnippet}”
                      </blockquote>
                    </div>
                  ) : (
                    <p className="text-[12px] text-stone-500 italic">暂无对标文案片段，先参考该同事近期内容。</p>
                  )}
                </div>
              ) : benchmark.state === "fallback_team_avg" ? (
                <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-4 text-center">
                  <p className="text-[13px] text-stone-700 font-medium">
                    当前暂无可实名展示的同题材稳定对标人。
                  </p>
                  <p className="mt-1.5 text-[12px] text-stone-500">
                    已为您兜底拉取团队在此维度上的均值基准：
                    <span className="font-medium text-stone-900">
                      {verdict && benchmark.teamAvg !== undefined ? formatMetricValue(verdict.weakestDimension, benchmark.teamAvg) : benchmark.teamAvg}
                    </span>，建议先围绕自己历史最好内容进行优化。
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* 2. 最近视频文案结构化拆解 */}
      {scriptBreakdown.state === "ok" && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <button
            type="button"
            aria-expanded={openSections.script}
            onClick={() => toggleSection("script")}
            className="flex w-full items-center justify-between p-5 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400/30"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="h-5 w-5 text-[#6FAA7D]" />
              <div className="text-left">
                <h4 className="text-[18px] font-medium text-stone-900">最新视频文案拆解</h4>
                <p className="text-[12px] text-stone-500">分析最近一篇日报脚本的分段结构与写法。</p>
              </div>
            </div>
            {openSections.script ? (
              <ChevronUp className="h-5 w-5 text-stone-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-stone-500" />
            )}
          </button>

          {openSections.script && (
            <div className="border-t border-stone-100 p-5 space-y-4">
              <div className="flex flex-col gap-4">
                {scriptBreakdown.segments.map((segment: { type: "hook" | "background" | "core_point" | "action_cta" | "closing"; order: number; content: string }) => {
                  const meta = SEGMENT_METAS[segment.type] || SEGMENT_METAS.closing;
                  return (
                    <div key={`${segment.type}-${segment.order}`} className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50/50 p-4 transition-colors hover:bg-stone-50">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn("rounded-full border px-2.5 py-0.5 text-[12px] font-medium select-none", meta.tone)}>
                            {meta.label}
                          </span>
                          <span className="text-[12px] text-stone-500">SEGMENT #{segment.order}</span>
                        </div>
                        <span className="text-[12px] text-stone-500 italic max-w-xs truncate">{meta.desc}</span>
                      </div>
                      <p className="mt-1 text-[13px] text-stone-700 leading-[1.7] whitespace-pre-wrap font-sans">
                        {segment.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. 成长趋势图 */}
      {trend && trend.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <button
            type="button"
            aria-expanded={openSections.trend}
            onClick={() => toggleSection("trend")}
            className="flex w-full items-center justify-between p-5 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400/30"
          >
            <div className="flex items-center gap-2.5">
              <TrendingUp className="h-5 w-5 text-[#D97757]" />
              <div className="text-left">
                <h4 className="text-[18px] font-medium text-stone-900">近 30 天成长趋势</h4>
                <p className="text-[12px] text-stone-500">追踪日报历史关键指标变化，检验改法是否生效。</p>
              </div>
            </div>
            {openSections.trend ? (
              <ChevronUp className="h-5 w-5 text-stone-500" />
            ) : (
              <ChevronDown className="h-5 w-5 text-stone-500" />
            )}
          </button>

          {openSections.trend && (
            <div className="border-t border-stone-100 p-5 space-y-6">
              {/* 指标切换 Tab */}
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "completionRate", label: "平均完播率" },
                  { key: "completionRate5s", label: "5秒完播率" },
                  { key: "playCount", label: "播放量" },
                  { key: "followerGain", label: "涨粉数" }
                ].map((tab: { key: string; label: string }) => (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={trendMetric === tab.key}
                    onClick={() => setTrendMetric(tab.key as typeof trendMetric)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all",
                      trendMetric === tab.key
                        ? "bg-[#D97757] border-[#D97757] text-white"
                        : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 折线图 */}
              <div className="h-[260px] w-full">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={260}
                  initialDimension={{ width: 800, height: 260 }}
                >
                  <LineChart
                    data={trend}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid {...CHART_GRID_PROPS} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tick={CHART_AXIS_TICK}
                      dy={8}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={CHART_AXIS_TICK}
                      tickFormatter={(val) => {
                        if (trendMetric === "completionRate" || trendMetric === "completionRate5s") {
                          return `${val}%`;
                        }
                        if (val >= 10000) return `${(val / 10000).toFixed(0)}w`;
                        return String(val);
                      }}
                    />
                    <ChartTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        let valText = "";
                        if (trendMetric === "completionRate") valText = `平均完播率：${data.completionRate.toFixed(1)}%`;
                        else if (trendMetric === "completionRate5s") valText = `5秒完播率：${data.completionRate5s.toFixed(1)}%`;
                        else if (trendMetric === "playCount") valText = `播放数：${data.playCount.toLocaleString("zh-CN")}次`;
                        else if (trendMetric === "followerGain") valText = `涨粉数：${data.followerGain.toLocaleString("zh-CN")}人`;

                        return (
                          <div className="rounded-lg border border-stone-200 bg-white/95 p-2.5 text-[12px] shadow-md backdrop-blur-sm">
                            <p className="font-medium text-stone-900 border-b border-stone-100 pb-1 mb-1">{data.date}</p>
                            <p className="font-medium text-[#D97757]">{valText}</p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey={trendMetric}
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2.5}
                      dot={{ r: 3, stroke: "white", strokeWidth: 1.5 }}
                      activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
