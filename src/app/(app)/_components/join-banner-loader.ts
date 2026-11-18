import { getCurrentUserContext } from "@/lib/current-user-context";
import { getMyPendingRequest } from "@/lib/team-join/service";

export type JoinBannerData = {
  shouldRender: false;
} | {
  shouldRender: true;
  mode: "unassigned";
  userId: string;
} | {
  shouldRender: true;
  mode: "pending";
  userId: string;
  requestId: string;
  targetTeamName: string;
} | {
  shouldRender: true;
  mode: "rejected";
  userId: string;
  targetTeamId: string;
  reviewNote: string | null;
};

type ReviewedRequestRow = { target_team_id: string; status: string; review_note: string | null };

/** 最近一次已处理的申请是驳回时，给申请人看驳回原因（之后通过则已有团队，不会走到这里）。 */
export function buildRejectedBanner(userId: string, latestReviewed: ReviewedRequestRow | null): JoinBannerData | null {
  if (latestReviewed?.status !== "rejected") return null;
  return { shouldRender: true, mode: "rejected", userId, targetTeamId: latestReviewed.target_team_id, reviewNote: latestReviewed.review_note?.trim() || null };
}

export async function loadJoinBanner(): Promise<JoinBannerData> {
  const { supabase, user, authError } = await getCurrentUserContext();
  if (authError || !user) {
    return { shouldRender: false };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, membership_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { shouldRender: false };
  }

  if (profile.membership_status === "archived" || profile.team_id) {
    return { shouldRender: false };
  }

  const pendingResult = await getMyPendingRequest(user.id);

  if (pendingResult.ok && pendingResult.data) {
    return {
      shouldRender: true,
      mode: "pending",
      userId: user.id,
      requestId: pendingResult.data.id,
      targetTeamName: pendingResult.data.targetTeamName,
    };
  }

  const { data: latestReviewed } = await supabase
    .from("team_join_requests")
    .select("target_team_id, status, review_note")
    .eq("applicant_user_id", user.id)
    .in("status", ["approved", "rejected"])
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return buildRejectedBanner(user.id, latestReviewed) ?? { shouldRender: true, mode: "unassigned", userId: user.id };
}
