import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_REPORT_WRITE_SELECT,
  SNAPSHOT_WRITE_SELECT,
  VIDEO_SUBMIT_RESPONSE_SELECT,
} from "./response-fields";

test("视频提交写入只返回后续流程需要的固定字段", () => {
  assert.doesNotMatch(VIDEO_SUBMIT_RESPONSE_SELECT, /\*/);
  assert.match(VIDEO_SUBMIT_RESPONSE_SELECT, /\bid\b/);
  assert.match(VIDEO_SUBMIT_RESPONSE_SELECT, /\buser_id\b/);
  assert.equal(SNAPSHOT_WRITE_SELECT, "id");
  assert.equal(DAILY_REPORT_WRITE_SELECT, "id");
});

test("提交成功响应必须返回 daily_report_id，供样本质量检查按日报 id 调用", () => {
  // 回归锁：2026-09-28 曾因前端把视频 id 当 reportId 传给
  // /api/dashboard/sample-quality-check 导致该按钮必然 404。
  // 后端成功响应必须携带 daily_report_id，前端必须用它发起检查。
  const submitRoute = readFileSync(new URL("./route-core.ts", import.meta.url), "utf8");
  assert.match(
    submitRoute,
    /daily_report_id:\s*persistedReport\.id/,
    "video-submit 成功响应必须返回本次落库的日报 id",
  );

  const qualityCheckControllerSource = readFileSync(
    new URL(
      "../../../app/(app)/dashboard/video-submit-form-v2/quality-check-controller.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    qualityCheckControllerSource,
    /reportId:\s*submittedReportId/,
    "样本质量检查必须使用提交响应返回的日报 id，而不是视频 id",
  );
  assert.doesNotMatch(
    qualityCheckControllerSource,
    /reportId:\s*submittedVideo\.id/,
    "禁止再把视频 id 当作 reportId 传给 sample-quality-check",
  );
});
