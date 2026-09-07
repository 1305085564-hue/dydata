import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCloseContentVideoNavigation,
  buildContentPageUrl,
  buildOpenContentVideoNavigation,
  resolveContentPageStateFromSearch,
  type ContentVideoNavigationAction,
} from "./content-video-navigation";

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
      view: "pending",
      perspective: "company",
      teamId: null,
      videoId: null,
    }),
    "/admin/content?view=pending&scope=company",
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

  // 1. 从岗位管理打开作品复盘详情
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
