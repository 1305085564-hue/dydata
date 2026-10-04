import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOPICS_FEISHU_WORKSPACE_KEY,
  loadFeishuWorkspaceUrl,
  validateFeishuWorkspaceUrl,
} from "@/lib/topics/feishu-workspace";
import { observeMutation, type MutationObservation } from "@/lib/observed-mutation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SideEffectStatus = "succeeded" | "failed" | "skipped";

function statusBoolean(status: SideEffectStatus) {
  return status === "succeeded" ? true : status === "failed" ? false : null;
}

function mutationFields(input: {
  businessSucceeded: boolean;
  auditStatus?: SideEffectStatus;
  employeeNotificationStatus?: SideEffectStatus;
  todoStatus?: SideEffectStatus;
  compensationRequired?: boolean;
}) {
  const auditStatus = input.auditStatus ?? "skipped";
  const employeeNotificationStatus = input.employeeNotificationStatus ?? "skipped";
  const todoStatus = input.todoStatus ?? "skipped";
  const compensationRequired = input.compensationRequired
    ?? [auditStatus, employeeNotificationStatus, todoStatus].includes("failed");
  return {
    businessSucceeded: input.businessSucceeded,
    auditSucceeded: statusBoolean(auditStatus),
    notificationSucceeded: statusBoolean(employeeNotificationStatus),
    todoMarked: statusBoolean(todoStatus),
    compensationRequired,
    auditStatus,
    employeeNotificationStatus,
    todoStatus,
    employeeNotificationSucceeded: statusBoolean(employeeNotificationStatus),
    notificationMarked: statusBoolean(todoStatus),
  };
}

function mutationResponse(
  body: Record<string, unknown>,
  status: number,
  observation: MutationObservation | undefined,
  input: Parameters<typeof mutationFields>[0] & { businessStatus?: string | null; events?: string[] },
) {
  const fields = mutationFields(input);
  const permissionChecked = status !== 401 && status !== 403;
  observation?.setDetail?.({
    ...fields,
    permissionChecked,
    businessStatus: input.businessStatus ?? null,
    events: input.events ?? [],
  });
  return NextResponse.json(
    { ...body, ...fields, permissionChecked, businessStatus: input.businessStatus ?? null, events: input.events ?? [] },
    { status },
  );
}

export async function GET() {
  const auth = await requireAdminActor({ requiredPermission: "manage_system" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = await loadFeishuWorkspaceUrl(createAdminClient());
  return NextResponse.json({ url });
}

async function handlePost(request: NextRequest, observation?: MutationObservation) {
  observation?.mark("auth");
  const auth = await requireAdminActor({ requiredPermission: "manage_system" });
  if ("error" in auth) {
    return mutationResponse({ error: auth.error }, auth.status, observation, { businessSucceeded: false });
  }
  observation?.setDetail?.({ permissionChecked: true });

  observation?.mark("validate");
  const body = await request.json().catch(() => null);
  const rawUrl = (body as { url?: unknown } | null)?.url;
  const validated = validateFeishuWorkspaceUrl(rawUrl);
  if (!validated.ok && validated.reason === "invalid") {
    return mutationResponse(
      { error: "飞书地址必须是合法的 https 链接" },
      400,
      observation,
      { businessSucceeded: false },
    );
  }

  const url = validated.ok ? validated.url : null;
  observation?.mark("write-request");
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
    return mutationResponse(
      { error: error.message || "保存飞书地址失败" },
      500,
      observation,
      { businessSucceeded: false },
    );
  }

  const { error: auditError } = await createAdminClient().from("audit_logs").insert({
    user_id: auth.actor.userId,
    action: "topics_feishu_workspace_url_updated",
    target: TOPICS_FEISHU_WORKSPACE_KEY,
    detail: JSON.stringify({ url }),
  });
  if (auditError) {
    console.error("[topics-library] feishu url audit failed", auditError.message);
    observation?.mark("compensate");
    observation?.mark("finalize");
    return mutationResponse(
      { ok: true, url },
      200,
      observation,
      {
        businessSucceeded: true,
        auditStatus: "failed",
        compensationRequired: true,
        businessStatus: "updated",
        events: ["topics_library.feishu_workspace.updated", "topics_library.feishu_workspace.audit_failed"],
      },
    );
  }

  observation?.mark("finalize");
  return mutationResponse(
    { ok: true, url },
    200,
    observation,
    {
      businessSucceeded: true,
      auditStatus: "succeeded",
      businessStatus: "updated",
      events: ["topics_library.feishu_workspace.updated"],
    },
  );
}

export async function POST(request: NextRequest) {
  return observeMutation("/api/admin/topics-library/feishu-url", async (observation) => {
    observation.setDetail?.({
      businessSucceeded: false,
      permissionChecked: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    return handlePost(request, observation);
  });
}
