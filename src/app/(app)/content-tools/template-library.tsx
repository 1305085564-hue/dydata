"use client";

import { useCallback, useEffect, useState } from "react";
import { BookCopy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { ContentToolAccount, TemplateLibraryResponse } from "./types";
import { TEMPLATE_DAY_OPTIONS } from "./utils";

type TemplateLibraryProps = {
  accounts: ContentToolAccount[];
};

export function TemplateLibrary({ accounts }: TemplateLibraryProps) {
  const [accountId, setAccountId] = useState<string>("all");
  const [days, setDays] = useState<14 | 30 | 60>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TemplateLibraryResponse["data"] | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/content-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "template_library",
          accountId: accountId === "all" ? null : accountId,
          days,
          minBreakoutCoefficient: 2,
        }),
      });

      const result = (await response.json()) as TemplateLibraryResponse | { error: string };
      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "模板库加载失败");
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "模板库加载失败");
    } finally {
      setLoading(false);
    }
  }, [accountId, days]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm ring-1 ring-zinc-950/5 sm:p-5">
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
              <SelectTrigger className="h-11 w-full rounded-lg bg-white">
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
              onValueChange={(value) => setDays(Number(value) as 14 | 30 | 60)}
              items={TEMPLATE_DAY_OPTIONS.map((option) => ({ value: String(option), label: `近 ${option} 天` }))}
            >
              <SelectTrigger className="h-11 w-full rounded-lg bg-white">
                <SelectValue placeholder="时间范围" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_DAY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    近 {option} 天
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="h-11" onClick={() => void loadTemplates()} disabled={loading}>
            <BookCopy className="size-4" />
            {loading ? "刷新中" : "刷新模板"}
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorState description={error} onRetry={() => void loadTemplates()} />
      ) : null}

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : null}

      {data ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm text-sm text-zinc-500">
            当前共提炼 {data.sampleCount} 条爆款样本，爆款系数门槛 {data.minBreakoutCoefficient}。
          </div>

          {data.categories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
              当前范围内暂无可提炼模板的爆款样本。
            </div>
          ) : (
            data.categories.map((category) => (
              <div key={category.category} className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[18px] font-semibold tracking-tight text-zinc-800">{category.category}</h3>
                  <div className="text-xs text-zinc-500">模板 {category.templates.length} 个</div>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {category.templates.map((template) => (
                    <Card key={`${category.category}-${template.name}`} className="border-zinc-200 bg-white shadow-sm">
                      <CardHeader>
                        <CardDescription>适用样本 {template.sampleCount} 条</CardDescription>
                        <CardTitle>{template.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="rounded-xl bg-zinc-50 p-4">
                          <div className="text-xs text-zinc-500">结构骨架</div>
                          <ol className="mt-2 space-y-2 text-[13px] leading-[1.7] text-zinc-800">
                            {template.structure.map((item, index) => (
                              <li key={`${template.name}-${index}`} className="flex gap-2">
                                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-medium text-zinc-500 font-mono tabular-nums">
                                  {index + 1}
                                </span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-zinc-200 bg-white p-4">
                            <div className="text-xs text-zinc-500">适用场景</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {template.suitableFor.map((item) => (
                                <span key={item} className="rounded-full bg-zinc-50 px-2.5 py-1 text-xs text-zinc-500 ring-1 ring-zinc-200">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-xl border border-zinc-200 bg-white p-4">
                            <div className="text-xs text-zinc-500">数据证据</div>
                            <div className="mt-1 text-sm text-zinc-800">{template.evidence}</div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium text-zinc-800">参考视频</div>
                          {template.referenceVideos.map((video) => (
                            <div key={video.videoId} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
                              <div className="font-medium text-zinc-800">{video.title ?? "未命名视频"}</div>
                              <div className="mt-1 text-xs text-zinc-500">{video.accountName ?? "未知账号"}</div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
