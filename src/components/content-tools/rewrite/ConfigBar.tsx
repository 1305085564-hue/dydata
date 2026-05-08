'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, SlidersHorizontal, Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BootstrapPayload } from '../types';

interface ConfigBarProps {
  bootstrap: BootstrapPayload;
  isChatStage: boolean;
  activeFixedMode: BootstrapPayload['fixedModes'][0] | null;
  customControlsLocked: boolean;
  interactionControlsDisabled: boolean;
  selectedFixedModeId: string | null;
  selectedModelViewId: string;
  selectedModeId: string | null;
  selectedLengthId: string;
  onToggleFixedMode: (id: string) => void;
  onModelViewChange: (id: string) => void;
  onModeChange: (id: string | null) => void;
  onLengthChange: (id: string) => void;
}

export function ConfigBar({
  bootstrap,
  isChatStage,
  activeFixedMode,
  customControlsLocked,
  interactionControlsDisabled,
  selectedFixedModeId,
  selectedModelViewId,
  selectedModeId,
  selectedLengthId,
  onToggleFixedMode,
  onModelViewChange,
  onModeChange,
  onLengthChange,
}: ConfigBarProps) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const modelLabel = bootstrap.modelViews.find((m) => m.id === selectedModelViewId)?.label ?? '默认模型';
  const modeLabel = bootstrap.modes.find((m) => m.id === selectedModeId)?.name ?? '无附加模式';
  const lengthLabel = bootstrap.lengthPresets.find((l) => l.id === selectedLengthId)?.name ?? '默认字数';

  useEffect(() => {
    if (!expanded) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  return (
    <div ref={containerRef} className="relative shrink-0 border-b border-zinc-200 bg-white">
      {/* 摘要条 — 始终显示 */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {activeFixedMode ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-950 px-2 py-1 text-[11px] font-semibold text-white">
                {activeFixedMode.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-600">
                自定义
              </span>
            )}
            <span className="text-zinc-300">·</span>
            <span className="text-[11px] text-zinc-500">{modelLabel}</span>
            <span className="text-zinc-300">·</span>
            <span className="text-[11px] text-zinc-500">{modeLabel}</span>
            <span className="text-zinc-300">·</span>
            <span className="text-[11px] text-zinc-500">{lengthLabel}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900',
            expanded && 'bg-zinc-100 text-zinc-900'
          )}
        >
          <SlidersHorizontal className="h-3 w-3" />
          配置
          <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {/* 弹出配置面板 — 右上角浮层 */}
      {expanded && (
        <div className="absolute right-3 top-full z-50 mt-1 w-[440px] rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg">
          <div className="space-y-5">
            {/* 固定套餐 */}
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">改写套餐</p>
              <div className="grid grid-cols-2 gap-2">
                {bootstrap.fixedModes.map((fixedMode) => {
                  const active = fixedMode.id === selectedFixedModeId;
                  return (
                    <button
                      key={fixedMode.id}
                      type="button"
                      onClick={() => onToggleFixedMode(fixedMode.id)}
                      disabled={interactionControlsDisabled}
                      className={cn(
                        'relative rounded-xl border px-4 py-3 text-left transition',
                        interactionControlsDisabled && 'cursor-not-allowed opacity-50',
                        active
                          ? 'border-zinc-900 bg-zinc-950 text-white'
                          : 'border-zinc-200 bg-white hover:border-zinc-300'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                        <span className={cn('text-[13px] font-semibold', active ? 'text-white' : 'text-zinc-900')}>
                          {fixedMode.name}
                        </span>
                      </div>
                      <p className={cn('mt-1 text-[11px] leading-relaxed', active ? 'text-zinc-300' : 'text-zinc-500')}>
                        {fixedMode.description || '后台固定绑定模型与提示词'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 自定义区 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">自定义参数</p>
                {customControlsLocked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    <Lock className="h-2.5 w-2.5" />
                    已锁定
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-500">展示模型</span>
                  <select
                    value={selectedModelViewId}
                    onChange={(e) => onModelViewChange(e.target.value)}
                    disabled={customControlsLocked}
                    className={cn(
                      'w-full rounded-xl border bg-white px-3 py-2 text-[13px] outline-none transition',
                      customControlsLocked
                        ? 'cursor-not-allowed border-zinc-100 text-zinc-400'
                        : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 focus:border-zinc-900'
                    )}
                  >
                    <option value="">无附加模型</option>
                    {bootstrap.modelViews.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-500">普通模式</span>
                  <select
                    value={selectedModeId || ''}
                    onChange={(e) => onModeChange(e.target.value || null)}
                    disabled={customControlsLocked}
                    className={cn(
                      'w-full rounded-xl border bg-white px-3 py-2 text-[13px] outline-none transition',
                      customControlsLocked
                        ? 'cursor-not-allowed border-zinc-100 text-zinc-400'
                        : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 focus:border-zinc-900'
                    )}
                  >
                    <option value="">无附加模式</option>
                    {bootstrap.modes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-500">字数</span>
                  <select
                    value={selectedLengthId}
                    onChange={(e) => onLengthChange(e.target.value)}
                    disabled={customControlsLocked}
                    className={cn(
                      'w-full rounded-xl border bg-white px-3 py-2 text-[13px] outline-none transition',
                      customControlsLocked
                        ? 'cursor-not-allowed border-zinc-100 text-zinc-400'
                        : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 focus:border-zinc-900'
                    )}
                  >
                    {bootstrap.lengthPresets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {isChatStage && (
              <p className="text-[11px] text-zinc-400">
                已进入对话模式，可随时调整配置继续对话。
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
