'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Undo2, Redo2, Eye, EyeOff, Sparkles, Copy, FileText, ChevronRight, Download, History } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useRewriteV3Logic } from './useRewriteV3Logic';
import { SkillCabin } from './SkillCabin';
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
      <div className="flex h-full w-full items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex space-x-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:0ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:150ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse [animation-delay:300ms]" />
          </div>
          <span className="text-[10px] uppercase font-bold tracking-[0.25em] text-zinc-400">
            Calm Studio V3
          </span>
        </div>
      </div>
    );
  }

  // 错误状态
  if (state.errorState) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-50">
        <div className="max-w-md bg-white border border-zinc-200 p-6 rounded-lg shadow-xl space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-500">初始化异常</div>
          <h3 className="text-lg font-bold text-zinc-800">{state.errorState.title}</h3>
          <p className="text-[13px] text-zinc-500 leading-relaxed">{state.errorState.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-[#D97757] text-white hover:bg-[#C96442] font-bold py-2 rounded-lg text-xs shadow-md transition-all active:scale-[0.98]"
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
      <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-50/50">
        <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-zinc-800">定稿阅览室</span>
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 uppercase tracking-wide">
              沉浸模式
            </span>
          </div>

          {/* 双格式导出及复制操作 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportMarkdown}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-semibold text-zinc-650 hover:bg-zinc-50 transition-all relative active:scale-[0.98]"
              title="下载 Markdown 文件 (.md)"
            >
              <Download className="h-3.5 w-3.5 mr-1 text-zinc-400" />
              <span>导出 Markdown</span>
            </button>
            <button
              onClick={handleExportWord}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-semibold text-zinc-650 hover:bg-zinc-50 transition-all relative active:scale-[0.98]"
              title="下载 Word 兼容文件 (.doc)"
            >
              <FileText className="h-3.5 w-3.5 mr-1 text-zinc-400" />
              <span>导出 Word</span>
            </button>
            <button
              onClick={handleCopyAll}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-semibold text-zinc-650 hover:bg-zinc-50 transition-all relative active:scale-[0.98]"
            >
              <Copy className="h-3.5 w-3.5 mr-1 text-zinc-400" />
              <span>{copiedAll ? '已复制' : '复制全文'}</span>
            </button>
            <button
              onClick={() => setPresentationMode(false)}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[#D97757] text-white px-4.5 text-[11px] font-bold hover:bg-[#C96442] transition-all shadow-sm active:scale-[0.98]"
            >
              退出阅览
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto flex justify-center py-10 px-6">
          <div className="w-full max-w-3xl bg-white border border-zinc-200/60 rounded-lg shadow-sm p-10 select-text">
            <div className="prose prose-zinc max-w-none leading-relaxed text-[14.5px] space-y-6 text-zinc-800">
              {state.polishedText.split('\n\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {!state.polishedText && (
                <p className="text-zinc-405 italic text-center py-12">暂无定稿内容</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-50">
      {/* 极简顶栏 */}
      <header className="relative z-35 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            {/* 产品标识 (单色灰阶) */}
            <div className="flex items-center gap-1.5 font-sans select-none mr-1">
              <span className="relative flex h-1 w-1">
                <span className="relative inline-flex h-1 w-1 rounded-full bg-zinc-400" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 font-outfit">
                DYDATA WRITER V3
              </span>
            </div>

            {/* 历史记录 (次按钮) */}
            <button
              onClick={() => actions.setIsHistoryOpen(!state.isHistoryOpen)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold shadow-sm transition-all active:scale-[0.98]",
                state.isHistoryOpen
                  ? "bg-zinc-100 border-zinc-400 text-zinc-900"
                  : "bg-white border-zinc-300 text-zinc-650 hover:bg-zinc-50 hover:text-zinc-800"
              )}
              title={state.isHistoryOpen ? '收起历史对话' : '查看历史对话'}
            >
              <History className="h-3 w-3 text-zinc-400" />
              <span>历史记录</span>
            </button>

            {/* 新对话 (次按钮) */}
            <button
              onClick={actions.handleNewConversation}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-[10px] font-bold text-zinc-650 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-800 active:scale-[0.98]"
              title="新对话改写"
            >
              <Plus className="h-3 w-3 text-zinc-400" />
              <span>新对话</span>
            </button>
          </div>

          {/* 分隔线 */}
          <div className="h-4 w-px bg-zinc-200" />

          {/* 技能模式 */}
          <SkillCabin
            availableSkills={state.availableSkills}
            activeSkills={state.activeSkills}
            onToggleSkill={actions.handleToggleSkill}
            variant="header"
          />
        </div>

        {/* 右侧：顶栏操作组 */}
        <div className="flex items-center gap-3">
          {/* 撤销/重做 (渐进式显影) */}
          <div className="flex items-center gap-0.5 mr-1 pr-2 border-r border-zinc-200">
            <button
              onClick={actions.handleUndo}
              disabled={!state.historyState.canUndo || state.isSending}
              className="p-1 rounded-lg text-zinc-800 opacity-40 hover:opacity-100 disabled:opacity-15 disabled:hover:bg-transparent hover:bg-zinc-100 transition-all active:scale-90"
              title="撤销最近修改"
            >
              <Undo2 className="h-3 w-3" />
            </button>
            <button
              onClick={actions.handleRedo}
              disabled={!state.historyState.canRedo || state.isSending}
              className="p-1 rounded-lg text-zinc-800 opacity-40 hover:opacity-100 disabled:opacity-15 disabled:hover:bg-transparent hover:bg-zinc-100 transition-all active:scale-90"
              title="重做"
            >
              <Redo2 className="h-3 w-3" />
            </button>
          </div>

          {/* 修订模式 (一键开关切换) */}
          <button
            onClick={() => setShowDiffInLatest(!showDiffInLatest)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-bold shadow-sm transition-all active:scale-[0.98]",
              showDiffInLatest
                ? "bg-amber-500/[0.08] border-amber-500/30 text-amber-800 hover:bg-amber-500/[0.12]"
                : "bg-white border-zinc-300 text-zinc-650 hover:bg-zinc-50 hover:text-zinc-800"
            )}
            title={showDiffInLatest ? '关闭修订模式' : '开启修订模式'}
          >
            {showDiffInLatest ? (
              <Eye className="h-3 w-3 text-amber-600" />
            ) : (
              <EyeOff className="h-3 w-3 text-zinc-400" />
            )}
            <span>修订模式</span>
          </button>

          {/* 复制全文 (次按钮) */}
          <button
            onClick={handleCopyAll}
            disabled={!state.polishedText}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 text-[10px] font-bold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 shadow-sm transition-all active:scale-[0.98] disabled:opacity-40"
          >
            <Copy className="h-3 w-3 text-zinc-400" />
            <span>{copiedAll ? '已复制' : '复制'}</span>
          </button>

          {/* 定稿导出 (唯一主 CTA) */}
          <button
            onClick={() => setPresentationMode(true)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-[#D97757] text-white hover:bg-[#C96442] shadow-sm shadow-[#D97757]/20 px-3.5 py-0.5 text-[10.5px] font-bold active:scale-[0.98] transition-all"
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
          className="shrink-0 min-w-[340px] flex flex-col border-r border-zinc-200 bg-zinc-100/70 relative z-20 shadow-[1px_0_4px_rgba(0,0,0,0.01)]"
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
          <div className={cn("w-[1px] h-full transition-colors", isResizing ? "bg-[#8AA8C7]" : "bg-zinc-200/80")} />
          <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover/splitter:opacity-100 transition-opacity duration-200 delay-300 z-50 bg-zinc-900 text-white text-[9px] px-2 py-1 rounded-lg shadow-md whitespace-nowrap font-sans font-semibold">
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
