import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import type { VideoRow } from "@/lib/content/domain/detail";
import type { VideoMetricsSnapshot } from "@/types";
import {
  ContentDetailDialog,
  shouldIgnoreContentDrawerDismiss,
} from "./content-detail-dialog";
import { ContentListTable } from "./content-list-table";

function makeVideo(overrides: Partial<VideoRow> = {}): VideoRow {
  return {
    id: "video-1",
    account_id: "acc-1",
    user_id: "user-1",
    video_url: "https://www.douyin.com/video/123",
    video_title: "测试作品标题",
    content: "这是测试文案正文内容",
    published_at: "2026-11-26T10:00:00Z",
    uploaded_at: "2026-11-26T10:30:00Z",
    anomaly_status: "normal",
    lifecycle_state: "active",
    created_at: "2026-11-26T10:30:00Z",
    accounts: { name: "测试账号", profile_id: "user-1" },
    profiles: { name: "测试作者" },
    ...overrides,
  } as VideoRow;
}

function makeSnapshot(overrides: Partial<VideoMetricsSnapshot> = {}): VideoMetricsSnapshot {
  return {
    id: "snap-1",
    video_id: "video-1",
    snapshot_type: "24h",
    captured_at: "2026-11-27T10:00:00Z",
    play_count: 35_000,
    likes: 1200,
    comments: 80,
    shares: 45,
    favorites: 320,
    follower_gain: 180,
    follower_loss: 12,
    fan_play_ratio: 15,
    homepage_visits: 420,
    follower_convert: 90,
    cover_click_rate: 6.2,
    avg_play_duration: 28,
    completion_rate: 22.5,
    bounce_rate_2s: 18.0,
    completion_rate_5s: 61.5,
    avg_play_ratio: 0.45,
    vs_previous: null,
    screenshot_urls: null,
    curve_screenshot_url: "https://example.com/curve.png",
    retention_screenshot_url: "https://example.com/retention.png",
    ...overrides,
  } as VideoMetricsSnapshot;
}

function makeRow(id: string, title: string): ProcessedContentRow {
  return {
    video: makeVideo({ id, video_title: title }),
    snapshot: makeSnapshot({ video_id: id }),
    playCount: 35_000,
    followerGain: 180,
    likes: 1200,
    comments: 80,
    shares: 45,
    favorites: 320,
    completionRate: 22.5,
    interactionRate: 4.7,
    lowSample: false,
    quality: null,
  } as unknown as ProcessedContentRow;
}

test("非模态抽屉跨行点击与失焦不关闭抽屉，其余外部点击正常关闭", () => {
  assert.equal(shouldIgnoreContentDrawerDismiss({ reason: "focus-out" }), true);

  const rowTarget = {
    closest: (selector: string) => (selector === "[data-video-id]" ? { tagName: "TR" } : null),
  };
  assert.equal(
    shouldIgnoreContentDrawerDismiss({ reason: "outside-press", event: { target: rowTarget } }),
    true,
  );

  const blankTarget = {
    closest: () => null,
  };
  assert.equal(
    shouldIgnoreContentDrawerDismiss({ reason: "outside-press", event: { target: blankTarget } }),
    false,
  );
  assert.equal(shouldIgnoreContentDrawerDismiss({ reason: "escape-key" }), false);
  assert.equal(shouldIgnoreContentDrawerDismiss(undefined), false);
});

test("详情抽屉保留原截图首屏、无图自动展开全量指标兜底与上下条导航", () => {
  const withShotHtml = renderToStaticMarkup(
    <ContentDetailDialog
      open
      renderMode="inline"
      onOpenChange={() => {}}
      video={makeVideo()}
      snapshot={makeSnapshot()}
      onLifecycleChanged={() => {}}
      topicKind="dry_goods"
      currentIndex={1}
      totalCount={5}
      onStepVideo={() => {}}
      canOperateLifecycle
    />,
  );
  assert.match(withShotHtml, /数据截图/);
  assert.match(withShotHtml, /2 \/ 5/);
  assert.match(withShotHtml, /aria-label="上一条"/);
  assert.match(withShotHtml, /aria-label="下一条"/);
  assert.match(withShotHtml, /移入回收站/);
  assert.match(withShotHtml, /打开源视频网页/);
  // 有截图时全部指标默认折叠（<details> 不带 open 属性）
  assert.match(withShotHtml, /<details class="group\/metrics">/);

  const noShotHtml = renderToStaticMarkup(
    <ContentDetailDialog
      open
      renderMode="inline"
      onOpenChange={() => {}}
      video={makeVideo()}
      snapshot={makeSnapshot({ curve_screenshot_url: null, retention_screenshot_url: null })}
      onLifecycleChanged={() => {}}
      topicKind="review"
      currentIndex={0}
      totalCount={5}
      onStepVideo={() => {}}
    />,
  );
  // 无截图时自动展开 12 项明细兜底（<details open="">）
  assert.match(noShotHtml, /<details open="" class="group\/metrics">/);
  assert.match(noShotHtml, /2 秒跳出率/);
  assert.match(noShotHtml, /平均播放占比/);
});

test("左侧表格当前选中行保持统一选中高亮，不被排序列浅底冲淡", () => {
  const html = renderToStaticMarkup(
    <ContentListTable
      metricViewMode="spacious"
      visibleRows={[makeRow("v-1", "作品一"), makeRow("v-2", "作品二")]}
      tableContainerRef={{ current: null }}
      emptyTitle="空"
      emptyDescription="空"
      sortField="play_count"
      sortDir="desc"
      handleSort={() => {}}
      isSingleDay
      selectedVideoId="v-1"
      onSelectVideoId={() => {}}
      highlightRules={{}}
    />,
  );

  const selectedRowMatch = html.match(/<tr[^>]*data-video-id="v-1"[^>]*>[\s\S]*?<\/tr>/);
  assert.ok(selectedRowMatch);
  const selectedRow = selectedRowMatch[0];
  assert.match(selectedRow, /data-selected="true"/);
  assert.match(selectedRow, /aria-selected="true"/);
  assert.match(selectedRow, /bg-\[#E4E4E1\]/);
  // 选中行的排序列（play_count）不再叠加 bg-[#F7F7F6]/70
  const selectedPlayTd = selectedRow.match(/<td[^>]*data-col-key="play_count"[^>]*class="([^"]+)"/)?.[1] ?? "";
  assert.doesNotMatch(selectedPlayTd, /bg-\[#F7F7F6\]\/70/);

  // 未选中行的排序列仍保持排序浅底
  const unselectedRowMatch = html.match(/<tr[^>]*data-video-id="v-2"[^>]*>[\s\S]*?<\/tr>/);
  assert.ok(unselectedRowMatch);
  const unselectedPlayTd = unselectedRowMatch[0].match(/<td[^>]*data-col-key="play_count"[^>]*class="([^"]+)"/)?.[1] ?? "";
  assert.match(unselectedPlayTd, /bg-\[#F7F7F6\]\/70/);
});
