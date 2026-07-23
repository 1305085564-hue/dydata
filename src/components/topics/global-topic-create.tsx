"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lightbulb, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface TopicItem {
  id: string;
  name: string;
  sort_order: number;
}

// 广播打开选题录入的事件
export const triggerGlobalTopicCreate = (detail?: { title?: string }) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-global-topic-create", { detail }));
  }
};

export interface GlobalTopicCreateRequest {
  id: number;
  title?: string;
}

interface GlobalTopicCreateProps {
  initialRequest?: GlobalTopicCreateRequest;
}

export function GlobalTopicCreate({ initialRequest }: GlobalTopicCreateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [inputText, setInputText] = useState("");
  const [hookText, setHookText] = useState("");
  const [emotionTag, setEmotionTag] = useState("");
  const [audience, setAudience] = useState("");
  const [showMore, setShowMore] = useState(false);

  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 监听全局打开事件
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.title) {
        setInputText(customEvent.detail.title);
      } else {
        setInputText("");
      }
      setHookText("");
      setEmotionTag("");
      setAudience("");
      setShowMore(false);
      setIsOpen(true);
    };

    window.addEventListener("open-global-topic-create", handleOpen);
    return () => window.removeEventListener("open-global-topic-create", handleOpen);
  }, []);

  useEffect(() => {
    if (!initialRequest) return;
    setInputText(initialRequest.title ?? "");
    setIsOpen(true);
  }, [initialRequest]);

  // 当弹窗打开且未加载母题时，拉取母题列表
  useEffect(() => {
    if (!isOpen || topics.length > 0) return;

    let active = true;
    const fetchTopics = async () => {
      setIsLoadingTopics(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("topics")
          .select("id, name, sort_order")
          .order("sort_order", { ascending: true });

        if (error) throw error;
        if (active && data) {
          setTopics(data as TopicItem[]);
          // 默认选中第一个
          if (data.length > 0) {
            setSelectedTopicId(data[0].id);
          }
        }
      } catch (err) {
        console.error("加载母题失败:", err);
        feedbackToast.error("加载母题列表失败，请刷新后重试", {
          details: err instanceof Error ? err.message : String(err)
        });
      } finally {
        if (active) setIsLoadingTopics(false);
      }
    };

    void fetchTopics();
    return () => {
      active = false;
    };
  }, [isOpen, topics.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId) {
      feedbackToast.warning("请选择一个母题分类");
      return;
    }
    if (!inputText.trim()) {
      feedbackToast.warning("请输入选题标题");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/topics/sub-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: inputText.trim(),
          hook: hookText.trim() || null,
          emotion_tag: emotionTag.trim() || null,
          audience: audience.trim() || null,
          topic_id: selectedTopicId,
          source: "manual"
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "录入选题失败");
      }

      feedbackToast.success("新选题录入成功");
      // 重置并收起
      setInputText("");
      setHookText("");
      setEmotionTag("");
      setAudience("");
      setShowMore(false);
      setIsOpen(false);
      
      // 触发一个刷新事件，让数据台或选题池页面能监听到刷新
      window.dispatchEvent(new CustomEvent("refresh-topics"));
    } catch (err) {
      feedbackToast.error("录入失败", {
        details: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md w-full max-w-[calc(100%-2rem)] md:max-w-[540px] p-5 md:p-6 rounded-2xl">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="flex items-center gap-2 text-stone-900 font-semibold">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[#D97757]/10 text-[#D97757]">
              <Lightbulb className="size-4" />
            </div>
            <span>极速录入新选题</span>
          </DialogTitle>
          <DialogDescription className="text-stone-500 text-[12.5px] leading-relaxed">
            写下您的选题标题与钩子灵感，并归入对应的母题。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          {/* 母题选择：采用每排4个 (grid-cols-4) 舒展展示 */}
          <div className="space-y-2">
            <label className="text-[12.5px] font-medium text-stone-700 block">
              归属母题 <span className="text-[#C9604D]">*</span>
            </label>
            {isLoadingTopics ? (
              <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/50">
                <Loader2 className="size-4 animate-spin text-stone-400" />
                <span className="text-[12px] text-stone-400 ml-2">正在载入分类...</span>
              </div>
            ) : topics.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[190px] overflow-y-auto pr-1">
                {topics.map((topic) => {
                  const isSelected = selectedTopicId === topic.id;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-xl border px-2 text-[12px] font-medium transition-all duration-150 cursor-pointer truncate",
                        "active:scale-[0.97]",
                        isSelected
                          ? "border-[#5F82A8]/50 bg-[#5F82A8]/12 text-[#355273] font-semibold ring-2 ring-[#5F82A8]/20 shadow-2xs"
                          : "border-stone-200/80 bg-stone-50/40 text-stone-600 hover:border-stone-300 hover:bg-white hover:text-stone-900"
                      )}
                      title={topic.name}
                    >
                      <span className="truncate">{topic.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {!isLoadingTopics && topics.length === 0 && (
              <div className="rounded-lg border border-[#C9604D]/15 bg-[#C9604D]/5 px-3 py-2 text-[12px] text-[#C9604D]">
                母题加载失败，请刷新后重试
              </div>
            )}
          </div>

          {/* 选题标题 */}
          <div className="space-y-1.5">
            <label htmlFor="topic-title" className="text-[12.5px] font-medium text-stone-700 block">
              选题标题 <span className="text-[#C9604D]">*</span>
            </label>
            <input
              id="topic-title"
              type="text"
              required
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="例如：揭秘庄家吸筹的三种常见假象"
              className={cn(
                "w-full h-9.5 rounded-xl border border-stone-200/90 bg-white px-3 text-[13px] text-stone-900 placeholder-stone-400 outline-none",
                "transition-all duration-200 focus:border-[#D97757] focus:ring-2 focus:ring-[#D97757]/15"
              )}
            />
          </div>

          {/* 一句话钩子（选填） */}
          <div className="space-y-1.5">
            <label htmlFor="topic-hook" className="text-[12.5px] font-medium text-stone-700 block">
              一句话钩子 <span className="text-stone-400 font-normal">(选填)</span>
            </label>
            <textarea
              id="topic-hook"
              rows={2}
              value={hookText}
              onChange={(e) => setHookText(e.target.value)}
              placeholder="选填，例如：为什么散户总在底部割肉？因为主力用了这招..."
              className={cn(
                "w-full rounded-xl border border-stone-200 bg-white p-2.5 text-[13px] text-stone-900 placeholder-stone-400 outline-none leading-relaxed",
                "transition-all duration-200 focus:border-[#D97757] focus:ring-1 focus:ring-[#D97757]/20"
              )}
            />
          </div>

          {/* 选填折叠区 */}
          <div>
            <button
              type="button"
              onClick={() => setShowMore((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#D97757] hover:underline cursor-pointer"
            >
              <span>{showMore ? "收起更多选项" : "添加更多（情绪/受众）"}</span>
              {showMore ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>

            <AnimatePresence>
              {showMore && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden space-y-3 pt-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[12px] text-stone-600 block font-medium">情绪标签 (选填)</label>
                      <input
                        type="text"
                        value={emotionTag}
                        onChange={(e) => setEmotionTag(e.target.value)}
                        placeholder="如：焦虑 / 好奇 / 避坑"
                        className="w-full h-8.5 rounded-lg border border-stone-200 bg-white px-2.5 text-[12px] text-stone-800 outline-none focus:border-[#D97757]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[12px] text-stone-600 block font-medium">目标受众 (选填)</label>
                      <input
                        type="text"
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        placeholder="如：小白投资者 / 职场新人"
                        className="w-full h-8.5 rounded-lg border border-stone-200 bg-white px-2.5 text-[12px] text-stone-800 outline-none focus:border-[#D97757]"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 操作 */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsOpen(false)}
              className="h-8.5 rounded-lg px-4"
            >
              取消
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !selectedTopicId || topics.length === 0 || !inputText.trim()}
              className="h-8.5 rounded-xl px-5 font-medium bg-[#D97757] hover:bg-[#D97757]/90 text-white active:scale-95 shadow-xs transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  正在录入...
                </>
              ) : (
                "确认录入选题"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
