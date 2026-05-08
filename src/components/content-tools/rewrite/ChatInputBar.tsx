'use client';

import React, { useEffect, useRef } from 'react';
import { Sparkles, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputBarProps {
  inputText: string;
  isSending: boolean;
  isChatStage: boolean;
  activeFixedModeName: string | null;
  onInputChange: (text: string) => void;
  onSend: () => void;
}

export function ChatInputBar({
  inputText,
  isSending,
  isChatStage,
  activeFixedModeName,
  onInputChange,
  onSend,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 56), 200)}px`;
    }
  }, [inputText]);

  const placeholder = isChatStage
    ? '继续追问、补充要求或微调...'
    : activeFixedModeName
      ? `输入原文，按「${activeFixedModeName}」改写...`
      : '输入原文开始改写...';

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            'relative flex items-end gap-2 rounded-2xl border bg-[#F9F9FB] p-2 transition',
            'focus-within:border-zinc-900 focus-within:bg-white focus-within:shadow-md'
          )}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSend();
              }
            }}
            disabled={isSending}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400',
              isSending && 'cursor-not-allowed opacity-60'
            )}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!inputText.trim() || isSending}
            className={cn(
              'mb-1 mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition',
              !inputText.trim() || isSending
                ? 'bg-zinc-200 text-zinc-400'
                : 'bg-zinc-950 text-white hover:-translate-y-[1px] hover:shadow-lg active:translate-y-0'
            )}
          >
            {isSending ? (
              <Sparkles className="h-4 w-4 animate-pulse" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1">
          <span className="text-[11px] text-zinc-400">
            Enter 发送 · Shift+Enter 换行
          </span>
          <span className="text-[11px] text-zinc-400">{inputText.length} 字</span>
        </div>
      </div>
    </div>
  );
}
