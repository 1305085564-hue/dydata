"use client";

import { useState } from "react";
import Link from "next/link";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  User,
  ExternalLink,
  Clock,
  Award,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

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
}

interface SubTopicCardProps {
  item: SubTopicItem;
  currentUserId: string;
  isLimitReached: boolean;
  isClaimedByMe: boolean;
  onClaimSuccess: () => void;
}

interface WorkItem {
  id: string;
  video_title: string;
  content: string | null;
  uploaded_at: string | null;
  video_metrics_snapshots?: Array<{
    play_count: number;
    likes: number;
    follower_convert?: number;
    follower_gain?: number;
  }>;
}

function handleKeyboardActivation(event: React.KeyboardEvent, action: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

export function SubTopicCard({
  item,
  isLimitReached,
  isClaimedByMe,
  onClaimSuccess
}: SubTopicCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [hasLoadedWorks, setHasLoadedWorks] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const averagePlay = item.summary.averagePlayCount;

  // 展开并获取第二级作品摘要数据
  const handleToggleExpand = async () => {
    if (!isExpanded && !hasLoadedWorks) {
      setLoadingWorks(true);
      try {
        const [bestRes, recentRes] = await Promise.all([
          fetch(`/api/topics/sub-topics/${item.id}/works?sort=best&page_size=1`),
          fetch(`/api/topics/sub-topics/${item.id}/works?sort=recent&page_size=1`)
        ]);
        if (!bestRes.ok || !recentRes.ok) throw new Error("获取文案数据失败");
        const [bestJson, recentJson] = await Promise.all([bestRes.json(), recentRes.json()]);
        const bestWork = bestJson.items?.[0] as WorkItem | undefined;
        const recentWork = recentJson.items?.[0] as WorkItem | undefined;
        const extractedWorks = [bestWork, recentWork].filter((work, index, list): work is WorkItem => {
          if (!work) return false;
          return list.findIndex((candidate) => candidate?.id === work.id) === index;
        });
        setWorks(extractedWorks);
        setHasLoadedWorks(true);
      } catch (err) {
        console.error("加载关联作品失败:", err);
        feedbackToast.error("加载作品数据失败");
      } finally {
        setLoadingWorks(false);
      }
    }
    setIsExpanded((prev) => !prev);
  };

  // 处理认领操作
  const handleClaim = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isClaiming || isClaimedByMe || isLimitReached) return;

    setIsClaiming(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${item.id}/claim`, {
        method: "POST"
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "认领失败");
      }

      feedbackToast.success(`认领选题成功：“${item.title}”`);
      onClaimSuccess();
    } catch (err) {
      feedbackToast.error("认领失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsClaiming(false);
    }
  };

  // 计算最好版本与最近版本
  const getExtractedWorks = () => {
    if (works.length === 0) return { best: null, latest: null };

    // 最好版本（播放量最高）
    const getPlayCount = (w: WorkItem) => {
      const snap = w.video_metrics_snapshots?.[0];
      return snap?.play_count ?? 0;
    };

    const bestWork = [...works].sort((a, b) => getPlayCount(b) - getPlayCount(a))[0];

    // 最近版本（上传时间最新）
    const latestWork = [...works].sort((a, b) => {
      const timeA = a.uploaded_at ? Date.parse(a.uploaded_at) : 0;
      const timeB = b.uploaded_at ? Date.parse(b.uploaded_at) : 0;
      return timeB - timeA;
    })[0];

    return {
      best: bestWork || null,
      latest: latestWork && latestWork.id !== bestWork?.id ? latestWork : null
    };
  };

  const { best, latest } = getExtractedWorks();

  // 红涨绿跌色彩渲染逻辑
  const renderPlayCount = (playCount: number) => {
    if (averagePlay === null) {
      return <span className="text-stone-700 font-medium tabular-nums">{playCount.toLocaleString()}</span>;
    }
    const isHigher = playCount >= averagePlay;
    return (
      <span
        className={cn(
          "font-semibold tabular-nums",
          isHigher ? "text-[#C9604D]" : "text-[#6FAA7D]" // 红涨绿跌
        )}
      >
        {playCount.toLocaleString()}
      </span>
    );
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-white transition-all duration-200",
        isExpanded
          ? "border-stone-300 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)]"
          : "border-stone-200 hover:border-stone-300 hover:shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]"
      )}
    >
      {/* 第一级：折叠态基本信息 */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggleExpand}
        onKeyDown={(event) => handleKeyboardActivation(event, () => void handleToggleExpand())}
        className="flex cursor-pointer items-start justify-between gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.topics && (
              <span className="inline-flex items-center rounded-md bg-[#8AA8C7]/5 border border-[#8AA8C7]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#8AA8C7]">
                {item.topics.name}
              </span>
            )}
            {item.topic_groups && (
              <span className="inline-flex items-center rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
                {item.topic_groups.name}
              </span>
            )}
            {item.emotion_tag && (
              <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200/50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                {item.emotion_tag}
              </span>
            )}
          </div>

          <h3 className="text-[13.5px] font-semibold text-stone-900 leading-tight">
            {item.title}
          </h3>

          <p className="text-[12.5px] text-stone-500 line-clamp-1 leading-normal">
            {item.hook}
          </p>
        </div>

        {/* 右侧数据与操作 */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-4 text-[12px]">
            {averagePlay !== null && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-stone-400">平均播放</span>
                <span className="font-semibold text-stone-900 tabular-nums">
                  {averagePlay >= 10000 ? `${(averagePlay / 10000).toFixed(1)}w` : averagePlay.toLocaleString()}
                </span>
              </div>
            )}

            <div className="flex flex-col items-end">
              <span className="text-[10px] text-stone-400">认领人数</span>
              <span className="font-semibold text-stone-850 flex items-center gap-0.5">
                <User className="size-3 text-stone-400" />
                {item.claimCount}
              </span>
            </div>
          </div>

          {/* 认领按钮/状态 */}
          <div className="flex items-center gap-2">
            {isClaimedByMe ? (
              <span className="inline-flex h-6.5 items-center gap-0.5 rounded-lg bg-[#6FAA7D]/10 px-2.5 text-[11.5px] font-medium text-[#6FAA7D]">
                <Check className="size-3.5 stroke-[2.5]" />
                已认领
              </span>
            ) : (
              <button
                type="button"
                disabled={isLimitReached || isClaiming}
                onClick={handleClaim}
                className={cn(
                  "flex h-6.5 items-center justify-center rounded-lg border px-2.5 text-[11.5px] font-medium transition-all duration-200",
                  isLimitReached
                    ? "border-stone-200 bg-stone-50 text-stone-400 cursor-not-allowed"
                    : "border-[#D97757]/20 bg-[#D97757]/5 text-[#D97757] hover:bg-[#D97757] hover:text-white"
                )}
                title={isLimitReached ? "候选选题已达 5 条上限" : "认领此选题"}
              >
                {isClaiming ? <Loader2 className="size-3.5 animate-spin" /> : "认领"}
              </button>
            )}

            <div className="text-stone-400 hover:text-stone-600 p-0.5">
              {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </div>
          </div>
        </div>
      </div>

      {/* 第二级：展开文案数据摘要 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t border-stone-100 bg-stone-50/50"
          >
            <div className="p-4 space-y-4">
              {loadingWorks ? (
                <div className="flex h-20 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-stone-400" />
                  <span className="text-[12px] text-stone-400 ml-2">正在分析版本文案数据...</span>
                </div>
              ) : works.length === 0 ? (
                <div className="py-6 text-center text-[12.5px] text-stone-400">
                  暂无作品数据沉淀
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* 最好版本 */}
                  {best && (
                    <div className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-1.5">
                        <div className="flex items-center gap-1 text-[12px] font-semibold text-[#D97757]">
                          <Award className="size-4" />
                          <span>最好版本</span>
                        </div>
                        <div className="text-[11.5px] text-stone-500 font-medium">
                          播放量: {renderPlayCount(best.video_metrics_snapshots?.[0]?.play_count ?? 0)}
                        </div>
                      </div>
                      <p className="text-[12.5px] text-stone-600 line-clamp-3 leading-relaxed italic">
                        “{best.content || best.video_title}”
                      </p>
                      {best.video_metrics_snapshots?.[0]?.likes !== undefined && (
                        <div className="text-[11px] text-stone-400 flex items-center justify-between">
                          <span>点赞数: {best.video_metrics_snapshots[0].likes.toLocaleString()}</span>
                          {best.video_metrics_snapshots[0].follower_convert !== undefined && (
                            <span>转粉率: {(best.video_metrics_snapshots[0].follower_convert * 100).toFixed(2)}%</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 最近版本 */}
                  {latest && (
                    <div className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-1.5">
                        <div className="flex items-center gap-1 text-[12px] font-semibold text-[#8AA8C7]">
                          <Clock className="size-4" />
                          <span>最近版本</span>
                        </div>
                        <div className="text-[11.5px] text-stone-500 font-medium">
                          播放量: {renderPlayCount(latest.video_metrics_snapshots?.[0]?.play_count ?? 0)}
                        </div>
                      </div>
                      <p className="text-[12.5px] text-stone-600 line-clamp-3 leading-relaxed italic">
                        “{latest.content || latest.video_title}”
                      </p>
                      {latest.video_metrics_snapshots?.[0]?.likes !== undefined && (
                        <div className="text-[11px] text-stone-400 flex items-center justify-between">
                          <span>点赞数: {latest.video_metrics_snapshots[0].likes.toLocaleString()}</span>
                          {latest.video_metrics_snapshots[0].follower_convert !== undefined && (
                            <span>转粉率: {(latest.video_metrics_snapshots[0].follower_convert * 100).toFixed(2)}%</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 第三级：进入详情 */}
              <div className="flex justify-end pt-1">
                <Link href={`/topics/${item.id}`} className="inline-block">
                  <Button size="xs" variant="outline" className="h-7.5 rounded-lg gap-1 text-[12px] font-medium border-stone-200 hover:border-stone-300">
                    <span>查看完整详情与历史版本</span>
                    <ExternalLink className="size-3" />
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
