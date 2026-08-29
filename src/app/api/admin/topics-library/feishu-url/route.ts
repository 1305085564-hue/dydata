import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOPICS_FEISHU_WORKSPACE_KEY,
  loadFeishuWorkspaceUrl,
  validateFeishuWorkspaceUrl,
} from "@/lib/topics/feishu-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminActor({ requiredPermission: "manage_system" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = await loadFeishuWorkspaceUrl(createAdminClient());
  return NextResponse.json({ url });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "manage_system" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const rawUrl = (body as { url?: unknown } | null)?.url;
  const validated = validateFeishuWorkspaceUrl(rawUrl);
  if (!validated.ok && validated.reason === "invalid") {
    return NextResponse.json({ error: "飞书地址必须是合法的 https 链接" }, { status: 400 });
  }

  const url = validated.ok ? validated.url : null;
  const { error } = await createAdminClient().from("system_settings").upsert(
    {
      key: TOPICS_FEISHU_WORKSPACE_KEY,
      value: url,
      description: "选题库「去飞书创作」团队固定工作空间地址",
      updated_by: auth.actor.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) {
    return NextResponse.json({ error: error.message || "保存飞书地址失败" }, { status: 500 });
  }

  const { error: auditError } = await createAdminClient().from("audit_logs").insert({
    user_id: auth.actor.userId,
    action: "topics_feishu_workspace_url_updated",
    target: TOPICS_FEISHU_WORKSPACE_KEY,
    detail: JSON.stringify({ url }),
  });
  if (auditError) {
    console.error("[topics-library] feishu url audit failed", auditError.message);
  }

  return NextResponse.json({ ok: true, url });
}
