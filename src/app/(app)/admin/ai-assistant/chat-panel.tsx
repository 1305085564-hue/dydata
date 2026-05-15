"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  RefreshCw,
  ArrowUp,
  AtSign,
  Command,
  History,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssistantDebug, AssistantDetails } from "@/lib/admin-ai/presentation";
import type { UserRole } from "@/types";
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
  actorRole: UserRole;
  onHistoryRefresh: () => void;
  onOpenHistory: () => void;
  prepareSend?: (text: string) => Promise<string> | string;
  prefilledInput?: string;
  prefillToken?: number;
};

const SHORTCUTS = [
  {
    title: "未填报人员",
    hint: "查询最近三天未填报日报的员工",
    text: "查询最近三天未填报人员",
  },
  {
    title: "调整权限",
    hint: "修改指定成员的管理权限",
    text: "将张三权限修改为管理员",
  },
  {
    title: "诊断异常",
    hint: "分析为什么某员工看不到某模块",
    text: "为什么王五没有内容复盘权限",
  },
  {
    title: "重跑任务",
    hint: "手动触发某天的次日复盘任务",
    text: "重跑昨天李四的次日复盘任务",
  },
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
    type:
      responseType === "confirmation"
        ? "confirmation"
        : responseType === "result"
          ? "result"
          : "text",
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
  const content =
    response?.answer ??
    (confirmed ? "Execution completed successfully." : "Execution aborted by user.");

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
    <div className="prose prose-sm max-w-none text-zinc-800 prose-headings:text-zinc-800 prose-headings:font-semibold prose-headings:tracking-tight prose-p:my-2 prose-p:leading-[1.75] prose-pre:my-3 prose-pre:rounded-xl prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:border prose-pre:border-zinc-900 prose-pre:p-3.5 prose-pre:text-[12.5px] prose-code:rounded-md prose-code:bg-zinc-100 prose-code:text-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[12.5px] prose-code:font-medium prose-code:before:content-none prose-code:after:content-none prose-table:w-full prose-table:overflow-x-auto prose-table:border-collapse prose-th:border prose-th:border-zinc-200 prose-th:px-3 prose-th:py-2 prose-th:bg-zinc-50 prose-th:text-[11px] prose-th:uppercase prose-th:tracking-wider prose-th:text-zinc-500 prose-th:font-semibold prose-td:border prose-td:border-zinc-200 prose-td:px-3 prose-td:py-2 prose-td:text-[13px] prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5 prose-li:my-0.5 prose-a:text-zinc-800 prose-a:underline prose-a:decoration-zinc-300 prose-a:underline-offset-4 hover:prose-a:decoration-zinc-800 prose-strong:text-zinc-800 prose-strong:font-semibold">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function StatusDot({ type }: { type: Message["type"] }) {
  if (type === "result") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6FAA7D]">
          Approved
        </span>
      </span>
    );
  }
  if (type === "error") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-700">
          Rejected
        </span>
      </span>
    );
  }
  if (type === "confirmation") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B88448]">
          Pending
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-zinc-200" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
        Answered
      </span>
    </span>
  );
}

export default function ChatPanel({
  actorRole,
  onHistoryRefresh,
  onOpenHistory,
  prepareSend,
  prefilledInput,
  prefillToken,
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
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 48), 200)}px`;
  }, [input]);

  useEffect(() => {
    if (prefilledInput === undefined) return;
    setInput(prefilledInput);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [prefilledInput, prefillToken]);

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
      { id: createId(), role: "user", type: "text", content: text },
    ]);
    setInput("");
    setLoading(true);

    try {
      const payloadText = prepareSend ? await prepareSend(text) : text;
      const res = await fetch("/api/admin/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: payloadText,
          conversationId,
        }),
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
    <div className="relative flex h-full flex-col">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!hasMessages ? (
          /* Empty State — Claude Cowork 居中欢迎 */
          <div className="flex min-h-full flex-col items-center justify-center px-6 py-16">
            <div className="w-full max-w-[640px]">
              {/* Hero */}
              <div className="mb-10 flex flex-col items-center text-center">
                <div className="relative mb-6 flex h-14 w-14 items-center justify-center">
                  <div className="absolute inset-0 rounded-2xl bg-zinc-800 shadow-sm" />
                  <Sparkles className="relative h-6 w-6 text-white" strokeWidth={1.75} />
                </div>
                <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-zinc-800">
                  你想处理点什么？
                </h1>
                <p className="mt-3 max-w-md text-[13px] leading-relaxed text-zinc-500">
                  输入指令或自然语言，我会直接查询、修改或诊断系统数据。
                  <br />
                  <span className="italic text-zinc-400">
                    敏感操作会先请求确认，所有动作都会记录到历史。
                  </span>
                </p>
              </div>

              {/* Shortcuts grid */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SHORTCUTS.map((shortcut) => (
                  <button
                    key={shortcut.title}
                    type="button"
                    onClick={() => sendMessage(shortcut.text)}
                    className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-zinc-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 transition-colors group-hover:bg-[#6FAA7D]" />
                          <div className="text-[13px] font-semibold tracking-tight text-zinc-800">
                            {shortcut.title}
                          </div>
                        </div>
                        <div className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-zinc-500">
                          {shortcut.hint}
                        </div>
                      </div>
                      <div className="mt-0.5 text-zinc-300 transition-colors group-hover:text-zinc-600">
                        <ArrowUp className="h-3.5 w-3.5 rotate-45" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Tiny command hint */}
              <div className="mt-8 flex items-center justify-center gap-4 text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-500 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
                    Enter
                  </kbd>
                  <span>发送</span>
                </span>
                <span className="h-3 w-px bg-zinc-200" />
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-500 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
                    ⇧ Enter
                  </kbd>
                  <span>换行</span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[768px] px-6 pb-6 pt-10">
            <div className="space-y-8">
              {messageList.map((msg) => {
                const isUser = msg.role === "user";
                const isConfirming = confirmingActionId === msg.actionId;

                if (isUser) {
                  return (
                    <div
                      key={msg.id}
                      className="flex justify-end animate-in fade-in slide-in-from-bottom-1 duration-300"
                    >
                      <div className="max-w-[82%] rounded-[14px] rounded-tr-[4px] bg-zinc-950 px-4 py-3 text-[14px] leading-[1.7] text-zinc-50 shadow-sm">
                        <p className="whitespace-pre-wrap tracking-[0.005em]">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  );
                }

                /* AI message — Claude+DYData 增强版 */
                return (
                  <div
                    key={msg.id}
                    className="group animate-in fade-in slide-in-from-bottom-1 duration-300"
                  >
                    {/* Meta line */}
                    <div className="mb-2 flex items-center gap-2.5">
                      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-800">
                        <Sparkles className="h-2.5 w-2.5 text-white" strokeWidth={2} />
                      </div>
                      <span className="text-[11px] font-semibold tracking-tight text-zinc-800">
                        AI 助手
                      </span>
                      <span className="h-3 w-px bg-zinc-200" />
                      <StatusDot type={msg.type} />
                    </div>

                    {/* Content bubble (Claude+DYData 轻卡片) */}
                    <div
                      className={cn(
                        "rounded-2xl border px-5 py-4 transition-colors",
                        msg.type === "result"
                          ? "border-zinc-200 bg-[#F6F9F7]"
                          : msg.type === "error"
                            ? "border-red-100 bg-[#FEF9F9]"
                            : msg.type === "confirmation"
                              ? "border-zinc-200 bg-[#FBF6EC]"
                              : "border-zinc-100 bg-[#FAFAFB]"
                      )}
                    >
                      {msg.content && <MarkdownContent content={msg.content} />}

                      {msg.details && (
                        <div
                          className={cn(
                            "mt-2 rounded-xl border bg-white p-4",
                            msg.type === "result"
                              ? "border-zinc-200"
                              : msg.type === "error"
                                ? "border-red-100"
                                : "border-zinc-200"
                          )}
                        >
                          <AssistantDetailSections details={msg.details} />
                        </div>
                      )}
                    </div>

                    {/* Retry bar */}
                    {msg.retryable && (
                      <div className="mt-2">
                        <button
                          onClick={() => handleRetry(msg.requestText)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:text-zinc-800 hover:shadow-sm active:translate-y-0"
                        >
                          <RefreshCw className="h-3 w-3" />
                          重试
                        </button>
                      </div>
                    )}

                    {/* Confirmation card */}
                    {msg.type === "confirmation" && msg.toolCall && (
                      <div className="mt-3">
                        <ConfirmCard
                          actorRole={actorRole}
                          data={msg.toolCall}
                          submitting={isConfirming}
                          onConfirm={() => handleConfirm(msg, true)}
                          onCancel={() => handleConfirm(msg, false)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Loading */}
              {loading && (
                <div className="flex items-center gap-2.5 animate-in fade-in duration-200">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-800">
                    <Sparkles className="h-2.5 w-2.5 text-white" strokeWidth={2} />
                  </div>
                  <div className="flex items-center gap-1.5 px-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" />
                  </div>
                  <span className="text-[11px] italic tracking-wide text-zinc-400">
                    正在处理
                  </span>
                </div>
              )}

              <div ref={bottomRef} className="h-1" />
            </div>
          </div>
        )}
      </div>

      {/* Input Area — Claude Cowork 风格 */}
      <div className="shrink-0 bg-[#FAFAFB] px-6 pb-5 pt-2">
        <div className="mx-auto max-w-[768px]">
          <div
            className={cn(
              "group relative flex items-end gap-1.5 rounded-xl border bg-white px-2.5 py-2 transition-colors",
              "border-zinc-200",
              "focus-within:border-zinc-950 focus-within:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06)]"
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入 / 作为命令，或自然语言描述你的需求"
              rows={1}
              disabled={loading}
              className={cn(
                "max-h-[200px] min-h-[40px] w-full resize-none bg-transparent px-2 py-2 text-[14px] leading-[1.6] tracking-wide text-zinc-800 outline-none placeholder:text-zinc-400",
                loading && "cursor-not-allowed opacity-60"
              )}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!canSend}
              className={cn(
                "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors",
                !canSend
                  ? "bg-zinc-100 text-zinc-400"
                  : "bg-[#D97757] text-white shadow-sm hover:-translate-y-[1px] hover:bg-[#C96442] active:translate-y-0"
              )}
            >
              {loading ? (
                <Skeleton className="h-4 w-4 rounded" />
              ) : (
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* Footer hints — Claude style tiny row */}
          <div className="mt-2 flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenHistory}
                className="lg:hidden inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.2em] text-zinc-400 transition-colors hover:text-zinc-700"
              >
                <History className="h-3 w-3" />
                <span>历史</span>
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              <span className="flex items-center gap-1 normal-case tracking-wide">
                <AtSign className="h-2.5 w-2.5" />
                引用
              </span>
              <span className="hidden sm:flex items-center gap-1 normal-case tracking-wide">
                <Command className="h-2.5 w-2.5" />
                快捷键
              </span>
              <span className="font-mono tabular-nums normal-case tracking-normal text-zinc-300">
                {input.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
