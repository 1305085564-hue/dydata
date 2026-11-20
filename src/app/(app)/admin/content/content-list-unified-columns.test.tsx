import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { CONTENT_COLUMNS, visibleContentColumns } from "./content-list-columns";
import {
  getContentQualityStatusText,
  getContentQualityStatusShortText,
} from "@/lib/collaboration/content-quality-contract";

const source = [
  "src/app/(app)/admin/content/content-list.tsx",
  "src/app/(app)/admin/content/content-list-table.tsx",
  "src/app/(app)/admin/content/content-list-table-header.tsx",
  "src/app/(app)/admin/content/content-list-toolbar.tsx",
  "src/app/(app)/admin/content/content-list-more-filters.tsx",
  "src/lib/content/domain/content-list.ts",
  "src/lib/content/domain/content-list-state.ts",
  "src/lib/content/data/content-list.ts",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

function makeRow(video: Partial<ProcessedContentRow["video"]> = {}): ProcessedContentRow {
  return {
    video: {
      id: "v-1",
      user_id: "user-1",
      video_title: "测试作品",
      published_at: "2026-11-18T10:00:00Z",
      anomaly_status: "normal",
      accounts: { name: "测试账号" },
      profiles: { name: "测试负责人" },
      ...video,
    },
    snapshot: null,
    playCount: 12000,
    followerGain: 30,
    likes: 100,
    comments: 10,
    shares: 5,
    favorites: 8,
    completionRate: 20,
    interactionRate: 1.2,
    lowSample: false,
    quality: null,
  } as unknown as ProcessedContentRow;
}

test("视频复盘列表支持完整/宽松指标视图切换，评级与留存达成常驻", () => {
  assert.match(source, /metricViewMode/);
  assert.match(source, /互动明细/);
  const full = visibleContentColumns(false).map((column) => column.label);
  const spacious = visibleContentColumns(true).map((column) => column.label);
  for (const label of ["点赞", "评论", "分享", "收藏", "互动率", "2s跳出", "5s完播", "均播", "完播", "留存达成", "评级"]) {
    assert.ok(full.includes(label), `完整视图缺少 ${label}`);
  }
  assert.deepEqual(full.filter((label) => !spacious.includes(label)), ["点赞", "评论", "分享", "收藏"]);
  assert.ok(spacious.includes("评级") && spacious.includes("留存达成"));
});

test("列顺序 = 判断顺序：作品 → 评级 → 播放 / 互动率 / 留存达成 → 涨粉 → 明细；发布时间并进作品格", () => {
  assert.deepEqual(CONTENT_COLUMNS.map((column) => column.key), [
    "title",
    "overall_grade",
    "play_count",
    "interaction_rate",
    "retention_achievement",
    "follower_gain",
    "likes",
    "comments",
    "shares",
    "favorites",
    "bounce_rate_2s",
    "completion_rate_5s",
    "avg_play_duration",
    "avg_play_ratio",
    "completion_rate",
  ]);
  assert.equal(CONTENT_COLUMNS[0].sortField, "published_at", "作品列头负责按发布时间排序");
});

for (const metricViewMode of ["full", "spacious"] as const) {
  test(`桌面表头与表体从同一份列定义生成，列序严格一致（${metricViewMode}）`, async () => {
    const { ContentListTable } = await import("./content-list-table");
    const html = renderToStaticMarkup(
      <ContentListTable
        metricViewMode={metricViewMode}
        visibleRows={[makeRow()]}
        tableContainerRef={{ current: null }}
        emptyTitle="空"
        emptyDescription="空描述"
        sortField="play_count"
        sortDir="desc"
        handleSort={() => {}}
        isSingleDay
        onSelectVideoId={() => {}}
        highlightRules={{}}
      />,
    );
    const headerOrder = [...html.matchAll(/<th\b[^>]*data-col-key="([^"]+)"/g)].map((m) => m[1]);
    const bodyOrder = [...html.matchAll(/<td\b[^>]*data-col-key="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(headerOrder, bodyOrder, "表头与表体列顺序必须完全一致");
    assert.equal(headerOrder.length, metricViewMode === "full" ? 15 : 11);
  });
}

test("空态占位单元格跨满当前视图的列数", async () => {
  const { ContentListTable } = await import("./content-list-table");
  const html = renderToStaticMarkup(
    <ContentListTable
      metricViewMode="spacious"
      visibleRows={[]}
      tableContainerRef={{ current: null }}
      emptyTitle="空"
      emptyDescription="空描述"
      sortField="published_at"
      sortDir="desc"
      handleSort={() => {}}
      isSingleDay
      onSelectVideoId={() => {}}
      highlightRules={{}}
    />,
  );
  assert.match(html, new RegExp(`colSpan="${visibleContentColumns(true).length}"`, "i"));
});

test("正常作品不出状态徽标，异常作品才标出来", async () => {
  const { ContentListTable } = await import("./content-list-table");
  const render = (anomaly_status: "normal" | "删稿") => renderToStaticMarkup(
    <ContentListTable
      metricViewMode="spacious"
      visibleRows={[makeRow({ anomaly_status })]}
      tableContainerRef={{ current: null }}
      emptyTitle="空"
      emptyDescription="空描述"
      sortField="published_at"
      sortDir="desc"
      handleSort={() => {}}
      isSingleDay
      onSelectVideoId={() => {}}
      highlightRules={{}}
    />,
  );
  assert.doesNotMatch(render("normal"), />正常</);
  assert.match(render("删稿"), /data-slot="badge"/);
});

test("详情播放卡片对齐综合评级播放门槛且不再硬编码10万爆款文案", () => {
  const metrics = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/content/detail/content-detail-metrics.tsx"), "utf8");
  const dialog = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/content/content-detail-dialog.tsx"), "utf8");
  const evidence = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/content/detail/content-detail-evidence.tsx"), "utf8");

  assert.doesNotMatch(metrics, /爆款层级/);
  assert.match(metrics, /已过 1\.5 万线（评级不封顶）/);
  assert.match(metrics, /不足 2 千（直接判普）/);
  assert.doesNotMatch(dialog, /ID:\s*\{video/);
  assert.doesNotMatch(dialog, /<Flame\b/);
  assert.doesNotMatch(evidence, /手机端截图|电脑端宽图|>点击全屏</);
  assert.doesNotMatch(evidence, /group-hover:scale-\[1\.01\]/);
});

test("异常状态使用统一橙色标记（腰斩已下线，不再单独成标记）", () => {
  assert.match(source, /status === "abnormal"/);
  assert.match(source, /status === "异常"/);
  assert.match(source, /variant: "warning" as const/);
});

test("窄屏列表通过表格容器横向滚动查看全部列", () => {
  assert.match(source, /import \{ Table \} from "@\/components\/ui\/table"/);
  assert.match(source, /<Table className="[^"]*min-w-\[960px\]/);
});

test("未评级原因短文案与长文案同源，未知状态不等于硬编码待采集", () => {
  const unknownStatus = "future_unsupported_status" as unknown as Parameters<typeof getContentQualityStatusShortText>[0];
  const longText = getContentQualityStatusText(unknownStatus);
  const shortText = getContentQualityStatusShortText(unknownStatus);

  assert.equal(shortText, longText, "未知 status 时短文案与长文案同源");
  assert.notEqual(shortText, "待采集", "未知 status 不等于硬编码「待采集」");
  assert.equal(shortText, "数据未就绪");
});

test("列表保留评级列，无硬编码待采集兜底，无其他·点赞", () => {
  assert.ok(CONTENT_COLUMNS.some((column) => column.key === "overall_grade"));
  assert.doesNotMatch(source, /"其他·点赞"/);
  assert.doesNotMatch(source, /status === "unlinked"\s*\?\s*"未关联"/);
});

test("表头字重严格为 400（font-normal），按发布时间排序时作品整列同享浅底", async () => {
  const { ContentListTable } = await import("./content-list-table");
  const renderTable = (sortField: "published_at" | "play_count") => renderToStaticMarkup(
    <ContentListTable
      metricViewMode="spacious"
      visibleRows={[makeRow()]}
      tableContainerRef={{ current: null }}
      emptyTitle="空"
      emptyDescription="空描述"
      sortField={sortField}
      sortDir="desc"
      handleSort={() => {}}
      isSingleDay
      onSelectVideoId={() => {}}
      highlightRules={{}}
    />,
  );

  const byPub = renderTable("published_at");
  const thClasses = [...byPub.matchAll(/<th\b[^>]*class="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(thClasses.length > 0 && thClasses.every((cls) => cls.includes("font-normal")), "所有表头单元格必须显式声明 font-normal");

  const titleTh = byPub.match(/<th\b[^>]*data-col-key="title"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const titleTd = byPub.match(/<td\b[^>]*data-col-key="title"[^>]*class="([^"]+)"/)?.[1] ?? "";
  assert.match(titleTh, /(?:^|\s)bg-\[#F7F7F6\](?:\s|$)/);
  assert.match(titleTd, /(?:^|\s)bg-\[#F7F7F6\](?:\s|$)/);
  assert.doesNotMatch(titleTd, /\bbg-white\b/);

  const byPlay = renderTable("play_count");
  const playTitleTd = byPlay.match(/<td\b[^>]*data-col-key="title"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const playCountTd = byPlay.match(/<td\b[^>]*data-col-key="play_count"[^>]*class="([^"]+)"/)?.[1] ?? "";
  assert.match(playTitleTd, /\bbg-white\b/);
  assert.match(playCountTd, /bg-\[#F7F7F6\]\/70/);
});
