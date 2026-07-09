'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, PenLine, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BootstrapPayload, Message } from '../types';

interface InstructionFeedProps {
  bootstrap: BootstrapPayload;
  messages: Message[];
  messagesLoading: boolean;
  isSending: boolean;
  isV2Conversation: boolean;
  activeFixedMode: BootstrapPayload['fixedModes'][0] | null;
  availableSkills: Array<{ id: string; name: string; scope?: 'platform' | 'private' | 'public_user' }>;
  activeSkills: Array<{ id: string; name: string }>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onSendOverride: (text: string) => void;
  onSelectFixedMode: (id: string) => void;
  onToggleSkill: (skill: { id: string; name: string; scope?: 'platform' | 'private' | 'public_user' }) => void;
  selectedFixedModeId: string | null;
}

const SHORTCUTS = [
  { label: '口语顺一点', hint: '更口语、更顺畅，适合录口播', text: '把这段文案修改得更口语化、节奏感更强、更抓人' },
  { label: '结构拉清楚', hint: '梳理逻辑框架，层级更分明', text: '保持专业内容，把这段文案的逻辑结构重新排版整理清楚' },
  { label: '口播更有力', hint: '加重语气节奏，提升完播率', text: '修改这段文案，使句子更短，适合重语气、强节奏的录制' },
];

const SKILL_GROUPS = [
  { scope: 'platform', label: '平台技能' },
  { scope: 'private', label: '个人技能' },
  { scope: 'public_user', label: '共享技能' },
] as const;

export function InstructionFeed({
  bootstrap,
  messages,
  messagesLoading,
  isSending,
  isV2Conversation,
  activeFixedMode,
  availableSkills,
  activeSkills,
  messagesEndRef,
  onSendOverride,
  onSelectFixedMode,
  onToggleSkill,
  selectedFixedModeId,
}: InstructionFeedProps) {
  const lastAssistantMessage = [...messages].reverse().find((item) => item.role === 'assistant');
  const followUpSuggestions = lastAssistantMessage?.structuredResult?.final?.followUpSuggestions ?? [];
  const groupedSkills = SKILL_GROUPS.map((group) => ({
    ...group,
    items: availableSkills.filter((skill) => (skill.scope ?? 'platform') === group.scope),
  })).filter((group) => group.items.length > 0);

  const [hiddenAfterIndex, setHiddenAfterIndex] = useState<number | null>(null);

  // Reset hidden state when new messages arrive
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHiddenAfterIndex(null);
  }, [messages.length]);

  const visibleMessages = hiddenAfterIndex !== null ? messages.slice(0, hiddenAfterIndex + 1) : messages;

  if (messagesLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex space-x-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-stone-300 animate-bounce [animation-delay:-0.3s]" />
            <div className="h-1.5 w-1.5 rounded-full bg-stone-300 animate-bounce [animation-delay:-0.15s]" />
            <div className="h-1.5 w-1.5 rounded-full bg-stone-300 animate-bounce" />
          </div>
          <span className="text-[11px] uppercase tracking-[0.25em] text-stone-400 font-medium">
            加载历史消息
          </span>
        </div>
      </div>
    );
  }

  // Welcome / Cold Start State
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col justify-start px-4 py-8 overflow-y-auto bg-transparent">
        <div className="mx-auto w-full max-w-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 bg-white shadow-sm">
              <PenLine className="h-4 w-4 text-stone-500" />
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight text-stone-900">
              {isV2Conversation ? '选择技能开始写作' : activeFixedMode ? `${activeFixedMode.name} 已就绪` : '文案润色工作室'}
            </h2>
            <p className="text-[12px] leading-[1.6] text-stone-400">
              {isV2Conversation
                ? '技能会作为提示词注入当前画布，可单选也可多选。'
                : '选择润色技能，贴入原文。系统将保持上下文持续修改，右侧画布始终展示最新终稿。'}
            </p>
          </div>

          {isV2Conversation && (
            <div className="space-y-3">
              {groupedSkills.length === 0 ? (
                <div className="rounded-lg border border-dashed border-stone-200 bg-white px-3.5 py-4 text-center text-[12px] text-stone-400">
                  暂无可用技能
                </div>
              ) : groupedSkills.map((group) => (
                <div key={group.scope} className="space-y-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500 pl-1">
                    {group.label}
                  </span>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {group.items.map((skill) => {
                      const isActive = activeSkills.some((item) => item.id === skill.id);
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => onToggleSkill(skill)}
                          className={cn(
                            'group relative flex items-center justify-between gap-2 rounded-lg p-3.5 text-left transition-all duration-200 border bg-white',
                            isActive
                              ? 'border-[#8AA8C7]/50 bg-[#8AA8C7]/5 shadow-sm -translate-y-0.5'
                              : 'border-stone-200 hover:shadow-sm hover:border-stone-300 hover:translate-y-[-1px]'
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#8AA8C7]" />}
                            <span className={cn('text-[12.5px]', isActive ? 'font-semibold text-stone-800 tracking-tight' : 'font-medium text-stone-700')}>
                              {skill.name}
                            </span>
                          </div>
                          {isActive && (
                            <span className="shrink-0 rounded-lg bg-[#8AA8C7]/10 px-2 py-0.5 text-[9.5px] font-medium tracking-wider text-stone-800">
                              已激活
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isV2Conversation && bootstrap.fixedModes.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500 pl-1">
                选择文案技能
              </span>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {bootstrap.fixedModes.map((mode) => {
                  const isActive = mode.id === selectedFixedModeId;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onSelectFixedMode(mode.id)}
                      className={cn(
                        'group relative flex flex-col items-start gap-1 rounded-lg p-3.5 text-left transition-all duration-200 border bg-white',
                        isActive
                          ? 'border-[#8AA8C7]/50 bg-[#8AA8C7]/5 shadow-sm -translate-y-0.5'
                          : 'border-stone-200 hover:shadow-sm hover:border-stone-300 hover:translate-y-[-1px]'
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#8AA8C7]" />}
                          <span className={cn('text-[12.5px]', isActive ? 'font-semibold text-stone-800 tracking-tight' : 'font-medium text-stone-700')}>
                            {mode.name}
                          </span>
                        </div>
                      </div>
                      <p className={cn("text-[11px] leading-[1.5] transition-colors pl-4", isActive ? 'text-stone-500 font-medium' : 'text-stone-400 group-hover:text-stone-500')}>
                        {mode.description || '内置定制润色指令'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Actions / Shortcuts */}
          <div className="space-y-2 mt-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500 pl-1">
              快捷指令建议
            </span>
            <div className="grid grid-cols-1 gap-1">
              {SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  onClick={() => onSendOverride(shortcut.text)}
                  className="group flex items-center justify-between rounded-lg p-3 text-left transition-colors duration-150 bg-transparent hover:bg-stone-100/50"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-stone-700 group-hover:text-stone-900 transition-colors">
                        {shortcut.label}
                      </span>
                      <span className="text-[10.5px] text-stone-400 group-hover:text-stone-500 transition-colors truncate">
                        {shortcut.hint}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#D97757]" />
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
    <div className="flex-1 overflow-y-auto px-4 py-4 bg-transparent">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {visibleMessages.map((message, idx) => {
          // 1. User Message (Render instruction only)
          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-tr-md bg-stone-100/80 px-3.5 py-2 text-[12.5px] leading-[1.6] text-stone-800 border border-stone-200/50">
                  <p className="whitespace-pre-wrap font-medium">{message.content}</p>
                </div>
              </div>
            );
          }

          // 2. System Note Message
          if (message.role === 'system_note') {
            return (
              <div key={message.id} className="flex justify-center">
                <div className="relative max-w-md overflow-hidden rounded-lg border border-stone-200 bg-stone-50 px-3.5 py-2 text-center text-[11px] leading-[1.6] text-stone-500 shadow-sm">
                  <div className="absolute left-0 top-0 h-full w-[2px] bg-[#D99E55]" />
                  <span>{message.content}</span>
                </div>
              </div>
            );
          }

          // 3. Assistant Message (Render minimal status + notes feedback)
          const isStreaming = message.id.startsWith('stream-');
          const notes = message.structuredResult?.final?.notes ?? [];
          const isLastVisibleAi = idx === visibleMessages.map(m => m.role).lastIndexOf('assistant');

          return (
            <div key={message.id} className="flex gap-2.5">
              <div className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <Sparkles className="h-3 w-3 text-[#D97757]" />
              </div>

              <div className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-stone-900">
                    AI 润色反馈
                  </span>
                  {isStreaming ? (
                    <span className="inline-flex items-center gap-1.5 text-[10.5px] text-[#D99E55] font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#D99E55] animate-pulse" />
                      <span>收到，正在为你重塑...</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-stone-400">已重构完毕</span>
                  )}
                </div>

                <div className="space-y-2">
                  {/* Status Indicator Bubble */}
                  <div className="text-[11px] text-stone-400 pb-1">
                    {isStreaming ? (
                      <span className="text-stone-400">正在重写内容，右侧画布实时更新...</span>
                    ) : (
                      <span className="text-[#4F7F5E]">✨ 终稿已在右侧同步更新</span>
                    )}
                  </div>

                  {/* Notes / Edit Explanations */}
                  {!isStreaming && notes.length > 0 && (
                    <div className="relative pl-3 space-y-1.5 border-l-2 border-stone-200/60">
                      <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-stone-400 block">
                        修改要点
                      </span>
                      <ul className="space-y-1.5 text-[11.5px] leading-[1.55] text-stone-500">
                        {notes.map((note, index) => (
                          <li key={`${message.id}-note-${index}`} className="flex items-start gap-1.5">
                            <span className="mt-1.5 inline-flex h-1 w-1 shrink-0 rounded-full bg-stone-300" />
                            <span className="min-w-0">{note}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Revert Action */}
                  {!isStreaming && !isLastVisibleAi && (
                    <div className="pt-1">
                      <button
                        onClick={() => setHiddenAfterIndex(idx)}
                        className="group inline-flex h-7 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-[10.5px] font-medium text-stone-500 shadow-sm transition-[background-color,border-color] duration-150 hover:border-stone-300 hover:text-stone-800"
                        title="废弃此节点之后的对话，直接基于当前版本继续润色"
                      >
                        <RotateCcw className="h-3 w-3 text-stone-400 group-hover:text-stone-600 transition-colors" />
                        <span>基于此版本继续</span>
                      </button>
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
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-500 shadow-sm transition-[background-color,border-color] duration-150 hover:border-stone-300 hover:text-stone-800 active:translate-y-0"
              >
                <span>{suggestion}</span>
                <ArrowRight className="h-3 w-3 text-stone-400" />
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>
    </div>
  );
}
