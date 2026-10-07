import type { Permissions } from "@/types";

export type WorkGroupKind = "writer" | "talent" | "operator";

export const WORK_GROUP_KINDS = ["writer", "talent", "operator"] as const;

export const WORK_GROUP_KIND_LABELS: Record<WorkGroupKind, string> = {
  writer: "文案",
  talent: "达人",
  operator: "运营",
};

/** 归属槽位：peer = 文案/达人（互斥），operator = 运营（可兼任，至多一个）。 */
export type WorkGroupSlot = "peer" | "operator";

export const WORK_GROUP_SLOT_COLUMNS = {
  peer: "work_peer_group_id",
  operator: "work_operator_group_id",
} as const satisfies Record<WorkGroupSlot, string>;

/** 小队名称长度上限：挡住会撑破表格与抽屉标题的极端输入。 */
export const WORK_GROUP_NAME_MAX_LENGTH = 40;
export const MAX_WORK_GROUP_BATCH_ASSIGN_USERS = 20;
export const WORK_GROUP_BATCH_LIMIT_ERROR_CODE = "WORK_GROUP_BATCH_LIMIT_EXCEEDED";

export type WorkGroupColumn = (typeof WORK_GROUP_SLOT_COLUMNS)[WorkGroupSlot];

/** 领域模型（camelCase）：对外与前端约定的形状。 */
export type WorkGroupRow = {
  id: string;
  teamId: string;
  name: string;
  kind: WorkGroupKind;
  createdAt: string | null;
  createdBy: string | null;
};

export type WorkGroupRosterMember = {
  id: string;
  name: string | null;
  teamId: string | null;
  peerGroupId: string | null;
  operatorGroupId: string | null;
};

export type WorkGroupDirectory = {
  /** false = 库还没跑 work_groups migration（应用先于数据库部署）；此时列表为空但不算失败。 */
  ready: boolean;
  groups: WorkGroupRow[];
  roster: WorkGroupRosterMember[];
};

export type WorkGroupFailure = {
  ok: false;
  status: number;
  message: string;
  code?: string;
  limit?: number;
  requestedCount?: number;
};
export type WorkGroupResult<T> = { ok: true; value: T } | WorkGroupFailure;

export type WorkGroupWriteGate =
  | { ok: true; teamId: string }
  | { ok: false; status: 403; message: string };

export type WorkGroupAssignmentPlan = {
  groupId: string;
  userId: string;
  slot: WorkGroupSlot;
  column: WorkGroupColumn;
  /** false = 已在该小队（幂等无操作，不写库、不写审计）。 */
  changed: boolean;
  /**
   * 该槽位原有归属 id（审计与回滚用）：
   * - 同组幂等：等于本组 id；
   * - 同槽位换组（自动替换，见 resolveWorkGroupAssignment）：等于被替换掉的原组 id；
   * - 空槽位新分配：null。
   */
  previousGroupId: string | null;
};

export type WorkGroupDbRow = {
  id: string;
  team_id: string;
  name: string;
  kind: string;
  created_at?: string | null;
  created_by?: string | null;
};

export type MemberDbRow = {
  id: string;
  team_id?: string | null;
  name?: string | null;
  work_peer_group_id?: string | null;
  work_operator_group_id?: string | null;
};


function failure(status: number, message: string): WorkGroupFailure {
  return { ok: false, status, message };
}

/**
 * 判「work_groups 相关列/表还不存在」。应用先于 migration 部署时，按团队视图降级为空态，
 * 而不是把整个数据管理页打挂；真正的查询故障仍然照常抛出。
 */
export function isWorkGroupSchemaMissing(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) return true;
  const message = error.message ?? "";
  const namesWorkGroupSchema = /work_groups|work_peer_group_id|work_operator_group_id/i.test(message);
  return namesWorkGroupSchema && /does not exist|could not find|schema cache/i.test(message);
}

export function isWorkGroupKind(value: unknown): value is WorkGroupKind {
  return typeof value === "string" && (WORK_GROUP_KINDS as readonly string[]).includes(value);
}

export function workGroupSlotForKind(kind: WorkGroupKind): WorkGroupSlot {
  return kind === "operator" ? "operator" : "peer";
}

export function mapWorkGroupRow(row: WorkGroupDbRow): WorkGroupRow | null {
  if (!isWorkGroupKind(row.kind)) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at ?? null,
    createdBy: row.created_by ?? null,
  };
}

/**
 * 写入门禁：`manage_members` + 必须有本公司 team_id。
 * 不使用 `canManageTeamStructure`（那是集团模式下 company_owner 专属，会把普通公司 admin 挡在外面）。
 */
export function resolveWorkGroupWriteGate(input: {
  permissions: Permissions | null | undefined;
  actorTeamId: string | null | undefined;
}): WorkGroupWriteGate {
  if (input.permissions?.manage_members !== true) {
    return { ok: false, status: 403, message: "无权限管理工种小队" };
  }
  const teamId = typeof input.actorTeamId === "string" ? input.actorTeamId.trim() : "";
  if (!teamId) {
    return { ok: false, status: 403, message: "无法确认操作人所属团队，已拒绝管理小队" };
  }
  return { ok: true, teamId };
}

export function normalizeWorkGroupName(
  value: unknown,
): { ok: true; name: string } | { ok: false; message: string } {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, message: "小队名称不能为空" };
  if (name.length > WORK_GROUP_NAME_MAX_LENGTH) {
    return { ok: false, message: `小队名称不能超过 ${WORK_GROUP_NAME_MAX_LENGTH} 个字` };
  }
  return { ok: true, name };
}

export function resolveWorkGroupAssignment(input: {
  actorTeamId: string;
  group: Pick<WorkGroupRow, "id" | "kind" | "teamId">;
  member: {
    id: string;
    teamId: string | null;
    peerGroupId: string | null;
    operatorGroupId: string | null;
  } | null;
}): WorkGroupResult<WorkGroupAssignmentPlan> {
  if (input.group.teamId !== input.actorTeamId) {
    return failure(403, "不能管理其他公司的小队");
  }
  if (!input.member) return failure(404, "成员不存在");
  if (input.member.teamId !== input.actorTeamId) {
    return failure(403, "不能分配其他公司的成员");
  }

  const slot = workGroupSlotForKind(input.group.kind);
  const column = WORK_GROUP_SLOT_COLUMNS[slot];
  const previousGroupId = slot === "peer" ? input.member.peerGroupId : input.member.operatorGroupId;

  if (previousGroupId === input.group.id) {
    return {
      ok: true,
      value: { groupId: input.group.id, userId: input.member.id, slot, column, changed: false, previousGroupId },
    };
  }
  // 同槽位换组 = 就地替换（2026-09-22 阿禅裁定 A 案）。
  // 文案/达人二选一、运营至多一个，两个入口的界面都已写「加入将替换原归属」，
  // 所以这里必须真的替换：旧归属由本次写入覆盖（单列天然互斥），并在审计里留下 from。
  // 跨公司小队 / 跨公司成员 / 无团队归属成员仍在上方被 403 拦下，不受本裁定影响。
  return {
    ok: true,
    value: {
      groupId: input.group.id,
      userId: input.member.id,
      slot,
      column,
      changed: true,
      previousGroupId: previousGroupId ?? null,
    },
  };
}

export function resolveWorkGroupUnassignment(input: {
  actorTeamId: string;
  group: Pick<WorkGroupRow, "id" | "kind" | "teamId">;
  member: {
    id: string;
    teamId: string | null;
    peerGroupId: string | null;
    operatorGroupId: string | null;
  } | null;
}): WorkGroupResult<WorkGroupAssignmentPlan> {
  if (input.group.teamId !== input.actorTeamId) {
    return failure(403, "不能管理其他公司的小队");
  }
  if (!input.member) return failure(404, "成员不存在");
  if (input.member.teamId !== input.actorTeamId) {
    return failure(403, "不能调整其他公司的成员");
  }

  const slot = workGroupSlotForKind(input.group.kind);
  const column = WORK_GROUP_SLOT_COLUMNS[slot];
  const previousGroupId = slot === "peer" ? input.member.peerGroupId : input.member.operatorGroupId;
  return {
    ok: true,
    value: {
      groupId: input.group.id,
      userId: input.member.id,
      slot,
      column,
      changed: previousGroupId === input.group.id,
      previousGroupId,
    },
  };
}
