"use client";

import React, { useState } from "react";
import { Layers, Plus, FileText, ArrowRight, X, Sparkles } from "lucide-react";
import type { TopicClaimItem } from "./types";

interface MyClaimSlotBarProps {
  claims: TopicClaimItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onStartScripting: (subTopicId: string) => Promise<void>;
  onReturnClaim: (subTopicId: string) => Promise<void>;
  onSelectTopic: (subTopicId: string) => void;
}

export function MyClaimSlotBar({
  claims,
  onStartScripting,
  onReturnClaim,
  onSelectTopic,
}: MyClaimSlotBarProps) {
  const [operatingId, setOperatingId] = useState<string | null>(null);

  // 仅筛选有效候选或写作中的认领
  const activeClaims = claims.filter(
    (c) => c.status === "candidate" || c.status === "scripting",
  );
  const occupiedCount = activeClaims.length;

  // 填充固定 5 个槽位
  const slots: (TopicClaimItem | null)[] = Array.from({ length: 5 }).map(
    (_, idx) => activeClaims[idx] || null,
  );

  const handleStartScripting = async (
    e: React.MouseEvent,
    subTopicId: string,
  ) => {
    e.stopPropagation();
    try {
      setOperatingId(subTopicId);
      await onStartScripting(subTopicId);
    } finally {
      setOperatingId(null);
    }
  };

  const handleReturn = async (e: React.MouseEvent, subTopicId: string) => {
    e.stopPropagation();
    try {
      setOperatingId(subTopicId);
      await onReturnClaim(subTopicId);
    } finally {
      setOperatingId(null);
    }
  };

  const scrollToTopicPool = () => {
    const poolElement = document.getElementById("topic-pool-explorer");
    if (poolElement) {
      poolElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className="bg-white border border-[#E5E0D6] rounded-2xl p-4.5 shadow-xs mb-6">
      {/* 头部进度说明 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-[#ECE7DE]">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#D97757]/10 text-[#D97757]">
            <Layers className="w-3.5 h-3.5" />
          </span>
          <div>
            <h2 className="text-sm font-medium text-[#1C1917] tracking-tight flex items-center gap-2">
              <span>我的选题槽位</span>
              <span className="text-xs tabular-nums text-[#78716C] font-normal">
                (
                <span
                  className={
                    occupiedCount === 5
                      ? "text-[#D99E55] font-medium"
                      : "text-[#292524] font-medium"
                  }
                >
                  {occupiedCount}
                </span>{" "}
                / 5)
              </span>
            </h2>
          </div>
        </div>

        <div className="text-xs text-[#78716C] font-normal">
          {occupiedCount === 5 ? (
            <span className="text-[#292524] bg-[#F5F3EE] px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 font-medium">
              <Sparkles className="w-3 h-3" />
              <span>槽位已满（5/5），放回不写的选题解锁新槽位</span>
            </span>
          ) : (
            <span>上限 5 条，及时放回不写的选题防止占位</span>
          )}
        </div>
      </div>

      {/* 5 个物理槽位 Block 网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {slots.map((item, index) => {
          if (!item) {
            // 空置槽位
            return (
              <div
                key={`empty-slot-${index}`}
                onClick={scrollToTopicPool}
                className="group relative bg-[#FBF9F5]/70 hover:bg-[#F5F3EE]/80 border border-dashed border-[#E5E0D6] hover:border-[#D97757]/50 rounded-xl p-3.5 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[110px] text-center"
              >
                <div className="w-7 h-7 rounded-full bg-white text-[#78716C] group-hover:text-[#D97757] group-hover:scale-105 border border-[#E5E0D6] flex items-center justify-center mb-1.5 transition-all shadow-2xs">
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </div>
                <span className="text-xs font-medium text-[#78716C] group-hover:text-[#292524] transition-colors">
                  空置槽位 {index + 1}
                </span>
                <span className="text-[11px] text-[#78716C] mt-0.5 font-normal">
                  去选题池认领
                </span>
              </div>
            );
          }

          const isScripting = item.status === "scripting";
          const subTitle = item.subTopic?.title || "未命名选题";

          return (
            <div
              key={item.id}
              onClick={() => item.subTopicId && onSelectTopic(item.subTopicId)}
              className={`group relative rounded-xl p-3.5 border transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[110px] shadow-xs ${
                isScripting
                  ? "bg-[#6FAA7D]/10/40 border-[#E5E0D6]/80 hover:border-[#E5E0D6]"
                  : "bg-white border-[#E5E0D6] hover:border-[#E5E0D6]"
              }`}
            >
              <div>
                {/* 状态徽章与顶栏 */}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  {isScripting ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#6FAA7D]/10 text-[#292524]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6FAA7D] animate-pulse" />
                      <span>脚本写作中</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#F5F3EE] text-[#292524]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#78716C]" />
                      <span>已认领候选</span>
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={operatingId === item.subTopicId}
                    onClick={(e) =>
                      item.subTopicId && handleReturn(e, item.subTopicId)
                    }
                    className="p-1 text-[#78716C] hover:text-[#DC2626] hover:bg-[#F5F3EE] rounded-md transition-colors opacity-70 group-hover:opacity-100"
                    title="放弃并放回选题池"
                    aria-label="放弃认领"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h3 className="text-xs font-semibold text-[#1C1917] group-hover:text-[#D97757] transition-colors line-clamp-2 leading-snug">
                  {subTitle}
                </h3>
              </div>

              {/* 底部操作按钮 */}
              <div className="pt-2 mt-2 border-t border-[#ECE7DE]/80 flex items-center justify-between">
                {isScripting ? (
                  <button
                    type="button"
                    disabled={operatingId === item.subTopicId}
                    onClick={(e) =>
                      item.subTopicId &&
                      handleStartScripting(e, item.subTopicId)
                    }
                    className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-[#6FAA7D]/80 hover:bg-[#6FAA7D]/60 text-white text-[11px] font-medium transition-all shadow-2xs active:scale-[0.985] active:duration-75"
                  >
                    <FileText className="w-3 h-3" />
                    <span>去写脚本</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={operatingId === item.subTopicId}
                    onClick={(e) =>
                      item.subTopicId &&
                      handleStartScripting(e, item.subTopicId)
                    }
                    className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] text-white text-[11px] font-medium transition-all shadow-2xs active:scale-[0.985] active:duration-75"
                  >
                    <span>开写此题</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
