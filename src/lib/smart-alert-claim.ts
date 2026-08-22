/**
 * 智能告警发送前原子去重（claim-then-send）。
 *
 * claim 使用独立的 smart_alert_claims 表和 dedupe_key 原生唯一约束，
 * 不把 audit_logs.detail（历史上是 text）当作 JSON 查询或索引。
 * 发送成功后 claim 标记为 sent，并由调用方继续写 smart_alert 审计记录；
 * 发送失败则删除 claim，恢复重试资格。
 *
 * 进程在「已投递、尚未标记 sent」时崩溃会留下 claim，阻塞该告警重发，
 * 需人工清理。这是 at-most-one active sender，不是 exactly-once。
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

type QueryResult = {
  data: Array<{ id: string }> | null;
  error: { code?: string; message?: string } | null;
};

type QueryBuilder = {
  insert(payload: Record<string, unknown> | Array<Record<string, unknown>>): QueryBuilder;
  update(payload: Record<string, unknown>): QueryBuilder;
  delete(): QueryBuilder;
  select(columns?: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  lt(column: string, value: string): QueryBuilder;
  in(column: string, values: string[]): QueryBuilder;
  then(resolve: (value: QueryResult) => void, reject?: (reason: unknown) => void): void;
};

type ClaimClient = {
  from(table: "smart_alert_claims"): QueryBuilder;
};

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
      const claimClient = client as ClaimClient;
      const expirationCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { error: expireError } = await claimClient
        .from("smart_alert_claims")
        .update({ status: "expired" })
        .eq("dedupe_key", alert.dedupeKey)
        .eq("status", "sent")
        .lt("sent_at", expirationCutoff)
        .select("id");
      if (expireError) {
        outcome.claimFailedKeys.push(alert.dedupeKey);
        continue;
      }

      const { data, error } = await claimClient
        .from("smart_alert_claims")
        .insert({
          dedupe_key: alert.dedupeKey,
          user_id: alert.userId,
          target: alert.accountName ?? alert.userName ?? alert.tag ?? "smart-alert",
          payload: alert,
          status: "claimed",
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

      const id = data?.[0]?.id;
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

/** 发送成功后把 claim 标记为 sent；只流转仍属于本批请求的 claimed 行。 */
export async function markSmartAlertClaimsSent(
  client: unknown,
  claimIds: string[],
): Promise<{ ok: boolean; transitionedIds: string[] }> {
  if (claimIds.length === 0) return { ok: true, transitionedIds: [] };
  try {
    const { data, error } = await (client as ClaimClient)
      .from("smart_alert_claims")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .in("id", claimIds)
      .eq("status", "claimed")
      .select("id");
    if (error) return { ok: false, transitionedIds: [] };
    const transitionedIds = (data ?? []).map((row) => row.id);
    return { ok: transitionedIds.length === claimIds.length, transitionedIds };
  } catch {
    return { ok: false, transitionedIds: [] };
  }
}

/**
 * 发送失败后释放 claim，恢复重试资格；删除失败必须暴露，
 * 因为滞留 claim 会阻塞后续同 key 告警。
 */
export async function releaseSmartAlertClaims(
  client: unknown,
  claimIds: string[],
): Promise<{ ok: boolean; stuckKeysHintCount: number }> {
  if (claimIds.length === 0) return { ok: true, stuckKeysHintCount: 0 };
  try {
    const { error } = await (client as ClaimClient)
      .from("smart_alert_claims")
      .delete()
      .in("id", claimIds)
      .eq("status", "claimed");
    if (error) return { ok: false, stuckKeysHintCount: claimIds.length };
    return { ok: true, stuckKeysHintCount: 0 };
  } catch {
    return { ok: false, stuckKeysHintCount: claimIds.length };
  }
}
