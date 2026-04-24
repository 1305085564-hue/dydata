"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, FileClock, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { 豁免申请列表, type ExemptionRequestRow } from "../豁免申请列表";

interface ActionHubProps {
  pendingRequestCount: number;
  quickActions: Array<{ label: string; description: string; href?: string }>;
  canManageMembers: boolean;
  exemptionRequests: ExemptionRequestRow[];
}

export function getExemptionReminderMeta(pendingRequestCount: number) {
  if (pendingRequestCount > 0) {
    return {
      title: "待处理豁免",
      badge: `${pendingRequestCount} 条待批准`,
      description: "有新的成员豁免申请，点击即可在小窗口中及时审批。",
    };
  }

  return {
    title: "豁免申请",
    badge: null,
    description: "当前待处理豁免申请已处理完毕，点击可查看最近待办窗口。",
  };
}

export function ActionHub({
  pendingRequestCount,
  quickActions,
  canManageMembers,
  exemptionRequests,
}: ActionHubProps) {
  const [isExemptionDialogOpen, setIsExemptionDialogOpen] = useState(false);
  const [localRequests, setLocalRequests] = useState(exemptionRequests);
  const [handledCount, setHandledCount] = useState(0);

  const effectivePendingCount = Math.max(0, pendingRequestCount - handledCount);
  const exemptionReminder = useMemo(
    () => getExemptionReminderMeta(effectivePendingCount),
    [effectivePendingCount],
  );

  function handleRequestHandled(requestId: string) {
    setLocalRequests((current) => current.filter((request) => request.id !== requestId));
    setHandledCount((current) => current + 1);
  }

  return (
    <Card className="glass-card-static flex h-full flex-col border-white/70 glass-panel backdrop-blur-[16px]">
      <CardHeader className="border-b border-[var(--color-border)]/40 bg-[var(--color-surface)]/20 pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold tracking-tight">
          <CheckCircle2 className="size-4 text-[var(--color-primary)]" />
          工作流中心
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 p-4">
        <div className="space-y-3">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            优先待办
          </p>

          {canManageMembers ? (
            <Dialog open={isExemptionDialogOpen} onOpenChange={setIsExemptionDialogOpen}>
              <DialogTrigger
                render={
                  <button
                    type="button"
                    className="group flex w-full items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3.5 text-left shadow-sm transition hover:bg-[var(--color-surface)]/80 hover:shadow-md"
                  />
                }
              >
                <div
                  className={`mt-0.5 rounded-full p-2 ${
                    effectivePendingCount > 0
                      ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
                      : "bg-[var(--color-success)]/10 text-[var(--color-success)]"
                  }`}
                >
                  <FileClock className="size-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)]">
                      {exemptionReminder.title}
                    </p>
                    {exemptionReminder.badge ? (
                      <Badge variant="destructive" className="h-5 rounded-full px-2 text-[10px]">
                        {exemptionReminder.badge}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-secondary)]">
                    {exemptionReminder.description}
                  </p>
                </div>
              </DialogTrigger>

              <DialogContent className="max-w-[min(960px,calc(100vw-2rem))] p-0">
                <div className="space-y-4 p-5 sm:p-6">
                  <DialogHeader>
                    <DialogTitle>
                      {effectivePendingCount > 0 ? "待处理豁免申请" : "豁免申请处理窗口"}
                    </DialogTitle>
                    <DialogDescription>
                      保留原有批准与拒绝逻辑，并在当前窗口里即时同步处理结果。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="max-h-[65vh] overflow-auto rounded-2xl border border-[var(--color-border)] bg-background p-4">
                    <豁免申请列表
                      requests={localRequests}
                      onHandled={handleRequestHandled}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}

          <div className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3.5 shadow-sm transition hover:bg-[var(--color-surface)]/80 hover:shadow-md">
            <div className="mt-0.5 rounded-full bg-[var(--color-warning)]/10 p-2 text-[var(--color-warning)]">
              <ShieldAlert className="size-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)]">
                  提交状态异常
                </p>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-secondary)]">
                需要跟进未交或数据异常情况，详情查看状态面板。
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            快捷动作
          </p>
          <div className="grid gap-2">
            {quickActions.length > 0 ? (
              quickActions.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center justify-between rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-surface)]/20 px-3 py-2.5 transition hover:border-primary/30 hover:bg-[var(--color-surface)]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="size-1.5 rounded-full bg-[var(--color-primary)]/40" />
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.label}</p>
                    </div>
                    <ChevronRight className="size-4 text-[var(--color-text-tertiary)]" />
                  </Link>
                ) : null,
              )
            ) : (
              <p className="px-2 text-xs italic text-[var(--color-text-secondary)]">
                暂无推荐快捷操作
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
