import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrphanExemptionRequest } from "@/lib/exemption-orphan";
import type { PendingRequest, TeamOption } from "@/lib/modules/types";

export function MemberAlerts({
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
  pendingRequests: PendingRequest[];
  canManageMembers: boolean;
  isPending: boolean;
  handleReviewJoinRequest: (requestId: string, action: "approve" | "reject") => void;
  orphanExemptionCount: number;
  isCompanyOwner: boolean;
  orphanExemptionRequests: OrphanExemptionRequest[];
  localTeams: TeamOption[];
  handleAssignOrphanMember: (request: OrphanExemptionRequest, teamId: string) => void;
  handleRejectOrphanRequest: (request: OrphanExemptionRequest) => void;
}) {
  return (
    <>
        {/* ── 待审批入团申请预警栏（复用标准 Alert 规范） ── */}
        {pendingRequests.length > 0 && (
          <Alert className="rounded-xl border-[#E2E2DF] bg-[#FCFCFB] p-4 text-[13px] text-[#78716C]">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-status-warning/10 text-status-warning">
                <span className="size-1.5 rounded-full bg-current text-status-warning" />
              </span>
              <AlertTitle className="text-[14px] leading-[1.40] font-normal text-[#141413] mb-0">待审批入团申请</AlertTitle>
              <Badge variant="warning" className="tabular-nums">
                {pendingRequests.length} 位新成员
              </Badge>
            </div>
            <AlertDescription className="divide-y divide-[#E2E2DF]">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-normal text-[#141413]">{req.applicantName}</span>
                    <span className="mx-2 text-[#E2E2DF]">·</span>
                    <span className="text-[12px] text-[#1F1E1D]">申请加入：{req.targetTeamName}</span>
                    <span className="mx-2 text-[#E2E2DF]">·</span>
                    <span className="text-[12px] text-[#78716C] tabular-nums">
                      {new Date(req.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  {canManageMembers && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="s"
                        onClick={() => handleReviewJoinRequest(req.id, "reject")}
                        disabled={isPending}
                        className="text-[#78716C] hover:bg-status-danger/10 hover:text-status-danger"
                      >
                        拒绝
                      </Button>
                      <Button
                        size="s"
                        onClick={() => handleReviewJoinRequest(req.id, "approve")}
                        disabled={isPending}
                      >
                        同意入团
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {orphanExemptionCount > 0 && (
          <Alert className="rounded-xl border-[#E2E2DF] bg-[#FCFCFB] p-4 text-[13px] text-[#78716C]">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-status-danger/10 text-status-danger">
                <span className="size-1.5 rounded-full bg-current text-status-danger" />
              </span>
              <AlertTitle className="text-[14px] leading-[1.40] font-normal text-[#141413] mb-0">待归属申请</AlertTitle>
              <Badge variant="danger" className="tabular-nums">
                {orphanExemptionCount} 条
              </Badge>
            </div>

            {isCompanyOwner ? (
              <AlertDescription className="divide-y divide-[#E2E2DF]">
                {orphanExemptionRequests.map((request) => {
                  const isArchivedOrDeleted =
                    request.applicant_membership_status === "archived" ||
                    request.applicant_membership_status === null;

                  return (
                    <div key={request.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[13px] font-normal text-[#141413]">
                            {request.applicant_name}
                          </span>
                          <span className="text-[12px] text-status-danger">
                            {isArchivedOrDeleted
                              ? request.applicant_membership_status === "archived" ? "已归档" : "已注销或资料缺失"
                              : "当前未分配团队"}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] leading-[1.7] text-[#78716C]">
                          快照团队：{request.snapshot_team_name ?? "未记录"} · {request.exemption_category ?? "waive"} / {request.exemption_type} · {request.start_date}
                          {request.end_date ? ` 至 ${request.end_date}` : ""} · 提交于 {new Date(request.created_at).toLocaleDateString("zh-CN")}
                        </p>
                      </div>

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
                            className="h-7 rounded-md border border-[#E2E2DF] bg-white px-2 text-[12px] text-[#1F1E1D] shadow-input outline-none"
                            aria-label={`为${request.applicant_name}分配团队`}
                          >
                            <option value="" disabled>分配至团队…</option>
                            {localTeams.map((team) => (
                              <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                          </select>
                        )}
                        <Button
                          variant="ghost"
                          size="s"
                          onClick={() => handleRejectOrphanRequest(request)}
                          disabled={isPending}
                          className="text-[#78716C] hover:bg-status-danger/10 hover:text-status-danger"
                        >
                          拒绝并留痕
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </AlertDescription>
            ) : (
              <AlertDescription className="text-[13px] leading-[1.7] text-[#78716C]">
                有待公司所有者处理的归属异常
              </AlertDescription>
            )}
          </Alert>
        )}
    </>
  );
}
