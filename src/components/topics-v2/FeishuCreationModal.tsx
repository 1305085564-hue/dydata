"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  FileText,
  Sparkles,
  Info,
} from "lucide-react";
import type { SubTopicItem } from "./types";

interface FeishuCreationModalProps {
  isOpen: boolean;
  topic: SubTopicItem | null;
  feishuWorkspaceUrl?: string | null; // e.g. team space url
  onClose: () => void;
  onMarkWriting?: (topicId: string) => void;
  onCancelWriting?: (topicId: string) => void;
  isWriting?: boolean;
}

export function FeishuCreationModal({
  isOpen,
  topic,
  feishuWorkspaceUrl = null,
  onClose,
  onMarkWriting,
  onCancelWriting,
  isWriting = false,
}: FeishuCreationModalProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const getFormattedContent = useCallback(() => {
    if (!topic) return "";
    const lines: string[] = [
      `【选题名称】：${topic.title}`,
      topic.topics?.name ? `【所属母题】：${topic.topics.name}` : "",
      topic.hook ? `【一句话钩子】：${topic.hook}` : "",
      topic.audience ? `【目标受众】：${topic.audience}` : "",
      topic.outline
        ? typeof topic.outline === "string"
          ? `【内容提纲】：\n${topic.outline}`
          : Array.isArray(topic.outline)
            ? `【内容提纲】：\n${topic.outline.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
            : ""
        : "",
      `【来源】：${topic.source_type === "external" ? "外部收集干货" : "团队内部已验证"}`,
    ].filter(Boolean);

    return lines.join("\n\n");
  }, [topic]);

  const copyToClipboard = useCallback(async () => {
    const text = getFormattedContent();
    if (!text) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setCopyFailed(false);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      setCopyFailed(true);
      setCopied(false);
    }
  }, [getFormattedContent]);

  // 打开弹窗时自动执行一次复制
  useEffect(() => {
    if (isOpen && topic) {
      setCopied(false);
      setCopyFailed(false);
      void copyToClipboard();
    }
  }, [isOpen, topic, copyToClipboard]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !topic) return null;

  const contentText = getFormattedContent();

  const handleOpenFeishu = () => {
    if (topic && onMarkWriting && !isWriting) {
      onMarkWriting(topic.id);
    }
    if (feishuWorkspaceUrl) {
      window.open(feishuWorkspaceUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-[85] bg-[#1C1917]/25 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 弹窗主体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feishu-modal-title"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[90] w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-[#E5E0D6] bg-white shadow-claude-dialog overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[#ECE7DE] bg-[#FAF8F4] px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-[#D97757]/10 flex items-center justify-center text-[#D97757]">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h3
                id="feishu-modal-title"
                className="text-sm font-semibold text-[#1C1917]"
              >
                前往飞书创作立卷
              </h3>
              <p className="text-[11.5px] text-[#78716C]">
                选题内容已自动整理，粘贴至飞书文档即可动笔
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 items-center justify-center rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 内容主体 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
          {/* 复制状态条 */}
          {copied ? (
            <div className="flex items-center justify-between rounded-xl bg-[#6FAA7D]/10 border border-[#6FAA7D]/20 px-3.5 py-2.5 text-xs text-[#292524]">
              <div className="flex items-center gap-2">
                <Check className="size-4 text-[#6FAA7D] shrink-0" />
                <span className="font-medium text-[#1C1917]">
                  选题内容已复制到剪贴板
                </span>
              </div>
              <button
                type="button"
                onClick={() => void copyToClipboard()}
                className="text-xs text-[#78716C] hover:text-[#1C1917] font-medium underline"
              >
                再次复制
              </button>
            </div>
          ) : copyFailed ? (
            <div className="flex items-start gap-2 rounded-xl bg-[#DC2626]/5 border border-[#DC2626]/20 p-3 text-xs text-[#DC2626]">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5 flex-1">
                <p className="font-medium">自动复制未生效</p>
                <p className="text-[11.5px] text-[#78716C]">
                  请在下方文本框中手动全选复制，或点击右侧手动复制按钮。
                </p>
              </div>
            </div>
          ) : null}

          {/* 飞书空间配置状态 */}
          {!feishuWorkspaceUrl && (
            <div className="flex items-start gap-2.5 rounded-xl bg-[#F5F3EE] border border-[#ECE7DE] p-3 text-xs text-[#78716C]">
              <Info className="size-4 text-[#78716C] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-medium text-[#292524]">
                  团队暂未配置统一飞书工作空间
                </span>
                <p className="text-[11.5px] leading-relaxed">
                  选题内容已完成复制，你可直接打开个人飞书文档进行粘贴创作。管理员可在后台配置统一工作空间链接。
                </p>
              </div>
            </div>
          )}

          {/* 手动复制内容区域 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#78716C]">
              <span className="font-medium text-[#292524] flex items-center gap-1.5">
                <FileText className="size-3.5 text-[#78716C]" />
                <span>待粘贴内容预览</span>
              </span>
              <button
                type="button"
                onClick={() => void copyToClipboard()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#D97757] hover:bg-[#D97757]/10 transition-colors cursor-pointer"
              >
                <Copy className="size-3" />
                <span>{copied ? "已复制" : "手动复制"}</span>
              </button>
            </div>
            <div className="relative">
              <textarea
                readOnly
                value={contentText}
                rows={6}
                className="w-full rounded-xl border border-[#ECE7DE] bg-[#FAF8F4]/70 p-3 text-xs leading-relaxed text-[#292524] font-mono focus:bg-white focus:outline-none focus:border-[#78716C] select-all resize-none shadow-2xs"
              />
            </div>
          </div>

          {/* 在写状态管理提示 */}
          <div className="rounded-xl border border-[#ECE7DE] bg-[#FAF8F4] p-3 text-xs text-[#78716C] flex items-center justify-between">
            <span className="text-[11.5px]">
              {isWriting ? "当前状态：你正在写此题" : "好选题允许多人同时写，开始后将在题库标记你的热度"}
            </span>
            {isWriting && onCancelWriting && (
              <button
                type="button"
                onClick={() => {
                  onCancelWriting(topic.id);
                  onClose();
                }}
                className="text-xs text-[#C9604D] hover:underline font-medium shrink-0 ml-2"
              >
                取消写作状态
              </button>
            )}
          </div>
        </div>

        {/* 底栏操作 */}
        <div className="flex items-center justify-between border-t border-[#ECE7DE] bg-[#FAF8F4] px-5 py-3.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 rounded-xl px-4 py-2 text-xs font-medium text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-colors cursor-pointer"
          >
            完成并关闭
          </button>

          <div className="flex items-center gap-2">
            {feishuWorkspaceUrl ? (
              <button
                type="button"
                onClick={handleOpenFeishu}
                className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-xl bg-[#D97757] px-5 py-2 text-xs font-semibold text-white hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 shadow-xs transition-all cursor-pointer"
              >
                <span>前往团队飞书空间</span>
                <ExternalLink className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (topic && onMarkWriting && !isWriting) {
                    onMarkWriting(topic.id);
                  }
                  onClose();
                }}
                className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-xl bg-[#D97757] px-5 py-2 text-xs font-semibold text-white hover:bg-[#C46A4D] active:scale-[0.985] active:duration-75 shadow-xs transition-all cursor-pointer"
              >
                <span>标记在写并关闭</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
