"use client";

import { useEffect, useState, useCallback } from "react";
import { SubTopicItem } from "./sub-topic-card";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getClaimToggleRequest } from "@/lib/topics/claim-toggle";
import {
  X,
  Copy,
  Check,
  Loader2,
  Award,
  Clock,
  User,
  Pencil,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Flame,
  Layers,
  Tag
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

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

interface TopicDetailModalProps {
  item: SubTopicItem | null;
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  isLimitReached: boolean;
  isClaimedByMe: boolean;
  onClaimSuccess: () => void;
  onLimitReached409?: () => void;
  onRefresh?: () => void;
}

export function TopicDetailModal({
  item,
  isOpen,
  onClose,
  currentUserId,
  isLimitReached,
  isClaimedByMe,
  onClaimSuccess,
  onLimitReached409,
  onRefresh
}: TopicDetailModalProps) {
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // 编辑 / 删除弹窗
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editHook, setEditHook] = useState("");
  const [editEmotionTag, setEditEmotionTag] = useState("");
  const [editAudience, setEditAudience] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  // 状态同步
  useEffect(() => {
    if (item) {
      setEditTitle(item.title || "");
      setEditHook(item.hook || "");
      setEditEmotionTag(item.emotion_tag || "");
      setEditAudience(item.audience || "");
    }
  }, [item]);

  // 背景滚动锁定与 Esc 快捷键
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // 加载作品关联数据
  const loadWorksData = useCallback(async (itemId: string) => {
    setLoadingWorks(true);
    try {
      const [bestRes, recentRes] = await Promise.all([
        fetch(`/api/topics/sub-topics/${itemId}/works?sort=best&page_size=1`),
        fetch(`/api/topics/sub-topics/${itemId}/works?sort=recent&page_size=1`)
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
    } catch (err) {
      console.error("加载关联作品失败:", err);
      setWorks([]);
    } finally {
      setLoadingWorks(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && item?.id) {
      void loadWorksData(item.id);
    } else {
      setWorks([]);
    }
  }, [isOpen, item?.id, loadWorksData]);

  if (!item || !isOpen) return null;

  const isOwner = Boolean(currentUserId && item.created_by === currentUserId);
  const averagePlay = item.summary.averagePlayCount;

  // 复制剪贴板
  const handleCopyText = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    feedbackToast.success(`已复制${fieldName}`);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  // 认领/放回逻辑
  const handleClaimToggle = async () => {
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
    try {
      const res = await fetch(`/api/topics/sub-topics/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.status === 409) {
        const count = data.work_count ?? data.worksCount;
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
      onClose();
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

  // 提取最高与最新版本
  const bestWork = works[0];
  const latestWork = works.length > 1 ? works[1] : null;

  const renderPlayCount = (playCount: number) => {
    if (averagePlay === null) {
      return <span className="text-stone-700 font-medium tabular-nums">{playCount.toLocaleString()}</span>;
    }
    const isHigher = playCount >= averagePlay;
    return (
      <span
        className={cn(
          "font-semibold tabular-nums",
          isHigher ? "text-[#C9604D]" : "text-[#6FAA7D]"
        )}
      >
        {playCount.toLocaleString()}
      </span>
    );
  };

  const formattedDate = item.created_at
    ? new Date(item.created_at).toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "近期添加";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-hidden">
        {/* 高级毛玻璃遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 bg-stone-900/40 backdrop-blur-md cursor-pointer"
        />

        {/* 3:4 沉浸中心弹窗容器 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "relative z-10 w-full max-w-[740px] bg-white rounded-3xl shadow-2xl border border-stone-100/80 flex flex-col overflow-hidden",
            "max-h-[88vh] aspect-[4/3.2]"
          )}
        >
          {/* 顶栏：分类与状态胶囊 */}
          <div className="flex shrink-0 items-center justify-between border-b border-stone-100 bg-stone-50/60 px-5 py-3.5">
            <div className="flex items-center gap-2 min-w-0">
              {item.topic_groups && (
                <span className="inline-flex items-center gap-1 rounded-full bg-stone-200/70 px-3 py-1 text-xs font-medium text-stone-700">
                  <Layers className="size-3 text-stone-500" />
                  {item.topic_groups.name}
                </span>
              )}
              {item.topics && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#D97757]/10 px-3 py-1 text-xs font-medium text-[#D97757]">
                  <Tag className="size-3" />
                  {item.topics.name}
                </span>
              )}
              {isClaimedByMe && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#6FAA7D]/15 px-2.5 py-0.5 text-xs font-semibold text-[#4F825B]">
                  <Check className="size-3 stroke-[2.5]" />
                  我的候选
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 transition-colors"
              title="按 Esc 退出"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 中段：主可滚动阅读区 */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 select-text">
            {/* 大字号选题标题 */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold text-stone-900 leading-snug tracking-tight">
                  {item.title}
                </h2>
                <button
                  type="button"
                  onClick={() => handleCopyText(item.title, "标题")}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-[#D97757] bg-stone-100/80 hover:bg-[#D97757]/10 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  title="复制标题"
                >
                  {copiedField === "标题" ? (
                    <Check className="size-3.5 text-[#6FAA7D]" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span>{copiedField === "标题" ? "已复制" : "复制标题"}</span>
                </button>
              </div>
            </div>

            {/* 爆款 Hook 亮点区 */}
            {item.hook && (
              <div className="relative group rounded-2xl bg-stone-50/90 border border-stone-200/60 p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-[#D97757]">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-[#D97757]" />
                    <span>爆款 Hook 切入点</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText(item.hook, "Hook")}
                    className="flex items-center gap-1 text-[11px] font-medium text-stone-400 hover:text-[#D97757] transition-colors cursor-pointer"
                  >
                    {copiedField === "Hook" ? (
                      <Check className="size-3 text-[#6FAA7D]" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>{copiedField === "Hook" ? "已复制" : "复制"}</span>
                  </button>
                </div>
                <p className="text-sm text-stone-700 leading-relaxed font-normal">
                  “{item.hook}”
                </p>
              </div>
            )}

            {/* 属性与目标受众 Tags */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {item.emotion_tag && (
                <div className="inline-flex items-center gap-1 rounded-xl bg-[#D99E55]/12 border border-[#D99E55]/20 px-3 py-1 text-[#B87D33] font-medium">
                  <Flame className="size-3" />
                  <span>情绪：{item.emotion_tag}</span>
                </div>
              )}
              {item.audience && (
                <div className="inline-flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-1 text-stone-600 font-medium">
                  <User className="size-3 text-stone-400" />
                  <span>受众：{item.audience}</span>
                </div>
              )}
              {item.source && (
                <div className="inline-flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-1 text-stone-500">
                  <span>来源：{item.source}</span>
                </div>
              )}
            </div>

            {/* 整体数据统计 */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-3 flex items-center justify-between">
                <span className="text-xs text-stone-500 font-medium">全网历史均播</span>
                <span className="text-sm font-bold text-stone-900 tabular-nums">
                  {averagePlay !== null
                    ? averagePlay >= 10000
                      ? `${(averagePlay / 10000).toFixed(1)}w`
                      : averagePlay.toLocaleString()
                    : "暂无数据"}
                </span>
              </div>
              <div className="rounded-2xl border border-stone-100 bg-stone-50/50 p-3 flex items-center justify-between">
                <span className="text-xs text-stone-500 font-medium">累计认领热度</span>
                <span className="text-sm font-bold text-[#D97757] tabular-nums flex items-center gap-1">
                  <User className="size-3.5" />
                  {item.claimCount} 人认领
                </span>
              </div>
            </div>

            {/* 数据沉淀段：双卡对比 (最高播放 vs 最近发布) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  作品效果沉淀与文案对比
                </h3>
                <Link
                  href={`/topics/${item.id}`}
                  onClick={onClose}
                  className="text-xs text-[#D97757] hover:underline inline-flex items-center gap-0.5 font-medium"
                >
                  <span>查看全部历史版本</span>
                  <ExternalLink className="size-3" />
                </Link>
              </div>

              {loadingWorks ? (
                <div className="flex h-28 items-center justify-center rounded-2xl bg-stone-50 border border-stone-100">
                  <Loader2 className="size-5 animate-spin text-stone-400" />
                  <span className="text-xs text-stone-400 ml-2">正在分析关联作品与文案数据...</span>
                </div>
              ) : works.length === 0 ? (
                <div className="py-8 text-center rounded-2xl bg-stone-50/70 border border-dashed border-stone-200 text-xs text-stone-400">
                  该选题暂无提交的落地作品数据
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 最高播放版本 */}
                  {bestWork && (
                    <div className="rounded-2xl border border-stone-200/80 bg-white p-3.5 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#D97757]">
                          <Award className="size-4" />
                          <span>爆款最高播放</span>
                        </div>
                        <div className="text-xs font-semibold">
                          {renderPlayCount(bestWork.video_metrics_snapshots?.[0]?.play_count ?? 0)}
                        </div>
                      </div>
                      <p className="text-xs text-stone-600 line-clamp-3 leading-relaxed italic">
                        “{bestWork.content || bestWork.video_title}”
                      </p>
                      {bestWork.video_metrics_snapshots?.[0]?.likes !== undefined && (
                        <div className="pt-1 text-[11px] text-stone-400 flex items-center justify-between border-t border-stone-50">
                          <span>点赞: {bestWork.video_metrics_snapshots[0].likes.toLocaleString()}</span>
                          {bestWork.video_metrics_snapshots[0].follower_convert !== undefined && (
                            <span>转粉率: {(bestWork.video_metrics_snapshots[0].follower_convert * 100).toFixed(2)}%</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 最近发布版本 */}
                  {latestWork && (
                    <div className="rounded-2xl border border-stone-200/80 bg-white p-3.5 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#5F82A8]">
                          <Clock className="size-4" />
                          <span>最新发布版本</span>
                        </div>
                        <div className="text-xs font-semibold">
                          {renderPlayCount(latestWork.video_metrics_snapshots?.[0]?.play_count ?? 0)}
                        </div>
                      </div>
                      <p className="text-xs text-stone-600 line-clamp-3 leading-relaxed italic">
                        “{latestWork.content || latestWork.video_title}”
                      </p>
                      {latestWork.video_metrics_snapshots?.[0]?.likes !== undefined && (
                        <div className="pt-1 text-[11px] text-stone-400 flex items-center justify-between border-t border-stone-50">
                          <span>点赞: {latestWork.video_metrics_snapshots[0].likes.toLocaleString()}</span>
                          {latestWork.video_metrics_snapshots[0].follower_convert !== undefined && (
                            <span>转粉率: {(latestWork.video_metrics_snapshots[0].follower_convert * 100).toFixed(2)}%</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 底栏固定操作 Bar */}
          <div className="shrink-0 border-t border-stone-100 bg-stone-50/80 px-5 py-3.5 flex items-center justify-between gap-3">
            {/* 左侧：创建者与时间 */}
            <div className="flex items-center gap-2 text-xs text-stone-400">
              <User className="size-3.5" />
              <span>录入于 {formattedDate}</span>
            </div>

            {/* 右侧：主 Action 与 编辑/删除 */}
            <div className="flex items-center gap-2">
              {isOwner && (
                <div className="flex items-center gap-1 mr-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setEditDialogOpen(true)}
                    className="h-8 text-xs text-stone-600 hover:text-stone-900 gap-1 px-2"
                  >
                    <Pencil className="size-3.5 text-stone-400" />
                    <span>编辑</span>
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setDeleteErrorMsg(null);
                      setDeleteDialogOpen(true);
                    }}
                    className="h-8 text-xs text-[#C9604D] hover:bg-[#C9604D]/10 gap-1 px-2"
                  >
                    <Trash2 className="size-3.5" />
                    <span>删除</span>
                  </Button>
                </div>
              )}

              {isClaimedByMe ? (
                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={handleClaimToggle}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#6FAA7D]/30 bg-[#6FAA7D]/12 px-4 text-xs font-semibold text-[#5B9668] transition-all hover:bg-[#6FAA7D]/25 active:scale-95 disabled:cursor-wait cursor-pointer"
                >
                  {isClaiming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4 stroke-[2.5]" />}
                  已认领 (点击放回)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={handleClaimToggle}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-xl border px-5 text-xs font-semibold active:scale-95 transition-all duration-150 shadow-sm cursor-pointer",
                    isLimitReached
                      ? "border-[#D97757]/40 bg-[#D97757] text-white hover:bg-[#c26547] hover:shadow-md"
                      : "border-[#D97757] bg-[#D97757] text-white hover:bg-[#c26547] hover:shadow-md"
                  )}
                >
                  {isClaiming ? <Loader2 className="size-4 animate-spin" /> : "认领此选题"}
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* 编辑选题 Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-md p-5 rounded-2xl z-[60]">
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

        {/* 删除确认 Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md p-5 rounded-2xl z-[60]">
            <DialogHeader>
              <DialogTitle className="text-stone-900 text-[15px] font-semibold flex items-center gap-1.5">
                <AlertTriangle className="size-4 text-[#C9604D]" />
                <span>删除选题确认</span>
              </DialogTitle>
              <DialogDescription className="text-stone-500 text-[12.5px]">
                {deleteErrorMsg || `确定要删除选题“${item.title}”吗？此操作不可撤销。`}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
              <Button type="button" variant="destructive" size="sm" disabled={isDeleting} onClick={handleDeleteSubmit}>
                {isDeleting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                确认删除
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AnimatePresence>
  );
}
