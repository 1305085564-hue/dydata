"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AssistantDebug, AssistantDetails } from "@/lib/admin-ai/presentation";
import { Copy } from "lucide-react";
import AssistantDetailSections from "./assistant-detail-sections";

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
    <Card className="border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/20">
      <CardHeader className="gap-2">
        <CardTitle className="text-sm text-orange-700 dark:text-orange-300">
          高危操作，确认后才会执行
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {data.confirmationMessage || `即将执行 ${data.toolName}`}
        </p>
        {data.confirmationReason ? (
          <p className="text-sm text-orange-700/80 dark:text-orange-300/80">{data.confirmationReason}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <AssistantDetailSections details={data.details} />

        {actorRole === "owner" && debug ? (
          <Collapsible className="rounded-lg border border-orange-200/60 bg-background/80">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium">
              调试信息
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 px-3 pb-3">
              {debug.backupSql ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">备份 SQL</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => navigator.clipboard.writeText(debug.backupSql || "")}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制
                    </Button>
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
                    {debug.backupSql}
                  </pre>
                </div>
              ) : null}
              {debug.toolParams ? (
                <div className="space-y-1">
                  <div className="text-sm font-medium">工具参数</div>
                  <pre className="overflow-x-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
                    {formatContent(debug.toolParams)}
                  </pre>
                </div>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button onClick={onConfirm} disabled={submitting}>
          {submitting ? "处理中..." : "确认执行"}
        </Button>
      </CardFooter>
    </Card>
  );
}
