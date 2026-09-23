"use client";

import { useState, useTransition, useMemo, useEffect, useId, useRef } from "react";
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
  ChevronDown,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { WorkGroupKindBadge } from "./work-group-list-tab";
import {
  describeBatchAssignFeedback,
  describeCandidateAssignment,
  summarizeMemberNames,
  WorkGroupRuleHint,
} from "./work-group-membership-copy";
import { rollbackWorkGroupSlots, snapshotWorkGroupSlots } from "@/lib/work-groups";
import {
  createWorkGroupAction,
  renameWorkGroupAction,
  deleteWorkGroupAction,
  assignWorkGroupMembersAction,
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
  /** 操作人所属公司 team_id：新建小队的乐观占位要靠它，拿不到就不做占位（不伪造归属）。 */
  teamId?: string | null;
  initialSelectedGroupId?: string | null;
  onGroupsChange?: (nextGroups: WorkGroupRow[]) => void;
  onRosterChange?: (nextRoster: WorkGroupRosterMember[]) => void;
}

interface MemberMultiSelectProps {
  candidates: WorkGroupRosterMember[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  groupMap: Map<string, WorkGroupRow>;
  activeGroupKind: WorkGroupKind;
  disabled?: boolean;
}

function MemberMultiSelect({
  candidates,
  selectedUserIds,
  onChange,
  groupMap,
  activeGroupKind,
  disabled,
}: MemberMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((m) => (m.name || "未命名").toLowerCase().includes(q));
  }, [candidates, query]);

  const toggleUser = (id: string) => {
    if (selectedUserIds.includes(id)) {
      onChange(selectedUserIds.filter((item) => item !== id));
    } else {
      onChange([...selectedUserIds, id]);
    }
  };

  const handleSelectAll = () => {
    const allFilteredIds = filtered.map((m) => m.id);
    const combined = Array.from(new Set([...selectedUserIds, ...allFilteredIds]));
    onChange(combined);
  };

  // 与「全选」对称：只作用于当前筛选结果，筛选外的已选保留
  const handleClearAll = () => {
    const filteredIds = new Set(filtered.map((m) => m.id));
    onChange(selectedUserIds.filter((id) => !filteredIds.has(id)));
  };

  const selectedNames = useMemo(() => {
    return selectedUserIds
      .map((id) => candidates.find((m) => m.id === id)?.name || "未命名")
      .filter(Boolean);
  }, [selectedUserIds, candidates]);

  return (
    <div ref={containerRef} className="flex-1">
      {/* 触发控件：遵循 Claude 纯白浮起规范 */}
      <button
        type="button"
        disabled={disabled || candidates.length === 0}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? panelId : undefined}
        className={cn(
          "w-full h-8 px-2.5 text-[13px] bg-white border border-[#E2E2DF] rounded-md shadow-input flex items-center justify-between gap-2 text-left hover:bg-[#F7F7F6] focus:outline-none focus:ring-1 focus:ring-[#D97757] transition-all cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed",
          isOpen && "ring-1 ring-[#D97757] border-[#D97757]",
        )}
      >
        {candidates.length === 0 ? (
          <span className="text-[#78716C] truncate">无可分配成员</span>
        ) : selectedUserIds.length === 0 ? (
          <span className="text-[#78716C] truncate">选择公司成员...</span>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <span className="font-medium shrink-0 text-[11px] bg-[#FAF4E8] text-[#8A6A2F] border border-[#8A6A2F]/20 px-1.5 py-0.5 rounded">
              已选 {selectedUserIds.length} 人
            </span>
            <span className="text-[12px] text-[#78716C] truncate">
              {selectedNames.slice(0, 2).join("、")}
              {selectedNames.length > 2 ? ` 等${selectedNames.length}人` : ""}
            </span>
          </div>
        )}
        <ChevronDown
          className={cn(
            "size-3.5 text-[#78716C] shrink-0 transition-transform duration-200",
            isOpen && "rotate-180 text-[#D97757]",
          )}
        />
      </button>

      {/* 下拉面板：走文档流展开，不被 SheetBody 的 overflow 裁剪（浮层定位会被滚动容器截断） */}
      {isOpen && (
        <div
          id={panelId}
          role="listbox"
          aria-multiselectable="true"
          aria-label="可分配成员"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            // 只关浮层，不让 Esc 冒泡到 Sheet 把整个抽屉关掉
            e.stopPropagation();
            setIsOpen(false);
          }}
          className="mt-1.5 w-full bg-white border border-[#E2E2DF] rounded-xl shadow-claude-float overflow-hidden flex flex-col max-h-72 ring-1 ring-[#1C1917]/5 animate-in fade-in-0 zoom-in-95 duration-100"
        >
          {/* 搜索框与全选清空操作 */}
          <div className="p-2 border-b border-[#E2E2DF]/60 bg-[#FCFCFB] flex items-center justify-between gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="size-3.5 text-[#78716C] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索成员姓名..."
                aria-label="搜索成员姓名"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                className="w-full h-7 pl-7 pr-6 text-[12px] bg-white border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#D97757] text-[#292524] placeholder:text-[#A8A29E]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] p-0.5 cursor-pointer"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] shrink-0 pr-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-1.5 py-0.5 text-[#D97757] hover:underline font-medium cursor-pointer"
              >
                全选结果
              </button>
              <span className="text-[#E2E2DF]">|</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="px-1.5 py-0.5 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
              >
                清空结果
              </button>
            </div>
          </div>

          {/* 成员列表 */}
          <div className="overflow-y-auto p-1 divide-y divide-[#E2E2DF]/30 flex-1">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[#78716C]">
                {candidates.length === 0 ? "无可分配成员" : "未找到匹配成员"}
              </div>
            ) : (
              filtered.map((m) => {
                const isChecked = selectedUserIds.includes(m.id);
                const peerGroup = m.peerGroupId ? groupMap.get(m.peerGroupId) : null;
                const opGroup = m.operatorGroupId ? groupMap.get(m.operatorGroupId) : null;
                const hint = describeCandidateAssignment({
                  kind: activeGroupKind,
                  peerGroupName: peerGroup?.name,
                  operatorGroupName: opGroup?.name,
                });

                return (
                  <div
                    key={m.id}
                    role="option"
                    aria-selected={isChecked}
                    onClick={() => toggleUser(m.id)}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-[13px]",
                      isChecked ? "bg-[#FAF4E8]/60" : "hover:bg-[#F7F7F6]",
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleUser(m.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="font-medium text-[#1C1917]">{m.name || "未命名"}</span>
                    {hint && (
                      <span className="text-[11px] text-[#78716C] ml-auto truncate max-w-[200px]">
                        {hint}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 工种小队编制管理抽屉。
 *
 * - 外壳走共享 ui/sheet.tsx（@base-ui/react/dialog）：Esc 关闭、role="dialog"、
 *   焦点陷阱与背景滚动锁定都由组件库提供。
 * - 删除确认就地切换到该小队卡片内部，不叠第二层遮罩。
 * - 全流程静默更新：分配、移出、新建、改名、删除均采用乐观更新，无需刷新整页。
 */
export function WorkGroupManageDrawer({
  open,
  onClose,
  groups,
  roster,
  teamId = null,
  initialSelectedGroupId = null,
  onGroupsChange,
  onRosterChange,
}: WorkGroupManageDrawerProps) {
  const [localGroups, setLocalGroups] = useState<WorkGroupRow[]>(groups);
  const [localRoster, setLocalRoster] = useState<WorkGroupRosterMember[]>(roster);

  // 乐观更新要读「此刻最新」的列表，而不是本次渲染闭包里的旧值：
  // 否则请求回来时按渲染期快照回滚，会把期间发生的其他变更一起抹掉（B2）。
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

  const memberNameOf = (userId: string) =>
    rosterRef.current.find((member) => member.id === userId)?.name || "未命名";

  const [isPending, startTransition] = useTransition();

  // 选中小队进行成员调配（null 时在小队列表）
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

  // 添加组员多选选择状态
  const [selectedUserIdsToAdd, setSelectedUserIdsToAdd] = useState<string[]>([]);

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

  // 可分配给当前小队的候选成员
  const candidateMembers = useMemo(() => {
    if (!activeGroup) return [];
    // 排除已经在当前组的成员
    return localRoster.filter((m) => {
      if (activeGroup.kind === "operator") {
        return m.operatorGroupId !== activeGroup.id;
      }
      return m.peerGroupId !== activeGroup.id;
    });
  }, [activeGroup, localRoster]);

  // 关闭时收起未完成的破坏性确认，避免下次打开残留「待删」状态
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    setConfirmingDeleteId(null);
    onClose();
  };

  // 1. 新建小队（乐观更新）
  const handleCreateGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      toast.error("请输入小队名称");
      return;
    }

    // 乐观占位只在知道本公司 team_id 时插入，拿不到就等服务端返回（不留空串、不伪造归属）
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

  // 4. 批量分配组员（乐观更新）
  const handleBatchAssignMembers = () => {
    if (!activeGroup || selectedUserIdsToAdd.length === 0) return;
    const { id: groupId, kind, name: groupName } = activeGroup;
    const targetUserIds = [...selectedUserIdsToAdd];
    const slotSnapshot = snapshotWorkGroupSlots(rosterRef.current, targetUserIds);

    // 乐观移入当前组编制池
    commitRoster(
      rosterRef.current.map((m) => {
        if (!targetUserIds.includes(m.id)) return m;
        if (kind === "operator") {
          return { ...m, operatorGroupId: groupId };
        }
        return { ...m, peerGroupId: groupId };
      }),
    );
    setSelectedUserIdsToAdd([]);

    startTransition(async () => {
      const res = await assignWorkGroupMembersAction({ groupId, userIds: targetUserIds });
      if (!res.ok) {
        // 全员失败：整批还原
        commitRoster(rollbackWorkGroupSlots(rosterRef.current, slotSnapshot));
        toast.error(res.message || "分配组员失败");
        return;
      }

      const { details, failures } = res.value;

      // 部分成功：只还原失败的人，成功的人保留乐观结果（服务端已真的写入）
      if (failures.length > 0) {
        commitRoster(
          rollbackWorkGroupSlots(
            rosterRef.current,
            slotSnapshot,
            new Set(failures.map((failure) => failure.userId)),
          ),
        );
        toast.error(`【${summarizeMemberNames(failures.map((f) => memberNameOf(f.userId)))}】分配失败，已还原`);
      }

      const assigned = details
        .filter((detail) => detail.changed)
        .map((detail) => ({
          name: memberNameOf(detail.userId),
          replacedGroupName: detail.replacedGroupName,
        }));
      const feedback = describeBatchAssignFeedback({ groupName, assigned });
      if (feedback) toast.success(feedback);
    });
  };

  // 5. 移出组员（乐观更新）
  const handleUnassignMember = (userId: string, memberName: string | null) => {
    if (!activeGroup) return;
    const { id: groupId, kind } = activeGroup;
    const slotSnapshot = snapshotWorkGroupSlots(rosterRef.current, [userId]);

    // 乐观移出编制池
    commitRoster(
      rosterRef.current.map((m) => {
        if (m.id !== userId) return m;
        if (kind === "operator") {
          return { ...m, operatorGroupId: null };
        }
        return { ...m, peerGroupId: null };
      }),
    );

    startTransition(async () => {
      const res = await unassignWorkGroupMemberAction({ groupId, userId });
      if (!res.ok) {
        commitRoster(rollbackWorkGroupSlots(rosterRef.current, slotSnapshot));
        toast.error(res.message || "移出组员失败");
        return;
      }
      toast.success(`已将【${memberName || "成员"}】移出当前小队`);
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-xl gap-0 border-l border-[#E2E2DF] bg-white"
      >
        {/* 抽屉头部 */}
        <SheetHeader className="flex-row items-center justify-between gap-2 bg-[#FCFCFB] px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-[16px] leading-normal font-medium text-[#1C1917]">
                {activeGroup ? `小队成员管理 · ${activeGroup.name}` : "工种小队管理"}
              </SheetTitle>
              {activeGroup && <WorkGroupKindBadge kind={activeGroup.kind} />}
            </div>
            <SheetDescription className="mt-0.5 text-[12px] text-[#78716C]">
              {activeGroup
                ? `分配与调整本组成员名单（现有 ${activeGroupMembers.length} 人）`
                : "创建与维护文案、达人、运营小队，分配成员归属"}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            aria-label="关闭"
            className="size-7 shrink-0 rounded flex items-center justify-center text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </SheetHeader>

        {/* 抽屉内容区 */}
        <SheetBody className="space-y-6 pt-6 pb-[calc(2rem+var(--app-bottom-nav-height,0px)+env(safe-area-inset-bottom,0px))] md:pb-6">
          {/* A. 详情视图：某小队的组员名单与调配 */}
          {activeGroup ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(null);
                    setSelectedUserIdsToAdd([]);
                  }}
                  className="text-[13px] text-[#78716C] hover:text-[#1C1917] underline cursor-pointer"
                >
                  ← 返回小队列表
                </button>
                <span className="text-[13px] text-[#78716C]">
                  现有成员 ({activeGroupMembers.length} 人)
                </span>
              </div>

              {/* 添加组员控制条：多选批量加入 */}
              <div className="p-4 rounded-xl bg-[#F7F7F6] border border-[#E2E2DF]/70 space-y-3">
                <h4 className="text-[13px] font-medium text-[#1C1917] flex items-center gap-1.5">
                  <UserPlus className="size-3.5 text-[#D97757]" />
                  分配新组员至本组
                </h4>
                <div className="flex items-start gap-2">
                  <MemberMultiSelect
                    candidates={candidateMembers}
                    selectedUserIds={selectedUserIdsToAdd}
                    onChange={setSelectedUserIdsToAdd}
                    groupMap={groupMap}
                    activeGroupKind={activeGroup.kind}
                    disabled={isPending}
                  />
                  <button
                    type="button"
                    disabled={selectedUserIdsToAdd.length === 0 || isPending}
                    onClick={handleBatchAssignMembers}
                    className="h-8 px-3.5 bg-[#D97757] hover:bg-[#C46A4D] disabled:opacity-50 text-white text-[13px] font-medium rounded-md shadow-2xs transition-all duration-150 cursor-pointer active:scale-[0.99] flex items-center gap-1 shrink-0"
                  >
                    {isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="size-3.5" />
                        {selectedUserIdsToAdd.length > 1
                          ? `加入小队 (${selectedUserIdsToAdd.length})`
                          : "加入小队"}
                      </>
                    )}
                  </button>
                </div>

                {/* 互斥规则说明 */}
                <WorkGroupRuleHint kind={activeGroup.kind} />
              </div>

              {/* 现有成员列表 */}
              <div className="space-y-2">
                <h4 className="text-[13px] font-medium text-[#1C1917]">当前小队成员</h4>
                {activeGroupMembers.length === 0 ? (
                  <div className="py-8 text-center text-[13px] text-[#78716C] bg-white rounded-lg border border-dashed border-[#E2E2DF]">
                    暂无组员，请在上方勾选成员并加入
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
                    <h4 className="text-[14px] font-medium text-[#1C1917]">新建工种小队</h4>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="text-[12px] text-[#78716C] hover:text-[#1C1917] cursor-pointer"
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
                        className="w-full h-8 px-2.5 text-[13px] bg-white border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#D97757] text-[#292524] placeholder:text-[#A8A29E]"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-[#78716C] block mb-1">工种类型</label>
                      <Select
                        value={newGroupKind}
                        onValueChange={(val) => setNewGroupKind(val as WorkGroupKind)}
                      >
                        <SelectTrigger className="w-full h-8 px-2.5 text-[13px] bg-white border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#D97757] text-[#292524]">
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
                    <button
                      type="button"
                      disabled={isPending || !newGroupName.trim()}
                      onClick={handleCreateGroup}
                      className="h-8 px-4 bg-[#D97757] hover:bg-[#C46A4D] disabled:opacity-50 text-white text-[13px] font-medium rounded-md shadow-2xs transition-all duration-150 cursor-pointer active:scale-[0.99] flex items-center gap-1.5"
                    >
                      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : "确认创建"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#1C1917]">
                    已创建小队 ({localGroups.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#D97757] hover:bg-[#C46A4D] text-white text-[13px] font-medium shadow-2xs transition-all duration-150 cursor-pointer active:scale-[0.99]"
                  >
                    <Plus className="size-3.5" />
                    新建小队
                  </button>
                </div>
              )}

              {/* 小队列表项 */}
              {localGroups.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-[#78716C] bg-white rounded-lg border border-dashed border-[#E2E2DF]">
                  暂无小队，请点击上方「新建小队」
                </div>
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
                          className="p-3.5 rounded-xl border border-[#E2E2DF]/80 bg-[#FAF4E8]/60 space-y-2.5"
                        >
                          <div className="flex items-start gap-3">
                            <div className="size-8 rounded-full bg-[#FAF4E8] text-[#8A6A2F] flex items-center justify-center shrink-0">
                              <AlertTriangle className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-[14px] font-medium text-[#1C1917]">
                                确认删除小队【{group.name}】？
                              </h4>
                              <p className="text-[13px] text-[#78716C] mt-1 leading-relaxed">
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
                              className="px-3 py-1.5 text-[13px] text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9] rounded-md transition-colors cursor-pointer"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleConfirmDelete(group)}
                              className="px-3.5 py-1.5 text-[13px] font-medium text-white bg-[#C0685C] hover:bg-[#a9574c] rounded-md transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                            >
                              {isPending ? <Loader2 className="size-3 animate-spin" /> : "确认删除"}
                            </button>
                          </div>
                        </div>
                      );
                    }

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
                                className="h-7 px-2 text-[13px] bg-[#F7F7F6] border border-[#E2E2DF] rounded-md focus:outline-none focus:ring-1 focus:ring-[#D97757] flex-1 text-[#292524]"
                              />
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleSaveRename(group.id)}
                                className="h-7 px-2.5 bg-[#D97757] text-white text-[12px] rounded-md cursor-pointer hover:bg-[#C46A4D]"
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
                              onClick={() => setConfirmingDeleteId(group.id)}
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
                            小队成员：{memberCount} 人
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGroupId(group.id);
                              setSelectedUserIdsToAdd([]);
                            }}
                            className="text-[#D97757] hover:underline font-medium cursor-pointer"
                          >
                            分配成员 →
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
