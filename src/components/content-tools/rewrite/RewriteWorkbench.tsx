'use client';

import React from 'react';
import { useRewriteLogic } from './useRewriteLogic';
import { RewriteHistory } from './RewriteHistory';
import { RewriteInput } from './RewriteInput';
import { RewriteOutput } from './RewriteOutput';
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
      <div className="flex h-full items-center justify-center bg-background">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-background p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl">
            ⚠️
          </div>
          <h3 className="mb-2 text-[15px] font-bold text-slate-900">{state.errorState.title}</h3>
          <p className="text-[13px] text-slate-500">{state.errorState.message}</p>
        </div>
      </div>
    );
  }

  if (state.loading || !state.bootstrap) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 w-full max-w-sm px-6">
          <div className="flex space-x-2 w-full justify-center opacity-60">
            <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-2 w-2 bg-slate-400 rounded-full animate-bounce"></div>
          </div>
          <span className="text-sm font-medium tracking-wide text-slate-500">正在进入工作台</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground shadow-sm border border-slate-200/60 rounded-xl">
      <aside className="hidden lg:block w-[260px] shrink-0 border-r border-slate-200/80 bg-slate-50/50">
        <RewriteHistory
          conversations={state.conversations}
          currentConversationId={state.currentConversationId}
          featureLabel={state.bootstrap.feature.label}
          onNewConversation={actions.handleNewConversation}
          onSelectConversation={actions.handleSelectConversation}
          getConversationTag={getConversationTag}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:flex-row md:divide-x md:divide-slate-200/80">
        <section className="flex w-full md:w-[380px] shrink-0 flex-col lg:w-[420px]">
          <RewriteInput
            bootstrap={state.bootstrap}
            isChatStage={state.isChatStage}
            activeFixedMode={state.activeFixedMode}
            customControlsLocked={state.customControlsLocked}
            interactionControlsDisabled={state.interactionControlsDisabled}
            selectedFixedModeId={state.selectedFixedModeId}
            selectedModelViewId={state.selectedModelViewId}
            selectedModeId={state.selectedModeId}
            selectedLengthId={state.selectedLengthId}
            inputText={state.inputText}
            isSending={state.isSending}
            onToggleFixedMode={actions.handleToggleFixedMode}
            onModelViewChange={actions.setSelectedModelViewId}
            onModeChange={actions.setSelectedModeId}
            onLengthChange={actions.setSelectedLengthId}
            onInputChange={actions.setInputText}
            onSend={(text) => actions.handleSend(text)}
          />
        </section>

        <section className="flex min-w-0 flex-1 flex-col bg-background">
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
        </section>
      </div>
    </div>
  );
}
