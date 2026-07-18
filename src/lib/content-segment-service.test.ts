import test from "node:test";
import assert from "node:assert/strict";

import { ensureContentSegments, loadContentSegments, saveContentSegments } from "./content-segment-service";

function loadClient(data: unknown[] | null) {
  const query = { select: () => query, eq: () => query, order: async () => ({ data, error: null }) };
  return { from: () => query };
}

test("读取切段会补齐 0、null 与默认文本", async () => {
  const result = await loadContentSegments(loadClient([{ segment_order: 0, segment_type: null, segment_text: null, estimated_start_sec: 0, estimated_end_sec: null }]) as never, "v1");
  assert.deepEqual(result, [{ segment_order: 0, segment_type: "其他", segment_text: "", estimated_start_sec: 0, estimated_end_sec: null }]);
  assert.deepEqual(await loadContentSegments(loadClient(null) as never, "v1"), []);
});

test("已有切段时直接复用，不触发生成与写入", async () => {
  const result = await ensureContentSegments({ supabase: loadClient([{ segment_order: 1, segment_type: "CTA", segment_text: "关注", estimated_start_sec: 0, estimated_end_sec: 1 }]) as never, videoId: "v1", content: null, durationSec: 0 });
  assert.equal(result.generated, false);
  assert.equal(result.duration_sec, 8);
  assert.equal(result.segments.length, 1);
});

test("保存先删后插，删除错误会抛出", async () => {
  const calls: string[] = [];
  const success = { from: () => ({ delete: () => ({ eq: async () => { calls.push("delete"); return { error: null }; } }), insert: async () => { calls.push("insert"); return { error: null }; } }) };
  await saveContentSegments(success as never, "v1", []);
  assert.deepEqual(calls, ["delete", "insert"]);

  const failed = { from: () => ({ delete: () => ({ eq: async () => ({ error: { message: "delete failed" } }) }) }) };
  await assert.rejects(() => saveContentSegments(failed as never, "v1", []), /delete failed/);
});
