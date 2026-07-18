import test from "node:test";
import assert from "node:assert/strict";

import { pickUsageRecordFields, USAGE_RECORD_SELECT, VIOLATION_EVENT_SELECT } from "./service";

test("转化中心写接口只返回固定业务字段", () => {
  assert.doesNotMatch(USAGE_RECORD_SELECT, /\*/);
  assert.doesNotMatch(VIOLATION_EVENT_SELECT, /\*/);
  assert.match(USAGE_RECORD_SELECT, /\brecorded_by\b/);
  assert.match(VIOLATION_EVENT_SELECT, /\breported_by\b/);
});

test("原子替换 RPC 的返回值仍会经过字段白名单", () => {
  assert.deepEqual(pickUsageRecordFields({ id: "usage-1", internal_secret: "do-not-return" }), {
    id: "usage-1",
    case_id: undefined,
    recorded_by: undefined,
    account_id: undefined,
    account_name_snapshot: undefined,
    team_id: undefined,
    used_at: undefined,
    views: undefined,
    follows: undefined,
    conversion_rate: undefined,
    source: undefined,
    daily_report_id: undefined,
    note: undefined,
    result_flag: undefined,
    created_at: undefined,
    updated_at: undefined,
  });
});
