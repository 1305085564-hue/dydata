import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exitGroupMode, getGroupModeUser, groupModeCookieOptions } from "../_shared";
import { GROUP_MODE_COOKIE } from "@/lib/group-mode";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

export async function POST(request: Request) {
  return observeMutationRequest("/api/group-mode/exit", request, async (observation) => {
    observation.mark("auth");
    const auth = await getGroupModeUser();
    if (!auth) return appendObservedMutationResult(NextResponse.json({ error: "未登录" }, { status: 401 }), observation);

    try {
      observation.mark("write-request");
      const cookieStore = await cookies();
      await exitGroupMode(auth.user.id, cookieStore.get(GROUP_MODE_COOKIE)?.value);
      const response = NextResponse.json({ active: false });
      response.cookies.set(GROUP_MODE_COOKIE, "", { ...groupModeCookieOptions(), maxAge: 0 });
      observation.mark("finalize");
      return appendObservedMutationResult(response, observation);
    } catch {
      return appendObservedMutationResult(NextResponse.json({ error: "集团模式退出失败" }, { status: 500 }), observation);
    }
  });
}
