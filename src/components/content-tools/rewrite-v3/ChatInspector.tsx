'use client';

import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square, X, Sparkles, Quote, Bot, User, Cpu, History, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BootstrapPayload, Message } from '../types';
import type { Skill } from './SkillCabin';

interface ChatInspectorProps {
  bootstrap: BootstrapPayload | null;
  messages: Message[];
  messagesLoading: boolean;
  isSending: boolean;
  activeSkills: Skill[];
  inputText: string;
  referredText: string | null;
  selectedModelViewId: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (text: string) => void;
  onSend: (text: string, options?: { targetParagraphIds?: string[] }) => void;
  onAbort: () => void;
  onToggleSkill: (skill: Skill) => void;
  onClearReferredText: () => void;
  onModelChange: (id: string) => void;
  onToggleSettings: () => void;
}

export function ChatInspector({
  bootstrap,
  messages,
  messagesLoading,
  isSending,
  activeSkills,
  inputText,
  referredText,
  selectedModelViewId,
  messagesEndRef,
  onInputChange,
  onSend,
  onAbort,
  onToggleSkill,
  onClearReferredText,
  onModelChange,
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
      <div className="shrink-0 h-[44px] px-4 border-b border-zinc-200 bg-transparent flex items-center justify-start gap-3.5">
        {/* 模型选择器 */}
        {bootstrap && (
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-zinc-400" />
            <select
              aria-label="选择模型"
              value={selectedModelViewId}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={isSending}
              className="h-6.5 rounded-lg border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-700 outline-none hover:border-zinc-300 disabled:opacity-50 transition-all shadow-sm"
            >
              <option value="">自动推荐模型</option>
              {bootstrap.modelViews.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 创意配置抽屉呼出按钮 */}
        <button
          onClick={onToggleSettings}
          className="p-1 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/50 transition-colors"
          title="技能管理与参数配置"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 对话流展示区 */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 bg-transparent">
        {messagesLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex space-x-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse" />
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse [animation-delay:150ms]" />
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse [animation-delay:300ms]" />
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
                    <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 border border-zinc-200/60 bg-white text-zinc-500 text-[10px]">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}

                  {/* 气泡与排版 */}
                  {isUser ? (
                    <div className="max-w-[85%] text-[13px] leading-relaxed px-3.5 py-2.5 rounded-lg rounded-tr-none bg-white border border-zinc-200/60 text-zinc-800 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.03)] select-text">
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="flex-1 max-w-[85%] text-[13px] leading-relaxed text-zinc-800 select-text pr-4 py-0.5">
                      <div className="whitespace-pre-wrap">{msg.content || '正在雕琢文案，请稍候...'}</div>
                    </div>
                  )}

                  {isUser && (
                    <div className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 border border-zinc-300 bg-white text-zinc-650 text-[10px]">
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
      <div className="shrink-0 bg-white/80 backdrop-blur-md border-t border-zinc-200/50 p-4 relative z-20">
        <div className="max-w-xl mx-auto space-y-2">

          {/* 已激活技能胶囊栏 */}
          {activeSkills.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {activeSkills.map((skill) => (
                <span
                  key={skill.id}
                  className="inline-flex items-center gap-1.5 bg-[#8AA8C7]/10 border border-[#8AA8C7]/20 px-2 py-0.5 rounded-full text-[10px] font-bold text-[#4c6785]"
                >
                  <Sparkles className="h-2.5 w-2.5 text-[#8AA8C7] animate-pulse" />
                  <span>{skill.name}</span>
                  <button
                    onClick={() => onToggleSkill(skill)}
                    className="hover:bg-[#8AA8C7]/20 rounded-full p-0.5 ml-0.5 text-[#8AA8C7]"
                    title="移出此技能"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 引用选中文本浮条 */}
          {referredText && (
            <div className="flex items-start justify-between bg-zinc-50 border border-zinc-200 p-2.5 rounded-lg text-zinc-700 text-[11.5px] shadow-sm animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-start gap-2 min-w-0">
                <Quote className="h-3 w-3 text-zinc-400 mt-1 shrink-0 rotate-180" />
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 block mb-0.5">引用段落</span>
                  <p className="line-clamp-2 text-zinc-650 font-semibold leading-relaxed">&quot;{referredText}&quot;</p>
                </div>
              </div>
              <button
                onClick={onClearReferredText}
                className="shrink-0 rounded-full p-0.5 hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors"
                title="清除引用"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* 核心输入框容器 */}
          <div className="relative flex items-end gap-2 border border-transparent rounded-lg bg-zinc-150/50 p-1.5 focus-within:bg-white focus-within:border-zinc-250 focus-within:shadow-md focus-within:ring-2 focus-within:ring-[#8AA8C7]/30 transition-all duration-200">
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
              className="flex-1 max-h-[160px] min-h-[44px] resize-none bg-transparent px-2.5 py-2.5 text-[13px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-450"
            />

            <button
              onClick={handleSendAction}
              disabled={!isSending && !canSend}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 active:scale-95',
                isSending
                  ? 'bg-zinc-800 text-white hover:bg-zinc-900'
                  : canSend
                  ? 'bg-[#D97757] text-white hover:bg-[#C96442] shadow-sm shadow-[#D97757]/20'
                  : 'bg-zinc-200/80 text-zinc-400 border border-zinc-250/20'
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

          <div className="flex items-center justify-between px-1 text-[9.5px] font-bold text-zinc-450 font-mono tracking-wider">
            <span>{isSending ? "正在雕琢，可随时中止" : "Enter 发送 · Shift+Enter 换行"}</span>
            <span>{inputText.length} 字</span>
          </div>
        </div>
      </div>
    </div>
  );
}
