import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { AdminSidebar } from "@/components/admin-layout/admin-sidebar";
import { AdminMainArea } from "@/components/admin-layout/admin-main-area";
import { AiAssistantFloatingWindow } from "@/components/ai-assistant/ai-assistant-floating-window";

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
  if (!canAccessAdminPath("/admin", profile?.role ?? "member")) redirect("/dashboard");

  return (
    <div className="flex min-h-[100dvh] bg-[#F4F4F5]">
      <AdminSidebar
        userRole={profile?.role ?? "member"}
        permissions={profile?.permissions ?? {}}
        userName={profile?.name ?? user.email ?? ""}
      />
      <AdminMainArea>{children}</AdminMainArea>
      {profile?.role === "owner" || profile?.role === "admin" ? (
        <AiAssistantFloatingWindow actorRole={profile.role} />
      ) : null}
    </div>
  );
}
