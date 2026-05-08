import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="flex min-h-[100dvh] bg-[#F9F9FB]">
      <AdminSidebar
        userRole={profile?.role ?? "member"}
        permissions={profile?.permissions ?? {}}
        userName={profile?.name ?? user.email ?? ""}
      />
      <AdminMainArea>{children}</AdminMainArea>
    </div>
  );
}
