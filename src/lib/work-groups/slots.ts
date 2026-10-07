import type { WorkGroupRosterMember } from "./rules";

/** 成员归属槽位快照（按 id 存），乐观更新失败时用它逐人还原。 */
export type WorkGroupSlotSnapshot = Map<
  string,
  { peerGroupId: string | null; operatorGroupId: string | null }
>;

export function snapshotWorkGroupSlots(
  roster: WorkGroupRosterMember[],
  userIds: string[],
): WorkGroupSlotSnapshot {
  const wanted = new Set(userIds);
  const snapshot: WorkGroupSlotSnapshot = new Map(); // gate:transient-map per-call rollback snapshot
  for (const member of roster) {
    if (!wanted.has(member.id)) continue;
    snapshot.set(member.id, {
      peerGroupId: member.peerGroupId,
      operatorGroupId: member.operatorGroupId,
    });
  }
  return snapshot;
}

/**
 * 乐观更新的回滚：只还原快照里记过的人（传 onlyUserIds 时再收窄到这些人），
 * 其他人保持当前值，不整表覆盖，避免把并发产生的其他变更一起盖掉。
 * 没有任何人需要还原时原样返回入参，省掉一次无意义的重渲染。
 */
export function rollbackWorkGroupSlots(
  roster: WorkGroupRosterMember[],
  snapshot: WorkGroupSlotSnapshot,
  onlyUserIds?: ReadonlySet<string>,
): WorkGroupRosterMember[] {
  let restored = false;
  const next = roster.map((member) => {
    if (onlyUserIds && !onlyUserIds.has(member.id)) return member;
    const previous = snapshot.get(member.id);
    if (!previous) return member;
    if (previous.peerGroupId === member.peerGroupId && previous.operatorGroupId === member.operatorGroupId) {
      return member;
    }
    restored = true;
    return { ...member, peerGroupId: previous.peerGroupId, operatorGroupId: previous.operatorGroupId };
  });
  return restored ? next : roster;
}
