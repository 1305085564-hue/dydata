'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  Send,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { BootstrapPayload, Conversation, Message } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
    if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
  } catch {}

  return fallback;
}

function toStatusTitle(status: number) {
  if (status === 401) return '未登录';
  if (status === 403) return '无权限';
  if (status === 404) return '会话不存在';
  if (status === 503) return '服务暂不可用';
  return '请求失败';
}

function sortConversations(items: Conversation[]) {
  return [...items].sort(
    (left, right) =>
      new Date(right.lastMessageAt || right.updatedAt).getTime() -
      new Date(left.lastMessageAt || left.updatedAt).getTime(),
  );
}

function upsertConversation(items: Conversation[], next: Conversation) {
  const filtered = items.filter((item) => item.id !== next.id);
  return sortConversations([next, ...filtered]);
}

function isTransientFetchError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed')
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMessageResponseMode(message: Message) {
  return message.structuredResult?.final?.responseMode ?? 'chat';
}

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

export default function RewriteWorkbench() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ title: string; message: string } | null>(null);

  const [selectedFixedModeId, setSelectedFixedModeId] = useState<string | null>(null);
  const [selectedModelViewId, setSelectedModelViewId] = useState<string>('');
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const [selectedLengthId, setSelectedLengthId] = useState<string>('');

  const [inputText, setInputText] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeFixedMode =
    bootstrap?.fixedModes.find((item) => item.id === selectedFixedModeId) ?? null;
  const customControlsLocked = Boolean(activeFixedMode);
  const selectedModelLabel =
    bootstrap?.modelViews.find((item) => item.id === selectedModelViewId)?.label ?? '未设置';
  const selectedModeLabel =
    bootstrap?.modes.find((item) => item.id === selectedModeId)?.name ?? '无附加模式';
  const selectedLengthLabel =
    bootstrap?.lengthPresets.find((item) => item.id === selectedLengthId)?.name ?? '未设置';

  function applySelections(selected?: Conversation['selected'] | null) {
    if (!selected) return;

    setSelectedFixedModeId(selected.fixedModeId ?? null);
    setSelectedModelViewId(selected.modelViewId || '');
    setSelectedModeId(selected.modeId || null);
    setSelectedLengthId(selected.lengthPresetId || '');
  }

  function resetToBootstrapDefaults(nextBootstrap: BootstrapPayload) {
    setSelectedFixedModeId(nextBootstrap.defaults.fixedModeId);
    setSelectedModelViewId(nextBootstrap.defaults.modelViewId || '');
    setSelectedModeId(nextBootstrap.defaults.modeId);
    setSelectedLengthId(nextBootstrap.defaults.lengthPresetId || '');
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, messagesLoading, isSending]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/content-tools/rewrite/bootstrap', { cache: 'no-store' });

        if (!res.ok) {
          const errorMsg = await readApiError(res, '初始化失败，请稍后重试');
          if ([401, 403, 503, 500].includes(res.status)) {
            let title = '初始化失败';
            if (res.status === 401) title = '未登录';
            if (res.status === 403) title = '无权限';
            if (res.status === 503) title = '服务暂不可用';

            setErrorState({
              title,
              message:
                res.status === 401
                  ? '未登录，请先登录'
                  : res.status === 403
                    ? '你当前无权限使用该功能'
                    : res.status === 503
                      ? '文案改写功能暂时关闭'
                      : errorMsg,
            });
            return;
          }

          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data: BootstrapPayload = await res.json();
        setBootstrap(data);
        resetToBootstrapDefaults(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : '初始化失败，请稍后重试';
        setErrorState({
          title: '初始化失败',
          message,
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
    void fetchConversations();
  }, []);

  async function fetchConversations() {
    try {
      const res = await fetch('/api/content-tools/rewrite/conversations?limit=30', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(await readApiError(res, '会话列表加载失败'));
      }
      const data = await res.json();
      if (data?.conversations) {
        setConversations(sortConversations(data.conversations));
      }
    } catch (error) {
      console.warn('⚠️ 获取会话列表失败', error);
    }
  }

  async function fetchMessages(conversationId: string) {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/content-tools/rewrite/conversations/${conversationId}/messages`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const error = new Error(await readApiError(res, '消息加载失败'));
        (error as Error & { status?: number }).status = res.status;
        throw error;
      }
      const data = await res.json();
      if (data?.conversation?.selected) {
        applySelections(data.conversation.selected as Conversation['selected']);
      }
      if (data?.messages) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.warn('⚠️ 获取消息失败', error);
      const title =
        error instanceof Error && 'status' in error && typeof error.status === 'number'
          ? toStatusTitle(error.status)
          : '消息加载失败';
      setMessages([
        {
          id: 'error-msg',
          conversationId,
          role: 'system_note',
          content: `⚠️ ${title}：${error instanceof Error ? error.message : '请尝试刷新页面或重新选择会话。'}`,
          createdAt: new Date().toISOString(),
          generationMode: null,
          status: 'failed',
          requestSnapshot: null,
          errorMessage: error instanceof Error ? error.message : 'Network Error',
          structuredResult: null,
        },
      ]);
    } finally {
      setMessagesLoading(false);
    }
  }

  function handleSelectConversation(conversation: Conversation) {
    setCurrentConversationId(conversation.id);
    applySelections(conversation.selected);
    void fetchMessages(conversation.id);
  }

  function handleNewConversation() {
    setCurrentConversationId(null);
    setMessages([]);
    setInputText('');
    if (bootstrap) {
      resetToBootstrapDefaults(bootstrap);
    }
  }

  function handleToggleFixedMode(fixedModeId: string) {
    if (!bootstrap) return;

    if (selectedFixedModeId === fixedModeId) {
      setSelectedFixedModeId(null);
      setSelectedModelViewId(bootstrap.defaults.modelViewId || '');
      setSelectedModeId(bootstrap.defaults.modeId);
      setSelectedLengthId(bootstrap.defaults.lengthPresetId || '');
      return;
    }

    const fixedMode = bootstrap.fixedModes.find((item) => item.id === fixedModeId);
    if (!fixedMode) return;

    setSelectedFixedModeId(fixedMode.id);
    setSelectedModeId(null);
    setSelectedModelViewId(fixedMode.modelViewId);
    setSelectedLengthId(fixedMode.lengthPresetId || bootstrap.defaults.lengthPresetId || '');
  }

  async function sendChatRequest(body: Record<string, unknown>): Promise<Response> {
    let res: Response | null = null;
    let lastNetworkError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        res = await fetch('/api/content-tools/rewrite/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        lastNetworkError = null;
        break;
      } catch (error) {
        lastNetworkError = error;
        if (!isTransientFetchError(error) || attempt === 1) throw error;
        await sleep(700);
      }
    }

    if (!res) {
      throw (lastNetworkError instanceof Error ? lastNetworkError : new Error('发送失败，请稍后重试'));
    }

    if (!res.ok) {
      const error = new Error(await readApiError(res, '发送失败，请稍后重试'));
      (error as Error & { status?: number }).status = res.status;
      throw error;
    }

    return res;
  }

  function applyChatResponse(data: Record<string, unknown>, tempMessageId: string) {
    const returnedConversationId = (data.conversation as Record<string, unknown>)?.id || data.conversationId;
    if (data.conversation) {
      const nextConversation = data.conversation as Conversation;
      setConversations((prev) => upsertConversation(prev, nextConversation));
      applySelections(nextConversation.selected);
    }

    if (returnedConversationId && returnedConversationId !== currentConversationId) {
      setCurrentConversationId(returnedConversationId as string);
    }

    if (!data.conversation) {
      void fetchConversations();
    }

    if (data.message) {
      setMessages((prev) => {
        const tempUserMsg = prev.find((item) => item.id === tempMessageId);
        const filtered = prev.filter((item) => item.id !== tempMessageId);

        if (tempUserMsg) {
          const resolvedUserMsg = {
            ...tempUserMsg,
            conversationId: (returnedConversationId as string) || tempUserMsg.conversationId,
          };
          return [...filtered, resolvedUserMsg, data.message as Message];
        }

        return [...filtered, data.message as Message];
      });
    }
  }

  async function handleSend() {
    if (!inputText.trim() || isSending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId: currentConversationId || '',
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
      generationMode: 'single',
      status: 'success',
      requestSnapshot: null,
      errorMessage: null,
      structuredResult: null,
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      const res = await sendChatRequest({
        conversationId: currentConversationId,
        message: textToSend,
        autoModeEnabled: false,
        fixedModeId: selectedFixedModeId,
        modelViewId: selectedModelViewId,
        modeId: selectedFixedModeId ? null : selectedModeId,
        lengthPresetId: selectedLengthId,
      });
      const data = await res.json();
      applyChatResponse(data, tempMessage.id);
    } catch (error) {
      console.error('发送消息失败', error);
      const title =
        error instanceof Error && 'status' in error && typeof error.status === 'number'
          ? toStatusTitle(error.status)
          : '发送失败';
      const errorMessage = error instanceof Error ? error.message : '发送失败，请稍后重试';
      setMessages((prev) => {
        const filtered = prev.filter((item) => item.id !== tempMessage.id);
        return [
          ...filtered,
          {
            id: `error-${Date.now()}`,
            conversationId: currentConversationId || '',
            role: 'system_note',
            content: `⚠️ ${title}：${errorMessage}。已为你恢复输入内容。`,
            createdAt: new Date().toISOString(),
            generationMode: null,
            status: 'failed',
            requestSnapshot: null,
            errorMessage,
            structuredResult: null,
          },
        ];
      });
      setInputText(textToSend);
    } finally {
      setIsSending(false);
    }
  }

  function handleCopy(key: string, text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  }

  if (errorState) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f8fafc]">
        <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl">
            ⚠️
          </div>
          <h3 className="mb-2 text-[15px] font-bold text-slate-900">{errorState.title}</h3>
          <p className="text-[13px] text-slate-500">{errorState.message}</p>
        </div>
      </div>
    );
  }

  if (loading || !bootstrap) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm font-medium text-slate-500">正在加载工作台...</span>
        </div>
      </div>
    );
  }

  const lastAssistantMessage =
    [...messages].reverse().find((item) => item.role === 'assistant') ?? null;
  const followUpSuggestions = lastAssistantMessage?.structuredResult?.final?.followUpSuggestions ?? [];

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-slate-100/70 text-slate-800">
      <aside className="flex w-[300px] min-h-0 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-blue-700 to-cyan-500 shadow-lg shadow-blue-500/10">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight text-slate-900">{bootstrap.feature.label}</h1>
              <p className="mt-0.5 text-[12px] text-slate-500">固定套餐更稳，普通自定义更自由</p>
            </div>
          </div>

          <button
            onClick={handleNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            新建会话
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                <MessageSquare className="h-5 w-5 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600">暂无历史会话</p>
              <p className="mt-1 text-[12px] leading-5 text-slate-400">在右侧发一条文案，就会自动生成会话记录。</p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const active = currentConversationId === conversation.id;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => handleSelectConversation(conversation)}
                  className={cn(
                    'w-full rounded-3xl border px-4 py-4 text-left transition',
                    active
                      ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10'
                      : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm font-semibold', active ? 'text-white' : 'text-slate-900')}>
                        {conversation.title || '新会话'}
                      </p>
                      <p className={cn('mt-2 text-[12px]', active ? 'text-white/70' : 'text-slate-500')}>
                        {new Date(conversation.updatedAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        active ? 'bg-white/12 text-white' : 'bg-white text-slate-500',
                      )}
                    >
                      {getConversationTag(conversation)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <main className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto,minmax(0,1fr),auto]">
        <header className="border-b border-slate-200 bg-white/92 px-6 py-5 backdrop-blur">
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">Rewrite Modes</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">固定能力按钮替代旧自动模式</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  选中固定套餐时，会锁定后台绑定的模型、提示词和字数；取消后回到普通自定义模式。
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                {activeFixedMode ? `${activeFixedMode.name} 已生效` : '当前是普通自定义模式'}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {bootstrap.fixedModes.map((fixedMode, index) => {
                const active = fixedMode.id === selectedFixedModeId;
                const palette =
                  index === 0
                    ? {
                        active: 'border-sky-300 bg-gradient-to-br from-sky-50 to-white text-sky-900 shadow-[0_12px_36px_-18px_rgba(14,165,233,0.55)]',
                        badge: 'bg-sky-100 text-sky-700',
                        dot: 'bg-sky-500',
                      }
                    : {
                        active: 'border-rose-300 bg-gradient-to-br from-rose-50 to-white text-rose-900 shadow-[0_12px_36px_-18px_rgba(244,63,94,0.45)]',
                        badge: 'bg-rose-100 text-rose-700',
                        dot: 'bg-rose-500',
                      };

                return (
                  <button
                    key={fixedMode.id}
                    type="button"
                    onClick={() => handleToggleFixedMode(fixedMode.id)}
                    className={cn(
                      'rounded-3xl border px-5 py-4 text-left transition',
                      active ? palette.active : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={cn('h-2.5 w-2.5 rounded-full', active ? palette.dot : 'bg-slate-300')} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-bold">{fixedMode.name}</span>
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', active ? palette.badge : 'bg-white text-slate-500')}>
                              固定套餐
                            </span>
                          </div>
                          <p className={cn('mt-1 text-[13px] leading-5', active ? 'text-current/75' : 'text-slate-500')}>
                            {fixedMode.description || '后台会固定绑定模型与提示词。'}
                          </p>
                        </div>
                      </div>
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold',
                          active ? 'border-current/15 bg-white/70' : 'border-slate-200 bg-white text-slate-400',
                        )}
                      >
                        {active ? <Check className="h-4 w-4" /> : index + 1}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                <SlidersHorizontal className="h-4 w-4" />
                普通自定义区
              </div>
              {customControlsLocked ? (
                <div className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                  <Lock className="h-4 w-4" />
                  {activeFixedMode?.name} 已锁定普通模型、普通模式和字数配置。取消按钮选择后恢复自定义。
                </div>
              ) : (
                <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
                  当前是普通自定义模式，可以自由选择模型、模式和字数。
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">展示模型</span>
                  <select
                    value={selectedModelViewId}
                    onChange={(event) => setSelectedModelViewId(event.target.value)}
                    disabled={customControlsLocked}
                    className={cn(
                      'w-full rounded-2xl border bg-white px-4 py-3 text-sm font-medium outline-none transition',
                      customControlsLocked
                        ? 'cursor-not-allowed border-slate-200 text-slate-400'
                        : 'border-slate-200 text-slate-700 focus:border-slate-400',
                    )}
                  >
                    {bootstrap.modelViews.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">普通模式</span>
                  <select
                    value={selectedModeId || ''}
                    onChange={(event) => setSelectedModeId(event.target.value || null)}
                    disabled={customControlsLocked}
                    className={cn(
                      'w-full rounded-2xl border bg-white px-4 py-3 text-sm font-medium outline-none transition',
                      customControlsLocked
                        ? 'cursor-not-allowed border-slate-200 text-slate-400'
                        : 'border-slate-200 text-slate-700 focus:border-slate-400',
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

                <label className="space-y-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">字数</span>
                  <select
                    value={selectedLengthId}
                    onChange={(event) => setSelectedLengthId(event.target.value)}
                    disabled={customControlsLocked}
                    className={cn(
                      'w-full rounded-2xl border bg-white px-4 py-3 text-sm font-medium outline-none transition',
                      customControlsLocked
                        ? 'cursor-not-allowed border-slate-200 text-slate-400'
                        : 'border-slate-200 text-slate-700 focus:border-slate-400',
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
        </header>

        <section className="min-h-0 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex min-h-full max-w-5xl flex-col">
            {messagesLoading ? (
              <div className="flex flex-1 items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-300 border-t-slate-900" />
                  <span className="text-[13px] text-slate-500">正在加载对话内容...</span>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-[32px] border border-dashed border-slate-200 bg-white/80 px-8 py-14 text-center shadow-sm">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-slate-900 via-blue-700 to-cyan-500 shadow-xl shadow-blue-500/10">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                  {activeFixedMode ? `${activeFixedMode.name} 已准备好` : '普通自定义模式已准备好'}
                </h3>
                <p className="mt-3 max-w-2xl text-[15px] leading-7 text-slate-500">
                  {activeFixedMode
                    ? `现在直接贴原文即可，我会按“${activeFixedMode.name}”的固定套餐来改写。`
                    : '现在可以自由选择展示模型、普通模式和字数，然后直接开始改写。'}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setInputText('把这段财经口播改得更顺、更抓人：\n')}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    口播顺一点
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputText('保留专业边界，但把结构重新整理清楚：\n')}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    结构拉清楚
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputText('给我 3 个可直接发布的版本：\n')}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    直接出 3 版
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 pb-10">
                {messages.map((message) => {
                  if (message.role === 'user') {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[82%] rounded-[28px] rounded-tr-md bg-slate-900 px-5 py-4 text-[15px] leading-7 text-white shadow-lg shadow-slate-900/10">
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>
                    );
                  }

                  if (message.role === 'system_note') {
                    return (
                      <div key={message.id} className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-800">
                        {message.content}
                      </div>
                    );
                  }

                  const responseMode = getMessageResponseMode(message);
                  const versions = message.structuredResult?.final?.versions ?? [];
                  const displayMeta = getMessageDisplayMeta(message, bootstrap);
                  const chatText =
                    message.structuredResult?.final?.recommendedText?.trim() || message.content.trim();

                  return (
                    <div key={message.id} className="flex gap-4">
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-blue-700 to-cyan-500 shadow-lg shadow-blue-500/10">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1 rounded-[30px] border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[15px] font-bold text-slate-900">
                                {responseMode === 'chat' ? '继续对话' : '改写结果'}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                {displayMeta.badge}
                              </span>
                            </div>
                            <p className="mt-1 text-[12px] text-slate-500">{displayMeta.summary}</p>
                          </div>
                          <span className="text-[12px] text-slate-400">
                            {new Date(message.createdAt).toLocaleString('zh-CN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div className="space-y-4 px-5 py-5">
                          {responseMode === 'versions' && versions.length > 0 ? (
                            versions.map((version, index) => {
                              const copyKey = `${message.id}-${index}`;
                              const copied = copiedKey === copyKey;

                              return (
                                <div
                                  key={copyKey}
                                  className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 transition hover:border-slate-300 hover:bg-white"
                                >
                                  <div className="mb-4 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-[11px] font-black text-slate-700 shadow-sm">
                                        {index + 1}
                                      </span>
                                      <h3 className="text-[15px] font-bold text-slate-900">
                                        {version.title || `版本${index + 1}`}
                                      </h3>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(copyKey, version.content)}
                                      className={cn(
                                        'flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition',
                                        copied
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900',
                                      )}
                                    >
                                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                      {copied ? '已复制' : '复制'}
                                    </button>
                                  </div>
                                  <p className="whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
                                    {version.content}
                                  </p>
                                </div>
                              );
                            })
                          ) : (
                            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 text-[15px] leading-8 text-slate-700">
                              <p className="whitespace-pre-wrap">{chatText || '...'}</p>
                            </div>
                          )}

                          {responseMode === 'versions' && message.structuredResult?.final?.notes?.length ? (
                            <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-3">
                              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                改写说明
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {message.structuredResult.final.notes.map((note, index) => (
                                  <span
                                    key={`${message.id}-note-${index}`}
                                    className="rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-600"
                                  >
                                    {note}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isSending ? (
                  <div className="flex gap-4">
                    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-blue-700 to-cyan-500 shadow-lg shadow-blue-500/10">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                    <div className="flex-1 rounded-[30px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        <div className="flex gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                        </div>
                        正在生成改写结果...
                      </div>
                    </div>
                  </div>
                ) : null}

                {!isSending && followUpSuggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pl-[52px]">
                    {followUpSuggestions.slice(0, 4).map((suggestion, index) => (
                      <button
                        key={`${suggestion}-${index}`}
                        type="button"
                        onClick={() => setInputText(suggestion)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </section>

        <footer className="border-t border-slate-200 bg-white/94 px-6 py-4 backdrop-blur">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-[30px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 text-[12px] text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  {activeFixedMode ? activeFixedMode.name : '普通自定义'}
                </span>
                <span>{selectedModelLabel}</span>
                <span>/</span>
                <span>{activeFixedMode ? '固定提示词' : selectedModeLabel}</span>
                <span>/</span>
                <span>{selectedLengthLabel}</span>
              </div>

              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={isSending}
                  className={cn(
                    'min-h-[128px] w-full resize-none bg-transparent px-4 pb-16 pt-4 text-[15px] leading-7 text-slate-900 outline-none placeholder:text-slate-400',
                    isSending && 'cursor-not-allowed opacity-60',
                  )}
                  placeholder={
                    activeFixedMode
                      ? `请直接粘贴原文，我会按“${activeFixedMode.name}”固定套餐改写。`
                      : '请输入原文或继续追问，例如：保留专业感，但开头更抓人。'
                  }
                />

                <div className="absolute bottom-3 left-4 text-[12px] text-slate-400">
                  Enter 发送，Shift + Enter 换行
                </div>

                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!inputText.trim() || isSending}
                  className={cn(
                    'absolute bottom-3 right-3 flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition',
                    !inputText.trim() || isSending
                      ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                      : 'bg-slate-900 text-white hover:bg-slate-800',
                  )}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {isSending ? '发送中...' : '发送'}
                </button>
              </div>
            </div>

            <p className="mt-3 text-center text-[11px] font-medium tracking-wide text-slate-400">
              生成结果仅供参考，请按账号人设和事实边界再做一轮确认。
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
