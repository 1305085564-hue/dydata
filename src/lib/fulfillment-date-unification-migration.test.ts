import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261015052202_unify_fulfillment_date_and_exemptions.sql",
  "utf8",
);
const publishedDateMigration = readFileSync(
  "supabase/migrations/20261109120000_unify_published_date_for_stats.sql",
  "utf8",
);

test("履约统一按视频上海发布日期计数，并保留无发布时间回退", () => {
  assert.match(migration, /coalesce\(\(v\.published_at at time zone 'Asia\/Shanghai'\)::date, dr\.report_date\)/i);
  assert.match(migration, /left join public\.videos v on v\.id = dr\.video_id/i);
  assert.match(migration, /or \(v\.published_at at time zone 'Asia\/Shanghai'\)::date between/i);
});

test("履约自动状态继续读取 active exemption_grant", () => {
  assert.match(migration, /from public\.exemption_grant eg/i);
  assert.match(migration, /eg\.status = 'active'/i);
  assert.match(migration, /when exists \([\s\S]*from grants gr/i);
});

test("履约只统计有效日报，并保留人工标记优先级", () => {
  assert.match(migration, /coalesce\(dr\.is_void, false\) = false/i);
  assert.match(migration, /when m\.mark_status is not null then m\.mark_status/i);
});

test("排行榜与履约 RPC 共用数据库发布日期函数，保留历史归属日回退", () => {
  const sql = publishedDateMigration
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.match(sql, /create or replace function public\.get_published_date_for_stats\(\s*p_published_at timestamp with time zone,\s*p_report_date date/i);
  assert.match(sql, /select coalesce\(\(p_published_at at time zone 'Asia\/Shanghai'\)::date, p_report_date\)/i);
  assert.match(sql, /create or replace function public\.get_leaderboard_rows\([\s\S]*?public\.get_published_date_for_stats\(v\.published_at, dr\.report_date\)[\s\S]*?grant execute on function public\.get_leaderboard_rows/i);
  assert.match(sql, /create or replace function public\.get_fulfillment_range\([\s\S]*?public\.get_published_date_for_stats\(v\.published_at, dr\.report_date\)[\s\S]*?grant execute on function public\.get_fulfillment_range/i);
  assert.doesNotMatch(sql, /\(v\.published_at at time zone 'Asia\/Shanghai'\)::date/i);
});
