import { getTeamOptions } from "@/lib/teams";

import { JoinBannerClient } from "./join-banner-client";
import { loadJoinBanner } from "./join-banner-loader";

export async function JoinBanner() {
  const data = await loadJoinBanner();

  if (!data.shouldRender) {
    return null;
  }

  if (data.mode === "pending") {
    return (
      <JoinBannerClient
        mode="pending"
        requestId={data.requestId}
        targetTeamName={data.targetTeamName}
      />
    );
  }

  const teams = await getTeamOptions();

  return <JoinBannerClient mode="unassigned" teams={teams} />;
}
