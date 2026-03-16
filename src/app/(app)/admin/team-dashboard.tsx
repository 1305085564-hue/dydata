"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/animated-number";

interface DailyAgg {
  date: string;
  total_play: number;
  avg_play: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_favorites: number;
  count: number;
}

interface TeamDashboardProps {
  dailyData: DailyAgg[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-xs tabular-nums" style={{ color: p.color }}>
          {p.name}：{typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

export function TeamDashboard({ dailyData }: TeamDashboardProps) {
  const [range, setRange] = useState<7 | 30>(7);

  const allSorted = [...dailyData].sort((a, b) => a.date.localeCompare(b.date));
  const sorted = allSorted.slice(-range);

  // 上一周期（环比）
  const prevSorted = allSorted.slice(-(range * 2), -range);

  // 汇总统计
  const totalPlay = sorted.reduce((s, d) => s + d.total_play, 0);
  const totalLikes = sorted.reduce((s, d) => s + d.total_likes, 0);
  const totalSubmissions = sorted.reduce((s, d) => s + d.count, 0);
  const avgDailyPlay = sorted.length > 0 ? Math.round(totalPlay / sorted.length) : 0;

  const prevTotalPlay = prevSorted.reduce((s, d) => s + d.total_play, 0);
  const prevTotalLikes = prevSorted.reduce((s, d) => s + d.total_likes, 0);
  const prevAvgDailyPlay = prevSorted.length > 0 ? Math.round(prevTotalPlay / prevSorted.length) : 0;
  const prevTotalSubmissions = prevSorted.reduce((s, d) => s + d.count, 0);

  function changeText(cur: number, prev: number): string | null {
    if (prev === 0) return null;
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return "持平";
    return pct > 0 ? `+${pct}%` : `${pct}%`;
  }

  const chartData = sorted.map((d) => ({
    date: d.date.slice(5),
    "总播放(万)": +(d.total_play / 10000).toFixed(2),
    "日均播放(万)": +(d.avg_play / 10000).toFixed(2),
    提交人数: d.count,
  }));

  const interactionData = sorted.map((d) => ({
    date: d.date.slice(5),
    点赞: d.total_likes,
    评论: d.total_comments,
    分享: d.total_shares,
    收藏: d.total_favorites,
  }));

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button size="sm" variant={range === 7 ? "default" : "outline"} onClick={() => setRange(7)}>近 7 天</Button>
        <Button size="sm" variant={range === 30 ? "default" : "outline"} onClick={() => setRange(30)}>近 30 天</Button>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-blue-400 uppercase tracking-wide">总播放量</p>
            <p className="text-2xl font-bold text-blue-700 mt-1 tabular-nums">
              <AnimatedNumber value={Math.round(totalPlay / 10000)} suffix="万" />
            </p>
            {changeText(totalPlay, prevTotalPlay) && (
              <p className={`text-xs mt-1 tabular-nums ${totalPlay >= prevTotalPlay ? "text-green-600" : "text-red-500"}`}>
                环比 {changeText(totalPlay, prevTotalPlay)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-white border-green-100">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-green-400 uppercase tracking-wide">日均播放</p>
            <p className="text-2xl font-bold text-green-600 mt-1 tabular-nums">
              <AnimatedNumber value={Math.round(avgDailyPlay / 10000)} suffix="万" />
            </p>
            {changeText(avgDailyPlay, prevAvgDailyPlay) && (
              <p className={`text-xs mt-1 tabular-nums ${avgDailyPlay >= prevAvgDailyPlay ? "text-green-600" : "text-red-500"}`}>
                环比 {changeText(avgDailyPlay, prevAvgDailyPlay)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-50 to-white border-orange-100">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-orange-400 uppercase tracking-wide">总点赞</p>
            <p className="text-2xl font-bold text-orange-500 mt-1 tabular-nums">
              <AnimatedNumber value={totalLikes} />
            </p>
            {changeText(totalLikes, prevTotalLikes) && (
              <p className={`text-xs mt-1 tabular-nums ${totalLikes >= prevTotalLikes ? "text-green-600" : "text-red-500"}`}>
                环比 {changeText(totalLikes, prevTotalLikes)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-50 to-white border-violet-100">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-medium text-violet-400 uppercase tracking-wide">总提交数</p>
            <p className="text-2xl font-bold text-violet-600 mt-1 tabular-nums">
              <AnimatedNumber value={totalSubmissions} />
            </p>
            {changeText(totalSubmissions, prevTotalSubmissions) && (
              <p className={`text-xs mt-1 tabular-nums ${totalSubmissions >= prevTotalSubmissions ? "text-green-600" : "text-red-500"}`}>
                环比 {changeText(totalSubmissions, prevTotalSubmissions)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {sorted.length < 2 ? (
        <p className="text-sm text-muted-foreground py-4">数据不足 2 天，暂无趋势图</p>
      ) : (
        <>
          {/* 播放量趋势 */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">团队播放量趋势</h4>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} />
                <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} unit="万" />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line type="monotone" dataKey="总播放(万)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="日均播放(万)" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 互动趋势 */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">团队互动趋势</h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={interactionData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} />
                <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="点赞" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="评论" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                <Bar dataKey="分享" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="收藏" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 提交人数趋势 */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">每日提交人数</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} />
                <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#d1d5db" }} tickLine={{ stroke: "#d1d5db" }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="提交人数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
