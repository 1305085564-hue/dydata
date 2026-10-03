"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ItemHeading } from "@/components/ui/item-heading";
import type { TopicPoolExplorerProps } from "@/lib/topics/domain/pool-view";

export type PoolGridProps = Pick<
  TopicPoolExplorerProps,
  "items" | "loading" | "onGoToFeishu" | "onSelectTopic"
>;

export function PoolGrid({
  items,
  loading,
  onGoToFeishu,
  onSelectTopic,
}: PoolGridProps) {
  return (
    <>
        {/* V3 卡片网格视图：每行卡片响应式断点 (1列至3列，2xl展现4列，防止1280px下拥挤遮挡按钮) */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 transition-opacity duration-200 ${loading ? "opacity-60" : "opacity-100"}`}>
          {items.map((item) => {
            const summary = item.summary;
            const isWriting = item.isWritingByMe === true;

            // 真实历史数据证明（严禁补造假数据）
            const bestPlay = summary?.internalMetrics?.bestPlayCount ?? summary?.bestPlayCount ?? null;
            const qualifiedCount = summary?.qualifiedWorkCount ?? null;
            const workCount = summary?.internalMetrics?.workCount ?? null;
            const participants7d = item.recent7dParticipants ?? null;
            const inProgressCount = item.currentWritingCount ?? null;

            return (
              <Card
                key={item.id}
                role="article"
                tabIndex={0}
                aria-label={`选题：${item.title}`}
                onClick={() => onSelectTopic(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectTopic(item.id);
                  }
                }}
                className="relative p-4 hover:shadow-claude-float focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:outline-none transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[44px]"
              >
                <div>
                  {/* 顶栏：分类印记与定位小红点 */}
                  <div className="flex items-center justify-between gap-1 mb-2 min-w-0">
                    <span className="text-[12px] font-normal text-[#78716C] tracking-wide flex items-center gap-1 truncate">
                      <span className="size-1.5 rounded-full bg-[#D97757]/70 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {item.topics?.name || "常规母题"}
                        {item.topic_groups?.name ? ` · ${item.topic_groups.name}` : ""}
                      </span>
                    </span>

                    {/* 在写状态微标记 */}
                    {isWriting && (
                      <Badge variant="success">已在写</Badge>
                    )}
                  </div>

                  {/* 标题：饱满清晰 */}
                  <ItemHeading as="h3" className="transition-colors line-clamp-2 mb-1.5">
                    <span className="group-hover:text-[#D97757]">{item.title}</span>
                  </ItemHeading>

                  {/* 一句话 Hook / 立意观点 (纸内纯排版：密集小字 Sans 规范) */}
                  {item.hook && (
                    <p className="text-[13px] font-sans text-[#1F1E1D] line-clamp-2 leading-relaxed mb-2.5">
                      <span className="text-[#D97757] mr-0.5 select-none font-normal">“</span>
                      {item.hook}
                      <span className="text-[#D97757] ml-0.5 select-none font-normal">”</span>
                    </p>
                  )}
                </div>

                {/* 底栏：单行内联全部数据（最高播放 · 达标作品 · 7天热度）+ 创作行动，右侧操作按钮绝对置顶防遮挡 */}
                <div className="pt-2.5 border-t border-[#E2E2DF]/60 flex items-center justify-between gap-2 mt-auto text-[12px] min-w-0">
                  {/* 左侧：数据证明与热度内联，弹性截断不挤压按钮 */}
                  <div className="text-[#78716C] tabular-nums truncate flex items-center gap-1 font-normal min-w-0 flex-1">
                    {bestPlay !== null && (
                      <span className="text-[#1F1E1D] font-normal shrink-0 tabular-nums">
                        最高 {bestPlay >= 10000 ? `${(bestPlay / 10000).toFixed(1)}万` : bestPlay.toLocaleString()}
                      </span>
                    )}

                    {bestPlay !== null && qualifiedCount !== null && (
                      <span className="text-[#E2E2DF] select-none shrink-0">·</span>
                    )}

                    {qualifiedCount !== null && (
                      <span className="text-[#1F1E1D] shrink-0 tabular-nums">
                        {qualifiedCount > 0
                          ? `${qualifiedCount}条优质`
                          : workCount === 0
                            ? "尚无作品"
                            : workCount !== null
                              ? "暂未达标"
                              : "—"}
                      </span>
                    )}

                    {(bestPlay !== null || qualifiedCount !== null) && participants7d !== null && (
                      <span className="text-[#E2E2DF] select-none shrink-0 hidden sm:inline">·</span>
                    )}

                    {participants7d !== null ? (
                      <span className="tabular-nums truncate hidden sm:inline">{participants7d}人参与</span>
                    ) : null}

                    {(inProgressCount ?? 0) > 0 && (
                      <>
                        <span className="text-[#E2E2DF] select-none shrink-0 hidden xl:inline">·</span>
                        <span className="text-status-info font-normal tabular-nums truncate hidden xl:inline">{inProgressCount}人在写</span>
                      </>
                    )}

                    {bestPlay === null && qualifiedCount === null && participants7d === null && (
                      <span className="text-[#A8A29E]">—</span>
                    )}
                  </div>

                  {/* 右侧：操作按钮 (浅砂副行动，移动端保证 ≥36px 高度和 44px 触控容错，避免误触) */}
                  <div className="shrink-0 relative z-10 min-w-fit">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGoToFeishu(item);
                      }}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] sm:min-h-[28px] sm:h-7 rounded-md text-[12px] font-normal transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
                        isWriting
                          ? "bg-status-success/[0.08] text-status-success hover:bg-status-success/[0.15]"
                          : "bg-[#F1F1F0] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                      }`}
                      aria-label={isWriting ? "继续创作此题" : "去飞书创作此题"}
                    >
                      <span>{isWriting ? "继续创作" : "去飞书创作"}</span>
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
    </>
  );
}
