import { NextResponse } from "next/server";
import { invalidatePermissionContextCache } from "@/lib/current-permission-context";

import {
  enterGroupMode,
  getGroupModeUser,
  groupModeCookieOptions,
} from "../_shared";

export async function POST() {
  const auth = await getGroupModeUser();
  if (!auth) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const result = await enterGroupMode(auth.user.id);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });

    const response = NextResponse.json({ active: true, expiresAt: result.expiresAt });
    invalidatePermissionContextCache();
    response.cookies.set("dydata-group-mode", result.token, groupModeCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ error: "集团模式开启失败" }, { status: 500 });
  }
}
