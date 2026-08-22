/**
 * 催交严格并发抢占（claim-then-send）
 *
 * 数据库兜底（supabase/migrations/20260823010000_remind_logs_active_claim_unique.sql）：
 * 同一 (target_date, user_id) 非豁免成员，status ∈ {sending, success} 合计最多一行。
 * 因此 claim（插入 sending）是原子的：
 * - 插入成功 → 本请求获得该成员的发送权，并持有记录 id；
 * - 唯一冲突（23505）→ 查冲突行：
 *     · status=success → 当日已提醒，跳过；
 *     · status=sending 且新鲜（sent_at 在 CLAIM_STALE_MS 内）→ 并发请求活跃中，跳过；
 *     · status=sending 但已过期 → 视为崩溃残留，按条件原子接管
 *       （update ... where id=? and status='sending' and sent_at < cutoff，
 *       行锁保证只有一个接管者能改到这一行）；
 * - check 约束拒绝（23514）→ 生产尚未执行 migration（status 还不允许
 *   'sending'），返回 legacy 模式，调用方退回「查询守卫」旧行为（止血级）。
 *
 * 现实边界（必须如实宣传）：
 * - 本方案保证 at-most-one active claimant：同一时刻同一成员只有一个发送者；
 * - webhook 无幂等键，若「飞书已投递但进程在流转 success 前崩溃」，
 *   超时回收后的重发可能重复一条——不是 exactly-once；
 * - 滞留 sending 的自动恢复窗口为 CLAIM_STALE_MS，期间该成员当日不再重发。
 */

export type RemindClaimMember = {
  user_id: string;
  name: string;
};

/** 抢到的 claim：持有数据库记录 id，流转只允许按这批 id 进行 */
export type ActiveClaim = {
  id: string;
  member: RemindClaimMember;
};

export type RemindClaimOutcome = {
  /** claimed=抢占成功可发送；legacy=数据库未支持 sending，退回旧流程 */
  mode: "claimed" | "legacy";
  claims: ActiveClaim[];
  skippedConcurrent: RemindClaimMember[];
  claimFailedNames: string[];
};

/** sending 占位超过该时长视为死抢占，可被后续触发原子接管 */
export const CLAIM_STALE_MS = 10 * 60_000;

type PgError = {
  code?: string;
  message?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as PgError).code) || undefined;
  }
  return undefined;
}

async function tryStealStaleClaim(
  client: unknown,
  params: { claimId: string; cutoffIso: string },
): Promise<string | null> {
  try {
    const { data } = await (client as AnyClient)
      .from("remind_logs")
      .update({ status: "sending", sent_at: new Date().toISOString(), response_body: null })
      .eq("id", params.claimId)
      .eq("status", "sending")
      // 条件更新：行锁保证并发接管者中只有一个能成功
      .lt("sent_at", params.cutoffIso)
      .select("id");
    const rows = (data ?? []) as Array<{ id: string }>;
    return rows.length > 0 ? (rows[0]?.id ?? null) : null;
  } catch {
    return null;
  }
}

export async function claimDailyReminders(
  client: unknown,
  targetDate: string,
  members: RemindClaimMember[],
  options: { now?: () => Date; staleMs?: number } = {},
): Promise<RemindClaimOutcome> {
  const now = options.now ?? (() => new Date());
  const staleMs = options.staleMs ?? CLAIM_STALE_MS;

  const outcome: RemindClaimOutcome = {
    mode: "claimed",
    claims: [],
    skippedConcurrent: [],
    claimFailedNames: [],
  };

  for (const member of members) {
    let insertedId: string | null = null;
    let insertError: unknown = null;

    try {
      const { data, error } = await (client as AnyClient)
        .from("remind_logs")
        .insert({
          target_date: targetDate,
          user_id: member.user_id,
          user_name: member.name,
          status: "sending",
          is_exempted: false,
        })
        .select("id");
      insertError = error ?? null;
      if (!error) {
        const rows = (data ?? []) as Array<{ id: string }>;
        insertedId = rows[0]?.id ?? null;
      }
    } catch (thrown) {
      insertError = thrown;
    }

    if (!insertError) {
      if (insertedId) {
        outcome.claims.push({ id: insertedId, member });
      } else {
        // 没有 id 就无法安全流转，宁可当失败处理
        outcome.claimFailedNames.push(member.name);
      }
      continue;
    }

    if (errorCode(insertError) === "23505") {
      // 唯一索引拒绝：已有 active claim 或已 success。查明具体状态再决定接管或跳过
      let conflictRow: { id: string; status: string; sent_at: string | null } | null = null;
      try {
        const { data } = await (client as AnyClient)
          .from("remind_logs")
          .select("id, status, sent_at")
          .eq("target_date", targetDate)
          .eq("user_id", member.user_id)
          .in("status", ["success", "sending"])
          .order("sent_at", { ascending: false })
          .limit(1);
        conflictRow = ((data ?? []) as Array<{ id: string; status: string; sent_at: string | null }>)[0] ?? null;
      } catch {
        conflictRow = null;
      }

      if (!conflictRow) {
        outcome.claimFailedNames.push(member.name);
        continue;
      }

      if (conflictRow.status === "success") {
        outcome.skippedConcurrent.push(member);
        continue;
      }

      const sentAtMs = conflictRow.sent_at ? Date.parse(conflictRow.sent_at) : Number.NaN;
      const isFresh = Number.isFinite(sentAtMs) && now().getTime() - sentAtMs < staleMs;
      if (isFresh) {
        outcome.skippedConcurrent.push(member);
        continue;
      }

      const stolenId = await tryStealStaleClaim(client, {
        claimId: conflictRow.id,
        cutoffIso: new Date(now().getTime() - staleMs).toISOString(),
      });
      if (stolenId) {
        outcome.claims.push({ id: stolenId, member });
      } else {
        // 接管失败＝另一请求抢先接管或刚完成流转，保守跳过
        outcome.skippedConcurrent.push(member);
      }
      continue;
    }

    if (errorCode(insertError) === "23514") {
      // 'sending' 被 check 约束拒绝 → migration 未执行，退回旧行为
      return { mode: "legacy", claims: [], skippedConcurrent: [], claimFailedNames: [] };
    }

    outcome.claimFailedNames.push(member.name);
  }

  return outcome;
}

export type TransitionResult = {
  ok: boolean;
  /** 成功流转的 claim id；未流转成功的属于异常，调用方必须显式暴露 */
  transitionedIds: string[];
};

/** 把本请求抢到的 claim 按 id 流转到目标状态；绝不触碰其他请求的记录 */
export async function transitionRemindClaims(
  client: unknown,
  params: {
    claimIds: string[];
    toStatus: "success" | "failed";
    responseBody?: string | null;
  },
): Promise<TransitionResult> {
  if (params.claimIds.length === 0) {
    return { ok: true, transitionedIds: [] };
  }

  try {
    const update: Record<string, unknown> = { status: params.toStatus };
    if (params.responseBody !== undefined) {
      update.response_body = params.responseBody;
    }
    const { data, error } = await (client as AnyClient)
      .from("remind_logs")
      .update(update)
      .in("id", params.claimIds)
      .eq("status", "sending")
      .select("id");
    if (error) {
      return { ok: false, transitionedIds: [] };
    }
    const rows = (data ?? []) as Array<{ id: string }>;
    const transitionedIds = rows.map((row) => row.id);
    return { ok: transitionedIds.length === params.claimIds.length, transitionedIds };
  } catch {
    return { ok: false, transitionedIds: [] };
  }
}
