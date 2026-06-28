'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, Copy, RefreshCw, Eye, Edit3, Save, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PolishedDocumentCanvasProps {
  originalDraft: string;
  polishedText: string;
  isSending: boolean;
  onTextChange: (text: string) => void;
  onReloadAsInput: (text: string) => void;
}

// DP-based sentence-level diff algorithm
function diffSentences(oldText: string, newText: string) {
  if (!oldText) {
    return [{ type: 'normal' as const, value: newText }];
  }
  // Split by sentences, clauses, or line breaks, keeping the separators in the array
  const oldSent = oldText.split(/([。！？\n])/).filter(Boolean);
  const newSent = newText.split(/([。！？\n])/).filter(Boolean);

  const dp: number[][] = Array(oldSent.length + 1)
    .fill(0)
    .map(() => Array(newSent.length + 1).fill(0));

  for (let i = 1; i <= oldSent.length; i++) {
    for (let j = 1; j <= newSent.length; j++) {
      if (oldSent[i - 1] === newSent[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: Array<{ type: 'added' | 'removed' | 'normal'; value: string }> = [];
  let i = oldSent.length;
  let j = newSent.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldSent[i - 1] === newSent[j - 1]) {
      result.push({ type: 'normal', value: oldSent[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', value: newSent[j - 1] });
      j--;
    } else {
      result.push({ type: 'removed', value: oldSent[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

export function PolishedDocumentCanvas({
  originalDraft,
  polishedText,
  isSending,
  onTextChange,
  onReloadAsInput,
}: PolishedDocumentCanvasProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(polishedText);
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync editText when polishedText updates (e.g. streaming or conversation switch)
  useEffect(() => {
    setEditText(polishedText);
  }, [polishedText]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Position cursor at the end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleCopy = () => {
    if (!polishedText) return;
    navigator.clipboard.writeText(polishedText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleSaveEdit = () => {
    onTextChange(editText);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(polishedText);
    setIsEditing(false);
  };

  // Render text with diff markers
  const renderDiffContent = () => {
    const diffs = diffSentences(originalDraft, polishedText);
    return (
      <div className="whitespace-pre-wrap text-[14px] leading-[1.8] text-zinc-800 tracking-wide font-normal">
        {diffs.map((item, idx) => {
          if (item.type === 'added') {
            return (
              <span
                key={idx}
                className="bg-[#6FAA7D]/10 text-[#4F7F5E] px-0.5 rounded font-medium border-b border-[#6FAA7D]/20"
              >
                {item.value}
              </span>
            );
          }
          if (item.type === 'removed') {
            return (
              <span
                key={idx}
                className="bg-[#C9604D]/10 text-[#C9604D] line-through decoration-[#C9604D]/40 px-0.5 rounded"
              >
                {item.value}
              </span>
            );
          }
          return <span key={idx}>{item.value}</span>;
        })}
      </div>
    );
  };

  const hasText = Boolean(polishedText.trim());

  return (
    <div className="flex h-full flex-col bg-zinc-50/20 p-4">
      {/* Canvas Header */}
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-1.5 pl-1">
          <FileText className="h-4 w-4 text-zinc-400" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            润色终稿画布
          </span>
        </div>

        {/* Toolbar Buttons */}
        {hasText && (
          <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-0.5 shadow-sm">
            {/* Diff Toggler */}
            {!isEditing && (
              <button
                type="button"
                onClick={() => setShowDiff(!showDiff)}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition-colors',
                  showDiff
                    ? 'bg-zinc-100 text-zinc-900 font-semibold'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
                )}
                title={showDiff ? '关闭对比' : '显示修改对比'}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>对比</span>
              </button>
            )}

            {/* Copy Button */}
            {!isEditing && (
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition-colors',
                  copied
                    ? 'bg-[#6FAA7D]/10 text-[#4F7F5E]'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
                )}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? '已复制' : '复制'}</span>
              </button>
            )}

            {/* Reload/Return to Input Button */}
            {!isEditing && (
              <button
                type="button"
                onClick={() => onReloadAsInput(polishedText)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
                title="将当前文案回填为新原文重新修改"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>回填新会话</span>
              </button>
            )}

            {/* Edit Toggler */}
            {isEditing ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#D97757] px-2.5 text-[11px] font-medium text-white shadow-sm hover:bg-[#C96442] transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>保存</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-medium text-zinc-400 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
                title="编辑终稿"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>编辑</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Document Sheet Area */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-zinc-300">
        {!hasText && !isSending ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4">
            <div className="h-8 w-8 rounded-full border border-dashed border-zinc-300 flex items-center justify-center mb-2">
              <FileText className="h-4 w-4 text-zinc-300" />
            </div>
            <p className="text-[12px] font-medium text-zinc-400">终稿画布</p>
            <p className="text-[11px] text-zinc-400 mt-1 leading-[1.5] max-w-[200px]">
              左侧输入并润色后，最终修改文本将在此处呈现与对比。
            </p>
          </div>
        ) : isSending && !polishedText ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <div className="flex space-x-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#D97757] animate-pulse [animation-delay:-0.3s]" />
              <div className="h-1.5 w-1.5 rounded-full bg-[#D97757] animate-pulse [animation-delay:-0.15s]" />
              <div className="h-1.5 w-1.5 rounded-full bg-[#D97757] animate-pulse" />
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-semibold animate-pulse">
              正在润色文案
            </span>
          </div>
        ) : isEditing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="h-full w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.8] text-zinc-800 outline-none placeholder:text-zinc-300 focus:ring-0 focus-visible:outline-none"
            placeholder="在此处编辑润色后的文案内容..."
          />
        ) : showDiff ? (
          renderDiffContent()
        ) : (
          <div className="whitespace-pre-wrap text-[14px] leading-[1.8] text-zinc-800 tracking-wide font-normal select-text">
            {polishedText}
          </div>
        )}
      </div>
    </div>
  );
}
