import type { CompanyRole, Permissions, UserRole } from "@/types";

export type ToolContext = {
  actorId: string;
  actorRole: UserRole;
  actorCompanyRole?: CompanyRole | null;
  actorPermissions: Permissions;
  actorTeamId?: string | null;
  /** 当前管理范围内的在职成员，必填：缺失即拒绝，不允许回退到更宽范围。 */
  activeVisibleUserIds: string[];
};

export type ToolExecutionInput = {
  toolName: string;
  params: Record<string, unknown>;
  context: ToolContext;
  dryRun?: boolean;
};

export type ToolExecutionResult = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  backupSql?: string;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  affectedData?: Record<string, unknown>;
};
