"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { Alert, AlertSeverity, SuggestedAction } from "@/lib/alert-sources/types";
import { useAlertContextStore } from "@/components/ai-assistant/alert-context-store";
import { cn } from "@/lib/utils";

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  critical: "border-l-[#B42318]",
  warning: "border-l-[#EAB308]",
  info: "border-l-[#444CE7]",
};

function buildExecuteToolPrompt(action: SuggestedAction, alertTitle: string) {
  const argsBlob = action.toolArgs && Object.keys(action.toolArgs).length > 0
    ? `\n参数：${JSON.stringify(action.toolArgs)}`
    : "";
  return `请帮我执行：${action.label}（针对告警「${alertTitle}」，工具 ${action.toolName ?? "未指定"}）${argsBlob}`;
}

export function AiAlertCard({ alert }: { alert: Alert }) {
  const { consultAlert, setPendingContext, requestAssistantOpen } = useAlertContextStore();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const handleConsult = () => {
    consultAlert({ alertId: alert.id, preview: alert.title });
  };

  const fallbackToAssistant = (action: SuggestedAction) => {
    setPendingContext({ alertId: alert.id, preview: alert.title });
    requestAssistantOpen();
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("dydata:assistant-prefill", {
          detail: { text: buildExecuteToolPrompt(action, alert.title) },
        }),
      );
    }
  };

  const handleExecuteTool = async (action: SuggestedAction, key: string) => {
    if (busyKey) return;
    if (!action.toolName) {
      fallbackToAssistant(action);
      return;
    }

    setBusyKey(key);
    try {
      const res = await fetch(
        `/api/admin/dashboard-alerts/${encodeURIComponent(alert.id)}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            toolName: action.toolName,
            toolArgs: action.toolArgs ?? {},
          }),
        },
      );

      if (res.status === 409) {
        toast.message("该动作需要确认，已切换到 AI 对话流");
        fallbackToAssistant(action);
        return;
      }

      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; result?: unknown }
        | null;

      if (!res.ok || !json?.success) {
        const msg = json?.error ?? "执行失败，已切换到 AI 对话流";
        toast.error(msg);
        fallbackToAssistant(action);
        return;
      }

      toast.success(`${action.label}：执行完成`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("dydata:alerts-refresh"));
      }
    } catch {
      toast.error("网络异常，已切换到 AI 对话流");
      fallbackToAssistant(action);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <article
      className={cn(
        "rounded-xl border border-zinc-200 border-l-2 bg-white px-4 py-3 transition-shadow hover:shadow-sm",
        SEVERITY_BORDER[alert.severity],
      )}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="text-[13px] font-medium tracking-tight text-zinc-800">
            {alert.title}
          </h4>
          {alert.detail ? (
            <p className="text-[12px] leading-relaxed text-zinc-500">{alert.detail}</p>
          ) : null}
        </div>
      </header>

      {alert.affectedEntities.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alert.affectedEntities.slice(0, 8).map((entity) => (
            <span
              key={`${entity.type}-${entity.id}`}
              className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[12px] text-zinc-600"
              title={`${entity.type} · ${entity.id}`}
            >
              {entity.name}
            </span>
          ))}
          {alert.affectedEntities.length > 8 ? (
            <span className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[12px] text-zinc-400">
              +{alert.affectedEntities.length - 8}
            </span>
          ) : null}
        </div>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {alert.suggestedActions.map((action, idx) => {
          const key = `${action.label}-${idx}`;
          if (action.type === "navigate" && action.href) {
            return (
              <Link
                key={key}
                href={action.href}
                className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-700 transition-[background-color,color,box-shadow,transform] duration-150 hover:-translate-y-[1px] hover:border-zinc-300 hover:text-zinc-900 hover:shadow-sm active:translate-y-0"
              >
                {action.label}
              </Link>
            );
          }
          const isBusy = busyKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => void handleExecuteTool(action, key)}
              disabled={Boolean(busyKey)}
              aria-busy={isBusy}
              className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-700 transition-[background-color,color,box-shadow,transform] duration-150 hover:-translate-y-[1px] hover:border-zinc-300 hover:text-zinc-900 hover:shadow-sm active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isBusy ? "执行中…" : action.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={handleConsult}
          className="inline-flex items-center gap-1 rounded-lg bg-zinc-950 px-2.5 py-1 text-[12px] font-medium text-zinc-50 transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-[1px] hover:bg-zinc-800 hover:shadow-sm active:translate-y-0"
        >
          <Sparkles className="size-3" strokeWidth={1.75} />
          问问 AI
        </button>
      </footer>
    </article>
  );
}

