import assert from "node:assert/strict";
import test from "node:test";

import {
  BATCH5_CLEANUP_ORDER,
  buildBatch5FixtureLabels,
  buildBatch5DatePlan,
  classifyBatch5BatchOutcome,
  isExpectedConflict,
  isExpectedForbidden,
  isNextDayBatch5Upload,
  normalizeBatch5RunId,
  validateBatch5StoragePaths,
} from "./batch5-fixture-contract";

test("批次5精确清理顺序固定，业务夹具不允许模糊删除", () => {
  assert.deepEqual(BATCH5_CLEANUP_ORDER, [
    "script_usage_records",
    "video_tags",
    "video_metrics_snapshots",
    "videos",
    "daily_reports",
    "exemption_grants",
    "exemption_requests",
    "storage",
  ]);
});

test("run_id 和夹具标签必须稳定且带有统一运行标记", () => {
  assert.equal(normalizeBatch5RunId(" b5-20260829-abc12345 "), "b5-20260829-abc12345");
  assert.throws(() => normalizeBatch5RunId("production"), /格式不正确/);
  const labels = buildBatch5FixtureLabels("b5-20260829-abc12345");
  assert.match(labels.priorDayBaseReport, /^\[b5-20260829-abc12345\]/);
  assert.match(labels.priorDayBaseReport, /次日上传前一日基础数据/);
  assert.match(labels.priorDayT1Supplement, /前一日24小时数据补齐/);
  assert.match(labels.exemption, /审批夹具/);
});

test("批次5日期语义固定为上传日的前一日业务日", () => {
  assert.deepEqual(buildBatch5DatePlan("2026-08-29"), {
    uploadDate: "2026-08-29",
    businessDate: "2026-08-28",
  });
  assert.equal(
    isNextDayBatch5Upload({ uploadDate: "2026-08-29", businessDate: "2026-08-28" }),
    true,
  );
  assert.equal(
    isNextDayBatch5Upload({ uploadDate: "2026-08-29", businessDate: "2026-08-29" }),
    false,
  );
  assert.throws(() => buildBatch5DatePlan("2026-02-30"), /日期格式不正确/);
});

test("Storage清单只接受当前账号的截图路径，并拒绝越界和重复路径", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const accountId = "22222222-2222-4222-8222-222222222222";
  const paths = validateBatch5StoragePaths(
    [
      `${userId}/${accountId}/screenshot_2/retention.png`,
      `${userId}/${accountId}/screenshot_1/data.png`,
    ],
    { userId, accountId },
  );

  assert.deepEqual(paths, [
    `${userId}/${accountId}/screenshot_1/data.png`,
    `${userId}/${accountId}/screenshot_2/retention.png`,
  ]);
  assert.throws(
    () => validateBatch5StoragePaths(paths, { userId: "33333333-3333-4333-8333-333333333333", accountId }),
    /不属于当前夹具账号/,
  );
  assert.throws(
    () => validateBatch5StoragePaths([
      `${userId}/${accountId}/other-role/data.png`,
    ], { userId, accountId }),
    /截图槽位不正确/,
  );
  assert.throws(
    () => validateBatch5StoragePaths([
      `${userId}/${accountId}/screenshot_1/data.png`,
      `${userId}/${accountId}/screenshot_1/data.png`,
    ], { userId, accountId }),
    /存在重复路径/,
  );
});

test("批量状态机区分全成功、部分失败和网络失败", () => {
  assert.equal(classifyBatch5BatchOutcome([{ ok: true }, { ok: true }]), "all_success");
  assert.equal(classifyBatch5BatchOutcome([{ ok: true }, { ok: false }]), "partial_failure");
  assert.equal(classifyBatch5BatchOutcome([{ ok: false, networkError: true }, { ok: true }]), "network_failure");
  assert.equal(classifyBatch5BatchOutcome([]), "partial_failure");
});

test("403/409契约要求状态码和结构化 error，403可进一步要求稳定错误码", () => {
  assert.equal(isExpectedConflict(409, { error: "已存在" }), true);
  assert.equal(isExpectedConflict(200, { error: "已存在" }), false);
  assert.equal(isExpectedForbidden(403, { error: "请先申请加入团队" }), true);
  assert.equal(isExpectedForbidden(403, { error: "请先申请加入团队", code: "TEAM_MEMBERSHIP_REQUIRED" }, "TEAM_MEMBERSHIP_REQUIRED"), true);
  assert.equal(isExpectedForbidden(403, { error: "请先申请加入团队", code: "OTHER" }, "TEAM_MEMBERSHIP_REQUIRED"), false);
});
