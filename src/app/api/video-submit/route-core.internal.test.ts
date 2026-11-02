import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildPublishedDayWindow, buildVideoSubmitResponse, type VideoSubmitDeps } from "./route-core";

const ACTOR_ID = "00000000-0000-0000-0000-000000000001";

test("内部代提交入口使用 admin client 和申请人 ID，不读取当前登录态", async () => {
  let createClientCalls = 0;
  let adminCalls = 0;
  let profileId: string | undefined;
  const adminClient = {
    auth: {
      getUser: async () => {
        throw new Error("内部入口不应读取登录态");
      },
    },
    from(table: string) {
      assert.equal(table, "profiles");
      return {
        select: () => ({
          eq: (_column: string, value: string) => {
            profileId = value;
            return {
              single: async () => ({
                data: { name: "申请人", team_id: null, membership_status: "active" },
                error: null,
              }),
            };
          },
        }),
      };
    },
  };
  const deps: VideoSubmitDeps = {
    createClient: async () => {
      createClientCalls += 1;
      throw new Error("内部入口不应调用 createClient");
    },
    createAdminClient: () => {
      adminCalls += 1;
      return adminClient as never;
    },
  };

  const response = await buildVideoSubmitResponse(
    new NextRequest("https://example.com/api/video-submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    deps,
    undefined,
    { userId: ACTOR_ID },
  );

  assert.equal(response.status, 403);
  assert.equal(createClientCalls, 0);
  assert.ok(adminCalls > 0);
  assert.equal(profileId, ACTOR_ID);
});

test("发布日窗口按上海自然日取 [start,end)，发布时间缺失或非法时跳过判重", () => {
  assert.deepEqual(buildPublishedDayWindow("2026-10-29T23:30:00.000Z"), {
    start: "2026-10-29T16:00:00.000Z",
    end: "2026-10-30T16:00:00.000Z",
  });
  assert.deepEqual(buildPublishedDayWindow("2026-10-30T07:00:00+08:00"), {
    start: "2026-10-29T16:00:00.000Z",
    end: "2026-10-30T16:00:00.000Z",
  });
  assert.equal(buildPublishedDayWindow(null), null);
  assert.equal(buildPublishedDayWindow("not-a-date"), null);
});
