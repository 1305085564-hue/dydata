"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader2, ChevronRight, User, Video, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface TopicBase {
  id: string;
  title: string;
  hook: string;
  topics: {
    id: string;
    name: string;
  } | null;
  topic_groups: {
    id: string;
    name: string;
  } | null;
}

interface SubTopicClaim {
  id: string;
  user_id: string;
  status: "candidate" | "scripting" | "returned";
  claimed_at: string;
}

interface SubTopicItem extends TopicBase {
  created_by: string;
  created_at: string;
  sub_topic_claims?: SubTopicClaim[];
}

interface ClaimRecord {
  id: string;
  sub_topic_id: string;
  user_id: string;
  status: "candidate" | "scripting" | "returned";
  claimed_at: string;
  sub_topics: SubTopicItem | null;
}

interface WorkRecord {
  id: string;
  topic_id: string | null;
  user_id: string;
  video_title: string;
  content: string | null;
  uploadedAt: string | null; // 对接后端 uploaded_at
  sub_topics: TopicBase | null;
}

interface ActiveData {
  recentlyClaimed: ClaimRecord[];
  recentlyWorked: WorkRecord[];
  recentlyCreated: SubTopicItem[];
}

function getMyClaim(item: { sub_topic_claims?: SubTopicClaim[] | null }, currentUserId: string) {
  return item.sub_topic_claims?.find((c) => c.user_id === currentUserId && c.status !== "returned") ?? null;
}

function isClaimedByMe(item: { sub_topic_claims?: SubTopicClaim[] | null }, currentUserId: string) {
  return !!getMyClaim(item, currentUserId);
}

function countMyCandidates(items: Array<{ sub_topic_claims?: SubTopicClaim[] | null }>, currentUserId: string) {
  return items.filter((item) => getMyClaim(item, currentUserId)?.status === "candidate").length;
}

export default function TodayWorkspacePage() {
  const [data, setData] = useState<ActiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [myClaims, setMyClaims] = useState<SubTopicItem[]>([]);
  const [claimingIds, setClaimingIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string>("");

  // 获取当前用户 ID
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

  // 获取当前用户的所有认领状态，以限制 5 条及展示“已认领”
  // /api/topics/pool?view=my_claims 返回的是子题列表，不是认领记录
  const fetchMyClaims = async () => {
    try {
      const res = await fetch("/api/topics/pool?view=my_claims");
      if (res.ok) {
        const json = await res.json();
        setMyClaims(json.items || []);
      }
    } catch (err) {
      console.error("加载我的认领失败:", err);
    }
  };

  const fetchActiveData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/topics/active?limit=8");
      if (!res.ok) throw new Error("获取活跃选题失败");
      const json = await res.json();
      setData(json);
    } catch (err) {
      feedbackToast.error("加载最近活跃选题失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAll = useCallback(async () => {
    await Promise.all([fetchActiveData(), fetchMyClaims()]);
  }, []);

  useEffect(() => {
    void loadAll();

    // 监听新建选题后的刷新通知
    const handleRefresh = () => {
      void loadAll();
    };
    window.addEventListener("refresh-topics", handleRefresh);
    return () => window.removeEventListener("refresh-topics", handleRefresh);
  }, [loadAll]);

  // 计算当前属于 candidate 状态的认领总数（从子题内的 sub_topic_claims 匹配当前用户）
  const activeCandidateCount = countMyCandidates(myClaims, currentUserId);
  const isLimitReached = activeCandidateCount >= 5;

  // 判断是否已被当前用户认领
  const isClaimedByMeCached = (subTopicId: string) => {
    const item = myClaims.find((c) => c.id === subTopicId);
    return item ? isClaimedByMe(item, currentUserId) : false;
  };

  // 处理一键认领
  const handleClaim = async (subTopicId: string) => {
    if (claimingIds.has(subTopicId)) return;

    setClaimingIds((prev) => {
      const next = new Set(prev);
      next.add(subTopicId);
      return next;
    });

    try {
      const res = await fetch(`/api/topics/sub-topics/${subTopicId}/claim`, {
        method: "POST"
      });
      const resData = await res.json();

      if (!res.ok) {
        throw new Error(resData.error || "认领选题失败");
      }

      feedbackToast.success("成功认领至您的候选选题库");
      await Promise.all([fetchActiveData(), fetchMyClaims()]); // 刷新活跃列表与我的认领状态
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

  if (loading && !data) {
    return (
      <div className="flex h-[350px] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-6 animate-spin text-[#D97757]" />
          <span className="text-[12.5px] text-stone-500">正在整理最近活跃的选题...</span>
        </div>
      </div>
    );
  }

  // 检查是否全无数据
  const hasNoData =
    !data ||
    (data.recentlyClaimed.length === 0 &&
      data.recentlyWorked.length === 0 &&
      data.recentlyCreated.length === 0);

  if (hasNoData) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-stone-200 bg-white rounded-2xl">
        <EmptyState
          title="暂无活跃选题"
          description="当前还没有认领、制作中或新录入的选题。点击右侧“录入选题”来开启第一个灵感想法。"
        />
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { y: 8, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  return (
    <div className="space-y-6">
      {/* 认领上限状态提示栏 */}
      <div className="flex items-center justify-between rounded-xl bg-stone-100/80 px-4 py-2.5 border border-stone-200/50 text-[12.5px] text-stone-600">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-stone-900">我的候选上限：</span>
          <span className={cn(
            "font-semibold",
            isLimitReached ? "text-[#C9604D]" : "text-[#8AA8C7]"
          )}>
            {activeCandidateCount} / 5
          </span>
          <span className="opacity-70">（候选池满 5 条将无法认领新题，请先放回或推进）</span>
        </div>
        <Link
          href="/topics?view=my_claims"
          className="text-[#D97757] font-medium hover:underline inline-flex items-center gap-0.5"
        >
          管理我的选题 <ChevronRight className="size-3.5" />
        </Link>
      </div>

      {/* 三栏网格布局 */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {/* 区块 1：最近被认领的选题 */}
        <div className="space-y-3">
          <h2 className="text-[14px] font-semibold text-stone-900 flex items-center gap-2 px-1">
            <div className="h-2 w-2 rounded-full bg-[#8AA8C7]" />
            <span>最近被认领的选题</span>
            <span className="text-[12px] font-normal text-stone-400">
              ({data.recentlyClaimed.length})
            </span>
          </h2>
          <div className="space-y-3">
            {data.recentlyClaimed.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white text-[12.5px] text-stone-400">
                暂无近期认领记录
              </div>
            ) : (
              data.recentlyClaimed.map((record) => {
                const subTopic = record.sub_topics;
                if (!subTopic) return null;
                const isClaimed = isClaimedByMeCached(subTopic.id);
                const isClaiming = claimingIds.has(subTopic.id);

                return (
                  <motion.div
                    key={record.id}
                    variants={itemVariants}
                    className="group flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-4 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/topics/${subTopic.id}`}
                          className="font-medium text-stone-900 hover:text-[#D97757] line-clamp-1 text-[13px] leading-tight"
                        >
                          {subTopic.title}
                        </Link>
                        {subTopic.topics && (
                          <span className="shrink-0 inline-flex items-center rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
                            {subTopic.topics.name}
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] text-stone-500 line-clamp-2 leading-relaxed">
                        {subTopic.hook}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                      <div className="flex items-center gap-1 text-[11.5px] text-stone-400">
                        <User className="size-3" />
                        <span>最近认领：</span>
                        <span className="text-stone-500 font-medium">
                          {record.status === "scripting" ? "脚本中" : "候选"}
                        </span>
                      </div>

                      {isClaimed ? (
                        <Link href={`/dashboard?topicId=${subTopic.id}`}>
                          <Button size="xs" variant="outline" className="h-6.5 rounded-md gap-0.5 text-[11.5px]">
                            去创作 <ChevronRight className="size-3" />
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          size="xs"
                          variant={isLimitReached ? "secondary" : "default"}
                          disabled={isLimitReached || isClaiming}
                          onClick={() => handleClaim(subTopic.id)}
                          className="h-6.5 rounded-md text-[11.5px]"
                        >
                          {isClaiming ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : isLimitReached ? (
                            "已达上限"
                          ) : (
                            "一键认领"
                          )}
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* 区块 2：最近有新作品的选题 */}
        <div className="space-y-3">
          <h2 className="text-[14px] font-semibold text-stone-900 flex items-center gap-2 px-1">
            <div className="h-2 w-2 rounded-full bg-[#6FAA7D]" />
            <span>最近有新作品的选题</span>
            <span className="text-[12px] font-normal text-stone-400">
              ({data.recentlyWorked.length})
            </span>
          </h2>
          <div className="space-y-3">
            {data.recentlyWorked.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white text-[12.5px] text-stone-400">
                暂无近期作品关联选题
              </div>
            ) : (
              data.recentlyWorked.map((work) => {
                const subTopic = work.sub_topics;
                if (!subTopic) return null;
                const isClaimed = isClaimedByMeCached(subTopic.id);
                const isClaiming = claimingIds.has(subTopic.id);

                return (
                  <motion.div
                    key={work.id}
                    variants={itemVariants}
                    className="group flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-4 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/topics/${subTopic.id}`}
                          className="font-medium text-stone-900 hover:text-[#D97757] line-clamp-1 text-[13px] leading-tight"
                        >
                          {subTopic.title}
                        </Link>
                        {subTopic.topics && (
                          <span className="shrink-0 inline-flex items-center rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
                            {subTopic.topics.name}
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] text-stone-500 line-clamp-2 leading-relaxed">
                        {subTopic.hook}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 border-t border-stone-100 pt-3">
                      <div className="flex items-center gap-1 text-[11.5px] text-[#6FAA7D] font-medium bg-[#6FAA7D]/5 rounded-lg px-2 py-1">
                        <Video className="size-3" />
                        <span className="line-clamp-1">新片: {work.video_title}</span>
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[11.5px] text-stone-400">
                          {work.uploadedAt ? new Date(work.uploadedAt).toLocaleDateString() : ""}
                        </span>

                        {isClaimed ? (
                          <Link href={`/dashboard?topicId=${subTopic.id}`}>
                            <Button size="xs" variant="outline" className="h-6.5 rounded-md gap-0.5 text-[11.5px]">
                              去创作 <ChevronRight className="size-3" />
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            size="xs"
                            variant={isLimitReached ? "secondary" : "default"}
                            disabled={isLimitReached || isClaiming}
                            onClick={() => handleClaim(subTopic.id)}
                            className="h-6.5 rounded-md text-[11.5px]"
                          >
                            {isClaiming ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : isLimitReached ? (
                              "已达上限"
                            ) : (
                              "一键认领"
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* 区块 3：最近新录入的选题 */}
        <div className="space-y-3">
          <h2 className="text-[14px] font-semibold text-stone-900 flex items-center gap-2 px-1">
            <div className="h-2 w-2 rounded-full bg-[#D97757]" />
            <span>最近新录入的选题</span>
            <span className="text-[12px] font-normal text-stone-400">
              ({data.recentlyCreated.length})
            </span>
          </h2>
          <div className="space-y-3">
            {data.recentlyCreated.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white text-[12.5px] text-stone-400">
                暂无近期录入的选题
              </div>
            ) : (
              data.recentlyCreated.map((subTopic) => {
                const isClaimed = isClaimedByMeCached(subTopic.id);
                const isClaiming = claimingIds.has(subTopic.id);

                return (
                  <motion.div
                    key={subTopic.id}
                    variants={itemVariants}
                    className="group flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-4 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/topics/${subTopic.id}`}
                          className="font-medium text-stone-900 hover:text-[#D97757] line-clamp-1 text-[13px] leading-tight"
                        >
                          {subTopic.title}
                        </Link>
                        {subTopic.topics && (
                          <span className="shrink-0 inline-flex items-center rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
                            {subTopic.topics.name}
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] text-stone-500 line-clamp-2 leading-relaxed">
                        {subTopic.hook}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                      <div className="flex items-center gap-1 text-[11.5px] text-stone-400">
                        <Calendar className="size-3" />
                        <span>录入：</span>
                        <span className="text-stone-500 font-medium">
                          {new Date(subTopic.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      {isClaimed ? (
                        <Link href={`/dashboard?topicId=${subTopic.id}`}>
                          <Button size="xs" variant="outline" className="h-6.5 rounded-md gap-0.5 text-[11.5px]">
                            去创作 <ChevronRight className="size-3" />
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          size="xs"
                          variant={isLimitReached ? "secondary" : "default"}
                          disabled={isLimitReached || isClaiming}
                          onClick={() => handleClaim(subTopic.id)}
                          className="h-6.5 rounded-md text-[11.5px]"
                        >
                          {isClaiming ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : isLimitReached ? (
                            "已达上限"
                          ) : (
                            "一键认领"
                          )}
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
