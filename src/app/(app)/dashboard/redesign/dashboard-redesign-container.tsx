import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { loadDashboardPageData } from "@/lib/loaders/dashboard-page";
import { DashboardRedesignContent } from "./dashboard-redesign-content";

/**
 * 数据容器 - 服务端加载数据，传递给客户端组件
 */
export async function DashboardRedesignContainer() {
  const { supabase, user } = await getCurrentUserContext();
  if (!user) redirect("/login");

  const data = await loadDashboardPageData({
    supabase,
    userId: user.id,
  });

  return (
    <DashboardRedesignContent
      today={data.today}
      userDisplayName={data.userDisplayName}
      userRole={data.userRole}
      accounts={data.accounts}
      userId={data.userId}
      todayReports={data.todayReports}
      monthSubmittedDates={data.monthSubmittedDates}
      accountDisplayNameMap={data.accountDisplayNameMap}
    />
  );
}
