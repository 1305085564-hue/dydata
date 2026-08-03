"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BarChart2, AlertTriangle, RefreshCw } from "lucide-react";
import { fetchTopicJson, parseComparisonResponse } from "@/lib/topics/v2-client-contract";
import type { TopicComparisonDimension, TopicComparisonItem, TopicOption } from "./types";

interface TopicComparisonMatrixProps {
  topics: TopicOption[];
  topicsError?: string | null;
}

export function TopicComparisonMatrix({ topics, topicsError = null }: TopicComparisonMatrixProps) {
  const [dimension, setDimension] = useState<TopicComparisonDimension>("topic");
  const [days, setDays] = useState<number>(30);
  const [topicId, setTopicId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TopicComparisonItem[]>([]);
  const [sampleTotal, setSampleTotal] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const needsTopicSelection = dimension === "account" && !topicId;
  const requestIdRef = useRef(0);

  const loadComparison = useCallback(async () => {
    if (needsTopicSelection) return;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ dimension, days: String(days) });
    if (dimension === "account") params.set("topicId", topicId);

    try {
      const parsed = parseComparisonResponse(await fetchTopicJson(`/api/topics/comparison?${params.toString()}`));
      if (requestId !== requestIdRef.current) return;
      setData(parsed.rows as TopicComparisonItem[]);
      setSampleTotal(parsed.sampleTotal);
    } catch (err: unknown) {
      if (requestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : "横向对比加载失败");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [days, dimension, needsTopicSelection, topicId]);

  useEffect(() => {
    void loadComparison();
  }, [loadComparison, retryToken]);

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-zinc-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#5F82A8]/10 text-[#5F82A8]">
              <BarChart2 className="w-3.5 h-3.5" />
            </span>
            <h2 className="text-base font-semibold text-zinc-900">选题效果横向对比矩阵</h2>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 font-normal">按母题或指定母题下的账号比较真实作品表现。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-zinc-100/80 rounded-lg text-xs font-medium text-zinc-600">
            <button
              type="button"
              onClick={() => setDimension("topic")}
              className={`px-3 py-1 rounded-md transition-colors ${
                dimension === "topic" ? "bg-white text-zinc-900 shadow-2xs font-semibold" : "hover:text-zinc-900 font-normal"
              }`}
              aria-label="按母题对比"
            >
              按母题对比
            </button>
            <button
              type="button"
              onClick={() => setDimension("account")}
              className={`px-3 py-1 rounded-md transition-colors ${
                dimension === "account" ? "bg-white text-zinc-900 shadow-2xs font-semibold" : "hover:text-zinc-900 font-normal"
              }`}
              aria-label="按账号对比"
            >
              按账号对比
            </button>
          </div>

          {dimension === "account" && topicsError ? (
            <span className="text-xs text-rose-700">母题列表加载失败</span>
          ) : dimension === "account" && (
            <select
              value={topicId}
              onChange={(event) => setTopicId(event.target.value)}
              className="max-w-44 text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-zinc-700 font-normal"
              aria-label="选择对比母题"
            >
              <option value="">选择母题...</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-zinc-700 font-normal"
            aria-label="时间跨度"
          >
            <option value={14}>近 14 天</option>
            <option value={30}>近 30 天</option>
            <option value={60}>近 60 天</option>
          </select>
        </div>
      </div>

      {needsTopicSelection ? (
        <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-200 rounded-xl bg-zinc-50/50 font-normal">
          请在上方选择母题后查看账号对比
        </div>
      ) : loading ? (
        <div className="py-12 text-center text-xs text-zinc-500 font-normal">
          <RefreshCw className="w-4 h-4 text-zinc-400 animate-spin mx-auto mb-2" />
          <span>对比矩阵加载中...</span>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
          <p className="text-sm font-medium">横向对比加载失败</p>
          <p className="text-xs mt-1 text-rose-600 font-normal">{error}</p>
          <button
            type="button"
            onClick={() => setRetryToken((value) => value + 1)}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-100 active:scale-[0.97] transition-all"
            aria-label="重试加载对比矩阵"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重试</span>
          </button>
        </div>
      ) : data.length === 0 ? (
        <div className="py-12 text-center text-xs text-zinc-500 font-normal border border-dashed border-zinc-200 rounded-xl bg-zinc-50/50">
          该时间段内暂无作品快照数据
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs font-mono text-zinc-500 font-normal">样本作品 {sampleTotal} 条</div>
          {data.map((item) => {
            const labelName = dimension === "topic" ? item.topicName || "常规母题" : `${item.accountName || "未命名账号"}`;
            const qualPercent = Math.round(item.qualifiedRate * 100);
            const format = (value: number) => (value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString());

            return (
              <div
                key={`${item.topicId ?? "topic"}-${item.accountId ?? "account"}`}
                className="p-3.5 bg-zinc-50/60 border border-zinc-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="w-full md:w-56 shrink-0 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-zinc-900 text-xs truncate min-w-0">{labelName}</span>
                    {item.lowConfidence && (
                      <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-normal inline-flex items-center gap-1 shrink-0">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        <span>样本较少</span>
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-zinc-500 mt-0.5 font-normal">
                    作品 {item.workCount} 条 · 达标 {item.qualifiedCount} 条
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex justify-between text-xs text-zinc-500 mb-1 font-normal">
                    <span>作品达标率</span>
                    <span className="font-semibold text-zinc-800 font-mono">{qualPercent}%</span>
                  </div>
                  <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#5F82A8] transition-all duration-300 rounded-full"
                      style={{ width: `${Math.min(qualPercent, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs text-right shrink-0 font-mono">
                  <div>
                    <div className="text-xs text-zinc-500 font-normal">平均播放</div>
                    <div className="font-semibold text-zinc-800 text-xs mt-0.5">{format(item.avgPlayCount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 font-normal">最高播放</div>
                    <div className="font-semibold text-emerald-600 text-xs mt-0.5">{format(item.bestPlayCount)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
