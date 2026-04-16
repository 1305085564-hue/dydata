import React from 'react';
import { Check, Copy, Sparkles, MessageSquare } from 'lucide-react';
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
      <div className="flex h-full flex-col items-center justify-center bg-slate-50/50">
        <div className="flex flex-col items-center gap-4 w-full max-w-sm px-6">
          <div className="flex space-x-2 w-full justify-center opacity-60">
            <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></div>
          </div>
          <span className="text-sm text-slate-500 font-medium tracking-wide">正在加载对话内容</span>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-50 p-8">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-slate-100">
            <MessageSquare className="h-6 w-6 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">
            {activeFixedMode ? `${activeFixedMode.name} 已准备好` : '首条主版本已准备好'}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            {activeFixedMode
              ? `在左侧粘贴原文，我会按“${activeFixedMode.name}”的要求立刻给你改写版本。`
              : '在左侧配置参数并输入原文。首轮固定出 1 个主版本结果，后续自动进入聊天模式。'}
          </p>
          
          <div className="mt-8 flex flex-col gap-2 w-full">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">试试这些快捷指令</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { label: '口播顺一点', text: '把这段财经口播改得更顺、更抓人：\n' },
                { label: '结构拉清楚', text: '保留专业边界，但把结构重新整理清楚：\n' },
                { label: '直接出 3 版', text: '给我 3 个可直接发布的版本：\n' },
              ].map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => {
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                      nativeInputValueSetter?.call(textarea, textarea.value ? textarea.value + '\n' + shortcut.text : shortcut.text);
                      const ev2 = new Event('input', { bubbles: true});
                      textarea.dispatchEvent(ev2);
                      textarea.focus();
                    }
                  }}
                  className="rounded-lg border border-slate-200 bg-background px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 shadow-sm hover:shadow"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:px-12">
        <div className="mx-auto max-w-4xl space-y-8 pb-10">
          {messages.map((message) => {
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-900 px-5 py-3.5 text-[15px] leading-relaxed text-white shadow-sm">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              );
            }

            if (message.role === 'system_note') {
              return (
                <div key={message.id} className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-[13px] leading-relaxed text-amber-800">
                  {message.content}
                </div>
              );
            }

            const responseMode = getMessageResponseMode(message);
            const versions = message.structuredResult?.final?.versions ?? [];
            const displayMeta = getMessageDisplayMeta(message, bootstrap);
            const chatText = message.structuredResult?.final?.recommendedText?.trim() || message.content.trim();

            return (
              <div key={message.id} className="flex gap-4">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 via-blue-800 to-cyan-600 shadow-sm">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      {responseMode === 'chat' ? '继续对话' : '改写结果'}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-600">
                      {displayMeta.badge}
                    </span>
                  </div>

                  {responseMode === 'versions' && versions.length > 0 ? (
                    <div className="space-y-4">
                      {versions.map((version, index) => {
                        const copyKey = `${message.id}-${index}`;
                        const copied = copiedKey === copyKey;

                        return (
                          <div
                            key={copyKey}
                            className="group relative rounded-2xl border border-slate-200 bg-background p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md"
                          >
                            <div className="mb-3 flex items-center justify-between">
                              <h3 className="text-[13px] font-bold text-slate-900">
                                {version.title || `版本 ${index + 1}`}
                              </h3>
                              <button
                                type="button"
                                onClick={() => onCopy(copyKey, version.content)}
                                className={cn(
                                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition',
                                  copied
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-50 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-900'
                                )}
                              >
                                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                {copied ? '已复制' : '复制'}
                              </button>
                            </div>
                            <div className="prose prose-slate prose-sm max-w-none text-[15px] leading-relaxed text-slate-700">
                              <p className="whitespace-pre-wrap">{version.content}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="group relative rounded-2xl border border-transparent hover:border-slate-200 hover:bg-background hover:shadow-sm p-4 -ml-4 transition-all">
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button
                           type="button"
                           onClick={() => onCopy(message.id, chatText || '')}
                           className={cn(
                             'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition',
                             copiedKey === message.id
                               ? 'bg-emerald-50 text-emerald-700'
                               : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 shadow-sm border border-slate-200'
                           )}
                         >
                           {copiedKey === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                           {copiedKey === message.id ? '已复制' : '复制'}
                         </button>
                      </div>
                      <div className="prose prose-slate max-w-none text-[15px] leading-relaxed text-slate-700 pt-1">
                        <p className="whitespace-pre-wrap">{chatText || '...'}</p>
                      </div>
                    </div>
                  )}

                  {responseMode === 'versions' && message.structuredResult?.final?.notes?.length ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">改写说明</p>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] text-slate-600">
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

          {!isSending && followUpSuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2 pl-12">
              {followUpSuggestions.slice(0, 4).map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  type="button"
                  onClick={() => {
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                      nativeInputValueSetter?.call(textarea, textarea.value ? textarea.value + '\n' + suggestion : suggestion);
                      const ev2 = new Event('input', { bubbles: true});
                      textarea.dispatchEvent(ev2);
                      textarea.focus();
                    }
                  }}
                  className="rounded-full border border-slate-200 bg-background px-3 py-1.5 text-[13px] font-medium text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>
    </div>
  );
}
