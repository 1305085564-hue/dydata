import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { swapKeyPriority } from "@/lib/ai-config/swap-key-priority";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("更新 AI Key 时空 api_key 不进入写入 patch", () => {
  assert.deepEqual(
    buildAiKeyPatch({ id: "key-1", label: "新名称", api_key: "   " }, "update"),
    { label: "新名称" },
  );
  assert.match(source, /buildAiKeyPatch\(data, action\)/);
});

test("AI Key 顺位交换由单独 action 在后端处理", () => {
  assert.match(source, /"swap_key_priority"/);
  assert.match(source, /swapKeyPriority/);
});

function createKeySwapClient(initial: Record<string, number>, missingIds: string[] = [], conflictBeforeFirstUpdate = false) {
  const priorities = { ...initial };
  let updateCount = 0;
  let initialReadDone = false;
  const client = {
    from(table: string) {
      assert.equal(table, "ai_provider_keys");
      return {
        select() {
          const query = {
            in() { return query; },
            then(resolve: (value: { data: Array<{ id: string; priority: number }>; error: null }) => unknown) {
              const data = Object.entries(priorities).filter(([id]) => !missingIds.includes(id)).map(([id, priority]) => ({ id, priority }));
              if (conflictBeforeFirstUpdate && !initialReadDone) priorities["key-a"] = 99;
              initialReadDone = true;
              return Promise.resolve({ data, error: null }).then(resolve);
            },
          };
          return query;
        },
        update(payload: { priority: number }) {
          let targetId = "";
          let expectedPriority: number | null = null;
          const query = {
            eq(column: string, value: string | number) {
              if (column === "id") targetId = String(value);
              if (column === "priority") expectedPriority = Number(value);
              return query;
            },
            select() {
              return { maybeSingle: async () => {
                if (!targetId || priorities[targetId] !== expectedPriority) return { data: null, error: null };
                priorities[targetId] = payload.priority;
                updateCount += 1;
                return { data: { id: targetId }, error: null };
              } };
            },
          };
          return query;
        },
      };
    },
  };
  return { client, priorities, getUpdateCount: () => updateCount };
}

test("AI Key 顺位交换成功时一次请求内交换两条记录", async () => {
  const fake = createKeySwapClient({ "key-a": 1, "key-b": 2 });
  await swapKeyPriority(fake.client as never, { key_id: "key-a", target_key_id: "key-b", key_priority: 1, target_priority: 2 });
  assert.deepEqual(fake.priorities, { "key-a": 2, "key-b": 1 });
  assert.equal(fake.getUpdateCount(), 2);
});

test("AI Key 顺位交换缺少目标 Key 时不产生半更新", async () => {
  const fake = createKeySwapClient({ "key-a": 1, "key-b": 2 }, ["key-b"]);
  await assert.rejects(swapKeyPriority(fake.client as never, { key_id: "key-a", target_key_id: "key-b", key_priority: 1, target_priority: 2 }), /不存在/);
  assert.deepEqual(fake.priorities, { "key-a": 1, "key-b": 2 });
  assert.equal(fake.getUpdateCount(), 0);
});

test("AI Key 顺位在读取后发生冲突时不产生半更新", async () => {
  const fake = createKeySwapClient({ "key-a": 1, "key-b": 2 }, [], true);
  await assert.rejects(swapKeyPriority(fake.client as never, { key_id: "key-a", target_key_id: "key-b", key_priority: 1, target_priority: 2 }), /顺位已变化/);
  assert.deepEqual(fake.priorities, { "key-a": 99, "key-b": 2 });
  assert.equal(fake.getUpdateCount(), 0);
});

test("AI 功能总控只接受系统目录中的保存、归档和恢复动作", () => {
  assert.match(source, /"save_feature_control"/);
  assert.match(source, /"archive_feature"/);
  assert.match(source, /"restore_feature"/);
  assert.match(source, /buildAiFeatureControls/);
  assert.match(source, /getAiFeatureCatalogEntry/);
});
