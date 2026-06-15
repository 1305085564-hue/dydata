import test from "node:test";
import assert from "node:assert/strict";

import { buildYikeWorkbenchPayload, getYikeDueState } from "./read-model";
import type {
  YikeAreaRow,
  YikeExecutionSlotRow,
  YikeItemRow,
  YikeProjectRow,
} from "./types";

const userId = "user-1";
const workspace = {
  id: "workspace-1",
  user_id: userId,
  name: "此刻",
  created_at: "2026-06-14T08:00:00.000Z",
  updated_at: "2026-06-14T08:00:00.000Z",
};

function item(overrides: Partial<YikeItemRow> = {}): YikeItemRow {
  return {
    id: "item-1",
    workspace_id: workspace.id,
    user_id: userId,
    item_type: "task",
    status: "planned",
    title: "写方案",
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

function area(overrides: Partial<YikeAreaRow> = {}): YikeAreaRow {
  return {
    id: "area-1",
    workspace_id: workspace.id,
    user_id: userId,
    name: "产品",
    sort_order: 20,
    color: null,
    archived_at: null,
    created_at: "2026-06-14T08:00:00.000Z",
    updated_at: "2026-06-14T08:00:00.000Z",
    ...overrides,
  };
}

function project(overrides: Partial<YikeProjectRow> = {}): YikeProjectRow {
  return {
    id: "project-1",
    workspace_id: workspace.id,
    user_id: userId,
    area_id: null,
    name: "此刻 V1",
    goal_note: null,
    acceptance_criteria: null,
    next_task_id: null,
    archived_at: null,
    created_at: "2026-06-14T08:00:00.000Z",
    updated_at: "2026-06-14T08:00:00.000Z",
    ...overrides,
  };
}

function slot(overrides: Partial<YikeExecutionSlotRow>): YikeExecutionSlotRow {
  return {
    id: "slot-1",
    workspace_id: workspace.id,
    user_id: userId,
    slot_key: "primary_task",
    item_id: null,
    project_id: null,
    filled_reason: "manual",
    filled_at: "2026-06-14T08:30:00.000Z",
    created_at: "2026-06-14T08:00:00.000Z",
    updated_at: "2026-06-14T08:00:00.000Z",
    ...overrides,
  };
}

test("空数据 workbench 返回 1+2+1 空槽结构", () => {
  const payload = buildYikeWorkbenchPayload({
    workspace,
    today: "2026-06-14",
    areas: [],
    projects: [],
    people: [],
    items: [],
    slots: [],
  });

  assert.equal(payload.workspace.name, "此刻");
  assert.equal(payload.execution.primaryTask, null);
  assert.deepEqual(payload.execution.candidateTasks, []);
  assert.deepEqual(payload.execution.recommendedTasks, []);
  assert.equal(payload.execution.projectFocus, null);
  assert.deepEqual(payload.execution.emptySlots, [
    "primary_task",
    "candidate_1",
    "candidate_2",
    "project_focus",
  ]);
});

test("旧 workspace 展示名会归一为此刻", () => {
  const payload = buildYikeWorkbenchPayload({
    workspace: { ...workspace, name: "一刻" },
    today: "2026-06-14",
    areas: [],
    projects: [],
    people: [],
    items: [],
    slots: [],
  });

  assert.equal(payload.workspace.name, "此刻");
});

test("项目事项保留自己的领域分类，项目只作为独立归属", () => {
  const payload = buildYikeWorkbenchPayload({
    workspace,
    today: "2026-06-14",
    areas: [
      area({ id: "area-item", name: "事项旧领域", sort_order: 10 }),
      area({ id: "area-project", name: "项目领域", sort_order: 1 }),
    ],
    projects: [project({ id: "project-1", area_id: "area-project" })],
    people: [],
    items: [item({ id: "task-1", area_id: "area-item", project_id: "project-1" })],
    slots: [],
  });

  assert.equal(payload.lanes.planned.items[0]?.areaId, "area-item");
  assert.equal(payload.lanes.planned.items[0]?.projectId, "project-1");
});

test("状态栏按统一排序且计划做只返回前 10 条", () => {
  const rows = Array.from({ length: 12 }, (_, index) =>
    item({
      id: `planned-${String(index).padStart(2, "0")}`,
      title: `计划 ${index}`,
      area_id: index === 11 ? "area-fast" : null,
      complexity: index === 10 ? "deep" : "small",
      created_at: `2026-06-14T08:${String(index).padStart(2, "0")}:00.000Z`,
    }),
  );

  const payload = buildYikeWorkbenchPayload({
    workspace,
    today: "2026-06-14",
    areas: [area({ id: "area-fast", sort_order: 1 })],
    projects: [],
    people: [],
    items: rows,
    slots: [],
  });

  assert.equal(payload.lanes.planned.items.length, 10);
  assert.equal(payload.lanes.planned.hiddenCount, 2);
  assert.equal(payload.lanes.planned.items[0]?.id, "planned-11");
  assert.equal(payload.lanes.planned.items[1]?.id, "planned-10");
});

test("候选不足时从 planned 推荐并保持 requiresConfirmation", () => {
  const payload = buildYikeWorkbenchPayload({
    workspace,
    today: "2026-06-14",
    areas: [],
    projects: [],
    people: [],
    items: [
      item({ id: "doing-1", status: "doing", title: "正在做" }),
      item({ id: "planned-1", status: "planned", title: "候选 A" }),
      item({ id: "planned-2", status: "planned", title: "候选 B" }),
    ],
    slots: [slot({ slot_key: "primary_task", item_id: "doing-1" })],
  });

  assert.equal(payload.execution.primaryTask?.id, "doing-1");
  assert.deepEqual(payload.execution.recommendedTasks.map((card) => card.id), ["planned-1", "planned-2"]);
  assert.equal(payload.execution.recommendedTasks[0]?.status, "planned");
  assert.equal(payload.execution.recommendedTasks[0]?.requiresConfirmation, true);
});

test("项目推进卡来自项目 nextTask，缺下一步项目只进入提醒", () => {
  const payload = buildYikeWorkbenchPayload({
    workspace,
    today: "2026-06-14",
    areas: [],
    projects: [
      project({ id: "project-ready", name: "可推进项目", next_task_id: "task-next" }),
      project({ id: "project-missing", name: "缺下一步项目", next_task_id: null }),
    ],
    people: [],
    items: [
      item({ id: "task-next", project_id: "project-ready", item_type: "task", title: "下一步任务" }),
    ],
    slots: [slot({ slot_key: "project_focus", project_id: "project-ready" })],
  });

  assert.equal(payload.execution.projectFocus?.project.name, "可推进项目");
  assert.equal(payload.execution.projectFocus?.nextTask.title, "下一步任务");
  assert.deepEqual(payload.reminders.projectsMissingNextTask.map((row) => row.name), ["缺下一步项目"]);
});

test("提醒只标记 urgent/due，多件事备忘只轻提示", () => {
  const payload = buildYikeWorkbenchPayload({
    workspace,
    today: "2026-06-14",
    areas: [],
    projects: [],
    people: [],
    items: [
      item({ id: "urgent-1", is_urgent: true }),
      item({ id: "due-1", due_date: "2026-06-14" }),
      item({ id: "memo-1", item_type: "memo", memo_granularity: "multiple" }),
    ],
    slots: [],
  });

  assert.deepEqual(payload.reminders.urgent.map((card) => card.id), ["urgent-1"]);
  assert.deepEqual(payload.reminders.dueSoon.map((card) => card.id), ["due-1"]);
  assert.deepEqual(payload.reminders.memosSuggestSplit.map((card) => card.id), ["memo-1"]);
  assert.equal(getYikeDueState("2026-06-13", "2026-06-14"), "overdue");
  assert.equal(getYikeDueState("2026-06-14", "2026-06-14"), "due_today");
});
