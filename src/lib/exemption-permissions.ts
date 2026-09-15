import type { Permissions } from "@/types";

export function hasExemptionManagementPermission(permissions: Permissions) {
  return (
    permissions.manage_fulfillment === true ||
    permissions.review_violations === true
  );
}
