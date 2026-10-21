import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCloseContentVideoNavigation,
  buildContentPageUrl,
  buildOpenContentVideoNavigation,
  buildStepContentVideoNavigation,
  resolveContentVideoPosition,
  resolveContentPageStateFromSearch,
  type ContentVideoNavigationAction,
} from "./content-video-navigation";
import { parseContentListFilters } from "./content-list-filters";

test("按篇穿梭切换作品时保留当前列表参数并使用 replace 操作", () => {
  const nav = buildStepContentVideoNavigation({
    view: "all",
    perspective: "team",
    teamId: "team-1",
    videoId: "video-2",
  });
  assert.equal(nav.method, "replace");
  assert.equal(nav.href, "/admin/content?view=all&scope=team&teamId=team-1&videoId=video-2");
});

test("打开指定作品时保留当前列表范围并写入 videoId", () => {
  assert.equal(
    buildContentPageUrl({
      view: "all",
      perspective: "team",
      teamId: "team-1",
      videoId: "video-1",
    }),
    "/admin/content?view=all&scope=team&teamId=team-1&videoId=video-1",
  );
});

test("关闭指定作品时移除 videoId，回到原列表地址", () => {
  assert.equal(
    buildContentPageUrl({
      view: "all",
      perspective: "company",
      teamId: null,
      videoId: null,
    }),
    "/admin/content?view=all&scope=company",
  );
});

test("关闭作品时使用 push 操作入栈，确保浏览器后退能恢复刚才的作品 URL", () => {
  type HistoryEntry = { url: string; method: ContentVideoNavigationAction["method"] };
  const history: HistoryEntry[] = [];
  let currentUrl = "/admin/collaboration";

  function applyNavigation(action: ContentVideoNavigationAction) {
    if (action.method === "push") {
      history.push({ url: currentUrl, method: action.method });
    }
    currentUrl = action.href;
  }

  // 1. 从数据管理打开作品复盘详情
  const openNavigation = buildOpenContentVideoNavigation({
    view: "all",
    perspective: "company",
    teamId: null,
    videoId: "video-101",
  });
  assert.equal(openNavigation.method, "push");
  applyNavigation(openNavigation);
  assert.equal(currentUrl, "/admin/content?view=all&scope=company&videoId=video-101");

  // 2. 点击「返回列表」关闭详情
  const closeNavigation = buildCloseContentVideoNavigation({
    view: "all",
    perspective: "company",
    teamId: null,
  });
  assert.equal(closeNavigation.method, "push");
  applyNavigation(closeNavigation);
  assert.equal(currentUrl, "/admin/content?view=all&scope=company");

  // 3. 点击浏览器后退：能够回到刚才的作品 URL
  const previous = history.pop();
  assert.ok(previous);
  assert.equal(previous.url, "/admin/content?view=all&scope=company&videoId=video-101");
});

test("浏览器后退恢复完整内容页状态，不只恢复 videoId", () => {
  const state = resolveContentPageStateFromSearch(
    "?view=all&scope=team&teamId=team-2&videoId=video-101",
    {
      canSwitchPerspective: true,
      availableTeamIds: ["team-1", "team-2"],
      fallbackTeamId: "team-1",
    },
  );

  assert.deepEqual(state, {
    view: "all",
    perspective: "team",
    teamId: "team-2",
    videoId: "video-101",
  });
});

test("无集团视角时客户端 URL 状态不能把页面扩大到公司范围", () => {
  const state = resolveContentPageStateFromSearch(
    "?view=all&scope=company&videoId=video-101",
    {
      canSwitchPerspective: false,
      availableTeamIds: ["team-1"],
      fallbackTeamId: "team-1",
    },
  );

  assert.deepEqual(state, {
    view: "all",
    perspective: "team",
    teamId: "team-1",
    videoId: "video-101",
  });
});

test("回收站与筛选参数可在分享链接和浏览器后退中恢复", () => {
  const url = buildContentPageUrl({
    view: "trash",
    perspective: "company",
    teamId: null,
    videoId: "video-9",
    filters: { userId: "user-1", keyword: "黄金" },
  });
  assert.equal(url, "/admin/content?view=trash&scope=company&videoId=video-9&userId=user-1&keyword=%E9%BB%84%E9%87%91");
  assert.deepEqual(resolveContentPageStateFromSearch(url.split("?")[1] ?? "", {
    canSwitchPerspective: true,
    availableTeamIds: [],
    fallbackTeamId: null,
  }), {
    view: "trash",
    perspective: "company",
    teamId: null,
    videoId: "video-9",
    filters: { userId: "user-1", accountId: "", startDate: "", endDate: "", keyword: "黄金" },
  });
});

test("打开作品详情不得丢掉排序（审计 M1：排序此前不在 URL 里，分享/刷新会静默变回默认）", () => {
  // 用户在「按互动率升序找最差」的视图下点开一条作品，关闭详情后必须还是同一排序
  const opened = buildContentPageUrl({
    view: "all",
    perspective: "company",
    teamId: null,
    videoId: "video-1",
    search: "view=all&scope=company&sort=interaction_rate&dir=asc&anomaly=1",
  });
  assert.match(opened, /sort=interaction_rate/);
  assert.match(opened, /dir=asc/);
  // 其余筛选同样不能在这一步被悄悄丢掉
  assert.match(opened, /anomaly=1/);

  const closed = buildContentPageUrl({
    view: "all",
    perspective: "company",
    teamId: null,
    videoId: null,
    search: "view=all&scope=company&sort=interaction_rate&dir=asc&anomaly=1",
  });
  assert.match(closed, /sort=interaction_rate/);
  assert.match(closed, /dir=asc/);
  assert.doesNotMatch(closed, /videoId/);
});

test("详情导航把高亮规则写成可分享的 hl 编码，不序列化成 Object 字符串", () => {
  const href = buildContentPageUrl({
    view: "all",
    perspective: "team",
    teamId: "team-1",
    videoId: "video-1",
    filters: {
      highlightRules: { playCount: { min: 1000, max: 5000 } },
      highlightOnly: true,
    },
    search: "view=all&scope=team&highlightRules=%5Bobject+Object%5D&topicStatus=in_library",
  });

  const params = new URLSearchParams(href.split("?")[1]);
  assert.equal(params.get("hl"), "playCount:1000:5000");
  assert.equal(params.get("hlOnly"), "1");
  assert.equal(params.get("topicStatus"), "in_library");
  assert.equal(params.has("highlightRules"), false);
  assert.equal(parseContentListFilters(params).highlightRules.playCount?.max, 5000);
  assert.doesNotMatch(href, /\[object\s+Object\]/);
});

test("详情位置按全局分页位置计算，页边界仍可继续且首尾正确禁用", () => {
  const pageSevenStart = (7 - 1) * 20;
  const firstOnPage = resolveContentVideoPosition({
    videoIds: Array.from({ length: 20 }, (_, index) => `video-${index}`),
    selectedVideoId: "video-0",
    pageStartIndex: pageSevenStart,
    totalVideos: 150,
  });
  const lastOnPage = resolveContentVideoPosition({
    videoIds: Array.from({ length: 20 }, (_, index) => `video-${index}`),
    selectedVideoId: "video-19",
    pageStartIndex: pageSevenStart,
    totalVideos: 150,
  });

  assert.deepEqual(firstOnPage, {
    pageIndex: 0,
    currentIndex: 120,
    totalCount: 150,
    hasPrev: true,
    hasNext: true,
  });
  assert.deepEqual(lastOnPage, {
    pageIndex: 19,
    currentIndex: 139,
    totalCount: 150,
    hasPrev: true,
    hasNext: true,
  });
  assert.deepEqual(resolveContentVideoPosition({
    videoIds: ["only-video"],
    selectedVideoId: "only-video",
    pageStartIndex: 0,
    totalVideos: 1,
  }), {
    pageIndex: 0,
    currentIndex: 0,
    totalCount: 1,
    hasPrev: false,
    hasNext: false,
  });
  assert.equal(resolveContentVideoPosition({
    videoIds: ["page-video"],
    selectedVideoId: "deep-link-video-not-in-page",
    pageStartIndex: 0,
    totalVideos: 100,
  }).pageIndex, -1);
});
