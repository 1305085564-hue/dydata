import { NextResponse } from "next/server";

import {
  readJsonBody,
  requireAdminServiceClient,
  requireOwnerOrTeamAdminRole,
} from "../../fulfillment/_shared";

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
  requireOwnerOrTeamAdminRole: typeof requireOwnerOrTeamAdminRole;
};

const defaultDeps: SettingsRouteDeps = {
  requireAdminServiceClient,
  requireOwnerOrTeamAdminRole,
};

export async function buildAdminSystemSettingsGetResponse(deps: SettingsRouteDeps = defaultDeps) {
  const auth = await deps.requireAdminServiceClient();
  const forbidden = deps.requireOwnerOrTeamAdminRole(auth);
  if (forbidden) return forbidden;
  if ("response" in auth) return auth.response;

  const result = await auth.supabase
    .from("system_settings")
    .select("value")
    .eq("key", FEISHU_FULFILLMENT_REMINDER_KEY)
    .maybeSingle();

  if (result.error) {
    return NextResponse.json({ error: result.error.message || "读取系统配置失败" }, { status: 500 });
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
  const forbidden = deps.requireOwnerOrTeamAdminRole(auth);
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
    return NextResponse.json({ error: result.error.message || "更新系统配置失败" }, { status: 500 });
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
