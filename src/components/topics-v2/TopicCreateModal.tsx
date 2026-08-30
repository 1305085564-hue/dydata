"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Lightbulb, RefreshCw } from "lucide-react";
import type { TopicOption } from "./types";
import {
  fetchTopicJson,
  isTeamMembershipRequiredError,
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
  onSuccess: () => void | Promise<void>;
}

interface TopicSuggestion {
  id: string;
  title: string;
  hook: string | null;
  topics?: TopicOption | null;
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
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([]);

  // 输入标题或 Hook 后调用真实建议接口，帮助录入者发现已有相似选题。
  useEffect(() => {
    if (!isOpen || (!title.trim() && !hook.trim())) {
      setSuggestions([]);
      return;
    }

    let isMounted = true;
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams();
        if (title.trim()) query.set("title", title.trim());
        if (hook.trim()) query.set("content", hook.trim());

        const nextSuggestions = parseSuggestedSubTopicsResponse(
          await fetchTopicJson(
            `/api/topics/sub-topics/suggest?${query.toString()}`,
          ),
        );
        if (isMounted) {
          setSuggestions(nextSuggestions);
          setErrorMsg(null);
        }
      } catch (error) {
        if (!isMounted) return;
        setErrorMsg(
          isTeamMembershipRequiredError(error)
            ? "请先申请加入团队"
            : error instanceof Error
              ? error.message
              : "查重校验失败",
        );
      }
    }, 400);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [hook, isOpen, title]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      await onSuccess();
      onClose();
      setTitle("");
      setHook("");
      setTopicId("");
      setEmotionTag("");
      setAudience("");
      setSuggestions([]);
    } catch (error) {
      setErrorMsg(
        isTeamMembershipRequiredError(error)
          ? "请先申请加入团队"
          : error instanceof Error
            ? error.message
            : "请求服务端异常",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-[#E5E0D6] bg-white/95 p-6 shadow-claude-dialog sm:max-w-lg">
        <DialogHeader className="mb-0 border-b border-[#ECE7DE] pb-3">
          <DialogTitle className="text-base font-semibold text-[#1C1917]">
            录入选题
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1 pr-1">
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-r-lg border-l-2 border-l-[#C0685C] bg-[#C0685C]/5 p-3 text-[13px] font-normal text-[#292524]">
                <AlertTriangle className="size-4 shrink-0 text-[#C0685C]" />
                <span>{errorMsg}</span>
              </div>
            )}

            {topicsError && (
              <div className="rounded-r-lg border-l-2 border-l-[#C0685C] bg-[#C0685C]/5 p-3 text-[13px] font-normal text-[#292524]">
                母题列表加载失败：{topicsError}
              </div>
            )}

            <div>
              <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                选择所属母题 <span className="text-[#C0685C]">*</span>
              </label>
              <Select
                value={topicId}
                onValueChange={(value) => setTopicId(value || "")}
              >
                <SelectTrigger
                  aria-label="选择所属母题"
                  className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
                >
                  <SelectValue>
                    {topicId
                      ? topics.find((topic) => topic.id === topicId)?.name ||
                        "选择母题..."
                      : "选择母题..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="min-w-44 rounded-xl border border-[#E5E0D6] bg-[#FAF8F4] shadow-claude-float">
                  {topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {topic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                子题标题 <span className="text-[#C0685C]">*</span>
              </label>
              <input
                type="text"
                placeholder="例如：打破洗盘迷局的三大核心信号"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                required
                aria-label="子题标题"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                一句话选题 Hook / 痛点口号{" "}
                <span className="text-[#C0685C]">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="例如：为什么大部分散户买在起涨点却拿不住？3个洗盘细节揭密"
                value={hook}
                onChange={(event) => setHook(event.target.value)}
                className="w-full rounded-xl border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                required
                aria-label="一句话选题 Hook"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                  情绪标签（可选）
                </label>
                <input
                  type="text"
                  placeholder="例如：避坑 / 警醒"
                  value={emotionTag}
                  onChange={(event) => setEmotionTag(event.target.value)}
                  className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                  aria-label="情绪标签"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium text-[#292524]">
                  目标受众（可选）
                </label>
                <input
                  type="text"
                  placeholder="例如：进阶交易者"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 px-3 py-2 text-[13px] font-normal text-[#292524] shadow-2xs placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
                  aria-label="目标受众"
                />
              </div>
            </div>

            {suggestions.length > 0 && (
              <div className="rounded-xl bg-[#F5F3EE]/70 p-3 text-[13px]">
                <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-[#292524]">
                  <Lightbulb className="size-4 shrink-0 text-[#D99E55]" />
                  <span>发现相似的已有子题，避免重复录入</span>
                </div>
                <div className="max-h-32 space-y-1.5 overflow-y-auto">
                  {suggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="rounded-lg bg-white/90 p-2 text-[13px] font-normal shadow-2xs"
                    >
                      <div className="font-medium text-[#292524]">
                        {suggestion.title}
                      </div>
                      <div className="truncate text-[#78716C]">
                        “{suggestion.hook}”
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="flex-row justify-end border-t border-[#ECE7DE] pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-[#E5E0D6] px-4 py-1.5 text-[13px] font-medium text-[#292524] transition-all hover:bg-[#FBF9F5] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="取消录入"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D97757] px-4 py-1.5 text-[13px] font-medium text-white shadow-2xs transition-all hover:bg-[#C46A4D] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="保存选题"
            >
              {loading && <RefreshCw className="size-3.5 animate-spin" />}
              <span>{loading ? "录入中..." : "保存选题"}</span>
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
