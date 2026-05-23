"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Activity, AlertCircle, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { reviewExemptionRequest } from "@/app/(app)/admin/actions";
import type { DashboardPageData } from "@/lib/loaders/dashboard-page";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { SopCheckpoint, SopMemberStatus } from "@/types";
import { ReviewDetailModal } from "./review-detail-modal";
import { LeaderReport } from "./leader-report";
import { StatusBadge } from "./status-badge";
import { MATRIX_CHECKPOINTS, checkpointLabel } from "./status-theme";

interface LeaderBoardData {
  members: SopMemberStatus[];
  pendingReviews: ReviewSubmission[];
  summary: {
    memberCount: number;
    dataReportSubmittedCount: number;
    averagePlayCount: number;
    averageLikes: number;
    pendingReviewCount: number;
  };
}

type ReviewSubmission = {
    id: string;
    user_id: string;
    checkpoint: string;
    topic_text: string | null;
    script_text: string | null;
    video_url: string | null;
    review_status: string;
};

interface LeaderDashboardProps {
  today: string;
  userRole: "admin" | "owner";
  teamReviewRequests?: DashboardPageData["teamReviewRequests"];
}

/**
 * 组长看板
 * 法典 V1：Loader2 → Skeleton；× 彩底；异常/待审核统一灰底 + 状态点
 */
export function LeaderDashboard({ today, userRole, teamReviewRequests = [] }: LeaderDashboardProps) {
  const [board, setBoard] = useState<LeaderBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReviewSubmission | null>(null);
  const [localExemptionRequests, setLocalExemptionRequests] = useState(teamReviewRequests);
  const [reviewingExemptionId, setReviewingExemptionId] = useState<string | null>(null);
  const [isReviewingExemption, startReviewExemption] = useTransition();

  const cancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBoard = useCallback(async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    cancelledRef.current = false;

    let retries = 0;
    const maxRetries = 3;
    const delays = [1000, 2000, 3000];

    const attempt = async (): Promise<void> => {
      if (cancelledRef.current) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/sop/leader-board?statusDate=${today}`, {
          signal: abortControllerRef.current?.signal,
        });
        if (cancelledRef.current) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelledRef.current) return;
        if (data.ok) {
          setBoard(data);
          setError(null);
          return;
        }
        if (data.error) {
          throw new Error(data.error);
        }
      } catch (err) {
        if (cancelledRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "加载失败";
        if (retries < maxRetries) {
          retries++;
          await new Promise((r) => setTimeout(r, delays[retries - 1]));
          if (cancelledRef.current) return;
          return attempt();
        }
        setError(message);
        setBoard(null);
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    };

    await attempt();
  }, [today]);

  useEffect(() => {
    fetchBoard();
    return () => {
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
    };
  }, [fetchBoard]);

  useEffect(() => {
    setLocalExemptionRequests(teamReviewRequests);
  }, [teamReviewRequests]);

  if (loading && !board) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <Skeleton className="h-9 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!board && error) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center">
          <div className="relative flex size-2 items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white" />
          </div>
          <div className="mt-2 space-y-1">
            <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold tracking-tight text-zinc-800">
              <AlertCircle className="size-4 stroke-[1.5] text-[#C9604D]" />
              加载失败
            </p>
            <p className="text-[12px] leading-[1.7] text-zinc-400">{error}</p>
          </div>
          <button
            onClick={() => fetchBoard()}
 className="mt-1 inline-flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-500 transition-[background-color, color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
          >
            <RefreshCw size={12} className="stroke-[1.5]" /> 重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const overdueMembers = board.members.filter(
    (m) => m.isOverdue || Object.values(m.statuses).some((s) => s === "OVERDUE"),
  );
  const pendingSubmissions = board.pendingReviews;
  const exemptionRequestCount = localExemptionRequests.length;

  const handleExemptionReview = (
    request: DashboardPageData["teamReviewRequests"][number],
    decision: "approved" | "rejected",
  ) => {
    setReviewingExemptionId(request.id);
    startReviewExemption(async () => {
      const result = await reviewExemptionRequest({
        requestId: request.id,
        decision,
      });

      if (result.error) {
        toast.error(result.error);
        setReviewingExemptionId(null);
        return;
      }

      setLocalExemptionRequests((current) => current.filter((item) => item.id !== request.id));
      toast.success(decision === "approved" ? "豁免申请已通过" : "豁免申请已拒绝");
      setReviewingExemptionId(null);
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">
          组长看板
        </h2>
        <button
          onClick={() => fetchBoard()}
 className="inline-flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-500 transition-[background-color, color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
        >
          <RefreshCw size={12} className="stroke-[1.5]" /> 刷新
        </button>
      </div>

      {(overdueMembers.length > 0 || pendingSubmissions.length > 0 || exemptionRequestCount > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {overdueMembers.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 border-l-[2px] border-l-[#C9604D] shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white" />
                <AlertCircle size={14} className="stroke-[1.5] text-[#C9604D]" />
                <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-[#C9604D]">
                  超时未交
                </span>
              </div>
              <div className="space-y-1">
                {overdueMembers.map((m) => (
                  <div key={m.userId} className="text-[13px] font-medium text-zinc-800">
                    {m.userName}
                  </div>
                ))}
              </div>
            </div>
          )}
          {pendingSubmissions.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 border-l-[2px] border-l-[#D99E55] shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#D97757] ring-1 ring-white" />
                <Activity size={14} className="stroke-[1.5] text-[#D99E55]" />
                <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-[#D99E55]">
                  待审核
                </span>
              </div>
              <div className="space-y-1">
                {pendingSubmissions.slice(0, 5).map((s) => {
                  const member = board.members.find((m) => m.userId === s.user_id);
                  return (
                    <div key={s.id} className="text-[13px] font-medium text-zinc-800">
                      {member?.userName ?? "未知"} · {checkpointLabel(s.checkpoint as SopCheckpoint)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {exemptionRequestCount > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 border-l-[2px] border-l-[#6FAA7D] shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#6FAA7D] ring-1 ring-white" />
                <Check size={14} className="stroke-[1.5] text-[#6FAA7D]" />
                <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-[#6FAA7D]">
                  豁免待审批
                </span>
              </div>
              <div className="text-[13px] font-medium text-zinc-800">
                {exemptionRequestCount} 条申请等待处理
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                <th className="p-5 text-[12px] font-medium uppercase tracking-[0.25em]">
                  组员
                </th>
                {MATRIX_CHECKPOINTS.map((cp) => (
                  <th
                    key={cp.id}
                    className="p-5 text-center text-[12px] font-medium uppercase tracking-[0.25em]"
                  >
                    {cp.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.members.map((member) => (
                <tr
                  key={member.userId}
                  className="border-b border-zinc-50 transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] last:border-none hover:bg-zinc-50"
                >
                  <td className="p-5 text-[13px] font-medium text-zinc-800">
                    {member.userName}
                  </td>
                  {MATRIX_CHECKPOINTS.map((cp) => (
                    <td key={cp.id} className="p-4 text-center">
                      <div className="flex justify-center">
                        <StatusBadge status={member.statuses[cp.id]} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              {board.members.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-8 text-center text-[13px] font-medium text-zinc-400"
                  >
                    暂无组员数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendingSubmissions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-[18px] font-medium tracking-tight text-zinc-800">
            审核队列
          </h3>
          <div className="space-y-3">
            {pendingSubmissions.map((s) => {
              const member = board.members.find((m) => m.userId === s.user_id);
              const contentPreview =
                s.checkpoint === "TOPIC"
                  ? s.topic_text
                  : s.checkpoint === "SCRIPT"
                    ? s.script_text
                    : s.video_url;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-semibold text-zinc-800">
                        {member?.userName ?? "未知"}
                      </span>
                      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[12px] font-medium text-zinc-500">
                        {checkpointLabel(s.checkpoint as SopCheckpoint)}
                      </span>
                    </div>
                    {contentPreview && (
                      <p
                        className={cn(
                          "mt-1 truncate text-[12px] font-medium text-zinc-500",
                        )}
                      >
                        {contentPreview}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelected(s)}
                    className="shrink-0 rounded-[10px] border border-zinc-200 bg-white px-4 py-2 text-[12px] font-medium text-zinc-700 transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
                  >
                    审核
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {exemptionRequestCount > 0 && (
        <div className="space-y-4">
          <h3 className="text-[18px] font-medium tracking-tight text-zinc-800">
            豁免审批
          </h3>
          <div className="space-y-3">
            {localExemptionRequests.map((request) => {
              const isReviewingThis = isReviewingExemption && reviewingExemptionId === request.id;
              const categoryLabel = request.exemption_category === "leave" ? "请假" : "免交";
              const dateRange = request.end_date && request.end_date !== request.start_date
                ? `${request.start_date} 至 ${request.end_date}`
                : request.start_date;

              return (
                <div
                  key={request.id}
                  className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-zinc-800">
                        {request.applicant_name}
                      </span>
                      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[12px] font-medium text-zinc-500">
                        {categoryLabel}
                      </span>
                      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[12px] font-medium text-zinc-500">
                        {dateRange}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[12px] leading-[1.7] text-zinc-500">
                      {request.reason?.trim() || "未填写原因"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={isReviewingExemption}
                      onClick={() => handleExemptionReview(request, "rejected")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-500 transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <X size={12} className="stroke-[1.5]" />
                      拒绝
                    </button>
                    <button
                      type="button"
                      disabled={isReviewingExemption}
                      onClick={() => handleExemptionReview(request, "approved")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#6FAA7D] px-3 text-[12px] font-medium text-white transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[#5E986D] disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Check size={12} className="stroke-[1.5]" />
                      {isReviewingThis ? "处理中" : "通过"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <LeaderReport today={today} userRole={userRole} />

      {selected && (
        <ReviewDetailModal
          submission={selected}
          onClose={() => setSelected(null)}
          onReviewed={(reviewedSubmission) => {
            setBoard((current) => {
              if (!current) return current;
              const nextPendingReviews = current.pendingReviews.filter(
                (submission) => submission.id !== reviewedSubmission.id,
              );
              return {
                ...current,
                pendingReviews: nextPendingReviews,
                summary: {
                  ...current.summary,
                  pendingReviewCount: nextPendingReviews.length,
                },
              };
            });
            setSelected(null);
          }}
          onReviewFailed={(failedSubmission) => {
            setBoard((current) => {
              if (!current || current.pendingReviews.some((submission) => submission.id === failedSubmission.id)) {
                return current;
              }
              const nextPendingReviews = [...current.pendingReviews, failedSubmission];
              return {
                ...current,
                pendingReviews: nextPendingReviews,
                summary: {
                  ...current.summary,
                  pendingReviewCount: nextPendingReviews.length,
                },
              };
            });
          }}
        />
      )}
    </div>
  );
}
