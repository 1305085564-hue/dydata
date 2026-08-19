import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getGroupModeStatus, getGroupModeUser } from "../_shared";
import { GROUP_MODE_COOKIE } from "@/lib/group-mode";

export async function GET() {
  const auth = await getGroupModeUser();
  if (!auth) return NextResponse.json({ error: "未登录" }, { status: 401 });

  try {
    const cookieStore = await cookies();
    const status = await getGroupModeStatus(auth.user.id, cookieStore.get(GROUP_MODE_COOKIE)?.value);
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ error: "集团模式状态读取失败" }, { status: 500 });
  }
}
