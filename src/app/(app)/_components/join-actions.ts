"use server";

import { validActionIds } from "@/lib/server-action-input";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { revalidatePath } from "next/cache";

import { cancelJoinRequest, createJoinRequest } from "@/lib/team-join/service";

export type JoinActionResult = { ok: true } | { ok: false; error: string };

export async function submitJoinRequestAction(
  targetTeamId: string,
): Promise<JoinActionResult> {
  const { user } = await getCurrentUserContext();

  if (!user) {
    return { ok: false, error: "请先登录" };
  }

  if (!validActionIds(targetTeamId)) {
    return { ok: false, error: "团队还没选" };
  }

  const result = await createJoinRequest({
    applicantUserId: user.id,
    targetTeamId,
  });

  if (!result.ok) {
    if (result.error === "ALREADY_PENDING") {
      return { ok: false, error: "你已有一条待审申请，请先撤销后再申请其他团队" };
    }
    return { ok: false, error: "提交申请失败，请稍后重试" };
  }

  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function cancelJoinRequestAction(
  requestId: string,
): Promise<JoinActionResult> {
  const { user } = await getCurrentUserContext();

  if (!user) {
    return { ok: false, error: "请先登录" };
  }

  if (!validActionIds(requestId)) return { ok: false, error: "申请编号格式不正确" };

  const result = await cancelJoinRequest({
    requestId,
    applicantUserId: user.id,
  });

  if (!result.ok) {
    return { ok: false, error: "撤销失败，可能已被管理员处理" };
  }

  revalidatePath("/admin/modules");
  revalidatePath("/dashboard");
  return { ok: true };
}
