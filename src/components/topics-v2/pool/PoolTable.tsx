"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import type { TopicPoolExplorerProps } from "@/lib/topics/domain/pool-view";

export type PoolTableProps = Pick<
  TopicPoolExplorerProps,
  "items" | "loading" | "onGoToFeishu" | "onSelectTopic"
>;

export function PoolTable({
  items,
  loading,
  onGoToFeishu,
  onSelectTopic,
}: PoolTableProps) {
  return (
    <>
        {/* 表格视图：发丝细线、无斑马纹、数字右对齐 */}
        <Card className={`overflow-x-auto p-0 gap-0 transition-opacity duration-200 ${loading ? "opacity-60" : "opacity-100"}`}>
          <table className="w-full min-w-[720px] text-left text-[13px] border-collapse">
            <thead className="border-b border-[#E2E2DF]/60 text-[12px] font-normal text-[#78716C]">
              <tr>
                <th className="py-2.5 px-3">母题</th>
                <th className="py-2.5 px-3 min-w-[240px]">选题名称</th>
                <th className="py-2.5 px-3 text-right">历史最高播放</th>
                <th className="py-2.5 px-3 text-right">优质作品数</th>
                <th className="py-2.5 px-3">近 7 天热度</th>
                <th className="py-2.5 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E2DF] bg-white">
              {items.map((item) => {
                const summary = item.summary;
                const isWriting = item.isWritingByMe === true;

                const bestPlay = summary?.internalMetrics?.bestPlayCount ?? summary?.bestPlayCount ?? null;
                const qualifiedCount = summary?.qualifiedWorkCount ?? null;
                const workCount = summary?.internalMetrics?.workCount ?? null;
                const participants7d = item.recent7dParticipants ?? null;
                const currentWritingCount = item.currentWritingCount ?? null;

                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectTopic(item.id)}
                    className="group hover:bg-[#F7F7F6] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-3 text-[#78716C] font-normal whitespace-nowrap">
                      {item.topics?.name || "常规母题"}
                    </td>
                    <td className="py-3 px-3 max-w-sm">
                      <div className="text-[14px] font-normal text-[#1F1E1D] group-hover:text-[#D97757] truncate">
                        {item.title}
                      </div>
                      {item.hook && (
                        <div className="text-[12px] text-[#78716C] truncate mt-0.5 font-sans">
                          “{item.hook}”
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums font-normal text-[#1F1E1D]">
                      {bestPlay !== null
                        ? bestPlay >= 10000
                          ? `${(bestPlay / 10000).toFixed(1)}万`
                          : bestPlay.toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#1F1E1D]">
                      {qualifiedCount === null
                        ? "—"
                        : qualifiedCount > 0
                          ? `${qualifiedCount} 条`
                          : workCount === 0
                            ? "尚无作品"
                            : workCount !== null
                              ? "暂未达标"
                              : "—"}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-[#78716C]">
                      <span className="tabular-nums">近 7 天 {participants7d !== null ? `${participants7d} 人参与` : "—"}</span>
                      {(currentWritingCount ?? 0) > 0 && (
                        <span className="text-status-info ml-1 tabular-nums">
                          ({currentWritingCount}人在写)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onGoToFeishu(item);
                        }}
                        className={`px-2.5 h-7 rounded-md text-[12px] font-normal transition-all active:scale-[0.99] active:duration-120 cursor-pointer ${
                          isWriting
                            ? "bg-status-success/[0.08] text-status-success hover:bg-status-success/[0.15]"
                            : "bg-[#F1F1F0] text-[#1F1E1D] hover:bg-[#EBEBE9]"
                        }`}
                        aria-label={isWriting ? "继续创作" : "去飞书创作"}
                      >
                        {isWriting ? "继续创作" : "去飞书创作"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
    </>
  );
}
