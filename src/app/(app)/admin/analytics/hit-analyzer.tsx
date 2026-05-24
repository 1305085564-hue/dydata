"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Input } from "@/components/ui/input";
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRID_PROPS,
} from "@/lib/chart-palette";
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
  lockedSubmitter?: string | null;
  onLockedSubmitterChange?: (submitter: string | null) => void;
}

interface ScatterDatum extends Report {
  cr: number;
  play: number;
  engagement: number;
  isHit: boolean;
}

type TimePreset = "1d" | "7d" | "30d" | "custom";

interface DateBounds {
  min: string;
  max: string;
}

const SUBMITTER_PAGE_SIZE = 9;

function parsePercent(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseFloat(value.replace("%", ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function parseSeconds(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseFloat(value.replace("秒", ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function formatPlayCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return value.toLocaleString("zh-CN");
}

function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("zh-CN");
}

function shiftDate(date: string, diffDays: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + diffDays);
  return next.toISOString().slice(0, 10);
}

function getDateBounds(reports: Report[]): DateBounds | null {
  const dates = reports.map((report) => report.report_date).filter(Boolean).sort();
  if (dates.length === 0) return null;
  return {
    min: dates[0],
    max: dates[dates.length - 1],
  };
}

function getPresetRange(preset: Exclude<TimePreset, "custom">, anchorDate: string) {
  if (preset === "1d") {
    return { start: anchorDate, end: anchorDate };
  }

  if (preset === "7d") {
    return { start: shiftDate(anchorDate, -6), end: anchorDate };
  }

  return { start: shiftDate(anchorDate, -29), end: anchorDate };
}

function getMatchingPreset(start: string, end: string, anchorDate: string): TimePreset {
  const presets: Array<Exclude<TimePreset, "custom">> = ["1d", "7d", "30d"];
  for (const preset of presets) {
    const range = getPresetRange(preset, anchorDate);
    if (range.start === start && range.end === end) {
      return preset;
    }
  }
  return "custom";
}

function getInitialTimeState(bounds: DateBounds | null) {
  if (!bounds) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      preset: "30d" as TimePreset,
      start: shiftDate(today, -29),
      end: today,
    };
  }

  const matchedPreset = getMatchingPreset(bounds.min, bounds.max, bounds.max);
  if (matchedPreset !== "custom") {
    return {
      preset: matchedPreset,
      start: bounds.min,
      end: bounds.max,
    };
  }

  const thirtyDayRange = getPresetRange("30d", bounds.max);
  if (bounds.min <= thirtyDayRange.start) {
    return {
      preset: "30d" as TimePreset,
      start: thirtyDayRange.start,
      end: bounds.max,
    };
  }

  return {
    preset: "custom" as TimePreset,
    start: bounds.min,
    end: bounds.max,
  };
}

function getScatterLead(data: ScatterDatum[]) {
  if (data.length === 0) return null;
  return [...data].sort((left, right) => {
    if (left.isHit !== right.isHit) return Number(right.isHit) - Number(left.isHit);
    if (left.play !== right.play) return right.play - left.play;
    return right.engagement - left.engagement;
  })[0];
}

function inDateRange(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function SummaryBucketCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number; pct: number }>;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3">
      <p className="text-[11px] font-semibold text-zinc-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <div key={item.label} className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px]">
            <span className="font-semibold tracking-tight text-zinc-700">{item.label}</span>
            <span className="ml-1 font-mono tabular-nums text-zinc-400">
              {item.count}条 ({item.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HitAnalyzer({
  reports,
  submitters,
  lockedSubmitter = null,
  onLockedSubmitterChange,
}: HitAnalyzerProps) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedSubmitters, setSelectedSubmitters] = useState<string[]>([]);
  const [submitterPage, setSubmitterPage] = useState(0);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [isScatterPanelOpen, setIsScatterPanelOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  const [isFloatingLayerMounted, setIsFloatingLayerMounted] = useState(false);

  const dateBounds = useMemo(() => getDateBounds(reports), [reports]);
  const initialTimeState = useMemo(() => getInitialTimeState(dateBounds), [dateBounds]);

  const [activeTimePreset, setActiveTimePreset] = useState<TimePreset>(initialTimeState.preset);
  const [dateFrom, setDateFrom] = useState(initialTimeState.start);
  const [dateTo, setDateTo] = useState(initialTimeState.end);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFloatingLayerMounted(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTimePreset(initialTimeState.preset);
    setDateFrom(initialTimeState.start);
    setDateTo(initialTimeState.end);
  }, [initialTimeState.end, initialTimeState.preset, initialTimeState.start]);

  useEffect(() => {
    if (!lockedSubmitter) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedSubmitters([]);
      return;
    }

    setSelectedSubmitters([lockedSubmitter]);
  }, [lockedSubmitter]);

  const hitThreshold = 100000;

  const filters = [
    { id: "all", label: "全部", filter: () => true },
    { id: "hit", label: "爆款 (>10w播放)", filter: (report: Report) => (report.play_count ?? 0) >= hitThreshold },
    {
      id: "potential",
      label: "高潜 (>5w播放 & >30%完播)",
      filter: (report: Report) => (report.play_count ?? 0) >= 50000 && (parsePercent(report.completion_rate) ?? 0) >= 30,
    },
    { id: "low", label: "低迷 (<1w播放)", filter: (report: Report) => (report.play_count ?? 0) < 10000 },
    {
      id: "high_interaction",
      label: "高互动",
      filter: (report: Report) =>
        ((report.likes ?? 0) + (report.comments ?? 0) + (report.shares ?? 0) + (report.favorites ?? 0)) > 1000,
    },
  ] as const;

  const timePresetOptions: Array<{ id: TimePreset; label: string }> = [
    { id: "1d", label: "1天" },
    { id: "7d", label: "7天" },
    { id: "30d", label: "30天" },
    { id: "custom", label: "自定义" },
  ];

  const activeFilterFn = filters.find((filter) => filter.id === activeFilter)?.filter ?? (() => true);
  const effectiveSelectedSubmitters = lockedSubmitter ? [lockedSubmitter] : selectedSubmitters;
  const submitterPageCount = Math.max(1, Math.ceil(submitters.length / SUBMITTER_PAGE_SIZE));
  const lockedSubmitterIndex = lockedSubmitter ? submitters.indexOf(lockedSubmitter) : -1;
  const safeSubmitterPage =
    lockedSubmitterIndex >= 0
      ? Math.floor(lockedSubmitterIndex / SUBMITTER_PAGE_SIZE)
      : Math.min(submitterPage, submitterPageCount - 1);

  function applyTimePreset(nextPreset: TimePreset) {
    setActiveTimePreset(nextPreset);

    if (!dateBounds) return;

    if (nextPreset === "custom") {
      setDateFrom((current) => current || dateBounds.min);
      setDateTo((current) => current || dateBounds.max);
      return;
    }

    const nextRange = getPresetRange(nextPreset, dateBounds.max);
    setDateFrom(nextRange.start);
    setDateTo(nextRange.end);
  }

  function updateCustomRange(field: "from" | "to", value: string) {
    if (!value) return;

    const nextFrom = field === "from" ? value : dateFrom;
    const nextTo = field === "to" ? value : dateTo;
    const normalizedFrom = nextFrom <= nextTo ? nextFrom : field === "from" ? nextFrom : nextTo;
    const normalizedTo = nextFrom <= nextTo ? nextTo : field === "from" ? nextFrom : nextTo;

    setDateFrom(normalizedFrom);
    setDateTo(normalizedTo);
    setActiveTimePreset(dateBounds ? getMatchingPreset(normalizedFrom, normalizedTo, dateBounds.max) : "custom");
  }

  const filtered = useMemo(() => {
    return reports.filter((report) => {
      if (effectiveSelectedSubmitters.length > 0 && !effectiveSelectedSubmitters.includes(report.submitter)) return false;
      if (dateFrom && dateTo && !inDateRange(report.report_date, dateFrom, dateTo)) return false;
      return activeFilterFn(report);
    });
  }, [activeFilterFn, dateFrom, dateTo, effectiveSelectedSubmitters, reports]);

  const stats = useMemo(() => {
    if (filtered.length === 0) return null;

    let totalPlay = 0;
    let totalCompletion = 0;
    let completionCount = 0;
    let totalDuration = 0;
    let durationCount = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalFavorites = 0;
    let hitCount = 0;
    let highCompletionCount = 0;
    let validScatterCount = 0;

    const contents: string[] = [];
    const completionValues: number[] = [];
    const titleLengths: number[] = [];
    const contentLengths: number[] = [];
    const timeSlotBuckets: Record<string, number> = {};
    const weekdayBuckets: Record<string, number> = {};
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

    for (const report of filtered) {
      const play = report.play_count ?? 0;
      const completion = parsePercent(report.completion_rate);
      const duration = parseSeconds(report.avg_play_duration);

      totalPlay += play;
      totalLikes += report.likes ?? 0;
      totalComments += report.comments ?? 0;
      totalShares += report.shares ?? 0;
      totalFavorites += report.favorites ?? 0;
      titleLengths.push((report.title ?? "").trim().length);

      if (play >= hitThreshold) hitCount += 1;
      if ((completion ?? 0) >= 30) highCompletionCount += 1;
      if ((completion ?? 0) > 0 && play > 0) validScatterCount += 1;

      if (completion !== null) {
        totalCompletion += completion;
        completionCount += 1;
        completionValues.push(completion);
      }

      if (duration !== null) {
        totalDuration += duration;
        durationCount += 1;
      }

      if (report.content) {
        contents.push(report.content);
        contentLengths.push(report.content.length);
      }

      if (report.published_at) {
        const date = new Date(report.published_at);
        const hour = date.getHours();
        const timeSlot =
          hour >= 6 && hour < 12
            ? "早间(6-12)"
            : hour >= 12 && hour < 14
              ? "午间(12-14)"
              : hour >= 14 && hour < 18
                ? "下午(14-18)"
                : hour >= 18 && hour < 22
                  ? "晚间(18-22)"
                  : "深夜(22-6)";

        timeSlotBuckets[timeSlot] = (timeSlotBuckets[timeSlot] ?? 0) + 1;
        weekdayBuckets[weekdays[date.getDay()]] = (weekdayBuckets[weekdays[date.getDay()]] ?? 0) + 1;
      }
    }

    const totalEngagement = totalLikes + totalComments + totalShares + totalFavorites;
    const sampleSize = filtered.length;

    const rangeToDistribution = (
      values: number[],
      ranges: Array<{ label: string; min: number; max: number }>,
      total: number,
    ) =>
      ranges.map((range) => {
        const count = values.filter((value) => value >= range.min && value < range.max).length;
        return {
          label: range.label,
          count,
          pct: total > 0 ? +((count / total) * 100).toFixed(1) : 0,
        };
      });

    return {
      count: sampleSize,
      avgPlay: totalPlay / sampleSize,
      avgCr: completionCount > 0 ? totalCompletion / completionCount : null,
      avgDur: durationCount > 0 ? totalDuration / durationCount : null,
      engagementRate: totalPlay > 0 ? (totalEngagement / totalPlay) * 100 : null,
      avgLikes: Math.round(totalLikes / sampleSize),
      avgComments: Math.round(totalComments / sampleSize),
      avgShares: Math.round(totalShares / sampleSize),
      avgFavorites: Math.round(totalFavorites / sampleSize),
      hitRate: (hitCount / sampleSize) * 100,
      highCompletionRate: (highCompletionCount / sampleSize) * 100,
      validScatterCount,
      contents,
      crDistribution:
        completionValues.length > 0
          ? rangeToDistribution(
              completionValues,
              [
                { label: "<20%", min: 0, max: 20 },
                { label: "20-35%", min: 20, max: 35 },
                { label: "35-50%", min: 35, max: 50 },
                { label: ">50%", min: 50, max: Number.POSITIVE_INFINITY },
              ],
              completionValues.length,
            )
          : null,
      titleLenDist: rangeToDistribution(
        titleLengths,
        [
          { label: "<10字", min: 0, max: 10 },
          { label: "10-20字", min: 10, max: 20 },
          { label: "20-30字", min: 20, max: 30 },
          { label: ">30字", min: 30, max: Number.POSITIVE_INFINITY },
        ],
        sampleSize,
      ),
      contentLenDist:
        contentLengths.length > 0
          ? rangeToDistribution(
              contentLengths,
              [
                { label: "<50字", min: 0, max: 50 },
                { label: "50-100字", min: 50, max: 100 },
                { label: "100-200字", min: 100, max: 200 },
                { label: ">200字", min: 200, max: Number.POSITIVE_INFINITY },
              ],
              contentLengths.length,
            )
          : null,
      timeSlotTop:
        Object.entries(timeSlotBuckets).length > 0
          ? Object.entries(timeSlotBuckets)
              .sort((left, right) => right[1] - left[1])
              .map(([slot, count]) => ({
                slot,
                count,
                pct: +((count / Object.values(timeSlotBuckets).reduce((sum, item) => sum + item, 0)) * 100).toFixed(1),
              }))
          : null,
      weekdayTop:
        Object.entries(weekdayBuckets).length > 0
          ? Object.entries(weekdayBuckets)
              .sort((left, right) => right[1] - left[1])
              .map(([day, count]) => ({
                day,
                count,
                pct: +((count / Object.values(weekdayBuckets).reduce((sum, item) => sum + item, 0)) * 100).toFixed(1),
              }))
          : null,
    };
  }, [filtered]);

  const scatterData = useMemo<ScatterDatum[]>(() => {
    return filtered
      .map((report) => {
        const completion = parsePercent(report.completion_rate) ?? 0;
        const play = report.play_count ?? 0;
        const engagement = (report.likes ?? 0) + (report.comments ?? 0) + (report.shares ?? 0) + (report.favorites ?? 0);
        return {
          ...report,
          cr: completion,
          play,
          engagement,
          isHit: play >= hitThreshold,
        };
      })
      .filter((datum) => datum.cr > 0 && datum.play > 0);
  }, [filtered]);

  useEffect(() => {
    if (scatterData.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActivePointId(null);
      return;
    }

    if (activePointId && scatterData.some((datum) => datum.id === activePointId)) return;
    setActivePointId(getScatterLead(scatterData)?.id ?? scatterData[0].id);
  }, [activePointId, scatterData]);

  const activePoint = useMemo(() => {
    if (scatterData.length === 0) return null;
    return scatterData.find((datum) => datum.id === activePointId) ?? getScatterLead(scatterData) ?? scatterData[0];
  }, [activePointId, scatterData]);

  const scatterSummary = useMemo(() => {
    if (scatterData.length === 0) return null;

    const averageCompletion = scatterData.reduce((sum, datum) => sum + datum.cr, 0) / scatterData.length;
    const highCompletionLine = Number(averageCompletion.toFixed(1));
    const distribution = { lead: 0, breakout: 0, story: 0, backlog: 0 };

    for (const datum of scatterData) {
      if (datum.play >= hitThreshold && datum.cr >= highCompletionLine) distribution.lead += 1;
      else if (datum.play >= hitThreshold) distribution.breakout += 1;
      else if (datum.cr >= highCompletionLine) distribution.story += 1;
      else distribution.backlog += 1;
    }

    return {
      highCompletionLine,
      distribution,
      lead: getScatterLead(scatterData),
    };
  }, [scatterData]);

  const leadInsight = activePoint ?? scatterSummary?.lead ?? null;

  const distributionCards = [
    {
      key: "lead",
      label: "高完播高播放",
      description: "最接近可复用爆款模板",
      count: scatterSummary?.distribution.lead ?? 0,
      tone: "border-zinc-200 bg-zinc-50 text-[#6FAA7D]",
    },
    {
      key: "breakout",
      label: "高播放待强化",
      description: "已有流量，但留存还有优化空间",
      count: scatterSummary?.distribution.breakout ?? 0,
      tone: "border-zinc-200 bg-zinc-50 text-[#C9604D]",
    },
    {
      key: "story",
      label: "高完播待放量",
      description: "内容承接不错，适合继续扩量测试",
      count: scatterSummary?.distribution.story ?? 0,
      tone: "border-zinc-200 bg-zinc-50 text-[#D97757]",
    },
    {
      key: "backlog",
      label: "基础待优化",
      description: "播放与完播都偏弱，建议优先排查前3秒",
      count: scatterSummary?.distribution.backlog ?? 0,
      tone: "border-zinc-200 bg-zinc-50 text-zinc-600",
    },
  ];

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: ScatterDatum }>;
  }) => {
    if (!active || !payload?.length) return null;
    const datum = payload[0]?.payload;
    if (!datum) return null;

    return (
      <div className="w-64 rounded-lg border border-zinc-200 bg-white p-2.5 shadow-[0_4px_12px_-6px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3">
          {datum.cover_url ? (
            <div className="relative h-32 w-full overflow-hidden rounded-lg bg-zinc-100">
              <img src={datum.cover_url} alt="视频封面" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <div>
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-800">
              {datum.title || "无标题视频"}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {datum.submitter} · {formatDate(datum.published_at) ?? datum.report_date}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 pt-1">
            <div>
              <p className="text-[12px] font-medium text-zinc-400">播放量</p>
              <p className={cn("text-[13px] font-medium", datum.isHit ? "text-[#C9604D]" : "text-zinc-700")}>{formatPlayCount(datum.play)}</p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-zinc-400">完播率</p>
              <p className="text-[13px] font-medium text-zinc-800">{formatPercent(datum.cr)}</p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-zinc-400">总互动</p>
              <p className="text-[13px] font-medium text-zinc-800">{datum.engagement.toLocaleString("zh-CN")}</p>
            </div>
            <div>
              <p className="text-[12px] font-medium text-zinc-400">提交人</p>
              <p className="text-[13px] font-medium text-zinc-800">{datum.submitter}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderScatterChart = (className?: string) => (
    <div className={cn("h-full w-full rounded-2xl border border-zinc-200 bg-white p-2 shadow-inner", className)}>
      {scatterData.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 18, right: 18, bottom: 14, left: 0 }}>
            <CartesianGrid {...CHART_GRID_PROPS} />
            <XAxis
              type="number"
              dataKey="cr"
              name="完播率"
              unit="%"
              axisLine={false}
              tickLine={false}
              tick={CHART_AXIS_TICK}
              domain={["auto", "auto"]}
            />
            <YAxis
              type="number"
              dataKey="play"
              name="播放量"
              axisLine={false}
              tickLine={false}
              tick={CHART_AXIS_TICK}
              tickFormatter={(value: number) => formatPlayCount(value)}
              domain={["auto", "auto"]}
            />
            <ZAxis type="number" dataKey="engagement" range={[54, 220]} name="互动量" />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#94a3b8" }} />
            <ReferenceLine
              y={hitThreshold}
              stroke={CHART_COLORS.danger}
              strokeDasharray="4 4"
              label={{
                position: "insideTopLeft",
                value: "10w+",
                fill: CHART_COLORS.danger,
                fontSize: 11,
                fontWeight: 600,
                offset: 8,
              }}
            />
            {scatterSummary ? (
              <ReferenceLine
                x={scatterSummary.highCompletionLine}
                stroke="#D97757"
                strokeDasharray="4 4"
                label={{
                  position: "insideBottomRight",
                  value: formatPercent(scatterSummary.highCompletionLine),
                  fill: "#D97757",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
            ) : null}
            <Scatter data={scatterData} shape="circle">
              {scatterData.map((datum, index) => {
                const isActive = datum.id === activePointId;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={datum.isHit ? "#C9604D" : "#A8C4B1"}
                    fillOpacity={isActive ? 0.98 : datum.isHit ? 0.84 : 0.62}
                    stroke={isActive ? "#27272a" : datum.isHit ? "#B55543" : "#D97757"}
                    strokeWidth={isActive ? 2.8 : datum.isHit ? 1.4 : 1}
                    style={{ cursor: "pointer" }}
                    onClick={() => setActivePointId(datum.id)}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center">
          <div className="flex flex-col items-center justify-center gap-0">
            <div className="relative flex h-[120px] w-[120px] items-center justify-center">
              <svg className="absolute inset-0" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="24" fill="none" stroke="#D4D4D8" strokeWidth="0.5" strokeDasharray="3,3" />
                <line x1="60" y1="36" x2="60" y2="84" stroke="#E4E4E7" strokeWidth="0.5" />
                <line x1="36" y1="60" x2="84" y2="60" stroke="#E4E4E7" strokeWidth="0.5" />
              </svg>
              <div
                className="relative h-2 w-2 rounded-full animate-float-y"
                style={{
                  background: "radial-gradient(circle, #E28D71 0%, #D97757 100%)",
                  boxShadow: "0 2px 6px rgba(217,119,87,0.3)",
                }}
              />
            </div>
            <p className="text-[13px] font-medium text-zinc-500 mt-4">暂无可绘制散点</p>
            <p className="text-[12px] text-zinc-400 mt-1">需要同时存在播放量和完播率。</p>
          </div>
        </div>
      )}
    </div>
  );

  const floatingScatterLayer = isFloatingLayerMounted
    ? createPortal(
        <>
          {!isScatterPanelOpen ? (
            <button
              type="button"
              onClick={() => setIsScatterPanelOpen(true)}
              className="fixed bottom-4 right-4 z-[90] rounded-full border border-zinc-200 bg-white px-4 py-2 text-[12px] font-medium text-zinc-700 shadow-sm shadow-zinc-900/10  transition-colors hover:bg-zinc-50 md:bottom-auto md:right-6 md:top-24"
            >
              散点图{scatterData.length > 0 ? ` · ${scatterData.length}` : ""}
            </button>
          ) : null}

          {isScatterPanelOpen ? (
            <div className="fixed inset-x-3 bottom-3 z-[90] flex h-[46vh] flex-col rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm md:inset-auto md:right-6 md:top-24 md:h-[260px] md:w-[520px]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">Scatter View</p>
                  <p className="truncate text-[13px] font-medium text-zinc-800">爆款特征散点图</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {scatterSummary ? (
                    <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600">
                      共 {scatterData.length} 个
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsScatterPanelOpen(false)}
                    className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
                  >
                    隐藏
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1">{renderScatterChart()}</div>
            </div>
          ) : null}
        </>,
        document.body,
      )
    : null;

  return (
    <div className="space-y-3" aria-label="爆款分析">
      {floatingScatterLayer}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">Quick Filters</span>
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={cn(
                  "rounded-lg border px-3 py-1 text-[12px] font-medium transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  activeFilter === filter.id
                    ? "border-[#D97757]/40 bg-white text-[#D97757]"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-white",
                )}
              >
                {filter.label}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">时间周期</span>
              {timePresetOptions.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyTimePreset(preset.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1 text-[12px] font-medium transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                    activeTimePreset === preset.id
                      ? "border-[#D97757]/40 bg-white text-[#D97757]"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-white",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]">
            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">Submitters</p>
              {lockedSubmitter ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 border-l-[2px] border-l-[#D97757] bg-zinc-50 px-3 py-2 text-[12px] text-zinc-600">
                  <span className="font-medium">当前联动成员：</span>
                  <span className="rounded-lg bg-white px-2.5 py-1 font-medium text-zinc-800">{lockedSubmitter}</span>
                  <button
                    type="button"
                    onClick={() => onLockedSubmitterChange?.(null)}
                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 font-medium text-zinc-700 transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50"
                  >
                    清除
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                <span className="rounded-full bg-white px-2.5 py-1 font-medium">已选 {effectiveSelectedSubmitters.length} 人</span>
                {submitterPageCount > 1 ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    <button
                      type="button"
                      onClick={() => setSubmitterPage((current) => Math.max(0, current - 1))}
                      disabled={safeSubmitterPage === 0}
 className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-[12px] font-medium text-zinc-500 transition-[background-color, color, box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50 hover:text-zinc-700 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                    >
                      上一页
                    </button>
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-[#D97757]/40 bg-white px-2 text-[12px] font-medium text-[#D97757] font-mono tabular-nums">
                      {safeSubmitterPage + 1}
                    </span>
                    <span className="text-[12px] text-zinc-400 font-mono tabular-nums">/ {submitterPageCount}</span>
                    <button
                      type="button"
                      onClick={() => setSubmitterPage((current) => Math.min(submitterPageCount - 1, current + 1))}
                      disabled={safeSubmitterPage >= submitterPageCount - 1}
 className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-[12px] font-medium text-zinc-500 transition-[background-color, color, box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50 hover:text-zinc-700 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                    >
                      下一页
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex max-h-[5.9rem] flex-wrap gap-1.5 overflow-hidden">
                {submitters
                  .slice(safeSubmitterPage * SUBMITTER_PAGE_SIZE, safeSubmitterPage * SUBMITTER_PAGE_SIZE + SUBMITTER_PAGE_SIZE)
                  .map((name) => (
                  <button
                    key={name}
                    onClick={() => {
                      if (lockedSubmitter) {
                        onLockedSubmitterChange?.(lockedSubmitter === name ? null : name);
                        return;
                      }

                      setSelectedSubmitters((current) => {
                        const next = current.includes(name)
                          ? current.filter((item) => item !== name)
                          : [...current, name];
                        onLockedSubmitterChange?.(next.length === 1 ? next[0] : null);
                        return next;
                      });
                    }}
                    className={cn(
                      "min-w-0 truncate rounded-full border px-2.5 py-1 text-xs font-medium transition-[background-color,color,border-color,transform,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] active:translate-y-0",
                      effectiveSelectedSubmitters.includes(name)
                        ? "bg-white text-zinc-700 shadow-sm"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800",
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">时间范围</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-800">
                    {dateFrom} 至 {dateTo}
                  </p>
                </div>
                {dateBounds ? (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-500">
                    当前页样本 {dateBounds.min} 至 {dateBounds.max}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-zinc-500">开始日期</p>
                  <Input
                    type="date"
                    value={dateFrom}
                    min={dateBounds?.min}
                    max={dateTo || dateBounds?.max}
                    disabled={activeTimePreset !== "custom"}
                    onChange={(event) => updateCustomRange("from", event.target.value)}
                    className="h-8 bg-zinc-50 border-transparent [accent-color:#D97757] focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-zinc-500">结束日期</p>
                  <Input
                    type="date"
                    value={dateTo}
                    min={dateFrom || dateBounds?.min}
                    max={dateBounds?.max}
                    disabled={activeTimePreset !== "custom"}
                    onChange={(event) => updateCustomRange("to", event.target.value)}
                    className="h-8 bg-zinc-50 border-transparent [accent-color:#D97757] focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {stats ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">筛选样本</p>
            <p className="mt-1 text-[18px] font-medium tracking-tight text-zinc-800 font-mono tabular-nums">{stats.count}</p>
            <p className="mt-1 text-xs text-zinc-500">其中 {stats.validScatterCount} 条可进入散点图分析</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">平均播放量</p>
            <p className="mt-1 text-[18px] font-medium tracking-tight text-zinc-800 font-mono tabular-nums">{formatPlayCount(stats.avgPlay)}</p>
            <p className="mt-1 text-xs text-zinc-500">爆款率 {formatPercent(stats.hitRate)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">平均完播率</p>
            <p className="mt-1 text-[18px] font-medium tracking-tight text-zinc-800 font-mono tabular-nums">
              {stats.avgCr !== null ? formatPercent(stats.avgCr) : "--"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">高完播样本占比 {formatPercent(stats.highCompletionRate)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">平均互动率</p>
            <p className="mt-1 text-[18px] font-medium tracking-tight text-zinc-800 font-mono tabular-nums">
              {stats.engagementRate !== null ? formatPercent(stats.engagementRate, 2) : "--"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">均值点赞 {stats.avgLikes.toLocaleString("zh-CN")}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">平均播放时长</p>
            <p className="mt-1 text-[18px] font-medium tracking-tight text-zinc-800 font-mono tabular-nums">
              {stats.avgDur !== null ? `${stats.avgDur.toFixed(1)}秒` : "--"}
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              均值评赞转藏 {stats.avgComments}/{stats.avgShares}/{stats.avgFavorites}
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">图表分析</p>
            <h3 className="text-[18px] font-medium text-zinc-800">爆款特征散点图</h3>
            <p className="text-xs text-zinc-500">
              先完成筛选和结果概览，再通过右上角悬浮散点图观察播放与完播的关系。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white" />
              <span className="font-medium text-zinc-600">爆款 (&gt;{formatPlayCount(hitThreshold)})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#A8C4B1] ring-1 ring-white" />
              <span className="font-medium text-zinc-600">常规视频</span>
            </div>
            {scatterSummary ? (
              <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 font-medium text-zinc-600">
                完播参考线 {formatPercent(scatterSummary.highCompletionLine)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">Focused Sample</p>
                <h4 className="mt-1 text-[18px] font-medium text-zinc-800">{leadInsight?.title || "暂无重点样本"}</h4>
              </div>
              {leadInsight ? (
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[12px] font-medium",
                    leadInsight.isHit ? "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700" : "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-zinc-700",
                  )}
                >
                  {leadInsight.isHit ? "爆款样本" : "观察样本"}
                </span>
              ) : null}
            </div>

            {leadInsight ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-zinc-50 p-3">
                    <p className="text-[11px] font-medium text-zinc-500">播放量</p>
                    <p className="mt-1 text-[24px] font-semibold text-zinc-800 font-mono tabular-nums tracking-tight">{formatPlayCount(leadInsight.play)}</p>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 p-3">
                    <p className="text-[11px] font-medium text-zinc-500">完播率</p>
                    <p className="mt-1 text-[24px] font-semibold text-zinc-800 font-mono tabular-nums tracking-tight">{formatPercent(leadInsight.cr)}</p>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 p-3">
                    <p className="text-[11px] font-medium text-zinc-500">总互动</p>
                    <p className="mt-1 text-[24px] font-semibold text-zinc-800 font-mono tabular-nums tracking-tight">{leadInsight.engagement.toLocaleString("zh-CN")}</p>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 p-3">
                    <p className="text-[11px] font-medium text-zinc-500">发布时间</p>
                    <p className="mt-1 text-[24px] font-semibold text-zinc-800 font-mono tabular-nums tracking-tight">{formatDate(leadInsight.published_at) ?? leadInsight.report_date}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">样本说明</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-700">
                    {leadInsight.submitter} 的这条视频位于
                    <span className="px-1 font-semibold text-zinc-800">{formatPercent(leadInsight.cr)}</span>
                    完播、
                    <span className="px-1 font-semibold text-zinc-800">{formatPlayCount(leadInsight.play)}</span>
                    播放区间，
                    {leadInsight.isHit ? "已经跨过爆款阈值，可优先复盘标题、前3秒和承接结构。" : "还处在待放量区间，适合继续观察素材承接与互动回流。"}
                  </p>
                </div>

                {leadInsight.content ? (
                  <div className="rounded-2xl border border-zinc-100 bg-white p-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">关联文案</p>
                    <p className="max-h-[12rem] overflow-y-auto whitespace-pre-wrap pr-2 text-sm leading-6 text-zinc-700">{leadInsight.content}</p>
                  </div>
                ) : null}

                {onLockedSubmitterChange ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onLockedSubmitterChange(leadInsight.submitter)}
                      className="inline-flex items-center rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[12px] font-medium text-zinc-700 transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100"
                    >
                      查看该作者全量样本
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
                当前筛选结果里没有可聚焦的散点样本。
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">维度说明</p>
              <div className="mt-4 space-y-3 text-sm text-zinc-600">
                <div className="rounded-2xl bg-zinc-50 p-3">
                  <p className="font-semibold text-zinc-800">X 轴：完播率</p>
                  <p className="mt-1 leading-6">越往右说明内容承接越强，用户更愿意继续看完。</p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-3">
                  <p className="font-semibold text-zinc-800">Y 轴：播放量</p>
                  <p className="mt-1 leading-6">越往上说明分发更强，跨过 10w 阈值后可以视作已进入爆款区。</p>
                </div>
                <div className="rounded-2xl bg-zinc-50 p-3">
                  <p className="font-semibold text-zinc-800">气泡：互动量</p>
                  <p className="mt-1 leading-6">气泡越大，代表点赞、评论、分享、收藏累计越高。</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">数据摘要</p>
                {scatterSummary ? (
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                    共 {scatterData.length} 个散点
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {distributionCards.map((card) => (
                  <div key={card.key} className={cn("rounded-2xl border p-3", card.tone)}>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{card.label}</p>
                        <p className="mt-1 text-xs leading-5 opacity-80">{card.description}</p>
                      </div>
                      <span className="text-[18px] font-medium font-mono tabular-nums">{card.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {stats ? (
        <div className="grid items-start gap-3 xl:grid-cols-2">
          <div className="flex self-start rounded-xl border border-zinc-200 bg-white p-4 shadow-sm xl:h-[405px] xl:flex-col">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">文案分析</p>
                <h4 className="mt-1 text-[18px] font-medium text-zinc-800">筛选文案样本</h4>
              </div>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
                {stats.contents.length} 条
              </span>
            </div>

            {stats.contents.length > 0 ? (
              <div className="mt-3 max-h-[320px] space-y-1 overflow-y-auto pr-1 xl:min-h-0 xl:flex-1">
                {stats.contents.map((content, index) => (
                  <div
                    key={`${index}-${content.slice(0, 8)}`}
 className="rounded-xl border border-zinc-200 border-l-[2px] border-l-transparent bg-[#FAFAFB] px-3 py-3 transition-[background-color, border-color, box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-l-[#D97757] hover:bg-white "
                  >
                    <p className="max-h-[10rem] overflow-y-auto whitespace-pre-wrap pr-2 text-[13px] leading-[1.7] text-zinc-700">{content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
                当前筛选结果里没有文案字段，已保留此区域以承接后续数据。
              </div>
            )}
          </div>

          <div className="flex self-start rounded-xl border border-zinc-200 bg-white p-4 shadow-sm xl:h-[405px] xl:flex-col">
            <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">规律总结</p>
            <div className="mt-3 grid gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:min-h-0 xl:flex-1">
              {stats.crDistribution ? <SummaryBucketCard title="完播率区间分布" items={stats.crDistribution} /> : null}
              <SummaryBucketCard title="标题长度分布" items={stats.titleLenDist} />
              {stats.contentLenDist ? <SummaryBucketCard title="文案长度分布" items={stats.contentLenDist} /> : null}
              {stats.timeSlotTop ? (
                <SummaryBucketCard
                  title="发布时间段分布"
                  items={stats.timeSlotTop.map((item) => ({ label: item.slot, count: item.count, pct: item.pct }))}
                />
              ) : null}
              {stats.weekdayTop ? (
                <SummaryBucketCard
                  title="发布星期分布"
                  items={stats.weekdayTop.map((item) => ({ label: item.day, count: item.count, pct: item.pct }))}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-5 text-sm text-zinc-500">
          当前筛选结果为空，分析摘要和文案分析会在有样本时自动恢复展示。
        </div>
      )}

    </div>
  );
}
