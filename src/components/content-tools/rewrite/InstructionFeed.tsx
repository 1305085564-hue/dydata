'use client';

import React from 'react';
import { Sparkles, ArrowRight, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BootstrapPayload, Message } from '../types';

interface InstructionFeedProps {
  bootstrap: BootstrapPayload;
  messages: Message[];
  messagesLoading: boolean;
  isSending: boolean;
  activeFixedMode: BootstrapPayload['fixedModes'][0] | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onSendOverride: (text: string) => void;
  onSelectFixedMode: (id: string) => void;
  selectedFixedModeId: string | null;
}

const SHORTCUTS = [
  { label: '口语顺一点', hint: '更口语、更顺畅，适合录口播', text: '把这段文案修改得更口语化、节奏感更强、更抓人' },
  { label: '结构拉清楚', hint: '梳理逻辑框架，层级更分明', text: '保持专业内容，把这段文案的逻辑结构重新排版整理清楚' },
  { label: '口播更有力', hint: '加重语气节奏，提升完播率', text: '修改这段文案，使句子更短，适合重语气、强节奏的录制' },
];

export function InstructionFeed({
  bootstrap,
  messages,
  messagesLoading,
  isSending,
  activeFixedMode,
  messagesEndRef,
  onSendOverride,
  onSelectFixedMode,
  selectedFixedModeId,
}: InstructionFeedProps) {
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
          <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-400 font-medium">
            加载历史消息
          </span>
        </div>
      </div>
    );
  }

  // Welcome / Cold Start State
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col justify-start px-4 py-8 overflow-y-auto bg-zinc-50/30">
        <div className="mx-auto w-full max-w-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm">
              <PenLine className="h-4 w-4 text-zinc-500" />
            </div>
            <h2 className="text-[20px] font-semibold tracking-tight text-zinc-800">
              {activeFixedMode ? `${activeFixedMode.name} 已就绪` : '文案润色工作室'}
            </h2>
            <p className="text-[12px] leading-[1.6] text-zinc-400">
              选择润色技能，贴入原文。系统将保持上下文持续修改，右侧画布始终展示最新终稿。
            </p>
          </div>

          {/* Fixed Modes/Skills Grid */}
          {bootstrap.fixedModes.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 pl-1">
                选择文案技能
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {bootstrap.fixedModes.map((mode) => {
                  const isActive = mode.id === selectedFixedModeId;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onSelectFixedMode(mode.id)}
                      className={cn(
                        'group relative overflow-hidden rounded-xl border p-3.5 text-left transition-[background-color,border-color,box-shadow] duration-150',
                        isActive
                          ? 'border-[#D97757] bg-white shadow-sm'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50'
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-0 h-full w-[3px] bg-[#D97757]" />
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-zinc-800">
                          {mode.name}
                        </span>
                        {isActive && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#D97757]" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-[1.5] text-zinc-400 group-hover:text-zinc-500 transition-colors">
                        {mode.description || '内置定制润色指令'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Actions / Shortcuts */}
          <div className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 pl-1">
              快捷指令建议
            </span>
            <div className="grid grid-cols-1 gap-2">
              {SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => onSendOverride(shortcut.text)}
                  className="group flex items-start justify-between rounded-xl border border-zinc-200 bg-white p-3.5 text-left transition-[background-color,border-color,box-shadow] duration-150 hover:border-zinc-300 hover:bg-zinc-50/50"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-zinc-300 transition-colors group-hover:bg-[#D97757]" />
                      <span className="text-[12.5px] font-semibold text-zinc-700">
                        {shortcut.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-400 leading-[1.5] group-hover:text-zinc-500 transition-colors">
                      {shortcut.hint}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 self-center text-zinc-300 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-[#D97757]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Conversation list view
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 bg-zinc-50/30">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {messages.map((message) => {
          // 1. User Message (Render instruction only)
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-zinc-950 px-3.5 py-2.5 text-[13px] leading-[1.6] text-white">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            );
          }

          // 2. System Note Message
          if (message.role === 'system_note') {
            return (
              <div key={message.id} className="flex justify-center">
                <div className="relative max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-center text-[11px] leading-[1.6] text-zinc-500 shadow-sm">
                  <div className="absolute left-0 top-0 h-full w-[2px] bg-[#D99E55]" />
                  <span>{message.content}</span>
                </div>
              </div>
            );
          }

          // 3. Assistant Message (Render minimal status + notes feedback)
          const isStreaming = message.id.startsWith('stream-');
          const notes = message.structuredResult?.final?.notes ?? [];

          return (
            <div key={message.id} className="flex gap-2.5">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white">
                <Sparkles className="h-3 w-3 text-[#D97757]" />
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-zinc-800">
                    AI 润色反馈
                  </span>
                  {isStreaming ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#D99E55] font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55] animate-pulse" />
                      <span>正在重写...</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400">已更新终稿</span>
                  )}
                </div>

                <div className="space-y-2">
                  {/* Status Indicator Bubble */}
                  <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-[12px] text-zinc-600 shadow-sm">
                    {isStreaming ? (
                      <span className="text-zinc-400">正在生成文案，请查看右侧画布...</span>
                    ) : (
                      <span>✨ 终稿已在右侧同步更新。</span>
                    )}
                  </div>

                  {/* Notes / Edit Explanations */}
                  {!isStreaming && notes.length > 0 && (
                    <div className="rounded-xl border border-zinc-150 bg-zinc-50/50 p-3 space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 block">
                        修改要点
                      </span>
                      <ul className="space-y-1 text-[11.5px] leading-[1.6] text-zinc-500">
                        {notes.map((note, index) => (
                          <li key={`${message.id}-note-${index}`} className="flex items-start gap-1.5">
                            <span className="mt-1.5 inline-flex h-1 w-1 shrink-0 rounded-full bg-zinc-300" />
                            <span className="min-w-0">{note}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Follow-up suggestions (micro-tuning prompts) */}
        {!isSending && followUpSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-8 pt-1">
            {followUpSuggestions.slice(0, 3).map((suggestion, index) => (
              <button
                key={`${suggestion}-${index}`}
                type="button"
                onClick={() => onSendOverride(suggestion)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-zinc-500 shadow-sm transition-[background-color,border-color] duration-150 hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
              >
                <span>{suggestion}</span>
                <ArrowRight className="h-3 w-3 text-zinc-400" />
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>
    </div>
  );
}
