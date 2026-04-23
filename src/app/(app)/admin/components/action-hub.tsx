"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight, FileClock, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const exemptionReminder = getExemptionReminderMeta(pendingRequestCount);

  return (
    <Card className="glass-card-static border-white/70 glass-panel backdrop-blur-[16px] h-full flex flex-col">
      <CardHeader className="pb-3 border-b border-[var(--color-border)]/40 bg-[var(--color-surface)]/20">
        <CardTitle className="flex items-center gap-2 text-base font-bold tracking-tight">
          <CheckCircle2 className="size-4 text-[var(--color-primary)]" />
          工作流中心 (Action Hub)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex-1 space-y-4">
        {/* 待办汇总区 */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] px-1">优先待办</p>

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
                <div className={`mt-0.5 rounded-full p-2 ${pendingRequestCount > 0 ? "bg-[var(--color-danger)]/10 text-[var(--color-danger)]" : "bg-[var(--color-success)]/10 text-[var(--color-success)]"}`}>
                  <FileClock className="size-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
                      {exemptionReminder.title}
                    </p>
                    {exemptionReminder.badge ? (
                      <Badge variant="destructive" className="h-5 rounded-full px-2 text-[10px]">
                        {exemptionReminder.badge}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)] line-clamp-2">
                    {exemptionReminder.description}
                  </p>
                </div>
              </DialogTrigger>
              <DialogContent className="max-w-[min(960px,calc(100vw-2rem))] p-0">
                <div className="space-y-4 p-5 sm:p-6">
                  <DialogHeader>
                    <DialogTitle>{pendingRequestCount > 0 ? "待处理豁免申请" : "豁免申请处理窗口"}</DialogTitle>
                    <DialogDescription>
                      保留原有批准与拒绝逻辑，在这里集中处理成员提交的豁免申请。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="max-h-[65vh] overflow-auto rounded-2xl border border-[var(--color-border)] bg-background p-4">
                    <豁免申请列表 requests={exemptionRequests} />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
          
          <div className="group flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3.5 shadow-sm transition hover:bg-[var(--color-surface)]/80 hover:shadow-md cursor-pointer">
            <div className="mt-0.5 rounded-full bg-[var(--color-warning)]/10 p-2 text-[var(--color-warning)]">
              <ShieldAlert className="size-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition-colors">
                  提交状态异常
                </p>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)] line-clamp-2">
                需跟进未交或数据异常情况，详情见左侧状态墙。
              </p>
            </div>
          </div>
        </div>

        {/* 快捷动作 */}
        <div className="space-y-3 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] px-1">快捷动作</p>
          <div className="grid gap-2">
            {quickActions.length > 0 ? (
              quickActions.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center justify-between rounded-xl border border-[var(--color-border)]/50 bg-[var(--color-surface)]/20 px-3 py-2.5 transition hover:bg-[var(--color-surface)] hover:border-primary/30"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="size-1.5 rounded-full bg-[var(--color-primary)]/40" />
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.label}</p>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-[var(--color-text-tertiary)]" />
                  </Link>
                ) : null
              )
            ) : (
              <p className="text-xs text-[var(--color-text-secondary)] italic px-2">暂无推荐快捷操作</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
