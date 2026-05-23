import { useState, useEffect, useRef } from 'react';
import type { BootstrapPayload, Conversation, Message } from '../types';

export type RewriteStreamEvent =
  | { type: 'meta'; responseMode: 'chat' | 'versions'; conversationId: string | null }
  | { type: 'preview'; preview: string; responseMode: 'chat' | 'versions' }
  | {
      type: 'final';
      payload: { conversation: Conversation; message: Message };
      responseMode: 'chat' | 'versions';
      conversationId: string | null;
    }
  | { type: 'error'; error: string };

export function readApiError(response: Response, fallback: string): Promise<string> {
  return response.json().then(
    (data) => {
      if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
      if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
      return fallback;
    },
    () => fallback
  );
}

export function toStatusTitle(status: number) {
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
      new Date(left.lastMessageAt || left.updatedAt).getTime()
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

export function buildRequestSnapshot(input: {
  fixedModeId: string | null;
  modelViewId: string | null;
  modeId: string | null;
  lengthPresetId: string | null;
}) {
  return {
    autoModeEnabled: false,
    fixedModeId: input.fixedModeId,
    modelViewId: input.modelViewId,
    modeId: input.modeId,
    lengthPresetId: input.lengthPresetId,
    workflowId: null,
  };
}

export function buildStreamingStructuredResult(
  preview: string,
  responseMode: 'chat' | 'versions',
  requestSnapshot: Message['requestSnapshot']
) {
  return {
    generationMode: 'single' as const,
    status: 'success' as const,
    selected: {
      autoModeEnabled: false,
      fixedModeId: requestSnapshot?.fixedModeId ?? null,
      modelViewId: requestSnapshot?.modelViewId ?? null,
      modeId: requestSnapshot?.modeId ?? null,
      lengthPresetId: requestSnapshot?.lengthPresetId ?? null,
      workflowId: null,
      fixedMode: null,
      modelView: null,
      mode: null,
      lengthPreset: null,
      workflow: null,
    },
    snapshots: {
      featureSystemPrompt: null,
      fixedModePrompt: null,
      modePrompt: null,
      lengthPrompt: null,
    },
    steps: [],
    final:
      responseMode === 'versions'
        ? {
            responseMode: 'versions' as const,
            title: null,
            summary: null,
            versions: preview
              ? [
                  {
                    title: '主版本',
                    content: preview.replace(/^主版本\s*/u, '').trim() || preview.trim(),
                  },
                ]
              : [],
            notes: [],
            followUpSuggestions: [],
            recommendedText: preview.replace(/^主版本\s*/u, '').trim() || preview.trim(),
          }
        : {
            responseMode: 'chat' as const,
            title: null,
            summary: null,
            versions: [],
            notes: [],
            followUpSuggestions: [],
            recommendedText: preview.trim(),
          },
  };
}

export function useRewriteLogic() {
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
  const currentConversationIdRef = useRef<string | null>(null);
  const messageCacheRef = useRef(new Map<string, Message[]>());
  const pendingFetchRef = useRef(new Map<string, Promise<void>>());
  const hasAssistantMessages = messages.some(
    (item) => item.role === 'assistant' && !item.id.startsWith('stream-')
  );
  const isChatStage = hasAssistantMessages;
  const interactionControlsDisabled = isSending;

  const activeFixedMode =
    bootstrap?.fixedModes.find((item) => item.id === selectedFixedModeId) ?? null;
  const customControlsLocked = Boolean(activeFixedMode) || isSending;
  
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

  function resetToChatStageDefaults(nextBootstrap: BootstrapPayload) {
    setSelectedFixedModeId(null);
    setSelectedModelViewId('');
    setSelectedModeId(null);
    setSelectedLengthId(nextBootstrap.defaults.lengthPresetId || '');
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, messagesLoading, isSending]);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

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
    // fetchConversations 只在首屏初始化使用一次，这里保持稳定首屏行为。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cacheConversationMessages(conversationId: string, nextMessages: Message[]) {
    messageCacheRef.current.set(conversationId, nextMessages);
  }

  async function fetchConversations() {
    try {
      const res = await fetch('/api/content-tools/rewrite/conversations?limit=30', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(await readApiError(res, '会话列表加载失败'));
      }
      const data = await res.json();
      if (data?.conversations) {
        const nextConversations = sortConversations(data.conversations);
        setConversations(nextConversations);
        nextConversations.slice(0, 3).forEach((conversation) => {
          void prefetchConversation(conversation.id);
        });
      }
    } catch (error) {
      console.warn('⚠️ 获取会话列表失败', error);
    }
  }

  async function fetchMessages(
    conversationId: string,
    options?: { silent?: boolean; applyToView?: boolean }
  ) {
    const existing = pendingFetchRef.current.get(conversationId);
    if (existing) {
      await existing;
      return;
    }

    const task = (async () => {
      if (!options?.silent) {
        setMessagesLoading(true);
      }
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
        const nextConversation = data?.conversation as Conversation | undefined;
        const nextMessages = (data?.messages ?? []) as Message[];

        if (nextConversation) {
          setConversations((prev) => upsertConversation(prev, nextConversation));
        }

        cacheConversationMessages(conversationId, nextMessages);

        if (options?.applyToView && currentConversationIdRef.current === conversationId) {
          if (nextConversation?.selected) {
            applySelections(nextConversation.selected);
          }
          setMessages(nextMessages);
        }
      } catch (error) {
        if (options?.silent) {
          console.warn('⚠️ 预取消息失败', error);
          return;
        }

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
        if (!options?.silent) {
          setMessagesLoading(false);
        }
        pendingFetchRef.current.delete(conversationId);
      }
    })();

    pendingFetchRef.current.set(conversationId, task);
    await task;
  }

  function handleSelectConversation(conversation: Conversation) {
    currentConversationIdRef.current = conversation.id;
    setCurrentConversationId(conversation.id);
    applySelections(conversation.selected);
    const cached = messageCacheRef.current.get(conversation.id);
    if (cached) {
      setMessages(cached);
      setMessagesLoading(false);
      void fetchMessages(conversation.id, { silent: true, applyToView: true });
      return;
    }

    setMessages([]);
    void fetchMessages(conversation.id, { applyToView: true });
  }

  function handleNewConversation() {
    currentConversationIdRef.current = null;
    setCurrentConversationId(null);
    setMessages([]);
    setMessagesLoading(false);
    setInputText('');
    if (bootstrap) {
      resetToBootstrapDefaults(bootstrap);
    }
  }

  async function prefetchConversation(conversationIdOrItem: string | Conversation) {
    const conversationId =
      typeof conversationIdOrItem === 'string' ? conversationIdOrItem : conversationIdOrItem.id;
    if (messageCacheRef.current.has(conversationId) || pendingFetchRef.current.has(conversationId)) {
      return;
    }
    await fetchMessages(conversationId, { silent: true, applyToView: false });
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

  async function sendStreamingChatRequest(body: Record<string, unknown>): Promise<Response> {
    let res: Response | null = null;
    let lastNetworkError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        res = await fetch('/api/content-tools/rewrite/chat/stream', {
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

  function applyChatResponse(data: { conversation?: Conversation; message?: Message }, tempMessageId: string, tempAssistantId: string) {
    const returnedConversationId = data.conversation?.id || data.message?.conversationId || null;
    if (data.conversation) {
      const nextConversation = data.conversation;
      setConversations((prev) => upsertConversation(prev, nextConversation));
      applySelections(nextConversation.selected);
    }

    if (returnedConversationId && returnedConversationId !== currentConversationId) {
      setCurrentConversationId(returnedConversationId);
    }

    if (!data.conversation) {
      void fetchConversations();
    }

    if (data.message) {
      setMessages((prev) => {
        const tempUserMsg = prev.find((item) => item.id === tempMessageId);
        const filtered = prev.filter((item) => item.id !== tempMessageId && item.id !== tempAssistantId);

        if (tempUserMsg) {
          const resolvedUserMsg = {
            ...tempUserMsg,
            conversationId: returnedConversationId || tempUserMsg.conversationId,
          };
          const nextMessages = [...filtered, resolvedUserMsg, data.message as Message];
          if (returnedConversationId) {
            cacheConversationMessages(returnedConversationId, nextMessages);
          }
          return nextMessages;
        }

        const nextMessages = [...filtered, data.message as Message];
        if (returnedConversationId) {
          cacheConversationMessages(returnedConversationId, nextMessages);
        }
        return nextMessages;
      });
    }
  }

  async function handleSend(overrideText?: string) {
    const textToSend = (overrideText || inputText).trim();
    if (!textToSend || isSending || !bootstrap) return;

    const wasChatStage = isChatStage;
    const responseMode: 'chat' | 'versions' = isChatStage ? 'chat' : 'versions';
    const requestSnapshot = buildRequestSnapshot({
      fixedModeId: selectedFixedModeId,
      modelViewId: selectedModelViewId || null,
      modeId: selectedFixedModeId ? null : selectedModeId,
      lengthPresetId: selectedLengthId || bootstrap.defaults.lengthPresetId,
    });
    setInputText('');
    setIsSending(true);

    const tempMessageId = `temp-${Date.now()}`;
    const tempAssistantId = `stream-${Date.now()}`;
    const tempMessage: Message = {
      id: tempMessageId,
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
    const tempAssistantMessage: Message = {
      id: tempAssistantId,
      conversationId: currentConversationId || '',
      role: 'assistant',
      content: responseMode === 'versions' ? '正在生成主版本...' : '',
      createdAt: new Date().toISOString(),
      generationMode: 'single',
      status: 'success',
      requestSnapshot,
      errorMessage: null,
      structuredResult: buildStreamingStructuredResult(
        responseMode === 'versions' ? '正在生成主版本...' : '',
        responseMode,
        requestSnapshot,
      ),
    };
    setMessages((prev) => [...prev, tempMessage, tempAssistantMessage]);

    try {
      const res = await sendStreamingChatRequest({
        conversationId: currentConversationId,
        message: textToSend,
        autoModeEnabled: false,
        fixedModeId: requestSnapshot.fixedModeId,
        modelViewId: requestSnapshot.modelViewId,
        modeId: requestSnapshot.modeId,
        lengthPresetId: requestSnapshot.lengthPresetId,
      });
      if (!res.body) {
        throw new Error('流式响应为空');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalPayload: { conversation: Conversation; message: Message } | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            const event = JSON.parse(line) as RewriteStreamEvent;

            if (event.type === 'preview') {
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === tempAssistantId
                    ? {
                        ...item,
                        content: event.preview,
                        structuredResult: buildStreamingStructuredResult(
                          event.preview,
                          event.responseMode,
                          requestSnapshot,
                        ),
                      }
                    : item,
                )
              );
              continue;
            }

            if (event.type === 'final') {
              finalPayload = event.payload;
              continue;
            }

            if (event.type === 'error') {
              throw new Error(event.error);
            }
          }
        }

        if (done) {
          break;
        }
      }

      if (!finalPayload) {
        throw new Error('未收到最终结果');
      }

      applyChatResponse(finalPayload, tempMessageId, tempAssistantId);
      if (!wasChatStage) {
        resetToChatStageDefaults(bootstrap);
      }
    } catch (error) {
      console.error('发送消息失败', error);
      const title =
        error instanceof Error && 'status' in error && typeof error.status === 'number'
          ? toStatusTitle(error.status)
          : '发送失败';
      const errorMessage = error instanceof Error ? error.message : '发送失败，请稍后重试';
      setMessages((prev) => {
        const filtered = prev.filter((item) => item.id !== tempMessageId && item.id !== tempAssistantId);
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

  return {
    state: {
      bootstrap,
      loading,
      errorState,
      selectedFixedModeId,
      selectedModelViewId,
      selectedModeId,
      selectedLengthId,
      inputText,
      copiedKey,
      conversations,
      currentConversationId,
      messages,
      isSending,
      messagesLoading,
      messagesEndRef,
      isChatStage,
      interactionControlsDisabled,
      activeFixedMode,
      customControlsLocked,
    },
    actions: {
      setSelectedFixedModeId,
      setSelectedModelViewId,
      setSelectedModeId,
      setSelectedLengthId,
      setInputText,
      handleSelectConversation,
      handleNewConversation,
      handleToggleFixedMode,
      handleSend,
      handleCopy,
      prefetchConversation,
    }
  };
}
