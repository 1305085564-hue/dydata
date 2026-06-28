'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
        <div className="relative max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
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
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 shadow-sm transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
            title="开启新对话"
          >
            <Plus className="h-3 w-3" />
            <span className="tracking-wide">新对话</span>
          </button>

          {/* Layout settings dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-[background-color,color] duration-150 hover:bg-zinc-200 hover:text-zinc-800"
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
        <div className="flex-1 flex min-w-0 overflow-hidden divide-x divide-zinc-200 bg-white">
          {/* Left Column (45%): Dialog & Controls */}
          <div className="w-[45%] min-w-[360px] flex flex-col min-h-0 relative">
            {/* Collapsible Skill Settings Header */}
            <div className="shrink-0 border-b border-zinc-200 bg-zinc-50/50 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-zinc-800">
                    {state.activeFixedMode?.name || '自定义润色模式'}
                  </span>
                  <span className="rounded bg-zinc-150 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">
                    {activeModelLabel}
                  </span>
                </div>

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
              </div>

              {/* Advanced Parameter Drawer */}
              {settingsOpen && (
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
              activeFixedMode={state.activeFixedMode}
              messagesEndRef={state.messagesEndRef}
              onSendOverride={(text) => actions.handleSend(text)}
              onSelectFixedMode={(id) => actions.handleToggleFixedMode(id)}
              selectedFixedModeId={state.selectedFixedModeId}
            />

            {/* Prompt Textarea */}
            <ChatInputBar
              inputText={state.inputText}
              isSending={state.isSending}
              isChatStage={state.isChatStage}
              activeFixedModeName={state.activeFixedMode?.name ?? null}
              onInputChange={actions.setInputText}
              onSend={() => actions.handleSend()}
            />
          </div>

          {/* Right Column (55%): Polishing Document Sheet & Diff */}
          <div className="w-[55%] min-w-[400px] flex flex-col min-h-0">
            <PolishedDocumentCanvas
              originalDraft={state.activeOriginalDraft}
              polishedText={state.polishedText}
              isSending={state.isSending}
              onTextChange={actions.handleUpdateLastAssistantMessage}
              onReloadAsInput={actions.handleReloadAsInput}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
