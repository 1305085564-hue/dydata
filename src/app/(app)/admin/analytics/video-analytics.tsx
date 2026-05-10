"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CHART_AXIS_TICK,
  CHART_GRADIENT_PRIMARY,
  CHART_GRID_PROPS,
} from "@/lib/chart-palette";

interface VideoAnalyticsProps {
  videos: Array<{
    id: string;
    account_id: string;
    video_title: string | null;
    video_url: string | null;
    published_at: string | null;
    anomaly_status: string;
    accounts: { name: string };
    profiles: { name: string };
  }>;
  snapshots: Array<{
    id: string;
    video_id: string;
    snapshot_type: string;
    play_count: number;
    likes: number;
    comments: number;
    shares: number;
    favorites: number;
    follower_gain: number;
    follower_convert: number;
  }>;
}

type Snapshot24h = VideoAnalyticsProps["snapshots"][number];
type RankedVideo = VideoAnalyticsProps["videos"][number] & { snapshot24h: Snapshot24h; rank: number };

function is24hSnapshot(snapshotType: string) {
  return snapshotType.toLowerCase().includes("24h");
}

function formatDateLabel(value: string) {
  return value.slice(5).replace("-", "/");
}

function formatDateTime(value: string | null) {
  if (!value) return "未填写";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function calculateInteractionRate(snapshot: Snapshot24h): number | null {
  if (!snapshot.play_count || snapshot.play_count === 0) return null;
  return (snapshot.likes + snapshot.comments + snapshot.favorites + snapshot.shares) / snapshot.play_count;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "normal":
      return "secondary";
    case "warning":
      return "outline";
    case "anomaly":
      return "destructive";
    default:
      return "outline";
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "normal":
      return "正常";
    case "warning":
      return "关注";
    case "anomaly":
      return "异常";
    default:
      return status || "未知";
  }
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length || !label) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">发布视频 {payload[0].value} 条</p>
    </div>
  );
}

export function VideoAnalytics({ videos, snapshots }: VideoAnalyticsProps) {
  const snapshot24hMap = useMemo(() => {
    return snapshots.reduce<Map<string, Snapshot24h>>((map, snapshot) => {
      if (is24hSnapshot(snapshot.snapshot_type) && !map.has(snapshot.video_id)) {
        map.set(snapshot.video_id, snapshot);
      }
      return map;
    }, new Map());
  }, [snapshots]);

  const rankedVideos = useMemo<RankedVideo[]>(() => {
    return videos
      .map((video) => {
        const snapshot24h = snapshot24hMap.get(video.id);
        if (!snapshot24h) return null;
        return { ...video, snapshot24h };
      })
      .filter((video): video is Omit<RankedVideo, "rank"> => video !== null)
      .sort((a, b) => b.snapshot24h.play_count - a.snapshot24h.play_count)
      .map((video, index) => ({ ...video, rank: index + 1 }));
  }, [videos, snapshot24hMap]);

  const trendData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayMap = new Map<string, number>();

    for (let i = 29; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      dayMap.set(key, 0);
    }

    for (const video of videos) {
      if (!video.published_at) continue;
      const publishedDate = new Date(video.published_at);
      if (Number.isNaN(publishedDate.getTime())) continue;
      const key = publishedDate.toISOString().slice(0, 10);
      if (!dayMap.has(key)) continue;
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }

    return Array.from(dayMap.entries()).map(([date, count]) => ({
      date,
      label: formatDateLabel(date),
      count,
    }));
  }, [videos]);

  const topPerformers = rankedVideos.slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {topPerformers.length > 0 ? (
          topPerformers.map((video) => {
            const rate = calculateInteractionRate(video.snapshot24h);
            return (
              <Card
                key={video.id}
                className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
              >
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                        TOP {video.rank}
                      </p>
                      <CardTitle className="line-clamp-2 text-base font-semibold tracking-tight text-foreground">
                        {video.video_title || "未命名视频"}
                      </CardTitle>
                    </div>
                    <Badge variant={getStatusVariant(video.anomaly_status)}>{getStatusLabel(video.anomaly_status)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/35 p-3">
                    <div>
                      <p className="text-xs text-muted-foreground">24h 播放</p>
                      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
                        {formatCompactNumber(video.snapshot24h.play_count)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">互动率</p>
                      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{formatPercent(rate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">涨粉</p>
                      <p className="mt-1 text-base font-semibold tracking-tight tabular-nums">
                        {formatCompactNumber(video.snapshot24h.follower_gain)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">负责人</p>
                      <p className="mt-1 text-base font-semibold tracking-tight">{video.profiles?.name ?? "未知"}</p>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>账号：{video.accounts.name}</p>
                    <p>发布时间：{formatDateTime(video.published_at)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="rounded-2xl border border-dashed border-border/70 bg-white/70 lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Top Performers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">暂无 24h 视频快照，无法生成头部表现卡片。</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight">每日视频数趋势</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.some((item) => item.count > 0) ? (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID_PROPS} />
                  <XAxis
                    dataKey="label"
                    tick={CHART_AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={12}
                  />
                  <YAxis allowDecimals={false} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
                  <Bar dataKey="count" fill="url(#videoCountGradient)" radius={[10, 10, 0, 0]} maxBarSize={28} />
                  <defs>
                    <linearGradient id="videoCountGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_GRADIENT_PRIMARY.from} stopOpacity={0.92} />
                      <stop offset="100%" stopColor={CHART_GRADIENT_PRIMARY.from} stopOpacity={0.12} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">最近 30 天暂无发布时间数据。</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight">视频排行榜</CardTitle>
        </CardHeader>
        <CardContent>
          {rankedVideos.length > 0 ? (
            <>
              {/* Mobile: 2-column card grid */}
              <div className="grid grid-cols-2 gap-3 md:hidden">
                {rankedVideos.map((video) => {
                  const rate = calculateInteractionRate(video.snapshot24h);
                  return (
                    <div key={video.id} className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">TOP {video.rank}</span>
                        <Badge variant={getStatusVariant(video.anomaly_status)} className="text-[10px]">{getStatusLabel(video.anomaly_status)}</Badge>
                      </div>
                      <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-foreground">
                        {video.video_title || "未命名视频"}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="rounded-xl bg-muted/60 px-2 py-1.5">
                          <p className="text-[9px] text-muted-foreground">24h播放</p>
                          <p className="text-[12px] font-medium tabular-nums">{formatCompactNumber(video.snapshot24h.play_count)}</p>
                        </div>
                        <div className="rounded-xl bg-muted/60 px-2 py-1.5">
                          <p className="text-[9px] text-muted-foreground">涨粉</p>
                          <p className="text-[12px] font-medium tabular-nums">{formatCompactNumber(video.snapshot24h.follower_gain)}</p>
                        </div>
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">{video.accounts?.name} · {video.profiles?.name ?? "未知"}</p>
                    </div>
                  );
                })}
              </div>
              {/* Desktop: table */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">排名</TableHead>
                    <TableHead className="min-w-[240px]">视频标题</TableHead>
                    <TableHead>账号</TableHead>
                    <TableHead>负责人</TableHead>
                    <TableHead className="text-right">播放量</TableHead>
                    <TableHead className="text-right">互动率</TableHead>
                    <TableHead className="text-right">涨粉</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankedVideos.map((video) => {
                    const rate = calculateInteractionRate(video.snapshot24h);
                    return (
                      <TableRow key={video.id}>
                        <TableCell className="font-medium tabular-nums text-muted-foreground">#{video.rank}</TableCell>
                        <TableCell className="max-w-[320px] whitespace-normal">
                          <div className="space-y-1">
                            <p className="line-clamp-2 font-medium tracking-tight text-foreground">
                              {video.video_title || "未命名视频"}
                            </p>
                            {video.video_url ? (
                              <a
                                href={video.video_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                              >
                                查看视频
                              </a>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{video.accounts.name}</TableCell>
                        <TableCell>{video.profiles?.name ?? "未知"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCompactNumber(video.snapshot24h.play_count)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(rate)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCompactNumber(video.snapshot24h.follower_gain)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(video.anomaly_status)}>{getStatusLabel(video.anomaly_status)}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">暂无 24h 快照数据，无法展示视频排行榜。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
