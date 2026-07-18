import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { DashboardDataContainer } from "./dashboard-data-container";
import DashboardLoading from "./loading";

export const metadata: Metadata = {
  title: "今日工作台",
  description: "记录抖音运营数据，查看团队进度与今日待办。",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <AppShell width="full" className="dashboard-shell max-w-none pb-8 md:pb-4">
      <Suspense fallback={<DashboardLoading />}>
        <DashboardDataContainer userId={user.id} />
      </Suspense>
    </AppShell>
  );
}
