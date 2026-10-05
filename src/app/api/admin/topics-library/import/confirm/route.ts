import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRequestId } from "@/lib/api-logger";
import {
  executeTopicImport,
  parseMetricValue,
  TOPIC_IMPORT_MAX_ROWS,
  type TopicImportParsedRow,
} from "@/lib/topics/import";
import { type MutationObservation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function parseMetricField(value: unknown) {
  const parsed = parseMetricValue(toText(value));
  return parsed;
}

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

async function handleImportConfirm(request: NextRequest, observation?: MutationObservation) {
  observation?.mark("auth");
  const auth = await requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return mutationResponse({ error: auth.error }, auth.status, observation, { businessSucceeded: false });
  }
  observation?.setDetail?.({ permissionChecked: true });

  observation?.mark("validate");
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return mutationResponse({ error: "请求体格式不正确" }, 400, observation, { businessSucceeded: false });
  }

  const rawRows = (body as { rows?: unknown }).rows;
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return mutationResponse({ error: "没有可导入的数据行" }, 400, observation, { businessSucceeded: false });
  }
  if (rawRows.length > TOPIC_IMPORT_MAX_ROWS) {
    return mutationResponse(
      { error: `单次最多导入 ${TOPIC_IMPORT_MAX_ROWS} 行` },
      400,
      observation,
      { businessSucceeded: false },
    );
  }

  // 只接收允许的字段，服务端会在 executeTopicImport 中完整重新校验。
  // 指标不能静默丢失，否则预览显示的成绩会和最终落库不一致。
  const metricRows = rawRows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      rowNumber: typeof row.rowNumber === "number" ? row.rowNumber : index + 2,
      historyPlay: parseMetricField(row.historyPlay),
      historyLikes: parseMetricField(row.historyLikes),
    };
  });
  const invalidMetric = metricRows.find((row) => !row.historyPlay.ok || !row.historyLikes.ok);
  if (invalidMetric) {
    return mutationResponse(
      { error: `第 ${invalidMetric.rowNumber} 行的历史播放或点赞不是有效数字` },
      400,
      observation,
      { businessSucceeded: false },
    );
  }

  const rows: TopicImportParsedRow[] = rawRows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const metricRow = metricRows[index];
    return {
      rowNumber: typeof row.rowNumber === "number" ? row.rowNumber : index + 2,
      topicName: toText(row.topicName),
      title: toText(row.title),
      durationText: toText(row.durationText),
      durationSeconds: null,
      historyPlay: metricRow?.historyPlay.value ?? null,
      historyLikes: metricRow?.historyLikes.value ?? null,
      hook: toText(row.hook) || null,
      outline: toText(row.outline) || null,
      status: "valid",
      message: null,
    };
  });

  try {
    observation?.mark("write-request");
    const result = await executeTopicImport(createAdminClient(), {
      rows,
      adminId: auth.actor.userId,
      requestId: observation?.requestId ?? resolveRequestId(request),
      fileName: typeof (body as { fileName?: unknown }).fileName === "string"
        ? (body as { fileName: string }).fileName
        : null,
    });
    observation?.mark("finalize");
    return mutationResponse(
      { ok: true, ...result },
      200,
      observation,
      {
        businessSucceeded: true,
        businessStatus: result.failedCount > 0 ? "partial" : "completed",
        events: [
          result.failedCount > 0
            ? "topics_library.import.confirm.partial"
            : "topics_library.import.confirm.succeeded",
        ],
      },
    );
  } catch (error) {
    console.error("[topics-library] import confirm failed", error);
    return mutationResponse(
      { error: error instanceof Error ? error.message : "导入执行失败" },
      500,
      observation,
      { businessSucceeded: false, events: ["topics_library.import.confirm.failed"] },
    );
  }
}

export async function POST(request: NextRequest) {
  return observeMutationRequest("/api/admin/topics-library/import/confirm", request, async (observation) => {
    observation.setDetail?.({
      businessSucceeded: false,
      permissionChecked: false,
      auditStatus: "skipped",
      employeeNotificationStatus: "skipped",
      todoStatus: "skipped",
      compensationRequired: false,
      events: [],
    });
    return appendObservedMutationResult(await handleImportConfirm(request, observation), observation);
  });
}
