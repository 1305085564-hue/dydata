import { redirect } from "next/navigation";

import { getUserPermissions } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { ConversionHubShell } from "./hub-shell";
import {
  canAccessAdminPath,
  getWeekStartDate,
  loadInboxData,
  loadProcessedData,
  PROCESSED_RPC_READY,
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

  const [{ data: inbox, counts }, { processed }] = await Promise.all([
    loadInboxData(user.id),
    loadProcessedData(user.id),
  ]);

  return (
    <ConversionHubShell
      weekStart={weekStart}
      inbox={inbox}
      inboxCounts={counts}
      processed={processed}
      processedPending={!PROCESSED_RPC_READY}
      isOwner={perm.role === "owner"}
    />
  );
}
