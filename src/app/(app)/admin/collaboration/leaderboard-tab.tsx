"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaderboard } from "@/components/leaderboard/leaderboard";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import type { AccountLeaderboardRow } from "@/types";

interface LeaderboardApiResponse {
  leaderboardData: AccountLeaderboardRow[];
  accountIds: string[];
  ownContentDirections: string[];
  error?: string;
}

export function LeaderboardTab() {
  const [data, setData] = useState<AccountLeaderboardRow[] | null>(null);
  const [ownAccountIds, setOwnAccountIds] = useState<string[]>([]);
  const [ownContentDirections, setOwnContentDirections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/leaderboard", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as LeaderboardApiResponse;
        throw new Error(payload.error || "获取排行榜数据失败");
      }
      const json = (await res.json()) as LeaderboardApiResponse;
      setData(json.leaderboardData ?? []);
      setOwnAccountIds(json.accountIds ?? []);
      setOwnContentDirections(json.ownContentDirections ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取排行榜数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  if (loading) {
    return (
      <div className="space-y-4">
        {/* 控制条骨架 */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between py-1">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-44 rounded-xl" />
            <Skeleton className="h-8 w-44 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>

        {/* 桌面端表格骨架 */}
        <div className="hidden md:block rounded-2xl bg-white p-4 shadow-card-ring space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#E2E2DF]">
            <Skeleton className="h-5 w-12 rounded" />
            <Skeleton className="h-5 w-28 rounded" />
            <Skeleton className="h-5 w-20 rounded" />
            <Skeleton className="h-5 w-20 rounded" />
            <Skeleton className="h-5 w-20 rounded" />
            <Skeleton className="h-5 w-24 rounded" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-[#E2E2DF]/40">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-5 w-28 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-5 w-20 rounded-lg" />
            </div>
          ))}
        </div>

        {/* 移动端卡片骨架 */}
        <div className="block md:hidden space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-3.5 shadow-card-ring space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24 rounded" />
                    <Skeleton className="h-3 w-16 rounded" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
        <div className="inline-flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-[14px] font-medium text-[#141413]">排行榜数据加载失败</p>
          <p className="text-[12px] text-[#78716C]">{error}</p>
        </div>
        <Button
          type="button"
          size="s"
          variant="outline"
          onClick={fetchLeaderboard}
          className="inline-flex items-center gap-1.5"
        >
          <RefreshCw className="size-3.5" />
          重新加载
        </Button>
      </div>
    );
  }

  return (
    <Leaderboard
      data={data ?? []}
      ownAccountIds={ownAccountIds}
      ownContentDirections={ownContentDirections}
      currentDate={formatShanghaiDateOnly()}
      defaultRange="week"
      defaultCompact={true}
    />
  );
}
