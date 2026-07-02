'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PanelLeftClose, PanelLeft, Plus, Sliders, Layout } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRewriteLogic } from './useRewriteLogic';
import { RewriteHistory } from './RewriteHistory';
import { InstructionFeed } from './InstructionFeed';
import { PolishedDocumentCanvas } from './PolishedDocumentCanvas';
import { ChatInputBar } from './ChatInputBar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Conversation } from '../types';

const STORAGE_KEY_HISTORY = 'rewrite-history-default-open';

function getStoredDefault(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

function setStoredDefault(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}

function getStoredSplitRatio() {
  if (typeof window === 'undefined') return 40;
  const savedRatio = window.localStorage.getItem('dydata-rewrite-split-ratio');
  if (!savedRatio) return 40;
  const parsed = parseFloat(savedRatio);
  return parsed >= 30 && parsed <= 60 ? parsed : 40;
}

function getConversationTag(conversation: Conversation) {
  if (conversation.selected.fixedMode) return conversation.selected.fixedMode.name;
  if (conversation.selected.mode) return conversation.selected.mode.name;
  return '普通自定义';
}

export function RewriteWorkbench() {
  const { state, actions } = useRewriteLogic();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPinned, setHistoryPinned] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidthPercent, setLeftWidthPercent] = useState(getStoredSplitRatio);
  const [isResizing, setIsResizing] = useState(false);
  const leftWidthPercentRef = useRef(leftWidthPercent);

  useEffect(() => {
    leftWidthPercentRef.current = leftWidthPercent;
  }, [leftWidthPercent]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setLeftWidthPercent(40);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('dydata-rewrite-split-ratio');
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      const percent = (relativeX / containerRect.width) * 100;
      const boundedPercent = Math.max(30, Math.min(60, percent));
      setLeftWidthPercent(boundedPercent);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('dydata-rewrite-split-ratio', leftWidthPercentRef.current.toFixed(2));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const historyDefault = getStoredDefault(STORAGE_KEY_HISTORY, false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistoryOpen(historyDefault);
    setHistoryPinned(historyDefault);
  }, []);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((v) => !v);
  }, []);

  const handleHistoryPin = useCallback((pinned: boolean) => {
    setHistoryPinned(pinned);
    setHistoryOpen(pinned);
    setStoredDefault(STORAGE_KEY_HISTORY, pinned);
  }, []);

  if (state.errorState) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50">
        <div className="relative max-w-sm overflow-hidden rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="absolute left-0 top-0 h-full w-[3px] bg-[#C9604D]" />
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-[#C9604D]">
            系统错误
          </p>
          <h3 className="mt-2 text-[18px] font-medium tracking-tight text-zinc-800">
            {state.errorState.title}
          </h3>
          <p className="mt-1.5 text-[13px] leading-[1.7] text-zinc-500">
            {state.errorState.message}
          </p>
        </div>
      </div>
    );
  }

  if (state.loading || !state.bootstrap) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex space-x-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse [animation-delay:0ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse [animation-delay:150ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse [animation-delay:300ms]" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">
            进入工作台
          </span>
        </div>
      </div>
    );
  }

  const activeModelLabel =
    state.bootstrap.modelViews.find((m) => m.id === state.selectedModelViewId)?.label ?? '默认模型';

  if (state.presentationMode) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-50">
        <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-zinc-800">定稿阅览视图</span>
            <span className="rounded bg-[#6FAA7D]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#4F7F5E]">已完成</span>
          </div>
          <button
            onClick={() => actions.setPresentationMode(false)}
            className="inline-flex h-7 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            退出阅览
          </button>
        </header>
        <div className="flex-1 overflow-hidden bg-zinc-50/50 flex justify-center py-8">
          <div className="w-full max-w-3xl flex-1 bg-white border border-zinc-200 rounded-lg shadow-sm p-8 overflow-y-auto">
            <div className="prose prose-sm prose-zinc max-w-none leading-relaxed">
              {state.polishedText.split('\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-50">
      {/* Top bar */}
      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3">
        <div className="flex items-center gap-2">
          {/* History toggle button */}
          <button
            onClick={toggleHistory}
            className={cn(
              'hidden lg:inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]',
              historyOpen
                ? 'bg-zinc-300 text-zinc-900'
                : 'text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900'
            )}
            title={historyOpen ? '收起历史栏' : '展开历史栏'}
          >
            {historyOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
            <span>历史</span>
          </button>

          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
              文案改写
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={actions.handleNewConversation}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 shadow-sm transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
            title="开启新文案"
          >
            <Plus className="h-3 w-3" />
            <span className="tracking-wide">新对话</span>
          </button>
          {/* Top-right Actions */}
          <div className="flex items-center gap-1.5 ml-2 border-l border-zinc-200 pl-2">
            <button
              onClick={() => actions.setTraceabilityMode(!state.traceabilityMode)}
              className={cn(
                'inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-[11px] font-medium transition-colors',
                state.traceabilityMode ? 'bg-[#6FAA7D]/10 text-[#4F7F5E]' : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900'
              )}
              title="溯源模式：高亮人工修改的段落"
            >
              溯源
            </button>
            <button
              onClick={() => actions.setPresentationMode(true)}
              className="inline-flex h-7 items-center justify-center rounded-lg bg-[#D97757] px-3.5 text-[11px] font-bold text-white shadow-md shadow-[#D97757]/20 hover:bg-[#C96442] transition-all"
            >
              定稿导出
            </button>
          </div>

          {/* Layout settings dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-[background-color,color] duration-150 hover:bg-zinc-200 hover:text-zinc-800 ml-1"
              title="布局设置"
            >
              <Layout className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-44">
              <DropdownMenuLabel>侧边栏默认状态</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleHistoryPin(true)}
                className={cn(historyPinned && 'bg-accent')}
              >
                <PanelLeft className="h-3.5 w-3.5" />
                <span>历史栏默认展开</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleHistoryPin(false)}
                className={cn(!historyPinned && 'bg-accent')}
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
                <span>历史栏默认收起</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: History Sidebar (L0 zinc-50) */}
        <aside
          className={cn(
            'relative hidden shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 lg:flex',
            historyOpen ? 'w-[260px]' : 'w-0 overflow-hidden'
          )}
          style={{
            transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            transformOrigin: 'left center',
          }}
        >
          <RewriteHistory
            conversations={state.conversations}
            currentConversationId={state.currentConversationId}
            featureLabel={state.bootstrap.feature.label}
            onNewConversation={actions.handleNewConversation}
            onSelectConversation={actions.handleSelectConversation}
            onPrefetchConversation={actions.prefetchConversation}
            getConversationTag={getConversationTag}
          />
        </aside>

        {/* Double-column Studio Content Area */}
        <div
          ref={containerRef}
          className={cn(
            "flex-1 flex min-w-0 overflow-hidden bg-zinc-100",
            isResizing && "select-none cursor-col-resize"
          )}
        >
          {/* Left Column: Dialog & Controls */}
          <div
            style={{ width: `${leftWidthPercent}%` }}
            className="min-w-[360px] flex flex-col min-h-0 relative bg-zinc-50/80 backdrop-blur-xl shadow-[2px_0_12px_rgba(0,0,0,0.03)] z-20"
          >
            {/* Collapsible Skill Settings Header */}
            <div className="shrink-0 border-b border-zinc-200/50 bg-transparent px-5 min-h-[56px] flex flex-col justify-center py-3 z-10 relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-zinc-800">
                    {state.isV2Conversation ? '文档画布模式' : state.activeFixedMode?.name || '自定义润色模式'}
                  </span>
                  <span className="rounded bg-zinc-150 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">
                    {state.isV2Conversation ? 'V2' : activeModelLabel}
                  </span>
                </div>

                {state.isV2Conversation ? (
                  <label className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">模型</span>
                    <select
                      aria-label="模型"
                      value={state.selectedModelViewId}
                      onChange={(e) => actions.setSelectedModelViewId(e.target.value)}
                      disabled={state.isSending}
                      className="h-7 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] text-zinc-700 outline-none hover:border-zinc-300 disabled:opacity-50"
                    >
                      <option value="">自动模型</option>
                      {state.bootstrap.modelViews.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(!settingsOpen)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-medium transition-colors shadow-sm',
                      settingsOpen
                        ? 'border-[#D97757] bg-[#D97757]/5 text-[#D97757]'
                        : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800'
                    )}
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    <span>微调参数</span>
                  </button>
                )}
              </div>

              {/* Advanced Parameter Drawer */}
              {settingsOpen && !state.isV2Conversation && (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-150 pt-3 animate-in slide-in-from-top-2 duration-200">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 pl-0.5">模型</span>
                    <select
                      value={state.selectedModelViewId}
                      onChange={(e) => actions.setSelectedModelViewId(e.target.value)}
                      disabled={state.customControlsLocked}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] outline-none hover:border-zinc-300 text-zinc-700 disabled:opacity-50"
                    >
                      <option value="">默认真实模型</option>
                      {state.bootstrap.modelViews.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 pl-0.5">模式</span>
                    <select
                      value={state.selectedModeId || ''}
                      onChange={(e) => actions.setSelectedModeId(e.target.value || null)}
                      disabled={state.customControlsLocked}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] outline-none hover:border-zinc-300 text-zinc-700 disabled:opacity-50"
                    >
                      <option value="">无附加模式</option>
                      {state.bootstrap.modes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 pl-0.5">字数</span>
                    <select
                      value={state.selectedLengthId}
                      onChange={(e) => actions.setSelectedLengthId(e.target.value)}
                      disabled={state.customControlsLocked}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] outline-none hover:border-zinc-300 text-zinc-700 disabled:opacity-50"
                    >
                      {state.bootstrap.lengthPresets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            {/* Conversation Flow */}
            <InstructionFeed
              bootstrap={state.bootstrap}
              messages={state.messages}
              messagesLoading={state.messagesLoading}
              isSending={state.isSending}
              isV2Conversation={state.isV2Conversation}
              activeFixedMode={state.activeFixedMode}
              availableSkills={state.availableV2Skills}
              activeSkills={state.activeSkills}
              messagesEndRef={state.messagesEndRef}
              onSendOverride={(text) => actions.handleSend(text)}
              onSelectFixedMode={(id) => actions.handleToggleFixedMode(id)}
              onToggleSkill={actions.handleToggleSkill}
              selectedFixedModeId={state.selectedFixedModeId}
            />

            {/* Prompt Textarea */}
            <div className="relative shrink-0">
              {/* 渐变遮罩: 物理流体感悬浮融合 */}
              <div className="pointer-events-none absolute bottom-full left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent z-10" />
              <ChatInputBar
                inputText={state.inputText}
                isSending={state.isSending}
                isChatStage={state.isV2Conversation}
                activeFixedModeName={
                  state.bootstrap.fixedModes.find((mode) => mode.id === state.selectedFixedModeId)?.name || null
                }
                activeSkills={state.activeSkills}
                availableSkills={state.isV2Conversation ? state.availableV2Skills : state.bootstrap?.fixedModes || []}
                referredText={state.referredText}
                onClearReferredText={actions.handleClearReferredText}
                onInputChange={actions.setInputText}
                onSend={actions.handleSend}
                onAbort={actions.handleAbortGeneration}
                onToggleSkill={actions.handleToggleSkill}
              />
            </div>
          </div>

          {/* Resizable Divider Splitter Handle */}
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            className={cn(
              "w-[6px] cursor-col-resize shrink-0 transition-colors z-30 relative ml-[-3px] mr-[-3px] flex items-center justify-center group/splitter",
              isResizing 
                ? "bg-[#8AA8C7]/30" 
                : "bg-transparent hover:bg-[#8AA8C7]/20"
            )}
          >
            <div className={cn(
              "w-[1px] h-full transition-colors",
              isResizing ? "bg-[#8AA8C7]" : "bg-zinc-200/80"
            )} />

            {/* Smart Micro Tooltip for Resizing & Double-click reset */}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover/splitter:opacity-100 transition-opacity duration-200 delay-300 z-50 bg-zinc-900 text-white text-[10px] px-2 py-1 rounded-lg shadow-md whitespace-nowrap">
              拖拽调节宽度 · 双击还原默认
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-zinc-900" />
            </div>
          </div>

          {/* Right Column: Polishing Document Sheet & Diff */}
          <div
            style={{ width: `${100 - leftWidthPercent}%` }}
            className="min-w-[400px] flex flex-col min-h-0"
          >
            <PolishedDocumentCanvas
              originalDraft={state.activeOriginalDraft}
              polishedText={state.polishedText}
              isSending={state.isSending}
              paragraphs={state.documentParagraphs}
              traceabilityMode={state.traceabilityMode}
              generatingParagraphIds={state.generatingParagraphIds}
              streamingPatchText={state.streamingPatchText}
              onTextChange={actions.handleUpdateLastAssistantMessage}
              onInlinePatchSubmit={actions.handleInlinePatchSubmitForParagraphs}
              onParagraphEdit={actions.handleUserEdit}
              onReferSelection={actions.setReferredText}
              selectedParagraphIds={state.selectedParagraphIds}
              onParagraphSelectionChange={actions.handleParagraphSelectionChange}
              conversationId={state.currentConversationId}
              isV2Conversation={state.isV2Conversation}
              historyState={state.historyState}
              historyLoading={state.historyLoading}
              onUndo={actions.handleUndo}
              onRedo={actions.handleRedo}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
