"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AssistantDebug, AssistantDetails } from "@/lib/admin-ai/presentation";
import { Copy, CheckCircle2, XCircle, Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import AssistantDetailSections from "./assistant-detail-sections";
import { cn } from "@/lib/utils";

type ConfirmCardProps = {
  actorRole: "admin" | "owner";
  data: {
    toolName: string;
    confirmationMessage?: string;
    confirmationReason?: string;
    details?: AssistantDetails;
    debug?: AssistantDebug;
  };
  submitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function formatContent(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function ConfirmCard({
  actorRole,
  data,
  submitting = false,
  onConfirm,
  onCancel,
}: ConfirmCardProps) {
  const debug = data.debug;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08)]">
      {/* Amber status rail */}
      <div className="absolute left-0 top-0 h-full w-[3px] bg-[#D99E55]" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 pl-6">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D99E55] opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D99E55] shadow-[0_0_0_3px_rgba(217,158,85,0.15)]" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#B88448]">
            Authorization Required
          </span>
        </div>
        <code className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
          {data.toolName}
        </code>
      </div>

      {/* Body */}
      <div className="space-y-4 px-5 py-4 pl-6">
        {/* Message */}
        <div className="space-y-2.5">
          <p className="text-[14px] leading-relaxed tracking-[0.005em] text-zinc-800">
            {data.confirmationMessage || `系统将执行: ${data.toolName}`}
          </p>
          {data.confirmationReason && (
            <div className="rounded-lg border border-zinc-200 bg-[#FBF6EC] px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#B88448]">
                Reason
              </div>
              <p className="mt-1 text-[12.5px] italic leading-relaxed text-[#8A6535]">
                {data.confirmationReason}
              </p>
            </div>
          )}
        </div>

        {/* Details */}
        {data.details && (
          <div className="rounded-xl border border-zinc-200 bg-[#FAFAFB] p-3">
            <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
              Payload
            </div>
            <AssistantDetailSections details={data.details} />
          </div>
        )}

        {/* Debug (Owner only) */}
        {actorRole === "owner" && debug && (
          <Collapsible className="overflow-hidden rounded-xl border border-zinc-200 bg-[#FAFAFB]">
            <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900">
              <Terminal className="h-3 w-3" />
              Debug
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 border-t border-zinc-200 p-3">
              {debug.backupSql && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                    <span>Rollback SQL</span>
                    <button
                      className="inline-flex items-center gap-1 normal-case text-zinc-400 transition-colors hover:text-zinc-900"
                      onClick={() => navigator.clipboard.writeText(debug.backupSql || "")}
                    >
                      <Copy className="h-3 w-3" /> 复制
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-900 p-2.5 text-[11px] leading-relaxed text-[#D5E4D9]">
                    {debug.backupSql}
                  </pre>
                </div>
              )}
              {debug.toolParams && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                    Parameters
                  </div>
                  <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-900 p-2.5 text-[11px] leading-relaxed text-zinc-200">
                    {formatContent(debug.toolParams)}
                  </pre>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
            className={cn(
              "h-8 border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-600 shadow-none",
              "hover:-translate-y-[1px] hover:border-zinc-300 hover:bg-white hover:text-zinc-900 hover:shadow-sm active:translate-y-0"
            )}
          >
            <XCircle className="mr-1.5 h-3 w-3" />
            取消
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={submitting}
            className={cn(
              "h-8 bg-[#D97757] px-3 text-[12px] font-medium text-white shadow-sm",
              "hover:-translate-y-[1px] hover:bg-[#C96442] hover:shadow-md active:translate-y-0"
            )}
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <Skeleton className="h-3 w-8 rounded" />
                处理中
              </span>
            ) : (
              <>
                <CheckCircle2 className="mr-1.5 h-3 w-3" />
                确认执行
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
