"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { triggerGlobalTopicCreate } from "@/components/topics/global-topic-create";
import {
  fetchActiveTopicsResponse,
  fetchTodayClaimsResponse,
  type SubTopicItem,
  type ActiveData,
  type SubTopicClaim
} from "./today-helpers";
import {
  Loader2,
  ChevronRight,
  Flame,
  Plus,
  Compass,
  ArrowRightLeft,
  Check,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

function getMyClaim(item: { sub_topic_claims?: SubTopicClaim[] | null }, currentUserId: string) {
  return item.sub_topic_claims?.find((c) => c.user_id === currentUserId && c.status !== "returned") ?? null;
}

function isClaimedByMe(item: { sub_topic_claims?: SubTopicClaim[] | null }, currentUserId: string) {
  return !!getMyClaim(item, currentUserId);
}

function countMyCandidates(items: Array<{ sub_topic_claims?: SubTopicClaim[] | null }>, currentUserId: string) {
  return items.filter((item) => getMyClaim(item, currentUserId)?.status === "candidate").length;
}

// 骨架屏组件
function TopicSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="animate-pulse space-y-6"
    >
      <div className="h-10 w-full rounded-xl bg-stone-200/60" />
      <div className="h-44 w-full rounded-2xl bg-stone-200/50" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="h-60 rounded-xl bg-stone-200/40" />
        <div className="h-60 rounded-xl bg-stone-200/40" />
        <div className="h-60 rounded-xl bg-stone-200/40" />
      </div>
    </motion.div>
  );
}

export default function TodayWorkspacePage() {
  const [data, setData] = useState<ActiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [myClaims, setMyClaims] = useState<SubTopicItem[]>([]);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [claimingIds, setClaimingIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // 替换认领 (409) 弹窗控制
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [targetClaimId, setTargetClaimId] = useState<string | null>(null);
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);

  useEffect(() => {
    const getUserId = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    void getUserId();
  }, []);

  const fetchMyClaims = useCallback(async () => {
    setClaimsError(null);
    try {
      setMyClaims(await fetchTodayClaimsResponse());
    } catch (err) {
      console.error("加载我的认领失败:", err);
      setMyClaims([]);
      setClaimsError(err instanceof Error ? err.message : "认领状态加载失败");
    }
  }, []);

  const fetchActiveData = useCallback(async () => {
    setLoading(true);
    setActiveError(null);
    try {
      setData(await fetchActiveTopicsResponse());
    } catch (err) {
      setData(null);
      setActiveError(err instanceof Error ? err.message : "获取活跃选题失败");
      feedbackToast.error("加载最近活跃选题失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([fetchActiveData(), fetchMyClaims()]);
  }, [fetchActiveData, fetchMyClaims]);

  useEffect(() => {
    void loadAll();

    const handleRefresh = () => {
      void loadAll();
    };
    window.addEventListener("refresh-topics", handleRefresh);
    return () => window.removeEventListener("refresh-topics", handleRefresh);
  }, [loadAll]);

  const activeCandidateCount = countMyCandidates(myClaims, currentUserId);
  const isLimitReached = activeCandidateCount >= 5;

  const candidateClaims = myClaims.filter(
    (item) => getMyClaim(item, currentUserId)?.status === "candidate"
  );

  const isClaimedByMeCached = (subTopicId: string) => {
    const item = myClaims.find((c) => c.id === subTopicId);
    return item ? isClaimedByMe(item, currentUserId) : false;
  };

  const handleClaim = async (subTopicId: string) => {
    if (claimingIds.has(subTopicId)) return;

    if (isLimitReached) {
      setTargetClaimId(subTopicId);
      setSelectedReturnId(candidateClaims[0]?.id || null);
      setReplaceDialogOpen(true);
      return;
    }

    setClaimingIds((prev) => new Set(prev).add(subTopicId));

    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}/claim`, {
        method: "POST"
      });
      const resData = await res.json();

      if (res.status === 409) {
        setTargetClaimId(subTopicId);
        setSelectedReturnId(candidateClaims[0]?.id || null);
        setReplaceDialogOpen(true);
        return;
      }

      if (!res.ok) throw new Error(resData.error || "认领选题失败");

      feedbackToast.success("成功认领至您的候选选题库");
      await Promise.all([fetchActiveData(), fetchMyClaims()]);
    } catch (err) {
      feedbackToast.error("认领失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setClaimingIds((prev) => {
        const next = new Set(prev);
        next.delete(subTopicId);
        return next;
      });
    }
  };

  const handleConfirmReplace = async () => {
    if (!selectedReturnId || !targetClaimId || isReplacing) return;
    setIsReplacing(true);

    try {
      const returnRes = await fetch(`/api/topics/sub-topics/${selectedReturnId}/return`, {
        method: "POST"
      });
      if (!returnRes.ok) throw new Error("放回旧选题失败");

      const claimRes = await fetch(`/api/topics/sub-topics/${targetClaimId}/claim`, {
        method: "POST"
      });
      if (!claimRes.ok) throw new Error("认领新选题失败");

      feedbackToast.success("已替换旧选题并成功认领新选题！");
      setReplaceDialogOpen(false);
      setTargetClaimId(null);
      setSelectedReturnId(null);
      await Promise.all([fetchActiveData(), fetchMyClaims()]);
    } catch (err) {
      feedbackToast.error("替换认领失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsReplacing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 认领状态失败重试提示栏 (Item 20) */}
      <AnimatePresence>
        {claimsError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center justify-between rounded-xl border border-[#D99E55]/25 bg-[#D99E55]/5 px-4 py-2.5 text-[12.5px] text-stone-700"
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="size-4 shrink-0 text-[#D99E55]" />
              <span>认领状态加载失败：{claimsError}</span>
            </div>
            <Button size="xs" variant="outline" onClick={() => void fetchMyClaims()} className="h-7 text-[12px]">
              <RefreshCw className="size-3 mr-1" />
              重新加载认领状态
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 认领上限状态提示栏 */}
      <div className="flex items-center justify-between rounded-xl bg-stone-100/80 px-4 py-2.5 border border-stone-200/50 text-[12.5px] text-stone-600">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-stone-900">我的候选上限：</span>
          <span className={cn(
            "font-semibold tabular-nums",
            isLimitReached ? "text-[#C9604D]" : "text-[#5F82A8]"
          )}>
            {activeCandidateCount} / 5
          </span>
          <span className="opacity-70 hidden sm:inline">（候选池满 5 条将自动唤起替换弹窗）</span>
        </div>
        <Link
          href="/topics?view=my_claims"
          className="text-[#D97757] font-medium hover:underline inline-flex items-center gap-0.5"
        >
          管理我的选题 <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <AnimatePresence mode="wait">
        {loading && !data ? (
          <TopicSkeleton key="skeleton" />
        ) : activeError ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ErrorState
              title="今日选题加载失败"
              description={activeError}
              onRetry={() => void loadAll()}
            />
          </motion.div>
        ) : !data ||
          ((data.worthRedoing || []).length === 0 &&
            data.recentlyClaimed.length === 0 &&
            data.recentlyWorked.length === 0 &&
            data.recentlyCreated.length === 0) ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center p-10 border border-dashed border-stone-200 bg-white rounded-2xl space-y-4"
          >
            <EmptyState
              title="还没认领选题"
              description="去选题池挑一个喜欢的开始创作，或直接点击下方按钮新建第一个灵感想法。"
            />
            <div className="flex items-center gap-3">
              <Link href="/topics">
                <Button size="sm" className="h-9 px-4 font-medium bg-[#5F82A8] hover:bg-[#5F82A8]/90">
                  <Compass className="size-4 mr-1.5" />
                  去选题池挑选
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => triggerGlobalTopicCreate()}
                className="h-9 px-4 font-medium border-stone-200"
              >
                <Plus className="size-4 mr-1.5 text-[#D97757]" />
                新建选题
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* 主区（顶部放大）：值得再做 worthRedoing */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 md:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-[#D97757]/10 text-[#D97757]">
                    <Flame className="size-4" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-bold text-stone-900 leading-none">值得再做</h2>
                    <span className="text-[11.5px] text-stone-400 mt-1 block">
                      跑出成绩、适合深度复刻的优质爆款选题
                    </span>
                  </div>
                </div>
                <span className="text-[12px] font-medium text-stone-400">
                  {(data.worthRedoing || []).length} 条推荐
                </span>
              </div>

              {(data.worthRedoing || []).length === 0 ? (
                <div className="p-6 text-center text-[12.5px] text-stone-400 border border-dashed border-stone-200 bg-stone-50/40 rounded-xl">
                  还没有跑出成绩的选题。发几条作品、积累数据后，这里会推荐值得复刻的选题。
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(data.worthRedoing || []).map((topic) => {
                    const isClaimed = isClaimedByMeCached(topic.id);
                    const isClaiming = claimingIds.has(topic.id);

                    // 适配 summary 内的字段 (Item 9)
                    const qualifiedCount = topic.summary?.qualifiedWorkCount ?? 0;
                    const averagePlay = topic.summary?.averagePlayCount ?? null;
                    const bestCopyText = topic.summary?.bestCopy || null;

                    // 全库均值比对 (Item 10): 接口未给 overallAveragePlayCount 时安全中性，有了以后精准判定
                    const overallAvg = data.overallAveragePlayCount ?? null;

                    return (
                      <div
                        key={topic.id}
                        className="group relative flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50/30 p-4 transition-all duration-200 hover:border-stone-300 hover:bg-white hover:shadow-md"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-stone-900 text-[14px] leading-snug line-clamp-1">
                              <Link href={`/topics/${topic.id}`} className="hover:text-[#D97757]">
                                {topic.title}
                              </Link>
                            </h3>
                            {topic.topics && (
                              <span className="shrink-0 rounded-md bg-[#4F5E96]/10 px-2 py-0.5 text-[11px] font-medium text-[#4F5E96]">
                                {topic.topics.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[11.5px]">
                            <span className="text-stone-500">
                              达标作品: <strong className="text-stone-800 font-semibold">{qualifiedCount}</strong> 条
                            </span>
                            {averagePlay !== null && (
                              <span className="text-stone-500">
                                平均播放:{" "}
                                <strong className={cn(
                                  "font-semibold tabular-nums",
                                  overallAvg === null
                                    ? "text-stone-800"
                                    : averagePlay >= overallAvg
                                      ? "text-[#C9604D]"
                                      : "text-[#6FAA7D]"
                                )}>
                                  {averagePlay >= 10000 ? `${(averagePlay / 10000).toFixed(1)}w` : averagePlay.toLocaleString()}
                                </strong>
                              </span>
                            )}
                          </div>

                          {bestCopyText && (
                            <div className="rounded-lg bg-white p-2.5 border border-stone-200/80 text-[12px] text-stone-600 line-clamp-2 italic leading-relaxed">
                              “{bestCopyText}”
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-stone-155/60 pt-2.5">
                          <Link
                            href={`/topics/${topic.id}`}
                            className="text-[12px] text-stone-400 hover:text-stone-700 flex items-center gap-0.5"
                          >
                            看详情 <ChevronRight className="size-3" />
                          </Link>

                          {isClaimed ? (
                            <Link href={`/dashboard?topicId=${topic.id}`}>
                              <Button size="xs" variant="outline" className="h-7 rounded-lg text-[11.5px] border-stone-200">
                                去创作 <ChevronRight className="size-3" />
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              size="xs"
                              disabled={isClaiming}
                              onClick={() => void handleClaim(topic.id)}
                              className="h-7 rounded-lg text-[11.5px] font-medium bg-[#D97757] hover:bg-[#D97757]/90 text-white"
                            >
                              {isClaiming ? <Loader2 className="size-3 animate-spin" /> : "认领此题"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 次区（下方辅助网格）：最近认领 / 最近新作品 / 最近新录入 */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="space-y-3">
                <h3 className="text-[13.5px] font-semibold text-stone-800 flex items-center gap-2 px-1">
                  <div className="h-2 w-2 rounded-full bg-[#5F82A8]" />
                  <span>我最近认领</span>
                  <span className="text-[12px] font-normal text-stone-400">
                    ({data.recentlyClaimed.length})
                  </span>
                </h3>
                <div className="space-y-2.5">
                  {data.recentlyClaimed.length === 0 ? (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white text-[12px] text-stone-400">
                      暂无近期认领记录
                    </div>
                  ) : (
                    data.recentlyClaimed.map((record) => {
                      const subTopic = record.sub_topics;
                      if (!subTopic) return null;
                      return (
                        <div
                          key={record.id}
                          className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-3.5 space-y-2"
                        >
                          <div className="space-y-1">
                            <Link
                              href={`/topics/${subTopic.id}`}
                              className="font-medium text-stone-900 hover:text-[#D97757] line-clamp-1 text-[13px]"
                            >
                              {subTopic.title}
                            </Link>
                            <p className="text-[12px] text-stone-500 line-clamp-1">{subTopic.hook}</p>
                          </div>
                          <div className="flex items-center justify-between border-t border-stone-100 pt-2 text-[11px]">
                            <span className="text-stone-400">
                              {record.status === "scripting" ? "脚本中" : "候选"}
                            </span>
                            <Link href={`/dashboard?topicId=${subTopic.id}`}>
                              <span className="text-[#5F82A8] hover:underline font-medium">去创作 →</span>
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-[13.5px] font-semibold text-stone-800 flex items-center gap-2 px-1">
                  <div className="h-2 w-2 rounded-full bg-[#6FAA7D]" />
                  <span>最近有新作品</span>
                  <span className="text-[12px] font-normal text-stone-400">
                    ({data.recentlyWorked.length})
                  </span>
                </h3>
                <div className="space-y-2.5">
                  {data.recentlyWorked.length === 0 ? (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white text-[12px] text-stone-400">
                      暂无近期作品关联选题
                    </div>
                  ) : (
                    data.recentlyWorked.map((work) => {
                      const subTopic = work.sub_topics;
                      if (!subTopic) return null;
                      return (
                        <div
                          key={work.id}
                          className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-3.5 space-y-2"
                        >
                          <div className="space-y-1">
                            <Link
                              href={`/topics/${subTopic.id}`}
                              className="font-medium text-stone-900 hover:text-[#D97757] line-clamp-1 text-[13px]"
                            >
                              {subTopic.title}
                            </Link>
                            <span className="text-[11px] text-[#6FAA7D] font-medium block truncate">
                              新片: {work.video_title}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-[13.5px] font-semibold text-stone-800 flex items-center gap-2 px-1">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>团队最近录入</span>
                  <span className="text-[12px] font-normal text-stone-400">
                    ({data.recentlyCreated.length})
                  </span>
                </h3>
                <div className="space-y-2.5">
                  {data.recentlyCreated.length === 0 ? (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white text-[12px] text-stone-400">
                      暂无近期录入选题
                    </div>
                  ) : (
                    data.recentlyCreated.map((topic) => (
                      <div
                        key={topic.id}
                        className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-3.5 space-y-2"
                      >
                        <div className="space-y-1">
                          <Link
                            href={`/topics/${topic.id}`}
                            className="font-medium text-stone-900 hover:text-[#D97757] line-clamp-1 text-[13px]"
                          >
                            {topic.title}
                          </Link>
                          <p className="text-[12px] text-stone-500 line-clamp-1">{topic.hook}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 替换选择 (候选上限 5/5) Dialog (Item 18 真正认领时间 claimed_at) */}
      <Dialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <DialogContent className="sm:max-w-md p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-stone-900 text-[15px] font-semibold flex items-center gap-2">
              <ArrowRightLeft className="size-4 text-[#D97757]" />
              <span>候选位已满 (5/5) · 请选择替换</span>
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-[12.5px]">
              您的候选选题库已达 5 条上限。请选择一条放回选题池，以便腾出空间认领新题。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {candidateClaims.map((item) => {
              const isSelected = selectedReturnId === item.id;
              const myClaimObj = getMyClaim(item, currentUserId);
              const claimedAtTime = myClaimObj?.claimed_at || item.created_at;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedReturnId(item.id)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-150",
                    isSelected
                      ? "border-[#D97757] bg-[#D97757]/5 shadow-xs"
                      : "border-stone-200 bg-white hover:bg-stone-50"
                  )}
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <div className="text-[13px] font-medium text-stone-900 truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-stone-400">
                      认领时间: {new Date(claimedAtTime).toLocaleString()}
                    </div>
                  </div>
                  {isSelected && <Check className="size-4 text-[#D97757] shrink-0" />}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isReplacing}
              onClick={() => setReplaceDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!selectedReturnId || isReplacing}
              onClick={() => void handleConfirmReplace()}
              className="bg-[#D97757] text-white hover:bg-[#D97757]/90"
            >
              {isReplacing ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              确认替换并认领
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
