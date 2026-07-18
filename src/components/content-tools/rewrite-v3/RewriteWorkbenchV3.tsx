'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Undo2, Redo2, Eye, EyeOff, Copy, FileText, Download, History, Cpu, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useRewriteV3Logic } from './useRewriteV3Logic';
import { TimelineDiff } from './TimelineDiff';
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
  const [presentationMode, setPresentationMode] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [showDiffInLatest, setShowDiffInLatest] = useState(false);

  // 紧凑模型组合下拉
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [modelDropdownOpen]);

  const currentModelLabel = state.bootstrap?.modelViews.find((m) => m.id === state.selectedModelViewId)?.label
    || (state.selectedModelViewId ? '已选模型' : '自动推荐模型');

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

  // 导出 Markdown 文件
  const handleExportMarkdown = () => {
    if (!state.polishedText) return;
    const blob = new Blob([state.polishedText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dydata_polished_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 一键免依赖高保真导出 Word (.doc) 方案 (完全对齐决策)
  const handleExportWord = () => {
    if (!state.polishedText) return;
    const htmlContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>DYData 导出文案</title>
        <style>
          body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; line-height: 1.6; color: #333; padding: 40px; }
          p { margin-bottom: 20px; font-size: 14pt; }
        </style>
      </head>
      <body>
        ${state.polishedText
          .split('\n\n')
          .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
          .join('')}
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dydata_polished_${Date.now()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  // 定稿沉浸式阅览视图
  if (presentationMode) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-stone-50/50">
        <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-stone-900">定稿阅览室</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[12px] font-medium text-emerald-600 uppercase tracking-wide">
              沉浸模式
            </span>
          </div>

          {/* 双格式导出及复制操作 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportMarkdown}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-700 hover:bg-stone-50 transition-all relative active:scale-[0.98]"
              title="下载 Markdown 文件 (.md)"
            >
              <Download className="h-3.5 w-3.5 mr-1 text-stone-500" />
              <span>导出 Markdown</span>
            </button>
            <button
              onClick={handleExportWord}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-700 hover:bg-stone-50 transition-all relative active:scale-[0.98]"
              title="下载 Word 兼容文件 (.doc)"
            >
              <FileText className="h-3.5 w-3.5 mr-1 text-stone-500" />
              <span>导出 Word</span>
            </button>
            <button
              onClick={handleCopyAll}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-700 hover:bg-stone-50 transition-all relative active:scale-[0.98]"
            >
              <Copy className="h-3.5 w-3.5 mr-1 text-stone-500" />
              <span>{copiedAll ? '已复制' : '复制全文'}</span>
            </button>
            <button
              onClick={() => setPresentationMode(false)}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[#D97757] text-white px-4.5 text-[12px] font-medium hover:bg-[#C96442] transition-all active:scale-[0.98]"
            >
              退出阅览
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto flex justify-center py-10 px-6">
          <div className="w-full max-w-3xl border border-stone-200 bg-white rounded-lg p-10 select-text">
            <div className="prose prose-stone max-w-none leading-relaxed text-[13px] space-y-6 text-stone-700">
              {state.polishedText.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {!state.polishedText && (
                <p className="py-12 text-center italic text-stone-500">暂无定稿内容</p>
              )}
            </div>
          </div>
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

          {/* 分隔线 */}
          <div className="h-4 w-px bg-stone-200" />

          {/* 紧凑模型组合选择器 */}
          {state.bootstrap && (
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                disabled={state.isSending}
                className={cn(
                  "inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-all active:scale-[0.98]",
                  modelDropdownOpen
                    ? "bg-stone-100 border-stone-400 text-stone-900"
                    : "bg-white border-stone-300 text-stone-700 hover:bg-stone-50 hover:text-stone-900"
                )}
                title="选择模型组合"
              >
                <Cpu className="h-3 w-3 text-stone-500 shrink-0" />
                <span className="truncate">{currentModelLabel}</span>
                <ChevronDown className={cn("h-3 w-3 text-stone-500 shrink-0 transition-transform", modelDropdownOpen && "rotate-180")} />
              </button>

              {modelDropdownOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-56 rounded-lg border border-stone-200/50 bg-white/95 backdrop-blur-xl shadow-xl p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <button
                    onClick={() => { actions.setSelectedModelViewId(''); setModelDropdownOpen(false); }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors",
                      !state.selectedModelViewId
                        ? "bg-[#5F82A8]/10 text-[#4c6785]"
                        : "text-stone-700 hover:bg-stone-50"
                    )}
                  >
                    <span>自动推荐模型</span>
                    {!state.selectedModelViewId && <Check className="h-3.5 w-3.5 text-[#5F82A8]" />}
                  </button>
                  {state.bootstrap.modelViews.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { actions.setSelectedModelViewId(item.id); setModelDropdownOpen(false); }}
                      className={cn(
                        "w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors",
                        state.selectedModelViewId === item.id
                          ? "bg-[#5F82A8]/10 text-[#4c6785]"
                          : "text-stone-700 hover:bg-stone-50"
                      )}
                      title={item.description || item.label}
                    >
                      <span className="truncate pr-2">{item.label}</span>
                      {state.selectedModelViewId === item.id && <Check className="h-3.5 w-3.5 text-[#5F82A8] shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
              aria-label="撤销最近修改"
            >
              <Undo2 className="h-3 w-3" />
            </button>
            <button
              onClick={actions.handleRedo}
              disabled={!state.historyState.canRedo || state.isSending}
              className="p-1 rounded-lg text-stone-900 opacity-40 hover:opacity-100 disabled:opacity-15 disabled:hover:bg-transparent hover:bg-stone-100 transition-all active:scale-90"
              title="重做"
              aria-label="重做"
            >
              <Redo2 className="h-3 w-3" />
            </button>
          </div>

          {/* 修订模式 (一键开关切换) */}
          <button
            onClick={() => setShowDiffInLatest(!showDiffInLatest)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[12px] font-medium transition-all active:scale-[0.98]",
              showDiffInLatest
                ? "bg-amber-500/[0.08] border-amber-500/30 text-amber-800 hover:bg-amber-500/[0.12]"
                : "bg-white border-stone-300 text-stone-700 hover:bg-stone-50 hover:text-stone-900"
            )}
            title={showDiffInLatest ? '关闭修订模式' : '开启修订模式'}
          >
            {showDiffInLatest ? (
              <Eye className="h-3 w-3 text-amber-600" />
            ) : (
              <EyeOff className="h-3 w-3 text-stone-500" />
            )}
            <span>修订模式</span>
          </button>

          {/* 复制全文 (次按钮) */}
          <button
            onClick={handleCopyAll}
            disabled={!state.polishedText}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 text-[12px] font-medium text-stone-700 hover:bg-stone-50 hover:text-stone-900 transition-all active:scale-[0.98] disabled:opacity-40"
          >
            <Copy className="h-3 w-3 text-stone-500" />
            <span>{copiedAll ? '已复制' : '复制'}</span>
          </button>

          {/* 定稿导出 (唯一主 CTA) */}
          <button
            onClick={() => setPresentationMode(true)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-[#D97757] text-white hover:bg-[#C96442] px-3.5 py-0.5 text-[12px] font-medium active:scale-[0.98] transition-all"
            title="进入纯净全屏阅览室并支持导出"
          >
            <FileText className="h-3 w-3 text-white/90" />
            <span>定稿导出</span>
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
              availableSkills={state.availableSkills}
              messages={state.messages}
              messagesLoading={state.messagesLoading}
              isSending={state.isSending}
              activeSkills={state.activeSkills}
              inputText={state.inputText}
              referredText={state.referredText}
              messagesEndRef={state.messagesEndRef}
              onInputChange={actions.setInputText}
              onSend={actions.handleSend}
              onAbort={actions.handleAbort}
              onToggleSkill={actions.handleToggleSkill}
              onClearReferredText={() => actions.setReferredText(null)}
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
            isResizing ? "bg-[#5F82A8]/20" : "bg-transparent hover:bg-[#5F82A8]/10"
          )}
        >
          <div className={cn("w-[1px] h-full transition-colors", isResizing ? "bg-[#5F82A8]" : "bg-stone-200/80")} />
            <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover/splitter:opacity-100 transition-opacity duration-200 delay-300 z-50 bg-stone-900 text-white text-[12px] px-2 py-1 rounded-lg shadow-lg whitespace-nowrap font-sans font-medium">
            双击重置为 35%
          </div>
        </div>

        {/* 右侧：主工作画布 */}
        <main
          style={{ width: `${100 - leftWidthPercent}%` }}
          className="flex-1 min-w-[450px] flex flex-col min-h-0 bg-white relative z-10"
        >
          {/* 版本时间轴（双模对比） */}
          <TimelineDiff
            revisions={state.revisions}
            selectedRevisionId={state.selectedRevisionId}
            diffMode={state.diffMode}
            onSelectRevision={actions.setSelectedRevisionId}
            onSelectDiffMode={actions.setDiffMode}
            onAdoptRevision={actions.handleAdoptHistoryRevision}
          />

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
            showDiffInLatest={showDiffInLatest}
            onParagraphEdit={actions.handleUserEdit}
            onReferSelection={actions.setReferredText}
            onInputChange={actions.setInputText}
          />
        </main>
      </div>
    </div>
  );
}
