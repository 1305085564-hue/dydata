"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Lightbulb, AlertTriangle, RefreshCw } from "lucide-react";
import type { TopicOption } from "./types";
import {
  fetchTopicJson,
  parseCreatedSubTopicResponse,
  parseSuggestedSubTopicsResponse,
} from "@/lib/topics/v2-client-contract";

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
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // 焦点记录与还原，支持 Esc 按键关闭
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current =
        document.activeElement as HTMLElement | null;
      closeBtnRef.current?.focus();
    }
    return () => {
      if (
        previousActiveElement.current &&
        typeof previousActiveElement.current.focus === "function"
      ) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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
      setErrorMsg("请填写必填项：母题、子题标题、一句话 Hook");
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
    <>
      <div
        className="fixed inset-0 bg-zinc-950/25 backdrop-blur-xs z-[60] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
        {/* 黄金比例容器 */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-modal-title"
          className="w-full max-w-lg bg-white/95 backdrop-blur-xl border border-zinc-200 rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-100">
            <h3
              id="create-modal-title"
              className="text-base font-semibold text-zinc-900"
            >
              新增子题
            </h3>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              title="关闭弹窗"
              aria-label="关闭弹窗"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3 bg-zinc-100 border border-zinc-200 text-zinc-600 rounded-lg text-xs flex items-center gap-2 font-normal">
                <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {topicsError && (
              <div className="p-3 bg-zinc-100 border border-zinc-200 text-zinc-600 rounded-lg text-xs font-normal">
                母题列表加载失败：{topicsError}
              </div>
            )}

            {/* 母题选择 */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                选择所属母题 <span className="text-[#DC2626]">*</span>
              </label>
              <select
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#D97757]/20 font-normal"
                required
                aria-label="选择所属母题"
              >
                <option value="">请选择母题...</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 子题标题 */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                子题标题 <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                placeholder="例如：打破洗盘迷局的三大核心信号"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#D97757]/20 font-normal"
                required
                aria-label="子题标题"
              />
            </div>

            {/* Hook */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                一句话选题 Hook / 痛点口号{" "}
                <span className="text-[#DC2626]">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="例如：为什么大部分散户买在起涨点却拿不住？3个洗盘细节揭密"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#D97757]/20 font-normal"
                required
                aria-label="一句话选题 Hook"
              />
            </div>

            {/* 标签 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  情绪标签 (可选)
                </label>
                <input
                  type="text"
                  placeholder="例如：避坑 / 警醒"
                  value={emotionTag}
                  onChange={(e) => setEmotionTag(e.target.value)}
                  className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#D97757]/20 font-normal"
                  aria-label="情绪标签"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  目标受众 (可选)
                </label>
                <input
                  type="text"
                  placeholder="例如：进阶交易者"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-800 focus:outline-none focus:ring-1 focus:ring-[#D97757]/20 font-normal"
                  aria-label="目标受众"
                />
              </div>
            </div>

            {/* 智能查重建议列表 */}
            {suggestions.length > 0 && (
              <div className="bg-zinc-100/70 border border-zinc-200/80 rounded-xl p-3 text-xs">
                <div className="font-semibold text-zinc-600 mb-1.5 flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span>检出相似度较高的已有子题 (请注意避免重复录入)</span>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {suggestions.map((s) => (
                    <div
                      key={s.id}
                      className="bg-white/90 p-2 rounded-lg border border-zinc-200 text-xs font-normal"
                    >
                      <div className="font-medium text-zinc-800">{s.title}</div>
                      <div className="text-zinc-500 truncate">“{s.hook}”</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 提交控制 */}
            <div className="pt-3 border-t border-zinc-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 active:scale-[0.97] text-xs font-medium transition-all"
                aria-label="取消录入"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] active:scale-[0.97] text-white text-xs font-medium transition-all shadow-2xs disabled:opacity-50"
                aria-label="保存子题"
              >
                {loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                <span>{loading ? "录入中..." : "保存子题"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
