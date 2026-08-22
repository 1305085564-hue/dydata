import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFeishuAlertCard, dedupeAlerts, generateSmartAlerts, type SmartAlert } from "@/lib/smart-alert";
import { emit } from "@/lib/notifications/server";
import { filterActiveMemberships, loadWithMembershipFallback } from "@/lib/member-lifecycle";
import { sendFeishuWebhook } from "@/lib/飞书webhook";
import { logApiError, logApiRequest, resolveRequestId } from "@/lib/api-logger";
import {
  claimSmartAlerts,
  markSmartAlertClaimsSent,
  releaseSmartAlertClaims,
} from "@/lib/smart-alert-claim";

type AlertLogRow = {
  id: string;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  name: string;
  status: string | null;
  membership_status?: string | null;
};

type ReportRow = {
  user_id: string;
  report_date: string;
  play_count: number | null;
  account_id: string | null;
  submitter: string | null;
  accounts:
    | {
        id: string;
        name: string;
        content_direction: string | null;
      }
    | {
        id: string;
        name: string;
        content_direction: string | null;
      }[]
    | null;
};

// 缺 service role 配置时明确失败，禁止回退 anon key
function loadServiceClient(): SupabaseClient {
  return createAdminClient();
}

function extractAccount(row: ReportRow["accounts"]) {
  if (Array.isArray(row)) {
    return row[0] ?? null;
  }

  return row ?? null;
}

function parseExistingAlerts(rows: AlertLogRow[]): SmartAlert[] {
  return rows.flatMap((row) => {
    if (row.action !== "smart_alert") {
      return [];
    }

    try {
      const parsed = JSON.parse(row.detail ?? "{}") as Partial<SmartAlert>;
      if (typeof parsed.dedupeKey !== "string" || typeof parsed.type !== "string") {
        return [];
      }

      return [{
        id: row.id,
        type: parsed.type as SmartAlert["type"],
        userId: typeof parsed.userId === "string" ? parsed.userId : null,
        userName: typeof parsed.userName === "string" ? parsed.userName : null,
        accountId: typeof parsed.accountId === "string" ? parsed.accountId : null,
        accountName: typeof parsed.accountName === "string" ? parsed.accountName : null,
        tag: typeof parsed.tag === "string" ? parsed.tag : null,
        evidence: typeof parsed.evidence === "string" ? parsed.evidence : "",
        suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
        createdAt: row.created_at,
        dedupeKey: parsed.dedupeKey,
      }];
    } catch {
      return [];
    }
  });
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 缺 service role 配置时明确失败，禁止回退 anon key（先于 webhook 配置检查）
  let supabase: SupabaseClient;
  try {
    supabase = loadServiceClient();
  } catch (error) {
    return NextResponse.json(
      { error: `服务端配置缺失：${error instanceof Error ? error.message : "unknown"}` },
      { status: 500 },
    );
  }

  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "FEISHU_WEBHOOK_URL not configured" }, { status: 500 });
  }
  const since = new Date(Date.now() - 10 * 86400000).toISOString().split("T")[0];
  const auditSince = new Date(Date.now() - 2 * 86400000).toISOString();

  const [{ data: reports, error: reportsError }, profilesResult, { data: auditLogs, error: auditError }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("user_id, report_date, play_count, account_id, submitter, accounts(id, name, content_direction)")
      .gte("report_date", since)
      .order("report_date", { ascending: false }),
    loadWithMembershipFallback({
      loadWithMembership: async () => supabase.from("profiles").select("id, name, status, membership_status"),
      loadWithoutMembership: async () => supabase.from("profiles").select("id, name, status"),
    }),
    supabase
      .from("audit_logs")
      .select("id, action, target, detail, created_at")
      .eq("action", "smart_alert")
      .gte("created_at", auditSince)
      .order("created_at", { ascending: false }),
  ]);
  const profilesError = profilesResult.error;
  const profiles = filterActiveMemberships((profilesResult.data ?? []) as ProfileRow[]);

  if (reportsError) {
    return NextResponse.json({ error: reportsError.message }, { status: 500 });
  }

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }

  const activeProfileIds = new Set(profiles.map((profile) => profile.id));
  const normalizedReports = ((reports ?? []) as ReportRow[])
    .filter((report) => activeProfileIds.has(report.user_id))
    .map((report) => {
    const account = extractAccount(report.accounts);

    return {
      userId: report.user_id,
      userName: report.submitter?.trim() || account?.name || "未知",
      accountId: report.account_id,
      accountName: account?.name ?? null,
      tag: account?.content_direction?.trim() || null,
      reportDate: report.report_date,
      playCount: report.play_count ?? 0,
    };
    });

  const normalizedProfiles = ((profiles ?? []) as ProfileRow[]).map((profile) => ({
    userId: profile.id,
    userName: profile.name,
    status: profile.status,
  }));

  const generatedAlerts = generateSmartAlerts({
    reports: normalizedReports,
    profiles: normalizedProfiles,
  });
  const freshAlerts = dedupeAlerts(generatedAlerts, parseExistingAlerts((auditLogs ?? []) as AlertLogRow[]));

  if (freshAlerts.length === 0) {
    return NextResponse.json({ ok: true, pushed: 0, alerts: [] });
  }

  // ── 发送前原子抢占（claim-then-send）──
  // 数据库兜底见 supabase/migrations/20260823020000_audit_logs_smart_alert_dedupe.sql；
  // migration 未执行时专用 claim 表不存在，抢占会失败并明确返回 claimFailedKeys，
  // 不伪装成已经具备跨实例并发幂等。
  const requestId = resolveRequestId(request);
  const claimOutcome = await claimSmartAlerts(supabase, freshAlerts);

  if (claimOutcome.claimFailedKeys.length > 0) {
    logApiError(
      {
        requestId,
        route: "/api/smart-alert/notify",
        method: request.method,
        detail: { outcome: "claim_failed", keys: claimOutcome.claimFailedKeys },
      },
      new Error("部分告警发送锁抢占失败，本轮跳过这些告警"),
    );
  }

  const claimedAlerts = claimOutcome.claims.map((claim) => claim.alert);

  if (claimedAlerts.length === 0) {
    logApiRequest({
      requestId,
      route: "/api/smart-alert/notify",
      method: request.method,
      status: 200,
      outcome: "skipped_concurrent_claim",
      detail: {
        skippedConcurrent: claimOutcome.skippedConcurrentKeys.length,
        claimFailed: claimOutcome.claimFailedKeys.length,
      },
    });
    return NextResponse.json({
      ok: true,
      pushed: 0,
      alerts: [],
      skippedConcurrentKeys: claimOutcome.skippedConcurrentKeys,
      claimFailedKeys: claimOutcome.claimFailedKeys,
    });
  }

  const payload = buildFeishuAlertCard(claimedAlerts);
  const sendResult = await sendFeishuWebhook(payload, { webhookUrl });

  if (!sendResult.ok) {
    // 先释放 claim 行（恢复重试资格），释放失败必须暴露（滞留会阻塞后续重发）
    const released = await releaseSmartAlertClaims(
      supabase,
      claimOutcome.claims.map((claim) => claim.id),
    );

    // 持久化失败记录（action 与 smart_alert 区分，不会被去重解析当成已发告警）
    const failedAuditAlerts = claimedAlerts.filter((alert) => alert.userId !== null);
    const { error: failAuditError } = failedAuditAlerts.length
      ? await supabase.from("audit_logs").insert(
          failedAuditAlerts.map((alert) => ({
            user_id: alert.userId,
            action: "smart_alert_failed",
            target: alert.accountName ?? alert.userName ?? alert.tag ?? "smart-alert",
            detail: JSON.stringify({
              dedupeKey: alert.dedupeKey,
              type: alert.type,
              failureReason: sendResult.reason,
              httpStatus: sendResult.status ?? null,
            }),
          })),
        )
      : { error: null };
    if (failAuditError) {
      logApiError(
        {
          requestId,
          route: "/api/smart-alert/notify",
          method: request.method,
          status: 502,
          detail: { outcome: "failed_audit_write_error", alerts: claimedAlerts.length },
        },
        new Error("smart_alert_failed 审计记录写入失败"),
      );
    }
    logApiError(
      {
        requestId,
        route: "/api/smart-alert/notify",
        method: request.method,
        status: 502,
        detail: {
          reason: sendResult.reason,
          httpStatus: sendResult.status ?? null,
          claimReleaseFailed: !released.ok,
        },
      },
      new Error("飞书告警 webhook 发送失败"),
    );
    return NextResponse.json(
      {
        error: `飞书告警发送失败：${sendResult.reason}`,
        warning: [
          failAuditError ? "发送失败审计记录未落库，失败可能无法追溯" : null,
          !released.ok
            ? `claim 释放失败：${released.stuckKeysHintCount} 条滞留记录将阻塞对应告警重发，需人工清理 smart_alert_claims 中 status='claimed' 的行`
            : null,
        ].filter(Boolean).join("；") || undefined,
      },
      { status: 502 },
    );
  }

  // 成功流转是去重依据；流转失败意味着滞留 claim 会阻塞重发，
  // 消息已实际发出，不能伪装成完全成功，必须显式暴露
  const sentTransition = await markSmartAlertClaimsSent(
    supabase,
    claimOutcome.claims.map((claim) => claim.id),
  );
  if (!sentTransition.ok) {
    logApiError(
      {
        requestId,
        route: "/api/smart-alert/notify",
        method: request.method,
        status: 200,
        detail: { outcome: "sent_transition_error", pushed: claimedAlerts.length },
      },
      new Error("smart_alert 审计流转失败，滞留 claim 将阻塞该告警当日重发"),
    );
  }

  logApiRequest({
    requestId,
    route: "/api/smart-alert/notify",
    method: request.method,
    status: 200,
    outcome: "sent",
    detail: {
      pushed: claimedAlerts.length,
      skippedConcurrent: claimOutcome.skippedConcurrentKeys.length,
      transitionErrors: sentTransition.ok ? 0 : claimedAlerts.length - sentTransition.transitionedIds.length,
    },
  });

  const successAuditAlerts = claimedAlerts.filter((alert) => alert.userId !== null);
  const { error: successAuditError } = successAuditAlerts.length
    ? await supabase.from("audit_logs").insert(
        successAuditAlerts.map((alert) => ({
          user_id: alert.userId,
          action: "smart_alert",
          target: alert.accountName ?? alert.userName ?? alert.tag ?? "smart-alert",
          detail: JSON.stringify(alert),
        })),
      )
    : { error: null };

  if (successAuditError) {
    logApiError(
      {
        requestId,
        route: "/api/smart-alert/notify",
        method: request.method,
        status: 200,
        detail: { outcome: "success_audit_write_error", pushed: successAuditAlerts.length },
      },
      new Error("smart_alert 成功审计记录写入失败"),
    );
  }

  // 同步往通知中心推送：当事人可见（admin 在站内可见所有告警的方式由后续 admin 看板承接）
  for (const alert of claimedAlerts) {
    if (!alert.userId) continue;
    await emit({
      recipients: [alert.userId],
      type: `alert.${alert.type}`,
      category: "feed",
      severity: "warning",
      title: alert.evidence ? `异常提醒：${alert.evidence}` : "数据异常提醒",
      body: alert.suggestion ?? null,
      sourceType: "smart_alert",
      sourceId: alert.dedupeKey,
      payload: {
        accountId: alert.accountId,
        accountName: alert.accountName,
        tag: alert.tag,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    pushed: claimedAlerts.length,
    alerts: claimedAlerts,
    skippedConcurrentKeys: claimOutcome.skippedConcurrentKeys,
    claimFailedKeys: claimOutcome.claimFailedKeys,
    warning: [
      !sentTransition.ok
        ? "告警 claim 流转失败（仍为 claimed）：不会重复打扰，但该批告警当日不会再补发，需人工清理"
        : null,
      successAuditError ? "smart_alert 成功审计记录写入失败，已发送告警仍由 claim 表防重复" : null,
    ].filter(Boolean).join("；") || undefined,
  });
}
