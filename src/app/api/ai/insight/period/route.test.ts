import assert from "node:assert/strict";
import test from "node:test";

import { buildPeriodInsightResponse } from "./route";

const ACCOUNT_ID = "123e4567-e89b-42d3-a456-426614174000";

test("周期 AI 不会分析不属于当前用户的账号", async () => {
  let ranInsight = false;
  const response = await buildPeriodInsightResponse(
    new Request("https://dydata.cc/api/ai/insight/period", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope_entity_id: ACCOUNT_ID, period_type: "week" }),
    }) as never,
    {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      }) as never,
      userOwnsAccount: async () => false,
      runInsight: async () => {
        ranInsight = true;
        return {} as never;
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(ranInsight, false);
});

test("周期 AI 拒绝非 UUID 的 scope_entity_id", async () => {
  const response = await buildPeriodInsightResponse(
    new Request("https://dydata.cc/api/ai/insight/period", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope_entity_id: "account-1", period_type: "month" }),
    }) as never,
    {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      }) as never,
      userOwnsAccount: async () => true,
      runInsight: async () => ({} as never),
    },
  );

  assert.equal(response.status, 400);
});
