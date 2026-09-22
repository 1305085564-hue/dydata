"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Users,
  AlertTriangle,
  UserPlus,
  UserMinus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { WorkGroupKindBadge } from "./work-group-list-tab";
import { describeCandidateAssignment, WorkGroupRuleHint } from "./work-group-membership-copy";
import {
  createWorkGroupAction,
  renameWorkGroupAction,
  deleteWorkGroupAction,
  assignWorkGroupMemberAction,
  unassignWorkGroupMemberAction,
} from "./work-group-actions";
import type {
  WorkGroupRow,
  WorkGroupKind,
  WorkGroupRosterMember,
} from "./types";

interface WorkGroupManageDrawerProps {
  open: boolean;
  onClose: () => void;
  groups: WorkGroupRow[];
  roster: WorkGroupRosterMember[];
  initialSelectedGroupId?: string | null;
}

export function WorkGroupManageDrawer({
  open,
  onClose,
  groups,
  roster,
  initialSelectedGroupId = null,
}: WorkGroupManageDrawerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 选中小队进行成员调配（null 时在小队列表）
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialSelectedGroupId);

  // 新建小队表单
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupKind, setNewGroupKind] = useState<WorkGroupKind>("writer");

  // 重命名状态
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // 删除确认弹框状态
  const [deletingGroup, setDeletingGroup] = useState<WorkGroupRow | null>(null);

  // 添加组员选择状态
  const [selectedUserIdToAdd, setSelectedUserIdToAdd] = useState<string>("");

  const groupMap = useMemo(() => {
    return new Map(groups.map((g) => [g.id, g]));
  }, [groups]);

  const activeGroup = selectedGroupId ? groupMap.get(selectedGroupId) : null;

  // 当前小队的现有组员
  const activeGroupMembers = useMemo(() => {
    if (!activeGroup) return [];
    return roster.filter((m) =>
      activeGroup.kind === "operator"
        ? m.operatorGroupId === activeGroup.id
        : m.peerGroupId === activeGroup.id,
    );
  }, [activeGroup, roster]);

  // 可分配给当前小队的候选成员
  const candidateMembers = useMemo(() => {
    if (!activeGroup) return [];
    // 排除已经在当前组的成员
    return roster.filter((m) => {
      if (activeGroup.kind === "operator") {
        return m.operatorGroupId !== activeGroup.id;
      }
      return m.peerGroupId !== activeGroup.id;
    });
  }, [activeGroup, roster]);

  if (!open) return null;

  // 1. 新建小队
  const handleCreateGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      toast.error("请输入小队名称");
      return;
    }
    startTransition(async () => {
      const res = await createWorkGroupAction({ name: trimmed, kind: newGroupKind });
      if (!res.ok) {
        toast.error(res.message || "创建小队失败");
        return;
      }
      toast.success(`已创建【${res.value.name}】`);
      setNewGroupName("");
      setShowCreateForm(false);
      router.refresh();
    });
  };

  // 2. 重命名小队
  const handleStartRename = (group: WorkGroupRow) => {
    setRenamingGroupId(group.id);
    setRenameValue(group.name);
  };

  const handleSaveRename = (groupId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error("小队名称不能为空");
      return;
    }
    startTransition(async () => {
      const res = await renameWorkGroupAction({ groupId, name: trimmed });
      if (!res.ok) {
        toast.error(res.message || "重命名失败");
        return;
      }
      toast.success("已更新小队名称");
      setRenamingGroupId(null);
      router.refresh();
    });
  };

  // 3. 删除小队
  const handleConfirmDelete = () => {
    if (!deletingGroup) return;
    const g = deletingGroup;
    startTransition(async () => {
      const res = await deleteWorkGroupAction({ groupId: g.id });
      if (!res.ok) {
        toast.error(res.message || "删除小队失败");
        return;
      }
      toast.success(`已删除小队【${g.name}】`);
      setDeletingGroup(null);
      if (selectedGroupId === g.id) setSelectedGroupId(null);
      router.refresh();
    });
  };

  // 4. 分配组员
  const handleAssignMember = () => {
    if (!activeGroup || !selectedUserIdToAdd) return;
    startTransition(async () => {
      const res = await assignWorkGroupMemberAction({
        groupId: activeGroup.id,
        userId: selectedUserIdToAdd,
      });
      if (!res.ok) {
        toast.error(res.message || "分配组员失败");
        return;
      }
      toast.success(res.value.changed ? "组员分配成功" : "该成员已在当前小队中");
      setSelectedUserIdToAdd("");
      router.refresh();
    });
  };

  // 5. 移出组员
  const handleUnassignMember = (userId: string, memberName: string | null) => {
    if (!activeGroup) return;
    startTransition(async () => {
      const res = await unassignWorkGroupMemberAction({
        groupId: activeGroup.id,
        userId,
      });
      if (!res.ok) {
        toast.error(res.message || "移出组员失败");
        return;
      }
      toast.success(`已将【${memberName || "成员"}】移出当前小队`);
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#1C1917]/20 backdrop-blur-[1px] transition-opacity">
      <div className="w-full max-w-xl bg-white border-l border-[#E2E2DF] shadow-claude-dialog flex flex-col h-full animate-in slide-in-from-right duration-200">
        {/* 抽屉头部 */}
        <div className="px-6 py-4 border-b border-[#E2E2DF] flex items-center justify-between shrink-0 bg-[#FCFCFB]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-medium text-[#1C1917]">
                {activeGroup ? `管理小队 · ${activeGroup.name}` : "工种小队编制管理"}
              </h3>
              {activeGroup && <WorkGroupKindBadge kind={activeGroup.kind} />}
            </div>
            <p className="text-[12px] text-[#78716C] mt-0.5">
              {activeGroup
                ? "调配本组组员名单，系统自动校验岗位互斥与兼任规则"
                : "创建与维护文案、达人、运营小队，调配成员编制归属"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded flex items-center justify-center text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 抽屉内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
          {/* A. 详情视图：某小队的组员名单与调配 */}
          {activeGroup ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(null)}
                  className="text-[12.5px] text-[#78716C] hover:text-[#1C1917] underline cursor-pointer"
                >
                  ← 返回小队列表
                </button>
                <span className="text-[12.5px] text-[#78716C]">
                  现有成员 ({activeGroupMembers.length} 人)
                </span>
              </div>

              {/* 添加组员控制条 */}
              <div className="p-4 rounded-xl bg-[#F7F7F6] border border-[#E2E2DF]/70 space-y-3">
                <h4 className="text-[13px] font-medium text-[#1C1917] flex items-center gap-1.5">
                  <UserPlus className="size-3.5 text-[#D97757]" />
                  分配新组员至本组
                </h4>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedUserIdToAdd}
                    onChange={(e) => setSelectedUserIdToAdd(e.target.value)}
                    className="flex-1 h-8 px-2.5 text-[13px] bg-white border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#D97757] text-[#292524]"
                  >
                    <option value="">选择公司成员...</option>
                    {candidateMembers.map((m) => {
                      const peerGroup = m.peerGroupId ? groupMap.get(m.peerGroupId) : null;
                      const opGroup = m.operatorGroupId ? groupMap.get(m.operatorGroupId) : null;

                      const hint = describeCandidateAssignment({
                        kind: activeGroup.kind,
                        peerGroupName: peerGroup?.name,
                        operatorGroupName: opGroup?.name,
                      });

                      return (
                        <option key={m.id} value={m.id}>
                          {m.name || "未命名"} {hint}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedUserIdToAdd || isPending}
                    onClick={handleAssignMember}
                    className="h-8 px-3.5 bg-[#D97757] hover:bg-[#C46A4D] disabled:opacity-50 text-white text-[12.5px] font-medium rounded-md shadow-2xs transition-all duration-150 cursor-pointer active:scale-[0.99] flex items-center gap-1 shrink-0"
                  >
                    {isPending ? <Loader2 className="size-3.5 animate-spin" /> : "加入小队"}
                  </button>
                </div>

                {/* 互斥规则说明 */}
                <WorkGroupRuleHint kind={activeGroup.kind} />
              </div>

              {/* 现有成员列表 */}
              <div className="space-y-2">
                <h4 className="text-[13px] font-medium text-[#1C1917]">当前编制组员</h4>
                {activeGroupMembers.length === 0 ? (
                  <div className="py-8 text-center text-[13px] text-[#78716C] bg-white rounded-lg border border-dashed border-[#E2E2DF]">
                    暂无组员，请在上方选择成员添加
                  </div>
                ) : (
                  <div className="divide-y divide-[#E2E2DF]/60 border border-[#E2E2DF] rounded-lg overflow-hidden bg-white">
                    {activeGroupMembers.map((member) => (
                      <div
                        key={member.id}
                        className="py-2.5 px-3 flex items-center justify-between hover:bg-[#F7F7F6] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[#1C1917]">
                            {member.name || "未命名"}
                          </span>
                          {activeGroup.kind === "operator" && member.peerGroupId && (
                            <span className="text-[11px] text-[#78716C]">
                              兼任 · 原组【{groupMap.get(member.peerGroupId)?.name ?? "工种小队"}】
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleUnassignMember(member.id, member.name)}
                          className="inline-flex items-center gap-1 text-[12px] text-[#78716C] hover:text-[#C0685C] transition-colors cursor-pointer p-1 rounded"
                          title="移出当前小队"
                        >
                          <UserMinus className="size-3.5" />
                          移出
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            // B. 主视图：小队列表与新建
            <div className="space-y-6">
              {/* 新建小队区域 */}
              {showCreateForm ? (
                <div className="p-4 rounded-xl bg-[#F7F7F6] border border-[#E2E2DF]/70 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[13.5px] font-medium text-[#1C1917]">新建工种小队</h4>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="text-[12px] text-[#78716C] hover:text-[#1C1917]"
                    >
                      取消
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[12px] text-[#78716C] block mb-1">小队名称</label>
                      <input
                        type="text"
                        placeholder="例如：文案一组"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="w-full h-8 px-2.5 text-[13px] bg-white border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-[#78716C] block mb-1">工种类型</label>
                      <select
                        value={newGroupKind}
                        onChange={(e) => setNewGroupKind(e.target.value as WorkGroupKind)}
                        className="w-full h-8 px-2.5 text-[13px] bg-white border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                      >
                        <option value="writer">文案小队 (writer)</option>
                        <option value="talent">达人小队 (talent)</option>
                        <option value="operator">运营小队 (operator)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={isPending || !newGroupName.trim()}
                      onClick={handleCreateGroup}
                      className="h-8 px-4 bg-[#D97757] hover:bg-[#C46A4D] disabled:opacity-50 text-white text-[12.5px] font-medium rounded-md shadow-2xs transition-all duration-150 cursor-pointer active:scale-[0.99] flex items-center gap-1.5"
                    >
                      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : "确认创建"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#1C1917]">
                    已创建小队 ({groups.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] text-white text-[12.5px] font-medium shadow-2xs transition-all duration-150 cursor-pointer active:scale-[0.99]"
                  >
                    <Plus className="size-3.5" />
                    新建小队
                  </button>
                </div>
              )}

              {/* 小队列表项 */}
              {groups.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-[#78716C] bg-white rounded-lg border border-dashed border-[#E2E2DF]">
                  暂无小队，请点击上方「新建小队」
                </div>
              ) : (
                <div className="space-y-2">
                  {groups.map((group) => {
                    const memberCount = roster.filter((m) =>
                      group.kind === "operator"
                        ? m.operatorGroupId === group.id
                        : m.peerGroupId === group.id,
                    ).length;

                    const isRenaming = renamingGroupId === group.id;

                    return (
                      <div
                        key={group.id}
                        className="p-3.5 rounded-xl border border-[#E2E2DF] hover:border-[#E2E2DF] bg-white shadow-2xs flex flex-col gap-2.5 transition-all"
                      >
                        <div className="flex items-center justify-between gap-2">
                          {isRenaming ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="h-7 px-2 text-[13px] bg-[#F7F7F6] border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#D97757] flex-1"
                              />
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleSaveRename(group.id)}
                                className="h-7 px-2.5 bg-[#D97757] text-white text-[12px] rounded-md cursor-pointer"
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenamingGroupId(null)}
                                className="h-7 px-2 text-[12px] text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-medium text-[#1C1917]">
                                {group.name}
                              </span>
                              <WorkGroupKindBadge kind={group.kind} />
                              <button
                                type="button"
                                onClick={() => handleStartRename(group)}
                                className="text-[#78716C] hover:text-[#1C1917] p-0.5 rounded cursor-pointer"
                                title="改名"
                              >
                                <Edit2 className="size-3" />
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDeletingGroup(group)}
                              className="size-7 rounded flex items-center justify-center text-[#78716C] hover:text-[#C0685C] hover:bg-[#FAF4E8] transition-colors cursor-pointer"
                              title="删除小队"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[12px] text-[#78716C] pt-1 border-t border-[#E2E2DF]/60">
                          <span className="flex items-center gap-1">
                            <Users className="size-3.5" />
                            编制成员：{memberCount} 人
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedGroupId(group.id)}
                            className="text-[#D97757] hover:underline font-medium cursor-pointer"
                          >
                            调配组员 →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 删除二次确认弹层 */}
        {deletingGroup && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <div className="w-full max-w-sm bg-white rounded-xl shadow-claude-dialog p-5 space-y-4 border border-[#E2E2DF]">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-full bg-[#FAF4E8] text-[#8A6A2F] flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-4" />
                </div>
                <div>
                  <h4 className="text-[14.5px] font-medium text-[#1C1917]">
                    确认删除小队【{deletingGroup.name}】？
                  </h4>
                  <p className="text-[12.5px] text-[#78716C] mt-1 leading-relaxed">
                    删除后该小队将解散，其成员编制归属将被自动置空（保留成员账号）。历史统计数据不会受影响。
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setDeletingGroup(null)}
                  className="px-3 py-1.5 text-[12.5px] text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9] rounded-md transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleConfirmDelete}
                  className="px-3.5 py-1.5 text-[12.5px] font-medium text-white bg-[#C0685C] hover:bg-[#a9574c] rounded-md transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                >
                  {isPending ? <Loader2 className="size-3 animate-spin" /> : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
