'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BootstrapPayload, Conversation, Message } from '../types';
import { trackUsageEvent } from '@/lib/usage-events/client';
import type { Skill } from './SkillCabin';

type ActiveSkill = Skill & { isActive: boolean };

export interface DocumentParagraph {
  paragraphId: string;
  position: number;
  content: string;
  isLocked: boolean;
  sourceType: 'ai' | 'user' | 'system' | string;
  isAbortedShadow?: boolean; // 硬中断影子状态
}

export interface Revision {
  id: string;
  documentId: string;
  parentRevisionId: string | null;
  sourceType: 'ai_generation' | 'user_edit' | 'paragraph_patch' | 'variant_adopt' | 'fork' | string;
  status: 'pending' | 'completed' | 'failed' | 'aborted' | string;
  fullContent: string | null;
  messageId: string | null;
  createdAt: string;
}

export type DiffMode = 'vs-latest' | 'vs-previous';

// 帮助函数：错误解析
async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

// 帮助函数：从 fullContent 拆分段落
export function splitIntoParagraphs(content: string): string[] {
  if (!content) return [];
  return content.split(/\n\n+/).filter((p) => p.trim() !== '');
}

function getStoredContextLimit() {
  if (typeof window === 'undefined') return 99;
  const saved = window.localStorage.getItem('dydata-rewrite-context-limit');
  if (!saved) return 99;
  return parseInt(saved, 10);
}

export function useRewriteV3Logic() {
  // 1. 初始化元数据与状态
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ title: string; message: string } | null>(null);

  // 2. 会话管理
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false); // 历史侧栏折叠舱开关

  // 3. 画布内容与版本
  const [documentParagraphs, setDocumentParagraphs] = useState<DocumentParagraph[]>([]);
  const [polishedText, setPolishedText] = useState('');
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selectedModelViewId, setSelectedModelViewId] = useState<string>('');

  // 4. 技能管理与参数抽屉
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
  const [activeSkills, setActiveSkills] = useState<Skill[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // 创意配置抽屉开关
  const [contextLimit, setContextLimit] = useState<number>(getStoredContextLimit); // 上下文剪枝轮数

  // 5. 生成与交互状态
  const [isSending, setIsSending] = useState(false);
  const [generatingParagraphIds, setGeneratingParagraphIds] = useState<string[]>([]);
  const [streamingPatchText, setStreamingPatchText] = useState('');
  const [traceabilityMode, setTraceabilityMode] = useState(false);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState<string[]>([]);

  // 6. 时光机 Diff 模式与选中版本
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<DiffMode>('vs-latest');
  const [historyState, setHistoryState] = useState({
    saved: true,
    canUndo: false,
    canRedo: false,
  });

  // 7. 其它输入参数
  const [inputText, setInputText] = useState('');
  const [referredText, setReferredText] = useState<string | null>(null);

  // Refs
  const currentConversationIdRef = useRef(currentConversationId);
  const activeGenerationAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const documentParagraphsRef = useRef(documentParagraphs);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    documentParagraphsRef.current = documentParagraphs;
  }, [documentParagraphs]);

  // 更新剪枝轮数
  const updateContextLimit = (limit: number) => {
    setContextLimit(limit);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dydata-rewrite-context-limit', String(limit));
    }
  };

  // 获取会话列表
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/rewrite/conversations?limit=30', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (e) {
      console.warn('获取会话列表失败', e);
    }
  }, []);

  // 获取技能列表
  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/rewrite/skills', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { skills?: Skill[] };
        setAvailableSkills(data.skills ?? []);
      }
    } catch (e) {
      console.warn('获取技能列表失败', e);
    }
  }, []);

  // 获取已激活技能
  const fetchActiveSkills = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/rewrite/conversations/${conversationId}/skills`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { skills?: ActiveSkill[] };
        const active = (data.skills ?? []).filter((skill) => skill.isActive);
        setActiveSkills(active);
      }
    } catch (e) {
      console.warn('获取会话激活技能失败', e);
    }
  }, []);

  // 获取画布段落
  const fetchParagraphs = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/rewrite/documents/${conversationId}/paragraphs`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setDocumentParagraphs(data.paragraphs || []);
        setSelectedRevisionId(null);
      }
    } catch (e) {
      console.warn('获取画布段落失败', e);
    }
  }, []);

  // 获取撤销重做状态
  const fetchHistoryState = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/rewrite/documents/${conversationId}/history`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setHistoryState({
          saved: data.saved ?? true,
          canUndo: data.canUndo ?? false,
          canRedo: data.canRedo ?? false,
        });
      }
    } catch (e) {
      console.warn('获取撤销重做状态失败', e);
    }
  }, []);

  // 获取版本时光机历史
  const fetchRevisions = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/rewrite/documents/${conversationId}/revisions`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRevisions(data.revisions || []);
      }
    } catch (e) {
      console.warn('获取版本时光机失败', e);
    }
  }, []);

  // 加载会话的全部消息和数据
  const loadConversationData = useCallback(
    async (conversationId: string) => {
      setMessagesLoading(true);
      try {
        const res = await fetch(`/api/content-tools/rewrite/conversations/${conversationId}/messages`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
        await Promise.all([
          fetchActiveSkills(conversationId),
          fetchParagraphs(conversationId),
          fetchHistoryState(conversationId),
          fetchRevisions(conversationId),
        ]);
      } catch (e) {
        console.warn('加载会话消息失败', e);
      } finally {
        setMessagesLoading(false);
      }
    },
    [fetchActiveSkills, fetchParagraphs, fetchHistoryState, fetchRevisions]
  );

  // 初始化 Bootstrap
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/content-tools/rewrite/bootstrap', { cache: 'no-store' });
        if (!res.ok) {
          const errorMsg = await readApiError(res, '加载元数据失败');
          setErrorState({ title: '初始化失败', message: errorMsg });
          return;
        }
        const data: BootstrapPayload = await res.json();
        setBootstrap(data);
        if (data.defaults?.modelViewId) {
          setSelectedModelViewId(data.defaults.modelViewId);
        }
        await fetchConversations();
        await fetchSkills();
      } catch (error) {
        setErrorState({
          title: '系统故障',
          message: error instanceof Error ? error.message : '连接服务器失败',
        });
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [fetchConversations, fetchSkills]);

  // 默认选中第一个会话
  useEffect(() => {
    if (conversations.length > 0 && !currentConversationId) {
      const first = conversations[0].id;
      setCurrentConversationId(first);
      void loadConversationData(first);
    }
  }, [conversations, currentConversationId, loadConversationData]);

  // 从消息中解析 polishedText
  useEffect(() => {
    if (messages.length === 0) {
      setPolishedText('');
      return;
    }
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

  // 新建会话
  const handleNewConversation = useCallback(async () => {
    try {
      const res = await fetch('/api/rewrite/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        const newId = data.conversation.id;
        setCurrentConversationId(newId);
        setMessages([]);
        setDocumentParagraphs([]);
        setPolishedText('');
        setRevisions([]);
        await fetchConversations();
        await loadConversationData(newId);
      }
    } catch (e) {
      console.warn('新建会话失败', e);
    }
  }, [fetchConversations, loadConversationData]);

  // 选择会话
  const handleSelectConversation = useCallback(
    async (id: string) => {
      setCurrentConversationId(id);
      await loadConversationData(id);
    },
    [loadConversationData]
  );

  // 注入或切换技能激活状态
  const handleToggleSkill = useCallback(
    async (skill: Skill) => {
      const conversationId = currentConversationIdRef.current;
      if (!conversationId) return;

      const exists = activeSkills.find((s) => s.id === skill.id);
      const previousActive = [...activeSkills];

      // 乐观更新
      if (exists) {
        setActiveSkills((prev) => prev.filter((s) => s.id !== skill.id));
      } else {
        setActiveSkills((prev) => [...prev, skill]);
      }

      try {
        const res = exists
          ? await fetch(`/api/rewrite/conversations/${conversationId}/skills/${skill.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isActive: false }),
            })
          : await fetch(`/api/rewrite/conversations/${conversationId}/skills`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ skillId: skill.id }),
            });

        if (!res.ok) {
          throw new Error('同步技能状态失败');
        }
        await fetchActiveSkills(conversationId);
      } catch (e) {
        setActiveSkills(previousActive);
        console.warn('技能状态同步失败', e);
      }
    },
    [activeSkills, fetchActiveSkills]
  );

  // 手工编辑段落并存盘
  const handleUserEdit = useCallback(
    async (paragraphId: string, newContent: string) => {
      const conversationId = currentConversationIdRef.current;
      if (!conversationId) return;

      const trimmed = newContent.trim();
      if (!trimmed) return;

      // 乐观更新
      setDocumentParagraphs((prev) =>
        prev.map((p) => (p.paragraphId === paragraphId ? { ...p, content: trimmed } : p))
      );

      try {
        const res = await fetch(`/api/rewrite/paragraphs/user-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            paragraphId,
            newContent: trimmed,
          }),
        });
        if (!res.ok) {
          throw new Error('保存修改失败');
        }
        await Promise.all([fetchParagraphs(conversationId), fetchRevisions(conversationId), fetchHistoryState(conversationId)]);
      } catch (e) {
        console.warn('人手存盘保存失败', e);
        await fetchParagraphs(conversationId);
      }
    },
    [fetchParagraphs, fetchRevisions, fetchHistoryState]
  );

  // 中断生成（硬中断）
  const handleAbortGeneration = useCallback(() => {
    if (activeGenerationAbortRef.current) {
      activeGenerationAbortRef.current.abort();
      activeGenerationAbortRef.current = null;
    }
    setIsSending(false);
    setGeneratingParagraphIds([]);

    // 硬中断视觉降灰：临时影子状态
    setDocumentParagraphs((prev) =>
      prev.map((p) => {
        if (generatingParagraphIds.includes(p.paragraphId)) {
          return { ...p, isAbortedShadow: true };
        }
        return p;
      })
    );
    setStreamingPatchText('');
  }, [generatingParagraphIds]);

  // 解析 SSE 分块
  const parseSseBlocks = (buffer: string) => {
    const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
    return {
      completeBlocks: blocks.slice(0, -1),
      rest: blocks.at(-1) ?? '',
    };
  };

  const parseV2SseEvent = (block: string) => {
    const dataLines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) return null;
    try {
      return JSON.parse(dataLines.join('\n'));
    } catch {
      return null;
    }
  };

  // 发送消息与流式处理
  const handleSend = useCallback(
    async (textToSend: string, options?: { targetParagraphIds?: string[] }) => {
      if (isSending) {
        handleAbortGeneration();
      }

      let conversationId = currentConversationIdRef.current;
      if (!conversationId) {
        try {
          const res = await fetch('/api/rewrite/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (res.ok) {
            const data = await res.json();
            conversationId = data.conversation.id;
            setCurrentConversationId(conversationId);
            await fetchConversations();
          }
        } catch (e) {
          console.warn('创建会话失败', e);
          return;
        }
      }

      if (!conversationId) return;

      setIsSending(true);
      setStreamingPatchText('');

      // 高能定位闭关：自动解析发问框中的 【针对第 X 段】 或 【针对第 X 段选区】 序号，自动转换为 targetParagraphIds
      let targetParagraphIds = options?.targetParagraphIds || [];
      if (targetParagraphIds.length === 0) {
        const match = textToSend.match(/【针对第\s*(\d+)\s*段(?:选区)?】/);
        if (match && match[1]) {
          const index = parseInt(match[1], 10) - 1;
          const currentParas = documentParagraphsRef.current;
          if (index >= 0 && index < currentParas.length) {
            const matchedId = currentParas[index].paragraphId;
            targetParagraphIds = [matchedId];
          }
        }
      }

      setGeneratingParagraphIds(targetParagraphIds);

      const finalPrompt = referredText
        ? `【针对选中的文本】\n"${referredText}"\n\n【我的要求】\n${textToSend}`
        : textToSend;

      const historyContent = referredText ? `> ${referredText}\n\n${textToSend}` : textToSend;

      // 组装临时消息
      const tempUserMsgId = `temp-user-${Date.now()}`;
      const tempAssistantMsgId = `temp-assistant-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        {
          id: tempUserMsgId,
          conversationId: conversationId!,
          role: 'user',
          content: historyContent,
          createdAt: new Date().toISOString(),
          generationMode: 'single',
          status: 'success',
          requestSnapshot: null,
          errorMessage: null,
        },
        {
          id: tempAssistantMsgId,
          conversationId: conversationId!,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          generationMode: 'single',
          status: 'success',
          requestSnapshot: {
            autoModeEnabled: false,
            fixedModeId: null,
            modelViewId: selectedModelViewId || null,
            modeId: null,
            lengthPresetId: null,
            workflowId: null,
          },
          errorMessage: null,
        },
      ]);

      const abortController = new AbortController();
      activeGenerationAbortRef.current = abortController;

      try {
        const res = await fetch('/api/rewrite/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            conversationId,
            userPrompt: finalPrompt,
            targetParagraphIds,
            modelViewId: selectedModelViewId || null,
            contextLimit: contextLimit === 99 ? null : contextLimit,
          }),
        });

        if (!res.ok) {
          throw new Error(await readApiError(res, '生成失败，请重试'));
        }

        setReferredText(null);
        if (!res.body) {
          throw new Error('未返回流数据');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamedText = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseBlocks(buffer);
          buffer = parsed.rest;

          for (const block of parsed.completeBlocks) {
            const event = parseV2SseEvent(block);
            if (!event) continue;

            if (event.type === 'generation_start') {
              // 开始
            } else if (event.type === 'target_plan') {
              const targets = event.scope === 'paragraphs' ? event.targetParagraphIds : [];
              setGeneratingParagraphIds(targets);
            } else if (event.type === 'content_delta') {
              streamedText += event.delta;
              if (targetParagraphIds.length > 0) {
                setStreamingPatchText(streamedText);
              } else {
                setPolishedText(streamedText);
              }
              setMessages((prev) =>
                prev.map((m) => (m.id === tempAssistantMsgId ? { ...m, content: streamedText } : m))
              );
            } else if (event.type === 'generation_complete') {
              setPolishedText(event.fullContent);
              setStreamingPatchText('');
              setGeneratingParagraphIds([]);
              setIsSending(false);
              activeGenerationAbortRef.current = null;
              trackUsageEvent({ path: '/content-tools/rewrite', eventType: 'rewrite_generate' });
              await Promise.all([
                fetchParagraphs(conversationId!),
                fetchRevisions(conversationId!),
                fetchHistoryState(conversationId!),
                loadConversationData(conversationId!),
              ]);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('SSE 生成已由前端中断');
        } else {
          console.warn('生成异常', err);
          setIsSending(false);
          activeGenerationAbortRef.current = null;
          setGeneratingParagraphIds([]);
        }
      }
    },
    [
      isSending,
      selectedModelViewId,
      referredText,
      contextLimit,
      handleAbortGeneration,
      fetchConversations,
      fetchHistoryState,
      fetchParagraphs,
      fetchRevisions,
      loadConversationData,
    ]
  );

  // 执行撤销/重做
  const handleUndoRedo = useCallback(
    async (action: 'undo' | 'redo') => {
      const conversationId = currentConversationIdRef.current;
      if (!conversationId || isSending) return;

      try {
        const res = await fetch(`/api/rewrite/documents/${conversationId}/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          throw new Error('撤销重做失败');
        }
        const data = await res.json();
        setDocumentParagraphs(data.paragraphs || []);
        setPolishedText(data.fullContent || '');
        setSelectedRevisionId(null);
        await Promise.all([fetchHistoryState(conversationId), fetchRevisions(conversationId)]);
      } catch (e) {
        console.warn('撤销重做失败', e);
      }
    },
    [isSending, fetchHistoryState, fetchRevisions]
  );

  // 基于此版本继续 Fork
  const handleAdoptHistoryRevision = useCallback(async (revisionId: string, content: string) => {
    const conversationId = currentConversationIdRef.current;
    if (!conversationId || !content) return;

    try {
      const res = await fetch(`/api/rewrite/documents/${conversationId}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'fork',
          status: 'completed',
          fullContent: content,
          parentRevisionId: revisionId,
        }),
      });
      if (res.ok) {
        setSelectedRevisionId(null);
        await Promise.all([
          fetchParagraphs(conversationId),
          fetchRevisions(conversationId),
          fetchHistoryState(conversationId),
        ]);
      }
    } catch (e) {
      console.warn('克隆历史版本失败', e);
    }
  }, [fetchParagraphs, fetchRevisions, fetchHistoryState]);

  return {
    state: {
      bootstrap,
      loading,
      errorState,
      conversations,
      currentConversationId,
      messages,
      messagesLoading,
      documentParagraphs,
      polishedText,
      revisions,
      selectedModelViewId,
      availableSkills,
      activeSkills,
      isSending,
      generatingParagraphIds,
      streamingPatchText,
      traceabilityMode,
      selectedParagraphIds,
      selectedRevisionId,
      diffMode,
      historyState,
      inputText,
      referredText,
      messagesEndRef,
      isHistoryOpen,
      isSettingsOpen,
      contextLimit,
    },
    actions: {
      setInputText,
      setReferredText,
      setSelectedModelViewId,
      setTraceabilityMode,
      setSelectedParagraphIds,
      setSelectedRevisionId,
      setDiffMode,
      handleNewConversation,
      handleSelectConversation,
      handleToggleSkill,
      handleUserEdit,
      handleSend,
      handleAbort: handleAbortGeneration,
      handleUndo: () => handleUndoRedo('undo'),
      handleRedo: () => handleUndoRedo('redo'),
      handleAdoptHistoryRevision,
      fetchConversations,
      setIsHistoryOpen,
      setIsSettingsOpen,
      setContextLimit: updateContextLimit,
      refreshSkills: fetchSkills,
    },
  };
}
