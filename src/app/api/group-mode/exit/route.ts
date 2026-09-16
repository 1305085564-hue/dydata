import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exitGroupMode, getGroupModeUser, groupModeCookieOptions } from "../_shared";
import { GROUP_MODE_COOKIE } from "@/lib/group-mode";

export async function POST() {
  const auth = await getGroupModeUser();
  if (!auth) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const cookieStore = await cookies();
    await exitGroupMode(auth.user.id, cookieStore.get(GROUP_MODE_COOKIE)?.value);
    const response = NextResponse.json({ active: false });
    response.cookies.set(GROUP_MODE_COOKIE, "", { ...groupModeCookieOptions(), maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: "集团模式退出失败" }, { status: 500 });
  }
}
