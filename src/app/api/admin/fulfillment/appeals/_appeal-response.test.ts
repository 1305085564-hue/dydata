import assert from "node:assert/strict";
import test from "node:test";
import { mapAppealRowForResponse } from "@/app/api/admin/fulfillment/appeals/_appeal-response";

const baseRow = {
  id: "appeal-1",
  user_id: "user-1",
  record_date: "2026-10-01",
  reason: "补交",
  status: "approved" as const,
  handler_id: "admin-1",
  handled_at: "2026-10-02T00:00:00Z",
  created_at: "2026-10-01T00:00:00Z",
};

const names = new Map([
  ["user-1", { name: "成员" }],
  ["admin-1", { name: "管理员" }],
]);

test("已批准且原始补交数据仍在时返回等待成员补传，且不透出原始数据", () => {
  const mapped = mapAppealRowForResponse(
    { ...baseRow, submission_payload: { assets: [{ url: "https://example.com/a.png" }] } },
    names,
  );
  assert.equal(mapped.resumePending, true);
  assert.equal("submission_payload" in mapped, false);
  assert.doesNotMatch(JSON.stringify(mapped), /assets|example\.com/);
  assert.equal(mapped.user_name, "成员");
  assert.equal(mapped.handler_name, "管理员");
});

test("已批准且原始补交数据已清空时返回数据已提交", () => {
  const mapped = mapAppealRowForResponse({ ...baseRow, submission_payload: null }, names);
  assert.equal(mapped.resumePending, false);
  assert.equal("submission_payload" in mapped, false);
});

test("未批准的行没有执行状态", () => {
  const pending = mapAppealRowForResponse({ ...baseRow, status: "pending", submission_payload: { assets: [] } }, names);
  assert.equal(pending.resumePending, null);

  const rejected = mapAppealRowForResponse(
    { ...baseRow, status: "rejected", handler_id: null, submission_payload: null },
    names,
  );
  assert.equal(rejected.resumePending, null);
  assert.equal(rejected.handler_name, null);
});
