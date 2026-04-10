"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PanelRightOpen, RotateCcw, Send } from "lucide-react";
import type { AssistantDebug, AssistantDetails } from "@/lib/admin-ai/presentation";
import ConfirmCard from "./confirm-card";
import { getAiAssistantErrorMessage } from "./chat-errors";
import AssistantDetailSections from "./assistant-detail-sections";

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
  "查一下最近三天谁没填报",
  "把张三改成管理员",
  "重跑昨天李四的次日复盘",
  "看看王五为什么没有权限进内容管理",
  "这个报错是数据问题还是代码问题",
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
  const content = response?.answer ?? (confirmed ? "操作执行成功。" : "操作已取消。");

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
    <div className="prose prose-sm max-w-none text-current prose-p:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:bg-background/80 prose-pre:p-3 prose-code:rounded prose-code:bg-background/70 prose-code:px-1 prose-code:py-0.5 prose-table:block prose-table:w-full prose-table:overflow-x-auto prose-th:border prose-th:px-2 prose-th:py-1 prose-td:border prose-td:px-2 prose-td:py-1 prose-ul:my-2 prose-ol:my-2">
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

    textarea.style.height = "48px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
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
        throw new Error(data.error || "请求失败，请稍后重试");
      }

      setMessages((prev) => [...prev, normalizeAssistantMessage(data)]);
      onHistoryRefresh();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "请求失败，请重试";
      const message = getAiAssistantErrorMessage(rawMessage);
      appendErrorMessage(`请求失败：${message}`, text);
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
        throw new Error(data.error || "确认请求失败");
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
      toast.success(confirmed ? "操作已执行" : "操作已取消");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "确认请求失败";
      appendErrorMessage(`${confirmed ? "确认执行失败" : "取消失败"}：${errorMessage}`);
      toast.error(confirmed ? "确认执行失败" : "取消失败");
    } finally {
      setConfirmingActionId(null);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border/60 bg-background/90 shadow-sm backdrop-blur">
      <div className="border-b bg-muted/30 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">站内 AI 助手</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              可查数据、改权限、重跑任务，也能先做诊断。
            </p>
          </div>
          <Button variant="outline" size="sm" className="lg:hidden" onClick={onOpenHistory}>
            <PanelRightOpen className="h-4 w-4" />
            历史
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-background to-muted/20 px-5 py-5">
        {!hasMessages ? (
          <div className="flex h-full items-start justify-center pt-10 sm:pt-14">
            <div className="w-full max-w-2xl rounded-3xl border border-dashed border-border/70 bg-background/80 px-6 py-8 text-center shadow-sm">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight">你好，我是站内 AI 助手</h2>
                <p className="text-muted-foreground">
                  我可以帮你查数据、改权限、补数据、重跑任务，也能先判断问题是代码还是数据。
                </p>
              </div>
              <div className="mt-6 space-y-2">
                <p className="text-sm text-muted-foreground">试试这些示例：</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((ex) => (
                    <Button key={ex} variant="outline" size="sm" onClick={() => sendMessage(ex)}>
                      {ex}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messageList.map((msg) => {
              const isUser = msg.role === "user";
              const isConfirming = confirmingActionId === msg.actionId;

              return (
                <div key={msg.id} className={isUser ? "text-right" : ""}>
                  <div
                    className={`inline-block max-w-[92%] rounded-2xl px-4 py-3 text-left align-top shadow-sm sm:max-w-[80%] ${
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/60 bg-background/95"
                    }`}
                  >
                    {msg.type === "result" && !isUser ? (
                      <div className="mb-2 flex items-center gap-2">
                        <Badge>执行结果</Badge>
                      </div>
                    ) : null}
                    {msg.type === "error" && !isUser ? (
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="destructive">失败</Badge>
                      </div>
                    ) : null}
                    {isUser ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <MarkdownContent content={msg.content} />
                    )}
                    {!isUser ? <AssistantDetailSections details={msg.details} /> : null}
                    {msg.retryable ? (
                      <div className="mt-3 flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => handleRetry(msg.requestText)} disabled={loading}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          重试
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {msg.type === "confirmation" && msg.toolCall ? (
                    <div className="mt-2 inline-block w-full max-w-[92%] sm:max-w-[80%]">
                      <ConfirmCard
                        actorRole={actorRole}
                        data={msg.toolCall}
                        submitting={isConfirming}
                        onConfirm={() => handleConfirm(msg, true)}
                        onCancel={() => handleConfirm(msg, false)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {loading ? (
              <Card className="max-w-sm rounded-2xl border border-border/60 bg-background/95 shadow-sm">
                <CardContent className="flex items-center gap-3 pt-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <div className="space-y-1">
                    <div className="text-sm font-medium">AI 正在思考</div>
                    <div className="text-xs text-muted-foreground">正在分析你的指令和可执行工具</div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="bg-background/95 px-5 pb-6 pt-4">
        <div className="mx-auto mb-4 h-px max-w-3xl bg-gradient-to-r from-transparent via-border/70 to-transparent" />
        <div className="mx-auto max-w-3xl">
          <div className="relative rounded-2xl border border-border/70 bg-background shadow-lg shadow-black/5 transition-all focus-within:border-primary/30 focus-within:shadow-xl focus-within:shadow-primary/10">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={(e) => {
                e.currentTarget.style.height = "48px";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              placeholder="输入指令，比如：查一下最近三天谁没填报"
              disabled={loading}
              className="min-h-[48px] max-h-[160px] resize-none rounded-2xl border border-border/60 bg-background px-4 py-3 pr-16 text-sm shadow-sm focus-visible:border-primary/40 focus-visible:ring-4 focus-visible:ring-primary/10"
            />
            <Button
              onClick={() => void sendMessage(input)}
              disabled={!canSend}
              className={`absolute bottom-3 right-3 h-10 w-10 rounded-full p-0 transition-all ${
                input.trim()
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
                  : "bg-muted text-muted-foreground shadow-none hover:bg-muted"
              }`}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
