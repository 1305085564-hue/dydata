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
import {
  isFulfilledFulfillmentStatus,
  type ManualFulfillmentMarkStatus,
} from "@/lib/fulfillment-status";

type MarkAction = ManualFulfillmentMarkStatus;

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
  absent: "今日未发",
  confirmed_published: "已发",
};

export function requiresQuickMarkConfirmation(action: MarkAction) {
  return action === "absent";
}

function StatusBadge({ status }: { status: FulfillmentStatus }) {
  const config: Record<string, { label: string; dot: string; textClass: string }> = {
    published: { label: "已发布", dot: "bg-[#6FAA7D]", textClass: "text-[#292524]" },
    confirmed_published: { label: "已标定", dot: "bg-[#6FAA7D]", textClass: "text-[#292524]" },
    leave: { label: "请假", dot: "bg-[#43718E]", textClass: "text-[#292524]" },
    waived: { label: "豁免", dot: "bg-[#43718E]", textClass: "text-[#292524]" },
    exempted: { label: "豁免期", dot: "bg-[#43718E]/60", textClass: "text-[#78716C]" },
    absent: { label: "今日未发", dot: "bg-[#C0685C]", textClass: "text-[#C0685C]" },
    unconfirmed: { label: "待确认", dot: "bg-[#B98A54]", textClass: "text-[#B98A54]" },
  };
  const c = config[status] ?? config.unconfirmed;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-normal ${c.textClass}`}>
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
          return isFulfilledFulfillmentStatus(s);
        })
        .sort();
      return dates.pop();
    },
    [],
  );

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-[#ECE7DE] bg-gradient-to-br from-[#FAF8F4] via-white to-[#F5F3EE]/40 p-8 sm:p-12 text-center shadow-2xs">
        <div className="flex justify-center -mt-2 -mb-1">
          <ZenFinishedIllustration size={80} />
        </div>
        <h3 className="text-base font-medium text-[#1C1917] tracking-tight">
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
      {/* 批量操作工具栏（深炭浮动胶囊） */}
      {hasSelected && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#181715] px-3.5 sm:px-4 py-2.5 text-[#FAF8F4] shadow-claude-float animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-2 text-[12px] font-medium">
            <span className="flex size-5 items-center justify-center rounded-full bg-[#D97757] text-[11px] font-semibold text-white">
              {selectedIds.size}
            </span>
            <span>已选择 {selectedIds.size} 位成员</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              className="text-[#ECE7DE] hover:text-white hover:bg-[#292524] text-[12px] h-7 px-2.5 rounded-lg active:scale-[0.99] active:duration-120"
              onClick={() => openBatchConfirm("confirmed_published")}
            >
              批量标为已发
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-[#ECE7DE] hover:text-white hover:bg-[#292524] text-[12px] h-7 px-2.5 rounded-lg active:scale-[0.99] active:duration-120"
              onClick={() => openBatchConfirm("leave")}
            >
              批量请假
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-[#ECE7DE] hover:text-white hover:bg-[#292524] text-[12px] h-7 px-2.5 rounded-lg active:scale-[0.99] active:duration-120"
              onClick={() => openBatchConfirm("waived")}
            >
              批量豁免
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-[#C0685C] hover:bg-[#C0685C]/20 text-[12px] h-7 px-2.5 rounded-lg active:scale-[0.99] active:duration-120"
              onClick={() => openBatchConfirm("absent")}
            >
              批量标为未发
            </Button>
            <button
              type="button"
              onClick={() => onSelectAll(false)}
              className="ml-2 text-[11px] text-[#A8A29E] hover:text-[#ECE7DE] cursor-pointer transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 列表主体：发丝级出版物表格 */}
      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#ECE7DE]/80 bg-transparent">
                <th className="w-10 px-3 py-2.5 text-left">
                  <Checkbox
                    aria-label="全选当前可见成员"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleSelectVisible}
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                  成员
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                  今日状态
                </th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                  连续未发
                </th>
                <th className="px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                  上次发布
                </th>
                <th className="px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                  发布率
                </th>
                <th className="min-w-[190px] px-3 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
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
                    className="group border-b border-[#ECE7DE]/60 last:border-b-0 transition-colors duration-100 bg-transparent hover:bg-[#F5F3EE]/40"
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
                        <span className="text-[12px] text-[#78716C]">一</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
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
                    <td className="px-3 py-2.5 text-center text-[12px] tabular-nums text-[#78716C]">
                      {lastPublished ?? "一"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-medium tabular-nums text-[#292524]">
                      {member.fulfillmentRate}%
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity duration-150 pointer-events-auto lg:pointer-events-none lg:group-hover:pointer-events-auto lg:focus-within:pointer-events-auto">
                        <Button
                          variant="ghost"
                          size="s"
                          disabled={isMarking}
                          className="px-2 text-[12px] font-medium text-[#D97757] hover:bg-[#D97757]/10"
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
                          size="s"
                          disabled={isMarking}
                          className="px-2 text-[12px] text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
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
                          size="s"
                          disabled={isMarking}
                          className="px-2 text-[12px] text-[#292524] hover:text-[#1C1917] hover:bg-[#F5F3EE]"
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
                            className="flex size-6 items-center justify-center rounded-md text-[#78716C] hover:text-[#292524] hover:bg-[#F5F3EE] transition-colors cursor-pointer"
                            title="更多操作"
                          >
                            ···
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="rounded-xl bg-white/95 backdrop-blur-md shadow-claude-float"
                          >
                            <DropdownMenuItem
                              className="text-[12px] text-[#C0685C] focus:text-[#C0685C] focus:bg-[#C0685C]/10"
                              onClick={() =>
                                requestQuickMark(
                                  member.userId,
                                  member.userName,
                                  "absent",
                                )
                              }
                            >
                              标为今日未发
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
          <div className="border-t border-[#ECE7DE]/60 py-3 text-center">
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#78716C] hover:text-[#1C1917] transition-colors cursor-pointer"
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
        <DialogContent className="max-w-sm rounded-2xl border border-[#E5E0D6] bg-white p-6 shadow-claude-dialog">
          <DialogHeader>
            <DialogTitle className="text-base font-medium text-[#1C1917]">
              确认将 {quickConfirm?.userName} 标为今日未发？
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[#292524] mt-2">
              将记为今日未发作品；后续若补发或有变动，可随时在此改判或撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="secondary"
              size="m"
              onClick={() => setQuickConfirm(null)}
            >
              暂不调整
            </Button>
            <Button
              variant="destructive"
              size="m"
              onClick={handleQuickConfirm}
            >
              确认标记
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量标记确认弹窗 */}
      <Dialog
        open={batchConfirmOpen}
        onOpenChange={(open) => !open && setBatchConfirmOpen(false)}
      >
        <DialogContent className="max-w-md rounded-2xl border border-[#E5E0D6] bg-white p-6 shadow-claude-dialog">
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
              className="w-full rounded-lg border border-[#E5E0D6] bg-[#FAF8F4]/50 shadow-2xs px-3 py-2 text-[13px] text-[#292524] placeholder:text-[#78716C]/60 outline-none hover:border-[#78716C]/40 focus-visible:border-[#78716C] focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0"
            />
          </div>
          <DialogFooter className="mt-6 gap-2">
            <Button
              variant="secondary"
              size="m"
              onClick={() => setBatchConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              variant={batchAction === "absent" ? "destructive" : "default"}
              size="m"
              disabled={batchSubmitting}
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
