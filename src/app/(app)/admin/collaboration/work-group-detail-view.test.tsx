import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { WorkGroupDetailView } from "./work-group-detail-view";
import type {
  WorkGroupDetailView as WorkGroupDetailViewType,
  WorkGroupMemberRow,
  WorkGroupSummaryRow,
} from "@/app/api/admin/collaboration/_shared";

/**
 * 组详情改为统一绩效列（与视频复盘抽屉同源），
 * 用真实渲染出的 DOM 做可观察断言：列头、组综合首行、比率格式、空态与口径脚注。
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
    favoriteRate: null,
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
      favoriteRate: null,
    },
    ...overrides,
  };
}

function renderDetail(detail: WorkGroupDetailViewType) {
  return renderToStaticMarkup(
    <WorkGroupDetailView detail={detail} canManage onBack={noop} onSelectPerson={noop} />,
  );
}

test("组详情列为统一绩效列：成员 + 作品数/总播放/条均/转粉率/互动率/点赞率/收藏率", () => {
  const html = renderDetail({
    summary: summary(),
    members: [member("u-1", "张文案")],
  });

  assert.deepEqual(tableHeaderLabels(html), [
    "成员",
    "作品数",
    "总播放",
    "条均播放",
    "转粉率",
    "互动率",
    "点赞率",
    "收藏率",
  ]);
  // 组综合 + 1 个组员行，每行 8 个单元格与列头逐列对齐
  assert.deepEqual(bodyRowCellCounts(html), [8, 8]);
});

test("首行为组综合：底色标识、数值取自 aggregate，比率按加权合计展示", () => {
  const html = renderDetail({
    summary: summary({
      aggregate: {
        reportCount: 3,
        snapshotCount: 2,
        totalPlay: 60000,
        avgPlay: 30000,
        followerConversionRate: 700 / 60000,
        interactionRate: 2700 / 60000,
        likeRate: 1500 / 60000,
        favoriteRate: 750 / 60000,
      },
    }),
    members: [member("u-1", "张文案")],
  });

  assert.ok(html.includes("组综合"), "首行是组综合");
  assert.ok(/bg-\[#F1F1F0\]/.test(html), "组综合行有底色标识");
  const text = stripTags(html);
  assert.ok(text.includes("6.0万"), "总播放 60000 格式化为 6.0万");
  assert.ok(text.includes("1.2%"), "转粉率 700/60000 ≈ 1.2%");
  assert.ok(text.includes("4.5%"), "互动率 2700/60000 = 4.5%");
  assert.ok(text.includes("2.5%"), "点赞率 1500/60000 = 2.5%");
  assert.ok(text.includes("1.3%"), "收藏率 750/60000 = 1.25% 保留 1 位小数");
});

test("组员行零产出出行：数值 0、比率 —；有产出显示加权比率", () => {
  const html = renderDetail({
    summary: summary({ memberCount: 2 }),
    members: [
      member("u-1", "张文案", {
        reportCount: 3,
        snapshotCount: 2,
        totalPlay: 60000,
        avgPlay: 30000,
        followerConversionRate: 700 / 60000,
        interactionRate: 2700 / 60000,
        likeRate: 1500 / 60000,
        favoriteRate: 750 / 60000,
      }),
      member("u-2", "李文案"),
    ],
  });

  const text = stripTags(html);
  // 零产出组员：作品数 0、播放 0、比率 4 个 —
  assert.ok(text.includes("李文案"), "零产出组员照常出行");
  const idleRowStart = text.indexOf("李文案");
  const idleRow = text.slice(idleRowStart, idleRowStart + 80);
  assert.ok(idleRow.includes("—"), "零产出比率显示 —");
  assert.ok(text.includes("1.2%"), "有产出组员显示加权转粉率");
});

test("组员行带档案卡交互语义（role=button + aria-label，点击/回车进档案）", () => {
  const html = renderDetail({
    summary: summary(),
    members: [member("u-1", "张文案")],
  });

  assert.ok(html.includes('role="button"'), "组员行是可交互行（Enter 也能进）");
  assert.ok(html.includes('aria-label="查看张文案的档案卡"'), "组员行有档案卡 aria-label");
});

test("空小队展示空态文案，不出表格", () => {
  const html = renderDetail({ summary: summary({ memberCount: 0 }), members: [] });

  assert.ok(html.includes("该小队当前暂无成员"));
  assert.ok(!html.includes("<table"), "没有成员时不出表格");
});

test("页面带口径脚注：播放与比率仅统计已同步视频复盘的作品", () => {
  const html = renderDetail({
    summary: summary(),
    members: [member("u-1", "张文案")],
  });

  assert.ok(
    html.includes("播放、条均与各比率与视频复盘抽屉同源"),
    "表格下方有口径说明，避免把未同步作品读成 0 播放",
  );
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

test("源码断言：组详情不再复用岗位 Tab 行组件，防止旧列回潮", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/app/(app)/admin/collaboration/work-group-detail-view.tsx"),
    "utf8",
  );
  assert.ok(!source.includes('from "./staff-tab"'), "不再引入文案/剪辑 Tab 行组件");
  assert.ok(!source.includes('from "./talent-tab"'), "不再引入达人 Tab 行组件");
  assert.ok(!source.includes('from "./operator-tab"'), "不再引入运营 Tab 行组件");
  assert.ok(source.includes("onSelectPerson"), "保留点击进档案卡交互");
  assert.ok(source.includes("formatRate"), "比率格式与组列表同源");
});
