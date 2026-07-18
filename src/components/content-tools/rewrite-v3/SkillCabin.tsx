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
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-all duration-200 border active:scale-[0.98]',
                isActive
                  ? 'bg-[#5F82A8]/15 border-[#5F82A8]/30 text-[#4c6785] shadow-[0_1px_2px_rgba(0,0,0,0.01)]'
                  : 'bg-white border-stone-200/60 text-stone-500 hover:bg-stone-100 hover:text-stone-900'
              )}
            >
              <Sparkles className={cn('h-2.5 w-2.5', isActive ? 'text-[#5F82A8]' : 'text-stone-500')} />
              <span>{skill.name}</span>
            </button>
          );
        })}
        {availableSkills.length === 0 && (
          <span className="text-[12px] text-stone-500 italic">暂无可用技能</span>
        )}
      </div>

      {/* 展开面板控制按钮：固定在右侧 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-md border text-[12px] font-medium transition-all duration-200 active:scale-[0.98]',
          isOpen
            ? 'bg-stone-200/80 border-stone-300 text-stone-900'
            : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-900 shadow-sm'
        )}
      >
        <Grid className="h-3 w-3" />
        <span>全部技能</span>
      </button>

      {/* 展开态 Overlay Card Grid */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full right-4 mt-1.5 w-[320px] rounded-lg border border-stone-200/50 bg-white/95 backdrop-blur-xl shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-1.5 duration-200"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100">
            <span className="text-[12px] font-medium text-stone-900">全部技能舱</span>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="关闭技能舱"
              className="p-1 rounded-full hover:bg-stone-100 text-stone-500 hover:text-stone-700"
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
                  <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-stone-500 pl-1.5">
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
                            'group flex items-start justify-between rounded-lg px-2.5 py-2 text-left transition-all duration-200 border active:scale-[0.98]',
                            isActive
                              ? 'bg-[#5F82A8]/15 border-[#5F82A8]/30 text-[#4c6785]'
                              : 'bg-white border-stone-200/50 text-stone-700 hover:border-stone-300 hover:bg-stone-50/85'
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[12px] font-medium">
                              <Sparkles className={cn('h-3 w-3 shrink-0', isActive ? 'text-[#5F82A8]' : 'text-stone-500')} />
                              <span className="truncate">{skill.name}</span>
                            </div>
                            {skill.description && (
                              <p className={cn(
                                'text-[12px] line-clamp-2 mt-0.5 leading-relaxed',
                                isActive ? 'text-[#587391]/80' : 'text-stone-500'
                              )}>
                                {skill.description}
                              </p>
                            )}
                          </div>
                          {isActive && (
                            <Check className="h-3.5 w-3.5 text-[#5F82A8] shrink-0 ml-2 mt-0.5" />
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
