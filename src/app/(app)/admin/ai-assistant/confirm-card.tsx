"use client";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AssistantDebug, AssistantDetails } from "@/lib/admin-ai/presentation";
import { Copy, AlertTriangle, CheckCircle2, XCircle, Terminal, Loader2 } from "lucide-react";
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

export default function ConfirmCard({ actorRole, data, submitting = false, onConfirm, onCancel }: ConfirmCardProps) {
  const debug = data.debug;

  return (
    <div className="my-4 border border-destructive/20 bg-destructive/5 text-foreground rounded-xl overflow-hidden text-sm relative shadow-sm animate-in slide-in-from-bottom-2 duration-300">

      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-destructive/10 bg-destructive/5 px-4 py-3">
         <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>执行确认</span>
         </div>
         <div className="text-xs text-zinc-500 bg-white px-2 py-1 rounded-md">
            {data.toolName}
         </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Message area */}
        <div className="space-y-2">
          <p className="text-foreground">
            {data.confirmationMessage || `系统将执行: ${data.toolName}`}
          </p>
          {data.confirmationReason && (
            <p className="text-sm text-destructive/80 border-l-2 border-destructive/30 pl-3 py-1 bg-destructive/5 rounded-r-md">
              {data.confirmationReason}
            </p>
          )}
        </div>

        {/* Payload / Details */}
        {data.details && (
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
             <AssistantDetailSections details={data.details} />
          </div>
        )}

        {/* Debug (Owner only) */}
        {actorRole === "owner" && debug && (
          <Collapsible className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
            <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-zinc-500 hover:text-zinc-950 hover:bg-zinc-50 transition-colors">
              <Terminal className="h-4 w-4" />
              调试信息
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 border-t border-border/50 p-4">
              {debug.backupSql && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>回滚 SQL</span>
                    <button
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                      onClick={() => navigator.clipboard.writeText(debug.backupSql || "")}
                    >
                      <Copy className="h-3.5 w-3.5" /> 复制
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs text-emerald-600 dark:text-emerald-400 border border-border/50">
                    {debug.backupSql}
                  </pre>
                </div>
              )}
              {debug.toolParams && (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">参数</div>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground border border-border/50">
                    {formatContent(debug.toolParams)}
                  </pre>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
           <Button
             variant="outline"
             size="sm"
             onClick={onCancel}
             disabled={submitting}
             className="text-muted-foreground h-9"
           >
             <XCircle className="h-4 w-4 mr-2" />
             取消
           </Button>
           <Button
             variant="destructive"
             size="sm"
             onClick={onConfirm}
             disabled={submitting}
             className="h-9 shadow-sm"
           >
             {submitting ? (
               <span className="flex items-center gap-2">
                 <Loader2 className="h-4 w-4 animate-spin" />
                 处理中...
               </span>
             ) : (
               <>
                 <CheckCircle2 className="h-4 w-4 mr-2" />
                 确认执行
               </>
             )}
           </Button>
        </div>
      </div>
    </div>
  );
}
