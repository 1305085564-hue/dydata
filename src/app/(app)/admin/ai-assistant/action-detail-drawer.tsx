"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Loader2, Terminal, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
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

// ... existing Props but notice we only need id and onClose now based on history-sidebar usage
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

function resultStatus(result?: string) {
  switch (result) {
    case "success":
      return { icon: <CheckCircle2 className="h-4 w-4" />, text: "SUCCESS", classes: "text-zinc-950 bg-zinc-100 border-zinc-200" };
    case "failed":
      return { icon: <XCircle className="h-4 w-4" />, text: "FAILED", classes: "text-destructive bg-destructive/10 border-destructive/30" };
    case "cancelled":
      return { icon: <AlertTriangle className="h-4 w-4" />, text: "ABORTED", classes: "text-zinc-500 bg-zinc-50 border-zinc-200" };
    case "pending_confirm":
      return { icon: <Loader2 className="h-4 w-4 animate-spin" />, text: "PENDING_AUTH", classes: "text-[#B45309] bg-[#FEFCE8] border-[#EAB308]/30" };
    default:
      return { icon: <Terminal className="h-4 w-4" />, text: result?.toUpperCase() || "UNKNOWN", classes: "text-zinc-500 bg-zinc-50 border-zinc-200" };
  }
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
        if (!res.ok || data.error) {
          throw new Error(data.error || "Failed to load payload");
        }
        if (!cancelled) {
          setDetail(data.action);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Load failed";
        if (!cancelled) {
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-white border border-zinc-200 shadow-lg text-zinc-950 p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-5 py-4 border-b border-zinc-200 bg-zinc-50">
          <DialogTitle className="flex items-center justify-between text-sm font-semibold text-zinc-900">
            <span className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-zinc-500" />
              操作详情
            </span>
            {detail?.id && <span className="text-[10px] text-zinc-400 font-mono">{detail.id.substring(0,8)}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 overflow-y-auto max-h-[80vh] custom-scrollbar space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-950" />
              <div className="text-xs tracking-widest uppercase">加载数据中...</div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="text-[#B42318] text-sm mb-2">{error}</div>
            </div>
          ) : detail ? (
            <>
              {/* Header Info */}
              <div className="flex flex-col gap-4 border border-zinc-200 bg-zinc-50 rounded-xl p-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest">操作描述</div>
                    <div className="text-sm text-foreground">{detail.description}</div>
                  </div>
                  {detail.result && (() => {
                    const status = resultStatus(detail.result);
                    return (
                      <div className={cn("flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold tracking-wider rounded-lg border", status.classes)}>
                        {status.icon}
                        {status.text}
                      </div>
                    );
                  })()}
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-zinc-200">
                  <div>
                     <div className="text-[10px] text-zinc-400 font-medium mb-1">操作人</div>
                     <div className="text-xs text-zinc-900">{detail.adminName}</div>
                  </div>
                  <div>
                     <div className="text-[10px] text-zinc-400 font-medium mb-1">操作类型</div>
                     <div className="text-xs text-zinc-900">{detail.action操作类型?.toUpperCase()}</div>
                  </div>
                  <div>
                     <div className="text-[10px] text-zinc-400 font-medium mb-1">操作模块</div>
                     <div className="text-xs text-zinc-900">{detail.toolName || "N/A"}</div>
                  </div>
                  <div>
                     <div className="text-[10px] text-zinc-400 font-medium mb-1">操作时间</div>
                     <div className="text-xs text-zinc-900">{new Date(detail.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              {detail.errorMessage && (
                <div className="bg-red-50 border-l-2 border-red-300 p-3 rounded-r-lg">
                   <div className="text-xs text-red-700 font-medium mb-1">系统报错</div>
                   <div className="text-sm text-zinc-900 whitespace-pre-wrap">{detail.errorMessage}</div>
                </div>
              )}

              {detail.aiReasoning && (
                <div className="space-y-2">
                   <div className="text-[10px] text-zinc-900 font-semibold tracking-wider">AI 推理过程</div>
                   <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm text-zinc-600 leading-relaxed">
                      {detail.aiReasoning}
                   </div>
                </div>
              )}

              {/* Data payload collapsible */}
              {(detail.toolParams || detail.backupSql) && actorRole === "owner" && (
                <div className="space-y-3">
                  <div className="text-[10px] text-zinc-900 font-semibold tracking-wider">参数及语句 (仅 Owner 可见)</div>
                  
                  {detail.toolParams !== undefined && detail.toolParams !== null && (
                    <Collapsible className="border border-zinc-200 rounded-xl overflow-hidden bg-white" defaultOpen>
                      <CollapsibleTrigger className="flex w-full justify-between items-center bg-zinc-50 px-3 py-2 text-xs hover:bg-zinc-100 transition-colors cursor-pointer rounded-t-xl">
                        <span className="text-zinc-500">调用参数</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="p-3 text-[11px] text-zinc-950 overflow-x-auto">
                          {formatJson(detail.toolParams)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {detail.backupSql && (
                    <Collapsible className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                      <CollapsibleTrigger className="flex w-full justify-between items-center bg-zinc-50 px-3 py-2 text-xs hover:bg-zinc-100 transition-colors cursor-pointer rounded-t-xl">
                        <span className="text-zinc-500">回滚 SQL</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="flex justify-end p-2 border-b border-zinc-100">
                          <button
                            className="text-[10px] text-zinc-400 hover:text-zinc-900 flex items-center gap-1 transition-colors"
                            onClick={() => navigator.clipboard.writeText(detail.backupSql || "")}
                          >
                            <Copy className="h-3 w-3" /> 复制
                          </button>
                        </div>
                        <pre className="p-3 text-[11px] text-amber-700 overflow-x-auto whitespace-pre-wrap">
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
