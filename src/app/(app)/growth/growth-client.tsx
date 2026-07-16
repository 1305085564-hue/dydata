"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Sparkles,
  Target,
  Award,
  BookOpen,
  ArrowRight,
  Users,
} from "lucide-react";
import { 六维雷达面板 } from "@/components/growth/六维雷达面板";
import { 成长进度卡 } from "@/components/growth/成长进度卡";
import { 教练卡 } from "@/components/growth/教练卡";
import { 体征数据条, type VitalsCell } from "@/components/growth/体征数据条";
import { 断流横幅, 格式化为月日 } from "@/components/growth/断流横幅";
import { 追赶条 } from "@/components/growth/追赶条";
import { 锁定图占位 } from "@/components/growth/锁定图占位";
import { AppShell } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import {
  GROWTH_DIMENSION_RULES,
  GROWTH_RATE_UNLOCK_SAMPLE_COUNT,
  type GrowthPageContract,
} from "@/lib/growth-page";
import type { ResultTrendDatum } from "@/components/charts/result-trend";
import type { InteractionTrendDatum } from "@/components/charts/interaction-trend";
import type { AccountLeaderboardRow } from "@/types";

const ResultTrend = dynamic(
  () => import("@/components/charts/result-trend").then((module) => module.ResultTrend),
  { ssr: false, loading: () => <div className="h-[320px] w-full animate-pulse rounded-2xl bg-stone-100" /> }
);

const InteractionTrend = dynamic(
  () => import("@/components/charts/interaction-trend").then((module) => module.InteractionTrend),
  { ssr: false, loading: () => <div className="h-[320px] w-full animate-pulse rounded-2xl bg-stone-100" /> }
);

const Leaderboard = dynamic(
  () => import("@/components/leaderboard/leaderboard").then((module) => module.Leaderboard),
  { ssr: false, loading: () => (
    <div className="space-y-3">
      <div className="h-10 w-56 animate-pulse rounded-xl bg-stone-100" />
      <div className="h-[420px] w-full animate-pulse rounded-2xl bg-stone-100" />
    </div>
  ) }
);

// ─── 指标数值格式化工具 ───────────────────────────────────────────
function formatMetricValue(dimension: string, value: number): string {
  if (dimension === "话题爆点") {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万次`;
    }
    return `${value}次`;
  }
  return `${value.toFixed(1)}%`;
}

function formatAbsolute(value: number): string {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString("zh-CN");
}

interface GrowthClientProps {
  contract: GrowthPageContract;
}

export function GrowthClient({ contract }: GrowthClientProps) {
  const [trendData, setTrendData] = useState<{
    结果趋势: ResultTrendDatum[];
    互动趋势: InteractionTrendDatum[];
  } | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<AccountLeaderboardRow[] | null>(null);
  const [asyncAccountIds, setAsyncAccountIds] = useState<string[]>([]);
  const [asyncOwnContentDirections, setAsyncOwnContentDirections] = useState<string[]>([]);
  const [loadingTrend, setLoadingTrend] = useState(true);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);

  const todayStr = useMemo(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localTime = new Date(d.getTime() - offset * 60 * 1000);
    return localTime.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    fetch("/api/dashboard/trend")
      .then((res) => res.json())
      .then((data) => {
        if (data.trendData) setTrendData(data.trendData);
      })
      .catch(() => {})
      .finally(() => setLoadingTrend(false));

    fetch("/api/dashboard/leaderboard")
      .then((res) => res.json())
      .then((data) => {
        if (data.leaderboardData) setLeaderboardData(data.leaderboardData);
        if (data.accountIds) setAsyncAccountIds(data.accountIds);
        if (data.ownContentDirections) setAsyncOwnContentDirections(data.ownContentDirections);
      })
      .catch(() => {})
      .finally(() => setLoadingLeaderboard(false));
  }, []);

  // 1. 新人空数据状态（全历史也没有日报）
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

  const { identity, verdict, radar, metricsOverview, benchmark, ownScriptSnippet, stage } = contract;
  const phase = stage.phase;
  const ratesUnlocked = stage.windowReportCount >= GROWTH_RATE_UNLOCK_SAMPLE_COUNT;
  const weakestRule = verdict
    ? GROWTH_DIMENSION_RULES.find((rule) => rule.name === verdict.weakestDimension) ?? null
    : null;
  const staleText =
    stage.isStale && stage.lastReportDate && stage.daysSinceLastReport !== null
      ? `数据停在 ${格式化为月日(stage.lastReportDate)} · 已停 ${stage.daysSinceLastReport} 天`
      : null;

  // 体征数据条：绝对量常显，比例指标满样本才点亮，全程不显示环比徽章；每格带白话口径浮窗
  const overviewByLabel = new Map(metricsOverview.map((metric) => [metric.label, metric]));
  const vitalsCells: VitalsCell[] = [
    {
      label: "发布数",
      value: overviewByLabel.has("发布数") ? String(overviewByLabel.get("发布数")!.value) : "—",
      hint: "近 30 天",
      explanation: "近 30 天里你提交了多少份视频日报。",
    },
    {
      label: "总播放",
      value: overviewByLabel.has("总播放") ? formatAbsolute(overviewByLabel.get("总播放")!.value) : "—",
      hint: "近 30 天",
      explanation: "近 30 天所有已发视频的总播放次数，体现选题与流量的基本盘。",
    },
    {
      label: "总涨粉",
      value: overviewByLabel.has("总涨粉") ? formatAbsolute(overviewByLabel.get("总涨粉")!.value) : "—",
      hint: "近 30 天",
      explanation: "近 30 天视频吸引到的新关注人数。",
    },
    ratesUnlocked
      ? {
          label: "平均完播率",
          value: overviewByLabel.has("平均完播率") ? `${overviewByLabel.get("平均完播率")!.value.toFixed(1)}%` : "—",
          explanation: "完整看完视频的人数占播放人数的比例均值。越高说明内容越能留住观众。",
        }
      : {
          label: "平均完播率",
          value: "",
          locked: true,
          lockHint: `${stage.windowReportCount}/${GROWTH_RATE_UNLOCK_SAMPLE_COUNT} 份`,
          explanation: `完整看完视频的人数占播放人数的比例均值。满 ${GROWTH_RATE_UNLOCK_SAMPLE_COUNT} 份有效日报后点亮。`,
        },
    ratesUnlocked
      ? {
          label: "平均点赞率",
          value: overviewByLabel.has("平均点赞率") ? `${overviewByLabel.get("平均点赞率")!.value.toFixed(1)}%` : "—",
          explanation: "点赞数占总播放的比例（点赞 ÷ 播放 × 100%）。越高代表观众认可度越高。",
        }
      : {
          label: "平均点赞率",
          value: "",
          locked: true,
          lockHint: `${stage.windowReportCount}/${GROWTH_RATE_UNLOCK_SAMPLE_COUNT} 份`,
          explanation: `点赞数占总播放的比例（点赞 ÷ 播放 × 100%）。满 ${GROWTH_RATE_UNLOCK_SAMPLE_COUNT} 份有效日报后点亮。`,
        },
    {
      label: "数据更新至",
      value: stage.lastReportDate ? 格式化为月日(stage.lastReportDate) : "—",
      hint:
        stage.daysSinceLastReport === null
          ? undefined
          : stage.daysSinceLastReport === 0
            ? "今日已更新"
            : `停更 ${stage.daysSinceLastReport} 天`,
      explanation: "最近一次提交日报的日期。停更超过 3 天，页面会提醒你回来同步。",
    },
  ];

  return (
    <AppShell width="wide" className="pb-16 space-y-6">
      {/* 顶部身份栏与阶段标识 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-5">
        <div>
          <h1 className="text-[24px] font-medium tracking-tight text-stone-900 leading-none">
            数据分析
          </h1>
          <p className="mt-2 text-[13px] text-stone-500">
            内容成长体检 · 分析主体：<span className="font-medium text-stone-900">{identity.profileName}</span> ·
            关联账号 {identity.accountCount} 个 ·
            累计提交 {stage.lifetimeReportCount} 份日报
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/violations"
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-600 transition-all hover:bg-stone-50 hover:text-stone-900 active:scale-[0.98]"
          >
            <BookOpen className="size-3.5 stroke-[1.5] text-stone-500" />
            <span>避坑案例</span>
          </Link>
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              phase === "accumulation" && "border-[#D99E55]/25 bg-[#D99E55]/10 text-[#8A6A2F]",
              phase === "observation" && "border-stone-200 bg-stone-50 text-stone-700",
              phase === "mature" && "border-[#6FAA7D]/25 bg-[#6FAA7D]/10 text-[#3F7050]"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                phase === "accumulation" && "bg-[#D99E55]",
                phase === "observation" && "bg-stone-500",
                phase === "mature" && "bg-[#6FAA7D]"
              )}
            />
            {phase === "accumulation" && `累积期 · 已积累 ${stage.lifetimeReportCount}/${GROWTH_RATE_UNLOCK_SAMPLE_COUNT} 份`}
            {phase === "observation" && `观察期 · 近 30 天 ${stage.windowReportCount} 份样本`}
            {phase === "mature" && "成熟期 · 样本充足"}
          </div>
        </div>
      </div>

      {/* 断流横幅：断流不降级模块，只提醒（累积期已并入进度卡，不重复） */}
      {staleText && phase !== "accumulation" && stage.lastReportDate && stage.daysSinceLastReport !== null ? (
        <断流横幅 lastReportDate={stage.lastReportDate} daysSince={stage.daysSinceLastReport} />
      ) : null}

      {/* 主卡槽位：同一位置随阶段点亮 */}
      {phase === "accumulation" ? (
        <成长进度卡 lifetimeReportCount={stage.lifetimeReportCount} staleText={staleText} />
      ) : verdict ? (
        <section className="overflow-hidden rounded-2xl border border-[#D97757]/30 bg-white p-6">
          <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-4">
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-stone-500 uppercase tracking-widest">
                VERDICT · 首屏体检焦点
              </span>
              <h2 className="text-[24px] font-medium text-stone-900 leading-[1.4]">
                你现在最该补的是「<span className="text-[#D97757]">{verdict.weakestDimension}</span>」
              </h2>
              {phase === "observation" ? (
                <p className="text-[12px] text-stone-500">
                  基于近 30 天 {stage.windowReportCount} 份日报 · 样本累积中，结论会随数据变化。
                </p>
              ) : null}
            </div>

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
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500">
                <Target className="h-4 w-4 text-[#D97757]" />
                诊断依据
              </div>
              <p className="text-[13px] font-medium text-stone-700 leading-[1.6]">
                {verdict.diagnosis}
              </p>
            </div>

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
      ) : (
        /* 重度断流：窗口内无数据，主卡冻结而不是误报"还没有数据" */
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-6">
          <span className="text-[12px] font-medium uppercase tracking-widest text-stone-500">
            体检暂停
          </span>
          <h2 className="mt-2 text-[24px] font-medium text-stone-900 leading-[1.4]">
            数据停在 {stage.lastReportDate ? 格式化为月日(stage.lastReportDate) : "很久以前"}，近 30 天没有新日报
          </h2>
          <p className="mt-2 text-[13px] text-stone-500 leading-[1.6]">
            你历史累计 {stage.lifetimeReportCount} 份日报还在。恢复同步后，体检会基于新数据重新生成。
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#D97757] px-5 py-3 text-[13px] font-medium text-white transition-colors hover:bg-[#c56545] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/30"
          >
            去同步今日数据
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      {/* 教练卡：只在累积期替代诊断，给招式不给判决 */}
      {phase === "accumulation" ? (
        <教练卡
          prescription={verdict?.prescription ?? null}
          peer={
            benchmark.state === "ok" && benchmark.peer?.scriptSnippet
              ? { name: benchmark.peer.name, scriptSnippet: benchmark.peer.scriptSnippet }
              : null
          }
          own={ownScriptSnippet}
        />
      ) : null}

      {/* 体征数据条：绝对量常显 + 比例指标按样本点亮 + 数据新鲜度自检 */}
      <体征数据条
        cells={vitalsCells}
        note={`口径：近 30 天 · 比例指标满 ${GROWTH_RATE_UNLOCK_SAMPLE_COUNT} 份有效日报后点亮`}
      />

      {/* 趋势区：实线=已知数据，虚线=缺数区间，灰斜纹=日报停更 */}
      <section className="grid gap-6 lg:grid-cols-2">
        {loadingTrend ? (
          <>
            <div className="h-[320px] w-full animate-pulse rounded-2xl bg-stone-100" />
            <div className="h-[320px] w-full animate-pulse rounded-2xl bg-stone-100" />
          </>
        ) : (
          <>
            {trendData ? (
              <ResultTrend
                data={trendData.结果趋势}
                personalLabel="我的数据"
                teamAverageLabel="团队 P70"
                emptyText="提交满两天后，可查看结果趋势。"
                teamSize={stage.teamActiveCount}
              />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border border-stone-200 bg-white text-[13px] text-stone-500">
                暂无趋势数据
              </div>
            )}
            {ratesUnlocked ? (
              trendData ? (
                <InteractionTrend
                  data={trendData.互动趋势}
                  personalLabel="我的质量分"
                  teamAverageLabel="团队 P70"
                  emptyText="提交满两天后，可查看互动质量趋势。"
                  teamSize={stage.teamActiveCount}
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl border border-stone-200 bg-white text-[13px] text-stone-500">
                  暂无趋势数据
                </div>
              )
            ) : (
              <锁定图占位
                title="互动质量分趋势"
                description={`数据不足，这里会长出你的互动质量分曲线。满 ${GROWTH_RATE_UNLOCK_SAMPLE_COUNT} 份有效日报后自动点亮。`}
              />
            )}
          </>
        )}
      </section>

      {/* 能力画像 + 同伴：同一排随阶段点亮 */}
      <section className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="mb-4">
            <h3 className="text-[18px] font-medium text-stone-900 leading-tight">能力画像</h3>
            <p className="mt-1 text-[12px] text-stone-500">
              {phase === "accumulation" ? "六维能力轮廓，随日报积累点亮。" : "看清六维能力相较于团队的相对表现。"}
            </p>
          </div>
          {phase === "accumulation" ? (
            <六维雷达面板
              radar={[]}
              locked
              lockedText={`满 ${GROWTH_RATE_UNLOCK_SAMPLE_COUNT} 份日报后，这里会长出你的六维能力轮廓。解锁前不画假形状。`}
            />
          ) : (
            <六维雷达面板 radar={radar} weakestDimension={verdict?.weakestDimension} />
          )}
        </div>

        {phase === "accumulation" ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <Users className="h-5 w-5 stroke-[1.5] text-[#8AA8C7]" />
              <div>
                <h4 className="text-[18px] font-medium text-stone-900 leading-tight">同伴 · 追赶视角</h4>
                <p className="text-[12px] text-stone-500 mt-1">两个人的竞争不配叫榜单，只给你下一个追赶目标。</p>
              </div>
            </div>
            {benchmark.state === "ok" && benchmark.peer && weakestRule ? (
              <追赶条
                peerName={benchmark.peer.name}
                metricLabel={weakestRule.metricLabel}
                peerValueText={formatMetricValue(weakestRule.name, benchmark.peer.dimensionValue)}
                peerRatio={weakestRule.unit === "%" ? benchmark.peer.dimensionValue / 100 : 1}
              />
            ) : (
              <p className="rounded-lg border border-stone-200 bg-stone-50/50 p-4 text-center text-[13px] leading-[1.6] text-stone-500">
                团队还没有可比同伴。数据积累后，这里会出现你的第一个追赶目标。
              </p>
            )}
          </div>
        ) : phase === "observation" ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <Users className="h-5 w-5 text-[#8AA8C7]" />
              <div>
                <h4 className="text-[18px] font-medium text-stone-900 leading-tight">该学谁 · 双人对比</h4>
                <p className="text-[12px] text-stone-500 mt-1">对比同题材高表现同事，吸收实操经验。</p>
              </div>
            </div>

            <div className="border-t border-stone-100 pt-4 space-y-4">
              {benchmark.state === "ok" && benchmark.peer ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1 text-[13px] text-stone-700">
                    <div>对标同事：<span className="font-semibold text-stone-900">{benchmark.peer.name}</span></div>
                    <div>指标数据：<span className="font-semibold text-[#D97757]">{verdict ? formatMetricValue(verdict.weakestDimension, benchmark.peer.dimensionValue) : benchmark.peer.dimensionValue}</span></div>
                  </div>

                  {benchmark.peer.scriptSnippet ? (
                    <div className="space-y-2">
                      <span className="text-[12px] font-medium text-stone-500">文案对照（看差距在哪）：</span>
                      <div className={cn("grid gap-3", ownScriptSnippet ? "md:grid-cols-2" : "")}>
                        <div className="space-y-1.5">
                          <span className="text-[12px] text-stone-500">同事的写法 · {benchmark.peer.name}</span>
                          <blockquote className="relative rounded-lg border border-stone-200 border-l-4 border-l-[#D97757] bg-stone-50/50 p-3.5 text-[12px] text-stone-700 italic leading-[1.6] whitespace-pre-wrap">
                            “{benchmark.peer.scriptSnippet}”
                          </blockquote>
                        </div>
                        {ownScriptSnippet ? (
                          <div className="space-y-1.5">
                            <span className="text-[12px] text-stone-500">你的写法 · 最近一篇（{格式化为月日(ownScriptSnippet.reportDate)}）</span>
                            <blockquote className="relative rounded-lg border border-stone-200 border-l-4 border-l-stone-300 bg-stone-50/50 p-3.5 text-[12px] text-stone-700 leading-[1.6] whitespace-pre-wrap">
                              “{ownScriptSnippet.snippet}”
                            </blockquote>
                          </div>
                        ) : null}
                      </div>
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
                    <span className="font-semibold text-stone-900">
                      {verdict && benchmark.teamAvg !== undefined ? formatMetricValue(verdict.weakestDimension, benchmark.teamAvg) : benchmark.teamAvg}
                    </span>，建议先围绕自己历史最好内容进行优化。
                  </p>
                </div>
              ) : (
                <p className="rounded-lg border border-stone-200 bg-stone-50/50 p-4 text-center text-[13px] leading-[1.6] text-stone-500">
                  团队还没有可比同伴。数据积累后，这里会出现你的第一个对标同事。
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
            <div>
              <h3 className="text-[18px] font-medium text-stone-900 leading-tight">排行榜 · 全局排行</h3>
              <p className="mt-1 text-[12px] text-stone-500">团队已满 5 人，启用榜单形态。对比高表现同事，检验相对位置。</p>
            </div>
            {/* 榜单只有数字，补上"学他怎么写"的定性内容（旧页功能，避免榜单化后丢失） */}
            {benchmark.state === "ok" && benchmark.peer ? (
              <div className="rounded-xl border border-stone-200 bg-stone-50/50 px-4 py-3">
                <p className="text-[12px] font-medium text-stone-500">该学谁</p>
                <p className="mt-1 text-[13px] text-stone-700">
                  <span className="font-medium text-stone-900">{benchmark.peer.name}</span>
                  {verdict ? (
                    <span>
                      {" "}· <span className="font-medium text-[#D97757]">{formatMetricValue(verdict.weakestDimension, benchmark.peer.dimensionValue)}</span>
                    </span>
                  ) : null}
                </p>
                {benchmark.peer.scriptSnippet ? (
                  <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-[#D97757] pl-3 text-[12px] italic leading-[1.6] text-stone-600">
                    “{benchmark.peer.scriptSnippet}”
                  </blockquote>
                ) : null}
                {ownScriptSnippet ? (
                  <p className="mt-2 whitespace-pre-wrap border-l-2 border-stone-300 pl-3 text-[12px] leading-[1.6] text-stone-600">
                    <span className="font-medium text-stone-500">你的写法 · 最近一篇（{格式化为月日(ownScriptSnippet.reportDate)}）：</span>
                    “{ownScriptSnippet.snippet}”
                  </p>
                ) : null}
              </div>
            ) : null}
            {loadingLeaderboard ? (
              <div className="space-y-3">
                <div className="h-10 w-56 animate-pulse rounded-xl bg-stone-50" />
                <div className="h-[400px] w-full animate-pulse rounded-2xl bg-stone-50" />
              </div>
            ) : leaderboardData ? (
              <Leaderboard
                data={leaderboardData}
                ownAccountIds={asyncAccountIds}
                ownContentDirections={asyncOwnContentDirections}
                currentDate={todayStr}
                defaultRange="week"
                defaultCompact
              />
            ) : (
              <div className="h-40 flex items-center justify-center text-stone-500 text-[13px]">
                暂无排行榜数据
              </div>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
