import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { AdminSidebar } from "@/components/admin-layout/admin-sidebar";
import { AdminMainArea } from "@/components/admin-layout/admin-main-area";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, permissions")
    .eq("id", user.id)
    .single();
  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) redirect("/dashboard");
  if (!canAccessAdminPath("/admin", permissionInfo.businessRole, permissionInfo.permissions)) redirect("/dashboard");

  return (
    <div className="flex min-h-[100dvh] bg-[var(--color-bg)]">
      <AdminSidebar
        userRole={permissionInfo.role}
        permissions={permissionInfo.permissions}
        userName={profile?.name ?? user.email ?? ""}
      />
      <AdminMainArea>{children}</AdminMainArea>
    </div>
  );
}
