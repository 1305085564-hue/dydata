"use client";

import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { X, Plus, Trash2, Edit2, Users, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemHeading } from "@/components/ui/item-heading";
import { ListRow } from "@/components/ui/list-row";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { WorkGroupKindBadge } from "./work-group-list-tab";
import { rollbackWorkGroupSlots, snapshotWorkGroupSlots } from "@/lib/work-groups/slots";
import {
  createWorkGroupAction, renameWorkGroupAction, deleteWorkGroupAction,
} from "./work-group-actions";
import type { WorkGroupRow, WorkGroupKind, WorkGroupRosterMember } from "@/lib/collaboration/types";

interface WorkGroupManageDrawerProps {
  open: boolean;
  onClose: () => void;
  groups: WorkGroupRow[];
  roster: WorkGroupRosterMember[];
  /** 操作人所属公司 team_id：新建小队的乐观占位要靠它，拿不到就不做占位（不伪造归属）。 */
  teamId?: string | null;
  initialSelectedGroupId?: string | null;
  onGroupsChange?: (nextGroups: WorkGroupRow[]) => void;
  onRosterChange?: (nextRoster: WorkGroupRosterMember[]) => void;
}

/**
 * 工种小队编制管理抽屉。
 *
 * - 外壳走共享 ui/sheet.tsx（@base-ui/react/dialog）：Esc 关闭、role="dialog"、
 *   焦点陷阱与背景滚动锁定都由组件库提供。
 * - 删除确认就地切换到该小队卡片内部，不叠第二层遮罩。
 * - 成员归属调整统一由成员管理入口承接；抽屉内支持新建、改名、删除小队与只读查看成员。
 */
export function WorkGroupManageDrawer({
  open, onClose, groups, roster,
  teamId = null, initialSelectedGroupId = null, onGroupsChange, onRosterChange,
}: WorkGroupManageDrawerProps) {
  const [localGroups, setLocalGroups] = useState<WorkGroupRow[]>(groups);
  const [localRoster, setLocalRoster] = useState<WorkGroupRosterMember[]>(roster);

  // 乐观更新要读「此刻最新」的列表，而不是本次渲染闭包里的旧值；否则请求回来时按渲染期快照回滚，会把期间发生的其他变更一起抹掉（B2）。
  const groupsRef = useRef<WorkGroupRow[]>(groups);
  const rosterRef = useRef<WorkGroupRosterMember[]>(roster);

  useEffect(() => {
    groupsRef.current = groups;
    setLocalGroups(groups);
  }, [groups]);

  useEffect(() => {
    rosterRef.current = roster;
    setLocalRoster(roster);
  }, [roster]);

  const commitGroups = (next: WorkGroupRow[]) => {
    groupsRef.current = next;
    setLocalGroups(next);
    onGroupsChange?.(next);
  };

  const commitRoster = (next: WorkGroupRosterMember[]) => {
    rosterRef.current = next;
    setLocalRoster(next);
    onRosterChange?.(next);
  };

  // 乐观占位的临时 id：用自增计数而不是 Date.now()，避免渲染期调用不纯函数
  const optimisticIdRef = useRef(0);

  const [isPending, startTransition] = useTransition();

  // 选中小队查看成员名单（null 时在小队列表）
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(initialSelectedGroupId);

  // 当外部传入 initialSelectedGroupId 时响应
  useEffect(() => {
    setSelectedGroupId(initialSelectedGroupId);
  }, [initialSelectedGroupId]);

  // 新建小队表单
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupKind, setNewGroupKind] = useState<WorkGroupKind>("writer");

  // 重命名状态
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // 删除确认：就地切换该小队卡片，不叠遮罩
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const groupMap = useMemo(() => {
    return new Map(localGroups.map((g) => [g.id, g]));
  }, [localGroups]);

  const activeGroup = selectedGroupId ? groupMap.get(selectedGroupId) : null;

  // 当前小队的现有组员
  const activeGroupMembers = useMemo(() => {
    if (!activeGroup) return [];
    return localRoster.filter((m) =>
      activeGroup.kind === "operator"
        ? m.operatorGroupId === activeGroup.id
        : m.peerGroupId === activeGroup.id,
    );
  }, [activeGroup, localRoster]);

  // 脏状态判定：已在新建小队框中输入队名
  const isDirty = showCreateForm && newGroupName.trim().length > 0;

  const lastDirtyDismissAttemptRef = useRef(0);
  const [isShaking, setIsShaking] = useState(false);

  // 强制关闭：清空未提交的草稿并关闭抽屉
  const handleForceClose = () => {
    setConfirmingDeleteId(null);
    setShowCreateForm(false);
    setNewGroupName("");
    onClose();
  };

  // 遮罩点击 / Esc 触发时的守卫关闭：有草稿内容时拦截首发并给予防呆挽留提示
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    if (isDirty) {
      const now = Date.now();
      if (now - lastDirtyDismissAttemptRef.current < 2500) {
        // 2.5 秒内再次点击遮罩，确认放弃并关闭
        handleForceClose();
        return;
      }
      lastDirtyDismissAttemptRef.current = now;
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 300);
      toast.info("新建小队名称尚未提交", {
        description: "再次点击遮罩或点击右上角 ✕ 确认放弃并关闭",
      });
      return;
    }
    handleForceClose();
  };

  // 1. 新建小队（乐观更新）
  const handleCreateGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      toast.error("小队名称还没填");
      return;
    }

    // 乐观占位只在知道本团队 team_id 时插入，拿不到就等服务端返回（不留空串、不伪造归属）
    const ownTeamId =
      teamId ??
      groupsRef.current.find((g) => g.teamId)?.teamId ??
      rosterRef.current.find((m) => m.teamId)?.teamId ??
      null;
    const tempId = ownTeamId ? `temp-${(optimisticIdRef.current += 1)}` : null;

    if (tempId && ownTeamId) {
      const optimisticGroup: WorkGroupRow = {
        id: tempId,
        name: trimmed,
        kind: newGroupKind,
        teamId: ownTeamId,
        createdAt: new Date().toISOString(),
        createdBy: null,
      };
      commitGroups([...groupsRef.current, optimisticGroup]);
    }
    setNewGroupName("");
    setShowCreateForm(false);

    startTransition(async () => {
      const res = await createWorkGroupAction({ name: trimmed, kind: newGroupKind });
      if (!res.ok) {
        // 只撤掉本次这条占位，不动期间发生的其他变更
        if (tempId) commitGroups(groupsRef.current.filter((g) => g.id !== tempId));
        toast.error(res.message || "创建小队失败");
        return;
      }
      commitGroups(
        tempId
          ? groupsRef.current.map((g) => (g.id === tempId ? res.value : g))
          : [...groupsRef.current, res.value],
      );
      // 占位 id 换成真实 id 后，抽屉里若正选着这条，一并指过去，别停在已消失的 temp id 上
      if (tempId) setSelectedGroupId((prev) => (prev === tempId ? res.value.id : prev));
      toast.success(`已创建【${res.value.name}】`);
    });
  };

  // 2. 重命名小队（乐观更新）
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

    const previousName = groupsRef.current.find((g) => g.id === groupId)?.name ?? null;
    commitGroups(groupsRef.current.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)));
    setRenamingGroupId(null);

    startTransition(async () => {
      const res = await renameWorkGroupAction({ groupId, name: trimmed });
      if (!res.ok) {
        if (previousName !== null) {
          commitGroups(groupsRef.current.map((g) => (g.id === groupId ? { ...g, name: previousName } : g)));
        }
        toast.error(res.message || "重命名失败");
        return;
      }
      toast.success("已更新小队名称");
    });
  };

  // 3. 删除小队（乐观更新）
  const handleConfirmDelete = (target: WorkGroupRow) => {
    const previousIndex = groupsRef.current.findIndex((g) => g.id === target.id);
    const affectedUserIds = rosterRef.current
      .filter((m) => m.peerGroupId === target.id || m.operatorGroupId === target.id)
      .map((m) => m.id);
    const slotSnapshot = snapshotWorkGroupSlots(rosterRef.current, affectedUserIds);

    commitGroups(groupsRef.current.filter((g) => g.id !== target.id));
    commitRoster(
      rosterRef.current.map((m) => {
        let updated = false;
        let { peerGroupId, operatorGroupId } = m;
        if (peerGroupId === target.id) {
          peerGroupId = null;
          updated = true;
        }
        if (operatorGroupId === target.id) {
          operatorGroupId = null;
          updated = true;
        }
        return updated ? { ...m, peerGroupId, operatorGroupId } : m;
      }),
    );
    setConfirmingDeleteId(null);
    if (selectedGroupId === target.id) setSelectedGroupId(null);

    startTransition(async () => {
      const res = await deleteWorkGroupAction({ groupId: target.id });
      if (!res.ok) {
        // 放回原位（不是追加到末尾），并只还原被清空归属的那批成员
        const restoredGroups = [...groupsRef.current];
        restoredGroups.splice(
          previousIndex < 0 ? restoredGroups.length : Math.min(previousIndex, restoredGroups.length),
          0,
          target,
        );
        commitGroups(restoredGroups);
        commitRoster(rollbackWorkGroupSlots(rosterRef.current, slotSnapshot));
        if (selectedGroupId === target.id) setSelectedGroupId(target.id);
        toast.error(res.message || "删除小队失败");
        return;
      }
      toast.success(`已删除小队【${target.name}】`);
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          "w-full max-w-xl gap-0 border-l border-[#E2E2DF] bg-white transition-transform duration-150",
          isShaking && "animate-shake-horizontal",
        )}
      >
        {/* 抽屉头部 */}
        <SheetHeader>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SheetTitle>
                {activeGroup ? `小队成员管理 · ${activeGroup.name}` : "工种小队管理"}
              </SheetTitle>
              {activeGroup && <WorkGroupKindBadge kind={activeGroup.kind} />}
            </div>
            <SheetDescription className="mt-0.5 text-[12px] text-[#78716C]">
              {activeGroup
                ? `查看本组成员名单（现有 ${activeGroupMembers.length} 人）`
                : "创建与维护文案、达人、运营小队"}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={handleForceClose}
            aria-label="关闭"
            className="size-7 shrink-0 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </SheetHeader>

        {/* 抽屉内容区 */}
        <SheetBody className="space-y-6 pt-6 pb-[calc(2rem+var(--app-bottom-nav-height,0px)+env(safe-area-inset-bottom,0px))] md:pb-6">
          {/* A. 详情视图：某小队的组员名单（只读） */}
          {activeGroup ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(null)}
                  className="text-[14px] text-[#78716C] hover:text-[#141413] underline cursor-pointer"
                >
                  ← 返回小队列表
                </button>
                <span className="text-[14px] text-[#78716C]">
                  现有成员 ({activeGroupMembers.length} 人)
                </span>
              </div>

              <p className="text-[13px] text-[#78716C]">成员小队调整请到成员管理</p>

              <div className="space-y-2">
                <ItemHeading as="h4">当前小队成员</ItemHeading>
                {activeGroupMembers.length === 0 ? (
                  <EmptyState
                    variant="compact"
                    title="暂无组员"
                    description="成员小队调整请到成员管理"
                    className="py-6 bg-[#F1F1F0]"
                  />
                ) : (
                  <div className="divide-y divide-[#E2E2DF]/60 border border-[#E2E2DF] rounded-xl overflow-hidden bg-white">
                    {activeGroupMembers.map((member) => (
                      <ListRow
                        key={member.id}
                        className="py-2.5 px-3 hover:bg-[#F7F7F6] transition-colors border-b-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-normal text-[#141413]">
                            {member.name || "未命名"}
                          </span>
                          {activeGroup.kind === "operator" && member.peerGroupId && (
                            <span className="text-[12px] text-[#78716C]">
                              兼任 · 原组【{groupMap.get(member.peerGroupId)?.name ?? "工种小队"}】
                            </span>
                          )}
                        </div>
                      </ListRow>
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
                <div className="p-4 rounded-xl bg-[#F7F7F6] border border-[#E2E2DF]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <ItemHeading as="h4">新建工种小队</ItemHeading>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="text-[12px] text-[#78716C] hover:text-[#141413] cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[12px] text-[#78716C] block mb-1">小队名称</label>
                      <input
                        type="text"
                        placeholder="例如：文案一组"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        className="w-full h-7 px-2.5 text-[14px] bg-white border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#141413]/10 text-[#1F1E1D] placeholder:text-[#A8A29E]"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-[#78716C] block mb-1">工种类型</label>
                      <Select
                        value={newGroupKind}
                        onValueChange={(val) => setNewGroupKind(val as WorkGroupKind)}
                      >
                        <SelectTrigger className="w-full h-7 px-2.5 text-[14px] bg-white border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#141413]/10 text-[#1F1E1D]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="writer">文案岗位</SelectItem>
                          <SelectItem value="talent">达人岗位</SelectItem>
                          <SelectItem value="operator">运营岗位</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      disabled={isPending || !newGroupName.trim()}
                      onClick={handleCreateGroup}
                      className="px-4"
                    >
                      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : "确认创建"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-normal text-[#1F1E1D]">
                    已创建小队 ({localGroups.length})
                  </span>
                  <Button
                    size="sm"
                    onClick={() => setShowCreateForm(true)}
                  >
                    <Plus className="size-3.5" />
                    新建小队
                  </Button>
                </div>
              )}

              {/* 小队列表项 */}
              {localGroups.length === 0 ? (
                <EmptyState
                  variant="compact"
                  title="暂无小队"
                  description="点击上方「新建小队」，为团队创建工种小队"
                  className="py-8 bg-[#F1F1F0]"
                />
              ) : (
                <div className="space-y-2">
                  {localGroups.map((group) => {
                    const memberCount = localRoster.filter((m) =>
                      group.kind === "operator"
                        ? m.operatorGroupId === group.id
                        : m.peerGroupId === group.id,
                    ).length;

                    const isRenaming = renamingGroupId === group.id;
                    const isConfirmingDelete = confirmingDeleteId === group.id;

                    // 删除确认与该卡片就地切换，保持单层遮罩
                    if (isConfirmingDelete) {
                      return (
                        <div
                          key={group.id}
                          className="p-3.5 rounded-xl border border-status-warning/30 bg-status-warning/[0.08] space-y-2"
                        >
                          <div className="flex items-start gap-3">
                            <div className="size-8 rounded-full bg-status-warning/[0.12] text-status-warning flex items-center justify-center shrink-0">
                              <AlertTriangle className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <ItemHeading as="h4">
                                确认删除小队【{group.name}】？
                              </ItemHeading>
                              <p className="text-[14px] text-[#78716C] mt-1 leading-relaxed">
                                {memberCount > 0
                                  ? `删除后该小队将解散，组内 ${memberCount} 名成员将自动移入未分配池（保留成员账号与历史产出），历史统计与作品不受影响。`
                                  : "删除后该小队将解散，历史统计与作品不受影响。"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => setConfirmingDeleteId(null)}
                              className="px-3 py-1.5 text-[14px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] rounded-md transition-colors cursor-pointer"
                            >
                              取消
                            </button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={isPending}
                              onClick={() => handleConfirmDelete(group)}
                            >
                              {isPending ? <Loader2 className="size-3 animate-spin" /> : "确认删除"}
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={group.id}
                        className="p-3.5 rounded-xl border border-[#E2E2DF] bg-white shadow-card-ring flex flex-col gap-2 transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          {isRenaming ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleSaveRename(group.id);
                                  } else if (e.key === "Escape") {
                                    setRenamingGroupId(null);
                                  }
                                }}
                                autoFocus
                                className="h-7 px-2 text-[14px] bg-[#F7F7F6] border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#141413]/10 flex-1 text-[#1F1E1D]"
                              />
                              <Button
                                size="s"
                                disabled={isPending}
                                onClick={() => handleSaveRename(group.id)}
                              >
                                保存
                              </Button>
                              <Button
                                variant="ghost"
                                size="s"
                                onClick={() => setRenamingGroupId(null)}
                              >
                                取消
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span
                                className="text-[14px] font-normal text-[#141413] cursor-pointer hover:underline decoration-dashed decoration-[#78716C]/60 underline-offset-4"
                                onClick={() => handleStartRename(group)}
                                onDoubleClick={() => handleStartRename(group)}
                                title="点击修改小队名称"
                              >
                                {group.name}
                              </span>
                              <WorkGroupKindBadge kind={group.kind} />
                              <button
                                type="button"
                                onClick={() => handleStartRename(group)}
                                className="text-[#78716C] hover:text-[#141413] p-0.5 rounded-md cursor-pointer"
                                title="改名"
                              >
                                <Edit2 className="size-3" />
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteId(group.id)}
                              className="size-7 rounded-md flex items-center justify-center text-[#78716C] hover:text-status-danger hover:bg-status-danger/[0.08] transition-colors cursor-pointer"
                              title="删除小队"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[12px] text-[#78716C] pt-1 border-t border-[#E2E2DF]/60">
                          <span className="flex items-center gap-1">
                            <Users className="size-3.5" />
                            小队成员：{memberCount} 人
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedGroupId(group.id)}
                            className="text-[#D97757] hover:underline font-normal cursor-pointer"
                          >
                            查看成员 →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
