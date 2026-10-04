import { Building2, KeyRound, Settings, Trash2, Users, UserMinus } from "lucide-react";
import { getRoleLabel } from "@/lib/role-label";
import { ItemHeading } from "@/components/ui/item-heading";
import { MemberPermissionEditor } from "@/app/(app)/admin/components/member-permission-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type PermanentExemptionState } from "@/app/(app)/admin/modules/permanent-exemption-logic";
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
  return (
    <>
      {/* 抽屉内容主体（单页直通） */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-6 space-y-8">
                {activeMember.membership_status === "archived" && (
                  <section className="space-y-3" aria-labelledby="archive-record-title">
                    <ItemHeading as="h4" id="archive-record-title">归档记录</ItemHeading>
                    <dl className="space-y-2 border-t border-[#E2E2DF]/60 pt-3 text-[13px]">
                      {[
                        ["归档时间", activeMember.archived_at ? new Date(activeMember.archived_at).toLocaleString("zh-CN", { hour12: false }) : "历史记录未保留"],
                        ["操作人", activeMember.archived_by_name || "历史记录未保留"],
                        ["原因", activeMember.archive_reason || "历史记录未保留"],
                        ["归档前团队", typeof activeMember.archive_snapshot?.team_name === "string" ? activeMember.archive_snapshot.team_name : "历史记录未保留"],
                        ["归档前角色", archiveSnapshotRoleLabel(activeMember.archive_snapshot)],
                        ["归档前数据范围", typeof activeMember.archive_snapshot?.data_scope === "string" ? formatDataScope(activeMember.archive_snapshot.data_scope as DataScope) : "历史记录未保留"],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-start justify-between gap-4">
                          <dt className="shrink-0 text-[#78716C]">{label}</dt>
                          <dd className="text-right text-[#1F1E1D]">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="border-t border-[#E2E2DF]/60 pt-3 text-[13px] leading-relaxed text-[#78716C]">
                      恢复后成为在职未分组成员，原团队不自动恢复。
                    </p>
                  </section>
                )}

                {/* 1. 高频账户与团队管理 */}
                {activeMember.membership_status !== "archived" && (
                  <div className="space-y-3">
                    <ItemHeading as="h4" className="mb-2">账户与团队管理</ItemHeading>
                    <div className="space-y-0.5">
                      {/* 所属团队 */}
                      <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[#F7F7F6] transition-colors">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-3.5 text-[#78716C] shrink-0" />
                          <span className="text-[13px] text-[#1F1E1D]">所属团队</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {canEditActiveMemberTeam ? (
                            <Select
                              value={activeMember.team_id || "__unassigned__"}
                              onValueChange={(val) => {
                                if (val) {
                                  const newId = val === "__unassigned__" ? null : val;
                                  handleTransferMemberTeam(activeMember.id, newId);
                                }
                              }}
                            >
                              <SelectTrigger className="h-7 text-[13px] border-transparent bg-transparent hover:bg-[#EBEBE9] min-w-[110px] text-right font-normal">
                                <SelectValue placeholder="未分配团队">
                                  {activeMember.team_name || (activeMember.team_id ? localTeams.find(t => t.id === activeMember.team_id)?.name : "未分配团队")}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned__">未分配团队</SelectItem>
                                {localTeams.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[13px] text-[#78716C]">
                              {activeMember.team_name || "未分配团队"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 工种小队 (文案/达人 二选一) */}
                      <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[#F7F7F6] transition-colors">
                        <div className="flex items-center gap-2">
                          <Users className="size-3.5 text-[#78716C] shrink-0" />
                          <span className="text-[13px] text-[#1F1E1D]">工种小队</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {canEditWorkGroups && activeMember.team_id ? (
                            <Select
                              value={activeMemberPeerGroup?.id || "__none__"}
                              onValueChange={(val) => {
                                if (val) handleAssignPeerGroup(val);
                              }}
                            >
                              <SelectTrigger className="h-7 text-[13px] border-transparent bg-transparent hover:bg-[#EBEBE9] min-w-[110px] text-right font-normal">
                                <SelectValue placeholder="未分配小队">
                                  {activeMemberPeerGroup
                                    ? `${activeMemberPeerGroup.name} (${activeMemberPeerGroup.kind === "writer" ? "文案" : "达人"})`
                                    : "未分配小队"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">未分配小队</SelectItem>
                                {availablePeerGroups.map((g) => (
                                  <SelectItem key={g.id} value={g.id}>
                                    {g.name} ({g.kind === "writer" ? "文案" : "达人"})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[13px] text-[#78716C]">
                              {!activeMember.team_id
                                ? "需先分配团队"
                                : activeMemberPeerGroup
                                ? `${activeMemberPeerGroup.name} (${activeMemberPeerGroup.kind === "writer" ? "文案" : "达人"})`
                                : "未分配小队"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 运营小队 (可兼任) */}
                      <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[#F7F7F6] transition-colors">
                        <div className="flex items-center gap-2">
                          <Users className="size-3.5 text-[#78716C] shrink-0" />
                          <span className="text-[13px] text-[#1F1E1D]">运营小队</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {canEditWorkGroups && activeMember.team_id ? (
                            <Select
                              value={activeMemberOperatorGroup?.id || "__none__"}
                              onValueChange={(val) => {
                                if (val) handleAssignOperatorGroup(val);
                              }}
                            >
                              <SelectTrigger className="h-7 text-[13px] border-transparent bg-transparent hover:bg-[#EBEBE9] min-w-[110px] text-right font-normal">
                                <SelectValue placeholder="未分配小队">
                                  {activeMemberOperatorGroup?.name || "未分配小队"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">未分配小队</SelectItem>
                                {availableOperatorGroups.map((g) => (
                                  <SelectItem key={g.id} value={g.id}>
                                    {g.name} (运营)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[13px] text-[#78716C]">
                              {!activeMember.team_id
                                ? "需先分配团队"
                                : activeMemberOperatorGroup?.name || "未分配小队"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 系统角色切换 */}
                      {!activeMemberIsReadOnly && (
                        canManageCompany ? (
                          <button
                            type="button"
                            onClick={() => handleRoleChangeClick(activeMember)}
                            className="w-full flex items-center justify-between py-1.5 px-2 rounded-md text-left hover:bg-[#EBEBE9] active:scale-[0.99] transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-2">
                              <Settings className="size-3.5 text-[#78716C] group-hover:text-[#1F1E1D] shrink-0 transition-colors" />
                              <span className="text-[13px] text-[#1F1E1D]">
                                {activeMemberCompanyRole === "admin" ? "降为组员" : "提升为组长 · 管理"}
                              </span>
                            </div>
                            <span className="text-[13px] text-[#78716C] group-hover:text-[#141413] transition-colors">
                              切换身份
                            </span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-between py-1.5 px-2 rounded-xl">
                            <div className="flex items-center gap-2">
                              <Settings className="size-3.5 text-[#78716C] shrink-0" />
                              <span className="text-[13px] text-[#1F1E1D]">
                                {activeMemberCompanyRole === "admin" ? "组长 · 管理" : "组员"}
                              </span>
                            </div>
                            <span className="text-[13px] text-[#78716C]">
                              {getRoleLabel(runtimeRoleForView(activeMemberCompanyRole), { membershipStatus: activeMember.membership_status })}
                            </span>
                          </div>
                        )
                      )}

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

                      {/* 重置密码 */}
                      {canManageActiveMemberAccount && (
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordResetTarget(activeMember);
                            setNewPassword("");
                          }}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded-md text-left hover:bg-[#EBEBE9] active:scale-[0.99] transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            <KeyRound className="size-3.5 text-[#78716C] group-hover:text-[#1F1E1D] shrink-0 transition-colors" />
                            <span className="text-[13px] text-[#1F1E1D]">重置账户密码</span>
                          </div>
                          <span className="text-[13px] text-[#78716C] group-hover:text-[#141413] transition-colors">
                            快捷重置
                          </span>
                        </button>
                      )}

                      {/* 移出团队 */}
                      {canEditActiveMemberTeam && activeMember.team_id && (
                        <button
                          type="button"
                          onClick={() => handleTransferMemberTeam(activeMember.id, null)}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded-md text-left hover:bg-[#EBEBE9] active:scale-[0.99] transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-2">
                            <UserMinus className="size-3.5 text-[#78716C] group-hover:text-[#1F1E1D] shrink-0 transition-colors" />
                            <span className="text-[13px] text-[#1F1E1D]">移出团队</span>
                          </div>
                          <span className="text-[13px] text-[#78716C] group-hover:text-status-danger transition-colors">
                            保留账号
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. 数据范围与功能权限只读说明 */}
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

                {/* 3. 危险操作区 */}
                {activeMember.membership_status !== "archived" && canArchiveTarget(activeMember) && (
                  <div className="pt-6 border-t border-[#E2E2DF] space-y-3">
                    <ItemHeading as="h4" className="mb-2">
                      <span className="text-status-danger">危险操作</span>
                    </ItemHeading>
                    <button
                      type="button"
                      onClick={() => {
                        setArchiveTarget(activeMember);
                        setArchiveReason("");
                      }}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-md text-left hover:bg-status-danger/10 active:scale-[0.99] transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <Trash2 className="size-3.5 text-status-danger shrink-0" />
                        <span className="text-[13px] text-status-danger font-normal">归档账号</span>
                      </div>
                      <span className="text-[13px] text-status-danger font-normal group-hover:text-status-danger/80 transition-colors">
                        封禁登录并移出团队
                      </span>
                    </button>
                  </div>
                )}
              </div>
    </>
  );
}
