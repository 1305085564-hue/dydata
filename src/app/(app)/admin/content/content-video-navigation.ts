import type { AdminDataPerspective } from "@/lib/admin-data-perspective";

export function buildContentPageUrl({
  view,
  perspective,
  teamId,
  videoId,
}: {
  view: "pending" | "all";
  perspective: AdminDataPerspective;
  teamId: string | null;
  videoId: string | null;
}) {
  const params = new URLSearchParams({ view, scope: perspective });
  if (perspective === "team" && teamId) params.set("teamId", teamId);
  if (videoId) params.set("videoId", videoId);
  return `/admin/content?${params.toString()}`;
}
