"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ContentToolAccount, PublishRecommendResponse } from "./types";
import { PUBLISH_DAY_OPTIONS, formatPlayCount, formatRatio, getConfidenceTone } from "./utils";

type PublishRecommendProps = {
  accounts: ContentToolAccount[];
};

export function PublishRecommend({ accounts }: PublishRecommendProps) {
  const [accountId, setAccountId] = useState<string>("all");
  const [days, setDays] = useState<30 | 60 | 90>(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublishRecommendResponse["data"] | null>(null);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/content-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish_recommend",
          accountId: accountId === "all" ? null : accountId,
          days,
        }),
      });

      const result = (await response.json()) as PublishRecommendResponse | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "发布时间推荐加载失败");
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布时间推荐加载失败");
    } finally {
      setLoading(false);
    }
  }, [accountId, days]);

  useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-border/60 bg-muted/30 p-4 shadow-sm ring-1 ring-foreground/5 backdrop-blur-xl sm:p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_140px] md:items-end">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">账号范围</div>
            <Select
              value={accountId}
              onValueChange={(value) => setAccountId(value || "all")}
              items={[
                { value: "all", label: "全部账号" },
                ...accounts.map((account) => ({ value: account.id, label: account.name })),
              ]}
            >
              <SelectTrigger className="h-11 w-full rounded-2xl bg-background/80">
                <SelectValue placeholder="全部账号" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部账号</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">统计范围</div>
            <Select
              value={String(days)}
              onValueChange={(value) => setDays(Number(value) as 30 | 60 | 90)}
              items={PUBLISH_DAY_OPTIONS.map((option) => ({ value: String(option), label: `近 ${option} 天` }))}
            >
              <SelectTrigger className="h-11 w-full rounded-2xl bg-background/80">
                <SelectValue placeholder="时间范围" />
              </SelectTrigger>
              <SelectContent>
                {PUBLISH_DAY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    近 {option} 天
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="h-11 rounded-2xl" onClick={() => void loadRecommendations()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
            刷新推荐
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="glass-card-static rounded-3xl px-4 py-8 text-sm text-muted-foreground">正在分析最佳发布时间...</div>
      ) : null}

      {data ? (
        <div className="space-y-4">
          <div className="glass-card-static rounded-3xl p-5 text-sm text-muted-foreground">
            分析窗口 {data.windowDays} 天 · 有效样本 {data.sampleCount} 条
          </div>

          {data.recommendations.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              当前范围内暂无足够发布时间数据。
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {data.recommendations.map((item) => (
                <Card key={item.dimensionLabel} className="glass-card-static border-white/60 bg-white/75">
                  <CardHeader>
                    <CardDescription>推荐维度</CardDescription>
                    <CardTitle>{item.dimensionLabel}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {item.recommendedSlots.map((slot) => (
                      <div key={`${item.dimensionLabel}-${slot.hourBlock}-${slot.weekday ?? "all"}`} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {slot.weekday ? `${slot.weekday} · ` : ""}
                              {slot.hourBlock}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{slot.reason}</div>
                          </div>
                          <div className={`rounded-full border px-2.5 py-1 text-xs ${getConfidenceTone(slot.confidence)}`}>
                            可信度 {slot.confidence}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <div>
                            <div className="text-xs text-muted-foreground">历史平均播放</div>
                            <div className="mt-1 text-sm font-medium text-foreground">{formatPlayCount(slot.avgPlayCount)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">爆款率</div>
                            <div className="mt-1 text-sm font-medium text-foreground">{formatRatio(slot.hitRate)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">样本数</div>
                            <div className="mt-1 text-sm font-medium text-foreground">{slot.sampleCount}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
