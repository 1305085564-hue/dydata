import { NextRequest, NextResponse } from "next/server";
import { requireSystemActor, toTrimmedString } from "../../ai-channels/_shared";
import { checkKeyDependencies } from "@/lib/ai-config/key-dependencies";

export async function POST(req: NextRequest) {
  const auth = await requireSystemActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const supabase = auth.supabase;

  const body = await req.json().catch(() => ({}));
  const keyId = toTrimmedString(body.keyId);

  if (!keyId) {
    return NextResponse.json({ error: "缺少 keyId" }, { status: 400 });
  }

  try {
    const result = await checkKeyDependencies(supabase, keyId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "检查依赖失败" },
      { status: 500 }
    );
  }
}
