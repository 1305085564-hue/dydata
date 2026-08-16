"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { FulfillmentMemberSummary, FulfillmentStatus } from "@/types/fulfillment";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type MarkAction = Extract<FulfillmentStatus, "leave" | "waived" | "absent" | "confirmed_published">;

interface ExceptionQueueProps {
  members: FulfillmentMemberSummary[];
  today: string;
  selectedIds: Set<string>;
  onSelectToggle: (userId: string) => void;
  onSelectAll: (selected: boolean, visibleIds?: string[]) => void;
  onQuickMark: (userId: string, status: MarkAction) => Promise<void>;
  onBatchMark: (userIds: string[], status: MarkAction, reason: string) => Promise<void>;
  onMemberClick: (member: FulfillmentMemberSummary) => void;
}

const ACTION_LABELS: Record<MarkAction, string> = {
  leave: "请假",
  waived: "豁免",
  absent: "缺勤",
  confirmed_published: "确认已发",
};

export function requiresQuickMarkConfirmation(action: MarkAction) {
  return action === "absent";
}

function StatusBadge({ status }: { status: FulfillmentStatus }) {
  const config: Record<string, { label: string; dot: string }> = {
    published: { label: "已发布", dot: "bg-[#6FAA7D]" },
    confirmed_published: { label: "已确认", dot: "bg-[#6FAA7D]" },
    leave: { label: "请假", dot: "bg-[#5F82A8]" },
    waived: { label: "豁免", dot: "bg-[#5F82A8]" },
    exempted: { label: "豁免期", dot: "bg-[#5F82A8]/50" },
    absent: { label: "缺勤", dot: "bg-[#C9604D]" },
    unconfirmed: { label: "待确认", dot: "bg-zinc-200" },
  };
  const c = config[status] ?? config.unconfirmed;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-700">
      <span className={`size-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function ExceptionQueue({
  members,
  today,
  selectedIds,
  onSelectToggle,
  onSelectAll,
  onQuickMark,
  onBatchMark,
  onMemberClick,
}: ExceptionQueueProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<MarkAction | null>(null);
  const [batchReason, setBatchReason] = useState("");
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [quickConfirm, setQuickConfirm] = useState<{
    userId: string;
    userName: string;
    action: MarkAction;
  } | null>(null);

  const visibleMembers = isExpanded ? members : members.slice(0, 10);
  const hasMore = members.length > 10;
  const visibleUserIds = visibleMembers.map((m) => m.userId);

  const allSelected = visibleMembers.length > 0 && visibleMembers.every((m) => selectedIds.has(m.userId));
  const someSelected = visibleMembers.some((m) => selectedIds.has(m.userId)) && !allSelected;
  const hasSelected = selectedIds.size > 0;

  const toggleSelectVisible = useCallback(() => {
    onSelectAll(!allSelected, visibleUserIds);
  }, [allSelected, onSelectAll, visibleUserIds]);

  const handleQuickMark = useCallback(
    async (userId: string, action: MarkAction) => {
      setMarkingId(userId);
      try {
        await onQuickMark(userId, action);
      } finally {
        setMarkingId(null);
      }
    },
    [onQuickMark]
  );

  const requestQuickMark = useCallback(
    (userId: string, userName: string, action: MarkAction) => {
      if (requiresQuickMarkConfirmation(action)) {
        setQuickConfirm({ userId, userName, action });
        return;
      }
      void handleQuickMark(userId, action);
    },
    [handleQuickMark],
  );

  const handleQuickConfirm = useCallback(async () => {
    if (!quickConfirm) return;
    await handleQuickMark(quickConfirm.userId, quickConfirm.action);
    setQuickConfirm(null);
  }, [handleQuickMark, quickConfirm]);

  const handleBatchConfirm = useCallback(async () => {
    if (!batchAction || selectedIds.size === 0) return;
    setBatchSubmitting(true);
    try {
      await onBatchMark(Array.from(selectedIds), batchAction, batchReason.trim());
      setBatchConfirmOpen(false);
      setBatchAction(null);
      setBatchReason("");
    } finally {
      setBatchSubmitting(false);
    }
  }, [batchAction, selectedIds, batchReason, onBatchMark]);

  const openBatchConfirm = useCallback((action: MarkAction) => {
    setBatchAction(action);
    setBatchReason("");
    setBatchConfirmOpen(true);
  }, []);

  const getLastPublishedDate = useCallback((member: FulfillmentMemberSummary) => {
    const dates = Object.keys(member.days)
      .filter((d) => {
        const s = member.days[d].status;
        return s === "published" || s === "confirmed_published";
      })
      .sort();
    return dates.pop();
  }, []);

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white py-12">
        <EmptyState
          title="当前范围内无人待处理"
          description="所有成员的发布状态已确认完毕"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* 列表 */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-zinc-200/50 bg-zinc-50/50">
                <th className="w-10 px-3 py-1.5 text-left">
                  <Checkbox
                    aria-label="全选当前可见成员"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleSelectVisible}
                  />
                </th>
                <th className="px-3 py-1.5 text-left text-[12px] font-normal tracking-[0.12em] text-zinc-500">
                  成员
                </th>
                <th className="px-3 py-1.5 text-left text-[12px] font-normal tracking-[0.12em] text-zinc-500">
                  今日状态
                </th>
                <th className="px-3 py-1.5 text-left text-[12px] font-normal tracking-[0.12em] text-zinc-500">
                  连续未发
                </th>
                <th className="px-3 py-1.5 text-left text-[12px] font-normal tracking-[0.12em] text-zinc-500">
                  上次发布
                </th>
                <th className="px-3 py-1.5 text-left text-[12px] font-normal tracking-[0.12em] text-zinc-500">
                  发布率
                </th>
                <th className="min-w-[200px] px-3 py-1.5 text-right text-[12px] font-normal tracking-[0.12em] text-zinc-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => {
                const todayRecord = member.days[today];
                const lastPublished = getLastPublishedDate(member);
                const isSelected = selectedIds.has(member.userId);
                const isMarking = markingId === member.userId;

                return (
                  <tr
                    key={member.userId}
                    className="group border-b border-zinc-100 last:border-b-0 transition-colors duration-150 bg-white hover:bg-zinc-50"
                  >
                    <td className="px-3 py-1.5">
                      <Checkbox
                        checked={isSelected}
                        aria-label={`选择 ${member.userName}`}
                        onCheckedChange={() => onSelectToggle(member.userId)}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => onMemberClick(member)}
                        className="inline-flex items-center gap-2 text-left group/btn"
                      >
                        <span className="font-medium text-zinc-900 transition-colors group-hover/btn:text-[#D97757]">
                          {member.userName}
                        </span>
                        {member.teamName && (
                          <span className="text-[12px] text-zinc-500">
                            {member.teamName}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      {todayRecord ? (
                        <StatusBadge status={todayRecord.status} />
                      ) : (
                        <span className="text-[12px] text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {member.consecutiveMissing > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#C9604D]/10 px-2 py-0.5 text-[12px] font-normal text-[#C9604D]">
                          <span className="size-1 rounded-full bg-[#C9604D]" />
                          {member.consecutiveMissing} 天
                        </span>
                      ) : (
                        <span className="text-[12px] text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-[12px] tabular-nums text-zinc-700">
                        {lastPublished ? lastPublished.slice(5) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`text-[12px] tabular-nums font-medium ${
                          member.fulfillmentRate >= 80
                            ? "text-[#6FAA7D]"
                            : member.fulfillmentRate >= 60
                              ? "text-[#D99E55]"
                              : "text-[#C9604D]"
                        }`}
                      >
                        {member.fulfillmentRate}%
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2.5 text-[12px] text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 font-medium rounded-lg"
                          disabled={isMarking}
                          onClick={() => requestQuickMark(member.userId, member.userName, "confirmed_published")}
                        >
                          {isMarking && markingId === member.userId ? (
                            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />
                          ) : null}
                          确认已发
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 rounded-lg">
                                异常打标 <ChevronDown className="ml-1 size-3 text-zinc-400" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-32 bg-white">
                            <DropdownMenuItem
                              onClick={() => requestQuickMark(member.userId, member.userName, "leave")}
                              className="text-zinc-700 cursor-pointer hover:bg-zinc-50"
                            >
                              请假
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => requestQuickMark(member.userId, member.userName, "waived")}
                              className="text-zinc-700 cursor-pointer hover:bg-zinc-50"
                            >
                              豁免
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => requestQuickMark(member.userId, member.userName, "absent")}
                              variant="destructive"
                              className="cursor-pointer hover:bg-zinc-100 hover:text-zinc-950"
                            >
                              确认缺勤
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(hasMore || isExpanded) && (
          <div className="flex items-center justify-between border-t border-zinc-200/60 bg-zinc-50/50 px-4 py-2 text-[12px] text-zinc-500 select-none">
            <span>
              已显示 {visibleMembers.length} / {members.length} 项待处理异常
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 font-medium text-[#D97757] transition-colors hover:text-[#C46A4D]"
            >
              {isExpanded ? (
                <>
                  收起至前 10 项 <ChevronUp className="size-3.5" />
                </>
              ) : (
                <>
                  展开全部 {members.length} 项异常 <ChevronDown className="size-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 批量操作浮条 */}
      {hasSelected && (
        <div className="sticky bottom-4 z-30 flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-3 shadow-md">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-medium text-zinc-700">
              已选 <span className="font-medium tabular-nums text-[#D97757]">{selectedIds.size}</span> 人
            </span>
            <button
              type="button"
              onClick={() => onSelectAll(false)}
              className="text-[12px] text-zinc-500 transition-colors hover:text-zinc-700"
            >
              清除
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
              onClick={() => openBatchConfirm("confirmed_published")}
            >
              批量确认已发
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
              onClick={() => openBatchConfirm("leave")}
            >
              批量请假
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
              onClick={() => openBatchConfirm("waived")}
            >
              批量豁免
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => openBatchConfirm("absent")}
            >
              批量确认缺勤
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(quickConfirm)}
        onOpenChange={(open) => {
          if (!open && !markingId) setQuickConfirm(null);
        }}
      >
        <DialogContent showCloseButton={!markingId} className="bg-white">
          <DialogHeader>
            <DialogTitle>确认标记缺勤</DialogTitle>
            <DialogDescription>
              将把 {quickConfirm?.userName ?? "该成员"} 标记为今日缺勤。此操作会影响履约统计，请确认后继续。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickConfirm(null)} disabled={Boolean(markingId)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleQuickConfirm()} disabled={Boolean(markingId)}>
              {markingId ? "处理中..." : "确认缺勤"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量确认弹窗 */}
      <Dialog open={batchConfirmOpen} onOpenChange={setBatchConfirmOpen}>
        <DialogContent showCloseButton={!batchSubmitting} className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>
              批量{batchAction ? ACTION_LABELS[batchAction] : ""}
            </DialogTitle>
            <DialogDescription>
              将对 {selectedIds.size} 位成员执行批量{batchAction ? ACTION_LABELS[batchAction] : ""}操作，确认后继续。
            </DialogDescription>
          </DialogHeader>

          {/* 受影响成员预览 */}
          <div className="space-y-1.5">
            <span className="text-[12px] font-normal text-zinc-500">受影响成员名单 ({selectedIds.size} 人)：</span>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/80 p-2 text-[12px]">
              {members
                .filter((m) => selectedIds.has(m.userId))
                .map((m) => (
                  <span
                    key={m.userId}
                    className="inline-flex items-center rounded-md border border-zinc-200/80 bg-white px-2 py-0.5 text-zinc-800 shadow-2xs"
                  >
                    <span className="font-medium">{m.userName}</span>
                    {m.teamName ? (
                      <span className="ml-1 text-[11px] text-zinc-500">({m.teamName})</span>
                    ) : null}
                  </span>
                ))}
            </div>
          </div>

          <div className="space-y-1.5 py-1">
            <label htmlFor="batch-reason" className="block text-[12px] font-normal text-zinc-500">
              统一原因说明（可选）
            </label>
            <input
              id="batch-reason"
              type="text"
              value={batchReason}
              onChange={(e) => setBatchReason(e.target.value)}
              placeholder="请输入批量操作原因..."
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700 outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-zinc-500 focus:border-zinc-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-zinc-900/5"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchConfirmOpen(false)} disabled={batchSubmitting}>
              取消
            </Button>
            <Button onClick={handleBatchConfirm} disabled={batchSubmitting}>
              {batchSubmitting ? "处理中..." : "确认执行"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
