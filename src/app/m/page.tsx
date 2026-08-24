import { redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/current-user-context";
import { loadDashboardPageData } from "@/lib/loaders/dashboard-page";

import { MobileHomeView } from "@/components/mobile/mobile-home-view";

export const metadata = {
  title: "首页 - DYData",
};

export default async function MobileHomePage() {
  const { supabase, user } = await getCurrentUserContext();
  if (!user) redirect("/login");

  const data = await loadDashboardPageData({
    supabase,
    userId: user.id,
  });

  return <MobileHomeView data={data} />;
}
