import assert from "node:assert/strict";
import test from "node:test";

import { withdrawPendingFulfillmentAppeal } from "./fulfillment-appeal-withdraw";

type Row = Record<string, unknown>;

function fakeAdmin(state: { appeals: Row[]; todos: Row[]; failTodos?: boolean }) {
  const from = (table: string) => {
    const filters: Array<[string, string, unknown]> = [];
    let mode: "delete" | "update" = "delete";
    let patch: Row = {};
    const matches = (row: Row) => filters.every(([op, col, value]) => op === "eq" ? row[col] === value : (value as unknown[]).includes(row[col]));
    const builder = {
      delete() { mode = "delete"; return builder; },
      update(next: Row) { mode = "update"; patch = next; return builder; },
      eq(col: string, value: unknown) { filters.push(["eq", col, value]); return builder; },
      in(col: string, value: unknown[]) { filters.push(["in", col, value]); return builder; },
      select() { return builder; },
      then(resolve: (value: { data: Row[] | null; error: unknown }) => void) {
        if (table === "fulfillment_appeals") {
          const hit = state.appeals.filter(matches);
          state.appeals = state.appeals.filter((row) => !hit.includes(row));
          return resolve({ data: hit.map((row) => ({ id: row.id })), error: null });
        }
        if (state.failTodos) return resolve({ data: null, error: { message: "boom" } });
        const hit = state.todos.filter(matches);
        if (mode === "update") hit.forEach((row) => Object.assign(row, patch));
        resolve({ data: hit.map((row) => ({ id: row.id })), error: null });
      },
    };
    return builder;
  };
  return { admin: { from } as never, state };
}

const todo = (id: string, appealId: string) => ({ id, category: "todo", source_type: "fulfillment_appeal", source_id: appealId, status: "unread" });

test("撤回本人待审补交申请：申请删除，管理员那条补交审批待办同时关闭", async () => {
  const { admin, state } = fakeAdmin({
    appeals: [{ id: "a1", user_id: "u1", status: "pending" }, { id: "a2", user_id: "u1", status: "pending" }],
    todos: [todo("t1", "a1"), todo("t2", "a1"), todo("t3", "a2")],
  });
  const result = await withdrawPendingFulfillmentAppeal({ admin, userId: "u1", appealId: "a1" });
  assert.deepEqual(result, { ok: true, todosClosed: true });
  assert.deepEqual(state.appeals.map((row) => row.id), ["a2"]);
  assert.deepEqual(state.todos.map((row) => row.status), ["done", "done", "unread"]);
});

test("不是本人的申请、已被处理的申请都撤不了，也不动别人的待办", async () => {
  const { admin, state } = fakeAdmin({
    appeals: [{ id: "a1", user_id: "u2", status: "pending" }, { id: "a3", user_id: "u1", status: "approved" }],
    todos: [todo("t1", "a1")],
  });
  for (const appealId of ["a1", "a3", "missing"]) {
    const result = await withdrawPendingFulfillmentAppeal({ admin, userId: "u1", appealId });
    assert.equal(!result.ok && result.status, 409, appealId);
  }
  assert.equal(state.appeals.length, 2);
  assert.equal(state.todos[0].status, "unread");
});

test("待办关闭失败不回滚撤回，但如实标出", async () => {
  const { admin, state } = fakeAdmin({ appeals: [{ id: "a1", user_id: "u1", status: "pending" }], todos: [todo("t1", "a1")], failTodos: true });
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await withdrawPendingFulfillmentAppeal({ admin, userId: "u1", appealId: "a1" });
    assert.deepEqual(result, { ok: true, todosClosed: false });
    assert.equal(state.appeals.length, 0);
  } finally {
    console.error = originalError;
  }
});
