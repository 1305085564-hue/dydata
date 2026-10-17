import assert from "node:assert/strict";
import test from "node:test";

import { DouyinClient } from "./client";

test("exchanges an OAuth code with form-encoded server-side credentials", async () => {
  const requests: Request[] = [];
  const client = new DouyinClient({
    clientKey: "client-key",
    clientSecret: "client-secret",
    fetchImpl: async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(JSON.stringify({ data: {
        access_token: "access",
        refresh_token: "refresh",
        open_id: "open",
        expires_in: "86400",
        refresh_expires_in: "2592000",
        scope: "user_info,video.list",
      } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await client.exchangeCode("code-1");
  assert.equal(result.openId, "open");
  assert.equal(requests[0]?.url, "https://open.douyin.com/oauth/access_token/");
  assert.equal(requests[0]?.headers.get("content-type"), "application/x-www-form-urlencoded");
  assert.equal(await requests[0]?.text(), "client_secret=client-secret&code=code-1&grant_type=authorization_code&client_key=client-key");
});

test("lists at most the four provider pages and fetches video data in groups of ten", async () => {
  const requests: Request[] = [];
  const client = new DouyinClient({
    clientKey: "client-key",
    clientSecret: "client-secret",
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes("/video/list/")) {
        const cursor = Number(new URL(request.url).searchParams.get("cursor"));
        return new Response(JSON.stringify({ data: {
          error_code: 0,
          cursor: cursor + 10,
          has_more: true,
          list: [{ item_id: `item-${cursor}`, title: "title", create_time: 1720000000 }],
        } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: {
        error_code: 0,
        list: Array.from({ length: 2 }, (_, index) => ({ item_id: `item-${index}`, statistics: { play_count: index + 1 } })),
      } }), { status: 200 });
    },
  });

  const videos = await client.listVideos({ accessToken: "access", openId: "open" });
  assert.equal(videos.length, 4);
  const stats = await client.getVideoData({ accessToken: "access", openId: "open", itemIds: Array.from({ length: 12 }, (_, i) => `item-${i}`) });
  assert.equal(stats.length, 4);
  assert.equal(requests.filter((request) => request.url.includes("/video/list/")).length, 4);
  assert.equal(requests.filter((request) => request.url.includes("/video/data/")).length, 2);
  assert.equal(await requests.at(-1)?.text(), '{"item_ids":["item-10","item-11"]}');
});

test("loads the official 7/15/30-day user metrics through separate endpoints", async () => {
  const requests: Request[] = [];
  const client = new DouyinClient({
    clientKey: "client-key",
    clientSecret: "client-secret",
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(JSON.stringify({ data: { error_code: 0, result_list: [] } }), { status: 200 });
    },
  });

  await client.getUserMetrics({ accessToken: "access", openId: "open", dateType: 30 });
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), [
    "/data/external/user/fans/",
    "/data/external/user/like/",
    "/data/external/user/item/",
    "/data/external/user/profile/",
  ]);
  assert.ok(requests.every((request) => new URL(request.url).searchParams.get("date_type") === "30"));
});
