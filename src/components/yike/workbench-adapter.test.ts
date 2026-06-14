import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyYikeWorkbench } from "./workbench-adapter";

test("API 未成功前一刻工作台为空数据，不携带 mock 事项 id", () => {
  const workbench = createEmptyYikeWorkbench("2026-06-14");

  assert.equal(workbench.workspace.name, "一刻");
  assert.equal(workbench.today, "2026-06-14");
  assert.equal(workbench.execution.primaryTaskId, null);
  assert.deepEqual(workbench.execution.candidateTaskIds, []);
  assert.deepEqual(workbench.execution.recommendedTasks, []);
  assert.equal(workbench.execution.projectFocus, null);
  assert.deepEqual(workbench.lanes.planned.items, []);
  assert.deepEqual(workbench.lanes.doing.items, []);
  assert.deepEqual(workbench.lanes.delegated.items, []);
  assert.deepEqual(workbench.lanes.done.items, []);
});
