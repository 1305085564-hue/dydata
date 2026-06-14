import test from "node:test";
import assert from "node:assert/strict";

import { compareYikeCards, getYikeSortKey } from "./sort";
import type { YikeSortableCard } from "./types";

function card(overrides: Partial<YikeSortableCard>): YikeSortableCard {
  return {
    id: "item",
    areaSortOrder: null,
    complexity: "small",
    nature: "task",
    createdAt: "2026-06-14T08:00:00.000Z",
    isUrgent: false,
    dueDate: null,
    ...overrides,
  };
}

test("排序按领域、复杂度、性质、创建时间、id 稳定兜底", () => {
  const rows = [
    card({ id: "memo-early", areaSortOrder: 100, nature: "memo", createdAt: "2026-06-14T07:00:00.000Z" }),
    card({ id: "no-area-deep", areaSortOrder: null, complexity: "deep" }),
    card({ id: "area-10-small", areaSortOrder: 10, complexity: "small" }),
    card({ id: "area-10-deep", areaSortOrder: 10, complexity: "deep" }),
    card({ id: "area-10-project", areaSortOrder: 10, complexity: "deep", nature: "project" }),
  ];

  rows.sort(compareYikeCards);

  assert.deepEqual(rows.map((row) => row.id), [
    "area-10-deep",
    "area-10-project",
    "area-10-small",
    "memo-early",
    "no-area-deep",
  ]);
});

test("加急和截止只返回提醒，不改变排序 key", () => {
  assert.deepEqual(
    getYikeSortKey(card({ id: "a", isUrgent: true, dueDate: "2026-06-14" })),
    getYikeSortKey(card({ id: "b", isUrgent: false, dueDate: null })),
  );
});
