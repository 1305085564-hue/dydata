'use client';

import React from 'react';
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

  if (state.errorState) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F9F9FB]">
        <div className="max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl">
            ⚠️
          </div>
          <h3 className="mb-2 text-[15px] font-bold text-zinc-900">{state.errorState.title}</h3>
          <p className="text-[13px] text-zinc-500">{state.errorState.message}</p>
        </div>
      </div>
    );
  }

  if (state.loading || !state.bootstrap) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F9F9FB]">
        <div className="flex flex-col items-center gap-3 w-full max-w-sm px-6">
          <div className="flex space-x-1.5">
            <div className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce [animation-delay:-0.3s]" />
            <div className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce [animation-delay:-0.15s]" />
            <div className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce" />
          </div>
          <span className="text-[13px] font-medium text-zinc-400">正在进入工作台...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#F9F9FB]">
      {/* 左侧窄边栏 — 历史记录 */}
      <aside className="hidden lg:flex w-[180px] shrink-0 flex-col border-r border-zinc-200 bg-white">
        <RewriteHistory
          conversations={state.conversations}
          currentConversationId={state.currentConversationId}
          featureLabel={state.bootstrap.feature.label}
          onNewConversation={actions.handleNewConversation}
          onSelectConversation={actions.handleSelectConversation}
          getConversationTag={getConversationTag}
        />
      </aside>

      {/* 主对话区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部配置摘要 */}
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
        />

        {/* 对话流区域 */}
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

        {/* 底部固定输入框 */}
        <ChatInputBar
          inputText={state.inputText}
          isSending={state.isSending}
          isChatStage={state.isChatStage}
          activeFixedModeName={state.activeFixedMode?.name ?? null}
          onInputChange={actions.setInputText}
          onSend={() => actions.handleSend()}
        />
      </div>
    </div>
  );
}
