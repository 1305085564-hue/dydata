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
            <h2 className="text-[24px] font-medium tracking-tight text-stone-900">
              {isChatStage ? '继续对话' : '首条默认走结果模式'}
            </h2>
            <p className="mt-2 text-[13px] leading-[1.7] text-stone-500">
              {isChatStage
                ? '从第二轮开始固定是聊天回复，但你仍然可以重新点强框架、强语感、模型、普通模式和字数，再继续聊。'
                : '首条消息默认只出 1 个主版本。选中固定套餐时，会锁定后台绑定的模型、提示词和字数。'}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">选择改写套餐</p>
            <div className="grid gap-3">
              {bootstrap.fixedModes.map((fixedMode) => {
                const active = fixedMode.id === selectedFixedModeId;
                return (
                  <button
                    key={fixedMode.id}
                    type="button"
                    onClick={() => onToggleFixedMode(fixedMode.id)}
                    disabled={interactionControlsDisabled}
                    className={cn(
                      'rounded-lg border px-5 py-4 text-left transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
                      interactionControlsDisabled
                        ? 'cursor-not-allowed border-stone-200 bg-stone-50 text-stone-500'
                        : active
                          ? 'border-stone-300 bg-white text-stone-900 shadow-sm ring-1 ring-stone-950/5'
                          : 'border-stone-200 bg-stone-50 hover:border-stone-300 hover:bg-white',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn('mt-1.5 shrink-0 rounded-full', active ? 'h-2 w-2 bg-[#D97757] ring-1 ring-white' : 'h-1.5 w-1.5 bg-stone-200')} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium">{fixedMode.name}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-stone-200', active ? 'bg-stone-50 text-[#D97757]' : 'bg-white text-stone-500')}>
                            固定套餐
                          </span>
                        </div>
                        <p className={cn('mt-1.5 text-[12px] leading-[1.7]', active ? 'text-stone-500' : 'text-stone-500')}>
                          {fixedMode.description || '后台会固定绑定模型与提示词。'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="mb-4 flex items-center gap-2 text-[13px] font-medium text-stone-900">
              <SlidersHorizontal className="h-4 w-4" />
              普通自定义区
            </div>

            {isChatStage ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-[12px] leading-[1.7] text-stone-500">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#8AA8C7] ring-1 ring-white" />
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-500" />
                <span>第二轮起固定进入正常聊天模式：当前已重置为聊天默认值，但你仍可重新指定各项参数。</span>
              </div>
            ) : customControlsLocked ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-[12px] leading-[1.7] text-stone-500">
                <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-[#D97757] ring-1 ring-white" />
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-500" />
                <span>{activeFixedMode?.name} 已锁定普通模型、普通模式和字数配置。取消按钮选择后恢复自定义。</span>
              </div>
            ) : null}

            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">真实模型</span>
                <select
                  value={selectedModelViewId}
                  onChange={(e) => onModelViewChange(e.target.value)}
                  disabled={customControlsLocked}
                  className={cn(
                    'w-full rounded-lg border bg-white px-3 py-2 text-[13px] outline-none transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    customControlsLocked
                      ? 'cursor-not-allowed border-stone-200 text-stone-500'
                      : 'border-stone-200 text-stone-900 focus-visible:ring-1 focus-visible:ring-stone-950/5',
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
                <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">普通模式</span>
                <select
                  value={selectedModeId || ''}
                  onChange={(e) => onModeChange(e.target.value || null)}
                  disabled={customControlsLocked}
                  className={cn(
                    'w-full rounded-lg border bg-white px-3 py-2 text-[13px] outline-none transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    customControlsLocked
                      ? 'cursor-not-allowed border-stone-200 text-stone-500'
                      : 'border-stone-200 text-stone-900 focus-visible:ring-1 focus-visible:ring-stone-950/5',
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
                <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">字数</span>
                <select
                  value={selectedLengthId}
                  onChange={(e) => onLengthChange(e.target.value)}
                  disabled={customControlsLocked}
                  className={cn(
                    'w-full rounded-lg border bg-white px-3 py-2 text-[13px] outline-none transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    customControlsLocked
                      ? 'cursor-not-allowed border-stone-200 text-stone-500'
                      : 'border-stone-200 text-stone-900 focus-visible:ring-1 focus-visible:ring-stone-950/5',
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

      <div className="border-t border-stone-200 bg-white p-4">
        <div className="relative rounded-lg border border-stone-200 bg-stone-50 p-1 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-within:border-stone-300 focus-within:bg-white focus-within:ring-1 focus-within:ring-stone-950/5">
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
              'min-h-[120px] w-full resize-none bg-transparent px-3 py-3 text-[13px] leading-[1.7] text-stone-900 outline-none placeholder:text-stone-500',
              isSending && 'cursor-not-allowed opacity-60'
            )}
          />
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            <span className="text-[12px] text-stone-500">
              Enter 发送，Shift+Enter 换行 • {inputText.length} 字
            </span>
            <button
              type="button"
              onClick={() => onSend()}
              disabled={!inputText.trim() || isSending}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
                !inputText.trim() || isSending
                  ? 'cursor-not-allowed bg-stone-100 text-stone-500'
                  : 'bg-[#D97757] text-white hover:-translate-y-[1px] hover:bg-[#C96442] active:translate-y-0 motion-reduce:transition-none'
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
