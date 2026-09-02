import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("日期级豁免迁移具备申请明细、回填和部分审批原子流程", async () => {
  const sql = await readFile("supabase/migrations/20260902100000_exemption_daily_review.sql", "utf8");
  assert.match(sql, /create table if not exists public\.exemption_request_date/i);
  assert.match(sql, /request_date date not null/i);
  assert.match(sql, /status text not null default 'pending'/i);
  assert.match(sql, /feedback text/i);
  assert.match(sql, /generate_series\(r\.start_date/i);
  assert.match(sql, /create or replace function public\.review_exemption_request_dates_atomically/i);
  assert.match(sql, /where request_id = p_request_id and request_date = any\(v_dates\) and status = 'pending'/i);
  assert.match(sql, /request_status = case when v_pending > 0 then 'pending'/i);
  assert.match(sql, /grant_count/i);
  assert.match(sql, /create unique index if not exists exemption_grant_request_date_unique/i);
});
