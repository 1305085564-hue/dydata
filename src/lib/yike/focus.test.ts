import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFocusCompletePlan,
  buildReplaceSlotPlan,
  selectNextProjectTaskId,
} from "./focus";
import type { YikeItemRow, YikeProjectRow } from "./types";

const userId = "user-1";
const workspaceId = "workspace-1";

function item(overrides: Partial<YikeItemRow> = {}): YikeItemRow {
  return {
    id: "item-1",
    workspace_id: workspaceId,
    user_id: userId,
    item_type: "task",
    status: "doing",
    title: "当前任务",
    note: null,
    raw_input: null,
    area_id: null,
    project_id: null,
    complexity: "small",
    time_bucket: "today",
    bucket_anchor_date: null,
    due_date: null,
    is_urgent: false,
    memo_granularity: "unknown",
    assignee_person_id: null,
    delegated_note: null,
    follow_up_bucket: null,
    source_memo_id: null,
    client_request_id: null,
    completed_at: null,
    archived_at: null,
    created_at: "2026-06-14T08:00:00.000Z",
    updated_at: "2026-06-14T08:00:00.000Z",
    ...overrides,
  };
}

function project(overrides: Partial<YikeProjectRow> = {}): YikeProjectRow {
  return {
    id: "project-1",
    workspace_id: workspaceId,
    user_id: userId,
    area_id: null,
    name: "一刻 V1",
    goal_note: null,
    acceptance_criteria: null,
    next_task_id: "task-1",
    archived_at: null,
    created_at: "2026-06-14T08:00:00.000Z",
    updated_at: "2026-06-14T08:00:00.000Z",
    ...overrides,
  };
}

test("完成当前任务但未选择继续时，只把当前项改 done", () => {
  const plan = buildFocusCompletePlan({
    currentItem: item({ id: "current", status: "doing" }),
    continueWithItem: null,
    now: "2026-06-14T08:30:00.000Z",
  });

  assert.deepEqual(plan.itemUpdates, [
    {
      itemId: "current",
      update: { status: "done", completed_at: "2026-06-14T08:30:00.000Z" },
    },
  ]);
  assert.equal(plan.slotUpdate, null);
});

test("完成当前任务并明确继续时，才把下一项转 doing 并放进主槽", () => {
  const plan = buildFocusCompletePlan({
    currentItem: item({ id: "current", status: "doing" }),
    continueWithItem: item({ id: "next", status: "planned" }),
    now: "2026-06-14T08:30:00.000Z",
  });

  assert.deepEqual(plan.itemUpdates, [
    {
      itemId: "current",
      update: { status: "done", completed_at: "2026-06-14T08:30:00.000Z" },
    },
    {
      itemId: "next",
      update: { status: "doing", completed_at: null },
    },
  ]);
  assert.deepEqual(plan.slotUpdate, {
    slotKey: "primary_task",
    itemId: "next",
    filledReason: "manual",
  });
});

test("替换执行槽属于明确动作，planned 项可转 doing", () => {
  assert.deepEqual(buildReplaceSlotPlan("candidate_1", item({ id: "candidate", status: "planned" })), {
    slotUpdate: {
      slotKey: "candidate_1",
      itemId: "candidate",
      filledReason: "manual",
    },
    itemUpdate: {
      itemId: "candidate",
      update: { status: "doing", completed_at: null },
    },
  });
});

test("项目下一步完成后推荐项目内下一条未完成任务，没有则返回 null", () => {
  assert.equal(
    selectNextProjectTaskId(
      project({ next_task_id: "task-1" }),
      [
        item({ id: "task-1", project_id: "project-1", status: "done", created_at: "2026-06-14T08:00:00.000Z" }),
        item({ id: "task-2", project_id: "project-1", status: "planned", created_at: "2026-06-14T08:01:00.000Z" }),
      ],
    ),
    "task-2",
  );

  assert.equal(
    selectNextProjectTaskId(
      project({ next_task_id: "task-1" }),
      [item({ id: "task-1", project_id: "project-1", status: "done" })],
    ),
    null,
  );
});
