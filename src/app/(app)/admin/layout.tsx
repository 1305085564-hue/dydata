import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AdminTopNav } from "@/components/admin-layout/admin-top-nav";
import { AdminMainArea } from "@/components/admin-layout/admin-main-area";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) redirect("/login");
  const headersList = await headers();
  const pathname = headersList.get("x-next-pathname") ?? headersList.get("x-invoke-path") ?? "/admin";
  if (!canAccessAdminPath(pathname, permissionInfo.businessRole, permissionInfo.permissions)) redirect("/dashboard");

  return (
    <div className="flex h-[100dvh] flex-col bg-[var(--color-bg)]">
      <AdminTopNav
        userRole={permissionInfo.role}
        businessRole={permissionInfo.businessRole}
        permissions={permissionInfo.permissions}
      />
      <AdminMainArea>{children}</AdminMainArea>
    </div>
  );
}
