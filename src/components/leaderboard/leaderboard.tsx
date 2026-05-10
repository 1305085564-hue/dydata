"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { AnimatedNumber } from "@/components/animated-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  AccountLeaderboardItem,
  AccountLeaderboardRow,
  LeaderboardRange,
  LeaderboardType,
} from "@/types";

interface LeaderboardProps {
  data: AccountLeaderboardRow[];
  ownAccountIds: string[];
  ownContentDirections?: string[];
  currentDate: string;
  defaultRange?: LeaderboardRange;
  defaultCompact?: boolean;
}

type MetricKey =
  | "views"
  | "followerGain"
  | "followerConvert"
  | "likes"
  | "comments"
  | "shares"
  | "favorites"
  | "watchDuration"
  | "bounceRate"
  | "completionRate5s";

const RANGE_OPTIONS: Array<{ value: LeaderboardRange; label: string }> = [
  { value: "today", label: "当天" },
  { value: "week", label: "近7天" },
  { value: "month", label: "近30天" },
];

const TYPE_OPTIONS: Array<{ value: LeaderboardType; label: string }> = [
  { value: "overall", label: "总榜" },
  { value: "tag", label: "同标签榜" },
  { value: "progress", label: "进步榜" },
];

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: "views", label: "播放量" },
  { key: "followerGain", label: "涨粉" },
  { key: "followerConvert", label: "导粉" },
  { key: "likes", label: "点赞" },
  { key: "comments", label: "评论" },
  { key: "shares", label: "分享" },
  { key: "favorites", label: "收藏" },
  { key: "watchDuration", label: "均播时长" },
  { key: "bounceRate", label: "2s跳出率" },
  { key: "completionRate5s", label: "5s完播率" },
];


export function Leaderboard({
  data,
  ownAccountIds,
  ownContentDirections = [],
  currentDate,
  defaultRange = "week",
  defaultCompact = true,
}: LeaderboardProps) {
  const [range, setRange] = useState<LeaderboardRange>(defaultRange);
  const [boardType, setBoardType] = useState<LeaderboardType>("overall");
  const [compact, setCompact] = useState(defaultCompact);
  const [sortKey, setSortKey] = useState<MetricKey>("views");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSortClick(key: MetricKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const normalizedOwnDirections = useMemo(
    () => new Set(ownContentDirections.map(normalizeTag).filter(Boolean)),
    [ownContentDirections]
  );

  const rangeStart = useMemo(() => {
    if (range === "today") return currentDate;
    if (range === "week") return shiftDate(currentDate, -6);
    return shiftDate(currentDate, -29);
  }, [currentDate, range]);

  const baseRows = useMemo(
    () =>
      data.filter(
        (row) => row.report_date >= rangeStart && row.report_date <= currentDate
      ),
    [currentDate, data, rangeStart]
  );

  const progressByAccount = useMemo(
    () => buildProgressMap(data, currentDate),
    [currentDate, data]
  );

  const { items, emptyMessage } = useMemo(() => {
    const filteredRows =
      boardType === "tag"
        ? filterRowsByDirections(baseRows, normalizedOwnDirections)
        : baseRows;

    if (boardType === "tag" && normalizedOwnDirections.size === 0) {
      return {
        items: [] as AccountLeaderboardItem[],
        emptyMessage: "你名下账号还没有内容标签，暂时无法生成同标签榜。",
      };
    }

    const aggregated = aggregateRows(filteredRows, new Set(ownAccountIds));
    const nextItems = aggregated.map((item) => {
      const progress = progressByAccount.get(item.accountId) ?? {
        progressRate: 0,
        isBreakout: false,
        sortValue: 0,
      };

      return {
        ...item,
        progressRate: progress.progressRate,
        isBreakout: progress.isBreakout,
        __sortValue: progress.sortValue,
      };
    });

    nextItems.sort((a, b) => {
      if (boardType === "progress") {
        if (b.__sortValue !== a.__sortValue) return b.__sortValue - a.__sortValue;
        if (b.views !== a.views) return b.views - a.views;
        return a.accountName.localeCompare(b.accountName, "zh-CN");
      }

      const va = getMetricValue(a, sortKey);
      const vb = getMetricValue(b, sortKey);
      if (va !== vb) return sortDir === "desc" ? vb - va : va - vb;
      return a.accountName.localeCompare(b.accountName, "zh-CN");
    });

    const ranked = nextItems.map((item, index) => {
      return {
        ...item,
        rank: index + 1,
      };
    });

    return {
      items: ranked,
      emptyMessage:
        boardType === "tag"
          ? "当前时间范围内暂无同标签账号数据。"
          : "当前时间范围内暂无排行榜数据。",
    };
  }, [baseRows, boardType, normalizedOwnDirections, ownAccountIds, progressByAccount, sortKey, sortDir]);

  const visibleItems = compact ? items.slice(0, 10) : items;
  const visibleMetrics = compact
    ? METRICS.filter((m) =>
        ["views", "followerGain", "likes", "bounceRate", "completionRate5s"].includes(m.key)
      )
    : METRICS;

  return (
    <div className="glass-card-static space-y-4 p-4 sm:p-5">
      <div className="space-y-2 rounded-2xl bg-muted/50 p-2 ring-1 ring-foreground/8 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <SegmentedControl
          options={TYPE_OPTIONS}
          value={boardType}
          onChange={(value) => setBoardType(value as LeaderboardType)}
        />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <SegmentedControl
            options={RANGE_OPTIONS}
            value={range}
            onChange={(value) => setRange(value as LeaderboardRange)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-11 rounded-2xl bg-background/80 px-3 md:h-8"
            onClick={() => setCompact((prev) => !prev)}
          >
            {compact ? (
              <>
                <ChevronDown className="size-3.5" />
                展开完整数据
              </>
            ) : (
              <>
                <ChevronUp className="size-3.5" />
                收起次要数据
              </>
            )}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl ring-1 ring-foreground/8">
            <Table className={cn("table-fixed", compact ? "min-w-[560px]" : "min-w-[1380px]")}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 z-20 w-14 bg-background/95 backdrop-blur">排名</TableHead>
                  <TableHead className="sticky left-14 z-20 w-[96px] bg-background/95 backdrop-blur">账号</TableHead>
                  {boardType === "progress" ? (
                    <TableHead className="min-w-[120px] text-right">近7天环比</TableHead>
                  ) : null}
                  {visibleMetrics.map((metric) => (
                    <TableHead
                      key={metric.key}
                      className="min-w-[72px] cursor-pointer select-none text-right"
                      onClick={() => handleSortClick(metric.key)}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {metric.label}
                        {sortKey === metric.key ? (
                          sortDir === "desc" ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />
                        ) : null}
                      </span>
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[150px]">标签</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((item) => (
                  <TableRow
                    key={item.accountId}
                    className={cn(
                      "border-b border-border/70 bg-background/85 transition-colors hover:bg-muted/50",
                      item.isOwn && "border-l-4 border-l-primary bg-primary/5 hover:bg-muted/50"
                    )}
                  >
                    <TableCell className="sticky left-0 z-10 bg-background/95 backdrop-blur">
                      <RankBadge rank={item.rank} />
                    </TableCell>
                    <TableCell className="sticky left-14 z-10 bg-background/95 backdrop-blur">
                      <div className="w-[96px]">
                        <div className="flex items-center gap-1">
                          <span className="truncate font-semibold text-foreground">{item.accountName}</span>
                          {item.isOwn ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.ownerName}</p>
                      </div>
                    </TableCell>
                    {boardType === "progress" ? (
                      <TableCell className="text-right">
                        <ProgressValue item={item} />
                      </TableCell>
                    ) : null}
                    {visibleMetrics.map((metric) => (
                      <TableCell key={metric.key} className="text-right tabular-nums">
                        {formatMetric(item, metric.key)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <TagStack
                        contentDirection={item.contentDirection}
                        presentationFormat={item.presentationFormat}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        </>
      )}
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex w-full flex-wrap gap-1 rounded-2xl bg-background/70 p-1 ring-1 ring-foreground/8 md:w-auto">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "h-11 rounded-xl px-3 text-[13px] font-medium text-muted-foreground md:h-8",
              active && "bg-background text-foreground shadow-sm ring-1 ring-foreground/8"
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function TagStack({
  contentDirection,
  presentationFormat,
}: {
  contentDirection: string | null;
  presentationFormat: string | null;
}) {
  if (!contentDirection && !presentationFormat) {
    return <span className="text-xs text-muted-foreground">未设置标签</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {contentDirection ? (
        <Badge variant="outline" className="rounded-full bg-background/80">
          {contentDirection}
        </Badge>
      ) : null}
      {presentationFormat ? (
        <Badge variant="outline" className="rounded-full bg-background/80 text-muted-foreground">
          {presentationFormat}
        </Badge>
      ) : null}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const badgeClass =
    rank === 1
      ? "bg-zinc-100 text-[#D99E55] ring-amber-200"
      : rank === 2
        ? "bg-slate-100 text-slate-700 ring-slate-200"
        : rank === 3
          ? "bg-zinc-100 text-[#C9604D] ring-orange-200"
          : "bg-muted text-muted-foreground ring-border";

  return (
    <span
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ring-1",
        badgeClass
      )}
    >
      <AnimatedNumber value={rank} duration={0.5} className="text-sm font-semibold" />
    </span>
  );
}

function ProgressValue({ item }: { item: AccountLeaderboardItem }) {
  const text = item.isBreakout
    ? "新起量"
    : `${item.progressRate && item.progressRate > 0 ? "+" : ""}${(item.progressRate ?? 0).toFixed(1)}%`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        item.progressRate === null || item.progressRate >= 0
          ? "bg-zinc-50 text-emerald-600 dark:bg-zinc-100/15 dark:text-emerald-400"
          : "bg-zinc-50 text-red-600 dark:bg-zinc-100/15 dark:text-red-400"
      )}
    >
      <TrendingUp className="size-3.5" />
      {text}
    </span>
  );
}

function aggregateRows(rows: AccountLeaderboardRow[], ownAccountIds: Set<string>) {
  const map = new Map<
    string,
    {
      accountId: string;
      accountName: string;
      ownerName: string;
      contentDirection: string | null;
      presentationFormat: string | null;
      isOwn: boolean;
      views: number;
      likes: number;
      comments: number;
      shares: number;
      favorites: number;
      followerGain: number;
      followerConvert: number;
      watchWeighted: number;
      watchWeight: number;
      bounceWeighted: number;
      bounceWeight: number;
      completion5sWeighted: number;
      completion5sWeight: number;
    }
  >();

  for (const row of rows) {
    const accountId = row.account_id;
    const views = row.play_count ?? 0;
    const likes = row.likes ?? 0;
    const comments = row.comments ?? 0;
    const shares = row.shares ?? 0;
    const favorites = row.favorites ?? 0;
    const followerGain = row.follower_gain ?? 0;
    const followerConvert = row.follower_convert ?? 0;
    const watchDuration = parseSeconds(row.avg_play_duration);
    const bounceRate = parsePercent(row.bounce_rate_2s);
    const completionRate5s = parsePercent(row.completion_rate_5s);

    const current = map.get(accountId) ?? {
      accountId,
      accountName: row.account_name,
      ownerName: row.owner_name,
      contentDirection: row.content_direction,
      presentationFormat: row.presentation_format,
      isOwn: ownAccountIds.has(accountId),
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      favorites: 0,
      followerGain: 0,
      followerConvert: 0,
      watchWeighted: 0,
      watchWeight: 0,
      bounceWeighted: 0,
      bounceWeight: 0,
      completion5sWeighted: 0,
      completion5sWeight: 0,
    };

    current.views += views;
    current.likes += likes;
    current.comments += comments;
    current.shares += shares;
    current.favorites += favorites;
    current.followerGain += followerGain;
    current.followerConvert += followerConvert;

    if (watchDuration !== null) {
      current.watchWeighted += watchDuration * views;
      current.watchWeight += views;
    }

    if (bounceRate !== null) {
      current.bounceWeighted += bounceRate * views;
      current.bounceWeight += views;
    }

    if (completionRate5s !== null) {
      current.completion5sWeighted += completionRate5s * views;
      current.completion5sWeight += views;
    }

    map.set(accountId, current);
  }

  return Array.from(map.values()).map((item) => ({
    accountId: item.accountId,
    accountName: item.accountName,
    ownerName: item.ownerName,
    contentDirection: item.contentDirection,
    presentationFormat: item.presentationFormat,
    isOwn: item.isOwn,
    rank: 0,
    views: item.views,
    likes: item.likes,
    comments: item.comments,
    shares: item.shares,
    favorites: item.favorites,
    followerGain: item.followerGain,
    followerConvert: item.followerConvert,
    watchDuration:
      item.watchWeight > 0 ? item.watchWeighted / item.watchWeight : null,
    bounceRate:
      item.bounceWeight > 0 ? item.bounceWeighted / item.bounceWeight : null,
    completionRate5s:
      item.completion5sWeight > 0
        ? item.completion5sWeighted / item.completion5sWeight
        : null,
    progressRate: null,
    isBreakout: false,
  }));
}

function buildProgressMap(rows: AccountLeaderboardRow[], currentDate: string) {
  const recentStart = shiftDate(currentDate, -6);
  const previousStart = shiftDate(currentDate, -13);
  const previousEnd = shiftDate(currentDate, -7);

  const totals = new Map<string, { recent: number; previous: number }>();
  type ProgressSummary = { progressRate: number | null; isBreakout: boolean; sortValue: number };

  for (const row of rows) {
    const current = totals.get(row.account_id) ?? { recent: 0, previous: 0 };
    const views = row.play_count ?? 0;

    if (row.report_date >= recentStart && row.report_date <= currentDate) {
      current.recent += views;
    } else if (row.report_date >= previousStart && row.report_date <= previousEnd) {
      current.previous += views;
    }

    totals.set(row.account_id, current);
  }

  return new Map<string, ProgressSummary>(
    Array.from(totals.entries()).map(([accountId, value]): [string, ProgressSummary] => {
      if (value.previous === 0 && value.recent > 0) {
        return [
          accountId,
          { progressRate: null, isBreakout: true, sortValue: Number.POSITIVE_INFINITY },
        ];
      }

      if (value.previous === 0) {
        return [accountId, { progressRate: 0, isBreakout: false, sortValue: 0 }];
      }

      const progressRate = ((value.recent - value.previous) / value.previous) * 100;
      return [accountId, { progressRate, isBreakout: false, sortValue: progressRate }];
    })
  );
}

function filterRowsByDirections(
  rows: AccountLeaderboardRow[],
  directionSet: Set<string>
) {
  return rows.filter((row) => {
    const direction = normalizeTag(row.content_direction);
    return direction ? directionSet.has(direction) : false;
  });
}

function getMetricValue(item: AccountLeaderboardItem, key: MetricKey): number {
  switch (key) {
    case "views": return item.views;
    case "followerGain": return item.followerGain;
    case "followerConvert": return item.followerConvert;
    case "likes": return item.likes;
    case "comments": return item.comments;
    case "shares": return item.shares;
    case "favorites": return item.favorites;
    case "watchDuration": return item.watchDuration ?? -1;
    case "bounceRate": return item.bounceRate ?? -1;
    case "completionRate5s": return item.completionRate5s ?? -1;
  }
}

function formatMetric(item: AccountLeaderboardItem, key: MetricKey) {
  switch (key) {
    case "views":
      return formatLargeNumber(item.views);
    case "followerGain":
      return item.followerGain.toLocaleString("zh-CN");
    case "followerConvert":
      return item.followerConvert.toLocaleString("zh-CN");
    case "likes":
      return formatLargeNumber(item.likes);
    case "comments":
      return formatLargeNumber(item.comments);
    case "shares":
      return formatLargeNumber(item.shares);
    case "favorites":
      return formatLargeNumber(item.favorites);
    case "watchDuration":
      return item.watchDuration === null ? "-" : `${item.watchDuration.toFixed(1)}秒`;
    case "bounceRate":
      return item.bounceRate === null ? "-" : `${item.bounceRate.toFixed(1)}%`;
    case "completionRate5s":
      return item.completionRate5s === null ? "-" : `${item.completionRate5s.toFixed(1)}%`;
  }
}

function formatLargeNumber(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(2)}万`;
  }
  return value.toLocaleString("zh-CN");
}

function parsePercent(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSeconds(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/秒/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTag(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function shiftDate(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}
