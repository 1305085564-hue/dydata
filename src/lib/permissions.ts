import {
  permissionInfoFromCore,
  resolvePermissionCore,
  type UserPermissionInfo,
} from "@/lib/current-permission-context";
import { hasAnyPermission } from "@/lib/permission-utils";

export type { UserPermissionInfo } from "@/lib/current-permission-context";

export async function getUserPermissions(): Promise<UserPermissionInfo | null> {
  const core = await resolvePermissionCore();
  return core ? permissionInfoFromCore(core) : null;
}

export { hasAnyPermission };
