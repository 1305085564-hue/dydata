import assert from "node:assert/strict";
import test from "node:test";

import { resolveCreateSubmissionConflict } from "./create-conflict";

test("新建提交遇到同账号同业务日报或视频时返回409冲突", () => {
  assert.deepEqual(
    resolveCreateSubmissionConflict({
      mode: "create",
      existingReport: true,
      existingVideo: false,
    }),
    { status: 409, error: "该账号该业务日已提交，请勿重复提交" },
  );

  assert.deepEqual(
    resolveCreateSubmissionConflict({
      mode: "create",
      existingReport: false,
      existingVideo: true,
    }),
    { status: 409, error: "该账号该业务日已提交，请勿重复提交" },
  );
});

test("编辑模式允许进入既有绑定流程，新建模式无历史记录可继续", () => {
  assert.equal(
    resolveCreateSubmissionConflict({
      mode: "edit",
      existingReport: true,
      existingVideo: true,
    }),
    null,
  );
  assert.equal(
    resolveCreateSubmissionConflict({
      mode: "create",
      existingReport: false,
      existingVideo: false,
    }),
    null,
  );
});
