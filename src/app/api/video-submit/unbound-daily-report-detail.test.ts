import assert from "node:assert/strict";
import test from "node:test";

import { buildUnboundDailyReportDetail } from "./unbound-daily-report-detail";

const reportId = "423e4567-e89b-12d3-a456-426614174005";
const accountId = "223e4567-e89b-12d3-a456-426614174002";
const userId = "123e4567-e89b-12d3-a456-426614174001";
const bizDate = "2026-07-29";

test("无绑定视频的日报详情只暴露日报自身字段，不伪造视频信息", () => {
  const result = buildUnboundDailyReportDetail({
    dailyReport: {
      id: reportId,
      account_id: accountId,
      report_date: bizDate,
      data_source: "manual",
      script_author_user_id: userId,
      video_editor_user_id: null,
      operator_user_id: "323e4567-e89b-12d3-a456-426614174004",
    },
    assigneeProfiles: [{ userId, name: "张学", displayName: "张学", membershipStatus: "active" }],
    bizDate,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.detail.historyCapability, "read_only_missing_required_data");
  assert.equal(result.detail.reportId, reportId);
  assert.equal(result.detail.videoId, null);
  assert.equal(result.detail.dataSource, "manual");
  assert.equal(result.detail.meta.videoTitle, "");
  assert.equal(result.detail.metrics.playCount, null);
  assert.deepEqual(result.detail.assets, []);
  assert.deepEqual(result.detail.assigneeProfiles, [
    { userId, name: "张学", displayName: "张学", membershipStatus: "active" },
  ]);
});

test("无绑定视频的日报详情：日期不符或责任人格式错误时拒绝", () => {
  const base = {
    dailyReport: {
      id: reportId,
      account_id: accountId,
      report_date: bizDate,
      script_author_user_id: userId,
      video_editor_user_id: null,
      operator_user_id: null,
    },
    bizDate,
  };
  assert.equal(buildUnboundDailyReportDetail({ ...base, bizDate: "2026-07-30" }).ok, false);
  const invalidAssignee = buildUnboundDailyReportDetail({
    ...base,
    dailyReport: { ...base.dailyReport, operator_user_id: "not-a-uuid" },
  });
  assert.equal(invalidAssignee.ok, false);
  if (!invalidAssignee.ok) assert.match(invalidAssignee.error, /责任人格式错误/);
});
