import type { Dispatch, SetStateAction } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/role-label";
import { isMemberTargetReadOnly } from "@/app/(app)/admin/modules/team-view-logic";
import { formatDataScope, resolveProfileCompanyRoleForView, runtimeRoleForView } from "@/lib/modules/domain/view-rules";
import type { ProfileSummary } from "@/lib/modules/types";
import type { DataScope } from "@/types";

function MemberTableHeader({
  showCheckboxSlot,
  isAllSelected,
  isIndeterminate,
  onToggleSelectAll,
}: {
  showCheckboxSlot: boolean;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  onToggleSelectAll: () => void;
}) {
  return (
    <div
      className="hidden md:flex items-center justify-between gap-4 border-b border-[#E2E2DF]/60 text-[12px] font-normal uppercase tracking-wider text-[#78716C] select-none pb-2.5 mb-1 px-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {showCheckboxSlot ? (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isAllSelected}
              indeterminate={isIndeterminate}
              onCheckedChange={onToggleSelectAll}
              aria-label="全选当前可见成员"
              className="size-3.5 rounded-md border-[#E2E2DF]"
              title="全选当前可见成员"
            />
          </div>
        ) : null}
        <span>成员姓名 / 邮箱</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-6 text-right">
        <span className="w-24 sm:w-28 text-left shrink-0">所属团队</span>
        <span className="w-20 sm:w-24 text-center shrink-0">系统角色</span>
        <span className="w-20 sm:w-24 text-left shrink-0 hidden sm:inline">数据范围</span>
        <span className="w-28 text-left shrink-0 hidden lg:inline">上次登录</span>
        <span className="w-10 sm:w-12 text-right shrink-0">操作</span>
      </div>
    </div>
  );
}

export function MemberTable({
  sortedProfiles,
  memberView,
  canManageMembers,
  isCompanyOwner,
  currentUserId,
  activeMemberId,
  restoredFocusId,
  selectedMemberIds,
  isAllSelected,
  isIndeterminate,
  handleToggleSelectAll,
  setSelectedMemberIds,
  openMemberDrawer,
  canArchiveTarget,
  setRestoreTarget,
  isPending,
}: {
  sortedProfiles: ProfileSummary[];
  memberView: "active" | "archived";
  canManageMembers: boolean;
  isCompanyOwner: boolean;
  currentUserId: string;
  activeMemberId: string | null;
  restoredFocusId: string | null;
  selectedMemberIds: string[];
  isAllSelected: boolean;
  isIndeterminate: boolean;
  handleToggleSelectAll: () => void;
  setSelectedMemberIds: Dispatch<SetStateAction<string[]>>;
  openMemberDrawer: (member: ProfileSummary) => void;
  canArchiveTarget: (member: ProfileSummary) => boolean;
  setRestoreTarget: Dispatch<SetStateAction<ProfileSummary | null>>;
  isPending: boolean;
}) {
  return (
    <>
      {/* ── 主控制台与高密度成员列表（标准 1 层 L1 白底微岛屿） ── */}
        <Card className=" p-5 gap-0">
          {/* 成员双列平铺列表 */}
          {sortedProfiles.length === 0 ? (
            <EmptyState
              variant="compact"
              className="py-12"
              title="没有找到成员"
              description="调整筛选或搜索条件试试"
            />
          ) : (
            <div className="space-y-0.5">
              <MemberTableHeader
                showCheckboxSlot={canManageMembers && memberView !== "archived"}
                isAllSelected={isAllSelected}
                isIndeterminate={isIndeterminate}
                onToggleSelectAll={handleToggleSelectAll}
              />
              <div className="divide-y divide-[#E2E2DF]/60">
                {sortedProfiles.map((member) => {
                  const isArchivedView = memberView === "archived";
                  const isCurrentMemberActive = activeMemberId === member.id;
                  const isRestoredFocus = restoredFocusId === member.id;
                  const isChecked = selectedMemberIds.includes(member.id);
                  const memberCompanyRole = resolveProfileCompanyRoleForView(member);
                  const memberRuntimeRole = runtimeRoleForView(memberCompanyRole);

                  return (
                    <div
                      key={member.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-xl px-3 py-2.5 min-h-[46px] transition-colors duration-150 select-none",
                        isRestoredFocus
                          ? "bg-[#F1F1F0] transition-colors duration-500"
                          : isChecked
                          ? "bg-[#FCFCFB]"
                          : isCurrentMemberActive
                          ? "bg-[#FCFCFB]"
                          : "bg-transparent hover:bg-[#F7F7F6]"
                      )}
                    >
                      {canManageMembers && !isArchivedView ? (
                        !isMemberTargetReadOnly(member, currentUserId) ? (
                          <Checkbox
                            aria-label={`选择「${member.name}」`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedMemberIds((prev) => Array.from(new Set([...prev, member.id])));
                              else setSelectedMemberIds((prev) => prev.filter((id) => id !== member.id));
                            }}
                            className={cn(
                              "size-3.5 shrink-0 rounded-md border-[#E2E2DF] transition-opacity",
                              isChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
                            )}
                          />
                        ) : <span className="size-3.5 shrink-0" />
                      ) : null}

                      <button
                        type="button"
                        onClick={() => openMemberDrawer(member)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 rounded-md"
                        aria-label={`打开「${member.name}」${isArchivedView ? "归档档案" : "成员详情"}`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                          <span className="size-7 rounded-full bg-[#F1F1F0] text-[#1F1E1D] flex items-center justify-center font-normal text-[12px] shrink-0 border border-[#E2E2DF]/60">
                            {member.name ? member.name.slice(0, 1) : "U"}
                          </span>
                          <span className="flex min-w-0 flex-col justify-center">
                            <span className="flex min-w-0 items-center gap-1 sm:gap-2">
                              <span className="truncate text-[14px] font-normal text-[#141413]">{member.name}</span>
                              {member.id === currentUserId && <span className="shrink-0 rounded-md bg-[#F1F1F0] px-1.5 text-[12px] font-normal text-[#78716C]">我</span>}
                              {isArchivedView && <span className="shrink-0 rounded-md bg-[#F1F1F0] px-1.5 text-[12px] text-[#78716C]">已归档</span>}
                              {isCompanyOwner && !isArchivedView && member.exempt_type === "permanent" && (
                                <span className="shrink-0 rounded-md bg-[#F1F1F0] px-1.5 text-[12px] font-normal text-[#78716C]">
                                  不参与考核
                                </span>
                              )}
                            </span>
                            {member.email && <span className="mt-0.5 truncate text-[12px] leading-tight text-[#78716C]">{member.email}</span>}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-2 sm:gap-6">
                        {/* 所属团队 */}
                        <span className="w-20 sm:w-28 text-left shrink-0">
                          <span className="text-[13px] text-[#1F1E1D] truncate block" title={member.team_name || "未分配团队"}>
                            {member.team_name || <span className="text-[#A8A29E]">未分配</span>}
                          </span>
                        </span>

                        {/* 角色 */}
                        <span className="w-18 sm:w-24 text-center shrink-0">
                          <span className={cn(
                            "text-[12px] px-1.5 sm:px-2 py-0.5 rounded-md font-normal inline-block",
                            memberCompanyRole === "company_owner"
                              ? "bg-[#D97757]/10 text-[#D97757]"
                              : memberCompanyRole === "admin"
                              ? "bg-status-info/10 text-status-info"
                              : "bg-[#F1F1F0] text-[#78716C]"
                          )}>
                            {getRoleLabel(memberRuntimeRole, { membershipStatus: member.membership_status })}
                          </span>
                        </span>

                        {/* 数据范围：小屏下沉入抽屉，sm+ 显示 */}
                        <span className="w-20 sm:w-24 text-left shrink-0 hidden sm:block">
                          <span className="text-[12px] sm:text-[13px] text-[#78716C]">
                            {formatDataScope(
                              (member.archive_snapshot?.data_scope as DataScope | undefined) ?? member.data_scope,
                            )}
                          </span>
                        </span>

                        {/* 上次登录：lg+ 显示 */}
                        <span className="w-28 text-left shrink-0 hidden lg:block">
                          <span className="text-[12px] text-[#78716C] tabular-nums">
                            {member.last_sign_in_at ? member.last_sign_in_at.slice(0, 10) : "—"}
                          </span>
                        </span>
                        {!isArchivedView && <span className="w-10 sm:w-12 shrink-0 text-right text-[12px] font-normal text-[#D97757] opacity-70 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">管理</span>}
                        </span>
                      </button>
                      {isArchivedView && canArchiveTarget(member) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRestoreTarget(member)}
                          disabled={isPending}
                          className="h-7 px-2 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
                          title="恢复账号"
                        >
                          <RotateCcw className="size-3 mr-1" />恢复
                        </Button>
                      ) : isArchivedView ? <span className="w-10 sm:w-12 shrink-0" /> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
    </>
  );
}
