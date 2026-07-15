'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Undo2, Redo2, Copy, History } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useRewriteV3Logic } from './useRewriteV3Logic';
import { CalmStudioCanvas } from './CalmStudioCanvas';
import { ChatInspector } from './ChatInspector';
import { RewriteHistoryV3 } from './RewriteHistoryV3';
import { SettingsDrawer } from './SettingsDrawer';

function getStoredSplitRatio() {
  if (typeof window === 'undefined') return 35;
  const savedRatio = window.localStorage.getItem('dydata-rewrite-split-ratio-v3');
  if (!savedRatio) return 35;
  const parsed = parseFloat(savedRatio);
  return parsed >= 30 && parsed <= 60 ? parsed : 35;
}

export function RewriteWorkbenchV3() {
  const { state, actions } = useRewriteV3Logic();
  const [copiedAll, setCopiedAll] = useState(false);

  // 左右侧宽度可拖动调节
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
    setLeftWidthPercent(35);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('dydata-rewrite-split-ratio-v3');
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
        window.localStorage.setItem('dydata-rewrite-split-ratio-v3', leftWidthPercentRef.current.toFixed(2));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // 复制全文
  const handleCopyAll = () => {
    if (!state.polishedText) return;
    navigator.clipboard.writeText(state.polishedText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Loading 状态
  if (state.loading || !state.bootstrap) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex space-x-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-stone-400 animate-pulse [animation-delay:0ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-stone-400 animate-pulse [animation-delay:150ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-stone-400 animate-pulse [animation-delay:300ms]" />
          </div>
          <span className="text-[12px] uppercase font-medium tracking-[0.25em] text-stone-500">
            Calm Studio V3
          </span>
        </div>
      </div>
    );
  }

  // 错误状态
  if (state.errorState) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-stone-50">
        <div className="max-w-md bg-white border border-stone-200 p-6 rounded-lg shadow-xl space-y-4">
          <div className="text-[12px] font-medium uppercase tracking-[0.2em] text-rose-500">初始化异常</div>
          <h3 className="text-[18px] font-medium text-stone-900">{state.errorState.title}</h3>
          <p className="text-[13px] text-stone-500 leading-relaxed">{state.errorState.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-[#D97757] text-white hover:bg-[#C96442] font-medium py-2 rounded-lg text-[12px] transition-all active:scale-[0.98]"
          >
            重试加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-stone-50">
      {/* 极简顶栏 */}
      <header className="relative z-35 flex h-12 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            {/* 产品标识 (单色灰阶) */}
            <div className="flex items-center gap-1.5 font-sans select-none mr-1">
              <span className="relative flex h-1 w-1">
                <span className="relative inline-flex h-1 w-1 rounded-full bg-stone-400" />
              </span>
              <span className="text-[12px] font-medium uppercase tracking-[0.2em] text-stone-500 font-outfit">
                DYDATA WRITER V3
              </span>
            </div>

            {/* 历史记录 (次按钮) */}
            <button
              onClick={() => actions.setIsHistoryOpen(!state.isHistoryOpen)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-all active:scale-[0.98]",
                state.isHistoryOpen
                  ? "bg-stone-100 border-stone-400 text-stone-900"
                  : "bg-white border-stone-300 text-stone-700 hover:bg-stone-50 hover:text-stone-900"
              )}
              title={state.isHistoryOpen ? '收起历史对话' : '查看历史对话'}
            >
              <History className="h-3 w-3 text-stone-500" />
              <span>历史记录</span>
            </button>

            {/* 新对话 (次按钮) */}
            <button
              onClick={actions.handleNewConversation}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 text-[12px] font-medium text-stone-700 transition-all hover:bg-stone-50 hover:text-stone-900 active:scale-[0.98]"
              title="新对话改写"
            >
              <Plus className="h-3 w-3 text-stone-500" />
              <span>新对话</span>
            </button>
          </div>
        </div>

        {/* 右侧：顶栏操作组 */}
        <div className="flex items-center gap-3">
          {/* 撤销/重做 (渐进式显影) */}
          <div className="flex items-center gap-0.5 mr-1 pr-2 border-r border-stone-200">
            <button
              onClick={actions.handleUndo}
              disabled={!state.historyState.canUndo || state.isSending}
              className="p-1 rounded-lg text-stone-900 opacity-40 hover:opacity-100 disabled:opacity-15 disabled:hover:bg-transparent hover:bg-stone-100 transition-all active:scale-90"
              title="撤销最近修改"
            >
              <Undo2 className="h-3 w-3" />
            </button>
            <button
              onClick={actions.handleRedo}
              disabled={!state.historyState.canRedo || state.isSending}
              className="p-1 rounded-lg text-stone-900 opacity-40 hover:opacity-100 disabled:opacity-15 disabled:hover:bg-transparent hover:bg-stone-100 transition-all active:scale-90"
              title="重做"
            >
              <Redo2 className="h-3 w-3" />
            </button>
          </div>

          {/* 复制全文 (次按钮) */}
          <button
            onClick={handleCopyAll}
            disabled={!state.polishedText}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 text-[12px] font-medium text-stone-700 hover:bg-stone-50 hover:text-stone-900 transition-all active:scale-[0.98] disabled:opacity-40"
          >
            <Copy className="h-3 w-3 text-stone-500" />
            <span>{copiedAll ? '已复制' : '复制'}</span>
          </button>
        </div>
      </header>

      {/* 主界面布局 */}
      <div
        ref={containerRef}
        className={cn(
          "flex-1 flex min-h-0 overflow-hidden relative",
          isResizing && "select-none cursor-col-resize"
        )}
      >
        {/* 最左边缘：折叠式历史对话舱 */}
        <RewriteHistoryV3
          conversations={state.conversations}
          currentConversationId={state.currentConversationId}
          onSelectConversation={actions.handleSelectConversation}
          isOpen={state.isHistoryOpen}
        />

        {/* 左侧：操作控制区（宽度可动态拖拽调节，默认 35%） */}
        <aside
          style={{ width: `${leftWidthPercent}%` }}
          className="shrink-0 min-w-[340px] flex flex-col border-r border-stone-200 bg-stone-100/70 relative z-20"
        >
          {/* 核心对话控制台 */}
          <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
            <ChatInspector
              bootstrap={state.bootstrap}
              messages={state.messages}
              messagesLoading={state.messagesLoading}
              isSending={state.isSending}
              activeSkills={state.activeSkills}
              inputText={state.inputText}
              referredText={state.referredText}
              selectedModelViewId={state.selectedModelViewId}
              messagesEndRef={state.messagesEndRef}
              onInputChange={actions.setInputText}
              onSend={actions.handleSend}
              onAbort={actions.handleAbort}
              onToggleSkill={actions.handleToggleSkill}
              onClearReferredText={() => actions.setReferredText(null)}
              onModelChange={actions.setSelectedModelViewId}
              onToggleSettings={() => actions.setIsSettingsOpen(true)}
            />

            {/* 创意配置抽屉 (完全浮置，遵循美学不污染画面心流) */}
            <SettingsDrawer
              isOpen={state.isSettingsOpen}
              onClose={() => actions.setIsSettingsOpen(false)}
              bootstrap={state.bootstrap}
              availableSkills={state.availableSkills}
              contextLimit={state.contextLimit}
              onUpdateContextLimit={actions.setContextLimit}
              onRefreshSkills={actions.refreshSkills}
            />
          </div>
        </aside>

        {/* 工业级可拖动分栏分隔条 */}
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          className={cn(
            "w-[6px] cursor-col-resize shrink-0 transition-colors z-35 relative ml-[-3px] mr-[-3px] flex items-center justify-center group/splitter",
            isResizing ? "bg-[#8AA8C7]/20" : "bg-transparent hover:bg-[#8AA8C7]/10"
          )}
        >
          <div className={cn("w-[1px] h-full transition-colors", isResizing ? "bg-[#8AA8C7]" : "bg-stone-200/80")} />
            <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover/splitter:opacity-100 transition-opacity duration-200 delay-300 z-50 bg-stone-900 text-white text-[12px] px-2 py-1 rounded-lg shadow-lg whitespace-nowrap font-sans font-medium">
            双击重置为 35%
          </div>
        </div>

        {/* 右侧：主工作画布 */}
        <main
          style={{ width: `${100 - leftWidthPercent}%` }}
          className="flex-1 min-w-[450px] flex flex-col min-h-0 bg-white relative z-10"
        >
          {/* 画布预览区 */}
          <CalmStudioCanvas
            paragraphs={state.documentParagraphs}
            polishedText={state.polishedText}
            isSending={state.isSending}
            generatingParagraphIds={state.generatingParagraphIds}
            streamingPatchText={state.streamingPatchText}
            selectedRevisionId={state.selectedRevisionId}
            revisions={state.revisions}
            diffMode={state.diffMode}
            showDiffInLatest={false}
            onParagraphEdit={actions.handleUserEdit}
            onReferSelection={actions.setReferredText}
            onInputChange={actions.setInputText}
          />
        </main>
      </div>
    </div>
  );
}
