import assert from "node:assert/strict";
import test from "node:test";

import { resolveCreateSubmissionConflict } from "./create-conflict";

test("新建提交遇到同作品已存有效日报或视频时返回409冲突", () => {
  assert.deepEqual(
    resolveCreateSubmissionConflict({
      mode: "create",
      existingReportWithSameVideo: true,
      existingVideo: false,
    }),
    { status: 409, error: "该作品已录入，请勿重复提交" },
  );

  assert.deepEqual(
    resolveCreateSubmissionConflict({
      mode: "create",
      existingReportWithSameVideo: false,
      existingVideo: true,
    }),
    { status: 409, error: "该作品已录入，请勿重复提交" },
  );
});

test("编辑模式允许进入既有绑定流程，新建模式无相同作品记录可继续（支持同日多篇不同作品）", () => {
  assert.equal(
    resolveCreateSubmissionConflict({
      mode: "edit",
      existingReportWithSameVideo: true,
      existingVideo: true,
    }),
    null,
  );
  assert.equal(
    resolveCreateSubmissionConflict({
      mode: "create",
      existingReportWithSameVideo: false,
      existingVideo: false,
    }),
    null,
  );
});
