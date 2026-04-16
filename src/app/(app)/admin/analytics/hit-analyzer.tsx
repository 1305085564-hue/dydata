"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from "recharts";
import { cn } from "@/lib/utils";

interface Report {
  id: string;
  submitter: string;
  title: string | null;
  report_date: string;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  content?: string | null;
  published_at?: string | null;
  uploaded_at?: string;
  cover_url?: string | null;
}

interface HitAnalyzerProps {
  reports: Report[];
  submitters: string[];
}

function parsePercent(val: string | null): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace("%", ""));
  return isNaN(n) ? null : n;
}

function parseSeconds(val: string | null): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace("秒", ""));
  return isNaN(n) ? null : n;
}

function formatPlayCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return value.toLocaleString("zh-CN");
}

export function HitAnalyzer({ reports, submitters }: HitAnalyzerProps) {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedSubmitters, setSelectedSubmitters] = useState<string[]>([]);

  function toggleSubmitter(name: string) {
    setSelectedSubmitters((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  const HIT_THRESHOLD = 100000;

  const filters = [
    { id: "all", label: "全部", filter: () => true },
    { id: "hit", label: "爆款 (>10w播放)", filter: (r: Report) => (r.play_count || 0) >= 100000 },
    { id: "potential", label: "高潜 (>5w播放 & >30%完播)", filter: (r: Report) => (r.play_count || 0) >= 50000 && (parsePercent(r.completion_rate) || 0) >= 30 },
    { id: "low", label: "低迷 (<1w播放)", filter: (r: Report) => (r.play_count || 0) < 10000 },
    { id: "high_interaction", label: "高互动", filter: (r: Report) => ((r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.favorites || 0)) > 1000 },
  ];

  const activeFilterFn = filters.find((f) => f.id === activeFilter)?.filter || (() => true);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (selectedSubmitters.length > 0 && !selectedSubmitters.includes(r.submitter)) return false;
      return activeFilterFn(r);
    });
  }, [reports, selectedSubmitters, activeFilterFn]);

  const scatterData = useMemo(() => {
    return filtered.map(r => {
      const cr = parsePercent(r.completion_rate) || 0;
      const play = r.play_count || 0;
      const engagement = (r.likes || 0) + (r.comments || 0) + (r.shares || 0) + (r.favorites || 0);
      return {
        ...r,
        cr,
        play,
        engagement,
        isHit: play >= HIT_THRESHOLD
      };
    }).filter(d => d.cr > 0 && d.play > 0);
  }, [filtered]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-xl border border-white/60 bg-white/95 p-4 shadow-xl backdrop-blur-md w-64">
          <div className="flex flex-col gap-3">
            {data.cover_url && (
              <div className="h-32 w-full rounded-lg bg-slate-100 overflow-hidden relative">
                <img src={data.cover_url} alt="Cover" className="object-cover w-full h-full" />
              </div>
            )}
            <div>
              <p className="font-semibold text-[var(--color-text-primary)] line-clamp-2 leading-tight text-sm">
                {data.title || "无标题视频"}
              </p>
              <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">{data.submitter} · {data.published_at ? new Date(data.published_at).toLocaleDateString() : data.report_date}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mt-1 pt-3 border-t border-slate-100">
               <div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] font-medium">播放量</p>
                  <p className={cn("text-sm font-bold", data.isHit ? "text-rose-600" : "text-slate-700")}>{formatPlayCount(data.play)}</p>
               </div>
               <div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] font-medium">完播率</p>
                  <p className="text-sm font-bold text-slate-700">{data.cr}%</p>
               </div>
               <div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] font-medium">总互动</p>
                  <p className="text-sm font-bold text-slate-700">{data.engagement}</p>
               </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* 快捷筛选器 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--color-text-secondary)] mr-2 uppercase tracking-wider">Quick Filters</span>
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-300",
              activeFilter === filter.id
                ? "bg-[var(--color-primary)] text-white shadow-md shadow-blue-500/20"
                : "bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white hover:border-slate-300"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* 提交人筛选 */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {submitters.map((name) => (
            <button
              key={name}
              onClick={() => toggleSubmitter(name)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors border",
                selectedSubmitters.includes(name)
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-200 bg-transparent text-slate-600 hover:border-slate-300 hover:bg-white/50"
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* 散点图可视化 */}
      <div className="rounded-3xl border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.8)_0%,rgba(248,250,252,0.6)_100%)] p-6 shadow-sm backdrop-blur-xl">
        <div className="mb-6 flex items-center justify-between">
           <div>
              <h3 className="text-lg font-bold text-[var(--color-text-primary)]">爆款特征散点图</h3>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">横轴：完播率 | 纵轴：播放量 | 气泡大小：互动量</p>
           </div>
           <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                 <span className="size-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
                 <span className="font-medium text-slate-600">爆款 (&gt;{formatPlayCount(HIT_THRESHOLD)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                 <span className="size-2.5 rounded-full bg-blue-400"></span>
                 <span className="font-medium text-slate-600">常规视频</span>
              </div>
           </div>
        </div>
        
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                type="number" 
                dataKey="cr" 
                name="完播率" 
                unit="%" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                domain={['auto', 'auto']}
              />
              <YAxis 
                type="number" 
                dataKey="play" 
                name="播放量" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickFormatter={(val) => formatPlayCount(val)}
                domain={['auto', 'auto']}
              />
              <ZAxis 
                type="number" 
                dataKey="engagement" 
                range={[60, 400]} 
                name="互动量" 
              />
              <Tooltip 
                content={<CustomTooltip />} 
                cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }}
              />
              <ReferenceLine 
                y={HIT_THRESHOLD} 
                stroke="#f43f5e" 
                strokeDasharray="4 4" 
                label={{ 
                  position: 'insideTopLeft', 
                  value: '爆款阈值线 (10w+)', 
                  fill: '#f43f5e',
                  fontSize: 12,
                  fontWeight: 600,
                  offset: 10
                }} 
              />
              <Scatter data={scatterData} shape="circle">
                {scatterData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.isHit ? "#f43f5e" : "#60a5fa"} 
                    fillOpacity={entry.isHit ? 0.8 : 0.6}
                    stroke={entry.isHit ? "#e11d48" : "#3b82f6"}
                    strokeWidth={1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
