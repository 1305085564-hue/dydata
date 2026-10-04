import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildImportSummary,
  buildParsedImportRows,
  loadTopicNameMap,
  parseTopicImportFile,
  TOPIC_IMPORT_MAX_FILE_BYTES,
} from "@/lib/topics/import";
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

async function handleImportParse(request: NextRequest, observation?: MutationObservation) {
  observation?.mark("auth");
  const auth = await requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return mutationResponse({ error: auth.error }, auth.status, observation, { businessSucceeded: false });
  }
  observation?.setDetail?.({ permissionChecked: true });

  observation?.mark("validate");
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return mutationResponse(
      { error: "请求必须是 multipart/form-data 格式" },
      400,
      observation,
      { businessSucceeded: false },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return mutationResponse({ error: "请选择要导入的文件" }, 400, observation, { businessSucceeded: false });
  }
  if (file.size > TOPIC_IMPORT_MAX_FILE_BYTES) {
    return mutationResponse({ error: "文件过大，请控制在 2MB 以内" }, 413, observation, { businessSucceeded: false });
  }

  observation?.mark("read");
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseTopicImportFile(buffer, file.name);
  if (!parsed.ok) {
    return mutationResponse({ error: parsed.message }, parsed.status, observation, { businessSucceeded: false });
  }

  try {
    const topicNameMap = await loadTopicNameMap(createAdminClient());
    const rows = buildParsedImportRows(parsed.rows, topicNameMap);
    observation?.mark("finalize");
    return mutationResponse(
      {
        fileName: file.name,
        rows,
        summary: buildImportSummary(rows),
      },
      200,
      observation,
      {
        businessSucceeded: true,
        businessStatus: "parsed",
        events: ["topics_library.import.parse.succeeded"],
      },
    );
  } catch (error) {
    console.error("[topics-library] import parse failed", error);
    return mutationResponse(
      { error: error instanceof Error ? error.message : "解析文件失败" },
      500,
      observation,
      { businessSucceeded: false, events: ["topics_library.import.parse.failed"] },
    );
  }
}

export async function POST(request: NextRequest) {
  return observeMutation("/api/admin/topics-library/import/parse", async (observation) => {
    observation.setDetail?.({
      businessSucceeded: false,
      permissionChecked: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    return handleImportParse(request, observation);
  });
}
