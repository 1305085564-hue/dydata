import { hasPermission } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";

export function hasExemptionManagementPermission(role: UserRole | undefined, permissions: Permissions) {
  if (role === "owner") return true;
  return (
    hasPermission(role, permissions, "manage_fulfillment") ||
    hasPermission(role, permissions, "review_violations")
  );
}
