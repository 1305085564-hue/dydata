"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { cancelJoinRequest, createJoinRequest } from "@/lib/team-join/service";

export type JoinActionResult = { ok: true } | { ok: false; error: string };

export async function submitJoinRequestAction(
  targetTeamId: string,
): Promise<JoinActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) {
    return { ok: false, error: "请先登录" };
  }

  if (!targetTeamId) {
    return { ok: false, error: "请选择团队" };
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

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelJoinRequestAction(
  requestId: string,
): Promise<JoinActionResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) {
    return { ok: false, error: "请先登录" };
  }

  const result = await cancelJoinRequest({
    requestId,
    applicantUserId: user.id,
  });

  if (!result.ok) {
    return { ok: false, error: "撤销失败，可能已被管理员处理" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
