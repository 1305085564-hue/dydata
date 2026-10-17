import { NextResponse } from "next/server";

import { resolvePermissionCore } from "@/lib/current-permission-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { appendObservedMutationResult, observeMutationRequest } from "@/lib/observed-mutation-result";
import { createDouyinAuthorizationIntent } from "@/lib/douyin/server";
import type { MutationObservation } from "@/lib/observed-mutation";

export const dynamic = "force-dynamic";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function buildDouyinAuthorizationResponse(request: Request, observation?: MutationObservation) {
  observation?.mark("auth");
  const core = await resolvePermissionCore();
  if (!core) return errorResponse("UNAUTHENTICATED", "未登录", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_REQUEST", "请求体格式不正确", 400);
  }
  const accountId = typeof body === "object" && body !== null && "accountId" in body && typeof body.accountId === "string"
    ? body.accountId.trim()
    : "";
  if (!accountId) return errorResponse("INVALID_ACCOUNT", "请选择要绑定的业务账号", 400);

  try {
    observation?.mark("write-request");
    const result = await createDouyinAuthorizationIntent({ admin: createAdminClient(), core, accountId });
    if ("error" in result) return errorResponse("ACCOUNT_NOT_ACCESSIBLE", result.error ?? "账号不存在或无权操作", result.status ?? 404);
    return NextResponse.json({
      data: {
        accountId: result.account.id,
        accountName: result.account.name,
        authorizationUrl: result.authorizationUrl,
        stateExpiresAt: result.stateExpiresAt,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Missing ")
      ? "抖音应用尚未完成服务端配置"
      : "创建抖音授权失败，请稍后重试";
    return errorResponse(message.includes("尚未") ? "DOUYIN_NOT_CONFIGURED" : "AUTHORIZATION_CREATE_FAILED", message, message.includes("尚未") ? 503 : 500);
  } finally {
    observation?.mark("finalize");
  }
}

export async function POST(request: Request) {
  return observeMutationRequest("/api/douyin/authorizations", request, async (observation) =>
    appendObservedMutationResult(await buildDouyinAuthorizationResponse(request, observation), observation),
  );
}
