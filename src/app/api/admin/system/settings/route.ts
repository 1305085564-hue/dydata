import { NextResponse } from "next/server";

import {
  readJsonBody,
  requireAdminServiceClient,
  requireSystemPermission,
} from "../../fulfillment/_shared";
import { toStringErrorResponse } from "@/lib/errors";
import { observeMutation } from "@/lib/observed-mutation";
import { appendObservedMutationResult, resolveObservedMutationRequestId } from "@/lib/observed-mutation-result";

export const FEISHU_FULFILLMENT_REMINDER_KEY = "feishu_fulfillment_reminder_enabled";

type SystemSettingsPayload = {
  feishuFulfillmentReminderEnabled: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseSystemSettingsPayload(
  input: unknown,
): { data: SystemSettingsPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }

  if (typeof input.feishuFulfillmentReminderEnabled !== "boolean") {
    return {
      response: NextResponse.json(
        { error: "feishuFulfillmentReminderEnabled 必须是 boolean" },
        { status: 400 },
      ),
    };
  }

  return {
    data: {
      feishuFulfillmentReminderEnabled: input.feishuFulfillmentReminderEnabled,
    },
  };
}

type SettingsRouteDeps = {
  requireAdminServiceClient: typeof requireAdminServiceClient;
  requireSystemPermission: typeof requireSystemPermission;
};

export const defaultSystemSettingsDeps: SettingsRouteDeps = {
  requireAdminServiceClient,
  requireSystemPermission,
};

export async function buildAdminSystemSettingsGetResponse(
  deps: SettingsRouteDeps = defaultSystemSettingsDeps,
  request?: Request,
) {
  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireSystemPermission(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const result = await auth.supabase
    .from("system_settings")
    .select("value")
    .eq("key", FEISHU_FULFILLMENT_REMINDER_KEY)
    .maybeSingle();

  if (result.error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/system/settings",
      operation: "read-system-settings",
      request,
      status: 500,
      message: "读取系统配置失败",
      error: result.error,
    });
  }

  return NextResponse.json({
    feishuFulfillmentReminderEnabled: result.data?.value === true,
  });
}

export async function buildAdminSystemSettingsPostResponse(
  request: Request,
  deps: SettingsRouteDeps = defaultSystemSettingsDeps,
  requestId?: string,
) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseSystemSettingsPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireSystemPermission(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const result = await auth.supabase.from("system_settings").upsert(
    {
      key: FEISHU_FULFILLMENT_REMINDER_KEY,
      value: payload.data.feishuFulfillmentReminderEnabled,
      description: "发布管理飞书自动催交总开关",
      updated_by: auth.actor.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (result.error) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/admin/system/settings",
      operation: "update-system-settings",
      request,
      requestId,
      status: 500,
      message: "更新系统配置失败",
      error: result.error,
    });
  }

  return NextResponse.json({
    ok: true,
    feishuFulfillmentReminderEnabled: payload.data.feishuFulfillmentReminderEnabled,
  });
}

export async function GET(request?: Request) {
  return buildAdminSystemSettingsGetResponse(defaultSystemSettingsDeps, request);
}

export async function POST(request: Request) {
  return observeMutation("/api/admin/system/settings", async (observation) => {
    observation.mark("validate");
    observation.setDetail?.({ businessSucceeded: false, auditStatus: "skipped", employeeNotificationStatus: "skipped", todoStatus: "skipped", compensationRequired: false, events: [] });
    const response = await buildAdminSystemSettingsPostResponse(request, defaultSystemSettingsDeps, observation.requestId)
      ?? toStringErrorResponse({
        code: "INTERNAL_ERROR",
        route: "/api/admin/system/settings",
        operation: "update-system-settings",
        request,
        requestId: observation.requestId,
        error: "empty response from buildAdminSystemSettingsPostResponse",
      });
    return appendObservedMutationResult(response, observation);
  }, { createRequestId: () => resolveObservedMutationRequestId(request) });
}
