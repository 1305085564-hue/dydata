import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMemoSplitTaskInserts,
  buildCreateItemInsert,
  buildRolloverUpdate,
  buildStatusTransitionUpdate,
  buildUpdateItemPayload,
  getOrCreateYikeWorkspace,
  isAllowedYikeStatusTransition,
  toYikeItemDTO,
} from "./service";
import type { YikeCreateItemInput, YikeItemRow } from "./types";

const workspaceId = "workspace-1";
const userId = "user-1";

function row(overrides: Partial<YikeItemRow> = {}): YikeItemRow {
  return {
    id: "item-1",
    workspace_id: workspaceId,
    user_id: userId,
    item_type: "memo",
    status: "planned",
    title: "整理方案",
    note: "整理方案",
    raw_input: "整理方案",
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
    client_request_id: "req-1",
    completed_at: null,
    archived_at: null,
    created_at: "2026-06-14T08:00:00.000Z",
    updated_at: "2026-06-14T08:00:00.000Z",
    ...overrides,
  };
}

test("buildCreateItemInsert 按 actor 和 workspace 生成安全插入对象", () => {
  const input: YikeCreateItemInput = {
    rawText: "把一刻的数据库方案整理给 Kimi",
    title: "数据库方案",
    note: null,
    itemType: "memo",
    status: "planned",
    timeBucket: "today",
    complexity: "small",
    memoGranularity: "unknown",
    areaId: null,
    projectId: null,
    dueDate: null,
    isUrgent: false,
    assigneePersonId: null,
    delegatedNote: null,
    followUpBucket: null,
    clientRequestId: "req-1",
  };

  assert.deepEqual(buildCreateItemInsert({ userId, workspaceId }, input), {
    workspace_id: workspaceId,
    user_id: userId,
    item_type: "memo",
    status: "planned",
    title: "数据库方案",
    note: "把一刻的数据库方案整理给 Kimi",
    raw_input: "把一刻的数据库方案整理给 Kimi",
    area_id: null,
    project_id: null,
    complexity: "small",
    time_bucket: "today",
    due_date: null,
    is_urgent: false,
    memo_granularity: "unknown",
    assignee_person_id: null,
    delegated_note: null,
    follow_up_bucket: null,
    client_request_id: "req-1",
  });
});

test("状态机允许方案定义的流转并拒绝 planned 的无效跳转", () => {
  assert.equal(isAllowedYikeStatusTransition("planned", "doing"), true);
  assert.equal(isAllowedYikeStatusTransition("planned", "delegated"), true);
  assert.equal(isAllowedYikeStatusTransition("planned", "done"), true);
  assert.equal(isAllowedYikeStatusTransition("doing", "planned"), true);
  assert.equal(isAllowedYikeStatusTransition("done", "doing"), false);
  assert.equal(isAllowedYikeStatusTransition("done", "planned"), true);
});

test("完成状态会写 completed_at，撤回计划会清空 completed_at", () => {
  assert.deepEqual(buildStatusTransitionUpdate("done", "2026-06-14T08:30:00.000Z"), {
    status: "done",
    completed_at: "2026-06-14T08:30:00.000Z",
  });

  assert.deepEqual(buildStatusTransitionUpdate("planned", "2026-06-14T08:30:00.000Z"), {
    status: "planned",
    completed_at: null,
  });
});

test("toYikeItemDTO 输出 camelCase 契约", () => {
  assert.deepEqual(toYikeItemDTO(row({ status: "done", completed_at: "2026-06-14T08:30:00.000Z" })), {
    id: "item-1",
    itemType: "memo",
    status: "done",
    title: "整理方案",
    note: "整理方案",
    rawInput: "整理方案",
    areaId: null,
    projectId: null,
    complexity: "small",
    timeBucket: "today",
    bucketAnchorDate: null,
    dueDate: null,
    isUrgent: false,
    memoGranularity: "unknown",
    assigneePersonId: null,
    delegatedNote: null,
    followUpBucket: null,
    sourceMemoId: null,
    clientRequestId: "req-1",
    completedAt: "2026-06-14T08:30:00.000Z",
    archivedAt: null,
    createdAt: "2026-06-14T08:00:00.000Z",
    updatedAt: "2026-06-14T08:00:00.000Z",
  });
});

test("buildUpdateItemPayload 只输出传入字段，不把未传字段置空", () => {
  assert.deepEqual(
    buildUpdateItemPayload({
      title: "更新标题",
      dueDate: null,
      isUrgent: true,
    }),
    {
      title: "更新标题",
      due_date: null,
      is_urgent: true,
    },
  );
});

test("buildMemoSplitTaskInserts 拆出的任务保留 source_memo_id", () => {
  assert.deepEqual(
    buildMemoSplitTaskInserts(
      { userId, workspaceId },
      row({ id: "memo-1", item_type: "memo", title: "混合备忘", area_id: "area-1" }),
      {
        tasks: [
          { title: "确认数据库字段", note: null },
          { title: "确认接口契约", note: "给 Kimi" },
        ],
        archiveSourceMemo: false,
      },
    ),
    [
      {
        workspace_id: workspaceId,
        user_id: userId,
        item_type: "task",
        status: "planned",
        title: "确认数据库字段",
        note: null,
        raw_input: null,
        area_id: "area-1",
        project_id: null,
        complexity: "small",
        time_bucket: "today",
        due_date: null,
        is_urgent: false,
        memo_granularity: "single",
        assignee_person_id: null,
        delegated_note: null,
        follow_up_bucket: null,
        client_request_id: null,
        source_memo_id: "memo-1",
      },
      {
        workspace_id: workspaceId,
        user_id: userId,
        item_type: "task",
        status: "planned",
        title: "确认接口契约",
        note: "给 Kimi",
        raw_input: null,
        area_id: "area-1",
        project_id: null,
        complexity: "small",
        time_bucket: "today",
        due_date: null,
        is_urgent: false,
        memo_granularity: "single",
        assignee_person_id: null,
        delegated_note: null,
        follow_up_bucket: null,
        client_request_id: null,
        source_memo_id: "memo-1",
      },
    ],
  );
});

test("buildRolloverUpdate 只把昨日未完成项归到 today，不改 done", () => {
  assert.deepEqual(buildRolloverUpdate(row({ status: "planned", time_bucket: "tomorrow" }), "2026-06-14"), {
    time_bucket: "today",
    bucket_anchor_date: "2026-06-14",
  });
  assert.equal(buildRolloverUpdate(row({ status: "done", time_bucket: "tomorrow" }), "2026-06-14"), null);
});

test("buildRolloverUpdate 不动用户主动选的跨度桶与今日刚设的点状桶", () => {
  // 跨度桶（本周/本月/以后）一律不顺延，保留用户选择
  assert.equal(buildRolloverUpdate(row({ time_bucket: "this_week" }), "2026-06-14"), null);
  assert.equal(buildRolloverUpdate(row({ time_bucket: "this_month" }), "2026-06-14"), null);
  assert.equal(buildRolloverUpdate(row({ time_bucket: "later" }), "2026-06-14"), null);
  // 今天刚设的点状桶（锚定日 >= today）不被冲回
  assert.equal(
    buildRolloverUpdate(row({ time_bucket: "tomorrow", bucket_anchor_date: "2026-06-14" }), "2026-06-14"),
    null,
  );
  // 昨日遗留的点状桶（锚定日已过）才顺延到今天
  assert.deepEqual(
    buildRolloverUpdate(row({ time_bucket: "today", bucket_anchor_date: "2026-06-13" }), "2026-06-14"),
    { time_bucket: "today", bucket_anchor_date: "2026-06-14" },
  );
});

test("buildUpdateItemPayload 改时间桶会同步把锚定日刷成今天", () => {
  const payload = buildUpdateItemPayload({ timeBucket: "this_week" }, "2026-06-14");
  assert.equal(payload.time_bucket, "this_week");
  assert.equal(payload.bucket_anchor_date, "2026-06-14");
  // 不改时间桶时不动锚定日
  const noTouch = buildUpdateItemPayload({ title: "改标题" }, "2026-06-14");
  assert.equal(noTouch.bucket_anchor_date, undefined);
});

test("首次读取一刻时会自动创建个人 workspace", async () => {
  const inserts: unknown[] = [];
  const createdWorkspace = {
    id: workspaceId,
    user_id: userId,
    name: "一刻",
    created_at: "2026-06-14T08:00:00.000Z",
    updated_at: "2026-06-14T08:00:00.000Z",
  };

  let inserting = false;
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    async maybeSingle() {
      return { data: null, error: null };
    },
    insert(payload: unknown) {
      inserting = true;
      inserts.push(payload);
      return builder;
    },
    async single() {
      assert.equal(inserting, true);
      return { data: createdWorkspace, error: null };
    },
  };
  const client = {
    from(table: string) {
      assert.equal(table, "yike_workspaces");
      return builder;
    },
  };

  const workspace = await getOrCreateYikeWorkspace({ userId }, { client: client as never });

  assert.deepEqual(inserts, [{ user_id: userId, name: "一刻" }]);
  assert.deepEqual(workspace, createdWorkspace);
});
