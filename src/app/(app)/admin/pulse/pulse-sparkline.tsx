"use client";

import React from "react";
import { formatCount, type PulseDayPoint } from "./pulse-filters";

interface PulseSparklineProps {
  series: PulseDayPoint[];
}

export function PulseSparkline({ series }: PulseSparklineProps) {
  if (!series || series.length === 0) {
    return <div className="h-16 w-full" />;
  }

  const count = series.length;
  const plays = series.map((p) => p.totalPlay ?? 0);
  const min = Math.min(...plays);
  const max = Math.max(...plays);
  const isFlat = max === min;

  const pointsData = series.map((p, i) => {
    const x = count > 1 ? (i / (count - 1)) * 296 + 2 : 150;
    const playVal = p.totalPlay ?? 0;
    const y = isFlat ? 32 : 60 - ((playVal - min) / (max - min || 1)) * 52 + 6;
    return { x, y, point: p };
  });

  const pointsString = pointsData.map((d) => `${d.x.toFixed(2)},${d.y.toFixed(2)}`).join(" ");
  const lastPoint = pointsData[pointsData.length - 1];
  const rectWidth = 300 / count;

  return (
    <div className="h-16 w-full">
      <svg
        viewBox="0 0 300 64"
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        <polyline
          points={pointsString}
          fill="none"
          stroke="#43718E"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {lastPoint && (
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r="2.5"
            fill="#43718E"
          />
        )}
        {series.map((item, i) => {
          const rectX = i * rectWidth;
          return (
            <rect
              key={item.date}
              x={rectX}
              y={0}
              width={rectWidth}
              height={64}
              fill="transparent"
            >
              <title>{`${item.date.slice(5)} · 播放 ${formatCount(item.totalPlay)} · 发片 ${item.worksCount} 篇`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
