import test from "node:test";
import assert from "node:assert/strict";

import { createV2Conversation } from "./bootstrap";

function service(conversationError: { message: string } | null = null) {
  return { from(table: string) {
    const query = {
      insert: () => query, select: () => query, eq: () => query,
      single: async () => table === "rewrite_conversations"
        ? { data: conversationError ? null : { id: "c1" }, error: conversationError }
        : { data: null, error: null },
      maybeSingle: async () => table === "rewrite_documents" ? { data: { id: "d1", conversation_id: "c1", title: "文档", current_revision_id: null, created_at: "now", updated_at: "now" }, error: null } : { data: null, error: null },
    };
    return query;
  } };
}

test("创建 v2 会话后复用对应文档", async () => {
  assert.deepEqual(await createV2Conversation(service() as never, "u1", "  标题  "), { conversationId: "c1", documentId: "d1" });
});

test("会话创建错误或空返回会抛出", async () => {
  await assert.rejects(() => createV2Conversation(service({ message: "db down" }) as never, "u1"), /db down/);
});
