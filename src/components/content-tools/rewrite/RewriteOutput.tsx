import React from 'react';
import { Check, Copy, Sparkles, MessageSquare, ArrowRight } from 'lucide-react';
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
  { label: '口语顺一点', text: '把这段口播改得更顺、更抓人：\n' },
  { label: '结构拉清楚', text: '保留专业边界，但把结构重新整理清楚：\n' },
  { label: '直接出 3 版', text: '给我 3 个可直接发布的版本：\n' },
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
            <div className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce [animation-delay:-0.3s]" />
            <div className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce [animation-delay:-0.15s]" />
            <div className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce" />
          </div>
          <span className="text-[13px] text-zinc-400">正在加载对话...</span>
        </div>
      </div>
    );
  }

  // 空态
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <MessageSquare className="h-5 w-5 text-zinc-300" />
          </div>
          <h3 className="text-lg font-black tracking-tight text-zinc-900">
            {activeFixedMode ? `${activeFixedMode.name} 已准备好` : '首条主版本已准备好'}
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
            {activeFixedMode
              ? `在下方输入原文，我会按「${activeFixedMode.name}」立刻给你改写。`
              : '先选好配置，然后在下方输入原文。首轮固定出 1 个主版本，后续可继续对话微调。'}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                onClick={() => onSendOverride(shortcut.text)}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-600 transition hover:border-zinc-900 hover:text-zinc-900"
              >
                {shortcut.label}
                <ArrowRight className="h-3 w-3" />
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
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-4">
          {messages.map((message) => {
            // 用户消息 — Claude风格右对齐深色气泡
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-950 px-5 py-3.5 text-[15px] leading-relaxed text-white shadow-sm">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              );
            }

            // 系统提示
            if (message.role === 'system_note') {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="max-w-lg rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[13px] leading-relaxed text-amber-800">
                    {message.content}
                  </div>
                </div>
              );
            }

            // AI消息 — Claude风格左对齐无气泡
            const responseMode = getMessageResponseMode(message);
            const versions = message.structuredResult?.final?.versions ?? [];
            const displayMeta = getMessageDisplayMeta(message, bootstrap);
            const chatText = message.structuredResult?.final?.recommendedText?.trim() || message.content.trim();
            const isStreaming = message.id.startsWith('stream-');

            return (
              <div key={message.id} className="flex gap-3">
                {/* AI标识 */}
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-950">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  {/* 元信息 */}
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-zinc-900">
                      {responseMode === 'chat' ? '继续对话' : '改写结果'}
                    </span>
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-500">
                      {displayMeta.badge}
                    </span>
                    {isStreaming && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        生成中
                      </span>
                    )}
                  </div>

                  {/* Versions模式 — 结构化版本展示 */}
                  {responseMode === 'versions' && versions.length > 0 ? (
                    <div className="space-y-3">
                      {versions.map((version, index) => {
                        const copyKey = `${message.id}-${index}`;
                        const copied = copiedKey === copyKey;

                        return (
                          <div
                            key={copyKey}
                            className="group relative rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm"
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <h3 className="text-[13px] font-bold text-zinc-900">
                                {version.title || `版本 ${index + 1}`}
                              </h3>
                              <button
                                type="button"
                                onClick={() => onCopy(copyKey, version.content)}
                                className={cn(
                                  'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition',
                                  copied
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-zinc-50 text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-900'
                                )}
                              >
                                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                {copied ? '已复制' : '复制'}
                              </button>
                            </div>
                            <div className="text-[15px] leading-relaxed text-zinc-700">
                              <p className="whitespace-pre-wrap">{version.content}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Chat模式 — 纯文本 */
                    <div className="group relative">
                      <div className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onCopy(message.id, chatText || '')}
                          className={cn(
                            'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition',
                            copiedKey === message.id
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200'
                          )}
                        >
                          {copiedKey === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedKey === message.id ? '已复制' : '复制'}
                        </button>
                      </div>
                      <div className="text-[15px] leading-relaxed text-zinc-700">
                        <p className="whitespace-pre-wrap">{chatText || '...'}</p>
                      </div>
                    </div>
                  )}

                  {/* 改写说明 */}
                  {responseMode === 'versions' && message.structuredResult?.final?.notes?.length ? (
                    <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">改写说明</p>
                      <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[13px] text-zinc-600">
                        {message.structuredResult.final.notes.map((note, index) => (
                          <li key={`${message.id}-note-${index}`}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* 追问建议 */}
          {!isSending && followUpSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-10">
              {followUpSuggestions.slice(0, 4).map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  type="button"
                  onClick={() => onSendOverride(suggestion)}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-600 transition hover:border-zinc-900 hover:text-zinc-900"
                >
                  {suggestion}
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
