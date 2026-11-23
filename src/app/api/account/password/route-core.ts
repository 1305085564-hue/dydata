import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSignedInUser } from "@/app/api/production/_shared";
import { cloudBaseEnvironmentId } from "@/lib/cloudbase/core";
import { toStringErrorResponse } from "@/lib/errors";
import type { MutationObservation } from "@/lib/observed-mutation";
import { createAdminClient } from "@/lib/supabase/admin";

const passwordInputSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  newPassword: z.string().trim().min(6).max(128),
}).strict().superRefine((input, context) => {
  if (input.currentPassword === input.newPassword) {
    context.addIssue({ code: "custom", path: ["newPassword"], message: "same_password" });
  }
});

type PasswordRpcResult = {
  data: unknown;
  error: unknown | null;
};

type SignedInResult =
  | { response: Response; user?: undefined; supabase?: undefined }
  | { response?: undefined; user: { id: string }; supabase: unknown };

export type AccountPasswordDeps = {
  requireSignedInUser: () => Promise<SignedInResult>;
  createAdminClient: () => {
    rpc: (name: string, args: Record<string, unknown>) => PromiseLike<PasswordRpcResult>;
  };
  cloudBaseEnvironmentId: typeof cloudBaseEnvironmentId;
};

export const defaultAccountPasswordDeps: AccountPasswordDeps = {
  requireSignedInUser,
  createAdminClient,
  cloudBaseEnvironmentId,
};

function response(body: Record<string, unknown>, status: number, requestId?: string) {
  return NextResponse.json(
    requestId ? { ...body, requestId } : body,
    {
      status,
      ...(requestId ? { headers: { "x-dydata-request-id": requestId } } : {}),
    },
  );
}

function errorMessageForCode(code: string) {
  switch (code) {
    case "invalid_old_password": return "当前密码不正确";
    case "same_password": return "新密码不能与当前密码相同";
    case "invalid_password": return "密码长度应为 6-128 位";
    case "password_not_set": return "当前账号尚未设置密码，请联系管理员重置";
    case "account_disabled":
    case "user_not_found": return "当前账号无法修改密码，请联系管理员";
    default: return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function buildAccountPasswordResponse(
  request: Request,
  deps: AccountPasswordDeps = defaultAccountPasswordDeps,
  requestId?: string,
  observation?: MutationObservation,
) {
  let auth: SignedInResult;
  observation?.mark("auth");
  try {
    auth = await deps.requireSignedInUser();
  } catch {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/account/password",
      operation: "resolve-session",
      requestId,
      status: 500,
      message: "修改密码失败，请稍后重试",
      error: new Error("session_resolution_failed"),
    });
  }
  if (auth.response) {
    return response({ error: "未登录" }, auth.response.status || 401, requestId);
  }

  observation?.mark("validate");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: "请求体格式不正确", code: "INVALID_INPUT" }, 400, requestId);
  }

  const parsed = passwordInputSchema.safeParse(body);
  if (!parsed.success) {
    const samePassword = parsed.error.issues.some((issue) => issue.message === "same_password");
    return response({
      error: samePassword ? "新密码不能与当前密码相同" : "当前密码和新密码格式不正确",
      code: "INVALID_INPUT",
    }, 400, requestId);
  }

  observation?.mark("write-request");
  let rpc: PasswordRpcResult;
  try {
    const admin = deps.createAdminClient();
    rpc = await admin.rpc("cloudbase_change_own_password", {
      p_subject: auth.user.id,
      p_old_password: parsed.data.currentPassword,
      p_new_password: parsed.data.newPassword,
      p_project: deps.cloudBaseEnvironmentId(),
    });
  } catch {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/account/password",
      operation: "change-own-password",
      requestId,
      status: 500,
      message: "修改密码失败，请稍后重试",
      error: new Error("password_rpc_failed"),
    });
  }

  if (rpc.error || !isRecord(rpc.data)) {
    return toStringErrorResponse({
      code: "DEPENDENCY_FAILED",
      route: "/api/account/password",
      operation: "change-own-password",
      requestId,
      status: 500,
      message: "修改密码失败，请稍后重试",
      error: new Error("password_rpc_failed"),
    });
  }

  if (rpc.data.ok === true && rpc.data.subject === auth.user.id) {
    return response({ ok: true }, 200, requestId);
  }

  const code = typeof rpc.data.code === "string" ? rpc.data.code : "unknown";
  const message = errorMessageForCode(code);
  if (message) return response({ error: message, code }, 400, requestId);

  return toStringErrorResponse({
    code: "DEPENDENCY_FAILED",
    route: "/api/account/password",
    operation: "change-own-password",
    requestId,
    status: 500,
    message: "修改密码失败，请稍后重试",
    error: new Error("password_rpc_rejected"),
  });
}
