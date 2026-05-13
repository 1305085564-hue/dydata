"use server";

import { revalidatePath } from "next/cache";

import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { reviewRequest } from "@/lib/team-join/service";

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const permission = await getUserPermissions();
  if (!permission) {
    return { ok: false, error: "请先登录" };
  }

  if (!hasPermission(permission.businessRole, permission.permissions, "manage_members")) {
    return { ok: false, error: "仅管理员可执行" };
  }

  return { ok: true };
}

export async function approveJoinRequestAction(
  requestId: string,
  note: string | null,
): Promise<ReviewActionResult> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const result = await reviewRequest({ requestId, action: "approve", note });
  if (!result.ok) {
    return { ok: false, error: mapReviewError(result.error) };
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectJoinRequestAction(
  requestId: string,
  note: string | null,
): Promise<ReviewActionResult> {
  const gate = await ensureAdmin();
  if (!gate.ok) return gate;

  const result = await reviewRequest({ requestId, action: "reject", note });
  if (!result.ok) {
    return { ok: false, error: mapReviewError(result.error) };
  }

  revalidatePath("/admin");
  return { ok: true };
}

function mapReviewError(code: string): string {
  switch (code) {
    case "already_reviewed":
      return "该申请已被其他管理员处理";
    case "not_found":
      return "申请不存在";
    case "forbidden":
      return "权限不足";
    case "unauthenticated":
      return "请先登录";
    default:
      return "操作失败，请稍后重试";
  }
}
