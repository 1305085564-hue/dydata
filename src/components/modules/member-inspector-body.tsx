import type { ReactNode } from "react";
import { getRoleLabel } from "@/lib/role-label";
import { ItemHeading } from "@/components/ui/item-heading";
import { MemberPermissionEditor } from "@/app/(app)/admin/components/member-permission-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type PermanentExemptionState } from "@/app/(app)/admin/modules/permanent-exemption-logic";
import { workGroupLabel } from "@/app/(app)/admin/modules/members-page-view";
import { archiveSnapshotRoleLabel, formatDataScope, normalizeUserStatus, runtimeRoleForView } from "@/lib/modules/domain/view-rules";
import type { CompanyRole, DataScope, Permissions } from "@/types";
import type { ProfileSummary, TeamOption } from "@/lib/modules/types";
import type { WorkGroupRow } from "@/lib/work-groups";
import { MemberInspectorExemption } from "./member-inspector-exemption";

export interface MemberInspectorBodyProps {
  activeMember: ProfileSummary;
  activeMemberCompanyRole: CompanyRole | null;
  activeMemberIsReadOnly: boolean;
  currentCompanyRole: CompanyRole | null;
  canEditActiveMemberTeam: boolean;
  canEditWorkGroups: boolean;
  canManageCompany: boolean;
  canManageActiveMemberAccount: boolean;
  localTeams: TeamOption[];
  activeMemberPeerGroup: WorkGroupRow | null | undefined;
  activeMemberOperatorGroup: WorkGroupRow | null | undefined;
  availablePeerGroups: WorkGroupRow[];
  availableOperatorGroups: WorkGroupRow[];
  activeMemberExemptionState: PermanentExemptionState;
  isPermanentSubmitting: boolean;
  draftPermissions: Permissions;
  handleTransferMemberTeam: (memberId: string, teamId: string | null) => void;
  handleAssignPeerGroup: (targetGroupId: string) => void;
  handleAssignOperatorGroup: (targetGroupId: string) => void;
  handleRoleChangeClick: (member: ProfileSummary) => void;
  setClearPermanentTarget: (member: ProfileSummary) => void;
  setSetPermanentTarget: (member: ProfileSummary) => void;
  setPermanentReason: (reason: string) => void;
  setPermanentReasonError: (error: string | null) => void;
  setPasswordResetTarget: (member: ProfileSummary) => void;
  setNewPassword: (password: string) => void;
  setArchiveTarget: (member: ProfileSummary) => void;
  setArchiveReason: (reason: string) => void;
  canArchiveTarget: (member: ProfileSummary) => boolean;
}

const ROW = "flex min-h-9 items-center justify-between gap-3 py-1";
const ROW_LABEL = "shrink-0 text-[14px] text-[#78716C]";
const SELECT_TRIGGER =
  "h-7 min-w-[140px] justify-end gap-1 border-transparent bg-transparent px-2 text-right text-[14px] text-[#141413] shadow-none hover:bg-[#EBEBE9]";
const TEXT_ACTION =
  "h-7 rounded-md px-2 text-[14px] text-[#1F1E1D] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413] disabled:opacity-50";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={ROW}>
      <span className={ROW_LABEL}>{label}</span>
      <div className="flex min-w-0 items-center justify-end gap-1 text-[14px] text-[#1F1E1D]">{children}</div>
    </div>
  );
}

/**
 * 成员抽屉正文：位置（团队、小队）→ 身份与能做的事 → 考核 → 账号 → 归档（单独隔开）。
 * 每行左边是什么，右边是现在的值；能改的值本身就是下拉，不另设「切换」按钮。
 */
export function MemberInspectorBody({
  activeMember,
  activeMemberCompanyRole,
  activeMemberIsReadOnly,
  currentCompanyRole,
  canEditActiveMemberTeam,
  canEditWorkGroups,
  canManageCompany,
  canManageActiveMemberAccount,
  localTeams,
  activeMemberPeerGroup,
  activeMemberOperatorGroup,
  availablePeerGroups,
  availableOperatorGroups,
  activeMemberExemptionState,
  isPermanentSubmitting,
  draftPermissions,
  handleTransferMemberTeam,
  handleAssignPeerGroup,
  handleAssignOperatorGroup,
  handleRoleChangeClick,
  setClearPermanentTarget,
  setSetPermanentTarget,
  setPermanentReason,
  setPermanentReasonError,
  setPasswordResetTarget,
  setNewPassword,
  setArchiveTarget,
  setArchiveReason,
  canArchiveTarget,
}: MemberInspectorBodyProps) {
  const isArchived = activeMember.membership_status === "archived";
  const roleLabel = getRoleLabel(runtimeRoleForView(activeMemberCompanyRole), { membershipStatus: activeMember.membership_status });
  const noTeamText = "先分团队";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2 space-y-6">
      {isArchived && (
        <section className="space-y-2" aria-labelledby="archive-record-title">
          <ItemHeading as="h4" id="archive-record-title">归档记录</ItemHeading>
          <dl className="divide-y divide-[#E2E2DF]/60 border-y border-[#E2E2DF]/60 text-[14px]">
            {[
              ["归档时间", activeMember.archived_at ? new Date(activeMember.archived_at).toLocaleString("zh-CN", { hour12: false }) : "没有记录"],
              ["操作人", activeMember.archived_by_name || "没有记录"],
              ["原因", activeMember.archive_reason || "没有记录"],
              ["归档前团队", typeof activeMember.archive_snapshot?.team_name === "string" ? activeMember.archive_snapshot.team_name : "没有记录"],
              ["归档前身份", archiveSnapshotRoleLabel(activeMember.archive_snapshot)],
              ["归档前看得到", typeof activeMember.archive_snapshot?.data_scope === "string" ? formatDataScope(activeMember.archive_snapshot.data_scope as DataScope) : "没有记录"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2">
                <dt className="shrink-0 text-[#78716C]">{label}</dt>
                <dd className="text-right text-[#1F1E1D]">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[14px] text-[#78716C]">恢复后是在职组员，原团队不会自动恢复，需要重新分。</p>
        </section>
      )}

      {!isArchived && (
        <section className="space-y-1" aria-labelledby="member-position-title">
          <ItemHeading as="h4" id="member-position-title">位置</ItemHeading>
          <div className="divide-y divide-[#E2E2DF]/60">
            <Row label="团队">
              {canEditActiveMemberTeam ? (
                <Select
                  value={activeMember.team_id || "__unassigned__"}
                  onValueChange={(val) => {
                    if (val) handleTransferMemberTeam(activeMember.id, val === "__unassigned__" ? null : val);
                  }}
                >
                  <SelectTrigger aria-label="团队" className={SELECT_TRIGGER}>
                    <SelectValue placeholder="还没分团队">
                      {activeMember.team_name || (activeMember.team_id ? localTeams.find((t) => t.id === activeMember.team_id)?.name : "还没分团队")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">不在任何团队（保留账号）</SelectItem>
                    {localTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span>{activeMember.team_name || "还没分团队"}</span>
              )}
            </Row>

            <Row label="工种小队">
              {canEditWorkGroups && activeMember.team_id ? (
                <Select value={activeMemberPeerGroup?.id || "__none__"} onValueChange={(val) => { if (val) handleAssignPeerGroup(val); }}>
                  <SelectTrigger aria-label="工种小队" className={SELECT_TRIGGER}>
                    <SelectValue placeholder="没有">{workGroupLabel(activeMemberPeerGroup) ?? "没有"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">没有</SelectItem>
                    {availablePeerGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {workGroupLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className={activeMember.team_id ? undefined : "text-[#A8A29E]"}>
                  {!activeMember.team_id ? noTeamText : workGroupLabel(activeMemberPeerGroup) ?? "没有"}
                </span>
              )}
            </Row>

            <Row label="运营小队">
              {canEditWorkGroups && activeMember.team_id ? (
                <Select value={activeMemberOperatorGroup?.id || "__none__"} onValueChange={(val) => { if (val) handleAssignOperatorGroup(val); }}>
                  <SelectTrigger aria-label="运营小队" className={SELECT_TRIGGER}>
                    <SelectValue placeholder="没有">{activeMemberOperatorGroup?.name || "没有"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">没有</SelectItem>
                    {availableOperatorGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className={activeMember.team_id ? undefined : "text-[#A8A29E]"}>
                  {!activeMember.team_id ? noTeamText : activeMemberOperatorGroup?.name || "没有"}
                </span>
              )}
            </Row>
          </div>
        </section>
      )}

      <section className="space-y-1" aria-labelledby="member-role-title">
        <ItemHeading as="h4" id="member-role-title">身份与能做的事</ItemHeading>
        {!isArchived && (
          <div className="border-b border-[#E2E2DF]/60">
            <Row label="身份">
              <span>{roleLabel}</span>
              {!activeMemberIsReadOnly && canManageCompany && (
                <button type="button" onClick={() => handleRoleChangeClick(activeMember)} className={TEXT_ACTION}>
                  {activeMemberCompanyRole === "admin" ? "改为组员" : "升为组长"}
                </button>
              )}
            </Row>
          </div>
        )}
        <MemberPermissionEditor
          member={{
            id: activeMember.id,
            name: activeMember.name ?? "",
            email: activeMember.email,
            last_sign_in_at: activeMember.last_sign_in_at,
            role: activeMember.role,
            company_role: activeMember.company_role ?? null,
            teamId: activeMember.team_id,
            teamName: activeMember.team_name,
            permissions: activeMember.permissions ?? {},
            data_scope: activeMember.data_scope,
            status: normalizeUserStatus(activeMember.status),
          }}
          draftPermissions={draftPermissions}
        />
      </section>

      <MemberInspectorExemption
        activeMember={activeMember}
        currentCompanyRole={currentCompanyRole}
        activeMemberExemptionState={activeMemberExemptionState}
        isPermanentSubmitting={isPermanentSubmitting}
        setClearPermanentTarget={setClearPermanentTarget}
        setSetPermanentTarget={setSetPermanentTarget}
        setPermanentReason={setPermanentReason}
        setPermanentReasonError={setPermanentReasonError}
      />

      {!isArchived && canManageActiveMemberAccount && (
        <section className="space-y-1" aria-labelledby="member-account-title">
          <ItemHeading as="h4" id="member-account-title">账号</ItemHeading>
          <div className="divide-y divide-[#E2E2DF]/60">
            <Row label="登录密码">
              <button
                type="button"
                onClick={() => {
                  setPasswordResetTarget(activeMember);
                  setNewPassword("");
                }}
                className={TEXT_ACTION}
              >
                重置密码
              </button>
            </Row>
          </div>
        </section>
      )}

      {!isArchived && canArchiveTarget(activeMember) && (
        <div className="flex items-center justify-between gap-3 border-t border-[#E2E2DF] pt-4">
          <span className="text-[14px] text-[#78716C]">人离开了：封禁登录、移出团队，记录都保留</span>
          <button
            type="button"
            onClick={() => {
              setArchiveTarget(activeMember);
              setArchiveReason("");
            }}
            className="h-7 shrink-0 rounded-md px-2 text-[14px] text-status-danger transition-colors hover:bg-status-danger/10"
          >
            归档账号
          </button>
        </div>
      )}
    </div>
  );
}
