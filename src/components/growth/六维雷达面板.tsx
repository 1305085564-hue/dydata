"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GrowthDimensionCard, WeakBenchmarkCard } from "@/lib/growth-page";

// ─── 雷达图常量 ───────────────────────────────────────────────
const RADAR_SIZE = 300;
const CENTER = RADAR_SIZE / 2;
const MAX_RADIUS = 110;
const LEVELS = 5;
const DIMS = 6;

// 6个顶点角度：从正上方开始，顺时针
function getAngle(index: number) {
  return (Math.PI * 2 * index) / DIMS - Math.PI / 2;
}

function polarToXY(radius: number, index: number) {
  const angle = getAngle(index);
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function buildPolygonPoints(scores: number[], maxScore: number) {
  return scores
    .map((score, i) => {
      const r = (Math.min(score, maxScore) / maxScore) * MAX_RADIUS;
      const { x, y } = polarToXY(r, i);
      return `${x},${y}`;
    })
    .join(" ");
}

function buildGridPolygon(level: number) {
  const r = (level / LEVELS) * MAX_RADIUS;
  return Array.from({ length: DIMS }, (_, i) => {
    const { x, y } = polarToXY(r, i);
    return `${x},${y}`;
  }).join(" ");
}

// 标签偏移：根据方向微调
const LABEL_OFFSET = 18;
const labelAnchors = ["middle", "start", "start", "middle", "end", "end"] as const;
const labelDyAdjust = [-6, 4, 4, 8, 4, 4];

// ─── 维度图标 ─────────────────────────────────────────────────
const dimIcons: Record<string, string> = {
  开头留人: "🎯",
  中段跳出: "📉",
  整体完播: "⏱",
  增长转化: "📈",
  互动吸引: "💬",
  话题爆点: "🔥",
};

// ─── 将 GrowthDimensionCard 的 rating 转为 0-100 分 ──────────
function ratingToScore(card: GrowthDimensionCard): number {
  // 用 metricValue 相对 baseline 换算成 0-100
  // rating.label: 强=80-100, 中=50-79, 弱=0-49
  // 这里用简单映射：强→85, 中→65, 弱→40，再加上 metricValue 的微调
  const base = card.rating.label === "强" ? 85 : card.rating.label === "中" ? 65 : 40;
  return base;
}

// ─── 对比选项 ─────────────────────────────────────────────────
type CompareOption = "p70" | "p50" | "avg";
const compareOptions: { value: CompareOption; label: string }[] = [
  { value: "p70", label: "团队 P70（默认）" },
  { value: "p50", label: "团队 P50" },
  { value: "avg", label: "团队均值" },
];

// 模拟团队基准分（P70 / P50 / avg），基于 rating baseline 推算
function getBaselineScores(cards: GrowthDimensionCard[], mode: CompareOption): number[] {
  return cards.map((card) => {
    const myScore = ratingToScore(card);
    if (mode === "p70") return Math.round(myScore * (card.rating.label === "强" ? 0.92 : card.rating.label === "中" ? 1.05 : 1.15));
    if (mode === "p50") return Math.round(myScore * (card.rating.label === "强" ? 0.85 : card.rating.label === "中" ? 0.98 : 1.08));
    return Math.round(myScore * (card.rating.label === "强" ? 0.80 : card.rating.label === "中" ? 0.92 : 1.02));
  });
}

// ─── 主组件 ──────────────────────────────────────────────────
interface 六维雷达面板Props {
  capabilityCards: GrowthDimensionCard[];
  weakBenchmarkCards: WeakBenchmarkCard[];
}

export function 六维雷达面板({ capabilityCards, weakBenchmarkCards }: 六维雷达面板Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState<CompareOption>("p70");

  if (!capabilityCards.length) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-white/85 p-5 backdrop-blur">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">六维能力</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">数据不足，先连续提交数据后再看能力分布。</p>
      </div>
    );
  }

  const myScores = capabilityCards.map(ratingToScore);
  const baselineScores = getBaselineScores(capabilityCards, compareMode);

  // 找最强/最弱
  const strongIndex = myScores.indexOf(Math.max(...myScores));
  const weakIndex = myScores.indexOf(Math.min(...myScores));

  // 对标卡片数据
  const strongCard = weakBenchmarkCards.find((c) => c.dimension === capabilityCards[strongIndex]?.name);
  const weakCard = weakBenchmarkCards.find((c) => c.dimension === capabilityCards[weakIndex]?.name);

  const compareLabel = compareOptions.find((o) => o.value === compareMode)?.label ?? "团队 P70";

  return (
    <div className="space-y-4">
      {/* 主面板 */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-white/85 p-5 backdrop-blur sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          {/* 左侧：维度列表 */}
          <div className="flex flex-col gap-1 lg:w-[220px] lg:shrink-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">六维能力</p>
            {capabilityCards.map((card, i) => {
              const isStrong = i === strongIndex;
              const isWeak = i === weakIndex;
              const isActive = activeIndex === i;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setActiveIndex(isActive ? null : i)}
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-600"
                      : "text-[var(--color-text-primary)] hover:bg-slate-50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span>{dimIcons[card.name] ?? "·"}</span>
                    <span>{card.name}</span>
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
                      isActive
                        ? "bg-blue-100 text-blue-600"
                        : isStrong
                          ? "bg-green-50 text-green-600"
                          : isWeak
                            ? "bg-red-50 text-red-600"
                            : "bg-slate-100 text-slate-500",
                    )}
                  >
                    {myScores[i]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 右侧：雷达图 */}
          <div className="flex flex-1 flex-col items-center gap-3">
            {/* 对比选择器 */}
            <div className="flex w-full items-center justify-end gap-2 text-xs text-[var(--color-text-secondary)]">
              <span>对比：</span>
              <select
                value={compareMode}
                onChange={(e) => setCompareMode(e.target.value as CompareOption)}
                className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none"
              >
                {compareOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* SVG 雷达图 */}
            <svg
              viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
              className="w-full max-w-[300px]"
              aria-label="六维能力雷达图"
            >
              {/* 背景网格 */}
              {Array.from({ length: LEVELS }, (_, level) => (
                <polygon
                  key={level}
                  points={buildGridPolygon(level + 1)}
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
              ))}

              {/* 轴线 */}
              {Array.from({ length: DIMS }, (_, i) => {
                const { x, y } = polarToXY(MAX_RADIUS, i);
                return (
                  <line
                    key={i}
                    x1={CENTER}
                    y1={CENTER}
                    x2={x}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                );
              })}

              {/* 对比数据（橙色虚线） */}
              <polygon
                points={buildPolygonPoints(baselineScores, 100)}
                fill="rgba(251,146,60,0.08)"
                stroke="#fb923c"
                strokeWidth="2"
                strokeDasharray="6,4"
              />

              {/* 我的数据（蓝色实线） */}
              <polygon
                points={buildPolygonPoints(myScores, 100)}
                fill="rgba(59,130,246,0.12)"
                stroke="#3b82f6"
                strokeWidth="2.5"
              />

              {/* 数据点 */}
              {myScores.map((score, i) => {
                const r = (Math.min(score, 100) / 100) * MAX_RADIUS;
                const { x, y } = polarToXY(r, i);
                const isActive = activeIndex === i;
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={isActive ? 6 : 4}
                    fill={isActive ? "#2563eb" : "#3b82f6"}
                    stroke="white"
                    strokeWidth="1.5"
                  />
                );
              })}

              {/* 顶点标签 */}
              {capabilityCards.map((card, i) => {
                const { x, y } = polarToXY(MAX_RADIUS + LABEL_OFFSET, i);
                const isStrong = i === strongIndex;
                const isWeak = i === weakIndex;
                const fill = isStrong ? "#16a34a" : isWeak ? "#dc2626" : "#475569";
                return (
                  <text
                    key={i}
                    x={x}
                    y={y + labelDyAdjust[i]}
                    textAnchor={labelAnchors[i]}
                    fontSize="11"
                    fontWeight="500"
                    fill={fill}
                  >
                    {card.name}
                  </text>
                );
              })}
            </svg>

            {/* 图例 */}
            <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                我的数据
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
                {compareLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 对标强弱卡片 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* 最强维度 */}
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-xs text-slate-500">
            最强维度 · {capabilityCards[strongIndex]?.name}
          </p>
          <p className="mt-1 text-sm font-semibold text-green-700">
            {strongCard && strongCard.state === "benchmark"
              ? `${strongCard.personName} — ${strongCard.metricText}`
              : strongCard?.state === "self_best"
                ? `你 — ${strongCard.metricText}`
                : `得分 ${myScores[strongIndex]}`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {strongCard?.snippet || "继续保持，这是你的核心优势维度。"}
          </p>
        </div>

        {/* 最弱维度 */}
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs text-slate-500">
            最弱维度 · {capabilityCards[weakIndex]?.name}
          </p>
          <p className="mt-1 text-sm font-semibold text-red-700">
            你 — {capabilityCards[weakIndex]?.metricText ?? `${myScores[weakIndex]} 分`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {weakCard?.snippet || `${capabilityCards[weakIndex]?.name}低于团队基准，建议优先针对此项做单点优化。`}
          </p>
        </div>
      </div>
    </div>
  );
}
