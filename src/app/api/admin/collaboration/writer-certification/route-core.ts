import { NextResponse } from "next/server";

import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { UUID_PATTERN } from "@/app/api/production/_shared";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import {
  loadWriterCertificationTarget,
  saveWriterCertification,
  canCertifyWriter,
} from "@/lib/writer-certifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseQueryFailure } from "@/lib/supabase/query-error";

type WriterCertificationPayload = {
  userId: string;
  certified: boolean;
};

type WriterCertificationDeps = {
  requireAdminActor: typeof requireAdminActor;
  buildPermissionContextForActor: typeof buildPermissionContextForActor;
  createAdminClient: typeof createAdminClient;
  loadWriterCertificationTarget: typeof loadWriterCertificationTarget;
  saveWriterCertification: typeof saveWriterCertification;
};

const defaultDeps: WriterCertificationDeps = {
  requireAdminActor,
  buildPermissionContextForActor,
  createAdminClient,
  loadWriterCertificationTarget,
  saveWriterCertification,
};

function parseWriterCertificationPayload(input: unknown):
  | { ok: true; data: WriterCertificationPayload }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "请求体必须是对象" };
  }
  const record = input as Record<string, unknown>;
  const userId = typeof record.userId === "string" ? record.userId.trim() : "";
  if (!UUID_PATTERN.test(userId)) {
    return { ok: false, error: "userId 必须是合法 UUID" };
  }
  if (typeof record.certified !== "boolean") {
    return { ok: false, error: "certified 必须是布尔值" };
  }
  return { ok: true, data: { userId, certified: record.certified } };
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function buildWriterCertificationResponse(
  input: unknown,
  deps: WriterCertificationDeps = defaultDeps,
) {
  const payload = parseWriterCertificationPayload(input);
  if (!payload.ok) return NextResponse.json({ error: payload.error }, { status: 400 });

  const auth = await deps.requireAdminActor({ requiredPermission: "manage_members" });
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const context = await deps.buildPermissionContextForActor(auth.actor);
  if (!context) return forbidden("用户权限范围加载失败");
  const activeVisibleUserIds = context.scope.activeVisibleUserIds ?? context.scope.visibleUserIds;
  if (!activeVisibleUserIds.includes(payload.data.userId)) {
    return forbidden("不能认证当前权限范围外或已归档的成员");
  }

  try {
    const adminSupabase = deps.createAdminClient();
    const target = await deps.loadWriterCertificationTarget(adminSupabase, payload.data.userId);
    if (!target) return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    if (target.membershipStatus !== "active") {
      return forbidden("不能认证当前权限范围外或已归档的成员");
    }
    if (!canCertifyWriter(auth.actor, target)) return forbidden("当前管理员不能认证该成员为文案岗");

    const certification = await deps.saveWriterCertification({
      supabase: adminSupabase,
      userId: payload.data.userId,
      certified: payload.data.certified,
      certifiedBy: auth.actor.userId,
      certifiedByName: auth.actor.name?.trim() || "未命名管理员",
    });
    return NextResponse.json({ data: certification });
  } catch (error) {
    const message = error instanceof SupabaseQueryFailure ? error.publicMessage : "保存文案认证失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
