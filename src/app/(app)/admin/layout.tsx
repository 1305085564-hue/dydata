import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AdminMainArea } from "@/components/admin-layout/admin-main-area";

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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) redirect("/login");
  const headersList = await headers();
  const pathname = headersList.get("x-next-pathname") ?? headersList.get("x-invoke-path") ?? "/admin";
  if (!canAccessAdminPath(pathname, permissionInfo.businessRole, permissionInfo.permissions)) redirect("/dashboard");

  return (
    <div className="w-full bg-[var(--color-bg)]">
      <AdminMainArea>{children}</AdminMainArea>
    </div>
  );
}
