"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type {
  FulfillmentMemberSummary,
  FulfillmentStatus,
} from "@/types/fulfillment";
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
import { ZenFinishedIllustration } from "@/components/editorial/editorial-illustrations";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type MarkAction = Extract<
  FulfillmentStatus,
  "leave" | "waived" | "absent" | "confirmed_published"
>;

interface ExceptionQueueProps {
  members: FulfillmentMemberSummary[];
  today: string;
  selectedIds: Set<string>;
  onSelectToggle: (userId: string) => void;
  onSelectAll: (selected: boolean, visibleIds?: string[]) => void;
  onQuickMark: (userId: string, status: MarkAction) => Promise<void>;
  onBatchMark: (
    userIds: string[],
    status: MarkAction,
    reason: string,
  ) => Promise<void>;
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
    leave: { label: "请假", dot: "bg-[#43718E]" },
    waived: { label: "豁免", dot: "bg-[#43718E]" },
    exempted: { label: "豁免期", dot: "bg-[#43718E]/60" },
    absent: { label: "缺勤", dot: "bg-[#C9604D]" },
    unconfirmed: { label: "待确认", dot: "bg-[#E5E0D6]" },
  };
  const c = config[status] ?? config.unconfirmed;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-[#292524]">
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

  const allSelected =
    visibleMembers.length > 0 &&
    visibleMembers.every((m) => selectedIds.has(m.userId));
  const someSelected =
    visibleMembers.some((m) => selectedIds.has(m.userId)) && !allSelected;
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
    [onQuickMark],
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
      await onBatchMark(
        Array.from(selectedIds),
        batchAction,
        batchReason.trim(),
      );
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

  const getLastPublishedDate = useCallback(
    (member: FulfillmentMemberSummary) => {
      const dates = Object.keys(member.days)
        .filter((d) => {
          const s = member.days[d].status;
          return s === "published" || s === "confirmed_published";
        })
        .sort();
      return dates.pop();
    },
    [],
  );

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-[#ECE7DE] bg-gradient-to-br from-[#FAF8F4] via-white to-[#F5F3EE]/40 p-8 sm:p-12 text-center shadow-sm">
        <div className="flex justify-center -mt-2 -mb-1">
          <ZenFinishedIllustration size={80} />
        </div>
        <h3 className="font-serif text-[15px] font-medium text-[#1C1917] tracking-tight">
          团队创作节奏平稳 · 今日已悉数收卷
        </h3>
        <p className="mt-1.5 text-[12.5px] text-[#78716C] max-w-sm mx-auto leading-relaxed">
          当前范围内伙伴的发布状态均已确认或登记，没有待处理的异常。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 批量操作工具栏（浮动胶囊） */}
      {hasSelected && (
        <div className="flex items-center justify-between rounded-xl bg-[#1C1917] px-4 py-2.5 text-white shadow-claude-float animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 text-[12px] font-medium">
            <span className="flex size-5 items-center justify-center rounded-full bg-[#D97757] text-[11px] font-semibold text-white">
              {selectedIds.size}
            </span>
            <span>已选择 {selectedIds.size} 位成员</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              className="text-[#E5E0D6] hover:text-white hover:bg-[#292524] text-[12px]"
              onClick={() => openBatchConfirm("confirmed_published")}
            >
              批量确认已发
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-[#E5E0D6] hover:text-white hover:bg-[#292524] text-[12px]"
              onClick={() => openBatchConfirm("leave")}
            >
              批量请假
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-[#E5E0D6] hover:text-white hover:bg-[#292524] text-[12px]"
              onClick={() => openBatchConfirm("waived")}
            >
              批量豁免
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-[#C9604D] hover:bg-[#C9604D]/20 text-[12px]"
              onClick={() => openBatchConfirm("absent")}
            >
              批量缺勤
            </Button>
            <button
              type="button"
              onClick={() => onSelectAll(false)}
              className="ml-2 text-[11px] text-[#78716C] hover:text-[#ECE7DE] cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 列表主体：纯白出版物级纸张表格 */}
      <div className="overflow-hidden rounded-xl border border-[#E5E0D6] bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E5E0D6] bg-[#F5F3EE]">
                <th className="w-10 px-3 py-2 text-left">
                  <Checkbox
                    aria-label="全选当前可见成员"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleSelectVisible}
                  />
                </th>
                <th className="px-3 py-2 text-left text-[12px] font-medium tracking-wider text-[#78716C]">
                  成员
                </th>
                <th className="px-3 py-2 text-left text-[12px] font-medium tracking-wider text-[#78716C]">
                  今日状态
                </th>
                <th className="px-3 py-2 text-right text-[12px] font-medium tracking-wider text-[#78716C]">
                  连续未发
                </th>
                <th className="px-3 py-2 text-center text-[12px] font-medium tracking-wider text-[#78716C]">
                  上次发布
                </th>
                <th className="px-3 py-2 text-right text-[12px] font-medium tracking-wider text-[#78716C]">
                  发布率
                </th>
                <th className="min-w-[200px] px-3 py-2 text-right text-[12px] font-medium tracking-wider text-[#78716C]">
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
                    className="group border-b border-[#ECE7DE] last:border-b-0 transition-colors duration-100 bg-white hover:bg-[#FAF8F4]"
                  >
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={isSelected}
                        aria-label={`选择 ${member.userName}`}
                        onCheckedChange={() => onSelectToggle(member.userId)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onMemberClick(member)}
                        className="inline-flex items-center gap-2 text-left group/btn cursor-pointer"
                      >
                        <span className="font-medium text-[#1C1917] transition-colors group-hover/btn:text-[#D97757]">
                          {member.userName}
                        </span>
                        {member.teamName && (
                          <span className="text-[11px] text-[#78716C] font-normal">
                            {member.teamName}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      {todayRecord ? (
                        <StatusBadge status={todayRecord.status} />
                      ) : (
                        <span className="text-[12px] text-[#78716C]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {member.consecutiveMissing > 0 ? (
                        <span className="font-medium tabular-nums text-[#D97757]">
                          {member.consecutiveMissing} 天
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#78716C] tabular-nums">
                          0 天
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-[12px] tabular-nums text-[#78716C]">
                      {lastPublished ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-[12px] font-medium tabular-nums text-[#292524]">
                      {member.fulfillmentRate}%
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-auto sm:pointer-events-none sm:group-hover:pointer-events-auto sm:focus-within:pointer-events-auto">
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={isMarking}
                          className="h-7 px-2 text-[12px] font-medium text-[#D97757] hover:bg-[#D97757]/10"
                          onClick={() =>
                            requestQuickMark(
                              member.userId,
                              member.userName,
                              "confirmed_published",
                            )
                          }
                        >
                          确认已发
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={isMarking}
                          className="h-7 px-2 text-[12px] text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
                          onClick={() =>
                            requestQuickMark(
                              member.userId,
                              member.userName,
                              "leave",
                            )
                          }
                        >
                          请假
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={isMarking}
                          className="h-7 px-2 text-[12px] text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
                          onClick={() =>
                            requestQuickMark(
                              member.userId,
                              member.userName,
                              "waived",
                            )
                          }
                        >
                          豁免
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="flex size-7 items-center justify-center rounded-lg text-[#78716C] hover:text-[#292524] hover:bg-[#F5F3EE] transition-colors cursor-pointer"
                            title="更多操作"
                          >
                            ···
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="rounded-xl border border-[#E5E0D6]/80 bg-white/95 backdrop-blur-md shadow-claude-float"
                          >
                            <DropdownMenuItem
                              className="text-[12px] text-[#C9604D] focus:text-[#C9604D] focus:bg-[#C9604D]/10"
                              onClick={() =>
                                requestQuickMark(
                                  member.userId,
                                  member.userName,
                                  "absent",
                                )
                              }
                            >
                              标记缺勤
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

        {/* 展开/折叠更多 */}
        {hasMore && (
          <div className="border-t border-[#ECE7DE] bg-[#FAF8F4]/60 py-2.5 text-center">
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
            >
              {isExpanded ? (
                <>
                  收起部分成员 <ChevronUp className="size-3.5" />
                </>
              ) : (
                <>
                  查看全部 {members.length} 位成员 (还有 {members.length - 10}{" "}
                  人) <ChevronDown className="size-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 快捷缺勤确认弹窗 */}
      <Dialog
        open={quickConfirm !== null}
        onOpenChange={(open) => !open && setQuickConfirm(null)}
      >
        <DialogContent className="max-w-sm rounded-2xl bg-white p-6 shadow-claude-dialog border-[#E5E0D6]">
          <DialogHeader>
            <DialogTitle className="text-base font-medium text-[#1C1917]">
              确认标记 {quickConfirm?.userName} 缺勤
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[#292524] mt-2">
              标记缺勤将记录为今日未履约，此操作可在抽屉中随时撤销或重新改判。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-[#292524]"
              onClick={() => setQuickConfirm(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-lg bg-[#C9604D] hover:bg-[#B5503E]"
              onClick={handleQuickConfirm}
            >
              确认缺勤
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量标记确认弹窗 */}
      <Dialog
        open={batchConfirmOpen}
        onOpenChange={(open) => !open && setBatchConfirmOpen(false)}
      >
        <DialogContent className="max-w-md rounded-2xl bg-white p-6 shadow-claude-dialog border-[#E5E0D6]">
          <DialogHeader>
            <DialogTitle className="text-base font-medium text-[#1C1917]">
              标记选中项为{batchAction ? ACTION_LABELS[batchAction] : ""}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[#292524] mt-2">
              已选 {selectedIds.size} 位成员，操作将作用于今日（{today}）。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <label className="text-[12px] font-medium text-[#292524]">
              备注原因 (选填)
            </label>
            <input
              type="text"
              value={batchReason}
              onChange={(e) => setBatchReason(e.target.value)}
              placeholder="输入操作原因..."
              className="w-full rounded-lg border border-[#E5E0D6] bg-white shadow-2xs px-3 py-2 text-[13px] text-[#292524] placeholder:text-[#78716C]/60 outline-none hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
            />
          </div>
          <DialogFooter className="mt-6 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-[#292524]"
              onClick={() => setBatchConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              variant={batchAction === "absent" ? "destructive" : "default"}
              size="sm"
              disabled={batchSubmitting}
              className={
                batchAction === "absent"
                  ? "rounded-lg bg-[#C9604D] hover:bg-[#B5503E]"
                  : "rounded-lg bg-[#D97757] hover:bg-[#C46A4D] text-white"
              }
              onClick={handleBatchConfirm}
            >
              {batchSubmitting ? "正在提交..." : "确认批量标记"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
