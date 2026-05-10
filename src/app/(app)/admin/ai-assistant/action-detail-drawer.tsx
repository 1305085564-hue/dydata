"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Copy,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ActionDetail = {
  id: string;
  adminName: string;
  action操作类型: string;
  actionCategory?: string;
  description: string;
  aiReasoning?: string;
  toolName?: string;
  toolParams?: unknown;
  backupSql?: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  result?: string;
  errorMessage?: string;
  createdAt: string;
};

type Props = {
  id: string;
  actorRole?: "admin" | "owner";
  onClose: () => void;
};

function formatJson(value: unknown) {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resultMeta(result?: string) {
  switch (result) {
    case "success":
      return {
        icon: <CheckCircle2 className="h-3 w-3" />,
        text: "APPROVED",
        dot: "h-2 w-2 bg-[#6FAA7D] ring-1 ring-white",
        text_cls: "text-[#6FAA7D]",
      };
    case "failed":
      return {
        icon: <XCircle className="h-3 w-3" />,
        text: "REJECTED",
        dot: "h-2 w-2 bg-[#C9604D] ring-1 ring-white animate-pulse",
        text_cls: "text-red-700",
      };
    case "cancelled":
      return {
        icon: <AlertTriangle className="h-3 w-3" />,
        text: "ABORTED",
        dot: "h-1.5 w-1.5 bg-zinc-200",
        text_cls: "text-zinc-500",
      };
    case "pending_confirm":
      return {
        icon: <Skeleton className="h-3 w-3 rounded-full" />,
        text: "PENDING",
        dot: "h-2 w-2 bg-[#D97757] ring-1 ring-white",
        text_cls: "text-[#B88448]",
      };
    default:
      return {
        icon: <Terminal className="h-3 w-3" />,
        text: result?.toUpperCase() || "UNKNOWN",
        dot: "bg-zinc-400",
        text_cls: "text-zinc-500",
      };
  }
}

function CopyButton({ payload }: { payload: string }) {
  return (
    <button
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-zinc-400 transition-colors hover:text-zinc-800"
      onClick={() => {
        navigator.clipboard.writeText(payload);
        toast.success("已复制");
      }}
    >
      <Copy className="h-3 w-3" />
      Copy
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
        {label}
      </div>
      <div className="truncate text-[12px] font-medium text-zinc-800">{value}</div>
    </div>
  );
}

export default function ActionDetailDrawer({ id, actorRole, onClose }: Props) {
  const [detail, setDetail] = useState<ActionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/ai-assistant/history/${id}`);
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "Failed to load");
        if (!cancelled) setDetail(data.action);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const status = resultMeta(detail?.result);

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-[#FAFAFB] p-0 shadow-sm">
        <DialogHeader className="relative shrink-0 border-b border-zinc-200 bg-white px-6 pb-4 pt-5">
          <div className="absolute left-0 top-0 h-full w-[3px] bg-zinc-300" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
                  Action Record
                </span>
                {detail?.id && (
                  <code className="rounded border border-zinc-200 bg-[#FAFAFB] px-1.5 py-px font-mono text-[10px] text-zinc-500">
                    #{detail.id.substring(0, 8)}
                  </code>
                )}
              </div>
              <DialogTitle className="mt-2 text-[18px] font-semibold leading-tight tracking-tight text-zinc-800">
                {loading ? "加载中..." : detail?.description || "—"}
              </DialogTitle>
            </div>
            {detail?.result && (
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#FAFAFB] px-2.5 py-1">
                <span className={cn("inline-flex rounded-full", status.dot)} />
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.25em]",
                    status.text_cls
                  )}
                >
                  {status.text}
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto custom-scrollbar px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <Skeleton className="h-4 w-24 rounded" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">
                Syncing
              </span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-100 bg-[#FEF9F9] p-4 text-center">
              <div className="text-[12px] text-red-700">{error}</div>
            </div>
          ) : detail ? (
            <>
              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-4">
                <Meta label="Operator" value={detail.adminName} />
                <Meta label="Type" value={detail.action操作类型?.toUpperCase() || "—"} />
                <Meta label="Tool" value={detail.toolName || "N/A"} />
                <Meta label="Time" value={new Date(detail.createdAt).toLocaleString()} />
              </div>

              {/* Error message */}
              {detail.errorMessage && (
                <div className="relative overflow-hidden rounded-2xl border border-red-100 bg-[#FEF9F9] p-4">
                  <div className="absolute left-0 top-0 h-full w-[3px] bg-[#C9604D]" />
                  <div className="pl-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-red-700">
                      System Error
                    </div>
                    <div className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-red-900/80">
                      {detail.errorMessage}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Reasoning */}
              {detail.aiReasoning && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
                    AI Reasoning
                  </div>
                  <div className="whitespace-pre-wrap text-[12.5px] italic leading-relaxed text-zinc-600">
                    {detail.aiReasoning}
                  </div>
                </div>
              )}

              {/* Owner-only debug */}
              {(detail.toolParams || detail.backupSql) && actorRole === "owner" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-400">
                      Owner Debug
                    </span>
                    <div className="h-px flex-1 bg-zinc-200" />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-300">
                      Restricted
                    </span>
                  </div>

                  {detail.toolParams !== undefined && detail.toolParams !== null && (
                    <Collapsible
                      className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
                      defaultOpen
                    >
                      <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-[#FAFAFB]">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                          Call Parameters
                        </span>
                        <ChevronDown className="h-3 w-3 text-zinc-400 transition-transform group-data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-[#FAFAFB] px-3 py-1.5">
                          <CopyButton payload={formatJson(detail.toolParams)} />
                        </div>
                        <pre className="overflow-x-auto bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-200">
                          {formatJson(detail.toolParams)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {detail.backupSql && (
                    <Collapsible className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                      <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-[#FAFAFB]">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                          Rollback SQL
                        </span>
                        <ChevronDown className="h-3 w-3 text-zinc-400 transition-transform group-data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-[#FAFAFB] px-3 py-1.5">
                          <CopyButton payload={detail.backupSql} />
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap bg-zinc-900 p-3 text-[11px] leading-relaxed text-[#D5E4D9]">
                          {detail.backupSql}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
