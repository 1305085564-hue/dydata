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

export type RewriteV2StreamEvent =
  | { type: 'generation_start'; runId: string }
  | { type: 'content_delta'; delta: string }
  | { type: 'generation_complete'; runId: string; revisionId: string; fullContent: string }
  | { type: 'error'; error: string };

export type DocumentParagraph = {
  id: string;
  revisionId: string;
  paragraphId: string;
  position: number;
  content: string;
  isLocked: boolean;
  sourceType: 'ai' | 'user' | 'original';
  createdAt: string;
};

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

function buildV2Conversation(input: {
  conversationId: string;
  bootstrap: BootstrapPayload;
  title?: string;
}): Conversation {
  const now = new Date().toISOString();
  return {
    id: input.conversationId,
    title: input.title || '新文案画布',
    schemaVersion: 2,
    selected: {
      autoModeEnabled: false,
      fixedModeId: null,
      modelViewId: null,
      modeId: null,
      lengthPresetId: input.bootstrap.defaults.lengthPresetId,
      fixedMode: null,
      modelView: null,
      mode: null,
      lengthPreset: null,
    },
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  };
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

  // New States for Double-column Workspace
  const [activeOriginalDraft, setActiveOriginalDraft] = useState('');
  const [polishedText, setPolishedText] = useState('');
  const [documentParagraphs, setDocumentParagraphs] = useState<DocumentParagraph[]>([]);

  // Advanced UX States
  const [availableV2Skills, setAvailableV2Skills] = useState<Array<{ id: string; name: string }>>([]);
  const [activeSkills, setActiveSkills] = useState<Array<{ id: string; name: string }>>([]);
  const [activeMentions, setActiveMentions] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState<Set<string>>(new Set());
  const [traceabilityMode, setTraceabilityMode] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
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
  const currentConversation = currentConversationId
    ? conversations.find((item) => item.id === currentConversationId) ?? null
    : null;
  const currentSchemaVersion = currentConversation?.schemaVersion ?? 1;
  const isV2Conversation = currentSchemaVersion === 2;
  
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

  // Sync original draft and polished text based on message stream
  useEffect(() => {
    if (messages.length === 0) {
      setActiveOriginalDraft('');
      setPolishedText('');
      setDocumentParagraphs([]);
      return;
    }

    // 1. Find the first User message content as the original draft baseline
    const firstUserMsg = messages.find((m) => m.role === 'user');
    if (firstUserMsg) {
      setActiveOriginalDraft(firstUserMsg.content);
    } else {
      setActiveOriginalDraft('');
    }

    // 2. Find the last Assistant message content (including currently streaming ones)
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    if (assistantMsgs.length > 0) {
      const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
      const recommendedText = lastAssistant.structuredResult?.final?.recommendedText ?? '';
      const firstVersion = lastAssistant.structuredResult?.final?.versions?.[0]?.content ?? '';
      setPolishedText(recommendedText || firstVersion || lastAssistant.content || '');
    } else {
      setPolishedText('');
    }
  }, [messages]);

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
    void fetchV2Skills();
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

  async function fetchV2Skills() {
    try {
      const res = await fetch('/api/rewrite/skills', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(await readApiError(res, '技能列表加载失败'));
      }
      const data = await res.json();
      const skills = (data?.skills ?? []) as Array<{ id: string; name: string }>;
      setAvailableV2Skills(skills.map((skill) => ({ id: skill.id, name: skill.name })));
    } catch (error) {
      console.warn('⚠️ v2 技能列表加载失败', error);
      setAvailableV2Skills([]);
    }
  }

  async function fetchV2ConversationSkills(conversationId: string) {
    try {
      const res = await fetch(`/api/rewrite/conversations/${conversationId}/skills`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(await readApiError(res, '会话技能加载失败'));
      }
      const data = await res.json();
      const skills = (data?.skills ?? []) as Array<{ skill: { id: string; name: string }; isActive: boolean }>;
      setActiveSkills(
        skills
          .filter((item) => item.isActive)
          .map((item) => ({ id: item.skill.id, name: item.skill.name })),
      );
    } catch (error) {
      console.warn('⚠️ v2 会话技能加载失败', error);
      setActiveSkills([]);
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

  async function fetchV2Paragraphs(conversationId: string) {
    try {
      const res = await fetch(`/api/rewrite/documents/${conversationId}/paragraphs`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(await readApiError(res, '文档段落加载失败'));
      }
      const data = await res.json();
      const paragraphs = (data?.paragraphs ?? []) as DocumentParagraph[];
      setDocumentParagraphs(paragraphs);
      setPolishedText(paragraphs.map((paragraph) => paragraph.content).join('\n\n'));
    } catch (error) {
      console.warn('⚠️ v2 文档段落加载失败', error);
      setDocumentParagraphs([]);
    }
  }

  function handleSelectConversation(conversation: Conversation) {
    currentConversationIdRef.current = conversation.id;
    setCurrentConversationId(conversation.id);
    applySelections(conversation.selected);
    if ((conversation.schemaVersion ?? 1) === 2) {
      setMessages([]);
      setActiveMentions([]);
      void fetchV2Paragraphs(conversation.id);
      void fetchV2ConversationSkills(conversation.id);
      return;
    }
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
    setDocumentParagraphs([]);
    setActiveSkills([]);
    setActiveMentions([]);
    setSelectedParagraphIds(new Set());
    setMessagesLoading(false);
    setInputText('');
    if (bootstrap) {
      resetToBootstrapDefaults(bootstrap);
    }
  }

  async function handleNewV2Conversation() {
    if (!bootstrap || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch('/api/rewrite/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新文案画布' }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, '创建 v2 会话失败'));
      }

      const payload = await res.json();
      const conversationId = payload?.data?.conversationId as string | undefined;
      if (!conversationId) {
        throw new Error('创建 v2 会话失败：未返回 conversationId');
      }

      const conversation = buildV2Conversation({ conversationId, bootstrap });
      currentConversationIdRef.current = conversationId;
      setCurrentConversationId(conversationId);
      setConversations((prev) => upsertConversation(prev, conversation));
      setMessages([]);
      setDocumentParagraphs([]);
      setActiveSkills([]);
      setActiveMentions([]);
      setSelectedParagraphIds(new Set());
      setPolishedText('');
      setActiveOriginalDraft('');
      setInputText('');
    } catch (error) {
      setErrorState({
        title: '创建 v2 会话失败',
        message: error instanceof Error ? error.message : '创建失败，请稍后重试',
      });
    } finally {
      setIsSending(false);
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

  function parseSseBlocks(buffer: string) {
    const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
    return {
      completeBlocks: blocks.slice(0, -1),
      rest: blocks.at(-1) ?? '',
    };
  }

  function parseV2SseEvent(block: string): RewriteV2StreamEvent | null {
    const dataLines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) return null;
    return JSON.parse(dataLines.join('\n')) as RewriteV2StreamEvent;
  }

  async function handleSendV2(
    textToSend: string,
    options?: { targetParagraphIds?: string[] },
  ) {
    let conversationId = currentConversationId;
    if (!conversationId) {
      await handleNewV2Conversation();
      conversationId = currentConversationIdRef.current;
    }
    if (!conversationId) {
      throw new Error('未能创建 v2 会话');
    }

    const tempMessageId = `temp-v2-${Date.now()}`;
    const tempAssistantId = `stream-v2-${Date.now()}`;
    const requestSnapshot = buildRequestSnapshot({
      fixedModeId: null,
      modelViewId: null,
      modeId: null,
      lengthPresetId: selectedLengthId || bootstrap?.defaults.lengthPresetId || null,
    });

    setMessages((prev) => [
      ...prev,
      {
        id: tempMessageId,
        conversationId,
        role: 'user',
        content: textToSend,
        createdAt: new Date().toISOString(),
        generationMode: 'single',
        status: 'success',
        requestSnapshot: null,
        errorMessage: null,
        structuredResult: null,
      },
      {
        id: tempAssistantId,
        conversationId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        generationMode: 'single',
        status: 'success',
        requestSnapshot,
        errorMessage: null,
        structuredResult: buildStreamingStructuredResult('', 'chat', requestSnapshot),
      },
    ]);

    const res = await fetch('/api/rewrite/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        userPrompt: textToSend,
        targetParagraphIds: options?.targetParagraphIds ?? [],
        assetMentions: activeMentions,
      }),
    });

    if (!res.ok) {
      throw new Error(await readApiError(res, '生成失败，请稍后重试'));
    }
    if (!res.body) {
      throw new Error('流式响应为空');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamedText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const parsed = parseSseBlocks(buffer);
        buffer = parsed.rest;

        for (const block of parsed.completeBlocks) {
          const event = parseV2SseEvent(block);
          if (!event) continue;

          if (event.type === 'content_delta') {
            streamedText += event.delta;
            setPolishedText(streamedText);
            setMessages((prev) =>
              prev.map((item) =>
                item.id === tempAssistantId
                  ? {
                      ...item,
                      content: streamedText,
                      structuredResult: buildStreamingStructuredResult(streamedText, 'chat', requestSnapshot),
                    }
                  : item,
              ),
            );
          }

          if (event.type === 'generation_complete') {
            streamedText = event.fullContent;
            setPolishedText(event.fullContent);
            void fetchV2Paragraphs(conversationId);
          }

          if (event.type === 'error') {
            throw new Error(event.error);
          }
        }
      }

      if (done) break;
    }
  }

  async function handleSend(
    overrideText?: string,
    options?: { targetParagraphIds?: string[] },
  ) {
    const textToSend = (overrideText || inputText).trim();
    if (!textToSend || isSending || !bootstrap) return;

    if (isV2Conversation) {
      setInputText('');
      setIsSending(true);
      try {
        await handleSendV2(textToSend, options);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '发送失败，请稍后重试';
        setMessages((prev) => [
          ...prev.filter((item) => !item.id.startsWith('temp-v2-') && !item.id.startsWith('stream-v2-')),
          {
            id: `error-v2-${Date.now()}`,
            conversationId: currentConversationId || '',
            role: 'system_note',
            content: `⚠️ 发送失败：${errorMessage}。已为你恢复输入内容。`,
            createdAt: new Date().toISOString(),
            generationMode: null,
            status: 'failed',
            requestSnapshot: null,
            errorMessage,
            structuredResult: null,
          },
        ]);
        setInputText(textToSend);
      } finally {
        setIsSending(false);
      }
      return;
    }

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

  function handleReloadAsInput(text: string) {
    handleNewConversation();
    setInputText(text);
    setActiveOriginalDraft(text);
  }

  function handleUpdateLastAssistantMessage(newText: string) {
    setMessages((prev) => {
      const next = [...prev];
      const lastAssistantIdx = [...next].reverse().findIndex((m) => m.role === 'assistant');
      if (lastAssistantIdx !== -1) {
        const actualIdx = next.length - 1 - lastAssistantIdx;
        const target = next[actualIdx];

        const updatedStructuredResult = target.structuredResult
          ? {
              ...target.structuredResult,
              final: {
                ...target.structuredResult.final,
                recommendedText: newText,
                versions: target.structuredResult.final.versions.map((v, idx) =>
                  idx === 0 ? { ...v, content: newText } : v
                ),
              },
            }
          : null;

        next[actualIdx] = {
          ...target,
          content: newText,
          structuredResult: updatedStructuredResult,
        };

        if (currentConversationIdRef.current) {
          cacheConversationMessages(currentConversationIdRef.current, next);
        }
      }
      return next;
    });
  }

  async function handleToggleParagraphLock(paragraph: DocumentParagraph) {
    const nextLocked = !paragraph.isLocked;
    setDocumentParagraphs((prev) =>
      prev.map((item) => (item.id === paragraph.id ? { ...item, isLocked: nextLocked } : item)),
    );

    try {
      const res = await fetch(`/api/rewrite/paragraphs/${paragraph.id}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked: nextLocked }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, '段落锁定失败'));
      }
    } catch (error) {
      setDocumentParagraphs((prev) =>
        prev.map((item) => (item.id === paragraph.id ? { ...item, isLocked: paragraph.isLocked } : item)),
      );
      console.warn('⚠️ 段落锁定更新失败', error);
    }
  }

  function handleCopy(key: string, text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1600);
  }

  async function handleToggleSkill(skill: { id: string; name: string }) {
    const conversationId = currentConversationIdRef.current;
    const exists = activeSkills.some((item) => item.id === skill.id);
    const previousSkills = activeSkills;
    const nextSkills = exists
      ? activeSkills.filter((item) => item.id !== skill.id)
      : [...activeSkills, skill];
    setActiveSkills(nextSkills);

    if (!isV2Conversation || !conversationId) return;

    try {
      const res = exists
        ? await fetch(`/api/rewrite/conversations/${conversationId}/skills/${skill.id}`, {
            method: 'DELETE',
          })
        : await fetch(`/api/rewrite/conversations/${conversationId}/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skillId: skill.id }),
          });
      if (!res.ok) {
        throw new Error(await readApiError(res, exists ? '移除技能失败' : '注入技能失败'));
      }
      void fetchV2ConversationSkills(conversationId);
    } catch (error) {
      setActiveSkills(previousSkills);
      console.warn('⚠️ v2 技能状态同步失败', error);
    }
  }

  function handleToggleMention(mention: { id: string; name: string }) {
    setActiveMentions((prev) => {
      const exists = prev.find((m) => m.id === mention.id);
      if (exists) return prev.filter((m) => m.id !== mention.id);
      return [...prev, mention];
    });
  }

  function handleToggleParagraphSelect(paragraphId: string) {
    setSelectedParagraphIds((prev) => {
      const next = new Set(prev);
      if (next.has(paragraphId)) next.delete(paragraphId);
      else next.add(paragraphId);
      return next;
    });
  }

  function handleClearParagraphSelect() {
    setSelectedParagraphIds(new Set());
  }

  function handleInlinePatchSubmit(prompt: string) {
    const targetParagraphIds = Array.from(selectedParagraphIds);
    if (!prompt.trim() || targetParagraphIds.length === 0) return;
    void handleSend(prompt, { targetParagraphIds });
    setSelectedParagraphIds(new Set());
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
      activeOriginalDraft,
      polishedText,
      documentParagraphs,
      currentSchemaVersion,
      isV2Conversation,
      availableV2Skills,
      activeSkills,
      activeMentions,
      selectedParagraphIds,
      traceabilityMode,
      presentationMode,
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
      handleReloadAsInput,
      handleUpdateLastAssistantMessage,
      handleNewV2Conversation,
      handleToggleParagraphLock,
      setActiveSkills,
      setActiveMentions,
      setTraceabilityMode,
      setPresentationMode,
      handleToggleSkill,
      handleToggleMention,
      handleToggleParagraphSelect,
      handleClearParagraphSelect,
      handleInlinePatchSubmit,
    }
  };
}
