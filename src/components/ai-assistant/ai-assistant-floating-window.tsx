"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Sparkles, X } from "lucide-react";

import ChatPanel from "@/app/(app)/admin/ai-assistant/chat-panel";
import {
  ASSISTANT_OPEN_EVENT,
  useAlertContextStore,
} from "@/components/ai-assistant/alert-context-store";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

interface AiAssistantFloatingWindowProps {
  actorRole: UserRole;
}

export function AiAssistantFloatingWindow({ actorRole }: AiAssistantFloatingWindowProps) {
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [prefilledInput, setPrefilledInput] = useState<string | undefined>(undefined);
  const [prefillToken, setPrefillToken] = useState(0);
  const { pendingContext, clearPendingContext } = useAlertContextStore();
  const fetchedAlertIdRef = useRef<string | null>(null);
  const consumedRef = useRef(false);

  useEffect(() => {
    if (!pendingContext) {
      consumedRef.current = false;
      fetchedAlertIdRef.current = null;
    }
  }, [pendingContext]);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    function onPrefill(event: Event) {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const text = detail?.text;
      if (!text) return;
      setPrefilledInput(text);
      setPrefillToken((v) => v + 1);
      setOpen(true);
    }
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    window.addEventListener("dydata:assistant-prefill", onPrefill);
    return () => {
      window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
      window.removeEventListener("dydata:assistant-prefill", onPrefill);
    };
  }, []);

  const prepareSend = async (text: string) => {
    if (!pendingContext || consumedRef.current) return text;

    let prefix: string | null = null;
    try {
      const res = await fetch(
        `/api/admin/dashboard-alerts/${encodeURIComponent(pendingContext.alertId)}/ai-context`,
        { credentials: "include" },
      );
      if (res.ok) {
        const json = (await res.json()) as { contextPrefix?: string };
        prefix = json.contextPrefix ?? null;
      }
    } catch {
      prefix = null;
    }

    consumedRef.current = true;
    fetchedAlertIdRef.current = pendingContext.alertId;
    clearPendingContext();

    return prefix ? `${prefix}\n${text}` : text;
  };

  const handleNewSession = () => {
    setSessionKey((value) => value + 1);
    consumedRef.current = false;
    clearPendingContext();
  };

  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden">
      {open ? (
        <section className="mb-3 flex h-[min(680px,calc(100dvh-96px))] w-[min(460px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-[#FAFAFB] shadow-[0_18px_60px_rgba(15,23,42,0.18)]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-zinc-900 text-white">
                <Bot className="size-3.5" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-zinc-800">后台 AI 助手</p>
                <p className="text-[11px] text-zinc-400">随时查询、诊断、处理后台任务</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleNewSession}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
              >
                新对话
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="关闭 AI 助手"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {pendingContext ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-[#EEF4FF] px-3 py-2">
              <Sparkles className="size-3.5 shrink-0 text-[#444CE7]" strokeWidth={1.75} />
              <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#36359C]">
                正在咨询：{pendingContext.preview}
              </p>
              <button
                type="button"
                onClick={clearPendingContext}
                className="flex size-5 shrink-0 items-center justify-center rounded text-[#36359C] transition hover:bg-white/60"
                aria-label="取消上下文"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1">
            <ChatPanel
              key={sessionKey}
              actorRole={actorRole}
              onHistoryRefresh={() => undefined}
              onOpenHistory={() => undefined}
              prepareSend={prepareSend}
              prefilledInput={prefilledInput}
              prefillToken={prefillToken}
            />
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-900 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-800",
          open && "bg-white text-zinc-800 hover:bg-zinc-50",
        )}
        aria-pressed={open}
        aria-label={open ? "收起 AI 助手" : "打开 AI 助手"}
      >
        <Bot className="size-4" strokeWidth={1.75} />
        {pendingContext && !open ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-[#444CE7] ring-2 ring-white">
            <Sparkles className="size-2 text-white" strokeWidth={2.5} />
          </span>
        ) : null}
      </button>
    </div>
  );
}

