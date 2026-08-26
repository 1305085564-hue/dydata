"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Copy,
  FileText,
  Download,
  History,
  Cpu,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useRewriteV3Logic } from "./useRewriteV3Logic";
import { TimelineDiff } from "./TimelineDiff";
import { CalmStudioCanvas } from "./CalmStudioCanvas";
import { ChatInspector } from "./ChatInspector";
import { RewriteHistoryV3 } from "./RewriteHistoryV3";
import { SettingsDrawer } from "./SettingsDrawer";

function getStoredSplitRatio() {
  if (typeof window === "undefined") return 35;
  const savedRatio = window.localStorage.getItem(
    "dydata-rewrite-split-ratio-v3",
  );
  if (!savedRatio) return 35;
  const parsed = parseFloat(savedRatio);
  return parsed >= 30 && parsed <= 60 ? parsed : 35;
}

export function RewriteWorkbenchV3() {
  const { state, actions } = useRewriteV3Logic();
  const [presentationMode, setPresentationMode] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [showDiffInLatest, setShowDiffInLatest] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "canvas">("chat");

  // 紧凑模型组合下拉
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [modelDropdownOpen]);

  const currentModelLabel =
    state.bootstrap?.modelViews.find((m) => m.id === state.selectedModelViewId)
      ?.label || (state.selectedModelViewId ? "已选模型" : "自动推荐模型");

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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("dydata-rewrite-split-ratio-v3");
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
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "dydata-rewrite-split-ratio-v3",
          leftWidthPercentRef.current.toFixed(2),
        );
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
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
    const blob = new Blob([state.polishedText], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
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
          body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; line-height: 1.6; color: #292524; padding: 40px; }
          p { margin-bottom: 20px; font-size: 14pt; }
        </style>
      </head>
      <body>
        ${state.polishedText
          .split("\n\n")
          .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
          .join("")}
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], {
      type: "application/msword;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
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
      <div className="flex h-full w-full items-center justify-center bg-[#FBF9F5]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex space-x-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#78716C] animate-pulse [animation-delay:0ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-[#78716C] animate-pulse [animation-delay:150ms]" />
            <div className="h-1.5 w-1.5 rounded-full bg-[#78716C] animate-pulse [animation-delay:300ms]" />
          </div>
          <span className="text-[12px] uppercase font-medium tracking-[0.25em] text-[#78716C]">
            Calm Studio V3
          </span>
        </div>
      </div>
    );
  }

  // 错误状态
  if (state.errorState) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#FBF9F5]">
        <div className="max-w-md bg-white border border-[#E5E0D6] p-6 rounded-lg shadow-claude-dialog space-y-4">
          <div className="text-[12px] font-medium uppercase tracking-[0.2em] text-[#DC2626]">
            初始化异常
          </div>
          <h3 className="text-base font-medium text-[#1C1917]">
            {state.errorState.title}
          </h3>
          <p className="text-[13px] text-[#292524] leading-relaxed">
            {state.errorState.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-[#D97757] text-white hover:bg-[#C96442] font-medium py-2 rounded-lg text-[12px] transition-all active:scale-[0.985] active:duration-75"
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
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#FBF9F5]/50">
        <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-[#E5E0D6] bg-white px-5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#1C1917]">
              定稿阅览室
            </span>
            <span className="rounded bg-[#6FAA7D]/100/10 px-1.5 py-0.5 text-[12px] font-medium text-[#6FAA7D] uppercase tracking-wide">
              沉浸模式
            </span>
          </div>

          {/* 双格式导出及复制操作 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportMarkdown}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[#F5F3EE] px-3 text-[12px] font-medium text-[#292524] hover:bg-[#E5E0D6] hover:text-[#1C1917] transition-all relative active:scale-[0.985] active:duration-75"
              title="下载 Markdown 文件 (.md)"
            >
              <Download className="h-3.5 w-3.5 mr-1 text-[#78716C]" />
              <span>导出 Markdown</span>
            </button>
            <button
              onClick={handleExportWord}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[#F5F3EE] px-3 text-[12px] font-medium text-[#292524] hover:bg-[#E5E0D6] hover:text-[#1C1917] transition-all relative active:scale-[0.985] active:duration-75"
              title="下载 Word 兼容文件 (.doc)"
            >
              <FileText className="h-3.5 w-3.5 mr-1 text-[#78716C]" />
              <span>导出 Word</span>
            </button>
            <button
              onClick={handleCopyAll}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[#F5F3EE] px-3 text-[12px] font-medium text-[#292524] hover:bg-[#E5E0D6] hover:text-[#1C1917] transition-all relative active:scale-[0.985] active:duration-75"
            >
              <Copy className="h-3.5 w-3.5 mr-1 text-[#78716C]" />
              <span>{copiedAll ? "已复制" : "复制全文"}</span>
            </button>
            <button
              onClick={() => setPresentationMode(false)}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-[#D97757] text-white px-4.5 text-[12px] font-medium hover:bg-[#C96442] transition-all active:scale-[0.985] active:duration-75"
            >
              退出阅览
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto flex justify-center py-10 px-6">
          <div className="w-full max-w-3xl border border-[#E5E0D6] bg-white rounded-lg p-10 select-text">
            <div className="max-w-none space-y-6 text-[13px] leading-relaxed text-[#292524]">
              {state.polishedText.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {!state.polishedText && (
                <p className="py-12 text-center italic text-[#78716C]">
                  还没有定稿内容
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#FBF9F5]">
      {/* 极简顶栏 */}
      <header className="relative z-35 flex h-12 shrink-0 items-center justify-between border-b border-[#E5E0D6] bg-white px-2.5 sm:px-4 gap-2">
        {/* 移动端视图切换 Tabs (< 768px) */}
        <div className="flex md:hidden items-center gap-1 rounded-lg bg-[#F5F3EE] p-0.5 border border-[#E5E0D6] shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab("chat")}
            className={cn(
              "px-3 py-1.5 min-h-[44px] text-[12px] rounded-md font-medium transition-colors cursor-pointer flex items-center justify-center",
              mobileTab === "chat"
                ? "bg-white text-[#1C1917] shadow-2xs font-semibold"
                : "text-[#78716C]"
            )}
          >
            改写对话
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("canvas")}
            className={cn(
              "px-3 py-1.5 min-h-[44px] text-[12px] rounded-md font-medium transition-colors cursor-pointer flex items-center justify-center",
              mobileTab === "canvas"
                ? "bg-white text-[#1C1917] shadow-2xs font-semibold"
                : "text-[#78716C]"
            )}
          >
            定稿画布
          </button>
        </div>

        {/* 桌面端左侧操作组 (>= 768px) */}
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-3">
            {/* 产品标识 (象牙纸面微印章) */}
            <div className="flex items-center gap-1.5 font-mono select-none mr-1 bg-[#FAF8F4] border border-[#ECE7DE] px-2 py-0.5 rounded-md">
              <span className="relative flex h-1.5 w-1.5">
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#D97757]" />
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                DYDATA WRITER · 文案精修
              </span>
            </div>

            {/* 历史记录 (次按钮) */}
            <button
              onClick={() => actions.setIsHistoryOpen(!state.isHistoryOpen)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-all active:scale-[0.985] active:duration-75",
                state.isHistoryOpen
                  ? "bg-[#F5F3EE] text-[#1C1917] font-medium"
                  : "bg-[#F5F3EE] text-[#292524] hover:bg-[#E5E0D6] hover:text-[#1C1917]",
              )}
              title={state.isHistoryOpen ? "收起历史对话" : "查看历史对话"}
            >
              <History className="h-3 w-3 text-[#78716C]" />
              <span>历史记录</span>
            </button>

            {/* 新对话 (次按钮) */}
            <button
              onClick={actions.handleNewConversation}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[#F5F3EE] px-2.5 text-[12px] font-medium text-[#292524] transition-all hover:bg-[#E5E0D6] hover:text-[#1C1917] active:scale-[0.985] active:duration-75"
              title="新对话改写"
            >
              <Plus className="h-3 w-3 text-[#78716C]" />
              <span>新对话</span>
            </button>
          </div>

          {/* 分隔线 */}
          <div className="h-4 w-px bg-[#E5E0D6]" />

          {/* 紧凑模型组合选择器 */}
          {state.bootstrap && (
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                disabled={state.isSending}
                className={cn(
                  "inline-flex h-7 max-w-[180px] items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-all active:scale-[0.985] active:duration-75",
                  modelDropdownOpen
                    ? "bg-[#F5F3EE] text-[#1C1917] font-medium"
                    : "bg-[#F5F3EE] text-[#292524] hover:bg-[#E5E0D6] hover:text-[#1C1917]",
                )}
                title="选择模型组合"
              >
                <Cpu className="h-3 w-3 text-[#78716C] shrink-0" />
                <span className="truncate">{currentModelLabel}</span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 text-[#78716C] shrink-0 transition-transform",
                    modelDropdownOpen && "rotate-180",
                  )}
                />
              </button>

              {modelDropdownOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-56 rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/98 backdrop-blur-xl shadow-claude-float p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <button
                    onClick={() => {
                      actions.setSelectedModelViewId("");
                      setModelDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors",
                      !state.selectedModelViewId
                        ? "bg-[#D97757]/10 text-[#D97757]"
                        : "text-[#292524] hover:bg-[#FBF9F5]",
                    )}
                  >
                    <span>自动推荐模型</span>
                    {!state.selectedModelViewId && (
                      <Check className="h-3.5 w-3.5 text-[#D97757]" />
                    )}
                  </button>
                  {state.bootstrap.modelViews.map((item) => {
                    const disabled =
                      (item as { is_enabled?: boolean; isEnabled?: boolean })
                        .is_enabled === false ||
                      (item as { is_enabled?: boolean; isEnabled?: boolean })
                        .isEnabled === false;
                    return (
                      <button
                        key={item.id}
                        disabled={disabled}
                        onClick={() => {
                          if (!disabled) {
                            actions.setSelectedModelViewId(item.id);
                            setModelDropdownOpen(false);
                          }
                        }}
                        className={cn(
                          "w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors",
                          disabled
                            ? "opacity-50 cursor-not-allowed text-[#78716C]"
                            : state.selectedModelViewId === item.id
                              ? "bg-[#D97757]/10 text-[#D97757]"
                              : "text-[#292524] hover:bg-[#FBF9F5]",
                        )}
                        title={
                          disabled ? "已停用" : item.description || item.label
                        }
                      >
                        <span className="truncate pr-2">
                          {item.label}
                          {disabled ? " (已停用)" : ""}
                        </span>
                        {state.selectedModelViewId === item.id && (
                          <Check className="h-3.5 w-3.5 text-[#D97757] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧：顶栏操作组 */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* 撤销/重做 (桌面端展示) */}
          <div className="hidden sm:flex items-center gap-0.5 mr-1 pr-2 border-r border-[#E5E0D6]">
            <button
              onClick={actions.handleUndo}
              disabled={!state.historyState.canUndo || state.isSending}
              className="p-1 rounded-lg text-[#1C1917] opacity-40 hover:opacity-100 disabled:opacity-15 disabled:hover:bg-transparent hover:bg-[#F5F3EE] transition-all active:scale-[0.985] active:duration-75"
              title="撤销最近修改"
              aria-label="撤销最近修改"
            >
              <Undo2 className="h-3 w-3" />
            </button>
            <button
              onClick={actions.handleRedo}
              disabled={!state.historyState.canRedo || state.isSending}
              className="p-1 rounded-lg text-[#1C1917] opacity-40 hover:opacity-100 disabled:opacity-15 disabled:hover:bg-transparent hover:bg-[#F5F3EE] transition-all active:scale-[0.985] active:duration-75"
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
              "hidden sm:inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium transition-all active:scale-[0.985] active:duration-75",
              showDiffInLatest
                ? "bg-[#1C1917]/[0.08] text-[#292524] hover:bg-[#1C1917]/[0.12]"
                : "bg-[#F5F3EE] text-[#292524] hover:bg-[#E5E0D6] hover:text-[#1C1917]",
            )}
            title={showDiffInLatest ? "关闭修订模式" : "开启修订模式"}
          >
            {showDiffInLatest ? (
              <Eye className="h-3 w-3 text-[#D99E55]" />
            ) : (
              <EyeOff className="h-3 w-3 text-[#78716C]" />
            )}
            <span>修订模式</span>
          </button>

          {/* 复制全文 (次按钮) */}
          <button
            onClick={handleCopyAll}
            disabled={!state.polishedText}
            className="inline-flex min-h-[44px] sm:min-h-0 sm:h-7 items-center gap-1 rounded-md bg-[#F5F3EE] px-2.5 text-[12px] font-medium text-[#292524] hover:bg-[#E5E0D6] hover:text-[#1C1917] transition-all active:scale-[0.985] active:duration-75 disabled:opacity-40 cursor-pointer"
          >
            <Copy className="h-3 w-3 text-[#78716C]" />
            <span>{copiedAll ? "已复制" : "复制"}</span>
          </button>

          {/* 定稿导出 (唯一主 CTA) */}
          <button
            onClick={() => setPresentationMode(true)}
            className="inline-flex min-h-[44px] sm:min-h-0 sm:h-7 items-center gap-1 rounded-md bg-[#D97757] text-white hover:bg-[#C96442] px-3.5 py-0.5 text-[12px] font-medium active:scale-[0.985] active:duration-75 transition-all cursor-pointer"
            title="进入纯净全屏阅览室并支持导出"
          >
            <FileText className="h-3 w-3 text-white/90" />
            <span>导出</span>
          </button>
        </div>
      </header>

      {/* 主界面布局 */}
      <div
        ref={containerRef}
        style={{
          "--workbench-left-width": `${leftWidthPercent}%`,
        } as React.CSSProperties}
        className={cn(
          "flex-1 flex min-h-0 overflow-hidden relative",
          isResizing && "select-none cursor-col-resize",
        )}
      >
        {/* 最左边缘：折叠式历史对话舱 */}
        <RewriteHistoryV3
          conversations={state.conversations}
          currentConversationId={state.currentConversationId}
          onSelectConversation={actions.handleSelectConversation}
          isOpen={state.isHistoryOpen}
        />

        {/* 左侧：操作控制区 */}
        <aside
          className={cn(
            "shrink-0 flex flex-col border-r border-[#E5E0D6] bg-[#F5F3EE]/70 relative z-20 w-full md:w-[var(--workbench-left-width,35%)] md:min-w-[340px]",
            mobileTab === "chat" ? "flex flex-1" : "hidden md:flex",
          )}
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

        {/* 工业级可拖动分栏分隔条 (仅桌面端展示) */}
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          className={cn(
            "hidden md:flex w-[6px] cursor-col-resize shrink-0 transition-colors z-35 relative ml-[-3px] mr-[-3px] items-center justify-center group/splitter",
            isResizing ? "bg-[#E5E0D6]" : "bg-transparent hover:bg-[#F5F3EE]",
          )}
        >
          <div
            className={cn(
              "w-[1px] h-full transition-colors",
              isResizing ? "bg-[#78716C]" : "bg-[#E5E0D6]/80",
            )}
          />
          <div className="absolute top-12 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover/splitter:opacity-100 transition-opacity duration-200 delay-300 z-50 bg-[#1C1917] text-white text-[12px] px-2 py-1 rounded-lg shadow-claude-float whitespace-nowrap font-sans font-medium">
            双击重置为 35%
          </div>
        </div>

        {/* 右侧：主工作画布 */}
        <main
          className={cn(
            "flex-1 flex flex-col min-h-0 bg-white relative z-10 w-full md:w-[calc(100%-var(--workbench-left-width,35%))] md:min-w-[450px]",
            mobileTab === "canvas" ? "flex" : "hidden md:flex",
          )}
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
