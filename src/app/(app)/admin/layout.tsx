import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import "@/styles/components/admin.css";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AdminMainArea } from "@/components/admin-layout/admin-main-area";
import { PermissionGuard } from "@/components/permission-guard";

export const metadata: Metadata = {
  title: "管理后台",
  description: "DYData 内部管理后台。",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

const MODULE_TITLES: Record<string, string> = {
  "/admin/modules": "成员管理",
  "/admin/settings": "系统设置",
  "/admin/ai-config": "AI 配置",
  "/admin/content": "视频复盘",
  "/admin/videos": "素材库",
  "/admin/fulfillment": "发布管理",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) redirect("/login");
  const headersList = await headers();
  const pathname = headersList.get("x-next-pathname") ?? headersList.get("x-invoke-path") ?? "/admin";
  const hasAccess = canAccessAdminPath(pathname, permissionInfo.role, permissionInfo.permissions);

  if (!hasAccess) {
    const title = MODULE_TITLES[pathname] || "管理后台";
    return (
      <div className="w-full bg-[var(--color-bg)]">
        <AdminMainArea>
          <PermissionGuard moduleTitle={title} />
        </AdminMainArea>
      </div>
    );
  }

  return (
    <div className="w-full bg-[var(--color-bg)]">
      <AdminMainArea>{children}</AdminMainArea>
    </div>
  );
}
