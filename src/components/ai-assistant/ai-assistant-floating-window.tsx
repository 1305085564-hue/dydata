"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";

import ChatPanel from "@/app/(app)/admin/ai-assistant/chat-panel";
import { cn } from "@/lib/utils";

interface AiAssistantFloatingWindowProps {
  actorRole: "admin" | "owner";
}

export function AiAssistantFloatingWindow({ actorRole }: AiAssistantFloatingWindowProps) {
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

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
                onClick={() => setSessionKey((value) => value + 1)}
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
          <div className="min-h-0 flex-1">
            <ChatPanel
              key={sessionKey}
              actorRole={actorRole}
              onHistoryRefresh={() => undefined}
              onOpenHistory={() => undefined}
            />
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-12 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-800",
          open && "bg-white text-zinc-800 hover:bg-zinc-50",
        )}
        aria-pressed={open}
      >
        <Bot className="size-4" />
        AI 助手
      </button>
    </div>
  );
}
