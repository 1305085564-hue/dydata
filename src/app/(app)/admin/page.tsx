import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loadAdminPageData } from "@/lib/loaders/admin-page";

import {
  AdminQueueSection,
  AdminStatusSection,
} from "./components/admin-cockpit";
import { AiAlertPanel } from "./components/ai-alert-panel";
import { JoinRequestReviewSection } from "./join-request-review-section";

interface AdminPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const data = await loadAdminPageData({
    supabase,
    searchDate: params.date,
  });

  if (!data) redirect("/login");

  return (
    <div className="space-y-5">
      <AdminStatusSection date={data.queryDate} />
      <AiAlertPanel />
      <AdminQueueSection date={data.queryDate} />
      <JoinRequestReviewSection />
    </div>
  );
}
