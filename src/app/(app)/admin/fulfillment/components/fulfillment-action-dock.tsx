"use client";

import { useMemo, useState, useEffect } from "react";
import { ChevronDown, ChevronUp, AlertCircle } from "lucide-react";

import type {
  FulfillmentAppeal,
  FulfillmentMemberSummary,
  FulfillmentStatus,
} from "@/types/fulfillment";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ManualFulfillmentMarkStatus } from "@/lib/fulfillment-status";

export type MarkAction = ManualFulfillmentMarkStatus;

export interface FulfillmentActionDockProps {
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
  appeals?: FulfillmentAppeal[];
  onHandleAppeal?: (appealId: string, decision: "approve" | "reject") => Promise<void>;
  isFiltered?: boolean;
  onClearFilter?: () => void;
}

const ACTION_LABELS: Record<MarkAction, string> = {
  leave: "请假",
  waived: "豁免",
  absent: "未发",
  confirmed_published: "已发",
};

export function requiresQuickMarkConfirmation(action: MarkAction) {
  return action === "absent";
}

function StatusBadge({ status }: { status: FulfillmentStatus }) {
  const config: Record<string, { label: string; variant: "success" | "accent" | "danger" | "warning" | "neutral" }> = {
    published: { label: "已发布", variant: "success" },
    confirmed_published: { label: "已标定", variant: "success" },
    leave: { label: "请假", variant: "accent" },
    waived: { label: "豁免", variant: "accent" },
    exempted: { label: "豁免期", variant: "neutral" },
    absent: { label: "未发", variant: "danger" },
    unconfirmed: { label: "待确认", variant: "warning" },
  };
  const c = config[status] ?? config.unconfirmed;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

export function FulfillmentActionDock({
  members,
  today,
  selectedIds,
  onSelectToggle,
  onSelectAll,
  onQuickMark,
  onBatchMark,
  onMemberClick,
  appeals = [],
  onHandleAppeal,
  isFiltered = false,
  onClearFilter,
  defaultExpanded = false,
}: FulfillmentActionDockProps & { defaultExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [handlingAppealId, setHandlingAppealId] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<MarkAction | null>(null);
  const [batchReason, setBatchReason] = useState("");
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  const pendingAppeals = useMemo(
    () => appeals.filter((a) => a.status === "pending"),
    [appeals],
  );

  const totalActionCount = members.length + pendingAppeals.length;

  const handleSelectAllCurrent = (checked: boolean) => {
    onSelectAll(checked, members.map((m) => m.userId));
  };

  const handleConfirmBatch = async () => {
    if (!batchAction || selectedIds.size === 0) return;
    setIsSubmittingBatch(true);
    try {
      await onBatchMark(Array.from(selectedIds), batchAction, batchReason);
      setBatchAction(null);
      setBatchReason("");
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  // 如果没有任何异常且没有申诉，返回极简安心提示条
  if (totalActionCount === 0 && !isFiltered) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-status-success/20 bg-status-success/[0.04] px-4 py-2.5 text-[12px] text-status-success transition-all duration-150">
        <span className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-status-success" />
          全队今日发布与待审状态良好，无待处理异常或待审申诉
        </span>
        <span className="text-[12px] text-[#78716C]">已全部归档</span>
      </div>
    );
  }

  return (
    <Card
      aria-label="异常与申诉行动港"
      className="overflow-hidden border border-[#E2E2DF]/60 bg-white shadow-card-ring transition-all duration-150"
    >
      {/* 顶部行动条主幅 */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:px-4 sm:py-3 bg-[#FAF9F7]/60 border-b border-[#E2E2DF]/50">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#D97757]/15 text-[#D97757]">
            <AlertCircle className="size-3.5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-[#141413]">
                待处理事项
              </span>
              <span className="inline-flex items-center rounded-full bg-[#D97757]/15 px-2 py-0.5 text-[12px] font-medium text-[#D97757] tabular-nums">
                {totalActionCount} 项
              </span>
            </div>
            <p className="text-[12px] text-[#78716C] mt-0.5">
              今日 {members.length} 人待确认或断更 · {pendingAppeals.length} 条申诉待审
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isFiltered && onClearFilter && (
            <button
              type="button"
              onClick={onClearFilter}
              className="text-[12px] text-[#D97757] hover:underline"
            >
              清除指标筛选 ×
            </button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="h-8 gap-1 px-3 text-[12px] text-[#141413] hover:bg-[#F1F1F0]"
          >
            <span>{isExpanded ? "收起待办列表" : "展开快捷处理"}</span>
            {isExpanded ? (
              <ChevronUp className="size-3.5 text-[#78716C]" />
            ) : (
              <ChevronDown className="size-3.5 text-[#78716C]" />
            )}
          </Button>
        </div>
      </div>

      {/* 展开后的行动清单（包含批量操作栏与精简表格） */}
      {isExpanded && (
        <div className="p-3.5 sm:p-4 space-y-3">
          {/* 批量操作工具条 */}
          {members.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[#F7F7F6] p-2 text-[12px]">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={
                    members.length > 0 &&
                    members.every((m) => selectedIds.has(m.userId))
                  }
                  onCheckedChange={handleSelectAllCurrent}
                  aria-label="全选当前列表"
                />
                <span className="text-[#78716C]">
                  已选 <span className="font-medium text-[#141413]">{selectedIds.size}</span> 人
                </span>
              </div>

              {selectedIds.size > 0 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setBatchAction("confirmed_published")}
                    className="h-7 text-[12px] text-status-success hover:bg-status-success/10 font-normal"
                  >
                    批量标为已发
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setBatchAction("leave")}
                    className="h-7 text-[12px] text-status-info hover:bg-status-info/10 font-normal"
                  >
                    批量标为请假
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setBatchAction("waived")}
                    className="h-7 text-[12px] text-status-info hover:bg-status-info/10 font-normal"
                  >
                    批量标为豁免
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 待处理人员列表 */}
          {members.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-[#78716C]">
              {isFiltered ? "当前指标筛选下无异常成员" : "今日无待处理异常成员"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#E2E2DF]/60 text-[#78716C]">
                    <th className="w-8 py-2 px-2"></th>
                    <th className="py-2 px-3 font-normal">成员</th>
                    <th className="py-2 px-3 font-normal">今日状态</th>
                    <th className="py-2 px-3 font-normal">连续未发</th>
                    <th className="py-2 px-3 text-right font-normal">快速操作</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const todayRecord = member.days[today];
                    const isSelected = selectedIds.has(member.userId);
                    const isBusy = markingId === member.userId;

                    return (
                      <tr
                        key={member.userId}
                        className="border-b border-[#E2E2DF]/40 last:border-b-0 hover:bg-[#FAF9F7]"
                      >
                        <td className="py-2.5 px-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onSelectToggle(member.userId)}
                            aria-label={`选择 ${member.userName}`}
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => onMemberClick(member)}
                            className="font-normal text-[#141413] hover:text-[#D97757] hover:underline"
                          >
                            {member.userName}
                          </button>
                          {member.teamName && (
                            <span className="ml-1 text-[12px] text-[#A8A29E]">
                              · {member.teamName}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {todayRecord ? (
                            <StatusBadge status={todayRecord.status} />
                          ) : (
                            <Badge variant="neutral">无记录</Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums">
                          {member.consecutiveMissing > 0 ? (
                            <span className="text-status-danger font-medium">
                              {member.consecutiveMissing} 天
                            </span>
                          ) : (
                            <span className="text-[#A8A29E]">0 天</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={isBusy}
                              onClick={async () => {
                                setMarkingId(member.userId);
                                try {
                                  await onQuickMark(member.userId, "confirmed_published");
                                } finally {
                                  setMarkingId(null);
                                }
                              }}
                              className="h-6 px-2 text-[12px] text-status-success hover:bg-status-success/10 font-normal"
                            >
                              标为已发
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={isBusy}
                              onClick={async () => {
                                setMarkingId(member.userId);
                                try {
                                  await onQuickMark(member.userId, "leave");
                                } finally {
                                  setMarkingId(null);
                                }
                              }}
                              className="h-6 px-2 text-[12px] text-status-info hover:bg-status-info/10 font-normal"
                            >
                              标为请假
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={isBusy}
                              onClick={async () => {
                                setMarkingId(member.userId);
                                try {
                                  await onQuickMark(member.userId, "waived");
                                } finally {
                                  setMarkingId(null);
                                }
                              }}
                              className="h-6 px-2 text-[12px] text-status-info hover:bg-status-info/10 font-normal"
                            >
                              标为豁免
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 待审申诉展示 */}
          {pendingAppeals.length > 0 && (
            <div className="pt-2 border-t border-[#E2E2DF]/60 space-y-2">
              <span className="text-[12px] font-medium text-[#141413]">
                待审申诉列表（{pendingAppeals.length} 条）
              </span>
              <div className="divide-y divide-[#E2E2DF]/50 rounded-xl border border-[#E2E2DF]/60 bg-white">
                {pendingAppeals.map((appeal) => (
                  <div
                    key={appeal.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 text-[12px]"
                  >
                    <div>
                      <span className="font-medium text-[#141413]">
                        {appeal.user_name || "未知成员"}
                      </span>
                      <span className="ml-2 text-[#78716C] tabular-nums">
                        申诉日期: {appeal.record_date}
                      </span>
                      <p className="text-[12px] text-[#1F1E1D] mt-0.5">
                        理由: {appeal.reason}
                      </p>
                    </div>

                    {onHandleAppeal && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={handlingAppealId === appeal.id}
                          onClick={async () => {
                            setHandlingAppealId(appeal.id);
                            try {
                              await onHandleAppeal(appeal.id, "approve");
                            } finally {
                              setHandlingAppealId(null);
                            }
                          }}
                          className="h-6 px-2 text-[12px] text-status-success hover:bg-status-success/10 font-normal"
                        >
                          同意补交
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={handlingAppealId === appeal.id}
                          onClick={async () => {
                            setHandlingAppealId(appeal.id);
                            try {
                              await onHandleAppeal(appeal.id, "reject");
                            } finally {
                              setHandlingAppealId(null);
                            }
                          }}
                          className="h-6 px-2 text-[12px] text-status-danger hover:bg-status-danger/10 font-normal"
                        >
                          驳回
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 批量标记确认弹窗 */}
      {batchAction && (
        <Dialog open={true} onOpenChange={(open) => !open && setBatchAction(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[18px] font-medium text-[#141413]">
                批量标记为「{ACTION_LABELS[batchAction]}」
              </DialogTitle>
              <DialogDescription className="text-[13px] text-[#78716C]">
                您正在将已选的 {selectedIds.size} 位成员今日记录标记为「
                {ACTION_LABELS[batchAction]}」。
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <label className="text-[12px] text-[#78716C] block mb-1">
                备注原因（选填）：
              </label>
              <input
                type="text"
                value={batchReason}
                onChange={(e) => setBatchReason(e.target.value)}
                placeholder="例如：团队团建休假 / 线上例会豁免"
                className="w-full rounded-md border border-[#E2E2DF] px-3 py-1.5 text-[13px] outline-none focus:border-[#141413]"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBatchAction(null)}
                disabled={isSubmittingBatch}
              >
                取消
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleConfirmBatch}
                disabled={isSubmittingBatch}
              >
                {isSubmittingBatch ? "正在提交..." : "确认并执行"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
