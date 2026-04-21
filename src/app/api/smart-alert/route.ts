import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isCronAuthorized } from "@/lib/cron-auth";
import { generateSmartAlerts } from "@/lib/smart-alert";

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

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const since = new Date(Date.now() - 10 * 86400000).toISOString().split("T")[0];

  const [{ data: reports, error: reportsError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase
      .from("daily_reports")
      .select("user_id, report_date, play_count, account_id, submitter, accounts(id, name, content_direction)")
      .gte("report_date", since)
      .order("report_date", { ascending: false }),
    supabase.from("profiles").select("id, name, status"),
  ]);

  if (reportsError) {
    return NextResponse.json({ error: reportsError.message }, { status: 500 });
  }

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
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

  const alerts = generateSmartAlerts({
    reports: normalizedReports,
    profiles: normalizedProfiles,
  });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    count: alerts.length,
    alerts,
  });
}
