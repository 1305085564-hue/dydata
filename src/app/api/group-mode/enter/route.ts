import { NextResponse } from "next/server";

import {
  enterGroupMode,
  getGroupModeUser,
  groupModeCookieOptions,
} from "../_shared";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

export async function POST(request: Request) {
  return observeMutationRequest("/api/group-mode/enter", request, async (observation) => {
    observation.mark("auth");
    const auth = await getGroupModeUser();
    if (!auth) return appendObservedMutationResult(NextResponse.json({ error: "未登录" }, { status: 401 }), observation);

    try {
      observation.mark("write-request");
      const result = await enterGroupMode(auth.user.id);
      if (!result.ok) {
        return appendObservedMutationResult(NextResponse.json({ error: result.message }, { status: result.status }), observation);
      }

      const response = NextResponse.json({ active: true, expiresAt: result.expiresAt });
      response.cookies.set("dydata-group-mode", result.token, groupModeCookieOptions());
      observation.mark("finalize");
      return appendObservedMutationResult(response, observation);
    } catch {
      return appendObservedMutationResult(NextResponse.json({ error: "集团模式开启失败" }, { status: 500 }), observation);
    }
  });
}
