'use client';

import React from 'react';
import { Lock, X } from 'lucide-react';
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
  onClose?: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
        {children}
      </span>
      <div className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}

export function ConfigBar({
  bootstrap,
  isChatStage,
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
  onClose,
}: ConfigBarProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            工作区
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="active:translate-y-0 inline-flex h-6 w-6 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-5">
          {/* Fixed modes */}
          <div className="space-y-2.5">
            <SectionLabel>改写套餐</SectionLabel>
            <div className="space-y-1.5">
              {bootstrap.fixedModes.map((fixedMode) => {
                const active = fixedMode.id === selectedFixedModeId;
                return (
                  <button
                    key={fixedMode.id}
                    type="button"
                    onClick={() => onToggleFixedMode(fixedMode.id)}
                    disabled={interactionControlsDisabled}
                    className={cn(
                      'group relative w-full overflow-hidden rounded-lg border p-3 text-left transition-colors',
                      interactionControlsDisabled && 'cursor-not-allowed opacity-50',
                      active
                        ? 'border-[#D97757] bg-zinc-100'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-100'
                    )}
                  >
                    {active && (
                      <div className="absolute left-0 top-0 h-full w-[2px] bg-[#D97757]" />
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-zinc-800">
                        {fixedMode.name}
                      </span>
                      {active && (
                        <span className="inline-flex h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] leading-[1.7] text-zinc-500">
                      {fixedMode.description || '后台固定绑定模型与提示词'}
                    </p>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => selectedFixedModeId && onToggleFixedMode(selectedFixedModeId)}
                disabled={interactionControlsDisabled || !selectedFixedModeId}
                className={cn(
                  'w-full rounded-lg border border-dashed px-3 py-2 text-[11px] font-medium transition-colors',
                  !selectedFixedModeId
                    ? 'border-zinc-300 bg-zinc-50 text-zinc-500'
                    : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
                )}
              >
                {selectedFixedModeId ? '切回自定义' : '当前已是自定义'}
              </button>
            </div>
          </div>

          {/* Custom params */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
                自定义
              </span>
              <div className="h-px flex-1 bg-zinc-200" />
              {customControlsLocked && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-1.5 py-0.5 text-[12px] font-medium text-zinc-500 ring-1 ring-zinc-200">
                  <Lock className="h-2.5 w-2.5" />
                  已锁定
                </span>
              )}
            </div>

            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium text-zinc-500">真实模型</span>
                <select
                  value={selectedModelViewId}
                  onChange={(e) => onModelViewChange(e.target.value)}
                  disabled={customControlsLocked}
                  className={cn(
                    'w-full rounded-lg border bg-white px-3 py-2 text-[13px] outline-none transition',
                    customControlsLocked
                      ? 'cursor-not-allowed border-zinc-100 text-zinc-400'
                      : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 focus-visible:ring-1 focus-visible:ring-zinc-950/5'
                  )}
                >
                  <option value="">默认真实模型</option>
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
                    'w-full rounded-lg border bg-white px-3 py-2 text-[13px] outline-none transition',
                    customControlsLocked
                      ? 'cursor-not-allowed border-zinc-100 text-zinc-400'
                      : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 focus-visible:ring-1 focus-visible:ring-zinc-950/5'
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
                    'w-full rounded-lg border bg-white px-3 py-2 text-[13px] outline-none transition',
                    customControlsLocked
                      ? 'cursor-not-allowed border-zinc-100 text-zinc-400'
                      : 'border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100 focus-visible:ring-1 focus-visible:ring-zinc-950/5'
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
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                会话状态
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                已进入对话模式。切换配置会应用到下一轮回复，不影响历史。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
