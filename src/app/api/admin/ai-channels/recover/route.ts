import { NextRequest, NextResponse } from "next/server";

import { __internal as aiClientInternal } from "@/lib/ai/client";
import { requireOwnerActor, toTrimmedString } from "../_shared";

export async function POST(request: NextRequest) {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const channelId = toTrimmedString(body.channel_id);
  if (!channelId) {
    return NextResponse.json({ error: "缺少 channel_id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ai_channels")
    .update({
      unhealthy_until: null,
      consecutive_failures: 0,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", channelId)
    .select("id, name, unhealthy_until, consecutive_failures")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "恢复失败" }, { status: 500 });
  }

  aiClientInternal.resetCache();

  return NextResponse.json({
    ok: true,
    channel: data,
  });
}
