"use client";

import { useState } from "react";
import Link from "next/link";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  User,
  ExternalLink,
  Clock,
  Award,
  Check,
  Pencil,
  Trash2,
  AlertTriangle
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
  onLimitReached409?: () => void;
  onRefresh?: () => void;
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

export function SubTopicCard({
  item,
  currentUserId,
  isLimitReached,
  isClaimedByMe,
  onClaimSuccess,
  onLimitReached409,
  onRefresh
}: SubTopicCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [hasLoadedWorks, setHasLoadedWorks] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // 编辑 / 删除弹窗状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title || "");
  const [editHook, setEditHook] = useState(item.hook || "");
  const [editEmotionTag, setEditEmotionTag] = useState(item.emotion_tag || "");
  const [editAudience, setEditAudience] = useState(item.audience || "");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);
  const [deleteConflictWorksCount, setDeleteConflictWorksCount] = useState<number | null>(null);

  const isOwner = Boolean(currentUserId && item.created_by === currentUserId);
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
    if (isClaiming || isClaimedByMe) return;

    if (isLimitReached) {
      if (onLimitReached409) {
        onLimitReached409();
      } else {
        feedbackToast.warning("候选选题已满 5 条上限，请先放回或推进旧选题");
      }
      return;
    }

    setIsClaiming(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${item.id}/claim`, {
        method: "POST"
      });
      const data = await res.json();

      if (res.status === 409) {
        if (onLimitReached409) {
          onLimitReached409();
        } else {
          feedbackToast.warning("候选选题已满 5 条上限，请先放回或推进旧选题");
        }
        return;
      }

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

  // 提交编辑
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) {
      feedbackToast.warning("选题标题不能为空");
      return;
    }
    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/topics/sub-topics/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          hook: editHook.trim() || null,
          emotion_tag: editEmotionTag.trim() || null,
          audience: editAudience.trim() || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "修改失败");
      feedbackToast.success("选题更新成功");
      setEditDialogOpen(false);
      if (onRefresh) onRefresh();
      window.dispatchEvent(new CustomEvent("refresh-topics"));
    } catch (err) {
      feedbackToast.error("修改失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // 提交删除
  const handleDeleteSubmit = async () => {
    setIsDeleting(true);
    setDeleteErrorMsg(null);
    setDeleteConflictWorksCount(null);
    try {
      const res = await fetch(`/api/topics/sub-topics/${item.id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (res.status === 409) {
        const count = data.work_count ?? data.worksCount;
        setDeleteConflictWorksCount(count ?? null);
        setDeleteErrorMsg(
          count
            ? `该选题已有 ${count} 条作品关联，删除会切断数据回流。请先处理关联作品，或改为编辑。`
            : `该选题已有关联作品，删除会切断数据回流。请先处理关联作品，或改为编辑。`
        );
        return;
      }
      if (!res.ok) throw new Error(data.error || "删除失败");

      feedbackToast.success("选题已被删除");
      setDeleteDialogOpen(false);
      if (onRefresh) onRefresh();
      window.dispatchEvent(new CustomEvent("refresh-topics"));
    } catch (err) {
      feedbackToast.error("删除失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsDeleting(false);
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
        "group relative rounded-xl border transition-all duration-200",
        isExpanded
          ? "border-stone-300/80 bg-white shadow-xs"
          : "border-stone-200/60 bg-stone-50/40 hover:border-stone-300 hover:bg-white hover:shadow-2xs"
      )}
    >
      {/* 第一级：折叠态基本信息 */}
      <div className="relative flex items-start justify-between gap-4 p-3.5 sm:p-4">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={`sub-topic-details-${item.id}`}
          aria-label={`${isExpanded ? "收起" : "展开"}选题：${item.title}`}
          onClick={() => void handleToggleExpand()}
          className="absolute inset-0 z-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        />
        <div className="pointer-events-none relative z-10 min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {item.topics && (
              <span className="inline-flex items-center rounded-md bg-[#4F5E96]/[0.10] border border-[#4F5E96]/15 px-2 py-0.5 text-[11px] font-medium text-[#4F5E96]">
                {item.topics.name}
              </span>
            )}
            {item.topic_groups && (
              <span className="inline-flex items-center rounded-md bg-stone-200/60 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                {item.topic_groups.name}
              </span>
            )}
            {item.emotion_tag && (
              <span className="inline-flex items-center rounded-md bg-[#D99E55]/[0.12] border border-[#D99E55]/20 px-2 py-0.5 text-[11px] font-medium text-[#B87D33]">
                {item.emotion_tag}
              </span>
            )}
          </div>

          <h3 className="text-[14px] font-medium text-stone-900 leading-snug group-hover:text-stone-950 transition-colors">
            {item.title}
          </h3>

          {item.hook && (
            <p className="text-[12.5px] text-stone-500 line-clamp-1 leading-normal">
              {item.hook}
            </p>
          )}
        </div>

        {/* 右侧数据与操作 */}
        <div className="pointer-events-none relative z-10 flex shrink-0 items-center gap-3.5 sm:gap-4">
          <div className="flex items-center gap-3.5 text-[12px]">
            {averagePlay !== null && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-stone-400 font-normal">平均播放</span>
                <span className="font-medium text-stone-900 tabular-nums">
                  {averagePlay >= 10000 ? `${(averagePlay / 10000).toFixed(1)}w` : averagePlay.toLocaleString()}
                </span>
              </div>
            )}

            <div className="flex flex-col items-end">
              <span className="text-[10px] text-stone-400 font-normal">认领人数</span>
              <span className="font-medium text-stone-700 flex items-center gap-1">
                <User className="size-3 text-stone-400" />
                <span className="tabular-nums">{item.claimCount}</span>
              </span>
            </div>
          </div>

          {/* 认领按钮/状态 */}
          <div className="flex items-center gap-2">
            {isClaimedByMe ? (
              <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#6FAA7D]/12 border border-[#6FAA7D]/20 px-2.5 text-[11.5px] font-medium text-[#5B9668]">
                <Check className="size-3.5 stroke-[2.5]" />
                已认领
              </span>
            ) : (
              <button
                type="button"
                disabled={isClaiming}
                onClick={handleClaim}
                className={cn(
                  "pointer-events-auto relative z-20 flex h-7 items-center justify-center rounded-lg border px-3 text-[11.5px] font-medium active:scale-95 transition-all duration-150 shadow-2xs",
                  isLimitReached
                    ? "border-[#D97757]/30 bg-[#D97757]/10 text-[#D97757] hover:bg-[#D97757] hover:text-white hover:shadow-xs"
                    : "border-[#D97757]/20 bg-[#D97757]/8 text-[#D97757] hover:bg-[#D97757] hover:text-white hover:shadow-xs"
                )}
                title={isLimitReached ? "候选选题已达 5 条上限（点击选择替换）" : "认领此选题"}
              >
                {isClaiming ? <Loader2 className="size-3.5 animate-spin" /> : "认领"}
              </button>
            )}

            <div className="p-1 text-stone-400 group-hover:text-stone-600 transition-colors">
              {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </div>
          </div>
        </div>
      </div>

      {/* 第二级：展开文案数据摘要 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id={`sub-topic-details-${item.id}`}
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
                        <div className="flex items-center gap-1 text-[12px] font-semibold text-[#5F82A8]">
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

              {/* 第三级：进入详情与编辑/删除 */}
              <div className="flex items-center justify-between pt-1 border-t border-stone-100/60">
                <div className="flex items-center gap-2">
                  {isOwner && (
                    <>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditDialogOpen(true);
                        }}
                        className="h-7 text-[12px] text-stone-600 hover:text-stone-900 gap-1"
                      >
                        <Pencil className="size-3.5 text-stone-400" />
                        <span>编辑</span>
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteErrorMsg(null);
                          setDeleteConflictWorksCount(null);
                          setDeleteDialogOpen(true);
                        }}
                        className="h-7 text-[12px] text-[#C9604D] hover:bg-[#C9604D]/10 gap-1"
                      >
                        <Trash2 className="size-3.5" />
                        <span>删除</span>
                      </Button>
                    </>
                  )}
                </div>

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

      {/* 编辑选题 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-stone-900 text-[15px] font-semibold">编辑选题</DialogTitle>
            <DialogDescription className="text-stone-500 text-[12.5px]">修改该选题的标题、一句话钩子与附加标签。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-3 mt-2">
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-stone-700">选题标题 *</label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full h-8.5 rounded-lg border border-stone-200 px-3 text-[12.5px] outline-none focus:border-[#D97757]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-stone-700">一句话钩子 (选填)</label>
              <textarea
                rows={2}
                value={editHook}
                onChange={(e) => setEditHook(e.target.value)}
                className="w-full rounded-lg border border-stone-200 p-2 text-[12.5px] outline-none focus:border-[#D97757]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-stone-700">情绪标签 (选填)</label>
                <input
                  type="text"
                  value={editEmotionTag}
                  onChange={(e) => setEditEmotionTag(e.target.value)}
                  className="w-full h-8 rounded-lg border border-stone-200 px-2.5 text-[12px] outline-none focus:border-[#D97757]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-stone-700">目标受众 (选填)</label>
                <input
                  type="text"
                  value={editAudience}
                  onChange={(e) => setEditAudience(e.target.value)}
                  className="w-full h-8 rounded-lg border border-stone-200 px-2.5 text-[12px] outline-none focus:border-[#D97757]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>取消</Button>
              <Button type="submit" size="sm" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                保存修改
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除选题 二次确认与409作品冲突 Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md p-5 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-stone-900 text-[15px] font-semibold flex items-center gap-1.5">
              <AlertTriangle className="size-4 text-[#C9604D]" />
              <span>删除选题确认</span>
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-[12.5px]">
              {deleteErrorMsg || `确定要删除选题“${item.title}”吗？此操作不可撤销。`}
            </DialogDescription>
          </DialogHeader>

          {deleteErrorMsg ? (
            <div className="mt-2 space-y-3">
              <div className="rounded-xl border border-[#C9604D]/20 bg-[#C9604D]/5 p-3 text-[12.5px] text-[#C9604D] leading-relaxed">
                {deleteErrorMsg}
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
                  取消
                </Button>
                <Link href={`/topics/${item.id}`}>
                  <Button size="sm" className="bg-[#5F82A8] text-white hover:bg-[#5F82A8]/90">
                    去看关联作品 ({deleteConflictWorksCount})
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" disabled={isDeleting} onClick={() => setDeleteDialogOpen(false)}>
                取消
              </Button>
              <Button
                size="sm"
                disabled={isDeleting}
                onClick={() => void handleDeleteSubmit()}
                className="bg-[#C9604D] text-white hover:bg-[#C9604D]/90"
              >
                {isDeleting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                确认删除
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
