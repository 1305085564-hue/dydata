import type { Dispatch, SetStateAction } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getRoleLabel } from "@/lib/role-label";
import { formatShanghaiDateOnly } from "@/lib/business-time";
import {
  UNASSIGNED_TEAM_ID,
  getArchivedTeamName,
  isMemberTargetReadOnly,
} from "@/lib/modules/domain/team-view-logic";
import { describeLastLogin, memberWorkGroupNames } from "@/lib/modules/domain/members-page-view";
import { archiveSnapshotRoleLabel, resolveProfileCompanyRoleForView, runtimeRoleForView } from "@/lib/modules/domain/view-rules";
import type { ProfileSummary } from "@/lib/modules/types";
import type { WorkGroupRow, WorkGroupRosterMember } from "@/lib/work-groups";
import { rowSelectionClass } from "@/components/ui/selection";
import { MemberAvatar, QuietChip, RoleChip } from "./member-identity";

function emptyTextFor(input: { memberView: "active" | "archived"; searchQuery: string; selectedTeamId: string }) {
  if (input.searchQuery.trim()) return `没找到「${input.searchQuery.trim()}」`;
  if (input.memberView === "archived") return "没有归档的成员";
  if (input.selectedTeamId === UNASSIGNED_TEAM_ID) return "所有人都分好团队了";
  return "这个团队还没有成员";
}

function formatArchivedAt(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : formatShanghaiDateOnly(date);
}

/**
 * 成员表：一列一件事。在职看「谁 · 哪个团队 · 哪个小队 · 什么身份 · 多久没来」；
 * 归档看「谁 · 原来在哪 · 原来什么身份 · 哪天归档 · 为什么」。点整行打开这个人。
 */
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
  workGroups,
  workGroupRoster,
  searchQuery,
  selectedTeamId,
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
  workGroups: WorkGroupRow[];
  workGroupRoster: WorkGroupRosterMember[];
  searchQuery: string;
  selectedTeamId: string;
}) {
  const isArchivedView = memberView === "archived";
  const showCheckbox = canManageMembers && !isArchivedView;

  if (sortedProfiles.length === 0) {
    return (
      <EmptyState
        variant="compact"
        className="py-12"
        title={emptyTextFor({ memberView, searchQuery, selectedTeamId })}
      />
    );
  }

  return (
    <Table aria-label={isArchivedView ? "归档成员" : "在职成员"}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {showCheckbox && (
            <TableHead className="w-10">
              <Checkbox
                checked={isAllSelected}
                indeterminate={isIndeterminate}
                onCheckedChange={handleToggleSelectAll}
                aria-label="全选当前可见成员"
                className="size-3.5 rounded-md border-[#E2E2DF]"
              />
            </TableHead>
          )}
          <TableHead>成员</TableHead>
          <TableHead>{isArchivedView ? "归档前团队" : "团队"}</TableHead>
          {!isArchivedView && <TableHead className="hidden md:table-cell">小队</TableHead>}
          <TableHead>{isArchivedView ? "归档前身份" : "身份"}</TableHead>
          {isArchivedView ? (
            <>
              <TableHead className="hidden sm:table-cell">归档日期</TableHead>
              <TableHead className="hidden lg:table-cell">原因</TableHead>
              <TableHead className="w-16"><span className="sr-only">操作</span></TableHead>
            </>
          ) : (
            <TableHead className="hidden sm:table-cell text-right">上次登录</TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedProfiles.map((member) => {
          const isChecked = selectedMemberIds.includes(member.id);
          const isHighlighted = isChecked || activeMemberId === member.id || restoredFocusId === member.id;
          const memberCompanyRole = resolveProfileCompanyRoleForView(member);
          const teamName = isArchivedView ? getArchivedTeamName(member) : member.team_name;
          const groups = isArchivedView ? [] : memberWorkGroupNames(member.id, workGroupRoster, workGroups);
          const login = describeLastLogin(member.last_sign_in_at);
          const isPermanentExempt = isCompanyOwner && !isArchivedView && member.exempt_type === "permanent";

          return (
            <TableRow
              key={member.id}
              onClick={() => openMemberDrawer(member)}
              aria-selected={isHighlighted}
              className={cn("cursor-pointer", rowSelectionClass(isHighlighted))}
            >
              {showCheckbox && (
                <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
                  {!isMemberTargetReadOnly(member, currentUserId) ? (
                    <Checkbox
                      aria-label={`选择「${member.name}」`}
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedMemberIds((prev) => Array.from(new Set([...prev, member.id])));
                        else setSelectedMemberIds((prev) => prev.filter((id) => id !== member.id));
                      }}
                      className="size-3.5 rounded-md border-[#E2E2DF]"
                    />
                  ) : null}
                </TableCell>
              )}
              <TableCell className="max-w-64">
                <span className="flex min-w-0 items-center gap-2">
                <MemberAvatar name={member.name} />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openMemberDrawer(member);
                  }}
                  aria-label={`打开「${member.name}」${isArchivedView ? "归档档案" : "成员详情"}`}
                  className="min-w-0 truncate rounded-md text-left text-[14px] text-[#141413] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10"
                >
                  {member.name || "未命名"}
                </button>
                {member.id === currentUserId && <QuietChip>我</QuietChip>}
                </span>
              </TableCell>
              <TableCell className="max-w-40 truncate">
                {teamName ? <span className="text-[#1F1E1D]">{teamName}</span> : <span className="text-[#A8A29E]">还没分团队</span>}
              </TableCell>
              {!isArchivedView && (
                <TableCell className="hidden md:table-cell max-w-56 truncate text-[#78716C]">
                  {groups.length > 0 ? groups.join("、") : <span className="text-[#A8A29E]">—</span>}
                </TableCell>
              )}
              <TableCell>
                <span className="flex items-center gap-1">
                  {isArchivedView ? (
                    <QuietChip>{archiveSnapshotRoleLabel(member.archive_snapshot)}</QuietChip>
                  ) : (
                    <RoleChip
                      role={memberCompanyRole}
                      label={getRoleLabel(runtimeRoleForView(memberCompanyRole), { membershipStatus: member.membership_status })}
                    />
                  )}
                  {isPermanentExempt && <QuietChip>不参与考核</QuietChip>}
                </span>
              </TableCell>
              {isArchivedView ? (
                <>
                  <TableCell className="hidden sm:table-cell text-[12px] text-[#1F1E1D] tabular-nums">
                    {formatArchivedAt(member.archived_at)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell max-w-64 truncate text-[#78716C]" title={member.archive_reason ?? undefined}>
                    {member.archive_reason || "—"}
                  </TableCell>
                  <TableCell className="w-16 text-right" onClick={(event) => event.stopPropagation()}>
                    {isArchivedView && canArchiveTarget(member) ? (
                      <button
                        type="button"
                        onClick={() => setRestoreTarget(member)}
                        disabled={isPending}
                        className="h-7 rounded-md px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] disabled:opacity-50"
                      >
                        恢复
                      </button>
                    ) : null}
                  </TableCell>
                </>
              ) : (
                <TableCell
                  className={cn(
                    "hidden sm:table-cell text-right text-[12px] tabular-nums",
                    login.stale ? "text-status-danger" : "text-[#1F1E1D]",
                  )}
                >
                  {login.text}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
