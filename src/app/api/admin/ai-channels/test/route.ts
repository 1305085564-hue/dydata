import { NextRequest, NextResponse } from "next/server";

import { requireOwnerActor, sendChannelTestRequest, toTrimmedString } from "../_shared";

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
  const testKind = toTrimmedString(body.test_kind) === "ocr" ? "ocr" : "text";
  if (!channelId) {
    return NextResponse.json({ error: "缺少 channel_id" }, { status: 400 });
  }

  const { data: channel, error } = await supabase
    .from("ai_channels")
    .select("id, name, base_url, api_key, model")
    .eq("id", channelId)
    .single();

  if (error || !channel) {
    return NextResponse.json({ error: error?.message ?? "渠道不存在" }, { status: 404 });
  }

  const result = await sendChannelTestRequest({ channel, mode: testKind });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        channel_id: channelId,
        channel_name: channel.name,
        test_kind: testKind,
        elapsed_ms: result.elapsedMs,
        error: result.error,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    channel_id: channelId,
    channel_name: channel.name,
    test_kind: testKind,
    elapsed_ms: result.elapsedMs,
    text: result.text,
  });
}
