import type { getCurrentPermissionContext } from "@/lib/current-permission-context";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveWorkGroupWriteGate,
  type WorkGroupFailure,
  type WorkGroupResult,
} from "@/lib/work-groups";

/**
 * 小队编制的唯一写入口协议层。
 *
 * - 门禁：`manage_members` + 限本公司。teamId **只取操作人自己的团队**，
 *   不接受客户端传入的 teamId，从构造上排除跨公司建组。
 * - 与 UI 无关，可独立单测；真正的 Server Action 在 work-group-actions.ts 里只做转发。
 */

export type WorkGroupWriteContext = {
  actorId: string;
  teamId: string;
  supabase: ReturnType<typeof createAdminClient>;
};

export type WorkGroupWriteDeps = {
  resolveContext: typeof getCurrentPermissionContext;
  createSupabase: typeof createAdminClient;
  revalidate: (path: string) => void;
};

export const WORK_GROUPS_REVALIDATE_PATH = "/admin/collaboration";

export async function resolveWorkGroupWriteContext(
  deps: WorkGroupWriteDeps,
): Promise<{ ok: true; context: WorkGroupWriteContext } | WorkGroupFailure> {
  const permission = await deps.resolveContext("company", null);
  if (!permission) return { ok: false, status: 403, message: "用户权限范围加载失败" };

  const gate = resolveWorkGroupWriteGate({
    permissions: permission.permissionInfo.permissions,
    actorTeamId: permission.scope.teamId,
  });
  if (!gate.ok) return gate;

  return {
    ok: true,
    context: {
      actorId: permission.permissionInfo.userId,
      teamId: gate.teamId,
      supabase: deps.createSupabase(),
    },
  };
}

/** 门禁不通过时不触碰数据库、不刷新页面，失败原因原样返回（禁止伪装成功）。 */
export async function runWorkGroupAction<T>(
  input: { run: (context: WorkGroupWriteContext) => Promise<WorkGroupResult<T>> },
  deps: WorkGroupWriteDeps,
): Promise<WorkGroupResult<T>> {
  const resolved = await resolveWorkGroupWriteContext(deps);
  if (!resolved.ok) return resolved;

  const result = await input.run(resolved.context);
  if (!result.ok) return result;
  deps.revalidate(WORK_GROUPS_REVALIDATE_PATH);
  return result;
}
