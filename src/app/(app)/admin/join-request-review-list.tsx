"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { useUndoAction } from "@/hooks/use-undo-action";
import type { AdminRequestRow } from "@/lib/team-join/service";

import {
  approveJoinRequestAction,
  rejectJoinRequestAction,
} from "./join-request-actions";

type Props = {
  rows: AdminRequestRow[];
};

// TODO-SPRINT4-任务2：单条同意/驳回撤销操作
type ApprovePayload = { row: AdminRequestRow };
type RejectPayload = { row: AdminRequestRow; note: string | null };

export function JoinRequestReviewList({ rows }: Props) {
  const [visibleRows, setVisibleRows] = useState(rows);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [batchRejectOpen, setBatchRejectOpen] = useState(false);
  const [batchRejectNote, setBatchRejectNote] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  // ---- useUndoAction: 同意 ----
  const handleApproveExecute = useCallback(async (payload: ApprovePayload) => {
    const result = await approveJoinRequestAction(payload.row.id, null);
    if (!result.ok) {
      feedbackToast.error(result.error);
    }
  }, []);

  const handleApproveUndo = useCallback(async (payload: ApprovePayload) => {
    setVisibleRows((currentRows) => {
      if (currentRows.some((r) => r.id === payload.row.id)) return currentRows;
      return [...currentRows, payload.row].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(payload.row.id);
      return next;
    });
  }, []);

  const {
    execute: executeApprove,
    undoItem: undoApproveItem,
    undoCountdown: undoApproveCountdown,
    performUndo: performApproveUndo,
  } = useUndoAction<ApprovePayload>({
    onExecute: handleApproveExecute,
    onUndo: handleApproveUndo,
    undoDuration: 5000,
  });

  // ---- useUndoAction: 驳回 ----
  const handleRejectExecute = useCallback(async (payload: RejectPayload) => {
    const result = await rejectJoinRequestAction(payload.row.id, payload.note);
    if (!result.ok) {
      feedbackToast.error(result.error);
    }
  }, []);

  const handleRejectUndo = useCallback(async (payload: RejectPayload) => {
    setVisibleRows((currentRows) => {
      if (currentRows.some((r) => r.id === payload.row.id)) return currentRows;
      return [...currentRows, payload.row].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(payload.row.id);
      return next;
    });
    setRejectingId(payload.row.id);
    setNote(payload.note ?? "");
  }, []);

  const {
    execute: executeReject,
    undoItem: undoRejectItem,
    undoCountdown: undoRejectCountdown,
    performUndo: performRejectUndo,
  } = useUndoAction<RejectPayload>({
    onExecute: handleRejectExecute,
    onUndo: handleRejectUndo,
    undoDuration: 5000,
  });

  // 用 ref 同步跟踪 undoItem，避免闭包问题
  const undoApproveRef = useRef<ApprovePayload | null>(null);
  const undoRejectRef = useRef<RejectPayload | null>(null);

  useEffect(() => {
    undoApproveRef.current = undoApproveItem;
  }, [undoApproveItem]);

  useEffect(() => {
    undoRejectRef.current = undoRejectItem;
  }, [undoRejectItem]);

  // 刷新页面时未提交的撤销操作丢失（可接受）

  const allSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.has(row.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleRows.map((row) => row.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 立即提交所有 pending 的撤销操作
  const flushPendingUndo = useCallback(() => {
    const pendingApprove = undoApproveRef.current;
    const pendingReject = undoRejectRef.current;

    if (pendingApprove) {
      startTransition(async () => {
        const result = await approveJoinRequestAction(pendingApprove.row.id, null);
        if (!result.ok) feedbackToast.error(result.error);
      });
      performApproveUndo();
    }
    if (pendingReject) {
      startTransition(async () => {
        const result = await rejectJoinRequestAction(pendingReject.row.id, pendingReject.note);
        if (!result.ok) feedbackToast.error(result.error);
      });
      performRejectUndo();
    }
  }, [performApproveUndo, performRejectUndo]);

  const handleApprove = (id: string) => {
    if (isPending) return;
    const approvedRow = visibleRows.find((row) => row.id === id);
    if (!approvedRow) return;

    // 如果有正在倒计时的操作，先立即提交
    flushPendingUndo();

    setVisibleRows((currentRows) => currentRows.filter((row) => row.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    executeApprove({ row: approvedRow });
  };

  const handleRejectConfirm = (id: string) => {
    if (isPending) return;
    const rejectedRow = visibleRows.find((row) => row.id === id);
    if (!rejectedRow) return;
    const rejectedNote = note.trim() || null;

    // 如果有正在倒计时的操作，先立即提交
    flushPendingUndo();

    setVisibleRows((currentRows) => currentRows.filter((row) => row.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setRejectingId(null);
    setNote("");
    executeReject({ row: rejectedRow, note: rejectedNote });
  };

  // ---- 批量操作（保持现有立即提交逻辑，不做撤销）----
  const handleBatchApprove = () => {
    if (isPending || selectedIds.size === 0) return;

    const idsToApprove = Array.from(selectedIds);
    const rowsToApprove = visibleRows.filter((row) => selectedIds.has(row.id));

    setVisibleRows((current) => current.filter((row) => !selectedIds.has(row.id)));
    setSelectedIds(new Set());
    feedbackToast.success(`已批量同意 ${idsToApprove.length} 条申请`);

    startTransition(async () => {
      const results = await Promise.allSettled(
        idsToApprove.map((id) => approveJoinRequestAction(id, null))
      );

      const failedIds: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "rejected" || !result.value.ok) {
          failedIds.push(idsToApprove[index]);
        }
      });

      if (failedIds.length > 0) {
        const failedRows = rowsToApprove.filter((row) => failedIds.includes(row.id));
        setVisibleRows((current) => {
          const existingIds = new Set(current.map((r) => r.id));
          const toRestore = failedRows.filter((r) => !existingIds.has(r.id));
          if (toRestore.length === 0) return current;
          return [...current, ...toRestore].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });
        feedbackToast.error(`成功 ${idsToApprove.length - failedIds.length} 条，失败 ${failedIds.length} 条`);
      }
    });
  };

  const handleBatchReject = () => {
    if (isPending || selectedIds.size === 0) return;

    const idsToReject = Array.from(selectedIds);
    const rowsToReject = visibleRows.filter((row) => selectedIds.has(row.id));
    const rejectedNote = batchRejectNote.trim() || null;

    setVisibleRows((current) => current.filter((row) => !selectedIds.has(row.id)));
    setSelectedIds(new Set());
    setBatchRejectOpen(false);
    setBatchRejectNote("");
    feedbackToast.success(`已批量驳回 ${idsToReject.length} 条申请`);

    startTransition(async () => {
      const results = await Promise.allSettled(
        idsToReject.map((id) => rejectJoinRequestAction(id, rejectedNote))
      );

      const failedIds: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "rejected" || !result.value.ok) {
          failedIds.push(idsToReject[index]);
        }
      });

      if (failedIds.length > 0) {
        const failedRows = rowsToReject.filter((row) => failedIds.includes(row.id));
        setVisibleRows((current) => {
          const existingIds = new Set(current.map((r) => r.id));
          const toRestore = failedRows.filter((r) => !existingIds.has(r.id));
          if (toRestore.length === 0) return current;
          return [...current, ...toRestore].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });
        feedbackToast.error(`成功 ${idsToReject.length - failedIds.length} 条，失败 ${failedIds.length} 条`);
      }
    });
  };

  // ---- 空状态 ----
  const showEmpty = visibleRows.length === 0 && !undoApproveItem && !undoRejectItem;
  if (showEmpty) {
    return (
      <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-6 text-center text-[13px] text-stone-500">
        暂无待审申请
      </div>
    );
  }

  return (
    <>
      {/* 撤销提示条：同意 */}
      {undoApproveItem ? (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#D99E55]/30 bg-[#D99E55]/10 px-4 py-2.5">
          <span className="text-[13px] text-stone-700">
            已同意 <span className="font-medium">{undoApproveItem.row.applicantName || undoApproveItem.row.applicantEmail || "未命名"}</span> 的入队申请
          </span>
          <span className="ml-auto text-[13px] font-medium text-[#D97757]">
            {undoApproveCountdown}秒后可撤销
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={performApproveUndo}
            className="h-7 border-[#D97757] text-[#D97757] text-[12px] hover:bg-[#D97757]/5"
          >
            撤销
          </Button>
        </div>
      ) : null}

      {/* 撤销提示条：驳回 */}
      {undoRejectItem ? (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#D99E55]/30 bg-[#D99E55]/10 px-4 py-2.5">
          <span className="text-[13px] text-stone-700">
            已驳回 <span className="font-medium">{undoRejectItem.row.applicantName || undoRejectItem.row.applicantEmail || "未命名"}</span> 的入队申请
          </span>
          <span className="ml-auto text-[13px] font-medium text-[#D97757]">
            {undoRejectCountdown}秒后可撤销
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={performRejectUndo}
            className="h-7 border-[#D97757] text-[#D97757] text-[12px] hover:bg-[#D97757]/5"
          >
            撤销
          </Button>
        </div>
      ) : null}

      {/* 批量操作栏 */}
      {someSelected ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
          <span className="text-[13px] text-stone-700">
            已选择 <span className="font-medium text-stone-900">{selectedIds.size}</span> 条
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleBatchApprove}
              disabled={isPending}
              className="h-7 bg-[#D97757] text-white text-[12px] hover:bg-[#C96442]"
            >
              批量同意（{selectedIds.size}）
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBatchRejectOpen(true)}
              disabled={isPending}
              className="h-7 border-[#C9604D] text-[#C9604D] text-[12px] hover:bg-[#C9604D]/5"
            >
              批量拒绝（{selectedIds.size}）
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              disabled={isPending}
              className="h-7 text-[12px] text-stone-500 hover:text-stone-700"
            >
              取消选择
            </Button>
          </div>
        </div>
      ) : null}

      {/* 批量驳回对话框 */}
      <Dialog open={batchRejectOpen} onOpenChange={setBatchRejectOpen}>
        <DialogContent className="max-w-md rounded-2xl border border-stone-200 bg-white p-0 shadow-xl">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>批量驳回申请</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-2">
            <Textarea
              value={batchRejectNote}
              onChange={(e) => setBatchRejectNote(e.target.value)}
              placeholder="统一驳回理由（可选，未来会推送给用户）"
              rows={3}
              disabled={isPending}
            />
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setBatchRejectOpen(false);
                setBatchRejectNote("");
              }}
              disabled={isPending}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBatchReject}
              disabled={isPending}
            >
              {isPending ? "处理中" : `确认驳回（${selectedIds.size}）`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-stone-50">
        {/* 表头 */}
        <div className="flex items-center gap-3 px-4 py-2 bg-stone-100/50">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
            aria-label="全选"
          />
          <span className="text-[12px] font-medium text-stone-500">全选</span>
        </div>

        {visibleRows.map((row) => {
          const isRejecting = rejectingId === row.id;
          const isSelected = selectedIds.has(row.id);
          return (
            <div key={row.id} className="group flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 hover:bg-stone-100/30 transition-colors duration-150">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSelect(row.id)}
                  aria-label={`选择 ${row.applicantName || "未命名"}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium tracking-tight text-stone-900 truncate">
                      {row.applicantName || "未命名"}
                    </span>
                    <span className="text-[12px] text-stone-500 truncate">{row.applicantEmail}</span>
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-2 text-[12px]">
                    <span className="text-stone-900">{row.targetTeamName || "未知团队"}</span>
                    <span className="text-stone-500">{formatTime(row.createdAt)}</span>
                  </div>
                </div>
              </div>

              {!isRejecting ? (
                <div className="flex shrink-0 gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(row.id)}
                    disabled={isPending}
                  >
                    同意
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectingId(row.id);
                      setNote("");
                    }}
                    disabled={isPending}
                  >
                    驳回
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}

        {rejectingId ? (
          <div className="space-y-2 bg-white px-4 py-3">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="驳回理由（可选，未来会推送给用户）"
              rows={2}
              disabled={isPending}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRejectingId(null);
                  setNote("");
                }}
                disabled={isPending}
              >
                取消
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleRejectConfirm(rejectingId)}
                disabled={isPending}
              >
                {isPending ? "处理中" : "确认驳回"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}
