import assert from "node:assert/strict";
import { createRef, act } from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CollaborationDiagnosisContext, CollaborationWorkReviewLink } from "@/components/admin/collaboration-work-review-link";
import { TitleButton } from "@/app/(app)/admin/content/content-list-row-parts";
import { ContentListTable } from "@/app/(app)/admin/content/content-list-table";
import { PoolGrid } from "@/components/topics-v2/pool/PoolGrid";
import { PoolTable } from "@/components/topics-v2/pool/PoolTable";
import { TeamActivitySection } from "@/components/topics-v2/TeamActivitySection";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import type { TopicPoolItem } from "@/components/topics-v2/types";
import { FakeKeyboardEvent, FakeMouseEvent, setupDomTestEnv } from "@/lib/testing/dom-harness";
import { shouldHandleInPlaceLinkClick } from "./link-click";

test("shouldHandleInPlaceLinkClick 仅对未 defaultPrevented 且无修饰键的左键返回 true", () => {
  assert.equal(
    shouldHandleInPlaceLinkClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }),
    true,
  );
  assert.equal(
    shouldHandleInPlaceLinkClick({
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: true,
    }),
    false,
  );
  assert.equal(
    shouldHandleInPlaceLinkClick({ button: 0, metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }),
    false,
  );
  assert.equal(
    shouldHandleInPlaceLinkClick({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }),
    false,
  );
  assert.equal(
    shouldHandleInPlaceLinkClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: true, altKey: false }),
    false,
  );
  assert.equal(
    shouldHandleInPlaceLinkClick({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }),
    false,
  );
});

test("ContentListTable 行级点击在 Ctrl/Cmd/Shift/中键/defaultPrevented 时不原地打开，普通左键正常打开", async () => {
  const env = setupDomTestEnv();
  const openedIds: Array<string | null> = [];
  const rowItem = {
    video: {
      id: "vid-1",
      video_title: "测试视频标题",
      content: "文案",
      published_at: "2026-11-25T10:00:00Z",
      anomaly_status: "normal",
      accounts: { name: "主号" },
    },
    playCount: 1200,
    interactionRate: 0.05,
    quality: { overallGrade: "良", contentAchievement: 80 },
  } as unknown as ProcessedContentRow;

  const { container, unmount } = await env.mount(
    <TooltipProvider>
      <ContentListTable
        metricViewMode="spacious"
        visibleRows={[rowItem]}
        tableContainerRef={createRef<HTMLDivElement>()}
        emptyTitle="空"
        emptyDescription="无数据"
        sortField="published_at"
        sortDir="desc"
        handleSort={() => {}}
        isSingleDay={false}
        onSelectVideoId={(id) => openedIds.push(id)}
        buildVideoHref={(id) => `/admin/content?videoId=${id}`}
        highlightRules={{}}
      />
    </TooltipProvider>,
  );

  try {
    const tr = container.querySelector('tr[data-video-id="vid-1"]');
    assert.ok(tr, "应渲染桌面端数据行");

    // 修饰键 / 中键 / 已 defaultPrevented 点击行内空白处，不应原地打开详情
    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      await act(async () => {
        tr.dispatchEvent(new FakeMouseEvent("click", init));
      });
    }
    const preventedEvent = new FakeMouseEvent("click");
    preventedEvent.preventDefault();
    await act(async () => {
      tr.dispatchEvent(preventedEvent);
    });
    assert.deepEqual(openedIds, []);

    // 普通左键点击行空白处 -> 原地打开
    await act(async () => {
      tr.dispatchEvent(new FakeMouseEvent("click"));
    });
    assert.deepEqual(openedIds, ["vid-1"]);

    // 点标题 <a>：Ctrl+左键放行不拦截且不冒泡打开；普通左键仅触发一次
    const titleAnchor = tr.querySelector('a[href="/admin/content?videoId=vid-1"]');
    assert.ok(titleAnchor);
    const ctrlTitleClick = new FakeMouseEvent("click", { ctrlKey: true });
    await act(async () => {
      titleAnchor.dispatchEvent(ctrlTitleClick);
    });
    assert.equal(ctrlTitleClick.defaultPrevented, false);
    assert.deepEqual(openedIds, ["vid-1"]);

    const plainTitleClick = new FakeMouseEvent("click");
    await act(async () => {
      titleAnchor.dispatchEvent(plainTitleClick);
    });
    assert.equal(plainTitleClick.defaultPrevented, true);
    assert.deepEqual(openedIds, ["vid-1", "vid-1"]);
  } finally {
    await unmount();
    env.cleanup();
  }
});

test("PoolGrid 聚焦标题链接按空格可打开详情，Enter 与修饰键保持原生链接行为", async () => {
  const env = setupDomTestEnv();
  const selectedIds: string[] = [];
  const topicItem = {
    id: "top-1",
    title: "测试选题标题",
    hook: "一句话钩子",
    isWritingByMe: false,
    topics: { name: "母题A" },
    topic_groups: null,
    summary: { qualifiedWorkCount: 2, internalMetrics: { bestPlayCount: 25000, workCount: 3 } },
    recent7dParticipants: 4,
    currentWritingCount: 1,
  } as unknown as TopicPoolItem;

  const { container, unmount } = await env.mount(
    <PoolGrid
      items={[topicItem]}
      loading={false}
      onGoToFeishu={() => {}}
      onSelectTopic={(id) => selectedIds.push(id)}
    />,
  );

  try {
    const anchor = container.querySelector('a[href="/topics?topic_id=top-1"]');
    assert.ok(anchor, "应渲染选题直达链接");

    // 空格键触发原地打开并阻止页面滚动
    const spaceEvent = new FakeKeyboardEvent("keydown", { key: " " });
    await act(async () => {
      anchor.dispatchEvent(spaceEvent);
    });
    assert.equal(spaceEvent.defaultPrevented, true);
    assert.deepEqual(selectedIds, ["top-1"]);

    // Enter 在 onKeyDown 不拦截，保留浏览器原生链接触发（Enter -> click）
    const enterKeyEvent = new FakeKeyboardEvent("keydown", { key: "Enter" });
    await act(async () => {
      anchor.dispatchEvent(enterKeyEvent);
    });
    assert.equal(enterKeyEvent.defaultPrevented, false);
    assert.deepEqual(selectedIds, ["top-1"]);

    // Shift+Space 不劫持浏览器向上翻页
    const shiftSpaceEvent = new FakeKeyboardEvent("keydown", { key: " ", shiftKey: true });
    await act(async () => {
      anchor.dispatchEvent(shiftSpaceEvent);
    });
    assert.equal(shiftSpaceEvent.defaultPrevented, false);
    assert.deepEqual(selectedIds, ["top-1"]);

    // Ctrl+左键放行新标签页，普通左键原地打开
    const ctrlClick = new FakeMouseEvent("click", { ctrlKey: true });
    await act(async () => {
      anchor.dispatchEvent(ctrlClick);
    });
    assert.equal(ctrlClick.defaultPrevented, false);
    assert.deepEqual(selectedIds, ["top-1"]);

    const plainClick = new FakeMouseEvent("click");
    await act(async () => {
      anchor.dispatchEvent(plainClick);
    });
    assert.equal(plainClick.defaultPrevented, true);
    assert.deepEqual(selectedIds, ["top-1", "top-1"]);
  } finally {
    await unmount();
    env.cleanup();
  }
});

test("视频复盘 TitleButton 传 href 时渲染原生 <a> 链接", () => {
  const mockVideo = {
    id: "vid-1",
    video_title: "测试视频标题",
    content: "文案",
    published_at: "2026-11-25T10:00:00Z",
    anomaly_status: "normal",
    accounts: { name: "主号" },
  } as unknown as ProcessedContentRow["video"];

  const html = renderToStaticMarkup(
    <TooltipProvider>
      <TitleButton video={mockVideo} href="/admin/content?videoId=vid-1" onOpen={() => {}} />
    </TooltipProvider>,
  );
  assert.match(html, /<a [^>]*href="\/admin\/content\?videoId=vid-1"/);
});

const mockRouter: AppRouterInstance = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: async () => {},
  bfcacheId: "",
};

test("成员主页 CollaborationWorkReviewLink 有 videoId 且不在协同内嵌上下文时渲染原生 <a>", () => {
  const htmlWithVideo = renderToStaticMarkup(
    <AppRouterContext.Provider value={mockRouter}>
      <TooltipProvider>
      <CollaborationWorkReviewLink reportId="rep-1" videoId="vid-99" previewMode="title-only">
        作品一
      </CollaborationWorkReviewLink>
    </TooltipProvider>
    </AppRouterContext.Provider>,
  );
  assert.match(htmlWithVideo, /<a [^>]*href="\/admin\/content\?videoId=vid-99"/);

  const htmlNoVideo = renderToStaticMarkup(
    <AppRouterContext.Provider value={mockRouter}>
      <TooltipProvider>
      <CollaborationWorkReviewLink reportId="rep-2" videoId={null} previewMode="title-only">
        未关联日报
      </CollaborationWorkReviewLink>
    </TooltipProvider>
    </AppRouterContext.Provider>,
  );
  assert.match(htmlNoVideo, /<button /);

  const htmlInDrawer = renderToStaticMarkup(
    <AppRouterContext.Provider value={mockRouter}>
      <TooltipProvider>
      <CollaborationDiagnosisContext.Provider value={{ openDiagnosisByReportId: async () => {}, openingReportId: null }}>
        <CollaborationWorkReviewLink reportId="rep-1" videoId="vid-99">
          协作抽屉作品
        </CollaborationWorkReviewLink>
      </CollaborationDiagnosisContext.Provider>
    </TooltipProvider>
    </AppRouterContext.Provider>,
  );
  assert.match(htmlInDrawer, /<button /);
});

test("选题库 PoolGrid / PoolTable / TeamActivitySection 渲染直达 /topics?topic_id= 原生链接", () => {
  const topicItem = {
    id: "top-1",
    title: "测试选题标题",
    hook: "一句话钩子",
    isWritingByMe: false,
    topics: { name: "母题A" },
    topic_groups: null,
    summary: { qualifiedWorkCount: 2, internalMetrics: { bestPlayCount: 25000, workCount: 3 } },
    recent7dParticipants: 4,
    currentWritingCount: 1,
  } as unknown as TopicPoolItem;

  const gridHtml = renderToStaticMarkup(
    <PoolGrid items={[topicItem]} loading={false} onGoToFeishu={() => {}} onSelectTopic={() => {}} />,
  );
  assert.match(gridHtml, /<a [^>]*href="\/topics\?topic_id=top-1"/);

  const tableHtml = renderToStaticMarkup(
    <PoolTable items={[topicItem]} loading={false} onGoToFeishu={() => {}} onSelectTopic={() => {}} />,
  );
  assert.match(tableHtml, /<a [^>]*href="\/topics\?topic_id=top-1"/);

  const activityHtml = renderToStaticMarkup(
    <TeamActivitySection
      loading={false}
      error={null}
      onRetry={() => {}}
      onSelectTopic={() => {}}
      data={{
        recentlyClaimed: [
          {
            id: "c1",
            subTopicId: "top-1",
            displayName: "张三",
            claimedAt: "2026-11-25T08:00:00Z",
            subTopic: { id: "top-1", title: "测试选题" },
          },
        ],
        recentlyWorked: [
          {
            id: "w1",
            videoTitle: "成片标题",
            publishedAt: "2026-11-25T09:00:00Z",
            uploadedAt: "2026-11-25T09:00:00Z",
            subTopic: { id: "top-2", title: "对应选题" },
          },
        ],
      } as unknown as Parameters<typeof TeamActivitySection>[0]["data"]}
    />,
  );
  assert.match(activityHtml, /<a [^>]*href="\/topics\?topic_id=top-1"/);
  assert.match(activityHtml, /<a [^>]*href="\/topics\?topic_id=top-2"/);
});
