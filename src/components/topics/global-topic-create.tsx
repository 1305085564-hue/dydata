"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lightbulb, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// 预定义母题以防数据库未加载完成时进行占位/降级渲染
const DEFAULT_TOPICS = [
  { id: "temp-1", name: "暴力战法类", sort_order: 10 },
  { id: "temp-2", name: "热点/新闻解读类", sort_order: 20 },
  { id: "temp-3", name: "情绪周期类", sort_order: 30 },
  { id: "temp-4", name: "案例拆解/复盘类", sort_order: 40 },
  { id: "temp-5", name: "避坑防雷类", sort_order: 50 },
  { id: "temp-6", name: "降维认知类", sort_order: 60 },
  { id: "temp-7", name: "顶级心法类", sort_order: 70 },
  { id: "temp-8", name: "工具/神技类", sort_order: 80 }
];

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

export function GlobalTopicCreate() {
  const [isOpen, setIsOpen] = useState(false);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>("temp-1");
  const [inputText, setInputText] = useState("");
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
      setIsOpen(true);
    };

    window.addEventListener("open-global-topic-create", handleOpen);
    return () => window.removeEventListener("open-global-topic-create", handleOpen);
  }, []);

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
    if (!selectedTopicId || selectedTopicId.startsWith("temp-")) {
      feedbackToast.warning("请选择一个母题分类");
      return;
    }
    if (!inputText.trim()) {
      feedbackToast.warning("请输入选题想法");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/topics/sub-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: inputText.trim(),
          hook: inputText.trim(),
          topic_id: selectedTopicId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "录入选题失败");
      }

      feedbackToast.success("新选题录入成功");
      // 重置并收起
      setInputText("");
      setIsOpen(false);
      
      // 触发一个刷新事件，让今日工作台或选题池页面能监听到刷新
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
      <DialogContent className="sm:max-w-md w-full max-w-[calc(100%-2rem)] md:max-w-[480px] p-5 md:p-6 rounded-2xl">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="flex items-center gap-2 text-stone-900 font-semibold">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[#D97757]/10 text-[#D97757]">
              <Lightbulb className="size-4" />
            </div>
            <span>极速录入新选题</span>
          </DialogTitle>
          <DialogDescription className="text-stone-500 text-[12.5px] leading-relaxed">
            写下您的灵感与一句话选题，并归入对应的母题。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          {/* 母题选择 */}
          <div className="space-y-2">
            <label className="text-[12.5px] font-medium text-stone-700 block">
              归属母题 <span className="text-red-500">*</span>
            </label>
            {isLoadingTopics ? (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/50">
                <Loader2 className="size-5 animate-spin text-stone-400" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[190px] overflow-y-auto pr-1">
                {(topics.length > 0 ? topics : DEFAULT_TOPICS).map((topic) => {
                  const isSelected = selectedTopicId === topic.id;
                  return (
                    <button
                      key={topic.name}
                      type="button"
                      onClick={() => setSelectedTopicId(topic.id || "")}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-lg border text-[12.5px] font-medium transition-all duration-200",
                        "hover:-translate-y-[1px] active:scale-[0.98]",
                        isSelected
                          ? "border-[#8AA8C7] bg-[#8AA8C7]/5 text-stone-900 shadow-[0_2px_8px_-2px_rgba(138,168,199,0.2)] font-semibold"
                          : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                      )}
                    >
                      {topic.name}
                    </button>
                  );
                })}
              </div>
            )}
            {!isLoadingTopics && topics.length === 0 && (
              <div className="rounded-lg border border-[#C9604D]/15 bg-[#C9604D]/5 px-3 py-2 text-[12px] text-[#C9604D]">
                母题加载失败，请刷新后重试
              </div>
            )}
          </div>

          {/* 一句话选题 */}
          <div className="space-y-2">
            <label htmlFor="topic-hook" className="text-[12.5px] font-medium text-stone-700 block">
              一句话选题想法 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="topic-hook"
              rows={3}
              required
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="写下你的选题想法，例如：揭秘庄家吸筹的三种常见假象..."
              className={cn(
                "w-full rounded-xl border border-stone-200 bg-white p-3 text-[13px] text-stone-900 placeholder-stone-400 outline-none leading-relaxed",
                "transition-all duration-200 focus:border-[#D97757] focus:ring-1 focus:ring-[#D97757]/20 focus:shadow-[0_2px_8px_rgba(217,119,87,0.03)]"
              )}
            />
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
              disabled={isSubmitting || !selectedTopicId || selectedTopicId.startsWith("temp-") || topics.length === 0 || !inputText.trim()}
              className="h-8.5 rounded-lg px-5 font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  正在录入...
                </>
              ) : (
                "录入选题"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
