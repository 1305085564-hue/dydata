import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContentApiUrl,
  buildContentListRefreshUrl,
  shouldReloadContentPageList,
  type ContentPageQueryState,
} from "./content-page-query";

const companyState: ContentPageQueryState = {
  view: "all",
  perspective: "company",
  teamId: null,
};

test("列表查询 URL 保留范围，fresh 只负责重置分页", () => {
  assert.equal(
    buildContentApiUrl("trash", "team", "team-1"),
    "/api/admin/content/list?view=trash&scope=team&teamId=team-1",
  );
  assert.equal(
    buildContentApiUrl("all", "company", null, { fresh: true }),
    "/api/admin/content/list?view=all&scope=company&fresh=1",
  );
});

test("浏览器后退只在列表范围改变时重新取数", () => {
  assert.equal(
    shouldReloadContentPageList(
      { ...companyState, teamId: "team-1", perspective: "team" },
      companyState,
    ),
    true,
  );
  assert.equal(
    shouldReloadContentPageList(companyState, companyState),
    false,
  );
});

test("A1/A4 URL 参数契约：authorId 与 videoId 互斥且不触发全量列表重新取数", () => {
  const paramsWithAuthor = new URLSearchParams("view=all&scope=company&authorId=author-1");
  assert.equal(paramsWithAuthor.get("authorId"), "author-1");
  assert.equal(paramsWithAuthor.get("videoId"), null);

  // 抽屉参数变化时列表范围仍为 companyState，shouldReloadContentPageList 返回 false
  assert.equal(
    shouldReloadContentPageList(companyState, companyState),
    false,
  );
});


test("回程初始化重复取数后保留当前视频、作者和列表筛选", () => {
  const href = buildContentListRefreshUrl(companyState, new URL("http://localhost/admin/content?videoId=video-1&sortField=play_count&sortDir=asc"));
  const params = new URL(href!, "http://localhost").searchParams;
  assert.equal(params.get("videoId"), "video-1");
  assert.equal(params.get("sortField"), "play_count");
  assert.equal(params.get("sortDir"), "asc");
  const author = buildContentListRefreshUrl(companyState, new URL("http://localhost/admin/content?authorId=author-1"));
  assert.equal(new URL(author!, "http://localhost").searchParams.get("authorId"), "author-1");
});
test("请求期间已关闭的详情不复活，换作品只保留最新地址中的作品", () => {
  const closed = buildContentListRefreshUrl(companyState, new URL("http://localhost/admin/content?view=all"));
  assert.equal(new URL(closed!, "http://localhost").searchParams.get("videoId"), null);
  const switched = buildContentListRefreshUrl(companyState, new URL("http://localhost/admin/content?videoId=video-2&page=2&cursor=old&fresh=1"), true);
  const params = new URL(switched!, "http://localhost").searchParams;
  assert.equal(params.get("videoId"), "video-2");
  assert.equal(params.get("page"), null);
  assert.equal(params.get("cursor"), null);
  assert.equal(params.get("fresh"), null);
});
test("请求完成时已离开复盘页，不用迟到列表响应覆盖目标页面", () => {
  assert.equal(buildContentListRefreshUrl(companyState, new URL("http://localhost/admin/collaboration?personId=author-1&from=video&videoId=video-1")), null);
});
