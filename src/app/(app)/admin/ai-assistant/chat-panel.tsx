"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Sparkles, RefreshCw, ArrowUp, PanelLeft, Bot, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { AssistantDebug, AssistantDetails } from "@/lib/admin-ai/presentation";
import ConfirmCard from "./confirm-card";
import { getAiAssistantErrorMessage } from "./chat-errors";
import AssistantDetailSections from "./assistant-detail-sections";
import { cn } from "@/lib/utils";

type ToolCall = {
  toolName: string;
  params?: Record<string, unknown>;
  needsConfirmation?: boolean;
  confirmationMessage?: string;
  confirmationReason?: string;
  details?: AssistantDetails;
  debug?: AssistantDebug;
};

type ApiAssistantResponse = {
  type: "text" | "confirmation" | "result";
  answer: string;
  details?: AssistantDetails;
  toolCall?: ToolCall;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  type: "text" | "confirmation" | "result" | "error";
  content: string;
  details?: AssistantDetails;
  actionId?: string;
  conversationId?: string;
  toolCall?: ToolCall;
  requestText?: string;
  retryable?: boolean;
};

type ChatPanelProps = {
  actorRole: "admin" | "owner";
  onHistoryRefresh: () => void;
  onOpenHistory: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
};

const SHORTCUTS = [
  { label: "查询未填报人员", text: "查询最近三天未填报人员" },
  { label: "修改成员权限", text: "将张三权限修改为管理员" },
  { label: "诊断权限异常", text: "为什么王五没有内容管理权限" },
  { label: "重跑复盘任务", text: "重跑昨天李四的次日复盘任务" },
];

function createId() {
  return crypto.randomUUID();
}

function normalizeAssistantMessage(payload: {
  actionId?: string;
  conversationId?: string;
  response?: ApiAssistantResponse;
}): Message {
  const response = payload.response;
  const responseType = response?.type ?? "text";

  return {
    id: createId(),
    role: "assistant",
    type: responseType === "confirmation" ? "confirmation" : responseType === "result" ? "result" : "text",
    content: response?.answer ?? "",
    details: response?.details,
    actionId: payload.actionId,
    conversationId: payload.conversationId,
    toolCall: response?.toolCall,
  };
}

function buildConfirmResultMessage(options: {
  actionId: string;
  conversationId: string;
  confirmed: boolean;
  data: { success?: boolean; response?: ApiAssistantResponse };
}): Message {
  const { actionId, conversationId, confirmed, data } = options;
  const response = data.response;
  const isSuccess = confirmed ? data.success !== false : true;
  const content = response?.answer ?? (confirmed ? "Execution completed successfully." : "Execution aborted by user.");

  return {
    id: createId(),
    role: "assistant",
    type: confirmed && isSuccess ? "result" : confirmed ? "error" : "text",
    content,
    details: response?.details,
    actionId,
    conversationId,
  };
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none text-zinc-950 prose-p:my-1.5 prose-pre:my-2 prose-pre:rounded-xl prose-pre:bg-zinc-50 prose-pre:border prose-pre:border-zinc-200 prose-pre:p-3 prose-code:rounded-md prose-code:bg-zinc-100 prose-code:text-zinc-950 prose-code:px-1.5 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-table:w-full prose-table:overflow-x-auto prose-table:border-collapse prose-th:border prose-th:border-zinc-200 prose-th:px-3 prose-th:py-2 prose-th:bg-zinc-50 prose-td:border prose-td:border-zinc-200 prose-td:px-3 prose-td:py-2 prose-ul:my-1.5 prose-ul:list-square prose-ul:pl-4 prose-ol:my-1.5 prose-a:text-zinc-500 prose-strong:text-zinc-950">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function AiAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-950">
      <Sparkles className="h-3.5 w-3.5 text-white" />
    </div>
  );
}

function StatusBadge({ type }: { type: Message["type"] }) {
  if (type === "result") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        执行成功
      </span>
    );
  }
  if (type === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-red-700">
        <XCircle className="h-3 w-3" />
        执行异常
      </span>
    );
  }
  if (type === "confirmation") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        待确认
      </span>
    );
  }
  return null;
}

export default function ChatPanel({
  actorRole,
  onHistoryRefresh,
  onOpenHistory,
  sidebarCollapsed,
  onToggleSidebar,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmingActionId, setConfirmingActionId] = useState<string | null>(null);
  const [conversationId] = useState(() => createId());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 56), 200)}px`;
  }, [input]);

  const hasMessages = messages.length > 0;
  const canSend = input.trim().length > 0 && !loading;

  const messageList = useMemo(() => messages, [messages]);

  const appendErrorMessage = (text: string, requestText?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: "assistant",
        type: "error",
        content: text,
        requestText,
        retryable: Boolean(requestText),
      },
    ]);
  };

  const sendMessage = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: "user",
        type: "text",
        content: text,
      },
    ]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Request failed");
      }

      setMessages((prev) => [...prev, normalizeAssistantMessage(data)]);
      onHistoryRefresh();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Request failed";
      const message = getAiAssistantErrorMessage(rawMessage);
      appendErrorMessage(message, text);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (requestText?: string) => {
    if (!requestText) return;
    await sendMessage(requestText);
  };

  const handleConfirm = async (message: Message, confirmed: boolean) => {
    if (!message.actionId || !message.conversationId || confirmingActionId) return;

    setConfirmingActionId(message.actionId);
    try {
      const res = await fetch("/api/admin/ai-assistant/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: message.actionId,
          conversationId: message.conversationId,
          confirmed,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Confirmation failed");
      }

      setMessages((prev) => [
        ...prev,
        buildConfirmResultMessage({
          actionId: message.actionId!,
          conversationId: message.conversationId!,
          confirmed,
          data,
        }),
      ]);
      onHistoryRefresh();
      if (confirmed) toast.success("执行完成");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Confirmation failed";
      appendErrorMessage(errorMessage);
      toast.error(confirmed ? "执行失败" : "取消失败");
    } finally {
      setConfirmingActionId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!hasMessages ? (
          /* Empty State */
          <div className="flex h-full flex-col items-center justify-center px-4">
            <div className="flex max-w-md flex-col items-center text-center">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <Bot className="h-5 w-5 text-zinc-300" />
              </div>
              <h3 className="text-lg font-black tracking-tight text-zinc-900">
                AI 管理助手
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
                已连接系统数据库，随时可以进行查询、配置修改和异常诊断。支持自然语言指令，需要敏感操作时会请求确认。
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SHORTCUTS.map((shortcut) => (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={() => sendMessage(shortcut.text)}
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-600 transition hover:border-zinc-900 hover:text-zinc-900"
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-4">
            {messageList.map((msg) => {
              const isUser = msg.role === "user";
              const isConfirming = confirmingActionId === msg.actionId;

              if (isUser) {
                return (
                  <div key={msg.id} className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-950 px-5 py-3.5 text-[15px] leading-relaxed text-white shadow-sm">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                );
              }

              /* AI message */
              return (
                <div key={msg.id} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <AiAvatar />
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Meta */}
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-zinc-900">AI 助手</span>
                      <StatusBadge type={msg.type} />
                    </div>

                    {/* Content */}
                    <div className="text-[15px] leading-relaxed text-zinc-700">
                      {msg.content && <MarkdownContent content={msg.content} />}
                    </div>

                    {/* Details */}
                    {msg.details && (
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <AssistantDetailSections details={msg.details} />
                      </div>
                    )}

                    {/* Retry */}
                    {msg.retryable && (
                      <div>
                        <button
                          onClick={() => handleRetry(msg.requestText)}
                          disabled={loading}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-500 transition hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" />
                          重试
                        </button>
                      </div>
                    )}

                    {/* Confirmation Card */}
                    {msg.type === "confirmation" && msg.toolCall && (
                      <ConfirmCard
                        actorRole={actorRole}
                        data={msg.toolCall}
                        submitting={isConfirming}
                        onConfirm={() => handleConfirm(msg, true)}
                        onCancel={() => handleConfirm(msg, false)}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading */}
            {loading && (
              <div className="flex gap-3">
                <AiAvatar />
                <div className="flex items-center gap-2 py-3">
                  <div className="flex space-x-1.5">
                    <div className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce [animation-delay:-0.3s]" />
                    <div className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce [animation-delay:-0.15s]" />
                    <div className="h-2 w-2 rounded-full bg-zinc-300 animate-bounce" />
                  </div>
                  <span className="text-[13px] text-zinc-400">处理中...</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div
            className={cn(
              "relative flex items-end gap-2 rounded-2xl border bg-[#F9F9FB] p-2 transition",
              "focus-within:border-zinc-900 focus-within:bg-white focus-within:shadow-md"
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入指令或自然语言查询..."
              rows={1}
              disabled={loading}
              className={cn(
                "max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400",
                loading && "cursor-not-allowed opacity-60"
              )}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!canSend}
              className={cn(
                "mb-1 mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition",
                !canSend
                  ? "bg-zinc-200 text-zinc-400"
                  : "bg-zinc-950 text-white hover:-translate-y-[1px] hover:shadow-lg active:translate-y-0"
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1">
            <span className="text-[11px] text-zinc-400">
              Enter 发送 · Shift+Enter 换行
            </span>
            <div className="flex items-center gap-3">
              {/* Mobile history trigger */}
              <button
                onClick={onOpenHistory}
                className="lg:hidden text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                查看历史
              </button>
              <span className="text-[11px] text-zinc-400">{input.length} 字</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
