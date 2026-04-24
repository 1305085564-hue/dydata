import type { VideoMetricsSnapshot, VideoTag } from "@/types";

import { AnalyticsWorkbench } from "./analytics-workbench";

interface AnalyticsContentProps {
  userId: string;
  isPrivilegedUser: boolean;
  filteredReports: Parameters<typeof AnalyticsWorkbench>[0]["filteredReports"];
  filteredVideos: Parameters<typeof AnalyticsWorkbench>[0]["filteredVideos"];
  filteredSnapshots: VideoMetricsSnapshot[];
  filteredVideoTags: VideoTag[];
  submitters: string[];
}

export function AnalyticsContent({
  userId,
  isPrivilegedUser,
  filteredReports,
  filteredVideos,
  filteredSnapshots,
  filteredVideoTags,
  submitters,
}: AnalyticsContentProps) {
  return (
    <AnalyticsWorkbench
      userId={userId}
      isPrivilegedUser={isPrivilegedUser}
      filteredReports={filteredReports}
      filteredVideos={filteredVideos}
      filteredSnapshots={filteredSnapshots}
      filteredVideoTags={filteredVideoTags}
      submitters={submitters}
    />
  );
}
