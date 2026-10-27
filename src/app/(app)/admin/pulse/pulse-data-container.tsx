import { resolveAdminDataPerspective } from "@/lib/admin-data-perspective";
import { buildPermissionContextFromPermissionInfo } from "@/lib/current-permission-context";
import { resolveReadOnlyCompanyScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminContentPageData } from "@/lib/loaders/admin-content-page";
import type { UserPermissionInfo } from "@/lib/permissions";
import {
  attributionDate,
  computePulseMembers,
  computePulseSummary,
  getShanghaiDateOffset,
  type PulseCap,
} from "./pulse-filters";
import { PulseClient } from "./pulse-client";

interface PulseDataContainerProps {
  selectedDate: string;
  selectedCap: PulseCap;
  permissionInfo: UserPermissionInfo;
}

export async function PulseDataContainer({
  selectedDate,
  selectedCap,
  permissionInfo,
}: PulseDataContainerProps) {
  const scope = resolveAdminDataPerspective({
    requestedPerspective: "company",
    requestedTeamId: null,
    canUseCompanyPerspective: false,
    availableTeamIds: permissionInfo.teamId ? [permissionInfo.teamId] : [],
    fallbackTeamId: permissionInfo.teamId,
  });

  const ctx = await buildPermissionContextFromPermissionInfo(permissionInfo, {
    perspective: scope.perspective,
    teamId: scope.teamId,
  });

  if (!ctx) return null;

  const readOnlyScope = await resolveReadOnlyCompanyScope(
    createAdminClient(),
    ctx.scope
  );

  const data = await loadAdminContentPageData({
    supabase: createAdminClient(),
    view: "all",
    permissionInfo: ctx.permissionInfo,
    scope: readOnlyScope,
  });

  const snapshotByVideoId = new Map(
    data.snapshots.map((s) => [s.video_id, s])
  );

  const summary = computePulseSummary(selectedDate, data.videos, snapshotByVideoId);
  const members = computePulseMembers(
    selectedDate,
    data.videos,
    snapshotByVideoId,
    data.profiles
  );
  const dayVideos = data.videos.filter((v) => attributionDate(v) === selectedDate);
  const yesterday = getShanghaiDateOffset(-1);

  return (
    <PulseClient
      date={selectedDate}
      yesterday={yesterday}
      initialCap={selectedCap}
      summary={summary}
      members={members}
      dayVideos={dayVideos}
      availableDates={[...new Set(data.videos.map(attributionDate).filter((date): date is string => Boolean(date)))].sort((a, b) => b.localeCompare(a))}
      snapshots={data.snapshots}
      contentQualityByVideoId={data.contentQualityByVideoId}
    />
  );
}
