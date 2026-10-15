import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20261014171416_unify_fulfillment_date_and_exemptions.sql",
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
