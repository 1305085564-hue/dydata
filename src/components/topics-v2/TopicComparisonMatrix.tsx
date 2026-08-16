"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BarChart2, AlertTriangle, RefreshCw, ChevronDown } from "lucide-react";
import {
  fetchTopicJson,
  parseComparisonResponse,
} from "@/lib/topics/v2-client-contract";
import type {
  TopicComparisonDimension,
  TopicComparisonItem,
  TopicOption,
} from "./types";

interface TopicComparisonMatrixProps {
  topics: TopicOption[];
  topicsError?: string | null;
  onSelectTopic?: (topicId: string) => void;
}

export function TopicComparisonMatrix({
  topics,
  topicsError = null,
  onSelectTopic,
}: TopicComparisonMatrixProps) {
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
      const parsed = parseComparisonResponse(
        await fetchTopicJson(`/api/topics/comparison?${params.toString()}`),
      );
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#D97757]/10 text-[#D97757]">
            <BarChart2 className="w-3 h-3" />
          </span>
          <h2 className="text-base font-semibold text-zinc-900 tracking-tight">
            选题效果横向对比
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 平铺 Tab 维度切换 */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDimension("topic")}
              className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                dimension === "topic"
                  ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 font-medium"
              }`}
              aria-label="按母题对比"
            >
              按母题
            </button>
            <button
              type="button"
              onClick={() => setDimension("account")}
              className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                dimension === "account"
                  ? "bg-[#D97757]/10 text-[#D97757] font-semibold"
                  : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 font-medium"
              }`}
              aria-label="按账号对比"
            >
              按账号
            </button>
          </div>

          {dimension === "account" && topicsError ? (
            <span className="text-xs text-zinc-500">母题加载失败</span>
          ) : (
            dimension === "account" && (
              <div className="relative inline-flex items-center">
                <select
                  value={topicId}
                  onChange={(event) => setTopicId(event.target.value)}
                  className={`appearance-none text-xs bg-transparent hover:bg-zinc-100 rounded-lg pl-2 pr-5.5 py-1 text-zinc-700 hover:text-zinc-950 font-normal focus:outline-none cursor-pointer transition-colors ${
                    !topicId
                      ? "ring-1 ring-[#D97757]/40 bg-[#D97757]/5 text-[#D97757]"
                      : ""
                  }`}
                  aria-label="选择对比母题"
                >
                  <option value="">选择母题...</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-1 pointer-events-none" />
              </div>
            )
          )}

          {/* 时间跨度平铺下拉 */}
          <div className="relative inline-flex items-center">
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="appearance-none text-xs bg-transparent hover:bg-zinc-100 rounded-lg pl-2 pr-5.5 py-1 text-zinc-600 hover:text-zinc-950 font-normal focus:outline-none cursor-pointer transition-colors"
              aria-label="时间跨度"
            >
              <option value={14}>近 14 天</option>
              <option value={30}>近 30 天</option>
              <option value={60}>近 60 天</option>
            </select>
            <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-1 pointer-events-none" />
          </div>
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
        <div className="py-10 text-center text-zinc-600 bg-zinc-100 border border-zinc-200 rounded-xl">
          <p className="text-sm font-medium">横向对比加载失败</p>
          <p className="text-xs mt-1 text-[#DC2626] font-normal">{error}</p>
          <button
            type="button"
            onClick={() => setRetryToken((value) => value + 1)}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-100 active:scale-[0.97] transition-all"
            aria-label="重试加载对比矩阵"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重试</span>
          </button>
        </div>
      ) : data.length === 0 ? (
        <div className="py-12 px-4 text-center border border-dashed border-zinc-200 rounded-2xl bg-white shadow-xs">
          <div className="w-10 h-10 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto mb-3">
            <BarChart2 className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-800 mb-1">
            暂无对比数据
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto font-normal leading-relaxed">
            需要至少 2 个账号有作品后才能对比
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-xs text-zinc-400 font-normal tabular-nums pb-2">
            样本作品 {sampleTotal} 条
          </div>

          {/* 去盒子化：通透列表流，消除嵌套卡片 */}
          <div className="divide-y divide-zinc-100">
            {data.map((item) => {
              const labelName =
                dimension === "topic"
                  ? item.topicName || "常规母题"
                  : `${item.accountName || "未命名账号"}`;
              const qualPercent = Math.round(item.qualifiedRate * 100);
              const format = (value: number) =>
                value >= 10000
                  ? `${(value / 10000).toFixed(1)}万`
                  : value.toLocaleString();
              const canLinkTopic = Boolean(item.topicId && onSelectTopic);

              return (
                <div
                  key={`${item.topicId ?? "topic"}-${item.accountId ?? "account"}`}
                  onClick={
                    canLinkTopic
                      ? () => onSelectTopic?.(item.topicId!)
                      : undefined
                  }
                  className={`py-3 px-2 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                    canLinkTopic
                      ? "cursor-pointer hover:bg-zinc-50/80 group"
                      : "hover:bg-zinc-50/50"
                  }`}
                  title={
                    canLinkTopic
                      ? `点击联动上方选题大盘查看《${labelName}》的全部子题`
                      : undefined
                  }
                >
                  <div className="w-full md:w-56 shrink-0 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-xs truncate min-w-0 font-medium ${
                          canLinkTopic
                            ? "text-zinc-800 group-hover:text-[#D97757] transition-colors"
                            : "text-zinc-800"
                        }`}
                      >
                        {labelName}
                      </span>
                      {item.lowConfidence && (
                        <span className="text-[11px] bg-zinc-100 text-zinc-500 px-1.5 py-0.2 rounded font-normal inline-flex items-center gap-1 shrink-0">
                          <AlertTriangle className="w-3 h-3 text-[#F59E0B]" />
                          <span>样本少</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 font-normal tabular-nums">
                      作品 {item.workCount} 条 · 达标 {item.qualifiedCount} 条
                    </div>
                  </div>

                  <div className="flex-1 min-w-[140px]">
                    <div className="flex justify-between text-xs text-zinc-500 mb-1 font-normal">
                      <span>达标率</span>
                      <span className="font-semibold text-zinc-800 tabular-nums">
                        {qualPercent}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#4A7FB5] transition-all duration-300 rounded-full"
                        style={{ width: `${Math.min(qualPercent, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs text-right shrink-0 tabular-nums">
                    <div>
                      <div className="text-[11px] text-zinc-400 font-normal">
                        平均播放
                      </div>
                      <div className="font-medium text-zinc-700 text-xs mt-0.5">
                        {format(item.avgPlayCount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-zinc-400 font-normal">
                        最高播放
                      </div>
                      <div className="font-semibold text-[#16A34A] text-xs mt-0.5">
                        {format(item.bestPlayCount)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
