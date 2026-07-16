import { NextResponse } from "next/server";

import {
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
} from "../../fulfillment/_shared";

export const FEISHU_FULFILLMENT_REMINDER_KEY = "feishu_fulfillment_reminder_enabled";
const FEISHU_FULFILLMENT_REMINDER_FALLBACK_FEATURE_KEY = "feishu_fulfillment_reminder";

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
  requireOwnerOrAdminRole: typeof requireOwnerOrAdminRole;
};

const defaultDeps: SettingsRouteDeps = {
  requireAdminServiceClient,
  requireOwnerOrAdminRole,
};

function isMissingSystemSettingsTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("public.system_settings");
}

export async function buildAdminSystemSettingsGetResponse(deps: SettingsRouteDeps = defaultDeps) {
  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireOwnerOrAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const result = await auth.supabase
    .from("system_settings")
    .select("value")
    .eq("key", FEISHU_FULFILLMENT_REMINDER_KEY)
    .maybeSingle();

  if (result.error && !isMissingSystemSettingsTableError(result.error)) {
    return NextResponse.json({ error: result.error.message || "读取系统配置失败" }, { status: 500 });
  }

  if (isMissingSystemSettingsTableError(result.error)) {
    const fallback = await auth.supabase
      .from("ai_feature_config")
      .select("is_enabled")
      .eq("feature_key", FEISHU_FULFILLMENT_REMINDER_FALLBACK_FEATURE_KEY)
      .maybeSingle();

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message || "读取系统配置失败" }, { status: 500 });
    }

    return NextResponse.json({
      feishuFulfillmentReminderEnabled: fallback.data?.is_enabled === true,
    });
  }

  return NextResponse.json({
    feishuFulfillmentReminderEnabled: result.data?.value === true,
  });
}

export async function buildAdminSystemSettingsPostResponse(
  request: Request,
  deps: SettingsRouteDeps = defaultDeps,
) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseSystemSettingsPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireOwnerOrAdminRole(auth);
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

  if (result.error && !isMissingSystemSettingsTableError(result.error)) {
    return NextResponse.json({ error: result.error.message || "更新系统配置失败" }, { status: 500 });
  }

  if (isMissingSystemSettingsTableError(result.error)) {
    const fallback = await auth.supabase.from("ai_feature_config").upsert(
      {
        feature_key: FEISHU_FULFILLMENT_REMINDER_FALLBACK_FEATURE_KEY,
        label: "飞书自动催交",
        is_enabled: payload.data.feishuFulfillmentReminderEnabled,
      },
      { onConflict: "feature_key" },
    );

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message || "更新系统配置失败" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    feishuFulfillmentReminderEnabled: payload.data.feishuFulfillmentReminderEnabled,
  });
}

export async function GET() {
  return buildAdminSystemSettingsGetResponse();
}

export async function POST(request: Request) {
  return buildAdminSystemSettingsPostResponse(request);
}
