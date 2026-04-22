import test from "node:test";
import assert from "node:assert/strict";

import { loadProfilesWithExemptionFallback } from "./资料加载.ts";

test("豁免字段查询成功时直接返回完整数据", async () => {
  const result = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () => ({
      data: [
        {
          id: "u1",
          name: "阿禅",
          role: "owner",
          status: "active",
          exempt_type: null,
          exempt_start_date: null,
          exempt_end_date: null,
          exempt_reason: null,
          exemption_category: null,
        },
      ],
      error: null,
    }),
    loadWithoutExemption: async () => {
      throw new Error("不该走到回退查询");
    },
  });

  assert.equal(result.usedFallback, false);
  assert.equal(result.error, null);
  assert.deepEqual(result.data, [
    {
      id: "u1",
      name: "阿禅",
      role: "owner",
      status: "active",
      exempt_type: null,
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: null,
      exemption_category: null,
    },
  ]);
});

test("缺少豁免字段时回退到基础查询并补齐空值", async () => {
  const result = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () => ({
      data: null,
      error: { message: 'column profiles.exempt_type does not exist' },
    }),
    loadWithoutExemption: async () => ({
      data: [
        {
          id: "u2",
          name: "十八",
          role: "admin",
          status: "active",
          permissions: { export_data: true },
        },
      ],
      error: null,
    }),
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.error, null);
  assert.deepEqual(result.data, [
    {
      id: "u2",
      name: "十八",
      role: "admin",
      status: "active",
      permissions: { export_data: true },
      exempt_type: null,
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: null,
      exemption_category: null,
    },
  ]);
});

test("非豁免字段缺失错误不走回退", async () => {
  const result = await loadProfilesWithExemptionFallback({
    loadWithExemption: async () => ({
      data: null,
      error: { message: "permission denied" },
    }),
    loadWithoutExemption: async () => ({
      data: [],
      error: null,
    }),
  });

  assert.equal(result.usedFallback, false);
  assert.deepEqual(result.error, { message: "permission denied" });
  assert.equal(result.data, null);
});
