"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Copy, Loader2 } from "lucide-react";

type ActionDetail = {
  id: string;
  adminName: string;
  actionType: string;
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
  actionId: string | null;
  open: boolean;
  onClose: () => void;
};

function formatJson(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resultBadge(result?: string) {
  switch (result) {
    case "success":
      return <Badge>成功</Badge>;
    case "failed":
      return <Badge variant="destructive">失败</Badge>;
    case "cancelled":
      return <Badge variant="outline">已取消</Badge>;
    case "pending_confirm":
      return <Badge variant="secondary">待确认</Badge>;
    default:
      return result ? <Badge variant="outline">{result}</Badge> : null;
  }
}

export default function ActionDetailDrawer({ actionId, open, onClose }: Props) {
  const [detail, setDetail] = useState<ActionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !actionId) {
      setDetail(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/ai-assistant/history/${actionId}`);
        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || "详情加载失败");
        }
        if (!cancelled) {
          setDetail(data.action);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "详情加载失败";
        if (!cancelled) {
          setError(message);
          setDetail(null);
        }
        toast.error("详情加载失败");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [actionId, open]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="left-auto right-0 top-0 flex h-full w-full max-w-2xl translate-x-0 translate-y-0 flex-col rounded-none border-l p-0 data-open:slide-in-from-right-[24px] data-closed:slide-out-to-right-[24px]"
      >
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-3 pr-10">
            <div>
              <DialogTitle>操作详情</DialogTitle>
              {detail ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {resultBadge(detail.result)}
                  <span>{detail.adminName}</span>
                  <span>·</span>
                  <span>{new Date(detail.createdAt).toLocaleString("zh-CN")}</span>
                </div>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载详情...
            </div>
          ) : error ? (
            <div className="space-y-3 text-center">
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button variant="outline" onClick={onClose}>关闭</Button>
            </div>
          ) : detail ? (
            <div className="space-y-6">
              <section className="space-y-2">
                <div className="text-sm font-medium">操作说明</div>
                <div className="rounded-lg bg-muted p-3 text-sm">{detail.description}</div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-sm font-medium">操作类型</div>
                  <div className="text-sm text-muted-foreground">{detail.actionType}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">分类</div>
                  <div className="text-sm text-muted-foreground">{detail.actionCategory || "-"}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">工具名</div>
                  <div className="text-sm text-muted-foreground">{detail.toolName || "-"}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">结果</div>
                  <div>{resultBadge(detail.result)}</div>
                </div>
              </section>

              {detail.aiReasoning ? (
                <section className="space-y-2">
                  <div className="text-sm font-medium">AI 推理</div>
                  <div className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">
                    {detail.aiReasoning}
                  </div>
                </section>
              ) : null}

              {detail.toolParams ? (
                <section className="space-y-2">
                  <div className="text-sm font-medium">工具参数</div>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                    {formatJson(detail.toolParams)}
                  </pre>
                </section>
              ) : null}

              {detail.errorMessage ? (
                <section className="space-y-2">
                  <div className="text-sm font-medium text-destructive">错误信息</div>
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                    {detail.errorMessage}
                  </div>
                </section>
              ) : null}

              {detail.backupSql ? (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">备份 SQL</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(detail.backupSql || "");
                        toast.success("已复制备份 SQL");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制
                    </Button>
                  </div>
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                    {detail.backupSql}
                  </pre>
                </section>
              ) : null}

              {detail.beforeSnapshot || detail.afterSnapshot ? (
                <section className="space-y-2">
                  <div className="text-sm font-medium">数据快照</div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">操作前</div>
                      <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                        {formatJson(detail.beforeSnapshot) || "-"}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">操作后</div>
                      <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                        {formatJson(detail.afterSnapshot) || "-"}
                      </pre>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
