import { NextResponse } from "next/server";

import {
  enterGroupMode,
  getGroupModeUser,
  groupModeCookieOptions,
} from "../_shared";
import type { MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

export type GroupModeEnterDeps = {
  getGroupModeUser: typeof getGroupModeUser;
  enterGroupMode: typeof enterGroupMode;
  groupModeCookieOptions: typeof groupModeCookieOptions;
};

export const defaultGroupModeEnterDeps: GroupModeEnterDeps = {
  getGroupModeUser,
  enterGroupMode,
  groupModeCookieOptions,
};

export async function buildGroupModeEnterResponse(
  _request: Request,
  deps: GroupModeEnterDeps = defaultGroupModeEnterDeps,
  observation?: MutationObservation,
) {
  observation?.mark("auth");
  const auth = await deps.getGroupModeUser();
  if (!auth) return appendObservedMutationResult(NextResponse.json({ error: "未登录" }, { status: 401 }), observation);

  try {
    observation?.mark("write-request");
    const result = await deps.enterGroupMode(auth.user.id);
    if (!result.ok) {
      return appendObservedMutationResult(NextResponse.json({ error: result.message }, { status: result.status }), observation);
    }

    const response = NextResponse.json({ active: true, expiresAt: result.expiresAt });
    response.cookies.set("dydata-group-mode", result.token, deps.groupModeCookieOptions());
    observation?.mark("finalize");
    return appendObservedMutationResult(response, observation);
  } catch {
    return appendObservedMutationResult(NextResponse.json({ error: "集团模式开启失败" }, { status: 500 }), observation);
  }
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/group-mode/enter", request, async (observation) =>
    buildGroupModeEnterResponse(request, defaultGroupModeEnterDeps, observation),
  );
}
