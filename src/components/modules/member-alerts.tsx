"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { OrphanExemptionRequest } from "@/lib/exemption-orphan";
import type { PendingRequest, TeamOption } from "@/lib/modules/types";
import { cn } from "@/lib/utils";
import {
  buildMembersHeadline,
  buildPendingLine,
  describeOrphanRequest,
  formatDateKey,
} from "@/app/(app)/admin/modules/members-page-view";

/**
 * 成员管理页头：标题即答案（在职多少人、几个团队），旁边「N 人还没分团队」点了就筛出这些人；
 * 下面一行说有没有等我批的申请，有就直接列在下面，一行一人，当场同意或拒绝。
 */
export function MemberAlerts({
  activeCount,
  headlineTeams,
  unassignedCount,
  onShowUnassigned,
  pendingRequests,
  canManageMembers,
  isPending,
  handleReviewJoinRequest,
  orphanExemptionCount,
  isCompanyOwner,
  orphanExemptionRequests,
  localTeams,
  handleAssignOrphanMember,
  handleRejectOrphanRequest,
}: {
  activeCount: number;
  headlineTeams: TeamOption[];
  unassignedCount: number;
  onShowUnassigned: () => void;
  pendingRequests: PendingRequest[];
  canManageMembers: boolean;
  isPending: boolean;
  handleReviewJoinRequest: (requestId: string, action: "approve" | "reject", note?: string) => void;
  orphanExemptionCount: number;
  isCompanyOwner: boolean;
  orphanExemptionRequests: OrphanExemptionRequest[];
  localTeams: TeamOption[];
  handleAssignOrphanMember: (request: OrphanExemptionRequest, teamId: string) => void;
  handleRejectOrphanRequest: (request: OrphanExemptionRequest) => void;
}) {
  // 驳回时可填原因（选填），申请人在横幅上看到「未通过：原因」
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const confirmReject = (requestId: string) => {
    handleReviewJoinRequest(requestId, "reject", rejectNote);
    setRejectingId(null);
    setRejectNote("");
  };

  const headline = buildMembersHeadline({ activeCount, teams: headlineTeams });
  const pendingLine = buildPendingLine({
    joinCount: pendingRequests.length,
    orphanCount: orphanExemptionCount,
    canHandleOrphan: isCompanyOwner,
  });
  const showPendingLine = pendingLine.hasWork || canManageMembers;

  return (
    <>
      <header className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-serif text-[20px] sm:text-[28px] leading-[1.20] tracking-tight text-[#141413] tabular-nums">
            {headline}
          </h1>
          {unassignedCount > 0 && (
            <button
              type="button"
              onClick={onShowUnassigned}
              className="rounded-md text-[14px] text-[#1F1E1D] tabular-nums hover:text-[#141413] hover:underline underline-offset-4"
            >
              {unassignedCount} 人还没分团队 →
            </button>
          )}
        </div>
        {showPendingLine && (
          <p className={cn("text-[14px]", pendingLine.hasWork ? "text-[#1F1E1D]" : "text-[#78716C]")}>
            {pendingLine.text}
          </p>
        )}
      </header>

      {pendingRequests.length > 0 && (
        <section aria-label="待批的入团申请" className="divide-y divide-[#E2E2DF]/60 border-y border-[#E2E2DF]/60">
          {pendingRequests.map((req) => (
            <div key={req.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
              <p className="min-w-0 flex-1 text-[14px] text-[#78716C]">
                <span className="text-[#141413]">{req.applicantName}</span>
                <span className="mx-2">申请加入 {req.targetTeamName}</span>
                <span className="tabular-nums">{formatDateKey(req.createdAt.slice(0, 10))}</span>
              </p>
              {canManageMembers && rejectingId !== req.id && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRejectingId(req.id);
                      setRejectNote("");
                    }}
                    disabled={isPending}
                    className="text-[#78716C]"
                  >
                    拒绝
                  </Button>
                  <Button variant="outline" onClick={() => handleReviewJoinRequest(req.id, "approve")} disabled={isPending}>
                    同意入团
                  </Button>
                </div>
              )}
              {canManageMembers && rejectingId === req.id && (
                <div className="flex w-full items-center gap-2">
                  <input
                    autoFocus
                    value={rejectNote}
                    maxLength={200}
                    onChange={(event) => setRejectNote(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setRejectingId(null);
                    }}
                    placeholder="拒绝原因（选填，申请人会看到）"
                    aria-label={`拒绝${req.applicantName}的原因`}
                    className="h-8 min-w-0 flex-1 rounded-md border border-[#E2E2DF] bg-white px-2 text-[14px] text-[#141413] shadow-input outline-none focus-visible:border-[#1F1E1D] focus-visible:ring-2 focus-visible:ring-[#1F1E1D]/10"
                  />
                  <Button variant="ghost" onClick={() => setRejectingId(null)} className="text-[#78716C]">取消</Button>
                  <Button variant="outline" onClick={() => confirmReject(req.id)} disabled={isPending}>确认拒绝</Button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {isCompanyOwner && orphanExemptionRequests.length > 0 && (
        <section aria-label="没人能批的申请" className="border-y border-[#E2E2DF]/60">
          <p className="pt-2 text-[12px] text-[#78716C]">
            申请人没有团队，组长看不到。分到团队后原申请作废，需要本人重新提交。
          </p>
          <div className="divide-y divide-[#E2E2DF]/60">
            {orphanExemptionRequests.map((request) => {
              const isArchivedOrDeleted =
                request.applicant_membership_status === "archived" ||
                request.applicant_membership_status === null;

              return (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                  <p className="min-w-0 flex-1 text-[14px] text-[#78716C]">
                    <span className="text-[#141413]">{request.applicant_name}</span>
                    <span className="mx-2">
                      {isArchivedOrDeleted
                        ? request.applicant_membership_status === "archived" ? "已归档" : "账号已注销"
                        : "还没分团队"}
                    </span>
                    <span className="tabular-nums">{describeOrphanRequest(request)}</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    {!isArchivedOrDeleted && (
                      <select
                        defaultValue=""
                        onChange={(event) => {
                          if (event.target.value) {
                            handleAssignOrphanMember(request, event.target.value);
                            event.target.value = "";
                          }
                        }}
                        disabled={isPending}
                        className="h-7 rounded-md border border-[#E2E2DF] bg-white px-2 text-[14px] text-[#1F1E1D] shadow-input outline-none"
                        aria-label={`为${request.applicant_name}分配团队`}
                      >
                        <option value="" disabled>分到团队…</option>
                        {localTeams.map((team) => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </select>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => handleRejectOrphanRequest(request)}
                      disabled={isPending}
                      className="text-[#78716C]"
                    >
                      拒绝
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
