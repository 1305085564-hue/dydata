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
  const plays = series.flatMap((p) => p.totalPlay === null ? [] : [p.totalPlay]);
  const min = plays.length ? Math.min(...plays) : 0;
  const max = plays.length ? Math.max(...plays) : 0;
  const isFlat = max === min;

  const pointsData = series.map((p, i) => {
    if (p.totalPlay === null) return null;
    const x = count > 1 ? (i / (count - 1)) * 296 + 2 : 150;
    const y = isFlat ? 32 : 60 - ((p.totalPlay - min) / (max - min)) * 52;
    return { x, y };
  });

  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const point of pointsData) {
    if (point) current.push(point);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  const lastPoint = pointsData[pointsData.length - 1];
  const rectWidth = 300 / count;

  return (
    <div className="h-16 w-full">
      <svg
        viewBox="0 0 300 64"
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        {segments.map((segment) => segment.length === 1 ? (
          <circle key={segment[0].x} cx={segment[0].x} cy={segment[0].y} r="2.5" fill="#43718E" />
        ) : (
          <polyline
            key={segment[0].x}
            points={segment.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}
            fill="none"
            stroke="#43718E"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {lastPoint && segments.at(-1)!.length > 1 && (
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
