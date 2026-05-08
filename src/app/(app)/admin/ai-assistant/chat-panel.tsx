"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Terminal, TerminalSquare, RefreshCw, Send, ChevronRight, Zap } from "lucide-react";
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
};

const EXAMPLES = [
  "/query 最近三天未填报人员",
  "/modify 将张三权限修改为管理员",
  "/retry 重跑昨天李四的次日复盘任务",
  "/diagnose 为什么王五没有内容管理权限",
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
    <div className="prose prose-sm max-w-none text-zinc-950 prose-p:my-1.5 prose-pre:my-2 prose-pre:rounded-sm prose-pre:bg-zinc-50 prose-pre:border prose-pre:border-zinc-200 prose-pre:p-3 prose-code:rounded-sm prose-code:bg-zinc-100 prose-code:text-zinc-950 prose-code:px-1.5 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-table:w-full prose-table:overflow-x-auto prose-table:border-collapse prose-th:border prose-th:border-zinc-200 prose-th:px-3 prose-th:py-2 prose-th:bg-zinc-50 prose-td:border prose-td:border-zinc-200 prose-td:px-3 prose-td:py-2 prose-ul:my-1.5 prose-ul:list-square prose-ul:pl-4 prose-ol:my-1.5 prose-a:text-zinc-500 prose-strong:text-zinc-950">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export default function ChatPanel({ actorRole, onHistoryRefresh, onOpenHistory }: ChatPanelProps) {
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

    textarea.style.height = "24px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
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
      appendErrorMessage(`ERR: ${message}`, text);
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
      if (confirmed) toast.success("Execution completed");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Confirmation failed";
      appendErrorMessage(`EXEC_ERR: ${errorMessage}`);
      toast.error(confirmed ? "Execution failed" : "Abort failed");
    } finally {
      setConfirmingActionId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex h-full flex-col  text-sm">
      <div className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar">
        {!hasMessages ? (
          <div className="flex flex-col h-full justify-center max-w-2xl mx-auto opacity-80 animate-in fade-in duration-700">
             <div className="mb-8 border-l-2 border-zinc-950 pl-4 py-1">
               <h2 className="text-xl font-bold text-foreground tracking-wide uppercase mb-2">AI 分析工作台</h2>
               <p className="text-muted-foreground text-sm">
                 已连接系统数据库，随时可以进行查询、配置修改和异常诊断。
               </p>
             </div>
             
             <div className="space-y-3">
               <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest border-b border-border pb-2 mb-4">建议指令</div>
               {EXAMPLES.map((ex, i) => (
                 <div 
                   key={ex} 
                   className="group flex items-center gap-3 cursor-pointer p-2 hover:bg-zinc-50 rounded-sm transition-colors animate-in slide-in-from-bottom-2"
                   style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
                   onClick={() => sendMessage(ex)}
                 >
                   <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-zinc-950" />
                   <span className="text-foreground group-hover:text-foreground">{ex}</span>
                 </div>
               ))}
             </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto w-full pb-4">
            {messageList.map((msg, index) => {
              const isUser = msg.role === "user";
              const isConfirming = confirmingActionId === msg.actionId;

              return (
                <div 
                  key={msg.id} 
                  className={cn(
                    "flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300",
                    isUser ? "items-start" : "items-start"
                  )}
                >
                  {isUser ? (
                    <div className="flex items-start gap-2 w-full">
                       <span className="text-zinc-950 mt-1 flex-shrink-0">{`> [USER]`}</span>
                       <div className="text-foreground mt-1 whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="flex flex-col w-full pl-6 border-l border-border/80 mt-2 py-1">
                       <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground mb-2 uppercase">
                          <TerminalSquare className="h-3.5 w-3.5" />
                          <span>系统回复</span>
                          {msg.type === "result" && <span className="text-zinc-950 border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 rounded-sm">执行结果</span>}
                          {msg.type === "error" && <span className="text-destructive border border-red-900/50 bg-red-950/30 px-1.5 py-0.5 rounded-sm">执行异常</span>}
                       </div>
                       
                       <div className="text-foreground">
                         {msg.content && <MarkdownContent content={msg.content} />}
                         {msg.details && <div className="mt-3 bg-zinc-50 border border-zinc-200 rounded-sm p-3"><AssistantDetailSections details={msg.details} /></div>}
                       </div>
                       
                       {msg.retryable && (
                         <div className="mt-4">
                            <button 
                              onClick={() => handleRetry(msg.requestText)} 
                              disabled={loading}
                              className="text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1.5 rounded-sm transition-colors"
                            >
                              <RefreshCw className="h-3 w-3" />
                              重试请求
                            </button>
                         </div>
                       )}

                       {msg.type === "confirmation" && msg.toolCall && (
                         <div className="mt-2">
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
                  )}
                </div>
              );
            })}
            
            {loading && (
              <div className="flex flex-col w-full pl-6 border-l border-border/80 py-2 animate-pulse">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                  <Zap className="h-3.5 w-3.5 text-zinc-950" />
                  <span>处理请求中</span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="typewriter-effect">分析意图并调用所需模块...</span>
                </div>
              </div>
            )}
            
            <div ref={bottomRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background border-t border-border">
        <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-background border border-zinc-200 rounded-sm focus-within:border-zinc-950/20 focus-within:ring-1 focus-within:ring-zinc-950/10 transition-all">
          <div className="absolute left-3 bottom-2.5 text-zinc-950 font-bold">
            {`>`}
          </div>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入指令或自然语言查询（例如：查询最近三天未填报人员）..."
            className="flex-1 max-h-32 min-h-[44px] w-full resize-none bg-transparent py-3 pl-8 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none custom-scrollbar"
            rows={1}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!canSend}
            className="mb-2 mr-2 p-2 rounded-xl bg-zinc-950 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:hover:bg-zinc-950 transition-all hover:-translate-y-[1px] hover:shadow-lg"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="max-w-4xl mx-auto mt-2 text-[10px] text-muted-foreground flex justify-between uppercase tracking-widest">
           <span>Enter 发送，Shift+Enter 换行</span>
           <span>连接状态: 正常</span>
        </div>
      </div>
    </div>
  );
}
