"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
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
  | "likes"
  | "followerGain"
  | "completionRate"
  | "watchDuration"
  | "bounceRate"
  | "completedViewers";

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
  { key: "likes", label: "点赞" },
  { key: "followerGain", label: "涨粉" },
  { key: "completionRate", label: "完播率" },
  { key: "watchDuration", label: "停留时长" },
  { key: "bounceRate", label: "跳出率" },
  { key: "completedViewers", label: "完播人数" },
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

      if (b.views !== a.views) return b.views - a.views;
      if (b.likes !== a.likes) return b.likes - a.likes;
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
  }, [baseRows, boardType, normalizedOwnDirections, ownAccountIds, progressByAccount]);

  const visibleMetrics = compact ? METRICS.slice(0, 4) : METRICS;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl bg-muted/50 p-3 ring-1 ring-foreground/8 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <SegmentedControl
          options={TYPE_OPTIONS}
          value={boardType}
          onChange={(value) => setBoardType(value as LeaderboardType)}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <SegmentedControl
            options={RANGE_OPTIONS}
            value={range}
            onChange={(value) => setRange(value as LeaderboardRange)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-2xl bg-background/80 px-3"
            onClick={() => setCompact((prev) => !prev)}
          >
            {compact ? (
              <>
                <ChevronDown className="size-3.5" />
                展开版
              </>
            ) : (
              <>
                <ChevronUp className="size-3.5" />
                简版
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
          <div className="hidden md:block overflow-hidden rounded-2xl ring-1 ring-foreground/8">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16">排名</TableHead>
                  <TableHead>账号</TableHead>
                  <TableHead>标签</TableHead>
                  {boardType === "progress" ? (
                    <TableHead className="text-right">近7天环比</TableHead>
                  ) : null}
                  {visibleMetrics.map((metric) => (
                    <TableHead key={metric.key} className="text-right">
                      {metric.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.accountId}
                    className={cn(
                      "border-b border-border/70 bg-background/85",
                      item.isOwn && "border-l-4 border-l-primary bg-primary/5"
                    )}
                  >
                    <TableCell>
                      <RankBadge rank={item.rank} />
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {item.accountName}
                          </span>
                          {item.isOwn ? (
                            <Badge variant="secondary" className="rounded-full">
                              我的账号
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.ownerName}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TagStack
                        contentDirection={item.contentDirection}
                        presentationFormat={item.presentationFormat}
                      />
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {items.map((item) => (
              <div
                key={item.accountId}
                className={cn(
                  "rounded-2xl bg-background/95 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.05)] ring-1 ring-foreground/8",
                  item.isOwn && "bg-primary/5 ring-primary/20"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <RankBadge rank={item.rank} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {item.accountName}
                        </p>
                        {item.isOwn ? (
                          <Badge variant="secondary" className="rounded-full">
                            我的
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.ownerName}
                      </p>
                    </div>
                  </div>
                  {boardType === "progress" ? <ProgressValue item={item} /> : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <TagStack
                    contentDirection={item.contentDirection}
                    presentationFormat={item.presentationFormat}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                  {visibleMetrics.map((metric) => (
                    <MetricCard
                      key={metric.key}
                      label={metric.label}
                      value={formatMetric(item, metric.key)}
                    />
                  ))}
                </div>
              </div>
            ))}
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
              "h-8 rounded-xl px-3 text-[13px] font-medium text-muted-foreground",
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/35 p-3 ring-1 ring-foreground/6">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const badgeClass =
    rank === 1
      ? "bg-amber-100 text-amber-700 ring-amber-200"
      : rank === 2
        ? "bg-slate-100 text-slate-700 ring-slate-200"
        : rank === 3
          ? "bg-orange-100 text-orange-700 ring-orange-200"
          : "bg-muted text-muted-foreground ring-border";

  return (
    <span
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ring-1",
        badgeClass
      )}
    >
      {rank}
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
        "inline-flex items-center gap-1 text-sm font-medium tabular-nums",
        item.progressRate === null || item.progressRate >= 0
          ? "text-emerald-600"
          : "text-muted-foreground"
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
      followerGain: number;
      completedViewers: number;
      completionWeighted: number;
      completionWeight: number;
      watchWeighted: number;
      watchWeight: number;
      bounceWeighted: number;
      bounceWeight: number;
    }
  >();

  for (const row of rows) {
    const accountId = row.account_id;
    const views = row.play_count ?? 0;
    const likes = row.likes ?? 0;
    const followerGain = row.follower_gain ?? 0;
    const completionRate = parsePercent(row.completion_rate);
    const watchDuration = parseSeconds(row.avg_play_duration);
    const bounceRate = parsePercent(row.bounce_rate_2s);

    const current = map.get(accountId) ?? {
      accountId,
      accountName: row.account_name,
      ownerName: row.owner_name,
      contentDirection: row.content_direction,
      presentationFormat: row.presentation_format,
      isOwn: ownAccountIds.has(accountId),
      views: 0,
      likes: 0,
      followerGain: 0,
      completedViewers: 0,
      completionWeighted: 0,
      completionWeight: 0,
      watchWeighted: 0,
      watchWeight: 0,
      bounceWeighted: 0,
      bounceWeight: 0,
    };

    current.views += views;
    current.likes += likes;
    current.followerGain += followerGain;

    if (completionRate !== null) {
      current.completionWeighted += completionRate * views;
      current.completionWeight += views;
      current.completedViewers += views * (completionRate / 100);
    }

    if (watchDuration !== null) {
      current.watchWeighted += watchDuration * views;
      current.watchWeight += views;
    }

    if (bounceRate !== null) {
      current.bounceWeighted += bounceRate * views;
      current.bounceWeight += views;
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
    followerGain: item.followerGain,
    completionRate:
      item.completionWeight > 0
        ? item.completionWeighted / item.completionWeight
        : null,
    watchDuration:
      item.watchWeight > 0 ? item.watchWeighted / item.watchWeight : null,
    bounceRate:
      item.bounceWeight > 0 ? item.bounceWeighted / item.bounceWeight : null,
    completedViewers: Math.round(item.completedViewers),
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

function formatMetric(item: AccountLeaderboardItem, key: MetricKey) {
  switch (key) {
    case "views":
      return formatLargeNumber(item.views);
    case "likes":
      return formatLargeNumber(item.likes);
    case "followerGain":
      return formatLargeNumber(item.followerGain);
    case "completionRate":
      return item.completionRate === null ? "-" : `${item.completionRate.toFixed(1)}%`;
    case "watchDuration":
      return item.watchDuration === null ? "-" : `${item.watchDuration.toFixed(1)}秒`;
    case "bounceRate":
      return item.bounceRate === null ? "-" : `${item.bounceRate.toFixed(1)}%`;
    case "completedViewers":
      return formatLargeNumber(item.completedViewers);
    default:
      return "-";
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
