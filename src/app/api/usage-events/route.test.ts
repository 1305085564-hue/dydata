import assert from "node:assert/strict";
import test from "node:test";

import { buildUsageEventResponse } from "./route";

test("usage events skips invalid payloads", async () => {
  let insertCalled = false;

  const response = await buildUsageEventResponse(
    new Request("https://dydata.cc/api/usage-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/dashboard", eventType: "bad" }),
    }),
    {
      createClient: async () =>
        ({
          auth: {
            getUser: async () => ({ data: { user: { id: "user-1" } } }),
          },
          from: () => ({
            insert: async () => {
              insertCalled = true;
              return { error: null };
            },
          }),
        }) as never,
    },
  );

  assert.equal(response.status, 202);
  assert.equal(insertCalled, false);
});

test("usage events skips when user is not signed in", async () => {
  let insertCalled = false;

  const response = await buildUsageEventResponse(
    new Request("https://dydata.cc/api/usage-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/dashboard", eventType: "page_view" }),
    }),
    {
      createClient: async () =>
        ({
          auth: {
            getUser: async () => ({ data: { user: null } }),
          },
          from: () => ({
            insert: async () => {
              insertCalled = true;
              return { error: null };
            },
          }),
        }) as never,
    },
  );

  assert.equal(response.status, 202);
  assert.equal(insertCalled, false);
});

test("usage events writes normalized row for signed-in users", async () => {
  let insertedPayload: Record<string, unknown> | null = null;

  const response = await buildUsageEventResponse(
    new Request("https://dydata.cc/api/usage-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "/violations/123e4567-e89b-12d3-a456-426614174000/",
        eventType: "page_view",
      }),
    }),
    {
      createClient: async () =>
        ({
          auth: {
            getUser: async () => ({ data: { user: { id: "user-1" } } }),
          },
          from: (table: string) => ({
            insert: async (payload: Record<string, unknown>) => {
              assert.equal(table, "usage_events");
              insertedPayload = payload;
              return { error: null };
            },
          }),
        }) as never,
    },
  );

  assert.equal(response.status, 202);
  assert.deepEqual(insertedPayload, {
    user_id: "user-1",
    path: "/violations/[id]",
    event_type: "page_view",
  });
});
