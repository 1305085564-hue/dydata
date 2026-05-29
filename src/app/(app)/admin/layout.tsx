import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AdminSidebar } from "@/components/admin-layout/admin-sidebar";
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
    <div className="flex h-[100dvh] bg-[var(--color-bg)]">
      <AdminSidebar
        userRole={permissionInfo.role}
        businessRole={permissionInfo.businessRole}
        permissions={permissionInfo.permissions}
        userName={permissionInfo.name ?? "未命名成员"}
      />
      <AdminMainArea>{children}</AdminMainArea>
    </div>
  );
}
