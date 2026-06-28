import assert from "node:assert/strict";
import test from "node:test";

import { buildSubmitFulfillmentAppealResponse, parseSubmitFulfillmentAppealPayload } from "./route";

test("submit fulfillment appeal payload 校验日期和原因", () => {
  const invalidDate = parseSubmitFulfillmentAppealPayload({ recordDate: "2026-02-31", reason: "已提交" });
  assert.equal("response" in invalidDate && invalidDate.response.status, 400);

  const invalidReason = parseSubmitFulfillmentAppealPayload({ recordDate: "2026-06-28", reason: "   " });
  assert.equal("response" in invalidReason && invalidReason.response.status, 400);

  const valid = parseSubmitFulfillmentAppealPayload({ recordDate: "2026-06-28", reason: " 已用其他形式提报 " });
  assert.deepEqual("data" in valid && valid.data, {
    recordDate: "2026-06-28",
    reason: "已用其他形式提报",
  });
});

test("submit fulfillment appeal 未登录时返回 401", async () => {
  const response = await buildSubmitFulfillmentAppealResponse(
    new Request("https://dydata.cc/api/fulfillment/appeal/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordDate: "2026-06-28", reason: "已补交" }),
    }),
    {
      createClient: async () =>
        ({
          auth: {
            getUser: async () => ({ data: { user: null } }),
          },
        }) as never,
    },
  );

  assert.equal(response.status, 401);
});

test("submit fulfillment appeal 成功写入 pending 申诉", async () => {
  let insertedPayload: Record<string, unknown> | null = null;

  const response = await buildSubmitFulfillmentAppealResponse(
    new Request("https://dydata.cc/api/fulfillment/appeal/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordDate: "2026-06-28", reason: "已补交日报" }),
    }),
    {
      createClient: async () =>
        ({
          auth: {
            getUser: async () => ({ data: { user: { id: "user-1" } } }),
          },
          from: () => ({
            insert: (payload: Record<string, unknown>) => {
              insertedPayload = payload;
              return {
                select: () => ({
                  single: async () => ({
                    data: {
                      id: "appeal-1",
                      user_id: "user-1",
                      record_date: "2026-06-28",
                      status: "pending",
                      created_at: "2026-06-28T00:00:00.000Z",
                    },
                    error: null,
                  }),
                }),
              };
            },
          }),
        }) as never,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(insertedPayload, {
    user_id: "user-1",
    record_date: "2026-06-28",
    reason: "已补交日报",
    status: "pending",
  });

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.appeal.id, "appeal-1");
});
