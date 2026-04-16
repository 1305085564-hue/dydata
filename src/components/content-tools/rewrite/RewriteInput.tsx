import React, { useEffect, useRef } from 'react';
import { Lock, SlidersHorizontal, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BootstrapPayload } from '../types';

interface RewriteInputProps {
  bootstrap: BootstrapPayload;
  isChatStage: boolean;
  activeFixedMode: BootstrapPayload['fixedModes'][0] | null;
  customControlsLocked: boolean;
  interactionControlsDisabled: boolean;
  
  selectedFixedModeId: string | null;
  selectedModelViewId: string;
  selectedModeId: string | null;
  selectedLengthId: string;
  
  inputText: string;
  isSending: boolean;
  
  onToggleFixedMode: (id: string) => void;
  onModelViewChange: (id: string) => void;
  onModeChange: (id: string | null) => void;
  onLengthChange: (id: string) => void;
  onInputChange: (text: string) => void;
  onSend: (text?: string) => void;
}

export function RewriteInput({
  bootstrap,
  isChatStage,
  activeFixedMode,
  customControlsLocked,
  interactionControlsDisabled,
  selectedFixedModeId,
  selectedModelViewId,
  selectedModeId,
  selectedLengthId,
  inputText,
  isSending,
  onToggleFixedMode,
  onModelViewChange,
  onModeChange,
  onLengthChange,
  onInputChange,
  onSend,
}: RewriteInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 128), 500)}px`;
    }
  }, [inputText]);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              {isChatStage ? '继续对话' : '首条默认走结果模式'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {isChatStage
                ? '从第二轮开始固定是聊天回复，但你仍然可以重新点强框架、强语感、模型、普通模式和字数，再继续聊。'
                : '首条消息默认只出 1 个主版本。选中固定套餐时，会锁定后台绑定的模型、提示词和字数。'}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">选择改写套餐</p>
            <div className="grid gap-3">
              {bootstrap.fixedModes.map((fixedMode, index) => {
                const active = fixedMode.id === selectedFixedModeId;
                const palette =
                  index === 0
                    ? {
                        active: 'border-sky-300 bg-gradient-to-br from-sky-50 to-white text-sky-900 shadow-sm',
                        badge: 'bg-sky-100 text-sky-700',
                        dot: 'bg-sky-500',
                      }
                    : {
                        active: 'border-rose-300 bg-gradient-to-br from-rose-50 to-white text-rose-900 shadow-sm',
                        badge: 'bg-rose-100 text-rose-700',
                        dot: 'bg-rose-500',
                      };

                return (
                  <button
                    key={fixedMode.id}
                    type="button"
                    onClick={() => onToggleFixedMode(fixedMode.id)}
                    disabled={interactionControlsDisabled}
                    className={cn(
                      'rounded-2xl border px-5 py-4 text-left transition',
                      interactionControlsDisabled
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : active
                          ? palette.active
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', active ? palette.dot : 'bg-slate-300')} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-bold">{fixedMode.name}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', active ? palette.badge : 'bg-white text-slate-500')}>
                            固定套餐
                          </span>
                        </div>
                        <p className={cn('mt-1.5 text-[12px] leading-relaxed', active ? 'text-current/75' : 'text-slate-500')}>
                          {fixedMode.description || '后台会固定绑定模型与提示词。'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
              <SlidersHorizontal className="h-4 w-4" />
              普通自定义区
            </div>
            
            {isChatStage ? (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[12px] leading-relaxed text-sky-900">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>第二轮起固定进入正常聊天模式：当前已重置为聊天默认值，但你仍可重新指定各项参数。</span>
              </div>
            ) : customControlsLocked ? (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-800">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{activeFixedMode?.name} 已锁定普通模型、普通模式和字数配置。取消按钮选择后恢复自定义。</span>
              </div>
            ) : null}

            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">展示模型</span>
                <select
                  value={selectedModelViewId}
                  onChange={(e) => onModelViewChange(e.target.value)}
                  disabled={customControlsLocked}
                  className={cn(
                    'w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition',
                    customControlsLocked
                      ? 'cursor-not-allowed border-slate-200 text-slate-400'
                      : 'border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-400',
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
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">普通模式</span>
                <select
                  value={selectedModeId || ''}
                  onChange={(e) => onModeChange(e.target.value || null)}
                  disabled={customControlsLocked}
                  className={cn(
                    'w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition',
                    customControlsLocked
                      ? 'cursor-not-allowed border-slate-200 text-slate-400'
                      : 'border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-400',
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
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">字数</span>
                <select
                  value={selectedLengthId}
                  onChange={(e) => onLengthChange(e.target.value)}
                  disabled={customControlsLocked}
                  className={cn(
                    'w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition',
                    customControlsLocked
                      ? 'cursor-not-allowed border-slate-200 text-slate-400'
                      : 'border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-400',
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
        </div>
      </div>

      <div className="border-t border-slate-200 bg-background p-4">
        <div className="relative rounded-2xl border border-slate-200 bg-slate-50 p-1 focus-within:border-blue-400 focus-within:bg-background focus-within:ring-1 focus-within:ring-blue-400 transition-all">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSend();
              }
            }}
            disabled={isSending}
            placeholder={
              isChatStage
                ? '继续追问、补充要求或微调...'
                : activeFixedMode
                  ? `请输入原文，按“${activeFixedMode.name}”改写...`
                  : '请输入原文开始改写...'
            }
            className={cn(
              'min-h-[120px] w-full resize-none bg-transparent px-3 py-3 text-[14px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400',
              isSending && 'cursor-not-allowed opacity-60'
            )}
          />
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            <span className="text-[11px] text-slate-400">
              Enter 发送，Shift+Enter 换行 • {inputText.length} 字
            </span>
            <button
              type="button"
              onClick={() => onSend()}
              disabled={!inputText.trim() || isSending}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                !inputText.trim() || isSending
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                  : 'bg-slate-900 text-white hover:bg-slate-800 motion-reduce:transition-none'
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isSending ? '发送中' : '改写'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
