import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONTENT_LIST_FILTERS,
  filterContentVideos,
  parseContentListFilters,
  writeContentListFilters,
} from "./content-list-filters";

const videos = [
  {
    id: "video-1",
    user_id: "user-1",
    account_id: "account-1",
    video_title: "黄金复盘",
    content: "今天讲趋势",
    published_at: "2026-09-18T10:00:00+08:00",
  },
  {
    id: "video-2",
    user_id: "user-2",
    account_id: "account-2",
    video_title: "美股观察",
    content: "黄金回调",
    published_at: "2026-09-20T09:00:00+08:00",
  },
];

test("视频复盘列表筛选支持人员、账号、日期与标题/内容关键词叠加", () => {
  assert.deepEqual(
    filterContentVideos(videos, {
      userId: "user-2",
      accountId: "account-2",
      startDate: "2026-09-19",
      endDate: "2026-09-20",
      keyword: "黄金",
    }).map((video) => video.id),
    ["video-2"],
  );
});

test("人员筛选优先按账号负责人，兼容没有账号负责人的旧视频", () => {
  const scopedVideos = [
    { ...videos[0], accounts: { profile_id: "owner-1" } },
    { ...videos[1], accounts: null },
  ];
  assert.deepEqual(
    filterContentVideos(scopedVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, userId: "owner-1" }).map((video) => video.id),
    ["video-1"],
  );
  assert.deepEqual(
    filterContentVideos(scopedVideos, { ...DEFAULT_CONTENT_LIST_FILTERS, userId: "user-2" }).map((video) => video.id),
    ["video-2"],
  );
});

test("视频复盘列表筛选排除无发布日期的视频，并支持大小写不敏感关键词", () => {
  assert.deepEqual(
    filterContentVideos(
      [
        ...videos,
        {
          id: "video-3",
          user_id: "user-1",
          account_id: "account-1",
          video_title: "AI NEWS",
          content: null,
          published_at: null,
        },
      ],
      { ...DEFAULT_CONTENT_LIST_FILTERS, startDate: "2026-09-01" },
    ).map((video) => video.id),
    ["video-1", "video-2"],
  );

  assert.deepEqual(
    filterContentVideos(videos, {
      ...DEFAULT_CONTENT_LIST_FILTERS,
      keyword: "GOLD",
    }).map((video) => video.id),
    [],
  );
});

test("筛选 URL 可往返并删除空值", () => {
  const source = new URLSearchParams(
    "view=all&userId=user-1&accountId=account-1&startDate=2026-09-01&endDate=2026-09-20&keyword=%E9%BB%84%E9%87%91",
  );
  assert.deepEqual(parseContentListFilters(source), {
    userId: "user-1",
    accountId: "account-1",
    startDate: "2026-09-01",
    endDate: "2026-09-20",
    keyword: "黄金",
  });

  const reset = writeContentListFilters(source, DEFAULT_CONTENT_LIST_FILTERS);
  assert.equal(reset.toString(), "view=all");
});
