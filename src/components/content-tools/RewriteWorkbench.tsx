'use client';

import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Plus, Sparkles, Send,
  Wand2, Copy, Check, Edit3, Type,
  ChevronDown
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
      const res = await fetch('/api/content-tools/rewrite/conversations?limit=30');
      if (!res.ok) {
        throw new Error(await readApiError(res, '会话列表加载失败'));
      }
      const data = await res.json();
      if (data?.conversations) {
        setConversations(data.conversations);
      }
    } catch (error) {
      console.warn('⚠️ 获取会话列表失败', error);
      setConversations([]);
    }
  };

  const fetchMessages = async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/content-tools/rewrite/conversations/${conversationId}/messages`);
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
    fetchMessages(conv.id);
    if (conv.selected) {
      setAutoMode(conv.selected.autoModeEnabled ?? true);
      setSelectedModelViewId(conv.selected.modelViewId || '');
      setSelectedModeId(conv.selected.modeId || null);
      setSelectedLengthId(conv.selected.lengthPresetId || '');
    }
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
  };

  const handleSend = async () => {
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
      generationMode: autoMode ? 'auto' : 'single',
      status: 'success',
      requestSnapshot: null,
      errorMessage: null,
      structuredResult: null,
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      const res = await fetch('/api/content-tools/rewrite/chat', {
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

      if (!res.ok) {
        const error = new Error(await readApiError(res, '发送失败，请稍后重试'));
        (error as Error & { status?: number }).status = res.status;
        throw error;
      }

      const data = await res.json();

      const returnedConversationId = data.conversation?.id || data.conversationId;
      if (returnedConversationId && returnedConversationId !== currentConversationId) {
        setCurrentConversationId(returnedConversationId);
        fetchConversations();

        // 如果返回了完整 conversation，可以同步回顶部状态
        if (data.conversation?.selected) {
          setAutoMode(data.conversation.selected.autoModeEnabled ?? autoMode);
          setSelectedModelViewId(data.conversation.selected.modelViewId || selectedModelViewId);
          setSelectedModeId(data.conversation.selected.modeId || selectedModeId);
          setSelectedLengthId(data.conversation.selected.lengthPresetId || selectedLengthId);
        }
      }

      if (data.message) {
        // 保留用户的临时消息，只把新的 assistant message append 进去
        setMessages(prev => {
          // 找一下有没有 tempUserMessage
          const tempUserMsg = prev.find(m => m.id === tempMessage.id);
          const filtered = prev.filter(m => m.id !== tempMessage.id);

          if (tempUserMsg) {
            // 给它一个真实的 conversationId (如果有的话)
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
      setInputText(textToSend); // 恢复输入体验
    } finally {
      setIsSending(false);
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
    <div className="flex h-full overflow-hidden bg-slate-50/50 selection:bg-blue-100 selection:text-blue-900 text-slate-800 antialiased">
      
      {/* 左侧：历史会话 */}
      <aside className="w-[280px] bg-white border-r border-slate-200 flex flex-col z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300">
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
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <MessageSquare className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500 mb-1">暂无历史会话</p>
              <p className="text-xs text-slate-400">在右侧发送消息即可开始</p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors relative overflow-hidden",
                    currentConversationId === conv.id 
                      ? "bg-blue-50/80 text-blue-700 border border-blue-100/50 shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {currentConversationId === conv.id && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-blue-600 rounded-r-full"></div>
                  )}
                  <MessageSquare className={cn(
                    "w-4 h-4 shrink-0 transition-opacity",
                    currentConversationId === conv.id ? "" : "opacity-50 group-hover:opacity-100"
                  )} />
                  <span className={cn(
                    "text-[13px] truncate",
                    currentConversationId === conv.id ? "font-semibold" : "font-medium"
                  )}>{conv.title || '新对话'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 主工作区 */}
      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-[#f8fafc]">
        
        {/* 顶部控制条 (动态渲染) */}
        <header className="h-[68px] border-b border-slate-200/80 flex items-center justify-between px-6 z-10 sticky top-0 bg-white/85 backdrop-blur-[12px]">
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
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 animate-in fade-in slide-in-from-left-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                <span className="text-[11px] font-semibold text-indigo-700 tracking-wide">
                  {workflowStepsText}
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
        <div className="flex-1 overflow-y-auto px-6 py-8 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="max-w-[800px] mx-auto space-y-8 pb-32">
            
            {messagesLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center shrink-0 shadow-sm mt-1">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                </div>
                <div className={cn("px-5 py-3.5 rounded-2xl rounded-tl-sm text-[15px] max-w-[85%] leading-relaxed shadow-[0_2px_10px_rgba(0,0,0,0.03)]", THEME.bubble.ai)}>
                  把你的原文贴给我，我会按
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-red-50 text-red-600 border border-red-100 mx-1">
                    {currentModeName}
                  </span>
                  模式为你输出改写文案。
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
                      <div className={cn("px-5 py-4 rounded-2xl rounded-tr-sm max-w-[85%] text-[15px] leading-relaxed", THEME.bubble.user)}>
                        <p className="text-white/90 whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  );
                } else {
                  // AI message
                  const sr = msg.structuredResult;
                  
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
                                <div className="space-y-1.5">
                                  {sr.steps.map((step, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-[12px]">
                                      {step.status === 'success' ? (
                                        <Check className="w-3.5 h-3.5 text-green-500" />
                                      ) : step.status === 'failed' ? (
                                        <span className="text-red-500 font-bold">×</span>
                                      ) : (
                                        <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin"></span>
                                      )}
                                      <span className={step.status === 'failed' ? 'text-red-600' : 'text-slate-600'}>
                                        {step.stepKey} {step.errorMessage ? ` - ${step.errorMessage}` : ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* partial success */}
                            {sr.steps?.some(s => s.status === 'failed') && sr.steps?.some(s => s.status === 'success') && (
                              <div className="px-5 py-2.5 bg-yellow-50 text-yellow-800 text-[13px] font-medium border-b border-yellow-200 flex items-center gap-2">
                                <span className="text-yellow-600">⚠️</span>
                                <span>部分步骤处理失败，已为您显示成功完成的中间结果</span>
                              </div>
                            )}
            
                            {/* 版本列表 */}
                            {sr.final?.versions && sr.final.versions.length > 0 && (
                              <div className="p-5 space-y-4">
                                {sr.final.versions.map((ver, vIndex) => (
                                  <div key={vIndex} className="relative group p-5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:ring-2 hover:ring-blue-50 transition-all cursor-pointer shadow-sm hover:shadow-md">
                                    <div className="flex items-center justify-between mb-3">
                                      <h3 className="font-bold text-slate-900 flex items-center gap-2 text-[15px]">
                                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-black">
                                          {String.fromCharCode(65 + vIndex)}
                                        </span>
                                        {ver.title || `版本 ${vIndex + 1}`}
                                      </h3>
                                      <button 
                                        onClick={() => handleCopy(`${msg.id}-${vIndex}`, ver.content)}
                                        className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm text-slate-400 hover:text-blue-600 hover:border-blue-200"
                                      >
                                        {copiedIndex === `${msg.id}-${vIndex}` ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                    <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-wrap">
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
          </div>
        </div>
        
        {/* 底部输入区 */}
        <div className="absolute bottom-0 left-0 right-0 pt-10 pb-6 px-6 z-20 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent">
          <div className="max-w-[800px] mx-auto">
            <div className="relative bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] border border-slate-200 focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-400 transition-all overflow-hidden group">
              
              <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full bg-transparent p-4 pr-16 resize-none h-[120px] focus:outline-none text-[15px] text-slate-900 placeholder:text-slate-400 leading-relaxed [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" 
                placeholder="粘贴复盘原文，或输入修改要求（例如：把版本A改得更接地气一点）..."
              ></textarea>
              
              {isSending && <div className="absolute top-0 left-0 right-0 h-1 bg-blue-100 overflow-hidden rounded-t-2xl"><div className="w-1/3 h-full bg-blue-600 animate-pulse rounded-full"></div></div>}
              {/* 工具栏 */}
              <div className="absolute bottom-3 left-4 flex items-center gap-1">
                <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="清除格式">
                  <Type className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isSending}
                className={cn(
                  "absolute bottom-3 right-3 px-5 py-2.5 rounded-xl text-[14px] font-bold flex items-center gap-2 transition-all shadow-sm group",
                  !inputText.trim() || isSending
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md active:scale-95"
                )}
              >
                {isSending ? '发送中...' : '发送'}
                {!isSending && <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />}
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
