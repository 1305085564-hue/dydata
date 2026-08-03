"use client";

import { useState } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Loader2, Check, Flame, Layers, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClaimToggleRequest } from "@/lib/topics/claim-toggle";
import { TopicDetailModal } from "./topic-detail-modal";

interface TopicSummary {
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
  bestPlayCount?: number | null;
  bestCopy: string | null;
  latestCopy: string | null;
}

export interface SubTopicClaim {
  id: string;
  user_id: string;
  status: "candidate" | "scripting" | "returned";
  claimed_at: string;
}

export interface SubTopicItem {
  id: string;
  title: string;
  hook: string;
  topic_id: string;
  group_id: string | null;
  emotion_tag: string | null;
  source: string | null;
  audience: string | null;
  created_by: string;
  created_at: string;
  topics: {
    id: string;
    name: string;
    sort_order?: number;
  } | null;
  topic_groups: {
    id: string;
    name: string;
  } | null;
  summary: TopicSummary;
  claimCount: number;
  sub_topic_claims?: SubTopicClaim[];
  _score?: number;
  _daysSinceLastWork?: number | null;
  _avgPlayCount?: number | null;
  _bestPlayCount?: number | null;
}

interface SubTopicCardProps {
  item: SubTopicItem;
  currentUserId: string;
  isLimitReached: boolean;
  isClaimedByMe: boolean;
  onClaimSuccess: () => void;
  onLimitReached409?: () => void;
  onRefresh?: () => void;
  onOpenDetail?: (item: SubTopicItem) => void;
  compactView?: boolean;
}

export function SubTopicCard({
  item,
  currentUserId,
  isLimitReached,
  isClaimedByMe,
  onClaimSuccess,
  onLimitReached409,
  onRefresh,
  onOpenDetail,
  compactView = false
}: SubTopicCardProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const averagePlay = item.summary.averagePlayCount;

  // 点击卡片/单行数据行空白区域触发 3:4 沉浸弹窗
  const handleCardClick = () => {
    if (onOpenDetail) {
      onOpenDetail(item);
    } else {
      setDetailModalOpen(true);
    }
  };

  // 认领 / 放回切换逻辑（解耦点击，阻止冒泡）
  const handleClaimToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isClaiming) return;

    if (!isClaimedByMe && isLimitReached) {
      if (onLimitReached409) {
        onLimitReached409();
      } else {
        feedbackToast.warning("候选选题已满 5 条上限，请先放回或推进旧选题");
      }
      return;
    }

    setIsClaiming(true);
    try {
      const request = getClaimToggleRequest(item.id, isClaimedByMe);
      const res = await fetch(request.endpoint, { method: "POST" });
      const data = await res.json();

      if (!isClaimedByMe && res.status === 409) {
        if (onLimitReached409) {
          onLimitReached409();
        } else {
          feedbackToast.warning("候选选题已满 5 条上限，请先放回或推进旧选题");
        }
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || (isClaimedByMe ? "放回选题池失败" : "认领失败"));
      }

      feedbackToast.success(isClaimedByMe ? "已放回选题池" : `认领选题成功：“${item.title}”`);
      onClaimSuccess();
    } catch (err) {
      feedbackToast.error(isClaimedByMe ? "放回失败" : "认领失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <>
      {compactView ? (
        /* Linear / Notion 级超高信息密度单行表格数据行 */
        <div
          onClick={handleCardClick}
          tabIndex={0}
          role="button"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCardClick();
            }
          }}
          className={cn(
            "group flex h-10 items-center justify-between gap-3 px-3 text-xs transition-colors cursor-pointer border-b border-zinc-100/80 last:border-b-0 select-none",
            ((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0) >= 10000 || item.summary.qualifiedWorkCount > 0
              ? "bg-white hover:bg-zinc-50/80"
              : "bg-zinc-50/40 hover:bg-zinc-50/90"
          )}
        >
          {/* 列 1：状态与认领 Action (84px) */}
          <div className="w-[84px] shrink-0" onClick={(e) => e.stopPropagation()}>
            {isClaimedByMe ? (
              <button
                type="button"
                disabled={isClaiming}
                onClick={handleClaimToggle}
                title="点击放回选题池"
                className="inline-flex h-6.5 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-100/80 px-2 text-[11px] font-medium text-zinc-600 shadow-2xs transition-all active:scale-95 hover:bg-zinc-200 hover:text-zinc-800 cursor-pointer"
              >
                {isClaiming ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3 stroke-[2] text-zinc-500" />}
                已认领
              </button>
            ) : (
              <button
                type="button"
                disabled={isClaiming}
                onClick={handleClaimToggle}
                className={cn(
                  "flex h-6.5 items-center justify-center rounded-md border px-2.5 text-[11px] font-normal transition-all active:scale-95 cursor-pointer",
                  isLimitReached
                    ? "border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757] hover:bg-[#D97757] hover:text-white"
                    : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-[#D97757] hover:text-white hover:border-[#D97757]"
                )}
                title={isLimitReached ? "候选选题已达 5 条上限（点击选择替换）" : "认领此选题"}
              >
                {isClaiming ? <Loader2 className="size-3 animate-spin" /> : "认领"}
              </button>
            )}
          </div>

          {/* 列 2：选题标题 (绝对主角) */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="font-semibold text-zinc-900 truncate text-[13px] group-hover:text-[#D97757] transition-colors shrink-0 max-w-[85%]">
              {item.title}
            </span>
          </div>

          {/* 列 3：母题/情感标签 (120px) */}
          <div className="w-[120px] shrink-0 flex items-center gap-1 truncate justify-start">
            {item.topic_groups && (
              <span className="inline-flex items-center gap-1 rounded bg-zinc-100/80 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-600 truncate max-w-[80px]">
                <Layers className="size-2.5 text-zinc-400 shrink-0" />
                <span className="truncate">{item.topic_groups.name}</span>
              </span>
            )}
          </div>

          {/* 列 4：播放量与爆款突出 (大字号黑阶对比) */}
          <div className="w-[110px] shrink-0 flex items-center justify-end gap-2 text-[11.5px] tabular-nums">
            {((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0) > 0 ? (
              <span className="font-extrabold text-zinc-950 text-[13px] flex items-center gap-1">
                <span>
                  {((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0) >= 10000
                    ? `${(((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0) / 10000).toFixed(1)}w`
                    : ((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0).toLocaleString()}
                </span>
                <span className="text-[10px] font-normal text-zinc-400">最高</span>
              </span>
            ) : (
              <span className="text-zinc-400 text-[11px]">暂无作品</span>
            )}
          </div>

          {/* 列 5：3:4 沉浸弹窗入口 (28px) */}
          <div className="w-7 shrink-0 flex justify-end text-zinc-300 group-hover:text-zinc-600 transition-colors">
            <ChevronRight className="size-4" />
          </div>
        </div>
      ) : (
        /* 标准网格卡片形态 (恪守冷灰纸感美学，靠字阶与底色梯度自然突出) */
        <div
          onClick={handleCardClick}
          tabIndex={0}
          role="button"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCardClick();
            }
          }}
          className={cn(
            "group relative flex flex-col justify-between rounded-xl border p-3.5 transition-all duration-200 cursor-pointer min-h-[116px] h-auto space-y-2.5 select-none",
            ((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0) >= 10000 || item.summary.qualifiedWorkCount > 0
              ? "border-zinc-200 bg-white shadow-xs hover:border-zinc-300 hover:shadow-sm hover:-translate-y-0.5"
              : "border-zinc-200/70 bg-zinc-50/60 shadow-none hover:bg-white hover:border-zinc-200 hover:shadow-xs hover:-translate-y-0.5"
          )}
        >
          {/* 顶行：【流量数据大阶梯与时间】 */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0) > 0 ? (
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[16px] font-extrabold text-zinc-950 tabular-nums tracking-tight">
                  {((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0) >= 10000
                    ? `${(((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0) / 10000).toFixed(1)}w`
                    : ((item._bestPlayCount ?? item.summary.bestPlayCount ?? item.summary.averagePlayCount) ?? 0).toLocaleString()}
                </span>
                <span className="text-[10.5px] text-zinc-400 font-normal">最高播放</span>

                {item.summary.qualifiedWorkCount > 0 && (
                  <span className="text-[11.5px] font-semibold text-zinc-700 ml-1.5 tabular-nums">
                    · {item.summary.qualifiedWorkCount}条爆款
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11.5px] text-zinc-400 font-normal">
                <span>暂无爆款作品</span>
              </div>
            )}

            <div className="flex items-center gap-1 shrink-0 ml-auto text-[11px] text-zinc-400">
              {item._daysSinceLastWork !== undefined && item._daysSinceLastWork !== null && item._daysSinceLastWork <= 30 ? (
                <span className={cn(item._daysSinceLastWork <= 3 ? "text-[#D97757] font-medium" : "text-zinc-500")}>
                  {item._daysSinceLastWork <= 3 ? `🔥 ${item._daysSinceLastWork}天前` : `${item._daysSinceLastWork}天前`}
                </span>
              ) : item.claimCount > 0 ? (
                <span className="text-zinc-400">{item.claimCount}人在写</span>
              ) : null}
            </div>
          </div>

          {/* 中间行：【选题标题】(绝对主角) */}
          <div className="flex-1 space-y-0.5 min-w-0">
            <h3 className="text-[13.5px] font-semibold text-zinc-900 leading-snug line-clamp-2 group-hover:text-[#D97757] transition-colors">
              {item.title}
            </h3>
          </div>

          {/* 底行：【静默灰阶标签与认领 Action Bar】 */}
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-zinc-100 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {item.topic_groups && (
                <span className="inline-flex items-center gap-1 rounded bg-zinc-100/80 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-600 border-0">
                  <Layers className="size-2.5 text-zinc-400 shrink-0" />
                  <span className="truncate max-w-[90px]">{item.topic_groups.name}</span>
                </span>
              )}
              {item.emotion_tag && (
                <span className="inline-flex items-center gap-0.5 rounded bg-zinc-100/80 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-600 border-0">
                  <Flame className="size-2.5 text-zinc-400 shrink-0" />
                  <span>{item.emotion_tag}</span>
                </span>
              )}
            </div>

            {/* 独立 Action 按钮 (静默不抢戏) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {isClaimedByMe ? (
                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={handleClaimToggle}
                  title="点击放回选题池"
                  aria-label={`已认领：${item.title}，点击放回选题池`}
                  className="inline-flex h-6.5 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-100/80 px-2.5 text-[11px] font-medium text-zinc-600 shadow-2xs active:scale-95 transition-all duration-150 hover:bg-zinc-200 hover:text-zinc-800 cursor-pointer"
                >
                  {isClaiming ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3 stroke-[2] text-zinc-500" />}
                  已认领
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={handleClaimToggle}
                  className={cn(
                    "flex h-6.5 items-center justify-center rounded-md border px-2.5 text-[11px] font-normal active:scale-95 transition-all duration-150 cursor-pointer",
                    isLimitReached
                      ? "border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757] hover:bg-[#D97757] hover:text-white"
                      : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-[#D97757] hover:text-white hover:border-[#D97757] hover:font-medium"
                  )}
                  title={isLimitReached ? "候选选题已达 5 条上限（点击选择替换）" : "认领此选题"}
                >
                  {isClaiming ? <Loader2 className="size-3 animate-spin" /> : "认领"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 当没有传入全局 modal 控制器时，内建 3:4 沉浸中心弹窗 */}
      {!onOpenDetail && (
        <TopicDetailModal
          item={item}
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          currentUserId={currentUserId}
          isLimitReached={isLimitReached}
          isClaimedByMe={isClaimedByMe}
          onClaimSuccess={onClaimSuccess}
          onLimitReached409={onLimitReached409}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}
