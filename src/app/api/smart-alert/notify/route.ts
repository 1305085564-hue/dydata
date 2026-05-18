import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isCronAuthorized } from "@/lib/cron-auth";
import { buildFeishuAlertCard, dedupeAlerts, generateSmartAlerts, type SmartAlert } from "@/lib/smart-alert";
import { emit } from "@/lib/notifications/server";

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

function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey!);
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

  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "FEISHU_WEBHOOK_URL not configured" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const since = new Date(Date.now() - 10 * 86400000).toISOString().split("T")[0];
  const auditSince = new Date(Date.now() - 2 * 86400000).toISOString();

  const [{ data: reports, error: reportsError }, { data: profiles, error: profilesError }, { data: auditLogs, error: auditError }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("user_id, report_date, play_count, account_id, submitter, accounts(id, name, content_direction)")
      .gte("report_date", since)
      .order("report_date", { ascending: false }),
    supabase.from("profiles").select("id, name, status"),
    supabase
      .from("audit_logs")
      .select("id, action, target, detail, created_at")
      .eq("action", "smart_alert")
      .gte("created_at", auditSince)
      .order("created_at", { ascending: false }),
  ]);

  if (reportsError) {
    return NextResponse.json({ error: reportsError.message }, { status: 500 });
  }

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 });
  }

  const normalizedReports = ((reports ?? []) as ReportRow[]).map((report) => {
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
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: `Feishu webhook failed: ${text}` }, { status: 500 });
  }

  await supabase.from("audit_logs").insert(
    freshAlerts.map((alert) => ({
      user_id: alert.userId,
      action: "smart_alert",
      target: alert.accountName ?? alert.userName ?? alert.tag ?? "smart-alert",
      detail: JSON.stringify(alert),
    }))
  );

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
  });
}
