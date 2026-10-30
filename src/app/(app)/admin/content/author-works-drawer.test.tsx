import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthorWorksDrawer, AuthorWorksView } from "./author-works-drawer";

test("未指定作者或未打开时 AuthorWorksDrawer 返回空", () => {
  const htmlClosed = renderToStaticMarkup(
    <AuthorWorksDrawer
      author={null}
      open={false}
      onClose={() => {}}
    />,
  );
  assert.equal(htmlClosed, "");
});

test("AuthorWorksView 正常渲染创作者档案头部与四项极简画像指标", () => {
  const html = renderToStaticMarkup(
    <AuthorWorksView
      author={{ id: "author-1", name: "张三" }}
      onClose={() => {}}
      onViewInMainList={() => {}}
    />,
  );
  assert.match(html, /张三/);
  assert.match(html, /创作者作品档案/);
  assert.match(html, /在复盘大盘中查看/);
  assert.match(html, /作品总数/);
  assert.match(html, /条均播放/);
  assert.match(html, /优质作品数/);
  assert.match(html, /完播达标数/);
});

test("ContentListTable 包含责任人名字时渲染查看作者作品的可点击按钮", async () => {
  const { ContentListTable } = await import("./content-list-table");
  const mockRow = {
    video: {
      id: "v-1",
      user_id: "user-123",
      account_id: "acc-1",
      video_title: "测试视频标题",
      content: "测试内容",
      video_url: null,
      published_at: "2026-10-25T10:00:00Z",
      uploaded_at: null,
      anomaly_status: "normal",
      review_status: "pending",
      reviewed_at: null,
      lifecycle_state: "active",
      trashed_at: null,
      trashed_by: null,
      purged_at: null,
      purged_by: null,
      created_at: "2026-10-25T10:00:00Z",
      accounts: { name: "老罗商业" },
      profiles: { name: "老罗" },
    },
    snapshot: null,
    playCount: 10000,
    followerGain: 200,
    completionRate: 0.25,
    interactionRate: 0.05,
    likes: 500,
    lowSample: false,
    quality: null,
    reviewReadiness: null,
  };

  const html = renderToStaticMarkup(
    <ContentListTable
      metricViewMode="spacious"
      visibleRows={[mockRow as never]}
      tableContainerRef={{ current: null }}
      emptyTitle="空"
      emptyDescription="空描述"
      sortField="published_at"
      sortDir="desc"
      handleSort={() => {}}
      isSingleDay={false}
      onSelectVideoId={() => {}}
      onSelectAuthor={() => {}}
      highlightRules={{}}
    />,
  );

  assert.match(html, /老罗/);
  assert.match(html, /查看 老罗 的全部作品/);
});

test("AuthorWorksView 在传入受控 selectedVideoId 时支持内嵌渲染作品详情视图", () => {
  const htmlControlled = renderToStaticMarkup(
    <AuthorWorksView
      author={{ id: "author-2", name: "李四" }}
      onClose={() => {}}
      onViewInMainList={() => {}}
      selectedVideoId="video-123"
    />,
  );
  assert.match(htmlControlled, /李四/);
});

test("B1: 具有数据管理权限时渲染「人效档案」直达入口，无权限时不渲染", () => {
  const htmlWithPerm = renderToStaticMarkup(
    <AuthorWorksView
      author={{ id: "author-1", name: "张三" }}
      onClose={() => {}}
      canViewCollaboration={true}
    />,
  );
  assert.match(htmlWithPerm, /人效档案/);
  assert.match(htmlWithPerm, /\/admin\/collaboration\?/);
  assert.match(htmlWithPerm, /personId=author-1/);

  const htmlWithoutPerm = renderToStaticMarkup(
    <AuthorWorksView
      author={{ id: "author-1", name: "张三" }}
      onClose={() => {}}
      canViewCollaboration={false}
    />,
  );
  assert.doesNotMatch(htmlWithoutPerm, /人效档案/);
});
