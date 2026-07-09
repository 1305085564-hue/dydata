"use client";

import { useCallback, useState } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";

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
  onSelectAll: (selected: boolean) => void;
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

function StatusBadge({ status }: { status: FulfillmentStatus }) {
  const config: Record<string, { label: string; dot: string }> = {
    published: { label: "已发布", dot: "bg-[#6FAA7D]" },
    confirmed_published: { label: "已确认", dot: "bg-[#6FAA7D]" },
    leave: { label: "请假", dot: "bg-[#8AA8C7]" },
    waived: { label: "豁免", dot: "bg-[#8AA8C7]" },
    exempted: { label: "豁免期", dot: "bg-[#8AA8C7]/50" },
    absent: { label: "缺勤", dot: "bg-[#C9604D]" },
    unconfirmed: { label: "待确认", dot: "bg-stone-200" },
  };
  const c = config[status] ?? config.unconfirmed;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-stone-600">
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
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<MarkAction | null>(null);
  const [batchReason, setBatchReason] = useState("");
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const allSelected = members.length > 0 && members.every((m) => selectedIds.has(m.userId));
  const someSelected = selectedIds.size > 0;

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
      <div className="rounded-2xl border border-stone-200/50 bg-white py-12 shadow-sm">
        <EmptyState
          title="当前范围内无人待处理"
          description="所有成员的发布状态已确认完毕"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 text-[#D99E55]" />
        <h2 className="text-[14px] font-semibold text-stone-700">
          待处理异常
          <span className="ml-1.5 font-mono text-[12px] tabular-nums text-stone-400">
            {members.length}
          </span>
        </h2>
      </div>

      {/* 列表 */}
      <div className="rounded-2xl border border-stone-200/50 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-stone-200/50 bg-stone-50/50">
                <th className="w-10 px-3 py-2.5 text-left">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => onSelectAll(!allSelected)}
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.25em] text-stone-400">
                  成员
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.25em] text-stone-400">
                  今日状态
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.25em] text-stone-400">
                  连续未发
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.25em] text-stone-400">
                  上次发布
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.25em] text-stone-400">
                  发布率
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-[0.25em] text-stone-400 min-w-[200px]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const todayRecord = member.days[today];
                const lastPublished = getLastPublishedDate(member);
                const isSelected = selectedIds.has(member.userId);
                const isMarking = markingId === member.userId;

                return (
                  <tr
                    key={member.userId}
                    className="group border-b border-stone-100 last:border-b-0 transition-colors duration-150 bg-white hover:bg-stone-100"
                  >
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onSelectToggle(member.userId)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onMemberClick(member)}
                        className="text-left group/btn"
                      >
                        <p className="font-medium text-stone-800 group-hover/btn:text-stone-950 transition-colors">
                          {member.userName}
                        </p>
                        <p className="text-[11px] text-stone-400">
                          {member.groupName ?? member.teamName ?? "—"}
                        </p>
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      {todayRecord ? (
                        <StatusBadge status={todayRecord.status} />
                      ) : (
                        <span className="text-[12px] text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {member.consecutiveMissing > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-[#C9604D]/15 bg-[#C9604D]/[0.04] px-2 py-0.5 text-[11px] font-medium text-[#C9604D]">
                          <span className="size-1 rounded-full bg-[#C9604D]" />
                          {member.consecutiveMissing} 天
                        </span>
                      ) : (
                        <span className="text-[12px] text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[12px] tabular-nums text-stone-600">
                        {lastPublished ? lastPublished.slice(5) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`font-mono text-[12px] tabular-nums font-medium ${
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
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-900 font-medium"
                          disabled={isMarking}
                          onClick={() => handleQuickMark(member.userId, "confirmed_published")}
                        >
                          {isMarking && markingId === member.userId ? (
                            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />
                          ) : null}
                          确认已发
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="outline" size="sm" className="h-8 text-stone-600 border-stone-200 hover:bg-stone-50 hover:text-stone-800">
                                异常打标 <ChevronDown className="size-3 ml-1 text-stone-400" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-32 bg-white">
                            <DropdownMenuItem
                              onClick={() => handleQuickMark(member.userId, "leave")}
                              className="text-stone-700 cursor-pointer hover:bg-stone-50"
                            >
                              请假
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleQuickMark(member.userId, "waived")}
                              className="text-stone-700 cursor-pointer hover:bg-stone-50"
                            >
                              豁免
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleQuickMark(member.userId, "absent")}
                              variant="destructive"
                              className="cursor-pointer hover:bg-red-50"
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
      </div>

      {/* 批量操作浮条 */}
      {someSelected && (
        <div className="sticky bottom-4 z-30 flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-3 shadow-md">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-medium text-stone-700">
              已选 <span className="font-mono tabular-nums text-[#D97757] font-semibold">{selectedIds.size}</span> 人
            </span>
            <button
              type="button"
              onClick={() => onSelectAll(false)}
              className="text-[12px] text-stone-400 hover:text-stone-600 transition-colors"
            >
              清除
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-900"
              onClick={() => openBatchConfirm("confirmed_published")}
            >
              批量确认已发
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-900"
              onClick={() => openBatchConfirm("leave")}
            >
              批量请假
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-stone-200 text-stone-700 hover:bg-stone-50 hover:text-stone-900"
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

      {/* 批量确认弹窗 */}
      <Dialog open={batchConfirmOpen} onOpenChange={setBatchConfirmOpen}>
        <DialogContent showCloseButton={!batchSubmitting} className="bg-white">
          <DialogHeader>
            <DialogTitle>
              批量{batchAction ? ACTION_LABELS[batchAction] : ""}
            </DialogTitle>
            <DialogDescription>
              将对 {selectedIds.size} 位成员执行批量{batchAction ? ACTION_LABELS[batchAction] : ""}操作，确认后继续。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block text-[12px] font-medium text-stone-500">
              统一原因（可选）
            </label>
            <input
              type="text"
              value={batchReason}
              onChange={(e) => setBatchReason(e.target.value)}
              placeholder="请输入批量操作原因..."
              className="w-full rounded-lg border border-transparent bg-stone-100/70 px-3 py-2 text-[13px] text-stone-800 outline-none transition-[background-color,border-color,box-shadow] duration-150 placeholder:text-stone-400 focus:border-stone-200 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-950/5"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchConfirmOpen(false)} disabled={batchSubmitting}>
              取消
            </Button>
            <Button onClick={handleBatchConfirm} disabled={batchSubmitting}>
              {batchSubmitting ? "处理中..." : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
