import { redirect } from "next/navigation";

import { getUserPermissions } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";

import {
  AdminQueueSection,
  AdminStatusSection,
} from "./components/admin-cockpit";
import { AiAlertPanel } from "./components/ai-alert-panel";
import { loadAdminFirstScreenData } from "./components/admin-first-screen-loader";
import { JoinRequestReviewSection } from "./join-request-review-section";

interface AdminPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) redirect("/login");
  if (!canAccessAdminPath("/admin", permissionInfo.businessRole, permissionInfo.permissions))
    redirect("/dashboard");

  const params = await searchParams;
  const queryDate = params.date || new Date().toISOString().split("T")[0];
  const initialData = await loadAdminFirstScreenData(queryDate);

  return (
    <div className="space-y-8">
      <AdminStatusSection date={queryDate} initialSummary={initialData.summary} />
      <AdminQueueSection
        date={queryDate}
        initialData={{
          pendingVideos: initialData.pendingVideos,
          pendingViolations: initialData.pendingViolations,
          pendingSubmissions: initialData.pendingSubmissions,
        }}
      />
      <AiAlertPanel
        initialData={initialData.alerts}
        initialUpdatedAt={initialData.alertsUpdatedAt}
      />
      <JoinRequestReviewSection />
    </div>
  );
}
