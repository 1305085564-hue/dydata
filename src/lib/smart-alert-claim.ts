/**
 * 智能告警发送前原子去重（claim-then-send）
 *
 * 数据库兜底（supabase/migrations/20260823020000_audit_logs_smart_alert_dedupe.sql）：
 * audit_logs 对 (detail->>'dedupeKey') 建部分唯一索引，覆盖
 * action ∈ ('smart_alert_claim','smart_alert')。因此发送前插入 claim
 * 行是原子的：
 * - 插入成功 → 本请求获得该告警的发送权并持有行 id；
 * - 唯一冲突（23505）→ 其他请求已抢占或已发送成功，跳过；
 * - 其他错误 → 记为抢占失败，调用方必须显式暴露。
 *
 * 状态机：
 *   claim(action='smart_alert_claim')
 *     ├─ 发送成功 → 流转为 action='smart_alert'（历史去重依据）
 *     └─ 发送失败 → 删除 claim 行释放重试资格，另写 smart_alert_failed
 *
 * 边界：进程在「已投递、未流转」时崩溃会留下滞留 claim 行，
 * 阻塞该 dedupeKey 重发（宁可不发不重复打扰），需人工清理。
 * 这是 at-most-one active sender，不是 exactly-once。
 */

export type SmartAlertLike = {
  userId: string | null;
  accountName: string | null;
  userName: string | null;
  tag: string | null;
  type: string;
  dedupeKey: string;
};

export type ClaimedAlert<T extends SmartAlertLike> = {
  id: string;
  alert: T;
};

export type SmartAlertClaimOutcome<T extends SmartAlertLike> = {
  claims: Array<ClaimedAlert<T>>;
  skippedConcurrentKeys: string[];
  claimFailedKeys: string[];
};

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

export async function claimSmartAlerts<T extends SmartAlertLike>(
  client: unknown,
  alerts: T[],
): Promise<SmartAlertClaimOutcome<T>> {
  const outcome: SmartAlertClaimOutcome<T> = {
    claims: [],
    skippedConcurrentKeys: [],
    claimFailedKeys: [],
  };

  for (const alert of alerts) {
    try {
      const { data, error } = await (client as AnyClient)
        .from("audit_logs")
        .insert({
          user_id: alert.userId,
          action: "smart_alert_claim",
          target: alert.accountName ?? alert.userName ?? alert.tag ?? "smart-alert",
          // 写入完整告警信息：发送成功后本行直接流转为 smart_alert，
          // 与旧「发送后另插一行」的历史记录内容等价
          detail: JSON.stringify(alert),
        })
        .select("id");

      if (error) {
        if (errorCode(error) === "23505") {
          outcome.skippedConcurrentKeys.push(alert.dedupeKey);
        } else {
          outcome.claimFailedKeys.push(alert.dedupeKey);
        }
        continue;
      }

      const rows = (data ?? []) as Array<{ id: string }>;
      const id = rows[0]?.id;
      if (!id) {
        outcome.claimFailedKeys.push(alert.dedupeKey);
        continue;
      }
      outcome.claims.push({ id, alert });
    } catch {
      outcome.claimFailedKeys.push(alert.dedupeKey);
    }
  }

  return outcome;
}

/** 发送成功后把 claim 行流转为 smart_alert；失败返回流转成功的 id 列表 */
export async function markSmartAlertClaimsSent(
  client: unknown,
  claimIds: string[],
): Promise<{ ok: boolean; transitionedIds: string[] }> {
  if (claimIds.length === 0) return { ok: true, transitionedIds: [] };
  try {
    const { data, error } = await (client as AnyClient)
      .from("audit_logs")
      .update({ action: "smart_alert" })
      .in("id", claimIds)
      .eq("action", "smart_alert_claim")
      .select("id");
    if (error) return { ok: false, transitionedIds: [] };
    const rows = (data ?? []) as Array<{ id: string }>;
    const transitionedIds = rows.map((row) => row.id);
    return { ok: transitionedIds.length === claimIds.length, transitionedIds };
  } catch {
    return { ok: false, transitionedIds: [] };
  }
}

/**
 * 发送失败后释放 claim 行（删除），恢复该告警的重试资格；
 * 删除失败的 key 必须暴露——滞留 claim 会阻塞后续重发，需人工处理。
 */
export async function releaseSmartAlertClaims(
  client: unknown,
  claimIds: string[],
): Promise<{ ok: boolean; stuckKeysHintCount: number }> {
  if (claimIds.length === 0) return { ok: true, stuckKeysHintCount: 0 };
  try {
    const { error } = await (client as AnyClient)
      .from("audit_logs")
      .delete()
      .in("id", claimIds)
      .eq("action", "smart_alert_claim");
    if (error) return { ok: false, stuckKeysHintCount: claimIds.length };
    return { ok: true, stuckKeysHintCount: 0 };
  } catch {
    return { ok: false, stuckKeysHintCount: claimIds.length };
  }
}
