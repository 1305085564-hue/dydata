'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputBarProps {
  inputText: string;
  isSending: boolean;
  isChatStage: boolean;
  activeFixedModeName: string | null;
  activeSkills: Array<{ id: string; name: string }>;
  activeMentions: Array<{ id: string; name: string }>;
  availableSkills: Array<{ id: string; name: string }>;
  onInputChange: (text: string) => void;
  onSend: () => void;
  onToggleSkill: (skill: { id: string; name: string }) => void;
  onToggleMention: (mention: { id: string; name: string }) => void;
}

const MOCK_ASSETS = [
  { id: 'asset-1', name: '2026产品参数' },
  { id: 'asset-2', name: '抖音电商违禁词库' },
  { id: 'asset-3', name: '竞品分析数据' },
];

export function ChatInputBar({
  inputText,
  isSending,
  isChatStage,
  activeFixedModeName,
  activeSkills,
  activeMentions,
  availableSkills,
  onInputChange,
  onSend,
  onToggleSkill,
  onToggleMention,
}: ChatInputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSkillPopover, setShowSkillPopover] = useState(false);
  const [showMentionPopover, setShowMentionPopover] = useState(false);
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

  const canSend = inputText.trim() && !isSending;

  // Filter skills and assets for popover
  const filteredSkills = availableSkills.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredAssets = MOCK_ASSETS.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSkillPopover || showMentionPopover) {
      const list = showSkillPopover ? filteredSkills : filteredAssets;
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
          if (showSkillPopover) {
            onToggleSkill(list[selectedIndex]);
            const textBeforeSlash = inputText.slice(0, inputText.lastIndexOf('/'));
            onInputChange(textBeforeSlash);
          } else {
            onToggleMention(list[selectedIndex]);
            const textBeforeAt = inputText.slice(0, inputText.lastIndexOf('@'));
            onInputChange(textBeforeAt);
          }
          setShowSkillPopover(false);
          setShowMentionPopover(false);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSkillPopover(false);
        setShowMentionPopover(false);
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
    
    // Slash or @ command logic
    const lastSlashIndex = val.lastIndexOf('/');
    const lastAtIndex = val.lastIndexOf('@');
    
    // Whichever is latest
    if (lastSlashIndex > lastAtIndex && lastSlashIndex !== -1 && (lastSlashIndex === 0 || val[lastSlashIndex - 1] === ' ' || val[lastSlashIndex - 1] === '\n')) {
      setShowSkillPopover(true);
      setShowMentionPopover(false);
      setSearchQuery(val.slice(lastSlashIndex + 1));
      setSelectedIndex(0);
    } else if (lastAtIndex > lastSlashIndex && lastAtIndex !== -1 && (lastAtIndex === 0 || val[lastAtIndex - 1] === ' ' || val[lastAtIndex - 1] === '\n')) {
      setShowMentionPopover(true);
      setShowSkillPopover(false);
      setSearchQuery(val.slice(lastAtIndex + 1));
      setSelectedIndex(0);
    } else {
      setShowSkillPopover(false);
      setShowMentionPopover(false);
    }
  };

  return (
    <div className="shrink-0 bg-[#FAFAFB] px-4 pb-2 pt-2 relative">
      <div className="mx-auto max-w-3xl relative">
        {/* Active Skills & Mentions Bar */}
        {(activeSkills.length > 0 || activeMentions.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-2 px-1">
            {activeSkills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 shadow-sm"
              >
                <Sparkles className="h-3 w-3 text-[#D97757]" />
                {skill.name}
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
            {activeMentions.map((mention) => (
              <div
                key={mention.id}
                className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/50 px-2.5 py-1 text-[11px] font-medium text-blue-800 shadow-sm"
              >
                <span className="font-mono text-blue-500">@</span>
                {mention.name}
                <button
                  type="button"
                  aria-label={`移除引用 ${mention.name}`}
                  onClick={() => onToggleMention(mention)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100 text-blue-400 hover:text-blue-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Skill / Mention Popover */}
        {(showSkillPopover || showMentionPopover) && (
          <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {showSkillPopover ? '添加技能 (Enter确认)' : '引用品牌资产库 (Enter确认)'}
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {(showSkillPopover ? filteredSkills : filteredAssets).length === 0 ? (
                <div className="px-2 py-3 text-center text-[12px] text-zinc-500">无匹配项</div>
              ) : (
                (showSkillPopover ? filteredSkills : filteredAssets).map((item, idx) => (
                  <button
                    key={item.id}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                      idx === selectedIndex ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50'
                    )}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => {
                      if (showSkillPopover) {
                        onToggleSkill(item);
                        const textBeforeSlash = inputText.slice(0, inputText.lastIndexOf('/'));
                        onInputChange(textBeforeSlash);
                      } else {
                        onToggleMention(item);
                        const textBeforeAt = inputText.slice(0, inputText.lastIndexOf('@'));
                        onInputChange(textBeforeAt);
                      }
                      setShowSkillPopover(false);
                      setShowMentionPopover(false);
                    }}
                  >
                    {showSkillPopover ? (
                      <Sparkles className={cn('h-3.5 w-3.5 shrink-0', idx === selectedIndex ? 'text-[#D97757]' : 'text-zinc-400')} />
                    ) : (
                      <span className={cn('font-mono', idx === selectedIndex ? 'text-blue-500' : 'text-zinc-400')}>@</span>
                    )}
                    <span className="truncate">{item.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div
          className={cn(
            'group relative flex items-end gap-2 rounded-xl border bg-white px-3 py-2.5 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
            'focus-within:border-zinc-950 focus-within:shadow-sm',
            isSending ? 'border-zinc-200' : 'border-zinc-200 hover:border-zinc-300'
          )}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-[14px] leading-[1.7] tracking-[0.005em] text-zinc-800 outline-none placeholder:text-zinc-400',
              isSending && 'cursor-not-allowed opacity-60'
            )}
          />
          <button
            type="button"
            onClick={() => onSend()}
            disabled={!canSend}
            className={cn(
              'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors',
              canSend
                ? 'bg-[#D97757] text-white hover:bg-[#C96442]'
                : 'bg-zinc-100 text-zinc-400'
            )}
            title={canSend ? '发送' : '输入内容后可发送'}
          >
            {isSending ? (
              <span className="flex gap-0.5">
                <span className="h-1 w-1 animate-pulse rounded-full bg-white" style={{ animationDelay: '0ms' }} />
                <span className="h-1 w-1 animate-pulse rounded-full bg-white" style={{ animationDelay: '150ms' }} />
                <span className="h-1 w-1 animate-pulse rounded-full bg-white" style={{ animationDelay: '300ms' }} />
              </span>
            ) : (
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            Enter 发送 · Shift+Enter 换行
          </span>
          <span className="text-[12px] text-zinc-400 font-mono tabular-nums">{inputText.length} 字</span>
        </div>
      </div>
    </div>
  );
}
