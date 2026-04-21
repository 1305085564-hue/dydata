"use client";

import { useState } from "react";
import { Loader2, Sparkles, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ContentToolAccount, TopicSuggestResponse } from "./types";
import { TOPIC_DAY_OPTIONS, formatPlayCount } from "./utils";

type TopicSuggestProps = {
  accounts: ContentToolAccount[];
};

export function TopicSuggest({ accounts }: TopicSuggestProps) {
  const [accountId, setAccountId] = useState<string>("all");
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TopicSuggestResponse["data"] | null>(null);

  async function loadSuggestions() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/content-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "topic_suggest",
          accountId: accountId === "all" ? null : accountId,
          days,
          limit: 4,
        }),
      });

      const result = (await response.json()) as TopicSuggestResponse | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "选题建议加载失败");
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "选题建议加载失败");
    } finally {
      setLoading(false);
    }
  }



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
              onValueChange={(value) => setDays(Number(value) as 7 | 14 | 30)}
              items={TOPIC_DAY_OPTIONS.map((option) => ({ value: String(option), label: `近 ${option} 天` }))}
            >
              <SelectTrigger className="h-11 w-full rounded-2xl bg-background/80">
                <SelectValue placeholder="时间范围" />
              </SelectTrigger>
              <SelectContent>
                {TOPIC_DAY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    近 {option} 天
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="h-11 rounded-2xl" onClick={() => void loadSuggestions()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            重新生成
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="glass-card-static rounded-3xl px-4 py-8 text-sm text-muted-foreground">正在生成选题建议...</div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="glass-card-static rounded-3xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold tracking-tight">爆款依据</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    样本 {data.sampleCount} 条 · 热点日期 {data.marketDate ?? "暂无"}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                  <TrendingUp className="size-3.5" />
                  高播放样本
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.evidenceSummary.map((item) => (
                  <div key={item} className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="glass-card-static rounded-3xl p-5">
              <div className="text-sm font-semibold tracking-tight">使用建议</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• 优先挑 1 个热点题材 + 1 个历史高胜率角度组合。</li>
                <li>• 参考视频只抄结构，不直接复刻标题或原句。</li>
                <li>• 预期表现以“高于中位数多少倍”理解，不当作保底承诺。</li>
              </ul>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {data.suggestions.map((item) => (
              <Card key={item.title} className="glass-card-static border-white/60 bg-white/75">
                <CardHeader>
                  <CardDescription>{item.category}</CardDescription>
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <div className="text-xs text-muted-foreground">切入角度</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{item.angle}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                      <div className="text-xs text-muted-foreground">预期表现</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{item.expectedPerformance}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                      <div className="text-xs text-muted-foreground">数据依据</div>
                      <div className="mt-1 text-sm text-foreground">{item.evidence}</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">参考视频</div>
                    {item.referenceVideos.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
                        暂无参考视频
                      </div>
                    ) : (
                      item.referenceVideos.map((video) => (
                        <div key={`${item.title}-${video.videoId}`} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                          <div className="text-sm font-medium text-foreground">{video.title ?? "未命名视频"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {video.accountName ?? "未知账号"} · 24h播放 {video.playCount24h ? formatPlayCount(video.playCount24h) : "暂无"}
                            {typeof video.breakoutCoefficient === "number"
                              ? ` · 爆款系数 ${video.breakoutCoefficient.toFixed(2)}`
                              : ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
