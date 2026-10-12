import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveDailyReportSubmissionTarget } from "./report-target";

test("新建或异常提交始终新建本次作品的日报，不复用同账号同业务日旧日报", () => {
  assert.deepEqual(
    resolveDailyReportSubmissionTarget({
      mode: "create",
      editBinding: null,
    }),
    { action: "insert", existingReport: null },
  );

  assert.deepEqual(
    resolveDailyReportSubmissionTarget({
      mode: "abnormal",
      editBinding: null,
    }),
    { action: "insert", existingReport: null },
  );
});

test("编辑提交只更新经过 video_id 校验的原日报", () => {
  const report = { id: "report-1", video_id: "video-1" };
  assert.deepEqual(
    resolveDailyReportSubmissionTarget({
      mode: "edit",
      editBinding: { ok: true, dailyReport: report },
    }),
    { action: "update", existingReport: report },
  );
});

test("提交落库阶段不能再按账号加业务日期读取旧日报", () => {
  const source = readFileSync(new URL("./route-core.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    source,
    /\.eq\("account_id", normalized\.account_id\)[\s\S]*?\.eq\("report_date", normalized\.biz_date\)[\s\S]*?\.maybeSingle\(\)/,
    "新建提交不能把同账号同业务日的旧日报当成本次作品的日报",
  );
});
