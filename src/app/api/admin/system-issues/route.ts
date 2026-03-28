import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor, toTrimmedString } from "../ai-assistant/_shared";

function toIssueType(value: string) {
  if (value === "code_bug") return "code_bug";
  if (value === "data_corruption") return "data_corruption";
  if (value === "task_stuck") return "task_stuck";
  return "unknown";
}

function toStatus(value: string) {
  if (value === "open" || value === "investigating" || value === "resolved" || value === "wont_fix") {
    return value;
  }
  return "open";
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, actor } = auth;
  const { searchParams } = new URL(request.url);

  const status = toTrimmedString(searchParams.get("status"));
  const limitRaw = Number.parseInt(toTrimmedString(searchParams.get("limit")), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

  let query = supabase
    .from("system_issues")
    .select("id, reported_by, issue_type, description, ai_diagnosis, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (actor.role === "admin") {
    query = query.eq("reported_by", actor.userId);
  }
  if (status) {
    query = query.eq("status", toStatus(status));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ issues: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, actor } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const issueType = toIssueType(toTrimmedString(body.issueType));
  const description = toTrimmedString(body.description);
  const aiDiagnosis = toTrimmedString(body.aiDiagnosis) || null;
  const reproductionSteps = toTrimmedString(body.reproductionSteps) || null;
  const relatedActionId = toTrimmedString(body.relatedActionId) || null;

  if (!description) {
    return NextResponse.json({ error: "缺少 description" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("system_issues")
    .insert({
      reported_by: actor.userId,
      issue_type: issueType,
      description,
      ai_diagnosis: aiDiagnosis,
      reproduction_steps: reproductionSteps,
      related_action_id: relatedActionId,
    })
    .select("id, reported_by, issue_type, description, ai_diagnosis, status, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "写入失败" }, { status: 500 });
  }

  if (issueType === "code_bug") {
    const webhook = process.env.FEISHU_WEBHOOK_URL;
    if (webhook) {
      try {
        const response = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            msg_type: "text",
            content: {
              text: `🚨 站内AI记录代码问题\n报告人: ${actor.name ?? actor.userId}\n描述: ${description}`,
            },
          }),
        });
        if (!response.ok) {
          console.error("[飞书通知失败]", response.status, await response.text());
        }
      } catch (error) {
        console.error("[飞书通知异常]", error);
      }
    }
  }

  return NextResponse.json({ issue: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, actor } = auth;
  if (actor.role !== "owner") {
    return NextResponse.json({ error: "仅 owner 可更新问题状态" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const issueId = toTrimmedString(body.id);
  if (!issueId) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }

  const status = toTrimmedString(body.status);
  const resolutionNotes = toTrimmedString(body.resolutionNotes) || null;

  const patch: Record<string, unknown> = {};
  if (status) {
    patch.status = toStatus(status);
    if (patch.status === "resolved" || patch.status === "wont_fix") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = actor.userId;
    } else {
      patch.resolved_at = null;
      patch.resolved_by = null;
    }
  }
  if (resolutionNotes !== null) {
    patch.resolution_notes = resolutionNotes;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "没有可更新字段" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("system_issues")
    .update(patch)
    .eq("id", issueId)
    .select("id, reported_by, issue_type, description, ai_diagnosis, status, resolution_notes, resolved_at, resolved_by, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "更新失败" }, { status: 500 });
  }

  return NextResponse.json({ issue: data });
}
