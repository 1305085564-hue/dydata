'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, Grid, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Skill {
  id: string;
  name: string;
  systemPrompt: string;
  description?: string | null;
  defaultModelViewId?: string | null;
  scope: 'platform' | 'private' | 'public_user' | string;
}

interface SkillCabinProps {
  availableSkills: Skill[];
  activeSkills: Skill[];
  onToggleSkill: (skill: Skill) => void;
}

export function SkillCabin({ availableSkills, activeSkills, onToggleSkill }: SkillCabinProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 可见胶囊：已启用技能始终优先显示，再补精选技能，保持单行横向滚动
  const visibleSkills = useMemo(() => {
    const activeIds = new Set(activeSkills.map((s) => s.id));

    // 1. 已启用技能全部前置
    const visible: Skill[] = [...activeSkills];

    // 2. 从非启用技能里按原精选规则补位，最多 4 个
    const remaining = availableSkills.filter((s) => !activeIds.has(s.id));

    const qiangkuangjiaIndex = remaining.findIndex((s) => s.name === '强框架模式');
    if (qiangkuangjiaIndex >= 0) {
      visible.push(remaining.splice(qiangkuangjiaIndex, 1)[0]);
    }

    const qiangyuganIndex = remaining.findIndex((s) => s.name === '强语感模式');
    if (qiangyuganIndex >= 0) {
      visible.push(remaining.splice(qiangyuganIndex, 1)[0]);
    }

    let added = activeSkills.length + (qiangkuangjiaIndex >= 0 ? 1 : 0) + (qiangyuganIndex >= 0 ? 1 : 0);
    while (added < activeSkills.length + 4 && remaining.length > 0) {
      visible.push(remaining.shift()!);
      added++;
    }

    return visible;
  }, [availableSkills, activeSkills]);

  // 按分类对所有技能分组
  const groups = [
    { key: 'platform', label: '平台官方' },
    { key: 'private', label: '个人专属' },
    { key: 'public_user', label: '社区共享' },
  ];

  // 点击外部自动收起面板
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleSelectSkill = (skill: Skill) => {
    onToggleSkill(skill);
    setIsOpen(false); // 选中自动收拢
  };

  return (
    <div className="relative z-30 flex items-center justify-between shrink-0">
      {/* 精选胶囊：左对齐 */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pr-4 max-w-[80%]">
        {visibleSkills.map((skill) => {
          const isActive = activeSkills.some((s) => s.id === skill.id);
          return (
            <button
              key={skill.id}
              onClick={() => onToggleSkill(skill)}
              className={cn(
                'inline-flex shrink-0 min-h-[44px] sm:min-h-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all duration-200 border active:scale-[0.99] active:duration-120 cursor-pointer',
                isActive
                  ? 'bg-[#D97757]/10 border-[#D97757]/20 text-[#D97757] shadow-[0_1px_2px_rgba(0,0,0,0.01)]'
                  : 'bg-white border-[#E5E0D6] text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#1C1917]'
              )}
            >
              <Sparkles className={cn('h-2.5 w-2.5', isActive ? 'text-[#D97757]' : 'text-[#78716C]')} />
              <span>{skill.name}</span>
            </button>
          );
        })}
        {availableSkills.length === 0 && (
          <span className="text-[12px] text-[#78716C]">还没有可用技能</span>
        )}
      </div>

      {/* 展开面板控制按钮：固定在右侧 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'inline-flex shrink-0 min-h-[44px] sm:min-h-0 items-center gap-1 px-2.5 py-1 rounded-md border text-[12px] font-medium transition-all duration-200 active:scale-[0.99] active:duration-120 cursor-pointer',
          isOpen
            ? 'bg-[#E5E0D6]/80 border-[#E5E0D6] text-[#1C1917]'
            : 'bg-white border-[#E5E0D6] text-[#78716C] hover:border-[#E5E0D6] hover:text-[#1C1917] shadow-sm'
        )}
      >
        <Grid className="h-3 w-3" />
        <span>全部技能</span>
      </button>

      {/* 展开态 Overlay Card Grid */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full right-4 mt-1.5 w-[320px] rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/98 backdrop-blur-xl shadow-claude-float p-4 z-50 animate-in fade-in slide-in-from-top-1.5 duration-200"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#ECE7DE]">
            <span className="text-[12px] font-medium text-[#1C1917]">全部技能舱</span>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="关闭技能舱"
              className="p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-full hover:bg-[#F5F3EE] text-[#78716C] hover:text-[#1C1917] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
            {groups.map((group) => {
              const items = availableSkills.filter((s) => (s.scope || 'platform') === group.key);
              if (items.length === 0) return null;
              return (
                <div key={group.key} className="space-y-1">
                  <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#78716C] pl-1.5">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {items.map((skill) => {
                      const isActive = activeSkills.some((s) => s.id === skill.id);
                      return (
                        <button
                          key={skill.id}
                          onClick={() => handleSelectSkill(skill)}
                          className={cn(
                            'group flex min-h-[44px] sm:min-h-0 items-start justify-between rounded-lg px-2.5 py-2 text-left transition-all duration-200 border active:scale-[0.99] active:duration-120 cursor-pointer',
                            isActive
                              ? 'bg-[#D97757]/10 border-[#D97757]/20 text-[#D97757]'
                              : 'bg-white border-[#E5E0D6] text-[#292524] hover:border-[#E5E0D6] hover:bg-[#FBF9F5]/85'
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[12px] font-medium">
                              <Sparkles className={cn('h-3 w-3 shrink-0', isActive ? 'text-[#D97757]' : 'text-[#78716C]')} />
                              <span className="truncate">{skill.name}</span>
                            </div>
                            {skill.description && (
                              <p className={cn(
                                'text-[12px] line-clamp-2 mt-0.5 leading-relaxed',
                                isActive ? 'text-[#D97757]/80' : 'text-[#78716C]'
                              )}>
                                {skill.description}
                              </p>
                            )}
                          </div>
                          {isActive && (
                            <Check className="h-3.5 w-3.5 text-[#D97757] shrink-0 ml-2 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
