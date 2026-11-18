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

  if (data.mode === "rejected") {
    return (
      <JoinBannerClient
        mode="rejected"
        teams={teams}
        targetTeamName={teams.find((team) => team.id === data.targetTeamId)?.name ?? ""}
        reviewNote={data.reviewNote}
      />
    );
  }

  return <JoinBannerClient mode="unassigned" teams={teams} />;
}
