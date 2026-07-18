'use client';

import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square, X, Quote, Bot, User, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '../types';
import type { Skill } from './SkillCabin';
import { SkillCabin } from './SkillCabin';

interface ChatInspectorProps {
  availableSkills: Skill[];
  messages: Message[];
  messagesLoading: boolean;
  isSending: boolean;
  activeSkills: Skill[];
  inputText: string;
  referredText: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (text: string) => void;
  onSend: (text: string, options?: { targetParagraphIds?: string[] }) => void;
  onAbort: () => void;
  onToggleSkill: (skill: Skill) => void;
  onClearReferredText: () => void;
  onToggleSettings: () => void;
}

export function ChatInspector({
  availableSkills,
  messages,
  messagesLoading,
  isSending,
  activeSkills,
  inputText,
  referredText,
  messagesEndRef,
  onInputChange,
  onSend,
  onAbort,
  onToggleSkill,
  onClearReferredText,
  onToggleSettings,
}: ChatInspectorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 输入框自适应高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 44), 160)}px`;
    }
  }, [inputText]);

  // 滚动至最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, messagesEndRef]);

  const canSend = inputText.trim().length > 0 && !isSending;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) {
        onSend(inputText);
        onInputChange('');
      }
    }
  };

  const handleSendAction = () => {
    if (isSending) {
      onAbort();
    } else if (canSend) {
      onSend(inputText);
      onInputChange('');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent relative">
      {/* 顶部控制栏 */}
      <div className="shrink-0 h-[44px] px-4 border-b border-stone-200 bg-transparent flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500 tracking-wider">
          <span>对话</span>
        </div>

        {/* 参数 / 技能设置入口 */}
        <button
          onClick={onToggleSettings}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 text-[12px] font-medium text-stone-700 transition-all hover:bg-stone-50 hover:text-stone-900 active:scale-[0.98]"
          title="打开参数与技能设置"
        >
          <SlidersHorizontal className="h-3 w-3 text-stone-500" />
          <span>参数 / 技能设置</span>
        </button>
      </div>

      {/* 对话流展示区 */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 bg-transparent">
        {messagesLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex space-x-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-stone-300 animate-pulse" />
              <div className="h-1.5 w-1.5 rounded-full bg-stone-300 animate-pulse [animation-delay:150ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-stone-300 animate-pulse [animation-delay:300ms]" />
            </div>
          </div>
        ) : (
          messages
            .filter((m) => m.role !== 'system_note') // 屏蔽非聊天内容
            .map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex items-start gap-3 w-full transition-all duration-300',
                    isUser ? 'justify-end' : 'justify-start'
                  )}
                >
                  {!isUser && (
                    <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 border border-stone-200/60 bg-white text-stone-500 text-[12px]">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}

                  {/* 气泡与排版 */}
                  {isUser ? (
                    <div className="max-w-[85%] text-[13px] leading-relaxed px-3.5 py-2.5 rounded-lg rounded-tr-none bg-white border border-stone-200/60 text-stone-700 font-normal shadow-[0_1px_2px_rgba(0,0,0,0.03)] select-text">
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="flex-1 max-w-[85%] text-[13px] leading-relaxed text-stone-700 select-text pr-4 py-0.5">
                      <div className="whitespace-pre-wrap">{msg.content || '正在雕琢文案，请稍候...'}</div>
                    </div>
                  )}

                  {isUser && (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-[12px] text-stone-700">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              );
            })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 对话输入和控制区 */}
      <div className="shrink-0 bg-white/80 backdrop-blur-md border-t border-stone-200/50 p-4 relative z-20">
        <div className="max-w-xl mx-auto space-y-2">

          {/* 轻量技能条 */}
          <SkillCabin
            availableSkills={availableSkills}
            activeSkills={activeSkills}
            onToggleSkill={onToggleSkill}
          />

          {/* 引用选中文本浮条 */}
          {referredText && (
            <div className="flex items-start justify-between bg-stone-50 border border-stone-200 p-2.5 rounded-lg text-stone-700 text-[12px] shadow-sm animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-start gap-2 min-w-0">
                <Quote className="h-3 w-3 text-stone-500 mt-1 shrink-0 rotate-180" />
                <div className="min-w-0 flex-1">
                  <span className="text-[12px] uppercase font-medium tracking-wider text-stone-500 block mb-0.5">引用段落</span>
                  <p className="line-clamp-2 font-medium leading-relaxed text-stone-700">&quot;{referredText}&quot;</p>
                </div>
              </div>
              <button
                onClick={onClearReferredText}
                className="shrink-0 rounded-full p-0.5 hover:bg-stone-200 text-stone-500 hover:text-stone-700 transition-colors"
                title="清除引用"
                aria-label="清除引用"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* 核心输入框容器 */}
          <div className="relative flex items-end gap-2 rounded-lg border border-transparent bg-stone-100/50 p-1.5 transition-all duration-200 focus-within:border-stone-300 focus-within:bg-white focus-within:shadow-md focus-within:ring-2 focus-within:ring-[#8AA8C7]/30">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeSkills.length > 0
                  ? "使用已选技能，继续追问或优化..."
                  : "输入原文或在此追问细节要求..."
              }
              rows={1}
              className="flex-1 max-h-[160px] min-h-[44px] resize-none bg-transparent px-2.5 py-2.5 text-[13px] leading-relaxed text-stone-700 outline-none placeholder:text-stone-500"
            />

            <button
              onClick={handleSendAction}
              disabled={!isSending && !canSend}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 active:scale-95',
                isSending
                  ? 'bg-stone-800 text-white hover:bg-stone-900'
                  : canSend
                  ? 'bg-[#B4532F] text-white hover:bg-[#A84D2B] shadow-sm shadow-[#D97757]/20'
                  : 'border border-stone-200/20 bg-stone-200/80 text-stone-500'
              )}
              title={isSending ? '中止当前生成' : '发送指令'}
            >
              {isSending ? (
                <Square className="h-3 w-3 fill-current" />
              ) : (
                <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
              )}
            </button>
          </div>

          <div className="flex items-center justify-between px-1 text-[12px] font-medium tracking-wider text-stone-500">
            <span>{isSending ? "正在雕琢，可随时中止" : "Enter 发送 · Shift+Enter 换行"}</span>
            <span>{inputText.length} 字</span>
          </div>
        </div>
      </div>
    </div>
  );
}
