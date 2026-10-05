import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exitGroupMode, getGroupModeUser, groupModeCookieOptions } from "../_shared";
import { GROUP_MODE_COOKIE } from "@/lib/group-mode";
import type { MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export type GroupModeExitDeps = {
  getGroupModeUser: typeof getGroupModeUser;
  exitGroupMode: typeof exitGroupMode;
  groupModeCookieOptions: typeof groupModeCookieOptions;
  getCookies: () => Promise<CookieStore>;
};

export const defaultGroupModeExitDeps: GroupModeExitDeps = {
  getGroupModeUser,
  exitGroupMode,
  groupModeCookieOptions,
  getCookies: cookies,
};

export async function buildGroupModeExitResponse(
  _request: Request,
  deps: GroupModeExitDeps = defaultGroupModeExitDeps,
  observation?: MutationObservation,
) {
  observation?.mark("auth");
  const auth = await deps.getGroupModeUser();
  if (!auth) return appendObservedMutationResult(NextResponse.json({ error: "未登录" }, { status: 401 }), observation);

  try {
    observation?.mark("write-request");
    const cookieStore = await deps.getCookies();
    await deps.exitGroupMode(auth.user.id, cookieStore.get(GROUP_MODE_COOKIE)?.value);
    const response = NextResponse.json({ active: false });
    response.cookies.set(GROUP_MODE_COOKIE, "", { ...deps.groupModeCookieOptions(), maxAge: 0 });
    observation?.mark("finalize");
    return appendObservedMutationResult(response, observation);
  } catch {
    return appendObservedMutationResult(NextResponse.json({ error: "集团模式退出失败" }, { status: 500 }), observation);
  }
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/group-mode/exit", request, async (observation) =>
    buildGroupModeExitResponse(request, defaultGroupModeExitDeps, observation),
  );
}
