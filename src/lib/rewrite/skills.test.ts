import assert from "node:assert/strict";
import test from "node:test";

import { listAvailableSkills } from "./skills";

function listService(data: unknown[] | null, error: { message: string } | null = null) {
  return {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        or: () => query,
        order: () => query,
        then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
          Promise.resolve({ data, error }).then(resolve, reject),
      };
      return query;
    },
  };
}

test("可用技能映射蛇形字段并支持空数组", async () => {
  const row = {
    id: "s1",
    scope: "platform",
    owner_id: null,
    key: "rewrite",
    name: "改写",
    description: null,
    icon: null,
    default_model_view_id: "m1",
    sort_order: 0,
    is_enabled: true,
    created_at: "now",
    updated_at: "now",
  };
  const result = await listAvailableSkills(listService([row]) as never, { userId: "u1", scope: [] });
  assert.equal(result[0]?.defaultModelViewId, "m1");
  assert.equal(result[0]?.sortOrder, 0);
  assert.deepEqual(await listAvailableSkills(listService([]) as never, { userId: "u1" }), []);
});

test("技能查询错误会抛出", async () => {
  await assert.rejects(
    () => listAvailableSkills(listService(null, { message: "db down" }) as never, { userId: "u1" }),
    /db down/,
  );
});
