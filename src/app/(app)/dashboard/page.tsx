import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { DashboardDataContainer } from "./dashboard-data-container";
import DashboardLoading from "./loading";
import type { UserRole } from "@/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = ((profile?.role as UserRole | undefined) ?? "member") as UserRole;

  return (
    <AppShell width="full" className="dashboard-shell max-w-none pb-8 md:pb-4">
      <Suspense fallback={<DashboardLoading />}>
        <DashboardDataContainer userId={user.id} userRole={userRole} />
      </Suspense>
    </AppShell>
  );
}
