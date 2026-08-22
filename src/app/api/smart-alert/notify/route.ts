import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFeishuAlertCard, dedupeAlerts, generateSmartAlerts, type SmartAlert } from "@/lib/smart-alert";
import { emit } from "@/lib/notifications/server";
import { filterActiveMemberships, loadWithMembershipFallback } from "@/lib/member-lifecycle";
import { sendFeishuWebhook } from "@/lib/飞书webhook";
import { logApiError, logApiRequest, resolveRequestId } from "@/lib/api-logger";

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

  const payload = buildFeishuAlertCard(freshAlerts);
  const requestId = resolveRequestId(request);
  const sendResult = await sendFeishuWebhook(payload, { webhookUrl });

  if (!sendResult.ok) {
    // 持久化失败记录（action 与 smart_alert 区分，不会被去重解析当成已发告警）；
    // 不写成功 audit 记录 → 下轮运行会按 dedupeKey 自然补发，不会重复打扰
    const { error: failAuditError } = await supabase.from("audit_logs").insert(
      freshAlerts.map((alert) => ({
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
    );
    if (failAuditError) {
      logApiError(
        {
          requestId,
          route: "/api/smart-alert/notify",
          method: request.method,
          status: 502,
          detail: { outcome: "failed_audit_write_error", alerts: freshAlerts.length },
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
        detail: { reason: sendResult.reason, httpStatus: sendResult.status ?? null },
      },
      new Error("飞书告警 webhook 发送失败"),
    );
    return NextResponse.json(
      {
        error: `飞书告警发送失败：${sendResult.reason}`,
        warning: failAuditError ? "发送失败审计记录未落库，失败可能无法追溯" : undefined,
      },
      { status: 502 },
    );
  }

  logApiRequest({
    requestId,
    route: "/api/smart-alert/notify",
    method: request.method,
    status: 200,
    outcome: "sent",
    detail: { pushed: freshAlerts.length },
  });

  // 成功审计记录是 dedupeKey 去重的依据；落库失败意味着重复触发可能重复推送，
  // 消息已实际发出，不能伪装成完全成功，必须在响应中显式暴露
  const { error: successAuditError } = await supabase.from("audit_logs").insert(
    freshAlerts.map((alert) => ({
      user_id: alert.userId,
      action: "smart_alert",
      target: alert.accountName ?? alert.userName ?? alert.tag ?? "smart-alert",
      detail: JSON.stringify(alert),
    }))
  );
  if (successAuditError) {
    logApiError(
      {
        requestId,
        route: "/api/smart-alert/notify",
        method: request.method,
        status: 200,
        detail: { outcome: "success_audit_write_error", pushed: freshAlerts.length },
      },
      new Error("smart_alert 审计记录写入失败，下轮可能按 dedupeKey 重发"),
    );
  }

  // 同步往通知中心推送：当事人可见（admin 在站内可见所有告警的方式由后续 admin 看板承接）
  for (const alert of freshAlerts) {
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
    pushed: freshAlerts.length,
    alerts: freshAlerts,
    warning: successAuditError
      ? "告警审计记录未落库：重复触发可能重复推送，请检查 audit_logs 写入"
      : undefined,
  });
}
