/**
 * 催交并发幂等抢占（claim-then-send）
 *
 * 发送前先为每个成员写入 status='sending' 的占位记录作为当日发送锁：
 * - 插入成功 → 本请求获得该成员的发送权；
 * - 唯一冲突（23505）→ 并发请求已抢占或已发送，跳过；
 * - check 约束拒绝（23514）→ 说明生产尚未执行
 *   `20260823000000_remind_logs_claim_idempotency.sql`（status 还不允许
 *   'sending'），返回 legacy 模式，由调用方退回「查询守卫」旧行为（止血级）。
 *
 * 注意：legacy 模式下没有数据库唯一约束兜底，无法实现严格并发幂等，
 * 只能靠普通查询降低重复概率——这是已知的降级状态，不是完整方案。
 */

export type RemindClaimMember = {
  user_id: string;
  name: string;
};

export type RemindClaimOutcome = {
  /** claimed=抢占成功可发送；legacy=数据库未支持 sending，退回旧流程 */
  mode: "claimed" | "legacy";
  claimed: RemindClaimMember[];
  skippedConcurrent: RemindClaimMember[];
  claimFailedNames: string[];
};

type InsertError = {
  code?: string;
  message?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function claimDailyReminders(
  client: unknown,
  targetDate: string,
  members: RemindClaimMember[],
): Promise<RemindClaimOutcome> {
  const outcome: RemindClaimOutcome = {
    mode: "claimed",
    claimed: [],
    skippedConcurrent: [],
    claimFailedNames: [],
  };

  for (const member of members) {
    let error: InsertError | null = null;
    try {
      const result = await (client as AnyClient)
        .from("remind_logs")
        .insert({
          target_date: targetDate,
          user_id: member.user_id,
          user_name: member.name,
          status: "sending",
          is_exempted: false,
        });
      error = (result?.error ?? null) as InsertError | null;
    } catch (thrown) {
      error = thrown instanceof Error ? { message: thrown.message } : { message: String(thrown) };
    }

    if (!error) {
      outcome.claimed.push(member);
      continue;
    }

    if (error.code === "23505") {
      // 并发请求已抢占该成员当日提醒
      outcome.skippedConcurrent.push(member);
      continue;
    }

    if (error.code === "23514") {
      // 'sending' 被 check 约束拒绝 → migration 未执行，退回旧行为
      return { mode: "legacy", claimed: [], skippedConcurrent: [], claimFailedNames: [] };
    }

    outcome.claimFailedNames.push(member.name);
  }

  return outcome;
}

/** 把 sending 占位批量流转到目标状态；失败返回 false（调用方必须显式暴露） */
export async function transitionRemindClaims(
  client: unknown,
  params: {
    targetDate: string;
    userIds: string[];
    toStatus: "success" | "failed";
    responseBody?: string | null;
  },
): Promise<boolean> {
  if (params.userIds.length === 0) return true;

  try {
    const update: Record<string, unknown> = { status: params.toStatus };
    if (params.responseBody !== undefined) {
      update.response_body = params.responseBody;
    }
    const { error } = await (client as AnyClient)
      .from("remind_logs")
      .update(update)
      .eq("target_date", params.targetDate)
      .in("user_id", params.userIds)
      .eq("status", "sending");
    return !error;
  } catch {
    return false;
  }
}
