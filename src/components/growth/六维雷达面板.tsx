"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROWTH_DIMENSION_RULES, type GrowthRadarItem } from "@/lib/growth-page";

// ─── 雷达图大小常量 ───────────────────────────────────────────
const RADAR_SIZE = 300;
const CENTER = RADAR_SIZE / 2;
const MAX_RADIUS = 120;
const LEVELS = 4;
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

// 格式化不同维度的指标展示
function formatMetricValue(dimension: string, value: number) {
  if (dimension === "话题爆点") {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万次`;
    }
    return `${Math.round(value).toLocaleString("zh-CN")}次`;
  }
  return `${value.toFixed(1)}%`;
}

// 统一根据比例计算雷达图绘制半径 (团队均值固定在 75, 我的得分在 0 ~ 110 之间)
function getScores(item: GrowthRadarItem) {
  const isLowerBetter = item.dimension === "中段跳出";
  const ratio = isLowerBetter
    ? item.self > 0
      ? item.teamAvg / item.self
      : 1.1
    : item.teamAvg > 0
      ? item.self / item.teamAvg
      : 1.0;

  const teamScore = 75;
  const selfScore = Math.max(10, Math.min(115, ratio * 75));
  return { selfScore, teamScore };
}

interface 六维雷达面板Props {
  radar: GrowthRadarItem[];
  weakestDimension?: "开头留人" | "中段跳出" | "整体完播" | "增长转化" | "互动吸引" | "话题爆点" | null;
  /** 累积期锁定态：只画虚线空六边形骨架，不画任何数据形状 */
  locked?: boolean;
  lockedText?: string;
}

function 锁定雷达({ text }: { text: string }) {
  const dimensions = GROWTH_DIMENSION_RULES.map((rule) => rule.name);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex w-full max-w-[320px] items-center justify-center">
        <svg viewBox="-20 -20 340 340" className="w-full" aria-label="能力画像未解锁">
          {Array.from({ length: LEVELS }, (_, level) => {
            const radius = ((level + 1) / LEVELS) * MAX_RADIUS;
            const points = Array.from({ length: DIMS }, (_, i) => {
              const { x, y } = polarToXY(radius, i);
              return `${x},${y}`;
            }).join(" ");
            return (
              <polygon
                key={level}
                points={points}
                fill="none"
                stroke="#E7E5E4"
                strokeWidth="1"
                strokeDasharray="4,3"
              />
            );
          })}
          {dimensions.map((dimension, i) => {
            const { x, y } = polarToXY(MAX_RADIUS + 16, i);
            let textAnchor: "start" | "end" | "middle" = "middle";
            if (i === 1 || i === 2) textAnchor = "start";
            if (i === 4 || i === 5) textAnchor = "end";
            return (
              <text key={dimension} x={x} y={y + 4} textAnchor={textAnchor} fontSize="11" fill="#A8A29E" className="select-none">
                {dimension}
              </text>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm">
            <Lock className="h-4.5 w-4.5" />
          </span>
        </div>
      </div>
      <p className="max-w-[260px] text-center text-[12px] leading-[1.6] text-stone-500">{text}</p>
    </div>
  );
}

export function SixRadarPanel({ radar, weakestDimension, locked = false, lockedText }: 六维雷达面板Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (locked) {
    return <锁定雷达 text={lockedText ?? "随日报积累自动解锁。解锁前不画假形状。"} />;
  }

  if (!radar || radar.length === 0) {
    return (
      <div className="flex h-[280px] flex-col items-center justify-center rounded-xl bg-stone-50 border border-stone-200">
        <p className="text-[13px] text-stone-500">暂无雷达数据，请先提交日报</p>
      </div>
    );
  }

  const hasTeamBaseline = radar.some((item) => item.teamAvg > 0);

  if (!hasTeamBaseline) {
    return (
      <div className="space-y-4">
        <p className="text-[13px] leading-[1.7] text-stone-500">团队暂无可比样本，以下只列你的真实指标，不生成虚拟基准。</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {radar.map((item) => (
            <div key={item.dimension} className="border-t border-stone-200 pt-3">
              <dt className="text-[12px] text-stone-500">{item.dimension}</dt>
              <dd className="mt-1 text-[13px] font-medium tabular-nums text-stone-900">
                {formatMetricValue(item.dimension, item.self)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  // 计算多边形点
  const buildPolygonPoints = (type: "self" | "team") => {
    return radar
      .map((item, i) => {
        const { selfScore, teamScore } = getScores(item);
        const score = type === "self" ? selfScore : teamScore;
        const { x, y } = polarToXY((score / 100) * MAX_RADIUS, i);
        return `${x},${y}`;
      })
      .join(" ");
  };

  const myPoints = buildPolygonPoints("self");
  const teamPoints = buildPolygonPoints("team");

  return (
    <div className="flex flex-col items-center gap-4">
      {/* 顶部简易图例 */}
      <div className="flex w-full items-center justify-between gap-2 border-b border-stone-100 pb-3">
        <div className="flex items-center gap-4 text-[12px] text-stone-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#D97757]" />
            我
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 border border-dashed border-stone-400 bg-stone-100/50" />
            团队均值基准
          </span>
        </div>
        <span className="text-[12px] text-stone-500">
          最弱项：<span className="font-medium text-rose-600">{weakestDimension}</span>
        </span>
      </div>

      {/* SVG 画布 */}
      <div className="relative flex items-center justify-center w-full max-w-[320px]">
        <svg
          viewBox="-20 -20 340 340"
          className="w-full"
          aria-label="六维能力雷达图"
        >
          {/* 雷达网格 (同心六边形) */}
          {Array.from({ length: LEVELS }, (_, level) => {
            const radius = ((level + 1) / LEVELS) * MAX_RADIUS;
            const points = Array.from({ length: DIMS }, (_, i) => {
              const { x, y } = polarToXY(radius, i);
              return `${x},${y}`;
            }).join(" ");

            return (
              <polygon
                key={level}
                points={points}
                fill="none"
                stroke="#E7E5E4"
                strokeWidth="1"
              />
            );
          })}

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
                stroke="#E7E5E4"
                strokeWidth="1"
              />
            );
          })}

          {/* 团队均值多边形 (背景虚线) */}
          <polygon
            points={teamPoints}
            fill="rgba(214, 211, 209, 0.15)"
            stroke="#A8A29E"
            strokeWidth="1.5"
            strokeDasharray="4,3"
          />

          {/* 我的多边形 (橙色主视觉) */}
          <polygon
            points={myPoints}
            fill="rgba(217, 119, 87, 0.06)"
            stroke="#D97757"
            strokeWidth="2.5"
          />

          {/* 团队数据点 */}
          {radar.map((item, i) => {
            const { teamScore } = getScores(item);
            const { x, y } = polarToXY((teamScore / 100) * MAX_RADIUS, i);
            return (
              <circle
                key={`team-dot-${i}`}
                cx={x}
                cy={y}
                r={2.5}
                fill="#A8A29E"
                stroke="white"
                strokeWidth="1"
              />
            );
          })}

          {/* 我的数据点 (高亮交互) */}
          {radar.map((item, i) => {
            const { selfScore } = getScores(item);
            const { x, y } = polarToXY((selfScore / 100) * MAX_RADIUS, i);
            const isHovered = hoveredIndex === i;
            const isWeakest = item.dimension === weakestDimension;

            return (
              <circle
                key={`self-dot-${i}`}
                cx={x}
                cy={y}
                r={isHovered ? 6 : isWeakest ? 5.5 : 4}
                fill={isWeakest ? "#C9604D" : "#D97757"}
                stroke="white"
                strokeWidth="1.5"
                className="cursor-pointer transition-[r,fill] duration-150"
                tabIndex={0}
                aria-label={`${item.dimension}：我 ${formatMetricValue(item.dimension, item.self)}，团队均值 ${formatMetricValue(item.dimension, item.teamAvg)}`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(i)}
                onBlur={() => setHoveredIndex(null)}
              />
            );
          })}

          {/* 轴标签文本 */}
          {radar.map((item, i) => {
            // 计算文字位置，往外偏一点
            const isWeakest = item.dimension === weakestDimension;
            const { x, y } = polarToXY(MAX_RADIUS + 16, i);
            const isHovered = hoveredIndex === i;

            let textAnchor: "start" | "end" | "middle" = "middle";
            if (i === 1 || i === 2) textAnchor = "start";
            if (i === 4 || i === 5) textAnchor = "end";

            return (
              <text
                key={`label-${i}`}
                x={x}
                y={y + 4}
                textAnchor={textAnchor}
                fontSize="11"
                fontWeight={isHovered || isWeakest ? "600" : "400"}
                fill={isWeakest ? "#C9604D" : isHovered ? "#1C1917" : "#78716C"}
                className="cursor-pointer transition-colors duration-150 select-none"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {item.dimension}
              </text>
            );
          })}
        </svg>

        {/* 悬浮浮窗，显示详细指标对比 */}
        {hoveredIndex !== null && (
          <div className="absolute top-[35%] left-1/2 z-10 -translate-x-1/2 rounded-lg border border-stone-200 bg-white/95 px-3 py-2 text-[12px] shadow-md backdrop-blur-sm pointer-events-none">
            <p className="font-medium text-stone-900 border-b border-stone-100 pb-1 mb-1">
              {radar[hoveredIndex].dimension}
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-stone-500">
              <span>我：</span>
              <span className="font-medium text-[#B4532F] text-right">
                {formatMetricValue(radar[hoveredIndex].dimension, radar[hoveredIndex].self)}
              </span>
              <span>团队均值：</span>
              <span className="font-medium text-stone-900 text-right">
                {formatMetricValue(radar[hoveredIndex].dimension, radar[hoveredIndex].teamAvg)}
              </span>
              <span>评级：</span>
              <span
                className={cn(
                  "font-medium text-right",
                  radar[hoveredIndex].rating === "strong" && "text-emerald-600",
                  radar[hoveredIndex].rating === "weak" && "text-rose-600",
                  radar[hoveredIndex].rating === "mid" && "text-amber-600"
                )}
              >
                {radar[hoveredIndex].rating === "strong" ? "强" : radar[hoveredIndex].rating === "weak" ? "弱" : "中"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 底部雷达卡片能力对照表 */}
      <div className="grid w-full grid-cols-3 gap-2 border-t border-stone-100 pt-3">
        {radar.map((item) => {
          const isWeak = item.rating === "weak";
          const isStrong = item.rating === "strong";
          return (
            <div
              key={item.dimension}
              className={cn(
                "flex flex-col items-center justify-center rounded-lg py-1.5 text-center transition-all",
                isWeak && "bg-rose-50/50 border border-rose-100",
                isStrong && "bg-emerald-50/50 border border-emerald-100",
                !isWeak && !isStrong && "bg-stone-50 border border-stone-200"
              )}
            >
              <span className="text-[11px] font-medium text-stone-500">{item.dimension}</span>
              <span
                className={cn(
                  "text-[12px] font-medium mt-0.5",
                  isWeak && "text-rose-700",
                  isStrong && "text-emerald-700",
                  !isWeak && !isStrong && "text-stone-900"
                )}
              >
                {formatMetricValue(item.dimension, item.self)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { SixRadarPanel as 六维雷达面板 };
