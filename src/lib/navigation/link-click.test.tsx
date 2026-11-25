import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CollaborationDiagnosisContext, CollaborationWorkReviewLink } from "@/components/admin/collaboration-work-review-link";
import { TitleButton } from "@/app/(app)/admin/content/content-list-row-parts";
import { PoolGrid } from "@/components/topics-v2/pool/PoolGrid";
import { PoolTable } from "@/components/topics-v2/pool/PoolTable";
import { TeamActivitySection } from "@/components/topics-v2/TeamActivitySection";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import type { TopicPoolItem } from "@/components/topics-v2/types";
import { shouldHandleInPlaceLinkClick } from "./link-click";

test("shouldHandleInPlaceLinkClick 仅对无修饰键的左键返回 true，Ctrl/Cmd/Shift/Alt/中键放行原生新标签页", () => {
  assert.equal(
    shouldHandleInPlaceLinkClick({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }),
    true,
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
