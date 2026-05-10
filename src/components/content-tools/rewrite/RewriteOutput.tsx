import React from 'react';
import { Check, Copy, Sparkles, ArrowRight, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BootstrapPayload, Message } from '../types';

interface RewriteOutputProps {
  bootstrap: BootstrapPayload;
  messages: Message[];
  messagesLoading: boolean;
  isSending: boolean;
  activeFixedMode: BootstrapPayload['fixedModes'][0] | null;
  copiedKey: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onCopy: (key: string, text: string) => void;
  onSendOverride: (text: string) => void;
  getMessageResponseMode: (msg: Message) => 'chat' | 'versions';
  getMessageDisplayMeta: (msg: Message, bs: BootstrapPayload) => { badge: string; summary: string };
}

const SHORTCUTS = [
  { label: '口语顺一点', hint: '按原意，改成更口语更抓人', text: '把这段口播改得更顺、更抓人：\n' },
  { label: '结构拉清楚', hint: '保留专业边界，重排结构', text: '保留专业边界，但把结构重新整理清楚：\n' },
  { label: '直接出 3 版', hint: '一次给够选择题', text: '给我 3 个可直接发布的版本：\n' },
  { label: '口播更有力', hint: '加重节奏感，适合录制', text: '把这段改成录播感更强、节奏更重的版本：\n' },
];

export function RewriteOutput({
  bootstrap,
  messages,
  messagesLoading,
  isSending,
  activeFixedMode,
  copiedKey,
  messagesEndRef,
  onCopy,
  onSendOverride,
  getMessageResponseMode,
  getMessageDisplayMeta,
}: RewriteOutputProps) {
  const lastAssistantMessage = [...messages].reverse().find((item) => item.role === 'assistant');
  const followUpSuggestions = lastAssistantMessage?.structuredResult?.final?.followUpSuggestions ?? [];

  if (messagesLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex space-x-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-bounce [animation-delay:-0.3s]" />
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-bounce [animation-delay:-0.15s]" />
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-bounce" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">Loading</span>
        </div>
      </div>
    );
  }

  // Welcome state
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 pb-24">
        <div className="w-full max-w-2xl">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm">
              <PenLine className="h-4 w-4 text-zinc-500" />
            </div>
            <h2 className="text-[20px] font-semibold leading-tight tracking-tight text-zinc-950">
              {activeFixedMode ? `${activeFixedMode.name} 就位` : '今天改哪段？'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-[1.7] text-zinc-500">
              {activeFixedMode
                ? `在下方输入原文，我按「${activeFixedMode.name}」立刻给你改写。`
                : '首轮只出 1 个主版本，后续可继续对话微调。选中固定套餐会锁定后台绑定的模型、提示词、字数。'}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-2.5">
            {SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                onClick={() => onSendOverride(shortcut.text)}
                className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 active:translate-y-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex h-1 w-1 rounded-full bg-zinc-300 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:bg-[#D97757]" />
                      <span className="text-[13px] font-semibold text-zinc-950">
                        {shortcut.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-[1.7] text-zinc-500">
                      {shortcut.hint}
                    </p>
                  </div>
                  <ArrowRight className="h-3 w-3 shrink-0 text-zinc-300 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:translate-x-0.5 group-hover:text-[#D97757]" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-8">
          {messages.map((message) => {
            // User bubble — right aligned zinc-950
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-[14px] rounded-tr-[4px] bg-zinc-950 px-4 py-3 text-[14px] leading-[1.7] text-white">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              );
            }

            // System note
            if (message.role === 'system_note') {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="relative max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-center text-[12px] leading-[1.7] text-zinc-500">
                    <div className="absolute left-0 top-0 h-full w-[3px] bg-[#D99E55]" />
                    <span className="pl-1">{message.content}</span>
                  </div>
                </div>
              );
            }

            // AI message
            const responseMode = getMessageResponseMode(message);
            const versions = message.structuredResult?.final?.versions ?? [];
            const displayMeta = getMessageDisplayMeta(message, bootstrap);
            const chatText = message.structuredResult?.final?.recommendedText?.trim() || message.content.trim();
            const isStreaming = message.id.startsWith('stream-');

            return (
              <div key={message.id} className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border border-zinc-200 bg-white">
                  <Sparkles className="h-3.5 w-3.5 text-[#D97757]" />
                </div>

                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold tracking-tight text-zinc-950">
                      {responseMode === 'chat' ? '继续对话' : '改写结果'}
                    </span>
                    <span className="rounded-md bg-zinc-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.25em] text-zinc-500 ring-1 ring-zinc-200">
                      {displayMeta.badge}
                    </span>
                    {isStreaming && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#8A6A2F]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55] animate-pulse" />
                        <span className="uppercase tracking-[0.25em]">Generating</span>
                      </span>
                    )}
                  </div>

                  {/* Versions mode */}
                  {responseMode === 'versions' && versions.length > 0 ? (
                    <div className="space-y-2.5">
                      {versions.map((version, index) => {
                        const copyKey = `${message.id}-${index}`;
                        const copied = copiedKey === copyKey;

                        return (
                          <div
                            key={copyKey}
                            className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-zinc-300"
                          >
                            <div className="flex items-center justify-between border-b border-zinc-100 px-3.5 py-2">
                              <h3 className="text-[12px] font-semibold tracking-tight text-zinc-950">
                                {version.title || `版本 ${index + 1}`}
                              </h3>
                              <button
                                type="button"
                                onClick={() => onCopy(copyKey, version.content)}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium uppercase tracking-[0.25em] transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
                                  copied
                                    ? 'bg-zinc-50 text-[#4F7F5E] ring-1 ring-zinc-200'
                                    : 'text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-50 hover:text-zinc-950'
                                )}
                              >
                                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                {copied ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                            <div className="px-3.5 py-3 text-[14px] leading-[1.7] text-zinc-950">
                              <p className="whitespace-pre-wrap">{version.content}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Chat mode */
                    <div className="group relative rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5">
                      <button
                        type="button"
                        onClick={() => onCopy(message.id, chatText || '')}
                        className={cn(
                          'absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium uppercase tracking-[0.25em] transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
                          copiedKey === message.id
                            ? 'bg-zinc-50 text-[#4F7F5E] ring-1 ring-zinc-200'
                            : 'text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-50 hover:text-zinc-950'
                        )}
                      >
                        {copiedKey === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiedKey === message.id ? 'Copied' : 'Copy'}
                      </button>
                      <div className="text-[14px] leading-[1.7] text-zinc-950">
                        <p className="whitespace-pre-wrap">{chatText || '...'}</p>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {responseMode === 'versions' && message.structuredResult?.final?.notes?.length ? (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                      <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                        Notes
                      </p>
                      <ul className="mt-1.5 space-y-0.5 text-[12.5px] leading-[1.7] text-zinc-500">
                        {message.structuredResult.final.notes.map((note, index) => (
                          <li key={`${message.id}-note-${index}`} className="flex gap-1.5">
                            <span className="mt-1.5 inline-flex h-1 w-1 shrink-0 rounded-full bg-zinc-300" />
                            <span className="min-w-0">{note}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Follow-up suggestions */}
          {!isSending && followUpSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-10">
              {followUpSuggestions.slice(0, 4).map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  type="button"
                  onClick={() => onSendOverride(suggestion)}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 shadow-sm transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:text-zinc-950 active:translate-y-0"
                >
                  {suggestion}
                  <ArrowRight className="h-3 w-3 text-zinc-400" />
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} className="h-2" />
        </div>
      </div>
    </div>
  );
}
