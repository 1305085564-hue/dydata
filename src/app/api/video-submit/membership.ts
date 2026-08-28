import { NextResponse } from "next/server";

import {
  isActiveTeamMembership,
  teamMembershipRequiredResponse,
} from "@/app/api/topics/_shared";

export function resolveVideoSubmitMembershipResponse(
  profile: { membership_status?: unknown; team_id?: string | null } | null | undefined,
) {
  if (profile?.membership_status === "archived") {
    return NextResponse.json({ error: "已归档账号不能提交视频" }, { status: 403 });
  }

  if (!isActiveTeamMembership(profile)) {
    return teamMembershipRequiredResponse();
  }

  return null;
}
