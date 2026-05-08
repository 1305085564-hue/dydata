'use client';

import React, { useEffect, useRef } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
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

  const canSend = inputText.trim() && !isSending;

  return (
    <div className="shrink-0 bg-[#FAFAFB] px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            'group relative flex items-end gap-2 rounded-[20px] border bg-white px-3 py-2.5 transition-all',
            'focus-within:border-zinc-950 focus-within:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)]',
            isSending ? 'border-zinc-200' : 'border-zinc-200 hover:border-zinc-300'
          )}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            disabled={isSending}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-[14px] leading-[1.7] tracking-[0.005em] text-zinc-900 outline-none placeholder:text-zinc-400',
              isSending && 'cursor-not-allowed opacity-60'
            )}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            className={cn(
              'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-all',
              canSend
                ? 'bg-[#D97757] text-white shadow-sm hover:-translate-y-[1px] hover:bg-[#C96442] hover:shadow-md active:translate-y-0'
                : 'bg-zinc-100 text-zinc-400'
            )}
            title={canSend ? '发送' : '输入内容后可发送'}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            )}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            Enter 发送 · Shift+Enter 换行
          </span>
          <span className="text-[10px] text-zinc-400 tabular-nums">{inputText.length} 字</span>
        </div>
      </div>
    </div>
  );
}
