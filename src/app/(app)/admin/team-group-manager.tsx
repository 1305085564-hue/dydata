"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Save, UserMinus, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type {
  TeamManagementAccess,
  TeamManagementGroup,
  TeamManagementProfile,
  TeamManagementTeam,
} from "@/lib/team-management";
import { assignMembersToGroup, createGroup, removeMemberFromGroup, updateGroup } from "./actions";

interface TeamGroupManagerProps {
  access: TeamManagementAccess;
  teams: TeamManagementTeam[];
  groups: TeamManagementGroup[];
  profiles: TeamManagementProfile[];
  leaderCandidates: TeamManagementProfile[];
}

const NO_GROUP = "__direct__";

function getProfileName(profiles: TeamManagementProfile[], userId: string | null) {
  if (!userId) return "未设置";
  return profiles.find((profile) => profile.id === userId)?.name ?? "未知成员";
}

export function TeamGroupManager({
  access,
  teams,
  groups,
  profiles,
  leaderCandidates,
}: TeamGroupManagerProps) {
  const [localGroups, setLocalGroups] = useState(groups);
  const [localProfiles, setLocalProfiles] = useState(profiles);
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id ?? "");
  const teamGroups = useMemo(
    () =>
      localGroups
        .filter((group) => group.team_id === selectedTeamId)
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    [localGroups, selectedTeamId],
  );
  const [selectedGroupId, setSelectedGroupId] = useState(teamGroups[0]?.id ?? NO_GROUP);
  const effectiveSelectedGroupId = teamGroups.some((group) => group.id === selectedGroupId)
    ? selectedGroupId
    : teamGroups[0]?.id ?? NO_GROUP;
  const currentGroup = teamGroups.find((group) => group.id === effectiveSelectedGroupId) ?? null;
  const teamMembers = localProfiles.filter((profile) => profile.team_id === selectedTeamId);
  const groupMembers = useMemo(() => {
    if (!currentGroup) return [];
    const members = teamMembers.filter((profile) => profile.group_id === currentGroup.id);
    return members.sort((a, b) => {
      if (a.id === currentGroup.leader_user_id) return -1;
      if (b.id === currentGroup.leader_user_id) return 1;
      return a.name.localeCompare(b.name, "zh-CN");
    });
  }, [currentGroup, teamMembers]);
  const directMembers = teamMembers.filter((profile) => profile.role === "member" && !profile.group_id);
  const assignableMembers = teamMembers.filter((profile) => profile.role === "member");
  const unassignedMembers = useMemo(
    () => assignableMembers.filter((m) => !m.group_id),
    [assignableMembers],
  );
  const assignedMembers = useMemo(
    () => assignableMembers.filter((m) => m.group_id),
    [assignableMembers],
  );
  const currentLeaderCandidates = leaderCandidates.filter((profile) => profile.team_id === selectedTeamId);
  const [newGroupName, setNewGroupName] = useState("");
  const [newLeaderId, setNewLeaderId] = useState("");
  const [editGroupName, setEditGroupName] = useState(currentGroup?.name ?? "");
  const [editLeaderId, setEditLeaderId] = useState(currentGroup?.leader_user_id ?? "");
  const [checkedMemberIds, setCheckedMemberIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalGroups(groups);
  }, [groups]);

  useEffect(() => {
    setLocalProfiles(profiles);
  }, [profiles]);

  function changeTeam(teamId: string) {
    const nextGroups = localGroups
      .filter((group) => group.team_id === teamId)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    const nextGroup = nextGroups[0] ?? null;
    setSelectedTeamId(teamId);
    setSelectedGroupId(nextGroup?.id ?? NO_GROUP);
    setEditGroupName(nextGroup?.name ?? "");
    setEditLeaderId(nextGroup?.leader_user_id ?? "");
    setCheckedMemberIds([]);
    setNewLeaderId("");
    setNewGroupName("");
  }

  function changeGroup(groupId: string) {
    const group = localGroups.find((item) => item.id === groupId) ?? null;
    setSelectedGroupId(groupId);
    setEditGroupName(group?.name ?? "");
    setEditLeaderId(group?.leader_user_id ?? "");
    setCheckedMemberIds([]);
  }

  function handleTeamChange(teamId: string | null) {
    if (teamId) changeTeam(teamId);
  }

  function handleGroupChange(groupId: string | null) {
    if (groupId) changeGroup(groupId);
  }

  function handleNewLeaderChange(leaderId: string | null) {
    setNewLeaderId(leaderId ?? "");
  }

  function handleEditLeaderChange(leaderId: string | null) {
    setEditLeaderId(leaderId ?? "");
  }

  function toggleMember(memberId: string, checked: boolean) {
    setCheckedMemberIds((prev) =>
      checked ? Array.from(new Set([...prev, memberId])) : prev.filter((id) => id !== memberId),
    );
  }

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name || !newLeaderId) return;
    const previousGroups = localGroups;

    feedbackToast.success("已提交创建分组");

    startTransition(async () => {
      const result = await createGroup({
        teamId: selectedTeamId,
        name,
        leaderUserId: newLeaderId,
      });
      if (result.error) {
        feedbackToast.error(result.error);
        return;
      }

      if (!result.group) {
        setLocalGroups(previousGroups);
        feedbackToast.error("分组创建成功，但未拿到最新分组数据，请刷新后查看");
        return;
      }

      setLocalGroups((current) =>
        [...current, result.group!].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
      );
      setSelectedGroupId(result.group.id);
      setEditGroupName(result.group.name);
      setEditLeaderId(result.group.leader_user_id ?? "");

      setNewGroupName("");
      setNewLeaderId("");
    });
  }

  function handleUpdateGroup() {
    if (!currentGroup) return;
    const previousGroup = currentGroup;
    const nextName = editGroupName.trim();
    const nextLeaderId = editLeaderId;

    setLocalGroups((current) =>
      current.map((group) =>
        group.id === previousGroup.id
          ? { ...group, name: nextName, leader_user_id: nextLeaderId }
          : group,
      ),
    );
    feedbackToast.success("分组已更新");

    startTransition(async () => {
      const result = await updateGroup({
        groupId: previousGroup.id,
        name: nextName,
        leaderUserId: nextLeaderId,
      });
      if (result.error) {
        setLocalGroups((current) =>
          current.map((group) => (group.id === previousGroup.id ? previousGroup : group)),
        );
        setEditGroupName(previousGroup.name);
        setEditLeaderId(previousGroup.leader_user_id ?? "");
        feedbackToast.error(result.error);
        return;
      }
    });
  }

  function handleAssignMembers() {
    if (!currentGroup) return;
    const targetGroup = currentGroup;
    const memberIds = checkedMemberIds;
    const previousProfiles = localProfiles;

    setLocalProfiles((current) =>
      current.map((profile) =>
        memberIds.includes(profile.id) ? { ...profile, group_id: targetGroup.id } : profile,
      ),
    );
    setCheckedMemberIds([]);
    feedbackToast.success("组员已分配");

    startTransition(async () => {
      const result = await assignMembersToGroup({
        groupId: targetGroup.id,
        memberIds,
      });
      if (result.error) {
        setLocalProfiles(previousProfiles);
        setCheckedMemberIds(memberIds);
        feedbackToast.error(result.error);
        return;
      }
    });
  }

  function handleRemoveMember(memberId: string) {
    const previousProfiles = localProfiles;

    setLocalProfiles((current) =>
      current.map((profile) => (profile.id === memberId ? { ...profile, group_id: null } : profile)),
    );
    feedbackToast.success("已移回直管组员");

    startTransition(async () => {
      const result = await removeMemberFromGroup(memberId);
      if (result.error) {
        setLocalProfiles(previousProfiles);
        feedbackToast.error(result.error);
        return;
      }
    });
  }

  function getMemberGroupLabel(member: TeamManagementProfile) {
    if (!member.group_id) return "未分配";
    if (member.group_id === currentGroup?.id) return "当前组";
    const group = localGroups.find((g) => g.id === member.group_id);
    return group?.name ?? "未知分组";
  }

  const selectedTeamName = teams.find((t) => t.id === selectedTeamId)?.name;
  const selectedGroupName = teamGroups.find((g) => g.id === effectiveSelectedGroupId)?.name;
  const newLeaderName = currentLeaderCandidates.find((c) => c.id === newLeaderId)?.name;
  const editLeaderName = currentLeaderCandidates.find((c) => c.id === editLeaderId)?.name;

  if (!access.canView) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={selectedTeamId} onValueChange={handleTeamChange}>
            <SelectTrigger className="h-10 w-full bg-stone-50 border-transparent focus:bg-white focus:border-stone-500 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] sm:w-48">
              <SelectValue placeholder="选择团队">
                {selectedTeamName ?? undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={effectiveSelectedGroupId} onValueChange={handleGroupChange}>
            <SelectTrigger className="h-10 w-full bg-stone-50 border-transparent focus:bg-white focus:border-stone-500 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] sm:w-48">
              <SelectValue placeholder="选择分组">
                {selectedGroupName ?? (effectiveSelectedGroupId === NO_GROUP ? "暂无分组" : undefined)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {teamGroups.length > 0 ? (
                teamGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value={NO_GROUP}>暂无分组</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium text-stone-900">当前分组</div>
            <Badge
              className={
                access.canEditGroups
                  ? "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700"
                  : "bg-stone-50 text-stone-700 border border-stone-200 hover:bg-stone-50"
              }
            >
              {access.canEditGroups ? (
                <>
                  <span className="size-1.5 rounded-full bg-[#D97757]" aria-hidden />
                  可管理
                </>
              ) : "只读"}
            </Badge>
          </div>

          <div className="space-y-2">
            {teamGroups.length > 0 ? (
              teamGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => changeGroup(group.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition ${
                    selectedGroupId === group.id
                      ? "ring-1 ring-stone-950/10 border-stone-950 bg-stone-50"
                      : "border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300"
                  }`}
                >
                  <span>
                    <span className="block font-medium text-stone-900">{group.name}</span>
                    <span className="text-[12px] text-stone-500">
                      组长：{getProfileName(localProfiles, group.leader_user_id)}
                    </span>
                  </span>
                  <Badge className="border-stone-200 text-stone-700">
                    {teamMembers.filter((profile) => profile.group_id === group.id).length} 人
                  </Badge>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 text-[13px] text-stone-500">
                这个团队还没有分组。
              </div>
            )}
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-medium">
              <UsersRound className="size-4" />
              直管组员
            </div>
            <div className="flex flex-wrap gap-2">
              {directMembers.length > 0 ? (
                directMembers.map((member) => (
                  <Badge key={member.id} className="bg-stone-100 text-stone-700">
                    {member.name}
                  </Badge>
                ))
              ) : (
                <span className="text-[13px] text-stone-500">暂无直管组员</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4">
          {access.canEditGroups ? (
            <div className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-4 md:grid-cols-[1fr_180px_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="new-group-name">创建组</Label>
                <Input
                  id="new-group-name"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder="例如：第一组"
                  className="rounded-xl bg-stone-50 border-transparent focus:bg-white focus:border-stone-500 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label id="new-group-leader-label">组长</Label>
                <Select value={newLeaderId} onValueChange={handleNewLeaderChange}>
                  <SelectTrigger aria-labelledby="new-group-leader-label" className="h-10 w-full bg-stone-50 border-transparent focus:bg-white focus:border-stone-500 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]">
                    <SelectValue placeholder="选择组长">
                      {newLeaderName ?? undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {currentLeaderCandidates.length > 0 ? (
                      currentLeaderCandidates.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__no_leader_candidates__" disabled>
                        暂无可选组长
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="mt-auto h-10 bg-[#D97757] text-white rounded-lg hover:bg-[#C96442] active:translate-y-0"
                onClick={handleCreateGroup}
                disabled={isPending || !newGroupName.trim() || !newLeaderId}
              >
                <Plus className="size-4" />
                创建
              </Button>
            </div>
          ) : null}

          {currentGroup ? (
            <div className="space-y-4">
              {access.canEditGroups ? (
                <div className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-4 md:grid-cols-[1fr_180px_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-group-name">编辑组名</Label>
                    <Input
                      id="edit-group-name"
                      value={editGroupName}
                      onChange={(event) => setEditGroupName(event.target.value)}
                      className="rounded-xl bg-stone-50 border-transparent focus:bg-white focus:border-stone-500 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label id="edit-group-leader-label">更换组长</Label>
                    <Select value={editLeaderId} onValueChange={handleEditLeaderChange}>
                      <SelectTrigger aria-labelledby="edit-group-leader-label" className="h-10 w-full bg-stone-50 border-transparent focus:bg-white focus:border-stone-500 focus:shadow-sm focus:ring-1 focus:ring-stone-900/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]">
                        <SelectValue placeholder="选择组长">
                          {editLeaderName ?? undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {currentLeaderCandidates.length > 0 ? (
                          currentLeaderCandidates.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__no_edit_leader_candidates__" disabled>
                            暂无可选组长
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-auto h-10 rounded-xl border-stone-200"
                    onClick={handleUpdateGroup}
                    disabled={isPending}
                  >
                    <Save className="size-4" />
                    保存
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="mb-2 font-medium text-stone-900">组内成员</div>
                  <div className="space-y-2">
                    {groupMembers.length > 0 ? (
                      groupMembers.map((member) => (
                        <div
                          key={member.id}
                          className="group flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 hover:bg-stone-100 transition"
                        >
                          <span className="text-[13px]">{member.name}</span>
                          {access.canEditGroups && member.role === "member" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-stone-500 hover:text-[#C9604D] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto"
                              onClick={() => handleRemoveMember(member.id)}
                              disabled={isPending}
                            >
                              <UserMinus className="size-3.5" />
                              移除
                            </Button>
                          ) : (
                            <Badge className="border-stone-200 text-stone-700">
                              {member.role === "admin" ? "组长" : "组员"}
                            </Badge>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-[13px] text-stone-500">暂无组员。</p>
                    )}
                  </div>
                </div>

                {access.canEditGroups ? (
                  <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-medium text-stone-900">分配组员</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
 className="bg-white border-stone-300 text-stone-900 hover:bg-stone-50 active:translate-y-0 "
                        onClick={handleAssignMembers}
                        disabled={isPending || checkedMemberIds.length === 0}
                      >
                        分配选中
                      </Button>
                    </div>
                    <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
                      {/* 未分配成员 */}
                      {unassignedMembers.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[12px] font-normal text-stone-500">未分配</div>
                          {unassignedMembers.map((member) => (
                            <label
                              key={member.id}
                              className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 text-[13px] hover:bg-stone-100 transition"
                            >
                              <span className="flex items-center gap-2">
                                <Checkbox
                                  checked={checkedMemberIds.includes(member.id)}
                                  onCheckedChange={(checked) => toggleMember(member.id, checked === true)}
                                />
                                {member.name}
                              </span>
                              <Badge className="bg-stone-100 text-stone-700">未分配</Badge>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* 已分配成员 */}
                      {assignedMembers.length > 0 && (
                        <div className="space-y-2">
                          {unassignedMembers.length > 0 && (
                            <div className="border-t border-stone-200 pt-2">
                              <div className="text-[12px] font-normal text-stone-500">已分配</div>
                            </div>
                          )}
                          {assignedMembers.map((member) => (
                            <label
                              key={member.id}
                              className="flex cursor-pointer items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 text-[13px] hover:bg-stone-100 transition"
                            >
                              <span className="flex items-center gap-2">
                                <Checkbox
                                  checked={checkedMemberIds.includes(member.id)}
                                  onCheckedChange={(checked) => toggleMember(member.id, checked === true)}
                                />
                                {member.name}
                              </span>
                              <Badge className="bg-stone-100 text-stone-700">
                                {getMemberGroupLabel(member)}
                              </Badge>
                            </label>
                          ))}
                        </div>
                      )}

                      {unassignedMembers.length === 0 && assignedMembers.length === 0 && (
                        <p className="text-[13px] text-stone-500">无可分配成员。</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-[13px] text-stone-500">
              先创建或选择一个分组。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
