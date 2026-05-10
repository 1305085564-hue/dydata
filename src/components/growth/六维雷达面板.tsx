"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GrowthDimensionCard, WeakBenchmarkCard } from "@/lib/growth-page";

// ─── 雷达图常量 ───────────────────────────────────────────────
const RADAR_SIZE = 300;
const CENTER = RADAR_SIZE / 2;
const MAX_RADIUS = 145;
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

const LABEL_OFFSET = 22;
const labelAnchors = ["middle", "start", "start", "middle", "end", "end"] as const;
const labelDyAdjust = [-6, 4, 4, 10, 4, 4];

// ─── 分数换算 ─────────────────────────────────────────────────
function ratingToScore(card: GrowthDimensionCard): number {
  return card.rating.label === "强" ? 85 : card.rating.label === "中" ? 65 : 40;
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
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-[20px] font-semibold tracking-tight text-zinc-800">六维能力</h2>
        <p className="mt-2 text-[13px] leading-[1.7] text-zinc-500">数据不足，先连续提交数据后再看能力分布。</p>
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
    <div className="space-y-4">
      {/* 图例 + 对比选择器 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
            我
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-zinc-300" />
            {compareLabel}
          </span>
        </div>
        <select
          value={comparePersonId}
          onChange={(e) => setComparePersonId(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-800 outline-none hover:border-zinc-300 focus:border-zinc-900"
        >
          <option value="">团队 P80</option>
          {teamMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* 雷达图 */}
      <div className="flex items-center justify-center" style={{ maxHeight: 240 }}>
        <svg
          viewBox="-55 -45 410 380"
          className="w-full max-w-[380px]"
          aria-label="六维能力雷达图"
        >
          {/* 网格 */}
          {Array.from({ length: LEVELS }, (_, level) => (
            <polygon
              key={level}
              points={buildGridPolygon(level + 1)}
              fill="none"
              stroke="#E4E4E7"
              strokeWidth="1"
            />
          ))}
          {/* 轴线 */}
          {Array.from({ length: DIMS }, (_, i) => {
            const { x, y } = polarToXY(MAX_RADIUS, i);
            return <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#E4E4E7" strokeWidth="1" />;
          })}
          {/* 对比区域 */}
          <polygon
            points={buildPolygonPoints(compareScores, 100)}
            fill="rgba(228,228,231,0.3)"
            stroke="#A1A1AA"
            strokeWidth="1.5"
            strokeDasharray="6,4"
          />
          {/* 我的区域 */}
          <polygon
            points={buildPolygonPoints(myScores, 100)}
            fill="rgba(217,119,87,0.08)"
            stroke="#D97757"
            strokeWidth="2"
          />
          {/* 对比数据点 */}
          {compareScores.map((score, i) => {
            const r = (Math.min(score, 100) / 100) * MAX_RADIUS;
            const { x, y } = polarToXY(r, i);
            const dimName = capabilityCards[i]?.name ?? `维度${i + 1}`;
            return (
              <circle key={`cmp-${i}`} cx={x} cy={y} r={3} fill="#A1A1AA" stroke="white" strokeWidth="1.5">
                <title>{`${dimName}（${compareLabel}）: ${score}分`}</title>
              </circle>
            );
          })}
          {/* 我的数据点（可点击） */}
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
                fill="#D97757"
                stroke="white"
                strokeWidth="1.5"
                className="cursor-pointer transition-[r,fill] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                onClick={() => setActiveIndex(isActive ? null : i)}
              >
                <title>{`${dimName}: ${score}分`}</title>
              </circle>
            );
          })}
          {/* 轴标签 */}
          {capabilityCards.map((card, i) => {
            const { x, y } = polarToXY(MAX_RADIUS + LABEL_OFFSET, i);
            const isActive = activeIndex === i;
            return (
              <text
                key={i}
                x={x}
                y={y + labelDyAdjust[i]}
                textAnchor={labelAnchors[i]}
                fontSize="12"
                fontWeight={isActive ? 700 : 600}
                fill={isActive ? "#09090B" : "#71717A"}
                className="cursor-pointer"
                onClick={() => setActiveIndex(isActive ? null : i)}
              >
                {card.name}
              </text>
            );
          })}
        </svg>
      </div>

      {/* 最强 / 最弱 — 极简标签 */}
      <div className="flex items-center justify-center gap-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px]">
          <span className="h-2 w-2 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
          <span className="text-zinc-500">最强</span>
          <span className="font-semibold text-zinc-800 tabular-nums">{capabilityCards[strongIndex]?.name}</span>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11px]">
          <span className="h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white" />
          <span className="text-zinc-500">最弱</span>
          <span className="font-semibold text-zinc-800 tabular-nums">{capabilityCards[weakIndex]?.name}</span>
        </div>
      </div>
    </div>
  );
}
