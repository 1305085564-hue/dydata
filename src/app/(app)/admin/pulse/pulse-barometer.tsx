"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { formatCount, type PulseSummary } from "./pulse-filters";
import { PulseSparkline } from "./pulse-sparkline";

interface PulseBarometerProps {
  summary: PulseSummary;
}

export function PulseBarometer({ summary }: PulseBarometerProps) {
  const { totalPlay, dayOverDayRate, worksCount, series } = summary;

  return (
    <Card className="rounded-xl shadow-card-ring bg-white p-4 sm:p-5">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 items-center">
        {/* 1. 总播放 */}
        <div>
          <div className="text-[12px] font-normal text-[#78716C]">总播放</div>
          <div className="mt-1 text-[20px] text-[#141413] tabular-nums leading-[1.30]">
            {totalPlay != null ? (
              formatCount(totalPlay)
            ) : (
              <span className="text-[#A8A29E] font-normal">—</span>
            )}
          </div>
        </div>

        {/* 2. 日环比 */}
        <div>
          <div className="text-[12px] font-normal text-[#78716C]">日环比</div>
          <div className="mt-1 text-[20px] tabular-nums leading-[1.30]">
            {dayOverDayRate === null ? (
              <span className="text-[#A8A29E] font-normal">—</span>
            ) : dayOverDayRate > 0 ? (
              <span className="text-[#6FAA7D]">↑ {dayOverDayRate.toFixed(1)}%</span>
            ) : dayOverDayRate < 0 ? (
              <span className="text-[#C0685C]">↓ {Math.abs(dayOverDayRate).toFixed(1)}%</span>
            ) : (
              <span className="text-[#78716C] font-normal">持平</span>
            )}
          </div>
        </div>

        {/* 3. 发片数 */}
        <div>
          <div className="text-[12px] font-normal text-[#78716C]">发片数</div>
          <div className="mt-1 text-[20px] text-[#141413] tabular-nums leading-[1.30]">
            {worksCount}
            <span className="text-[12px] font-normal text-[#78716C] ml-1">篇</span>
          </div>
        </div>

        {/* 4. 30 天 Sparkline */}
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="text-[12px] font-normal text-[#78716C] mb-1">30 天趋势</div>
          <PulseSparkline series={series} />
        </div>
      </div>
    </Card>
  );
}
