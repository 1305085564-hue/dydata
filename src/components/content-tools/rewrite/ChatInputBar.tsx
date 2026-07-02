'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square, X, Sparkles, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RewriteSkillScope = 'platform' | 'private' | 'public_user';

export type RewriteSkillSummary = {
  id: string;
  name: string;
  scope?: RewriteSkillScope;
  defaultModelViewId?: string | null;
};

interface ChatInputBarProps {
  inputText: string;
  isSending: boolean;
  isChatStage: boolean;
  activeFixedModeName: string | null;
  onInputChange: (text: string) => void;
  onSend: () => void;
  onAbort: () => void;
  onToggleSkill: (skill: RewriteSkillSummary) => void;
  activeSkills: RewriteSkillSummary[];
  availableSkills: RewriteSkillSummary[];
  referredText?: string | null;
  onClearReferredText?: () => void;
}



const SKILL_GROUPS: Array<{ scope: RewriteSkillScope; label: string }> = [
  { scope: 'platform', label: '平台技能' },
  { scope: 'private', label: '个人技能' },
  { scope: 'public_user', label: '共享技能' },
];

export function ChatInputBar({
  inputText,
  isSending,
  isChatStage,
  activeFixedModeName,
  activeSkills,
  availableSkills,
  referredText,
  onClearReferredText,
  onInputChange,
  onSend,
  onAbort,
  onToggleSkill,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSkillPopover, setShowSkillPopover] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  const canSend = Boolean(inputText.trim()) && !isSending;

  // Filter skills and assets for popover
  const filteredSkills = availableSkills.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const groupedSkills = SKILL_GROUPS.map((group) => ({
    ...group,
    items: filteredSkills.filter((skill) => (skill.scope ?? 'platform') === group.scope),
  })).filter((group) => group.items.length > 0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSkillPopover) {
      const list = filteredSkills;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, list.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (list[selectedIndex]) {
          onToggleSkill(list[selectedIndex]);
          const textBeforeSlash = inputText.slice(0, inputText.lastIndexOf('/'));
          onInputChange(textBeforeSlash);
          setShowSkillPopover(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSkillPopover(false);
        return;
      }
    } else {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        if (canSend) onSend();
      }
    }
  };

  const handleInputChange = (val: string) => {
    onInputChange(val);
    
    // Slash command logic
    const lastSlashIndex = val.lastIndexOf('/');
    
    if (lastSlashIndex !== -1 && (lastSlashIndex === 0 || val[lastSlashIndex - 1] === ' ' || val[lastSlashIndex - 1] === '\n')) {
      setShowSkillPopover(true);
      setSearchQuery(val.slice(lastSlashIndex + 1));
      setSelectedIndex(0);
    } else {
      setShowSkillPopover(false);
    }
  };

  return (
    <div className="shrink-0 bg-transparent px-4 pb-6 pt-2 relative z-20">
      <div className="mx-auto max-w-3xl relative">
        {/* Active Skills Bar */}
        {activeSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 px-1">
            {activeSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/95 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all"
              >
                <Sparkles className="h-3 w-3 text-[#8AA8C7]" />
                <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">已激活</span>
                <span>{skill.name}</span>
                <button
                  type="button"
                  aria-label={`移除技能 ${skill.name}`}
                  onClick={() => onToggleSkill(skill)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Referenced Text Bar (ChatGPT style) */}
        {referredText && (
          <div className="flex items-start justify-between gap-3 border border-zinc-200 bg-zinc-100/90 hover:bg-zinc-150 px-3 py-2 rounded-lg text-zinc-700 text-[12.5px] shadow-[0_1px_2px_rgba(0,0,0,0.02)] mb-2.5 animate-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-start gap-2.5 min-w-0">
              <Quote className="h-3.5 w-3.5 text-zinc-400 mt-1 shrink-0 rotate-180" />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block mb-0.5">引用选中文本</span>
                <p className="line-clamp-2 text-zinc-600 font-medium leading-relaxed">&quot;{referredText}&quot;</p>
              </div>
            </div>
            {onClearReferredText && (
              <button
                type="button"
                onClick={onClearReferredText}
                className="shrink-0 rounded-full p-1 hover:bg-zinc-200/80 text-zinc-400 hover:text-zinc-600 transition-colors mt-0.5"
                title="清除引用"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Skill Popover */}
        {showSkillPopover && (
          <div className="absolute bottom-full left-0 mb-3 w-64 rounded-lg border border-white/20 bg-white/85 backdrop-blur-xl p-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              添加技能 (Enter确认)
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {filteredSkills.length === 0 ? (
                <div className="px-2 py-3 text-center text-[12px] text-zinc-500">无匹配项</div>
              ) : (
                <div className="space-y-1">
                  {groupedSkills.map((group) => (
                    <div key={group.scope}>
                      <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold tracking-[0.18em] text-zinc-400">
                        {group.label}
                      </div>
                      {group.items.map((item) => {
                        const idx = filteredSkills.findIndex((skill) => skill.id === item.id);
                        const active = activeSkills.some((skill) => skill.id === item.id);
                        return (
                          <button
                            key={item.id}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors',
                              idx === selectedIndex ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50'
                            )}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onClick={() => {
                              onToggleSkill(item);
                              const textBeforeSlash = inputText.slice(0, inputText.lastIndexOf('/'));
                              onInputChange(textBeforeSlash);
                              setShowSkillPopover(false);
                            }}
                          >
                            <Sparkles className={cn('h-3.5 w-3.5 shrink-0', idx === selectedIndex ? 'text-[#D97757]' : 'text-zinc-400')} />
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                            {active && <span className="text-[10px] font-medium text-[#4F7F5E]">已激活</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className={cn(
            'group relative flex items-end gap-2 rounded-lg border transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
            'focus-within:border-zinc-300 focus-within:bg-white focus-within:shadow-sm focus-within:-translate-y-[1px]',
            isSending
              ? 'border-zinc-200 bg-zinc-100/50'
              : 'border-transparent bg-zinc-100/70 hover:bg-zinc-100/90 hover:border-zinc-200/30'
          )}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-[14px] leading-[1.7] tracking-[0.005em] text-zinc-800 outline-none placeholder:text-zinc-400'
            )}
          />
          <button
            type="button"
            onClick={() => {
              if (isSending) {
                onAbort();
                return;
              }
              onSend();
            }}
            disabled={!isSending && !canSend}
            className={cn(
              'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-[background-color,transform,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
              isSending
                ? 'bg-zinc-800 text-white shadow-[0_2px_8px_rgba(39,39,42,0.22)] hover:bg-zinc-700 active:scale-[0.98]'
                : canSend
                ? 'bg-[#D97757] text-white hover:bg-[#C96442] shadow-[0_2px_8px_rgba(217,119,87,0.3)] active:scale-[0.98]'
                : 'bg-zinc-100 text-zinc-400'
            )}
            title={isSending ? '停止生成' : canSend ? '发送' : '输入内容后可发送'}
          >
            {isSending ? (
              <Square className="h-3.5 w-3.5 fill-current" strokeWidth={2} />
            ) : (
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            {isSending ? '可继续输入 · 点方块停止当前生成' : 'Enter 发送 · Shift+Enter 换行'}
          </span>
          <span className="text-[12px] text-zinc-400 font-mono tabular-nums">{inputText.length} 字</span>
        </div>
      </div>
    </div>
  );
}
