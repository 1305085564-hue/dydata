"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

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
    description: "当前范围内没有待审批，点击可查看最近待办窗口。",
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

  function handleRequestHandled(request: ExemptionRequestRow) {
    setLocalRequests((current) =>
      current.filter((item) => item.id !== request.id),
    );
    setHandledCount((current) => current + 1);
  }

  function handleRequestRestore(request: ExemptionRequestRow) {
    setLocalRequests((current) => {
      if (current.some((item) => item.id === request.id)) return current;
      return [...current, request].sort(
        (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      );
    });
    setHandledCount((current) => Math.max(0, current - 1));
  }

  const validQuickActions = quickActions.filter((item) => item.href);

  return (
    <div className="flex h-full flex-col space-y-6">
      <h2 className="text-lg font-semibold text-[#1C1917]">工作流中心</h2>

      <div className="space-y-6">
        <div>
          <p className="text-[12px] uppercase tracking-[0.25em] font-medium text-[#78716C]">优先待办</p>
          <div className="mt-4">
            {canManageMembers ? (
              <Dialog
                open={isExemptionDialogOpen}
                onOpenChange={setIsExemptionDialogOpen}
              >
                <DialogTrigger
                  render={
                    <button
                      type="button"
                      className="group flex w-full items-start gap-4 border-b border-[#ECE7DE] py-3 text-left transition-all duration-150 hover:bg-[#F5F3EE] active:scale-[0.985] active:duration-75 last:border-b-0 cursor-pointer"
                    />
                  }
                >
                  <div className="mt-1.5 flex-shrink-0">
                    <div
                      className={`rounded-full ${
                        effectivePendingCount > 0
                          ? "h-2 w-2 bg-[#D97757] ring-1 ring-white"
                          : "h-2 w-2 bg-[#6FAA7D] ring-1 ring-white"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-[13px] font-medium text-[#1C1917]">
                        {exemptionReminder.title}
                      </p>
                      {exemptionReminder.badge ? (
                        <Badge variant="default" className="h-5 px-2 text-[12px]">
                          {exemptionReminder.badge}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-[1.7] text-[#78716C]">
                      {exemptionReminder.description}
                    </p>
                  </div>
                </DialogTrigger>

                <DialogContent className="max-w-[min(960px,calc(100vw-2rem))] rounded-2xl border border-[#E5E0D6] bg-white p-0 shadow-claude-dialog">
                  <div className="space-y-4 p-5 sm:p-6">
                    <DialogHeader>
                      <DialogTitle>
                        {effectivePendingCount > 0
                          ? "待处理豁免申请"
                          : "豁免申请处理窗口"}
                      </DialogTitle>
                      <DialogDescription>
                        保留原有批准与拒绝逻辑，并在当前窗口里即时同步处理结果。
                      </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[65vh] overflow-auto rounded-xl border border-[#E5E0D6] bg-white p-4">
                      <豁免申请列表
                        requests={localRequests}
                        onHandled={handleRequestHandled}
                        onRestore={handleRequestRestore}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}

            <div className="group flex items-start gap-4 border-b border-[#ECE7DE] py-3 text-left transition-all duration-150 hover:bg-[#F5F3EE] last:border-b-0">
              <div className="mt-1.5 flex-shrink-0">
                <div className="h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[13px] font-medium text-[#1C1917]">
                    提交状态异常
                  </p>
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] leading-[1.7] text-[#78716C]">
                  需要跟进未交或数据异常情况，详情查看状态面板。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[12px] uppercase tracking-[0.25em] font-medium text-[#78716C]">快捷动作</p>
          <div className="mt-4">
            {validQuickActions.length > 0 ? (
              validQuickActions.map((item) => (
                <Link
                  key={item.label}
                  href={item.href!}
                  className="flex items-center justify-between border-b border-[#ECE7DE] py-2.5 transition-all duration-150 hover:bg-[#F5F3EE] active:scale-[0.985] active:duration-75 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <div className="size-1.5 rounded-full bg-[#E5E0D6]" />
                    <p className="text-[13px] text-[#292524]">{item.label}</p>
                  </div>
                  <ChevronRight className="size-4 text-[#78716C] stroke-[1.5]" />
                </Link>
              ))
            ) : (
              <p className="py-2 text-[13px] text-[#78716C]">
                还没有推荐的快捷操作
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
