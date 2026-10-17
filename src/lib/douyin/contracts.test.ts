import assert from "node:assert/strict";
import test from "node:test";

import {
  DOUYIN_AUTHORIZE_URL,
  DOUYIN_SCOPE,
  buildDouyinAuthorizationUrl,
  parseDouyinTokenResponse,
  parseDouyinUserMetricResponse,
  parseDouyinVideoListResponse,
  parseDouyinVideoDataResponse,
} from "./contracts";

test("builds a server-side Douyin authorization URL with an explicit scope and state", () => {
  const url = buildDouyinAuthorizationUrl({
    clientKey: "client-key",
    redirectUri: "https://dydata.cc/api/douyin/oauth/callback",
    state: "state-1",
    scope: ["user_info", "video.list", "video.data"],
  });

  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, DOUYIN_AUTHORIZE_URL);
  assert.equal(parsed.searchParams.get("client_key"), "client-key");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://dydata.cc/api/douyin/oauth/callback");
  assert.equal(parsed.searchParams.get("state"), "state-1");
  assert.equal(parsed.searchParams.get("scope"), "user_info,video.list,video.data");
  assert.deepEqual(DOUYIN_SCOPE, ["user_info", "video.list", "video.data"]);
});

test("parses Douyin OAuth token responses without leaking token values", () => {
  const token = parseDouyinTokenResponse({
    message: "success",
    data: {
      access_token: "access-1",
      refresh_token: "refresh-1",
      open_id: "open-1",
      expires_in: "86400",
      refresh_expires_in: 2592000,
      scope: "user_info,video.list",
    },
  });

  assert.deepEqual(token, {
    accessToken: "access-1",
    refreshToken: "refresh-1",
    openId: "open-1",
    expiresInSeconds: 86400,
    refreshExpiresInSeconds: 2592000,
    scopes: ["user_info", "video.list"],
  });
});

test("rejects a provider token error instead of producing a partial binding", () => {
  assert.throws(
    () => parseDouyinTokenResponse({ data: { error_code: 10010, description: "expired" } }),
    /DOUYIN_TOKEN_ERROR/,
  );
});

test("parses video list pages and keeps the provider item id as the stable key", () => {
  const page = parseDouyinVideoListResponse({
    data: {
      error_code: 0,
      cursor: 10,
      has_more: true,
      list: [
        {
          item_id: "item-1",
          title: "标题",
          create_time: 1720000000,
          share_url: "https://www.douyin.com/video/item-1",
        },
      ],
    },
    extra: { error_code: 0, logid: "log-1" },
  });

  assert.deepEqual(page, {
    cursor: 10,
    hasMore: true,
    items: [
      {
        platformVideoId: "item-1",
        title: "标题",
        createdAt: new Date(1720000000 * 1000).toISOString(),
        shareUrl: "https://www.douyin.com/video/item-1",
      },
    ],
  });
});

test("parses per-video statistics and preserves absent values as null", () => {
  const data = parseDouyinVideoDataResponse({
    data: {
      error_code: 0,
      list: [
        {
          item_id: "item-1",
          statistics: {
            play_count: 100,
            digg_count: 8,
            comment_count: "2",
            share_count: 3,
            collect_count: 4,
          },
        },
      ],
    },
    extra: { error_code: 0 },
  });

  assert.deepEqual(data, [
    {
      platformVideoId: "item-1",
      playCount: 100,
      likes: 8,
      comments: 2,
      shares: 3,
      favorites: 4,
    },
  ]);
});

test("parses user trend rows from string-valued official responses", () => {
  const rows = parseDouyinUserMetricResponse({
    data: {
      error_code: "0",
      result_list: [
        { date: "2026-10-17", new_fans: "4", total_fans: "120" },
        { date: "2026-10-18", new_fans: "-1", total_fans: "119" },
      ],
    },
    extra: { error_code: "0" },
  });

  assert.deepEqual(rows, [
    { date: "2026-10-17", newFans: 4, totalFans: 120, newLikes: null, newPlay: null, profileUv: null, newIssue: null, totalIssue: null },
    { date: "2026-10-18", newFans: -1, totalFans: 119, newLikes: null, newPlay: null, profileUv: null, newIssue: null, totalIssue: null },
  ]);
});
