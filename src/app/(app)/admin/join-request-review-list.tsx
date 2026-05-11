"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { AdminRequestRow } from "@/lib/team-join/service";

import {
  approveJoinRequestAction,
  rejectJoinRequestAction,
} from "./join-request-actions";

type Props = {
  rows: AdminRequestRow[];
};

export function JoinRequestReviewList({ rows }: Props) {
  const [visibleRows, setVisibleRows] = useState(rows);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  if (visibleRows.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-[13px] text-zinc-400">
        暂无待审申请
      </div>
    );
  }

  const handleApprove = (id: string) => {
    if (isPending) return;
    const approvedRow = visibleRows.find((row) => row.id === id);
    if (!approvedRow) return;

    setVisibleRows((currentRows) => currentRows.filter((row) => row.id !== id));
    feedbackToast.success("已同意申请");

    startTransition(async () => {
      const result = await approveJoinRequestAction(id, null);
      if (!result.ok) {
        setVisibleRows((currentRows) => {
          if (currentRows.some((row) => row.id === id)) return currentRows;
          return [...currentRows, approvedRow].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });
        feedbackToast.error(result.error);
      }
    });
  };

  const handleReject = (id: string) => {
    if (isPending) return;
    const rejectedRow = visibleRows.find((row) => row.id === id);
    if (!rejectedRow) return;
    const rejectedNote = note.trim() || null;

    setVisibleRows((currentRows) => currentRows.filter((row) => row.id !== id));
    setRejectingId(null);
    setNote("");
    feedbackToast.success("已驳回申请");

    startTransition(async () => {
      const result = await rejectJoinRequestAction(id, rejectedNote);
      if (!result.ok) {
        setVisibleRows((currentRows) => {
          if (currentRows.some((row) => row.id === id)) return currentRows;
          return [...currentRows, rejectedRow].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });
        setRejectingId(id);
        setNote(rejectedNote ?? "");
        feedbackToast.error(result.error);
      }
    });
  };

  return (
    <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-zinc-50">
      {visibleRows.map((row) => {
        const isRejecting = rejectingId === row.id;
        return (
          <div key={row.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-medium tracking-tight text-zinc-800 truncate">
                  {row.applicantName || "未命名"}
                </span>
                <span className="text-[12px] text-zinc-500 truncate">{row.applicantEmail}</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-2 text-[12px]">
                <span className="text-zinc-800">{row.targetTeamName || "未知团队"}</span>
                <span className="text-zinc-400">{formatTime(row.createdAt)}</span>
              </div>
            </div>

            {!isRejecting ? (
              <div className="flex shrink-0 gap-2">
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
              onClick={() => handleReject(rejectingId)}
              disabled={isPending}
            >
              {isPending ? "处理中" : "确认驳回"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
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
