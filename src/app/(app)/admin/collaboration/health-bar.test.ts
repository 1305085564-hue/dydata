import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAttributionUpdate,
  calculateAttributionCompleteness,
  isAttributionComplete,
} from "./health-bar";

test("岗位仍有待补归属时完整度不能四舍五入成 100%", () => {
  assert.equal(calculateAttributionCompleteness({ total: 201, unattributed: 1 }), 99);
  assert.equal(calculateAttributionCompleteness({ total: 201, unattributed: 0 }), 100);
});

test("补录单个角色后只更新本地行，三岗补齐时标记待移除", () => {
  const report = {
    reportId: "report-1",
    reportDate: "2026-09-05",
    accountId: "account-1",
    accountName: "账号 A",
    title: "作品 A",
    playCount: 1000,
    creatorUserId: "creator-1",
    creatorName: "达人 A",
    scriptAuthorUserId: "writer-1",
    scriptAuthorName: "文案 A",
    videoEditorUserId: "editor-1",
    videoEditorName: "剪辑 A",
    operatorUserId: null,
    operatorName: null,
  };

  const updated = applyAttributionUpdate(report, "operator", "operator-1", "运营 A");

  assert.equal(updated.operatorUserId, "operator-1");
  assert.equal(updated.operatorName, "运营 A");
  assert.equal(updated.scriptAuthorName, "文案 A");
  assert.equal(updated.videoEditorName, "剪辑 A");
  assert.equal(updated.pendingRemoval, true);
  assert.equal(isAttributionComplete(updated), true);
});
