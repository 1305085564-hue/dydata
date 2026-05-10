'use client';

import React, { useState } from 'react';
import { PanelLeftClose, PanelLeft, Plus, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRewriteLogic } from './useRewriteLogic';
import { RewriteHistory } from './RewriteHistory';
import { RewriteOutput } from './RewriteOutput';
import { ConfigBar } from './ConfigBar';
import { ChatInputBar } from './ChatInputBar';
import type { Conversation, Message, BootstrapPayload } from '../types';

function getConversationTag(conversation: Conversation) {
  if (conversation.selected.fixedMode) return conversation.selected.fixedMode.name;
  if (conversation.selected.mode) return conversation.selected.mode.name;
  return '普通自定义';
}

function findLabelById(
  items: Array<{ id: string; name?: string; label?: string }>,
  id: string | null | undefined,
) {
  const matched = id ? items.find((item) => item.id === id) : null;
  return matched?.name ?? matched?.label ?? null;
}

function getMessageResponseMode(message: Message) {
  return message.structuredResult?.final?.responseMode ?? 'chat';
}

function getMessageDisplayMeta(message: Message, bootstrap: BootstrapPayload) {
  const selected = message.structuredResult?.selected;
  const snapshot = message.requestSnapshot;
  const fixedModeName =
    selected?.fixedMode?.name ?? findLabelById(bootstrap.fixedModes, snapshot?.fixedModeId);
  const modelLabel =
    selected?.modelView?.label ?? findLabelById(bootstrap.modelViews, selected?.modelViewId ?? snapshot?.modelViewId);
  const modeLabel =
    selected?.mode?.name ?? findLabelById(bootstrap.modes, selected?.modeId ?? snapshot?.modeId);
  const lengthLabel =
    selected?.lengthPreset?.name ??
    findLabelById(bootstrap.lengthPresets, selected?.lengthPresetId ?? snapshot?.lengthPresetId);

  return {
    badge: fixedModeName || modeLabel || '普通自定义',
    summary: fixedModeName
      ? `${fixedModeName} / ${modelLabel || '固定模型'} / ${lengthLabel || '默认字数'}`
      : `${modelLabel || '未记录模型'} / ${modeLabel || '无附加模式'} / ${lengthLabel || '未记录字数'}`,
  };
}

export function RewriteWorkbench() {
  const { state, actions } = useRewriteLogic();
  const [historyOpen, setHistoryOpen] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);

  if (state.errorState) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50">
        <div className="relative max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="absolute left-0 top-0 h-full w-[3px] bg-[#C9604D]" />
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-[#C9604D]">
            System Error
          </p>
          <h3 className="mt-2 text-[15px] font-semibold tracking-tight text-zinc-800">
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
            Entering Workstation
          </span>
        </div>
      </div>
    );
  }

  const activeBadge =
    state.activeFixedMode?.name ||
    state.bootstrap.modes.find((m) => m.id === state.selectedModeId)?.name ||
    '自定义';
  const activeModelLabel =
    state.bootstrap.modelViews.find((m) => m.id === state.selectedModelViewId)?.label ?? '默认模型';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-zinc-50">
      {/* Top bar */}
      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="hidden lg:inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-100 hover:text-zinc-800"
            title={historyOpen ? '收起历史' : '展开历史'}
          >
            {historyOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
          </button>
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#6FAA7D]" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-500">
              Rewrite Studio
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={actions.handleNewConversation}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 shadow-sm transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:text-zinc-800 active:translate-y-0"
            title="开启新对话"
          >
            <Plus className="h-3 w-3" />
            <span className="tracking-wide">新对话</span>
          </button>
          <button
            onClick={() => setConfigOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1 text-[11px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] active:translate-y-0',
              configOpen
                ? 'border-[#D97757] bg-[#D97757] text-white shadow-sm'
                : 'border-zinc-200 bg-white text-zinc-500 shadow-sm hover:border-zinc-300 hover:text-zinc-800'
            )}
            title={configOpen ? '收起配置栏' : '展开配置栏'}
          >
            <Sliders className="h-3 w-3" />
            <span className="tracking-wide">{activeBadge} · {activeModelLabel}</span>
          </button>
        </div>
      </header>

      {/* Three-column layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: History */}
        <aside
          className={cn(
            'relative hidden shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 transition-[width] duration-300 ease-out lg:flex',
            historyOpen ? 'w-[220px]' : 'w-0 overflow-hidden'
          )}
        >
          <RewriteHistory
            conversations={state.conversations}
            currentConversationId={state.currentConversationId}
            featureLabel={state.bootstrap.feature.label}
            onNewConversation={actions.handleNewConversation}
            onSelectConversation={actions.handleSelectConversation}
            getConversationTag={getConversationTag}
          />
        </aside>

        {/* Center: Chat */}
        <main className="relative flex min-w-0 flex-1 flex-col bg-[#FAFAFB]">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <RewriteOutput
              bootstrap={state.bootstrap}
              messages={state.messages}
              messagesLoading={state.messagesLoading}
              isSending={state.isSending}
              activeFixedMode={state.activeFixedMode}
              copiedKey={state.copiedKey}
              messagesEndRef={state.messagesEndRef}
              onCopy={actions.handleCopy}
              onSendOverride={(text) => actions.handleSend(text)}
              getMessageResponseMode={getMessageResponseMode}
              getMessageDisplayMeta={getMessageDisplayMeta}
            />
          </div>

          <ChatInputBar
            inputText={state.inputText}
            isSending={state.isSending}
            isChatStage={state.isChatStage}
            activeFixedModeName={state.activeFixedMode?.name ?? null}
            onInputChange={actions.setInputText}
            onSend={() => actions.handleSend()}
          />
        </main>

        {/* Right: Config panel */}
        <aside
          className={cn(
            'relative hidden shrink-0 flex-col border-l border-zinc-200 bg-zinc-50 transition-[width] duration-300 ease-out lg:flex',
            configOpen ? 'w-[260px]' : 'w-0 overflow-hidden'
          )}
        >
          <ConfigBar
            bootstrap={state.bootstrap}
            isChatStage={state.isChatStage}
            activeFixedMode={state.activeFixedMode}
            customControlsLocked={state.customControlsLocked}
            interactionControlsDisabled={state.interactionControlsDisabled}
            selectedFixedModeId={state.selectedFixedModeId}
            selectedModelViewId={state.selectedModelViewId}
            selectedModeId={state.selectedModeId}
            selectedLengthId={state.selectedLengthId}
            onToggleFixedMode={actions.handleToggleFixedMode}
            onModelViewChange={actions.setSelectedModelViewId}
            onModeChange={actions.setSelectedModeId}
            onLengthChange={actions.setSelectedLengthId}
            onClose={() => setConfigOpen(false)}
          />
        </aside>
      </div>
    </div>
  );
}
