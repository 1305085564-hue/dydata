'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Plus, Sparkles, Send,
  Wand2, Copy, Check, Type,
  ChevronDown, Loader2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BootstrapPayload, Conversation, Message } from './types';
import { mockBootstrapData } from './mockData';

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

// 样式配置，维持原版的清爽专业风格
const THEME = {
  bubble: {
    user: "bg-blue-600 text-white shadow-md shadow-blue-500/20",
    ai: "bg-white border border-slate-100 shadow-sm text-slate-700"
  }
};

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

function pickAutoStepText(message: Message['structuredResult'], stepIndex: number) {
  const step = message?.steps?.[stepIndex];
  return (
    step?.normalizedResult?.recommendedText?.trim() ||
    step?.normalizedResult?.versions?.[0]?.content?.trim() ||
    ''
  );
}

export default function RewriteWorkbench() {
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ title: string; message: string } | null>(null);

  // 表单状态
  const [autoMode, setAutoMode] = useState(true);
  const [selectedModelViewId, setSelectedModelViewId] = useState<string>('');
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const [selectedLengthId, setSelectedLengthId] = useState<string>('');
  
  // 交互状态
  const [inputText, setInputText] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  // 对话列表及消息状态
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  // 发送中阶段提示（自动模式下显示当前步骤）
  const [sendingPhase, setSendingPhase] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0 || isSending) {
      scrollToBottom();
    }
  }, [messages, isSending, sendingPhase]);


  useEffect(() => {
    // 优先尝试获取真实接口数据，失败则回退到 mock 数据
    const fetchData = async () => {
      try {
        const res = await fetch('/api/content-tools/rewrite/bootstrap', { cache: 'no-store' });

        if (!res.ok) {
          // 尝试解析后端返回的具体错误信息
          const errorMsg = await readApiError(res, '初始化失败，请稍后重试');

          // 处理明确的业务错误
          if ([401, 403, 503, 500].includes(res.status)) {
            let title = '初始化失败';
            if (res.status === 401) title = '未登录';
            if (res.status === 403) title = '无权限';
            if (res.status === 503) title = '服务暂不可用';

            setErrorState({
              title,
              message: res.status === 401 ? '未登录，请先登录' :
                       res.status === 403 ? '你当前无权限使用该功能' :
                       res.status === 503 ? '文案改写功能暂时关闭' :
                       errorMsg
            });
            return; // 明确的业务错误，直接返回，不走 mock
          }

          // 其他非正常状态码（如 404 等），抛出异常走 mock
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data: BootstrapPayload = await res.json();
        setBootstrap(data);
        setAutoMode(data.defaults.autoModeEnabled);
        setSelectedModelViewId(data.defaults.modelViewId || '');
        setSelectedModeId(data.defaults.modeId);
        setSelectedLengthId(data.defaults.lengthPresetId || '');
      } catch (error) {
        console.warn('⚠️ 无法获取真实 bootstrap 数据，回退到本地演示模式 (Mock Data)。', error);
        // 使用 mock 数据兜底
        setBootstrap(mockBootstrapData);
        setAutoMode(mockBootstrapData.defaults.autoModeEnabled);
        setSelectedModelViewId(mockBootstrapData.defaults.modelViewId || '');
        setSelectedModeId(mockBootstrapData.defaults.modeId);
        setSelectedLengthId(mockBootstrapData.defaults.lengthPresetId || '');
      } finally {
        setLoading(false);
      }
    };


    fetchData();
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
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
  };

  const fetchMessages = async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/content-tools/rewrite/conversations/${conversationId}/messages`, {
        cache: 'no-store'
      });
      if (!res.ok) {
        const error = new Error(await readApiError(res, '消息加载失败'));
        (error as Error & { status?: number }).status = res.status;
        throw error;
      }
      const data = await res.json();
      if (data?.messages) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.warn('⚠️ 获取消息失败', error);
      const title =
        error instanceof Error && 'status' in error && typeof error.status === 'number'
          ? toStatusTitle(error.status)
          : '消息加载失败';
      setMessages([{
        id: 'error-msg',
        conversationId,
        role: 'system_note',
        content: `⚠️ ${title}：${error instanceof Error ? error.message : '请尝试刷新页面或重新选择会话。'}`,
        createdAt: new Date().toISOString(),
        generationMode: null,
        status: 'failed',
        requestSnapshot: null,
        errorMessage: error instanceof Error ? error.message : 'Network Error',
        structuredResult: null
      }]);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSelectConversation = (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    if (conv.selected) {
      setAutoMode(conv.selected.autoModeEnabled ?? true);
      setSelectedModelViewId(conv.selected.modelViewId || '');
      setSelectedModeId(conv.selected.modeId || null);
      setSelectedLengthId(conv.selected.lengthPresetId || '');
    }
    fetchMessages(conv.id);
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setInputText('');
    if (bootstrap) {
      setAutoMode(bootstrap.defaults.autoModeEnabled ?? true);
      setSelectedModelViewId(bootstrap.defaults.modelViewId || '');
      setSelectedModeId(bootstrap.defaults.modeId || null);
      setSelectedLengthId(bootstrap.defaults.lengthPresetId || '');
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;

    const textToSend = inputText.trim();
    const isAutoFirstRound = autoMode && messages.length === 0;
    setInputText('');
    setIsSending(true);
    setSendingPhase(isAutoFirstRound ? '正在执行第 1 步：框架改写...' : '正在生成...');

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId: currentConversationId || '',
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
      generationMode: isAutoFirstRound ? 'auto' : 'single',
      status: 'success',
      requestSnapshot: null,
      errorMessage: null,
      structuredResult: null,
    };
    setMessages(prev => [...prev, tempMessage]);

    // 自动模式下模拟阶段进度（后端串行两步，前端用定时器模拟阶段切换）
    let phaseTimer: ReturnType<typeof setTimeout> | null = null;
    if (isAutoFirstRound) {
      phaseTimer = setTimeout(() => {
        setSendingPhase('第 1 步完成，正在执行第 2 步：情绪润色...');
      }, 12000);
    }

    try {
      let res: Response | null = null;
      let lastNetworkError: unknown = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          res = await fetch('/api/content-tools/rewrite/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: currentConversationId,
              message: textToSend,
              autoModeEnabled: autoMode,
              modelViewId: selectedModelViewId,
              modeId: selectedModeId,
              lengthPresetId: selectedLengthId
            })
          });
          lastNetworkError = null;
          break;
        } catch (error) {
          lastNetworkError = error;
          if (!isTransientFetchError(error) || attempt === 1) {
            throw error;
          }
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

      const data = await res.json();

      const returnedConversationId = data.conversation?.id || data.conversationId;
      if (data.conversation) {
        setConversations(prev => upsertConversation(prev, data.conversation));
      }

      // 同步会话状态（包括 autoMode）
      if (data.conversation?.selected) {
        const sel = data.conversation.selected;
        setAutoMode(sel.autoModeEnabled ?? false);
        setSelectedModelViewId(sel.modelViewId || selectedModelViewId);
        setSelectedModeId(sel.modeId ?? selectedModeId);
        setSelectedLengthId(sel.lengthPresetId || selectedLengthId);
      }

      if (returnedConversationId && returnedConversationId !== currentConversationId) {
        setCurrentConversationId(returnedConversationId);
      }

      if (!data.conversation) {
        fetchConversations();
      }

      if (data.message) {
        setMessages(prev => {
          const tempUserMsg = prev.find(m => m.id === tempMessage.id);
          const filtered = prev.filter(m => m.id !== tempMessage.id);

          if (tempUserMsg) {
            const resolvedUserMsg = { ...tempUserMsg, conversationId: returnedConversationId || tempUserMsg.conversationId };
            return [...filtered, resolvedUserMsg, data.message];
          }

          return [...filtered, data.message];
        });
      }
    } catch (error: unknown) {
      console.error('发送消息失败', error);
      const title =
        error instanceof Error && 'status' in error && typeof error.status === 'number'
          ? toStatusTitle(error.status)
          : '发送失败';
      const errorMessage = error instanceof Error ? error.message : '发送失败，请稍后重试';
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== tempMessage.id);
        return [...filtered, {
          id: `error-${Date.now()}`,
          conversationId: currentConversationId || '',
          role: 'system_note',
          content: `⚠️ ${title}：${errorMessage}。已为您恢复输入内容。`,
          createdAt: new Date().toISOString(),
          generationMode: null,
          status: 'failed',
          requestSnapshot: null,
          errorMessage: errorMessage,
          structuredResult: null
        }];
      });
      setInputText(textToSend);
    } finally {
      if (phaseTimer) clearTimeout(phaseTimer);
      setIsSending(false);
      setSendingPhase('');
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };


  if (errorState) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center p-8 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <span className="text-xl">⚠️</span>
          </div>
          <h3 className="text-[15px] font-bold text-slate-900 mb-2">{errorState.title}</h3>
          <p className="text-[13px] text-slate-500">{errorState.message}</p>
        </div>
      </div>
    );
  }

  if (loading || !bootstrap) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
          <span className="text-sm font-medium text-slate-500">正在加载工作台...</span>
        </div>
      </div>
    );
  }

  // 拼接当前步骤文案
  const workflowStepsText = bootstrap.workflow?.steps
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(s => s.name)
    .join(' → ') || '自动处理流程';

  // 当前选中的模式名称
  const currentModeName = selectedModeId
    ? bootstrap.modes.find(m => m.id === selectedModeId)?.name || '基础改写'
    : '基础改写';

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 text-slate-800 antialiased">
      
      {/* 左侧：历史会话 */}
      <aside className="z-20 flex w-[280px] min-h-0 flex-col border-r border-slate-200 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-inner shadow-white/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-slate-900 tracking-tight leading-tight">{bootstrap.feature.label}</h1>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">输入原文，一键爆款</p>
            </div>
          </div>
          <button onClick={handleNewConversation} className="w-full group relative flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/20 active:scale-[0.98]">
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
            新建会话
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center h-full">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 border-dashed flex items-center justify-center mb-4 relative">
                <div className="absolute inset-0 bg-blue-50/50 rounded-2xl animate-pulse delay-75"></div>
                <MessageSquare className="w-6 h-6 text-slate-300 relative z-10" />
              </div>
              <p className="text-sm font-semibold text-slate-600 mb-1">暂无历史会话</p>
              <p className="text-[13px] text-slate-400">在右侧发送消息即可开始</p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-200 relative overflow-hidden",
                    currentConversationId === conv.id
                      ? "bg-white text-blue-700 shadow-[0_2px_12px_rgba(0,0,0,0.04)] ring-1 ring-slate-200/50"
                      : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                  )}
                >
                  {currentConversationId === conv.id && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-full shadow-[0_0_8px_rgba(37,99,235,0.4)]"></div>
                  )}
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    currentConversationId === conv.id ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400 group-hover:bg-white group-hover:shadow-sm"
                  )}>
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <span className={cn(
                    "text-[13.5px] truncate",
                    currentConversationId === conv.id ? "font-bold tracking-tight" : "font-medium"
                  )}>{conv.title || '新对话'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 主工作区 */}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#f8fafc]">
        
        {/* 顶部控制条 (动态渲染) */}
        <header className="sticky top-0 z-10 flex h-[68px] shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/85 px-6 backdrop-blur-[12px]">
          <div className="flex items-center gap-4">
            {/* 自动模式开关 */}
            <div className="flex items-center p-1 bg-slate-100/80 rounded-lg border border-slate-200/50 shadow-inner">
              <button 
                onClick={() => setAutoMode(!autoMode)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all",
                  autoMode 
                    ? "bg-white text-slate-900 shadow-sm font-semibold" 
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Wand2 className={cn("w-3.5 h-3.5", autoMode && "text-blue-600")} />
                自动模式
              </button>
            </div>
            
            {/* 状态指示: 仅在自动模式开启且存在工作流配置时显示 */}
            {autoMode && bootstrap.workflow && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50/80 border border-indigo-100/80 animate-in fade-in slide-in-from-left-2 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span className="text-[12px] font-semibold text-indigo-700 tracking-wide flex items-center gap-1.5">
                  {bootstrap.workflow.steps.sort((a, b) => a.sortOrder - b.sortOrder).map((s, i, arr) => (
                    <React.Fragment key={s.id || i}>
                      <span>{s.name}</span>
                      {i < arr.length - 1 && <ChevronDown className="w-3 h-3 -rotate-90 text-indigo-300" />}
                    </React.Fragment>
                  ))}
                </span>
              </div>
            )}
          </div>

          {/* 参数选择组: 由接口驱动的动态下拉框 */}
          <div className="flex items-center p-1 bg-white border border-slate-200 rounded-lg shadow-sm">
            
            {/* 模型选择: 自动模式下弱化/隐藏 (这里选择弱化为只读形态或直接隐藏，视需求而定。本例中做淡化处理) */}
            <div className={cn(
              "relative group transition-all duration-300",
              autoMode ? "opacity-50 pointer-events-none w-0 overflow-hidden px-0" : "w-auto opacity-100"
            )}>
              <select 
                value={selectedModelViewId}
                onChange={(e) => setSelectedModelViewId(e.target.value)}
                className="appearance-none bg-transparent pl-3 pr-8 py-1.5 text-[13px] font-medium text-slate-700 focus:outline-none cursor-pointer hover:text-slate-900 transition-colors w-full"
              >
                {bootstrap.modelViews.map(mv => (
                  <option key={mv.id} value={mv.id}>{mv.label}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-slate-600 transition-colors" />
            </div>
            
            {!autoMode && <div className="w-px h-4 bg-slate-200 mx-1"></div>}
            
            {/* 模式选择: 支持不选 */}
            <div className="relative group">
              <select 
                value={selectedModeId || ''}
                onChange={(e) => setSelectedModeId(e.target.value || null)}
                className={cn(
                  "appearance-none bg-transparent pl-3 pr-8 py-1.5 text-[13px] font-semibold focus:outline-none cursor-pointer",
                  selectedModeId ? "text-red-600" : "text-slate-500"
                )}
              >
                <option value="">无附加模式</option>
                {bootstrap.modes.map(mode => (
                  <option key={mode.id} value={mode.id}>模式: {mode.name}</option>
                ))}
              </select>
              <ChevronDown className={cn(
                "w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none",
                selectedModeId ? "text-red-400" : "text-slate-400"
              )} />
            </div>

            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            
            {/* 字数选择 */}
            <div className="relative group">
              <select 
                value={selectedLengthId}
                onChange={(e) => setSelectedLengthId(e.target.value)}
                className="appearance-none bg-transparent pl-3 pr-8 py-1.5 text-[13px] font-medium text-slate-700 focus:outline-none cursor-pointer hover:text-slate-900 transition-colors"
              >
                {bootstrap.lengthPresets.map(preset => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-slate-600 transition-colors" />
            </div>
          </div>
        </header>

        {/* 对话区 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="mx-auto max-w-[800px] space-y-8 pb-32">
            
            {messagesLoading ? (
              <div className="flex justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-[3px] border-blue-600/30 border-t-blue-600 animate-spin"></div>
                  <span className="text-[13px] text-slate-500 font-medium">正在加载对话内容...</span>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 animate-in fade-in zoom-in-95 duration-500 fill-mode-both">
                <div className="w-20 h-20 mb-6 rounded-3xl bg-gradient-to-b from-blue-50 to-indigo-50/30 border border-blue-100/50 flex items-center justify-center shadow-sm relative">
                  <div className="absolute inset-0 bg-blue-400/10 rounded-3xl animate-pulse blur-xl"></div>
                  <Sparkles className="w-8 h-8 text-blue-600 relative z-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3 tracking-tight">准备好开始了吗？</h3>
                {autoMode && bootstrap.workflow && (
                  <div className="mb-4 max-w-xl rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-center text-[13px] leading-6 text-indigo-700 shadow-sm">
                    自动模式下会先按
                    <span className="mx-1 font-semibold">{workflowStepsText}</span>
                    执行一次双阶段改写，完成后会自动切回标准聊天，你可以继续追问微调。
                  </div>
                )}
                <p className="text-[15px] text-slate-500 max-w-md text-center leading-relaxed mb-6">
                  把你的原文贴在下方，我会按
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[13px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 mx-1.5 shadow-sm">
                    {currentModeName}
                  </span>
                  风格为你生成高质量的改写版本。
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setInputText('帮我润色一下这段话，让语气更专业一些：\n')} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-[13px] font-medium text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:shadow-sm transition-all active:scale-95">
                    ✨ 优化专业度
                  </button>
                  <button onClick={() => setInputText('把这段内容改写得更通俗易懂，适合发朋友圈：\n')} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-[13px] font-medium text-slate-600 hover:text-blue-600 hover:border-blue-200 hover:shadow-sm transition-all active:scale-95">
                    📱 朋友圈文案
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg, index) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id || index} className="flex gap-4 flex-row-reverse animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 shadow-sm mt-1 text-white text-[13px] font-bold">
                        我
                      </div>
                      <div className={cn("px-5 py-4 rounded-2xl rounded-tr-sm max-w-[85%] text-[15px] leading-[1.7] selection:bg-white/20", THEME.bubble.user)}>
                        <p className="text-white/95 whitespace-pre-wrap font-medium">{msg.content}</p>
                      </div>
                    </div>
                  );
                } else {
                  // AI message
                  const sr = msg.structuredResult;
                  const autoStepResults = msg.generationMode === 'auto'
                    ? (sr?.steps ?? [])
                        .map((step, stepIndex) => ({
                          step,
                          stepIndex,
                          text: pickAutoStepText(sr, stepIndex)
                        }))
                        .filter(item => item.step.status === 'success' && item.text)
                    : [];
                  
                  if (sr && (sr.steps || sr.final?.versions)) {
                    return (
                      <div key={msg.id || index} className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/30 mt-1">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        
                        <div className="w-full max-w-[95%]">
                          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-slate-200/60 overflow-hidden">
                            {/* 结果卡头部 */}
                            <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                  <Check className="w-3 h-3 text-green-600 font-bold" />
                                </div>
                                <span className="text-[13px] font-bold text-slate-700">
                                  {msg.generationMode === 'auto' ? '自动处理完成' : '已生成版本'}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-400 font-medium">请直接点击复制使用</span>
                            </div>
                            
                            {/* 步骤（自动模式下可能有）*/}
                            {msg.generationMode === 'auto' && sr.steps && sr.steps.length > 0 && (
                              <div className="px-5 py-3 bg-indigo-50/50 border-b border-slate-100">
                                <p className="text-xs font-semibold text-indigo-700 mb-2">处理步骤：</p>
                                <div className="space-y-2">
                                  {sr.steps.map((step, idx) => (
                                    <div key={idx} className="flex items-center gap-3 text-[13px]">
                                      {step.status === 'success' ? (
                                        <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                          <Check className="w-3.5 h-3.5 text-green-600 font-bold" />
                                        </div>
                                      ) : step.status === 'failed' ? (
                                        <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                          <span className="text-red-600 font-bold text-xs">✕</span>
                                        </div>
                                      ) : (
                                        <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                          <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin"></span>
                                        </div>
                                      )}
                                      <span className={cn(
                                        "font-medium",
                                        step.status === 'failed' ? 'text-red-600' : 'text-slate-600'
                                      )}>
                                        {step.stepName}
                                      </span>
                                      {step.errorMessage && (
                                        <span className="text-red-500/80 text-[12px] bg-red-50 px-2 py-0.5 rounded ml-auto">
                                          {step.errorMessage}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* partial success */}
                            {sr.steps?.some(s => s.status === 'failed') && sr.steps?.some(s => s.status === 'success') && (
                              <div className="px-5 py-3 bg-amber-50/80 text-amber-800 text-[13px] font-medium border-b border-amber-200/60 flex items-center gap-2.5">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-xs shadow-sm">⚠️</span>
                                <span>部分中间步骤处理异常，已为您展示已完成的可用结果</span>
                              </div>
                            )}
            
                            {/* 自动模式首轮结果 */}
                            {msg.generationMode === 'auto' && autoStepResults.length > 0 && (
                              <div className="p-5 space-y-4">
                                {autoStepResults.map(({ step, stepIndex, text }) => (
                                  <div key={`${msg.id}-${step.stepKey}-${stepIndex}`} className="relative group rounded-2xl border border-slate-200/80 bg-slate-50/40 p-6 transition-all duration-300 hover:border-blue-300 hover:bg-white hover:shadow-[0_8px_24px_-8px_rgba(37,99,235,0.15)]">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                      <div>
                                        <h3 className="flex items-center gap-2.5 text-[15px] font-bold text-slate-900">
                                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-indigo-100 px-2 text-[11px] font-black tracking-tight text-indigo-700 ring-1 ring-indigo-200/60">
                                            {stepIndex + 1}
                                          </span>
                                          {step.stepName}
                                        </h3>
                                        {step.description && (
                                          <p className="mt-1 text-[12px] text-slate-500">{step.description}</p>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => handleCopy(`${msg.id}-step-${stepIndex}`, text)}
                                        className={cn(
                                          "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold shadow-sm transition-all",
                                          copiedIndex === `${msg.id}-step-${stepIndex}`
                                            ? "border-green-200 bg-green-50 text-green-700"
                                            : "border-slate-200 bg-white text-slate-500 opacity-0 group-hover:opacity-100 hover:border-blue-200 hover:text-blue-600 hover:shadow-md"
                                        )}
                                      >
                                        {copiedIndex === `${msg.id}-step-${stepIndex}` ? (
                                          <>
                                            <Check className="w-3.5 h-3.5" />
                                            <span>已复制</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>复制本步</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <p className="whitespace-pre-wrap text-[15px] leading-[1.8] text-slate-700 selection:bg-blue-100 selection:text-blue-900">
                                      {text}
                                    </p>
                                  </div>
                                ))}
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-[13px] text-slate-500">
                                  自动改写已完成，本会话已切回标准聊天。现在可以直接说“把第二步再口语一点”这类修改要求。
                                </div>
                              </div>
                            )}

                            {/* 单步/兜底版本列表 */}
                            {(!(msg.generationMode === 'auto' && autoStepResults.length > 0) && sr.final?.versions && sr.final.versions.length > 0) && (
                              <div className="p-5 space-y-4">
                                {sr.final.versions.map((ver, vIndex) => (
                                  <div key={vIndex} className="relative group p-6 rounded-2xl border border-slate-200/80 bg-slate-50/30 hover:bg-white hover:border-blue-300 hover:shadow-[0_8px_24px_-8px_rgba(37,99,235,0.15)] transition-all duration-300 cursor-pointer">
                                    <div className="flex items-center justify-between mb-4">
                                      <h3 className="font-bold text-slate-900 flex items-center gap-2.5 text-[15px]">
                                        <span className="w-6 h-6 rounded-full bg-blue-100/50 text-blue-700 flex items-center justify-center text-[11px] font-black tracking-tighter ring-1 ring-blue-200/50">
                                          V{vIndex + 1}
                                        </span>
                                        {ver.title || `改写版本 ${vIndex + 1}`}
                                      </h3>
                                      <button
                                        onClick={() => handleCopy(`${msg.id}-${vIndex}`, ver.content)}
                                        className={cn(
                                          "h-8 px-3 rounded-lg flex items-center gap-1.5 transition-all shadow-sm text-[12px] font-semibold border",
                                          copiedIndex === `${msg.id}-${vIndex}`
                                            ? "bg-green-50 text-green-700 border-green-200 opacity-100"
                                            : "bg-white text-slate-500 border-slate-200 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:border-blue-200 hover:shadow-md"
                                        )}
                                      >
                                        {copiedIndex === `${msg.id}-${vIndex}` ? (
                                          <>
                                            <Check className="w-3.5 h-3.5" />
                                            <span>已复制</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3.5 h-3.5" />
                                            <span>一键复制</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <p className="text-[15px] text-slate-700 leading-[1.8] whitespace-pre-wrap selection:bg-blue-100 selection:text-blue-900">
                                      {ver.content}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div key={msg.id || index} className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center shrink-0 shadow-sm mt-1">
                          <Sparkles className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className={cn("px-5 py-3.5 rounded-2xl rounded-tl-sm text-[15px] max-w-[85%] leading-relaxed shadow-[0_2px_10px_rgba(0,0,0,0.03)]", THEME.bubble.ai)}>
                          <div className="whitespace-pre-wrap">{msg.content || '...'}</div>
                        </div>
                      </div>
                    );
                  }
                }
              })
            )}

            {/* 发送中占位消息 */}
            {isSending && (
              <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/30 mt-1">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
                <div className="w-full max-w-[85%]">
                  <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 flex items-center gap-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]"></span>
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]"></span>
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]"></span>
                      </div>
                      <span className="text-[13px] font-medium text-slate-500">{sendingPhase || '正在生成...'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 最后一条消息的快捷追问按钮 */}
            {!isSending && messages.length > 0 && (() => {
              const lastMsg = messages[messages.length - 1];
              const suggestions = lastMsg?.role === 'assistant' && lastMsg.structuredResult?.final?.followUpSuggestions;
              if (!suggestions || suggestions.length === 0) return null;
              return (
                <div className="flex gap-4 animate-in fade-in duration-500">
                  <div className="w-8 shrink-0" />
                  <div className="flex flex-wrap gap-2">
                    {suggestions.slice(0, 4).map((text, i) => (
                      <button
                        key={i}
                        onClick={() => setInputText(text)}
                        className="text-[13px] font-medium text-slate-600 bg-white border border-slate-200 px-4 py-1.5 rounded-full hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all shadow-sm active:scale-95"
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div ref={messagesEndRef} />
          </div>
        </div>
        
        {/* 底部输入区 */}
        <div className="shrink-0 px-6 pb-6 pt-4">
          <div className="max-w-[800px] mx-auto">
            <div className="relative bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-slate-200 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-400 transition-all overflow-hidden group">
              
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isSending}
                className={cn(
                  "w-full bg-transparent p-4 pr-16 resize-none h-[120px] focus:outline-none text-[15px] text-slate-900 placeholder:text-slate-400 leading-relaxed [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                  isSending && "opacity-50 cursor-not-allowed"
                )}
                placeholder={isSending
                  ? "正在处理中，请稍候..."
                  : autoMode && messages.length === 0
                    ? "请直接粘贴原文。自动模式会先跑双阶段改写，完成后自动切到标准聊天..."
                    : "输入修改要求（例如：把第二步再接地气一点）..."
                }
              ></textarea>
              
              {isSending && <div className="absolute top-0 left-0 right-0 h-1 bg-blue-100 overflow-hidden rounded-t-2xl"><div className="w-1/3 h-full bg-blue-600 animate-pulse rounded-full"></div></div>}
              {/* 工具栏 */}
              <div className="absolute bottom-3 left-4 flex items-center gap-1">
                <button
                  onClick={() => setInputText('')}
                  className={cn(
                    "h-8 px-2.5 flex items-center justify-center text-[13px] font-medium rounded-lg transition-colors duration-200",
                    inputText.length > 0
                      ? "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                      : "text-slate-300 cursor-not-allowed"
                  )}
                  title="清空输入"
                  disabled={inputText.length === 0}
                >
                  <Type className="w-4 h-4 mr-1.5" />
                  清空
                </button>
              </div>

              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isSending}
                className={cn(
                  "absolute bottom-3 right-3 px-5 py-2 rounded-xl text-[14px] font-bold flex items-center gap-2 transition-all duration-300 shadow-sm group",
                  !inputText.trim() || isSending
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-[0_4px_12px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
                )}
              >
                {isSending ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
                    <span>处理中...</span>
                  </>
                ) : (
                  <>
                    <span>{autoMode && messages.length === 0 ? '执行首轮改写' : '发送'}</span>
                    <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </>
                )}
              </button>
            </div>
            <div className="text-center mt-3">
              <span className="text-[11px] font-medium text-slate-400 tracking-wide">生成结果仅供参考，请根据团队账号人设进行微调后发布。</span>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}
