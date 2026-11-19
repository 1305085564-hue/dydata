import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parse } from "dotenv";

import { summarizeMonthFulfillment } from "./dashboard-panel-header";
import { getAllExemptionDates, type ExemptionGrantLike, type ExemptionProfileLike } from "./豁免";
import { resolveDashboardFulfillmentMarks, type FulfillmentMarkRow } from "./loaders/dashboard-fulfillment-marks";
import { getPublishedDateKey } from "./date-semantics";

const { Client } = createRequire(import.meta.url)("pg");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const env = parse(readFileSync(".env.ai-test.local", "utf8"));

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function inTransaction(body: (db: Db, today: string) => Promise<void>) {
  const url = new URL(env.SUPABASE_DB_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "只允许本机测试库");
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query("begin");
    const { rows } = await db.query("select current_date::text as today");
    await body(db, rows[0].today);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}

test("工作台漏交天数与发布管理履约函数逐日一致", async () => {
  await inTransaction(async (db, today) => {
    const ownerId = randomUUID();
    const memberId = randomUUID();
    const teamId = randomUUID();
    const accountId = randomUUID();
    const leaveRequestId = randomUUID();
    const waiveRequestId = randomUUID();
    const joinedDate = shiftDate(today, -10);
    const publishedDate = shiftDate(today, -9);
    const leaveDate = shiftDate(today, -8);
    const waivedDate = shiftDate(today, -7);
    const confirmedDate = shiftDate(today, -6);
    const absentDate = shiftDate(today, -5);
    const missingDateA = shiftDate(today, -4);
    const missingDateB = shiftDate(today, -2);

    await db.query("insert into auth.users(id) values ($1), ($2)", [ownerId, memberId]);
    await db.query("insert into public.teams(id, name) values ($1, $2)", [teamId, `履约对账-${teamId.slice(0, 8)}`]);
    await db.query(
      `insert into public.profiles(id, name, role, company_role, team_id, created_at)
       values ($1, '对账负责人', 'owner', 'company_owner', $3, $4::date),
              ($2, '对账成员', 'member', 'member', $3, $4::date)`,
      [ownerId, memberId, teamId, joinedDate],
    );
    await db.query("insert into public.accounts(id, profile_id, name) values ($1, $2, '履约对账账号')", [accountId, memberId]);

    await db.query(
      `insert into public.daily_reports(user_id, account_id, report_date, published_at, title, submitter, play_count)
       values ($1, $2, $3::date, ($3::date + time '09:00') at time zone 'Asia/Shanghai', '已发夹具', '对账成员', 100)`,
      [memberId, accountId, publishedDate],
    );

    for (const [requestId, date, category] of [
      [leaveRequestId, leaveDate, "leave"],
      [waiveRequestId, waivedDate, "waive"],
    ] as const) {
      await db.query(
        `insert into public.exemption_request(id, applicant_user_id, team_id, exemption_type, exemption_category, start_date, end_date, request_status, reviewed_by, reviewed_at)
         values ($1, $2, $3, 'single', $4, $5::date, $5::date, 'approved', $6, now())`,
        [requestId, memberId, teamId, category, date, ownerId],
      );
      await db.query(
        `insert into public.exemption_grant(request_id, user_id, team_id, start_date, end_date, grant_type, exemption_category, status)
         values ($1, $2, $3, $4::date, $4::date, 'single', $5, 'active')`,
        [requestId, memberId, teamId, date, category],
      );
    }

    await db.query(
      `insert into public.fulfillment_records(user_id, record_date, status, reason, marked_by, team_id)
       values ($1, $2::date, 'confirmed_published', '管理员确认已发', $3, $4),
              ($1, $5::date, 'absent', '管理员认定缺勤', $3, $4),
              ($1, $6::date, 'confirmed_published', '管理员确认已发', $3, $4),
              ($1, $7::date, 'confirmed_published', '管理员确认已发', $3, $4),
              ($1, $8::date, 'confirmed_published', '管理员确认已发', $3, $4)`,
      [memberId, confirmedDate, ownerId, teamId, absentDate, joinedDate, shiftDate(today, -3), shiftDate(today, -1)],
    );
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);

    const { rows } = await db.query(
      `select record_date::text, status, reason
       from public.get_fulfillment_range($1::date, $2::date, array[$3::uuid], null, null)
       order by record_date`,
      [joinedDate, today, memberId],
    );
    const statuses = Object.fromEntries(rows.map((row: { record_date: string; status: string }) => [row.record_date, row.status]));
    assert.equal(statuses[publishedDate], "published");
    assert.equal(statuses[leaveDate], "leave");
    assert.equal(statuses[waivedDate], "exempted");
    assert.equal(statuses[confirmedDate], "confirmed_published");
    assert.equal(statuses[absentDate], "absent");
    assert.equal(statuses[missingDateA], "unconfirmed");
    assert.equal(statuses[missingDateB], "unconfirmed");
    assert.equal(statuses[today], "unconfirmed");

    const managementMissedCount = rows.filter(
      (row: { record_date: string; status: string }) => row.record_date < today && ["unconfirmed", "absent"].includes(row.status),
    ).length;

    const { rows: reportRows } = await db.query(
      `select report_date::text, published_at
       from public.daily_reports
       where account_id = $1 and is_void = false and report_date between $2::date and $3::date
       order by report_date`,
      [accountId, joinedDate, today],
    );
    assert.equal(new Date(reportRows[0].published_at).toISOString().slice(0, 10), publishedDate);
    assert.deepEqual(
      reportRows.map((row: { report_date: string; published_at: string | null }) => getPublishedDateKey(row)),
      [publishedDate],
    );
    const { rows: markRows } = await db.query(
      `select record_date::text, status, reason
       from public.fulfillment_records
       where user_id = $1 and record_date between $2::date and $3::date
       order by record_date`,
      [memberId, joinedDate, today],
    );
    const { rows: grantRows } = await db.query(
      `select user_id, start_date::text, end_date::text, grant_type, exemption_category, status, created_at
       from public.exemption_grant
       where user_id = $1 and status = 'active'
       order by created_at desc`,
      [memberId],
    );
    const profile: ExemptionProfileLike = {
      id: memberId,
      status: "active",
      exempt_type: null,
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: null,
      exemption_category: null,
    };
    const grants = grantRows as ExemptionGrantLike[];
    const exemptionDates = getAllExemptionDates(profile, grants);
    const dashboardMarks = resolveDashboardFulfillmentMarks(
      markRows as FulfillmentMarkRow[],
      `${joinedDate}T00:00:00+08:00`,
    );
    const dashboard = summarizeMonthFulfillment({
      today,
      submittedDates: reportRows
        .map((row: { report_date: string; published_at: string | null }) => getPublishedDateKey(row))
        .filter((date: string | null): date is string => Boolean(date)),
      exemptDates: [...exemptionDates.waiveDates, ...exemptionDates.leaveDates],
      ...dashboardMarks.monthFulfillmentBasis,
      exemptionProfile: profile,
      exemptionGrants: grants,
    });
    assert.deepEqual(dashboard, { submittedCount: 1, missedCount: managementMissedCount });
    assert.equal(managementMissedCount, 3);
  });
});

