import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { swapKeyPriority } from "@/lib/ai-config/swap-key-priority";
import { NextRequest } from "next/server";
import { POST, applyMutation } from "./route";

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

function createDeleteKeyTestClient(options: {
  targetKeyId: string;
  hasBackup: boolean;
}) {
  let keyDeleted = false;
  let keyModelDeleted = false;

  const client = {
    from(table: string) {
      if (table === "ai_provider_key_models") {
        return {
          select(_cols?: string) {
            return {
              eq(col: string, val: string) {
                if (col === "key_id" && val === options.targetKeyId) {
                  return Promise.resolve({
                    data: [{ id: "km-exclusive", model_id: "claude-3-5-sonnet" }],
                    error: null,
                  });
                }
                return Promise.resolve({ data: [], error: null });
              },
              neq(col: string, val: string) {
                return {
                  eq(_col2: string, _val2: boolean) {
                    return {
                      eq(_col3: string, _val3: boolean) {
                        if (options.hasBackup) {
                          return Promise.resolve({
                            data: [
                              {
                                id: "km-backup",
                                model_id: "claude-3-5-sonnet",
                                is_enabled: true,
                                key: { id: "key-backup", is_enabled: true },
                              },
                            ],
                            error: null,
                          });
                        }
                        return Promise.resolve({ data: [], error: null });
                      },
                    };
                  },
                };
              },
              order() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
          delete() {
            return {
              eq(col: string, val: string) {
                if (col === "key_id" && val === options.targetKeyId) {
                  keyModelDeleted = true;
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "ai_feature_bindings") {
        return {
          select(_cols?: string) {
            return {
              eq(_col: string, _val: boolean) {
                return {
                  neq(_col2: string, _val2: string) {
                    return Promise.resolve({
                      data: [
                        {
                          id: "binding-1",
                          feature_key: "next_day_review",
                          label: "次日复盘",
                          model_id: "claude-3-5-sonnet",
                          provider_key_model_id: "km-exclusive",
                          is_enabled: true,
                          lifecycle_state: "active",
                        },
                      ],
                      error: null,
                    });
                  },
                };
              },
              order() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      }

      if (table === "ai_provider_keys") {
        return {
          select() {
            return {
              order() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
          delete() {
            return {
              eq(col: string, val: string) {
                if (col === "id" && val === options.targetKeyId) {
                  keyDeleted = true;
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }

      if (table === "ai_providers") {
        return {
          select() {
            return {
              order() {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return {
    client,
    wasKeyDeleted: () => keyDeleted,
    wasKeyModelDeleted: () => keyModelDeleted,
  };
}

test("服务端删除密钥强阻断：独占引用的 key 执行删除返回 409 且未落库删除", async () => {
  const fake = createDeleteKeyTestClient({ targetKeyId: "key-exclusive", hasBackup: false });

  const req = new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "delete",
      entity: "key",
      data: { id: "key-exclusive" },
    }),
  });

  const res = await POST(req, {
    requireSystemActor: async () => ({
      supabase: fake.client as never,
      actor: { userId: "admin-1", role: "owner" } as never,
    }),
  });

  assert.equal(res.status, 409);
  const json = await res.json();
  assert.match(json.error, /该密钥正被【次日复盘】使用且无备用模型，禁止删除/);
  assert.equal(fake.wasKeyDeleted(), false);
  assert.equal(fake.wasKeyModelDeleted(), false);
});

test("服务端删除密钥强阻断：有备用模型的 key 正常放行删除", async () => {
  const fake = createDeleteKeyTestClient({ targetKeyId: "key-with-backup", hasBackup: true });

  const req = new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "delete",
      entity: "key",
      data: { id: "key-with-backup" },
    }),
  });

  const res = await POST(req, {
    requireSystemActor: async () => ({
      supabase: fake.client as never,
      actor: { userId: "admin-1", role: "owner" } as never,
    }),
  });

  assert.equal(res.status, 200);
  assert.equal(fake.wasKeyDeleted(), true);
  assert.equal(fake.wasKeyModelDeleted(), true);
});

