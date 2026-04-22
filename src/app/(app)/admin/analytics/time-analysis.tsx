"use client";

import { useMemo } from "react";
import { Clock, Flame, Info } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface Report {
  id: string;
  report_date: string;
  play_count: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  published_at?: string | null;
  uploaded_at?: string;
}

interface TimeAnalysisProps {
  reports: Report[];
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Helper to convert JS getDay() (0=Sun...6=Sat) to our index (0=Mon...6=Sun)
function getWeekdayIndex(date: Date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function TimeAnalysis({ reports }: TimeAnalysisProps) {
  const heatmapData = useMemo(() => {
    // Initialize 7x24 grid with nulls
    const grid: { count: number; totalPlay: number; medianPlay: number | null; plays: number[] }[][] = Array(7).fill(null).map(() => 
      Array(24).fill(null).map(() => ({ count: 0, totalPlay: 0, medianPlay: null, plays: [] }))
    );

    const eligibleReports = reports.filter(r => r.published_at && r.play_count !== null);
    
    // Fill grid
    for (const r of eligibleReports) {
      const d = new Date(r.published_at!);
      const wIdx = getWeekdayIndex(d);
      const hIdx = d.getHours();
      
      const cell = grid[wIdx][hIdx];
      cell.count++;
      cell.totalPlay += r.play_count!;
      cell.plays.push(r.play_count!);
    }

    // Calculate medians and find max values for coloring
    let maxMedianPlay = 0;
    
    for (let w = 0; w < 7; w++) {
      for (let h = 0; h < 24; h++) {
        const cell = grid[w][h];
        if (cell.count > 0) {
          const sorted = [...cell.plays].sort((a, b) => a - b);
          cell.medianPlay = sorted[Math.floor(sorted.length / 2)];
          if (cell.medianPlay > maxMedianPlay) maxMedianPlay = cell.medianPlay;
        }
      }
    }

    // Find the best time window (3x3 area with highest density)
    let bestWindow = { w: -1, h: -1, score: 0 };
    
    for (let w = 0; w < 7; w++) {
      for (let h = 0; h < 22; h++) { // Only look for windows up to 22:00
        let score = 0;
        let count = 0;
        // Check 1x3 window (3 hours on a specific day)
        for (let dw = 0; dw < 1; dw++) {
          for (let dh = 0; dh < 3; dh++) {
            const cell = grid[(w + dw) % 7][h + dh];
            if (cell.count > 0 && cell.medianPlay) {
              score += cell.medianPlay * cell.count; // Weight by count for stability
              count += cell.count;
            }
          }
        }
        if (count >= 3 && score > bestWindow.score) {
          bestWindow = { w, h, score };
        }
      }
    }

    return { grid, maxMedianPlay, bestWindow, totalEligible: eligibleReports.length };
  }, [reports]);

  if (heatmapData.totalEligible === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="暂无发布时间数据"
        description="需要包含发布时间（published_at）的报告来生成时间热力图"
      />
    );
  }

  function formatPlayCount(val: number | null) {
    if (val === null) return "—";
    if (val >= 10000) return `${(val / 10000).toFixed(1)}w`;
    return val.toLocaleString("zh-CN");
  }

  // Get color intensity based on value relative to max
  const getIntensityClass = (value: number | null, max: number) => {
    if (value === null || value === 0) return "bg-slate-50 border-slate-100";
    const ratio = value / max;
    if (ratio > 0.8) return "bg-[linear-gradient(135deg,var(--color-rose-500,#f43f5e)_0%,var(--color-rose-600,#e11d48)_100%)] text-white border-transparent shadow-sm";
    if (ratio > 0.6) return "bg-rose-400 text-white border-transparent shadow-sm";
    if (ratio > 0.4) return "bg-rose-300 text-white border-transparent";
    if (ratio > 0.2) return "bg-rose-200 text-rose-900 border-transparent";
    return "bg-rose-100 text-rose-800 border-transparent";
  };

  const { grid, maxMedianPlay, bestWindow } = heatmapData;

  const getBestWindowString = () => {
    if (bestWindow.w === -1) return "暂无足够数据推荐";
    const day = WEEKDAYS[bestWindow.w];
    const hourStart = bestWindow.h;
    const hourEnd = bestWindow.h + 2; // 3 hour window (0, 1, 2)
    return `${day} ${String(hourStart).padStart(2, '0')}:00 - ${String(hourEnd).padStart(2, '0')}:59`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h3 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">发布时间热力图</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">颜色越深代表该时段的播放量中位数越高。寻找深色密集的"高潜窗口"。</p>
        </div>
        
        {bestWindow.w !== -1 && (
          <div className="relative overflow-hidden rounded-2xl border border-rose-200/60 bg-[linear-gradient(135deg,rgba(255,241,242,0.8)_0%,rgba(255,228,230,0.5)_100%)] px-5 py-3 shadow-[0_2px_10px_rgba(225,29,72,0.06)] backdrop-blur-sm">
            <div className="absolute -right-4 -top-4 size-16 rounded-full bg-rose-500/10 blur-xl"></div>
            <div className="relative flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-rose-100 text-rose-600 shadow-inner">
                <Flame className="size-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-rose-500">🔥 黄金发布窗口</p>
                <p className="text-base font-black tracking-tight text-rose-950 mt-0.5">{getBestWindowString()}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] p-6 shadow-[var(--shadow-card)] backdrop-blur-xl overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header row (Hours) */}
          <div className="flex mb-2 pl-12">
            {HOURS.map(h => (
              <div key={h} className="flex-1 text-center text-[10px] font-semibold text-slate-400">
                {h % 2 === 0 ? h : ""}
              </div>
            ))}
          </div>

          {/* Grid rows (Days) */}
          <div className="space-y-1.5 relative">
            {/* Highlight box for best window */}
            {bestWindow.w !== -1 && (
              <div 
                className="absolute border-2 border-rose-500 rounded-lg pointer-events-none z-10 transition-all duration-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                style={{
                  top: `${bestWindow.w * (32 + 6)}px`, // row height + gap
                  left: `calc(3rem + ${bestWindow.h * (100 / 24)}%)`, // 3rem offset + hour offset
                  width: `${3 * (100 / 24)}%`, // 3 hours wide
                  height: `32px`, // 1 row high
                }}
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm whitespace-nowrap">
                  最佳表现区
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-[3px] border-transparent border-t-rose-500"></div>
                </div>
              </div>
            )}

            {WEEKDAYS.map((day, w) => (
              <div key={day} className="flex items-center h-8">
                <div className="w-12 text-[11px] font-bold text-slate-600 shrink-0">
                  {day}
                </div>
                <div className="flex flex-1 h-full gap-1 relative z-0">
                  {HOURS.map((hour, h) => {
                    const cell = grid[w][h];
                    const isPartOfBestWindow = bestWindow.w === w && h >= bestWindow.h && h < bestWindow.h + 3;
                    return (
                      <div 
                        key={hour} 
                        className="flex-1 group relative h-full"
                      >
                        <div 
                          className={cn(
                            "h-full w-full rounded-md border transition-all duration-300", 
                            getIntensityClass(cell.medianPlay, maxMedianPlay),
                            isPartOfBestWindow ? "scale-110 shadow-sm z-10 relative" : "hover:scale-110 hover:shadow-md hover:z-20",
                            cell.count === 0 && "opacity-50"
                          )}
                        />
                        
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-max max-w-[180px] rounded-xl border border-white/60 bg-white/95 p-3 shadow-xl backdrop-blur-md group-hover:block z-50 pointer-events-none">
                          <p className="text-[11px] font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1.5">{day} {hour}:00 - {hour}:59</p>
                          <div className="space-y-1.5">
                            <div className="flex justify-between gap-4 text-xs">
                              <span className="text-slate-500">播放中位数</span>
                              <span className="font-bold text-slate-900">{formatPlayCount(cell.medianPlay)}</span>
                            </div>
                            <div className="flex justify-between gap-4 text-[10px]">
                              <span className="text-slate-500">样本数</span>
                              <span className="font-semibold text-slate-700">{cell.count} 条</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="flex items-start gap-2 rounded-xl bg-blue-50/50 p-3 text-sm text-blue-800 border border-blue-100/50">
         <Info className="size-4 shrink-0 mt-0.5 text-blue-500" />
         <p className="leading-relaxed text-[13px]">
           热力图基于历史发布数据的<strong className="font-semibold mx-0.5">播放量中位数</strong>生成。我们为您标记了连贯的高表现时段（连续3小时内的最高密度表现区）作为建议发布窗口。
         </p>
      </div>
    </div>
  );
}
