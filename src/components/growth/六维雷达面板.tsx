"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GrowthDimensionCard, WeakBenchmarkCard } from "@/lib/growth-page";

// ─── 雷达图常量 ───────────────────────────────────────────────
const RADAR_SIZE = 320;
const CENTER = RADAR_SIZE / 2;
const MAX_RADIUS = 120;
const LEVELS = 5;
const DIMS = 6;

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

const LABEL_OFFSET = 18;
const labelAnchors = ["middle", "start", "start", "middle", "end", "end"] as const;
const labelDyAdjust = [-4, 4, 4, 8, 4, 4];

// ─── 维度图标 ─────────────────────────────────────────────────
const dimIcons: Record<string, string> = {
  开头留人: "🎯",
  中段跳出: "📉",
  整体完播: "⏱",
  增长转化: "📈",
  互动吸引: "💬",
  话题爆点: "🔥",
};

// ─── 分数换算 ─────────────────────────────────────────────────
function ratingToScore(card: GrowthDimensionCard): number {
  return card.rating.label === "强" ? 85 : card.rating.label === "中" ? 65 : 40;
}

// ─── 颜色规则（红=好>=80，黄=警告50-79，绿=差<50，灰=无数据） ──
function scoreToBarColor(score: number, hasData: boolean): string {
  if (!hasData) return "bg-gray-300";
  if (score >= 80) return "bg-rose-400";
  if (score >= 50) return "bg-yellow-500";
  return "bg-green-500";
}

function scoreToTextColor(score: number, hasData: boolean): string {
  if (!hasData) return "text-gray-400";
  if (score >= 80) return "text-rose-400";
  if (score >= 50) return "text-yellow-600";
  return "text-green-600";
}

// ─── P80 基准分 ───────────────────────────────────────────────
function getP80Scores(cards: GrowthDimensionCard[]): number[] {
  return cards.map((card) => {
    const myScore = ratingToScore(card);
    return Math.round(myScore * (card.rating.label === "强" ? 0.95 : card.rating.label === "中" ? 1.08 : 1.18));
  });
}

// ─── 主组件 ──────────────────────────────────────────────────
interface TeamMember {
  id: string;
  name: string;
  scores: number[];
}

interface 六维雷达面板Props {
  capabilityCards: GrowthDimensionCard[];
  weakBenchmarkCards: WeakBenchmarkCard[];
  teamMembers?: TeamMember[];
}

export function 六维雷达面板({ capabilityCards, weakBenchmarkCards, teamMembers = [] }: 六维雷达面板Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [comparePersonId, setComparePersonId] = useState<string>("");

  if (!capabilityCards.length) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-white/85 p-5 shadow backdrop-blur">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">六维能力</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">数据不足，先连续提交数据后再看能力分布。</p>
      </div>
    );
  }

  const myScores = capabilityCards.map(ratingToScore);
  const p80Scores = getP80Scores(capabilityCards);

  const selectedMember = teamMembers.find((m) => m.id === comparePersonId) ?? null;
  const compareScores = selectedMember ? selectedMember.scores : p80Scores;
  const compareLabel = selectedMember ? selectedMember.name : "团队 P80";

  const strongIndex = myScores.indexOf(Math.max(...myScores));
  const weakIndex = myScores.indexOf(Math.min(...myScores));

  const strongCard = weakBenchmarkCards.find((c) => c.dimension === capabilityCards[strongIndex]?.name);
  const weakCard = weakBenchmarkCards.find((c) => c.dimension === capabilityCards[weakIndex]?.name);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white/85 p-5 shadow backdrop-blur sm:p-6">
      {/* 标题行 */}
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">六维能力</h2>
      </div>

      {/* 主体：左40% 列表 + 右60% 雷达 */}
      <div className="flex flex-col gap-6 lg:grid lg:gap-8" style={{ gridTemplateColumns: "2fr 3fr" }}>
        {/* 左侧：维度进度条列表，垂直居中 */}
        <div className="flex flex-col justify-center gap-2">
          {capabilityCards.map((card, i) => {
            const score = myScores[i];
            const hasData = score > 0;
            const barColor = scoreToBarColor(score, hasData);
            const textColor = scoreToTextColor(score, hasData);
            const isActive = activeIndex === i;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setActiveIndex(isActive ? null : i)}
                className={cn(
                  "rounded-xl px-3 py-2 text-left transition-colors",
                  isActive ? "bg-blue-50" : "hover:bg-slate-50",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-sm font-semibold text-[var(--color-text-primary)]">
                    {dimIcons[card.name] ?? "·"} {card.name}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-gray-200">
                    <div
                      className={cn("h-full rounded-full transition-all", barColor)}
                      style={{ width: hasData ? `${score}%` : "0%" }}
                    />
                  </div>
                  <span className={cn("w-8 shrink-0 text-right text-sm font-bold tabular-nums", textColor)}>
                    {hasData ? score : "—"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 右侧：选择器 + 图例 + 雷达图 + 强弱卡片 */}
        <div className="flex flex-col items-center">
          {/* 右上角：选择器 + 图例 */}
          <div className="mb-2 flex w-full items-center justify-end gap-3 text-xs text-[var(--color-text-secondary)]">
            {/* 图例 */}
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
              我的数据
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
              {compareLabel}
            </span>
            {/* 分隔 */}
            <span className="text-gray-300">|</span>
            {/* 固定标签：团队 P80 */}
            <span className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs text-[var(--color-text-primary)]">
              团队 P80
            </span>
            {/* 对比个人下拉 */}
            <select
              value={comparePersonId}
              onChange={(e) => setComparePersonId(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none"
            >
              <option value="">对比个人…</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* SVG 雷达图 */}
          <svg
            viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
            className="w-full max-w-[320px]"
            aria-label="六维能力雷达图"
          >
            {Array.from({ length: LEVELS }, (_, level) => (
              <polygon
                key={level}
                points={buildGridPolygon(level + 1)}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            ))}
            {Array.from({ length: DIMS }, (_, i) => {
              const { x, y } = polarToXY(MAX_RADIUS, i);
              return <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#e2e8f0" strokeWidth="1" />;
            })}
            <polygon
              points={buildPolygonPoints(compareScores, 100)}
              fill="rgba(251,146,60,0.08)"
              stroke="#fb923c"
              strokeWidth="2"
              strokeDasharray="6,4"
            />
            <polygon
              points={buildPolygonPoints(myScores, 100)}
              fill="rgba(59,130,246,0.12)"
              stroke="#3b82f6"
              strokeWidth="2.5"
            />
            {/* 对比数据点（带 tooltip） */}
            {compareScores.map((score, i) => {
              const r = (Math.min(score, 100) / 100) * MAX_RADIUS;
              const { x, y } = polarToXY(r, i);
              const dimName = capabilityCards[i]?.name ?? `维度${i + 1}`;
              return (
                <circle key={`cmp-${i}`} cx={x} cy={y} r={3} fill="#fb923c" stroke="white" strokeWidth="1.5">
                  <title>{`${dimName}（${compareLabel}）: ${score}分`}</title>
                </circle>
              );
            })}
            {/* 我的数据点（带 tooltip） */}
            {myScores.map((score, i) => {
              const r = (Math.min(score, 100) / 100) * MAX_RADIUS;
              const { x, y } = polarToXY(r, i);
              const isActive = activeIndex === i;
              const dimName = capabilityCards[i]?.name ?? `维度${i + 1}`;
              return (
                <circle
                  key={`my-${i}`}
                  cx={x}
                  cy={y}
                  r={isActive ? 6 : 4}
                  fill={isActive ? "#2563eb" : "#3b82f6"}
                  stroke="white"
                  strokeWidth="1.5"
                >
                  <title>{`${dimName}: ${score}分`}</title>
                </circle>
              );
            })}
            {/* 轴标签 */}
            {capabilityCards.map((card, i) => {
              const { x, y } = polarToXY(MAX_RADIUS + LABEL_OFFSET, i);
              const score = myScores[i];
              const fill = score >= 80 ? "#fb7185" : score >= 50 ? "#ca8a04" : "#16a34a";
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

          {/* 最强/最弱维度卡片，两侧留空 15% */}
          <div className="mt-5 flex w-full justify-center gap-6 px-[15%]">
            <div className="flex-1 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-[11px] text-slate-500">最强 · {capabilityCards[strongIndex]?.name}</p>
              <p className="mt-0.5 text-sm font-semibold text-rose-500">
                {strongCard && strongCard.state === "benchmark"
                  ? `${strongCard.personName} — ${strongCard.metricText}`
                  : strongCard?.state === "self_best"
                    ? `你 — ${strongCard.metricText}`
                    : `得分 ${myScores[strongIndex]}`}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                {strongCard?.snippet || "继续保持，这是你的核心优势维度。"}
              </p>
            </div>
            <div className="flex-1 rounded-xl border border-green-200 bg-green-50 p-3">
              <p className="text-[11px] text-slate-500">最弱 · {capabilityCards[weakIndex]?.name}</p>
              <p className="mt-0.5 text-sm font-semibold text-green-700">
                你 — {capabilityCards[weakIndex]?.metricText ?? `${myScores[weakIndex]} 分`}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                {weakCard?.snippet ||
                  `${capabilityCards[weakIndex]?.name}低于团队基准，建议优先针对此项做单点优化。`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
