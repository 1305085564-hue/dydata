import { redirect } from "next/navigation";

import { getUserPermissions } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { ConversionHubShell } from "./hub-shell";
import {
  canAccessAdminPath,
  getWeekStartDate,
  loadInboxData,
  loadScriptsTab,
} from "./data";

export const dynamic = "force-dynamic";

export default async function ConversionHubPage() {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!canAccessAdminPath("/admin/conversion-hub", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const weekStart = getWeekStartDate();

  const [{ data: inbox, counts }, scripts] = await Promise.all([
    loadInboxData(user.id),
    loadScriptsTab(weekStart),
  ]);

  return (
    <ConversionHubShell
      weekStart={weekStart}
      inbox={inbox}
      inboxCounts={counts}
      scripts={scripts}
    />
  );
}
