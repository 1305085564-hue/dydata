"use client";

import React, { useState, useEffect } from "react";
import { Lightbulb, AlertTriangle, RefreshCw } from "lucide-react";
import type { TopicOption } from "./types";
import {
  fetchTopicJson,
  parseCreatedSubTopicResponse,
  parseSuggestedSubTopicsResponse,
} from "@/lib/topics/v2-client-contract";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TopicCreateModalProps {
  isOpen: boolean;
  topics: TopicOption[];
  topicsError?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function TopicCreateModal({
  isOpen,
  topics,
  topicsError = null,
  onClose,
  onSuccess,
}: TopicCreateModalProps) {
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [topicId, setTopicId] = useState("");
  const [emotionTag, setEmotionTag] = useState("");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 查重建议候选
  const [suggestions, setSuggestions] = useState<
    Array<{
      id: string;
      title: string;
      hook: string | null;
      topics?: TopicOption | null;
    }>
  >([]);
  // 实时查重建议防重复录入
  useEffect(() => {
    if (!title.trim() && !hook.trim()) {
      setSuggestions([]);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams();
        if (title.trim()) query.set("title", title.trim());
        if (hook.trim()) query.set("content", hook.trim());

        const suggestions = parseSuggestedSubTopicsResponse(
          await fetchTopicJson(
            `/api/topics/sub-topics/suggest?${query.toString()}`,
          ),
        );
        if (isMounted) setSuggestions(suggestions);
      } catch (err) {
        if (isMounted)
          setErrorMsg(err instanceof Error ? err.message : "查重校验失败");
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [title, hook]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !hook.trim() || !topicId) {
      setErrorMsg("还有必填项没填：母题、子题标题、一句话 Hook");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      const created = parseCreatedSubTopicResponse(
        await fetchTopicJson("/api/topics/sub-topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            hook: hook.trim(),
            topic_id: topicId,
            emotion_tag: emotionTag.trim() || null,
            audience: audience.trim() || null,
          }),
        }),
      );

      if (!created.id) throw new Error("创建接口未返回新选题");
      onSuccess();
      onClose();
      // 重置表单
      setTitle("");
      setHook("");
      setTopicId("");
      setEmotionTag("");
      setAudience("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "请求服务端异常");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-[#E5E0D6] bg-white/95 p-6 shadow-claude-dialog sm:max-w-lg">
        <DialogHeader className="mb-0 border-b border-[#ECE7DE] pb-3">
          <DialogTitle className="font-serif tracking-tight text-base font-semibold text-[#1C1917]">
            新增子题
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1 pr-1">
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-r-lg border-l-2 border-l-[#DC2626] bg-red-50/50 p-3 text-[13px] font-normal text-[#292524]">
                <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {topicsError && (
              <div className="rounded-r-lg border-l-2 border-l-[#DC2626] bg-red-50/50 p-3 text-[13px] font-normal text-[#292524]">
                母题列表加载失败：{topicsError}
              </div>
            )}

            {/* 母题选择 */}
            <div>
              <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                选择所属母题 <span className="text-[#DC2626]">*</span>
              </label>
              <Select
                value={topicId}
                onValueChange={(val) => setTopicId(val || "")}
              >
                <SelectTrigger
                  aria-label="选择所属母题"
                  className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
                >
                  <SelectValue>
                    {topicId
                      ? topics.find((t) => t.id === topicId)?.name || "选择母题..."
                      : "选择母题..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E5E0D6] bg-[#FAF8F4] shadow-claude-float min-w-44">
                  {topics.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 子题标题 */}
            <div>
              <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                子题标题 <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                placeholder="例如：打破洗盘迷局的三大核心信号"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                required
                aria-label="子题标题"
              />
            </div>

            {/* Hook */}
            <div>
              <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                一句话选题 Hook / 痛点口号{" "}
                <span className="text-[#DC2626]">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="例如：为什么大部分散户买在起涨点却拿不住？3个洗盘细节揭密"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                className="w-full rounded-xl border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                required
                aria-label="一句话选题 Hook"
              />
            </div>

            {/* 标签 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                  情绪标签 (可选)
                </label>
                <input
                  type="text"
                  placeholder="例如：避坑 / 警醒"
                  value={emotionTag}
                  onChange={(e) => setEmotionTag(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                  aria-label="情绪标签"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                  目标受众 (可选)
                </label>
                <input
                  type="text"
                  placeholder="例如：进阶交易者"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                  aria-label="目标受众"
                />
              </div>
            </div>

            {/* 智能查重建议列表 */}
            {suggestions.length > 0 && (
              <div className="rounded-xl bg-[#F5F3EE]/70 p-3 text-[13px]">
                <div className="font-semibold text-[#292524] mb-1.5 flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4 text-[#D99E55] shrink-0" />
                  <span>发现相似的已有子题，避免重复录入</span>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {suggestions.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg bg-white/90 p-2 text-[13px] font-normal shadow-2xs"
                    >
                      <div className="font-medium text-[#292524]">{s.title}</div>
                      <div className="text-[#78716C] truncate">“{s.hook}”</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </DialogBody>

          {/* 提交控制 */}
          <DialogFooter className="flex-row justify-end border-t border-[#ECE7DE] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#E5E0D6] px-4 py-1.5 text-[13px] font-medium text-[#292524] transition-all hover:bg-[#FBF9F5] active:scale-[0.985] active:duration-75"
                aria-label="取消录入"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#D97757] px-4 py-1.5 text-[13px] font-medium text-white shadow-2xs transition-all hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 disabled:opacity-50"
                aria-label="保存子题"
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                <span>{loading ? "录入中..." : "保存子题"}</span>
              </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
