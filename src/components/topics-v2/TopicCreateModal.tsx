"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Lightbulb, RefreshCw, Sparkles, Check } from "lucide-react";
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
import { Button } from "@/components/ui/button";

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

  // 智能快贴状态
  const [smartPasteText, setSmartPasteText] = useState("");
  const [isSmartPasteOpen, setIsSmartPasteOpen] = useState(false);
  const [smartPasteSuccessMsg, setSmartPasteSuccessMsg] = useState<string | null>(null);

  const handleApplySmartPaste = () => {
    if (!smartPasteText.trim()) return;
    const raw = smartPasteText.trim();
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

    let extractedTitle = "";
    let extractedHook = "";
    let matchedTopicId = "";

    const titleMatch = raw.match(/(?:【选题(?:名称)?】|标题[：:])\s*([^\n]+)/);
    const hookMatch = raw.match(/(?:【(?:一句话)?钩子|Hook】|钩子[：:]|Hook[：:])\s*([^\n]+)/i);

    if (titleMatch && titleMatch[1]) {
      extractedTitle = titleMatch[1].trim();
    }
    if (hookMatch && hookMatch[1]) {
      extractedHook = hookMatch[1].trim();
    }

    if (!extractedTitle && lines.length > 0) {
      extractedTitle = lines[0].replace(/^[0-9]+[、. ]+/, "").replace(/^[《"“](.*)[》"”]$/, "$1").slice(0, 50);
    }
    if (!extractedHook) {
      if (lines.length > 1) {
        const quoteLine = lines.find((l, idx) => idx > 0 && /[“"『]/.test(l));
        extractedHook = (quoteLine || lines[1]).replace(/^[《"“](.*)[》"”]$/, "$1").slice(0, 100);
      } else {
        extractedHook = extractedTitle;
      }
    }

    if (topics.length > 0) {
      for (const t of topics) {
        if (raw.includes(t.name) || (t.name.length >= 2 && raw.includes(t.name.slice(0, 2)))) {
          matchedTopicId = t.id;
          break;
        }
      }
    }

    if (extractedTitle) setTitle(extractedTitle);
    if (extractedHook) setHook(extractedHook);
    if (matchedTopicId) setTopicId(matchedTopicId);

    setSmartPasteSuccessMsg("已从文案识别填入标题与 Hook");
    setIsSmartPasteOpen(false);
    setTimeout(() => setSmartPasteSuccessMsg(null), 3500);
  };

  // 输入标题或 Hook 后调用真实建议接口，帮助录入者发现已有相似选题。
  useEffect(() => {
    if (!isOpen || (!title.trim() && !hook.trim())) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
          <DialogTitle className="text-base font-medium text-[#1C1917]">
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

            {/* 智能快贴提取：纸内纯排版，随行在白纸上排版，无装饰大底盒 */}
            <div className="space-y-2 pb-1">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsSmartPasteOpen(!isSmartPasteOpen)}
                  className="text-xs font-medium text-[#D97757] hover:text-[#C46A4D] flex items-center gap-1.5 cursor-pointer py-1"
                >
                  <Sparkles className="size-3.5" />
                  <span>{isSmartPasteOpen ? "收起智能提取" : "✨ 从文案/脚本一键智能提取"}</span>
                </button>
                {smartPasteSuccessMsg && (
                  <span className="text-[11.5px] text-[#6FAA7D] font-medium animate-in fade-in flex items-center gap-1">
                    <Check className="size-3" />
                    <span>{smartPasteSuccessMsg}</span>
                  </span>
                )}
              </div>
              {isSmartPasteOpen && (
                <div className="space-y-2 pt-0.5">
                  <textarea
                    rows={3}
                    value={smartPasteText}
                    onChange={(e) => setSmartPasteText(e.target.value)}
                    placeholder="把外部抖音脚本、飞书文案或笔记整段粘贴到这里，点击自动提取标题与Hook..."
                    className="w-full rounded-xl border border-[#E5E0D6] bg-[#FAF8F4]/50 focus:bg-white p-3 text-xs text-[#292524] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#78716C] focus:ring-1 focus:ring-[#D97757]/20 shadow-2xs resize-none transition-all"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSmartPasteText("");
                        setIsSmartPasteOpen(false);
                      }}
                      className="px-2.5 py-1 text-xs text-[#78716C] hover:text-[#1C1917] rounded cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleApplySmartPaste}
                      disabled={!smartPasteText.trim()}
                      className="px-3 py-1 bg-[#D97757] hover:bg-[#C46A4D] disabled:opacity-40 text-white text-xs font-medium rounded-lg shadow-2xs transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      智能识别填入
                    </button>
                  </div>
                </div>
              )}
            </div>

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
                <div className="mb-1 flex items-center gap-1.5 font-medium text-[#292524]">
                  <Lightbulb className="size-4 shrink-0 text-[#B98A54]" />
                  <span>发现相似选题 · 建议差异化切角</span>
                </div>
                <p className="text-[11.5px] text-[#78716C] mb-2 leading-relaxed font-normal">
                  若方向重合，建议尝试切换为【避坑避雷】或【反直觉实战案例】等不同角度切入。
                </p>
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

          <DialogFooter className="border-t border-[#ECE7DE]/80 bg-[#FAF8F4]/30 px-6 py-3.5 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="secondary"
              size="m"
              onClick={onClose}
              disabled={loading}
              aria-label="取消录入"
            >
              取消
            </Button>
            <Button
              type="submit"
              size="m"
              disabled={loading}
              aria-label="保存选题"
            >
              {loading && <RefreshCw className="size-3.5 animate-spin" />}
              <span>{loading ? "录入中..." : "保存选题"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
