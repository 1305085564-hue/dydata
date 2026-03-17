"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Report {
  id: string;
  submitter: string;
  title: string;
  report_date: string;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  follower_gain: number;
  follower_convert: number | null;
  content?: string | null;
  published_at?: string | null;
  uploaded_at?: string;
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

export function HitAnalyzer({ reports, submitters }: HitAnalyzerProps) {
  const [mode, setMode] = useState<"hit" | "low">("hit");
  const [playMin, setPlayMin] = useState("");
  const [playMax, setPlayMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [crMin, setCrMin] = useState("");
  const [crMax, setCrMax] = useState("");
  const [selectedSubmitters, setSelectedSubmitters] = useState<string[]>([]);

  function toggleSubmitter(name: string) {
    setSelectedSubmitters((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  function applyPreset(min: string, max: string) {
    setPlayMin(min);
    setPlayMax(max);
  }

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      const play = r.play_count ?? 0;
      if (playMin && play < Number(playMin) * 10000) return false;
      if (playMax && play > Number(playMax) * 10000) return false;
      if (dateFrom && r.report_date < dateFrom) return false;
      if (dateTo && r.report_date > dateTo) return false;
      const cr = parsePercent(r.completion_rate);
      if (crMin && (cr === null || cr < Number(crMin))) return false;
      if (crMax && (cr !== null && cr > Number(crMax))) return false;
      if (selectedSubmitters.length > 0 && !selectedSubmitters.includes(r.submitter)) return false;
      return true;
    });
  }, [reports, playMin, playMax, dateFrom, dateTo, crMin, crMax, selectedSubmitters]);

  const stats = useMemo(() => {
    if (filtered.length === 0) return null;
    let totalPlay = 0, totalCr = 0, crCount = 0, totalDur = 0, durCount = 0;
    let totalLikes = 0, totalComments = 0, totalShares = 0, totalFavorites = 0;
    const contents: string[] = [];

    // 规律总结用的原始数据
    const crValues: number[] = [];
    const titleLengths: number[] = [];
    const contentLengths: number[] = [];
    const hourBuckets: Record<string, number> = {};
    const weekdayBuckets: Record<string, number> = {};
    const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

    for (const r of filtered) {
      totalPlay += r.play_count ?? 0;
      const cr = parsePercent(r.completion_rate);
      if (cr !== null) { totalCr += cr; crCount++; crValues.push(cr); }
      const dur = parseSeconds(r.avg_play_duration);
      if (dur !== null) { totalDur += dur; durCount++; }
      totalLikes += r.likes;
      totalComments += r.comments;
      totalShares += r.shares;
      totalFavorites += r.favorites;
      if (r.content) { contents.push(r.content); contentLengths.push(r.content.length); }
      titleLengths.push(r.title.length);

      if (r.published_at) {
        const d = new Date(r.published_at);
        const h = d.getHours();
        const slot = h >= 6 && h < 12 ? "早间(6-12)" : h >= 12 && h < 14 ? "午间(12-14)" : h >= 14 && h < 18 ? "下午(14-18)" : h >= 18 && h < 22 ? "晚间(18-22)" : "深夜(22-6)";
        hourBuckets[slot] = (hourBuckets[slot] ?? 0) + 1;
        weekdayBuckets[WEEKDAYS[d.getDay()]] = (weekdayBuckets[WEEKDAYS[d.getDay()]] ?? 0) + 1;
      }
    }

    const totalEngagement = totalLikes + totalComments + totalShares + totalFavorites;
    const n = filtered.length;

    // 完播率区间分布
    const crRanges = [
      { label: "<20%", min: 0, max: 20 },
      { label: "20-35%", min: 20, max: 35 },
      { label: "35-50%", min: 35, max: 50 },
      { label: ">50%", min: 50, max: 999 },
    ];
    const crDistribution = crValues.length > 0
      ? crRanges.map((range) => ({
          label: range.label,
          count: crValues.filter((v) => v >= range.min && v < range.max).length,
          pct: +(crValues.filter((v) => v >= range.min && v < range.max).length / crValues.length * 100).toFixed(1),
        }))
      : null;

    // 标题长度分布
    const titleRanges = [
      { label: "<10字", min: 0, max: 10 },
      { label: "10-20字", min: 10, max: 20 },
      { label: "20-30字", min: 20, max: 30 },
      { label: ">30字", min: 30, max: 999 },
    ];
    const titleLenDist = titleRanges.map((range) => ({
      label: range.label,
      count: titleLengths.filter((v) => v >= range.min && v < range.max).length,
      pct: +(titleLengths.filter((v) => v >= range.min && v < range.max).length / n * 100).toFixed(1),
    }));

    // 文案长度分布
    const contentLenDist = contentLengths.length > 0
      ? [
          { label: "<50字", min: 0, max: 50 },
          { label: "50-100字", min: 50, max: 100 },
          { label: "100-200字", min: 100, max: 200 },
          { label: ">200字", min: 200, max: 99999 },
        ].map((range) => ({
          label: range.label,
          count: contentLengths.filter((v) => v >= range.min && v < range.max).length,
          pct: +(contentLengths.filter((v) => v >= range.min && v < range.max).length / contentLengths.length * 100).toFixed(1),
        }))
      : null;

    // 发布时间段 top
    const timeSlotTop = Object.entries(hourBuckets).length > 0
      ? Object.entries(hourBuckets).sort((a, b) => b[1] - a[1]).map(([slot, count]) => ({ slot, count, pct: +(count / Object.values(hourBuckets).reduce((a, b) => a + b, 0) * 100).toFixed(1) }))
      : null;

    // 星期分布 top
    const weekdayTop = Object.entries(weekdayBuckets).length > 0
      ? Object.entries(weekdayBuckets).sort((a, b) => b[1] - a[1]).map(([day, count]) => ({ day, count, pct: +(count / Object.values(weekdayBuckets).reduce((a, b) => a + b, 0) * 100).toFixed(1) }))
      : null;

    return {
      count: n,
      avgPlay: (totalPlay / n / 10000).toFixed(2),
      avgCr: crCount > 0 ? (totalCr / crCount).toFixed(2) : null,
      avgDur: durCount > 0 ? (totalDur / durCount).toFixed(1) : null,
      engagementRate: totalPlay > 0 ? (totalEngagement / totalPlay * 100).toFixed(2) : null,
      avgLikes: Math.round(totalLikes / n),
      avgComments: Math.round(totalComments / n),
      avgShares: Math.round(totalShares / n),
      avgFavorites: Math.round(totalFavorites / n),
      contents,
      // 规律总结
      crDistribution,
      titleLenDist,
      contentLenDist,
      timeSlotTop,
      weekdayTop,
    };
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* 模式切换 */}
      <div className="flex gap-2">
        <Button size="sm" variant={mode === "hit" ? "default" : "outline"} onClick={() => { setMode("hit"); applyPreset("10", ""); }}>
          爆款分析
        </Button>
        <Button size="sm" variant={mode === "low" ? "default" : "outline"} onClick={() => { setMode("low"); applyPreset("", "1"); }}>
          低表现分析
        </Button>
      </div>

      {/* 筛选面板 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">播放量最低（万）</Label>
          <div className="relative">
            <Input type="number" step="0.01" value={playMin} onChange={(e) => setPlayMin(e.target.value)} placeholder="0" className="h-8 pr-8" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">万</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">播放量最高（万）</Label>
          <div className="relative">
            <Input type="number" step="0.01" value={playMax} onChange={(e) => setPlayMax(e.target.value)} placeholder="不限" className="h-8 pr-8" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">万</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">日期起</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">日期止</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">完播率最低（%）</Label>
          <Input type="number" step="0.01" value={crMin} onChange={(e) => setCrMin(e.target.value)} placeholder="0" className="h-8" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">完播率最高（%）</Label>
          <Input type="number" step="0.01" value={crMax} onChange={(e) => setCrMax(e.target.value)} placeholder="不限" className="h-8" />
        </div>
      </div>

      {/* 快捷按钮 */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => applyPreset("10", "")}>{">"} 10万</Button>
        <Button size="sm" variant="outline" onClick={() => applyPreset("50", "")}>{">"} 50万</Button>
        <Button size="sm" variant="outline" onClick={() => applyPreset("", "1")}>{"<"} 1万</Button>
        <Button size="sm" variant="outline" onClick={() => { setPlayMin(""); setPlayMax(""); setCrMin(""); setCrMax(""); setDateFrom(""); setDateTo(""); setSelectedSubmitters([]); }}>重置</Button>
      </div>

      {/* 提交人筛选 */}
      <div className="space-y-1.5">
        <Label className="text-xs">提交人</Label>
        <div className="flex flex-wrap gap-1.5">
          {submitters.map((name) => (
            <Badge
              key={name}
              variant={selectedSubmitters.includes(name) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleSubmitter(name)}
            >
              {name}
            </Badge>
          ))}
        </div>
      </div>

      {/* 共性面板 */}
      {stats ? (
        <div className="glass-card-static rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold tracking-tight">筛选结果：<span className="tabular-nums">{stats.count}</span> 条</p>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground text-xs">平均播放量</p>
              <p className="font-medium tabular-nums">{stats.avgPlay}万</p>
            </div>
            {stats.avgCr && (
              <div>
                <p className="text-muted-foreground text-xs">平均完播率</p>
                <p className="font-medium tabular-nums">{stats.avgCr}%</p>
              </div>
            )}
            {stats.avgDur && (
              <div>
                <p className="text-muted-foreground text-xs">平均播放时长</p>
                <p className="font-medium tabular-nums">{stats.avgDur}秒</p>
              </div>
            )}
            {stats.engagementRate && (
              <div>
                <p className="text-muted-foreground text-xs">平均互动率</p>
                <p className="font-medium tabular-nums">{stats.engagementRate}%</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">平均点赞</p>
              <p className="font-medium tabular-nums">{stats.avgLikes}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">平均评论</p>
              <p className="font-medium tabular-nums">{stats.avgComments}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">平均分享</p>
              <p className="font-medium tabular-nums">{stats.avgShares}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">平均收藏</p>
              <p className="font-medium tabular-nums">{stats.avgFavorites}</p>
            </div>
          </div>

          {stats.contents.length > 0 && (
            <div className="space-y-2 border-t pt-2">
              <p className="text-xs font-semibold tracking-tight text-muted-foreground">文案列表（<span className="tabular-nums">{stats.contents.length}</span> 条）</p>
              <div className="max-h-[200px] space-y-2 overflow-y-auto">
                {stats.contents.map((c, i) => (
                  <div key={i} className="glass-card-static rounded-xl p-2">
                    <p className="whitespace-pre-wrap text-xs">{c}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 规律总结 */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-sm font-semibold tracking-tight">规律总结</p>

            {stats.crDistribution && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">完播率区间分布</p>
                <div className="flex gap-2 flex-wrap">
                  {stats.crDistribution.map((d) => (
                    <div key={d.label} className="glass-card-static rounded-xl px-2 py-1 text-xs">
                      <span className="font-semibold tracking-tight">{d.label}</span>
                      <span className="ml-1 tabular-nums text-muted-foreground">{d.count}条 ({d.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">标题长度分布</p>
              <div className="flex gap-2 flex-wrap">
                {stats.titleLenDist.map((d) => (
                  <div key={d.label} className="glass-card-static rounded-xl px-2 py-1 text-xs">
                    <span className="font-semibold tracking-tight">{d.label}</span>
                    <span className="ml-1 tabular-nums text-muted-foreground">{d.count}条 ({d.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {stats.contentLenDist && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">文案长度分布</p>
                <div className="flex gap-2 flex-wrap">
                  {stats.contentLenDist.map((d) => (
                    <div key={d.label} className="glass-card-static rounded-xl px-2 py-1 text-xs">
                      <span className="font-semibold tracking-tight">{d.label}</span>
                      <span className="ml-1 tabular-nums text-muted-foreground">{d.count}条 ({d.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.timeSlotTop && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">发布时间段分布</p>
                <div className="flex gap-2 flex-wrap">
                  {stats.timeSlotTop.map((d) => (
                    <div key={d.slot} className="glass-card-static rounded-xl px-2 py-1 text-xs">
                      <span className="font-semibold tracking-tight">{d.slot}</span>
                      <span className="ml-1 tabular-nums text-muted-foreground">{d.count}条 ({d.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.weekdayTop && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">发布星期分布</p>
                <div className="flex gap-2 flex-wrap">
                  {stats.weekdayTop.map((d) => (
                    <div key={d.day} className="glass-card-static rounded-xl px-2 py-1 text-xs">
                      <span className="font-semibold tracking-tight">{d.day}</span>
                      <span className="ml-1 tabular-nums text-muted-foreground">{d.count}条 ({d.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">无匹配数据</p>
      )}
    </div>
  );
}
