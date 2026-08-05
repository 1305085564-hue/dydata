import type { Permissions, UserRole } from "@/types";

export type ToolContext = {
  actorId: string;
  actorRole: UserRole;
  actorPermissions: Permissions;
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
