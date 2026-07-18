import { getCurrentUserContext } from "@/lib/current-user-context";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
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
};

export async function loadJoinBanner(): Promise<JoinBannerData> {
  const { supabase, user, authError } = await getCurrentUserContext();
  assertSupabaseQuerySucceeded(authError, "验证加入团队登录状态失败");

  if (!user) {
    return { shouldRender: false };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { shouldRender: false };
  }

  if (profile.team_id) {
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

  return { shouldRender: true, mode: "unassigned", userId: user.id };
}
