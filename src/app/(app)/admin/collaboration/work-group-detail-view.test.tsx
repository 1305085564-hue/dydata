import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkGroupDetailView } from "./work-group-detail-view";
import type {
  WorkGroupDetailView as WorkGroupDetailViewType,
  WorkGroupMemberRow,
  WorkGroupSummaryRow,
} from "@/lib/collaboration/domain/types";

/**
 * 小队详情和岗位表同一套表格：标题即本月结论，表头下一行「全队合计」，下面一行一位组员。
 * 用真实渲染出的 DOM 做可观察断言：列头、全队合计、比率格式、键盘入口、空态。
 */

const noop = () => {};

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tableHeaderLabels(html: string) {
  return [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => stripTags(match[1]));
}

function bodyRowCellCounts(html: string) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1]);
  // 第一个 <tr> 是表头，其余是数据行（组综合 + 组员行）
  return rows.slice(1).map((row) => (row.match(/<td/g) ?? []).length);
}

function member(userId: string, name: string, overrides: Partial<WorkGroupMemberRow> = {}): WorkGroupMemberRow {
  return {
    userId,
    name,
    reportCount: 0,
    snapshotCount: 0,
    totalPlay: 0,
    avgPlay: 0,
    followerConversionRate: null,
    interactionRate: null,
    likeRate: null,
    commentRate: null,
    shareRate: null,
    favoriteRate: null,
    contentQuality: null,
    ...overrides,
  };
}

function summary(overrides: Partial<WorkGroupSummaryRow> = {}): WorkGroupSummaryRow {
  return {
    id: "wg-writer",
    name: "文案一组",
    kind: "writer",
    teamId: "team-1",
    memberCount: 1,
    aggregate: {
      reportCount: 0,
      snapshotCount: 0,
      totalPlay: 0,
      avgPlay: 0,
      followerConversionRate: null,
      interactionRate: null,
      likeRate: null,
      commentRate: null,
      shareRate: null,
      favoriteRate: null,
    },
    contentQuality: null,
    ...overrides,
  };
}

function renderDetail(detail: WorkGroupDetailViewType) {
  return renderToStaticMarkup(
    <WorkGroupDetailView detail={detail} canManage onBack={noop} onSelectPerson={noop} />,
  );
}

test("小队详情默认全展开（含互动四项明细）；全队合计与组员行逐列对齐", () => {
  const html = renderDetail({ summary: summary({ kind: "talent" }), members: [member("u-1", "张达人")] });
  assert.deepEqual(tableHeaderLabels(html), [
    "姓名",
    "本月作品",
    "总播放",
    "条均播放",
    "转粉率",
    "互动率",
    "点赞率",
    "评论率",
    "分享率",
    "收藏率",
  ]);
  assert.deepEqual(bodyRowCellCounts(html), [10, 10]);
});

test("标题写小队名，下面一行写工种、人数与本月篇数", () => {
  const html = renderDetail({
    summary: summary({ memberCount: 2, aggregate: { ...summary().aggregate, reportCount: 7 } }),
    members: [member("u-1", "张文案"), member("u-2", "李文案")],
  });
  assert.match(html, /<h2[^>]*>文案一组<\/h2>/);
  assert.ok(stripTags(html).includes("文案小队 · 2 人 · 本月 7 篇"));
  assert.ok(html.includes("全部小队"), "有回到小队列表的入口");
});

test("表头下第一行是全队合计：数值取自小队合计，比率按合计重算", () => {
  const html = renderDetail({
    summary: summary({
      kind: "talent",
      aggregate: {
        reportCount: 3,
        snapshotCount: 2,
        totalPlay: 60000,
        avgPlay: 30000,
        followerConversionRate: 700 / 60000,
        interactionRate: 2700 / 60000,
        likeRate: 1500 / 60000,
        commentRate: 300 / 60000,
        shareRate: 150 / 60000,
        favoriteRate: 750 / 60000,
      },
    }),
    members: [member("u-1", "张达人")],
  });
  const table = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  const firstRow = stripTags(table.slice(0, table.indexOf("</tr>")));
  assert.ok(firstRow.startsWith("全队合计"), "第一行是全队合计");
  assert.ok(firstRow.includes("6.0万") && firstRow.includes("1.2%") && firstRow.includes("4.5%"));
});

test("组员行零产出照常出行：比率 —；有产出显示加权比率", () => {
  const html = renderDetail({
    summary: summary({ memberCount: 2, kind: "talent" }),
    members: [
      member("u-1", "张达人", {
        reportCount: 3,
        snapshotCount: 2,
        totalPlay: 60000,
        avgPlay: 30000,
        followerConversionRate: 700 / 60000,
        interactionRate: 2700 / 60000,
      }),
      member("u-2", "李达人"),
    ],
  });
  const text = stripTags(html);
  assert.ok(text.includes("李达人"), "零产出组员照常出行");
  const idleRow = text.slice(text.indexOf("李达人"), text.indexOf("李达人") + 80);
  assert.ok(idleRow.includes("—"), "零产出比率显示 —");
  assert.ok(text.includes("1.2%"), "有产出组员显示加权转粉率");
});

test("组员行进档案：名字格是真按钮，整行不冒充 button，表下不压脚注", () => {
  const html = renderDetail({ summary: summary(), members: [member("u-1", "张文案")] });
  assert.match(html, /<button[^>]*aria-label="查看张文案的个人档案"/);
  assert.equal(html.includes('role="button"'), false);
  assert.equal(html.includes("与数据复盘抽屉同源"), false, "口径收进列头悬停");
});

test("空小队展示空态文案，不出表格", () => {
  const html = renderDetail({ summary: summary({ memberCount: 0 }), members: [] });
  assert.ok(html.includes("这支小队还没有成员"));
  assert.ok(!html.includes("<table"), "没有成员时不出表格");
});

test("成员管理入口：canManage 且传入回调时渲染「成员管理」按钮", () => {
  const html = renderToStaticMarkup(
    <WorkGroupDetailView
      detail={{ summary: summary(), members: [member("u-1", "张文案")] }}
      canManage
      onBack={noop}
      onOpenManageDrawer={noop}
      onSelectPerson={noop}
    />,
  );
  assert.ok(html.includes("成员管理"));
});

test("文案小队含质量数据时：默认全展开 18 列（基础 + 互动四项 + 评级 + 留存五项），标题行写良优率", () => {
  const quality = {
    totalCount: 5,
    achievementSampleCount: 4,
    interactionSampleCount: 5,
    ratedCount: 4,
    goodExcellentRate: 0.8,
    overallGradeCounts: { excellent: 2, good: 2, fair: 0 },
    unratedReasons: {
      unlinked: 1,
      pendingSnapshot: 0,
      invalidPlay: 0,
      missingMetrics: 0,
      topicUnavailable: 0,
    },
    avgInteractionAchievement: 95,
    avgContentAchievement: 92.5,
    retentionAverages: null,
  };
  const html = renderDetail({
    summary: summary({ kind: "writer", contentQuality: quality }),
    members: [member("u-1", "张文案", { contentQuality: quality })],
  });
  assert.deepEqual(tableHeaderLabels(html), [
    "姓名",
    "本月作品",
    "总播放",
    "条均播放",
    "转粉率",
    "互动率",
    "点赞率",
    "评论率",
    "分享率",
    "收藏率",
    "互动达成",
    "留存达成",
    "良优率",
    "2秒跳出率",
    "5秒完播率",
    "均播时长",
    "播放占比",
    "整体完播率",
  ]);
  assert.deepEqual(bodyRowCellCounts(html), [18, 18]);
  const text = stripTags(html);
  assert.ok(text.includes("95%") && text.includes("93%") && text.includes("80%"));
  assert.ok(text.includes("良优率 80%"), "标题下一行写本月良优率");
});
