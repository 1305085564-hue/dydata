"use client";

import { useState } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Loader2, User, Check, Flame, Layers, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClaimToggleRequest } from "@/lib/topics/claim-toggle";
import { TopicDetailModal } from "./topic-detail-modal";

interface TopicSummary {
  qualifiedWorkCount: number;
  averagePlayCount: number | null;
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
          className="group flex h-10 items-center justify-between gap-3 px-3 text-xs bg-white hover:bg-zinc-50/90 transition-colors cursor-pointer border-b border-zinc-100/80 last:border-b-0"
        >
          {/* 列 1：状态与认领 Action (84px) */}
          <div className="w-[84px] shrink-0" onClick={(e) => e.stopPropagation()}>
            {isClaimedByMe ? (
              <button
                type="button"
                disabled={isClaiming}
                onClick={handleClaimToggle}
                title="点击放回选题池"
                className="inline-flex h-6.5 items-center gap-1 rounded-md border border-[#6FAA7D]/30 bg-[#6FAA7D]/12 px-2 text-[11px] font-medium text-[#5B9668] transition-colors hover:bg-[#6FAA7D]/22 cursor-pointer"
              >
                {isClaiming ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3 stroke-[2.5]" />}
                已认领
              </button>
            ) : (
              <button
                type="button"
                disabled={isClaiming}
                onClick={handleClaimToggle}
                className={cn(
                  "flex h-6.5 items-center justify-center rounded-md border px-2.5 text-[11px] font-medium transition-all shadow-2xs cursor-pointer",
                  isLimitReached
                    ? "border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757] hover:bg-[#D97757] hover:text-white"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-[#D97757] hover:text-white hover:border-[#D97757]"
                )}
                title={isLimitReached ? "候选选题已达 5 条上限（点击选择替换）" : "认领此选题"}
              >
                {isClaiming ? <Loader2 className="size-3 animate-spin" /> : "认领"}
              </button>
            )}
          </div>

          {/* 列 2：选题标题与一句话 Hook 同行溢出省略 (弹性占满) */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="font-semibold text-zinc-900 truncate text-[13px] group-hover:text-[#D97757] transition-colors shrink-0 max-w-[55%]">
              {item.title}
            </span>
            {item.hook && (
              <span className="text-zinc-400 font-normal truncate text-[12px] flex-1">
                · {item.hook}
              </span>
            )}
          </div>

          {/* 列 3：母题/情感标签 (120px) */}
          <div className="w-[120px] shrink-0 flex items-center gap-1 truncate justify-start">
            {item.topic_groups && (
              <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-600 truncate max-w-[80px]">
                <Layers className="size-2.5 text-zinc-400 shrink-0" />
                <span className="truncate">{item.topic_groups.name}</span>
              </span>
            )}
            {item.emotion_tag && (
              <span className="inline-flex items-center gap-0.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-600 shrink-0">
                <Flame className="size-2.5 text-zinc-400" />
                <span>{item.emotion_tag}</span>
              </span>
            )}
          </div>

          {/* 列 4：均播量与认领人数 (110px) */}
          <div className="w-[110px] shrink-0 flex items-center justify-end gap-3 text-[11.5px] tabular-nums">
            {averagePlay !== null && (
              <span className="font-semibold text-zinc-900">
                {averagePlay >= 10000 ? `${(averagePlay / 10000).toFixed(1)}w` : averagePlay.toLocaleString()}
              </span>
            )}
            <span className="text-zinc-500 font-medium">{item.claimCount}人</span>
          </div>

          {/* 列 5：3:4 沉浸弹窗入口 (28px) */}
          <div className="w-7 shrink-0 flex justify-end text-zinc-300 group-hover:text-zinc-600 transition-colors">
            <ChevronRight className="size-4" />
          </div>
        </div>
      ) : (
        /* 标准网格 3D 卡片形态 */
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
            "group relative flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 transition-all duration-200 cursor-pointer min-h-[162px] h-auto space-y-2.5",
            "hover:border-zinc-300 hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.995]"
          )}
        >
          {/* 卡片顶栏：母题/情感标签 & 智能推荐徽标 */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {item.topic_groups && (
                <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                  <Layers className="size-3 text-zinc-400" />
                  {item.topic_groups.name}
                </span>
              )}
              {item.emotion_tag && (
                <span className="inline-flex items-center gap-0.5 rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                  <Flame className="size-3 text-zinc-400" />
                  {item.emotion_tag}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {item._avgPlayCount !== undefined && item._avgPlayCount !== null && (
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-semibold border tabular-nums",
                    item._avgPlayCount >= 30000
                      ? "bg-[#C9604D]/10 text-[#C9604D] border-[#C9604D]/20"
                      : item._avgPlayCount > 0
                      ? "bg-[#6FAA7D]/10 text-[#6FAA7D] border-[#6FAA7D]/20"
                      : "bg-zinc-100 text-zinc-400 border-zinc-200"
                  )}
                  title={`均播量：${item._avgPlayCount.toLocaleString()}`}
                >
                  均播 {item._avgPlayCount >= 10000 ? `${(item._avgPlayCount / 10000).toFixed(1)}万` : item._avgPlayCount.toLocaleString()}
                </span>
              )}
              {item._daysSinceLastWork !== undefined && item._daysSinceLastWork !== null && item._daysSinceLastWork <= 30 && (
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium border",
                    item._daysSinceLastWork <= 3
                      ? "bg-[#D97757]/10 text-[#D97757] border-[#D97757]/20 font-semibold"
                      : item._daysSinceLastWork <= 7
                      ? "bg-zinc-100 text-zinc-600 border-zinc-200"
                      : "bg-zinc-50 text-zinc-400 border-zinc-200/60"
                  )}
                >
                  {item._daysSinceLastWork <= 3 ? `🔥 ${item._daysSinceLastWork}天前` : `${item._daysSinceLastWork}天前`}
                </span>
              )}
              {item._daysSinceLastWork !== undefined && item._daysSinceLastWork !== null && item._daysSinceLastWork > 30 && (
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium border",
                    item._daysSinceLastWork > 60
                      ? "bg-[#5F82A8]/12 text-[#5F82A8] border-[#5F82A8]/25 font-semibold"
                      : "bg-zinc-100 text-zinc-500 border-zinc-200"
                  )}
                >
                  {item._daysSinceLastWork > 60 ? `💤 已${item._daysSinceLastWork}天未做` : `已${item._daysSinceLastWork}天未做`}
                </span>
              )}
            </div>
          </div>

          {/* 标题 & Hook 区域：点击统一打开详情弹窗 */}
          <div className="flex-1 space-y-1 min-w-0">
            <h3 className="text-[14.5px] font-semibold text-zinc-900 leading-snug line-clamp-2 group-hover:text-[#D97757] transition-colors">
              {item.title}
            </h3>

            {item.hook && (
              <p className="text-[12.5px] text-zinc-500 line-clamp-2 leading-relaxed font-normal">
                {item.hook}
              </p>
            )}

            {item._daysSinceLastWork === null && (
              <p className="text-[11px] text-zinc-400 font-normal pt-0.5">
                录入于 {Math.max(0, Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000))} 天前 · 尚无作品
              </p>
            )}
          </div>

          {/* 底部数据与认领 Action Bar */}
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-zinc-100">
            <div className="flex items-center gap-3 text-[11.5px]">
              {averagePlay !== null && (
                <div className="flex items-center gap-1 text-zinc-500">
                  <span className="text-zinc-400">均播:</span>
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {averagePlay >= 10000 ? `${(averagePlay / 10000).toFixed(1)}w` : averagePlay.toLocaleString()}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1 text-zinc-500">
                <User className="size-3 text-zinc-400" />
                <span className="font-semibold text-zinc-700 tabular-nums">{item.claimCount} 人</span>
              </div>
            </div>

            {/* 独立 Action 按钮 */}
            <div className="flex items-center gap-1.5">
              {isClaimedByMe ? (
                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={handleClaimToggle}
                  title="点击放回选题池"
                  aria-label={`已认领：${item.title}，点击放回选题池`}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50 px-2.5 text-[11.5px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait cursor-pointer"
                >
                  {isClaiming ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 stroke-[2.5]" />}
                  已认领
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={handleClaimToggle}
                  className={cn(
                    "flex h-7 items-center justify-center rounded-md border px-3 text-[11.5px] font-medium active:scale-95 transition-all duration-150 cursor-pointer",
                    isLimitReached
                      ? "border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757] hover:bg-[#D97757] hover:text-white"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-[#D97757] hover:text-white hover:border-[#D97757]"
                  )}
                  title={isLimitReached ? "候选选题已达 5 条上限（点击选择替换）" : "认领此选题"}
                >
                  {isClaiming ? <Loader2 className="size-3.5 animate-spin" /> : "认领"}
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
